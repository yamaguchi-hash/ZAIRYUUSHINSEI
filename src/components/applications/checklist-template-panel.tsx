"use client";

/**
 * 申請案件チェックリストの名前付き保存・呼び出しパネル
 * ──────────────────────────────────────────────
 * 必要書類マスターのテンプレートとは別機能。実際の案件で作り込んだチェックリスト
 * （書類名・担当・注意事項・原本/写し）を名前を付けて保存し、他の案件で呼び出せる。
 */
import { useCallback, useEffect, useState } from "react";
import {
  saveChecklistAsTemplate,
  listChecklistTemplates,
  applyChecklistTemplate,
  deleteChecklistTemplate,
  type ChecklistTemplateRow,
} from "@/actions/checklist-templates";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS, cn } from "@/lib/utils";
import { Loader2, Save, FolderOpen, Trash2, Check, AlertCircle, ClipboardList } from "lucide-react";

export function ChecklistTemplatePanel({ applicationId }: { applicationId: string }) {
  const [rows, setRows] = useState<ChecklistTemplateRow[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await listChecklistTemplates();
    if (result.success && result.rows) setRows(result.rows);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    if (!name.trim()) { setError("保存名を入力してください"); return; }
    setSaving(true);
    setError("");
    setMessage("");
    const result = await saveChecklistAsTemplate({ applicationId, name, note });
    setSaving(false);
    if (!result.success) { setError(result.error ?? "保存に失敗しました"); return; }
    setName(""); setNote("");
    setMessage(`現在のチェックリスト（${result.count}件）を保存しました`);
    setTimeout(() => setMessage(""), 4000);
    void load();
  }

  async function handleApply(tpl: ChecklistTemplateRow) {
    if (!window.confirm(
      `「${tpl.name}」（${tpl.itemCount}件）をこの案件のチェックリストへ反映します。\n\n` +
      `既に登録済みの同名の書類はスキップし、不足している書類だけを追加します。\n\n実行しますか？`
    )) return;
    setApplyingId(tpl.id);
    setError("");
    setMessage("");
    const result = await applyChecklistTemplate(applicationId, tpl.id);
    setApplyingId(null);
    if (!result.success) { setError(result.error ?? "呼び出しに失敗しました"); return; }
    if (result.count && result.count > 0) {
      setMessage(`「${tpl.name}」から${result.count}件を追加しました`);
      setTimeout(() => window.location.reload(), 1200);
    } else {
      setMessage(`「${tpl.name}」の書類はすべて登録済みです`);
      setTimeout(() => setMessage(""), 4000);
    }
  }

  async function handleDelete(tpl: ChecklistTemplateRow) {
    if (!window.confirm(`保存データ「${tpl.name}」を削除しますか？`)) return;
    const result = await deleteChecklistTemplate(tpl.id);
    if (!result.success) { setError(result.error ?? "削除に失敗しました"); return; }
    void load();
  }

  return (
    <div className="mt-4 border border-indigo-200 bg-indigo-50/40 rounded-xl p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-indigo-600" />
          このチェックリストを保存 / 保存したチェックリストを呼び出す
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          現在の書類一式（書類名・担当・注意事項・原本/写し）に名前を付けて保存し、他の申請案件でも呼び出せます。
          必要書類マスターとは別に管理され、マスターには影響しません。
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {message && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
          <Check className="w-3.5 h-3.5" />{message}
        </p>
      )}

      {/* 保存 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="保存名（例: 建設・特技2号変更 実務セット）"
          className="flex-1 min-w-[220px] text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-400"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="メモ（任意）"
          className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-600 bg-white focus:outline-none focus:border-indigo-400"
        />
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          現在の内容を保存
        </button>
      </div>

      {/* 保存済み一覧 */}
      {rows.length > 0 ? (
        <div className="border border-indigo-100 bg-white rounded-lg divide-y divide-gray-50">
          {rows.map((tpl) => (
            <div key={tpl.id} className="flex items-center gap-3 px-3 py-2">
              <FolderOpen className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{tpl.name}</p>
                <p className="text-[11px] text-gray-400">
                  {tpl.itemCount} 件
                  {tpl.visaType && (
                    <span className="ml-2">
                      {VISA_TYPE_LABELS[tpl.visaType] ?? tpl.visaType}
                      {tpl.applicationType && ` / ${APPLICATION_TYPE_LABELS[tpl.applicationType] ?? tpl.applicationType}`}
                    </span>
                  )}
                  {tpl.note && <span className="ml-2">{tpl.note}</span>}
                  <span className="ml-2">{new Date(tpl.createdAt).toLocaleDateString("ja-JP")}</span>
                </p>
              </div>
              <button
                onClick={() => handleApply(tpl)}
                disabled={applyingId === tpl.id}
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium rounded px-2.5 py-1 flex-shrink-0 border",
                  "text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
                )}
              >
                {applyingId === tpl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
                呼び出す
              </button>
              <button
                onClick={() => handleDelete(tpl)}
                className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0"
                title="保存データを削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">保存されたチェックリストはまだありません。</p>
      )}
    </div>
  );
}
