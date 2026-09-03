/**
 * 在日親族及び同居者のAI抽出スキーマ・正規化ヘルパー
 * ──────────────────────────────────────────────────
 * 親族の在留カード・メモから「16. 在日親族及び同居者」を自動入力するための
 * Gemini responseSchema 定義と、AI出力 → FamilyMember[] への変換処理。
 * fill-all-fields.ts（全項目一括）と extract-section.ts（セクション別）の両方から使用。
 */
import { Type } from "@google/genai";
import type { FamilyMember } from "@/lib/form-types";

const S = (desc: string) => ({ type: Type.STRING, description: desc, nullable: true });

/**
 * 在日親族の配列スキーマ（Gemini responseSchema 用）
 * 注意: Gemini の responseSchema には複雑さの上限（状態数制限）があるため、
 * description は極力短くすること。詳細な指示はプロンプト側に書く。
 */
export const FAMILY_IN_JAPAN_SCHEMA = {
  type: Type.ARRAY,
  description: "在日親族一覧（申請人本人は除く）",
  nullable: true,
  items: {
    type: Type.OBJECT,
    properties: {
      relationship:        S("続柄"),
      name:                S("氏名"),
      dateOfBirth:         S("生年月日 YYYY-MM-DD"),
      nationality:         S("国籍"),
      placeOfEmployment:   S("勤務先・通学先"),
      residingTogether:    S("同居の有無（有/無）"),
      residenceCardNumber: S("在留カード番号"),
    },
  },
};

/**
 * AI出力の親族配列を FamilyMember[] に正規化
 * - 氏名も在留カード番号もない行は除外
 * - 日付は YYYY-MM-DD 形式のみ許可
 * - residingTogether は「有」→ true に変換
 */
export function normalizeFamilyMembers(arr: any[]): FamilyMember[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((m) => m && (m.name || m.residenceCardNumber))
    .map((m) => ({
      relationship: typeof m.relationship === "string" ? m.relationship : "",
      name: typeof m.name === "string" ? m.name : "",
      dateOfBirth:
        typeof m.dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.dateOfBirth)
          ? m.dateOfBirth
          : "",
      nationality: typeof m.nationality === "string" ? m.nationality : "",
      placeOfEmployment: typeof m.placeOfEmployment === "string" ? m.placeOfEmployment : "",
      residingTogether: m.residingTogether === "有" || m.residingTogether === true,
      residenceCardNumber:
        typeof m.residenceCardNumber === "string" ? m.residenceCardNumber : "",
    }));
}

/**
 * 既存リストと新規抽出リストをマージ（氏名の空白無視で重複排除）
 * 申請人名と一致するメンバーは除外する
 */
export function mergeFamilyMembers(
  existing: FamilyMember[],
  extracted: FamilyMember[],
  applicantNames: string[] = [],
): FamilyMember[] {
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const applicantSet = new Set(applicantNames.filter(Boolean).map(norm));
  const seen = new Set(existing.map((m) => norm(m.name)).filter(Boolean));

  const merged = [...existing];
  for (const m of extracted) {
    const key = norm(m.name);
    if (!key) continue;
    if (applicantSet.has(key)) continue;  // 申請人本人は除外
    if (seen.has(key)) continue;          // 既存と重複
    seen.add(key);
    merged.push(m);
  }
  return merged;
}
