import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import path from "path";
import ExcelJS from "exceljs";

// ── 手数料種別 → ○を付ける番号セルの行 ──────────────────────────────────────
// テンプレート「溶け込み」シートの I列(column 9)に番号がある行
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

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

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

  // ── 申請番号を記入（AA4:AC4 merged） ──────────────────────────────────
  if (applicationNumber) {
    ws.getCell("AA4").value = applicationNumber;
  }

  // ── 金額を記入 ─────────────────────────────────────────────────────────
  // T22:Y22 (merged) - 金額数値
  ws.getCell("T22").value = amount.toLocaleString("ja-JP");
  // AF22:AJ22 (merged) - ￥の後の金額
  ws.getCell("AF22").value = amount.toLocaleString("ja-JP");

  // ── 手数料種別を○で選択 ───────────────────────────────────────────────
  // 選択された種別の行の H 列 (column 8) に "○"
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

  // ── 納付者氏名 AD61:AM61 (merged) ─────────────────────────────────────
  ws.getCell("AD61").value = payerName;
  ws.getCell("AD61").font = {
    name: "ＭＳ Ｐ明朝",
    size: 12,
    bold: true,
  };

  // ── Excel をバッファに書き出し ──────────────────────────────────────────
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
