/**
 * 必要書類チェックリスト項目別ファイル管理 API
 * ──────────────────────────────────────────
 * POST   : ファイルアップロード（自動リネーム→チェックリストへ保存→AI自動入力をキック）
 * DELETE : アップロード済みファイルの削除（チェックリスト項目はそのまま残す）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put, del } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db, applications, applicationDocumentChecklist, applicationAttachments, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { buildAutoFileName, getApplicantNameForFile } from "@/lib/file-naming";
import { fillAllFieldsFromDocs } from "@/actions/fill-all-fields";

export const maxDuration = 60; // Vercel: AI自動入力（複数Geminiコール）に備え延長

const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
];
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heif",
  pdf: "application/pdf",
};
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function normalizeMime(m: string): string {
  const lower = m.toLowerCase().trim();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  return lower;
}

/** 認証＋案件のテナント所有チェック。OK なら { tenantId } を返す */
async function authorize(applicationId: string): Promise<
  { ok: true; tenantId: string } | { ok: false; res: NextResponse }
> {
  let session;
  try {
    session = await auth();
  } catch {
    return { ok: false, res: NextResponse.json({ error: "認証エラーが発生しました。再ログインしてください。" }, { status: 401 }) };
  }
  if (!session?.user) {
    return { ok: false, res: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  const tenantId = (session.user as any).tenantId as string | undefined;
  if (!tenantId) {
    return { ok: false, res: NextResponse.json({ error: "テナントIDが取得できません" }, { status: 403 }) };
  }
  const [app] = await db.select({ id: applications.id }).from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) {
    return { ok: false, res: NextResponse.json({ error: "申請案件が見つかりません" }, { status: 404 }) };
  }
  return { ok: true, tenantId };
}

// ─── POST: アップロード ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
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
    if (!item) {
      return NextResponse.json({ error: "チェックリスト項目が見つかりません" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

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

    // ── ストレージ保存 ──
    let fileUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blobPath = `attachments/${tenantId}/applications/${applicationId}/checklist/${itemId}/${uniqueName}`;
      const blob = await put(blobPath, file, { access: "public", contentType: mimeType });
      fileUrl = blob.url;
    } else if (process.env.NODE_ENV === "development") {
      const uploadDir = path.join(process.cwd(), "public", "attachments", tenantId, applicationId, "checklist", itemId);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, uniqueName), Buffer.from(bytes));
      fileUrl = `/attachments/${tenantId}/${applicationId}/checklist/${itemId}/${uniqueName}`;
    } else {
      fileUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
    }

    // ── ファイル名の自動判定・自動付与（申請人氏名_チェックリストの書類名_YYYYMMDD.拡張子） ──
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

    const [existingChecklistNames, existingAttachmentNames] = await Promise.all([
      db.select({ fileName: applicationDocumentChecklist.fileName })
        .from(applicationDocumentChecklist)
        .where(eq(applicationDocumentChecklist.applicationId, applicationId)),
      db.select({ fileName: applicationAttachments.fileName })
        .from(applicationAttachments)
        .where(eq(applicationAttachments.applicationId, applicationId)),
    ]);

    const fileName = applicant
      ? buildAutoFileName({
          applicantName: getApplicantNameForFile(applicant),
          docLabel: item.documentName,
          originalFileName: file.name,
          existingNames: [
            ...existingChecklistNames.map((c) => c.fileName).filter((n): n is string => !!n),
            ...existingAttachmentNames.map((a) => a.fileName),
          ],
        })
      : file.name;

    // ── チェックリスト項目を更新 ──
    const [updated] = await db.update(applicationDocumentChecklist)
      .set({
        fileUrl,
        fileName,
        fileSize: file.size,
        mimeType,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId))
      .returning();

    revalidatePath(`/applications/${applicationId}`);

    // ── AI自動入力をキック（失敗してもアップロード自体は成功として扱う） ──
    let aiResult: { success: boolean; error?: string; docsRead?: number };
    try {
      aiResult = await fillAllFieldsFromDocs(applicationId);
    } catch (e: any) {
      aiResult = { success: false, error: e?.message ?? "AI処理中にエラーが発生しました" };
    }
    if (aiResult.success) revalidatePath(`/applications/${applicationId}`);

    return NextResponse.json({
      item: {
        id: updated.id,
        fileUrl: updated.fileUrl,
        fileName: updated.fileName,
        fileSize: updated.fileSize,
        mimeType: updated.mimeType,
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
      },
      aiResult: {
        success: aiResult.success,
        error: aiResult.error,
        docsRead: aiResult.docsRead,
      },
    });
  } catch (err: any) {
    console.error("[checklist document POST] error:", err);
    return NextResponse.json({ error: `アップロードに失敗しました: ${err.message}` }, { status: 500 });
  }
}

// ─── DELETE: 削除 ───────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { id: applicationId, itemId } = await ctx.params;
  const authResult = await authorize(applicationId);
  if (!authResult.ok) return authResult.res;

  try {
    const [item] = await db.select().from(applicationDocumentChecklist)
      .where(and(
        eq(applicationDocumentChecklist.id, itemId),
        eq(applicationDocumentChecklist.applicationId, applicationId),
      )).limit(1);
    if (!item) {
      return NextResponse.json({ error: "チェックリスト項目が見つかりません" }, { status: 404 });
    }

    // Blobストレージからも削除（失敗してもDB更新は続行）
    if (item.fileUrl && process.env.BLOB_READ_WRITE_TOKEN && item.fileUrl.startsWith("https://")) {
      try { await del(item.fileUrl); } catch (e) {
        console.warn("[checklist document DELETE] blob del failed:", e);
      }
    }

    await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));

    revalidatePath(`/applications/${applicationId}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[checklist document DELETE] error:", err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
