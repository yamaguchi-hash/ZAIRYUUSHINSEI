"use client";

import { useState } from "react";
import { FileText, Loader2, ExternalLink, Copy, Check, X } from "lucide-react";

// ── クリップボードコピーしてdocs.newで開くモーダル ───────────────────────────────
function CopyModal({
  content,
  title,
  onClose,
}: {
  content: string;
  title: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAndOpen() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      // 少し待ってからGoogleドキュメントを開く
      setTimeout(() => {
        window.open("https://docs.new", "_blank");
      }, 400);
    } catch {
      // fallback: テキストエリア選択
      const ta = document.getElementById("qs-content") as HTMLTextAreaElement;
      if (ta) { ta.select(); document.execCommand("copy"); }
      setCopied(true);
      setTimeout(() => window.open("https://docs.new", "_blank"), 400);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-blue-600 text-white rounded-t-xl flex-shrink-0">
          <h2 className="font-bold text-base">質問書をGoogleドキュメントで作成</h2>
          <button onClick={onClose} className="hover:bg-blue-700 rounded p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex-shrink-0">
          {/* 手順説明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-4">
            <p className="font-semibold mb-1">📋 2ステップで完了：</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>「<strong>コピーしてGoogleドキュメントを開く</strong>」をクリック</li>
              <li>開いたGoogleドキュメントで <kbd className="bg-white border border-blue-300 rounded px-1 text-xs">Ctrl</kbd> + <kbd className="bg-white border border-blue-300 rounded px-1 text-xs">V</kbd> で貼り付け</li>
            </ol>
          </div>

          {/* アクションボタン */}
          <button
            onClick={copyAndOpen}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                コピー完了！Googleドキュメントを開きました
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                コピーしてGoogleドキュメントを開く
              </>
            )}
          </button>

          {copied && (
            <p className="text-xs text-blue-700 text-center mt-2">
              開いたGoogleドキュメントで <strong>Ctrl+V</strong>（Mac: Cmd+V）で貼り付けてください
            </p>
          )}
        </div>

        {/* プレビュー */}
        <div className="px-5 pb-4 flex-1 min-h-0 overflow-hidden flex flex-col">
          <p className="text-xs text-gray-500 mb-1 flex-shrink-0">プレビュー（{title}）：</p>
          <textarea
            id="qs-content"
            readOnly
            value={content}
            className="flex-1 w-full text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none overflow-y-auto"
            style={{ minHeight: "200px" }}
          />
        </div>

        <div className="px-5 py-3 border-t flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインボタン ──────────────────────────────────────────────────────────────
export function QuestionnaireDocxButton({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{ content: string; title: string } | null>(null);

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      // まず Apps Script 経由 (URL設定済みの場合)
      const gdocRes = await fetch(`/api/applications/${applicationId}/questionnaire-gdoc`);
      const gdocJson = await gdocRes.json().catch(() => ({}));

      if (gdocRes.ok && gdocJson?.url) {
        // Apps Script 成功 → 直接Google Docを開く
        window.open(gdocJson.url, "_blank");
        return;
      }

      // Apps Script 未設定 or 失敗 → テキストコンテンツを取得してモーダル表示
      const contentRes = await fetch(`/api/applications/${applicationId}/questionnaire-content`);
      if (!contentRes.ok) {
        const j = await contentRes.json().catch(() => ({}));
        setError(j?.error ?? "コンテンツの取得に失敗しました");
        return;
      }
      const { plainText, title } = await contentRes.json();
      setModal({ content: plainText, title });
    } catch (e: any) {
      setError(e?.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {modal && (
        <CopyModal
          content={modal.content}
          title={modal.title}
          onClose={() => setModal(null)}
        />
      )}
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          title="空欄項目の質問書をGoogleドキュメントで作成"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {loading ? "作成中..." : "質問書（Googleドキュメント）"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </>
  );
}
