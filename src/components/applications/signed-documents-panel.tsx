"use client";

import { useState } from "react";
import { Loader2, Upload, Download, Trash2, File, CheckCircle } from "lucide-react";

interface SignedDoc {
  url: string;
  fileName: string;
  uploadedAt: string;
}

interface Props {
  applicationId: string;
  signedDocs?: SignedDoc[];
  applicationStatus?: string;
}

export function SignedDocumentsPanel({
  applicationId,
  signedDocs = [],
  applicationStatus,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const isCompleted = applicationStatus === "completed";

  async function handleUpload(file: File) {
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/applications/${applicationId}/upload-signed-document`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("ファイルアップロードに失敗しました");
      }

      // アップロード成功後、ページをリロード
      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docUrl: string) {
    if (!confirm("この署名済み申請書を削除しますか？")) return;

    try {
      const response = await fetch(`/api/applications/${applicationId}/delete-signed-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: docUrl }),
      });

      if (!response.ok) {
        throw new Error("削除に失敗しました");
      }

      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "削除に失敗しました");
    }
  }

  return (
    <div className="border border-teal-200 rounded-xl bg-teal-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-teal-200 bg-teal-100">
        <CheckCircle className="w-4 h-4 text-teal-700" />
        <span className="text-sm font-semibold text-teal-800">署名済み申請書</span>
        {signedDocs.length > 0 && (
          <span className="ml-auto text-xs text-teal-600">{signedDocs.length}件</span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-teal-600">
          顧客から署名を貰った申請書類（PDF）をアップロードして保存します。
        </p>

        {/* アップロード */}
        {!isCompleted && (
          <label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) handleUpload(f);
              }}
              disabled={uploading}
              className="hidden"
            />
            <span className={`block text-center py-2 px-3 rounded-lg cursor-pointer text-xs font-medium transition-colors ${
              uploading
                ? "bg-teal-200 text-teal-700"
                : "bg-teal-100 text-teal-700 hover:bg-teal-200"
            }`}>
              {uploading
                ? <>アップロード中...</>
                : <><Upload className="w-3.5 h-3.5 inline mr-1" />PDF をアップロード</>}
            </span>
          </label>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* ドキュメント一覧 */}
        {signedDocs.length > 0 && (
          <div className="bg-white border border-teal-100 rounded-lg divide-y divide-teal-100">
            {signedDocs.map((doc) => (
              <div key={doc.url} className="flex items-center justify-between p-3 hover:bg-teal-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <File className="w-4 h-4 text-teal-600 shrink-0" />
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-teal-600 hover:underline truncate"
                      title={doc.fileName}
                    >
                      {doc.fileName}
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(doc.uploadedAt).toLocaleString("ja-JP")}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <a
                    href={doc.url}
                    download
                    title="ダウンロード"
                    className="p-1.5 text-gray-400 hover:text-teal-600 rounded transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  {!isCompleted && (
                    <button
                      onClick={() => handleDelete(doc.url)}
                      title="削除"
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {signedDocs.length === 0 && !uploading && (
          <p className="text-xs text-gray-400 text-center py-4">
            まだアップロードされていません
          </p>
        )}
      </div>
    </div>
  );
}
