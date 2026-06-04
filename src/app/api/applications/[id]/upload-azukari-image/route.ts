import { auth } from "@/lib/auth";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { put } from "@vercel/blob";

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
    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) {
      return Response.json({ error: "申請案件が見つかりません" }, { status: 404 });
    }

    // FormData からファイルとタイプを取得
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const imageType = formData.get("imageType") as string | null;

    if (!file) {
      return Response.json({ error: "ファイルが必要です" }, { status: 400 });
    }

    if (!imageType || !["residence_card_front", "residence_card_back", "passport"].includes(imageType)) {
      return Response.json({ error: "不正な画像タイプです" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const ext = file.name.split(".").pop() ?? "jpg";
    const filename = `azukari-${imageType}-${id}-${Date.now()}.${ext}`;

    // Vercel Blob にアップロード
    const blob = await put(
      `applications/${id}/azukari/${filename}`,
      buffer,
      { access: "public" }
    );

    return Response.json({ url: blob.url, success: true });
  } catch (err: any) {
    console.error("Azukari image upload error:", err);
    return Response.json(
      { error: err.message ?? "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}
