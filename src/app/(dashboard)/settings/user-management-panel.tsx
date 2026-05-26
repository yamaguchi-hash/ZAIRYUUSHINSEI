"use client";

import { useState, useTransition, useEffect } from "react";
import { getUsers, adminUpdateUser } from "@/actions/account";
import { ROLE_LABELS } from "@/lib/utils";
import { Loader2, CheckCircle, AlertCircle, Pencil, X, Save } from "lucide-react";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
};

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ email: "", name: "", password: "", role: "" });
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Record<string, "success" | "error">>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    getUsers().then(setUsers).finally(() => setLoading(false));
  }, []);

  function startEdit(user: UserRow) {
    setEditingId(user.id);
    setEditForm({ email: user.email, name: user.name ?? "", password: "", role: user.role });
    setStatus({});
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ email: "", name: "", password: "", role: "" });
  }

  function handleSave(userId: string) {
    startTransition(async () => {
      try {
        await adminUpdateUser(userId, {
          email: editForm.email || undefined,
          name: editForm.name || undefined,
          password: editForm.password || undefined,
          role: editForm.role || undefined,
        });
        setStatus((s) => ({ ...s, [userId]: "success" }));
        setMessages((m) => ({ ...m, [userId]: "更新しました" }));
        // Refresh list
        const updated = await getUsers();
        setUsers(updated);
        setEditingId(null);
      } catch (err: any) {
        setStatus((s) => ({ ...s, [userId]: "error" }));
        setMessages((m) => ({ ...m, [userId]: err.message ?? "更新に失敗しました" }));
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        テナント内のユーザーのメールアドレス・パスワード・ロールを変更できます。
      </p>

      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
        {users.map((user) => {
          const isEditing = editingId === user.id;
          const s = status[user.id];
          return (
            <div key={user.id} className="p-4 bg-white">
              {!isEditing ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.name ?? "(名前未設定)"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s === "success" && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" /> {messages[user.id]}
                      </span>
                    )}
                    {s === "error" && (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle className="w-3 h-3" /> {messages[user.id]}
                      </span>
                    )}
                    <button
                      onClick={() => startEdit(user)}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      title="編集"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    編集中: {user.name ?? user.email}
                  </p>
                  {status[user.id] === "error" && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-xs">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      {messages[user.id]}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">表示名</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="山口 太郎"
                        className="input-field text-sm py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">ロール</label>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                        className="input-field text-sm py-1.5"
                      >
                        {Object.entries(ROLE_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">メールアドレス</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      className="input-field text-sm py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      新しいパスワード
                      <span className="text-gray-400 ml-1">（変更しない場合は空白）</span>
                    </label>
                    <input
                      type="password"
                      value={editForm.password}
                      onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="8文字以上"
                      className="input-field text-sm py-1.5"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleSave(user.id)}
                      disabled={isPending}
                      className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      保存
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={isPending}
                      className="flex items-center gap-1.5 border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                    >
                      <X className="w-3 h-3" />
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
