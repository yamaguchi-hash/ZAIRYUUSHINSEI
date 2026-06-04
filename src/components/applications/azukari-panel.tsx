"use client";

import { useState, useRef } from "react";
import { saveAzukariData } from "@/actions/applications";
import {
  Upload,
  CreditCard,
  BookOpen,
  Save,
  Loader2,
  CheckCircle,
  X,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";

interface AzukariPanelProps {
  applicationId: string;
  applicationType: string;
  applicantName: string;
  savedData?: {
    residenceCardFrontUrl?: string;
    residenceCardBackUrl?: string;
    passportUrl?: string;
    includePassport?: boolean;
    applicationDate?: string;
    applicationNumber?: string;
  };
}

type ImageType = "residence_card_front" | "residence_card_back" | "passport";

export function AzukariPanel({
  applicationId,
  applicationType,
  applicantName,
  savedData,
}: AzukariPanelProps) {
  const [cardFrontUrl, setCardFrontUrl] = useState(savedData?.residenceCardFrontUrl ?? "");
  const [cardBackUrl, setCardBackUrl] = useState(savedData?.residenceCardBackUrl ?? "");
  const [passportUrl, setPassportUrl] = useState(savedData?.passportUrl ?? "");
  const [includePassport, setIncludePassport] = useState(savedData?.includePassport ?? false);
  const [applicationDate, setApplicationDate] = useState(savedData?.applicationDate ?? "");
  const [applicationNumber, setApplicationNumber] = useState(savedData?.applicationNumber ?? "");

  const [uploading, setUploading] = useState<ImageType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!savedData?.residenceCardFrontUrl);
  const [error, setError] = useState("");

  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const passportRef = useRef<HTMLInputElement>(null);

  // ── 画像アップロード ─────────────────────────────────────────────────
  async function handleUpload(imageType: ImageType, file: File) {
    setUploading(imageType);
    setError("");
    setSaved(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("imageType", imageType);

      const res = await fetch(`/api/applications/${applicationId}/upload-azukari-image`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "アップロードに失敗しました");
      }

      const { url } = await res.json();
      if (imageType === "residence_card_front") setCardFrontUrl(url);
      else if (imageType === "residence_card_back") setCardBackUrl(url);
      else if (imageType === "passport") setPassportUrl(url);
    } catch (e: any) {
      setError(e.message ?? "アップロードエラー");
    } finally {
      setUploading(null);
    }
  }

  function onFileChange(imageType: ImageType, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(imageType, file);
    e.target.value = "";
  }

  // ── 保存 ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!cardFrontUrl) {
      setError("在留カード表面の画像をアップロードしてください");
      return;
    }
    if (!cardBackUrl) {
      setError("在留カード裏面の画像をアップロードしてください");
      return;
    }
    setSaving(true);
    setError("");
    const result = await saveAzukariData(applicationId, {
      residenceCardFrontUrl: cardFrontUrl,
      residenceCardBackUrl: cardBackUrl,
      passportUrl: includePassport ? passportUrl : undefined,
      includePassport,
      applicationDate,
      applicationNumber,
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
    if (!cardFrontUrl || !cardBackUrl) {
      setError("在留カード表面・裏面の両方をアップロードしてからプレビューしてください");
      return;
    }
    // 最新データで先に保存してからプレビューを開く
    handleSave().then(() => {
      window.open(`/print/${applicationId}/azukari`, "_blank");
    });
  }

  const canPreview = !!cardFrontUrl && !!cardBackUrl;

  return (
    <div className="space-y-5">
      {/* ── 在留カード表面（必須）───────────────────────────────── */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
          <CreditCard className="w-4 h-4 text-indigo-600" />
          在留カード 表面
          <span className="text-red-500 text-xs">（必須）</span>
        </label>
        {cardFrontUrl ? (
          <div className="relative group">
            <img
              src={cardFrontUrl}
              alt="在留カード表面"
              className="w-full max-w-md rounded-lg border border-gray-200 shadow-sm"
            />
            <button
              onClick={() => { setCardFrontUrl(""); setSaved(false); }}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title="削除"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => frontRef.current?.click()}
            disabled={uploading === "residence_card_front"}
            className="flex items-center justify-center gap-2 w-full max-w-md h-32 border-2 border-dashed border-indigo-300 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {uploading === "residence_card_front" ? (
              <><Loader2 className="w-5 h-5 animate-spin" />アップロード中...</>
            ) : (
              <><Upload className="w-5 h-5" />在留カード表面をアップロード</>
            )}
          </button>
        )}
        <input ref={frontRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFileChange("residence_card_front", e)} />
      </div>

      {/* ── 在留カード裏面（必須）───────────────────────────────── */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
          <CreditCard className="w-4 h-4 text-indigo-600" />
          在留カード 裏面
          <span className="text-red-500 text-xs">（必須）</span>
        </label>
        {cardBackUrl ? (
          <div className="relative group">
            <img
              src={cardBackUrl}
              alt="在留カード裏面"
              className="w-full max-w-md rounded-lg border border-gray-200 shadow-sm"
            />
            <button
              onClick={() => { setCardBackUrl(""); setSaved(false); }}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title="削除"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => backRef.current?.click()}
            disabled={uploading === "residence_card_back"}
            className="flex items-center justify-center gap-2 w-full max-w-md h-32 border-2 border-dashed border-indigo-300 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {uploading === "residence_card_back" ? (
              <><Loader2 className="w-5 h-5 animate-spin" />アップロード中...</>
            ) : (
              <><Upload className="w-5 h-5" />在留カード裏面をアップロード</>
            )}
          </button>
        )}
        <input ref={backRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFileChange("residence_card_back", e)} />
      </div>

      {/* ── パスポート（任意）─────────────────────────────────── */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
          <input
            type="checkbox"
            checked={includePassport}
            onChange={(e) => { setIncludePassport(e.target.checked); setSaved(false); }}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <BookOpen className="w-4 h-4 text-gray-500" />
          パスポートも含める
          <span className="text-gray-400 text-xs font-normal">（任意）</span>
        </label>
        {includePassport && (
          <div className="ml-6">
            {passportUrl ? (
              <div className="relative group">
                <img
                  src={passportUrl}
                  alt="パスポート"
                  className="w-full max-w-md rounded-lg border border-gray-200 shadow-sm"
                />
                <button
                  onClick={() => { setPassportUrl(""); setSaved(false); }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="削除"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => passportRef.current?.click()}
                disabled={uploading === "passport"}
                className="flex items-center justify-center gap-2 w-full max-w-md h-32 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {uploading === "passport" ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />アップロード中...</>
                ) : (
                  <><Upload className="w-5 h-5" />パスポートをアップロード</>
                )}
              </button>
            )}
            <input ref={passportRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFileChange("passport", e)} />
          </div>
        )}
      </div>

      {/* ── 申請情報入力 ─────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">申請情報</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">申請受付日</label>
            <input
              type="date"
              value={applicationDate}
              onChange={(e) => { setApplicationDate(e.target.value); setSaved(false); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">申請受付番号</label>
            <input
              type="text"
              value={applicationNumber}
              onChange={(e) => { setApplicationNumber(e.target.value); setSaved(false); }}
              placeholder="例：阪オンＥＮ25006057"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 bg-white"
            />
          </div>
        </div>
      </div>

      {/* ── エラー ───────────────────────────────────────────── */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* ── ボタン群 ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
          ) : (
            <><Save className="w-4 h-4" />保存</>
          )}
        </button>

        <button
          type="button"
          onClick={handlePreview}
          disabled={!canPreview || saving}
          className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          預証をプレビュー・印刷
        </button>

        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3.5 h-3.5" />保存済み
          </span>
        )}
      </div>

      <p className="text-xs text-gray-400">
        ※プレビュー画面をブラウザの印刷機能（Ctrl+P）でPDF保存できます。
      </p>
    </div>
  );
}
