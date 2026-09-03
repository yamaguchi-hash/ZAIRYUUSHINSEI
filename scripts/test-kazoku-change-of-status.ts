/**
 * 家族滞在｜在留資格変更許可申請 必要書類チェックリストの判定ロジック テスト
 * 実行: npx tsx scripts/test-kazoku-change-of-status.ts
 *
 * 「必要書類マスター」の行（MasterDocRow）を模したモックデータに対して
 * evaluateChecklistFromMaster / validateInput を実行し、実際にDBへ投入する
 * scripts/seed-kazoku-change-of-status.ts と同じ conditions 形状で検証する。
 * 依存追加なし（プレーンなアサーションで検証）。
 */
import {
  evaluateChecklistFromMaster,
  validateInput,
  type ChecklistInput,
  type ChecklistDocument,
  type MasterDocRow,
  type KazokuChangeConditions,
} from "../src/lib/kazoku-change-of-status-checklist";

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
  photoException: false,
  ...over,
});

function row(id: string, name: string, preparedBy: string, conditions: KazokuChangeConditions, description = "説明"): MasterDocRow {
  return { id, documentName: name, description, preparedBy, conditions, sortOrder: 0 };
}

// scripts/seed-kazoku-change-of-status.ts と同じ条件形状のモック行
const ROWS: MasterDocRow[] = [
  // 在留資格変更許可申請書そのものは申請人・行政書士側で作成・提出する申請書式であり、
  // 申請人・扶養者が準備する必要書類（添付書類）ではないため一覧に含めない
  row("photo", "写真（縦4cm×横3cm）", "申請人", {
    category: "共通",
    exemptWhen: { photoException: true },
    requirementVariants: [{ when: { photoException: true }, text: "不要（写真提出の例外に該当）" }],
  }),
  row("passport_and_residence_card", "パスポート及び在留カード", "申請人", { category: "共通" }),
  row("household_certificate", "世帯全員の住民票の写し", "申請人", { category: "共通", validityNote: "発行から3ヶ月以内のもの", myNumberExcluded: true }),
  row("supporter_passport_residence_card", "扶養者のパスポート及び在留カードの写し", "扶養者", { category: "共通" }),

  row("identity_family_register", "戸籍謄本", "扶養者", { category: "身分関係書類", when: { identityDocs: "family_register" } }),
  row("identity_marriage_receipt", "婚姻届受理証明書", "扶養者", { category: "身分関係書類", when: { identityDocs: "marriage_certificate_receipt", relationship: "spouse" } }),
  row("identity_marriage_certificate", "結婚証明書の写し", "扶養者", { category: "身分関係書類", when: { identityDocs: "marriage_certificate", relationship: "spouse" }, translationRequired: true }),
  row("identity_birth_certificate", "出生証明書の写し", "扶養者", { category: "身分関係書類", when: { identityDocs: "birth_certificate", relationship: "child" }, translationRequired: true }),
  row("identity_acknowledgment", "認知届の写し", "扶養者", { category: "身分関係書類", when: { identityDocs: "acknowledgment_certificate", relationship: "child" } }),
  row("identity_equivalent", "身分関係を証するその他の文書", "扶養者", { category: "身分関係書類", when: { identityDocs: "equivalent_document" }, translationRequired: true }),

  row("income_employment_proof", "在職証明書又は営業許可書の写し等", "扶養者", { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため" }),
  row("income_tax_certificate", "住民税の課税（又は非課税）証明書", "扶養者", { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため", validityNote: "発行から3ヶ月以内のもの" }),
  row("income_tax_payment_certificate", "住民税の納税証明書", "扶養者", { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため", validityNote: "発行から3ヶ月以内のもの" }),

  row("financial_bank_balance", "扶養者名義の預金残高証明書", "扶養者", { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "bank_balance" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" }),
  row("financial_scholarship", "奨学金給付証明書", "扶養者", { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "scholarship" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" }),
  row("financial_other", "生活費を支弁できることを示すその他の資料", "扶養者", { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "other_financial" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" }),

  row("reason_letter", "理由書", "行政書士", { category: "任意・推奨", optional: true }),
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
  check("共通書類（写真）がある", has(d, "photo"));
  check("共通書類（住民票）がある", has(d, "household_certificate"));
  check("住民票はマイナンバー省略の注記", get(d, "household_certificate")?.myNumberExcluded === true);
  check("扶養者のパスポート・在留カードの写しがある", has(d, "supporter_passport_residence_card"));
  // 回帰テスト: exemptWhen未設定の共通書類が誤って「不要」にならないこと
  check("パスポート及び在留カードは required（exemptWhen未設定のため）", get(d, "passport_and_residence_card")?.status === "required");
  check("結婚証明書の写しがある（選択どおり）", has(d, "identity_marriage_certificate"));
  check("結婚証明書の写しは要翻訳", get(d, "identity_marriage_certificate")?.translationRequired === true);
  check("戸籍謄本は出ない（未選択）", !has(d, "identity_family_register"));
  check("認知届は出ない（配偶者なので無関係）", !has(d, "identity_acknowledgment"));
  check("在職証明書等がある（収入を伴う活動）", has(d, "income_employment_proof"));
  check("住民税課税証明がある", has(d, "income_tax_certificate"));
  check("住民税課税証明の有効期限注記", get(d, "income_tax_certificate")?.validityNote === "発行から3ヶ月以内のもの");
  check("預金残高証明は出ない（収入を伴う活動のため）", !has(d, "financial_bank_balance"));
  check("在職証明書は扶養者が準備", get(d, "income_employment_proof")?.preparedBy === "supporter");
  check("理由書は optional", get(d, "reason_letter")?.status === "optional");
}

// ── 2. 扶養者が会社勤務、申請人が子（出生証明書） ──────────────────────────
console.log("[会社勤務・子・出生証明書]");
{
  const d = buildChecklist(base({ relationship: "child", supporterIncomeType: "income", identityDocs: ["birth_certificate"] }));
  check("出生証明書の写しがある（選択どおり）", has(d, "identity_birth_certificate"));
  check("結婚証明書は出ない（子なので無関係）", !has(d, "identity_marriage_certificate"));
  check("認知届は出ない（未選択）", !has(d, "identity_acknowledgment"));
  check("在職証明書等がある（収入を伴う活動）", has(d, "income_employment_proof"));
  check("住民税納税証明がある", has(d, "income_tax_payment_certificate"));
}

// ── 3. 扶養者が会社勤務、申請人が子（認知届） ──────────────────────────────
console.log("[会社勤務・子・認知届]");
{
  const d = buildChecklist(base({ relationship: "child", supporterIncomeType: "income", identityDocs: ["acknowledgment_certificate"] }));
  check("認知届の写しがある（選択どおり）", has(d, "identity_acknowledgment"));
  check("出生証明書は出ない（未選択）", !has(d, "identity_birth_certificate"));
}

// ── 4. 扶養者が留学生、申請人が配偶者 ──────────────────────────────────────
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

// ── 5. 写真提出の例外 ──────────────────────────────────────────────────────
console.log("[写真提出の例外]");
{
  const d = buildChecklist(base({ photoException: true }));
  check("写真が exempt", get(d, "photo")?.status === "exempt");
  check("写真要件に『不要』表示", (get(d, "photo")?.requirement ?? "").includes("不要"));
}

// ── 6. 必須入力未選択時のエラー表示 ────────────────────────────────────────
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
