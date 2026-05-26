"use client";

import { useState, useTransition } from "react";
import { updateEmail } from "@/actions/account";
import { signOut } from "next-auth/react";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");

    if (email !== confirm) {
      setStatus("error");
      setMessage("メールアドレスが一致しません");
      return;
    }
    if (email === currentEmail) {
      setStatus("error");
      setMessage("現在と同じメールアドレスです");
      return;
    }

    startTransition(async () => {
      try {
        await updateEmail(email);
        setStatus("success");
        setMessage("メールアドレスを変更しました。再ログインしてください。");
        setTimeout(() => signOut({ callbackUrl: "/login" }), 2000);
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          新しいメールアドレス
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
          required
          placeholder="new@example.com"
          className="input-field"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          新しいメールアドレス（確認）
        </label>
        <input
          type="email"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setStatus("idle"); }}
          required
          placeholder="new@example.com"
          className="input-field"
        />
      </div>
      <button
        type="submit"
        disabled={isPending || !email || !confirm}
        className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />変更中...</> : "メールアドレスを変更する"}
      </button>
    </form>
  );
}
