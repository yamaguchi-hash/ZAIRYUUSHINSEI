"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getCustomerHistory,
  type CustomerCaseRow,
  type CustomerLogRow,
  type CustomerFileRow,
} from "@/actions/customer-history";
import { APPLICATION_STATUS_LABELS } from "@/lib/utils";
import {
  FolderKanban, MessagesSquare, Paperclip, Clock, ExternalLink, Loader2,
  AlertCircle, FileText, BookText,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  immigration: "入管",
  transportation: "運送業",
  construction: "建設業",
  other: "その他",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function formatFee(v: number | null): string {
  return v == null ? "—" : `¥${v.toLocaleString("ja-JP")}`;
}
function isImage(f: { mimeType: string | null; fileName: string }): boolean {
  if (f.mimeType) return f.mimeType.startsWith("image/");
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.fileName);
}

type Tab = "cases" | "logs" | "files";

export function CustomerHistoryPanel(props: { applicantId?: string; organizationId?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cases, setCases] = useState<CustomerCaseRow[]>([]);
  const [logs, setLogs] = useState<CustomerLogRow[]>([]);
  const [files, setFiles] = useState<CustomerFileRow[]>([]);
  const [tab, setTab] = useState<Tab>("cases");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getCustomerHistory({
      applicantId: props.applicantId,
      organizationId: props.organizationId,
    });
    setLoading(false);
    if (!result.success) { setError(result.error ?? "読み込みに失敗しました"); return; }
    setCases(result.cases ?? []);
    setLogs(result.logs ?? []);
    setFiles(result.files ?? []);
  }, [props.applicantId, props.organizationId]);

  useEffect(() => { void load(); }, [load]);

  const tabs: { key: Tab; label: string; icon: typeof FolderKanban; count: number }[] = [
    { key: "cases", label: "過去の案件（事件簿）", icon: FolderKanban, count: cases.length },
    { key: "logs", label: "打合せ・メール記録", icon: MessagesSquare, count: logs.length },
    { key: "files", label: "保管書類（PDF等）", icon: Paperclip, count: files.length },
  ];

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <BookText className="w-4 h-4 text-slate-600" />
        <span className="text-sm font-semibold text-slate-800">顧客履歴（全案件の一元表示）</span>
      </div>

      {/* タブ */}
      <div className="flex flex-wrap gap-1 px-3 pt-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${active ? "bg-white/20" : "bg-white text-slate-500"}`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 mb-3">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-300"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : tab === "cases" ? (
          cases.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">この顧客に紐づく案件はまだありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="py-1.5 pr-2 font-medium">受任事項</th>
                    <th className="py-1.5 px-2 font-medium">受任日</th>
                    <th className="py-1.5 px-2 font-medium text-right">報酬額</th>
                    <th className="py-1.5 px-2 font-medium">完結日</th>
                    <th className="py-1.5 px-2 font-medium">状況</th>
                    <th className="py-1.5 pl-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="py-2 pr-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 flex-shrink-0">{CATEGORY_LABELS[c.businessCategory] ?? c.businessCategory}</span>
                          <span className="text-gray-700 truncate max-w-[12rem]">{c.subject}</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap text-gray-600">{c.acceptedAt ?? "—"}</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap text-gray-700">{formatFee(c.feeAmount)}</td>
                      <td className="py-2 px-2 whitespace-nowrap text-gray-600">{c.completedAt ?? "—"}</td>
                      <td className="py-2 px-2 whitespace-nowrap text-gray-600">{APPLICATION_STATUS_LABELS[c.status] ?? c.status}</td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap">
                        <Link href={`/applications/${c.id}`} className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline">開く<ExternalLink className="w-3 h-3" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "logs" ? (
          logs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">打合せ・メール記録はまだありません。</p>
          ) : (
            <ul className="space-y-1.5">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 flex-shrink-0">{l.type}</span>
                  <span className="text-xs text-gray-700 truncate flex-1">{l.summary || "（要約なし）"}</span>
                  <span className="text-[11px] text-gray-400 flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" />{fmtDate(l.createdAt)}</span>
                  <Link href={`/applications/${l.applicationId}`} className="text-indigo-500 hover:text-indigo-700 flex-shrink-0" title="案件を開く"><ExternalLink className="w-3.5 h-3.5" /></Link>
                </li>
              ))}
            </ul>
          )
        ) : (
          files.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">保管書類はまだありません。</p>
          ) : (
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <a
                    href={f.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-700 hover:text-blue-600 truncate flex-1 flex items-center gap-1"
                    title={f.fileName}
                  >
                    <span className="truncate">{f.fileName}</span>
                    <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />
                  </a>
                  {f.documentLabel && <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:inline">{f.documentLabel}</span>}
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtDate(f.uploadedAt)}</span>
                  <Link href={`/applications/${f.applicationId}`} className="text-indigo-500 hover:text-indigo-700 flex-shrink-0" title="案件を開く"><ExternalLink className="w-3.5 h-3.5" /></Link>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
