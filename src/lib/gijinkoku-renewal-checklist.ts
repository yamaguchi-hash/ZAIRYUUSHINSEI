/**
 * 技術・人文知識・国際業務｜在留期間更新許可申請 — 必要書類チェックリスト（設定駆動）
 * ────────────────────────────────────────────────────────────────────────────
 * 書類の判定ルールは UI ではなくこの「設定データ（RULES）」に集約する。
 * 法改正時はこのファイルの RULES / 各定数のみを更新すればよい（UIは変更不要）。
 *
 * 基準: 令和8年4月15日以降の運用（EFFECTIVE_DATE_NOTE）。
 * 判定は純粋関数 evaluateChecklist / buildChecklist で行い、テスト可能。
 */

/** 準備者区分 */
export type PreparedBy = "applicant" | "organization" | "dispatch_destination";

export const PREPARED_BY_LABELS: Record<PreparedBy, string> = {
  applicant: "本人が準備",
  organization: "所属機関が準備",
  dispatch_destination: "派遣先が準備",
};

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
  /** 条件付き書類か（共通書類=false） */
  conditional: boolean;
  /** なぜ必要か（条件付き書類のみ） */
  reason?: string;
  /** required / exempt（写真例外・カテゴリー4のカテゴリー該当証明など） */
  status: DocStatus;
  /** この入力条件で必要（該当）か */
  applicable: boolean;
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

// ── ルール定義（設定データ）─────────────────────────────────────────────────
interface RuleDef {
  id: string;
  name: string;
  preparedBy: PreparedBy;
  conditional: boolean;
  /** この書類が該当するか */
  applies: (i: ChecklistInput) => boolean;
  /** 提出要件・補足（入力により文言が変わる場合あり） */
  requirement: (i: ChecklistInput) => string;
  /** なぜ必要か（条件付き書類のみ） */
  reason?: (i: ChecklistInput) => string;
  /** 提出状態（既定 required） */
  status?: (i: ChecklistInput) => DocStatus;
}

const isCat34 = (i: ChecklistInput) => i.orgCategory === 3 || i.orgCategory === 4;

/** 所属機関のカテゴリー該当性を証する文書（カテゴリー別に文言・要否が変わる） */
function categoryCertRequirement(i: ChecklistInput): string {
  switch (i.orgCategory) {
    case 1: return "上場企業の証明、四季報の写し、公益法人等の設立許可証明、対象企業（イノベーション創出企業等）の認定書類 など";
    case 2: return "前年分の給与所得の源泉徴収票等の法定調書合計表、又は国税庁「オンライン利用」の承認を受けていることの証明";
    case 3: return "前年分の給与所得の源泉徴収票等の法定調書合計表";
    case 4: return "原則不要（カテゴリー1〜3の証明書を提出できない場合はその旨を説明）";
  }
}

/**
 * 判定ルール（設定データ）。この配列を編集すれば書類ルールを保守できる。
 * 表示順もこの順序に従う。
 */
export const GIJINKOKU_RENEWAL_RULES: RuleDef[] = [
  // ── 全カテゴリー共通 ──────────────────────────────────────────────────────
  {
    id: "application_form",
    name: "在留期間更新許可申請書",
    preparedBy: "applicant",
    conditional: false,
    applies: () => true,
    requirement: () => "申請人等作成用・所属機関等作成用の各様式に記入（所属機関記入部分は所属機関が作成）",
  },
  {
    id: "photo",
    name: "写真（縦4cm×横3cm）",
    preparedBy: "applicant",
    conditional: false,
    applies: () => true,
    requirement: (i) => i.photoException
      ? "不要（写真提出の例外に該当）"
      : "申請前6か月以内に撮影したもの。縦4cm×横3cm、無帽・正面・無背景。裏面に氏名を記入。",
    status: (i) => (i.photoException ? "exempt" : "required"),
  },
  {
    id: "passport_and_residence_card",
    name: "パスポート及び在留カード",
    preparedBy: "applicant",
    conditional: false,
    applies: () => true,
    requirement: () => "提示（窓口で提示。原本の確認のため持参）",
  },
  {
    id: "category_certificate",
    name: "所属機関のカテゴリー該当性を証する文書",
    preparedBy: "organization",
    conditional: false,
    applies: () => true,
    requirement: categoryCertRequirement,
    status: (i) => (i.orgCategory === 4 ? "exempt" : "required"),
  },

  // ── 派遣就労の場合のみ ────────────────────────────────────────────────────
  {
    id: "dispatch_pledge_from",
    name: "申請人の派遣労働に関する誓約書（派遣元用）",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.dispatchWork,
    requirement: () => "派遣元（所属機関）が作成する誓約書",
    reason: () => "派遣契約に基づく就労のため",
  },
  {
    id: "dispatch_pledge_to",
    name: "申請人の派遣労働に関する誓約書（派遣先用）",
    preparedBy: "dispatch_destination",
    conditional: true,
    applies: (i) => i.dispatchWork,
    requirement: () => "派遣先が作成する誓約書",
    reason: () => "派遣契約に基づく就労のため",
  },
  {
    id: "dispatch_working_conditions",
    name: "労働条件通知書又は雇用契約書",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.dispatchWork,
    requirement: () => "労働条件・雇用契約の内容が分かるもの",
    reason: () => "派遣契約に基づく就労のため",
  },
  {
    id: "dispatch_individual_contract",
    name: "労働者派遣個別契約書",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.dispatchWork,
    requirement: () => "派遣元と派遣先の個別契約の内容が分かるもの",
    reason: () => "派遣契約に基づく就労のため",
  },
  {
    id: "dispatch_ledger_from",
    name: "派遣元管理台帳",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.dispatchWork,
    requirement: () => "派遣元が備える管理台帳の写し",
    reason: () => "派遣契約に基づく就労のため",
  },
  {
    id: "dispatch_ledger_to",
    name: "派遣先管理台帳",
    preparedBy: "dispatch_destination",
    conditional: true,
    applies: (i) => i.dispatchWork,
    requirement: () => "派遣先が備える管理台帳の写し",
    reason: () => "派遣契約に基づく就労のため",
  },
  {
    id: "dispatch_work_status_report",
    name: "就業状況報告書",
    preparedBy: "dispatch_destination",
    conditional: true,
    applies: (i) => i.dispatchWork,
    requirement: () => "派遣先での就業状況が分かる報告書",
    reason: () => "派遣契約に基づく就労のため",
  },

  // ── カテゴリー3・4の場合 ─────────────────────────────────────────────────
  {
    id: "cat34_representative_declaration",
    name: "所属機関の代表者に関する申告書（参考様式）",
    preparedBy: "organization",
    conditional: true,
    applies: isCat34,
    requirement: () => "参考様式に基づき所属機関の代表者が作成",
    reason: () => "所属機関がカテゴリー3・4のため",
  },
  {
    id: "cat34_resident_tax_certificate",
    name: "住民税の課税（又は非課税）証明書",
    preparedBy: "applicant",
    conditional: true,
    applies: isCat34,
    requirement: () => "1年間の総所得及び納税状況が確認できるもの",
    reason: () => "所属機関がカテゴリー3・4のため",
  },
  {
    id: "cat34_resident_tax_payment_certificate",
    name: "住民税の納税証明書",
    preparedBy: "applicant",
    conditional: true,
    applies: isCat34,
    requirement: () => "1年間の総所得及び納税状況が確認できるもの",
    reason: () => "所属機関がカテゴリー3・4のため",
  },

  // ── カテゴリー3・4の会社へ転職後、初めて更新する場合 ──────────────────────
  {
    id: "transfer_activity_documents",
    name: "活動内容を明らかにする書類",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.firstUpdateAfterTransfer,
    requirement: () =>
      "雇用契約の場合：労働条件通知書等／日本法人の役員の場合：役員報酬に関する定款又は株主総会議事録／" +
      "外国法人の日本支店への転勤・団体役員の場合：担当業務・期間・報酬を示す所属団体の文書",
    reason: () => "カテゴリー3・4の会社へ転職後、初めての更新のため",
  },
  {
    id: "transfer_registry",
    name: "登記事項証明書",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.firstUpdateAfterTransfer,
    requirement: () => "所属機関の登記事項証明書",
    reason: () => "カテゴリー3・4の会社へ転職後、初めての更新のため",
  },
  {
    id: "transfer_company_profile",
    name: "会社案内等（沿革・役員・組織・事業内容・主要取引先・取引実績が分かる書類）",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.firstUpdateAfterTransfer,
    requirement: () => "会社案内、パンフレット、ホームページ写し等",
    reason: () => "カテゴリー3・4の会社へ転職後、初めての更新のため",
  },
  {
    id: "transfer_financial_statements",
    name: "直近年度の決算書類の写し",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.firstUpdateAfterTransfer,
    requirement: () => "損益計算書・貸借対照表等。新規事業で決算が未了の場合は事業計画書",
    reason: () => "カテゴリー3・4の会社へ転職後、初めての更新のため",
  },

  // ── 言語能力を用いる対人業務への変更の場合 ────────────────────────────────
  {
    id: "language_cefr_b2",
    name: "CEFR B2相当の言語能力を証する資料",
    preparedBy: "applicant",
    conditional: true,
    applies: (i) => i.changeToLanguageWork,
    requirement: () => "業務上使用する言語について、CEFR B2相当の言語能力を証するもの",
    reason: () => "主に言語能力を用いる対人業務への変更のため",
  },

  // ── カテゴリー4かつ転職後初回の場合のみ ──────────────────────────────────
  {
    id: "cat4_reason_no_tax_report",
    name: "法定調書合計表を提出できない理由を明らかにする書類",
    preparedBy: "organization",
    conditional: true,
    applies: (i) => i.orgCategory === 4 && i.firstUpdateAfterTransfer,
    requirement: () =>
      "源泉徴収の免除を受けている場合：免除証明等／それ以外の場合：給与支払事務所等の開設届出書及び" +
      "直近3か月分の所得税徴収高計算書、又は納期の特例に係る承認資料",
    reason: () => "カテゴリー4かつ転職後初回のため",
  },
];

/**
 * 全ルールを評価し、各書類に applicable フラグを付けて返す（表示順）。
 * 「条件付き書類を表示」トグルで非該当も見せる用途に使う。
 */
export function evaluateChecklist(input: ChecklistInput): ChecklistDocument[] {
  return GIJINKOKU_RENEWAL_RULES.map((r) => ({
    id: r.id,
    name: r.name,
    requirement: r.requirement(input),
    preparedBy: r.preparedBy,
    conditional: r.conditional,
    reason: r.reason ? r.reason(input) : undefined,
    status: r.status ? r.status(input) : "required",
    applicable: r.applies(input),
  }));
}

/** 該当する書類のみを返す（既定の表示） */
export function buildChecklist(input: ChecklistInput): ChecklistDocument[] {
  return evaluateChecklist(input).filter((d) => d.applicable);
}

/** 準備者ごとにグルーピング（本人 → 所属機関 → 派遣先 の順） */
export function groupByPreparer(docs: ChecklistDocument[]): { preparedBy: PreparedBy; docs: ChecklistDocument[] }[] {
  const order: PreparedBy[] = ["applicant", "organization", "dispatch_destination"];
  return order
    .map((preparedBy) => ({ preparedBy, docs: docs.filter((d) => d.preparedBy === preparedBy) }))
    .filter((g) => g.docs.length > 0);
}
