"use client";

import { useRef, useState, type ReactNode } from "react";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,application/pdf";

interface FileDropzoneProps {
  label: string;
  description?: string;
  accept?: string;
  isUploading: boolean;
  uploadingLabel?: string;
  onFile: (file: File) => void;
  className?: string;
  children?: ReactNode;
}

/**
 * クリック選択とドラッグ&ドロップの両方に対応した汎用アップロード枠。
 * 保存・削除等のデータ処理は呼び出し元が onFile コールバックで行う
 * （このコンポーネント自身はファイル選択UIの見た目と操作のみを担当する）。
 */
export function FileDropzone({
  label,
  description,
  accept,
  isUploading,
  uploadingLabel,
  onFile,
  className,
  children,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex items-center gap-3 border-2 border-dashed rounded-lg px-3 py-2.5 cursor-pointer transition-colors select-none",
        isDragging
          ? "border-blue-400 bg-blue-50"
          : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/40",
        isUploading && "pointer-events-none opacity-60",
        className
      )}
    >
      {isUploading ? (
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
      ) : (
        <Upload className="w-4 h-4 text-gray-300 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
        {description && (
          <p className="text-[10px] text-gray-400 truncate">
            {isUploading ? (uploadingLabel ?? "アップロード中...") : description}
          </p>
        )}
      </div>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? DEFAULT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
