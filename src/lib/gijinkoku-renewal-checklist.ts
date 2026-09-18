/**
 * 技術・人文知識・国際業務｜在留期間更新許可申請 — 必要書類チェックリスト
 * ────────────────────────────────────────────────────────────────────────────
 * 書類データは「必要書類マスター」（documentRequirementMaster / visaType="engineer_humanities",
 * applicationType="renewal"）の各行に集約されている（UIコードへ直接埋め込まない）。
 * 条件付き適用ルールは各行の `conditions`（jsonb）列に GijinkokuRenewalConditions 形式で
 * 保存し、ここで定義する純粋関数 evaluateChecklistFromMaster が申請条件と突き合わせて判定する。
 *
 * 法改正時は「必要書類マスター」画面（/document-master の該当タブ）で書類の追加・変更・
 * 条件の調整を行えばよく、コード変更は不要（判定の入力次元自体を増やす場合のみ、
 * ChecklistInput とこのファイルの評価ロジックを変更する）。
 *
 * 基準: 令和8年4月15日以降の運用（EFFECTIVE_DATE_NOTE）。
 */

export const GIJINKOKU_VISA_TYPE = "engineer_humanities";
export const GIJINKOKU_RENEWAL_APPLICATION_TYPE = "renewal";
export const TARGET_VISA_LABEL = "技術・人文知識・国際業務";
export const TARGET_PROCEDURE_LABEL = "在留期間更新許可申請";

/** 準備者区分 */
export type PreparedBy = "applicant" | "organization" | "dispatch_destination";

export const PREPARED_BY_LABELS: Record<PreparedBy, string> = {
  applicant: "本人が準備",
  organization: "所属機関が準備",
  dispatch_destination: "派遣先が準備",
};

/** 必要書類マスターの preparedBy（自由記載・プリセット文字列）→ 準備者区分 */
export function mapPreparedBy(raw: string | null | undefined): PreparedBy {
  if (raw === "申請人") return "applicant";
  if (raw === "派遣先") return "dispatch_destination";
  return "organization"; // "受入企業" 及び未設定・不明値の既定値
}

/** 提出状態: required=必要 / exempt=不要（例外・原則不要） */
export type DocStatus = "required" | "exempt";

/** 画面入力（申請条件） */
export interface ChecklistInput {
  /** 所属機関カテゴリー 1/2/3/4 */
  orgCategory: 1 | 2 | 3 | 4;
  /** 派遣契約に基づく就労か */
  dispatchWork: boolean;
  /** カテゴリー3・4の会社へ転職後、初めての更新か */
  firstUpdateAfterTransfer: boolean;
  /** 主に言語能力を用いる対人業務への変更か */
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
}

/** ChecklistInput の各次元に対する一致条件（省略した次元は「問わない」） */
export interface ConditionMatch {
  orgCategoryIn?: number[];
  dispatchWork?: boolean;
  firstUpdateAfterTransfer?: boolean;
  changeToLanguageWork?: boolean;
  photoException?: boolean;
}

/**
 * 必要書類マスターの `conditions`（jsonb）に保存する、このチェックリスト専用の構造。
 * 他の在留資格・申請種別の行が使う `{ category, categories }`（表示グルーピング用の
 * 既存メタデータ）とも共存できるよう、フィールドはすべて任意項目にしてある。
 */
export interface GijinkokuRenewalConditions {
  /** 必要書類マスター画面の手動書類ピッカーでのグループ見出し（任意・表示用） */
  category?: string;
  /** 該当条件（すべて満たす場合のみ表示）。省略時は常に該当（共通書類） */
  when?: ConditionMatch;
  /** 該当していても「不要」表示にする追加条件（例: 写真提出の例外、カテゴリー4は原則不要） */
  exemptWhen?: ConditionMatch;
  /** 提出要件・補足文をカテゴリー等で出し分ける場合の上書き（先に一致した項目を採用） */
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

/** 基準日（法令運用）— 画面に明記する */
export const EFFECTIVE_DATE_NOTE = "令和8年4月15日以降の運用を基準";

/** 画面下部の注意書き */
export const CAUTION_NOTE = "個別の事情により追加資料を求められる場合があります。";

/** 公式情報リンク */
export const OFFICIAL_LINKS: { label: string; url: string }[] = [
  { label: "出入国在留管理庁：技術・人文知識・国際業務", url: "https://www.moj.go.jp/isa/applications/status/gijinkoku" },
  { label: "提出書類一覧（PDF）", url: "https://www.moj.go.jp/isa/content/001367009.pdf" },
  { label: "在留期間更新許可申請の手続", url: "https://www.moj.go.jp/isa/applications/procedures/16-3.html" },
];

function parseConditions(raw: unknown): GijinkokuRenewalConditions {
  if (raw && typeof raw === "object") return raw as GijinkokuRenewalConditions;
  return {};
}

/** ConditionMatch が入力条件に一致するか（省略した次元は無条件で一致） */
export function matchWhen(when: ConditionMatch | undefined, input: ChecklistInput): boolean {
  if (!when) return true;
  if (when.orgCategoryIn && !when.orgCategoryIn.includes(input.orgCategory)) return false;
  if (when.dispatchWork !== undefined && when.dispatchWork !== input.dispatchWork) return false;
  if (when.firstUpdateAfterTransfer !== undefined && when.firstUpdateAfterTransfer !== input.firstUpdateAfterTransfer) return false;
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
        status: exempt ? "exempt" : "required",
        applicable,
      } satisfies ChecklistDocument;
    });
}

/** 該当する書類のみを返す（既定の表示） */
export function buildChecklistFromMaster(rows: MasterDocRow[], input: ChecklistInput): ChecklistDocument[] {
  return evaluateChecklistFromMaster(rows, input).filter((d) => d.applicable);
}

/** 準備者ごとにグルーピング（本人 → 所属機関 → 派遣先 の順） */
export function groupByPreparer(docs: ChecklistDocument[]): { preparedBy: PreparedBy; docs: ChecklistDocument[] }[] {
  const order: PreparedBy[] = ["applicant", "organization", "dispatch_destination"];
  return order
    .map((preparedBy) => ({ preparedBy, docs: docs.filter((d) => d.preparedBy === preparedBy) }))
    .filter((g) => g.docs.length > 0);
}
