"use client";

import { ChevronDown, Clock, FileText, Eye, ExternalLink, CreditCard, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DocumentLink, isImageFile } from "./document-viewer";

interface HistoryItem {
  id: string;
  oldResidenceCardNumber: string | null;
  oldCurrentVisaExpiry: string | null;
  oldFileUrl: string | null;
  oldFileName: string | null;
  replacedAt: Date | string;
}

interface Props {
  histories: HistoryItem[];
}

export function ResidenceCardHistoryPanel({ histories }: Props) {
  if (histories.length === 0) return null;

  return (
    <details className="group bg-gray-50 border border-gray-200 rounded-xl">
      <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center justify-between text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          在留カードの変更履歴 {histories.length}件
        </span>
        <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-3 pt-1 space-y-2 border-t border-gray-100">
        {histories.map((h) => (
          <div
            key={h.id}
            className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
          >
            <span className="flex items-center gap-1 text-gray-400 flex-shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(h.replacedAt.toString())} 更新
            </span>
            <span className="flex items-center gap-1 text-gray-600">
              <CreditCard className="w-3.5 h-3.5 text-gray-400" />
              {h.oldResidenceCardNumber || "—"}
            </span>
            <span className="flex items-center gap-1 text-gray-600">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              {h.oldCurrentVisaExpiry ? formatDate(h.oldCurrentVisaExpiry) : "—"}
            </span>
            {h.oldFileUrl && h.oldFileName && (
              <DocumentLink
                url={h.oldFileUrl}
                fileName={h.oldFileName}
                documentType="residence_card_renewal"
                className="flex items-center gap-1 text-gray-500 hover:text-blue-600 ml-auto"
              >
                <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate max-w-[14rem]">{h.oldFileName}</span>
                {isImageFile(h.oldFileName) ? (
                  <Eye className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                )}
              </DocumentLink>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
