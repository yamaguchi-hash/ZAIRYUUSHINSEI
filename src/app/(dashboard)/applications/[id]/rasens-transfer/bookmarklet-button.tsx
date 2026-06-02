"use client";

import { useState } from "react";
import { Bookmark, Check, ClipboardCopy } from "lucide-react";

interface Props {
  bookmarkletUrl: string;
  label: string;
}

export function BookmarkletButton({ bookmarkletUrl, label }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // ブックマークレットのJSコードをクリップボードにコピー
    const decoded = decodeURIComponent(bookmarkletUrl.replace("javascript:", ""));
    await navigator.clipboard.writeText(`javascript:${decoded}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* ドラッグ用リンク */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href={bookmarkletUrl}
        draggable="true"
        onClick={(e) => e.preventDefault()}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-grab active:cursor-grabbing select-none"
        title="ブックマークバーにドラッグ＆ドロップしてください"
      >
        <Bookmark className="w-4 h-4" />
        ⬆ ここをドラッグしてブックマークに追加
      </a>

      {/* クリップボードコピー（代替手段） */}
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg transition-colors"
        title="ブックマークレットコードをコピー"
      >
        {copied
          ? <><Check className="w-3.5 h-3.5 text-green-500" />コピーしました</>
          : <><ClipboardCopy className="w-3.5 h-3.5" />コードをコピー</>
        }
      </button>

      <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1">
        💡 ドラッグできない場合は「コードをコピー」→ ブックマーク新規作成時にURLに貼り付け
      </div>
    </div>
  );
}
