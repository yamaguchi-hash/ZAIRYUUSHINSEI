"use client";

import { useState } from "react";
import {
  updateApplicationStatus,
  generateQuestionnaire,
} from "@/actions/applications";
import { CheckCircle, ArrowRight, ArrowLeft, Loader2, Info, AlertCircle } from "lucide-react";
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
  hasQuestionnaire?: boolean;
}

// 8ステップの順序（DB status値）
const STEP_ORDER = [
  "draft",
  "documents_requested",
  "documents_collecting",
  "ocr_processing",
  "questionnaire_sent",
  "under_review",
  "submitted",
  "completed",
];

// 各ステップの説明
const STEP_DESCRIPTIONS: Record<string, { action: string; hint: string }> = {
  draft: {
    action: "申請人・所属機関・在留資格の基本情報を入力してください",
    hint: "入力完了後、次のステップへ進んでください",
  },
  documents_requested: {
    action: "在留資格に必要な書類一覧を確認し、お客様にご案内ください",
    hint: "「⚡ 必須書類を自動追加」ボタンで書類リストを生成できます",
  },
  documents_collecting: {
    action: "お客様が書類を準備・アップロードする段階です",
    hint: "全書類が揃ったら「申請書類の下書きを作成」ボタンが表示されます",
  },
  ocr_processing: {
    action: "④ 申請書を作成するステップです",
    hint: "「申請書を作成」ボタンから申請書の各項目を入力・編集してください",
  },
  questionnaire_sent: {
    action: "不足情報の質問書をAIが自動生成しました。お客様に確認して回答を入力してください",
    hint: "全質問への回答を保存してから、次のステップへ進んでください",
  },
  under_review: {
    action: "申請書の内容を最終確認してください",
    hint: "問題なければ「PDF出力・署名」ステップへ進んでください",
  },
  submitted: {
    action: "「書類一覧PDF」ボタンから申請書をPDF出力し、お客様に署名していただいてください",
    hint: "署名済み書類を受領後、入管へ提出。申請日と申請番号を下の欄に記録してください",
  },
  completed: {
    action: "⑧ 許可・完了ステップです",
    hint: "許可日を記録し、更新・変更の場合は新しい在留カードで申請人マスターを更新して完了にしてください",
  },
};

export function WorkflowStepper({
  steps,
  currentStep,
  applicationId,
  userRole,
}: WorkflowStepperProps) {
  const [optimisticStep, setOptimisticStep] = useState(currentStep);
  const [isLoading, setIsLoading] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // STEP_ORDER内の現在位置（-1 = 不明なステータス）
  const currentIndex = STEP_ORDER.indexOf(optimisticStep);

  // ロールに関わらず操作可能（ログイン済みであれば誰でも変更可能）
  const canGoBack = currentIndex > 0 && !isLoading;
  const canAdvance = currentIndex >= 0 && currentIndex < STEP_ORDER.length - 1 && !isLoading;

  // ステップドットを直接クリックして移動
  async function handleStepClick(targetKey: string) {
    if (isLoading) return;
    const targetIndex = STEP_ORDER.indexOf(targetKey);
    if (targetIndex < 0 || targetIndex === currentIndex) return;

    // 次ステップへの自動処理は「進む」方向のみ
    setIsLoading(true);
    setErrorMessage("");

    try {
      if (targetIndex > currentIndex) {
        // 前進: ステップ間の自動処理
        await runAutoProcess(targetKey);
      }

      setProcessingMessage("ステータスを更新中...");
      const result = await updateApplicationStatus(applicationId, targetKey);
      if (!result.success) {
        setErrorMessage(result.error ?? "ステータス更新に失敗しました");
        setIsLoading(false);
        setProcessingMessage("");
        return;
      }
      setOptimisticStep(targetKey);
      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err?.message ?? "ステップの移動に失敗しました");
      setIsLoading(false);
      setProcessingMessage("");
    }
  }

  async function runAutoProcess(nextStep: string) {
    if (nextStep === "questionnaire_sent") {
      setProcessingMessage("AIが質問書を生成中...");
      await generateQuestionnaire(applicationId);
    }
  }

  async function handleAdvance() {
    if (!canAdvance) return;
    const nextStep = STEP_ORDER[currentIndex + 1];
    setIsLoading(true);
    setErrorMessage("");

    try {
      await runAutoProcess(nextStep);
      setProcessingMessage("ステータスを更新中...");
      const result = await updateApplicationStatus(applicationId, nextStep);
      if (!result.success) {
        setErrorMessage(result.error ?? "ステータス更新に失敗しました");
        setIsLoading(false);
        setProcessingMessage("");
        return;
      }
      setOptimisticStep(nextStep);
      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err?.message ?? "ステップ移行に失敗しました");
      setIsLoading(false);
      setProcessingMessage("");
    }
  }

  async function handleGoBack() {
    if (!canGoBack) return;
    const prevStep = STEP_ORDER[currentIndex - 1];
    setIsLoading(true);
    setErrorMessage("");
    setProcessingMessage("ステータスを更新中...");

    try {
      const result = await updateApplicationStatus(applicationId, prevStep);
      if (!result.success) {
        setErrorMessage(result.error ?? "ステータス更新に失敗しました");
        setIsLoading(false);
        setProcessingMessage("");
        return;
      }
      setOptimisticStep(prevStep);
      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err?.message ?? "ステップの変更に失敗しました");
      setIsLoading(false);
      setProcessingMessage("");
    }
  }

  const desc = STEP_DESCRIPTIONS[optimisticStep];

  return (
    <div>
      {/* ステップインジケーター（ドットをクリックして移動可能） */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {steps.map((step, idx) => {
          const stepIndex = STEP_ORDER.indexOf(step.key);
          const isDone = stepIndex >= 0 && stepIndex < currentIndex;
          const isCurrent = step.key === optimisticStep;
          const isClickable = !isLoading && stepIndex >= 0 && stepIndex !== currentIndex;

          return (
            <div key={step.key} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center gap-1 min-w-[76px]">
                <button
                  type="button"
                  onClick={() => isClickable && handleStepClick(step.key)}
                  disabled={isLoading}
                  title={
                    isClickable
                      ? isDone
                        ? `ステップ${idx + 1}に戻る`
                        : `ステップ${idx + 1}へ進む`
                      : step.label
                  }
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                    isDone
                      ? "bg-green-500 border-green-500 text-white hover:bg-green-600 cursor-pointer"
                      : isCurrent
                      ? "bg-blue-600 border-blue-600 text-white ring-4 ring-blue-100 cursor-default"
                      : "bg-white border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-400 cursor-pointer",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isDone ? <CheckCircle className="w-4 h-4" /> : <span>{idx + 1}</span>}
                </button>
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
                    "w-5 h-0.5 flex-shrink-0 mx-1 mb-4",
                    stepIndex >= 0 && stepIndex < currentIndex ? "bg-green-400" : "bg-gray-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 操作ヒント */}
      <p className="text-xs text-gray-400 mt-1 mb-2">
        ● 完了済みのステップ（緑）または未来のステップをクリックして直接移動できます
      </p>

      {/* 現在のステップの説明 */}
      {desc && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">{desc.action}</p>
            <p className="text-xs text-blue-500 mt-0.5">{desc.hint}</p>
          </div>
        </div>
      )}

      {/* 処理中メッセージ */}
      {processingMessage && (
        <div className="mt-2 flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          {processingMessage}
        </div>
      )}

      {/* エラーメッセージ */}
      {errorMessage && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* 前へ / 次へ ボタン */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        {/* 前のステップへ */}
        <button
          onClick={handleGoBack}
          disabled={!canGoBack}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            canGoBack
              ? "border border-gray-300 text-gray-600 hover:bg-gray-50"
              : "border border-gray-200 text-gray-300 cursor-not-allowed"
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowLeft className="w-4 h-4" />
          )}
          前のステップへ戻る
        </button>

        {/* 次のステップへ */}
        <button
          onClick={handleAdvance}
          disabled={!canAdvance}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            canAdvance
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-300 cursor-not-allowed"
          )}
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />処理中...</>
          ) : (
            <>次のステップへ進む<ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </div>
    </div>
  );
}
