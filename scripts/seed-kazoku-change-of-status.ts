/**
 * 家族滞在（dependent）在留資格変更許可申請（change）の
 * 必要書類マスターを投入するスクリプト。
 *
 * 条件付き適用ルールは各行の conditions（jsonb）に
 * KazokuChangeConditions 形式（src/lib/kazoku-change-of-status-checklist.ts）で保存する。
 * when が未設定の行は「共通書類」（常に該当）として扱われる。
 *
 * 実行: npx tsx scripts/seed-kazoku-change-of-status.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { documentRequirementMaster } from "../src/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { KazokuChangeConditions } from "../src/lib/kazoku-change-of-status-checklist";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not found. Check .env.local");
}
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const VISA = "dependent";
const APP = "change";

type Doc = {
  sortOrder: number;
  name: string;
  description: string;
  preparedBy: "申請人" | "扶養者" | "行政書士";
  conditions: KazokuChangeConditions;
};

const DOCS: Doc[] = [
  // ══════════════════════════════════════════════════════════════════
  // 全条件共通
  // （在留資格変更許可申請書そのものは申請人・行政書士側で作成・提出する申請書式であり、
  //   申請人・扶養者が準備する「必要書類（添付書類）」ではないため一覧に含めない）
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
    name: "世帯全員の住民票の写し",
    description: "申請人と扶養者の世帯全員が記載されたもの",
    preparedBy: "申請人",
    conditions: { category: "共通", validityNote: "発行から3ヶ月以内のもの", myNumberExcluded: true },
  },
  {
    sortOrder: 360,
    name: "扶養者のパスポート及び在留カードの写し",
    description: "扶養者の身分事項・在留資格が分かるもの",
    preparedBy: "扶養者",
    conditions: { category: "共通" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 身分関係を証する書類（続柄により選択）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 1000,
    name: "戸籍謄本",
    description: "身分関係を証する書類",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "family_register" } },
  },
  {
    sortOrder: 1010,
    name: "婚姻届受理証明書",
    description: "身分関係を証する書類",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "marriage_certificate_receipt", relationship: "spouse" } },
  },
  {
    sortOrder: 1020,
    name: "結婚証明書の写し",
    description: "身分関係を証する書類",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "marriage_certificate", relationship: "spouse" }, translationRequired: true },
  },
  {
    sortOrder: 1030,
    name: "出生証明書の写し",
    description: "身分関係を証する書類",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "birth_certificate", relationship: "child" }, translationRequired: true },
  },
  {
    sortOrder: 1040,
    name: "認知届の写し",
    description: "身分関係を証する書類",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "acknowledgment_certificate", relationship: "child" } },
  },
  {
    sortOrder: 1050,
    name: "身分関係を証するその他の文書",
    description: "戸籍謄本等に準ずる、身分関係を証する文書",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "equivalent_document" }, translationRequired: true },
  },

  // ══════════════════════════════════════════════════════════════════
  // 扶養者が収入を伴う活動をしている場合
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 2000,
    name: "在職証明書又は営業許可書の写し等",
    description: "扶養者の在職・営業状況が分かるもの",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため" },
  },
  {
    sortOrder: 2010,
    name: "住民税の課税（又は非課税）証明書",
    description: "1年間の総所得及び納税状況が分かるもの",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため", validityNote: "発行から3ヶ月以内のもの" },
  },
  {
    sortOrder: 2020,
    name: "住民税の納税証明書",
    description: "1年間の総所得及び納税状況が分かるもの",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため", validityNote: "発行から3ヶ月以内のもの" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 扶養者が収入を伴わない活動（留学等）の場合
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 3000,
    name: "扶養者名義の預金残高証明書",
    description: "生活費を支弁できることが分かるもの",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "bank_balance" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" },
  },
  {
    sortOrder: 3010,
    name: "奨学金給付証明書",
    description: "給付額及び給付期間が分かるもの",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "scholarship" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" },
  },
  {
    sortOrder: 3020,
    name: "生活費を支弁できることを示すその他の資料",
    description: "上記に準ずる資料",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴わない活動", when: { supporterIncomeType: "other", financialProofDocs: "other_financial" }, reason: "扶養者が留学等、収入を伴わない活動をしているため" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 任意・推奨
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 9000,
    name: "理由書",
    description: "同居・扶養状況、在留資格変更に至る経緯を説明する書類。個別事情がある場合に許可の可能性を高めるための補足資料として添付を推奨。",
    preparedBy: "行政書士",
    conditions: { category: "任意・推奨", optional: true },
  },
];

async function main() {
  console.log("=== 家族滞在（在留資格変更）必要書類マスター投入 ===");
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
