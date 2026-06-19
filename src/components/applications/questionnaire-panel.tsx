"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInterviewAnswer } from "@/actions/interview";
import { analyzeInterviewWithAI } from "@/actions/interview-ai-analysis";
import type { InterviewQuestion } from "@/lib/interview-diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, CheckCircle, Loader2, Save, Sparkles, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionnairePanelProps {
  questions: InterviewQuestion[]; // セクションA/B（サーバーで計算済み）
  applicationId: string;
  userRole?: string;
}

const BUCKET_LABELS: Record<"A" | "B" | "C", string> = {
  A: "共通必須確認事項",
  B: "資格別・書類確認事項",
  C: "AI検出事項（論理矛盾・参考）",
};

function QuestionCard({
  question,
  applicationId,
  isExpert,
  onSaved,
}: {
  question: InterviewQuestion;
  applicationId: string;
  isExpert: boolean;
  onSaved: (questionId: string) => void;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        saved ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-white"
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

export function QuestionnairePanel({ questions, applicationId, userRole }: QuestionnairePanelProps) {
  const router = useRouter();
  const isExpert = userRole === "expert" || userRole === "admin";

  const [aiQuestions, setAiQuestions] = useState<InterviewQuestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiRequested, setAiRequested] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const visibleRuleQuestions = useMemo(
    () => questions.filter((q) => !resolvedIds.has(q.id)),
    [questions, resolvedIds]
  );
  const visibleAiQuestions = useMemo(
    () => aiQuestions.filter((q) => !resolvedIds.has(q.id)),
    [aiQuestions, resolvedIds]
  );

  function handleSaved(questionId: string) {
    setResolvedIds((prev) => new Set(prev).add(questionId));
    // セクションA/Bはサーバー側の差分計算結果なので、保存内容を反映させて再計算する
    router.refresh();
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

  function renderBucket(bucket: "A" | "B" | "C", items: InterviewQuestion[]) {
    if (items.length === 0) return null;
    const bySection = items.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
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
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  const aQuestions = visibleRuleQuestions.filter((q) => q.bucket === "A");
  const bQuestions = visibleRuleQuestions.filter((q) => q.bucket === "B");
  const totalCount = aQuestions.length + bQuestions.length + visibleAiQuestions.length;

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

        {renderBucket("A", aQuestions)}
        {renderBucket("B", bQuestions)}

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

        {renderBucket("C", visibleAiQuestions)}
      </CardContent>
    </Card>
  );
}
