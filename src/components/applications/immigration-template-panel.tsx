"use client";

import { useState } from "react";
import { Download, FileCode2, ChevronDown, ChevronUp, Info } from "lucide-react";

type Template = {
  key: string;
  label: string;
  items: number;
  description: string;
  filename: string;
};

const TEMPLATES: Template[] = [
  {
    key: "kazoku-koushin",
    label: "在留期間更新（家族滞在）",
    items: 367,
    description: "家族滞在ビザの在留期間更新許可申請テンプレート",
    filename: "kazoku_koushin_template.xml",
  },
  {
    key: "epa-koushin",
    label: "在留期間更新（特定活動・EPA）",
    items: 539,
    description: "EPA介護福祉士候補者等の在留期間更新許可申請テンプレート",
    filename: "epa_koushin_template.xml",
  },
];

export function ImmigrationTemplatePanel() {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(key: string, filename: string) {
    setDownloading(key);
    try {
      const res = await fetch(`/api/immigration-template/${key}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("ダウンロードに失敗しました");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message ?? "エラーが発生しました");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50 overflow-hidden">
      {/* ヘッダー（クリックで開閉） */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">
            入管オンライン申請テンプレートXML
          </span>
          <span className="text-xs bg-blue-200 text-blue-700 rounded px-2 py-0.5">
            {TEMPLATES.length} 種類
          </span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-blue-500" />
          : <ChevronDown className="w-4 h-4 text-blue-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* 使い方説明 */}
          <div className="flex items-start gap-2 bg-white border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
            <div className="space-y-1">
              <p className="font-semibold">使い方</p>
              <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
                <li>下のボタンからXMLをダウンロード</li>
                <li>入管オンライン申請システムにログイン</li>
                <li>「申請データの読み込み」でXMLをインポート</li>
                <li>申請書フォームが自動的に開きます</li>
                <li>申請人情報を入力して提出</li>
              </ol>
            </div>
          </div>

          {/* テンプレート一覧 */}
          <div className="space-y-2">
            {TEMPLATES.map(tmpl => (
              <div
                key={tmpl.key}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5"
              >
                <div>
                  <div className="text-sm font-medium text-gray-800">{tmpl.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {tmpl.description}　※{tmpl.items}項目
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(tmpl.key, tmpl.filename)}
                  disabled={downloading === tmpl.key}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors whitespace-nowrap ml-3"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading === tmpl.key ? "DL中..." : "ダウンロード"}
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-center">
            ※ このXMLは申請種別が自動選択されたブランク申請書です
          </p>
        </div>
      )}
    </div>
  );
}
