"use client";

import { useRef, useState } from "react";
import { saveApplicantDocument, deleteApplicantDocument } from "@/actions/ocr";
import { Upload, X, CheckCircle, Loader2, FileText, Eye, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentLink, isImageFile } from "./document-viewer";

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
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
        {existingDoc?.ocrProcessedAt && (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckCircle className="w-3 h-3" /> OCR済み
          </span>
        )}
      </div>

      {existingDoc ? (
        /* ファイル名表示のみ（クリックで閲覧） */
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl bg-gray-50 px-3 py-2.5">
          <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <DocumentLink
            url={existingDoc.fileUrl}
            fileName={existingDoc.fileName}
            documentType={documentType}
            className="flex-1 min-w-0 flex items-center gap-1 text-sm text-gray-700 hover:text-blue-600 text-left"
          >
            <span className="truncate">{existingDoc.fileName}</span>
            {isImageFile(existingDoc.fileName) ? (
              <Eye className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
            )}
          </DocumentLink>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex-shrink-0"
          >
            差し替え
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
            title="削除"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        /* Drop zone */
        <div
          className={cn(
            "border-2 border-dashed rounded-xl aspect-[3/2] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors",
            isDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50",
            isUploading && "pointer-events-none opacity-60"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-xs text-blue-600">アップロード中...</p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-300" />
              <div className="text-center px-2">
                <p className="text-xs text-gray-500">クリックまたはドラッグ＆ドロップ</p>
                <p className="text-xs text-gray-400">JPEG / PNG / WebP / PDF（10MB以下）</p>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

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
