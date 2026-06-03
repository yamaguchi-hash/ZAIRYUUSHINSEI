"use server";

import { auth } from "@/lib/auth";
import { db, applicantMaster, applications, backupHistory, backupSettings } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  createBackupData,
  generateBackupFileName,
  saveBackupToBlob,
  getBackupHistory,
  type BackupData,
} from "@/lib/backup-utils";
import {
  saveFileToGoogleDrive,
  deleteOldBackups,
  listBackupFiles,
  ensureBackupFolder,
  testGoogleDriveConnection,
} from "@/lib/google-drive";

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
    if (role !== "admin" && role !== "expert") {
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
    const backupJson = JSON.stringify(backupData, null, 2);

    console.log("[performAutoBackup] Starting backup process...");

    // Google Drive に保存を試みる
    let backupUrl: string | null = null;
    let destination = "google_drive";

    try {
      console.log("[performAutoBackup] Attempting Google Drive save...");
      const { fileUrl } = await saveFileToGoogleDrive(
        fileName,
        backupJson,
        "application/json"
      );
      backupUrl = fileUrl;
      console.log("[performAutoBackup] Google Drive save successful");
    } catch (gdErr: any) {
      console.warn("[performAutoBackup] Google Drive save failed, falling back to Blob:", gdErr.message);
      try {
        // Google Drive 失敗時は Vercel Blob にフォールバック
        await saveBackupToBlob(tenantId, backupData, fileName, userId);
        destination = "vercel_blob";
        backupUrl = `blob://${fileName}`;
      } catch (blobErr: any) {
        console.error("[performAutoBackup] Both Google Drive and Blob failed:", blobErr);
        return {
          success: false,
          error: "バックアップの保存に失敗しました（Google Drive と Blob の両方が利用できません）",
        };
      }
    }

    // バックアップ履歴に記録
    try {
      const fileSize = Buffer.byteLength(backupJson, "utf-8");
      await db.insert(backupHistory).values({
        tenantId,
        backupType: "automatic",
        fileName,
        fileUrl: backupUrl,
        fileSize,
        applicantMasterCount: backupData.metadata.applicantMasterCount,
        applicationsCount: backupData.metadata.applicationsCount,
        createdBy: userId,
      });
    } catch (dbErr: any) {
      console.error("[performAutoBackup] Failed to record backup history:", dbErr);
      // DB 記録失敗は警告のみ（バックアップ自体は成功）
    }

    return {
      success: true,
      message: `自動バックアップ完了 (${destination}): 申請人 ${backupData.metadata.applicantMasterCount}件、案件 ${backupData.metadata.applicationsCount}件`,
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
    if (role !== "admin" && role !== "expert") {
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
    if (role !== "admin" && role !== "expert") {
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

export async function getBackupSettings() {
  try {
    console.log("[getBackupSettings] Starting...");

    const session = await auth();
    console.log("[getBackupSettings] Session:", session?.user?.id);
    if (!session?.user) {
      console.log("[getBackupSettings] No session user");
      return { error: "認証が必要です" };
    }

    const tenantId = (session.user as any)?.tenantId;
    console.log("[getBackupSettings] TenantId:", tenantId);
    if (!tenantId) {
      console.log("[getBackupSettings] No tenantId");
      return { error: "テナントIDが不正です" };
    }

    const role = (session.user as any)?.role;
    console.log("[getBackupSettings] Role:", role);
    if (role !== "admin" && role !== "expert") {
      console.log("[getBackupSettings] Not admin or expert user");
      return { error: "管理者のみ実行可能です" };
    }

    console.log("[getBackupSettings] Querying database for tenant:", tenantId);
    let settings = await db
      .select()
      .from(backupSettings)
      .where(eq(backupSettings.tenantId, tenantId))
      .limit(1);

    console.log("[getBackupSettings] Found settings:", settings.length);

    // 設定がない場合はデフォルト値で作成
    if (settings.length === 0) {
      console.log("[getBackupSettings] Creating default settings");
      await db.insert(backupSettings).values({
        tenantId,
        isAutoBackupEnabled: true,
        autoBackupSchedule: "02:00",
        retentionDays: 30,
        backupDestination: "google_drive",
      });

      settings = await db
        .select()
        .from(backupSettings)
        .where(eq(backupSettings.tenantId, tenantId))
        .limit(1);

      console.log("[getBackupSettings] Created settings:", settings.length);
    }

    console.log("[getBackupSettings] Returning settings:", settings[0]);
    return {
      success: true,
      data: settings[0],
    };
  } catch (err: any) {
    console.error("[getBackupSettings] Error:", err);
    return { error: `[getBackupSettings] ${err.message ?? "バックアップ設定の取得に失敗しました"}` };
  }
}

export async function checkGoogleDriveConnection() {
  try {
    const session = await auth();
    if (!session?.user) {
      return { error: "認証が必要です" };
    }

    const role = (session.user as any)?.role;
    if (role !== "admin" && role !== "expert") {
      return { error: "管理者のみ実行可能です" };
    }

    console.log("[checkGoogleDriveConnection] Testing connection...");
    const isConnected = await testGoogleDriveConnection();

    if (isConnected) {
      return {
        success: true,
        connected: true,
        message: "Google Drive に正常に接続しました",
      };
    } else {
      return {
        success: false,
        connected: false,
        error: "Google Drive に接続できません。GOOGLE_SERVICE_ACCOUNT_KEY を確認してください。",
      };
    }
  } catch (err: any) {
    console.error("[checkGoogleDriveConnection] Error:", err);
    return {
      success: false,
      connected: false,
      error: err.message ?? "Google Drive 接続テストに失敗しました",
    };
  }
}

export async function updateBackupSettings(
  isAutoBackupEnabled?: boolean,
  autoBackupSchedule?: string,
  retentionDays?: number,
  backupDestination?: string
) {
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
    if (role !== "admin" && role !== "expert") {
      return { error: "管理者のみ実行可能です" };
    }

    // 時間フォーマットの検証
    if (autoBackupSchedule && !/^\d{2}:\d{2}$/.test(autoBackupSchedule)) {
      return { error: "時刻は HH:mm 形式で指定してください（例：02:00）" };
    }

    // 保持期間の検証
    if (retentionDays && (retentionDays < 1 || retentionDays > 365)) {
      return { error: "保持期間は1日～365日の範囲で指定してください" };
    }

    // 保存先の検証
    if (backupDestination && !["google_drive", "vercel_blob", "local_download"].includes(backupDestination)) {
      return { error: "無効な保存先が指定されています" };
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (isAutoBackupEnabled !== undefined) {
      updates.isAutoBackupEnabled = isAutoBackupEnabled;
    }
    if (autoBackupSchedule !== undefined) {
      updates.autoBackupSchedule = autoBackupSchedule;
    }
    if (retentionDays !== undefined) {
      updates.retentionDays = retentionDays;
    }
    if (backupDestination !== undefined) {
      updates.backupDestination = backupDestination;
    }

    await db
      .update(backupSettings)
      .set(updates)
      .where(eq(backupSettings.tenantId, tenantId));

    // 更新後の設定を取得して返す
    const updated = await db
      .select()
      .from(backupSettings)
      .where(eq(backupSettings.tenantId, tenantId))
      .limit(1);

    return {
      success: true,
      data: updated[0],
      message: "バックアップ設定を更新しました",
    };
  } catch (err: any) {
    return { error: err.message ?? "バックアップ設定の更新に失敗しました" };
  }
}
