"use client";

import { useState, useTransition } from "react";
import { updateApplicationStatus } from "@/actions/applications";
import { CheckCircle, Circle, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  label: string;
}

interface WorkflowStepperProps {
  steps: Step[];
  currentStep: string;
  applicationId: string;
  userRole?: string;
}

const STEP_ORDER = [
  "draft",
  "documents_requested",
  "documents_collecting",
  "ocr_processing",
  "questionnaire_sent",
  "under_review",
  "approved",
  "submitted",
  "completed",
];

export function WorkflowStepper({
  steps,
  currentStep,
  applicationId,
  userRole,
}: WorkflowStepperProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStep, setOptimisticStep] = useState(currentStep);

  const currentIndex = STEP_ORDER.indexOf(optimisticStep);

  function canAdvance() {
    return (
      (userRole === "expert" || userRole === "admin") &&
      currentIndex < STEP_ORDER.length - 1 &&
      optimisticStep !== "approved" &&
      optimisticStep !== "completed"
    );
  }

  function handleAdvance() {
    if (!canAdvance()) return;
    const nextStep = STEP_ORDER[currentIndex + 1];
    setOptimisticStep(nextStep);
    startTransition(async () => {
      await updateApplicationStatus(applicationId, nextStep);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {steps.map((step, idx) => {
          const stepIndex = STEP_ORDER.indexOf(step.key);
          const isDone = stepIndex < currentIndex;
          const isCurrent = step.key === optimisticStep;
          const isFuture = stepIndex > currentIndex;

          return (
            <div key={step.key} className="flex items-center flex-shrink-0">
              <div
                className={cn(
                  "flex flex-col items-center gap-1 min-w-[80px]",
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                    isDone
                      ? "bg-green-500 border-green-500 text-white"
                      : isCurrent
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-gray-200 text-gray-400"
                  )}
                >
                  {isDone ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs text-center leading-tight",
                    isCurrent ? "font-semibold text-blue-600" : isDone ? "text-green-600" : "text-gray-400"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    "w-6 h-0.5 flex-shrink-0 mx-1 mb-4",
                    stepIndex < currentIndex ? "bg-green-400" : "bg-gray-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {canAdvance() && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={handleAdvance}
            disabled={isPending}
            className="inline-flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                更新中...
              </>
            ) : (
              <>
                次のステップへ進む
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
