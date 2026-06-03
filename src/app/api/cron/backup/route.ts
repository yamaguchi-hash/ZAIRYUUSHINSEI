import { performAutoBackup } from "@/actions/backup";
import { db, tenants } from "@/lib/db";

export async function GET(request: Request) {
  // Vercel Cron からのリクエストか確認
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "未認可" }, { status: 401 });
  }

  try {
    // すべてのテナントに対して自動バックアップを実行
    const allTenants = await db.select().from(tenants);

    const results = [];

    for (const tenant of allTenants) {
      try {
        // システムユーザーIDを使用（最初のadminユーザーを探すか、テナント作成者を使用）
        // ここではテナントIDを使用してシステム実行を示す
        const result = await performAutoBackup(
          tenant.id,
          tenant.id // システム実行なので、テナントIDをuserIdとして使用
        );

        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          ...result,
        });
      } catch (err: any) {
        console.error(`Auto backup failed for tenant ${tenant.id}:`, err);
        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          success: false,
          error: err.message,
        });
      }
    }

    return Response.json({
      success: true,
      message: "自動バックアップ処理完了",
      results,
    });
  } catch (err: any) {
    console.error("Cron backup error:", err);
    return Response.json(
      {
        success: false,
        error: err.message ?? "自動バックアップに失敗しました",
      },
      { status: 500 }
    );
  }
}
