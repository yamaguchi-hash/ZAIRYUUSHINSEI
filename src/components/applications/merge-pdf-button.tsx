"use client";

import { useState } from "react";
import { FolderArchive, Loader2 } from "lucide-react";

interface Props {
  applicationId: string;
}

export function MergePdfButton({ applicationId }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}/merge-pdf`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "PDF作成に失敗しました");
        return;
      }
      // ファイル名をレスポンスヘッダから取得
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      const fileName = match ? decodeURIComponent(match[1]) : "添付書類一括.pdf";

      // Blob としてダウンロード
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "ネットワークエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        title="提出済み書類（写真除く）をPDF一括出力します"
      >
        {isLoading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <FolderArchive className="w-4 h-4" />
        }
        {isLoading ? "PDF作成中..." : "添付書類一括PDF"}
      </button>
      {error && (
        <p className="text-xs text-red-500 max-w-[200px]">{error}</p>
      )}
    </div>
  );
}
