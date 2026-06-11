"use client";

/**
 * 必要書類チェックリスト（ステータス管理専用）
 * ──────────────────────────────────────────
 * 書類のアップロード機能は「申請書作成用 添付書類（入管提出用）」パネルへ
 * 移行済み。このコンポーネントは書類の要否・提出状況・備考の管理のみ行う。
 */
import { useState, useTransition, useRef, useEffect } from "react";
import {
  toggleExpertCheckmark,
  updateDocumentStatus,
  updateChecklistNotes,
  generateApplicationFormDraft,
  removeDocumentFromChecklist,
  addCustomDocumentToChecklist,
} from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckSquare, Square, CheckCircle, XCircle, AlertCircle,
  Clock, Loader2, FileText,
  Pencil, Check, X, FileEdit, ArrowRight, Plus, FilePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  documentName: string;
  isRequiredByExpert: boolean;
  status: string;
  expertNotes: string | null;
  ocrExtractedData?: Record<string, any> | null;
  masterDescription?: string | null;
  documentRequirementId?: string | null;
  masterSortOrder?: number;
  createdAt?: string | null;
}

interface DocumentChecklistProps {
  checklist: ChecklistItem[];
  applicationId: string;
  userRole?: string;
  applicationStatus: string;
}

function getStatusIcon(status: string): React.ReactNode {
  switch (status) {
    case "not_submitted":     return <Clock className="w-4 h-4 text-gray-400" />;
    case "submitted":         return <CheckCircle className="w-4 h-4 text-blue-500" />;
    case "approved":          return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "resubmit_required": return <AlertCircle className="w-4 h-4 text-red-500" />;
    default:                  return <Clock className="w-4 h-4 text-gray-400" />;
  }
}
const STATUS_LABELS: Record<string, string> = {
  not_submitted: "未収集",
  submitted:     "収集済",
  approved:      "承認",
  resubmit_required: "再収集",
};

export function DocumentChecklist({
  checklist,
  applicationId,
  userRole,
}: DocumentChecklistProps) {
  const [isPending, startTransition] = useTransition();
  const [localChecklist, setLocalChecklist] = useState(checklist);

  useEffect(() => {
    setLocalChecklist(checklist);
  }, [checklist]);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState("");
  const [isDraftGenerating, setIsDraftGenerating] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [customDocName, setCustomDocName] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customDocError, setCustomDocError] = useState("");
  const customDocInputRef = useRef<HTMLInputElement>(null);

  const isExpert = userRole === "expert" || userRole === "admin";
  const requiredItems = localChecklist.filter((i) => i.isRequiredByExpert);
  const collectedRequired = requiredItems.filter((i) => i.status !== "not_submitted");

  function handleToggleExpert(item: ChecklistItem) {
    const newValue = !item.isRequiredByExpert;
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isRequiredByExpert: newValue } : i))
    );
    startTransition(async () => { await toggleExpertCheckmark(item.id, newValue); });
  }

  function handleStatusChange(itemId: string, status: string) {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status } : i))
    );
    startTransition(async () => { await updateDocumentStatus(itemId, status); });
  }

  function startEditNotes(item: ChecklistItem) {
    setEditingNotesId(item.id);
    setEditingNotesValue(item.expertNotes ?? "");
  }

  async function saveNotes(itemId: string) {
    const notes = editingNotesValue.trim();
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, expertNotes: notes || null } : i))
    );
    setEditingNotesId(null);
    await updateChecklistNotes(itemId, notes);
  }

  function cancelEditNotes() {
    setEditingNotesId(null);
    setEditingNotesValue("");
  }

  const allRequiredCollected =
    requiredItems.length > 0 &&
    requiredItems.every((i) => i.status !== "not_submitted");

  async function handleAddCustomDoc() {
    const name = customDocName.trim();
    if (!name) { setCustomDocError("書類名を入力してください"); return; }
    setCustomDocError("");
    setIsAddingCustom(true);
    try {
      const result = await addCustomDocumentToChecklist(applicationId, name);
      if (result.success && result.newItemId) {
        const newEntry: ChecklistItem = {
          id: result.newItemId,
          documentName: name,
          documentRequirementId: null,
          isRequiredByExpert: true,
          status: "not_submitted",
          expertNotes: null,
          ocrExtractedData: null,
          masterDescription: null,
          masterSortOrder: 9999,
          createdAt: new Date().toISOString(),
        };
        setLocalChecklist(prev => [...prev, newEntry]);
        setCustomDocName("");
        customDocInputRef.current?.focus();
      } else {
        setCustomDocError(result.error ?? "追加に失敗しました");
      }
    } finally {
      setIsAddingCustom(false);
    }
  }

  async function handleGenerateDraft() {
    setIsDraftGenerating(true);
    setDraftMessage("");
    try {
      const result = await generateApplicationFormDraft(applicationId);
      if (result.success) {
        setDraftMessage("✓ 申請書類の下書きを生成しました。画面をリロードして確認してください。");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setDraftMessage(`エラー: ${result.error}`);
      }
    } finally {
      setIsDraftGenerating(false);
    }
  }

  // 連番（写真は番号なし）
  let docNum = 0;
  const numMap: Record<string, number | null> = {};
  for (const it of localChecklist) {
    if (it.isRequiredByExpert) {
      numMap[it.id] = it.documentName.includes("写真") ? null : ++docNum;
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              必要書類チェックリスト
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">
              書類の要否と収集状況を管理します。ファイルのアップロードは「申請書作成用 添付書類」パネルで行ってください。
            </p>
            {requiredItems.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                必要書類: {collectedRequired.length} / {requiredItems.length} 件収集済
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {localChecklist.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">書類リストがありません</p>
            <p className="text-xs mt-1">下の「入管必要書類から選択」から追加してください</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {localChecklist.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "px-6 py-3 hover:bg-gray-50/50 transition-colors",
                  !item.isRequiredByExpert && "opacity-60"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* 連番バッジ */}
                  {item.isRequiredByExpert ? (
                    <div className="flex-shrink-0 w-7 text-center">
                      {numMap[item.id] != null ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          {numMap[item.id]}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-7" />
                  )}

                  {isExpert ? (
                    <button
                      onClick={() => handleToggleExpert(item)}
                      disabled={isPending}
                      className="flex-shrink-0 text-blue-600 hover:text-blue-700 disabled:opacity-50"
                      title="必要書類として確定"
                    >
                      {item.isRequiredByExpert
                        ? <CheckSquare className="w-5 h-5" />
                        : <Square className="w-5 h-5 text-gray-300" />}
                    </button>
                  ) : (
                    <div className="flex-shrink-0 w-5">
                      {item.isRequiredByExpert && <CheckSquare className="w-5 h-5 text-blue-600" />}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium leading-tight",
                      item.isRequiredByExpert ? "text-gray-900" : "text-gray-400"
                    )}>
                      {item.documentName}
                      {item.isRequiredByExpert && (
                        <span className="ml-2 text-xs text-red-500 font-normal">必須</span>
                      )}
                    </p>
                    {item.masterDescription && (
                      <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                        ℹ {item.masterDescription}
                      </p>
                    )}
                    {/* 備考欄 */}
                    {editingNotesId === item.id ? (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          type="text"
                          value={editingNotesValue}
                          onChange={(e) => setEditingNotesValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNotes(item.id);
                            if (e.key === "Escape") cancelEditNotes();
                          }}
                          placeholder="備考を入力（PDFにも反映されます）"
                          autoFocus
                          className="flex-1 text-xs border border-orange-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-orange-50"
                        />
                        <button onClick={() => saveNotes(item.id)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="保存">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={cancelEditNotes} className="p-1 text-gray-400 hover:bg-gray-50 rounded" title="キャンセル">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-0.5 group/notes cursor-pointer" onClick={() => startEditNotes(item)}>
                        {item.expertNotes ? (
                          <p className="text-xs text-orange-600">📝 {item.expertNotes}</p>
                        ) : (
                          <p className="text-xs text-gray-300 group-hover/notes:text-gray-400">+ 備考を追加</p>
                        )}
                        <button
                          className="p-0.5 text-gray-300 hover:text-orange-400 rounded opacity-0 group-hover/notes:opacity-100 transition-opacity"
                          title="備考を編集"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ステータス選択（手動管理） */}
                  {item.isRequiredByExpert && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getStatusIcon(item.status)}
                      <select
                        value={item.status}
                        onChange={(e) => handleStatusChange(item.id, e.target.value)}
                        disabled={isPending}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 outline-none focus:border-blue-400 cursor-pointer disabled:opacity-50"
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 削除ボタン */}
                  <button
                    onClick={async () => {
                      if (!confirm(`「${item.documentName}」をチェックリストから削除しますか？`)) return;
                      await removeDocumentFromChecklist(item.id);
                      setLocalChecklist(prev => prev.filter(i => i.id !== item.id));
                    }}
                    className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="チェックリストから削除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 追加書類入力欄 ── */}
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
          <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
            <FilePlus className="w-3.5 h-3.5" />
            追加書類をチェックリストに追加
          </p>
          <div className="flex gap-2">
            <input
              ref={customDocInputRef}
              type="text"
              value={customDocName}
              onChange={(e) => { setCustomDocName(e.target.value); setCustomDocError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomDoc(); } }}
              placeholder="書類名を入力（例：雇用証明書、在職証明書 など）"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 bg-white"
            />
            <button
              onClick={handleAddCustomDoc}
              disabled={isAddingCustom || !customDocName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
            >
              {isAddingCustom
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4" />}
              追加
            </button>
          </div>
          {customDocError && (
            <p className="text-xs text-red-500 mt-1">{customDocError}</p>
          )}
        </div>

        {/* ── 全書類収集済み → 下書き作成バナー ── */}
        {allRequiredCollected && (
          <div className="border-t border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    必要書類がすべて収集されました
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    次のステップ：AIが収集した書類情報をもとに申請書類の下書きを作成します
                  </p>
                </div>
              </div>
              <button
                onClick={handleGenerateDraft}
                disabled={isDraftGenerating}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
              >
                {isDraftGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />AIが生成中...</>
                ) : (
                  <><FileEdit className="w-4 h-4" />申請書類の下書きを作成<ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
            {draftMessage && (
              <p className={cn(
                "mt-3 text-xs px-3 py-2 rounded-lg",
                draftMessage.startsWith("エラー")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-100 text-green-700 border border-green-200"
              )}>
                {draftMessage}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
