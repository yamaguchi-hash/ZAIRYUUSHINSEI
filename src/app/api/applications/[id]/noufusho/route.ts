import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import path from "path";
import ExcelJS from "exceljs";

// ── 金額を漢数字に変換 ──────────────────────────────────────────────────────────
function amountToKanji(amount: number): string {
  if (amount === 0) return "零";

  const kanjiNums = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const smallUnits = ["", "十", "百", "千"];
  const largeUnits = ["", "万", "億"];

  // 4桁以下のブロックを漢字に変換
  function blockToKanji(n: number): string {
    if (n === 0) return "";
    let result = "";
    const digits = String(n).padStart(4, "0").split("").map(Number);
    for (let i = 0; i < 4; i++) {
      const d = digits[i];
      const unitIndex = 3 - i; // 千=3, 百=2, 十=1, 一=0
      if (d === 0) continue;
      if (d === 1 && unitIndex > 0) {
        // 十、百、千は「一」を省略
        result += smallUnits[unitIndex];
      } else {
        result += kanjiNums[d] + smallUnits[unitIndex];
      }
    }
    return result;
  }

  let result = "";
  // 億、万、一 のブロックに分解
  const oku = Math.floor(amount / 100000000);
  const man = Math.floor((amount % 100000000) / 10000);
  const ichi = amount % 10000;

  if (oku > 0) result += blockToKanji(oku) + "億";
  if (man > 0) result += blockToKanji(man) + "万";
  if (ichi > 0) result += blockToKanji(ichi);

  return result;
}

// ── 手数料種別に対応する行番号（テンプレートの "溶け込み" シート） ──────────────
const FEE_TYPE_ROWS: Record<number, number> = {
  1: 32, // 在留資格の変更許可
  2: 35, // 在留期間の更新許可
  3: 38, // 永住許可
  4: 41, // 再入国の許可
  5: 44, // 特定登録者カードの交付
  6: 47, // 特定登録者カードの再交付
  7: 50, // 就労資格証明書の交付
  8: 53, // 在留カードの再交付
  9: 56, // 難民旅行証明書の交付
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!session?.user || !tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // 申請案件の存在確認
  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  // リクエストボディ解析
  const body = await req.json().catch(() => ({}));
  const {
    feeType,
    amount,
    payerName,
    applicationNumber,
  }: {
    feeType: number;
    amount: number;
    payerName: string;
    applicationNumber?: string;
  } = body;

  if (!feeType || !amount || !payerName) {
    return NextResponse.json(
      { error: "feeType, amount, payerName は必須です" },
      { status: 400 },
    );
  }

  if (!FEE_TYPE_ROWS[feeType]) {
    return NextResponse.json(
      { error: "feeType は 1〜9 の範囲で指定してください" },
      { status: 400 },
    );
  }

  // テンプレート読み込み
  const templatePath = path.join(process.cwd(), "public", "templates", "noufusho-template.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);

  const ws = wb.getWorksheet("溶け込み");
  if (!ws) {
    return NextResponse.json(
      { error: "テンプレートに「溶け込み」シートが見つかりません" },
      { status: 500 },
    );
  }

  // ── 日付を記入（今日の日付） ──────────────────────────────────────────────
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  // Z9:AC9 (merged) - 年
  ws.getCell("Z9").value = year;
  // AF9:AG9 (merged) - 月
  ws.getCell("AF9").value = month;
  // AJ9:AK9 (merged) - 日
  ws.getCell("AJ9").value = day;

  // ── 申請番号 ──────────────────────────────────────────────────────────────
  if (applicationNumber) {
    ws.getCell("AA4").value = applicationNumber;
  }

  // ── 金額（漢字）を T22:Y22 に記入 ────────────────────────────────────────
  const kanjiAmount = amountToKanji(amount);
  ws.getCell("T22").value = kanjiAmount;

  // ── 金額（数字）を AF22:AJ22 に記入 ──────────────────────────────────────
  ws.getCell("AF22").value = amount.toLocaleString("ja-JP");

  // ── 手数料種別を○で選択 ──────────────────────────────────────────────────
  // 選択された種別の行の H 列に "○" を記入
  const targetRow = FEE_TYPE_ROWS[feeType];
  const markerCell = ws.getCell(targetRow, 8); // column H
  markerCell.value = "○";
  markerCell.font = {
    name: "ＭＳ Ｐ明朝",
    size: 14,
    bold: true,
  };
  markerCell.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  // ── 納付者氏名 AD61:AM61 ────────────────────────────────────────────────
  ws.getCell("AD61").value = payerName;

  // ── Excel をバッファに書き出し ────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const uint8 = new Uint8Array(buffer as ArrayBuffer);

  const fileName = `納付書_${app.caseNumber ?? id}.xlsx`;

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
