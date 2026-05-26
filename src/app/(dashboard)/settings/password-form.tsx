"use client";

import { useState, useTransition } from "react";
import { updatePassword } from "@/actions/account";
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function PasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const strength = getStrength(newPw);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");

    if (newPw !== confirmPw) {
      setStatus("error");
      setMessage("新しいパスワードが一致しません");
      return;
    }
    if (newPw.length < 8) {
      setStatus("error");
      setMessage("パスワードは8文字以上で入力してください");
      return;
    }

    startTransition(async () => {
      try {
        await updatePassword(current, newPw);
        setStatus("success");
        setMessage("パスワードを変更しました");
        setCurrent("");
        setNewPw("");
        setConfirmPw("");
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

      {/* Current password */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">現在のパスワード</label>
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setStatus("idle"); }}
            required
            placeholder="現在のパスワード"
            className="input-field pr-10"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* New password */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード</label>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            value={newPw}
            onChange={(e) => { setNewPw(e.target.value); setStatus("idle"); }}
            required
            placeholder="8文字以上"
            className="input-field pr-10"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {/* Strength bar */}
        {newPw && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i <= strength.score
                      ? strength.score <= 1 ? "bg-red-400"
                        : strength.score === 2 ? "bg-yellow-400"
                        : strength.score === 3 ? "bg-blue-400"
                        : "bg-green-400"
                      : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500">{strength.label}</p>
          </div>
        )}
      </div>

      {/* Confirm */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（確認）</label>
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => { setConfirmPw(e.target.value); setStatus("idle"); }}
          required
          placeholder="パスワードを再入力"
          className={`input-field ${confirmPw && confirmPw !== newPw ? "border-red-300" : ""}`}
        />
        {confirmPw && confirmPw !== newPw && (
          <p className="text-xs text-red-500 mt-1">パスワードが一致しません</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !current || !newPw || !confirmPw}
        className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />変更中...</> : "パスワードを変更する"}
      </button>
    </form>
  );
}

function getStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["", "弱い", "普通", "強い", "非常に強い"];
  return { score, label: labels[score] ?? "" };
}
