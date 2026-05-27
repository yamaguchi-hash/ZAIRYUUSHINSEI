"use client";

import { useState } from "react";
import { saveApplicationDraft, generateApplicationFormDraft } from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileEdit, Save, RotateCcw, Loader2, Sparkles,
  ChevronDown, ChevronUp, Copy, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ApplicationDraftPanelProps {
  applicationId: string;
  draftData: Record<string, any> | null;
  currentStatus?: string;
  userRole?: string;
}

interface ContractDetails {
  salary?: string;
  workingHours?: string;
  workLocation?: string;
  contractPeriod?: string;
  contractType?: string;
}

export function ApplicationDraftPanel({
  applicationId,
  draftData,
  currentStatus,
  userRole,
}: ApplicationDraftPanelProps) {
  // ── すべての useState をトップに集約（Rules of Hooks） ──────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [draft, setDraft] = useState<Record<string, any>>(draftData ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isExpert = userRole === "expert" || userRole === "admin";
  const hasDraft = !!draftData;
  const contract: ContractDetails = draft.contractDetails ?? {};

  // ── ヘルパー関数 ────────────────────────────────────────────────────────────
  function updateField(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateContractField(key: string, value: string) {
    setDraft((prev) => ({
      ...prev,
      contractDetails: { ...(prev.contractDetails ?? {}), [key]: value },
    }));
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setGenError("");
    const result = await generateApplicationFormDraft(applicationId);
    if (result.success) {
      window.location.reload();
    } else {
      setGenError(result.error ?? "生成に失敗しました");
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveMessage("");
    try {
      const result = await saveApplicationDraft(applicationId, draft);
      setSaveMessage(result.success ? "✓ 保存しました" : `エラー: ${result.error}`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(""), 3000);
    }
  }

  async function handleRegenerate() {
    if (!confirm("AIで下書きを再生成します。現在の内容は上書きされます。よろしいですか？")) return;
    setIsRegenerating(true);
    setSaveMessage("");
    try {
      const result = await generateApplicationFormDraft(applicationId);
      if (result.success && result.draft) {
        setDraft(result.draft);
        setSaveMessage("✓ 再生成が完了しました");
      } else {
        setSaveMessage(`エラー: ${result.error}`);
      }
    } finally {
      setIsRegenerating(false);
      setTimeout(() => setSaveMessage(""), 4000);
    }
  }

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {}
  }

  const generatedAt = draft.generatedAt
    ? new Date(draft.generatedAt).toLocaleString("ja-JP")
    : null;

  // ── 未生成状態の表示 ────────────────────────────────────────────────────────
  if (!hasDraft) {
    return (
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-indigo-900">
            <FileEdit className="w-5 h-5 text-indigo-600" />
            申請書類　下書き
            <span className="ml-1 inline-flex items-center gap-1 text-xs font-normal text-indigo-500 bg-indigo-100 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" />AI自動作成
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
              <FileEdit className="w-7 h-7 text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              申請書類の下書きがまだ作成されていません
            </p>
            <p className="text-xs text-gray-400 mb-5">
              ボタンをクリックすると、アップロード済み書類をAIが読み込み<br />
              申請理由書・業務内容・契約詳細などを自動作成します
            </p>
            {genError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {genError}
              </p>
            )}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-6 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />AIが生成中...</>
              ) : (
                <><Sparkles className="w-4 h-4" />AIで申請書類の下書きを作成</>
              )}
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── 生成済み：編集パネルの表示 ───────────────────────────────────────────────
  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-indigo-900">
            <FileEdit className="w-5 h-5 text-indigo-600" />
            申請書類　下書き
            <span className="ml-1 inline-flex items-center gap-1 text-xs font-normal text-indigo-500 bg-indigo-100 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" />AI生成
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {generatedAt && (
              <span className="text-xs text-gray-400 hidden sm:block">
                生成日時：{generatedAt}
              </span>
            )}
            <button
              onClick={() => setIsExpanded((v) => !v)}
              className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {!isExpanded && (
          <p className="text-xs text-gray-500 mt-1">
            申請理由書・業務内容・契約詳細のAI下書きが含まれています。クリックして展開してください。
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-5">
          {/* ① 申請理由 */}
          <DraftSection
            title="① 申請理由"
            description="申請に至った経緯・目的・日本滞在の必要性"
            value={draft.applicationReason ?? ""}
            onChange={(v) => updateField("applicationReason", v)}
            onCopy={() => copyToClipboard(draft.applicationReason ?? "", "applicationReason")}
            copied={copiedField === "applicationReason"}
            rows={5}
            readOnly={!isExpert}
          />

          {/* ② 業務内容 */}
          <DraftSection
            title="② 業務内容"
            description="具体的な職務内容・担当業務・使用技術・スキル"
            value={draft.jobDescription ?? ""}
            onChange={(v) => updateField("jobDescription", v)}
            onCopy={() => copyToClipboard(draft.jobDescription ?? "", "jobDescription")}
            copied={copiedField === "jobDescription"}
            rows={6}
            readOnly={!isExpert}
          />

          {/* ③ 契約内容 */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">③ 契約内容</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "salary",         label: "契約年収 / 月収" },
                { key: "contractType",   label: "雇用形態" },
                { key: "workingHours",   label: "勤務時間" },
                { key: "workLocation",   label: "勤務地" },
                { key: "contractPeriod", label: "雇用期間" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input
                    type="text"
                    value={(contract as Record<string, string>)[key] ?? ""}
                    onChange={(e) => updateContractField(key, e.target.value)}
                    readOnly={!isExpert}
                    className={cn(
                      "w-full text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300",
                      isExpert
                        ? "bg-white border-gray-300 text-gray-900"
                        : "bg-gray-50 border-gray-200 text-gray-700 cursor-default"
                    )}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ④ 学歴・職歴・資格 */}
          <DraftSection
            title="④ 学歴・職歴・資格"
            description="申請人の経歴・在留資格との関連性"
            value={draft.qualificationsAndBackground ?? ""}
            onChange={(v) => updateField("qualificationsAndBackground", v)}
            onCopy={() => copyToClipboard(draft.qualificationsAndBackground ?? "", "qualifications")}
            copied={copiedField === "qualifications"}
            rows={4}
            readOnly={!isExpert}
          />

          {/* ⑤ 特記事項 */}
          <DraftSection
            title="⑤ 特記事項"
            description="添付書類の補足・審査官へのアピールポイントなど"
            value={draft.additionalNotes ?? ""}
            onChange={(v) => updateField("additionalNotes", v)}
            onCopy={() => copyToClipboard(draft.additionalNotes ?? "", "additionalNotes")}
            copied={copiedField === "additionalNotes"}
            rows={3}
            readOnly={!isExpert}
          />

          {/* 保存・再生成ボタン */}
          {isExpert && (
            <div className="flex items-center justify-between pt-2 border-t border-indigo-100">
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating || isSaving}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
              >
                {isRegenerating
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RotateCcw className="w-4 h-4" />}
                AIで再生成
              </button>
              <div className="flex items-center gap-3">
                {saveMessage && (
                  <span className={cn(
                    "text-xs",
                    saveMessage.startsWith("エラー") ? "text-red-600" : "text-green-600"
                  )}>
                    {saveMessage}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving || isRegenerating}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存
                </button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── テキストエリアセクション ──────────────────────────────────────────────────
function DraftSection({
  title,
  description,
  value,
  onChange,
  onCopy,
  copied,
  rows,
  readOnly,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  onCopy: () => void;
  copied: boolean;
  rows: number;
  readOnly: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-sm font-semibold text-gray-700">{title}</p>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
          title="クリップボードにコピー"
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {copied ? "コピー済み" : "コピー"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        rows={rows}
        className={cn(
          "w-full text-sm border rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-300 leading-relaxed",
          readOnly
            ? "bg-gray-50 border-gray-200 text-gray-700 cursor-default"
            : "bg-white border-gray-300 text-gray-900"
        )}
      />
    </div>
  );
}
