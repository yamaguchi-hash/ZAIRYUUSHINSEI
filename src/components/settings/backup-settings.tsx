"use client";

import { useState, useEffect } from "react";
import { Download, Upload, AlertCircle, CheckCircle, Loader2, Calendar, HardDrive } from "lucide-react";
import { exportBackup, importBackup, fetchBackupHistory } from "@/actions/backup";
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

export function BackupSettings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState("");
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);

  useEffect(() => {
    loadBackupHistory();
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
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600">
        <p>
          <strong>ヒント:</strong> バックアップファイルは安全な場所に保存してください。
          自動バックアップは毎日 AM 2:00 に実行されます（最新30日分を保持）。
        </p>
      </div>
    </div>
  );
}
