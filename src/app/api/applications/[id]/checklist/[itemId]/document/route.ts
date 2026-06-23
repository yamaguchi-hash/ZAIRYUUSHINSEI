/**
 * 必要書類チェックリスト項目別ファイル管理 API
 * ──────────────────────────────────────────
 * POST   : ファイルアップロード（AI書類判別→自動リネーム→チェックリスト自動マッピング→AI自動入力）
 * PATCH  : 未判別書類の手動再分類（別チェックリスト項目へ移動）
 * DELETE : アップロード済みファイルの削除
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
import { classifyDocumentType, matchChecklistItem, UNCLASSIFIED_DOC_LABEL } from "@/lib/document-classifier";
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

function normalizeMime(m: string): string {
  const lower = m.toLowerCase().trim();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  return lower;
}

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

    // ── ① AI書類タイプ判定（Gemini Vision） ──────────────────────────────────
    const base64 = Buffer.from(bytes).toString("base64");
    let classification = { documentName: "", confidence: "low" as "high" | "medium" | "low" };
    try {
      classification = await classifyDocumentType(base64, mimeType);
    } catch (e: any) {
      console.error("[checklist document POST] classify error:", e?.message);
    }

    const useAiName = !!(classification.documentName && classification.confidence !== "low");
    const docLabel = useAiName ? classification.documentName : UNCLASSIFIED_DOC_LABEL;
    const needsManualClassification = !useAiName;

    // ── ② チェックリスト全項目を取得してマッチング ──────────────────────────
    const allChecklist = await db.select({
      id: applicationDocumentChecklist.id,
      documentName: applicationDocumentChecklist.documentName,
      fileUrl: applicationDocumentChecklist.fileUrl,
      fileName: applicationDocumentChecklist.fileName,
    }).from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));

    let targetItemId = itemId;
    let mismatch: {
      aiDocumentName: string;
      droppedInto: string;
      matchedName: string;
      moved: boolean;
    } | null = null;

    if (useAiName) {
      const matched = matchChecklistItem(classification.documentName, allChecklist);
      if (matched && matched.id !== itemId) {
        const canMove = !matched.fileUrl;
        mismatch = {
          aiDocumentName: classification.documentName,
          droppedInto: item.documentName,
          matchedName: matched.documentName,
          moved: canMove,
        };
        if (canMove) targetItemId = matched.id;
      }
    }

    // ── ③ ストレージ保存 ─────────────────────────────────────────────────────
    let fileUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blobPath = `attachments/${tenantId}/applications/${applicationId}/checklist/${targetItemId}/${uniqueName}`;
      const blob = await put(blobPath, file, { access: "public", contentType: mimeType });
      fileUrl = blob.url;
    } else if (process.env.NODE_ENV === "development") {
      const uploadDir = path.join(process.cwd(), "public", "attachments", tenantId, applicationId, "checklist", targetItemId);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, uniqueName), Buffer.from(bytes));
      fileUrl = `/attachments/${tenantId}/${applicationId}/checklist/${targetItemId}/${uniqueName}`;
    } else {
      fileUrl = `data:${mimeType};base64,${base64}`;
    }

    // ── ④ 申請人氏名取得 ─────────────────────────────────────────────────────
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

    // ── ⑤ ファイル名自動生成（[氏名]_[AI判別書類名 or 未判別の書類]_[YYYYMMDD].[拡張子]） ──
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
          docLabel,
          originalFileName: file.name,
          existingNames: [
            ...existingChecklistNames.map((c) => c.fileName).filter((n): n is string => !!n),
            ...existingAttachmentNames.map((a) => a.fileName),
          ],
        })
      : file.name;

    // ── ⑥ チェックリスト項目を更新（targetItemId = AI一致先 or ドロップ先） ────
    // 案件固有のアップロードのため、マスター反映フラグは明示的にfalseへ戻す
    const [updated] = await db.update(applicationDocumentChecklist)
      .set({
        fileUrl,
        fileName,
        fileSize: file.size,
        mimeType,
        fileSourcedFromMaster: false,
        fileSourcedFromMasterType: null,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, targetItemId))
      .returning();

    revalidatePath(`/applications/${applicationId}`);

    // ── ⑦ AI自動入力をキック ─────────────────────────────────────────────────
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
        fileSourcedFromMaster: updated.fileSourcedFromMaster,
        fileSourcedFromMasterType: updated.fileSourcedFromMasterType,
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
      },
      targetItemId: updated.id,
      droppedItemId: itemId,
      classification: {
        documentName: classification.documentName,
        confidence: classification.confidence,
      },
      needsManualClassification,
      mismatch,
      aiResult: {
        success: aiResult.success,
        error: aiResult.error,
        docsRead: aiResult.docsRead,
      },
    });
  } catch (err: any) {
    console.error("[checklist document POST] inner error:", err);
    return NextResponse.json({ error: `アップロードに失敗しました: ${err.message}` }, { status: 500 });
  }
  } catch (err: any) {
    console.error("[checklist document POST] outer error:", err);
    return NextResponse.json({ error: `サーバーエラーが発生しました: ${err.message}` }, { status: 500 });
  }
}

// ─── PATCH: 未判別書類の手動再分類（別チェックリスト項目へ移動） ───────────────────
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  try {
  const { id: applicationId, itemId } = await ctx.params;
  const authResult = await authorize(applicationId);
  if (!authResult.ok) return authResult.res;

  try {
    const body = await req.json().catch(() => ({}));
    const targetItemId = typeof body?.targetItemId === "string" ? body.targetItemId.trim() : "";
    if (!targetItemId) {
      return NextResponse.json({ error: "targetItemId が指定されていません" }, { status: 400 });
    }
    if (targetItemId === itemId) {
      return NextResponse.json({ error: "移動先は現在の項目と異なる必要があります" }, { status: 400 });
    }

    const [sourceItem] = await db.select().from(applicationDocumentChecklist)
      .where(and(
        eq(applicationDocumentChecklist.id, itemId),
        eq(applicationDocumentChecklist.applicationId, applicationId),
      )).limit(1);
    if (!sourceItem) {
      return NextResponse.json({ error: "移動元のチェックリスト項目が見つかりません" }, { status: 404 });
    }
    if (!sourceItem.fileUrl || !sourceItem.fileName) {
      return NextResponse.json({ error: "移動元にファイルがありません" }, { status: 400 });
    }

    const [targetItem] = await db.select().from(applicationDocumentChecklist)
      .where(and(
        eq(applicationDocumentChecklist.id, targetItemId),
        eq(applicationDocumentChecklist.applicationId, applicationId),
      )).limit(1);
    if (!targetItem) {
      return NextResponse.json({ error: "移動先のチェックリスト項目が見つかりません" }, { status: 404 });
    }
    if (targetItem.fileUrl) {
      return NextResponse.json({ error: "移動先の項目には既にファイルがあります" }, { status: 409 });
    }

    // 移動先の書類名でファイル名を再生成
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

    const newFileName = applicant
      ? buildAutoFileName({
          applicantName: getApplicantNameForFile(applicant),
          docLabel: targetItem.documentName,
          originalFileName: sourceItem.fileName,
          existingNames: [
            ...existingChecklistNames
              .map((c) => c.fileName)
              .filter((n): n is string => !!n && n !== sourceItem.fileName),
            ...existingAttachmentNames.map((a) => a.fileName),
          ],
        })
      : sourceItem.fileName;

    const [updatedTarget] = await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: sourceItem.fileUrl,
        fileName: newFileName,
        fileSize: sourceItem.fileSize,
        mimeType: sourceItem.mimeType,
        fileSourcedFromMaster: sourceItem.fileSourcedFromMaster,
        fileSourcedFromMasterType: sourceItem.fileSourcedFromMasterType,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, targetItemId))
      .returning();

    await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
        fileSourcedFromMaster: false,
        fileSourcedFromMasterType: null,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));

    revalidatePath(`/applications/${applicationId}`);

    return NextResponse.json({
      success: true,
      movedFrom: itemId,
      item: {
        id: updatedTarget.id,
        fileUrl: updatedTarget.fileUrl,
        fileName: updatedTarget.fileName,
        fileSize: updatedTarget.fileSize,
        mimeType: updatedTarget.mimeType,
        fileSourcedFromMaster: updatedTarget.fileSourcedFromMaster,
        fileSourcedFromMasterType: updatedTarget.fileSourcedFromMasterType,
        status: updatedTarget.status,
        submittedAt: updatedTarget.submittedAt?.toISOString() ?? null,
      },
    });
  } catch (err: any) {
    console.error("[checklist document PATCH] inner error:", err);
    return NextResponse.json({ error: `再分類に失敗しました: ${err.message}` }, { status: 500 });
  }
  } catch (err: any) {
    console.error("[checklist document PATCH] outer error:", err);
    return NextResponse.json({ error: `サーバーエラーが発生しました: ${err.message}` }, { status: 500 });
  }
}

// ─── DELETE: 削除 ───────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  try {
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

    // マスターから反映されたファイルは申請人マスター側も同じURLを参照しているため、
    // Blob自体は削除せずチェックリスト側の参照のみクリアする。
    if (
      !item.fileSourcedFromMaster &&
      item.fileUrl && process.env.BLOB_READ_WRITE_TOKEN && item.fileUrl.startsWith("https://")
    ) {
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
        fileSourcedFromMaster: false,
        fileSourcedFromMasterType: null,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));

    revalidatePath(`/applications/${applicationId}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[checklist document DELETE] inner error:", err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
  } catch (err: any) {
    console.error("[checklist document DELETE] outer error:", err);
    return NextResponse.json({ error: `サーバーエラーが発生しました: ${err.message}` }, { status: 500 });
  }
}
