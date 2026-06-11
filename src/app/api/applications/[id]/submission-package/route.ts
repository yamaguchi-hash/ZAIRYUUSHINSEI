/**
 * 提出用書類一括パッケージング（Zipダウンロード）
 * ──────────────────────────────────────────────
 * 申請案件の以下を1つのZipファイルにまとめてダウンロードする:
 *   01_申請書/  申請書データ.xlsx（全フォームフィールドのExcel）＋ 署名済み申請書PDF
 *   02_添付書類/{書類タイプ}/  アップロード済み添付書類（パスポート写し等）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, applicationAttachments } from "@/lib/db";
import { eq, and, asc } from "drizzle-orm";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { ATTACHMENT_TYPE_MAP } from "@/lib/attachment-types";
import type { ApplicationFormData } from "@/lib/form-types";

export const maxDuration = 60; // Vercel: ファイル取得が多い場合に備え延長

// ─── ファイル取得 ────────────────────────────────────────────────────────────
async function fetchFileBytes(fileUrl: string): Promise<Uint8Array | null> {
  try {
    if (fileUrl.startsWith("data:")) {
      const ci = fileUrl.indexOf(",");
      return Uint8Array.from(Buffer.from(fileUrl.slice(ci + 1), "base64"));
    }
    const res = await fetch(fileUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Zipエントリ名に使えない文字を置換 */
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

/** 同一フォルダ内でファイル名が重複する場合に連番を付与して一意化（Zipエントリの上書き・隠れを防止） */
function uniqueFileName(usedNames: Set<string>, fileName: string): string {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : "";
  let n = 2;
  let candidate = `${base}_${n}${ext}`;
  while (usedNames.has(candidate)) {
    n++;
    candidate = `${base}_${n}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

// ─── 申請書データExcel生成 ───────────────────────────────────────────────────
async function buildFormDataExcel(
  form: Partial<ApplicationFormData>,
  caseNumber: string,
  applicantName: string,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("申請書データ");

  ws.columns = [
    { header: "項目キー", key: "key", width: 38 },
    { header: "値", key: "value", width: 60 },
  ];

  // タイトル行
  ws.insertRow(1, []);
  ws.insertRow(1, [`在留資格変更許可申請書 データ一覧`]);
  ws.insertRow(2, [`案件番号: ${caseNumber}　申請人: ${applicantName}　出力日: ${new Date().toLocaleDateString("ja-JP")}`]);
  ws.getCell("A1").font = { bold: true, size: 14, name: "Arial" };
  ws.getCell("A2").font = { size: 10, color: { argb: "FF666666" }, name: "Arial" };

  // ヘッダー行スタイル
  const headerRow = ws.getRow(4);
  headerRow.values = ["項目キー", "値"];
  headerRow.font = { bold: true, name: "Arial" };
  headerRow.eachCell(c => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
    c.border = { bottom: { style: "thin" } };
  });

  // データ行（空でないフィールドのみ・配列/オブジェクトはJSON文字列化）
  let rowIdx = 5;
  for (const [key, value] of Object.entries(form)) {
    if (key === "aiFieldStatus" || key === "lastUpdated") continue;
    if (value === null || value === undefined || value === "") continue;
    let display: string;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      display = JSON.stringify(value, null, 0);
    } else if (typeof value === "object") {
      display = JSON.stringify(value);
    } else {
      display = String(value);
    }
    const row = ws.getRow(rowIdx++);
    row.values = [key, display];
    row.font = { name: "Arial", size: 10 };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ─── GET: Zipパッケージ生成 ──────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // 認証
  let session;
  try {
    session = await auth();
  } catch {
    return NextResponse.json({ error: "認証エラーが発生しました。再ログインしてください。" }, { status: 401 });
  }
  if (!session?.user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const tenantId = (session.user as any).tenantId as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "テナントIDが取得できません" }, { status: 403 });
  }

  const { id: applicationId } = await ctx.params;

  try {
    // 案件・申請人取得
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) {
      return NextResponse.json({ error: "申請案件が見つかりません" }, { status: 404 });
    }
    const [applicant] = await db.select().from(applicantMaster)
      .where(eq(applicantMaster.id, app.applicantId)).limit(1);
    const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ") || "applicant";
    const caseNumber = app.caseNumber ?? applicationId.slice(0, 8);

    const zip = new JSZip();
    const rootName = safeName(`${caseNumber}_提出用パッケージ`);
    const root = zip.folder(rootName)!;
    const formFolder = root.folder("01_申請書")!;
    const attachFolder = root.folder("02_添付書類")!;

    // ── 1. 申請書データExcel ──
    const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
    try {
      const excelBytes = await buildFormDataExcel(form, caseNumber, applicantName);
      formFolder.file("申請書データ.xlsx", excelBytes);
    } catch (e) {
      console.error("[submission-package] Excel build failed:", e);
    }

    // ── 2. 署名済み申請書PDF（あれば） ──
    const signedDocs = ((app.draftData as any)?._signedDocuments ?? []) as {
      fileUrl?: string; fileName?: string;
    }[];
    let signedCount = 0;
    for (const doc of signedDocs) {
      if (!doc.fileUrl) continue;
      const bytes = await fetchFileBytes(doc.fileUrl);
      if (!bytes) continue;
      signedCount++;
      formFolder.file(safeName(doc.fileName ?? `署名済み申請書_${signedCount}.pdf`), bytes);
    }

    // ── 3. 添付書類（書類タイプごとのサブフォルダ） ──
    const attachments = await db.select().from(applicationAttachments)
      .where(eq(applicationAttachments.applicationId, applicationId))
      .orderBy(asc(applicationAttachments.documentType), asc(applicationAttachments.uploadedAt));

    let attachedCount = 0;
    const failedFiles: string[] = [];
    const usedNamesByFolder = new Map<string, Set<string>>();
    for (const att of attachments) {
      const bytes = await fetchFileBytes(att.fileUrl);
      if (!bytes) {
        failedFiles.push(att.fileName);
        continue;
      }
      const typeLabel = att.documentLabel
        ?? ATTACHMENT_TYPE_MAP[att.documentType]?.label
        ?? att.documentType;
      const folderKey = safeName(typeLabel);
      const sub = attachFolder.folder(folderKey)!;
      let usedNames = usedNamesByFolder.get(folderKey);
      if (!usedNames) {
        usedNames = new Set();
        usedNamesByFolder.set(folderKey, usedNames);
      }
      sub.file(uniqueFileName(usedNames, safeName(att.fileName)), bytes);
      attachedCount++;
    }

    if (attachedCount === 0 && signedCount === 0) {
      return NextResponse.json(
        { error: "パッケージに含められるファイルがありません。添付書類をアップロードしてください。" },
        { status: 400 }
      );
    }

    // 取得失敗ファイルがあれば README で通知
    if (failedFiles.length > 0) {
      root.file(
        "README_注意.txt",
        `以下のファイルは取得に失敗したため、Zipに含まれていません:\n${failedFiles.join("\n")}\n`
      );
    }

    // ── 4. Zip生成・返却 ──
    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const fileName = `${rootName}.zip`;
    return new NextResponse(Buffer.from(zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="package.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(zipBytes.byteLength),
      },
    });
  } catch (err: any) {
    console.error("[submission-package] error:", err);
    return NextResponse.json({ error: `Zipの生成に失敗しました: ${err.message}` }, { status: 500 });
  }
}
