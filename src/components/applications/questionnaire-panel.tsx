"use client";

import { useState, useTransition } from "react";
import { updateQuestionnaireAnswer } from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, CheckCircle, Clock, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  fieldKey: string;
  questionJa: string;
  answer: string | null;
  answeredAt: Date | string | null;
  isRequired: boolean;
  answerType: string;
}

interface QuestionnairePanelProps {
  questions: Question[];
  applicationId: string;
  userRole?: string;
}

export function QuestionnairePanel({
  questions,
  applicationId,
  userRole,
}: QuestionnairePanelProps) {
  const [isPending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(questions.map((q) => [q.id, q.answer ?? ""]))
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const isExpert = userRole === "expert" || userRole === "admin";
  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;

  async function handleSave(questionId: string) {
    setSavingId(questionId);
    startTransition(async () => {
      await updateQuestionnaireAnswer(questionId, answers[questionId] ?? "");
      setSavedIds((prev) => new Set(prev).add(questionId));
      setSavingId(null);
    });
  }

  async function handleSaveAll() {
    setSavingId("all");
    startTransition(async () => {
      for (const q of questions) {
        await updateQuestionnaireAnswer(q.id, answers[q.id] ?? "");
      }
      setSavedIds(new Set(questions.map((q) => q.id)));
      setSavingId(null);
    });
  }

  if (questions.length === 0) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="py-8 text-center text-sm text-amber-700">
          質問書がまだ生成されていません。ワークフローで「次のステップへ進む」をクリックすると自動生成されます。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <MessageSquare className="w-5 h-5 text-amber-600" />
            質問書　— お客様への確認事項
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-amber-700 bg-amber-100 rounded-full px-3 py-1">
              {answeredCount} / {questions.length} 件回答済み
            </span>
            {isExpert && (
              <button
                onClick={handleSaveAll}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {savingId === "all"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                全回答を保存
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-amber-700 mt-1">
          以下の質問をお客様に確認し、回答を入力してください。回答は申請書に自動反映されます。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.map((q, idx) => {
          const isAnswered = !!(answers[q.id]?.trim());
          const isSaved = savedIds.has(q.id) || (!!q.answer && answers[q.id] === q.answer);
          return (
            <div
              key={q.id}
              className={cn(
                "rounded-xl border p-4 transition-colors",
                isAnswered
                  ? "border-green-200 bg-green-50/50"
                  : "border-amber-200 bg-white"
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5",
                  isAnswered ? "bg-green-500 text-white" : "bg-amber-200 text-amber-700"
                )}>
                  {isAnswered ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 leading-snug">
                    {q.questionJa}
                    {q.isRequired && <span className="ml-1 text-xs text-red-500">*必須</span>}
                  </p>
                  {q.answeredAt && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      回答日時：{new Date(q.answeredAt).toLocaleString("ja-JP")}
                    </p>
                  )}
                </div>
              </div>

              {/* 回答入力 */}
              <div className="ml-9">
                <textarea
                  value={answers[q.id] ?? ""}
                  onChange={(e) => {
                    setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                    setSavedIds((prev) => { const s = new Set(prev); s.delete(q.id); return s; });
                  }}
                  readOnly={!isExpert}
                  rows={3}
                  placeholder={isExpert ? "お客様からの回答を入力してください..." : ""}
                  className={cn(
                    "w-full text-sm border rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-amber-400",
                    isExpert
                      ? "bg-white border-gray-300 text-gray-900"
                      : "bg-gray-50 border-gray-200 text-gray-700"
                  )}
                />
                {isExpert && (
                  <div className="flex items-center justify-end mt-2">
                    {isSaved && isAnswered && (
                      <span className="text-xs text-green-600 mr-2 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> 保存済み
                      </span>
                    )}
                    <button
                      onClick={() => handleSave(q.id)}
                      disabled={isPending || !answers[q.id]?.trim()}
                      className="inline-flex items-center gap-1 text-xs text-amber-700 border border-amber-300 rounded px-2 py-1 hover:bg-amber-50 disabled:opacity-40"
                    >
                      {savingId === q.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Save className="w-3 h-3" />}
                      保存
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
