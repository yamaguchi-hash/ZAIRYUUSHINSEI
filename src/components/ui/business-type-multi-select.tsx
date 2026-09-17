"use client";

/**
 * 業種（別紙「業種一覧」）の複数選択コンポーネント。
 * 値はカンマ区切り文字列（例: "14, 27"）として保持する。
 * 申請書作成画面（他の業種・複数選択可）と顧客名簿（法人）マスターの
 * 業種欄の両方で共用する。
 */
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { BUSINESS_TYPES } from "@/lib/form-types";

function parseCodes(value: string): Set<number> {
  return new Set(
    (value ?? "")
      .split(/[,、]/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
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
  const [open, setOpen] = useState(false);
  const selected = parseCodes(value);

  function toggle(code: number) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code); else next.add(code);
    onChange(Array.from(next).sort((a, b) => a - b).join(", "));
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-left"
      >
        <span className={selected.size === 0 ? "text-gray-400" : "text-gray-700"}>
          {selected.size === 0 ? "選択してください（複数選択可）" : `${selected.size}件選択中：${Array.from(selected).sort((a, b) => a - b).join("、")}`}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white flex flex-wrap gap-1">
          {BUSINESS_TYPES.map((b) => (
            <button
              key={b.code}
              type="button"
              onClick={() => toggle(b.code)}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                selected.has(b.code)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {b.code}. {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
