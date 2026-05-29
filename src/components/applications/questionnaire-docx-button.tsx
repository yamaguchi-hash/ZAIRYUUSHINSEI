"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";

export function QuestionnaireDocxButton({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}/questionnaire-docx`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "ドキュメントの生成に失敗しました");
        return;
      }
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename\*=UTF-8''(.+)/);
      const name = m ? decodeURIComponent(m[1]) : "質問書.docx";
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
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
        title="空欄項目の質問書をWordファイルでダウンロード（Googleドキュメントでも開けます）"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {loading ? "作成中..." : "質問書（Googleドキュメント用）"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
