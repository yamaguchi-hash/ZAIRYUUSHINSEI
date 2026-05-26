"use client";

import { useState, useTransition, useCallback } from "react";
import { ocrAndFillApplicant, getApplicantDocuments } from "@/actions/ocr";
import { DocumentUploadZone } from "./document-upload-zone";
import { Sparkles, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DocType = "passport_front" | "passport_data_page" | "residence_card_front" | "residence_card_back";

const DOC_CONFIGS: { type: DocType; label: string; description: string }[] = [
  { type: "passport_front", label: "パスポート（表紙）", description: "表紙面の写真" },
  { type: "passport_data_page", label: "パスポート（顔写真ページ）", description: "氏名・番号・有効期限が記載されたページ" },
  { type: "residence_card_front", label: "在留カード（表面）", description: "氏名・在留資格・有効期限が記載された面" },
  { type: "residence_card_back", label: "在留カード（裏面）", description: "勤務先等が記載された面" },
];

interface OcrPanelProps {
  applicantId: string;
  initialDocs: Array<{
    id: string;
    documentType: string;
    fileUrl: string;
    fileName: string;
    ocrProcessedAt: Date | string | null;
  }>;
}

export function OcrPanel({ applicantId, initialDocs }: OcrPanelProps) {
  const [docs, setDocs] = useState<typeof initialDocs>(initialDocs);
  const [isPending, startTransition] = useTransition();
  const [ocrResult, setOcrResult] = useState<{ fields: string[]; extracted: Record<string, any> } | null>(null);
  const [ocrError, setOcrError] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);

  const refreshDocs = useCallback(() => {
    getApplicantDocuments(applicantId).then((d) =>
      setDocs(
        d.map((doc) => ({
          ...doc,
          ocrProcessedAt: doc.ocrProcessedAt,
        }))
      )
    );
  }, [applicantId]);

  function getDoc(type: DocType) {
    const d = docs.find((d) => d.documentType === type);
    if (!d) return null;
    return {
      id: d.id,
      fileUrl: d.fileUrl,
      fileName: d.fileName,
      ocrProcessedAt: d.ocrProcessedAt ? d.ocrProcessedAt.toString() : null,
    };
  }

  function handleRunOcr() {
    setOcrError("");
    setOcrResult(null);
    startTransition(async () => {
      try {
        const result = await ocrAndFillApplicant(applicantId);
        setOcrResult({ fields: result.updatedFields, extracted: result.extracted });
        refreshDocs();
      } catch (err: any) {
        setOcrError(err.message ?? "OCR処理に失敗しました");
      }
    });
  }

  const uploadedCount = docs.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-purple-500" />
            書類アップロード ＆ AI自動読み込み
          </CardTitle>
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          パスポート・在留カードをアップロードしてAIで自動読み込みすると、申請人マスターが自動更新されます。
        </p>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Upload zones: 2x2 grid */}
          <div className="grid grid-cols-2 gap-4">
            {DOC_CONFIGS.map((cfg) => (
              <DocumentUploadZone
                key={cfg.type}
                applicantId={applicantId}
                documentType={cfg.type}
                label={cfg.label}
                description={cfg.description}
                existingDoc={getDoc(cfg.type)}
                onUploaded={refreshDocs}
              />
            ))}
          </div>

          {/* OCR button */}
          <div className="border-t border-gray-100 pt-4">
            {ocrResult && (
              <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-3 text-sm">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">AIで自動入力しました</p>
                  <p className="text-xs mt-0.5 text-green-600">
                    更新された項目: {ocrResult.fields.join("、")}
                  </p>
                </div>
              </div>
            )}
            {ocrError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-3 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p>{ocrError}</p>
                  {ocrError.includes("GEMINI_API_KEY") && (
                    <p className="text-xs mt-1 text-red-500">
                      .env.local の GEMINI_API_KEY を設定し、サーバーを再起動してください。
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleRunOcr}
              disabled={isPending || uploadedCount === 0}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AIで読み込み中...（しばらくお待ちください）
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AIで自動読み込み・マスター更新
                  {uploadedCount > 0 && (
                    <span className="ml-1 bg-purple-500 rounded-full px-1.5 py-0.5 text-xs">
                      {uploadedCount}件
                    </span>
                  )}
                </>
              )}
            </button>

            {uploadedCount === 0 && (
              <p className="text-xs text-gray-400 text-center mt-2">
                書類をアップロードすると自動読み込みができます
              </p>
            )}
          </div>

          {/* Extracted data preview */}
          {ocrResult?.extracted && Object.keys(ocrResult.extracted).length > 0 && (
            <div className="border border-purple-100 bg-purple-50 rounded-xl p-4">
              <p className="text-xs font-medium text-purple-700 mb-2">AIが読み取った情報</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(ocrResult.extracted).map(([k, v]) => (
                  v != null && (
                    <div key={k} className="flex gap-1">
                      <dt className="text-purple-500 flex-shrink-0">{k}:</dt>
                      <dd className="text-purple-800 font-medium truncate">{String(v)}</dd>
                    </div>
                  )
                ))}
              </dl>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
