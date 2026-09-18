"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  /** ヘッダー右側に表示するバッジ（件数など） */
  badge?: string | number;
  /** 初期状態で開いているか（デフォルト: true）。ユーザーが一度も開閉していない場合のみ適用 */
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** ヘッダー左のカラーバー色クラス (例: "bg-blue-500") */
  accentClass?: string;
  /**
   * 開閉状態を保存するキー。未指定の場合はタイトルから自動生成する。
   * 画面遷移・ステータス変更（ページリロード）をまたいで開閉状態を維持するために使う。
   */
  storageKey?: string;
}

/** localStorage に保存する際のキー接頭辞 */
const STORAGE_PREFIX = "collapsible_section:";

export function CollapsibleSection({
  title,
  badge,
  defaultOpen = true,
  children,
  accentClass,
  storageKey,
}: CollapsibleSectionProps) {
  // SSRとの整合のため、初期値はサーバー側と同じ defaultOpen にする。
  // 実際のユーザー設定はマウント後に localStorage から読み込んで反映する
  // （画面切り替え・ステータス切り替えで開いた状態に戻らないよう、閉じたままを維持する）。
  const [open, setOpen] = useState(defaultOpen);
  const key = STORAGE_PREFIX + (storageKey ?? title);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === "true") setOpen(true);
      else if (stored === "false") setOpen(false);
    } catch {
      // localStorage が使えない環境では defaultOpen のまま
    }
  }, [key]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // 保存に失敗しても開閉自体は動作させる
      }
      return next;
    });
  };

  return (
    <div className="mb-6">
      {/* 折りたたみヘッダー */}
      <button
        type="button"
        onClick={toggle}
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
