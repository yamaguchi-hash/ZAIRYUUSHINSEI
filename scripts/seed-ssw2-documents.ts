/**
 * 特定技能２号 在留資格変更許可申請 — 必要書類マスター登録スクリプト
 * 令和８年４月１日改定版（第１表・第２表の1〜3・第３表の3 建設）
 *
 * 実行: npx tsx scripts/seed-ssw2-documents.ts
 */
import "dotenv/config";
import { db, documentRequirementMaster } from "../src/lib/db";
import { eq, and } from "drizzle-orm";

const VISA_TYPE = "specified_skilled_worker_2";
const APP_TYPE  = "change";

// カテゴリ定数
const CAT_1   = "第１表：申請人に関する必要書類（全申請共通）";
const CAT_2_1 = "第２表の１：所属機関書類（一定の実績がある機関）";
const CAT_2_2 = "第２表の２：所属機関書類（法人）";
const CAT_2_3 = "第２表の３：所属機関書類（個人事業主）";
const CAT_3_3 = "第３表の３：建設分野固有書類";

// ─────────────────────────────────────────────────────────────────────────────
// 書類定義
// isAlwaysRequired:
//   true  = ○（必須）→「必須書類を自動追加」ボタンで追加される
//   false = △（条件付き）→ セレクタで手動選択
//
// ※ 第２表・第３表は機関種別や分野による「どれか1つ」選択なので
//    isAlwaysRequired=false にして手動選択させる
// ─────────────────────────────────────────────────────────────────────────────
const documents = [

  // ══ 第１表：申請人に関する必要書類 ════════════════════════════════════════
  {
    documentName: "申請人名簿",
    description: "複数の外国人について同一の受入れ機関で受け入れ、同時に申請する場合のみ必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1 },
    sortOrder: 101,
  },
  {
    documentName: "提出書類一覧表（第１表・第２表・第３表）",
    description: "①第１表（表紙含む） ②第２表の１〜３のいずれか ③第３表の１〜１１のいずれかを含める",
    isAlwaysRequired: true,
    conditions: { category: CAT_1 },
    sortOrder: 102,
  },
  {
    documentName: "在留資格変更許可申請書（別記第30号様式）",
    description: "申請前６か月以内に正面から撮影した写真（縦４cm×横３cm）を貼付。写真裏面に申請人の氏名を記載",
    isAlwaysRequired: true,
    conditions: { category: CAT_1 },
    sortOrder: 103,
  },
  {
    documentName: "特定技能外国人の報酬に関する説明書（参考様式第1-4号）",
    description: "同一年度内に既に受け入れている機関または一定の実績があり適正な受入れが見込まれる機関については省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_1 },
    sortOrder: 104,
  },
  {
    documentName: "賃金規程の写し",
    description: "賃金規程に基づき報酬を決定した場合は必要。実績機関については省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_1 },
    sortOrder: 105,
  },
  {
    documentName: "特定技能雇用契約書の写し（参考様式第1-5号）",
    description: "申請人の署名及び申請人が十分に理解できる言語での記載が必要",
    isAlwaysRequired: true,
    conditions: { category: CAT_1 },
    sortOrder: 106,
  },
  {
    documentName: "雇用条件書の写し（参考様式第1-6号）",
    description: "申請人の署名及び申請人が十分に理解できる言語での記載が必要",
    isAlwaysRequired: true,
    conditions: { category: CAT_1 },
    sortOrder: 107,
  },
  {
    documentName: "賃金の支払の写し（参考様式第1-6号別紙）",
    description: "申請人が十分に理解できる言語での記載が必要",
    isAlwaysRequired: true,
    conditions: { category: CAT_1 },
    sortOrder: 108,
  },
  {
    documentName: "年間カレンダーの写し（申請人理解言語併記）",
    description: "１年単位の変形労働時間制を採用している場合のみ必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "変形労働時間制（１年単位）採用時のみ" },
    sortOrder: 109,
  },
  {
    documentName: "１年単位変形労働時間制に関する協定書の写し",
    description: "１年単位の変形労働時間制を採用している場合のみ必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "変形労働時間制（１年単位）採用時のみ" },
    sortOrder: 110,
  },
  {
    documentName: "雇用の経緯に係る説明書（参考様式第1-16号）",
    description: "申請人の署名及び申請人が理解できる言語での記載が必要。実績機関は省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "省略可：同一年度内受入れ実績機関" },
    sortOrder: 111,
  },
  {
    documentName: "職業紹介事業者の「人材サービス総合サイト」画面の印刷物",
    description: "雇用契約の成立をあっせんする者がいる場合は必要。実績機関は省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "職業紹介事業者経由の場合のみ" },
    sortOrder: 112,
  },
  {
    documentName: "健康診断個人票（参考様式第1-3号）",
    description: "参考様式の検診項目を全て網羅したものが必要。外国語の場合は日本語訳も必要",
    isAlwaysRequired: true,
    conditions: { category: CAT_1 },
    sortOrder: 113,
  },
  {
    documentName: "受診者の申告書（参考様式第1-3号別紙）",
    description: "健康診断受診後に作成",
    isAlwaysRequired: true,
    conditions: { category: CAT_1 },
    sortOrder: 114,
  },
  {
    documentName: "個人住民税の納税証明書（直近１年度分・全納期経過分）",
    description: "市区町村発行。過去１年以内の在留申請で提出済み（内容変更なし）の場合は省略可。納税緩和措置適用時は通知書の写しも必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, issuer: "市区町村", note: "過去１年以内提出済みなら省略可" },
    sortOrder: 115,
  },
  {
    documentName: "個人住民税の課税証明書（納税証明書と同一年度分）",
    description: "市区町村発行。過去１年以内の在留申請で提出済み（内容変更なし）の場合は省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, issuer: "市区町村", note: "過去１年以内提出済みなら省略可" },
    sortOrder: 116,
  },
  {
    documentName: "給与所得の源泉徴収票の写し（課税証明書と同一年分）",
    description: "過去１年以内の在留申請で提出済み（内容変更なし）の場合は省略可。複数の源泉徴収票がある場合、年末調整未実施なら確定申告の上、税務署発行の納税証明書（その３）も必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "過去１年以内提出済みなら省略可" },
    sortOrder: 117,
  },
  {
    documentName: "医療保険の資格情報の写し または 資格確認書の写し（マイナポータルからDL）",
    description: "申請時点で国民健康保険の被保険者である場合のみ必要。保険者番号・被保険者等記号・番号をマスキング（黒塗り）したものが必要。過去１年以内提出済みなら省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "国民健康保険被保険者のみ" },
    sortOrder: 118,
  },
  {
    documentName: "国民健康保険料（税）納付証明書（直近１年度分）",
    description: "市区町村発行。国民健康保険の被保険者の場合のみ必要。保険者番号等をマスキング要。過去１年以内提出済みなら省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, issuer: "市区町村", note: "国民健康保険被保険者のみ" },
    sortOrder: 119,
  },
  {
    documentName: "被保険者記録照会回答票（国民年金）",
    description: "日本年金機構または年金事務所発行。申請時点で国民年金の被保険者の場合のみ必要。24か月分の領収証書の写しを提出する場合は省略可。基礎年金番号をマスキング要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, issuer: "日本年金機構 または 年金事務所", note: "国民年金被保険者のみ" },
    sortOrder: 120,
  },
  {
    documentName: "被保険者記録照会（納付Ⅱ）または 国民年金保険料領収証書の写し（前々月まで24か月分）",
    description: "日本年金機構または年金事務所発行。国民年金の被保険者の場合のみ必要。基礎年金番号をマスキング要。2025年４月申請の場合は2023年３月〜2025年２月分が必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, issuer: "日本年金機構 または 年金事務所", note: "国民年金被保険者のみ" },
    sortOrder: 121,
  },
  {
    documentName: "前回申請時に履行すべきであった公的義務に係る書類",
    description: "前回申請時に公的義務（納税等）を履行できないとして誓約書を提出した場合のみ必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "前回申請時に誓約書を提出した場合のみ" },
    sortOrder: 122,
  },
  {
    documentName: "公的義務履行に関する誓約書（参考様式第1-26号）",
    description: "住民税・源泉徴収税・国民健康保険料・国民年金保険料のいずれかに滞納がある場合に必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "公的義務の滞納がある場合のみ" },
    sortOrder: 123,
  },
  {
    documentName: "技能移転に係る申告書（参考様式第1-10号）",
    description: "過去に技能実習の活動に従事していた場合は必要。申請人の署名及び理解できる言語での記載が必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "技能実習経験者のみ" },
    sortOrder: 124,
  },
  {
    documentName: "二国間取決に定められた遵守すべき手続に係る書類",
    description: "対象国籍：カンボジア、ベトナム（令和８年４月現在）。詳細は入管庁HP参照 https://www.moj.go.jp/isa/applications/ssw/nyuukokukanri05_00021.html",
    isAlwaysRequired: false,
    conditions: { category: CAT_1, note: "カンボジア・ベトナム国籍のみ" },
    sortOrder: 125,
  },

  // ══ 第２表の１：所属機関（一定の実績がある機関）══════════════════════════
  // ※ 第２表の１・２・３はいずれか1つを選択 → isAlwaysRequired=false
  {
    documentName: "【第２表の１】実績機関証明書類（上場企業証明 / イノベーション企業証明 / 法定調書合計表 / 所属機関概要書 のいずれか）",
    description: "①上場企業：四季報の写し等 ②イノベーション創出企業の証明文書 ③一定条件を満たす企業の認定証の写し等 ④法定調書合計表の写し（源泉徴収税額1,000万円以上） ⑤特定技能所属機関概要書（3年継続受入れ実績あり・参考様式第1-11-1号）。同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_1 },
    sortOrder: 201,
  },
  {
    documentName: "【第２表の１】書類省略に当たっての誓約書（参考様式第1-29号）",
    description: "第２表の１を適用する機関が提出する誓約書。同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_1 },
    sortOrder: 202,
  },

  // ══ 第２表の２：所属機関（法人）══════════════════════════════════════════
  {
    documentName: "【第２表の２】特定技能所属機関概要書（参考様式第1-11-1号）",
    description: "同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_2 },
    sortOrder: 211,
  },
  {
    documentName: "【第２表の２】登記事項証明書",
    description: "法務局発行。同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_2, issuer: "法務局" },
    sortOrder: 212,
  },
  {
    documentName: "【第２表の２】業務執行に関与する役員の住民票の写し",
    description: "市区町村発行。マイナンバーの記載がなく、本籍地の記載があるものが必要。同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_2, issuer: "市区町村" },
    sortOrder: 213,
  },
  {
    documentName: "【第２表の２】特定技能所属機関の役員に関する誓約書（参考様式第1-23号）",
    description: "特定技能外国人の受入れに関する業務執行に関与しない役員がいる場合のみ必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_2, note: "受入れ非関与の役員がいる場合のみ" },
    sortOrder: 214,
  },
  {
    documentName: "【第２表の２】労働保険料等納付証明書（未納なし証明）",
    description: "労働局発行。納付や換価の猶予を受けている場合は、猶予許可通知書の写しも必要。同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_2, issuer: "労働局" },
    sortOrder: 215,
  },
  {
    documentName: "【第２表の２】社会保険料納入状況回答票 または 健康保険・厚生年金保険料領収証書の写し（前々月まで24か月分）",
    description: "日本年金機構または年金事務所発行。2025年４月申請の場合は2023年３月〜2025年２月分が必要。猶予を受けている場合は猶予許可通知書の写しも必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_2, issuer: "日本年金機構 または 年金事務所" },
    sortOrder: 216,
  },
  {
    documentName: "【第２表の２】納税証明書（その３）",
    description: "税務署発行。対象税目：①源泉所得税及び復興特別所得税 ②法人税 ③消費税及び地方消費税。納税猶予・納付受託の適用を受けている場合は関連書類も必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_2, issuer: "税務署" },
    sortOrder: 217,
  },
  {
    documentName: "【第２表の２】法人住民税の納税証明書（直近２年度分）",
    description: "市区町村発行。納税緩和措置適用時は通知書の写しも必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_2, issuer: "市区町村" },
    sortOrder: 218,
  },

  // ══ 第２表の３：所属機関（個人事業主）══════════════════════════════════
  {
    documentName: "【第２表の３】特定技能所属機関概要書（参考様式第1-11-1号）",
    description: "同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_3 },
    sortOrder: 221,
  },
  {
    documentName: "【第２表の３】個人事業主の住民票の写し",
    description: "市区町村発行。マイナンバーの記載がなく、本籍地の記載があるものが必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_3, issuer: "市区町村" },
    sortOrder: 222,
  },
  {
    documentName: "【第２表の３】労働保険料等納付証明書（未納なし証明）または 労災保険に代わる民間保険の加入証明",
    description: "①労働保険適用事業所：労働局発行の納付証明書（猶予を受けている場合は猶予許可通知書の写しも必要） ②非適用事業所：民間保険の加入を証明する資料",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_3, issuer: "労働局（適用事業所の場合）" },
    sortOrder: 223,
  },
  {
    documentName: "【第２表の３】健康保険・年金・国民健康保険・国民年金関係書類（適用区分に応じた書類）",
    description: "①健康保険・厚生年金適用事業所：社会保険料納入状況回答票等（日本年金機構/年金事務所） ②非適用事業所：医療保険資格情報の写し＋国民健康保険料納付証明書（直近２年度）＋国民年金被保険者記録照会（納付Ⅱ）等。基礎年金番号・保険者番号をマスキング要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_3, issuer: "日本年金機構 / 年金事務所 / 市区町村" },
    sortOrder: 224,
  },
  {
    documentName: "【第２表の３】個人事業主の納税証明書（その３）",
    description: "税務署発行。対象税目：①源泉所得税及び復興特別所得税 ②申告所得税及び復興特別所得税 ③消費税及び地方消費税 ④相続税 ⑤贈与税",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_3, issuer: "税務署" },
    sortOrder: 225,
  },
  {
    documentName: "【第２表の３】個人事業主の個人住民税の納税証明書（直近２年度分）",
    description: "市区町村発行。納税緩和措置適用時は通知書の写しも必要",
    isAlwaysRequired: false,
    conditions: { category: CAT_2_3, issuer: "市区町村" },
    sortOrder: 226,
  },

  // ══ 第３表の３：建設分野固有書類 ══════════════════════════════════════════
  {
    documentName: "【建設】建設分野特定技能２号評価試験の合格証明書の写し または 技能検定１級の合格証明書の写し",
    description: "対象業務区分は「建設分野の基準について」の別表を参照。過去の申請で提出済み（有効期限内）の場合は省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_3_3, note: "過去申請提出済み（有効期限内）なら省略可" },
    sortOrder: 301,
  },
  {
    documentName: "【建設】２号特定技能外国人に求められる実務経験に係る申告書（分野参考様式第6-3号）",
    description: "①CCUSに対応職種がある場合：申告書またはCCUSレベル３能力評価結果通知書の写し ＋ CCUS技能者情報表示画面の写し ②CCUSに対応職種がない場合：申告書 ＋ CCUS技能者情報表示画面の写し ③CCUS就業履歴未蓄積の場合：申告書 ＋ 経歴証明書（第6-3号別紙）。過去申請提出済みなら省略可",
    isAlwaysRequired: false,
    conditions: { category: CAT_3_3 },
    sortOrder: 302,
  },
  {
    documentName: "【建設】建設分野における特定技能外国人の受入れに関する誓約書（分野参考様式第6-1号）",
    description: "建設分野固有の誓約書（必須）",
    isAlwaysRequired: false,
    conditions: { category: CAT_3_3 },
    sortOrder: 303,
  },
  {
    documentName: "【建設】２号特定技能外国人特定技能雇用契約の相手方となる本邦の公私の機関に関する誓約書（分野参考様式第6-2号）",
    description: "建設分野固有の誓約書（必須）",
    isAlwaysRequired: false,
    conditions: { category: CAT_3_3 },
    sortOrder: 304,
  },
  {
    documentName: "【建設】建設業法第３条第１項の許可を受けていることを証する書類",
    description: "建設業許可証の写し等（必須）",
    isAlwaysRequired: false,
    conditions: { category: CAT_3_3 },
    sortOrder: 305,
  },
  {
    documentName: "【建設】建設キャリアアップシステム申請番号または事業者IDを明らかにする書類",
    description: "登録後に送付されるハガキ又はメールの写しなど（必須）",
    isAlwaysRequired: false,
    conditions: { category: CAT_3_3 },
    sortOrder: 306,
  },
  {
    documentName: "【建設】JACの会員証の写し または JACに入会している建設業者団体の会員証の写し",
    description: "一般社団法人建設技能人材機構（JAC）または傘下の建設業者団体の会員証（必須）",
    isAlwaysRequired: false,
    conditions: { category: CAT_3_3, issuer: "JAC または 建設業者団体" },
    sortOrder: 307,
  },
];

async function main() {
  console.log(`特定技能２号 変更申請 — 書類マスター登録開始（${documents.length}件）`);

  // 既存データを削除（重複防止）
  const deleted = await db
    .delete(documentRequirementMaster)
    .where(
      and(
        eq(documentRequirementMaster.visaType, VISA_TYPE),
        eq(documentRequirementMaster.applicationType, APP_TYPE)
      )
    )
    .returning({ id: documentRequirementMaster.id });
  if (deleted.length > 0) {
    console.log(`  既存データ ${deleted.length} 件を削除`);
  }

  // 新規登録
  const inserted = await db
    .insert(documentRequirementMaster)
    .values(
      documents.map((d) => ({
        visaType: VISA_TYPE,
        applicationType: APP_TYPE,
        documentName: d.documentName,
        description: d.description,
        isAlwaysRequired: d.isAlwaysRequired,
        conditions: d.conditions as any,
        sortOrder: d.sortOrder,
        isActive: true,
      }))
    )
    .returning({ id: documentRequirementMaster.id });

  console.log(`  登録完了: ${inserted.length} 件`);
  console.log("\nカテゴリ別内訳:");
  console.log(`  ${CAT_1}: ${documents.filter(d => (d.conditions as any).category === CAT_1).length}件`);
  console.log(`  ${CAT_2_1}: ${documents.filter(d => (d.conditions as any).category === CAT_2_1).length}件`);
  console.log(`  ${CAT_2_2}: ${documents.filter(d => (d.conditions as any).category === CAT_2_2).length}件`);
  console.log(`  ${CAT_2_3}: ${documents.filter(d => (d.conditions as any).category === CAT_2_3).length}件`);
  console.log(`  ${CAT_3_3}: ${documents.filter(d => (d.conditions as any).category === CAT_3_3).length}件`);

  const required = documents.filter(d => d.isAlwaysRequired);
  console.log(`\n  必須（○）: ${required.length}件 → 「必須書類を自動追加」で追加されます`);
  console.log(`  条件付（△）: ${documents.length - required.length}件 → セレクタから手動選択`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
