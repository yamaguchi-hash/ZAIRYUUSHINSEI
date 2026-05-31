"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, Loader2, X, ExternalLink } from "lucide-react";

// ── Google Docs API を直接呼び出してドキュメントを作成 ─────────────────────────
async function createGoogleDoc(
  accessToken: string,
  title: string,
  plainText: string,
): Promise<string> {
  // 1. ドキュメント作成
  const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Googleドキュメントの作成に失敗しました");
  }
  const { documentId } = await createRes.json();

  // 2. テキスト内容を挿入（index:1 = 先頭）
  const insertRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: plainText,
            },
          },
        ],
      }),
    },
  );
  if (!insertRes.ok) {
    console.error("テキスト挿入失敗（ドキュメントは作成済み）");
  }

  return `https://docs.google.com/document/d/${documentId}/edit`;
}

// ── GIS トークン取得 ────────────────────────────────────────────────────────
function getAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const g = (window as any).google;
    if (!g?.accounts?.oauth2) {
      reject(new Error("Google Identity Services が読み込まれていません"));
      return;
    }
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive.file",
      ].join(" "),
      callback: (resp: any) => {
        if (resp.error) reject(new Error(resp.error_description ?? resp.error));
        else resolve(resp.access_token);
      },
      error_callback: (err: any) => reject(new Error(err?.message ?? "認証エラー")),
    });
    // prompt:'' = 既に許可済みならポップアップなし（初回のみ表示）
    client.requestAccessToken({ prompt: "" });
  });
}

// ── セットアップガイドモーダル ──────────────────────────────────────────────
function SetupModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-blue-600 text-white rounded-t-xl">
          <h2 className="font-bold text-base">Googleドキュメント連携の設定</h2>
          <button onClick={onClose} className="hover:bg-blue-700 rounded p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm space-y-4">
          <p className="text-gray-700">
            Googleドキュメントを自動作成するには、<strong>1回だけ</strong>の設定が必要です（約5分）。
          </p>

          <div className="space-y-3">
            {[
              {
                step: "1",
                text: "Google Cloud Console を開く",
                link: "https://console.cloud.google.com/projectcreate",
                linkText: "console.cloud.google.com/projectcreate",
              },
              { step: "2", text: "プロジェクトを作成（名前は何でも可）→「作成」" },
              {
                step: "3",
                text: "Google Docs API を有効化",
                link: "https://console.cloud.google.com/apis/library/docs.googleapis.com",
                linkText: "こちらのリンクから有効化",
              },
              {
                step: "4",
                text: "「APIとサービス」→「認証情報」→「+ 認証情報を作成」→「OAuth クライアントID」",
              },
              {
                step: "5",
                text: "種類：「ウェブアプリケーション」を選択",
              },
              {
                step: "6",
                text: "「承認済みの JavaScript 生成元」に http://localhost:3000 を追加 → 「作成」",
              },
              {
                step: "7",
                text: "表示された「クライアントID」をコピーして .env.local に追記：",
                code: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID="コピーしたクライアントID"',
              },
              { step: "8", text: "開発サーバーを再起動（npm run dev）" },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                  {item.step}
                </span>
                <div className="text-gray-700">
                  {item.text}
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-blue-600 underline inline-flex items-center gap-0.5"
                    >
                      {item.linkText}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {item.code && (
                    <pre className="mt-1 bg-gray-900 text-green-300 rounded p-2 text-xs overflow-x-auto">
                      {item.code}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 border-t pt-3">
            設定後は同じボタンを押すとGoogleドキュメントが自動作成されます。
          </p>
        </div>
        <div className="px-5 py-3 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
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
  const [showSetup, setShowSetup] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // GIS ライブラリを動的に読み込む
  useEffect(() => {
    if (!clientId) return; // Client ID なければロード不要
    if (scriptRef.current) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGisReady(true);
    document.body.appendChild(script);
    scriptRef.current = script;

    return () => {
      // クリーンアップはしない（ページをまたいで使い回す）
    };
  }, [clientId]);

  async function handleClick() {
    setLoading(true);
    setError("");

    try {
      // ── 方法1: Apps Script 経由（URL 設定済みの場合）──────────────────────
      const scriptUrl = "/api/applications/" + applicationId + "/questionnaire-gdoc";
      const gdocRes = await fetch(scriptUrl);
      const gdocJson = await gdocRes.json().catch(() => ({}));
      if (gdocRes.ok && gdocJson?.url) {
        window.open(gdocJson.url, "_blank");
        return;
      }

      // ── 方法2: GIS + Google Docs API（Client ID 設定済みの場合）──────────
      if (clientId) {
        if (!gisReady) {
          setError("Google認証ライブラリを読み込み中です。数秒後にもう一度押してください。");
          return;
        }

        // コンテンツを取得
        const contentRes = await fetch(
          `/api/applications/${applicationId}/questionnaire-content`,
        );
        if (!contentRes.ok) throw new Error("質問書の取得に失敗しました");
        const { plainText, title } = await contentRes.json();

        // Google OAuth トークン取得 → ドキュメント作成
        const accessToken = await getAccessToken(clientId);
        const url = await createGoogleDoc(accessToken, title, plainText);
        window.open(url, "_blank");
        return;
      }

      // ── 方法3: どちらも未設定 → セットアップ案内 ──────────────────────────
      setShowSetup(true);
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
          title="空欄項目の質問書をGoogleドキュメントで自動作成"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          {loading ? "作成中..." : "質問書（Googleドキュメント）"}
        </button>
        {error && <p className="text-xs text-red-500 max-w-xs">{error}</p>}
      </div>
    </>
  );
}
