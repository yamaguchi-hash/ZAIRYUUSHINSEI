"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import { addDocumentsToChecklist, addCustomDocumentToChecklist, applyDocumentTemplateToChecklist } from "@/actions/applications";
import {
  PlusCircle, ChevronDown, ChevronRight, CheckSquare,
  Loader2, Search, ListChecks, X, FilePlus, FolderOpen, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentMaster {
  id: string;
  documentName: string;
  description: string | null;
  isAlwaysRequired: boolean;
  conditions: any;
  sortOrder: number;
  /** 必要書類マスターで設定した担当（申請人/受入企業/弊所/自由記載） */
  preparedBy?: string | null;
  /** 必要書類マスターで設定した原本/写し区分 */
  originalOrCopy?: string | null;
}

interface ChecklistItem {
  id: string;
  documentName: string;
  documentRequirementId: string | null;
  isRequiredByExpert: boolean;
  status: string;
}

interface TemplateOption {
  id: string;
  name: string;
  note: string | null;
  itemCount: number;
}

interface Props {
  applicationId: string;
  masterDocuments: DocumentMaster[];
  checklist: ChecklistItem[];
  /** この案件の在留資格・申請種別に合わせて保存されているテンプレート */
  templates?: TemplateOption[];
}

export function DocumentSelector({ applicationId, masterDocuments, checklist, templates = [] }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addingDocId, setAddingDocId] = useState<string | null>(null);
  const [isAddingCustom, startAddCustom] = useTransition();
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [customName, setCustomName] = useState("");
  const [customError, setCustomError] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  // 既にチェックリストに登録済みのdocumentRequirementId
  const addedIds = useMemo(
    () => new Set(checklist.map((c) => c.documentRequirementId).filter(Boolean) as string[]),
    [checklist]
  );

  // カテゴリー別にグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, DocumentMaster[]>();
    const filtered = search.trim()
      ? masterDocuments.filter((d) =>
          d.documentName.includes(search) || (d.description ?? "").includes(search)
        )
      : masterDocuments;

    for (const doc of filtered) {
      const cat = (doc.conditions as any)?.category ?? "その他";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(doc);
    }
    return map;
  }, [masterDocuments, search]);

  // 書類を1件だけ即時追加する（クリックした行がそのままチェックリストに反映される）
  function handleAddOne(docId: string) {
    setMessage("");
    setAddingDocId(docId);
    void (async () => {
      const result = await addDocumentsToChecklist(applicationId, [docId]);
      setAddingDocId(null);
      if (!result.success) {
        setMessage(`エラー: ${result.error}`);
      }
    })();
  }

  function handleAddCustom() {
    const name = customName.trim();
    if (!name) { setCustomError("書類名を入力してください"); return; }
    setCustomError("");
    startAddCustom(async () => {
      const result = await addCustomDocumentToChecklist(applicationId, name);
      if (result.success) {
        setCustomName("");
        setMessage(`「${name}」を追加しました`);
        setTimeout(() => setMessage(""), 3000);
        customInputRef.current?.focus();
      } else {
        setCustomError(result.error ?? "追加に失敗しました");
      }
    });
  }

  function handleApplyTemplate(tpl: TemplateOption) {
    setMessage("");
    setApplyingTemplateId(tpl.id);
    void (async () => {
      const result = await applyDocumentTemplateToChecklist(applicationId, tpl.id);
      setApplyingTemplateId(null);
      if (!result.success) {
        setMessage(`エラー: ${result.error}`);
        return;
      }
      if (result.count && result.count > 0) {
        setMessage(`テンプレート「${tpl.name}」から${result.count}件を追加しました`);
      } else {
        setMessage(`テンプレート「${tpl.name}」の書類はすべて追加済みです`);
      }
      setTimeout(() => setMessage(""), 4000);
    })();
  }

  return (
    <div className="mt-4 space-y-2">
      {/* テンプレートから一括反映 */}
      {templates.length > 0 && (
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-3">
          <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5 mb-2">
            <FolderOpen className="w-3.5 h-3.5" />
            必要書類マスターのテンプレートから一括反映
          </p>
          <div className="space-y-1.5">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-2 bg-white border border-emerald-100 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{tpl.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {tpl.itemCount} 件{tpl.note && <span className="ml-2">{tpl.note}</span>}
                  </p>
                </div>
                <button
                  onClick={() => handleApplyTemplate(tpl)}
                  disabled={applyingTemplateId === tpl.id}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded px-2.5 py-1 disabled:opacity-50 flex-shrink-0"
                >
                  {applyingTemplateId === tpl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
                  反映する
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div className={cn("px-3 py-2 rounded-lg text-xs font-medium", message.startsWith("エラー") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700")}>
          {message}
        </div>
      )}

      {/* 操作ボタン行 */}
      <div className="flex gap-2">
        {/* 書類選択パネルトグル */}
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex-1 flex items-center justify-between px-4 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors text-sm font-medium text-blue-800"
        >
          <span className="flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            入管必要書類から個別に選んで追加
          </span>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
          {/* ヘッダー操作 */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 border-b border-gray-200 flex-wrap">
            {/* 検索 */}
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="書類名で検索..."
                className="flex-1 text-xs outline-none bg-transparent"
              />
              {search && <button onClick={() => setSearch("")}><X className="w-3 h-3 text-gray-400" /></button>}
            </div>
            <p className="text-[11px] text-gray-400 whitespace-nowrap">書類をクリックすると1件ずつ追加されます</p>
          </div>

          {/* 書類リスト（カテゴリー別） */}
          <div className="max-h-96 overflow-y-auto">
            {grouped.size === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                {search ? `「${search}」に一致する書類がありません` : "書類がありません"}
              </p>
            ) : (
              [...grouped.entries()].map(([category, docs]) => (
                <CategoryGroup
                  key={category}
                  category={category}
                  docs={docs}
                  addedIds={addedIds}
                  addingDocId={addingDocId}
                  onAdd={handleAddOne}
                />
              ))
            )}
          </div>

          {/* ── その他書類を直接追加 ── */}
          <div className="border-t border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
              <FilePlus className="w-3.5 h-3.5" />
              その他必要書類を追加
            </p>
            <div className="flex gap-2">
              <input
                ref={customInputRef}
                type="text"
                value={customName}
                onChange={(e) => { setCustomName(e.target.value); setCustomError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustom(); } }}
                placeholder="書類名を入力（例：推薦状、雇用証明書等）"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 bg-white"
              />
              <button
                onClick={handleAddCustom}
                disabled={isAddingCustom || !customName.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isAddingCustom
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <PlusCircle className="w-3.5 h-3.5" />}
                追加
              </button>
            </div>
            {customError && (
              <p className="text-xs text-red-500 mt-1">{customError}</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// カテゴリーグループ（折りたたみ可能）
function CategoryGroup({
  category, docs, addedIds, addingDocId, onAdd,
}: {
  category: string;
  docs: DocumentMaster[];
  addedIds: Set<string>;
  addingDocId: string | null;
  onAdd: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const addedCount = docs.filter((d) => addedIds.has(d.id)).length;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        <span className="text-xs font-semibold text-gray-700 flex-1">{category}</span>
        <span className="text-xs text-gray-400">
          {addedCount > 0 && <span className="text-green-600 mr-1">{addedCount}件追加済</span>}
          {`${docs.length}件`}
        </span>
      </button>

      {open && (
        <div>
          {docs.map((doc) => {
            const isAdded = addedIds.has(doc.id);
            const isAdding = addingDocId === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => !isAdded && !isAdding && onAdd(doc.id)}
                disabled={isAdded || isAdding}
                className={cn(
                  "w-full flex items-start gap-3 px-5 py-2.5 text-left transition-colors",
                  isAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-50"
                )}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {isAdded ? (
                    <CheckSquare className="w-4 h-4 text-green-600" />
                  ) : isAdding ? (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  ) : (
                    <PlusCircle className="w-4 h-4 text-gray-300" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-gray-800 block">
                    {doc.documentName}
                  </span>
                  {/* 必要書類マスターの設定（担当・原本/写し・必須） */}
                  <span className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {doc.isAlwaysRequired && (
                      <span className="text-xs text-red-500 font-medium">必須</span>
                    )}
                    {doc.preparedBy && (
                      <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                        担当: {doc.preparedBy}
                      </span>
                    )}
                    {doc.originalOrCopy && (
                      <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {doc.originalOrCopy}
                      </span>
                    )}
                  </span>
                  {doc.description && (
                    <span className="text-xs text-blue-600 block mt-0.5 leading-relaxed">
                      ℹ {doc.description}
                    </span>
                  )}
                </span>
                {isAdded && <span className="text-xs text-green-600 flex-shrink-0 mt-0.5 flex items-center gap-0.5"><Check className="w-3 h-3" />追加済</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
