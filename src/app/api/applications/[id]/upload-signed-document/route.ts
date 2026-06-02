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

    // ファイルをバリデート
    if (!file.type.includes("pdf")) {
      return Response.json({ error: "PDF ファイルのみ受け付けます" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const filename = `signed-doc-${id}-${Date.now()}.pdf`;

    // Vercel Blob にアップロード
    const blob = await put(
      `applications/${id}/${filename}`,
      buffer,
      { access: "private", contentType: "application/pdf" }
    );

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

    await db.update(applications)
      .set({
        draftData: { ...existing, _signedDocuments: signedDocs },
        updatedAt: new Date(),
      })
      .where(eq(applications.id, id));

    return Response.json({ url: blob.url, success: true });
  } catch (err: any) {
    console.error("Signed document upload error:", err);
    return Response.json(
      { error: err.message ?? "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}
