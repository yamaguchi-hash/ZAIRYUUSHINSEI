import { auth } from "@/lib/auth";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { put } from "@vercel/blob";

type DocumentType = "applicant" | "organization" | "gaikatsu";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "認証が必要です" }, { status: 401 });
    }

    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) {
      return Response.json({ error: "テナントIDが不正です" }, { status: 400 });
    }

    // 申請案件存在確認
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) {
      return Response.json({ error: "申請案件が見つかりません" }, { status: 404 });
    }

    // フォームデータからファイルを取得
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const documentType = (formData.get("documentType") ?? "applicant") as DocumentType;

    if (!file) {
      return Response.json({ error: "ファイルが見つかりません" }, { status: 400 });
    }

    // ファイルをバリデート（MIMEタイプまたは拡張子で確認）
    const isPdf = file.type === "application/pdf" ||
                  file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      console.error("Invalid file type:", { type: file.type, name: file.name });
      return Response.json({ error: "PDF ファイルのみ受け付けます" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      return Response.json({ error: "ファイルが空です" }, { status: 400 });
    }

    const filename = `signed-doc-${id}-${Date.now()}.pdf`;

    // Vercel Blob にアップロード
    let blob;
    try {
      blob = await put(
        `applications/${id}/${filename}`,
        buffer,
        { access: "private", contentType: "application/pdf" }
      );
    } catch (blobErr: any) {
      console.error("Vercel Blob upload error:", blobErr);
      return Response.json(
        { error: `ファイルアップロードエラー: ${blobErr.message}` },
        { status: 500 }
      );
    }

    // draftData に署名済みドキュメント情報を追加
    const existing = (app.draftData as Record<string, any>) ?? {};
    const signedDocs = (existing._signedDocuments ?? []) as Array<{
      url: string;
      fileName: string;
      uploadedAt: string;
      documentType?: DocumentType;
    }>;

    signedDocs.push({
      url: blob.url,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      documentType,
    });

    try {
      await db.update(applications)
        .set({
          draftData: { ...existing, _signedDocuments: signedDocs },
          updatedAt: new Date(),
        })
        .where(eq(applications.id, id));
    } catch (dbErr: any) {
      console.error("Database update error:", dbErr);
      return Response.json(
        { error: `データベース更新エラー: ${dbErr.message}` },
        { status: 500 }
      );
    }

    return Response.json({ url: blob.url, success: true });
  } catch (err: any) {
    console.error("Signed document upload error:", {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    return Response.json(
      { error: err.message ?? "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}
