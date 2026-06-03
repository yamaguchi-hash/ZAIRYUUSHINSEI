import { google, drive_v3 } from "googleapis";
import { JWT } from "google-auth-library";

/**
 * Google Drive クライアントを毎回新規作成（キャッシュ問題を回避）
 */
function initializeDriveClient(): drive_v3.Drive {
  try {
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    console.log("[Google Drive] Raw key exists:", !!rawKey);
    console.log("[Google Drive] Raw key length:", rawKey?.length ?? 0);

    if (!rawKey || rawKey.trim().length === 0) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY environment variable is empty or not set");
    }

    // JSON パース（シングルクォートが残っている場合も対応）
    let cleanKey = rawKey.trim();
    if (cleanKey.startsWith("'") && cleanKey.endsWith("'")) {
      cleanKey = cleanKey.slice(1, -1);
    }
    if (cleanKey.startsWith('"') && cleanKey.endsWith('"')) {
      cleanKey = cleanKey.slice(1, -1);
    }

    console.log("[Google Drive] Clean key length:", cleanKey.length);
    console.log("[Google Drive] Clean key starts with:", cleanKey.substring(0, 20));

    let serviceAccountKey: any;
    try {
      serviceAccountKey = JSON.parse(cleanKey);
    } catch (parseErr: any) {
      console.error("[Google Drive] JSON parse error:", parseErr.message);
      console.error("[Google Drive] First 100 chars:", cleanKey.substring(0, 100));
      throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY as JSON: ${parseErr.message}`);
    }

    if (!serviceAccountKey.project_id) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is missing 'project_id' field");
    }

    if (!serviceAccountKey.client_email) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is missing 'client_email' field");
    }

    if (!serviceAccountKey.private_key) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is missing 'private_key' field");
    }

    console.log("[Google Drive] Project:", serviceAccountKey.project_id);
    console.log("[Google Drive] Email:", serviceAccountKey.client_email);
    console.log("[Google Drive] Key length:", serviceAccountKey.private_key.length);

    const auth = new JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const client = google.drive({ version: "v3", auth });
    console.log("[Google Drive] Client initialized successfully");

    return client;
  } catch (err: any) {
    console.error("[Google Drive] Initialization failed:", err.message);
    throw new Error(`Google Drive initialization failed: ${err.message}`);
  }
}

/**
 * フォルダが存在するか確認し、なければ作成
 */
export async function ensureBackupFolder(
  folderName: string = "在留申請システムバックアップ"
): Promise<string> {
  try {
    const drive = initializeDriveClient();

    // フォルダを検索
    const response = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
      pageSize: 1,
    });

    if (response.data.files && response.data.files.length > 0) {
      console.log(
        "[Google Drive] Backup folder found:",
        response.data.files[0].id
      );
      return response.data.files[0].id!;
    }

    // フォルダが存在しない場合は作成
    console.log("[Google Drive] Creating backup folder...");
    const createResponse = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });

    const folderId = createResponse.data.id!;
    console.log("[Google Drive] Backup folder created:", folderId);

    return folderId;
  } catch (err: any) {
    console.error("[Google Drive] Folder operation failed:", err);
    throw new Error(
      `Failed to ensure backup folder: ${err.message || "Unknown error"}`
    );
  }
}

/**
 * ファイルを Google Drive に保存
 */
export async function saveFileToGoogleDrive(
  fileName: string,
  fileContent: string | Buffer,
  mimeType: string = "application/json",
  folderId?: string
): Promise<{ fileId: string; fileUrl: string }> {
  try {
    const drive = initializeDriveClient();

    // フォルダ ID を確保
    const targetFolderId =
      folderId || (await ensureBackupFolder("在留申請システムバックアップ"));

    console.log(
      `[Google Drive] Saving file: ${fileName} to folder: ${targetFolderId}`
    );

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
        parents: [targetFolderId],
      },
      media: {
        mimeType: mimeType,
        body:
          typeof fileContent === "string"
            ? Buffer.from(fileContent, "utf-8")
            : fileContent,
      },
      fields: "id, webViewLink",
    });

    const fileId = response.data.id!;
    const fileUrl = response.data.webViewLink!;

    console.log(
      `[Google Drive] File saved successfully. ID: ${fileId}, URL: ${fileUrl}`
    );

    return { fileId, fileUrl };
  } catch (err: any) {
    console.error("[Google Drive] File save failed:", err);
    throw new Error(`Failed to save file to Google Drive: ${err.message}`);
  }
}

/**
 * Google Drive から古いバックアップを削除
 */
export async function deleteOldBackups(
  retentionDays: number = 30,
  folderId?: string
): Promise<number> {
  try {
    const drive = initializeDriveClient();

    const targetFolderId =
      folderId || (await ensureBackupFolder("在留申請システムバックアップ"));

    // 保持期間を超えたファイルを計算
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const response = await drive.files.list({
      q: `'${targetFolderId}' in parents and createdTime < '${cutoffDate.toISOString()}' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name, createdTime)",
      pageSize: 100,
    });

    let deletedCount = 0;

    if (response.data.files && response.data.files.length > 0) {
      console.log(
        `[Google Drive] Found ${response.data.files.length} old backups to delete`
      );

      for (const file of response.data.files) {
        try {
          await drive.files.delete({
            fileId: file.id!,
          });
          console.log(`[Google Drive] Deleted: ${file.name}`);
          deletedCount++;
        } catch (err: any) {
          console.error(`[Google Drive] Failed to delete ${file.name}:`, err);
        }
      }
    }

    console.log(`[Google Drive] Deleted ${deletedCount} old backups`);
    return deletedCount;
  } catch (err: any) {
    console.error("[Google Drive] Cleanup failed:", err);
    throw new Error(`Failed to delete old backups: ${err.message}`);
  }
}

/**
 * バックアップファイルの一覧を取得
 */
export async function listBackupFiles(
  folderId?: string
): Promise<Array<{ id: string; name: string; createdTime: string; size: string }>> {
  try {
    const drive = initializeDriveClient();

    const targetFolderId =
      folderId || (await ensureBackupFolder("在留申請システムバックアップ"));

    const response = await drive.files.list({
      q: `'${targetFolderId}' in parents and trashed=false`,
      spaces: "drive",
      fields:
        "files(id, name, createdTime, size, webViewLink)",
      pageSize: 100,
      orderBy: "createdTime desc",
    });

    return (response.data.files || []).map((file) => ({
      id: file.id!,
      name: file.name!,
      createdTime: file.createdTime!,
      size: file.size || "0",
    }));
  } catch (err: any) {
    console.error("[Google Drive] List operation failed:", err);
    throw new Error(`Failed to list backup files: ${err.message}`);
  }
}

/**
 * Google Drive に接続可能かテスト
 */
export async function testGoogleDriveConnection(): Promise<boolean> {
  try {
    console.log("[Google Drive] Testing connection...");

    // 環境変数の確認
    const keyExists = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    console.log("[Google Drive] Service account key exists:", keyExists);

    const drive = initializeDriveClient();
    console.log("[Google Drive] Drive client initialized");

    const response = await drive.files.list({
      spaces: "drive",
      pageSize: 1,
      fields: "files(id)",
    });

    console.log("[Google Drive] Connection test successful, response:", response.status);
    return true;
  } catch (err: any) {
    console.error("[Google Drive] Connection test failed");
    console.error("- Error name:", err.name);
    console.error("- Error message:", err.message);
    console.error("- Error code:", err.code);
    console.error("- Error status:", err.status);
    console.error("- Full error:", JSON.stringify(err, null, 2));
    return false;
  }
}
