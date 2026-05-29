import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicationDocumentChecklist, documentRequirementMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─── 写真・不要書類の除外キーワード ─────────────────────────────────────────────
const PHOTO_KEYWORDS = ["写真", "photo", "portrait", "顔写真"];

function isPhotoDoc(name: string): boolean {
  const lower = name.toLowerCase();
  return PHOTO_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// ─── 入管オンライン申請の提出順（書類名キーワードで優先度を決定） ──────────────
const SUBMISSION_ORDER_KEYWORDS: string[] = [
  "申請書",
  "在留カード",
  "パスポート",
  "旅券",
  "住民票",
  "戸籍",
  "婚姻",
  "出生",
  "雇用契約",
  "労働契約",
  "就労証明",
  "在職証明",
  "採用内定",
  "源泉徴収",
  "給与",
  "賃金",
  "課税証明",
  "納税証明",
  "所得証明",
  "登記",
  "決算",
  "事業",
  "卒業証明",
  "在学証明",
  "成績証明",
  "学位",
];

function getSubmissionPriority(docName: string): number {
  const lower = docName.toLowerCase();
  const idx = SUBMISSION_ORDER_KEYWORDS.findIndex((kw) =>
    lower.includes(kw.toLowerCase())
  );
  return idx === -1 ? 999 : idx;
}

// ─── ファイルを ArrayBuffer で取得 ──────────────────────────────────────────────
async function fetchFileAsBytes(fileUrl: string): Promise<Uint8Array | null> {
  try {
    if (fileUrl.startsWith("data:")) {
      const commaIdx = fileUrl.indexOf(",");
      const base64 = fileUrl.slice(commaIdx + 1);
      return Uint8Array.from(Buffer.from(base64, "base64"));
    }
    const res = await fetch(fileUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// ─── セパレーターページを追加 ────────────────────────────────────────────────
async function addSeparatorPage(
  mergedPdf: PDFDocument,
  docName: string,
  pageNo: number,
  totalDocs: number
): Promise<void> {
  const page = mergedPdf.addPage([595, 842]); // A4
  const font = await mergedPdf.embedFont(StandardFonts.Helvetica);

  // 背景グレー
  page.drawRectangle({
    x: 0, y: 0, width: 595, height: 842,
    color: rgb(0.95, 0.95, 0.97),
  });

  // 上部バー
  page.drawRectangle({
    x: 0, y: 742, width: 595, height: 100,
    color: rgb(0.13, 0.24, 0.42),
  });

  // タイトル（英語フォントで「書類」を表現）
  page.drawText("DOCUMENT", {
    x: 40, y: 800, size: 11, font, color: rgb(0.7, 0.8, 1),
  });
  page.drawText(`${pageNo} / ${totalDocs}`, {
    x: 520, y: 800, size: 11, font, color: rgb(0.7, 0.8, 1),
  });

  // 書類名（長い場合は折り返し）
  const MAX_CHARS = 28;
  const lines: string[] = [];
  let remaining = docName;
  while (remaining.length > 0) {
    lines.push(remaining.slice(0, MAX_CHARS));
    remaining = remaining.slice(MAX_CHARS);
  }

  const startY = 480 + (lines.length - 1) * 28;
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: 60, y: startY - i * 36, size: 28, font, color: rgb(0.1, 0.1, 0.3),
    });
  });

  // 区切り線
  page.drawLine({
    start: { x: 60, y: 400 }, end: { x: 535, y: 400 },
    thickness: 1.5, color: rgb(0.5, 0.6, 0.8),
  });

  // 説明テキスト
  page.drawText("JLS Gyosei Scrivener Corporation", {
    x: 60, y: 370, size: 9, font, color: rgb(0.5, 0.5, 0.6),
  });
  page.drawText("Prepared for Immigration Online Application", {
    x: 60, y: 355, size: 9, font, color: rgb(0.5, 0.5, 0.6),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 認証チェック
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!session?.user || !tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // 申請案件を取得
  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  // 提出済み書類チェックリストを取得（documentRequirementMasterのsortOrderでソート）
  const checklistRows = await db
    .select({
      id: applicationDocumentChecklist.id,
      documentName: applicationDocumentChecklist.documentName,
      fileUrl: applicationDocumentChecklist.fileUrl,
      mimeType: applicationDocumentChecklist.mimeType,
      status: applicationDocumentChecklist.status,
      sortOrder: documentRequirementMaster.sortOrder,
    })
    .from(applicationDocumentChecklist)
    .leftJoin(
      documentRequirementMaster,
      eq(applicationDocumentChecklist.documentRequirementId, documentRequirementMaster.id)
    )
    .where(eq(applicationDocumentChecklist.applicationId, id));

  // 提出済み・ファイルあり・写真除外
  const submitted = checklistRows
    .filter(
      (row) =>
        row.status === "submitted" &&
        row.fileUrl &&
        !isPhotoDoc(row.documentName)
    )
    .sort((a, b) => {
      // 1. マスターのsortOrderを優先
      const masterA = a.sortOrder ?? 9999;
      const masterB = b.sortOrder ?? 9999;
      if (masterA !== masterB) return masterA - masterB;
      // 2. 書類名キーワードで二次ソート
      return getSubmissionPriority(a.documentName) - getSubmissionPriority(b.documentName);
    });

  if (submitted.length === 0) {
    return NextResponse.json(
      { error: "提出済みの書類がありません（写真除く）" },
      { status: 400 }
    );
  }

  // ─── PDF マージ ───────────────────────────────────────────────────────────
  const mergedPdf = await PDFDocument.create();
  mergedPdf.setTitle(`入管オンライン申請 添付書類 — ${app.caseNumber ?? id}`);
  mergedPdf.setAuthor("行政書士法人 JLS 山口忠士");
  mergedPdf.setCreationDate(new Date());

  let docCount = 0;
  const successDocs: string[] = [];
  const failedDocs: string[] = [];

  for (const row of submitted) {
    const bytes = await fetchFileAsBytes(row.fileUrl!);
    if (!bytes) {
      failedDocs.push(row.documentName);
      continue;
    }

    const mime = row.mimeType ?? "";
    const isPdf = mime === "application/pdf" || row.fileUrl!.includes(".pdf");
    const isJpeg = mime.includes("jpeg") || mime.includes("jpg");
    const isPng = mime.includes("png");
    const isWebp = mime.includes("webp");

    // セパレーターページを挿入
    docCount++;
    await addSeparatorPage(mergedPdf, row.documentName, docCount, submitted.length);

    try {
      if (isPdf) {
        // PDFページをそのまま結合
        const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pageIndices = srcPdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);
        copiedPages.forEach((page: any) => mergedPdf.addPage(page));
        successDocs.push(row.documentName);
      } else if (isJpeg || isPng || isWebp) {
        // 画像をA4ページに埋め込み
        let img;
        if (isJpeg) {
          img = await mergedPdf.embedJpg(bytes);
        } else if (isPng) {
          img = await mergedPdf.embedPng(bytes);
        } else {
          // WebP はpdf-libが非対応のため、スキップしてエラー記録
          failedDocs.push(`${row.documentName}（WebP非対応）`);
          continue;
        }

        // A4サイズ（595×842pt）にフィット
        const A4W = 595, A4H = 842;
        const MARGIN = 40;
        const maxW = A4W - MARGIN * 2;
        const maxH = A4H - MARGIN * 2;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = (A4W - drawW) / 2;
        const y = (A4H - drawH) / 2;

        const page = mergedPdf.addPage([A4W, A4H]);
        page.drawImage(img, { x, y, width: drawW, height: drawH });
        successDocs.push(row.documentName);
      } else {
        // 非対応形式
        failedDocs.push(`${row.documentName}（非対応形式: ${mime}）`);
      }
    } catch (e: any) {
      failedDocs.push(`${row.documentName}（エラー: ${e?.message ?? "不明"}）`);
    }
  }

  if (successDocs.length === 0) {
    return NextResponse.json(
      { error: "PDFに変換できる書類がありませんでした" },
      { status: 400 }
    );
  }

  // 最終ページ（書類一覧）
  const summaryPage = mergedPdf.addPage([595, 842]);
  const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
  summaryPage.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.97, 0.97, 0.99) });
  summaryPage.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: rgb(0.13, 0.24, 0.42) });
  summaryPage.drawText("DOCUMENT INDEX", { x: 40, y: 800, size: 13, font, color: rgb(0.9, 0.9, 1) });
  summaryPage.drawText("書類インデックス", { x: 40, y: 780, size: 10, font, color: rgb(0.7, 0.8, 1) });

  let yPos = 700;
  successDocs.forEach((name, i) => {
    summaryPage.drawText(`${String(i + 1).padStart(2, " ")}.  ${name}`, {
      x: 60, y: yPos, size: 11, font, color: rgb(0.1, 0.1, 0.3),
    });
    yPos -= 24;
  });

  if (failedDocs.length > 0) {
    yPos -= 16;
    summaryPage.drawText("※ 以下の書類は変換に失敗しました:", {
      x: 60, y: yPos, size: 10, font, color: rgb(0.7, 0.2, 0.2),
    });
    yPos -= 20;
    failedDocs.forEach((name) => {
      summaryPage.drawText(`  - ${name}`, { x: 60, y: yPos, size: 9, font, color: rgb(0.7, 0.2, 0.2) });
      yPos -= 18;
    });
  }

  summaryPage.drawText(`出力日時: ${new Date().toLocaleString("ja-JP")}`, {
    x: 60, y: 60, size: 9, font, color: rgb(0.5, 0.5, 0.6),
  });
  summaryPage.drawText("行政書士法人 JLS  山口忠士", {
    x: 60, y: 44, size: 9, font, color: rgb(0.5, 0.5, 0.6),
  });

  // PDF を出力
  const pdfBytes = await mergedPdf.save();
  const fileName = `${app.caseNumber ?? id}_添付書類一括.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(pdfBytes.length),
    },
  });
}
