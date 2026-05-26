"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteApplication } from "@/actions/applications";
import { Trash2, Loader2, AlertTriangle, X } from "lucide-react";

interface Props {
  applicationId: string;
  caseNumber: string;
  applicantName: string;
}

export function DeleteApplicationButton({ applicationId, caseNumber, applicantName }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    setError("");
    startTransition(async () => {
      const result = await deleteApplication(applicationId);
      if (!result.success) {
        setError(result.error ?? "削除に失敗しました");
        return;
      }
      router.push("/applications");
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        削除
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !isPending && setShowModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <button
              onClick={() => setShowModal(false)}
              disabled={isPending}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">申請案件を削除しますか？</h2>
                <p className="text-sm text-gray-500 mt-0.5">この操作は元に戻せません</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 space-y-1">
              <p className="text-xs text-gray-500">案件番号</p>
              <p className="text-sm font-mono font-medium text-gray-800">{caseNumber}</p>
              <p className="text-xs text-gray-500 mt-1">申請人</p>
              <p className="text-sm font-medium text-gray-800">{applicantName}</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                disabled={isPending}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" />削除中...</>
                  : <><Trash2 className="w-4 h-4" />削除する</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
