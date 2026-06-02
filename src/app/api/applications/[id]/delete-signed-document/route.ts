import { auth } from "@/lib/auth";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { del } from "@vercel/blob";

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

    const { url } = await request.json();
    if (!url) {
      return Response.json({ error: "URLが見つかりません" }, { status: 400 });
    }

    // 申請案件存在確認
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) {
      return Response.json({ error: "申請案件が見つかりません" }, { status: 404 });
    }

    // Vercel Blob から削除
    try {
      await del(url);
    } catch (err) {
      console.error("Blob deletion error:", err);
      // ファイルが既に削除されている場合は続行
    }

    // draftData から署名済みドキュメント情報を削除
    const existing = (app.draftData as Record<string, any>) ?? {};
    const signedDocs = ((existing._signedDocuments ?? []) as Array<{ url: string }>).filter(
      (doc) => doc.url !== url
    );

    await db.update(applications)
      .set({
        draftData: { ...existing, _signedDocuments: signedDocs },
        updatedAt: new Date(),
      })
      .where(eq(applications.id, id));

    return Response.json({ success: true });
  } catch (err: any) {
    console.error("Signed document deletion error:", err);
    return Response.json(
      { error: err.message ?? "削除に失敗しました" },
      { status: 500 }
    );
  }
}
