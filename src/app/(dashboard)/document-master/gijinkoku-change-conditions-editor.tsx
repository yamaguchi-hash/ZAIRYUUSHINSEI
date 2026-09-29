"use client";

/**
 * 必要書類マスターの1行に紐づく「適用条件」エディタ（conditions jsonb列を編集）。
 * 技術・人文知識・国際業務｜在留資格変更許可申請の自動チェックリスト
 * （GijinkokuChangeOfStatusChecklist）が読む GijinkokuChangeConditions 形状を編集する。
 * document-conditions-editor.tsx（技人国・更新用）と同じ操作感で、入力次元のみ異なる。
 */
import { useState } from "react";
import { Plus, Trash2, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import type { ConditionMatch, GijinkokuChangeConditions, EduBackground } from "@/lib/gijinkoku-change-of-status-checklist";
import { EDU_BACKGROUND_LABELS } from "@/lib/gijinkoku-change-of-status-checklist";

const CATEGORY_OPTIONS = [1, 2, 3, 4];
const EDU_BACKGROUND_OPTIONS = Object.entries(EDU_BACKGROUND_LABELS) as [EduBackground, string][];

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
              value === o.v ? "bg-teal-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
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
              selected.has(c) ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
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

function EduBackgroundChecks({ value, onChange }: { value: EduBackground[] | undefined; onChange: (v: EduBackground[] | undefined) => void }) {
  const selected = new Set(value ?? []);
  function toggle(e: EduBackground) {
    const next = new Set(selected);
    if (next.has(e)) next.delete(e); else next.add(e);
    onChange(next.size === 0 ? undefined : Array.from(next));
  }
  return (
    <div className="py-1">
      <span className="text-xs text-gray-600 block mb-1">学歴・職歴区分{selected.size === 0 ? "（問わない）" : ""}</span>
      <div className="flex flex-wrap gap-1">
        {EDU_BACKGROUND_OPTIONS.map(([v, t]) => (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
              selected.has(v) ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t}
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
    // 全項目が未設定なら undefined に戻す（「常に該当」を表す）
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, val]) => val !== undefined));
    onChange(Object.keys(cleaned).length === 0 ? undefined : (cleaned as ConditionMatch));
  }
  return (
    <div className="space-y-0.5">
      <CategoryChecks value={v.orgCategoryIn} onChange={(orgCategoryIn) => patch({ orgCategoryIn })} />
      <EduBackgroundChecks value={v.eduBackgroundIn} onChange={(eduBackgroundIn) => patch({ eduBackgroundIn })} />
      <TriState label="派遣契約に基づく就労" value={v.dispatchWork} onChange={(dispatchWork) => patch({ dispatchWork })} />
      <TriState label="主に言語能力を用いる対人業務" value={v.changeToLanguageWork} onChange={(changeToLanguageWork) => patch({ changeToLanguageWork })} />
      <TriState label="写真提出の例外に該当" value={v.photoException} onChange={(photoException) => patch({ photoException })} />
    </div>
  );
}

export function GijinkokuChangeConditionsEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown> | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const c: GijinkokuChangeConditions = (value ?? {}) as GijinkokuChangeConditions;
  const hasWhen = !!c.when;

  function patch(p: Partial<GijinkokuChangeConditions>) {
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
          hasWhen ? "text-teal-600 bg-teal-50 hover:bg-teal-100" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
        }`}
      >
        <SlidersHorizontal className="w-3 h-3" />
        {hasWhen ? "条件あり（自動チェックリスト）" : "適用条件を設定（自動チェックリスト用）"}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 bg-teal-50/40 border border-teal-100 rounded-lg p-3 space-y-3">
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
              placeholder="例: 派遣契約に基づく就労のため"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-teal-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">有効期限の注意書き</label>
              <input
                value={c.validityNote ?? ""}
                onChange={(e) => patch({ validityNote: e.target.value || undefined })}
                placeholder="例: 発行から3ヶ月以内のもの"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-teal-400"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer mt-1 sm:mt-5">
              <input type="checkbox" checked={!!c.translationRequired} onChange={(e) => patch({ translationRequired: e.target.checked || undefined })} />
              外国語書類の日本語訳が必要
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-gray-500">要件文の出し分け（条件ごとに文言を変える）</p>
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 hover:text-teal-800"
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
                        className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-teal-400"
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
