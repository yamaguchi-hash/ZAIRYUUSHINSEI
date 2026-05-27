"use client";

import { useEffect } from "react";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

export function PrintTrigger({ applicationId }: { applicationId: string }) {
  // ページ読み込み後に自動で印刷ダイアログを開く
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm px-6 py-3 flex items-center justify-between">
      <Link
        href={`/applications/${applicationId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        申請案件に戻る
      </Link>
      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-500">印刷ダイアログが開きます。「PDFに保存」を選択してください。</p>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          <Printer className="w-4 h-4" />
          印刷 / PDFに保存
        </button>
      </div>
    </div>
  );
}
