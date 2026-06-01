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

// ── 書類定義 ─────────────────────────────────────────────────────────────────
// isAlwaysRequired: ○=true, △=false（条件付き）
// conditions: 提出条件の説明
// ─────────────────────────────────────────────────────────────────────────────
const documents = [

  // ══ 第１表：申請人に関する必要書類（全申請共通）═══════════════════════════
  {
    documentName: "【第１表-1】申請人名簿",
    description: "複数の外国人について同一の受入れ機関で受け入れ、同時に申請する場合は必要",
    isAlwaysRequired: false,
    conditions: { note: "同時複数申請の場合のみ必要" },
    sortOrder: 101,
  },
  {
    documentName: "【第１表-2】提出書類一覧表（第１表・第２表・第３表）",
    description: "第１表（表紙含む）、第２表の１〜３のいずれか、第３表の１〜１１のいずれか",
    isAlwaysRequired: true,
    conditions: null,
    sortOrder: 102,
  },
  {
    documentName: "【第１表-3】在留資格変更許可申請書（別記第30号様式）",
    description: "申請前６か月以内に正面から撮影した写真（縦４cm×横３cm）を貼付。裏面に氏名記載",
    isAlwaysRequired: true,
    conditions: null,
    sortOrder: 103,
  },
  {
    documentName: "【第１表-4-1】特定技能外国人の報酬に関する説明書（参考様式第1-4号）",
    description: "同一年度内に既に受け入れている機関や一定の実績がある機関は省略可",
    isAlwaysRequired: false,
    conditions: { note: "省略可：同一年度内受入れ実績機関" },
    sortOrder: 104,
  },
  {
    documentName: "【第１表-4-2】賃金規程の写し",
    description: "賃金規程に基づき報酬を決定した場合は必要。実績機関は省略可",
    isAlwaysRequired: false,
    conditions: { note: "賃金規程に基づく場合のみ必要" },
    sortOrder: 105,
  },
  {
    documentName: "【第１表-5】特定技能雇用契約書の写し（参考様式第1-5号）",
    description: "申請人の署名及び申請人が十分に理解できる言語での記載が必要",
    isAlwaysRequired: true,
    conditions: null,
    sortOrder: 106,
  },
  {
    documentName: "【第１表-6-1】雇用条件書の写し（参考様式第1-6号）",
    description: "申請人の署名及び申請人が十分に理解できる言語での記載が必要",
    isAlwaysRequired: true,
    conditions: null,
    sortOrder: 107,
  },
  {
    documentName: "【第１表-6-2】賃金の支払の写し（参考様式第1-6号別紙）",
    description: "申請人が十分に理解できる言語での記載が必要",
    isAlwaysRequired: true,
    conditions: null,
    sortOrder: 108,
  },
  {
    documentName: "【第１表-6-3】年間カレンダーの写し（申請人理解言語併記）",
    description: "１年単位の変形労働時間制を採用している場合のみ必要",
    isAlwaysRequired: false,
    conditions: { note: "変形労働時間制（１年単位）採用時のみ" },
    sortOrder: 109,
  },
  {
    documentName: "【第１表-6-4】１年単位変形労働時間制に関する協定書の写し",
    description: "１年単位の変形労働時間制を採用している場合のみ必要",
    isAlwaysRequired: false,
    conditions: { note: "変形労働時間制（１年単位）採用時のみ" },
    sortOrder: 110,
  },
  {
    documentName: "【第１表-7-1】雇用の経緯に係る説明書（参考様式第1-16号）",
    description: "申請人の署名及び申請人が理解できる言語での記載が必要。実績機関は省略可",
    isAlwaysRequired: false,
    conditions: { note: "省略可：同一年度内受入れ実績機関" },
    sortOrder: 111,
  },
  {
    documentName: "【第１表-7-2】職業紹介事業者の「人材サービス総合サイト」画面の印刷物",
    description: "雇用契約の成立をあっせんする者がいる場合は必要。実績機関は省略可",
    isAlwaysRequired: false,
    conditions: { note: "職業紹介事業者経由の場合のみ" },
    sortOrder: 112,
  },
  {
    documentName: "【第１表-8-1】健康診断個人票（参考様式第1-3号）",
    description: "参考様式の検診項目を全て網羅したもの。外国語の場合は日本語訳も必要",
    isAlwaysRequired: true,
    conditions: null,
    sortOrder: 113,
  },
  {
    documentName: "【第１表-8-2】受診者の申告書（参考様式第1-3号別紙）",
    description: "健康診断受診後に作成",
    isAlwaysRequired: true,
    conditions: null,
    sortOrder: 114,
  },
  {
    documentName: "【第１表-9】個人住民税の納税証明書（直近１年度分・全納期経過分）",
    description: "過去１年以内の在留申請で提出済み（内容変更なし）の場合は省略可。納税緩和措置適用時は通知書の写しも必要",
    isAlwaysRequired: false,
    conditions: {
      issuer: "市区町村",
      note: "過去１年以内提出済みなら省略可",
    },
    sortOrder: 115,
  },
  {
    documentName: "【第１表-10】個人住民税の課税証明書（納税証明書と同一年度分）",
    description: "過去１年以内の在留申請で提出済み（内容変更なし）の場合は省略可",
    isAlwaysRequired: false,
    conditions: {
      issuer: "市区町村",
      note: "過去１年以内提出済みなら省略可",
    },
    sortOrder: 116,
  },
  {
    documentName: "【第１表-11】給与所得の源泉徴収票の写し（課税証明書と同一年分）",
    description: "過去１年以内の在留申請で提出済み（内容変更なし）の場合は省略可。複数の源泉徴収票がある場合、年末調整未実施なら確定申告の上、納税証明書（その３）も必要",
    isAlwaysRequired: false,
    conditions: { note: "過去１年以内提出済みなら省略可" },
    sortOrder: 117,
  },
  {
    documentName: "【第１表-12】医療保険の資格情報の写し または 資格確認書の写し（マイナポータルからDL）",
    description: "申請時点で国民健康保険の被保険者の場合のみ必要。保険者番号・被保険者等記号・番号をマスキング要",
    isAlwaysRequired: false,
    conditions: { note: "国民健康保険被保険者のみ" },
    sortOrder: 118,
  },
  {
    documentName: "【第１表-13】国民健康保険料（税）納付証明書（直近１年度分）",
    description: "国民健康保険の被保険者の場合のみ必要。保険者番号等をマスキング要",
    isAlwaysRequired: false,
    conditions: {
      issuer: "市区町村",
      note: "国民健康保険被保険者のみ",
    },
    sortOrder: 119,
  },
  {
    documentName: "【第１表-14】被保険者記録照会回答票（国民年金）",
    description: "申請時点で国民年金の被保険者の場合のみ必要。24か月分の領収証書の写しを提出する場合は省略可。基礎年金番号をマスキング要",
    isAlwaysRequired: false,
    conditions: {
      issuer: "日本年金機構 または 年金事務所",
      note: "国民年金被保険者のみ",
    },
    sortOrder: 120,
  },
  {
    documentName: "【第１表-15】被保険者記録照会（納付Ⅱ）または 国民年金保険料領収証書の写し（前々月まで24か月分）",
    description: "国民年金の被保険者の場合のみ必要。基礎年金番号をマスキング要",
    isAlwaysRequired: false,
    conditions: {
      issuer: "日本年金機構 または 年金事務所",
      note: "国民年金被保険者のみ",
    },
    sortOrder: 121,
  },
  {
    documentName: "【第１表-16】前回申請時に履行すべき公的義務に係る書類",
    description: "前回申請時に公的義務（納税等）を誓約した場合のみ必要",
    isAlwaysRequired: false,
    conditions: { note: "前回申請時に誓約書を提出した場合のみ" },
    sortOrder: 122,
  },
  {
    documentName: "【第１表-17】公的義務履行に関する誓約書（参考様式第1-26号）",
    description: "住民税・源泉徴収税・国民健康保険料・国民年金保険料のいずれかに滞納がある場合に必要",
    isAlwaysRequired: false,
    conditions: { note: "公的義務の滞納がある場合のみ" },
    sortOrder: 123,
  },
  {
    documentName: "【第１表-18】技能移転に係る申告書（参考様式第1-10号）",
    description: "過去に技能実習の活動に従事していた場合は必要。申請人の署名及び理解できる言語での記載が必要",
    isAlwaysRequired: false,
    conditions: { note: "技能実習経験者のみ" },
    sortOrder: 124,
  },
  {
    documentName: "【第１表-19】二国間取決に関する手続書類",
    description: "カンボジア・ベトナム国籍の場合に必要（令和８年４月現在）",
    isAlwaysRequired: false,
    conditions: { note: "カンボジア・ベトナム国籍のみ" },
    sortOrder: 125,
  },

  // ══ 第２表の１：所属機関（一定の実績ある機関）══════════════════════════════
  {
    documentName: "【第２表の1-1】実績機関の証明書類（上場企業証明 / イノベーション企業証明 / 法定調書合計表 / 所属機関概要書 のいずれか）",
    description: "①上場企業：四季報の写し等 ②イノベーション創出企業の証明文書 ③認定証の写し等 ④法定調書合計表の写し（源泉徴収税額1,000万円以上）⑤特定技能所属機関概要書（３年継続受入れ実績あり）",
    isAlwaysRequired: true,
    conditions: {
      tableApplicable: "第２表の１",
      note: "以下⑤つのいずれか1つを提出",
    },
    sortOrder: 201,
  },
  {
    documentName: "【第２表の1-2】書類省略に当たっての誓約書（参考様式第1-29号）",
    description: "第２表の１を適用する場合に必要",
    isAlwaysRequired: true,
    conditions: { tableApplicable: "第２表の１" },
    sortOrder: 202,
  },

  // ══ 第２表の２：所属機関（法人）══════════════════════════════════════════
  {
    documentName: "【第２表の2-1】特定技能所属機関概要書（参考様式第1-11-1号）",
    description: "同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: true,
    conditions: { tableApplicable: "第２表の２（法人）" },
    sortOrder: 211,
  },
  {
    documentName: "【第２表の2-2】登記事項証明書",
    description: "法務局発行",
    isAlwaysRequired: true,
    conditions: {
      issuer: "法務局",
      tableApplicable: "第２表の２（法人）",
    },
    sortOrder: 212,
  },
  {
    documentName: "【第２表の2-3】業務執行に関与する役員の住民票の写し",
    description: "マイナンバーの記載がなく、本籍地の記載があるものが必要",
    isAlwaysRequired: true,
    conditions: {
      issuer: "市区町村",
      tableApplicable: "第２表の２（法人）",
    },
    sortOrder: 213,
  },
  {
    documentName: "【第２表の2-4】特定技能所属機関の役員に関する誓約書（参考様式第1-23号）",
    description: "特定技能外国人の受入れに関する業務執行に関与しない役員がいる場合のみ必要",
    isAlwaysRequired: false,
    conditions: {
      tableApplicable: "第２表の２（法人）",
      note: "受入れ非関与の役員がいる場合のみ",
    },
    sortOrder: 214,
  },
  {
    documentName: "【第２表の2-5】労働保険料等納付証明書（未納なし証明）",
    description: "納付や換価の猶予を受けている場合は、猶予許可通知書の写しも必要",
    isAlwaysRequired: true,
    conditions: {
      issuer: "労働局",
      tableApplicable: "第２表の２（法人）",
    },
    sortOrder: 215,
  },
  {
    documentName: "【第２表の2-6】社会保険料納入状況回答票 または 健康保険・厚生年金保険料領収証書の写し（前々月まで24か月分）",
    description: "2025年４月申請の場合は2023年３月〜2025年２月分が必要",
    isAlwaysRequired: true,
    conditions: {
      issuer: "日本年金機構 または 年金事務所",
      tableApplicable: "第２表の２（法人）",
    },
    sortOrder: 216,
  },
  {
    documentName: "【第２表の2-7】納税証明書（その３）（税務署）",
    description: "対象税目：①源泉所得税及び復興特別所得税 ②法人税 ③消費税及び地方消費税",
    isAlwaysRequired: true,
    conditions: {
      issuer: "税務署",
      tableApplicable: "第２表の２（法人）",
    },
    sortOrder: 217,
  },
  {
    documentName: "【第２表の2-8】法人住民税の納税証明書（直近２年度分）",
    description: "納税緩和措置適用時は通知書の写しも必要",
    isAlwaysRequired: true,
    conditions: {
      issuer: "市区町村",
      tableApplicable: "第２表の２（法人）",
    },
    sortOrder: 218,
  },

  // ══ 第２表の３：所属機関（個人事業主）══════════════════════════════════
  {
    documentName: "【第２表の3-1】特定技能所属機関概要書（参考様式第1-11-1号）",
    description: "同一年度内に既に受け入れている機関は提出不要",
    isAlwaysRequired: true,
    conditions: { tableApplicable: "第２表の３（個人事業主）" },
    sortOrder: 221,
  },
  {
    documentName: "【第２表の3-2】個人事業主の住民票の写し",
    description: "マイナンバーの記載がなく、本籍地の記載があるものが必要",
    isAlwaysRequired: true,
    conditions: {
      issuer: "市区町村",
      tableApplicable: "第２表の３（個人事業主）",
    },
    sortOrder: 222,
  },
  {
    documentName: "【第２表の3-3】労働保険料等納付証明書（未納なし証明）または 労災保険に代わる民間保険の加入証明",
    description: "①労働保険適用事業所：納付証明書（労働局） ②非適用事業所：民間保険の加入証明",
    isAlwaysRequired: true,
    conditions: {
      issuer: "労働局（適用事業所の場合）",
      tableApplicable: "第２表の３（個人事業主）",
    },
    sortOrder: 223,
  },
  {
    documentName: "【第２表の3-4】社会保険・国民健康保険関係書類（適用区分に応じた書類）",
    description: "①健康保険・厚生年金適用事業所：社会保険料納入状況回答票等 ②非適用事業所：医療保険資格情報の写し＋国民健康保険料納付証明書（２年度分）＋国民年金被保険者記録照会等",
    isAlwaysRequired: true,
    conditions: {
      issuer: "日本年金機構 または 年金事務所 または 市区町村",
      tableApplicable: "第２表の３（個人事業主）",
    },
    sortOrder: 224,
  },
  {
    documentName: "【第２表の3-5】個人事業主の納税証明書（その３）（税務署）",
    description: "対象税目：①源泉所得税及び復興特別所得税 ②申告所得税及び復興特別所得税 ③消費税及び地方消費税 ④相続税 ⑤贈与税",
    isAlwaysRequired: true,
    conditions: {
      issuer: "税務署",
      tableApplicable: "第２表の３（個人事業主）",
    },
    sortOrder: 225,
  },
  {
    documentName: "【第２表の3-6】個人事業主の個人住民税の納税証明書（直近２年度分）",
    description: "納税緩和措置適用時は通知書の写しも必要",
    isAlwaysRequired: true,
    conditions: {
      issuer: "市区町村",
      tableApplicable: "第２表の３（個人事業主）",
    },
    sortOrder: 226,
  },

  // ══ 第３表の３：建設分野固有書類 ══════════════════════════════════════════
  {
    documentName: "【建設-1】建設分野特定技能２号評価試験の合格証明書の写し または 技能検定１級の合格証明書の写し",
    description: "対象業務区分は「建設分野の基準について」の別表を参照。過去の申請で提出済み（有効期限内）の場合は省略可",
    isAlwaysRequired: false,
    conditions: {
      field: "建設分野",
      note: "過去申請提出済み（有効期限内）なら省略可",
    },
    sortOrder: 301,
  },
  {
    documentName: "【建設-2-①】２号特定技能外国人に求められる実務経験に係る申告書（分野参考様式第6-3号）または 建設キャリアアップシステムレベル３能力評価結果通知書の写し",
    description: "②業務区分に対応する職種がCCUSにある場合：申告書またはレベル判定結果通知書 + CCUS技能者情報の表示画面の写し",
    isAlwaysRequired: false,
    conditions: {
      field: "建設分野",
      note: "CCUSに対応職種がある場合",
    },
    sortOrder: 302,
  },
  {
    documentName: "【建設-2-②】２号特定技能外国人に求められる実務経験に係る申告書（分野参考様式第6-3号）+ 建設キャリアアップシステム技能者情報の表示画面の写し",
    description: "業務区分に対応する職種がCCUSの能力評価基準にない場合",
    isAlwaysRequired: false,
    conditions: {
      field: "建設分野",
      note: "CCUSに対応職種がない場合",
    },
    sortOrder: 303,
  },
  {
    documentName: "【建設-2-③】２号特定技能外国人に求められる実務経験に係る申告書（分野参考様式第6-3号）+ 経歴証明書（分野参考様式第6-3号別紙）",
    description: "建設キャリアアップシステムに就業日数及び就業履歴数が蓄積されていない場合",
    isAlwaysRequired: false,
    conditions: {
      field: "建設分野",
      note: "CCUS就業履歴未蓄積の場合",
    },
    sortOrder: 304,
  },
  {
    documentName: "【建設-3】建設分野における特定技能外国人の受入れに関する誓約書（分野参考様式第6-1号）",
    description: "建設分野固有の誓約書",
    isAlwaysRequired: true,
    conditions: { field: "建設分野" },
    sortOrder: 305,
  },
  {
    documentName: "【建設-4】２号特定技能外国人特定技能雇用契約の相手方となる本邦の公私の機関に関する誓約書（分野参考様式第6-2号）",
    description: "建設分野固有の誓約書",
    isAlwaysRequired: true,
    conditions: { field: "建設分野" },
    sortOrder: 306,
  },
  {
    documentName: "【建設-5】建設業法第３条第１項の許可を受けていることを証する書類",
    description: "建設業許可証の写し等",
    isAlwaysRequired: true,
    conditions: { field: "建設分野" },
    sortOrder: 307,
  },
  {
    documentName: "【建設-6】建設キャリアアップシステム申請番号または事業者IDを明らかにする書類",
    description: "登録後に送付されるハガキ又はメールの写しなど",
    isAlwaysRequired: true,
    conditions: { field: "建設分野" },
    sortOrder: 308,
  },
  {
    documentName: "【建設-7】JACの会員証の写し または JACに入会している建設業者団体の会員証の写し",
    description: "一般社団法人建設技能人材機構（JAC）または傘下団体の会員証",
    isAlwaysRequired: true,
    conditions: {
      issuer: "JAC または 建設業者団体",
      field: "建設分野",
    },
    sortOrder: 309,
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
  console.log("\n書類区分:");
  console.log("  第１表（申請人共通）: 19件");
  console.log("  第２表の１（実績機関）:  2件");
  console.log("  第２表の２（法人）:      8件");
  console.log("  第２表の３（個人事業）:  6件");
  console.log("  第３表（建設分野）:      9件");
  console.log(`  合計: ${documents.length}件`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
