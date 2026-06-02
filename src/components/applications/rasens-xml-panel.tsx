"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, Download, Trash2, FileCode2, Loader2,
  AlertCircle, CheckCircle, RefreshCw, Info,
} from "lucide-react";

interface RasensXmlEntry {
  id: string;
  filename: string;
  description: string;
  url: string;
  uploadedAt: string;
  fileSize: number;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export function RasensXmlPanel({ applicationId }: { applicationId: string }) {
  const [entries, setEntries] = useState<RasensXmlEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [desc, setDesc] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/rasens-xml`, { credentials: "same-origin" });
      const json = await res.json();
      if (json.entries) setEntries(json.entries);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [applicationId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(""); setSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("description", desc || file.name.replace(".xml", ""));
      const res = await fetch(`/api/applications/${applicationId}/rasens-xml`, {
        method: "POST", body: fd, credentials: "same-origin",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "アップロード失敗");
      setSuccess(`「${file.name}」を保存しました`);
      setDesc("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDownload(entry: RasensXmlEntry) {
    setDownloading(entry.id);
    try {
      const res = await fetch(entry.url);
      if (!res.ok) throw new Error("ダウンロード失敗");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.filename;   // ← 元のRASENS形式ファイル名で保存
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDelete(entry: RasensXmlEntry) {
    if (!confirm(`「${entry.filename}」を削除しますか？`)) return;
    setDeleting(entry.id);
    try {
      const res = await fetch(`/api/applications/${applicationId}/rasens-xml`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id }),
        credentials: "same-origin",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "削除失敗");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="border border-indigo-200 rounded-xl bg-indigo-50 overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-200 bg-indigo-100">
        <FileCode2 className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-semibold text-indigo-800">
          入管オンライン申請XML管理
        </span>
        <button onClick={load} className="ml-auto text-indigo-400 hover:text-indigo-600">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* 説明 */}
        <div className="flex items-start gap-2 bg-white border border-indigo-200 rounded-lg p-3 text-xs text-indigo-700">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
          <div>
            <p className="font-semibold mb-1">在留申請オンラインシステム（RASENS）との連携</p>
            <ol className="list-decimal list-inside space-y-0.5 text-indigo-600">
              <li>RASENSで申請書に入力し「申込データを保存」でXMLをダウンロード</li>
              <li>下の「RASENSのXMLを保存」でアップロードして管理</li>
              <li>次回更新時に「ダウンロード」→RASENSで「申込データ読込」</li>
            </ol>
            <p className="mt-1 text-amber-600 font-medium">
              ※ RASENSは実際の申請データが入ったXMLのみ読込可能です
            </p>
          </div>
        </div>

        {/* アップロードエリア */}
        <div className="bg-white border border-indigo-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">RASENSのXMLを保存</p>
          <input
            type="text"
            placeholder="説明（例：THAKURI SITA - 2026年更新）"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-indigo-400"
          />
          <input ref={inputRef} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "保存中..." : "RASENSのXMLを保存"}
          </button>
        </div>

        {/* フィードバック */}
        {success && (
          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* 保存済み一覧 */}
        {loading ? (
          <div className="text-center py-3 text-xs text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-3 text-xs text-gray-400">
            保存済みのRASENS XMLはありません
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500">保存済み ({entries.length}件)</p>
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-gray-800 truncate">
                    {entry.description || entry.filename}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {entry.filename} · {formatBytes(entry.fileSize)} · {formatDate(entry.uploadedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  {/* ダウンロード（元ファイル名で） */}
                  <button
                    onClick={() => handleDownload(entry)}
                    disabled={downloading === entry.id}
                    title={`「${entry.filename}」としてダウンロード→RASENSに読込可能`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
                  >
                    {downloading === entry.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Download className="w-3 h-3" />}
                    DL
                  </button>
                  {/* 削除 */}
                  <button
                    onClick={() => handleDelete(entry)}
                    disabled={deleting === entry.id}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    {deleting === entry.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
