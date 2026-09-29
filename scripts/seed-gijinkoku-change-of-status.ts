/**
 * 技術・人文知識・国際業務（engineer_humanities）在留資格変更許可申請（change）の
 * 必要書類マスターを投入するスクリプト。
 *
 * 条件付き適用ルールは各行の conditions（jsonb）に
 * GijinkokuChangeConditions 形式（src/lib/gijinkoku-change-of-status-checklist.ts）で保存する。
 * when が未設定の行は「共通書類」（常に該当）として扱われる。
 *
 * 実行: npx tsx scripts/seed-gijinkoku-change-of-status.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { documentRequirementMaster } from "../src/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { GijinkokuChangeConditions } from "../src/lib/gijinkoku-change-of-status-checklist";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not found. Check .env.local");
}
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const VISA = "engineer_humanities";
const APP = "change";

type Doc = {
  sortOrder: number;
  name: string;
  description: string;
  preparedBy: "申請人" | "受入企業" | "派遣先" | "行政書士";
  conditions: GijinkokuChangeConditions;
};

const DOCS: Doc[] = [
  // ══════════════════════════════════════════════════════════════════
  // 全カテゴリー共通
  // （在留資格変更許可申請書そのものは所属機関・行政書士側で作成・提出する申請書式であり、
  //   申請人・所属機関が準備する「必要書類（添付書類）」ではないため一覧に含めない）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 200,
    name: "写真（縦4cm×横3cm）",
    description: "申請前3か月以内に撮影したもの。縦4cm×横3cm、無帽・正面・無背景。裏面に氏名を記入。",
    preparedBy: "申請人",
    conditions: {
      category: "共通",
      exemptWhen: { photoException: true },
      requirementVariants: [{ when: { photoException: true }, text: "不要（写真提出の例外に該当）" }],
    },
  },
  {
    sortOrder: 300,
    name: "パスポート及び在留カード",
    description: "提示（窓口で提示。原本の確認のため持参）",
    preparedBy: "申請人",
    conditions: { category: "共通" },
  },
  {
    sortOrder: 350,
    name: "履歴書（職歴を含む）",
    description: "学歴・職歴を含む履歴書",
    preparedBy: "申請人",
    conditions: { category: "共通" },
  },
  {
    sortOrder: 400,
    name: "所属機関のカテゴリー該当性を証する文書",
    description: "所属機関のカテゴリーにより提出書類が異なります。",
    preparedBy: "受入企業",
    conditions: {
      category: "共通",
      exemptWhen: { orgCategoryIn: [4] },
      requirementVariants: [
        { when: { orgCategoryIn: [1] }, text: "上場企業の証明、四季報の写し、公益法人等の設立許可証明、対象企業（イノベーション創出企業等）の認定書類 など" },
        { when: { orgCategoryIn: [2] }, text: "前年分の給与所得の源泉徴収票等の法定調書合計表、又は国税庁「オンライン利用」の承認を受けていることの証明" },
        { when: { orgCategoryIn: [3] }, text: "前年分の給与所得の源泉徴収票等の法定調書合計表" },
        { when: { orgCategoryIn: [4] }, text: "原則不要（カテゴリー1〜3の証明書を提出できない場合はその旨を説明）" },
      ],
    },
  },
  {
    sortOrder: 450,
    name: "労働条件を明らかにする文書（雇用契約書・労働条件通知書等）",
    description: "業務内容・給与等の労働条件が分かるもの",
    preparedBy: "受入企業",
    conditions: { category: "共通" },
  },
  {
    sortOrder: 460,
    name: "事業内容を明らかにする資料（登記事項証明書・会社案内等）",
    description: "登記事項証明書、会社案内・パンフレット、ホームページ写し等",
    preparedBy: "受入企業",
    conditions: { category: "共通", validityNote: "登記事項証明書は発行から3ヶ月以内のもの" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 学歴・職歴区分（在留資格該当性の立証ルート）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 700,
    name: "卒業証明書",
    description: "日本の大学・大学院又は専門学校の卒業証明書",
    preparedBy: "申請人",
    conditions: {
      category: "学歴・職歴",
      when: { eduBackgroundIn: ["jp_university", "jp_specialized_school"] },
      reason: "日本の大学・大学院又は専門学校を卒業しているため",
      validityNote: "発行から3ヶ月以内のもの",
    },
  },
  {
    sortOrder: 710,
    name: "学位を証する文書",
    description: "外国の大学・大学院の学位を証明する文書（卒業証書・学位記の写し等）",
    preparedBy: "申請人",
    conditions: {
      category: "学歴・職歴",
      when: { eduBackgroundIn: ["foreign_university"] },
      reason: "外国の大学・大学院を卒業しているため",
      validityNote: "発行から3ヶ月以内のもの",
      translationRequired: true,
    },
  },
  {
    sortOrder: 720,
    name: "専門士又は高度専門士の称号を証する書類",
    description: "専修学校が発行する専門士・高度専門士の称号を証する証明書",
    preparedBy: "申請人",
    conditions: {
      category: "学歴・職歴",
      when: { eduBackgroundIn: ["jp_specialized_school"] },
      reason: "日本の専門学校（専門士・高度専門士）を卒業しているため",
    },
  },
  {
    sortOrder: 730,
    name: "成績証明書等（専攻内容と職務内容の関連性資料）",
    description: "成績証明書、シラバス（科目履修内容）等、専攻内容と従事する職務内容との関連性を説明する資料",
    preparedBy: "申請人",
    conditions: {
      category: "学歴・職歴",
      when: { eduBackgroundIn: ["jp_university", "jp_specialized_school"] },
      reason: "専攻内容と職務内容の関連性を説明する必要があるため",
    },
  },
  {
    sortOrder: 735,
    name: "成績証明書等（専攻内容と職務内容の関連性資料・外国語）",
    description: "成績証明書、シラバス（科目履修内容）等、専攻内容と従事する職務内容との関連性を説明する資料",
    preparedBy: "申請人",
    conditions: {
      category: "学歴・職歴",
      when: { eduBackgroundIn: ["foreign_university"] },
      reason: "専攻内容と職務内容の関連性を説明する必要があるため",
      translationRequired: true,
    },
  },
  {
    sortOrder: 740,
    name: "実務経験証明書（在職期間・従事した業務内容）",
    description: "前職の使用者が作成する、在職期間及び従事した業務内容の証明書",
    preparedBy: "受入企業",
    conditions: {
      category: "学歴・職歴",
      when: { eduBackgroundIn: ["work_experience"] },
      reason: "実務経験により在留資格該当性を立証するため",
      requirementVariants: [
        { when: { changeToLanguageWork: true }, text: "翻訳・通訳等の言語関連業務に係る実務経験は3年以上の在職期間・業務内容を証明するもの（外国語で作成されている場合は日本語訳を添付）" },
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // 派遣就労の場合のみ
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 1000,
    name: "申請人の派遣労働に関する誓約書（派遣元用）",
    description: "派遣元（所属機関）が作成する誓約書",
    preparedBy: "受入企業",
    conditions: { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" },
  },
  {
    sortOrder: 1010,
    name: "申請人の派遣労働に関する誓約書（派遣先用）",
    description: "派遣先が作成する誓約書",
    preparedBy: "派遣先",
    conditions: { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" },
  },
  {
    sortOrder: 1020,
    name: "労働条件通知書又は雇用契約書",
    description: "労働条件・雇用契約の内容が分かるもの",
    preparedBy: "受入企業",
    conditions: { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" },
  },
  {
    sortOrder: 1030,
    name: "労働者派遣個別契約書",
    description: "派遣元と派遣先の個別契約の内容が分かるもの",
    preparedBy: "受入企業",
    conditions: { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" },
  },
  {
    sortOrder: 1040,
    name: "派遣元管理台帳",
    description: "派遣元が備える管理台帳の写し",
    preparedBy: "受入企業",
    conditions: { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" },
  },
  {
    sortOrder: 1050,
    name: "派遣先管理台帳",
    description: "派遣先が備える管理台帳の写し",
    preparedBy: "派遣先",
    conditions: { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" },
  },
  {
    sortOrder: 1060,
    name: "就業状況報告書",
    description: "派遣先での就業状況が分かる報告書",
    preparedBy: "派遣先",
    conditions: { category: "派遣", when: { dispatchWork: true }, reason: "派遣契約に基づく就労のため" },
  },

  // ══════════════════════════════════════════════════════════════════
  // カテゴリー3・4の場合
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 2000,
    name: "所属機関の代表者に関する申告書（参考様式）",
    description: "参考様式に基づき所属機関の代表者が作成",
    preparedBy: "受入企業",
    conditions: { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" },
  },
  {
    sortOrder: 2010,
    name: "提出書類チェックシート（カテゴリー3・4用）",
    description: "出入国在留管理庁が公表するカテゴリー3・4用のチェックシート",
    preparedBy: "申請人",
    conditions: { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 主に言語能力を用いる対人業務（通訳・翻訳・接客等）の場合
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 4000,
    name: "CEFR B2相当の言語能力を証する資料",
    description: "業務上使用する言語について、CEFR B2相当（JLPT N2以上、BJT400点以上等）の言語能力を証するもの",
    preparedBy: "申請人",
    conditions: { category: "言語関連業務", when: { changeToLanguageWork: true }, reason: "主に言語能力を用いる対人業務に従事するため" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 任意・推奨
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 9000,
    name: "理由書",
    description: "在留資格変更を必要とする経緯・専攻や職歴と職務内容との関連性等を説明する書類。個別事情がある場合に許可の可能性を高めるための補足資料として添付を推奨。",
    preparedBy: "行政書士",
    conditions: { category: "任意・推奨", optional: true },
  },
];

async function main() {
  console.log("=== 技術・人文知識・国際業務（在留資格変更）必要書類マスター投入 ===");
  console.log(`visaType: ${VISA}, applicationType: ${APP}`);
  console.log(`投入件数: ${DOCS.length} 件\n`);

  const existing = await db
    .select({ id: documentRequirementMaster.id, documentName: documentRequirementMaster.documentName })
    .from(documentRequirementMaster)
    .where(and(
      eq(documentRequirementMaster.visaType, VISA),
      eq(documentRequirementMaster.applicationType, APP)
    ));

  if (existing.length > 0) {
    console.log(`既存データ ${existing.length} 件を削除します。`);
    await db.delete(documentRequirementMaster).where(and(
      eq(documentRequirementMaster.visaType, VISA),
      eq(documentRequirementMaster.applicationType, APP)
    ));
  }

  for (const doc of DOCS) {
    await db.insert(documentRequirementMaster).values({
      visaType: VISA,
      applicationType: APP,
      documentName: doc.name,
      description: doc.description,
      preparedBy: doc.preparedBy,
      isAlwaysRequired: false,
      conditions: doc.conditions,
      sortOrder: doc.sortOrder,
      isActive: true,
    });
    console.log(`  ✓ [${doc.sortOrder}] ${doc.name}`);
  }

  console.log(`\n合計 ${DOCS.length} 件を投入しました。`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
