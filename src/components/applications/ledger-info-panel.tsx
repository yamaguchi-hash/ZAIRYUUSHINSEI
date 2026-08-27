"use client";

import { useCallback, useEffect, useState } from "react";
import { getLegalLedger, upsertLegalLedger } from "@/actions/legal-ledger";
import { BookText, Loader2, Check, AlertCircle, CheckCircle } from "lucide-react";

export function LedgerInfoPanel({ applicationId }: { applicationId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [caseNumber, setCaseNumber] = useState("");
  const [acceptedAt, setAcceptedAt] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [status, setStatus] = useState("");
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getLegalLedger(applicationId);
    setLoading(false);
    if (!result.success) { setError(result.error ?? "読み込みに失敗しました"); return; }
    const r = result.row;
    if (r) {
      setCaseNumber(r.caseNumber ?? "");
      setAcceptedAt(r.acceptedAt ? String(r.acceptedAt).slice(0, 10) : "");
      setFeeAmount(r.feeAmount != null ? String(r.feeAmount) : "");
      setStatus(r.status ?? "");
      setCompletedAt(r.completedAt ? String(r.completedAt).slice(0, 10) : null);
    }
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await upsertLegalLedger(applicationId, {
      caseNumber, acceptedAt, feeAmount, status,
    });
    setSaving(false);
    if (!result.success || !result.row) { setError(result.error ?? "保存に失敗しました"); return; }
    const r = result.row;
    setCaseNumber(r.caseNumber ?? "");
    setAcceptedAt(r.acceptedAt ? String(r.acceptedAt).slice(0, 10) : "");
    setFeeAmount(r.feeAmount != null ? String(r.feeAmount) : "");
    setStatus(r.status ?? "");
    setCompletedAt(r.completedAt ? String(r.completedAt).slice(0, 10) : null);
    setSavedAt(Date.now());
  }

  return (
    <div className="border border-indigo-200 rounded-xl bg-indigo-50/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-200 bg-indigo-100/60">
        <BookText className="w-4 h-4 text-indigo-700" />
        <span className="text-sm font-semibold text-indigo-900">事件簿情報（行政書士法第11条）</span>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6 text-indigo-300"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] text-gray-500 flex flex-col gap-1">
                事件番号
                <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)}
                  placeholder="（案件番号を流用可）"
                  className="text-sm font-mono border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-indigo-400" />
              </label>
              <label className="text-[11px] text-gray-500 flex flex-col gap-1">
                受任日
                <input type="date" value={acceptedAt} onChange={(e) => setAcceptedAt(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-indigo-400" />
              </label>
              <label className="text-[11px] text-gray-500 flex flex-col gap-1">
                報酬額（円）
                <input value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} inputMode="numeric"
                  placeholder="例: 110000"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-indigo-400" />
              </label>
              <label className="text-[11px] text-gray-500 flex flex-col gap-1">
                備考・状況
                <input value={status} onChange={(e) => setStatus(e.target.value)}
                  placeholder="任意"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-indigo-400" />
              </label>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>完結日:</span>
              {completedAt ? (
                <span className="font-medium text-green-700 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />{completedAt}
                </span>
              ) : (
                <span className="text-gray-400">未完結（案件を「許可」「完了」にすると自動反映）</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}事件簿に保存
              </button>
              {savedAt && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />保存しました</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
