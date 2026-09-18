/**
 * 家族滞在｜在留資格認定証明書交付申請（COE） — 必要書類チェックリスト
 * ────────────────────────────────────────────────────────────────────────────
 * 就労資格・留学等で日本に在留する方に扶養される、海外在住の配偶者又は子の
 * 「家族滞在」在留資格認定証明書交付申請を対象とする。
 * 「日本人の配偶者等」「永住者の配偶者等」「定住者」には使用しない（画面上に明記する）。
 *
 * 設計は技術・人文知識・国際業務｜在留期間更新（src/lib/gijinkoku-renewal-checklist.ts）と
 * 同じ構成に揃えている（必要書類マスター＝documentRequirementMaster に書類データを集約し、
 * conditions（jsonb）に条件を保存、純粋関数で判定）。入力次元（ChecklistInput）が
 * まったく異なるため、判定ロジックはこの機能専用に持つ（他機能の判定ロジックには影響しない）。
 *
 * 法改正時は「必要書類マスター」画面（/document-master の該当タブ）で書類の追加・変更・
 * 条件の調整を行えばよく、コード変更は不要（判定の入力次元自体を増やす場合のみ、
 * ChecklistInput とこのファイルの評価ロジックを変更する）。
 */

export const FAMILY_STAY_VISA_TYPE = "dependent";
export const FAMILY_STAY_COE_APPLICATION_TYPE = "certification";

/** 続柄 */
export type Relationship = "spouse" | "child";
export const RELATIONSHIP_LABELS: Record<Relationship, string> = { spouse: "配偶者", child: "子" };

/** 扶養者の収入状況 */
export type SupporterIncomeType = "income" | "other";
export const SUPPORTER_INCOME_TYPE_LABELS: Record<SupporterIncomeType, string> = {
  income: "会社勤務・事業経営など、収入を伴う活動",
  other: "留学等、上記以外の活動",
};

/** 身分関係を証する書類 */
export type IdentityDocKey =
  | "family_register"
  | "marriage_certificate_receipt"
  | "marriage_certificate"
  | "birth_certificate"
  | "equivalent_document";

export const IDENTITY_DOC_LABELS: Record<IdentityDocKey, string> = {
  family_register: "戸籍謄本",
  marriage_certificate_receipt: "婚姻届受理証明書",
  marriage_certificate: "結婚証明書",
  birth_certificate: "出生証明書",
  equivalent_document: "その他これらに準ずる文書",
};

/** 続柄ごとに選択できる身分関係書類（UIでの選択肢の絞り込みに使用） */
export const IDENTITY_DOC_OPTIONS_BY_RELATIONSHIP: Record<Relationship, IdentityDocKey[]> = {
  spouse: ["family_register", "marriage_certificate_receipt", "marriage_certificate", "equivalent_document"],
  child: ["family_register", "birth_certificate", "equivalent_document"],
};

/** 扶養者が収入を伴わない活動の場合の資力を証する資料 */
export type FinancialProofKey = "bank_balance" | "scholarship" | "other_financial";
export const FINANCIAL_PROOF_LABELS: Record<FinancialProofKey, string> = {
  bank_balance: "扶養者名義の預金残高証明書",
  scholarship: "奨学金給付証明書（給付額・給付期間が分かるもの）",
  other_financial: "申請人の生活費を支弁できることを示すその他の資料",
};

/** 画面入力（申請条件） */
export interface ChecklistInput {
  relationship: Relationship;
  supporterIncomeType: SupporterIncomeType;
  /** 身分関係を証する書類（複数選択） */
  identityDocs: IdentityDocKey[];
  /** 収入を伴わない活動の場合の資力証明（複数選択） */
  financialProofDocs: FinancialProofKey[];
  /** 申請人のパスポート写しを添付するか */
  attachApplicantPassportCopy: boolean;
}

/** 準備者区分 */
export type PreparedBy = "applicant" | "supporter" | "agent";

export const PREPARED_BY_LABELS: Record<PreparedBy, string> = {
  applicant: "申請人が準備",
  supporter: "扶養者が準備",
  agent: "申請代理人が準備",
};

/** 必要書類マスターの preparedBy（自由記載・プリセット文字列）→ 準備者区分 */
export function mapPreparedBy(raw: string | null | undefined): PreparedBy {
  if (raw === "扶養者") return "supporter";
  if (raw === "申請代理人") return "agent";
  return "applicant"; // "申請人" 及び未設定・不明値の既定値
}

/** 提出状態: required=必要 / exempt=不要（例外） / optional=任意・推奨 */
export type DocStatus = "required" | "exempt" | "optional";

/** 判定済みの1書類 */
export interface ChecklistDocument {
  id: string;
  name: string;
  /** 提出要件・補足 */
  requirement: string;
  preparedBy: PreparedBy;
  /** 条件付き書類か（常時必要の共通書類=false） */
  conditional: boolean;
  /** なぜ必要か（条件付き書類のみ） */
  reason?: string;
  status: DocStatus;
  /** この入力条件で必要（該当）か */
  applicable: boolean;
}

/** ChecklistInput の各次元に対する一致条件（省略した次元は「問わない」） */
export interface ConditionMatch {
  relationship?: Relationship;
  supporterIncomeType?: SupporterIncomeType;
  /** 入力側の identityDocs（複数選択）にこのキーが含まれていれば一致 */
  identityDocs?: IdentityDocKey;
  /** 入力側の financialProofDocs（複数選択）にこのキーが含まれていれば一致 */
  financialProofDocs?: FinancialProofKey;
  attachApplicantPassportCopy?: boolean;
}

/**
 * 必要書類マスターの `conditions`（jsonb）に保存する、このチェックリスト専用の構造。
 */
export interface FamilyStayCoeConditions {
  /** 必要書類マスター画面の手動書類ピッカーでのグループ見出し（任意・表示用） */
  category?: string;
  /** 該当条件（すべて満たす場合のみ表示）。省略時は常に該当（共通書類） */
  when?: ConditionMatch;
  /** 該当していても「不要」表示にする追加条件 */
  exemptWhen?: ConditionMatch;
  /** 該当時に「任意・推奨」書類として扱う場合 true（必須ではない） */
  optional?: boolean;
  /** 提出要件・補足文を条件で出し分ける場合の上書き（先に一致した項目を採用） */
  requirementVariants?: { when: ConditionMatch; text: string }[];
  /** 条件付き書類の「なぜ必要か」表示 */
  reason?: string;
}

/** 必要書類マスターの1行（評価に必要な最小フィールド） */
export interface MasterDocRow {
  id: string;
  documentName: string;
  description: string | null;
  preparedBy: string | null;
  conditions: unknown;
  sortOrder: number;
}

/** 対象在留資格・対象手続・基準日・最終確認日・公式情報URL（法令・運用情報） */
export const TARGET_VISA_LABEL = "家族滞在";
export const TARGET_PROCEDURE_LABEL = "在留資格認定証明書交付申請";
export const EFFECTIVE_DATE_NOTE = "出入国在留管理庁の公表情報（2026年9月1日時点）を基準";
export const LAST_REVIEWED_NOTE = "最終確認日: 2026年9月1日";

/** 本機能の対象外である旨（画面上で明確に表示する） */
export const SCOPE_WARNING =
  "本チェックリストは「家族滞在」（就労資格・留学等で日本に在留する方に扶養される、海外在住の配偶者又は子）の" +
  "在留資格認定証明書交付申請専用です。「日本人の配偶者等」「永住者の配偶者等」「定住者」の申請には使用しないでください。";

/** 画面下部の注意書き */
export const CAUTION_NOTES: string[] = [
  "日本で発行される証明書は、原則として発行後3か月以内のものを提出してください。",
  "外国語の書類には日本語訳を添付してください。",
  "個別の事情により、出入国在留管理庁から追加資料を求められる場合があります。",
];

/** 公式情報リンク */
export const OFFICIAL_LINKS: { label: string; url: string }[] = [
  { label: "出入国在留管理庁：家族滞在", url: "https://www.moj.go.jp/isa/applications/status/dependent.html" },
  { label: "在留資格認定証明書交付申請の手続", url: "https://www.moj.go.jp/isa/applications/procedures/16-1-1.html" },
];

function parseConditions(raw: unknown): FamilyStayCoeConditions {
  if (raw && typeof raw === "object") return raw as FamilyStayCoeConditions;
  return {};
}

/** ConditionMatch が入力条件に一致するか（省略した次元は無条件で一致） */
export function matchWhen(when: ConditionMatch | undefined, input: ChecklistInput): boolean {
  if (!when) return true;
  if (when.relationship !== undefined && when.relationship !== input.relationship) return false;
  if (when.supporterIncomeType !== undefined && when.supporterIncomeType !== input.supporterIncomeType) return false;
  if (when.identityDocs !== undefined && !input.identityDocs.includes(when.identityDocs)) return false;
  if (when.financialProofDocs !== undefined && !input.financialProofDocs.includes(when.financialProofDocs)) return false;
  if (when.attachApplicantPassportCopy !== undefined && when.attachApplicantPassportCopy !== input.attachApplicantPassportCopy) return false;
  return true;
}

/**
 * 必要書類マスターの行を、申請条件（ChecklistInput）で評価する。
 * 全書類（該当・非該当とも）を返し、表示側で applicable によるフィルタや
 * 「条件付き書類を表示」トグルに使う。
 */
export function evaluateChecklistFromMaster(rows: MasterDocRow[], input: ChecklistInput): ChecklistDocument[] {
  return [...rows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => {
      const c = parseConditions(row.conditions);
      const applicable = matchWhen(c.when, input);
      // exemptWhen 未設定（undefined）は「例外条件なし」を意味するため、
      // matchWhen の「省略した次元は常に一致」規則をそのまま適用すると誤って exempt 扱いになる。
      // exemptWhen が実際に設定されている場合のみ判定する。
      const exempt = !!c.exemptWhen && matchWhen(c.exemptWhen, input);
      const variant = c.requirementVariants?.find((v) => matchWhen(v.when, input));

      return {
        id: row.id,
        name: row.documentName,
        requirement: variant?.text ?? row.description ?? "",
        preparedBy: mapPreparedBy(row.preparedBy),
        conditional: !!c.when,
        reason: c.when ? c.reason : undefined,
        status: exempt ? "exempt" : c.optional ? "optional" : "required",
        applicable,
      } satisfies ChecklistDocument;
    });
}

/** 該当する書類のみを返す（既定の表示） */
export function buildChecklistFromMaster(rows: MasterDocRow[], input: ChecklistInput): ChecklistDocument[] {
  return evaluateChecklistFromMaster(rows, input).filter((d) => d.applicable);
}

/** 準備者ごとにグルーピング（申請人 → 扶養者 → 申請代理人 の順） */
export function groupByPreparer(docs: ChecklistDocument[]): { preparedBy: PreparedBy; docs: ChecklistDocument[] }[] {
  const order: PreparedBy[] = ["applicant", "supporter", "agent"];
  return order
    .map((preparedBy) => ({ preparedBy, docs: docs.filter((d) => d.preparedBy === preparedBy) }))
    .filter((g) => g.docs.length > 0);
}

/**
 * 未選択の必須入力項目があれば警告文言を返す（一覧上部に表示する）。
 * 個人情報は含まない（項目名のみ）。
 */
export function validateInput(input: ChecklistInput): string[] {
  const warnings: string[] = [];
  if (input.identityDocs.length === 0) {
    warnings.push("身分関係を証する書類が選択されていません。少なくとも1つ選択してください。");
  }
  if (input.supporterIncomeType === "other" && input.financialProofDocs.length === 0) {
    warnings.push("扶養者の資力を証する資料が選択されていません。少なくとも1つ選択してください。");
  }
  return warnings;
}
