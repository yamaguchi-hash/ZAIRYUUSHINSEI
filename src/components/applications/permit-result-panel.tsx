"use client";

import { useState } from "react";
import { completeWithPermit, uploadNewResidenceCard } from "@/actions/applications";
import { Trophy, Loader2, CheckCircle, CreditCard, Calendar, Upload, FileUp } from "lucide-react";

interface Props {
  applicationId: string;
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

export function PermitResultPanel({
  applicationId,
  applicationType,
  currentVisaType,
  desiredVisaType,
  resultData,
}: Props) {
  const needsCard = NEEDS_NEW_CARD.includes(applicationType);

  const [permittedDate, setPermittedDate] = useState(resultData?.permittedDate ?? "");
  const [newCardNumber, setNewCardNumber] = useState(resultData?.newCardNumber ?? "");
  const [newVisaExpiry, setNewVisaExpiry] = useState(resultData?.newVisaExpiry ?? "");
  const [newVisaType,   setNewVisaType]   = useState(resultData?.newVisaType   ?? desiredVisaType ?? currentVisaType ?? "");
  const [cardImageUrl, setCardImageUrl] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error,   setError]   = useState("");

  const isCompleted = !!resultData?.completedAt;

  async function handleUploadCard(file: File) {
    setUploading(true);
    setError("");
    const result = await uploadNewResidenceCard(applicationId, file);
    setUploading(false);
    if (result.success) {
      setCardImageUrl(result.url ?? "");
      // アップロード成功後のUI更新
    } else {
      setError(result.error ?? "画像アップロードに失敗しました");
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

            {/* 新在留カード画像アップロード */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                新在留カード画像（参照用）
              </label>
              <div className="flex items-center gap-2">
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0];
                      if (f) handleUploadCard(f);
                    }}
                    disabled={uploading}
                    className="hidden"
                  />
                  <span className={`block text-center py-2 px-3 rounded-lg cursor-pointer text-xs font-medium transition-colors ${
                    uploading
                      ? "bg-emerald-200 text-emerald-700"
                      : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  }`}>
                    {uploading
                      ? <>アップロード中...</>
                      : <><FileUp className="w-3.5 h-3.5 inline mr-1" />画像を選択</>}
                  </span>
                </label>
              </div>
              {cardImageUrl && (
                <p className="text-xs text-emerald-600 mt-2">✓ 画像がアップロードされました</p>
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
              ※ 入力した情報は申請人マスターの「在留カード番号」「在留有効期限」「在留資格」に自動反映されます
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
