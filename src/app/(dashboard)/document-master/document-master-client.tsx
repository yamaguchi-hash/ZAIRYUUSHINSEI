"use client";

/**
 * 必要書類マスター編集クライアント
 * ──────────────────────────────
 * 在留資格×申請種別を選択して、該当する必要書類の一覧を編集する。
 * 各行: 並び順（↑↓）/ 書類名 / 担当（申請人・受入企業・弊所・その他自由記載）/
 *       原本・写し / 注意事項 / 必須 / 有効・無効
 */
import { useCallback, useEffect, useState } from "react";
import {
  listDocumentRequirements,
  createDocumentRequirement,
  updateDocumentRequirement,
  setDocumentRequirementActive,
  reorderDocumentRequirements,
  saveDocumentTemplate,
  listDocumentTemplates,
  getDocumentTemplate,
  updateDocumentTemplate,
  applyDocumentTemplate,
  deleteDocumentTemplate,
  type DocMasterRow,
  type DocTemplateRow,
  type DocTemplateItem,
} from "@/actions/document-master";
import { Card, CardContent } from "@/components/ui/card";
import { ConditionsEditor } from "./document-conditions-editor";
import { FamilyStayConditionsEditor } from "./family-stay-conditions-editor";
import { GIJINKOKU_VISA_TYPE, GIJINKOKU_RENEWAL_APPLICATION_TYPE } from "@/lib/gijinkoku-renewal-checklist";
import { FAMILY_STAY_VISA_TYPE, FAMILY_STAY_COE_APPLICATION_TYPE } from "@/lib/kazoku-tairyu-coe-checklist";
import { GijinkokuRenewalChecklist } from "@/components/checklist/gijinkoku-renewal-checklist";
import { KazokuTairyuCoeChecklist } from "@/components/checklist/kazoku-tairyu-coe-checklist";
import { VISA_TYPE_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Loader2, Plus, ArrowUp, ArrowDown, Save, Trash2, RotateCcw, AlertCircle,
  BookmarkPlus, FolderOpen, Check, GripVertical, Pencil, X,
} from "lucide-react";

// 申請種別（マスターのapplicationType）。"all" は全申請種別に共通で適用される行
const APP_TYPES: { value: string; label: string }[] = [
  { value: "certification", label: "在留資格認定証明書交付申請" },
  { value: "change", label: "在留資格変更許可申請" },
  { value: "renewal", label: "在留期間更新許可申請" },
  { value: "permanent_residence", label: "永住許可申請" },
  { value: "all", label: "（全申請種別に共通）" },
];

// 技人国・更新チェックリストの「派遣先」、家族滞在・COEチェックリストの「扶養者」「申請代理人」を含む
const PREPARED_BY_PRESETS = ["申請人", "受入企業", "弊所", "扶養者", "申請代理人", "派遣先"];
const ORIGINAL_OR_COPY_OPTIONS = ["", "原本", "写し", "原本＋写し", "提示のみ"];

interface RowState extends DocMasterRow {
  dirty?: boolean;
  saving?: boolean;
  /** 担当セレクタが「その他（自由記載）」モードかどうか */
  preparedByOther?: boolean;
}

export function DocumentMasterClient() {
  const visaTypes: { value: string; label: string }[] = [
    ...Object.entries(VISA_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    { value: "common", label: "（全在留資格に共通）" },
  ];

  const [visaType, setVisaType] = useState<string>(visaTypes[0]?.value ?? "");
  const [appType, setAppType] = useState<string>("change");

  // 技人国・更新 / 家族滞在・COE は、条件付き自動チェックリストが使える組み合わせ。
  // この場合は下の「一覧」「新規追加」の代わりにチェックリスト画面（編集機能つき）を表示する。
  const isGijinkokuRenewal = visaType === GIJINKOKU_VISA_TYPE && appType === GIJINKOKU_RENEWAL_APPLICATION_TYPE;
  const isFamilyStayCoe = visaType === FAMILY_STAY_VISA_TYPE && appType === FAMILY_STAY_COE_APPLICATION_TYPE;
  const hasChecklist = isGijinkokuRenewal || isFamilyStayCoe;
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // 新規追加フォーム
  const [newName, setNewName] = useState("");
  const [newPreparedBy, setNewPreparedBy] = useState("");
  const [newPreparedByOther, setNewPreparedByOther] = useState(false);
  const [newOriginalOrCopy, setNewOriginalOrCopy] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [adding, setAdding] = useState(false);

  // テンプレート（名前を付けて保存した必要書類一覧）
  const [templates, setTemplates] = useState<DocTemplateRow[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateNote, setTemplateNote] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState("");
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // テンプレートの直接編集（保存済みテンプレートの中身をその場で編集）
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editItems, setEditItems] = useState<(DocTemplateItem & { preparedByOther?: boolean })[]>([]);
  const [editDragIdx, setEditDragIdx] = useState<number | null>(null);
  const [editDragOverIdx, setEditDragOverIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await listDocumentRequirements(visaType, appType);
    setLoading(false);
    if (!result.success || !result.rows) {
      setError(result.error ?? "読み込みに失敗しました");
      return;
    }
    setRows(result.rows.map((r) => ({
      ...r,
      preparedByOther: !!r.preparedBy && !PREPARED_BY_PRESETS.includes(r.preparedBy),
    })));
  }, [visaType, appType]);

  const loadTemplates = useCallback(async () => {
    const result = await listDocumentTemplates(visaType, appType);
    if (result.success && result.rows) setTemplates(result.rows);
  }, [visaType, appType]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadTemplates(); setTemplateMessage(""); }, [loadTemplates]);

  async function handleSaveTemplate() {
    if (!templateName.trim()) { setError("テンプレート名を入力してください"); return; }
    setSavingTemplate(true);
    setError("");
    setTemplateMessage("");
    const result = await saveDocumentTemplate({
      name: templateName,
      visaType,
      applicationType: appType,
      note: templateNote,
    });
    setSavingTemplate(false);
    if (!result.success) { setError(result.error ?? "保存に失敗しました"); return; }
    setTemplateName(""); setTemplateNote("");
    setTemplateMessage("テンプレートを保存しました");
    void loadTemplates();
  }

  async function handleApplyTemplate(tpl: DocTemplateRow) {
    if (!window.confirm(
      `「${tpl.name}」（${tpl.itemCount}件）を呼び出します。\n\n` +
      `現在この組み合わせに登録されている書類はすべて無効化され、テンプレートの内容に置き換わります。\n` +
      `（無効化した書類は「無効の書類も表示」から復元できます）\n\n実行しますか？`
    )) return;
    setApplyingId(tpl.id);
    setError("");
    setTemplateMessage("");
    const result = await applyDocumentTemplate(tpl.id);
    setApplyingId(null);
    if (!result.success) { setError(result.error ?? "呼び出しに失敗しました"); return; }
    setTemplateMessage(`テンプレートを適用しました（${result.count} 件）`);
    void load();
  }

  async function handleDeleteTemplate(tpl: DocTemplateRow) {
    if (!window.confirm(`テンプレート「${tpl.name}」を削除しますか？`)) return;
    const result = await deleteDocumentTemplate(tpl.id);
    if (!result.success) { setError(result.error ?? "削除に失敗しました"); return; }
    if (editingTemplateId === tpl.id) closeEditTemplate();
    void loadTemplates();
  }

  // ── テンプレートの直接編集 ─────────────────────────────────────────
  async function openEditTemplate(tpl: DocTemplateRow) {
    setEditingTemplateId(tpl.id);
    setEditLoading(true);
    setEditError("");
    setTemplateMessage("");
    const result = await getDocumentTemplate(tpl.id);
    setEditLoading(false);
    if (!result.success || !result.template) {
      setEditError(result.error ?? "テンプレートの読み込みに失敗しました");
      return;
    }
    setEditName(result.template.name);
    setEditNote(result.template.note ?? "");
    setEditItems(result.template.items.map((it) => ({
      ...it,
      preparedByOther: !!it.preparedBy && !PREPARED_BY_PRESETS.includes(it.preparedBy),
    })));
  }

  function closeEditTemplate() {
    setEditingTemplateId(null);
    setEditItems([]);
    setEditName("");
    setEditNote("");
    setEditError("");
    setEditDragIdx(null);
    setEditDragOverIdx(null);
  }

  function patchEditItem(idx: number, patch: Partial<DocTemplateItem & { preparedByOther?: boolean }>) {
    setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeEditItem(idx: number) {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addEditItem() {
    setEditItems((prev) => [
      ...prev,
      {
        documentName: "",
        description: null,
        preparedBy: null,
        originalOrCopy: null,
        isAlwaysRequired: false,
        sortOrder: (prev.length + 1) * 10,
      },
    ]);
  }

  function handleEditDrop(targetIdx: number) {
    const sourceIdx = editDragIdx;
    setEditDragIdx(null);
    setEditDragOverIdx(null);
    if (sourceIdx === null || sourceIdx === targetIdx) return;
    setEditItems((prev) => {
      const list = [...prev];
      const [moved] = list.splice(sourceIdx, 1);
      list.splice(targetIdx, 0, moved);
      return list;
    });
  }

  async function saveEditTemplate() {
    if (!editingTemplateId) return;
    if (!editName.trim()) { setEditError("テンプレート名を入力してください"); return; }
    if (editItems.length === 0) { setEditError("書類を1件以上登録してください"); return; }
    if (editItems.some((it) => !it.documentName.trim())) { setEditError("書類名が未入力の行があります"); return; }
    setEditSaving(true);
    setEditError("");
    const result = await updateDocumentTemplate(editingTemplateId, {
      name: editName,
      note: editNote,
      items: editItems.map(({ preparedByOther: _preparedByOther, ...it }) => it),
    });
    setEditSaving(false);
    if (!result.success) { setEditError(result.error ?? "保存に失敗しました"); return; }
    setTemplateMessage("テンプレートを更新しました");
    closeEditTemplate();
    void loadTemplates();
  }

  function patchRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)));
  }

  async function saveRow(row: RowState) {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: true } : r)));
    const result = await updateDocumentRequirement(row.id, {
      documentName: row.documentName,
      description: row.description ?? "",
      preparedBy: row.preparedBy ?? "",
      originalOrCopy: row.originalOrCopy ?? "",
      isAlwaysRequired: row.isAlwaysRequired,
      conditions: row.conditions,
    });
    if (!result.success) {
      setError(result.error ?? "保存に失敗しました");
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: false } : r)));
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, saving: false, dirty: false } : r)));
  }

  async function toggleActive(row: RowState) {
    const next = !row.isActive;
    if (!next && !window.confirm(`「${row.documentName}」を無効にしますか？\n（書類セレクタ・自動追加の対象から外れます。後から復元できます）`)) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)));
    const result = await setDocumentRequirementActive(row.id, next);
    if (!result.success) {
      setError(result.error ?? "更新に失敗しました");
      void load();
    }
  }

  // 表示中の一覧（画面に見えている順序）上で隣接行と入れ替える。
  // サーバー側で「隣接行」を再計算する方式だと、無効化済み（非表示）の書類が
  // 間に挟まっている場合にその書類と入れ替わってしまい、画面上の並びが
  // 変化しない（＝変更前の位置に戻ったように見える）不具合があったため、
  // ドラッグ＆ドロップと同じ「画面に見えている順序をそのままサーバーへ送る」方式に統一する。
  function move(row: RowState, direction: "up" | "down") {
    const list = [...visibleRows];
    const idx = list.findIndex((r) => r.id === row.id);
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;
    [list[idx], list[targetIdx]] = [list[targetIdx], list[idx]];

    setRows((prev) => {
      const visibleIds = new Set(list.map((r) => r.id));
      let vi = 0;
      return prev.map((r) => (visibleIds.has(r.id) ? list[vi++] : r));
    });

    void (async () => {
      const result = await reorderDocumentRequirements(list.map((r) => r.id));
      if (!result.success) {
        setError(result.error ?? "並び替えの保存に失敗しました");
        void load();
      }
    })();
  }

  // ── ドラッグ＆ドロップによる並び替え ─────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    const sourceId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    // 表示中の一覧上で並び替え（無効の書類が非表示の場合、その行の位置は変えない）
    const list = [...visibleRows];
    const from = list.findIndex((r) => r.id === sourceId);
    const to = list.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);

    // 楽観的更新: rows内の表示対象スロットを新しい順序で置き換える
    setRows((prev) => {
      const visibleIds = new Set(list.map((r) => r.id));
      let vi = 0;
      return prev.map((r) => (visibleIds.has(r.id) ? list[vi++] : r));
    });

    // サーバーへ一括保存（失敗時は再読み込みで巻き戻す）
    void (async () => {
      const result = await reorderDocumentRequirements(list.map((r) => r.id));
      if (!result.success) {
        setError(result.error ?? "並び替えの保存に失敗しました");
        void load();
      }
    })();
  }

  async function handleAdd() {
    if (!newName.trim()) { setError("書類名を入力してください"); return; }
    setAdding(true);
    setError("");
    const result = await createDocumentRequirement({
      visaType,
      applicationType: appType,
      documentName: newName,
      description: newDescription,
      preparedBy: newPreparedBy,
      originalOrCopy: newOriginalOrCopy,
      isAlwaysRequired: newRequired,
    });
    setAdding(false);
    if (!result.success) { setError(result.error ?? "追加に失敗しました"); return; }
    setNewName(""); setNewDescription(""); setNewPreparedBy("");
    setNewPreparedByOther(false); setNewOriginalOrCopy(""); setNewRequired(false);
    void load();
  }

  const visibleRows = showInactive ? rows : rows.filter((r) => r.isActive);
  const inactiveCount = rows.filter((r) => !r.isActive).length;

  return (
    <div className="space-y-4">
      {/* 対象の選択 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">在留資格の種別</label>
              <select
                value={visaType}
                onChange={(e) => setVisaType(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
              >
                {visaTypes.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">在留申請の種別</label>
              <select
                value={appType}
                onChange={(e) => setAppType(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400"
              >
                {APP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ※「（全在留資格に共通）」「（全申請種別に共通）」の行は、該当するすべての組み合わせのチェックリストに適用されます。
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* テンプレート（名前を付けて保存・呼び出し） */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <BookmarkPlus className="w-4 h-4 text-emerald-600" />
              必要書類一覧のテンプレート
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              現在の設定内容に名前を付けて保存し、後から呼び出して同じ一覧を再現できます（保存対象は有効な書類のみ）。
            </p>
          </div>

          {/* 保存 */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="テンプレート名（例: 建設分野・標準セット）"
              className="flex-1 min-w-[240px] text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
            />
            <input
              value={templateNote}
              onChange={(e) => setTemplateNote(e.target.value)}
              placeholder="メモ（任意）"
              className="flex-1 min-w-[180px] text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-600 focus:outline-none focus:border-emerald-400"
            />
            <button
              onClick={handleSaveTemplate}
              disabled={savingTemplate || !templateName.trim()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
              現在の内容を保存
            </button>
          </div>

          {templateMessage && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
              <Check className="w-3.5 h-3.5" />{templateMessage}
            </p>
          )}

          {/* 保存済みテンプレート一覧 */}
          {templates.length > 0 ? (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
              {templates.map((tpl) => (
                <div key={tpl.id}>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <FolderOpen className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{tpl.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {tpl.itemCount} 件
                        {tpl.note && <span className="ml-2">{tpl.note}</span>}
                        <span className="ml-2">{new Date(tpl.createdAt).toLocaleDateString("ja-JP")}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => (editingTemplateId === tpl.id ? closeEditTemplate() : openEditTemplate(tpl))}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium rounded px-2.5 py-1 flex-shrink-0 border",
                        editingTemplateId === tpl.id
                          ? "text-gray-600 border-gray-300 bg-gray-100 hover:bg-gray-200"
                          : "text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100"
                      )}
                    >
                      {editingTemplateId === tpl.id
                        ? <><X className="w-3 h-3" />閉じる</>
                        : <><Pencil className="w-3 h-3" />編集</>}
                    </button>
                    <button
                      onClick={() => handleApplyTemplate(tpl)}
                      disabled={applyingId === tpl.id}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded px-2.5 py-1 disabled:opacity-50 flex-shrink-0"
                    >
                      {applyingId === tpl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
                      呼び出す
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(tpl)}
                      className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0"
                      title="テンプレートを削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* テンプレート編集パネル */}
                  {editingTemplateId === tpl.id && (
                    <div className="px-3 pb-3 bg-blue-50/40 border-t border-blue-100">
                      {editLoading ? (
                        <div className="flex items-center justify-center py-8 text-gray-400">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-3 pt-3">
                          {editError && (
                            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              {editError}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="テンプレート名"
                              className="flex-1 min-w-[200px] text-sm font-medium border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-blue-400"
                            />
                            <input
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              placeholder="メモ（任意）"
                              className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:border-blue-400"
                            />
                          </div>

                          <div className="border border-white bg-white rounded-lg divide-y divide-gray-50">
                            {editItems.map((it, idx) => (
                              <div
                                key={idx}
                                onDragOver={(e) => { e.preventDefault(); if (editDragIdx !== null && editDragIdx !== idx) setEditDragOverIdx(idx); }}
                                onDragLeave={() => { if (editDragOverIdx === idx) setEditDragOverIdx(null); }}
                                onDrop={(e) => { e.preventDefault(); handleEditDrop(idx); }}
                                className={cn(
                                  "px-3 py-2",
                                  editDragIdx === idx && "opacity-40",
                                  editDragOverIdx === idx && editDragIdx !== idx && "bg-blue-50 border-t-2 border-blue-400"
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  <div
                                    draggable
                                    onDragStart={(e) => { setEditDragIdx(idx); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(idx)); }}
                                    onDragEnd={() => { setEditDragIdx(null); setEditDragOverIdx(null); }}
                                    className="p-1 mt-1 text-gray-300 hover:text-blue-500 cursor-grab active:cursor-grabbing flex-shrink-0"
                                    title="ドラッグして並び替え"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-1.5">
                                    <input
                                      value={it.documentName}
                                      onChange={(e) => patchEditItem(idx, { documentName: e.target.value })}
                                      placeholder="書類名"
                                      className="w-full text-sm border border-gray-200 rounded px-2.5 py-1 focus:outline-none focus:border-blue-400"
                                    />
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-400">担当:</span>
                                        <select
                                          value={it.preparedByOther ? "__other__" : (it.preparedBy ?? "")}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === "__other__") {
                                              patchEditItem(idx, { preparedByOther: true, preparedBy: PREPARED_BY_PRESETS.includes(it.preparedBy ?? "") ? "" : it.preparedBy });
                                            } else {
                                              patchEditItem(idx, { preparedByOther: false, preparedBy: v });
                                            }
                                          }}
                                          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600"
                                        >
                                          <option value="">—</option>
                                          {PREPARED_BY_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                                          <option value="__other__">その他（自由記載）</option>
                                        </select>
                                        {it.preparedByOther && (
                                          <input
                                            value={it.preparedBy ?? ""}
                                            onChange={(e) => patchEditItem(idx, { preparedBy: e.target.value })}
                                            placeholder="担当を自由記載"
                                            className="text-xs border border-purple-200 rounded px-2 py-1 w-36 bg-purple-50"
                                          />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-400">原本/写し:</span>
                                        <select
                                          value={it.originalOrCopy ?? ""}
                                          onChange={(e) => patchEditItem(idx, { originalOrCopy: e.target.value })}
                                          className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600"
                                        >
                                          {ORIGINAL_OR_COPY_OPTIONS.map((o) => (
                                            <option key={o} value={o}>{o === "" ? "—" : o}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={it.isAlwaysRequired}
                                          onChange={(e) => patchEditItem(idx, { isAlwaysRequired: e.target.checked })}
                                        />
                                        必須
                                      </label>
                                    </div>
                                    <input
                                      value={it.description ?? ""}
                                      onChange={(e) => patchEditItem(idx, { description: e.target.value })}
                                      placeholder="注意事項（任意）"
                                      className="w-full text-xs border border-gray-200 rounded px-2.5 py-1 text-gray-600 focus:outline-none focus:border-blue-400"
                                    />
                                  </div>
                                  <button
                                    onClick={() => removeEditItem(idx)}
                                    className="p-1 mt-1 text-gray-300 hover:text-red-500 flex-shrink-0"
                                    title="この行を削除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center justify-between">
                            <button
                              onClick={addEditItem}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded px-2.5 py-1"
                            >
                              <Plus className="w-3 h-3" />
                              行を追加
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={closeEditTemplate}
                                className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1"
                              >
                                キャンセル
                              </button>
                              <button
                                onClick={saveEditTemplate}
                                disabled={editSaving}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                              >
                                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                テンプレートを保存
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">この組み合わせに保存されたテンプレートはまだありません。</p>
          )}
        </CardContent>
      </Card>

      {/* この組み合わせに条件付き自動チェックリストがある場合は、一覧・新規追加の代わりに
          チェックリスト画面（編集機能つき）を表示する（申請条件・案件情報の入力欄も含む）。 */}
      {isGijinkokuRenewal && <GijinkokuRenewalChecklist />}
      {isFamilyStayCoe && <KazokuTairyuCoeChecklist />}

      {!hasChecklist && (
      <>
      {/* 一覧 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm text-gray-600">
              {loading ? "読み込み中..." : `${visibleRows.length} 件`}
              {inactiveCount > 0 && !showInactive && (
                <span className="text-xs text-gray-400 ml-2">（無効 {inactiveCount} 件は非表示）</span>
              )}
            </p>
            {inactiveCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                無効の書類も表示
              </label>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              この組み合わせの書類はまだ登録されていません。下のフォームから追加してください。
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {visibleRows.map((row, idx) => (
                <div
                  key={row.id}
                  onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== row.id) setDragOverId(row.id); }}
                  onDragLeave={() => { if (dragOverId === row.id) setDragOverId(null); }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(row.id); }}
                  className={cn(
                    "px-4 py-3 transition-colors",
                    !row.isActive && "opacity-50 bg-gray-50",
                    dragId === row.id && "opacity-40",
                    dragOverId === row.id && dragId !== row.id && "bg-blue-50 border-t-2 border-blue-400"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* 並び順（ドラッグハンドル＋↑↓） */}
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-1">
                      <div
                        draggable
                        onDragStart={(e) => {
                          setDragId(row.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", row.id);
                        }}
                        onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                        className="p-0.5 text-gray-300 hover:text-blue-500 cursor-grab active:cursor-grabbing"
                        title="ドラッグして並び替え"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <button
                        onClick={() => move(row, "up")}
                        disabled={idx === 0}
                        className="p-0.5 text-gray-300 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-gray-300"
                        title="上へ"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] text-gray-400 text-center">{idx + 1}</span>
                      <button
                        onClick={() => move(row, "down")}
                        disabled={idx === visibleRows.length - 1}
                        className="p-0.5 text-gray-300 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-gray-300"
                        title="下へ"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      {/* 書類名 */}
                      <input
                        value={row.documentName}
                        onChange={(e) => patchRow(row.id, { documentName: e.target.value })}
                        className="w-full text-sm font-medium border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                        placeholder="書類名"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 担当 */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400">担当:</span>
                          <select
                            value={row.preparedByOther ? "__other__" : (row.preparedBy ?? "")}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "__other__") {
                                patchRow(row.id, { preparedByOther: true, preparedBy: PREPARED_BY_PRESETS.includes(row.preparedBy ?? "") ? "" : row.preparedBy });
                              } else {
                                patchRow(row.id, { preparedByOther: false, preparedBy: v });
                              }
                            }}
                            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600 focus:outline-none focus:border-purple-300"
                          >
                            <option value="">—</option>
                            {PREPARED_BY_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                            <option value="__other__">その他（自由記載）</option>
                          </select>
                          {row.preparedByOther && (
                            <input
                              value={row.preparedBy ?? ""}
                              onChange={(e) => patchRow(row.id, { preparedBy: e.target.value })}
                              placeholder="担当を自由記載"
                              className="text-xs border border-purple-200 rounded px-2 py-1 w-40 bg-purple-50 focus:outline-none focus:border-purple-400"
                            />
                          )}
                        </div>
                        {/* 原本・写し */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400">原本/写し:</span>
                          <select
                            value={row.originalOrCopy ?? ""}
                            onChange={(e) => patchRow(row.id, { originalOrCopy: e.target.value })}
                            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600 focus:outline-none focus:border-blue-300"
                          >
                            {ORIGINAL_OR_COPY_OPTIONS.map((o) => (
                              <option key={o} value={o}>{o === "" ? "—" : o}</option>
                            ))}
                          </select>
                        </div>
                        {/* 必須 */}
                        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={row.isAlwaysRequired}
                            onChange={(e) => patchRow(row.id, { isAlwaysRequired: e.target.checked })}
                          />
                          必須（自動追加対象）
                        </label>
                      </div>
                      {/* 注意事項 */}
                      <input
                        value={row.description ?? ""}
                        onChange={(e) => patchRow(row.id, { description: e.target.value })}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:border-blue-400"
                        placeholder="注意事項（チェックリストにℹ表示されます）"
                      />
                      {/* 適用条件（自動チェックリストタブが使用。対象の組み合わせのみエディタを表示） */}
                      {visaType === GIJINKOKU_VISA_TYPE && appType === GIJINKOKU_RENEWAL_APPLICATION_TYPE && (
                        <ConditionsEditor
                          value={row.conditions}
                          onChange={(conditions) => patchRow(row.id, { conditions })}
                        />
                      )}
                      {visaType === FAMILY_STAY_VISA_TYPE && appType === FAMILY_STAY_COE_APPLICATION_TYPE && (
                        <FamilyStayConditionsEditor
                          value={row.conditions}
                          onChange={(conditions) => patchRow(row.id, { conditions })}
                        />
                      )}
                    </div>

                    {/* 操作 */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-1">
                      {row.dirty && (
                        <button
                          onClick={() => saveRow(row)}
                          disabled={row.saving}
                          className="inline-flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded px-2.5 py-1 disabled:opacity-50"
                        >
                          {row.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          保存
                        </button>
                      )}
                      <button
                        onClick={() => toggleActive(row)}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs rounded px-2 py-1 border",
                          row.isActive
                            ? "text-gray-400 border-gray-200 hover:text-red-500 hover:border-red-200"
                            : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        )}
                        title={row.isActive ? "無効にする（一覧から除外）" : "有効に戻す"}
                      >
                        {row.isActive ? <Trash2 className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                        {row.isActive ? "無効化" : "復元"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新規追加 */}
      <Card>
        <CardContent className="py-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-500" />
            書類を追加（{visaTypes.find((v) => v.value === visaType)?.label} × {APP_TYPES.find((t) => t.value === appType)?.label}）
          </p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="書類名（例: 住民票の写し）"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">担当:</span>
              <select
                value={newPreparedByOther ? "__other__" : newPreparedBy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__other__") { setNewPreparedByOther(true); setNewPreparedBy(""); }
                  else { setNewPreparedByOther(false); setNewPreparedBy(v); }
                }}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600"
              >
                <option value="">—</option>
                {PREPARED_BY_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                <option value="__other__">その他（自由記載）</option>
              </select>
              {newPreparedByOther && (
                <input
                  value={newPreparedBy}
                  onChange={(e) => setNewPreparedBy(e.target.value)}
                  placeholder="担当を自由記載"
                  className="text-xs border border-purple-200 rounded px-2 py-1 w-40 bg-purple-50"
                />
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">原本/写し:</span>
              <select
                value={newOriginalOrCopy}
                onChange={(e) => setNewOriginalOrCopy(e.target.value)}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600"
              >
                {ORIGINAL_OR_COPY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o === "" ? "—" : o}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} />
              必須（自動追加対象）
            </label>
          </div>
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="注意事項（任意）"
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            追加する
          </button>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
