/**
 * 技人国｜在留資格変更許可申請 必要書類チェックリストの判定ロジック テスト
 * 実行: npx tsx scripts/test-gijinkoku-change-of-status.ts
 *
 * 「必要書類マスター」の行（MasterDocRow）を模したモックデータに対して
 * evaluateChecklistFromMaster を実行し、実際にDBへ投入する
 * scripts/seed-gijinkoku-change-of-status.ts と同じ conditions 形状で検証する。
 * 依存追加なし（プレーンなアサーションで検証）。
 */
import {
  evaluateChecklistFromMaster,
  type ChecklistInput,
  type ChecklistDocument,
  type MasterDocRow,
  type GijinkokuChangeConditions,
} from "../src/lib/gijinkoku-change-of-status-checklist";

let passed = 0;
let failed = 0;
function check(desc: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${desc}`); }
  else { failed++; console.error(`  ✗ ${desc}`); }
}

const base = (over: Partial<ChecklistInput>): ChecklistInput => ({
  orgCategory: 1, eduBackground: "jp_university", dispatchWork: false,
  changeToLanguageWork: false, photoException: false, ...over,
});

function row(id: string, name: string, preparedBy: string, conditions: GijinkokuChangeConditions, description = "説明"): MasterDocRow {
  return { id, documentName: name, description, preparedBy, conditions, sortOrder: 0 };
}

// scripts/seed-gijinkoku-change-of-status.ts と同じ条件形状のモック行
const ROWS: MasterDocRow[] = [
  // 在留資格変更許可申請書そのものは所属機関・行政書士側で作成・提出する申請書式であり、
  // 申請人・所属機関が準備する必要書類（添付書類）ではないため一覧に含めない
  row("photo", "写真（縦4cm×横3cm）", "申請人", {
    category: "共通",
    exemptWhen: { photoException: true },
    requirementVariants: [{ when: { photoException: true }, text: "不要（写真提出の例外に該当）" }],
  }),
  row("passport_and_residence_card", "パスポート及び在留カード", "申請人", { category: "共通" }),
  row("resume", "履歴書（職歴を含む）", "申請人", { category: "共通" }),
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
  row("working_conditions", "労働条件を明らかにする文書", "受入企業", { category: "共通" }),
  row("business_content", "事業内容を明らかにする資料", "受入企業", { category: "共通", validityNote: "登記事項証明書は発行から3ヶ月以内のもの" }),

  row("graduation_certificate", "卒業証明書", "申請人", {
    category: "学歴・職歴", when: { eduBackgroundIn: ["jp_university", "jp_specialized_school"] },
    reason: "日本の大学・大学院又は専門学校を卒業しているため", validityNote: "発行から3ヶ月以内のもの",
  }),
  row("foreign_degree", "学位を証する文書", "申請人", {
    category: "学歴・職歴", when: { eduBackgroundIn: ["foreign_university"] },
    reason: "外国の大学・大学院を卒業しているため", translationRequired: true,
  }),
  row("specialist_title", "専門士又は高度専門士の称号を証する書類", "申請人", {
    category: "学歴・職歴", when: { eduBackgroundIn: ["jp_specialized_school"] },
    reason: "日本の専門学校（専門士・高度専門士）を卒業しているため",
  }),
  row("transcript_jp", "成績証明書等（関連性資料）", "申請人", {
    category: "学歴・職歴", when: { eduBackgroundIn: ["jp_university", "jp_specialized_school"] },
    reason: "専攻内容と職務内容の関連性を説明する必要があるため",
  }),
  row("transcript_foreign", "成績証明書等（関連性資料・外国語）", "申請人", {
    category: "学歴・職歴", when: { eduBackgroundIn: ["foreign_university"] },
    reason: "専攻内容と職務内容の関連性を説明する必要があるため", translationRequired: true,
  }),
  row("work_experience_certificate", "実務経験証明書", "受入企業", {
    category: "学歴・職歴", when: { eduBackgroundIn: ["work_experience"] },
    reason: "実務経験により在留資格該当性を立証するため",
    requirementVariants: [{ when: { changeToLanguageWork: true }, text: "言語関連業務は3年以上" }],
  }),

  row("dispatch_pledge_from", "誓約書（派遣元用）", "受入企業", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("dispatch_pledge_to", "誓約書（派遣先用）", "派遣先", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),
  row("dispatch_ledger_to", "派遣先管理台帳", "派遣先", { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" }),

  row("cat34_representative_declaration", "所属機関の代表者に関する申告書", "受入企業", { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" }),
  row("cat34_checksheet", "提出書類チェックシート", "申請人", { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" }),

  row("language_cefr_b2", "CEFR B2相当の言語能力を証する資料", "申請人", { category: "言語関連業務", when: { changeToLanguageWork: true }, reason: "主に言語能力を用いる対人業務に従事するため" }),

  row("reason_letter", "理由書", "行政書士", { category: "任意・推奨", optional: true }),
];

function buildChecklist(input: ChecklistInput): ChecklistDocument[] {
  return evaluateChecklistFromMaster(ROWS, input).filter((d) => d.applicable);
}
const has = (docs: ChecklistDocument[], id: string) => docs.some((d) => d.id === id);
const get = (docs: ChecklistDocument[], id: string) => docs.find((d) => d.id === id);

// ── 1. 日本の大学卒業・カテゴリー1（基本） ─────────────────────────────────
console.log("[日本の大学卒業・カテゴリー1]");
{
  const d = buildChecklist(base({ eduBackground: "jp_university", orgCategory: 1 }));
  check("パスポート及び在留カードがある", has(d, "passport_and_residence_card"));
  // 回帰テスト: exemptWhen未設定の共通書類が誤って「不要」にならないこと
  check("パスポート及び在留カードは required（exemptWhen未設定のため）", get(d, "passport_and_residence_card")?.status === "required");
  check("履歴書がある", has(d, "resume"));
  check("写真がある・required", get(d, "photo")?.status === "required");
  check("卒業証明書がある", has(d, "graduation_certificate"));
  check("卒業証明書の有効期限注記", get(d, "graduation_certificate")?.validityNote === "発行から3ヶ月以内のもの");
  check("成績証明書（関連性資料）がある", has(d, "transcript_jp"));
  check("学位を証する文書は出ない（外国大学ではない）", !has(d, "foreign_degree"));
  check("専門士書類は出ない（専門学校ではない）", !has(d, "specialist_title"));
  check("実務経験証明書は出ない", !has(d, "work_experience_certificate"));
  check("派遣書類は出ない", !has(d, "dispatch_pledge_from"));
  check("カテゴリー3・4書類は出ない", !has(d, "cat34_representative_declaration"));
  check("CEFRは出ない", !has(d, "language_cefr_b2"));
  check("理由書は optional", get(d, "reason_letter")?.status === "optional");
}

// ── 2. 外国の大学卒業 ──────────────────────────────────────────────────────
console.log("[外国の大学卒業]");
{
  const d = buildChecklist(base({ eduBackground: "foreign_university" }));
  check("学位を証する文書がある", has(d, "foreign_degree"));
  check("学位を証する文書は要翻訳", get(d, "foreign_degree")?.translationRequired === true);
  check("成績証明書（外国語）がある", has(d, "transcript_foreign"));
  check("成績証明書（外国語）は要翻訳", get(d, "transcript_foreign")?.translationRequired === true);
  check("卒業証明書は出ない（日本の学校ではない）", !has(d, "graduation_certificate"));
  check("成績証明書（日本語版）は出ない", !has(d, "transcript_jp"));
}

// ── 3. 日本の専門学校卒業 ──────────────────────────────────────────────────
console.log("[日本の専門学校卒業]");
{
  const d = buildChecklist(base({ eduBackground: "jp_specialized_school" }));
  check("卒業証明書がある", has(d, "graduation_certificate"));
  check("専門士書類がある", has(d, "specialist_title"));
  check("成績証明書（関連性資料）がある", has(d, "transcript_jp"));
}

// ── 4. 実務経験ルート・言語関連業務なし ────────────────────────────────────
console.log("[実務経験・言語関連業務なし]");
{
  const d = buildChecklist(base({ eduBackground: "work_experience", changeToLanguageWork: false }));
  check("実務経験証明書がある", has(d, "work_experience_certificate"));
  check("実務経験証明書は既定文言（10年等の一般要件）", (get(d, "work_experience_certificate")?.requirement ?? "") !== "言語関連業務は3年以上");
  check("卒業証明書は出ない", !has(d, "graduation_certificate"));
}

// ── 5. 実務経験ルート・言語関連業務あり ────────────────────────────────────
console.log("[実務経験・言語関連業務あり]");
{
  const d = buildChecklist(base({ eduBackground: "work_experience", changeToLanguageWork: true }));
  check("実務経験証明書は3年要件の文言", get(d, "work_experience_certificate")?.requirement === "言語関連業務は3年以上");
  check("CEFR資料もある（言語関連業務のため）", has(d, "language_cefr_b2"));
}

// ── 6. 派遣あり ────────────────────────────────────────────────────────────
console.log("[派遣あり]");
{
  const d = buildChecklist(base({ dispatchWork: true }));
  for (const id of ["dispatch_pledge_from", "dispatch_pledge_to", "dispatch_ledger_to"]) {
    check(`派遣書類 ${id} がある`, has(d, id));
  }
  check("派遣先管理台帳は派遣先が準備", get(d, "dispatch_ledger_to")?.preparedBy === "dispatch_destination");
  check("誓約書（派遣元用）は所属機関が準備", get(d, "dispatch_pledge_from")?.preparedBy === "organization");
}

// ── 7. カテゴリー3・4 ──────────────────────────────────────────────────────
console.log("[カテゴリー3・4]");
{
  const d3 = buildChecklist(base({ orgCategory: 3 }));
  check("代表者申告書がある（カテゴリー3）", has(d3, "cat34_representative_declaration"));
  check("提出書類チェックシートがある（カテゴリー3）", has(d3, "cat34_checksheet"));
  check("カテゴリー該当証明は法定調書合計表", (get(d3, "category_certificate")?.requirement ?? "").includes("法定調書合計表"));

  const d4 = buildChecklist(base({ orgCategory: 4 }));
  check("カテゴリー該当証明が exempt（カテゴリー4は原則不要）", get(d4, "category_certificate")?.status === "exempt");
  check("代表者申告書がある（カテゴリー4）", has(d4, "cat34_representative_declaration"));

  const d1 = buildChecklist(base({ orgCategory: 1 }));
  check("カテゴリー1では代表者申告書は出ない", !has(d1, "cat34_representative_declaration"));
}

// ── 8. 写真例外あり ────────────────────────────────────────────────────────
console.log("[写真例外あり]");
{
  const d = buildChecklist(base({ photoException: true }));
  check("写真が exempt", get(d, "photo")?.status === "exempt");
  check("写真要件に『不要』表示", (get(d, "photo")?.requirement ?? "").includes("不要"));
}

console.log(`\n結果: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
