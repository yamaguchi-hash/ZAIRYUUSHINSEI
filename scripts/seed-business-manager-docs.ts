/**
 * 経営・管理（business_manager）在留期間更新許可申請（renewal）の
 * 必要書類マスターを投入するスクリプト
 *
 * - 全て isAlwaysRequired: false（選択式）
 * - カテゴリー証明文書は個別に選択可能
 * - (1)(2)(3)等の小項目も個別に選択可能
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

type Doc = {
  sortOrder: number;
  name: string;
  nameEn: string;
  description: string;
  conditions: Record<string, any> | null;
};

const DOCS: Doc[] = [
  // ══════════════════════════════════════════════════════════════════
  // 1. 在留期間更新許可申請書（全カテゴリー）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 100,
    name: "在留期間更新許可申請書",
    nameEn: "Application for Extension of Period of Stay",
    description: "カテゴリー1・2・3・4共通",
    conditions: { categories: ["1","2","3","4"] },
  },

  // ══════════════════════════════════════════════════════════════════
  // 2. 写真（全カテゴリー）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 200,
    name: "写真（縦4cm×横3cm）",
    nameEn: "Photograph (4cm x 3cm)",
    description: "申請前6か月以内に正面から撮影された無帽・無背景で鮮明なもの。写真の裏面に申請人の氏名を記載し、申請書の写真欄に貼付。カテゴリー1・2・3・4共通。",
    conditions: { categories: ["1","2","3","4"] },
  },

  // ══════════════════════════════════════════════════════════════════
  // 3. パスポート及び在留カード（全カテゴリー）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 300,
    name: "パスポート（写し）",
    nameEn: "Passport (copy)",
    description: "カテゴリー1・2・3・4共通。原本を提示し、写しを提出。",
    conditions: { categories: ["1","2","3","4"] },
  },
  {
    sortOrder: 310,
    name: "在留カード（写し）",
    nameEn: "Residence Card (copy)",
    description: "カテゴリー1・2・3・4共通。原本を提示し、写しを提出。",
    conditions: { categories: ["1","2","3","4"] },
  },

  // ══════════════════════════════════════════════════════════════════
  // 4. カテゴリーを証明する文書（個別選択）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 410,
    name: "四季報の写し又は証券取引所上場証明文書",
    nameEn: "Copy of Shikiho or proof of stock exchange listing",
    description: "カテゴリー1。四季報の写し又は日本の証券取引所に上場していることを証明する文書（写し）。",
    conditions: { categories: ["1"], parentNo: 4 },
  },
  {
    sortOrder: 420,
    name: "主務官庁からの設立許可証明文書（写し）",
    nameEn: "Proof of establishment approval from competent ministry",
    description: "カテゴリー1。主務官庁から設立の許可を受けたことを証明する文書（写し）。",
    conditions: { categories: ["1"], parentNo: 4 },
  },
  {
    sortOrder: 430,
    name: "イノベーション創出企業であることの証明文書",
    nameEn: "Proof of innovation-creating enterprise",
    description: "カテゴリー1。高度専門職省令第1条第1項各号の表の特別加算の項の中欄イ又はロの対象企業であることを証明する文書（例：補助金交付決定通知書の写し）。",
    conditions: { categories: ["1"], parentNo: 4 },
  },
  {
    sortOrder: 440,
    name: "JETRO対日投資支援企業認定文書",
    nameEn: "JETRO certified inward investment support enterprise document",
    description: "カテゴリー1。独立行政法人日本貿易振興機構（JETRO）により対日投資支援企業として認定された企業であることを証明する文書（コワーキングスペースを事業所としている企業を除く）。",
    conditions: { categories: ["1"], parentNo: 4 },
  },
  {
    sortOrder: 450,
    name: "「一定の条件を満たす企業等」の証明文書",
    nameEn: "Proof of enterprise meeting certain conditions",
    description: "カテゴリー1。「一定の条件を満たす企業等」であることを証明する文書（例：認定証等の写し）。",
    conditions: { categories: ["1"], parentNo: 4 },
  },
  {
    sortOrder: 460,
    name: "前年分の職員の給与所得の源泉徴収票等の法定調書合計表（写し）",
    nameEn: "Copy of withholding tax statement summary",
    description: "カテゴリー2・3。前年分の職員の給与所得の源泉徴収票等の法定調書合計表（写し）。",
    conditions: { categories: ["2","3"], parentNo: 4 },
  },

  // ══════════════════════════════════════════════════════════════════
  // 5. 直近の年度の決算文書（カテゴリー3・4）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 500,
    name: "直近の年度の決算文書の写し",
    nameEn: "Copy of financial statements for the most recent fiscal year",
    description: "カテゴリー3・4。直近の事業年度の貸借対照表・損益計算書等。",
    conditions: { categories: ["3","4"] },
  },

  // ══════════════════════════════════════════════════════════════════
  // 6. 法人の登記事項証明書（カテゴリー3・4）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 600,
    name: "法人の登記事項証明書の写し",
    nameEn: "Copy of certificate of registered matters",
    description: "カテゴリー3・4。当該事業を法人において行う場合に提出。",
    conditions: { categories: ["3","4"] },
  },

  // ══════════════════════════════════════════════════════════════════
  // 7. 代表者に関する申告書（カテゴリー3・4、該当する場合）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 700,
    name: "所属機関の代表者に関する申告書（参考様式）",
    nameEn: "Declaration regarding the representative of the organization",
    description: "カテゴリー3・4（△）。申請人が事業の管理に従事する場合に必要。",
    conditions: { categories: ["3","4"], note: "申請人が事業の管理に従事する場合" },
  },

  // ══════════════════════════════════════════════════════════════════
  // 8. 事業の許認可取得資料（カテゴリー3・4）— 小項目分割
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 810,
    name: "事業許認可 (1) 申請に当たっての説明書（参考様式）",
    nameEn: "Business license (1) Explanatory document",
    description: "カテゴリー3・4。事業を営むために必要な許認可の取得等をしていることを証する資料。",
    conditions: { categories: ["3","4"], parentNo: 8 },
  },
  {
    sortOrder: 820,
    name: "事業許認可 (2) 許可書等の写し",
    nameEn: "Business license (2) Copy of permit",
    description: "カテゴリー3・4。許認可の取得等をしていることを証する許可書等の写し。",
    conditions: { categories: ["3","4"], parentNo: 8 },
  },

  // ══════════════════════════════════════════════════════════════════
  // 9. 外国法人の源泉徴収免除証明書（カテゴリー4のみ）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 900,
    name: "外国法人の源泉徴収免除証明書等",
    nameEn: "Certificate of exemption from withholding tax",
    description: "カテゴリー4のみ。外国法人の源泉徴収に対する免除証明書その他の源泉徴収を要しないことを明らかにする資料。",
    conditions: { categories: ["4"] },
  },

  // ══════════════════════════════════════════════════════════════════
  // 10. 常勤職員の賃金支払文書（カテゴリー3・4）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 1000,
    name: "常勤職員に係る賃金支払に関する文書",
    nameEn: "Wage payment documents of full-time employees",
    description: "カテゴリー3・4。常勤の職員が一人以上であることを明らかにする当該職員に係る賃金支払に関する文書。",
    conditions: { categories: ["3","4"], parentNo: 10 },
  },
  {
    sortOrder: 1010,
    name: "常勤職員の住民票",
    nameEn: "Residence certificate of full-time employees",
    description: "カテゴリー3・4。常勤の職員が一人以上であることを明らかにする住民票その他の資料。",
    conditions: { categories: ["3","4"], parentNo: 10 },
  },

  // ══════════════════════════════════════════════════════════════════
  // 11. 日本語能力を明らかにする資料（カテゴリー3・4）— 小項目分割
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 1110,
    name: "日本語能力 (1) 申請に当たっての説明書（参考様式）",
    nameEn: "Japanese ability (1) Explanatory document",
    description: "カテゴリー3・4。日本語能力を明らかにする資料のうち説明書。",
    conditions: { categories: ["3","4"], parentNo: 11 },
  },
  {
    sortOrder: 1120,
    name: "日本語能力 (2) 日本語能力を有する者の住民票",
    nameEn: "Japanese ability (2) Residence certificate",
    description: "カテゴリー3・4。日本語能力を有する者（申請人を除く）の住民票。",
    conditions: { categories: ["3","4"], parentNo: 11 },
  },
  {
    sortOrder: 1130,
    name: "日本語能力 (3) 日本語能力を証する資料（試験合格証・成績証明書等）",
    nameEn: "Japanese ability (3) Proof of Japanese ability (test certificate etc.)",
    description: "カテゴリー3・4。経営者又は常勤の職員が日本語能力を有していることを証する資料。ア：試験の合格証・成績証明書、イ：その他の方法（卒業証明書等）。",
    conditions: { categories: ["3","4"], parentNo: 11 },
  },
  {
    sortOrder: 1140,
    name: "日本語能力 (4) 日本語能力を有する常勤職員の賃金支払文書",
    nameEn: "Japanese ability (4) Wage payment document of employee with Japanese ability",
    description: "カテゴリー3・4。日本語能力を有する者が常勤の職員（申請人を除く）である場合に提出。当該職員に係る賃金支払に関する文書。",
    conditions: { categories: ["3","4"], parentNo: 11 },
  },

  // ══════════════════════════════════════════════════════════════════
  // 12. 事業活動内容説明書（カテゴリー3・4）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 1200,
    name: "事業の経営又は管理に関する活動内容説明書",
    nameEn: "Document explaining business management activities",
    description: "カテゴリー3・4。直近の在留期間における事業の経営又は管理に関する活動内容を具体的に説明する文書（任意の様式）。前回の在留申請時から変更がある場合はその理由の説明を含む。",
    conditions: { categories: ["3","4"] },
  },

  // ══════════════════════════════════════════════════════════════════
  // 13. 住民税証明書（カテゴリー3・4）
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 1310,
    name: "住民税の課税（又は非課税）証明書",
    nameEn: "Certificate of municipal tax assessment (or non-taxation)",
    description: "カテゴリー3・4。1年間の総所得が記載されたもの。1月1日現在お住まいの市区町村から発行。",
    conditions: { categories: ["3","4"], parentNo: 13 },
  },
  {
    sortOrder: 1320,
    name: "住民税の納税証明書",
    nameEn: "Certificate of municipal tax payment",
    description: "カテゴリー3・4。1年間の納税状況が記載されたもの。課税証明書に納税状況も記載されていれば一方でも可。",
    conditions: { categories: ["3","4"], parentNo: 13 },
  },

  // ══════════════════════════════════════════════════════════════════
  // 14. 公租公課の履行状況資料（カテゴリー3・4）— 小項目分割
  // ══════════════════════════════════════════════════════════════════
  {
    sortOrder: 1410,
    name: "公租公課 (1) 申請に当たっての説明書（参考様式）",
    nameEn: "Tax compliance (1) Explanatory document",
    description: "カテゴリー3・4。所属機関における公租公課の履行状況を明らかにするための説明書。",
    conditions: { categories: ["3","4"], parentNo: 14 },
  },
  {
    sortOrder: 1421,
    name: "公租公課【法人】(ア) 労働保険の加入・納付状況を証する文書",
    nameEn: "Tax compliance [Corp] (a) Labor insurance enrollment/payment",
    description: "カテゴリー3・4。所属機関が法人である場合に提出。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "法人" },
  },
  {
    sortOrder: 1422,
    name: "公租公課【法人】(イ) 社会保険の加入・納付状況を証する文書",
    nameEn: "Tax compliance [Corp] (b) Social insurance enrollment/payment",
    description: "カテゴリー3・4。所属機関が法人である場合に提出。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "法人" },
  },
  {
    sortOrder: 1423,
    name: "公租公課【法人】(ウ) 源泉所得税・法人税・消費税等の納税証明書",
    nameEn: "Tax compliance [Corp] (c) Tax payment certificate (income/corporate/consumption)",
    description: "カテゴリー3・4。源泉所得税及び復興特別所得税、法人税、消費税及び地方消費税に関する納税証明書。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "法人" },
  },
  {
    sortOrder: 1424,
    name: "公租公課【法人】(エ) 法人住民税・法人事業税の納税証明書",
    nameEn: "Tax compliance [Corp] (d) Corporate resident tax/business tax certificate",
    description: "カテゴリー3・4。法人住民税（都道府県民税及び市区町村民税）及び法人事業税に関する納税証明書。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "法人" },
  },
  {
    sortOrder: 1431,
    name: "公租公課【個人】(ア) 労働保険の加入・納付状況を証する文書",
    nameEn: "Tax compliance [Individual] (a) Labor insurance enrollment/payment",
    description: "カテゴリー3・4。所属機関が個人である場合に提出。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "個人" },
  },
  {
    sortOrder: 1432,
    name: "公租公課【個人】(イ) 社会保険の加入・納付状況を証する文書",
    nameEn: "Tax compliance [Individual] (b) Social insurance enrollment/payment",
    description: "カテゴリー3・4。所属機関が個人である場合に提出。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "個人" },
  },
  {
    sortOrder: 1433,
    name: "公租公課【個人】(ウ) 国民健康保険の加入・納付状況を証する文書",
    nameEn: "Tax compliance [Individual] (c) National health insurance enrollment/payment",
    description: "カテゴリー3・4。所属機関が個人である場合に提出。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "個人" },
  },
  {
    sortOrder: 1434,
    name: "公租公課【個人】(エ) 源泉所得税・申告所得税・消費税等の納税証明書",
    nameEn: "Tax compliance [Individual] (d) Tax payment certificate",
    description: "カテゴリー3・4。源泉所得税及び復興特別所得税、申告所得税及び復興特別所得税、消費税及び地方消費税、相続税、贈与税に関する納税証明書。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "個人" },
  },
  {
    sortOrder: 1435,
    name: "公租公課【個人】(オ) 個人住民税・個人事業税の納税証明書",
    nameEn: "Tax compliance [Individual] (e) Individual resident tax/business tax certificate",
    description: "カテゴリー3・4。個人住民税（都道府県民税及び市区町村民税）及び個人事業税に関する納税証明書。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "個人" },
  },
  {
    sortOrder: 1436,
    name: "公租公課【個人】社会保険の強制適用事業所に該当しないことの説明資料",
    nameEn: "Tax compliance [Individual] Explanation of non-applicability of mandatory social insurance",
    description: "カテゴリー3・4。社会保険への加入義務のない個人事業主の場合に提出。社会保険の強制適用事業所に該当しないことを説明する資料。",
    conditions: { categories: ["3","4"], parentNo: 14, orgType: "個人", note: "加入義務のない個人事業主の場合" },
  },
];

async function main() {
  console.log("=== 経営・管理（更新）書類マスター投入 ===");
  console.log(`visaType: ${VISA}, applicationType: ${APP}`);
  console.log(`投入件数: ${DOCS.length} 件\n`);

  // 既存データ削除
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

  // 全て isAlwaysRequired: false（選択式）で投入
  for (const doc of DOCS) {
    await db.insert(documentRequirementMaster).values({
      visaType: VISA,
      applicationType: APP,
      documentName: doc.name,
      documentNameEn: doc.nameEn,
      description: doc.description,
      isAlwaysRequired: false,
      conditions: doc.conditions,
      sortOrder: doc.sortOrder,
      isActive: true,
    });
    console.log(`  ✓ [${doc.sortOrder}] ${doc.name}`);
  }

  console.log(`\n合計 ${DOCS.length} 件を投入しました（全て選択式）。`);
}

main().catch(console.error);
