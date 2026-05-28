"use client";

import { useState, useTransition, useCallback } from "react";
import { ocrAndFillApplicant, getApplicantDocuments } from "@/actions/ocr";
import { DocumentUploadZone } from "./document-upload-zone";
import { DocumentViewTrigger } from "./document-viewer";
import {
  Sparkles, Loader2, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, FileText, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

type DocType = "passport_front" | "passport_data_page" | "residence_card_front" | "residence_card_back";

const DOC_CONFIGS: { type: DocType; label: string; description: string }[] = [
  { type: "passport_front",     label: "パスポート（表紙）",         description: "表紙面" },
  { type: "passport_data_page", label: "パスポート（顔写真ページ）",  description: "氏名・番号・有効期限ページ" },
  { type: "residence_card_front", label: "在留カード（表面）",        description: "氏名・在留資格・有効期限" },
  { type: "residence_card_back",  label: "在留カード（裏面）",        description: "勤務先等" },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  passport_front: "パスポート（表紙）",
  passport_data_page: "パスポート（顔写真ページ）",
  residence_card_front: "在留カード（表面）",
  residence_card_back: "在留カード（裏面）",
};

interface DocItem {
  id: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  ocrProcessedAt: Date | string | null;
  uploadedAt?: Date | string;
}

interface OcrPanelProps {
  applicantId: string;
  initialDocs: DocItem[];
}

export function OcrPanel({ applicantId, initialDocs }: OcrPanelProps) {
  const [docs, setDocs] = useState<DocItem[]>(initialDocs);
  const [isPending, startTransition] = useTransition();
  const [ocrResult, setOcrResult] = useState<{ fields: string[]; extracted: Record<string, any> } | null>(null);
  const [ocrError, setOcrError] = useState("");
  const [uploadExpanded, setUploadExpanded] = useState(true);

  const refreshDocs = useCallback(() => {
    getApplicantDocuments(applicantId).then((d) =>
      setDocs(d.map((doc) => ({ ...doc })))
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
  const isPdf = (fileName: string) => fileName?.toLowerCase().endsWith(".pdf");

  return (
    <div className="space-y-4">
      {/* ── Uploaded documents gallery ── */}
      {docs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Eye className="w-4 h-4 text-blue-500" />
              保存済み書類（クリックで閲覧）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {docs.map((doc) => (
                <DocumentViewTrigger
                  key={doc.id}
                  url={doc.fileUrl}
                  fileName={doc.fileName}
                  documentType={doc.documentType}
                >
                  <div className="border border-gray-200 rounded-xl overflow-hidden hover:border-blue-400 hover:shadow-md transition-all group bg-gray-50">
                    {/* Thumbnail */}
                    <div className="aspect-[3/2] flex items-center justify-center bg-gray-100 relative">
                      {isPdf(doc.fileName) ? (
                        <div className="flex flex-col items-center gap-1 text-gray-400">
                          <FileText className="w-8 h-8" />
                          <span className="text-xs">PDF</span>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={doc.fileUrl}
                          alt={doc.fileName}
                          className="object-contain w-full h-full p-2"
                        />
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="bg-white rounded-full p-2 shadow">
                          <Eye className="w-4 h-4 text-blue-600" />
                        </div>
                      </div>
                    </div>
                    {/* Label */}
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-medium text-gray-700 truncate">
                        {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-400 truncate">{doc.fileName}</p>
                        {doc.ocrProcessedAt ? (
                          <span className="flex-shrink-0 text-xs text-green-600 flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" />OCR済
                          </span>
                        ) : (
                          <span className="flex-shrink-0 text-xs text-gray-400">未処理</span>
                        )}
                      </div>
                    </div>
                  </div>
                </DocumentViewTrigger>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Upload & OCR card ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-purple-500" />
              書類アップロード ＆ AI自動読み込み
            </CardTitle>
            <button
              onClick={() => setUploadExpanded((v) => !v)}
              className="text-gray-400 hover:text-gray-600"
            >
              {uploadExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            パスポート・在留カードをアップロードしてAIで自動読み込みすると、申請人マスターが自動更新されます。
          </p>
        </CardHeader>

        {uploadExpanded && (
          <CardContent className="space-y-5">
            {/* 2×2 upload grid */}
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

            {/* OCR button & results */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              {ocrResult && (
                <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-sm">
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">AIで自動入力しました</p>
                    <p className="text-xs mt-0.5 text-green-600">
                      更新項目: {ocrResult.fields.join("、")}
                    </p>
                  </div>
                </div>
              )}
              {ocrError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p>{ocrError}</p>
                    {ocrError.includes("GEMINI_API_KEY") && (
                      <p className="text-xs mt-1 text-red-500">
                        GEMINI_API_KEY を環境変数に設定してください。
                      </p>
                    )}
                    {ocrError.includes("BLOB") && (
                      <p className="text-xs mt-1 text-red-500">
                        Vercel Blob が接続されていません。Vercelダッシュボードから Storage → Blob を接続してください。
                      </p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleRunOcr}
                disabled={isPending || uploadedCount === 0}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gemini AIで読み込み中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    AIで自動読み込み・マスター更新
                    {uploadedCount > 0 && (
                      <span className="bg-purple-500 rounded-full px-1.5 py-0.5 text-xs ml-1">
                        {uploadedCount}件
                      </span>
                    )}
                  </>
                )}
              </button>

              {uploadedCount === 0 && (
                <p className="text-xs text-gray-400 text-center">
                  書類をアップロードすると自動読み込みができます
                </p>
              )}
            </div>

            {/* OCR extracted preview */}
            {ocrResult?.extracted && Object.keys(ocrResult.extracted).filter(k => ocrResult.extracted[k] != null).length > 0 && (
              <div className="border border-purple-100 bg-purple-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-purple-700 mb-2">📋 AIが読み取った情報</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(ocrResult.extracted).map(([k, v]) =>
                    v != null ? (
                      <div key={k} className="flex gap-1 min-w-0">
                        <dt className="text-purple-500 flex-shrink-0">{k}:</dt>
                        <dd className="text-purple-800 font-medium truncate">{String(v)}</dd>
                      </div>
                    ) : null
                  )}
                </dl>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
