import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export const APPLICATION_TYPE_LABELS: Record<string, string> = {
  certification: "在留資格認定証明書交付申請",
  change: "在留資格変更許可申請",
  renewal: "在留期間更新許可申請",
  permanent_residence: "永住許可申請",
  reentry: "再入国許可申請",
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  documents_requested: "書類請求中",
  documents_collecting: "書類収集中",
  ocr_processing: "OCR処理中",
  questionnaire_sent: "質問書送付済",
  under_review: "審査中",
  approved: "承認済",
  submitted: "提出済",
  completed: "完了",
  rejected: "却下",
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
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export const ROLE_LABELS: Record<string, string> = {
  applicant: "申請者",
  hr_manager: "受入機関担当者",
  expert: "専門家（行政書士等）",
  admin: "システム管理者",
};
