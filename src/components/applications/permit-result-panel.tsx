"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeWithPermit } from "@/actions/applications";
import { previewResidenceCardRenewal, confirmResidenceCardRenewal, getApplicantDocuments } from "@/actions/ocr";
import { DocumentLink, isImageFile } from "@/components/applicants/document-viewer";
import {
  Trophy, Loader2, CheckCircle, AlertCircle, CreditCard, Calendar,
  Upload, FileText, Eye, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  applicationId: string;
  /** 申請人マスターのID（新在留カードのAI解析・マスター更新に使用） */
  applicantId: string;
  applicationType: string;   // change / renewal / certification / etc.
  /** 申請人の現在の在留資格（希望する在留資格で更新） */
  currentVisaType?: string;
  desiredVisaType?: string;
  /** 既に完了していればその結果を表示 */
  resultData?: {
    permittedDate?: string;
    newCardNumber?: string;
    newVisaExpiry?: string;
    newVisaType?: string;
    completedAt?: string;
  };
}

// 更新・変更申請は新カード更新が必要
const NEEDS_NEW_CARD = ["renewal", "change", "extension"];

// アップロードを許可するファイル形式（画像 + PDF）
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp",
  "image/heic", "image/heif", "application/pdf",
];
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|pdf)$/i;

function isAllowedCardFile(file: File): boolean {
  if (file.type && ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) return true;
  return ALLOWED_EXTENSIONS.test(file.name);
}

interface RenewalDoc {
  id: string;
  fileUrl: string;
  fileName: string;
  uploadedAt?: Date | string | null;
}

export function PermitResultPanel({
  applicationId,
  applicantId,
  applicationType,
  currentVisaType,
  desiredVisaType,
  resultData,
}: Props) {
  const router = useRouter();
  const needsCard = NEEDS_NEW_CARD.includes(applicationType);

  const [permittedDate, setPermittedDate] = useState(resultData?.permittedDate ?? "");
  const [newCardNumber, setNewCardNumber] = useState(resultData?.newCardNumber ?? "");
  const [newVisaExpiry, setNewVisaExpiry] = useState(resultData?.newVisaExpiry ?? "");
  const [newVisaType,   setNewVisaType]   = useState(resultData?.newVisaType   ?? desiredVisaType ?? currentVisaType ?? "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  // ── 新在留カードのドロップインアップロード（AI解析・自動リネーム・マスター更新） ──
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardError, setCardError] = useState("");
  const [cardSuccess, setCardSuccess] = useState("");
  const [renewalDocs, setRenewalDocs] = useState<RenewalDoc[]>([]);

  const isCompleted = !!resultData?.completedAt;

  const refreshRenewalDocs = useCallback(() => {
    getApplicantDocuments(applicantId)
      .then((docs) => {
        setRenewalDocs(
          docs
            .filter((d) => d.documentType === "residence_card_renewal")
            .sort((a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime())
        );
      })
      .catch(() => {});
  }, [applicantId]);

  useEffect(() => {
    if (needsCard) refreshRenewalDocs();
  }, [needsCard, refreshRenewalDocs]);

  async function handleCardFile(file: File) {
    setCardError("");
    setCardSuccess("");

    // ── ファイル形式バリデーション（画像 + PDF のみ許可） ──
    if (!isAllowedCardFile(file)) {
      setCardError("画像ファイル（JPEG / PNG / WebP等）またはPDFファイルのみアップロードできます");
      return;
    }

    setIsProcessing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "アップロードに失敗しました");
      }
      const { url, fileName, fileSize, mimeType } = await res.json();

      // AI抽出エンジンで在留カード番号・在留期限を解析
      const extracted = await previewResidenceCardRenewal(url, mimeType);

      // 解析結果を申請人マスターへ即時反映し、ファイルを自動リネームして保存
      await confirmResidenceCardRenewal(applicantId, {
        residenceCardNumber: extracted.residenceCardNumber,
        currentVisaExpiry: extracted.currentVisaExpiry,
        fileUrl: url,
        fileName,
        fileSize,
        mimeType,
        raw: extracted.raw,
      });

      if (extracted.residenceCardNumber) setNewCardNumber(extracted.residenceCardNumber);
      if (extracted.currentVisaExpiry) setNewVisaExpiry(extracted.currentVisaExpiry);

      setCardSuccess("新しい在留カードを読み取り、申請人マスターを更新しました");
      refreshRenewalDocs();
      router.refresh();
    } catch (err: any) {
      setCardError(err.message ?? "処理に失敗しました");
    } finally {
      setIsProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleComplete() {
    if (!permittedDate) {
      setError("許可日を入力してください");
      return;
    }
    setSaving(true);
    setError("");

    const result = await completeWithPermit(applicationId, {
      permittedDate,
      newCardNumber: newCardNumber || undefined,
      newVisaExpiry: newVisaExpiry || undefined,
      newVisaType:   newVisaType   || undefined,
    });

    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "完了処理に失敗しました");
    }
    // 成功時はstatus=completedになり自動リロードされる（revalidatePath）
  }

  // 完了済み表示
  if (isCompleted) {
    return (
      <div className="border border-emerald-200 rounded-xl bg-emerald-50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-100 border-b border-emerald-200">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-800">⑧ 申請完了</span>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500 text-xs">許可日</span><p className="font-medium">{resultData?.permittedDate || "—"}</p></div>
          {needsCard && (
            <>
              <div><span className="text-gray-500 text-xs">新在留カード番号</span><p className="font-medium">{resultData?.newCardNumber || "—"}</p></div>
              <div><span className="text-gray-500 text-xs">新在留期限</span><p className="font-medium">{resultData?.newVisaExpiry || "—"}</p></div>
              <div><span className="text-gray-500 text-xs">新在留資格</span><p className="font-medium">{resultData?.newVisaType || "—"}</p></div>
            </>
          )}
          <div className="col-span-2"><span className="text-gray-500 text-xs">完了日時</span><p className="font-medium text-xs">{resultData?.completedAt ? new Date(resultData.completedAt).toLocaleString("ja-JP") : "—"}</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-emerald-200 rounded-xl bg-emerald-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-200 bg-emerald-100">
        <Trophy className="w-4 h-4 text-emerald-700" />
        <span className="text-sm font-semibold text-emerald-800">⑧ 許可・完了処理</span>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-emerald-700">
          許可通知を受け取ったら許可日を記録してください。
          {needsCard && " 更新・変更申請の場合は新しい在留カード情報を入力して申請人マスターを更新します。"}
        </p>

        {/* 許可日 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            許可日 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={permittedDate}
            onChange={e => setPermittedDate(e.target.value)}
            className="w-48 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 bg-white"
          />
        </div>

        {/* 新在留カード情報（更新・変更のみ） */}
        {needsCard && (
          <div className="border border-emerald-200 rounded-lg p-3 bg-white space-y-3">
            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              新しい在留カード情報（申請人マスターに反映されます）
            </p>

            {/* 新在留カードのドロップインアップロード */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 space-y-2">
              <label className="block text-xs font-semibold text-gray-700">
                新しい在留カード（更新後）の画像・PDF
              </label>

              <div
                className={cn(
                  "border-2 border-dashed rounded-xl py-6 px-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors text-center",
                  isDragging ? "border-emerald-400 bg-emerald-100" : "border-emerald-200 bg-white hover:border-emerald-300 hover:bg-emerald-50",
                  isProcessing && "pointer-events-none opacity-60"
                )}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleCardFile(file);
                }}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
                    <p className="text-sm font-medium text-emerald-700">AIで解析・自動保存中...</p>
                    <p className="text-xs text-gray-400">在留カード番号・在留期限を読み取り、申請人マスターを更新しています</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-7 h-7 text-emerald-300" />
                    <p className="text-sm font-medium text-gray-600">
                      新しい在留カード（更新後）をここにドラッグ＆ドロップ
                    </p>
                    <p className="text-xs text-gray-400">またはクリックしてファイルを選択（JPEG / PNG / WebP / PDF・10MB以下）</p>
                  </>
                )}
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) handleCardFile(f);
                }}
              />

              {cardError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {cardError}
                </div>
              )}
              {cardSuccess && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg p-2 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> {cardSuccess}
                </div>
              )}

              {/* 保存済みの最新在留カード（ファイル名表示のみ・クリックで閲覧） */}
              {renewalDocs.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">保存済みの在留カード</p>
                  {renewalDocs.map((doc) => (
                    <DocumentLink
                      key={doc.id}
                      url={doc.fileUrl}
                      fileName={doc.fileName}
                      documentType="residence_card_renewal"
                      className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-2.5 py-1.5 hover:border-emerald-300 cursor-pointer transition-colors w-full text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 truncate flex-1">{doc.fileName}</span>
                      {isImageFile(doc.fileName) ? (
                        <Eye className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      )}
                    </DocumentLink>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">新在留カード番号</label>
                <input
                  type="text"
                  value={newCardNumber}
                  onChange={e => setNewCardNumber(e.target.value)}
                  placeholder="例：AB12345678CD"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">新在留期限</label>
                <input
                  type="date"
                  value={newVisaExpiry}
                  onChange={e => setNewVisaExpiry(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">新在留資格</label>
                <input
                  type="text"
                  value={newVisaType}
                  onChange={e => setNewVisaType(e.target.value)}
                  placeholder="例：家族滞在"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 bg-white"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              ※ 在留カードをアップロードするとAIが自動解析し、上記の番号・在留期限と申請人マスターを即時更新します。手動での修正も可能です。
            </p>
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleComplete}
          disabled={saving}
          className="inline-flex items-center gap-2 h-10 px-5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 rounded-lg transition-colors"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" />処理中...</>
            : <><CheckCircle className="w-4 h-4" />許可日を記録して完了</>}
        </button>
      </div>
    </div>
  );
}
