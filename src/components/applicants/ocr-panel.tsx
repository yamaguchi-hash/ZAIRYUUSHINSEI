"use client";

import { useState, useTransition, useCallback } from "react";
import { ocrAndFillApplicant, getApplicantDocuments } from "@/actions/ocr";
import { DocumentUploadZone } from "./document-upload-zone";
import { DocumentLink, isImageFile } from "./document-viewer";
import {
  Sparkles, Loader2, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, FileText, Eye, ExternalLink, Clock, Plus, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

type DocType = "passport_data_page" | "residence_card_front" | "residence_card_back";

const PASSPORT_CONFIGS: { type: DocType; label: string; description: string }[] = [
  { type: "passport_data_page", label: "パスポート（顔写真ページ）", description: "氏名・番号・有効期限ページ" },
];

const RESIDENCE_CARD_CONFIGS: { type: DocType; label: string; description: string }[] = [
  { type: "residence_card_front", label: "在留カード（表面）", description: "氏名・在留資格・有効期限" },
  { type: "residence_card_back",  label: "在留カード（裏面）", description: "勤務先・住所変更記録" },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  passport_front: "パスポート（表紙）",
  passport_data_page: "パスポート（顔写真ページ）",
  residence_card_front: "在留カード（表面）",
  residence_card_back: "在留カード（裏面）",
  residence_card_renewal: "最新の在留カード",
};

// 在留カード更新時にアップロードされた書類（履歴として複数件たまる）
const RENEWAL_DOC_TYPE = "residence_card_renewal";

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
  // 裏面枠の表示制御（既存ドキュメントがある場合は初期表示）
  const [showBackSide, setShowBackSide] = useState(
    () => initialDocs.some(d => d.documentType === "residence_card_back")
  );

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

  const uploadedCount = docs.filter((d) => d.documentType !== RENEWAL_DOC_TYPE && d.documentType !== "passport_front").length;

  // 在留カード更新の履歴（複数アップロードされた場合、最新の1件のみメインに表示し、
  // それ以外は下部の折りたたみ履歴に回す）
  const renewalDocs = docs
    .filter((d) => d.documentType === RENEWAL_DOC_TYPE)
    .sort((a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime());
  const latestRenewal = renewalDocs[0] ?? null;
  const renewalHistory = renewalDocs.slice(1);

  const galleryDocs = [
    ...docs.filter((d) => d.documentType !== RENEWAL_DOC_TYPE && d.documentType !== "passport_front"),
    ...(latestRenewal ? [latestRenewal] : []),
  ];

  return (
    <div className="space-y-4">
      {/* ── Uploaded documents gallery ── */}
      {galleryDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Eye className="w-4 h-4 text-blue-500" />
              保存済み書類（クリックで閲覧）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {galleryDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
              >
                <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">
                    {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                  </p>
                  <DocumentLink
                    url={doc.fileUrl}
                    fileName={doc.fileName}
                    documentType={doc.documentType}
                    className="text-xs text-gray-500 hover:text-blue-600 truncate flex items-center gap-1 text-left"
                  >
                    <span className="truncate">{doc.fileName}</span>
                    {isImageFile(doc.fileName) ? (
                      <Eye className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    ) : (
                      <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    )}
                  </DocumentLink>
                </div>
                {doc.ocrProcessedAt ? (
                  <span className="flex-shrink-0 text-xs text-green-600 flex items-center gap-0.5">
                    <CheckCircle className="w-3 h-3" />OCR済
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-xs text-gray-400">未処理</span>
                )}
              </div>
            ))}
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
            {/* パスポートセクション */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                <span>📄</span> パスポート
              </p>
              {PASSPORT_CONFIGS.map((cfg) => (
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

            {/* 在留カードセクション */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                <span>🪪</span> 在留カード
              </p>

              {/* 表面（常に表示） */}
              <DocumentUploadZone
                applicantId={applicantId}
                documentType="residence_card_front"
                label={RESIDENCE_CARD_CONFIGS[0].label}
                description={RESIDENCE_CARD_CONFIGS[0].description}
                existingDoc={getDoc("residence_card_front")}
                onUploaded={refreshDocs}
              />

              {/* 裏面：ドキュメントが存在するか showBackSide が true の場合に表示 */}
              {(showBackSide || !!getDoc("residence_card_back")) ? (
                <div className="border-t border-dashed border-gray-200 pt-2 space-y-1.5">
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span>↳</span>
                    <span>裏面（勤務先・住所変更記録）</span>
                    {!getDoc("residence_card_back") && (
                      <button
                        type="button"
                        onClick={() => setShowBackSide(false)}
                        className="ml-auto text-gray-300 hover:text-gray-500 transition-colors"
                        title="裏面枠を閉じる"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <DocumentUploadZone
                    applicantId={applicantId}
                    documentType="residence_card_back"
                    label={RESIDENCE_CARD_CONFIGS[1].label}
                    description={RESIDENCE_CARD_CONFIGS[1].description}
                    existingDoc={getDoc("residence_card_back")}
                    onUploaded={refreshDocs}
                  />
                  {getDoc("residence_card_front") && getDoc("residence_card_back") && (
                    <p className="text-xs text-blue-500 flex items-center gap-1 bg-blue-50 rounded-lg px-2.5 py-1.5">
                      <Sparkles className="w-3 h-3 flex-shrink-0" />
                      表面・裏面の両方がそろいました — AIが2枚を同時解析します
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowBackSide(true)}
                  className="w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-xl py-2 text-xs text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  裏面を追加する
                </button>
              )}
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

      {/* ── 在留カードの履歴（目立たない折りたたみエリア） ── */}
      {renewalHistory.length > 0 && (
        <details className="group bg-gray-50 border border-gray-200 rounded-xl">
          <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center justify-between text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              過去の在留カード（履歴）{renewalHistory.length}件
            </span>
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-3 pt-1 space-y-1.5 border-t border-gray-100">
            {renewalHistory.map((doc) => (
              <DocumentLink
                key={doc.id}
                url={doc.fileUrl}
                fileName={doc.fileName}
                documentType={doc.documentType}
                className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-2.5 py-1.5 hover:border-blue-300 cursor-pointer transition-colors w-full text-left"
              >
                <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 truncate flex-1">{doc.fileName}</span>
                {doc.uploadedAt && (
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatDate(doc.uploadedAt.toString())}
                  </span>
                )}
                {isImageFile(doc.fileName) ? (
                  <Eye className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                )}
              </DocumentLink>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
