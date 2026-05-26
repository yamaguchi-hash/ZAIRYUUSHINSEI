"use client";

import { useRef, useState } from "react";
import { saveApplicantDocument, deleteApplicantDocument } from "@/actions/ocr";
import { Upload, X, CheckCircle, Loader2, ImageIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

type DocType = "passport_front" | "passport_data_page" | "residence_card_front" | "residence_card_back";

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
      // 1. Upload file
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "アップロード失敗");
      }
      const { url, fileName, fileSize, mimeType } = await res.json();

      // 2. Save to DB
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

  const isPdf = existingDoc?.fileName?.toLowerCase().endsWith(".pdf");

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
        /* Preview */
        <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50 group">
          <div className="aspect-[3/2] flex items-center justify-center">
            {isPdf ? (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <FileText className="w-10 h-10" />
                <p className="text-xs">{existingDoc.fileName}</p>
              </div>
            ) : (
              <Image
                src={existingDoc.fileUrl}
                alt={label}
                fill
                className="object-contain p-2"
                unoptimized
              />
            )}
          </div>
          {/* Overlay buttons */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="bg-white text-gray-800 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-100"
            >
              差し替え
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-red-600 flex items-center gap-1"
            >
              {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              削除
            </button>
          </div>
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
              <div className="text-center">
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
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
