/**
 * 技術・人文知識・国際業務（engineer_humanities）在留期間更新許可申請（renewal）の
 * 必要書類マスターを投入するスクリプト。
 *
 * 条件付き適用ルールは各行の conditions（jsonb）に
 * GijinkokuRenewalConditions 形式（src/lib/gijinkoku-renewal-checklist.ts）で保存する。
 * when が未設定の行は「共通書類」（常に該当）として扱われる。
 *
 * 実行: npx tsx scripts/seed-gijinkoku-renewal-checklist.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { documentRequirementMaster } from "../src/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { GijinkokuRenewalConditions } from "../src/lib/gijinkoku-renewal-checklist";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not found. Check .env.local");
}
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const VISA = "engineer_humanities";
const APP = "renewal";

type Doc = {
  sortOrder: number;
  name: string;
  description: string;
  preparedBy: "申請人" | "受入企業" | "派遣先";
  conditions: GijinkokuRenewalConditions;
};

const DOCS: Doc[] = [
  // ══════════════════════════════════════════════════════════════════
  // 全カテゴリー共通
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 100,
    name: "在留期間更新許可申請書",
    description: "申請人等作成用・所属機関等作成用の各様式に記入（所属機関記入部分は所属機関が作成）",
    preparedBy: "申請人",
    conditions: { category: "共通" },
  },
  {
    sortOrder: 200,
    name: "写真（縦4cm×横3cm）",
    description: "申請前6か月以内に撮影したもの。縦4cm×横3cm、無帽・正面・無背景。裏面に氏名を記入。",
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
    name: "住民税の課税（又は非課税）証明書",
    description: "1年間の総所得及び納税状況が確認できるもの",
    preparedBy: "申請人",
    conditions: { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" },
  },
  {
    sortOrder: 2020,
    name: "住民税の納税証明書",
    description: "1年間の総所得及び納税状況が確認できるもの",
    preparedBy: "申請人",
    conditions: { category: "カテゴリー3・4", when: { orgCategoryIn: [3, 4] }, reason: "所属機関がカテゴリー3・4のため" },
  },

  // ══════════════════════════════════════════════════════════════════
  // カテゴリー3・4の会社へ転職後、初めて更新する場合
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 3000,
    name: "活動内容を明らかにする書類",
    description:
      "雇用契約の場合：労働条件通知書等／日本法人の役員の場合：役員報酬に関する定款又は株主総会議事録／" +
      "外国法人の日本支店への転勤・団体役員の場合：担当業務・期間・報酬を示す所属団体の文書",
    preparedBy: "受入企業",
    conditions: { category: "転職後初回", when: { firstUpdateAfterTransfer: true }, reason: "カテゴリー3・4の会社へ転職後、初めての更新のため" },
  },
  {
    sortOrder: 3010,
    name: "登記事項証明書",
    description: "所属機関の登記事項証明書",
    preparedBy: "受入企業",
    conditions: { category: "転職後初回", when: { firstUpdateAfterTransfer: true }, reason: "カテゴリー3・4の会社へ転職後、初めての更新のため" },
  },
  {
    sortOrder: 3020,
    name: "会社案内等（沿革・役員・組織・事業内容・主要取引先・取引実績が分かる書類）",
    description: "会社案内、パンフレット、ホームページ写し等",
    preparedBy: "受入企業",
    conditions: { category: "転職後初回", when: { firstUpdateAfterTransfer: true }, reason: "カテゴリー3・4の会社へ転職後、初めての更新のため" },
  },
  {
    sortOrder: 3030,
    name: "直近年度の決算書類の写し",
    description: "損益計算書・貸借対照表等。新規事業で決算が未了の場合は事業計画書",
    preparedBy: "受入企業",
    conditions: { category: "転職後初回", when: { firstUpdateAfterTransfer: true }, reason: "カテゴリー3・4の会社へ転職後、初めての更新のため" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 主に言語能力を用いる対人業務への変更の場合
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 4000,
    name: "CEFR B2相当の言語能力を証する資料",
    description: "業務上使用する言語について、CEFR B2相当の言語能力を証するもの",
    preparedBy: "申請人",
    conditions: { category: "言語業務変更", when: { changeToLanguageWork: true }, reason: "主に言語能力を用いる対人業務への変更のため" },
  },

  // ══════════════════════════════════════════════════════════════════
  // カテゴリー4かつ転職後初回の場合のみ
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 5000,
    name: "法定調書合計表を提出できない理由を明らかにする書類",
    description:
      "源泉徴収の免除を受けている場合：免除証明等／それ以外の場合：給与支払事務所等の開設届出書及び" +
      "直近3か月分の所得税徴収高計算書、又は納期の特例に係る承認資料",
    preparedBy: "受入企業",
    conditions: { category: "カテゴリー4・転職後初回", when: { orgCategoryIn: [4], firstUpdateAfterTransfer: true }, reason: "カテゴリー4かつ転職後初回のため" },
  },
];

async function main() {
  console.log("=== 技術・人文知識・国際業務（更新）必要書類マスター投入 ===");
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
