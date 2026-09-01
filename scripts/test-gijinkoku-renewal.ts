/**
 * 技人国｜在留期間更新 必要書類チェックリストの判定ロジック テスト
 * 実行: npx tsx scripts/test-gijinkoku-renewal.ts
 *
 * 「必要書類マスター」の行（MasterDocRow）を模したモックデータに対して
 * evaluateChecklistFromMaster を実行し、実際にDBへ投入する
 * scripts/seed-gijinkoku-renewal-checklist.ts と同じ conditions 形状で検証する。
 * 依存追加なし（プレーンなアサーションで検証）。
 */
import {
  evaluateChecklistFromMaster,
  type ChecklistInput,
  type ChecklistDocument,
  type MasterDocRow,
  type GijinkokuRenewalConditions,
} from "../src/lib/gijinkoku-renewal-checklist";

let passed = 0;
let failed = 0;
function check(desc: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${desc}`); }
  else { failed++; console.error(`  ✗ ${desc}`); }
}

const base = (over: Partial<ChecklistInput>): ChecklistInput => ({
  orgCategory: 1, dispatchWork: false, firstUpdateAfterTransfer: false,
  changeToLanguageWork: false, photoException: false, ...over,
});

function row(id: string, name: string, preparedBy: string, conditions: GijinkokuRenewalConditions, description = "説明"): MasterDocRow {
  return { id, documentName: name, description, preparedBy, conditions, sortOrder: 0 };
}

// scripts/seed-gijinkoku-renewal-checklist.ts と同じ条件形状のモック行（21件）
const ROWS: MasterDocRow[] = [
  row("application_form", "在留期間更新許可申請書", "申請人", { category: "共通" }),
  row("photo", "写真（縦4cm×横3cm）", "申請人", {
    category: "共通",
    exemptWhen: { photoException: true },
    requirementVariants: [{ when: { photoException: true }, text: "不要（写真提出の例外に該当）" }],
  }),
  row("passport_and_residence_card", "パスポート及び在留カード", "申請人", { category: "共通" }),
  row("category_certificate", "所属機関のカテゴリー該当性を証する文書", "受入企業", {
    category: "共通",
    exemptWhen: { orgCategoryIn: [4] },
    requirementVariants: [
      { when: { orgCategoryIn: [1] }, text: "上場企業の証明など" },
      { when: { orgCategoryIn: [2] }, text: "法定調書合計表、又はオンライン利用の承認証明" },
      { when: { orgCategoryIn: [3] }, text: "法定調書合計表" },
      { when: { orgCategoryIn: [4] }, text: "原則不要（提出できない場合はその旨を説明）" },
    ],
  }),
  row("dispatch_pledge_from", "誓約書（派遣元用）", "受入企業", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("dispatch_pledge_to", "誓約書（派遣先用）", "派遣先", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("dispatch_working_conditions", "労働条件通知書又は雇用契約書", "受入企業", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("dispatch_individual_contract", "労働者派遣個別契約書", "受入企業", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("dispatch_ledger_from", "派遣元管理台帳", "受入企業", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("dispatch_ledger_to", "派遣先管理台帳", "派遣先", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("dispatch_work_status_report", "就業状況報告書", "派遣先", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("cat34_representative_declaration", "所属機関の代表者に関する申告書", "受入企業", { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" }),
  row("cat34_resident_tax_certificate", "住民税の課税（又は非課税）証明書", "申請人", { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" }, "1年間の総所得及び納税状況が確認できるもの"),
  row("cat34_resident_tax_payment_certificate", "住民税の納税証明書", "申請人", { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" }),
  row("transfer_activity_documents", "活動内容を明らかにする書類", "受入企業", { category: "転職後初回", when: { firstUpdateAfterTransfer: true }, reason: "カテゴリー3・4の会社へ転職後、初めての更新のため" }),
  row("transfer_registry", "登記事項証明書", "受入企業", { category: "転職後初回", when: { firstUpdateAfterTransfer: true }, reason: "カテゴリー3・4の会社へ転職後、初めての更新のため" }),
  row("transfer_company_profile", "会社案内等", "受入企業", { category: "転職後初回", when: { firstUpdateAfterTransfer: true }, reason: "カテゴリー3・4の会社へ転職後、初めての更新のため" }),
  row("transfer_financial_statements", "直近年度の決算書類の写し", "受入企業", {
    category: "転職後初回", when: { firstUpdateAfterTransfer: true }, reason: "カテゴリー3・4の会社へ転職後、初めての更新のため",
    requirementVariants: [{ when: {}, text: "損益計算書・貸借対照表等。新規事業で決算が未了の場合は事業計画書" }],
  }),
  row("language_cefr_b2", "CEFR B2相当の言語能力を証する資料", "申請人", { category: "言語業務変更", when: { changeToLanguageWork: true }, reason: "主に言語能力を用いる対人業務への変更のため" }),
  row("cat4_reason_no_tax_report", "法定調書合計表を提出できない理由を明らかにする書類", "受入企業", { category: "カテゴリー4・転職後初回", when: { orgCategoryIn: [4], firstUpdateAfterTransfer: true }, reason: "カテゴリー4かつ転職後初回のため" }),
];

function buildChecklist(input: ChecklistInput): ChecklistDocument[] {
  return evaluateChecklistFromMaster(ROWS, input).filter((d) => d.applicable);
}
const has = (docs: ChecklistDocument[], id: string) => docs.some((d) => d.id === id);
const get = (docs: ChecklistDocument[], id: string) => docs.find((d) => d.id === id);

// ── 1. カテゴリー1（基本） ──────────────────────────────────────────────────
console.log("[カテゴリー1]");
{
  const d = buildChecklist(base({ orgCategory: 1 }));
  check("在留期間更新許可申請書がある", has(d, "application_form"));
  // 回帰テスト: exemptWhen未設定の共通書類が誤って「不要」にならないこと
  check("在留期間更新許可申請書は required（exemptWhen未設定のため）", get(d, "application_form")?.status === "required");
  check("パスポート及び在留カードは required（exemptWhen未設定のため）", get(d, "passport_and_residence_card")?.status === "required");
  check("写真がある・required", get(d, "photo")?.status === "required");
  check("パスポート及び在留カードがある", has(d, "passport_and_residence_card"));
  check("カテゴリー該当証明がある・required", get(d, "category_certificate")?.status === "required");
  check("カテゴリー1の証明文言（上場等）", (get(d, "category_certificate")?.requirement ?? "").includes("上場"));
  check("派遣書類は出ない", !has(d, "dispatch_ledger_from"));
  check("カテゴリー3・4税証明は出ない", !has(d, "cat34_resident_tax_certificate"));
  check("転職後初回書類は出ない", !has(d, "transfer_registry"));
  check("CEFRは出ない", !has(d, "language_cefr_b2"));
}

// ── 2. カテゴリー3 ─────────────────────────────────────────────────────────
console.log("[カテゴリー3]");
{
  const d = buildChecklist(base({ orgCategory: 3 }));
  check("代表者申告書がある", has(d, "cat34_representative_declaration"));
  check("住民税課税証明がある", has(d, "cat34_resident_tax_certificate"));
  check("住民税納税証明がある", has(d, "cat34_resident_tax_payment_certificate"));
  check("税証明に総所得・納税状況の注記", (get(d, "cat34_resident_tax_certificate")?.requirement ?? "").includes("総所得"));
  check("カテゴリー該当証明は法定調書合計表", (get(d, "category_certificate")?.requirement ?? "").includes("法定調書合計表"));
  check("カテゴリー該当証明は required", get(d, "category_certificate")?.status === "required");
}

// ── 3. カテゴリー4 ─────────────────────────────────────────────────────────
console.log("[カテゴリー4]");
{
  const d = buildChecklist(base({ orgCategory: 4 }));
  check("カテゴリー該当証明が exempt（原則不要）", get(d, "category_certificate")?.status === "exempt");
  check("カテゴリー該当証明に『提出できない場合』注記", (get(d, "category_certificate")?.requirement ?? "").includes("提出できない"));
  check("カテゴリー3・4税証明がある（cat4含む）", has(d, "cat34_resident_tax_certificate"));
  check("転職後初回でないため法定調書理由書は出ない", !has(d, "cat4_reason_no_tax_report"));
}

// ── 4. 派遣あり ────────────────────────────────────────────────────────────
console.log("[派遣あり]");
{
  const d = buildChecklist(base({ orgCategory: 1, dispatchWork: true }));
  for (const id of [
    "dispatch_pledge_from", "dispatch_pledge_to", "dispatch_working_conditions",
    "dispatch_individual_contract", "dispatch_ledger_from", "dispatch_ledger_to", "dispatch_work_status_report",
  ]) check(`派遣書類 ${id} がある`, has(d, id));
  check("派遣先管理台帳は派遣先が準備", get(d, "dispatch_ledger_to")?.preparedBy === "dispatch_destination");
  check("誓約書（派遣元用）は所属機関が準備", get(d, "dispatch_pledge_from")?.preparedBy === "organization");
}

// ── 5. 転職後初回（カテゴリー3） ────────────────────────────────────────────
console.log("[転職後初回]");
{
  const d = buildChecklist(base({ orgCategory: 3, firstUpdateAfterTransfer: true }));
  for (const id of [
    "transfer_activity_documents", "transfer_registry", "transfer_company_profile", "transfer_financial_statements",
  ]) check(`転職後初回書類 ${id} がある`, has(d, id));
  check("決算書類に新規事業→事業計画書の注記", (get(d, "transfer_financial_statements")?.requirement ?? "").includes("事業計画書"));
}

// ── 6. 言語業務変更あり ────────────────────────────────────────────────────
console.log("[言語業務変更あり]");
{
  const d = buildChecklist(base({ changeToLanguageWork: true }));
  check("CEFR B2資料がある", has(d, "language_cefr_b2"));
  check("CEFR資料は本人が準備", get(d, "language_cefr_b2")?.preparedBy === "applicant");
}

// ── 7. 写真例外あり ────────────────────────────────────────────────────────
console.log("[写真例外あり]");
{
  const d = buildChecklist(base({ photoException: true }));
  check("写真が exempt", get(d, "photo")?.status === "exempt");
  check("写真要件に『不要』表示", (get(d, "photo")?.requirement ?? "").includes("不要"));
}

// ── 8. カテゴリー4 かつ 転職後初回 ─────────────────────────────────────────
console.log("[カテゴリー4 × 転職後初回]");
{
  const d = buildChecklist(base({ orgCategory: 4, firstUpdateAfterTransfer: true }));
  check("法定調書合計表を提出できない理由書がある", has(d, "cat4_reason_no_tax_report"));
  check("その理由書は所属機関が準備", get(d, "cat4_reason_no_tax_report")?.preparedBy === "organization");
}

console.log(`\n結果: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
