/**
 * 技人国｜在留期間更新 必要書類チェックリストの判定ロジック テスト
 * 実行: npx tsx scripts/test-gijinkoku-renewal.ts
 * 依存追加なし（プレーンなアサーションで検証）。
 */
import {
  buildChecklist,
  type ChecklistInput,
  type ChecklistDocument,
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
const has = (docs: ChecklistDocument[], id: string) => docs.some((d) => d.id === id);
const get = (docs: ChecklistDocument[], id: string) => docs.find((d) => d.id === id);

// ── 1. カテゴリー1（基本） ──────────────────────────────────────────────────
console.log("[カテゴリー1]");
{
  const d = buildChecklist(base({ orgCategory: 1 }));
  check("在留期間更新許可申請書がある", has(d, "application_form"));
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
