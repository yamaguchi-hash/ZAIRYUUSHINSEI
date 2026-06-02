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
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) {
      return Response.json({ error: "申請案件が見つかりません" }, { status: 404 });
    }

    // ファイルを読む
    const buffer = await request.arrayBuffer();
    const filename = `residence-card-${id}-${Date.now()}.jpg`;

    // Vercel Blob にアップロード
    const blob = await put(
      `applications/${id}/${filename}`,
      buffer,
      { access: "private" }
    );

    return Response.json({ url: blob.url, success: true });
  } catch (err: any) {
    console.error("Residence card upload error:", err);
    return Response.json(
      { error: err.message ?? "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}
