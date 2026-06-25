"use client";

import { useState } from "react";
import { useMasterDocumentForChecklistItem, type MasterFileOption } from "@/actions/applications";
import { Loader2, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AvailableMasterFiles {
  applicant: MasterFileOption[];
  organization: MasterFileOption[];
  supporter: MasterFileOption[];
}

const SOURCE_LABELS: Record<"applicant" | "organization" | "supporter", string> = {
  applicant: "申請人マスター",
  organization: "所属機関マスター",
  supporter: "扶養者",
};

export function MasterDocumentPicker({
  applicationId,
  itemId,
  slot,
  availableMasterFiles,
  onPrimaryApplied,
  onExtraApplied,
}: {
  applicationId: string;
  itemId: string;
  slot: "primary" | "extra";
  availableMasterFiles: AvailableMasterFiles;
  onPrimaryApplied?: (itemId: string, item: {
    fileUrl: string | null; fileName: string | null; fileSize: number | null; mimeType: string | null;
    status: string; fileSourcedFromMaster: boolean; fileSourcedFromMasterType: string | null;
  }) => void;
  onExtraApplied?: (itemId: string, file: {
    fileUrl: string; fileName: string; fileSize: number; mimeType: string;
    sourcedFromMaster: boolean; sourcedFromMasterType: "applicant" | "organization" | "supporter";
  }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const groups: { source: "applicant" | "organization" | "supporter"; files: MasterFileOption[] }[] = [
    { source: "applicant", files: availableMasterFiles.applicant },
    { source: "organization", files: availableMasterFiles.organization },
    { source: "supporter", files: availableMasterFiles.supporter },
  ].filter((g) => g.files.length > 0) as { source: "applicant" | "organization" | "supporter"; files: MasterFileOption[] }[];

  if (groups.length === 0) return null;

  async function handleUse(source: "applicant" | "organization" | "supporter", file: MasterFileOption) {
    setApplyingId(file.id);
    setError("");
    try {
      const result = await useMasterDocumentForChecklistItem(applicationId, itemId, source, file.id, slot);
      if (!result.success) {
        setError(result.error ?? "反映に失敗しました");
        return;
      }
      if (slot === "primary" && result.item) onPrimaryApplied?.(itemId, result.item);
      if (slot === "extra" && result.addedFile) onExtraApplied?.(itemId, result.addedFile);
      setExpanded(false);
    } catch (err: any) {
      setError(err.message ?? "反映に失敗しました");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => { setError(""); setExpanded((v) => !v); }}
        aria-expanded={expanded}
        aria-label={expanded ? "マスター書類選択を閉じる" : "マスター書類選択を開く"}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        マスターから選択
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-1 w-72 max-w-full bg-white border border-indigo-200 rounded-lg shadow-sm p-2 space-y-2">
          {groups.map((g) => (
            <div key={g.source}>
              <p className="text-[11px] font-semibold text-gray-500 mb-1">{SOURCE_LABELS[g.source]}</p>
              <div className="space-y-1">
                {g.files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                    <span className="truncate" title={f.label}>{f.label}</span>
                    <button
                      type="button"
                      disabled={applyingId === f.id}
                      onClick={() => handleUse(g.source, f)}
                      className={cn(
                        "flex-shrink-0 px-2 py-0.5 rounded text-white text-[11px]",
                        applyingId === f.id ? "bg-indigo-300" : "bg-indigo-600 hover:bg-indigo-700"
                      )}
                    >
                      {applyingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "この書類を使用"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {error && <p className="text-xs text-red-500 whitespace-pre-wrap">{error}</p>}
        </div>
      )}
    </div>
  );
}
