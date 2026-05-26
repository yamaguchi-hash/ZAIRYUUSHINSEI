"use client";

import { useState, useTransition } from "react";
import { toggleExpertCheckmark, updateDocumentStatus, runConsistencyCheck } from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckSquare,
  Square,
  Upload,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Loader2,
  FileText,
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
}

interface DocumentChecklistProps {
  checklist: ChecklistItem[];
  applicationId: string;
  userRole?: string;
  applicationStatus: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  not_submitted: <Clock className="w-4 h-4 text-gray-400" />,
  submitted: <Upload className="w-4 h-4 text-blue-500" />,
  approved: <CheckCircle className="w-4 h-4 text-green-500" />,
  resubmit_required: <AlertCircle className="w-4 h-4 text-red-500" />,
};

const STATUS_LABELS: Record<string, string> = {
  not_submitted: "未提出",
  submitted: "提出済",
  approved: "承認",
  resubmit_required: "再提出要求",
};

export function DocumentChecklist({
  checklist,
  applicationId,
  userRole,
  applicationStatus,
}: DocumentChecklistProps) {
  const [isPending, startTransition] = useTransition();
  const [localChecklist, setLocalChecklist] = useState(checklist);
  const [isCheckRunning, setIsCheckRunning] = useState(false);

  const isExpert = userRole === "expert" || userRole === "admin";
  const requiredItems = localChecklist.filter((i) => i.isRequiredByExpert);
  const submittedRequired = requiredItems.filter((i) => i.status !== "not_submitted");

  function handleToggleExpert(item: ChecklistItem) {
    const newValue = !item.isRequiredByExpert;
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isRequiredByExpert: newValue } : i))
    );
    startTransition(async () => {
      await toggleExpertCheckmark(item.id, newValue);
    });
  }

  function handleStatusChange(itemId: string, status: string) {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status } : i))
    );
    startTransition(async () => {
      await updateDocumentStatus(itemId, status);
    });
  }

  async function handleConsistencyCheck() {
    setIsCheckRunning(true);
    try {
      await runConsistencyCheck(applicationId);
    } finally {
      setIsCheckRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
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
          {isExpert && (
            <button
              onClick={handleConsistencyCheck}
              disabled={isCheckRunning}
              className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isCheckRunning ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              整合性チェック
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {localChecklist.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">書類リストがありません</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {localChecklist.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors",
                  item.isRequiredByExpert ? "" : "opacity-60"
                )}
              >
                {/* Expert checkbox (Step 3) */}
                {isExpert ? (
                  <button
                    onClick={() => handleToggleExpert(item)}
                    disabled={isPending}
                    className="flex-shrink-0 text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    title="専門家チェック（必要書類として確定）"
                  >
                    {item.isRequiredByExpert ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-300" />
                    )}
                  </button>
                ) : (
                  <div className="flex-shrink-0 w-5">
                    {item.isRequiredByExpert && (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                )}

                {/* Document name */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    item.isRequiredByExpert ? "text-gray-900" : "text-gray-400"
                  )}>
                    {item.documentName}
                    {item.isRequiredByExpert && (
                      <span className="ml-2 text-xs text-red-500">必須</span>
                    )}
                  </p>
                  {item.fileName && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {item.fileName}
                    </p>
                  )}
                  {item.expertNotes && (
                    <p className="text-xs text-orange-600 mt-0.5">{item.expertNotes}</p>
                  )}
                </div>

                {/* Status icon */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {STATUS_ICONS[item.status]}
                  <span className="text-xs text-gray-500">{STATUS_LABELS[item.status]}</span>
                </div>

                {/* Expert status control */}
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
