"use client";

import { useState } from "react";
import { FileText, Loader2, ExternalLink, X, Copy, Check } from "lucide-react";

// ── Google Apps Script セットアップ手順を表示するモーダル ──────────────────
const GAS_CODE = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var doc = DocumentApp.create(data.title || "在留申請 質問書");
    var body = doc.getBody();
    body.clear();
    var lines = data.lines || [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var para;
      if (line.type === 'title') {
        para = body.appendParagraph(line.text);
        para.setHeading(DocumentApp.ParagraphHeading.TITLE);
        para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      } else if (line.type === 'meta') {
        para = body.appendParagraph(line.text);
        para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        para.setFontSize(10); para.setForegroundColor('#555555');
      } else if (line.type === 'instruction') {
        para = body.appendParagraph(line.text);
        para.setFontSize(10); para.setIndentStart(20);
      } else if (line.type === 'section') {
        para = body.appendParagraph(line.text);
        para.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        para.setBackgroundColor('#1E3A5F');
        para.setForegroundColor('#FFFFFF');
      } else if (line.type === 'question') {
        para = body.appendParagraph(line.text);
        para.setHeading(DocumentApp.ParagraphHeading.HEADING3);
        para.setIndentStart(20);
      } else if (line.type === 'options') {
        para = body.appendParagraph(line.text);
        para.setFontSize(13); para.setIndentStart(40); para.setSpacingBefore(2);
      } else if (line.type === 'answer') {
        para = body.appendParagraph(line.text);
        para.setIndentStart(40); para.setSpacingBefore(2); para.setSpacingAfter(12);
      } else {
        body.appendParagraph(line.text || '');
      }
    }
    doc.saveAndClose();
    var url = 'https://docs.google.com/document/d/' + doc.getId() + '/edit';
    return ContentService.createTextOutput(
      JSON.stringify({success:true,url:url,id:doc.getId()})
    ).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(
      JSON.stringify({success:false,error:err.toString()})
    ).setMimeType(ContentService.MimeType.JSON);
  }
}`;

function SetupModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(GAS_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-blue-600 text-white">
          <h2 className="font-bold text-lg">Googleドキュメント機能のセットアップ</h2>
          <button onClick={onClose} className="hover:bg-blue-700 rounded p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto px-6 py-4 text-sm space-y-4">
          <p className="text-gray-700">
            Googleドキュメントで質問書を作成するには、<strong>Google Apps Script</strong> の一回限りの設定が必要です。
            以下の手順に沿って設定してください。
          </p>
          <ol className="space-y-3 list-none">
            {[
              <>
                <a href="https://script.google.com/home" target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 underline inline-flex items-center gap-1">
                  script.google.com <ExternalLink className="w-3 h-3" />
                </a>
                を開き、「<strong>新しいプロジェクト</strong>」をクリック
              </>,
              <>既存のコードをすべて削除し、下のコードを貼り付けて保存（Ctrl+S）</>,
              <>「<strong>デプロイ</strong>」→「<strong>新しいデプロイ</strong>」をクリック</>,
              <>種類：<strong>ウェブアプリ</strong>　/　実行ユーザー：<strong>自分（Me）</strong>　/　アクセス：<strong>全員（Anyone）</strong>　→「デプロイ」</>,
              <>表示された「<strong>ウェブアプリのURL</strong>」をコピー</>,
              <>
                プロジェクトの <code className="bg-gray-100 px-1 rounded">.env.local</code> に追記：
                <pre className="bg-gray-100 rounded p-2 mt-1 text-xs">GOOGLE_APPS_SCRIPT_URL="貼り付けたURL"</pre>
              </>,
              <>開発サーバーを再起動（<code className="bg-gray-100 px-1 rounded">npm run dev</code>）</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                <span className="text-gray-700">{step}</span>
              </li>
            ))}
          </ol>

          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">Google Apps Script コード</span>
              <button
                onClick={copyCode}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "コピーしました" : "コードをコピー"}
              </button>
            </div>
            <pre className="bg-gray-900 text-green-300 rounded-lg p-3 text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono">
              {GAS_CODE}
            </pre>
          </div>
        </div>
        <div className="px-6 py-3 border-t flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm">閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ── メインボタン ──────────────────────────────────────────────────────────────
export function QuestionnaireDocxButton({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSetup, setShowSetup] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}/questionnaire-gdoc`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (json?.needsSetup) {
          // Apps Script が未設定 → セットアップモーダルを表示
          setShowSetup(true);
          return;
        }
        setError(json?.error ?? "Googleドキュメントの作成に失敗しました");
        return;
      }

      // 成功 → Google Doc を新タブで開く
      if (json?.url) {
        window.open(json.url, "_blank");
      }
    } catch (e: any) {
      setError(e?.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {showSetup && <SetupModal onClose={() => setShowSetup(false)} />}
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          title="空欄項目の質問書をGoogleドキュメントで作成・共有"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {loading ? "作成中..." : "質問書（Googleドキュメント）"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </>
  );
}
