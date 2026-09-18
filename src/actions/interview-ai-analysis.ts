"use server";

import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { buildEffectiveFormData } from "@/lib/effective-form-data";
import { computeInterviewQuestions, type InterviewQuestion } from "@/lib/interview-diff";
import { toFormType } from "@/lib/questionnaire-questions";
import { EMPTY_FORM_DATA, type ApplicationFormData } from "@/lib/form-types";

const SYSTEM_PROMPT = `あなたは入管申請（在留資格手続き）の専門家および優秀なヒアリングアシスタントです。
提供された「現在作成中の申請書データ（JSON）」を厳密に分析し、以下の指示に従って顧客向けの質問リストをJSON形式で出力してください。

1. データの分析:
   - 値が空欄（null, "", 未定義）になっている項目をすべてリストアップしてください。
   - すでに値が入っている項目でも、前後の論理的矛盾（例：既婚となっているが配偶者情報が空、など）がある項目を特定してください。
2. 質問文への変換:
   - テクニカルな変数名（例: \`office_address_postal_code\`）を、顧客（外国人や受入企業）が直感的に理解できる親切で分かりやすい日本語の質問文（例: 「会社の事務所の郵便番号を教えてください」）に変換してください。
3. 出力フォーマット:
   - 必ず以下の構造のプレーンなJSON配列で返却してください。
     [
       { "field": "変数名", "question": "分かりやすい質問文", "category": "C" }
     ]`;

const KNOWN_FORM_KEYS = new Set(Object.keys(EMPTY_FORM_DATA));

interface AIRawItem {
  field?: unknown;
  question?: unknown;
  category?: unknown;
}

export interface AnalyzeInterviewResult {
  success: boolean;
  questions: InterviewQuestion[];
  skipped?: boolean;
  message?: string;
  error?: string;
}

/**
 * Gemini 2.5 Flash で申請書実効値を分析し、論理矛盾等の追加確認事項（セクションC）を検出する。
 * ルールベース（セクションA/B）で既に出ている項目は重複除去し、AIの価値を矛盾検出に限定する。
 * データなし・APIキー未設定・呼び出し失敗・パース失敗のいずれの場合も例外を投げず、
 * 安全に空配列を返す（クラッシュ防止）。
 */
export async function analyzeInterviewWithAI(
  applicationId: string
): Promise<AnalyzeInterviewResult> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, questions: [], error: "認証が必要です" };

    const data = await getApplicationById(applicationId);
    const { application, applicant, organization, checklist } = data;

    const rawFormData = application.formData as Partial<ApplicationFormData> | null;
    if (!rawFormData || Object.keys(rawFormData).length === 0) {
      return {
        success: true,
        questions: [],
        skipped: true,
        message: "申請書データがまだ作成されていません。セクションA・Bの内容をご確認ください。",
      };
    }

    if (!process.env.GEMINI_API_KEY) {
      return { success: true, questions: [] };
    }

    const excludedIds = new Set((application.interviewExcludedFields ?? []) as string[]);

    const effectiveForm = buildEffectiveFormData(application, applicant, organization);
    const formType = toFormType(effectiveForm.applicationFormType ?? application.applicationType);
    const category = effectiveForm.visaFormCategory ?? "N";

    // ルールベースで既に出ている質問のフィールドキー（重複除去用）
    const ruleBasedQuestions = computeInterviewQuestions(effectiveForm, formType, category, checklist);
    const alreadyCovered = new Set(
      ruleBasedQuestions.filter((q) => q.kind === "form").map((q) => q.formKey)
    );

    let aiItems: AIRawItem[] = [];
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              { text: `【現在作成中の申請書データ（JSON）】\n${JSON.stringify(effectiveForm)}` },
            ],
          },
        ],
      });
      const text = response.text ?? "[]";
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          aiItems = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
        } catch {
          aiItems = [];
        }
      }
    } catch (aiErr: any) {
      console.error("[analyzeInterviewWithAI] Gemini error:", aiErr?.message);
      return { success: true, questions: [] };
    }

    const seen = new Set<string>();
    const questions: InterviewQuestion[] = [];
    for (const item of aiItems) {
      if (!item || typeof item.field !== "string" || typeof item.question !== "string") continue;
      if (!KNOWN_FORM_KEYS.has(item.field)) continue;
      if (alreadyCovered.has(item.field)) continue;
      if (seen.has(item.field)) continue;
      seen.add(item.field);
      const id = `ai:${item.field}`;
      questions.push({
        id,
        bucket: "C",
        kind: "form",
        section: "AI検出事項",
        label: item.question,
        formKey: item.field,
        isExcluded: excludedIds.has(id),
      });
      if (questions.length >= 15) break;
    }

    return { success: true, questions };
  } catch (err: any) {
    console.error("[analyzeInterviewWithAI] error:", err?.message);
    return { success: true, questions: [], error: err?.message };
  }
}
