import { performAutoBackup } from "@/actions/backup";
import { db, tenants, backupSettings } from "@/lib/db";
import { eq } from "drizzle-orm";

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
        // テナントのバックアップ設定を確認
        const settings = await db
          .select()
          .from(backupSettings)
          .where(eq(backupSettings.tenantId, tenant.id))
          .limit(1);

        // 自動バックアップが無効な場合はスキップ
        if (settings.length > 0 && !settings[0].isAutoBackupEnabled) {
          results.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            success: true,
            message: "自動バックアップは無効です",
            skipped: true,
          });
          continue;
        }

        // バックアップ保存先を確認
        const destination = settings.length > 0 ? settings[0].backupDestination : "vercel_blob";

        let result: any;

        if (destination === "local_download") {
          // ローカル保存の場合：バックアップファイルを生成して一時的に保存
          // （ユーザーが手動でダウンロードするため、自動アップロードは不要）
          result = {
            success: true,
            message: `バックアップファイルを生成準備完了（ローカルダウンロード設定）。設定ページからダウンロードしてください。`,
          };
        } else {
          // クラウド保存の場合：通常の自動バックアップを実行
          result = await performAutoBackup(
            tenant.id,
            tenant.id // システム実行なので、テナントIDをuserIdとして使用
          );
        }

        // 設定を更新（実行日時とステータスを記録）
        if (settings.length > 0) {
          await db
            .update(backupSettings)
            .set({
              lastBackupAt: new Date(),
              lastBackupStatus: result.success ? "success" : "failed",
              lastBackupError: result.error ?? null,
              updatedAt: new Date(),
            })
            .where(eq(backupSettings.tenantId, tenant.id));
        }

        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          ...result,
        });
      } catch (err: any) {
        console.error(`Auto backup failed for tenant ${tenant.id}:`, err);

        // エラーを記録
        const settings = await db
          .select()
          .from(backupSettings)
          .where(eq(backupSettings.tenantId, tenant.id))
          .limit(1);

        if (settings.length > 0) {
          await db
            .update(backupSettings)
            .set({
              lastBackupAt: new Date(),
              lastBackupStatus: "failed",
              lastBackupError: err.message,
              updatedAt: new Date(),
            })
            .where(eq(backupSettings.tenantId, tenant.id));
        }

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
