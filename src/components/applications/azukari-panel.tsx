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
  Inbox,
  Undo2,
  X,
  Lock,
} from "lucide-react";

type Kind = "原本" | "写し";
type AzukariStatus = "preparing" | "deposited" | "returned";

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
    residenceCardKind?: Kind;
    passportKind?: Kind;
    status?: AzukariStatus;
    depositedAt?: string;
    returnedAt?: string;
  };
}

const STATUS_LABELS: Record<AzukariStatus, { label: string; cls: string }> = {
  preparing: { label: "未発行", cls: "bg-gray-100 text-gray-600" },
  deposited: { label: "預かり中", cls: "bg-amber-100 text-amber-700" },
  returned:  { label: "返却済み", cls: "bg-green-100 text-green-700" },
};

const today = () => new Date().toISOString().slice(0, 10);

export function AzukariPanel({
  applicationId,
  applicationType,
  applicantName,
  existingImages,
  submissionInfo,
  savedData,
}: AzukariPanelProps) {
  // ── 預書は変更・更新申請のみ発行可能 ─────────────────────────────────
  const isEligibleType = applicationType === "change" || applicationType === "renewal";

  const [includePassport, setIncludePassport] = useState(savedData?.includePassport ?? false);
  const [residenceCardKind, setResidenceCardKind] = useState<Kind>(savedData?.residenceCardKind ?? "原本");
  const [passportKind, setPassportKind] = useState<Kind>(savedData?.passportKind ?? "原本");
  const [status, setStatus] = useState<AzukariStatus>(savedData?.status ?? "preparing");
  const [depositedAt, setDepositedAt] = useState(savedData?.depositedAt ?? "");
  const [returnedAt, setReturnedAt] = useState(savedData?.returnedAt ?? "");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const cardFrontUrl = existingImages.residenceCardFrontUrl ?? "";
  const cardBackUrl = existingImages.residenceCardBackUrl ?? "";
  const passportUrl = existingImages.passportUrl ?? "";
  const applicationDate = submissionInfo?.applicationDate ?? "";
  const applicationNumber = submissionInfo?.applicationNumber ?? "";

  const hasBothCards = !!cardFrontUrl && !!cardBackUrl;

  // ── 発行確定: 選択内容を保存して印刷画面を開く ─────────────────────────
  async function handleIssue() {
    setSaving(true);
    setError("");
    const nextStatus: AzukariStatus = status === "preparing" ? "deposited" : status;
    const nextDepositedAt = depositedAt || today();
    const result = await saveAzukariData(applicationId, {
      includePassport,
      residenceCardKind,
      passportKind,
      status: nextStatus,
      depositedAt: nextDepositedAt,
    });
    setSaving(false);
    if (result.success) {
      setStatus(nextStatus);
      setDepositedAt(nextDepositedAt);
      setShowConfirm(false);
      window.open(`/print/${applicationId}/azukari`, "_blank");
    } else {
      setError(result.error ?? "保存に失敗しました");
    }
  }

  // ── 返却済みとして記録 ─────────────────────────────────────────────
  async function handleMarkReturned() {
    setSaving(true);
    setError("");
    const date = returnedAt || today();
    const result = await saveAzukariData(applicationId, { status: "returned", returnedAt: date });
    setSaving(false);
    if (result.success) {
      setStatus("returned");
      setReturnedAt(date);
    } else {
      setError(result.error ?? "保存に失敗しました");
    }
  }

  // ── 対象外の申請タイプ ─────────────────────────────────────────────
  if (!isEligibleType) {
    return (
      <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
        <p>
          預書（パスポート及び在留カード預証）は、<span className="font-medium">在留資格変更許可申請</span>または
          <span className="font-medium">在留期間更新許可申請</span>の場合のみ発行できます。
          この案件（認定交付申請等）では利用できません。
        </p>
      </div>
    );
  }

  const statusBadge = STATUS_LABELS[status];

  return (
    <div className="space-y-4">
      {/* ── 預かり状況バッジ ─────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
        {status === "deposited" && depositedAt && (
          <span className="text-xs text-gray-500">預かり日: {depositedAt}</span>
        )}
        {status === "returned" && (
          <span className="text-xs text-gray-500">
            {depositedAt && `預かり日: ${depositedAt}　`}返却日: {returnedAt}
          </span>
        )}
      </div>

      {/* ── 在留カード画像（表・裏） ──────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "在留カード 表面", url: cardFrontUrl },
          { label: "在留カード 裏面", url: cardBackUrl },
        ].map(({ label, url }) => (
          <div key={label}>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              {label}
              {url ? (
                <span className="text-green-600 text-xs flex items-center gap-0.5">
                  <CheckCircle className="w-3 h-3" />取得済み
                </span>
              ) : (
                <span className="text-red-500 text-xs flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" />未アップロード
                </span>
              )}
            </label>
            {url ? (
              <img src={url} alt={label} className="w-full max-w-md rounded-lg border border-gray-200 shadow-sm" />
            ) : (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-4 text-center max-w-md">
                申請人マスターでアップロードしてください
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── パスポート画像（参考表示） ─────────────────── */}
      {passportUrl && includePassport && (
        <div>
          <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
            <BookOpen className="w-4 h-4 text-gray-500" />
            パスポート
          </label>
          <img src={passportUrl} alt="パスポート" className="w-full max-w-md rounded-lg border border-gray-200 shadow-sm" />
        </div>
      )}

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
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* ── ボタン群 ─────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            if (!hasBothCards) {
              setError("申請人マスターに在留カード表面・裏面をアップロードしてからご利用ください");
              return;
            }
            setError("");
            setShowConfirm(true);
          }}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          預証を発行・印刷
        </button>

        {status === "deposited" && (
          <div className="inline-flex items-center gap-2">
            <input
              type="date"
              value={returnedAt}
              onChange={(e) => setReturnedAt(e.target.value)}
              className="h-9 px-2 text-sm border border-gray-300 rounded-lg"
            />
            <button
              type="button"
              onClick={handleMarkReturned}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              返却済みとして記録
            </button>
          </div>
        )}
        {status === "returned" && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3.5 h-3.5" />
            お預かり書類は返却済みです（{returnedAt}）
          </span>
        )}
      </div>

      <p className="text-xs text-gray-400">
        ※在留カード・パスポートの画像は申請人マスターのアップロード書類から自動取得されます。<br />
        ※プレビュー画面をブラウザの印刷機能（Ctrl+P）でPDF保存できます。
      </p>

      {/* ── 発行前確認ポップアップ ─────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">お預かりする書類の確認</h3>
              <button onClick={() => setShowConfirm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                {applicantName} 様からお預かりする書類と区分を選択してください。選択内容に応じて預証のタイトル・本文が切り替わります。
              </p>

              {/* 在留カード（必須・解除不可） */}
              <div className="border rounded-lg p-3 bg-indigo-50/50 border-indigo-100">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <input type="checkbox" checked disabled className="rounded border-gray-300" />
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  在留カード
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600 bg-indigo-100 rounded px-1.5 py-0.5">
                    <Lock className="w-2.5 h-2.5" />必須
                  </span>
                </label>
                <div className="flex gap-4 mt-2 ml-6">
                  {(["原本", "写し"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="residenceCardKind"
                        checked={residenceCardKind === k}
                        onChange={() => setResidenceCardKind(k)}
                      />
                      {k}
                    </label>
                  ))}
                </div>
              </div>

              {/* パスポート（任意） */}
              <div className="border rounded-lg p-3 bg-gray-50 border-gray-200">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePassport}
                    onChange={(e) => setIncludePassport(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <BookOpen className="w-4 h-4 text-gray-500" />
                  パスポート
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-200 rounded px-1.5 py-0.5">任意</span>
                </label>
                <div className="flex gap-4 mt-2 ml-6">
                  {(["原本", "写し"] as const).map((k) => (
                    <label
                      key={k}
                      className={`flex items-center gap-1.5 text-sm ${includePassport ? "cursor-pointer" : "opacity-40"}`}
                    >
                      <input
                        type="radio"
                        name="passportKind"
                        checked={passportKind === k}
                        onChange={() => setPassportKind(k)}
                        disabled={!includePassport}
                      />
                      {k}
                    </label>
                  ))}
                </div>
              </div>

              {/* 預かり日 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">預かり日</label>
                <input
                  type="date"
                  value={depositedAt || today()}
                  onChange={(e) => setDepositedAt(e.target.value)}
                  className="h-9 px-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
                発行タイトル:{" "}
                <span className="font-semibold text-gray-800">
                  {includePassport ? "パスポート及び在留カード預証" : "在留カード預証"}
                </span>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleIssue}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Inbox className="w-4 h-4" />}
                {saving ? "保存中..." : "発行して印刷画面を開く"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
