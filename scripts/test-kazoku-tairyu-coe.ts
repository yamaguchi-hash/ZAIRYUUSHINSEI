/**
 * 家族滞在｜在留資格認定証明書交付申請（COE） 必要書類チェックリストの判定ロジック テスト
 * 実行: npx tsx scripts/test-kazoku-tairyu-coe.ts
 *
 * 「必要書類マスター」の行（MasterDocRow）を模したモックデータに対して
 * evaluateChecklistFromMaster / validateInput を実行し、
 * scripts/seed-kazoku-tairyu-coe.ts と同じ conditions 形状で検証する。
 * 依存追加なし（プレーンなアサーションで検証）。
 */
import {
  evaluateChecklistFromMaster,
  validateInput,
  type ChecklistInput,
  type ChecklistDocument,
  type MasterDocRow,
  type FamilyStayCoeConditions,
} from "../src/lib/kazoku-tairyu-coe-checklist";

let passed = 0;
let failed = 0;
function check(desc: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${desc}`); }
  else { failed++; console.error(`  ✗ ${desc}`); }
}

const base = (over: Partial<ChecklistInput>): ChecklistInput => ({
  relationship: "spouse",
  supporterIncomeType: "income",
  identityDocs: ["marriage_certificate"],
  financialProofDocs: [],
  attachApplicantPassportCopy: false,
  ...over,
});

function row(id: string, name: string, preparedBy: string, conditions: FamilyStayCoeConditions, description = "説明"): MasterDocRow {
  return { id, documentName: name, description, preparedBy, conditions, sortOrder: 0 };
}

// scripts/seed-kazoku-tairyu-coe.ts と同じ条件形状のモック行（16件）
const ROWS: MasterDocRow[] = [
  row("application_form", "在留資格認定証明書交付申請書（1通）", "申請代理人", { category: "共通" }),
  row("photo", "写真（縦4cm×横3cm）", "申請人", { category: "共通" }),
  row("return_envelope", "返信用封筒", "申請代理人", { category: "共通" }),
  row("supporter_residence_card_or_passport", "扶養者の在留カード又は旅券の写し", "扶養者", { category: "共通" }),

  row("identity_family_register", "戸籍謄本", "扶養者", { category: "身分関係書類", when: { identityDocs: "family_register" } }),
  row("identity_marriage_receipt", "婚姻届受理証明書", "扶養者", { category: "身分関係書類", when: { identityDocs: "marriage_certificate_receipt" } }),
  row("identity_marriage_certificate", "結婚証明書の写し", "扶養者", { category: "身分関係書類", when: { identityDocs: "marriage_certificate" } }),
  row("identity_birth_certificate", "出生証明書の写し", "扶養者", { category: "身分関係書類", when: { identityDocs: "birth_certificate" } }),
  row("identity_equivalent", "身分関係を証するその他の文書", "扶養者", { category: "身分関係書類", when: { identityDocs: "equivalent_document" } }),

  row("income_employment_proof", "在職証明書又は営業許可書の写し等", "扶養者", { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため" }),
  row("income_tax_certificate", "住民税の課税（又は非課税）証明書（1通）", "扶養者", { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため" }, "1年間の総所得及び納税状況が分かるもの"),
  row("income_tax_payment_certificate", "住民税の納税証明書（1通）", "扶養者", { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため" }, "1年間の総所得及び納税状況が分かるもの"),

  row("financial_bank_balance", "扶養者名義の預金残高証明書", "扶養者", { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "bank_balance" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" }),
  row("financial_scholarship", "奨学金給付証明書", "扶養者", { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "scholarship" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" }, "給付額及び給付期間が分かるもの"),
  row("financial_other", "生活費を支弁できることを示すその他の資料", "扶養者", { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "other_financial" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" }),

  row("optional_passport_copy", "申請人のパスポート写し", "申請人", {
    category: "任意・推奨",
    when: { attachApplicantPassportCopy: true },
    optional: true,
    reason: "在留資格認定証明書と旅券の氏名表記の確認に役立つため",
  }, "在留資格認定証明書と旅券の氏名表記の確認に役立ちます"),
];

function buildChecklist(input: ChecklistInput): ChecklistDocument[] {
  return evaluateChecklistFromMaster(ROWS, input).filter((d) => d.applicable);
}
const has = (docs: ChecklistDocument[], id: string) => docs.some((d) => d.id === id);
const get = (docs: ChecklistDocument[], id: string) => docs.find((d) => d.id === id);

// ── 1. 扶養者が会社勤務、申請人が配偶者 ────────────────────────────────────
console.log("[会社勤務・配偶者]");
{
  const d = buildChecklist(base({ relationship: "spouse", supporterIncomeType: "income", identityDocs: ["marriage_certificate"] }));
  check("共通書類（申請書）がある", has(d, "application_form"));
  check("共通書類（写真）がある", has(d, "photo"));
  check("共通書類（返信用封筒）がある", has(d, "return_envelope"));
  check("扶養者の在留カード等がある", has(d, "supporter_residence_card_or_passport"));
  // 回帰テスト: exemptWhen未設定の共通書類が誤って「不要」にならないこと
  check("申請書は required（exemptWhen未設定のため）", get(d, "application_form")?.status === "required");
  check("扶養者の在留カード等は required（exemptWhen未設定のため）", get(d, "supporter_residence_card_or_passport")?.status === "required");
  check("結婚証明書の写しがある（選択どおり）", has(d, "identity_marriage_certificate"));
  check("戸籍謄本は出ない（未選択）", !has(d, "identity_family_register"));
  check("出生証明書は出ない（配偶者なので無関係）", !has(d, "identity_birth_certificate"));
  check("在職証明書等がある（収入を伴う活動）", has(d, "income_employment_proof"));
  check("住民税課税証明がある", has(d, "income_tax_certificate"));
  check("税証明に総所得・納税状況の注記", (get(d, "income_tax_certificate")?.requirement ?? "").includes("総所得"));
  check("預金残高証明は出ない（収入を伴う活動のため）", !has(d, "financial_bank_balance"));
  check("パスポート写しは出ない（未選択）", !has(d, "optional_passport_copy"));
  check("在職証明書は扶養者が準備", get(d, "income_employment_proof")?.preparedBy === "supporter");
}

// ── 2. 扶養者が会社勤務、申請人が子 ────────────────────────────────────────
console.log("[会社勤務・子]");
{
  const d = buildChecklist(base({ relationship: "child", supporterIncomeType: "income", identityDocs: ["birth_certificate"] }));
  check("出生証明書の写しがある（選択どおり）", has(d, "identity_birth_certificate"));
  check("結婚証明書は出ない（子なので無関係）", !has(d, "identity_marriage_certificate"));
  check("在職証明書等がある（収入を伴う活動）", has(d, "income_employment_proof"));
  check("住民税納税証明がある", has(d, "income_tax_payment_certificate"));
}

// ── 3. 扶養者が留学生、申請人が配偶者 ──────────────────────────────────────
console.log("[留学生・配偶者]");
{
  const d = buildChecklist(base({
    relationship: "spouse", supporterIncomeType: "other",
    identityDocs: ["marriage_certificate"], financialProofDocs: ["bank_balance"],
  }));
  check("在職証明書等は出ない（収入を伴わない活動）", !has(d, "income_employment_proof"));
  check("住民税課税証明は出ない", !has(d, "income_tax_certificate"));
  check("預金残高証明書がある（選択どおり）", has(d, "financial_bank_balance"));
  check("奨学金給付証明書は出ない（未選択）", !has(d, "financial_scholarship"));
  check("その他資料は出ない（未選択）", !has(d, "financial_other"));
  check("預金残高証明書の理由表示", (get(d, "financial_bank_balance")?.reason ?? "").includes("収入を伴わない"));
}

// ── 4. 任意のパスポート写しを追加するケース ─────────────────────────────────
console.log("[パスポート写し添付あり]");
{
  const d = buildChecklist(base({ attachApplicantPassportCopy: true }));
  check("パスポート写しがある", has(d, "optional_passport_copy"));
  check("パスポート写しは optional（任意・推奨）", get(d, "optional_passport_copy")?.status === "optional");
  check("パスポート写しは申請人が準備", get(d, "optional_passport_copy")?.preparedBy === "applicant");
  check("パスポート写しの注記（氏名表記の確認）", (get(d, "optional_passport_copy")?.requirement ?? "").includes("氏名表記"));

  const d2 = buildChecklist(base({ attachApplicantPassportCopy: false }));
  check("添付しない場合はパスポート写しが出ない", !has(d2, "optional_passport_copy"));
}

// ── 5. 必須入力未選択時のエラー表示 ────────────────────────────────────────
console.log("[必須入力未選択のバリデーション]");
{
  const noIdentity = validateInput(base({ identityDocs: [] }));
  check("身分関係書類未選択で警告が出る", noIdentity.length === 1 && noIdentity[0].includes("身分関係を証する書類"));

  const noFinancial = validateInput(base({ supporterIncomeType: "other", financialProofDocs: [] }));
  check("収入を伴わない活動で資力証明未選択なら警告が出る", noFinancial.some((w) => w.includes("資力を証する資料")));

  const okInput = validateInput(base({ identityDocs: ["marriage_certificate"], supporterIncomeType: "income" }));
  check("必須項目が揃っていれば警告なし", okInput.length === 0);

  const okOther = validateInput(base({ identityDocs: ["family_register"], supporterIncomeType: "other", financialProofDocs: ["scholarship"] }));
  check("収入を伴わない活動でも資力証明を選べば警告なし", okOther.length === 0);
}

console.log(`\n結果: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
