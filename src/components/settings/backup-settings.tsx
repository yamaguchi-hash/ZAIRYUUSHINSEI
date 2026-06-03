"use client";

import { useState, useEffect } from "react";
import { Download, Upload, AlertCircle, CheckCircle, Loader2, Calendar, HardDrive, Settings, Clock, Trash2, Cloud, Computer, Wifi } from "lucide-react";
import { exportBackup, importBackup, fetchBackupHistory, getBackupSettings, updateBackupSettings, checkGoogleDriveConnection } from "@/actions/backup";
import { formatBytes } from "@/lib/backup-utils";

interface BackupHistoryItem {
  id: string;
  backupType: string;
  fileName: string;
  fileSize: number | null;
  applicantMasterCount: number | null;
  applicationsCount: number | null;
  createdAt: Date | string;
  fileUrl: string | null;
}

interface BackupSettingsData {
  id: string;
  isAutoBackupEnabled: boolean;
  autoBackupSchedule: string;
  retentionDays: number;
  backupDestination: string;
}

export function BackupSettings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState("");
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);

  // バックアップ設定の state
  const [settings, setSettings] = useState<BackupSettingsData | null>(null);
  const [isAutoBackupEnabled, setIsAutoBackupEnabled] = useState(true);
  const [autoBackupSchedule, setAutoBackupSchedule] = useState("02:00");
  const [retentionDays, setRetentionDays] = useState(30);
  const [backupDestination, setBackupDestination] = useState("google_drive");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Google Drive 接続状態
  const [googleDriveConnected, setGoogleDriveConnected] = useState<boolean | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    console.log("[BackupSettings] Component mounted");
    loadSettings();
    loadBackupHistory();
    testGoogleDriveConnectionStatus();
  }, []);

  async function testGoogleDriveConnectionStatus() {
    setTestingConnection(true);
    try {
      console.log("[BackupSettings] Testing Google Drive connection...");
      const result = await checkGoogleDriveConnection();

      if ("error" in result) {
        console.warn("[BackupSettings] Google Drive error:", result.error);
        setGoogleDriveConnected(false);
      } else {
        setGoogleDriveConnected(result.connected || false);
        console.log("[BackupSettings] Google Drive connected:", result.connected);
      }
    } catch (err: any) {
      console.error("[BackupSettings] Connection check exception:", err);
      setGoogleDriveConnected(false);
    } finally {
      setTestingConnection(false);
    }
  }

  async function loadSettings() {
    setLoadingSettings(true);
    try {
      console.log("[BackupSettings] Loading settings...");
      const result = await getBackupSettings();
      console.log("[BackupSettings] Settings result:", result);

      if ("error" in result) {
        console.error("[BackupSettings] Settings error:", result.error);
        setError(result.error || "バックアップ設定の取得に失敗しました");
        return;
      }

      if (result.data) {
        console.log("[BackupSettings] Settings loaded:", result.data);
        setSettings(result.data);
        setIsAutoBackupEnabled(result.data.isAutoBackupEnabled);
        setAutoBackupSchedule(result.data.autoBackupSchedule);
        setRetentionDays(result.data.retentionDays);
        setBackupDestination(result.data.backupDestination);
      }
    } catch (err: any) {
      console.error("[BackupSettings] Exception:", err);
      setError("バックアップ設定の読み込みに失敗しました");
    } finally {
      setLoadingSettings(false);
    }
  }

  async function loadBackupHistory() {
    setLoadingHistory(true);
    try {
      console.log("[BackupSettings] Loading history...");
      const result = await fetchBackupHistory();
      console.log("[BackupSettings] History result:", result);

      if ("error" in result) {
        console.error("[BackupSettings] Error:", result.error);
        setError(result.error);
        return;
      }
      setHistory(result.data || []);
    } catch (err: any) {
      console.error("[BackupSettings] Exception:", err);
      setError("バックアップ履歴の読み込みに失敗しました");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSaveSettings() {
    setIsSavingSettings(true);
    setError("");
    setSuccess("");

    try {
      console.log("[BackupSettings] Saving settings...");
      const result = await updateBackupSettings(
        isAutoBackupEnabled,
        autoBackupSchedule,
        retentionDays,
        backupDestination
      );

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setSettings(result.data);
      setSuccess("バックアップ設定を保存しました");
      console.log("[BackupSettings] Settings saved successfully");
    } catch (err: any) {
      setError(err.message ?? "設定の保存に失敗しました");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError("");
    setSuccess("");

    try {
      const result = await exportBackup();
      if ("error" in result) {
        setError(result.error);
        return;
      }

      // JSON をダウンロード
      const dataStr = JSON.stringify(result.data, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(
        `バックアップを作成しました: ${result.fileName} (${formatBytes(result.data.metadata.totalSize)})`
      );

      // 履歴をリロード
      setTimeout(() => loadBackupHistory(), 1000);
    } catch (err: any) {
      setError(err.message ?? "バックアップ作成に失敗しました");
    } finally {
      setExporting(false);
    }
  }

  function handleImportFile(file: File) {
    setImporting(true);
    setError("");
    setSuccess("");

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        setPendingRestoreData(content);
        setShowRestoreConfirm(true);
      } catch (err: any) {
        setError("ファイルの読み込みに失敗しました");
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
  }

  async function confirmRestore() {
    setImporting(true);
    setError("");
    setSuccess("");

    try {
      const result = await importBackup(pendingRestoreData);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      setSuccess(result.message);
      setShowRestoreConfirm(false);
      setPendingRestoreData("");

      // ページリロード
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setError(err.message ?? "復元に失敗しました");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-700 font-semibold mb-2">エラー</p>
            <p className="text-sm text-red-700 bg-red-100 p-2 rounded">{error}</p>
          </div>
        </div>
      )}

      {/* 成功メッセージ */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* バックアップ設定 */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <div className="flex items-start gap-3 mb-4">
          <Settings className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <h3 className="font-semibold text-indigo-900">バックアップ設定</h3>
        </div>

        {loadingSettings ? (
          <div className="flex items-center gap-2 text-indigo-700 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            設定を読み込み中...
          </div>
        ) : (
          <div className="space-y-4">
            {/* 自動バックアップ有効/無効 */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="autoBackupEnabled"
                checked={isAutoBackupEnabled}
                onChange={(e) => setIsAutoBackupEnabled(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="autoBackupEnabled" className="text-sm font-medium text-gray-900">
                自動バックアップを有効にする
              </label>
            </div>

            {/* 実行時刻 */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                <Clock className="w-4 h-4 inline mr-1" />
                実行時刻 (HH:mm)
              </label>
              <input
                type="time"
                value={autoBackupSchedule}
                onChange={(e) => setAutoBackupSchedule(e.target.value)}
                disabled={!isAutoBackupEnabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">毎日この時刻に自動バックアップが実行されます</p>
            </div>

            {/* 保持期間 */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                保持期間 (日数)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">この日数を超えたバックアップは自動削除されます (1-365日)</p>
            </div>

            {/* 保存先 */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">保存先</label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="radio"
                    name="destination"
                    value="google_drive"
                    checked={backupDestination === "google_drive"}
                    onChange={(e) => setBackupDestination(e.target.value)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1 font-medium text-gray-900">
                      <Cloud className="w-4 h-4" />
                      Google Drive（推奨）
                    </div>
                    <p className="text-xs text-gray-500">自動バックアップを Google Drive に保存（15GB 無料）</p>
                  </div>
                  <div>
                    {testingConnection && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    {!testingConnection && googleDriveConnected && <CheckCircle className="w-4 h-4 text-green-600" />}
                    {!testingConnection && googleDriveConnected === false && <AlertCircle className="w-4 h-4 text-red-600" />}
                  </div>
                </label>

                <label className="flex items-center gap-3 p-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="radio"
                    name="destination"
                    value="vercel_blob"
                    checked={backupDestination === "vercel_blob"}
                    onChange={(e) => setBackupDestination(e.target.value)}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="flex items-center gap-1 font-medium text-gray-900">
                      <Cloud className="w-4 h-4" />
                      クラウド (Vercel Blob)
                    </div>
                    <p className="text-xs text-gray-500">自動バックアップをクラウドに保存します</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="radio"
                    name="destination"
                    value="local_download"
                    checked={backupDestination === "local_download"}
                    onChange={(e) => setBackupDestination(e.target.value)}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="flex items-center gap-1 font-medium text-gray-900">
                      <Computer className="w-4 h-4" />
                      ローカル (手動ダウンロード)
                    </div>
                    <p className="text-xs text-gray-500">バックアップファイルを生成後、手動でダウンロード</p>
                  </div>
                </label>
              </div>
            </div>

            {/* 保存ボタン */}
            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="w-full bg-indigo-600 text-white rounded-lg px-4 py-2 font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSavingSettings ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                "設定を保存"
              )}
            </button>
          </div>
        )}
      </div>

      {/* エクスポート */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Download className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-1">バックアップのダウンロード</h3>
            <p className="text-sm text-blue-700 mb-3">
              現在のすべての申請人と案件情報をJSON形式でバックアップします。
            </p>
            <button
              onClick={handleExport}
              disabled={exporting || !!error}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                exporting
                  ? "bg-blue-200 text-blue-700 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                  バックアップ中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 inline mr-2" />
                  バックアップをダウンロード
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* インポート */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Upload className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-green-900 mb-1">バックアップを復元</h3>
            <p className="text-sm text-green-700 mb-3">
              保存したバックアップファイルから復元します。
              <strong>既存データは上書きされます。</strong>
            </p>
            <label>
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) handleImportFile(f);
                }}
                disabled={importing}
                className="hidden"
              />
              <span className={`inline-block px-4 py-2 rounded-lg font-medium text-sm transition-colors cursor-pointer ${
                importing
                  ? "bg-green-200 text-green-700 cursor-not-allowed"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}>
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 inline mr-2" />
                    ファイルを選択
                  </>
                )}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* バックアップ履歴 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            バックアップ履歴
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {loadingHistory ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
              読み込み中...
            </div>
          ) : history.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              バックアップがまだ作成されていません
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="px-4 py-3 hover:bg-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.fileName}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.createdAt).toLocaleString("ja-JP")}
                      </span>
                      {item.fileSize && (
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {formatBytes(item.fileSize)}
                        </span>
                      )}
                      {item.backupType === "automatic" && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          自動
                        </span>
                      )}
                    </div>
                    {item.applicantMasterCount !== null && (
                      <p className="text-xs text-gray-500 mt-2">
                        申請人: {item.applicantMasterCount}件 / 案件: {item.applicationsCount}件
                      </p>
                    )}
                  </div>
                  {item.fileUrl && (
                    <a
                      href={item.fileUrl}
                      download
                      className="px-3 py-1 text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                    >
                      ダウンロード
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 復元確認ダイアログ */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <h2 className="text-lg font-bold text-gray-900">復元の確認</h2>
            </div>

            <p className="text-sm text-gray-700 mb-6">
              バックアップから復元します。<strong>現在のすべてのデータが上書きされます。</strong>
              よろしいですか？
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRestoreConfirm(false)}
                disabled={importing}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={confirmRestore}
                disabled={importing}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                    復元中...
                  </>
                ) : (
                  "復元する"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 情報 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 space-y-2">
        <p>
          <strong>ヒント:</strong> バックアップファイルは安全な場所に保存してください。
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>手動バックアップはいつでも「バックアップをダウンロード」から実行できます</li>
          <li>バックアップには申請人マスターと案件情報がJSON形式で保存されます</li>
          <li>自動バックアップ設定は有効にすると毎日指定時刻に実行されます</li>
        </ul>
      </div>
    </div>
  );
}
