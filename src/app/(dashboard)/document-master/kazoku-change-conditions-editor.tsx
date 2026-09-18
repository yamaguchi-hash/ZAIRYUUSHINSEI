"use client";

/**
 * 必要書類マスターの1行に紐づく「適用条件」エディタ（conditions jsonb列を編集）。
 * 家族滞在｜在留資格変更許可申請の自動チェックリスト（KazokuChangeOfStatusChecklist）
 * が読む KazokuChangeConditions 形状を編集する。
 * family-stay-conditions-editor.tsx（家族滞在・COE用）と同じ操作感で、
 * 身分関係書類の選択肢とアラート項目（マイナンバー省略）のみ異なる。
 */
import { useState } from "react";
import { Plus, Trash2, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import type { ConditionMatch, KazokuChangeConditions, Relationship, SupporterIncomeType, IdentityDocKey, FinancialProofKey } from "@/lib/kazoku-change-of-status-checklist";
import { RELATIONSHIP_LABELS, SUPPORTER_INCOME_TYPE_LABELS, IDENTITY_DOC_LABELS, FINANCIAL_PROOF_LABELS } from "@/lib/kazoku-change-of-status-checklist";

/** 3値セレクト（問わない／選択肢…）の共通UI */
function TriSelect<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T | undefined; options: [T, string][]; onChange: (v: T | undefined) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-gray-600">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
        className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600"
      >
        <option value="">問わない</option>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
}

function TriBool({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const opts: { v: boolean | undefined; t: string }[] = [
    { v: undefined, t: "問わない" }, { v: true, t: "はい" }, { v: false, t: "いいえ" },
  ];
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="inline-flex rounded border border-gray-200 overflow-hidden flex-shrink-0">
        {opts.map((o) => (
          <button
            key={o.t}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-2 py-1 text-[11px] font-medium transition-colors ${
              value === o.v ? "bg-rose-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchEditor({ value, onChange }: { value: ConditionMatch | undefined; onChange: (v: ConditionMatch | undefined) => void }) {
  const v = value ?? {};
  function patch(p: Partial<ConditionMatch>) {
    const next = { ...v, ...p };
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, val]) => val !== undefined));
    onChange(Object.keys(cleaned).length === 0 ? undefined : (cleaned as ConditionMatch));
  }
  return (
    <div className="space-y-0.5">
      <TriSelect<Relationship> label="続柄" value={v.relationship} options={Object.entries(RELATIONSHIP_LABELS) as [Relationship, string][]} onChange={(relationship) => patch({ relationship })} />
      <TriSelect<SupporterIncomeType> label="扶養者の収入状況" value={v.supporterIncomeType} options={Object.entries(SUPPORTER_INCOME_TYPE_LABELS) as [SupporterIncomeType, string][]} onChange={(supporterIncomeType) => patch({ supporterIncomeType })} />
      <TriSelect<IdentityDocKey> label="身分関係を証する書類（選択時）" value={v.identityDocs} options={Object.entries(IDENTITY_DOC_LABELS) as [IdentityDocKey, string][]} onChange={(identityDocs) => patch({ identityDocs })} />
      <TriSelect<FinancialProofKey> label="資力を証する資料（選択時）" value={v.financialProofDocs} options={Object.entries(FINANCIAL_PROOF_LABELS) as [FinancialProofKey, string][]} onChange={(financialProofDocs) => patch({ financialProofDocs })} />
      <TriBool label="写真提出の例外に該当" value={v.photoException} onChange={(photoException) => patch({ photoException })} />
    </div>
  );
}

export function KazokuChangeConditionsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const c: KazokuChangeConditions = (value ?? {}) as KazokuChangeConditions;
  const hasWhen = !!c.when;

  function patch(p: Partial<KazokuChangeConditions>) {
    const next = { ...c, ...p };
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, val]) => val !== undefined));
    onChange(Object.keys(cleaned).length === 0 ? null : cleaned);
  }

  function addVariant() {
    const variants = c.requirementVariants ?? [];
    patch({ requirementVariants: [...variants, { when: {}, text: "" }] });
  }
  function updateVariant(idx: number, p: Partial<{ when: ConditionMatch | undefined; text: string }>) {
    const variants = [...(c.requirementVariants ?? [])];
    variants[idx] = { ...variants[idx], ...p } as { when: ConditionMatch; text: string };
    patch({ requirementVariants: variants });
  }
  function removeVariant(idx: number) {
    const variants = (c.requirementVariants ?? []).filter((_, i) => i !== idx);
    patch({ requirementVariants: variants.length ? variants : undefined });
  }

  return (
    <div className="border-t border-dashed border-gray-200 mt-2 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 text-[11px] font-medium rounded px-2 py-1 ${
          hasWhen ? "text-rose-600 bg-rose-50 hover:bg-rose-100" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
        }`}
      >
        <SlidersHorizontal className="w-3 h-3" />
        {hasWhen ? "条件あり（自動チェックリスト）" : "適用条件を設定（自動チェックリスト用）"}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 bg-rose-50/40 border border-rose-100 rounded-lg p-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1">この書類を表示する条件（未設定＝常に表示・共通書類）</p>
            <MatchEditor value={c.when} onChange={(when) => patch({ when })} />
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1">「不要」表示にする条件（該当していても不要とする場合）</p>
            <MatchEditor value={c.exemptWhen} onChange={(exemptWhen) => patch({ exemptWhen })} />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={!!c.optional} onChange={(e) => patch({ optional: e.target.checked || undefined })} />
            該当する場合「必須」ではなく「任意・推奨」として表示する
          </label>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">なぜ必要か（条件付きの場合の理由表示）</label>
            <input
              value={c.reason ?? ""}
              onChange={(e) => patch({ reason: e.target.value || undefined })}
              placeholder="例: 扶養者が収入を伴う活動をしているため"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-rose-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">有効期限の注意書き</label>
              <input
                value={c.validityNote ?? ""}
                onChange={(e) => patch({ validityNote: e.target.value || undefined })}
                placeholder="例: 発行から3ヶ月以内のもの"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-rose-400"
              />
            </div>
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={!!c.translationRequired} onChange={(e) => patch({ translationRequired: e.target.checked || undefined })} />
                日本語訳が必要
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={!!c.myNumberExcluded} onChange={(e) => patch({ myNumberExcluded: e.target.checked || undefined })} />
                マイナンバー省略
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-gray-500">要件文の出し分け（条件ごとに文言を変える）</p>
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center gap-0.5 text-[11px] text-rose-600 hover:text-rose-800"
              >
                <Plus className="w-3 h-3" />追加
              </button>
            </div>
            {(c.requirementVariants ?? []).length === 0 ? (
              <p className="text-[11px] text-gray-400">未設定（通常の注意事項欄の文言がそのまま使われます）</p>
            ) : (
              <div className="space-y-2">
                {(c.requirementVariants ?? []).map((variant, idx) => (
                  <div key={idx} className="bg-white border border-gray-100 rounded p-2 space-y-1">
                    <MatchEditor value={variant.when} onChange={(when) => updateVariant(idx, { when })} />
                    <div className="flex items-center gap-1">
                      <input
                        value={variant.text}
                        onChange={(e) => updateVariant(idx, { text: e.target.value })}
                        placeholder="この条件のときの提出要件・補足文"
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-rose-400"
                      />
                      <button type="button" onClick={() => removeVariant(idx)} className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
