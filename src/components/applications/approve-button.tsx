"use client";

import { useState, useTransition } from "react";
import { approveApplication } from "@/actions/applications";
import { CheckCircle, Loader2 } from "lucide-react";

interface ApproveButtonProps {
  applicationId: string;
}

export function ApproveButton({ applicationId }: ApproveButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  function handleClick() {
    if (!confirmed) {
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 3000);
      return;
    }
    startTransition(async () => {
      await approveApplication(applicationId);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap ${
        confirmed
          ? "bg-green-600 text-white hover:bg-green-700"
          : "border border-green-600 text-green-600 hover:bg-green-50"
      }`}
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          承認中...
        </>
      ) : (
        <>
          <CheckCircle className="w-4 h-4" />
          {confirmed ? "もう一度クリックで承認確定" : "申請を承認する"}
        </>
      )}
    </button>
  );
}
