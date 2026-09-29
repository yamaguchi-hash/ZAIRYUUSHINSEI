"use client";

import { ChevronDown, Clock, FileText, Eye, ExternalLink, Sparkles, RefreshCw, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DocumentLink, isImageFile } from "./document-viewer";

interface HistoryItem {
  id: string;
  changeType: string;           // "document_replaced" | "field_updated"
  source: string | null;        // "manual" | "ai_ocr"
  documentType: string | null;
  fieldKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  oldFileUrl: string | null;
  oldFileName: string | null;
  createdAt: Date | string;
}

interface Props {
  histories: HistoryItem[];
}

// マスター項目キー → 表示名
const FIELD_LABELS: Record<string, string> = {
  familyNameEn: "氏名（英・姓）",
  givenNameEn: "氏名（英・名）",
  familyNameJa: "氏名（漢字・姓）",
  givenNameJa: "氏名（漢字・名）",
  nationality: "国籍",
  dateOfBirth: "生年月日",
  gender: "性別",
  passportNumber: "パスポート番号",
  passportExpiry: "パスポート有効期限",
  residenceCardNumber: "在留カード番号",
  currentVisaType: "在留資格",
  currentVisaExpiry: "在留期限",
  japanAddress: "住所",
  postalCode: "郵便番号",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  passport_data_page: "パスポート（顔写真ページ）",
  residence_card_front: "在留カード（表面）",
  residence_card_back: "在留カード（裏面）",
  residence_card_renewal: "最新の在留カード",
};

export function UpdateHistoryPanel({ histories }: Props) {
  if (histories.length === 0) return null;

  return (
    <details className="group bg-gray-50 border border-gray-200 rounded-xl">
      <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center justify-between text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          更新履歴 {histories.length}件
        </span>
        <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-3 pt-1 space-y-2 border-t border-gray-100">
        {histories.map((h) => (
          <div
            key={h.id}
            className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs"
          >
            <span className="flex items-center gap-1 text-gray-400 flex-shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(h.createdAt.toString())}
            </span>

            {h.changeType === "document_replaced" ? (
              <>
                <span className="flex items-center gap-1 text-gray-700 font-medium">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                  {DOC_TYPE_LABELS[h.documentType ?? ""] ?? h.documentType ?? "書類"}を差し替え
                </span>
                {h.oldFileUrl && h.oldFileName && (
                  <DocumentLink
                    url={h.oldFileUrl}
                    fileName={h.oldFileName}
                    documentType={h.documentType ?? "document"}
                    className="flex items-center gap-1 text-gray-500 hover:text-blue-600 ml-auto"
                  >
                    <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate max-w-[12rem]">旧ファイル: {h.oldFileName}</span>
                    {isImageFile(h.oldFileName) ? (
                      <Eye className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    )}
                  </DocumentLink>
                )}
              </>
            ) : (
              <>
                <span className="text-gray-700 font-medium">
                  {FIELD_LABELS[h.fieldKey ?? ""] ?? h.fieldKey ?? "項目"}
                </span>
                <span className="flex items-center gap-1.5 text-gray-600 min-w-0">
                  <span className="text-gray-400 line-through truncate max-w-[10rem]">{h.oldValue || "（空）"}</span>
                  <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                  <span className="text-gray-800 font-medium truncate max-w-[10rem]">{h.newValue || "（空）"}</span>
                </span>
                {h.source === "ai_ocr" && (
                  <span className="flex items-center gap-0.5 text-purple-500 ml-auto flex-shrink-0">
                    <Sparkles className="w-3 h-3" />AI
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
