"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listDispatchRecords,
  addDispatchRecord,
  deleteDispatchRecord,
  japanPostTrackingUrl,
  DISPATCH_METHODS,
  type DispatchRecordRow,
} from "@/actions/dispatch-records";
import { Send, Plus, Trash2, Loader2, Check, X, AlertCircle, Calendar, MapPin, Package, ExternalLink } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

export function DispatchRecordsPanel({ applicationId }: { applicationId: string }) {
  const [rows, setRows] = useState<DispatchRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [dispatchDate, setDispatchDate] = useState("");
  const [destination, setDestination] = useState("");
  const [method, setMethod] = useState<string>(DISPATCH_METHODS[0]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [contents, setContents] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listDispatchRecords(applicationId);
    setLoading(false);
    if (!result.success || !result.rows) { setError(result.error ?? "読み込みに失敗しました"); return; }
    setRows(result.rows);
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setIsAdding(false);
    setDispatchDate("");
    setDestination("");
    setMethod(DISPATCH_METHODS[0]);
    setTrackingNumber("");
    setContents("");
  }

  function startAdd() {
    resetForm();
    setDispatchDate(today());
    setIsAdding(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await addDispatchRecord(applicationId, { dispatchDate, destination, method, trackingNumber, contents });
    setSaving(false);
    if (!result.success || !result.row) { setError(result.error ?? "保存に失敗しました"); return; }
    setRows((prev) => [result.row!, ...prev]);
    resetForm();
  }

  async function handleDelete(r: DispatchRecordRow) {
    if (!window.confirm("この郵送記録を削除しますか？")) return;
    const result = await deleteDispatchRecord(applicationId, r.id);
    if (!result.success) { setError(result.error ?? "削除に失敗しました"); return; }
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  }

  return (
    <div className="border border-teal-200 rounded-xl bg-teal-50/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-teal-200 bg-teal-100/60">
        <span className="text-sm font-semibold text-teal-900 flex items-center gap-1.5">
          <Send className="w-4 h-4" />
          郵送・発送記録
          {rows.length > 0 && <span className="text-xs font-normal text-teal-700">（{rows.length}件）</span>}
        </span>
        {!isAdding && (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-1 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg px-3 py-1.5"
          >
            <Plus className="w-3.5 h-3.5" />発送を記録
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
          <div className="bg-white border border-teal-200 rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-gray-400 flex flex-col gap-1">
                発送日
                <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-400" />
              </label>
              <label className="text-[11px] text-gray-400 flex flex-col gap-1">
                発送方法
                <select value={method} onChange={(e) => setMethod(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-400">
                  {DISPATCH_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <input value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="宛先（例: 大阪出入国在留管理局 / 〇〇株式会社 御中）"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400" autoFocus />
            <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="追跡番号（例: 1234-5678-9012）"
              className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400" />
            <textarea value={contents} onChange={(e) => setContents(e.target.value)} rows={2}
              placeholder="内容物（例: 在留カード、申請取次書類一式）"
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400" />
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-1 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg px-3 py-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}記録する
              </button>
              <button onClick={resetForm} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5">
                <X className="w-3.5 h-3.5" />キャンセル
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-teal-300"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : rows.length === 0 && !isAdding ? (
          <p className="text-xs text-gray-400 text-center py-6">郵送記録がありません。「発送を記録」から登録できます。</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="bg-white border border-teal-100 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
                      {r.dispatchDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{r.dispatchDate}</span>}
                      {r.method && <span className="flex items-center gap-1"><Package className="w-3 h-3 text-gray-400" />{r.method}</span>}
                    </div>
                    {r.destination && (
                      <p className="text-sm font-medium text-gray-800 flex items-center gap-1 break-words">
                        <MapPin className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />{r.destination}
                      </p>
                    )}
                    {r.contents && <p className="text-xs text-gray-600 whitespace-pre-wrap">{r.contents}</p>}
                    {r.trackingNumber && (
                      <a
                        href={japanPostTrackingUrl(r.trackingNumber)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono text-teal-600 hover:text-teal-800 hover:underline"
                        title="日本郵便の追跡サービスで開く"
                      >
                        追跡: {r.trackingNumber}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    )}
                  </div>
                  <button onClick={() => handleDelete(r)} className="p-1 text-gray-300 hover:text-red-600 flex-shrink-0" title="削除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
