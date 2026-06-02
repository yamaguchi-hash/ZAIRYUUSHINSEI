"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileCode2, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function XmlImportButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

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
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setState("error");
        setMessage(json.error ?? "インポートに失敗しました");
        return;
      }

      setState("success");
      setMessage(
        `「${json.applicantName}」の申請書を作成しました（${json.caseNumber}）`
      );

      // 1秒後に新規作成された申請詳細へ遷移
      setTimeout(() => {
        router.push(`/applications/${json.applicationId}`);
        router.refresh();
      }, 1200);
    } catch (err: any) {
      setState("error");
      setMessage(err.message ?? "ネットワークエラーが発生しました");
    } finally {
      // ファイル入力をリセット（同じファイルを再選択できるように）
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".xml"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        onClick={() => {
          setState("idle");
          setMessage("");
          inputRef.current?.click();
        }}
        disabled={state === "loading"}
        title="JLS在留申請システムのXMLファイルをインポートして新規申請書を作成します"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileCode2 className="w-4 h-4" />
        )}
        XMLから新規作成
      </button>

      {/* 結果フィードバック */}
      {state === "success" && message && (
        <div className="absolute top-10 left-0 z-50 w-72 flex items-start gap-2 bg-green-50 border border-green-300 text-green-800 rounded-lg px-3 py-2 text-xs shadow-md">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{message}</span>
        </div>
      )}
      {state === "error" && message && (
        <div className="absolute top-10 left-0 z-50 w-72 flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-lg px-3 py-2 text-xs shadow-md">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
