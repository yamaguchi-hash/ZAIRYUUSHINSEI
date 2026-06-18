/**
 * チェックリスト項目への追加ファイル管理 API（2枚目以降）
 * ─────────────────────────────────────────────────────────
 * POST   : 追加ファイルをアップロードし additional_files JSONB 配列へ append
 * DELETE : additional_files 配列から index 指定で削除
 *
 * 1枚目のファイルは既存の POST /checklist/[itemId]/document で管理する。
 * このルートは 2枚目以降専用。
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put, del } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import {
  db, applications, applicationDocumentChecklist,
  applicationAttachments, applicantMaster,
} from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { buildAutoFileName, getApplicantNameForFile } from "@/lib/file-naming";
import { fillAllFieldsFromDocs } from "@/actions/fill-all-fields";

export const maxDuration = 300;

const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
];
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heif",
  pdf: "application/pdf",
};
const MAX_SIZE = 10 * 1024 * 1024;

type ExtraFile = {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

function normalizeMime(m: string): string {
  const lower = m.toLowerCase().trim();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  return lower;
}

async function authorize(applicationId: string): Promise<
  { ok: true; tenantId: string } | { ok: false; res: NextResponse }
> {
  let session;
  try { session = await auth(); } catch {
    return { ok: false, res: NextResponse.json({ error: "認証エラー" }, { status: 401 }) };
  }
  if (!session?.user) return { ok: false, res: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  const tenantId = (session.user as any).tenantId as string | undefined;
  if (!tenantId) return { ok: false, res: NextResponse.json({ error: "テナントIDが取得できません" }, { status: 403 }) };
  const [app] = await db.select({ id: applications.id }).from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) return { ok: false, res: NextResponse.json({ error: "申請案件が見つかりません" }, { status: 404 }) };
  return { ok: true, tenantId };
}

// ─── POST: 追加ファイルアップロード ────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id: applicationId, itemId } = await ctx.params;
    const authResult = await authorize(applicationId);
    if (!authResult.ok) return authResult.res;
    const { tenantId } = authResult;

    try {
      const [item] = await db.select().from(applicationDocumentChecklist)
        .where(and(
          eq(applicationDocumentChecklist.id, itemId),
          eq(applicationDocumentChecklist.applicationId, applicationId),
        )).limit(1);
      if (!item) return NextResponse.json({ error: "チェックリスト項目が見つかりません" }, { status: 404 });

      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = normalizeMime(
        ALLOWED_MIMES.includes(normalizeMime(file.type)) ? file.type : (EXT_TO_MIME[ext] ?? "")
      );
      if (!mimeType || !ALLOWED_MIMES.includes(mimeType)) {
        return NextResponse.json({ error: "対応していないファイル形式です（JPG/PNG/WebP/HEIC/PDF）" }, { status: 400 });
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: "ファイルサイズは10MB以下にしてください" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const uniqueName = `${randomUUID()}.${ext || "bin"}`;

      // ── ストレージ保存 ────────────────────────────────────────────────────────
      let fileUrl: string;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blobPath = `attachments/${tenantId}/applications/${applicationId}/checklist/${itemId}/extra/${uniqueName}`;
        const blob = await put(blobPath, file, { access: "public", contentType: mimeType });
        fileUrl = blob.url;
      } else if (process.env.NODE_ENV === "development") {
        const uploadDir = path.join(process.cwd(), "public", "attachments", tenantId, applicationId, "checklist", itemId, "extra");
        await mkdir(uploadDir, { recursive: true });
        await writeFile(path.join(uploadDir, uniqueName), Buffer.from(bytes));
        fileUrl = `/attachments/${tenantId}/${applicationId}/checklist/${itemId}/extra/${uniqueName}`;
      } else {
        fileUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
      }

      // ── 申請人氏名 ───────────────────────────────────────────────────────────
      const [appRow] = await db.select({ applicantId: applications.applicantId })
        .from(applications).where(eq(applications.id, applicationId)).limit(1);
      const [applicant] = appRow
        ? await db.select({
            familyNameEn: applicantMaster.familyNameEn,
            givenNameEn: applicantMaster.givenNameEn,
            familyNameJa: applicantMaster.familyNameJa,
            givenNameJa: applicantMaster.givenNameJa,
          }).from(applicantMaster).where(eq(applicantMaster.id, appRow.applicantId)).limit(1)
        : [];

      // ── 既存ファイル名を収集（衝突回避用） ──────────────────────────────────
      const [existingChecklistRows, existingAttachmentRows] = await Promise.all([
        db.select({ fileName: applicationDocumentChecklist.fileName, additionalFiles: applicationDocumentChecklist.additionalFiles })
          .from(applicationDocumentChecklist)
          .where(eq(applicationDocumentChecklist.applicationId, applicationId)),
        db.select({ fileName: applicationAttachments.fileName })
          .from(applicationAttachments)
          .where(eq(applicationAttachments.applicationId, applicationId)),
      ]);

      const existingNames = [
        ...existingChecklistRows.map(c => c.fileName).filter((n): n is string => !!n),
        ...existingChecklistRows.flatMap(c =>
          (c.additionalFiles ?? []).map(f => f.fileName).filter(Boolean)
        ),
        ...existingAttachmentRows.map(a => a.fileName),
      ];

      const fileName = applicant
        ? buildAutoFileName({
            applicantName: getApplicantNameForFile(applicant),
            docLabel: item.documentName,
            originalFileName: file.name,
            existingNames,
          })
        : file.name;

      // ── additional_files 配列へ追記 ──────────────────────────────────────────
      const currentExtras: ExtraFile[] = (item.additionalFiles ?? []) as ExtraFile[];
      const addedFile: ExtraFile = { fileUrl, fileName, fileSize: file.size, mimeType };
      const updatedExtras = [...currentExtras, addedFile];

      await db.update(applicationDocumentChecklist)
        .set({ additionalFiles: updatedExtras, updatedAt: new Date() })
        .where(eq(applicationDocumentChecklist.id, itemId));

      revalidatePath(`/applications/${applicationId}`);

      // ── AI自動入力キック ─────────────────────────────────────────────────────
      let aiResult: { success: boolean; error?: string; docsRead?: number };
      try { aiResult = await fillAllFieldsFromDocs(applicationId); }
      catch (e: any) { aiResult = { success: false, error: e?.message ?? "AI処理エラー" }; }
      if (aiResult.success) revalidatePath(`/applications/${applicationId}`);

      return NextResponse.json({ addedFile, aiResult });
    } catch (err: any) {
      console.error("[extra-file POST] inner error:", err);
      return NextResponse.json({ error: `アップロードに失敗しました: ${err.message}` }, { status: 500 });
    }
  } catch (err: any) {
    console.error("[extra-file POST] outer error:", err);
    return NextResponse.json({ error: `サーバーエラーが発生しました: ${err.message}` }, { status: 500 });
  }
}

// ─── DELETE: 追加ファイル削除（index 指定） ─────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { id: applicationId, itemId } = await ctx.params;
    const authResult = await authorize(applicationId);
    if (!authResult.ok) return authResult.res;

    try {
      const body = await req.json().catch(() => ({}));
      const index = typeof body?.index === "number" ? body.index : -1;
      if (index < 0) return NextResponse.json({ error: "indexが不正です" }, { status: 400 });

      const [item] = await db.select().from(applicationDocumentChecklist)
        .where(and(
          eq(applicationDocumentChecklist.id, itemId),
          eq(applicationDocumentChecklist.applicationId, applicationId),
        )).limit(1);
      if (!item) return NextResponse.json({ error: "チェックリスト項目が見つかりません" }, { status: 404 });

      const extras: ExtraFile[] = (item.additionalFiles ?? []) as ExtraFile[];
      if (index >= extras.length) {
        return NextResponse.json({ error: "指定したindexが範囲外です" }, { status: 400 });
      }

      const toDelete = extras[index];
      if (toDelete?.fileUrl && process.env.BLOB_READ_WRITE_TOKEN && toDelete.fileUrl.startsWith("https://")) {
        try { await del(toDelete.fileUrl); } catch (e) {
          console.warn("[extra-file DELETE] blob del failed:", e);
        }
      }

      const newExtras = extras.filter((_, i) => i !== index);
      await db.update(applicationDocumentChecklist)
        .set({ additionalFiles: newExtras, updatedAt: new Date() })
        .where(eq(applicationDocumentChecklist.id, itemId));

      revalidatePath(`/applications/${applicationId}`);
      return NextResponse.json({ success: true });
    } catch (err: any) {
      console.error("[extra-file DELETE] inner error:", err);
      return NextResponse.json({ error: `削除に失敗しました: ${err.message}` }, { status: 500 });
    }
  } catch (err: any) {
    console.error("[extra-file DELETE] outer error:", err);
    return NextResponse.json({ error: `サーバーエラーが発生しました: ${err.message}` }, { status: 500 });
  }
}
