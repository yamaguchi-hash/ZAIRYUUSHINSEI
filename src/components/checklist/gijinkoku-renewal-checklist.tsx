"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  evaluateChecklistFromMaster,
  groupByPreparer,
  PREPARED_BY_LABELS,
  EFFECTIVE_DATE_NOTE,
  OFFICIAL_LINKS,
  CAUTION_NOTE,
  GIJINKOKU_VISA_TYPE,
  GIJINKOKU_RENEWAL_APPLICATION_TYPE,
  type ChecklistInput,
  type ChecklistDocument,
  type PreparedBy,
  type MasterDocRow,
} from "@/lib/gijinkoku-renewal-checklist";
import { getActiveDocumentRequirements } from "@/actions/document-master";
import { addDocumentsToChecklist } from "@/actions/applications";
import { Printer, ExternalLink, Info, ClipboardList, Eye, EyeOff, Loader2, AlertCircle, ListPlus, CheckCircle2 } from "lucide-react";

const PREPARER_ACCENT: Record<PreparedBy, string> = {
  applicant: "border-blue-200 bg-blue-50/50",
  organization: "border-emerald-200 bg-emerald-50/50",
  dispatch_destination: "border-amber-200 bg-amber-50/50",
};

function todayJa(): string {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// ── Yes/No セグメント ─────────────────────────────────────────────────────────
function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0" role="group" aria-label={label}>
        {[{ v: true, t: "はい" }, { v: false, t: "いいえ" }].map((o) => (
          <button
            key={o.t}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              value === o.v ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  defaultCaseName?: string;
  defaultApplicantName?: string;
  defaultOrganizationName?: string;
  /** 指定時のみ「必要書類チェックリストへ反映」ボタンを表示し、この案件のチェックリストへ追加する */
  applicationId?: string;
}

export function GijinkokuRenewalChecklist({
  defaultCaseName = "",
  defaultApplicantName = "",
  defaultOrganizationName = "",
  applicationId,
}: Props) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");
  const [input, setInput] = useState<ChecklistInput>({
    orgCategory: 1,
    dispatchWork: false,
    firstUpdateAfterTransfer: false,
    changeToLanguageWork: false,
    photoException: false,
  });
  const [caseName, setCaseName] = useState(defaultCaseName);
  const [applicantName, setApplicantName] = useState(defaultApplicantName);
  const [organizationName, setOrganizationName] = useState(defaultOrganizationName);
  const [showConditional, setShowConditional] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const [rows, setRows] = useState<MasterDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await getActiveDocumentRequirements(GIJINKOKU_VISA_TYPE, GIJINKOKU_RENEWAL_APPLICATION_TYPE);
    setLoading(false);
    if (!result.success || !result.rows) {
      setError(result.error ?? "必要書類マスターの読み込みに失敗しました");
      return;
    }
    setRows(result.rows);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof ChecklistInput>(k: K, v: ChecklistInput[K]) => setInput((p) => ({ ...p, [k]: v }));

  const evaluated = useMemo(() => evaluateChecklistFromMaster(rows, input), [rows, input]);
  const visible = showConditional ? evaluated : evaluated.filter((d) => d.applicable);
  const groups = useMemo(() => groupByPreparer(visible), [visible]);
  const requiredCount = evaluated.filter((d) => d.applicable && d.status === "required").length;

  async function handleApplyToChecklist() {
    if (!applicationId) return;
    const ids = evaluated.filter((d) => d.applicable && d.status !== "exempt").map((d) => d.id);
    if (ids.length === 0) return;
    setApplying(true);
    setApplyMessage("");
    const result = await addDocumentsToChecklist(applicationId, ids);
    setApplying(false);
    if (!result.success) {
      setApplyMessage(result.error ?? "反映に失敗しました");
      return;
    }
    setApplyMessage(`必要書類チェックリストへ反映しました（${ids.length}件）`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* 印刷ヘッダー（画面では非表示・印刷時のみ表示） */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">技術・人文知識・国際業務｜在留期間更新許可申請　必要書類一覧</h1>
        <div className="text-xs mt-1 grid grid-cols-2 gap-x-8 gap-y-0.5">
          <span>案件名：{caseName || "—"}</span>
          <span>作成日：{todayJa()}</span>
          <span>申請人名：{applicantName || "—"}</span>
          <span>法令基準：{EFFECTIVE_DATE_NOTE}</span>
          <span>所属機関名：{organizationName || "—"}</span>
        </div>
        <hr className="my-2 border-gray-400" />
      </div>

      {/* 基準日バナー */}
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 print:hidden">
        <Info className="w-4 h-4 flex-shrink-0" />
        本一覧は<strong className="mx-1">{EFFECTIVE_DATE_NOTE}</strong>としています。将来の法改正で変更される場合があります。
        書類ルールは「必要書類マスター」の基本設定タブから編集できます。
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2 print:hidden">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* 入力・条件（印刷時は非表示） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
        <div className="border border-gray-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-semibold text-gray-500 mb-2">申請条件</p>

          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-sm text-gray-700">所属機関カテゴリー <span className="text-red-500">*</span></span>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="所属機関カテゴリー">
              {[1, 2, 3, 4].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={input.orgCategory === c}
                  onClick={() => set("orgCategory", c as 1 | 2 | 3 | 4)}
                  className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    input.orgCategory === c ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <YesNo label="派遣契約に基づく就労" value={input.dispatchWork} onChange={(v) => set("dispatchWork", v)} />
          <YesNo label="カテゴリー3・4の会社へ転職後、初めての更新" value={input.firstUpdateAfterTransfer} onChange={(v) => set("firstUpdateAfterTransfer", v)} />
          <YesNo label="主に言語能力を用いる対人業務への変更" value={input.changeToLanguageWork} onChange={(v) => set("changeToLanguageWork", v)} />
          <YesNo label="写真提出の例外に該当" value={input.photoException} onChange={(v) => set("photoException", v)} />
        </div>

        <div className="border border-gray-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 mb-2">案件情報（印刷ヘッダーに表示）</p>
          <div>
            <label className="label-xs">案件名</label>
            <input className="input-field" value={caseName} onChange={(e) => setCaseName(e.target.value)} placeholder="案件名" />
          </div>
          <div>
            <label className="label-xs">申請人名</label>
            <input className="input-field" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} placeholder="申請人名" />
          </div>
          <div>
            <label className="label-xs">所属機関名</label>
            <input className="input-field" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="所属機関名" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 print:hidden">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* ツールバー */}
          <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <ClipboardList className="w-4 h-4 text-gray-400" />
              必要書類 <span className="font-semibold text-gray-800">{requiredCount}</span> 件
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowConditional((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2"
              >
                {showConditional ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showConditional ? "条件付き書類を隠す" : "条件付き書類を表示"}
              </button>
              {applicationId && (
                <button
                  type="button"
                  onClick={handleApplyToChecklist}
                  disabled={applying || requiredCount === 0}
                  title="表示中の必要書類を、この案件の「必要書類チェックリスト」へ追加します"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 disabled:opacity-50"
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                  必要書類チェックリストへ反映
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-2"
              >
                <Printer className="w-4 h-4" />印刷 / PDF保存
              </button>
            </div>
          </div>

          {applyMessage && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 print:hidden">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{applyMessage}
            </p>
          )}

          {/* 準備者別の一覧表 */}
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              必要書類マスターに書類が登録されていません（基本設定タブから登録してください）。
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.preparedBy} className={`border rounded-xl overflow-hidden ${PREPARER_ACCENT[g.preparedBy]}`}>
                  <div className="px-4 py-2 border-b border-black/5 text-sm font-semibold text-gray-800">
                    {PREPARED_BY_LABELS[g.preparedBy]}
                  </div>
                  <div className="overflow-x-auto bg-white/70">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                          <th className="py-2 px-3 w-10"></th>
                          <th className="py-2 px-3 font-medium">書類名</th>
                          <th className="py-2 px-3 font-medium">提出要件・補足</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.docs.map((d) => (
                          <Row key={d.id} d={d} checked={!!checked[d.id]} onToggle={() => setChecked((p) => ({ ...p, [d.id]: !p[d.id] }))} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 注意書き */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
        ※ {CAUTION_NOTE}
      </div>

      {/* 公式情報リンク */}
      <div className="rounded-lg border border-gray-200 px-4 py-3 print:hidden">
        <p className="text-xs font-semibold text-gray-500 mb-2">公式情報（出入国在留管理庁）</p>
        <ul className="space-y-1">
          {OFFICIAL_LINKS.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline">
                {l.label}<ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ d, checked, onToggle }: { d: ChecklistDocument; checked: boolean; onToggle: () => void }) {
  const inapplicable = !d.applicable;
  const exempt = d.status === "exempt";
  return (
    <tr className={`border-b border-gray-50 align-top ${inapplicable ? "opacity-45" : ""}`}>
      <td className="py-2.5 px-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`${d.name} を準備済みにする`}
          className="w-4 h-4 accent-blue-600 mt-0.5"
        />
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-800">{d.name}</span>
          {exempt && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">不要</span>}
          {d.conditional && !inapplicable && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">条件付き</span>}
          {inapplicable && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">この条件では不要</span>}
        </div>
        {d.conditional && d.reason && !inapplicable && (
          <p className="text-[11px] text-indigo-500 mt-0.5">＊{d.reason}</p>
        )}
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-600 leading-relaxed">{d.requirement}</td>
    </tr>
  );
}
