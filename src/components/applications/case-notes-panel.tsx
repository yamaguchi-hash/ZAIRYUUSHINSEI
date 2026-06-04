"use client";

import { useState, useTransition } from "react";
import { Calendar, Clock, Plus, Edit2, Trash2, Loader2, Check, X } from "lucide-react";
import { getCaseNotes, addCaseNote, updateCaseNote, deleteCaseNote } from "@/actions/case-notes";

interface CaseNote {
  id: string;
  applicationId: string;
  entryDate: Date | string;
  entryTime: string | null;
  content: string;
  name: string | null;
  assignee: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface Props {
  applicationId: string;
  initialNotes: CaseNote[];
}

export function CaseNotesPanel({ applicationId, initialNotes }: Props) {
  const [notes, setNotes] = useState<CaseNote[]>(initialNotes);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // フォーム状態
  const [formData, setFormData] = useState({
    entryDate: "",
    entryTime: "",
    content: "",
    name: "",
    assignee: "",
  });

  function resetForm() {
    setFormData({
      entryDate: "",
      entryTime: "",
      content: "",
      name: "",
      assignee: "",
    });
    setIsAdding(false);
    setEditingId(null);
    setError("");
  }

  function startAdd() {
    setFormData({
      entryDate: new Date().toISOString().split("T")[0],
      entryTime: new Date().toTimeString().slice(0, 5),
      content: "",
      name: "",
      assignee: "",
    });
    setIsAdding(true);
    setEditingId(null);
  }

  function startEdit(note: CaseNote) {
    const dateStr = typeof note.entryDate === "string"
      ? note.entryDate.split("T")[0]
      : new Date(note.entryDate).toISOString().split("T")[0];

    setFormData({
      entryDate: dateStr,
      entryTime: note.entryTime || "",
      content: note.content,
      name: note.name || "",
      assignee: note.assignee || "",
    });
    setEditingId(note.id);
    setIsAdding(false);
    setError("");
  }

  function handleSave() {
    if (!formData.entryDate.trim()) {
      setError("記録日は必須です");
      return;
    }
    if (!formData.content.trim()) {
      setError("内容は必須です");
      return;
    }

    startTransition(async () => {
      try {
        if (editingId) {
          // 更新
          const updated = await updateCaseNote(applicationId, editingId, formData);
          setNotes(notes.map((n) => (n.id === editingId ? updated : n)));
        } else {
          // 追加
          const added = await addCaseNote(applicationId, formData);
          setNotes([...notes, added]);
        }
        resetForm();
      } catch (err: any) {
        setError(err.message || "操作に失敗しました");
      }
    });
  }

  function handleDelete(noteId: string) {
    if (!confirm("この事件メモを削除しますか？")) return;

    startTransition(async () => {
      try {
        await deleteCaseNote(applicationId, noteId);
        setNotes(notes.filter((n) => n.id !== noteId));
      } catch (err: any) {
        setError(err.message || "削除に失敗しました");
      }
    });
  }

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50 overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-200 bg-blue-100">
        <Calendar className="w-4 h-4 text-blue-700" />
        <span className="text-sm font-semibold text-blue-800">事件メモ</span>
        {notes.length > 0 && (
          <span className="ml-auto text-xs text-blue-600">{notes.length}件</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-blue-600">
          申請案件に関連した業務記録・メモを時系列で管理します。
        </p>

        {/* メモ一覧 */}
        <div className="space-y-2">
          {notes.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">
              事件メモはまだありません
            </p>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="bg-white border border-blue-100 rounded-lg p-3 space-y-2"
              >
                {/* 日付と操作ボタン */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Calendar className="w-3.5 h-3.5" />
                    {typeof note.entryDate === "string"
                      ? note.entryDate.split("T")[0]
                      : new Date(note.entryDate).toLocaleDateString("ja-JP")}
                    {note.entryTime && (
                      <>
                        <Clock className="w-3.5 h-3.5 ml-1" />
                        {note.entryTime}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(note)}
                      disabled={isPending || isAdding || editingId !== null}
                      className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-50"
                      title="編集"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      disabled={isPending || isAdding || editingId !== null}
                      className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 内容 */}
                <p className="text-xs text-gray-700 whitespace-pre-wrap">
                  {note.content}
                </p>

                {/* 名称と担当者 */}
                <div className="flex gap-3 text-xs text-gray-500">
                  {note.name && <span>対象: {note.name}</span>}
                  {note.assignee && <span>担当: {note.assignee}</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* フォーム */}
        {isAdding || editingId ? (
          <div className="bg-white border border-blue-100 rounded-lg p-3 space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              記録日 *
            </label>
            <input
              type="date"
              value={formData.entryDate}
              onChange={(e) =>
                setFormData({ ...formData, entryDate: e.target.value })
              }
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
            />

            <label className="block text-xs font-medium text-gray-700">
              時間
            </label>
            <input
              type="time"
              value={formData.entryTime}
              onChange={(e) =>
                setFormData({ ...formData, entryTime: e.target.value })
              }
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
            />

            <label className="block text-xs font-medium text-gray-700">
              内容 *
            </label>
            <textarea
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              placeholder="業務内容、メモ、進捗などを記入"
              rows={3}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
            />

            <label className="block text-xs font-medium text-gray-700">
              対象（人物・箇所）
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="例: 申請人、雇用主、入管職員など"
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
            />

            <label className="block text-xs font-medium text-gray-700">
              担当者
            </label>
            <input
              type="text"
              value={formData.assignee}
              onChange={(e) =>
                setFormData({ ...formData, assignee: e.target.value })
              }
              placeholder="担当者名"
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
            />

            {/* 操作ボタン */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                {editingId ? "更新" : "保存"}
              </button>
              <button
                onClick={resetForm}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startAdd}
            disabled={isPending || editingId !== null}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            メモを追加
          </button>
        )}
      </div>
    </div>
  );
}
