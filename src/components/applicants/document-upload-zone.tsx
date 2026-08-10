"use client";

import { useRef, useState } from "react";
import { saveApplicantDocument, deleteApplicantDocument } from "@/actions/ocr";
import { X, CheckCircle, Loader2, FileText, Eye, ExternalLink, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentLink, isImageFile } from "./document-viewer";
import { FileDropzone } from "@/components/ui/file-dropzone";

type DocType = "passport_data_page" | "residence_card_front" | "residence_card_back";

interface DocumentUploadZoneProps {
  applicantId: string;
  documentType: DocType;
  label: string;
  description: string;
  existingDoc?: { id: string; fileUrl: string; fileName: string; ocrProcessedAt: string | null } | null;
  onUploaded: () => void;
}

export function DocumentUploadZone({
  applicantId,
  documentType,
  label,
  description,
  existingDoc,
  onUploaded,
}: DocumentUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const [error, setError] = useState("");

  // 行全体をドロップ対象にするためのハンドラ。子要素（リンク・ボタン）上に
  // ドロップされてもイベントが確実に拾えるよう、ドラッグ中はオーバーレイを重ねる。
  const onRowDragEnter = (e: React.DragEvent) => {
    if (!existingDoc) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };
  const onRowDragOver = (e: React.DragEvent) => {
    if (!existingDoc) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onRowDragLeave = (e: React.DragEvent) => {
    if (!existingDoc) return;
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) { dragDepth.current = 0; setIsDragging(false); }
  };
  const onRowDrop = (e: React.DragEvent) => {
    if (!existingDoc) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  async function handleFile(file: File) {
    setError("");
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "アップロード失敗");
      }
      const { url, fileName, fileSize, mimeType } = await res.json();

      await saveApplicantDocument({
        applicantId,
        documentType,
        fileUrl: url,
        fileName,
        fileSize,
        mimeType,
      });

      onUploaded();
    } catch (err: any) {
      setError(err.message ?? "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!existingDoc) return;
    setIsDeleting(true);
    try {
      await deleteApplicantDocument(existingDoc.id);
      onUploaded();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div>
      {existingDoc ? (
        /* ─── アップロード済み: コンパクト行（ドラッグ&ドロップで差し替え可能） ─── */
        <div
          className={cn(
            "relative flex items-center gap-2 border rounded-lg px-3 py-2 transition-colors",
            isUploading
              ? "border-blue-300 bg-blue-50"
              : isDragging
              ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
              : "border-gray-200 bg-white"
          )}
          onDragEnter={onRowDragEnter}
          onDragOver={onRowDragOver}
          onDragLeave={onRowDragLeave}
          onDrop={onRowDrop}
          title="ここにファイルをドラッグ＆ドロップして差し替えできます"
        >
          {isUploading ? (
            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 leading-none mb-0.5">{label}</p>
            <DocumentLink
              url={existingDoc.fileUrl}
              fileName={existingDoc.fileName}
              documentType={documentType}
              className="text-xs text-gray-700 hover:text-blue-600 flex items-center gap-1 text-left"
            >
              <span className="truncate">{existingDoc.fileName}</span>
              {isImageFile(existingDoc.fileName) ? (
                <Eye className="w-3 h-3 text-gray-300 flex-shrink-0" />
              ) : (
                <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />
              )}
            </DocumentLink>
          </div>
          {existingDoc.ocrProcessedAt && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-600 flex-shrink-0 font-medium">
              <CheckCircle className="w-3 h-3" /> OCR済
            </span>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs font-medium text-blue-500 hover:text-blue-700 flex-shrink-0 px-1"
          >
            差し替え
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-0.5 text-gray-300 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
            title="削除"
          >
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          </button>

          {/* ドラッグ中のみ前面に出すドロップ捕捉オーバーレイ。子要素（リンク・ボタン）
              の上でドロップされても確実に差し替えできるようにする。 */}
          {isDragging && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/95 text-xs font-medium text-blue-600"
              onDragEnter={onRowDragEnter}
              onDragOver={onRowDragOver}
              onDragLeave={onRowDragLeave}
              onDrop={onRowDrop}
            >
              <Upload className="w-4 h-4" />
              ここにドロップで差し替え
            </div>
          )}
        </div>
      ) : (
        /* ─── 未アップロード: コンパクトなインライン型ドロップゾーン ─── */
        <FileDropzone
          label={label}
          description={`${description}　·　クリックまたはドラッグ＆ドロップ`}
          isUploading={isUploading}
          onFile={handleFile}
        >
          <span className="text-[10px] text-gray-300 flex-shrink-0 hidden sm:inline">
            JPEG · PNG · PDF
          </span>
        </FileDropzone>
      )}

      {error && <p className="text-xs text-red-500 mt-1 px-1">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
