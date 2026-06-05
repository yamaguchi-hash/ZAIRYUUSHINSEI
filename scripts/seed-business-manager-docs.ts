/**
 * 経営・管理（business_manager）在留期間更新許可申請（renewal）の
 * 必要書類マスターを投入するスクリプト
 *
 * 実行: npx tsx scripts/seed-business-manager-docs.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { documentRequirementMaster } from "../src/lib/db/schema";
import { eq, and } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not found. Check .env.local");
}
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const VISA = "business_manager";
const APP = "renewal";

// ── 書類定義 ────────────────────────────────────────────────────────────────────
// categories: 該当カテゴリー（1=カテゴリー1, 2=カテゴリー2, 3=カテゴリー3, 4=カテゴリー4）
// required: "always"=全カテゴリー必須, "conditional"=該当カテゴリーのみ, "optional"=任意
const DOCS: {
  sortOrder: number;
  name: string;
  nameEn: string;
  description: string;
  isAlwaysRequired: boolean;
  conditions: Record<string, any> | null;
}[] = [
  // ── 全カテゴリー共通（1・2・3・4） ─────────────────────────────────────
  {
    sortOrder: 10,
    name: "在留期間更新許可申請書",
    nameEn: "Application for Extension of Period of Stay",
    description: "カテゴリー1・2・3・4共通。システムで自動生成。",
    isAlwaysRequired: true,
    conditions: { categories: ["1","2","3","4"] },
  },
  {
    sortOrder: 20,
    name: "写真（縦4cm×横3cm）",
    nameEn: "Photograph (4cm x 3cm)",
    description: "申請前6か月以内に正面から撮影された無帽・無背景で鮮明なもの。写真の裏面に申請人の氏名を記載し、申請書の写真欄に貼付。カテゴリー1・2・3・4共通。",
    isAlwaysRequired: true,
    conditions: { categories: ["1","2","3","4"] },
  },
  {
    sortOrder: 30,
    name: "パスポート及び在留カード【提示】",
    nameEn: "Passport and Residence Card (presentation)",
    description: "原本を提示。カテゴリー1・2・3・4共通。",
    isAlwaysRequired: true,
    conditions: { categories: ["1","2","3","4"] },
  },
  {
    sortOrder: 40,
    name: "カテゴリーを証明する文書",
    nameEn: "Document proving the category of the organization",
    description: "所属機関がいずれのカテゴリーに該当するかを証明する文書。提出可能な書類がない場合はカテゴリー4に該当。\n【カテゴリー1】四季報の写し又は日本の証券取引所に上場していることを証明する文書(写し)／主務官庁から設立の許可を受けたことを証明する文書(写し)／イノベーション創出企業であることを証明する文書／JETRO対日投資支援企業認定文書／「一定の条件を満たす企業等」であることを証明する文書\n【カテゴリー2・3】前年分の職員の給与所得の源泉徴収票等の法定調書合計表(写し)",
    isAlwaysRequired: true,
    conditions: { categories: ["1","2","3","4"], note: "カテゴリーにより提出書類が異なる" },
  },

  // ── カテゴリー3・4 ─────────────────────────────────────────────────────
  {
    sortOrder: 50,
    name: "直近の年度の決算文書の写し",
    nameEn: "Copy of the most recent fiscal year's financial statements",
    description: "カテゴリー3・4のみ必要。直近の事業年度の貸借対照表・損益計算書等。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"] },
  },
  {
    sortOrder: 60,
    name: "法人の登記事項証明書の写し",
    nameEn: "Copy of certificate of registered matters of the corporation",
    description: "カテゴリー3・4のみ必要。当該事業を法人において行う場合に提出。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"] },
  },
  {
    sortOrder: 70,
    name: "所属機関の代表者に関する申告書（参考様式）",
    nameEn: "Declaration regarding the representative of the organization",
    description: "カテゴリー3・4で該当する場合に提出（△）。申請人が事業の管理に従事する場合に必要。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"], note: "申請人が事業の管理に従事する場合" },
  },
  {
    sortOrder: 80,
    name: "事業の許認可取得を証する資料",
    nameEn: "Documents proving acquisition of necessary business licenses",
    description: "カテゴリー3・4のみ必要。(1)申請に当たっての説明書(参考様式) (2)許認可の取得等をしていることを証する許可書等の写し。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"] },
  },

  // ── カテゴリー4のみ ────────────────────────────────────────────────────
  {
    sortOrder: 90,
    name: "外国法人の源泉徴収免除証明書等",
    nameEn: "Certificate of exemption from withholding tax for foreign corporation",
    description: "カテゴリー4のみ必要。外国法人の源泉徴収に対する免除証明書その他の源泉徴収を要しないことを明らかにする資料。",
    isAlwaysRequired: false,
    conditions: { categories: ["4"] },
  },

  // ── カテゴリー3・4 （続き）────────────────────────────────────────────
  {
    sortOrder: 100,
    name: "常勤職員の賃金支払文書及び住民票",
    nameEn: "Wage payment documents and residence certificates of full-time employees",
    description: "カテゴリー3・4のみ必要。常勤の職員が一人以上であることを明らかにする当該職員に係る賃金支払に関する文書及び住民票その他の資料。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"] },
  },
  {
    sortOrder: 110,
    name: "日本語能力を明らかにする資料",
    nameEn: "Documents proving Japanese language ability",
    description: "カテゴリー3・4のみ必要。(1)申請に当たっての説明書(参考様式) (2)日本語能力を有する者(申請人を除く)の住民票 (3)経営者又は常勤の職員が日本語能力を有していることを証する資料（試験合格証・成績証明書又は卒業証明書等） (4)日本語能力を有する者が常勤の職員(申請人を除く)である場合は当該職員に係る賃金支払に関する文書。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"] },
  },
  {
    sortOrder: 120,
    name: "事業の経営又は管理に関する活動内容説明書",
    nameEn: "Document explaining business management activities",
    description: "カテゴリー3・4のみ必要。直近の在留期間における事業の経営又は管理に関する活動内容を具体的に説明する文書（任意の様式）。前回の在留申請時から変更がある場合はその理由の説明を含む。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"] },
  },
  {
    sortOrder: 130,
    name: "住民税の課税（又は非課税）証明書及び納税証明書",
    nameEn: "Certificate of municipal tax assessment and tax payment",
    description: "カテゴリー3・4のみ必要。1年間の総所得及び納税状況が記載されたもの。1月1日現在お住まいの市区町村の区役所・市役所・役場から発行。総所得及び納税状況の両方が記載されていれば一方でも可。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"] },
  },
  {
    sortOrder: 140,
    name: "所属機関の公租公課の履行状況を明らかにする資料",
    nameEn: "Documents proving compliance with public duties and taxes of the organization",
    description: "カテゴリー3・4のみ必要。(1)申請に当たっての説明書(参考様式) (2)公租公課の履行を証する資料。\n【法人の場合】(ア)労働保険の加入・納付状況 (イ)社会保険の加入・納付状況 (ウ)源泉所得税・復興特別所得税・法人税・消費税・地方消費税の納税証明書 (エ)法人住民税(都道府県民税・市区町村民税)・法人事業税の納税証明書\n【個人の場合】(ア)労働保険の加入・納付状況 (イ)社会保険の加入・納付状況 (ウ)国民健康保険の加入・納付状況 (エ)源泉所得税・申告所得税・復興特別所得税・消費税・地方消費税・相続税・贈与税の納税証明書 (オ)個人住民税・個人事業税の納税証明書\n※社会保険への加入義務のない個人事業主の場合は強制適用事業所に該当しないことを説明する資料を提出。",
    isAlwaysRequired: false,
    conditions: { categories: ["3","4"], note: "法人・個人により提出書類が異なる" },
  },
];

async function main() {
  console.log("=== 経営・管理（更新）書類マスター投入 ===");

  // 既存の同一 visaType + applicationType のデータを確認
  const existing = await db
    .select({ id: documentRequirementMaster.id, documentName: documentRequirementMaster.documentName })
    .from(documentRequirementMaster)
    .where(
      and(
        eq(documentRequirementMaster.visaType, VISA),
        eq(documentRequirementMaster.applicationType, APP)
      )
    );

  if (existing.length > 0) {
    console.log(`既存データ ${existing.length} 件あり。削除して再投入します。`);
    console.log("削除:", existing.map(e => e.documentName).join(", "));
    await db
      .delete(documentRequirementMaster)
      .where(
        and(
          eq(documentRequirementMaster.visaType, VISA),
          eq(documentRequirementMaster.applicationType, APP)
        )
      );
    console.log("既存データを削除しました。");
  }

  // 投入
  for (const doc of DOCS) {
    await db.insert(documentRequirementMaster).values({
      visaType: VISA,
      applicationType: APP,
      documentName: doc.name,
      documentNameEn: doc.nameEn,
      description: doc.description,
      isAlwaysRequired: doc.isAlwaysRequired,
      conditions: doc.conditions,
      sortOrder: doc.sortOrder,
      isActive: true,
    });
    console.log(`  ✓ [${doc.sortOrder}] ${doc.name}`);
  }

  console.log(`\n合計 ${DOCS.length} 件を投入しました。`);
  console.log("  - 全カテゴリー共通（必須）: 4件");
  console.log("  - カテゴリー3・4: 9件");
  console.log("  - カテゴリー4のみ: 1件");
}

main().catch(console.error);
