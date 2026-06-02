import { db, applicantMaster, applications, backupHistory } from "@/lib/db";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";

export interface BackupData {
  version: string;
  createdAt: string;
  applicantMaster: any[];
  applications: any[];
  metadata: {
    applicantMasterCount: number;
    applicationsCount: number;
    totalSize: number;
  };
}

export async function createBackupData(tenantId: string): Promise<BackupData> {
  // applicantMaster のエクスポート
  const masters = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.tenantId, tenantId));

  // applications のエクスポート
  const apps = await db
    .select()
    .from(applications)
    .where(eq(applications.tenantId, tenantId));

  const backupData: BackupData = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    applicantMaster: masters.map((m) => ({
      ...m,
      createdAt: m.createdAt?.toISOString(),
      updatedAt: m.updatedAt?.toISOString(),
    })),
    applications: apps.map((a) => ({
      ...a,
      createdAt: a.createdAt?.toISOString(),
      updatedAt: a.updatedAt?.toISOString(),
    })),
    metadata: {
      applicantMasterCount: masters.length,
      applicationsCount: apps.length,
      totalSize: JSON.stringify(masters).length + JSON.stringify(apps).length,
    },
  };

  return backupData;
}

export async function saveBackupToBlob(
  tenantId: string,
  backupData: BackupData,
  fileName: string,
  userId: string
): Promise<{ url: string; fileName: string }> {
  const dataStr = JSON.stringify(backupData, null, 2);
  const buffer = Buffer.from(dataStr, "utf-8");

  const blob = await put(
    `backups/${tenantId}/${fileName}`,
    buffer,
    { access: "private", contentType: "application/json" }
  );

  // バックアップ履歴を記録
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30日保持

  await db.insert(backupHistory).values({
    tenantId,
    backupType: "automatic",
    fileUrl: blob.url,
    fileName,
    fileSize: buffer.length,
    applicantMasterCount: backupData.metadata.applicantMasterCount,
    applicationsCount: backupData.metadata.applicationsCount,
    createdBy: userId,
    expiresAt,
  });

  return { url: blob.url, fileName };
}

export async function getBackupHistory(tenantId: string) {
  const history = await db
    .select()
    .from(backupHistory)
    .where(eq(backupHistory.tenantId, tenantId))
    .orderBy((t) => t.createdAt);

  return history.filter((h) => !h.isDeleted);
}

export async function restoreBackupData(
  tenantId: string,
  backupData: BackupData
): Promise<{ success: boolean; message: string }> {
  try {
    // 復元は既存データを上書きするため、確認が必要
    // ここでは実装しており、実際の復元処理は別のハンドラで行う

    return {
      success: true,
      message: `復元準備完了: 申請人 ${backupData.metadata.applicantMasterCount}件、案件 ${backupData.metadata.applicationsCount}件`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message ?? "復元に失敗しました",
    };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function generateBackupFileName(tenantId: string, backupType: "manual" | "automatic" = "manual"): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .split("T")[0] + "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const prefix = backupType === "automatic" ? "auto_backup" : "backup";
  return `${prefix}_${tenantId}_${timestamp}.json`;
}
