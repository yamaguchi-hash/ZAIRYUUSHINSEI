"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveInterviewAnswer, setInterviewQuestionExcluded } from "@/actions/interview";
import { analyzeInterviewWithAI } from "@/actions/interview-ai-analysis";
import type { InterviewQuestion } from "@/lib/interview-diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, CheckCircle, Loader2, Save, Sparkles, Info, Trash2, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionnairePanelProps {
  questions: InterviewQuestion[]; // セクションA/B（サーバーで計算済み、isExcludedフラグ付き）
  applicationId: string;
  userRole?: string;
}

const BUCKET_LABELS: Record<"A" | "B" | "C", string> = {
  A: "共通必須確認事項",
  B: "資格別・書類確認事項",
  C: "AI検出事項（論理矛盾・参考）",
};

// ── 削除トースト通知 ─────────────────────────────────────────────────────────
function UndoToast({
  onUndo,
  onDismiss,
}: {
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white rounded-lg px-4 py-3 shadow-lg text-sm">
      <span>質問を削除しました</span>
      <button
        onClick={onUndo}
        className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 font-medium"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        元に戻す
      </button>
    </div>
  );
}

// ── 1問分のカード（回答入力＋削除ボタン） ─────────────────────────────────────
function QuestionCard({
  question,
  applicationId,
  isExpert,
  onSaved,
  onExcluded,
}: {
  question: InterviewQuestion;
  applicationId: string;
  isExpert: boolean;
  onSaved: (questionId: string) => void;
  onExcluded: (question: InterviewQuestion) => void;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isExcludePending, setIsExcludePending] = useState(false);

  function handleSave() {
    if (!value.trim()) return;
    setError("");
    startTransition(async () => {
      const result =
        question.kind === "form"
          ? await saveInterviewAnswer({
              kind: "form",
              applicationId,
              formKey: question.formKey!,
              value,
            })
          : await saveInterviewAnswer({
              kind: "checklist",
              applicationId,
              checklistItemId: question.checklistItemId!,
              marker: question.marker!,
              value,
            });

      if (result.success) {
        setSaved(true);
        onSaved(question.id);
      } else {
        setError(result.error ?? "保存に失敗しました");
      }
    });
  }

  async function handleDelete() {
    if (question.bucket === "A") {
      const confirmed = window.confirm(
        "この質問は入管申請に強く推奨される項目です。本当に削除しますか？"
      );
      if (!confirmed) return;
    }

    setIsFadingOut(true);
    setIsExcludePending(true);
    const result = await setInterviewQuestionExcluded(applicationId, question.id, true);
    setIsExcludePending(false);

    if (result.success) {
      onExcluded(question);
    } else {
      setIsFadingOut(false);
      setError(result.error ?? "削除に失敗しました");
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all duration-300",
        isFadingOut ? "opacity-0 max-h-0 overflow-hidden p-0 border-0 mb-0" : "opacity-100",
        !isFadingOut && (saved ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-white")
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5",
            saved ? "bg-green-500 text-white" : "bg-amber-200 text-amber-700"
          )}
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : "?"}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800 leading-snug">
            {question.label}
            {question.note && (
              <span className="ml-1 text-xs text-gray-400">（{question.note}）</span>
            )}
          </p>
        </div>
        {isExpert && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isExcludePending}
            title="この質問を削除する"
            className="flex-shrink-0 text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {!saved && (
        <div className="ml-9">
          {question.options && question.options.length > 0 ? (
            <div className="flex gap-2">
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={!isExpert || isPending}
                  onClick={() => setValue(opt)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-lg border",
                    value === opt
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              readOnly={!isExpert}
              rows={2}
              placeholder={isExpert ? "お客様からの回答を入力してください..." : ""}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          )}

          {isExpert && (
            <div className="flex items-center justify-end mt-2 gap-2">
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button
                onClick={handleSave}
                disabled={isPending || !value.trim()}
                className="inline-flex items-center gap-1 text-xs text-amber-700 border border-amber-300 rounded px-2 py-1 hover:bg-amber-50 disabled:opacity-40"
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                保存
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 削除済み質問の折りたたみ一覧 ─────────────────────────────────────────────
function ExcludedAccordion({
  items,
  onRestore,
}: {
  items: InterviewQuestion[];
  onRestore: (question: InterviewQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
      >
        <span>削除済みの質問を表示（{items.length}件）</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-gray-100 p-2 space-y-1.5">
          {items.map((q) => (
            <div
              key={q.id}
              className="flex items-center justify-between gap-2 bg-gray-50 rounded px-3 py-2 text-xs text-gray-600"
            >
              <span className="flex-1">{q.label}</span>
              <button
                type="button"
                onClick={() => onRestore(q)}
                className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 flex-shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                元に戻す
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function QuestionnairePanel({ questions, applicationId, userRole }: QuestionnairePanelProps) {
  const router = useRouter();
  const isExpert = userRole === "expert" || userRole === "admin";

  const [aiQuestions, setAiQuestions] = useState<InterviewQuestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiRequested, setAiRequested] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [locallyExcludedIds, setLocallyExcludedIds] = useState<Set<string>>(new Set());
  const [locallyRestoredIds, setLocallyRestoredIds] = useState<Set<string>>(new Set());
  const [undoTarget, setUndoTarget] = useState<InterviewQuestion | null>(null);

  function isQuestionExcluded(q: InterviewQuestion): boolean {
    if (locallyRestoredIds.has(q.id)) return false;
    return q.isExcluded === true || locallyExcludedIds.has(q.id);
  }

  const allRule = useMemo(
    () => questions.filter((q) => !resolvedIds.has(q.id)),
    [questions, resolvedIds]
  );
  const allAi = useMemo(
    () => aiQuestions.filter((q) => !resolvedIds.has(q.id)),
    [aiQuestions, resolvedIds]
  );

  const visibleRule = allRule.filter((q) => !isQuestionExcluded(q));
  const visibleAi = allAi.filter((q) => !isQuestionExcluded(q));
  const excludedRule = allRule.filter((q) => isQuestionExcluded(q));
  const excludedAi = allAi.filter((q) => isQuestionExcluded(q));

  function handleSaved(questionId: string) {
    setResolvedIds((prev) => new Set(prev).add(questionId));
    router.refresh();
  }

  function handleExcluded(question: InterviewQuestion) {
    setLocallyExcludedIds((prev) => new Set(prev).add(question.id));
    setLocallyRestoredIds((prev) => {
      const next = new Set(prev);
      next.delete(question.id);
      return next;
    });
    setUndoTarget(question);
  }

  async function restoreQuestion(question: InterviewQuestion) {
    setLocallyRestoredIds((prev) => new Set(prev).add(question.id));
    setLocallyExcludedIds((prev) => {
      const next = new Set(prev);
      next.delete(question.id);
      return next;
    });
    const result = await setInterviewQuestionExcluded(applicationId, question.id, false);
    if (!result.success) {
      // 復元に失敗した場合はロールバックし、除外状態のまま維持する
      setLocallyRestoredIds((prev) => {
        const next = new Set(prev);
        next.delete(question.id);
        return next;
      });
      setLocallyExcludedIds((prev) => new Set(prev).add(question.id));
    }
  }

  function handleUndoFromToast() {
    if (undoTarget) {
      restoreQuestion(undoTarget);
      setUndoTarget(null);
    }
  }

  async function handleAnalyze() {
    setAiLoading(true);
    setAiError("");
    setAiMessage("");
    setAiRequested(true);
    try {
      const result = await analyzeInterviewWithAI(applicationId);
      if (!result.success) {
        setAiError(result.error ?? "AI分析に失敗しました");
      } else if (result.skipped) {
        setAiMessage(result.message ?? "AI分析をスキップしました");
      } else {
        setAiQuestions(result.questions);
        if (result.questions.length === 0) {
          setAiMessage("AIによる追加検出事項はありませんでした。");
        }
      }
    } catch (e: any) {
      setAiError(e?.message ?? "AI分析に失敗しました");
    } finally {
      setAiLoading(false);
    }
  }

  function renderBucket(bucket: "A" | "B" | "C", visibleItems: InterviewQuestion[], excludedItems: InterviewQuestion[]) {
    if (visibleItems.length === 0 && excludedItems.length === 0) return null;
    const bySection = visibleItems.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
      (acc[q.section] ??= []).push(q);
      return acc;
    }, {});
    return (
      <div key={bucket} className="space-y-3">
        <h3 className="text-sm font-semibold text-amber-900">{BUCKET_LABELS[bucket]}</h3>
        {Object.entries(bySection).map(([section, sectionQuestions]) => (
          <div key={section} className="space-y-2">
            <p className="text-xs text-gray-500">{section}</p>
            {sectionQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                applicationId={applicationId}
                isExpert={isExpert}
                onSaved={handleSaved}
                onExcluded={handleExcluded}
              />
            ))}
          </div>
        ))}
        {isExpert && <ExcludedAccordion items={excludedItems} onRestore={restoreQuestion} />}
      </div>
    );
  }

  const aQuestions = visibleRule.filter((q) => q.bucket === "A");
  const bQuestions = visibleRule.filter((q) => q.bucket === "B");
  const aExcluded = excludedRule.filter((q) => q.bucket === "A");
  const bExcluded = excludedRule.filter((q) => q.bucket === "B");
  const totalCount = aQuestions.length + bQuestions.length + visibleAi.length;

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <MessageSquare className="w-5 h-5 text-amber-600" />
            質問書　— お客様への確認事項
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-amber-700 bg-amber-100 rounded-full px-3 py-1">
              {totalCount} 件
            </span>
            {isExpert && (
              <button
                onClick={handleAnalyze}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                AIで分析
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-amber-700 mt-1">
          以下の質問をお客様に確認し、回答を入力してください。回答は申請書に自動反映されます。
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {aQuestions.length === 0 && bQuestions.length === 0 && !aiRequested && (
          <p className="text-sm text-amber-700 text-center py-4">
            聴取が必要な事項はありません。
          </p>
        )}

        {renderBucket("A", aQuestions, aExcluded)}
        {renderBucket("B", bQuestions, bExcluded)}

        {(aiMessage || aiError) && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
              aiError ? "bg-red-50 text-red-700 border border-red-200" : "bg-blue-50 text-blue-700 border border-blue-200"
            )}
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {aiError || aiMessage}
          </div>
        )}

        {renderBucket("C", visibleAi, excludedAi)}
      </CardContent>

      {undoTarget && (
        <UndoToast onUndo={handleUndoFromToast} onDismiss={() => setUndoTarget(null)} />
      )}
    </Card>
  );
}
