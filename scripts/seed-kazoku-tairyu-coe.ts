/**
 * 家族滞在（dependent）在留資格認定証明書交付申請（certification）の
 * 必要書類マスターを投入するスクリプト。
 *
 * 条件付き適用ルールは各行の conditions（jsonb）に
 * FamilyStayCoeConditions 形式（src/lib/kazoku-tairyu-coe-checklist.ts）で保存する。
 * when が未設定の行は「共通書類」（常に該当）として扱われる。
 *
 * 実行: npx tsx scripts/seed-kazoku-tairyu-coe.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { documentRequirementMaster } from "../src/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { FamilyStayCoeConditions } from "../src/lib/kazoku-tairyu-coe-checklist";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not found. Check .env.local");
}
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const VISA = "dependent";
const APP = "certification";

type Doc = {
  sortOrder: number;
  name: string;
  description: string;
  preparedBy: "申請人" | "扶養者" | "申請代理人";
  conditions: FamilyStayCoeConditions;
};

const DOCS: Doc[] = [
  // ══════════════════════════════════════════════════════════════════
  // 全案件共通
  // （在留資格認定証明書交付申請書そのものは申請代理人が作成・提出する申請書式であり、
  //   申請人・扶養者が準備する「必要書類（添付書類）」ではないため一覧に含めない）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 200,
    name: "写真（縦4cm×横3cm）",
    description: "申請前6か月以内に撮影したもの。無帽・無背景・鮮明なもの。",
    preparedBy: "申請人",
    conditions: { category: "共通" },
  },
  {
    sortOrder: 300,
    name: "返信用封筒",
    description: "定形封筒に宛先を記載し、簡易書留用の切手を貼付したもの",
    preparedBy: "申請代理人",
    conditions: { category: "共通" },
  },
  {
    sortOrder: 400,
    name: "扶養者の在留カード又は旅券の写し",
    description: "扶養者本人の在留カード（又は旅券）の写し",
    preparedBy: "扶養者",
    conditions: { category: "共通" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 身分関係書類（続柄に応じて選択した書類のみ表示）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 1000,
    name: "戸籍謄本",
    description: "申請人と扶養者の身分関係を証する戸籍謄本",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "family_register" } },
  },
  {
    sortOrder: 1010,
    name: "婚姻届受理証明書",
    description: "申請人と扶養者（配偶者）の婚姻届受理証明書",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "marriage_certificate_receipt" } },
  },
  {
    sortOrder: 1020,
    name: "結婚証明書の写し",
    description: "申請人と扶養者（配偶者）の結婚証明書の写し",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "marriage_certificate" } },
  },
  {
    sortOrder: 1030,
    name: "出生証明書の写し",
    description: "申請人（子）と扶養者の身分関係を証する出生証明書の写し",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "birth_certificate" } },
  },
  {
    sortOrder: 1040,
    name: "身分関係を証するその他の文書",
    description: "戸籍謄本等に準ずる、身分関係を証する文書",
    preparedBy: "扶養者",
    conditions: { category: "身分関係書類", when: { identityDocs: "equivalent_document" } },
  },

  // ══════════════════════════════════════════════════════════════════
  // 扶養者が収入を伴う活動をしている場合
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 2000,
    name: "在職証明書又は営業許可書の写し等",
    description: "扶養者の職業が分かる書類（在職証明書、営業許可書の写し等）",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため" },
  },
  {
    sortOrder: 2010,
    name: "住民税の課税（又は非課税）証明書（1通）",
    description: "1年間の総所得及び納税状況が分かるもの",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため" },
  },
  {
    sortOrder: 2020,
    name: "住民税の納税証明書（1通）",
    description: "1年間の総所得及び納税状況が分かるもの",
    preparedBy: "扶養者",
    conditions: { category: "収入を伴う活動", when: { supporterIncomeType: "income" }, reason: "扶養者が収入を伴う活動をしているため" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 扶養者が留学生など、上記以外の活動をしている場合（いずれかを選択）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 3000,
    name: "扶養者名義の預金残高証明書",
    description: "扶養者名義の預金残高証明書",
    preparedBy: "扶養者",
    conditions: {
      category: "収入を伴わない活動",
      when: { supporterIncomeType: "other", financialProofDocs: "bank_balance" },
      reason: "扶養者が留学等、収入を伴わない活動をしているため",
    },
  },
  {
    sortOrder: 3010,
    name: "奨学金給付証明書",
    description: "給付額及び給付期間が分かるもの",
    preparedBy: "扶養者",
    conditions: {
      category: "収入を伴わない活動",
      when: { supporterIncomeType: "other", financialProofDocs: "scholarship" },
      reason: "扶養者が留学等、収入を伴わない活動をしているため",
    },
  },
  {
    sortOrder: 3020,
    name: "生活費を支弁できることを示すその他の資料",
    description: "申請人の生活費を支弁できることを示す資料",
    preparedBy: "扶養者",
    conditions: {
      category: "収入を伴わない活動",
      when: { supporterIncomeType: "other", financialProofDocs: "other_financial" },
      reason: "扶養者が留学等、収入を伴わない活動をしているため",
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // 任意・推奨書類
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 9000,
    name: "申請人のパスポート写し",
    description: "在留資格認定証明書と旅券の氏名表記の確認に役立ちます",
    preparedBy: "申請人",
    conditions: {
      category: "任意・推奨",
      when: { attachApplicantPassportCopy: true },
      optional: true,
      reason: "在留資格認定証明書と旅券の氏名表記の確認に役立つため",
    },
  },
];

async function main() {
  console.log("=== 家族滞在（認定証明書交付申請）必要書類マスター投入 ===");
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
