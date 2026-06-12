"use client";

/**
 * 入管提出用添付書類アップロードパネル
 * ────────────────────────────────────
 * 申請書作成に必要な書類タイプごとの個別アップロードスロットを表示。
 * 定義された必要書類のみ受付（不要書類はタイプ選択自体ができない）。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload, FileText, Loader2, Trash2, User, Building2,
  CheckCircle2, Download, ExternalLink, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ATTACHMENT_TYPES, type AttachmentTypeDef } from "@/lib/attachment-types";

interface Attachment {
  id: string;
  documentType: string;
  documentLabel: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedAt: string;
}

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// ── 書類タイプごとのアップロードスロット ──────────────────────────────────────
function TypeSlot({
  typeDef,
  files,
  applicationId,
  onUploaded,
  onDeleted,
}: {
  typeDef: AttachmentTypeDef;
  files: Attachment[];
  applicationId: string;
  onUploaded: (a: Attachment) => void;
  onDeleted: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleFiles(fileList: File[]) {
    if (fileList.length === 0) return;
    setError("");
    setIsUploading(true);
    try {
      for (const file of fileList) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("documentType", typeDef.key);
        const res = await fetch(`/api/applications/${applicationId}/attachments`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "アップロードに失敗しました");
        onUploaded(data.attachment);
      }
    } catch (err: any) {
      setError(err.message ?? "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(att: Attachment) {
    if (!confirm(`「${att.fileName}」を削除しますか？`)) return;
    setDeletingId(att.id);
    setError("");
    try {
      const res = await fetch(
        `/api/applications/${applicationId}/attachments?attachmentId=${att.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました");
      onDeleted(att.id);
    } catch (err: any) {
      setError(err.message ?? "削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  }

  const hasFiles = files.length > 0;

  return (
    <div className={cn(
      "border rounded-xl p-3 transition-colors",
      hasFiles ? "border-green-200 bg-green-50/40" : "border-gray-200 bg-white"
    )}>
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
            {hasFiles && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
            {typeDef.label}
          </p>
          {typeDef.hint && (
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{typeDef.hint}</p>
          )}
        </div>
        {hasFiles && (
          <span className="text-xs text-green-600 font-medium whitespace-nowrap flex-shrink-0">
            {files.length}件
          </span>
        )}
      </div>

      {/* アップロード済みファイル一覧 */}
      {hasFiles && (
        <div className="space-y-1 mb-2">
          {files.map(att => (
            <div key={att.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-2.5 py-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <a
                href={att.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-700 hover:text-blue-600 truncate flex-1 min-w-0 flex items-center gap-1"
                title={att.fileName}
              >
                <span className="truncate">{att.fileName}</span>
                <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />
              </a>
              <span className="text-xs text-gray-300 flex-shrink-0">{formatBytes(att.fileSize)}</span>
              <button
                onClick={() => handleDelete(att)}
                disabled={deletingId === att.id}
                className="p-0.5 text-gray-300 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
                title="削除"
              >
                {deletingId === att.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* アップロードエリア：未アップロード時はドロップゾーン、アップロード済みは「＋ ○枚目を追加」ボタン */}
      {hasFiles ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const fl = Array.from(e.dataTransfer.files);
            if (fl.length) handleFiles(fl);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors border",
            isDragging
              ? "border-blue-400 bg-blue-100 text-blue-700"
              : "text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100",
            isUploading && "opacity-60 cursor-not-allowed"
          )}
          title={`同じ書類の${files.length + 1}枚目をアップロード`}
        >
          {isUploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />アップロード中...</>
          ) : isDragging ? (
            <><Upload className="w-3.5 h-3.5" />ここにドロップ</>
          ) : (
            <><Plus className="w-3.5 h-3.5" />{files.length + 1}枚目を追加</>
          )}
        </button>
      ) : (
        <div
          className={cn(
            "border border-dashed rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors text-xs",
            isDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40",
            isUploading && "pointer-events-none opacity-60"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const fl = Array.from(e.dataTransfer.files);
            if (fl.length) handleFiles(fl);
          }}
        >
          {isUploading ? (
            <><Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" /><span className="text-blue-600">アップロード中...</span></>
          ) : isDragging ? (
            <><Upload className="w-3.5 h-3.5 text-blue-500" /><span className="text-blue-600">ここにドロップ</span></>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-gray-400">クリックまたはドロップでアップロード</span>
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1 whitespace-pre-wrap">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={(e) => {
          const fl = Array.from(e.target.files ?? []);
          if (fl.length) { handleFiles(fl); e.target.value = ""; }
        }}
      />
    </div>
  );
}

// ── メインパネル ──────────────────────────────────────────────────────────────
export function AttachmentUploadPanel({
  applicationId,
  initialAttachments,
}: {
  applicationId: string;
  initialAttachments: Attachment[];
}) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipError, setZipError] = useState("");

  const handleUploaded = useCallback((a: Attachment) => {
    setAttachments(prev => [a, ...prev]);
  }, []);
  const handleDeleted = useCallback((id: string) => {
    setAttachments(prev => prev.filter(x => x.id !== id));
  }, []);

  const byType = (key: string) => attachments.filter(a => a.documentType === key);
  const applicantTypes = ATTACHMENT_TYPES.filter(t => t.side === "applicant");
  const orgTypes = ATTACHMENT_TYPES.filter(t => t.side === "organization");
  const totalUploaded = attachments.length;

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

  return (
    <div className="space-y-4">
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">
          申請書のAI自動入力と入管提出に使用する書類です。該当する書類タイプの枠にアップロードしてください。
          {totalUploaded > 0 && (
            <span className="ml-2 text-green-600 font-medium">計{totalUploaded}件アップロード済み</span>
          )}
        </p>
        {/* 提出用Zipダウンロード */}
        <button
          onClick={handleZipDownload}
          disabled={isDownloadingZip || totalUploaded === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          title="申請書データと添付書類を1つのZipファイルにまとめてダウンロード"
        >
          {isDownloadingZip
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Download className="w-4 h-4" />}
          提出用データをダウンロード
        </button>
      </div>
      {zipError && <p className="text-xs text-red-500 whitespace-pre-wrap">{zipError}</p>}

      {/* 申請人側書類 */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" />
          申請人の書類
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {applicantTypes.map(t => (
            <TypeSlot
              key={t.key}
              typeDef={t}
              files={byType(t.key)}
              applicationId={applicationId}
              onUploaded={handleUploaded}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      </div>

      {/* 所属機関側書類 */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          所属機関の書類
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {orgTypes.map(t => (
            <TypeSlot
              key={t.key}
              typeDef={t}
              files={byType(t.key)}
              applicationId={applicationId}
              onUploaded={handleUploaded}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
