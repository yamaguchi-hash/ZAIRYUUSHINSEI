"use client";

import { BookOpen, CreditCard, Files } from "lucide-react";

/**
 * パスポート／在留カード／両方 をPDFで印刷するためのボタン群。
 * 申請人マスター詳細・申請案件詳細の両方から使用する。
 * 印刷ページ（/print-docs/[applicantId]）を新しいタブで開く。
 * 画像は申請人マスターにアップロード済みのパスポート・在留カード（表/裏）を使用。
 */
export function DocumentPrintButtons({ applicantId }: { applicantId: string }) {
  const open = (type: "passport" | "residence" | "both") => {
    window.open(`/print-docs/${applicantId}?type=${type}`, "_blank");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => open("passport")}
        className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
      >
        <BookOpen className="w-4 h-4" />
        パスポート印刷
      </button>
      <button
        type="button"
        onClick={() => open("residence")}
        className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
      >
        <CreditCard className="w-4 h-4" />
        在留カード印刷
      </button>
      <button
        type="button"
        onClick={() => open("both")}
        className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors"
      >
        <Files className="w-4 h-4" />
        両方印刷
      </button>
    </div>
  );
}
