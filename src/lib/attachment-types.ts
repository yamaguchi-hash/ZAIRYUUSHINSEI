/**
 * 入管提出用添付書類タイプ定義
 * ─────────────────────────────
 * 特定技能・在留資格変更許可申請の申請書作成（AIデータ抽出）に
 * 「本当に必要な書類」のみを定義する。
 * ここに定義されていない書類タイプはアップロードAPIで受け付けない。
 */

export interface AttachmentTypeDef {
  /** DB保存用キー */
  key: string;
  /** 表示名 */
  label: string;
  /** 補足説明（UI表示用） */
  hint?: string;
  /** AI抽出の対象になるか（申請書フィールドへのマッピングに使用） */
  aiExtractable: boolean;
  /** 申請人側 or 所属機関側の書類か */
  side: "applicant" | "organization";
}

export const ATTACHMENT_TYPES: AttachmentTypeDef[] = [
  // ── 申請人側 ────────────────────────────────────────────────────────────────
  {
    key: "passport",
    label: "パスポート（顔写真ページ）",
    hint: "氏名・国籍・生年月日・旅券番号・有効期限の抽出に使用",
    aiExtractable: true,
    side: "applicant",
  },
  {
    key: "residence_card",
    label: "在留カード（表・裏）",
    hint: "在留カード番号・在留資格・在留期限・住居地の抽出に使用",
    aiExtractable: true,
    side: "applicant",
  },
  {
    key: "skill_exam_certificate",
    label: "技能試験合格証明書",
    hint: "技能水準（申請書18番）の試験名・試験地の抽出に使用",
    aiExtractable: true,
    side: "applicant",
  },
  {
    key: "japanese_exam_certificate",
    label: "日本語試験合格証明書（JLPT・JFT-Basic等）",
    hint: "日本語能力（申請書19番）の試験名・試験地の抽出に使用",
    aiExtractable: true,
    side: "applicant",
  },
  {
    key: "tit2_completion",
    label: "技能実習2号良好修了証明（評価調書・修了証等）",
    hint: "技能実習2号の職種・作業（申請書20番）の抽出に使用",
    aiExtractable: true,
    side: "applicant",
  },
  {
    key: "withholding_slip",
    label: "源泉徴収票（前職・直近）",
    hint: "職歴・前職情報の抽出に使用",
    aiExtractable: true,
    side: "applicant",
  },
  {
    key: "resume",
    label: "履歴書・職歴書",
    hint: "職歴（申請書28番）の抽出に使用",
    aiExtractable: true,
    side: "applicant",
  },
  {
    key: "family_residence_card",
    label: "在日親族の在留カード・メモ",
    hint: "16番（在日親族及び同居者）の続柄・氏名・生年月日・国籍・在留カード番号の自動入力に使用",
    aiExtractable: true,
    side: "applicant",
  },

  // ── 所属機関側 ──────────────────────────────────────────────────────────────
  {
    key: "employment_contract",
    label: "特定技能雇用契約書・雇用条件書",
    hint: "契約期間・業務内容・報酬・労働時間（所属機関用1）の抽出に使用",
    aiExtractable: true,
    side: "organization",
  },
  {
    key: "company_registry",
    label: "登記事項証明書（履歴事項全部証明書）",
    hint: "法人番号・所在地・代表者氏名の抽出に使用",
    aiExtractable: true,
    side: "organization",
  },
  {
    key: "financial_statements",
    label: "決算書類（損益計算書・貸借対照表）",
    hint: "資本金・年間売上金額の抽出に使用",
    aiExtractable: true,
    side: "organization",
  },
  {
    key: "support_plan",
    label: "1号特定技能外国人支援計画書",
    hint: "支援責任者・支援担当者・登録支援機関情報の抽出に使用",
    aiExtractable: true,
    side: "organization",
  },
  {
    key: "rso_registration",
    label: "登録支援機関の登録通知書",
    hint: "登録支援機関の登録番号・登録年月日の抽出に使用",
    aiExtractable: true,
    side: "organization",
  },
  {
    key: "other_required",
    label: "その他の申請必要書類",
    hint: "上記に該当しないが申請書作成に必要な書類（健康診断書・納税証明書等）",
    aiExtractable: true,
    side: "applicant",
  },
];

/** key → 定義 のマップ */
export const ATTACHMENT_TYPE_MAP: Record<string, AttachmentTypeDef> =
  Object.fromEntries(ATTACHMENT_TYPES.map(t => [t.key, t]));

/** 受付可能な documentType か検証 */
export function isValidAttachmentType(key: string): boolean {
  return key in ATTACHMENT_TYPE_MAP;
}
