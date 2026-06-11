/**
 * 入管提出用添付書類 API
 * ──────────────────────
 * POST   : ファイルアップロード（書類タイプ検証 → Blob保存 → DBメタデータ記録）
 * GET    : 案件の添付書類一覧
 * DELETE : 添付書類の削除（?attachmentId=）
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put, del } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { db, applications, applicationAttachments } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import { ATTACHMENT_TYPE_MAP, isValidAttachmentType } from "@/lib/attachment-types";

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

/** 認証＋案件のテナント所有チェック。OK なら { tenantId, userId } を返す */
async function authorize(applicationId: string): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; res: NextResponse }
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
  return { ok: true, tenantId, userId: session.user.id as string };
}

// ─── POST: アップロード ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await ctx.params;
  const authResult = await authorize(applicationId);
  if (!authResult.ok) return authResult.res;
  const { tenantId, userId } = authResult;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const documentType = formData.get("documentType") as string | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }
    // ── 書類タイプの検証（定義外は受け付けない） ──
    if (!documentType || !isValidAttachmentType(documentType)) {
      return NextResponse.json(
        { error: "この書類タイプは申請書作成に必要な書類として登録されていません。アップロードできるのは定義された必要書類のみです。" },
        { status: 400 }
      );
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

    const typeDef = ATTACHMENT_TYPE_MAP[documentType];
    const bytes = await file.arrayBuffer();
    const uniqueName = `${randomUUID()}.${ext || "jpg"}`;

    // ── ストレージ保存（案件IDごとのフォルダに永続保存） ──
    let fileUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blobPath = `attachments/${tenantId}/applications/${applicationId}/${documentType}/${uniqueName}`;
      const blob = await put(blobPath, file, { access: "public", contentType: mimeType });
      fileUrl = blob.url;
    } else if (process.env.NODE_ENV === "development") {
      const uploadDir = path.join(process.cwd(), "public", "attachments", tenantId, applicationId, documentType);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, uniqueName), Buffer.from(bytes));
      fileUrl = `/attachments/${tenantId}/${applicationId}/${documentType}/${uniqueName}`;
    } else {
      // フォールバック: Base64データURL
      fileUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
    }

    // ── DBメタデータ記録 ──
    const [record] = await db.insert(applicationAttachments).values({
      tenantId,
      applicationId,
      documentType,
      documentLabel: typeDef.label,
      fileUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      uploadedBy: userId,
    }).returning();

    return NextResponse.json({
      attachment: {
        id: record.id,
        documentType: record.documentType,
        documentLabel: record.documentLabel,
        fileUrl: record.fileUrl,
        fileName: record.fileName,
        fileSize: record.fileSize,
        mimeType: record.mimeType,
        uploadedAt: record.uploadedAt,
      },
    });
  } catch (err: any) {
    console.error("[attachments POST] error:", err);
    return NextResponse.json({ error: `アップロードに失敗しました: ${err.message}` }, { status: 500 });
  }
}

// ─── GET: 一覧 ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await ctx.params;
  const authResult = await authorize(applicationId);
  if (!authResult.ok) return authResult.res;

  try {
    const rows = await db.select().from(applicationAttachments)
      .where(eq(applicationAttachments.applicationId, applicationId))
      .orderBy(desc(applicationAttachments.uploadedAt));
    return NextResponse.json({
      attachments: rows.map(r => ({
        id: r.id,
        documentType: r.documentType,
        documentLabel: r.documentLabel,
        fileUrl: r.fileUrl,
        fileName: r.fileName,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
        uploadedAt: r.uploadedAt,
      })),
    });
  } catch (err: any) {
    console.error("[attachments GET] error:", err);
    return NextResponse.json({ error: "一覧の取得に失敗しました" }, { status: 500 });
  }
}

// ─── DELETE: 削除 ───────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await ctx.params;
  const authResult = await authorize(applicationId);
  if (!authResult.ok) return authResult.res;

  try {
    const attachmentId = req.nextUrl.searchParams.get("attachmentId");
    if (!attachmentId) {
      return NextResponse.json({ error: "attachmentId が指定されていません" }, { status: 400 });
    }

    const [target] = await db.select().from(applicationAttachments)
      .where(and(
        eq(applicationAttachments.id, attachmentId),
        eq(applicationAttachments.applicationId, applicationId),
      )).limit(1);
    if (!target) {
      return NextResponse.json({ error: "添付書類が見つかりません" }, { status: 404 });
    }

    // Blobストレージからも削除（失敗してもDB削除は続行）
    if (process.env.BLOB_READ_WRITE_TOKEN && target.fileUrl.startsWith("https://")) {
      try { await del(target.fileUrl); } catch (e) {
        console.warn("[attachments DELETE] blob del failed:", e);
      }
    }

    await db.delete(applicationAttachments)
      .where(eq(applicationAttachments.id, attachmentId));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[attachments DELETE] error:", err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
