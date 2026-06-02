"use server";

import { auth } from "@/lib/auth";
import { db, applicantMaster, applications, backupHistory } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  createBackupData,
  generateBackupFileName,
  saveBackupToBlob,
  getBackupHistory,
  type BackupData,
} from "@/lib/backup-utils";

export async function exportBackup() {
  try {
    const session = await auth();
    if (!session?.user) {
      return { error: "認証が必要です" };
    }

    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) {
      return { error: "テナントIDが不正です" };
    }

    // 管理者のみ実行可能
    const role = (session.user as any)?.role;
    if (role !== "admin") {
      return { error: "管理者のみ実行可能です" };
    }

    const backupData = await createBackupData(tenantId);
    const fileName = generateBackupFileName(tenantId, "manual");

    return {
      success: true,
      data: backupData,
      fileName,
    };
  } catch (err: any) {
    return { error: err.message ?? "バックアップ作成に失敗しました" };
  }
}

export async function performAutoBackup(tenantId: string, userId: string) {
  try {
    const backupData = await createBackupData(tenantId);
    const fileName = generateBackupFileName(tenantId, "automatic");

    await saveBackupToBlob(tenantId, backupData, fileName, userId);

    return {
      success: true,
      message: `自動バックアップ完了: 申請人 ${backupData.metadata.applicantMasterCount}件、案件 ${backupData.metadata.applicationsCount}件`,
    };
  } catch (err: any) {
    console.error("Auto backup failed:", err);
    return {
      success: false,
      error: err.message ?? "自動バックアップに失敗しました",
    };
  }
}

export async function importBackup(backupJson: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { error: "認証が必要です" };
    }

    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) {
      return { error: "テナントIDが不正です" };
    }

    // 管理者のみ実行可能
    const role = (session.user as any)?.role;
    if (role !== "admin") {
      return { error: "管理者のみ実行可能です" };
    }

    const backupData: BackupData = JSON.parse(backupJson);

    // バージョンチェック
    if (backupData.version !== "1.0.0") {
      return { error: "バックアップバージョンが対応していません" };
    }

    // トランザクションで復元処理を実行
    // applicantMaster の復元
    for (const master of backupData.applicantMaster) {
      const existing = await db
        .select()
        .from(applicantMaster)
        .where(
          eq(applicantMaster.id, master.id)
        )
        .limit(1);

      if (existing.length > 0) {
        // 更新
        await db
          .update(applicantMaster)
          .set({
            ...master,
            updatedAt: new Date(),
          })
          .where(eq(applicantMaster.id, master.id));
      } else {
        // 新規作成
        await db.insert(applicantMaster).values({
          ...master,
          createdAt: new Date(master.createdAt),
          updatedAt: new Date(master.updatedAt),
        });
      }
    }

    // applications の復元
    for (const app of backupData.applications) {
      const existing = await db
        .select()
        .from(applications)
        .where(eq(applications.id, app.id))
        .limit(1);

      if (existing.length > 0) {
        // 更新
        await db
          .update(applications)
          .set({
            ...app,
            updatedAt: new Date(),
          })
          .where(eq(applications.id, app.id));
      } else {
        // 新規作成
        await db.insert(applications).values({
          ...app,
          createdAt: new Date(app.createdAt),
          updatedAt: new Date(app.updatedAt),
        });
      }
    }

    return {
      success: true,
      message: `復元完了: 申請人 ${backupData.metadata.applicantMasterCount}件、案項 ${backupData.metadata.applicationsCount}件を復元しました`,
    };
  } catch (err: any) {
    return { error: err.message ?? "復元に失敗しました" };
  }
}

export async function fetchBackupHistory() {
  try {
    const session = await auth();
    if (!session?.user) {
      return { error: "認証が必要です" };
    }

    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) {
      return { error: "テナントIDが不正です" };
    }

    const role = (session.user as any)?.role;
    if (role !== "admin") {
      return { error: "管理者のみ実行可能です" };
    }

    const history = await getBackupHistory(tenantId);
    return {
      success: true,
      data: history,
    };
  } catch (err: any) {
    return { error: err.message ?? "バックアップ履歴の取得に失敗しました" };
  }
}
