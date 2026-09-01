"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  evaluateChecklistFromMaster,
  groupByPreparer,
  validateInput,
  PREPARED_BY_LABELS,
  RELATIONSHIP_LABELS,
  SUPPORTER_INCOME_TYPE_LABELS,
  IDENTITY_DOC_LABELS,
  IDENTITY_DOC_OPTIONS_BY_RELATIONSHIP,
  FINANCIAL_PROOF_LABELS,
  EFFECTIVE_DATE_NOTE,
  LAST_REVIEWED_NOTE,
  TARGET_VISA_LABEL,
  TARGET_PROCEDURE_LABEL,
  SCOPE_WARNING,
  CAUTION_NOTES,
  OFFICIAL_LINKS,
  FAMILY_STAY_VISA_TYPE,
  FAMILY_STAY_COE_APPLICATION_TYPE,
  type ChecklistInput,
  type ChecklistDocument,
  type PreparedBy,
  type MasterDocRow,
  type Relationship,
  type IdentityDocKey,
  type FinancialProofKey,
} from "@/lib/kazoku-tairyu-coe-checklist";
import { getActiveDocumentRequirements, updateDocumentRequirement, createDocumentRequirement, setDocumentRequirementActive } from "@/actions/document-master";
import { addDocumentsToChecklist } from "@/actions/applications";
import { FamilyStayConditionsEditor } from "@/app/(dashboard)/document-master/family-stay-conditions-editor";
import {
  Printer, ExternalLink, Info, AlertTriangle, ClipboardList, Eye, EyeOff, Loader2, AlertCircle, ListPlus, CheckCircle2,
  Pencil, Trash2, Plus, Save, X,
} from "lucide-react";

// この機能で使う担当プリセット（必要書類マスターの自由記載欄に保存する文字列）
const PREPARED_BY_PRESETS = ["申請人", "扶養者", "申請代理人"];

const PREPARER_ACCENT: Record<PreparedBy, string> = {
  applicant: "border-blue-200 bg-blue-50/50",
  supporter: "border-emerald-200 bg-emerald-50/50",
  agent: "border-amber-200 bg-amber-50/50",
};

function todayJa(): string {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

interface Props {
  defaultCaseName?: string;
  defaultApplicantName?: string;
  defaultSupporterName?: string;
  /** 指定時のみ「必要書類チェックリストへ反映」ボタンを表示し、この案件のチェックリストへ追加する */
  applicationId?: string;
}

export function KazokuTairyuCoeChecklist({
  defaultCaseName = "",
  defaultApplicantName = "",
  defaultSupporterName = "",
  applicationId,
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const canEdit = ["expert", "admin"].includes((session?.user as any)?.role ?? "");
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");

  // ── 書類の編集（基本設定の機能をこの画面に統合） ──────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPreparedBy, setNewPreparedBy] = useState(PREPARED_BY_PRESETS[0]);
  const [newDescription, setNewDescription] = useState("");
  const [savingRow, setSavingRow] = useState(false);
  const [editError, setEditError] = useState("");

  const [relationship, setRelationship] = useState<Relationship>("spouse");
  const [supporterIncomeType, setSupporterIncomeType] = useState<ChecklistInput["supporterIncomeType"]>("income");
  const [identityDocs, setIdentityDocs] = useState<IdentityDocKey[]>([]);
  const [financialProofDocs, setFinancialProofDocs] = useState<FinancialProofKey[]>([]);
  const [attachApplicantPassportCopy, setAttachApplicantPassportCopy] = useState(false);

  const [caseName, setCaseName] = useState(defaultCaseName);
  const [applicantName, setApplicantName] = useState(defaultApplicantName);
  const [supporterName, setSupporterName] = useState(defaultSupporterName);
  const [showConditional, setShowConditional] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const [rows, setRows] = useState<MasterDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await getActiveDocumentRequirements(FAMILY_STAY_VISA_TYPE, FAMILY_STAY_COE_APPLICATION_TYPE);
    setLoading(false);
    if (!result.success || !result.rows) {
      setError(result.error ?? "必要書類マスターの読み込みに失敗しました");
      return;
    }
    setRows(result.rows);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 続柄を切り替えたら、その続柄で選択できない身分関係書類は選択解除する
  function handleRelationshipChange(next: Relationship) {
    setRelationship(next);
    const allowed = new Set(IDENTITY_DOC_OPTIONS_BY_RELATIONSHIP[next]);
    setIdentityDocs((prev) => prev.filter((k) => allowed.has(k)));
  }

  function toggleIdentityDoc(key: IdentityDocKey) {
    setIdentityDocs((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  function toggleFinancialProof(key: FinancialProofKey) {
    setFinancialProofDocs((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const input: ChecklistInput = useMemo(() => ({
    relationship, supporterIncomeType, identityDocs, financialProofDocs, attachApplicantPassportCopy,
  }), [relationship, supporterIncomeType, identityDocs, financialProofDocs, attachApplicantPassportCopy]);

  const warnings = useMemo(() => validateInput(input), [input]);
  const evaluated = useMemo(() => evaluateChecklistFromMaster(rows, input), [rows, input]);
  const visible = showConditional ? evaluated : evaluated.filter((d) => d.applicable);
  const groups = useMemo(() => groupByPreparer(visible), [visible]);
  const requiredCount = evaluated.filter((d) => d.applicable && d.status === "required").length;
  const optionalCount = evaluated.filter((d) => d.applicable && d.status === "optional").length;
  const rowsById = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r])), [rows]);

  async function handleSaveRow(id: string, patch: { documentName: string; description: string; preparedBy: string; conditions: Record<string, unknown> | null }) {
    setSavingRow(true);
    setEditError("");
    const result = await updateDocumentRequirement(id, patch);
    setSavingRow(false);
    if (!result.success) { setEditError(result.error ?? "保存に失敗しました"); return; }
    setEditingId(null);
    void load();
  }

  async function handleDeactivate(id: string, name: string) {
    if (!window.confirm(`「${name}」を必要書類一覧から外しますか？\n（無効化されます。復元は必要書類マスターの基本設定タブから行えます）`)) return;
    const result = await setDocumentRequirementActive(id, false);
    if (!result.success) { setEditError(result.error ?? "更新に失敗しました"); return; }
    void load();
  }

  async function handleAddNew() {
    if (!newName.trim()) { setEditError("書類名を入力してください"); return; }
    setSavingRow(true);
    setEditError("");
    const result = await createDocumentRequirement({
      visaType: FAMILY_STAY_VISA_TYPE,
      applicationType: FAMILY_STAY_COE_APPLICATION_TYPE,
      documentName: newName,
      description: newDescription,
      preparedBy: newPreparedBy,
      isAlwaysRequired: false,
    });
    setSavingRow(false);
    if (!result.success) { setEditError(result.error ?? "追加に失敗しました"); return; }
    setNewName(""); setNewDescription(""); setNewPreparedBy(PREPARED_BY_PRESETS[0]); setAddingNew(false);
    void load();
  }

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
      {/* 対象範囲の注意（画面上に明確に表示） */}
      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-800 print:hidden">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{SCOPE_WARNING}</span>
      </div>

      {/* 印刷ヘッダー（画面では非表示・印刷時のみ表示） */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">家族滞在｜在留資格認定証明書交付申請　必要書類一覧</h1>
        <div className="text-xs mt-1 grid grid-cols-2 gap-x-8 gap-y-0.5">
          <span>案件名：{caseName || "—"}</span>
          <span>作成日：{todayJa()}</span>
          <span>申請人名：{applicantName || "—"}</span>
          <span>続柄：{RELATIONSHIP_LABELS[relationship]}</span>
          <span>扶養者名：{supporterName || "—"}</span>
          <span>基準：{EFFECTIVE_DATE_NOTE}</span>
        </div>
        <hr className="my-2 border-gray-400" />
      </div>

      {/* 基準日・対象手続バナー */}
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 print:hidden">
        <Info className="w-4 h-4 flex-shrink-0" />
        対象：{TARGET_VISA_LABEL}｜{TARGET_PROCEDURE_LABEL}。<strong className="mx-1">{EFFECTIVE_DATE_NOTE}</strong>（{LAST_REVIEWED_NOTE}）。
        {canEdit ? "各行の編集アイコンから書類・条件を直接編集できます。" : "書類ルールの編集には権限が必要です。"}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2 print:hidden">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* 未選択の必須入力項目 */}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 print:hidden">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />未選択の必須項目があります
          </p>
          <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* 入力・条件（印刷時は非表示） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:hidden">
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500">申請条件</p>

          <div>
            <p className="text-sm text-gray-700 mb-1">続柄 <span className="text-red-500">*</span></p>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="続柄">
              {(Object.entries(RELATIONSHIP_LABELS) as [Relationship, string][]).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={relationship === v}
                  onClick={() => handleRelationshipChange(v)}
                  className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    relationship === v ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-700 mb-1">扶養者の収入状況 <span className="text-red-500">*</span></p>
            <div className="flex flex-col gap-1">
              {(Object.entries(SUPPORTER_INCOME_TYPE_LABELS) as [ChecklistInput["supporterIncomeType"], string][]).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="radio"
                    name="supporterIncomeType"
                    checked={supporterIncomeType === v}
                    onChange={() => setSupporterIncomeType(v)}
                    className="accent-blue-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-700 mb-1">身分関係を証する書類 <span className="text-red-500">*</span></p>
            <div className="flex flex-col gap-1">
              {IDENTITY_DOC_OPTIONS_BY_RELATIONSHIP[relationship].map((key) => (
                <label key={key} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={identityDocs.includes(key)}
                    onChange={() => toggleIdentityDoc(key)}
                    className="accent-blue-600"
                  />
                  {IDENTITY_DOC_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          {supporterIncomeType === "other" && (
            <div>
              <p className="text-sm text-gray-700 mb-1">扶養者の資力を証する資料（いずれか） <span className="text-red-500">*</span></p>
              <div className="flex flex-col gap-1">
                {(Object.entries(FINANCIAL_PROOF_LABELS) as [FinancialProofKey, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={financialProofDocs.includes(key)}
                      onChange={() => toggleFinancialProof(key)}
                      className="accent-blue-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-100">
            <span className="text-sm text-gray-700">申請人のパスポート写しを添付する（任意・推奨）</span>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
              {[{ v: true, t: "はい" }, { v: false, t: "いいえ" }].map((o) => (
                <button
                  key={o.t}
                  type="button"
                  aria-pressed={attachApplicantPassportCopy === o.v}
                  onClick={() => setAttachApplicantPassportCopy(o.v)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    attachApplicantPassportCopy === o.v ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {o.t}
                </button>
              ))}
            </div>
          </div>
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
            <label className="label-xs">扶養者名</label>
            <input className="input-field" value={supporterName} onChange={(e) => setSupporterName(e.target.value)} placeholder="扶養者名" />
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
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-gray-400" />
                必要書類 <span className="font-semibold text-gray-800">{requiredCount}</span> 件
              </span>
              {optionalCount > 0 && (
                <span className="text-xs text-gray-400">（任意・推奨 {optionalCount} 件）</span>
              )}
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
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { setAddingNew((v) => !v); setEditingId(null); setEditError(""); }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg px-3 py-2"
                >
                  <Plus className="w-3.5 h-3.5" />書類を追加
                </button>
              )}
              {applicationId && (
                <button
                  type="button"
                  onClick={handleApplyToChecklist}
                  disabled={applying || requiredCount === 0 || warnings.length > 0}
                  title={warnings.length > 0 ? "未選択の必須項目を解消してから反映してください" : "表示中の必要書類を、この案件の「必要書類チェックリスト」へ追加します"}
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

          {editError && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 print:hidden">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{editError}
            </div>
          )}

          {addingNew && canEdit && (
            <div className="border border-rose-200 bg-rose-50/50 rounded-xl p-4 space-y-2 print:hidden">
              <p className="text-xs font-semibold text-rose-700">新しい書類を追加</p>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="書類名"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-rose-400"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">担当:</span>
                <select
                  value={newPreparedBy}
                  onChange={(e) => setNewPreparedBy(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600"
                >
                  {PREPARED_BY_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="提出要件・補足（任意）"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:border-rose-400"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddNew}
                  disabled={savingRow || !newName.trim()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  {savingRow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}追加する
                </button>
                <button
                  type="button"
                  onClick={() => setAddingNew(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5"
                >
                  <X className="w-3.5 h-3.5" />キャンセル
                </button>
              </div>
              <p className="text-[11px] text-gray-400">追加後、必要に応じて一覧の行から「適用条件を設定」できます。</p>
            </div>
          )}

          {/* 準備者別の一覧表 */}
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              {canEdit ? "書類が登録されていません。上の「書類を追加」から登録してください。" : "書類が登録されていません。"}
            </p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.preparedBy} className={`border rounded-xl overflow-hidden ${PREPARER_ACCENT[g.preparedBy]}`}>
                  <div className="px-4 py-2 border-b border-black/5 text-sm font-semibold text-gray-800">
                    {PREPARED_BY_LABELS[g.preparedBy]}
                  </div>
                  <div className="overflow-x-auto bg-white/70">
                    <table className="w-full text-sm min-w-[680px]">
                      <thead>
                        <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                          <th className="py-2 px-3 w-10"></th>
                          <th className="py-2 px-3 font-medium">書類名</th>
                          <th className="py-2 px-3 font-medium">提出要件・補足</th>
                          <th className="py-2 px-3 font-medium w-24">提出状況</th>
                          {canEdit && <th className="py-2 px-3 w-20 print:hidden"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {g.docs.map((d) => (
                          <Row
                            key={d.id}
                            d={d}
                            checked={!!checked[d.id]}
                            onToggle={() => setChecked((p) => ({ ...p, [d.id]: !p[d.id] }))}
                            canEdit={canEdit}
                            isEditing={editingId === d.id}
                            onStartEdit={() => { setEditingId(d.id); setAddingNew(false); setEditError(""); }}
                            onCancelEdit={() => setEditingId(null)}
                            onDeactivate={() => handleDeactivate(d.id, d.name)}
                            masterRow={rowsById[d.id]}
                            onSave={(patch) => handleSaveRow(d.id, patch)}
                            saving={savingRow}
                          />
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
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600 space-y-0.5">
        {CAUTION_NOTES.map((n) => <p key={n}>※ {n}</p>)}
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

function Row({
  d, checked, onToggle, canEdit, isEditing, onStartEdit, onCancelEdit, onDeactivate, masterRow, onSave, saving,
}: {
  d: ChecklistDocument; checked: boolean; onToggle: () => void;
  canEdit: boolean; isEditing: boolean; onStartEdit: () => void; onCancelEdit: () => void; onDeactivate: () => void;
  masterRow: MasterDocRow | undefined;
  onSave: (patch: { documentName: string; description: string; preparedBy: string; conditions: Record<string, unknown> | null }) => void;
  saving: boolean;
}) {
  const inapplicable = !d.applicable;
  const exempt = d.status === "exempt";
  const optional = d.status === "optional";

  if (isEditing && masterRow) {
    return (
      <tr className="border-b border-gray-50 bg-rose-50/30">
        <td colSpan={canEdit ? 5 : 4} className="p-3">
          <RowEditForm masterRow={masterRow} onSave={onSave} onCancel={onCancelEdit} saving={saving} />
        </td>
      </tr>
    );
  }

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
          {optional && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500">任意・推奨</span>}
          {exempt && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">不要</span>}
          {d.conditional && !optional && !inapplicable && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">条件付き</span>}
          {inapplicable && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">この条件では不要</span>}
        </div>
        {d.conditional && d.reason && !inapplicable && (
          <p className="text-[11px] text-indigo-500 mt-0.5">＊{d.reason}</p>
        )}
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-600 leading-relaxed">{d.requirement}</td>
      <td className="py-2.5 px-3 text-xs text-gray-400">{checked ? "準備済み" : "未提出"}</td>
      {canEdit && (
        <td className="py-2.5 px-3 print:hidden">
          <div className="flex items-center gap-1 justify-end">
            <button type="button" onClick={onStartEdit} className="p-1 text-gray-300 hover:text-rose-600" title="編集">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={onDeactivate} className="p-1 text-gray-300 hover:text-red-500" title="一覧から外す（無効化）">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

function RowEditForm({
  masterRow, onSave, onCancel, saving,
}: {
  masterRow: MasterDocRow;
  onSave: (patch: { documentName: string; description: string; preparedBy: string; conditions: Record<string, unknown> | null }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(masterRow.documentName);
  const [description, setDescription] = useState(masterRow.description ?? "");
  const [preparedBy, setPreparedBy] = useState(masterRow.preparedBy ?? PREPARED_BY_PRESETS[0]);
  const [conditions, setConditions] = useState<Record<string, unknown> | null>(
    (masterRow.conditions as Record<string, unknown> | null) ?? null
  );

  return (
    <div className="space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full text-sm font-medium border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-rose-400"
        placeholder="書類名"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400">担当:</span>
        <select
          value={PREPARED_BY_PRESETS.includes(preparedBy) ? preparedBy : "__other__"}
          onChange={(e) => setPreparedBy(e.target.value === "__other__" ? "" : e.target.value)}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600"
        >
          {PREPARED_BY_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          <option value="__other__">その他（自由記載）</option>
        </select>
        {!PREPARED_BY_PRESETS.includes(preparedBy) && (
          <input
            value={preparedBy}
            onChange={(e) => setPreparedBy(e.target.value)}
            placeholder="担当を自由記載"
            className="text-xs border border-purple-200 rounded px-2 py-1 w-32 bg-purple-50"
          />
        )}
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:border-rose-400"
        placeholder="提出要件・補足"
      />
      <FamilyStayConditionsEditor value={conditions} onChange={setConditions} />
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSave({ documentName: name, description, preparedBy, conditions })}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5"
        >
          <X className="w-3.5 h-3.5" />キャンセル
        </button>
      </div>
    </div>
  );
}
