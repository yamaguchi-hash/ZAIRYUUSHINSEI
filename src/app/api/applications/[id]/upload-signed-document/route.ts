import { auth } from "@/lib/auth";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { put } from "@vercel/blob";

type DocumentType = "applicant" | "organization" | "gaikatsu";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log("=== 署名済み申請書アップロードAPI開始 ===");
  try {
    const { id } = await params;
    console.log("applicationId:", id);

    const session = await auth();
    if (!session?.user) {
      console.error("認証エラー");
      return Response.json({ error: "認証が必要です" }, { status: 401 });
    }
    console.log("ユーザー認証OK:", (session.user as any)?.email);

    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) {
      console.error("テナントIDエラー");
      return Response.json({ error: "テナントIDが不正です" }, { status: 400 });
    }
    console.log("tenantId:", tenantId);

    // 申請案件存在確認
    console.log("申請案件をDBから取得...");
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) {
      console.error("申請案件が見つかりません:", id);
      return Response.json({ error: "申請案件が見つかりません" }, { status: 404 });
    }
    console.log("申請案件取得OK");

    // フォームデータからファイルを取得
    console.log("FormDataをパース...");
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const documentType = (formData.get("documentType") ?? "applicant") as DocumentType;

    console.log("ファイル情報:", {
      name: file?.name,
      size: file?.size,
      type: file?.type,
      documentType,
    });

    if (!file) {
      console.error("ファイルが見つかりません");
      return Response.json({ error: "ファイルが見つかりません" }, { status: 400 });
    }

    // ファイルをバリデート（MIMEタイプまたは拡張子で確認）
    const isPdf = file.type === "application/pdf" ||
                  file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      console.error("PDFでないファイル:", { type: file.type, name: file.name });
      return Response.json({ error: "PDF ファイルのみ受け付けます" }, { status: 400 });
    }
    console.log("ファイルタイプ検証OK");

    console.log("ファイルをバッファに読み込み...");
    const buffer = await file.arrayBuffer();
    console.log("バッファサイズ:", buffer.byteLength);

    if (buffer.byteLength === 0) {
      console.error("ファイルが空");
      return Response.json({ error: "ファイルが空です" }, { status: 400 });
    }

    const filename = `signed-doc-${id}-${Date.now()}.pdf`;
    console.log("アップロードファイル名:", filename);

    // Vercel Blob にアップロード
    // 注: 現在のストアが「public」設定のため access: "public" を使用
    // セキュリティを強化するには Vercel ダッシュボードで Blob ストアを「private access」に変更してください
    let blob;
    try {
      console.log("Vercel Blob へアップロード開始...");
      console.log("パス: applications/${id}/${filename}");
      blob = await put(
        `applications/${id}/${filename}`,
        buffer,
        { access: "public", contentType: "application/pdf" }
      );
      console.log("Vercel Blob アップロード成功:", blob.url);
    } catch (blobErr: any) {
      console.error("=== Vercel Blob アップロードエラー ===");
      console.error("メッセージ:", blobErr.message);
      console.error("スタック:", blobErr.stack);
      console.error("エラーオブジェクト:", blobErr);
      return Response.json(
        { error: `ファイルアップロードエラー: ${blobErr.message}` },
        { status: 500 }
      );
    }

    // draftData に署名済みドキュメント情報を追加
    console.log("draftData を準備...");
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

    console.log("ドキュメント情報をDB更新...");
    try {
      await db.update(applications)
        .set({
          draftData: { ...existing, _signedDocuments: signedDocs },
          updatedAt: new Date(),
        })
        .where(eq(applications.id, id));
      console.log("DB更新成功");
    } catch (dbErr: any) {
      console.error("=== データベース更新エラー ===");
      console.error("メッセージ:", dbErr.message);
      console.error("スタック:", dbErr.stack);
      console.error("エラーオブジェクト:", dbErr);
      return Response.json(
        { error: `データベース更新エラー: ${dbErr.message}` },
        { status: 500 }
      );
    }

    console.log("=== アップロード完了 ===");
    return Response.json({ url: blob.url, success: true });
  } catch (err: any) {
    console.error("=== 予期しないエラー ===");
    console.error("メッセージ:", err.message);
    console.error("スタック:", err.stack);
    console.error("エラーオブジェクト:", err);
    return Response.json(
      { error: err.message ?? "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}
