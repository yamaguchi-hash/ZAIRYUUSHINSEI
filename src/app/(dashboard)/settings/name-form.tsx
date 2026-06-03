"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDisplayName } from "@/actions/account";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function NameForm({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(currentName);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    startTransition(async () => {
      try {
        await updateDisplayName(name);
        setStatus("success");
        setMessage("表示名を変更しました");

        // ページをリフレッシュしてサーバーの最新データを取得
        setTimeout(() => {
          router.refresh();
        }, 500);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message ?? "変更に失敗しました");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status === "success" && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {message}
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {message}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">表示名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setStatus("idle"); }}
          required
          placeholder="山口 太郎"
          className="input-field"
        />
      </div>
      <button
        type="submit"
        disabled={isPending || name === currentName}
        className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />更新中...</> : "表示名を変更する"}
      </button>
    </form>
  );
}
