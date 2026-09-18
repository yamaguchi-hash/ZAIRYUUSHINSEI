import Link from "next/link";
import { listCaseLedgerRegister } from "@/actions/legal-ledger";
import { APPLICATION_STATUS_LABELS } from "@/lib/utils";
import { BookText, User, Building2, ExternalLink, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  immigration: "入管",
  transportation: "運送業",
  construction: "建設業",
  other: "その他",
};

function formatFee(v: number | null): string {
  if (v == null) return "—";
  return `¥${v.toLocaleString("ja-JP")}`;
}

export default async function LegalLedgerPage() {
  const result = await listCaseLedgerRegister();
  const rows = result.success ? (result.rows ?? []) : [];

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-2 mb-1">
        <BookText className="w-6 h-6 text-indigo-600" />
        <h1 className="text-xl font-bold text-gray-900">事件簿</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        行政書士法第11条に基づく事件簿。受任した案件の受任日・依頼者・受任事項・報酬額・完結日を一覧します。
        受任日・報酬額は各案件詳細の「事件簿情報」から登録できます。
      </p>

      {!result.success && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{result.error ?? "読み込みに失敗しました"}
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full text-sm min-w-[880px]">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="px-3 py-2.5 font-medium">事件番号</th>
              <th className="px-3 py-2.5 font-medium">受任日</th>
              <th className="px-3 py-2.5 font-medium">依頼者</th>
              <th className="px-3 py-2.5 font-medium">受任事項</th>
              <th className="px-3 py-2.5 font-medium text-right">報酬額</th>
              <th className="px-3 py-2.5 font-medium">完結日</th>
              <th className="px-3 py-2.5 font-medium">状況</th>
              <th className="px-3 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-400 text-sm">
                  対象の案件がありません。
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">{r.caseNumber ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{r.acceptedAt ?? <span className="text-gray-300">未登録</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 text-gray-800">
                      {r.clientType === "corporate" ? (
                        <Building2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      ) : r.clientType === "individual" ? (
                        <User className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      ) : null}
                      <span className="truncate max-w-[12rem]">{r.clientName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 flex-shrink-0">
                        {CATEGORY_LABELS[r.businessCategory] ?? r.businessCategory}
                      </span>
                      <span className="text-gray-700 truncate max-w-[14rem]">{r.subject}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap font-medium text-gray-800">{formatFee(r.feeAmount)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                    {r.completedAt ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="text-xs text-gray-600">
                      {APPLICATION_STATUS_LABELS[r.applicationStatus] ?? r.applicationStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <Link
                      href={`/applications/${r.applicationId}`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      開く<ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">全 {rows.length} 件（削除済み案件を除く）</p>
      )}
    </div>
  );
}
