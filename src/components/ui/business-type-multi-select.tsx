"use client";

/**
 * 業種（別紙「業種一覧」）の複数選択コンポーネント。
 * 値はカンマ区切り文字列（例: "14, 27"）として保持する。
 * 申請書作成画面（他の業種・複数選択可）と顧客名簿（法人）マスターの
 * 業種欄の両方で共用する。
 * プルダウンで1件ずつ選択→追加し、追加済みの項目はタグ表示で個別に削除できる。
 */
import { X } from "lucide-react";
import { BUSINESS_TYPES } from "@/lib/form-types";

function parseCodes(value: string): number[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[,、]/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    )
  );
}

export function BusinessTypeMultiSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const selected = parseCodes(value);
  const remaining = BUSINESS_TYPES.filter((b) => !selected.includes(b.code));

  function add(code: number) {
    if (selected.includes(code)) return;
    onChange([...selected, code].sort((a, b) => a - b).join(", "));
  }

  function remove(code: number) {
    onChange(selected.filter((c) => c !== code).join(", "));
  }

  return (
    <div className={className}>
      <select
        value=""
        onChange={(e) => {
          const code = Number(e.target.value);
          if (Number.isFinite(code) && e.target.value !== "") add(code);
        }}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700"
      >
        <option value="">業種を選択して追加</option>
        {remaining.map((b) => (
          <option key={b.code} value={b.code}>
            {b.code}. {b.label}
          </option>
        ))}
      </select>
      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((code) => {
            const b = BUSINESS_TYPES.find((x) => x.code === code);
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200"
              >
                {code}. {b?.label ?? "不明"}
                <button
                  type="button"
                  onClick={() => remove(code)}
                  className="text-blue-400 hover:text-red-500"
                  aria-label={`${b?.label ?? code}を削除`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
