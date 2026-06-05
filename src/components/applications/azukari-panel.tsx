"use client";

import { useState } from "react";
import { saveAzukariData } from "@/actions/applications";
import {
  CreditCard,
  BookOpen,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Save,
} from "lucide-react";

interface AzukariPanelProps {
  applicationId: string;
  applicationType: string;
  applicantName: string;
  /** 申請人マスターにアップロード済みの書類画像URL */
  existingImages: {
    residenceCardFrontUrl?: string;
    residenceCardBackUrl?: string;
    passportUrl?: string;
  };
  /** ⑦申請日・申請番号の記録（draftData._submission） */
  submissionInfo?: {
    applicationDate?: string;
    applicationNumber?: string;
  };
  /** 保存済みの預証データ（draftData._azukari） */
  savedData?: {
    includePassport?: boolean;
  };
}

export function AzukariPanel({
  applicationId,
  applicationType,
  applicantName,
  existingImages,
  submissionInfo,
  savedData,
}: AzukariPanelProps) {
  const [includePassport, setIncludePassport] = useState(savedData?.includePassport ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!savedData);
  const [error, setError] = useState("");

  const cardFrontUrl = existingImages.residenceCardFrontUrl ?? "";
  const cardBackUrl = existingImages.residenceCardBackUrl ?? "";
  const passportUrl = existingImages.passportUrl ?? "";
  const applicationDate = submissionInfo?.applicationDate ?? "";
  const applicationNumber = submissionInfo?.applicationNumber ?? "";

  const hasBothCards = !!cardFrontUrl && !!cardBackUrl;
  const hasPassport = !!passportUrl;

  // ── 保存（includePassportのトグル状態だけ保存） ─────────────────────
  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await saveAzukariData(applicationId, {
      includePassport,
    });
    setSaving(false);
    if (result.success) {
      setSaved(true);
    } else {
      setError(result.error ?? "保存に失敗しました");
    }
  }

  // ── 預証プレビューを開く ─────────────────────────────────────────────
  function handlePreview() {
    if (!hasBothCards) {
      setError("申請人マスターに在留カード表面・裏面をアップロードしてからご利用ください");
      return;
    }
    // トグル状態を保存してからプレビュー
    handleSave().then(() => {
      window.open(`/print/${applicationId}/azukari`, "_blank");
    });
  }

  return (
    <div className="space-y-4">
      {/* ── 在留カード表面 ──────────────────────────── */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
          <CreditCard className="w-4 h-4 text-indigo-600" />
          在留カード 表面
          {cardFrontUrl ? (
            <span className="text-green-600 text-xs flex items-center gap-0.5">
              <CheckCircle className="w-3 h-3" />取得済み
            </span>
          ) : (
            <span className="text-red-500 text-xs flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" />未アップロード
            </span>
          )}
        </label>
        {cardFrontUrl ? (
          <img
            src={cardFrontUrl}
            alt="在留カード表面"
            className="w-full max-w-md rounded-lg border border-gray-200 shadow-sm"
          />
        ) : (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-4 text-center max-w-md">
            申請人マスターで在留カード表面をアップロードしてください
          </p>
        )}
      </div>

      {/* ── 在留カード裏面 ──────────────────────────── */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
          <CreditCard className="w-4 h-4 text-indigo-600" />
          在留カード 裏面
          {cardBackUrl ? (
            <span className="text-green-600 text-xs flex items-center gap-0.5">
              <CheckCircle className="w-3 h-3" />取得済み
            </span>
          ) : (
            <span className="text-red-500 text-xs flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" />未アップロード
            </span>
          )}
        </label>
        {cardBackUrl ? (
          <img
            src={cardBackUrl}
            alt="在留カード裏面"
            className="w-full max-w-md rounded-lg border border-gray-200 shadow-sm"
          />
        ) : (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-4 text-center max-w-md">
            申請人マスターで在留カード裏面をアップロードしてください
          </p>
        )}
      </div>

      {/* ── パスポート（任意トグル）──────────────────── */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
          <input
            type="checkbox"
            checked={includePassport}
            onChange={(e) => { setIncludePassport(e.target.checked); setSaved(false); }}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            disabled={!hasPassport}
          />
          <BookOpen className="w-4 h-4 text-gray-500" />
          パスポートも含める
          {hasPassport ? (
            <span className="text-green-600 text-xs flex items-center gap-0.5">
              <CheckCircle className="w-3 h-3" />取得済み
            </span>
          ) : (
            <span className="text-gray-400 text-xs">（未アップロード）</span>
          )}
        </label>
        {includePassport && passportUrl && (
          <div className="ml-6">
            <img
              src={passportUrl}
              alt="パスポート"
              className="w-full max-w-md rounded-lg border border-gray-200 shadow-sm"
            />
          </div>
        )}
      </div>

      {/* ── 申請情報（自動引用） ─────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">申請情報（⑦から自動引用）</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">申請受付日</label>
            <div className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              {applicationDate || <span className="text-gray-400">未記録</span>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">申請受付番号</label>
            <div className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              {applicationNumber || <span className="text-gray-400">未記録</span>}
            </div>
          </div>
        </div>
        {!applicationDate && !applicationNumber && (
          <p className="text-xs text-amber-600 mt-2">
            ※「⑦ 申請日・申請番号の記録」で入力すると自動的に反映されます。
          </p>
        )}
      </div>

      {/* ── エラー ───────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* ── ボタン群 ─────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!hasBothCards || saving}
          className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 rounded-lg transition-colors"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" />準備中...</>
          ) : (
            <><ExternalLink className="w-4 h-4" />預証をプレビュー・印刷</>
          )}
        </button>

        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3.5 h-3.5" />設定保存済み
          </span>
        )}
      </div>

      <p className="text-xs text-gray-400">
        ※在留カード・パスポートの画像は申請人マスターのアップロード書類から自動取得されます。<br />
        ※プレビュー画面をブラウザの印刷機能（Ctrl+P）でPDF保存できます。
      </p>
    </div>
  );
}
