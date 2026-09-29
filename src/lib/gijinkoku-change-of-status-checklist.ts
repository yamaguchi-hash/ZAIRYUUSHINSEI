/**
 * 技術・人文知識・国際業務｜在留資格変更許可申請 — 必要書類チェックリスト
 * ────────────────────────────────────────────────────────────────────────────
 * 既存の技術・人文知識・国際業務｜在留期間更新（gijinkoku-renewal-checklist.ts）と
 * 同じ構成に揃えている（必要書類マスター＝documentRequirementMaster に書類データを集約し、
 * conditions（jsonb）に条件を保存、純粋関数で判定）。在留資格変更許可申請は在留期間更新と
 * 異なり「学歴・職歴（該当資格の要件充足）を新規に証明する」書類が必要になるため、
 * 入力次元（ChecklistInput）が異なる専用モジュールとして持つ（更新側のロジックには影響しない）。
 *
 * 在留資格変更許可申請書そのものは所属機関・行政書士側で作成・提出する申請書式であり、
 * 申請人・所属機関が準備する「必要書類（添付書類）」ではないため、この一覧には含めない。
 *
 * 法改正時は「必要書類マスター」画面（/document-master の該当タブ）で書類の追加・変更・
 * 条件の調整を行えばよく、コード変更は不要（判定の入力次元自体を増やす場合のみ、
 * ChecklistInput とこのファイルの評価ロジックを変更する）。
 */

export const GIJINKOKU_CHANGE_VISA_TYPE = "engineer_humanities";
export const GIJINKOKU_CHANGE_APPLICATION_TYPE = "change";
export const TARGET_VISA_LABEL = "技術・人文知識・国際業務";
export const TARGET_PROCEDURE_LABEL = "在留資格変更許可申請";

/** 学歴・職歴区分（在留資格該当性の立証ルート） */
export type EduBackground = "jp_university" | "foreign_university" | "jp_specialized_school" | "work_experience";

export const EDU_BACKGROUND_LABELS: Record<EduBackground, string> = {
  jp_university: "日本の大学・大学院を卒業",
  foreign_university: "外国の大学・大学院を卒業",
  jp_specialized_school: "日本の専門学校を卒業（専門士・高度専門士）",
  work_experience: "実務経験（10年、言語関連業務等は3年）",
};

/** 準備者区分 */
export type PreparedBy = "applicant" | "organization" | "dispatch_destination" | "agent";

export const PREPARED_BY_LABELS: Record<PreparedBy, string> = {
  applicant: "本人が準備",
  organization: "所属機関が準備",
  dispatch_destination: "派遣先が準備",
  agent: "行政書士が作成",
};

/** 必要書類マスターの preparedBy（自由記載・プリセット文字列）→ 準備者区分 */
export function mapPreparedBy(raw: string | null | undefined): PreparedBy {
  if (raw === "申請人") return "applicant";
  if (raw === "派遣先") return "dispatch_destination";
  if (raw === "行政書士") return "agent";
  return "organization"; // "受入企業" 及び未設定・不明値の既定値
}

/** 提出状態: required=必要 / exempt=不要（例外） / optional=任意・推奨 */
export type DocStatus = "required" | "exempt" | "optional";

/** 画面入力（申請条件） */
export interface ChecklistInput {
  /** 所属機関カテゴリー 1/2/3/4 */
  orgCategory: 1 | 2 | 3 | 4;
  /** 在留資格該当性の立証ルート */
  eduBackground: EduBackground;
  /** 派遣契約に基づく就労か */
  dispatchWork: boolean;
  /** 主に言語能力を用いる対人業務（通訳・翻訳・接客等）か */
  changeToLanguageWork: boolean;
  /** 写真提出の例外に該当するか */
  photoException: boolean;
}

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
  /** 有効期限の注意書き（例:「発行から3ヶ月以内」）。なければ undefined */
  validityNote?: string;
  /** 外国語書類の日本語訳が必要か */
  translationRequired?: boolean;
}

/** ChecklistInput の各次元に対する一致条件（省略した次元は「問わない」） */
export interface ConditionMatch {
  orgCategoryIn?: number[];
  eduBackgroundIn?: EduBackground[];
  dispatchWork?: boolean;
  changeToLanguageWork?: boolean;
  photoException?: boolean;
}

/**
 * 必要書類マスターの `conditions`（jsonb）に保存する、このチェックリスト専用の構造。
 */
export interface GijinkokuChangeConditions {
  /** 必要書類マスター画面の手動書類ピッカーでのグループ見出し（任意・表示用） */
  category?: string;
  /** 該当条件（すべて満たす場合のみ表示）。省略時は常に該当（共通書類） */
  when?: ConditionMatch;
  /** 該当していても「不要」表示にする追加条件 */
  exemptWhen?: ConditionMatch;
  /** 該当時に「任意・推奨」書類として扱う場合 true（必須ではない） */
  optional?: boolean;
  /** 提出要件・補足文をカテゴリー等で出し分ける場合の上書き（先に一致した項目を採用） */
  requirementVariants?: { when: ConditionMatch; text: string }[];
  /** 条件付き書類の「なぜ必要か」表示 */
  reason?: string;
  /** 有効期限の注意書き（例:「発行から3ヶ月以内」） */
  validityNote?: string;
  /** 外国語書類の日本語訳が必要か */
  translationRequired?: boolean;
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

/** 基準日（法令運用）— 画面に明記する */
export const EFFECTIVE_DATE_NOTE = "出入国在留管理庁の公表情報（2026年9月時点）を基準";

/** 画面下部の注意書き */
export const CAUTION_NOTES: string[] = [
  "日本で発行される証明書は、原則として発行後3か月以内のものを提出してください。",
  "外国語で作成された書類には日本語訳を添付してください。",
  "個別の事情により、出入国在留管理庁から追加資料を求められる場合があります。",
];

/** 公式情報リンク */
export const OFFICIAL_LINKS: { label: string; url: string }[] = [
  { label: "出入国在留管理庁：技術・人文知識・国際業務", url: "https://www.moj.go.jp/isa/applications/status/gijinkoku" },
  { label: "提出書類一覧（PDF）", url: "https://www.moj.go.jp/isa/content/001367009.pdf" },
  { label: "在留資格変更許可申請の手続", url: "https://www.moj.go.jp/isa/applications/procedures/16-2.html" },
];

function parseConditions(raw: unknown): GijinkokuChangeConditions {
  if (raw && typeof raw === "object") return raw as GijinkokuChangeConditions;
  return {};
}

/** ConditionMatch が入力条件に一致するか（省略した次元は無条件で一致） */
export function matchWhen(when: ConditionMatch | undefined, input: ChecklistInput): boolean {
  if (!when) return true;
  if (when.orgCategoryIn && !when.orgCategoryIn.includes(input.orgCategory)) return false;
  if (when.eduBackgroundIn && !when.eduBackgroundIn.includes(input.eduBackground)) return false;
  if (when.dispatchWork !== undefined && when.dispatchWork !== input.dispatchWork) return false;
  if (when.changeToLanguageWork !== undefined && when.changeToLanguageWork !== input.changeToLanguageWork) return false;
  if (when.photoException !== undefined && when.photoException !== input.photoException) return false;
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
        validityNote: c.validityNote,
        translationRequired: c.translationRequired,
      } satisfies ChecklistDocument;
    });
}

/** 該当する書類のみを返す（既定の表示） */
export function buildChecklistFromMaster(rows: MasterDocRow[], input: ChecklistInput): ChecklistDocument[] {
  return evaluateChecklistFromMaster(rows, input).filter((d) => d.applicable);
}

/** 準備者ごとにグルーピング（本人 → 所属機関 → 派遣先 → 行政書士 の順） */
export function groupByPreparer(docs: ChecklistDocument[]): { preparedBy: PreparedBy; docs: ChecklistDocument[] }[] {
  const order: PreparedBy[] = ["applicant", "organization", "dispatch_destination", "agent"];
  return order
    .map((preparedBy) => ({ preparedBy, docs: docs.filter((d) => d.preparedBy === preparedBy) }))
    .filter((g) => g.docs.length > 0);
}
