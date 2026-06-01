"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  toggleExpertCheckmark,
  updateDocumentStatus,
  updateChecklistNotes,
  runConsistencyCheck,
  saveChecklistDocumentAndOcr,
  shareApplicantDocumentsToChecklist,
  generateApplicationFormDraft,
  duplicateChecklistItem,
  removeDocumentFromChecklist,
  clearChecklistFile,
} from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckSquare, Square, CheckCircle, XCircle, AlertCircle,
  Clock, RefreshCw, Loader2, FileText, Upload, Sparkles,
  ChevronDown, ChevronRight, Share2, Pencil, Check, X,
  FileEdit, ArrowRight, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  documentName: string;
  isRequiredByExpert: boolean;
  status: string;
  fileUrl: string | null;
  fileName: string | null;
  expertNotes: string | null;
  ocrExtractedData?: Record<string, any> | null;
  /** マスターの留意事項（description フィールド） */
  masterDescription?: string | null;
  /** 書類マスターID（グループ化に使用） */
  documentRequirementId?: string | null;
  /** マスターの並び順（入管提出順） */
  masterSortOrder?: number;
  /** 作成日時（ISO文字列） */
  createdAt?: string | null;
}

interface DocumentChecklistProps {
  checklist: ChecklistItem[];
  applicationId: string;
  userRole?: string;
  applicationStatus: string;
}

// STATUS_ICONS はモジュールレベルに置かずコンポーネント内で生成する関数にする
// （React 19 での hydration mismatch を防ぐため）
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
  not_submitted: "未提出",
  submitted:     "提出済",
  approved:      "承認",
  resubmit_required: "再提出要求",
};

// 申請書類（アップロード不要）の判定
function isApplicationForm(name: string) {
  return /申請書/.test(name);
}

// OCR抽出データのサマリー表示用フィールド
const OCR_DISPLAY_FIELDS: { key: string; label: string }[] = [
  { key: "company_name",    label: "会社名" },
  { key: "position",        label: "役職" },
  { key: "annual_salary",   label: "年収" },
  { key: "monthly_salary",  label: "月収" },
  { key: "school_name",     label: "学校名" },
  { key: "degree",          label: "学位" },
  { key: "graduation_date", label: "卒業日" },
  { key: "qualification",   label: "資格" },
  { key: "full_name_ja",    label: "氏名" },
  { key: "issue_date",      label: "発行日" },
  { key: "notes",           label: "備考" },
];

// ── 書類アップロード（per item）──────────────────────────────────────────────
function ChecklistItemUpload({
  item,
  onUploaded,
  onCleared,
}: {
  item: ChecklistItem;
  onUploaded: (id: string, updates: Partial<ChecklistItem>) => void;
  onCleared: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState("");
  const [ocrStatus, setOcrStatus] = useState<"idle" | "processing" | "done">("idle");
  const [showOcr, setShowOcr] = useState(false);

  const ocr = item.ocrExtractedData as Record<string, any> | null;
  const ocrFields = ocr
    ? OCR_DISPLAY_FIELDS.filter((f) => ocr[f.key] && ocr[f.key] !== "null")
    : [];

  async function handleFile(file: File) {
    setError("");
    setIsUploading(true);
    setOcrStatus("idle");
    try {
      // Step1: /api/upload でファイルをアップロード（docTypeなし = DB保存なし）
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "アップロード失敗");

      setOcrStatus("processing");

      // Step2: Server Action でDB保存 + Gemini OCR
      const result = await saveChecklistDocumentAndOcr(
        item.id,
        data.url,
        file.name,
        file.size,
        data.mimeType,
        item.documentName
      );

      if (!result.success) throw new Error(result.error ?? "保存失敗");

      onUploaded(item.id, {
        fileUrl: data.url,
        fileName: file.name,
        status: "submitted",
        ocrExtractedData: result.extracted ?? null,
      });
      setOcrStatus("done");
    } catch (err: any) {
      setError(err.message ?? "アップロードに失敗しました");
      setOcrStatus("idle");
    } finally {
      setIsUploading(false);
    }
  }

  // アップロード取り消し処理
  async function handleClear() {
    if (!confirm(`「${item.fileName}」のアップロードを取り消しますか？`)) return;
    setIsClearing(true);
    setError("");
    try {
      const result = await clearChecklistFile(item.id);
      if (!result.success) {
        setError(result.error ?? "取り消しに失敗しました");
      } else {
        onCleared(item.id);
      }
    } catch (err: any) {
      setError(err.message ?? "エラーが発生しました");
    } finally {
      setIsClearing(false);
    }
  }

  // ファイルあり → ファイル名＋OCR結果表示
  // "(uploaded)" は Vercel Blob / "(data)" は data: URL のプレースホルダー
  const hasFile = item.fileUrl && item.fileName;
  if (hasFile) {
    return (
      <div className="mt-2 ml-8">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs text-blue-800 max-w-xs">
            <FileText className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{item.fileName}</span>
          </div>
          {/* AI読込結果バッジ */}
          {ocr && ocrFields.length > 0 && (
            <button
              onClick={() => setShowOcr((v) => !v)}
              className="flex items-center gap-1 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1 hover:bg-purple-100"
            >
              <Sparkles className="w-3 h-3" />
              AI読込済み
              {showOcr ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
          {/* 差し替えボタン */}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={isClearing}
            className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
          >
            差し替え
          </button>
          {/* 取り消しボタン */}
          <button
            onClick={handleClear}
            disabled={isClearing}
            className="text-xs text-red-400 hover:text-red-600 underline disabled:opacity-50"
            title="アップロードを取り消す"
          >
            {isClearing ? "取り消し中..." : "取り消し"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = ""; } }}
          />
        </div>

        {/* OCR抽出データ詳細 */}
        {showOcr && ocr && ocrFields.length > 0 && (
          <div className="mt-2 bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-purple-800 flex items-center gap-1 mb-2">
              <Sparkles className="w-3 h-3" /> AI自動読込データ
            </p>
            {ocrFields.map((f) => (
              <div key={f.key} className="flex gap-2">
                <span className="text-purple-500 w-16 flex-shrink-0">{f.label}:</span>
                <span className="text-gray-800 break-all">
                  {f.key === "annual_salary" || f.key === "monthly_salary"
                    ? `${Number(ocr[f.key]).toLocaleString()}円`
                    : String(ocr[f.key])}
                </span>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  // ファイルなし → ドロップゾーン
  return (
    <div className="mt-2 ml-8">
      <div
        className={cn(
          "border border-dashed rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors text-xs",
          isDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40",
          (isUploading || ocrStatus === "processing") && "pointer-events-none opacity-60"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      >
        {isUploading ? (
          <><Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" /><span className="text-blue-600">アップロード中...</span></>
        ) : ocrStatus === "processing" ? (
          <><Sparkles className="w-3.5 h-3.5 text-purple-500 animate-pulse" /><span className="text-purple-600">AIが読み込み中...</span></>
        ) : isDragging ? (
          <><Upload className="w-3.5 h-3.5 text-blue-500" /><span className="text-blue-600">ここにドロップ</span></>
        ) : (
          <><Upload className="w-3.5 h-3.5 text-gray-400" /><span className="text-gray-400">クリックまたはドロップで添付・AI自動読込</span></>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = ""; } }}
      />
    </div>
  );
}

// ── メインチェックリスト ──────────────────────────────────────────────────────
export function DocumentChecklist({
  checklist,
  applicationId,
  userRole,
  applicationStatus,
}: DocumentChecklistProps) {
  const [isPending, startTransition] = useTransition();
  const [localChecklist, setLocalChecklist] = useState(checklist);

  // props が更新されたら state を同期（必須書類自動追加後など）
  useEffect(() => {
    setLocalChecklist(checklist);
  }, [checklist]);
  const [isCheckRunning, setIsCheckRunning] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  // 備考編集中のアイテムIDと入力値
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState("");
  // 下書き生成
  const [isDraftGenerating, setIsDraftGenerating] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");

  const isExpert = userRole === "expert" || userRole === "admin";
  const requiredItems = localChecklist.filter((i) => i.isRequiredByExpert);
  const submittedRequired = requiredItems.filter((i) => i.status !== "not_submitted");

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

  function handleUploaded(id: string, updates: Partial<ChecklistItem>) {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  }

  function handleCleared(id: string) {
    // アップロード取り消し後：fileUrl・fileName・status をリセット
    setLocalChecklist((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, ocrExtractedData: null, status: "not_submitted" }
          : i
      )
    );
  }

  async function handleConsistencyCheck() {
    setIsCheckRunning(true);
    try { await runConsistencyCheck(applicationId); } finally { setIsCheckRunning(false); }
  }

  async function handleShare() {
    setIsSharing(true);
    setShareMessage("");
    try {
      const result = await shareApplicantDocumentsToChecklist(applicationId);
      if (result.success) {
        setShareMessage(
          result.count && result.count > 0
            ? `✓ ${result.count}件のパスポート・在留カード情報を反映しました`
            : "対象書類が見つかりませんでした（チェックリストにパスポート・在留カード項目を追加してください）"
        );
        // ページをリロードして最新データを表示
        window.location.reload();
      } else {
        setShareMessage(`エラー: ${result.error}`);
      }
    } finally {
      setIsSharing(false);
    }
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

  // 全必須書類が提出済みかどうか
  const allRequiredSubmitted =
    requiredItems.length > 0 &&
    requiredItems.every((i) => i.status !== "not_submitted");

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              必要書類チェックリスト
            </CardTitle>
            {requiredItems.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                必要書類: {submittedRequired.length} / {requiredItems.length} 件提出済
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 申請人マスターから共有ボタン */}
            <button
              onClick={handleShare}
              disabled={isSharing}
              className="inline-flex items-center gap-1.5 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
              title="申請人マスターのパスポート・在留カード情報をチェックリストに反映"
            >
              {isSharing
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Share2 className="w-3 h-3" />}
              申請人マスターから共有
            </button>
            {isExpert && (
              <button
                onClick={handleConsistencyCheck}
                disabled={isCheckRunning}
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isCheckRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                整合性チェック
              </button>
            )}
          </div>
        </div>
        {/* 共有結果メッセージ */}
        {shareMessage && (
          <p className={cn(
            "text-xs mt-2 px-3 py-2 rounded-lg",
            shareMessage.startsWith("エラー") || shareMessage.startsWith("対象")
              ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
              : "bg-blue-50 text-blue-700 border border-blue-200"
          )}>
            {shareMessage}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {localChecklist.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">書類リストがありません</p>
            <p className="text-xs mt-1">下の「入管必要書類から選択」から追加してください</p>
          </div>
        ) : (() => {
            // ── グループ情報を事前計算（同じ documentRequirementId のアイテムをグループ化）
            // アイテムは masterSortOrder 順でソート済みなので同グループは隣接している
            type GroupInfo = { isFirst: boolean; isLast: boolean; index: number; groupKey: string };
            const groupInfoMap = new Map<string, GroupInfo>();
            {
              const keyToIds = new Map<string, string[]>();
              for (const it of localChecklist) {
                const key = it.documentRequirementId ?? `name:${it.documentName}`;
                if (!keyToIds.has(key)) keyToIds.set(key, []);
                keyToIds.get(key)!.push(it.id);
              }
              for (const [key, ids] of keyToIds.entries()) {
                ids.forEach((id, idx) => {
                  groupInfoMap.set(id, {
                    isFirst: idx === 0,
                    isLast: idx === ids.length - 1,
                    index: idx,
                    groupKey: key,
                  });
                });
              }
            }

            // 連番（グループ単位・写真は番号なし）
            let docNum = 0;
            const numMap: Record<string, number | null> = {};
            for (const it of localChecklist) {
              if (it.isRequiredByExpert) {
                const info = groupInfoMap.get(it.id);
                // グループの先頭アイテムにだけ番号を付ける
                if (info?.isFirst) {
                  numMap[it.id] = it.documentName.includes("写真") ? null : ++docNum;
                }
              }
            }

            return (
          <div className="divide-y divide-gray-50">
            {localChecklist.map((item) => {
              const groupInfo = groupInfoMap.get(item.id);
              const isAddedSlot = groupInfo ? !groupInfo.isFirst : false;  // 追加枠（グループ2番目以降）
              const isLastInGroup = groupInfo?.isLast ?? true;  // グループの最後のアイテム

              return (
              <div
                key={item.id}
                className={cn(
                  "hover:bg-gray-50/50 transition-colors",
                  isAddedSlot ? "px-6 py-2 pl-12 bg-blue-50/30" : "px-6 py-4",
                  !item.isRequiredByExpert && "opacity-60"
                )}
              >
                {/* 追加枠は上段を省略して枠番号のみ表示 */}
                {isAddedSlot ? (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 font-medium">
                      {groupInfo!.index + 1}枚目
                    </span>
                    {/* 追加枠の削除ボタン */}
                    {isExpert && (
                      <button
                        onClick={async () => {
                          await removeDocumentFromChecklist(item.id);
                          setLocalChecklist(prev => prev.filter(i => i.id !== item.id));
                        }}
                        className="text-xs text-red-400 hover:text-red-600 underline"
                        title="この枠を削除"
                      >
                        この枠を削除
                      </button>
                    )}
                  </div>
                ) : (
                <>
                {/* 上段: 番号 + チェックボックス + 書類名 + ステータス */}
                <div className="flex items-center gap-3">
                  {/* 連番バッジ */}
                  {item.isRequiredByExpert && (
                    <div className="flex-shrink-0 w-7 text-center">
                      {numMap[item.id] != null ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          {numMap[item.id]}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </div>
                  )}
                  {!item.isRequiredByExpert && <div className="flex-shrink-0 w-7" />}

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
                    {/* 留意事項（マスターから自動表示） */}
                    {item.masterDescription && (
                      <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                        ℹ {item.masterDescription}
                      </p>
                    )}

                    {/* 備考（専門家によるインライン編集） */}
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
                          placeholder="例：結婚証明書、出生証明書 など"
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
                      <div className="flex items-center gap-1 mt-0.5 group/notes">
                        {item.expertNotes ? (
                          <p className="text-xs text-orange-600">📝 {item.expertNotes}</p>
                        ) : (
                          <p className="text-xs text-gray-300 hidden group-hover/notes:block">備考を追加...</p>
                        )}
                        {isExpert && (
                          <button
                            onClick={() => startEditNotes(item)}
                            className="p-0.5 text-gray-300 hover:text-orange-400 rounded opacity-0 group-hover/notes:opacity-100 transition-opacity"
                            title="備考を編集"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ステータス */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusIcon(item.status)}
                    <span className="text-xs text-gray-500 hidden sm:block">{STATUS_LABELS[item.status]}</span>
                  </div>

                  {/* 承認・却下ボタン */}
                  {isExpert && item.status === "submitted" && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleStatusChange(item.id, "approved")}
                        disabled={isPending}
                        className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                        title="承認"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.id, "resubmit_required")}
                        disabled={isPending}
                        className="p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="再提出要求"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 下段: アップロードゾーン + 枠を追加（グループ最後のアイテムのみ） */}
                {item.isRequiredByExpert && !isApplicationForm(item.documentName) && (
                  <div>
                    <ChecklistItemUpload item={item} onUploaded={handleUploaded} onCleared={handleCleared} />
                    {/* 「枠を追加」はグループの最後のアイテムにだけ表示 */}
                    {isLastInGroup && (
                      <button
                        onClick={async () => {
                          const result = await duplicateChecklistItem(item.id, applicationId);
                          if (result.success && result.newItem) {
                            // ページリロードなしで即座にローカル状態に追加
                            setLocalChecklist(prev => {
                              const idx = prev.findIndex(i => i.id === item.id);
                              const newEntry = {
                                id: result.newItem!.id,
                                documentName: result.newItem!.documentName,
                                documentRequirementId: result.newItem!.documentRequirementId,
                                isRequiredByExpert: result.newItem!.isRequiredByExpert,
                                status: "not_submitted" as const,
                                fileUrl: null,
                                fileName: null,
                                expertNotes: null,
                                ocrExtractedData: null,
                                masterDescription: item.masterDescription,
                                masterSortOrder: item.masterSortOrder,
                                createdAt: new Date().toISOString(),
                              };
                              if (idx >= 0) {
                                const next = [...prev];
                                next.splice(idx + 1, 0, newEntry);
                                return next;
                              }
                              return [...prev, newEntry];
                            });
                          }
                        }}
                        className="ml-8 mt-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded px-2 py-1 transition-colors"
                        title="このアップロード枠を1つ追加"
                      >
                        <Plus className="w-3 h-3" />
                        枠を追加
                      </button>
                    )}
                  </div>
                )}
                </>
                )}
              </div>
              );
            })}
          </div>
        );
          })()
        }

        {/* ── 全書類提出済み → 下書き作成バナー ── */}
        {allRequiredSubmitted && (
          <div className="border-t border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    必要書類がすべて提出されました
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
