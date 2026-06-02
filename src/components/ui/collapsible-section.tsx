"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  /** ヘッダー右側に表示するバッジ（件数など） */
  badge?: string | number;
  /** 初期状態で開いているか（デフォルト: true） */
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** ヘッダー左のカラーバー色クラス (例: "bg-blue-500") */
  accentClass?: string;
}

export function CollapsibleSection({
  title,
  badge,
  defaultOpen = true,
  children,
  accentClass,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-6">
      {/* 折りたたみヘッダー */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-left group"
      >
        <div className="flex items-center gap-2.5">
          {accentClass && (
            <span className={`w-1 h-4 rounded-full ${accentClass}`} />
          )}
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          {badge !== undefined && badge !== "" && (
            <span className="text-xs bg-white border border-gray-200 text-gray-500 rounded-full px-2 py-0.5 font-normal">
              {badge}
            </span>
          )}
        </div>
        <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
          {open
            ? <ChevronUp className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {/* コンテンツ */}
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
