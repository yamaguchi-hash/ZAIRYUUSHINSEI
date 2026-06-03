"use client";

import { useState, useEffect } from "react";
import { Download, Upload, AlertCircle, CheckCircle, Loader2, Calendar, HardDrive, Settings, Clock, Trash2 } from "lucide-react";
import { exportBackup, importBackup, fetchBackupHistory, getBackupSettings, updateBackupSettings } from "@/actions/backup";
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

interface BackupSettings {
  id: string;
  tenantId: string;
  isAutoBackupEnabled: boolean;
  autoBackupSchedule: string;
  retentionDays: number;
  backupDestination: string;
  lastBackupAt: Date | string | null;
  lastBackupStatus: string | null;
  lastBackupError: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function BackupSettings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState("");
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [schedule, setSchedule] = useState("02:00");
  const [retention, setRetention] = useState(30);
  const [autoEnabled, setAutoEnabled] = useState(true);

  useEffect(() => {
    loadBackupHistory();
    loadSettings();
  }, []);

  async function loadBackupHistory() {
    setLoadingHistory(true);
    try {
      const result = await fetchBackupHistory();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setHistory(result.data || []);
    } catch (err: any) {
      setError("バックアップ履歴の読み込みに失敗しました");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadSettings() {
    setLoadingSettings(true);
    try {
      const result = await getBackupSettings();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSettings(result.data);
      setSchedule(result.data.autoBackupSchedule);
      setRetention(result.data.retentionDays);
      setAutoEnabled(result.data.isAutoBackupEnabled);
    } catch (err: any) {
      setError("バックアップ設定の読み込みに失敗しました");
    } finally {
      setLoadingSettings(false);
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setError("");
    setSuccess("");

    try {
      const result = await updateBackupSettings(autoEnabled, schedule, retention);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      setSettings(result.data);
      setSuccess(result.message);
    } catch (err: any) {
      setError(err.message ?? "設定の保存に失敗しました");
    } finally {
      setSavingSettings(false);
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
      {/* 自動バックアップ設定 */}
      {!loadingSettings && settings && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-indigo-900 mb-4">自動バックアップ設定</h3>

              <div className="space-y-4 bg-white rounded-lg p-4 border border-indigo-100">
                {/* 有効/無効 */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      自動バックアップ
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      毎日自動的にバックアップを取得します
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoEnabled}
                      onChange={(e) => setAutoEnabled(e.target.checked)}
                      disabled={savingSettings}
                      className="w-4 h-4 rounded"
                    />
                    <span className={`text-sm font-medium ${autoEnabled ? "text-green-600" : "text-gray-600"}`}>
                      {autoEnabled ? "有効" : "無効"}
                    </span>
                  </label>
                </div>

                {autoEnabled && (
                  <>
                    {/* スケジュール */}
                    <div className="pt-4 border-t border-gray-200">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Clock className="w-4 h-4 inline mr-1" />
                        バックアップ実行時刻
                      </label>
                      <input
                        type="time"
                        value={schedule}
                        onChange={(e) => setSchedule(e.target.value)}
                        disabled={savingSettings}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 disabled:bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        UTC時刻で設定してください
                      </p>
                    </div>

                    {/* 保持期間 */}
                    <div className="pt-4 border-t border-gray-200">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Trash2 className="w-4 h-4 inline mr-1" />
                        バックアップ保持期間
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={retention}
                          onChange={(e) => setRetention(parseInt(e.target.value))}
                          disabled={savingSettings}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 disabled:bg-gray-100"
                        />
                        <span className="text-sm text-gray-600">日間</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        この期間を超えたバックアップは自動削除されます
                      </p>
                    </div>

                    {/* 最後のバックアップ情報 */}
                    {settings.lastBackupAt && (
                      <div className="pt-4 border-t border-gray-200">
                        <p className="text-xs text-gray-600">
                          <strong>最後の実行:</strong> {new Date(settings.lastBackupAt).toLocaleString("ja-JP")}
                        </p>
                        {settings.lastBackupStatus === "success" && (
                          <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                            <CheckCircle className="w-3 h-3" /> 成功
                          </p>
                        )}
                        {settings.lastBackupStatus === "failed" && (
                          <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3 h-3" /> 失敗
                            {settings.lastBackupError && (
                              <span className="ml-1">({settings.lastBackupError})</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* 保存ボタン */}
                <div className="pt-4 border-t border-gray-200 flex gap-2">
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      savingSettings
                        ? "bg-indigo-200 text-indigo-700 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {savingSettings ? (
                      <>
                        <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      "設定を保存"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
              disabled={exporting}
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

      {/* メッセージ */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* 情報 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 space-y-2">
        <p>
          <strong>ヒント:</strong> バックアップファイルは安全な場所に保存してください。
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>手動バックアップはいつでも「バックアップをダウンロード」から実行できます</li>
          <li>自動バックアップの実行時刻と保持期間は上記の設定で変更できます</li>
          <li>自動バックアップは有効にすると、毎日指定時刻に自動実行されます</li>
          <li>バックアップには申請人マスターと案件情報がJSON形式で保存されます</li>
        </ul>
      </div>
    </div>
  );
}
