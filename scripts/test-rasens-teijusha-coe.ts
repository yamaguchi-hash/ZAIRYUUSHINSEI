/**
 * RASENS転記シート生成（rasens-transfer.ts）— 定住者COE（区分T）拡張分の回帰テスト
 * 実行: npx tsx scripts/test-rasens-teijusha-coe.ts
 *
 * 実際のオンライン申請システム提出控え（区分T・定住者、永住者の実子ケース）を
 * モデルにした入力で buildRasensFields を実行し、新規追加フィールドが正しいラベルで
 * 出力されること・カテゴリ外のフィールドが除外されることを検証する。
 */
import { buildRasensFields } from "../src/lib/rasens-transfer";
import { EMPTY_FORM_DATA, type ApplicationFormData } from "../src/lib/form-types";

let passed = 0;
let failed = 0;
function check(desc: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${desc}`); }
  else { failed++; console.error(`  ✗ ${desc}`); }
}

const form: ApplicationFormData = {
  ...EMPTY_FORM_DATA,
  applicationFormType: "coe",
  visaFormCategory: "T",
  purposeOfEntry: "定住者",
  statusOrPosition: "「永住者・特別永住者」の「未成年で未婚の実子」",
  marriageNotificationPlaceForeign: "デブダハ市役所",
  marriageNotificationDateForeign: "2021-10-03",
  employerName: "アルシー",
  employerAddress: "〒5710008|大阪府門真市東江端町１１－１",
  employerPhone: "0728810171",
  applicantAnnualIncome: "4800000",
  fundingMethod: "身元保証人負担",
  fundingMonthlyAmount: "50000",
  expensePayerName: "RAYAMAJHI KRISHNA BAHADUR",
  expensePayerNationality: "ネパール",
  expensePayerAddress: "〒5740064|大阪府大東市御領１丁目７番６号",
  expensePayerPhone: "08042429422",
  expensePayerOccupation: "アルシー",
  expensePayerWorkPhone: "0728810171",
  expensePayerAnnualIncome: "4800000",
  supporterFamilyNameEn: "RAYAMAJHI",
  supporterGivenNameEn: "KRISHNA BAHADUR",
  supporterDob: "1981-08-23",
  supporterNationality: "ネパール",
  supporterResidenceCard: "LJ11774775LA",
  supporterStatusOfResidence: "永住者",
  supporterRelationship: "父",
  guarantorName: "RAYAMAJHI KRISHNA BAHADUR",
  guarantorOccupation: "アルシー",
  guarantorAddress: "〒5740064|大阪府大東市御領１丁目７番６号",
  guarantorPhone: "08042429422",
  coeReceiptMethod: "郵送",
  notificationEmail: "yamaguchi@jls-gyosei.jp",
  notificationEmailConfirm: "yamaguchi@jls-gyosei.jp",
  // R型専用（このケースでは非該当のはず）
  partTimeWorkExistsR: "無",
};

const fields = buildRasensFields(form);
const byKey = new Map(fields.map((f) => [f.key, f]));
const labels = fields.map((f) => f.label);

console.log("[定住者COE（区分T）— 新規フィールドの出力確認]");
check("身分又は地位が出力される", byKey.get("statusOrPosition")?.value === "「永住者・特別永住者」の「未成年で未婚の実子」");
check("出生届（本国等届出先）が出力される（R型フィールドをT型で共用）", byKey.get("marriageNotificationPlaceForeign")?.value === "デブダハ市役所");
check("申請人の年収が出力される", byKey.get("applicantAnnualIncome")?.value === "4800000");
check("滞在費支弁の月平均支弁額が出力される", byKey.get("fundingMonthlyAmount")?.value === "50000");
check("経費支弁者の氏名が出力される", byKey.get("expensePayerName")?.value === "RAYAMAJHI KRISHNA BAHADUR");
check("経費支弁者の年収が出力される", byKey.get("expensePayerAnnualIncome")?.value === "4800000");
check("扶養者の氏名（ローマ字）が出力される（R型フィールドをT型で共用）", byKey.get("supporterNameEn")?.value?.includes("RAYAMAJHI") ?? false);
check("扶養者の在留カード番号が出力される", byKey.get("supporterResidenceCard")?.value === "LJ11774775LA");
check("身元保証人の氏名が出力される", byKey.get("guarantorName")?.value === "RAYAMAJHI KRISHNA BAHADUR");
check("受領方法（郵送）が出力される", byKey.get("coeReceiptMethod")?.value === "郵送");
check("通知送信用メールアドレスが出力される", byKey.get("notificationEmail")?.value === "yamaguchi@jls-gyosei.jp");

console.log("[ラベルの確認]");
check("経費支弁者のラベルに正しい見出しが付く", labels.some((l) => l.includes("経費支弁者　氏名")));
check("身元保証人のラベルに正しい見出しが付く", labels.some((l) => l.includes("在日身元保証人又は連絡先　氏名")));

console.log("[カテゴリ外フィールドの除外確認]");
check("資格外活動（家族滞在専用）は区分Tでは出力されない", !byKey.has("partTimeWorkExistsR"));

console.log("[COE以外の申請種別では受領方法等が出力されないこと]");
const changeForm: ApplicationFormData = { ...form, applicationFormType: "change" };
const changeFields = buildRasensFields(changeForm);
const changeByKey = new Map(changeFields.map((f) => [f.key, f]));
check("変更許可申請では受領方法が出力されない", !changeByKey.has("coeReceiptMethod"));
check("変更許可申請でも身分又は地位（区分T共通項目）は出力される", changeByKey.get("statusOrPosition")?.value === "「永住者・特別永住者」の「未成年で未婚の実子」");

console.log(`\n結果: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
