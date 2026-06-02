"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { RasensField } from "@/lib/rasens-transfer";

interface Section {
  title: string;
  fields: RasensField[];
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // フォールバック（古いブラウザ）
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
        copied
          ? "bg-green-100 text-green-700 border border-green-300"
          : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
      }`}
      title={`「${value}」をコピー`}
    >
      {copied
        ? <><Check className="w-3 h-3" />コピー済</>
        : <><Copy className="w-3 h-3" />コピー</>}
    </button>
  );
}

export function TransferSheet({ sections }: { sections: Section[] }) {
  const [copiedAll, setCopiedAll] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <div
          key={section.title}
          className="border border-gray-200 rounded-xl overflow-hidden shadow-sm"
        >
          {/* セクションヘッダー */}
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">{section.title}</h2>
            <span className="text-xs text-gray-400">{section.fields.length}項目</span>
          </div>

          {/* フィールド一覧 */}
          <table className="w-full">
            <tbody>
              {section.fields.map((field, i) => (
                <tr
                  key={i}
                  className={`border-b border-gray-100 last:border-0 ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                  }`}
                >
                  {/* ラベル */}
                  <td className="px-4 py-2.5 text-xs text-gray-500 font-medium whitespace-nowrap w-52 align-middle">
                    {field.label}
                    {field.note && (
                      <span className="ml-1 text-gray-400 font-normal">({field.note})</span>
                    )}
                  </td>

                  {/* 値 */}
                  <td className="px-4 py-2.5 text-sm text-gray-900 font-medium align-middle break-all">
                    {field.value || <span className="text-gray-300 italic text-xs">未入力</span>}
                  </td>

                  {/* コピーボタン */}
                  <td className="px-3 py-2 align-middle w-24 text-right">
                    {field.value && <CopyButton value={field.value} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
