import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ローマ字氏名のスペースを半角1つに統一し、前後の空白を除去する（全角スペース・連続スペース対応） */
export function normalizeRomajiName(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/[\s　]+/g, " ").trim();
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export const VISA_TYPE_LABELS: Record<string, string> = {
  engineer_humanities: "技術・人文知識・国際業務",
  intra_company_transferee: "企業内転勤",
  skilled_labor: "技能",
  specified_skilled_worker_1: "特定技能1号",
  specified_skilled_worker_2: "特定技能2号",
  professor: "教授",
  artist: "芸術",
  religious_activities: "宗教",
  journalist: "報道",
  business_manager: "経営・管理",
  legal_accounting: "法律・会計業務",
  medical_services: "医療",
  nursing_care: "介護",
  researcher: "研究",
  instructor: "教育",
  diplomat: "外交",
  official: "公用",
  highly_skilled_professional_1: "高度専門職1号",
  highly_skilled_professional_2: "高度専門職2号",
  highly_skilled_professional_3: "高度専門職3号",
  permanent_resident: "永住者",
  spouse_of_japanese: "日本人の配偶者等",
  child_of_japanese: "日本人の配偶者等（子）",
  long_term_resident: "定住者",
  student: "留学",
  training: "研修",
  dependent: "家族滞在",
  designated_activities: "特定活動",
  technical_intern_1i: "技能実習1号イ",
  technical_intern_1ro: "技能実習1号ロ",
  technical_intern_2i: "技能実習2号イ",
  technical_intern_2ro: "技能実習2号ロ",
  technical_intern_3i: "技能実習3号イ",
  technical_intern_3ro: "技能実習3号ロ",
};

/**
 * 所属機関の記載・書類提出が実務上必要となる在留資格区分（visaType）の一覧。
 * 所属機関マスターの書類管理画面で、区分別アップロード欄を表示する対象を絞り込むために使う。
 * 家族滞在・永住者・配偶者等・短期滞在など、所属機関（雇用主・受入企業）が
 * 存在しない区分は含めない。
 */
export const ORG_RELEVANT_VISA_TYPES: string[] = [
  "engineer_humanities",
  "intra_company_transferee",
  "skilled_labor",
  "specified_skilled_worker_1",
  "specified_skilled_worker_2",
  "professor",
  "journalist",
  "business_manager",
  "legal_accounting",
  "medical_services",
  "nursing_care",
  "researcher",
  "instructor",
  "highly_skilled_professional_1",
  "highly_skilled_professional_2",
  "highly_skilled_professional_3",
  "student",
  "training",
  "designated_activities",
  "technical_intern_1i",
  "technical_intern_1ro",
  "technical_intern_2i",
  "technical_intern_2ro",
  "technical_intern_3i",
  "technical_intern_3ro",
];

// ─── 就労資格（所属機関の紐付けが必要な在留資格） ───────────────────────────────
// VISA_TYPE_LABELS のうち、就労が認められる在留資格のキーのみを列挙する。
// 家族滞在・留学・永住者・定住者・日本人の配偶者等・特定活動・研修などは含めない。
export const WORK_VISA_TYPES: Set<string> = new Set([
  "engineer_humanities",
  "intra_company_transferee",
  "skilled_labor",
  "specified_skilled_worker_1",
  "specified_skilled_worker_2",
  "professor",
  "artist",
  "religious_activities",
  "journalist",
  "business_manager",
  "legal_accounting",
  "medical_services",
  "nursing_care",
  "researcher",
  "instructor",
  "highly_skilled_professional_1",
  "highly_skilled_professional_2",
  "highly_skilled_professional_3",
  "technical_intern_1i",
  "technical_intern_1ro",
  "technical_intern_2i",
  "technical_intern_2ro",
  "technical_intern_3i",
  "technical_intern_3ro",
]);

/** 在留資格が就労資格（所属機関の紐付けが必要）かどうかを判定する */
export function isWorkVisaType(visaType: string | null | undefined): boolean {
  return !!visaType && WORK_VISA_TYPES.has(visaType);
}

export const APPLICATION_TYPE_LABELS: Record<string, string> = {
  certification: "在留資格認定証明書交付申請",
  change: "在留資格変更許可申請",
  renewal: "在留期間更新許可申請",
  permanent_residence: "永住許可申請",
  reentry: "再入国許可申請",
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: "①基本情報設定",
  documents_requested: "②書類リスト作成",
  documents_collecting: "③書類収集中",
  ocr_processing: "④申請書下書き作成",
  questionnaire_sent: "⑤質問書・顧客聴取",
  under_review: "⑥申請書反映・確認",
  approved: "承認済",
  submitted: "⑦署名・提出",
  applying: "⑧申請中",
  completed: "⑨許可・完了",
  rejected: "却下",
  on_hold: "一時停止",
  withdrawn: "キャンセル",
  cancelled: "削除済",
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  documents_requested: "bg-yellow-100 text-yellow-700",
  documents_collecting: "bg-blue-100 text-blue-700",
  ocr_processing: "bg-purple-100 text-purple-700",
  questionnaire_sent: "bg-orange-100 text-orange-700",
  under_review: "bg-indigo-100 text-indigo-700",
  approved: "bg-green-100 text-green-700",
  submitted: "bg-teal-100 text-teal-700",
  applying: "bg-cyan-100 text-cyan-700",
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  on_hold: "bg-amber-100 text-amber-700",
  withdrawn: "bg-rose-100 text-rose-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export const ROLE_LABELS: Record<string, string> = {
  applicant: "申請者",
  hr_manager: "受入機関担当者",
  expert: "専門家（行政書士等）",
  admin: "システム管理者",
};

/**
 * 指定日までの残日数を返す（今日の0時基準・期限切れは負数、日付なしは null）。
 * 在留期限・パスポート期限のアラート表示に共通で使う。
 */
export function getDaysUntil(dateStr: string | Date | null | undefined): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
