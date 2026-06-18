"use client";

/**
 * 必要書類チェックリスト（ステータス管理＋個別アップロード）
 * ──────────────────────────────────────────
 * 書類の要否・提出状況・備考の管理に加え、項目ごとのドロップインアップロード枠
 * （ChecklistDropzone）を提供する。アップロードされた書類は
 *  ① fillAllFieldsFromDocs によるAI自動入力のソース
 *  ② 提出用データ一括ダウンロード（Zip）の対象
 * として連動する。
 */
import { useState, useTransition, useRef, useEffect, useCallback, memo } from "react";
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
  Upload, Download, Trash2, CheckCircle2,
  User, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentLink } from "@/components/applicants/document-viewer";

interface AdditionalFile {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

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
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  additionalFiles?: AdditionalFile[] | null;
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

// ─── 書類カテゴリ判定（申請人 or 所属機関） ────────────────────────────────────
const ORG_KEYWORDS = [
  "登記", "決算書", "損益計算書", "貸借対照表", "財務諸表",
  "雇用契約書", "雇用条件書", "労働条件通知書",
  "支援計画", "支援責任者", "支援担当者", "支援機関",
  "登録支援機関", "登録通知書",
  "就業規則", "給与台帳", "出勤簿",
  "雇用保険", "社会保険", "健康保険", "厚生年金",
  "法人税", "法人番号", "消費税",
  "採用", "受入", "外国人労働者",
];

function getDocumentSide(name: string): "applicant" | "organization" {
  const n = name.normalize("NFKC");
  return ORG_KEYWORDS.some((k) => n.includes(k)) ? "organization" : "applicant";
}

// ═════════════════════════════════════════════════════════════════════════════
// 個別ドロップイン（チェックリスト項目ごとの軽量アップロード枠）
// ═════════════════════════════════════════════════════════════════════════════
interface ChecklistFile {
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
}

interface UploadedFileResult extends ChecklistFile {
  status: string;
}

interface AiFillResult {
  success: boolean;
  error?: string;
  docsRead?: number;
}

interface MismatchInfo {
  aiDocumentName: string;
  droppedInto: string;
  matchedName: string;
  moved: boolean;
}

interface UploadMeta {
  needsManualClassification?: boolean;
  mismatch?: MismatchInfo | null;
}

const ChecklistDropzone = memo(function ChecklistDropzone({
  itemId,
  applicationId,
  documentName,
  file,
  onUploaded,
  onDeleted,
  onAiResult,
}: {
  itemId: string;
  applicationId: string;
  documentName: string;
  file: ChecklistFile;
  onUploaded: (targetItemId: string, file: UploadedFileResult, meta?: UploadMeta) => void;
  onDeleted: (itemId: string) => void;
  onAiResult: (result: AiFillResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(fileList: File[]) {
    if (fileList.length === 0) return;
    setError("");
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", fileList[0]);
      const res = await fetch(`/api/applications/${applicationId}/checklist/${itemId}/document`, {
        method: "POST",
        body: fd,
      });
      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          `サーバーエラーが発生しました（HTTP ${res.status}）。` +
          "書類が多い場合は処理に時間がかかることがあります。しばらく待ってから再試行してください。"
        );
      }
      if (!res.ok) throw new Error(data?.error ?? "アップロードに失敗しました");
      onUploaded(
        data.targetItemId ?? itemId,
        data.item,
        { needsManualClassification: data.needsManualClassification, mismatch: data.mismatch }
      );
      if (data.aiResult) onAiResult(data.aiResult);
    } catch (err: any) {
      setError(err.message ?? "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`「${file.fileName}」を削除しますか？`)) return;
    setIsDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}/checklist/${itemId}/document`, {
        method: "DELETE",
      });
      let data: any;
      try { data = await res.json(); } catch { throw new Error(`サーバーエラー（HTTP ${res.status}）`); }
      if (!res.ok) throw new Error(data?.error ?? "削除に失敗しました");
      onDeleted(itemId);
    } catch (err: any) {
      setError(err.message ?? "削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  }

  const hasFile = !!file.fileName;

  return (
    <div className="inline-block">
      {hasFile ? (
        <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg pl-1.5 pr-1 py-1 max-w-full">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          {file.fileUrl && file.fileUrl !== "(uploaded)" ? (
            <DocumentLink
              url={file.fileUrl}
              fileName={file.fileName!}
              documentType={documentName}
              className="text-xs text-green-700 hover:text-green-900 hover:underline truncate max-w-[180px]"
            >
              {file.fileName}
            </DocumentLink>
          ) : (
            <span className="text-xs text-green-700 truncate max-w-[180px]" title={file.fileName ?? ""}>
              {file.fileName}
            </span>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-0.5 text-green-400 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
            title="削除"
          >
            {isDeleting
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const fl = Array.from(e.dataTransfer.files);
            if (fl.length) handleFiles(fl);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 border border-dashed rounded-lg px-2 py-1 cursor-pointer transition-colors text-xs",
            isDragging
              ? "border-blue-400 bg-blue-50 text-blue-600"
              : "border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:bg-blue-50/40",
            isUploading && "pointer-events-none opacity-60"
          )}
        >
          {isUploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /><span className="text-blue-600">アップロード中...</span></>
          ) : isDragging ? (
            <><Upload className="w-3.5 h-3.5" /><span>ここにドロップ</span></>
          ) : (
            <><Upload className="w-3.5 h-3.5" /><span>ドラッグ&amp;ドロップ または クリックで添付</span></>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-0.5 whitespace-pre-wrap max-w-[220px]">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={(e) => {
          const fl = Array.from(e.target.files ?? []);
          if (fl.length) { handleFiles(fl); e.target.value = ""; }
        }}
      />
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 追加ファイルセクション（2枚目以降のアップロード・表示・削除）
// ═════════════════════════════════════════════════════════════════════════════
const ExtraFilesSection = memo(function ExtraFilesSection({
  itemId,
  applicationId,
  documentName,
  extraFiles,
  onFileAdded,
  onFileDeleted,
  onAiResult,
}: {
  itemId: string;
  applicationId: string;
  documentName: string;
  extraFiles: AdditionalFile[];
  onFileAdded: (itemId: string, file: AdditionalFile) => void;
  onFileDeleted: (itemId: string, index: number) => void;
  onAiResult: (result: AiFillResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);

  async function handleFiles(fileList: File[]) {
    if (fileList.length === 0) return;
    setError("");
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", fileList[0]);
      const res = await fetch(`/api/applications/${applicationId}/checklist/${itemId}/extra-file`, {
        method: "POST",
        body: fd,
      });
      let data: any;
      try { data = await res.json(); } catch {
        throw new Error(`サーバーエラーが発生しました（HTTP ${res.status}）。書類が多い場合は時間がかかることがあります。`);
      }
      if (!res.ok) throw new Error(data?.error ?? "アップロードに失敗しました");
      onFileAdded(itemId, data.addedFile);
      if (data.aiResult) onAiResult(data.aiResult);
    } catch (err: any) {
      setError(err.message ?? "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(index: number) {
    if (!confirm("追加ファイルを削除しますか？")) return;
    setDeletingIdx(index);
    setError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}/checklist/${itemId}/extra-file`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      let data: any;
      try { data = await res.json(); } catch { throw new Error(`サーバーエラー（HTTP ${res.status}）`); }
      if (!res.ok) throw new Error(data?.error ?? "削除に失敗しました");
      onFileDeleted(itemId, index);
    } catch (err: any) {
      setError(err.message ?? "削除に失敗しました");
    } finally {
      setDeletingIdx(null);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1 items-start">
      {/* 追加ファイル一覧 */}
      {extraFiles.map((f, idx) => (
        <div key={idx} className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg pl-1.5 pr-1 py-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          {f.fileUrl && f.fileUrl !== "(uploaded)" ? (
            <DocumentLink
              url={f.fileUrl}
              fileName={f.fileName}
              documentType={documentName}
              className="text-xs text-green-700 hover:text-green-900 hover:underline truncate max-w-[160px]"
            >
              {f.fileName}
            </DocumentLink>
          ) : (
            <span className="text-xs text-green-700 truncate max-w-[160px]" title={f.fileName}>{f.fileName}</span>
          )}
          <button
            type="button"
            onClick={() => handleDelete(idx)}
            disabled={deletingIdx === idx}
            className="p-0.5 text-green-400 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
            title="削除"
          >
            {deletingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      ))}

      {/* 追加アップロードゾーン */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const fl = Array.from(e.dataTransfer.files);
          if (fl.length) handleFiles(fl);
        }}
        className={cn(
          "inline-flex items-center gap-1 border border-dashed rounded-lg px-2 py-0.5 cursor-pointer transition-colors text-xs",
          isDragging
            ? "border-blue-400 bg-blue-50 text-blue-600"
            : "border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:bg-blue-50/40",
          isUploading && "pointer-events-none opacity-60"
        )}
      >
        {isUploading ? (
          <><Loader2 className="w-3 h-3 animate-spin text-blue-500" /><span className="text-blue-500">追加中...</span></>
        ) : isDragging ? (
          <><Upload className="w-3 h-3" /><span>ここにドロップ</span></>
        ) : (
          <><Plus className="w-3 h-3" /><span>2枚目を追加</span></>
        )}
      </div>

      {error && <p className="w-full text-xs text-red-500 mt-0.5 whitespace-pre-wrap max-w-[240px]">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={(e) => {
          const fl = Array.from(e.target.files ?? []);
          if (fl.length) { handleFiles(fl); e.target.value = ""; }
        }}
      />
    </div>
  );
});

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
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipError, setZipError] = useState("");
  const [aiFillMessage, setAiFillMessage] = useState("");
  const [mismatchWarning, setMismatchWarning] = useState("");
  const [needsManualClassification, setNeedsManualClassification] = useState<Set<string>>(new Set());
  const [isReassigning, setIsReassigning] = useState<Set<string>>(new Set());

  const isExpert = userRole === "expert" || userRole === "admin";
  const requiredItems = localChecklist.filter((i) => i.isRequiredByExpert);
  const collectedRequired = requiredItems.filter((i) => i.status !== "not_submitted");
  const uploadedCount = localChecklist.filter((i) => i.fileName).length;

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

  const handleFileUploaded = useCallback((targetItemId: string, file: UploadedFileResult, meta?: UploadMeta) => {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === targetItemId
        ? { ...i, fileUrl: file.fileUrl, fileName: file.fileName, fileSize: file.fileSize, mimeType: file.mimeType, status: file.status }
        : i))
    );
    setNeedsManualClassification((prev) => {
      const next = new Set(prev);
      if (meta?.needsManualClassification) next.add(targetItemId); else next.delete(targetItemId);
      return next;
    });
    if (meta?.mismatch) {
      const m = meta.mismatch;
      setMismatchWarning(
        m.moved
          ? `書類の内容を解析した結果「${m.aiDocumentName}」と判定されたため、「${m.matchedName}」の項目に自動登録しました（ドロップ先：${m.droppedInto}）。`
          : `ドロップされた枠と書類の中身が異なる可能性があります（AI判定：${m.aiDocumentName}）。「${m.matchedName}」の項目もご確認ください。`
      );
    } else {
      setMismatchWarning("");
    }
  }, []);

  const handleFileDeleted = useCallback((itemId: string) => {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === itemId
        ? { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, status: "not_submitted" }
        : i))
    );
    setNeedsManualClassification((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const handleReassign = useCallback(async (fromId: string, toId: string) => {
    setIsReassigning((prev) => new Set(prev).add(fromId));
    try {
      const res = await fetch(`/api/applications/${applicationId}/checklist/${fromId}/document`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetItemId: toId }),
      });
      let data: any;
      try { data = await res.json(); } catch { throw new Error(`サーバーエラー（HTTP ${res.status}）`); }
      if (!res.ok) throw new Error(data?.error ?? "再分類に失敗しました");
      setLocalChecklist((prev) => prev.map((i) => {
        if (i.id === fromId) return { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, status: "not_submitted" };
        if (i.id === toId) return { ...i, fileUrl: data.item.fileUrl, fileName: data.item.fileName, fileSize: data.item.fileSize, mimeType: data.item.mimeType, status: data.item.status };
        return i;
      }));
      setNeedsManualClassification((prev) => {
        const next = new Set(prev);
        next.delete(fromId);
        return next;
      });
    } catch (err: any) {
      setMismatchWarning(`再分類に失敗しました: ${err.message ?? "不明なエラー"}`);
    } finally {
      setIsReassigning((prev) => { const next = new Set(prev); next.delete(fromId); return next; });
    }
  }, [applicationId]);

  const handleExtraFileAdded = useCallback((itemId: string, file: AdditionalFile) => {
    setLocalChecklist(prev =>
      prev.map(i => i.id === itemId
        ? { ...i, additionalFiles: [...(i.additionalFiles ?? []), file] }
        : i)
    );
  }, []);

  const handleExtraFileDeleted = useCallback((itemId: string, index: number) => {
    setLocalChecklist(prev =>
      prev.map(i => i.id === itemId
        ? { ...i, additionalFiles: (i.additionalFiles ?? []).filter((_, idx) => idx !== index) }
        : i)
    );
  }, []);

  const handleAiResult = useCallback((result: AiFillResult) => {
    if (result.success) {
      setAiFillMessage(`✓ AIが書類を読み取り、申請書のフィールドを自動入力しました（${result.docsRead ?? 0}件の書類を解析）。「申請書作成」タブで内容をご確認ください。`);
    } else {
      setAiFillMessage(`AI自動入力を実行できませんでした: ${result.error ?? "不明なエラー"}`);
    }
  }, []);

  async function handleZipDownload() {
    setIsDownloadingZip(true);
    setZipError("");
    try {
      const res = await fetch(`/api/applications/${applicationId}/submission-package`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Zipの生成に失敗しました");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = m ? decodeURIComponent(m[1]) : "submission-package.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setZipError(err.message ?? "ダウンロードに失敗しました");
    } finally {
      setIsDownloadingZip(false);
    }
  }

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
          fileUrl: null,
          fileName: null,
          fileSize: null,
          mimeType: null,
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

  // カテゴリバッジ表示フラグ（申請人 / 所属機関の両方が存在する場合のみバッジを表示）
  const showCategoryBadge =
    localChecklist.some(i => getDocumentSide(i.documentName) === "applicant") &&
    localChecklist.some(i => getDocumentSide(i.documentName) === "organization");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              必要書類チェックリスト
            </CardTitle>
            <p className="text-xs text-blue-600 mt-1 leading-relaxed">
              ※これらの書類は、申請書のAI自動入力および入管提出に使用する書類です。該当する書類タイプの枠にアップロードしてください。
            </p>
            {requiredItems.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                必要書類: {collectedRequired.length} / {requiredItems.length} 件収集済
                {uploadedCount > 0 && (
                  <span className="ml-2 text-green-600 font-medium">（ファイル添付 {uploadedCount}件）</span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={handleZipDownload}
            disabled={isDownloadingZip}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
            title="申請書データと添付書類を1つのZipファイルにまとめてダウンロード"
          >
            {isDownloadingZip
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            提出用データ（一括）ダウンロード
          </button>
        </div>
        {zipError && <p className="text-xs text-red-500 whitespace-pre-wrap mt-2">{zipError}</p>}
        {mismatchWarning && (
          <div className="mt-2 flex items-start gap-1.5 text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
            <span className="flex-shrink-0 mt-0.5">⚠</span>
            <span>{mismatchWarning}</span>
            <button
              type="button"
              onClick={() => setMismatchWarning("")}
              className="ml-auto flex-shrink-0 text-amber-400 hover:text-amber-600"
              title="閉じる"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {aiFillMessage && (
          <p className={cn(
            "mt-2 text-xs px-3 py-2 rounded-lg",
            aiFillMessage.startsWith("✓")
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          )}>
            {aiFillMessage}
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
        ) : (
          <div className="divide-y divide-gray-50">
            {localChecklist.map((item) => {
              const side = getDocumentSide(item.documentName);
              return (
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
                    <div className={cn(
                      "flex items-center gap-1.5 flex-wrap",
                      item.isRequiredByExpert ? "text-gray-900" : "text-gray-400"
                    )}>
                      {/* カテゴリバッジ（インライン） */}
                      {showCategoryBadge && (
                        side === "applicant" ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0 border border-blue-100">
                            <User className="w-2.5 h-2.5" />申請人
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600 flex-shrink-0 border border-teal-100">
                            <Building2 className="w-2.5 h-2.5" />所属機関
                          </span>
                        )
                      )}
                      <span className="text-sm font-medium leading-tight">{item.documentName}</span>
                      {item.isRequiredByExpert && (
                        <span className="text-xs text-red-500 font-normal flex-shrink-0">必須</span>
                      )}
                    </div>
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

                    {/* 全項目にドロップイン枠を表示 */}
                    <div className="mt-1.5">
                      <ChecklistDropzone
                        itemId={item.id}
                        applicationId={applicationId}
                        documentName={item.documentName}
                        file={{
                          fileUrl: item.fileUrl ?? null,
                          fileName: item.fileName ?? null,
                          fileSize: item.fileSize ?? null,
                          mimeType: item.mimeType ?? null,
                        }}
                        onUploaded={handleFileUploaded}
                        onDeleted={handleFileDeleted}
                        onAiResult={handleAiResult}
                      />
                      {/* 1枚目が存在する場合のみ2枚目以降のUI */}
                      {item.fileName && (
                        <ExtraFilesSection
                          itemId={item.id}
                          applicationId={applicationId}
                          documentName={item.documentName}
                          extraFiles={item.additionalFiles ?? []}
                          onFileAdded={handleExtraFileAdded}
                          onFileDeleted={handleExtraFileDeleted}
                          onAiResult={handleAiResult}
                        />
                      )}
                      {/* 未判別書類の手動再分類 */}
                      {needsManualClassification.has(item.id) && item.fileName && (
                        <div className="mt-1.5 flex items-start gap-1.5 flex-wrap">
                          <span className="text-xs text-amber-600 flex-shrink-0 mt-0.5 leading-tight">
                            ⚠ 書類種別を自動判別できませんでした。正しい項目へ移動:
                          </span>
                          <select
                            className="text-xs border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                            defaultValue=""
                            disabled={isReassigning.has(item.id)}
                            onChange={async (e) => {
                              const toId = e.target.value;
                              if (!toId) return;
                              e.target.value = "";
                              await handleReassign(item.id, toId);
                            }}
                          >
                            <option value="">書類名を選択...</option>
                            {localChecklist
                              .filter((c) => c.id !== item.id && !c.fileName)
                              .map((c) => (
                                <option key={c.id} value={c.id}>{c.documentName}</option>
                              ))}
                          </select>
                          {isReassigning.has(item.id) && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 mt-0.5 flex-shrink-0" />
                          )}
                        </div>
                      )}
                    </div>
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
              );
            })}
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
