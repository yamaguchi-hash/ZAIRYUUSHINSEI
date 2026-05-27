"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import { addDocumentsToChecklist, removeDocumentFromChecklist, addCustomDocumentToChecklist } from "@/actions/applications";
import {
  PlusCircle, Trash2, ChevronDown, ChevronRight, CheckSquare,
  Square, Loader2, Search, ListChecks, X, FilePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentMaster {
  id: string;
  documentName: string;
  description: string | null;
  isAlwaysRequired: boolean;
  conditions: any;
  sortOrder: number;
}

interface ChecklistItem {
  id: string;
  documentName: string;
  documentRequirementId: string | null;
  isRequiredByExpert: boolean;
  status: string;
}

interface Props {
  applicationId: string;
  masterDocuments: DocumentMaster[];
  checklist: ChecklistItem[];
}

export function DocumentSelector({ applicationId, masterDocuments, checklist }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [isRemoving, startRemove] = useTransition();
  const [isAddingCustom, startAddCustom] = useTransition();
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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const ids = masterDocuments
      .filter((d) => !addedIds.has(d.id))
      .map((d) => d.id);
    setSelected(new Set(ids));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleAdd() {
    if (selected.size === 0) return;
    setMessage("");
    startTransition(async () => {
      const result = await addDocumentsToChecklist(applicationId, [...selected]);
      if (result.success) {
        setSelected(new Set());
        setMessage(`${selected.size}件を追加しました`);
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage(`エラー: ${result.error}`);
      }
    });
  }

  function handleRemove(itemId: string) {
    startRemove(async () => {
      await removeDocumentFromChecklist(itemId);
    });
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

  // 未追加の選択件数
  const selectableCount = [...selected].filter((id) => !addedIds.has(id)).length;

  return (
    <div className="mt-4">
      {/* 書類選択パネルトグル */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors text-sm font-medium text-blue-800"
      >
        <span className="flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          入管必要書類から選択して追加
        </span>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

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
            <button onClick={selectAll} className="text-xs text-blue-600 hover:underline whitespace-nowrap">全選択</button>
            <button onClick={clearAll} className="text-xs text-gray-500 hover:underline whitespace-nowrap">解除</button>
            <button
              onClick={handleAdd}
              disabled={selectableCount === 0 || isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ml-auto whitespace-nowrap"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
              {selectableCount > 0 ? `${selectableCount}件を追加` : "チェックリストに追加"}
            </button>
          </div>

          {message && (
            <div className={cn("px-4 py-2 text-xs font-medium", message.startsWith("エラー") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700")}>
              {message}
            </div>
          )}

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
                  selected={selected}
                  addedIds={addedIds}
                  onToggle={toggleSelect}
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

      {/* 現在のチェックリスト（削除ボタン付き） */}
      {checklist.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-gray-500 font-medium px-1">登録済み書類（{checklist.length}件）</p>
          {checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm group">
              <span className="flex-1 truncate text-gray-800">{item.documentName}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full flex-shrink-0",
                item.status === "approved" ? "bg-green-100 text-green-700" :
                item.status === "submitted" ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-500"
              )}>
                {item.status === "approved" ? "承認" : item.status === "submitted" ? "提出済" : "未提出"}
              </span>
              <button
                onClick={() => handleRemove(item.id)}
                disabled={isRemoving}
                className="text-gray-300 hover:text-red-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
                title="チェックリストから削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// カテゴリーグループ（折りたたみ可能）
function CategoryGroup({
  category, docs, selected, addedIds, onToggle,
}: {
  category: string;
  docs: DocumentMaster[];
  selected: Set<string>;
  addedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const checkedCount = docs.filter((d) => selected.has(d.id)).length;
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
          {checkedCount > 0 && <span className="text-blue-600">{checkedCount}件選択中</span>}
          {addedCount === 0 && checkedCount === 0 && `${docs.length}件`}
        </span>
      </button>

      {open && (
        <div>
          {docs.map((doc, idx) => {
            const isAdded = addedIds.has(doc.id);
            const isSelected = selected.has(doc.id);
            // 在留カード両面セットの判定（表面の直後に裏面が来る場合）
            const isCardFront = /在留カード（表面）/.test(doc.documentName) || /在留カード（表面）/.test(doc.documentName);
            const nextDoc = docs[idx + 1];
            const hasBackSide = isCardFront && nextDoc && /裏面/.test(nextDoc.documentName);
            return (
              <button
                key={doc.id}
                onClick={() => !isAdded && onToggle(doc.id)}
                disabled={isAdded}
                className={cn(
                  "w-full flex items-start gap-3 px-5 py-2.5 text-left transition-colors",
                  isAdded ? "opacity-50 cursor-not-allowed" :
                  isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                )}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {isAdded ? (
                    <CheckSquare className="w-4 h-4 text-green-600" />
                  ) : isSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-300" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-gray-800 block">
                    {doc.documentName}
                    {hasBackSide && (
                      <span className="ml-2 text-xs text-orange-600 font-medium bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                        裏面と両方必要
                      </span>
                    )}
                    {/裏面/.test(doc.documentName) && isCardFront === false && (
                      <span className="ml-2 text-xs text-orange-600 font-medium bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                        表面とセット
                      </span>
                    )}
                  </span>
                  {doc.isAlwaysRequired && (
                    <span className="text-xs text-red-500 font-medium">必須</span>
                  )}
                  {doc.description && (
                    <span className="text-xs text-gray-400 block mt-0.5">{doc.description}</span>
                  )}
                </span>
                {isAdded && <span className="text-xs text-green-600 flex-shrink-0 mt-0.5">追加済</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
