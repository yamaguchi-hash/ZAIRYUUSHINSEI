"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCode2, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";

export function XmlImportButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function reset() {
    setState("idle");
    setMessage("");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setState("loading");
    setMessage("");

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/applications/import-xml", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });

      let json: any;
      try {
        json = await res.json();
      } catch {
        throw new Error(`サーバーから無効なレスポンスが返りました（HTTP ${res.status}）。\n管理者にお問い合わせください。`);
      }

      if (!res.ok || !json.success) {
        setState("error");
        setMessage(json.error ?? "インポートに失敗しました。");
        return;
      }

      setState("success");
      setMessage(
        `「${json.applicantName}」の申請書を作成しました（${json.caseNumber}）`
      );

      setTimeout(() => {
        router.push(`/applications/${json.applicationId}`);
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setState("error");
      setMessage(err.message ?? "ネットワークエラーが発生しました。");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        onClick={() => {
          reset();
          inputRef.current?.click();
        }}
        disabled={state === "loading"}
        title="JLS在留申請システムの「XMLで保存」で出力したファイルをインポートします"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileCode2 className="w-4 h-4" />
        )}
        {state === "loading" ? "インポート中…" : "XMLから新規作成"}
      </button>

      {/* 結果フィードバック */}
      {state === "success" && (
        <div className="absolute top-11 right-0 z-50 w-80 flex items-start gap-2 bg-green-50 border border-green-300 text-green-800 rounded-lg px-3 py-2.5 text-xs shadow-lg">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
          <span className="flex-1 leading-relaxed">{message}</span>
        </div>
      )}
      {state === "error" && (
        <div className="absolute top-11 right-0 z-50 w-96 flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-lg px-3 py-2.5 text-xs shadow-lg">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
          <span className="flex-1 leading-relaxed whitespace-pre-line">{message}</span>
          <button onClick={reset} className="shrink-0 text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
