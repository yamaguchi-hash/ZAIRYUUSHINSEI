"use client";

import { useState } from "react";
import { Loader2, ScanText } from "lucide-react";
import { extractSectionFromDocs, type SectionKey } from "@/actions/extract-section";
import { cn } from "@/lib/utils";

interface Props {
  applicationId: string;
  sectionKey: SectionKey;
  onExtracted: (data: Record<string, any>) => void;
  className?: string;
}

export function SectionExtractButton({ applicationId, sectionKey, onExtracted, className }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleClick() {
    setIsLoading(true);
    setMsg("");
    setIsError(false);

    const result = await extractSectionFromDocs(applicationId, sectionKey);

    if (result.success && result.data) {
      onExtracted(result.data);
      const count = Object.values(result.data).filter(
        (v) => (Array.isArray(v) ? v.length > 0 : v !== "" && v !== null)
      ).length;
      setMsg(`✓ ${result.docsChecked}件確認・${count}項目を入力`);
      setIsError(false);
    } else {
      setMsg(result.error ?? "読み取りに失敗しました");
      setIsError(true);
    }

    setIsLoading(false);
  }

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
        title="アップロード済み書類から読み取ります"
      >
        {isLoading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <ScanText className="w-3.5 h-3.5" />}
        {isLoading ? "読み取り中..." : "書類から読み取る"}
      </button>
      {msg && (
        <p className={cn("text-xs max-w-[220px] text-right leading-tight",
          isError ? "text-amber-600" : "text-green-600")}>
          {msg}
        </p>
      )}
    </div>
  );
}
