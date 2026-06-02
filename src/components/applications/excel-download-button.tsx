"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";

export function ExcelDownloadButton({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}/excel`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "エクセルの生成に失敗しました");
        return;
      }
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename\*=UTF-8''(.+)/);
      const name = m ? decodeURIComponent(m[1]) : "申請書.xlsx";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
        title="オンライン申請用エクセルをダウンロード（各フィールドをコピー＆ペーストして使用）"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
        {loading ? "作成中..." : "オンライン申請用Excel"}
      </button>
      {error && <p className="absolute top-10 left-0 z-10 text-xs text-red-500 bg-white border border-red-200 rounded px-2 py-1 shadow whitespace-nowrap">{error}</p>}
    </div>
  );
}
