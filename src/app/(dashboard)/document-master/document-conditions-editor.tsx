"use client";

/**
 * 必要書類マスターの1行に紐づく「適用条件」エディタ（conditions jsonb列を編集）。
 * 技術・人文知識・国際業務｜在留期間更新許可申請の自動チェックリスト（GijinkokuRenewalChecklist）
 * が読む GijinkokuRenewalConditions 形状を編集する。他の在留資格・申請種別の行にも
 * 同じ仕組みを流用できるが、条件の意味（カテゴリー・派遣等）は技人国更新を想定している。
 */
import { useState } from "react";
import { Plus, Trash2, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import type { GijinkokuRenewalConditions, ConditionMatch } from "@/lib/gijinkoku-renewal-checklist";

const CATEGORY_OPTIONS = [1, 2, 3, 4];

/** 3値トグル（問わない／はい／いいえ）。undefined = 条件の対象外（問わない） */
function TriState({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
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
              value === o.v ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryChecks({ value, onChange }: { value: number[] | undefined; onChange: (v: number[] | undefined) => void }) {
  const selected = new Set(value ?? []);
  function toggle(c: number) {
    const next = new Set(selected);
    if (next.has(c)) next.delete(c); else next.add(c);
    onChange(next.size === 0 ? undefined : Array.from(next).sort());
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-gray-600">所属機関カテゴリー</span>
      <div className="flex items-center gap-1">
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            className={`w-6 h-6 rounded text-[11px] font-medium border transition-colors ${
              selected.has(c) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="text-[10px] text-gray-400 ml-1">{selected.size === 0 ? "問わない" : ""}</span>
      </div>
    </div>
  );
}

function MatchEditor({ value, onChange }: { value: ConditionMatch | undefined; onChange: (v: ConditionMatch | undefined) => void }) {
  const v = value ?? {};
  function patch(p: Partial<ConditionMatch>) {
    const next = { ...v, ...p };
    // 全項目が未設定なら undefined に戻す（「常に該当」を表す）
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, val]) => val !== undefined));
    onChange(Object.keys(cleaned).length === 0 ? undefined : (cleaned as ConditionMatch));
  }
  return (
    <div className="space-y-0.5">
      <CategoryChecks value={v.orgCategoryIn} onChange={(orgCategoryIn) => patch({ orgCategoryIn })} />
      <TriState label="派遣契約に基づく就労" value={v.dispatchWork} onChange={(dispatchWork) => patch({ dispatchWork })} />
      <TriState label="カテゴリー3・4の会社へ転職後、初めての更新" value={v.firstUpdateAfterTransfer} onChange={(firstUpdateAfterTransfer) => patch({ firstUpdateAfterTransfer })} />
      <TriState label="主に言語能力を用いる対人業務への変更" value={v.changeToLanguageWork} onChange={(changeToLanguageWork) => patch({ changeToLanguageWork })} />
      <TriState label="写真提出の例外に該当" value={v.photoException} onChange={(photoException) => patch({ photoException })} />
    </div>
  );
}

export function ConditionsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const c: GijinkokuRenewalConditions = (value ?? {}) as GijinkokuRenewalConditions;
  const hasWhen = !!c.when;

  function patch(p: Partial<GijinkokuRenewalConditions>) {
    const next = { ...c, ...p };
    // 空オブジェクトになったら null に戻す（DB上は「条件なし・共通書類」を意味する）
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
          hasWhen ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
        }`}
      >
        <SlidersHorizontal className="w-3 h-3" />
        {hasWhen ? "条件あり（自動チェックリスト）" : "適用条件を設定（自動チェックリスト用）"}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 bg-indigo-50/40 border border-indigo-100 rounded-lg p-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1">この書類を表示する条件（未設定＝常に表示・共通書類）</p>
            <MatchEditor value={c.when} onChange={(when) => patch({ when })} />
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1">「不要」表示にする条件（該当していても不要とする場合）</p>
            <MatchEditor value={c.exemptWhen} onChange={(exemptWhen) => patch({ exemptWhen })} />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">なぜ必要か（条件付きの場合の理由表示）</label>
            <input
              value={c.reason ?? ""}
              onChange={(e) => patch({ reason: e.target.value || undefined })}
              placeholder="例: 派遣契約に基づく就労のため"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-gray-500">要件文の出し分け（例: カテゴリーごとに文言を変える）</p>
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center gap-0.5 text-[11px] text-indigo-600 hover:text-indigo-800"
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
                    <CategoryChecks
                      value={variant.when?.orgCategoryIn}
                      onChange={(orgCategoryIn) => updateVariant(idx, { when: { ...variant.when, orgCategoryIn } })}
                    />
                    <div className="flex items-center gap-1">
                      <input
                        value={variant.text}
                        onChange={(e) => updateVariant(idx, { text: e.target.value })}
                        placeholder="この条件のときの提出要件・補足文"
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400"
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
