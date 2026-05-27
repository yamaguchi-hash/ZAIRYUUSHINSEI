/**
 * 入管書類マスターシードスクリプト
 * 出入国在留管理庁ホームページの必要書類一覧に基づいて作成
 * https://www.moj.go.jp/isa/applications/status/
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { documentRequirementMaster, applicationDocumentChecklist } from "../src/lib/db/schema";
import { config } from "dotenv";
config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

interface DocDef {
  visaType: string;
  applicationType: string;
  category: string;
  documentName: string;
  description?: string;
  isAlwaysRequired?: boolean;
  sortOrder: number;
}

const DOCUMENTS: DocDef[] = [
  // ══════════════════════════════════════════════════════════════
  // 【全在留資格共通】申請書・写真・パスポート等
  // ══════════════════════════════════════════════════════════════
  // 申請書（申請書類）はシステムが生成するため書類マスターには含めない
  { visaType: "common", applicationType: "all",           category: "共通書類",         documentName: "写真（縦4cm×横3cm）", description: "3か月以内撮影・背景白・正面・無帽", isAlwaysRequired: true, sortOrder: 20 },
  { visaType: "common", applicationType: "all",           category: "共通書類",         documentName: "パスポート（提示）", description: "有効期限内のもの", isAlwaysRequired: true, sortOrder: 30 },
  { visaType: "common", applicationType: "change",        category: "共通書類（変更）", documentName: "在留カード（表面）", description: "氏名・在留資格・在留期限等が記載された表面", isAlwaysRequired: true, sortOrder: 35 },
  { visaType: "common", applicationType: "change",        category: "共通書類（変更）", documentName: "在留カード（裏面）", description: "住所変更記録・資格外活動許可等が記載された裏面", isAlwaysRequired: true, sortOrder: 36 },
  { visaType: "common", applicationType: "renewal",       category: "共通書類（更新）", documentName: "在留カード（表面）", description: "氏名・在留資格・在留期限等が記載された表面", isAlwaysRequired: true, sortOrder: 35 },
  { visaType: "common", applicationType: "renewal",       category: "共通書類（更新）", documentName: "在留カード（裏面）", description: "住所変更記録・資格外活動許可等が記載された裏面", isAlwaysRequired: true, sortOrder: 36 },
  { visaType: "common", applicationType: "certification", category: "共通書類（認定）", documentName: "返信用封筒（簡易書留・切手貼付）", description: "定形封筒に宛先明記・404円切手貼付", isAlwaysRequired: true, sortOrder: 40 },

  // ══════════════════════════════════════════════════════════════
  // 【技術・人文知識・国際業務】
  // ══════════════════════════════════════════════════════════════
  // カテゴリー区分証明
  { visaType: "engineer_humanities", applicationType: "all", category: "所属機関カテゴリー証明", documentName: "四季報の写し（上場企業）", description: "日本の証券取引所に上場していることを証明", sortOrder: 100 },
  { visaType: "engineer_humanities", applicationType: "all", category: "所属機関カテゴリー証明", documentName: "前年分の給与所得の源泉徴収票等の法定調書合計表（写し）", description: "カテゴリー2・3用。源泉徴収税額が1,000万円以上の場合はカテゴリー2", sortOrder: 110 },
  // 認定申請共通
  { visaType: "engineer_humanities", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "カテゴリー該当証明文書", description: "四季報写し・法定調書合計表写し等", sortOrder: 120 },
  // 就労内容
  { visaType: "engineer_humanities", applicationType: "all", category: "就労内容・契約関係", documentName: "労働条件通知書の写し（雇用契約書）", description: "入社・更新時の雇用条件", isAlwaysRequired: true, sortOrder: 130 },
  { visaType: "engineer_humanities", applicationType: "all", category: "就労内容・契約関係", documentName: "職務内容を明示した所属機関の文書", description: "業務内容・役職・期間・報酬額を明記", isAlwaysRequired: true, sortOrder: 140 },
  { visaType: "engineer_humanities", applicationType: "all", category: "就労内容・契約関係", documentName: "役員報酬を定める定款の写し又は株主総会議事録（役員の場合）", description: "役員就任の場合", sortOrder: 145 },
  { visaType: "engineer_humanities", applicationType: "all", category: "就労内容・契約関係", documentName: "申請人の派遣労働に関する誓約書（派遣就労の場合）", description: "派遣先・派遣元各1通", sortOrder: 146 },
  { visaType: "engineer_humanities", applicationType: "all", category: "就労内容・契約関係", documentName: "労働者派遣個別契約書の写し（派遣就労の場合）", sortOrder: 147 },
  // 学歴・職歴
  { visaType: "engineer_humanities", applicationType: "all", category: "学歴・職歴・資格", documentName: "大学・大学院等の卒業証明書", description: "日本語又は英語のもの（その他は公証翻訳要）", sortOrder: 150 },
  { visaType: "engineer_humanities", applicationType: "all", category: "学歴・職歴・資格", documentName: "専門士・高度専門士の称号付与証明書（専門学校卒業者）", sortOrder: 155 },
  { visaType: "engineer_humanities", applicationType: "all", category: "学歴・職歴・資格", documentName: "在職証明書等（職歴で基準を満たす場合）", description: "関連業務に従事した期間・内容を証明", sortOrder: 160 },
  { visaType: "engineer_humanities", applicationType: "all", category: "学歴・職歴・資格", documentName: "申請に係る職務に従事した機関・内容・期間を明示した履歴書", sortOrder: 165 },
  { visaType: "engineer_humanities", applicationType: "all", category: "学歴・職歴・資格", documentName: "情報処理技術に関する試験・資格の合格証書（IT技術者）", description: "IPA試験等", sortOrder: 170 },
  { visaType: "engineer_humanities", applicationType: "all", category: "学歴・職歴・資格", documentName: "CEFR B2相当の言語能力を証する資料（言語を用いた対人業務の場合）", description: "2026年4月以降追加", sortOrder: 175 },
  // 所属機関資料（カテゴリー3・4）
  { visaType: "engineer_humanities", applicationType: "all", category: "所属機関資料", documentName: "登記事項証明書（商業・法人登記）", isAlwaysRequired: true, sortOrder: 180 },
  { visaType: "engineer_humanities", applicationType: "all", category: "所属機関資料", documentName: "勤務先等の案内書（沿革・役員・組織・事業内容）", isAlwaysRequired: true, sortOrder: 190 },
  { visaType: "engineer_humanities", applicationType: "all", category: "所属機関資料", documentName: "直近の年度の決算文書の写し（新規は事業計画書）", isAlwaysRequired: true, sortOrder: 200 },
  { visaType: "engineer_humanities", applicationType: "all", category: "所属機関資料", documentName: "所属機関の代表者に関する申告書（参考様式）", description: "カテゴリー3・4用、2026年4月以降", sortOrder: 205 },
  // 更新時追加
  { visaType: "engineer_humanities", applicationType: "renewal", category: "在留期間更新許可申請（追加）", documentName: "住民税の課税（又は非課税）証明書", description: "1年間の総所得及び納税状況が記載されたもの", sortOrder: 210 },
  { visaType: "engineer_humanities", applicationType: "renewal", category: "在留期間更新許可申請（追加）", documentName: "住民税の納税証明書", sortOrder: 215 },
  { visaType: "engineer_humanities", applicationType: "renewal", category: "在留期間更新許可申請（転職後初回更新）", documentName: "申請人の活動内容等を明らかにする文書（転職後初回更新）", description: "労働条件通知書・定款・議事録等のいずれか", sortOrder: 220 },

  // ══════════════════════════════════════════════════════════════
  // 【経営・管理】
  // ══════════════════════════════════════════════════════════════
  { visaType: "business_manager", applicationType: "all", category: "事業・事務所関係", documentName: "事務所の存在を証明する資料", description: "不動産登記事項証明書又は賃貸借契約書の写し", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "business_manager", applicationType: "all", category: "事業・事務所関係", documentName: "事業内容を明らかにする資料（事業計画書等）", isAlwaysRequired: true, sortOrder: 110 },
  { visaType: "business_manager", applicationType: "all", category: "事業・事務所関係", documentName: "登記事項証明書（法人の場合）", sortOrder: 120 },
  { visaType: "business_manager", applicationType: "all", category: "事業・事務所関係", documentName: "直近年度の決算文書の写し（既存法人）又は事業計画書（新規）", sortOrder: 130 },
  { visaType: "business_manager", applicationType: "all", category: "経歴証明", documentName: "経営管理3年以上の経験を証明する在職証明書", description: "事業の管理に従事する場合", sortOrder: 140 },
  { visaType: "business_manager", applicationType: "all", category: "経歴証明", documentName: "経営管理分野の学位証明書（博士・修士・専門職）", description: "学歴で基準を満たす場合", sortOrder: 150 },
  { visaType: "business_manager", applicationType: "renewal", category: "在留期間更新許可申請（追加）", documentName: "住民税の課税（又は非課税）証明書", sortOrder: 160 },
  { visaType: "business_manager", applicationType: "renewal", category: "在留期間更新許可申請（追加）", documentName: "住民税の納税証明書", sortOrder: 165 },

  // ══════════════════════════════════════════════════════════════
  // 【企業内転勤】
  // ══════════════════════════════════════════════════════════════
  { visaType: "intra_company_transferee", applicationType: "all", category: "転勤・雇用関係", documentName: "転勤命令書の写し又は辞令等の写し（同一法人内転勤）", sortOrder: 100 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "転勤・雇用関係", documentName: "労働条件を明示する文書（法人を異にする転勤）", sortOrder: 110 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "転勤・雇用関係", documentName: "転勤前・後の事業所の関係を示す資料", description: "外国法人の支店の登記事項証明書等", sortOrder: 120 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "転勤・雇用関係", documentName: "出向元・出向先の出資関係を明らかにする資料（出向の場合）", sortOrder: 130 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "職歴証明", documentName: "転勤直前に勤務した外国機関の文書（過去1年間の業務・報酬等）", sortOrder: 140 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "職歴証明", documentName: "関連業務に従事した機関・内容・期間を明示した履歴書", sortOrder: 150 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "所属機関資料", documentName: "登記事項証明書（商業・法人登記）", sortOrder: 160 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "所属機関資料", documentName: "勤務先等の案内書（沿革・役員・組織・事業内容）", sortOrder: 170 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "所属機関資料", documentName: "直近年度の決算文書の写し（新規は事業計画書）", sortOrder: 180 },
  { visaType: "intra_company_transferee", applicationType: "all", category: "所属機関資料", documentName: "申請人が活動する事業所の存在を明らかにする資料", description: "不動産登記簿、事務所の写真・平面図等", sortOrder: 190 },

  // ══════════════════════════════════════════════════════════════
  // 【高度専門職1号・2号】
  // ══════════════════════════════════════════════════════════════
  { visaType: "highly_skilled_professional_1", applicationType: "all", category: "ポイント計算・立証資料", documentName: "ポイント計算表（行おうとする活動に対応したもの）", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "highly_skilled_professional_1", applicationType: "all", category: "ポイント計算・立証資料", documentName: "最終学歴に関する学位証明書・卒業証明書", sortOrder: 110 },
  { visaType: "highly_skilled_professional_1", applicationType: "all", category: "ポイント計算・立証資料", documentName: "職歴に関する在職証明書・業務経歴証明書", sortOrder: 120 },
  { visaType: "highly_skilled_professional_1", applicationType: "all", category: "ポイント計算・立証資料", documentName: "年収に関する雇用契約書又は労働条件通知書", sortOrder: 130 },
  { visaType: "highly_skilled_professional_1", applicationType: "all", category: "ポイント計算・立証資料", documentName: "研究実績に関する論文掲載証明書等", sortOrder: 140 },
  { visaType: "highly_skilled_professional_1", applicationType: "all", category: "ポイント計算・立証資料", documentName: "日本語能力試験合格証書等（特別加算）", sortOrder: 150 },
  { visaType: "highly_skilled_professional_1", applicationType: "all", category: "所属機関資料", documentName: "登記事項証明書", sortOrder: 160 },
  { visaType: "highly_skilled_professional_1", applicationType: "all", category: "所属機関資料", documentName: "直近年度の決算文書の写し又は事業計画書", sortOrder: 170 },

  // ══════════════════════════════════════════════════════════════
  // 【留学】
  // ══════════════════════════════════════════════════════════════
  { visaType: "student", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "学校から発行された入学許可書等", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "student", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "財政能力を証する資料（銀行残高証明書等）", isAlwaysRequired: true, sortOrder: 110 },
  { visaType: "student", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "経費支弁書（所定様式）", sortOrder: 120 },
  { visaType: "student", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "奨学金の給付に関する証明書（奨学金がある場合）", sortOrder: 130 },
  { visaType: "student", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "日本語能力を証する資料（非適正校の場合）", description: "日本語学校在学証明書等", sortOrder: 140 },
  { visaType: "student", applicationType: "change",        category: "在留資格変更許可申請", documentName: "在学証明書（在籍する学校発行）", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "student", applicationType: "change",        category: "在留資格変更許可申請", documentName: "成績証明書", sortOrder: 110 },
  { visaType: "student", applicationType: "change",        category: "在留資格変更許可申請", documentName: "経費支弁書及び財政能力を証する資料", isAlwaysRequired: true, sortOrder: 120 },
  { visaType: "student", applicationType: "renewal",       category: "在留期間更新許可申請", documentName: "在学証明書（在籍する学校発行）", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "student", applicationType: "renewal",       category: "在留期間更新許可申請", documentName: "成績証明書", sortOrder: 110 },
  { visaType: "student", applicationType: "renewal",       category: "在留期間更新許可申請", documentName: "経費支弁書及び財政能力を証する資料", isAlwaysRequired: true, sortOrder: 120 },

  // ══════════════════════════════════════════════════════════════
  // 【家族滞在】
  // ══════════════════════════════════════════════════════════════
  { visaType: "dependent", applicationType: "all", category: "身分関係証明", documentName: "申請人と扶養者との身分関係を証する文書", description: "戸籍謄本・婚姻届受理証明書・結婚証明書・出生証明書等", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "dependent", applicationType: "all", category: "扶養者関係", documentName: "扶養者のパスポートの写し", description: "扶養者が日本人・永住者の場合：旅券（パスポート）の写し", isAlwaysRequired: false, sortOrder: 110 },
  { visaType: "dependent", applicationType: "all", category: "扶養者関係", documentName: "扶養者の在留カード（表面）の写し", description: "扶養者が外国人（在留カード保有者）の場合：在留カード表面の写し", isAlwaysRequired: false, sortOrder: 111 },
  { visaType: "dependent", applicationType: "all", category: "扶養者関係", documentName: "扶養者の在留カード（裏面）の写し", description: "扶養者が外国人（在留カード保有者）の場合：在留カード裏面の写し", isAlwaysRequired: false, sortOrder: 112 },
  { visaType: "dependent", applicationType: "all", category: "扶養者関係", documentName: "扶養者の在職証明書又は営業許可書の写し等", description: "扶養者の職業がわかる証明書", isAlwaysRequired: true, sortOrder: 120 },
  { visaType: "dependent", applicationType: "all", category: "扶養者関係", documentName: "住民税の課税（又は非課税）証明書（扶養者）", isAlwaysRequired: true, sortOrder: 130 },
  { visaType: "dependent", applicationType: "all", category: "扶養者関係", documentName: "住民税の納税証明書（扶養者）", isAlwaysRequired: true, sortOrder: 135 },
  { visaType: "dependent", applicationType: "all", category: "扶養者関係", documentName: "扶養者名義の預金残高証明書（収入を伴う活動を行っていない場合）", sortOrder: 140 },
  { visaType: "dependent", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "返信用封筒（簡易書留・切手貼付）", isAlwaysRequired: true, sortOrder: 90 },

  // ══════════════════════════════════════════════════════════════
  // 【日本人の配偶者等】
  // ══════════════════════════════════════════════════════════════
  { visaType: "spouse_of_japanese", applicationType: "all", category: "身分関係証明", documentName: "日本人配偶者の戸籍謄本（配偶者の場合）", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "spouse_of_japanese", applicationType: "all", category: "身分関係証明", documentName: "婚姻証明書（外国での婚姻の場合）", sortOrder: 110 },
  { visaType: "spouse_of_japanese", applicationType: "all", category: "身分関係証明", documentName: "質問書（所定様式）", isAlwaysRequired: true, sortOrder: 120 },
  { visaType: "spouse_of_japanese", applicationType: "all", category: "身分関係証明", documentName: "スナップ写真（夫婦の交流が確認できるもの）2～3葉", isAlwaysRequired: true, sortOrder: 130 },
  { visaType: "spouse_of_japanese", applicationType: "all", category: "身分保証", documentName: "日本人配偶者の身元保証書", isAlwaysRequired: true, sortOrder: 140 },
  { visaType: "spouse_of_japanese", applicationType: "all", category: "身分保証", documentName: "日本人配偶者の在職証明書・納税証明書等（経済的基盤証明）", sortOrder: 150 },
  { visaType: "spouse_of_japanese", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "返信用封筒（簡易書留・切手貼付）", isAlwaysRequired: true, sortOrder: 90 },

  // ══════════════════════════════════════════════════════════════
  // 【永住者の配偶者等】
  // ══════════════════════════════════════════════════════════════
  { visaType: "permanent_resident", applicationType: "all", category: "身分関係証明", documentName: "配偶者（永住者）との結婚証明書又は婚姻届出受理証明書", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "permanent_resident", applicationType: "all", category: "身分関係証明", documentName: "質問書（所定様式）", isAlwaysRequired: true, sortOrder: 110 },
  { visaType: "permanent_resident", applicationType: "all", category: "身分関係証明", documentName: "スナップ写真（お二人で写ったもの）2～3葉", isAlwaysRequired: true, sortOrder: 120 },
  { visaType: "permanent_resident", applicationType: "all", category: "身分保証", documentName: "配偶者（永住者）の身元保証書", isAlwaysRequired: true, sortOrder: 130 },
  { visaType: "permanent_resident", applicationType: "all", category: "身分保証", documentName: "配偶者（永住者）の世帯全員の記載のある住民票", isAlwaysRequired: true, sortOrder: 140 },
  { visaType: "permanent_resident", applicationType: "all", category: "経費支弁", documentName: "住民税の課税証明書及び納税証明書（直近1年分）", isAlwaysRequired: true, sortOrder: 150 },
  { visaType: "permanent_resident", applicationType: "all", category: "経費支弁", documentName: "雇用予定証明書又は採用内定通知書（日本の会社発行）", sortOrder: 160 },
  { visaType: "permanent_resident", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "返信用封筒（簡易書留・切手貼付）", isAlwaysRequired: true, sortOrder: 90 },

  // ══════════════════════════════════════════════════════════════
  // 【定住者（日系3世等）】
  // ══════════════════════════════════════════════════════════════
  { visaType: "long_term_resident", applicationType: "all", category: "身分関係証明", documentName: "身分関係を証する資料（戸籍謄本・出生証明書等）", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "long_term_resident", applicationType: "all", category: "身分関係証明", documentName: "在職証明書等（職業を証する書類）", sortOrder: 110 },
  { visaType: "long_term_resident", applicationType: "all", category: "身分保証", documentName: "身元保証書", isAlwaysRequired: true, sortOrder: 120 },
  { visaType: "long_term_resident", applicationType: "all", category: "身分保証", documentName: "保証人の住民票（日本に在住する保証人の場合）", sortOrder: 130 },
  { visaType: "long_term_resident", applicationType: "certification", category: "在留資格認定証明書交付申請", documentName: "返信用封筒（簡易書留・切手貼付）", isAlwaysRequired: true, sortOrder: 90 },

  // ══════════════════════════════════════════════════════════════
  // 【特定技能1号・2号】
  // ══════════════════════════════════════════════════════════════
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "特定技能外国人の在留諸申請に係る提出書類一覧・確認表（第1表表紙）", isAlwaysRequired: true, sortOrder: 100 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "特定技能雇用契約書の写し", isAlwaysRequired: true, sortOrder: 110 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "雇用条件書の写し", isAlwaysRequired: true, sortOrder: 120 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "説明書及び確認書（特定技能雇用契約の重要事項）", isAlwaysRequired: true, sortOrder: 130 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "賃金の支払いに関する説明書", isAlwaysRequired: true, sortOrder: 140 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "徴収費用の説明書", isAlwaysRequired: true, sortOrder: 150 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "支援計画書（特定技能1号）", isAlwaysRequired: true, sortOrder: 160 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "支援委託契約書の写し（登録支援機関に支援を委託する場合）", sortOrder: 170 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "技能試験合格証明書の写し又は技能実習2号修了証明書等", isAlwaysRequired: true, sortOrder: 180 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "申請人関係書類（第1表）", documentName: "日本語能力を証明する書類（日本語試験合格証明書等）", isAlwaysRequired: true, sortOrder: 190 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "所属機関関係書類（第2表）", documentName: "特定技能所属機関概要書", isAlwaysRequired: true, sortOrder: 200 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "所属機関関係書類（第2表）", documentName: "登記事項証明書（所属機関）", isAlwaysRequired: true, sortOrder: 210 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "所属機関関係書類（第2表）", documentName: "直近年度の決算文書の写し", sortOrder: 220 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "所属機関関係書類（第2表）", documentName: "労働保険料・社会保険料の納付状況を証明する書類", sortOrder: 230 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "所属機関関係書類（第2表）", documentName: "法人税の納付状況を証明する書類（納税証明書等）", sortOrder: 240 },
  { visaType: "specified_skilled_worker_1", applicationType: "all", category: "分野別追加書類（第3表）", documentName: "各分野固有の書類（第3表・分野別要領に従う）", isAlwaysRequired: true, sortOrder: 250 },
];

async function main() {
  console.log("既存の書類マスターを削除中...");
  // 参照先のチェックリストを先に削除してからマスターを削除
  await db.delete(applicationDocumentChecklist);
  await db.delete(documentRequirementMaster);

  console.log(`${DOCUMENTS.length} 件の書類マスターを投入中...`);

  for (let i = 0; i < DOCUMENTS.length; i += 50) {
    const batch = DOCUMENTS.slice(i, i + 50);
    await db.insert(documentRequirementMaster).values(
      batch.map((d) => ({
        visaType: d.visaType,
        applicationType: d.applicationType,
        documentName: d.documentName,
        description: d.description ?? null,
        isAlwaysRequired: d.isAlwaysRequired ?? false,
        conditions: { category: d.category } as any,
        sortOrder: d.sortOrder,
        isActive: true,
      }))
    );
    console.log(`  ${Math.min(i + 50, DOCUMENTS.length)} / ${DOCUMENTS.length} 完了`);
  }

  console.log("✅ 書類マスターのシード完了");
}

main().catch((e) => { console.error(e); process.exit(1); });
