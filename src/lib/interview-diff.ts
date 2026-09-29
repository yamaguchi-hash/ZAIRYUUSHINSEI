/**
 * 質問書・顧客聴取の統合差分エンジン。
 * 「申請書実効値の空欄・必須確認事項（セクションA/B）」と
 * 「書類チェックリスト突合質問」を1つの質問リストとして計算する。
 * 永続化は行わず、呼び出し時点の最新データから毎回ライブ計算する。
 */
import type { ApplicationFormData } from "./form-types";
import { getEmptyQuestions } from "./questionnaire-questions";
import { DOC_INTERVIEW_CHECKS } from "./document-interview-checks";

/** applicationDocumentChecklist の行のうち、本関数が参照するフィールドのみの構造的型 */
export interface ChecklistItemForInterview {
  id: string;
  documentName: string;
  status: string;
  fileName: string | null;
  expertNotes: string | null;
}

export interface InterviewQuestion {
  /** 一意キー（保存時のターゲット特定に使用） */
  id: string;
  /**
   * A: 全カテゴリ共通必須確認事項 / B: 資格別基本質問・書類突合質問 / C: AI検出事項
   * 注: "C" は本ファイルの computeInterviewQuestions では生成されない。
   * analyzeInterviewWithAI が付与するためのバケット。
   */
  bucket: "A" | "B" | "C";
  /** form: application.formData の該当キーへ保存 / checklist: 該当チェックリスト項目のexpertNotesへ追記 */
  kind: "form" | "checklist";
  section: string;
  label: string;
  note?: string;
  options?: string[];
  /** kind === "form" の場合に設定される ApplicationFormData のキー */
  formKey?: string;
  /** kind === "checklist" の場合に設定される対象チェックリスト項目ID */
  checklistItemId?: string;
  /** kind === "checklist" の場合に設定される回答済み判定・追記用マーカー */
  marker?: string;
  /**
   * ユーザーが手動で除外（削除）した質問かどうか。
   * true でも質問自体は配列から取り除かれない（復元UIのために残す）。
   * 印刷・DOCX出力など復元UIを持たない出力先のみ、この値で完全フィルタすること。
   */
  isExcluded?: boolean;
}

/**
 * 統合差分エンジン本体。
 * effectiveForm は buildEffectiveFormData() の戻り値を渡すこと
 * （マスター由来の既知情報を誤って空欄判定しないため）。
 * excludedIds はユーザーが手動除外した質問IDの集合（application.interviewExcludedFields から構築）。
 */
export function computeInterviewQuestions(
  effectiveForm: Partial<ApplicationFormData>,
  formType: string,
  category: string,
  checklist: ChecklistItemForInterview[],
  excludedIds: Set<string> = new Set(),
): InterviewQuestion[] {
  const formQuestions: InterviewQuestion[] = getEmptyQuestions(
    effectiveForm,
    formType,
    category,
  ).map((q) => {
    const formKey = String(q.key);
    const id = `form:${formKey}`;
    return {
      id,
      bucket: q.categories ? "B" : "A",
      kind: "form" as const,
      section: q.section,
      label: q.label,
      note: q.note,
      options: q.options,
      formKey,
      isExcluded: excludedIds.has(id),
    };
  });

  const docQuestions: InterviewQuestion[] = [];
  for (const check of DOC_INTERVIEW_CHECKS) {
    for (const item of checklist) {
      if (!item.documentName.includes(check.matchDocumentName)) continue;
      const isUploaded = item.status === "submitted" || !!item.fileName;
      if (!isUploaded) continue;
      const alreadyAnswered = (item.expertNotes ?? "").includes(check.marker);
      if (alreadyAnswered) continue;
      const id = `doc:${check.id}:${item.id}`;
      docQuestions.push({
        id,
        bucket: "B",
        kind: "checklist",
        section: "書類確認事項",
        label: `${item.documentName}：${check.question}`,
        options: check.options,
        checklistItemId: item.id,
        marker: check.marker,
        isExcluded: excludedIds.has(id),
      });
    }
  }

  return [...formQuestions, ...docQuestions];
}
