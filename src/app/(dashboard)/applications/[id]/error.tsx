"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 開発・本番どちらでもコンソールにエラーを出力
    console.error("[Application Detail Error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <h2 className="text-lg font-semibold text-red-800">
            ページの読み込みに失敗しました
          </h2>
        </div>

        <div className="text-sm text-red-700 space-y-2">
          {/* 開発環境のみ詳細を表示 */}
          {process.env.NODE_ENV !== "production" && (
            <div className="bg-red-100 rounded p-3 font-mono text-xs break-all">
              <p className="font-bold mb-1">Error:</p>
              <p>{error.message}</p>
              {error.stack && (
                <>
                  <p className="font-bold mt-2 mb-1">Stack:</p>
                  <pre className="whitespace-pre-wrap">{error.stack}</pre>
                </>
              )}
            </div>
          )}

          {error.digest && (
            <p className="text-xs text-red-500">
              エラーID: <span className="font-mono">{error.digest}</span>
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            再試行
          </button>
          <a
            href="/applications"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            申請一覧に戻る
          </a>
        </div>
      </div>
    </div>
  );
}
