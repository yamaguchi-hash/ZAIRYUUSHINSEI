"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listConsultationLogs,
  addConsultationLog,
  deleteConsultationLog,
  CONSULTATION_TYPES,
  type ConsultationLogRow,
} from "@/actions/consultation-logs";
import { MessagesSquare, Plus, Trash2, Loader2, Check, X, AlertCircle, Phone, Mail, Users, MessageCircle } from "lucide-react";

const TYPE_STYLE: Record<string, { icon: typeof Phone; color: string; bg: string }> = {
  "面談": { icon: Users, color: "text-blue-600", bg: "bg-blue-100" },
  "電話": { icon: Phone, color: "text-green-600", bg: "bg-green-100" },
  "メール": { icon: Mail, color: "text-purple-600", bg: "bg-purple-100" },
  "LINE": { icon: MessageCircle, color: "text-emerald-600", bg: "bg-emerald-100" },
  "その他": { icon: MessagesSquare, color: "text-gray-600", bg: "bg-gray-100" },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ConsultationLogsPanel({ applicationId }: { applicationId: string }) {
  const [rows, setRows] = useState<ConsultationLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [type, setType] = useState<string>("面談");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listConsultationLogs(applicationId);
    setLoading(false);
    if (!result.success || !result.rows) { setError(result.error ?? "読み込みに失敗しました"); return; }
    setRows(result.rows);
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setIsAdding(false);
    setType("面談");
    setSummary("");
    setDetails("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await addConsultationLog(applicationId, { type, summary, details });
    setSaving(false);
    if (!result.success || !result.row) { setError(result.error ?? "保存に失敗しました"); return; }
    setRows((prev) => [result.row!, ...prev]);
    resetForm();
  }

  async function handleDelete(r: ConsultationLogRow) {
    if (!window.confirm("この打合せ記録を削除しますか？")) return;
    const result = await deleteConsultationLog(applicationId, r.id);
    if (!result.success) { setError(result.error ?? "削除に失敗しました"); return; }
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  }

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-blue-200 bg-blue-100/60">
        <span className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
          <MessagesSquare className="w-4 h-4" />
          打合せ・相談履歴
          {rows.length > 0 && <span className="text-xs font-normal text-blue-700">（{rows.length}件）</span>}
        </span>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5"
          >
            <Plus className="w-3.5 h-3.5" />記録を追加
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
          </div>
        )}

        {isAdding && (
          <div className="bg-white border border-blue-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">種別:</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400"
              >
                {CONSULTATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="要約（例: 追加書類の依頼、方針の確認）"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
              autoFocus
            />
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              placeholder="詳細"
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}追加
              </button>
              <button onClick={resetForm} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5">
                <X className="w-3.5 h-3.5" />キャンセル
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-blue-300"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : rows.length === 0 && !isAdding ? (
          <p className="text-xs text-gray-400 text-center py-6">打合せ記録がありません。「記録を追加」から登録できます。</p>
        ) : (
          /* タイムライン表示 */
          <ol className="relative border-l-2 border-blue-100 ml-2 space-y-4">
            {rows.map((r) => {
              const st = TYPE_STYLE[r.type] ?? TYPE_STYLE["その他"];
              const Icon = st.icon;
              return (
                <li key={r.id} className="ml-4">
                  <span className={`absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full ${st.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${st.color}`} />
                  </span>
                  <div className="bg-white border border-blue-100 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${st.bg} ${st.color}`}>{r.type}</span>
                          <span className="text-[11px] text-gray-400">{fmtDateTime(r.createdAt)}</span>
                        </div>
                        {r.summary && <p className="text-sm font-medium text-gray-800 mt-1 break-words">{r.summary}</p>}
                      </div>
                      <button onClick={() => handleDelete(r)} className="p-1 text-gray-300 hover:text-red-600 flex-shrink-0" title="削除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {r.details && <p className="text-xs text-gray-600 whitespace-pre-wrap mt-1.5 leading-relaxed">{r.details}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
