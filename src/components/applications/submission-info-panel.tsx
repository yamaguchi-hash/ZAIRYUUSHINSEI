"use client";

import { useState } from "react";
import { saveSubmissionInfo } from "@/actions/applications";
import { Save, CheckCircle, Loader2, FileText } from "lucide-react";

interface Props {
  applicationId: string;
  savedData?: { applicationDate?: string; applicationNumber?: string };
}

export function SubmissionInfoPanel({ applicationId, savedData }: Props) {
  const [applicationDate,   setApplicationDate]   = useState(savedData?.applicationDate   ?? "");
  const [applicationNumber, setApplicationNumber] = useState(savedData?.applicationNumber ?? "");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(!!savedData?.applicationDate || !!savedData?.applicationNumber);
  const [error,   setError]   = useState("");

  async function handleSave() {
    if (!applicationDate && !applicationNumber) {
      setError("申請日または申請番号を入力してください");
      return;
    }
    setSaving(true);
    setError("");
    const result = await saveSubmissionInfo(applicationId, { applicationDate, applicationNumber });
    setSaving(false);
    if (result.success) {
      setSaved(true);
    } else {
      setError(result.error ?? "保存に失敗しました");
    }
  }

  return (
    <div className="border border-teal-200 rounded-xl bg-teal-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-teal-200 bg-teal-100">
        <FileText className="w-4 h-4 text-teal-700" />
        <span className="text-sm font-semibold text-teal-800">⑦ 申請情報の記録</span>
        {saved && (
          <span className="ml-auto flex items-center gap-1 text-xs text-teal-600">
            <CheckCircle className="w-3.5 h-3.5" />保存済
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-teal-600">
          入管に申請書類を提出した後、申請日と申請番号を記録してください。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 申請日 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              申請日
            </label>
            <input
              type="date"
              value={applicationDate}
              onChange={e => { setApplicationDate(e.target.value); setSaved(false); }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200 bg-white"
            />
          </div>

          {/* 申請番号 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              申請番号
            </label>
            <input
              type="text"
              value={applicationNumber}
              onChange={e => { setApplicationNumber(e.target.value); setSaved(false); }}
              placeholder="例：申26番第12345号"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200 bg-white"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 rounded-lg transition-colors"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
            : <><Save className="w-4 h-4" />申請情報を保存</>}
        </button>
      </div>
    </div>
  );
}
