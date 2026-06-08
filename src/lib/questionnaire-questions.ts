/**
 * 質問書 — 全申請書タイプ・全セクション網羅版
 * questionnaire-content/route.ts, questionnaire-gdoc/route.ts,
 * print/[id]/questionnaire/page.tsx で共有する。
 */
import type { ApplicationFormData } from "@/lib/form-types";

export interface QQuestion {
  key: keyof ApplicationFormData;
  section: string;
  label: string;
  note?: string;
  formTypes?: string[];   // 省略=全様式
  categories?: string[];  // 省略=全カテゴリー
  options?: string[];
  /** 追加条件: フォーム値に応じて質問を出すか判定 */
  condition?: (form: Partial<ApplicationFormData>) => boolean;
}

// ─── 空欄チェック ─────────────────────────────────────────────────────────────
export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

// ─── 全質問定義 ───────────────────────────────────────────────────────────────
export const ALL_QUESTIONS: QQuestion[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人 Part 1 — 共通（全様式）
  // ══════════════════════════════════════════════════════════════════════════
  {
    key: "nationality",
    section: "1. 基本情報（Part 1）",
    label: "国籍・地域",
    note: "例：中国、ベトナム、フィリピン",
  },
  {
    key: "dateOfBirth",
    section: "1. 基本情報（Part 1）",
    label: "生年月日",
    note: "例：1990-03-15（西暦）",
  },
  {
    key: "familyNameEn",
    section: "1. 基本情報（Part 1）",
    label: "氏名 — 姓（ローマ字 / Family Name）",
    note: "例：YAMADA",
  },
  {
    key: "givenNameEn",
    section: "1. 基本情報（Part 1）",
    label: "氏名 — 名（ローマ字 / Given Name）",
    note: "例：TARO",
  },
  {
    key: "familyNameJa",
    section: "1. 基本情報（Part 1）",
    label: "氏名 — 姓（漢字）",
    note: "漢字表記がある場合のみ",
  },
  {
    key: "givenNameJa",
    section: "1. 基本情報（Part 1）",
    label: "氏名 — 名（漢字）",
    note: "漢字表記がある場合のみ",
  },
  {
    key: "sex",
    section: "1. 基本情報（Part 1）",
    label: "性別",
    options: ["男", "女"],
  },
  {
    key: "placeOfBirth",
    section: "1. 基本情報（Part 1）",
    label: "出生地",
    note: "例：北京市、ハノイ市",
    formTypes: ["coe", "change"],
  },
  {
    key: "maritalStatus",
    section: "1. 基本情報（Part 1）",
    label: "配偶者の有無",
    options: ["有", "無"],
  },
  {
    key: "occupation",
    section: "1. 基本情報（Part 1）",
    label: "職業",
    note: "例：会社員、主婦、学生",
  },
  {
    key: "homeTownCity",
    section: "1. 基本情報（Part 1）",
    label: "本国における居住地（本国の住所）",
    note: "例：中国 上海市徐匯区〇〇路1-2-3",
  },

  // ── 8/9. 日本における連絡先 ────────────────────────────────────────────────
  {
    key: "postalCodeInJapan",
    section: "2. 日本における連絡先",
    label: "郵便番号",
    note: "例：160-0023（7桁）",
  },
  {
    key: "prefectureInJapan",
    section: "2. 日本における連絡先",
    label: "都道府県",
    note: "例：東京都、大阪府",
  },
  {
    key: "cityInJapan",
    section: "2. 日本における連絡先",
    label: "市区町村",
    note: "例：新宿区西新宿",
  },
  {
    key: "addressLineInJapan",
    section: "2. 日本における連絡先",
    label: "番地・建物名・部屋番号",
    note: "例：2-8-1 〇〇マンション 305号室",
  },
  {
    key: "telephoneNo",
    section: "2. 日本における連絡先",
    label: "電話番号（固定）",
    note: "例：03-1234-5678",
  },
  {
    key: "cellularPhoneNo",
    section: "2. 日本における連絡先",
    label: "携帯電話番号",
    note: "例：090-1234-5678",
  },

  // ── 9/10. 旅券 ────────────────────────────────────────────────────────────
  {
    key: "passportNumber",
    section: "3. 旅券（パスポート）",
    label: "旅券番号",
    note: "例：AB1234567（英数字）",
  },
  {
    key: "passportExpiry",
    section: "3. 旅券（パスポート）",
    label: "旅券有効期限",
    note: "例：2028-12-31",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // COE 固有（別記第六号の三様式）
  // ══════════════════════════════════════════════════════════════════════════
  {
    key: "purposeOfEntry",
    section: "4. 入国・在留目的（COE）",
    label: "入国目的（希望する在留資格）",
    formTypes: ["coe"],
  },
  {
    key: "scheduledDateOfEntry",
    section: "4. 入国・在留目的（COE）",
    label: "入国予定年月日",
    note: "例：2025-10-01",
    formTypes: ["coe"],
  },
  {
    key: "portOfEntry",
    section: "4. 入国・在留目的（COE）",
    label: "上陸予定港",
    note: "例：成田国際空港、関西国際空港",
    formTypes: ["coe"],
  },
  {
    key: "intendedLengthOfStay",
    section: "4. 入国・在留目的（COE）",
    label: "滞在予定期間",
    note: "例：3年",
    formTypes: ["coe"],
  },
  {
    key: "intendedPlaceForVisa",
    section: "4. 入国・在留目的（COE）",
    label: "査証申請予定地（大使館・領事館のある都市名）",
    note: "例：北京、ハノイ",
    formTypes: ["coe"],
  },
  {
    key: "pastEntryHistory",
    section: "4. 入国・在留目的（COE）",
    label: "過去の出入国歴の有無",
    options: ["有", "無"],
    formTypes: ["coe"],
  },
  {
    key: "pastEntryCount",
    section: "4. 入国・在留目的（COE）",
    label: "過去の出入国回数",
    note: "例：3回",
    formTypes: ["coe"],
    condition: (f) => f.pastEntryHistory === "有",
  },
  {
    key: "pastCoeHistory",
    section: "4. 入国・在留目的（COE）",
    label: "過去の在留資格認定証明書交付申請歴の有無",
    options: ["有", "無"],
    formTypes: ["coe"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 現在の在留状況（Change・Extension・COE一部）
  // ══════════════════════════════════════════════════════════════════════════
  {
    key: "currentStatusOfResidence",
    section: "5. 現在の在留状況",
    label: "現在の在留資格",
    note: "例：家族滞在、技術・人文知識・国際業務",
    formTypes: ["change", "extension"],
  },
  {
    key: "currentPeriodOfStay",
    section: "5. 現在の在留状況",
    label: "在留期間",
    note: "例：1年、3年",
    formTypes: ["change", "extension"],
  },
  {
    key: "currentPeriodExpiry",
    section: "5. 現在の在留状況",
    label: "在留期間の満了日",
    note: "例：2025-10-15",
    formTypes: ["change", "extension"],
  },
  {
    key: "residenceCardNumber",
    section: "5. 現在の在留状況",
    label: "在留カード番号",
    note: "例：AB12345678CD（英数字12桁）",
    formTypes: ["change", "extension"],
  },

  // ── 申請内容 ──────────────────────────────────────────────────────────────
  {
    key: "desiredStatusOfResidence",
    section: "6. 申請内容",
    label: "希望する在留資格（変更申請の場合）",
    formTypes: ["change"],
  },
  {
    key: "desiredPeriodOfStay",
    section: "6. 申請内容",
    label: "希望する在留期間",
    note: "例：3年、5年",
    formTypes: ["change", "extension"],
  },
  {
    key: "reasonForApplication",
    section: "6. 申請内容",
    label: "更新・変更の理由",
    note: "なぜ更新・変更が必要か具体的に記入",
    formTypes: ["change", "extension"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 犯罪・退去強制歴・在日親族（全様式共通）
  // ══════════════════════════════════════════════════════════════════════════
  {
    key: "criminalRecord",
    section: "7. 犯罪・退去強制歴",
    label: "犯罪を理由とする処分を受けたことの有無",
    note: "日本国外・交通違反等を含む",
    options: ["有", "無"],
  },
  {
    key: "criminalRecordDetail",
    section: "7. 犯罪・退去強制歴",
    label: "犯罪記録の詳細（内容・処分年月日・機関名）",
    condition: (f) => f.criminalRecord === "有",
  },
  {
    key: "deportationHistory",
    section: "7. 犯罪・退去強制歴",
    label: "退去強制・出国命令を受けたことの有無",
    options: ["有", "無"],
    formTypes: ["coe"],
  },
  {
    key: "deportationLatestDate",
    section: "7. 犯罪・退去強制歴",
    label: "退去強制・出国命令の最終年月日",
    note: "例：2020-05-01",
    formTypes: ["coe"],
    condition: (f) => f.deportationHistory === "有",
  },
  {
    key: "familyInJapanExists",
    section: "8. 在日親族・同居者",
    label: "在日親族・同居者の有無",
    options: ["有", "無"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人 Part 2 — N型（就労系）
  // 技術・人文知識・国際業務 / 企業内転勤 / 研究 / 高度専門職 / 介護 / 技能 等
  // ══════════════════════════════════════════════════════════════════════════
  {
    key: "employerName",
    section: "9. 勤務先（N型 Part 2）",
    label: "勤務先名称",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "employerBranchName",
    section: "9. 勤務先（N型 Part 2）",
    label: "支店・事業所名",
    note: "本社勤務の場合は不要",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "employerAddress",
    section: "9. 勤務先（N型 Part 2）",
    label: "勤務先所在地",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "employerPhone",
    section: "9. 勤務先（N型 Part 2）",
    label: "勤務先電話番号",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "educationCountry",
    section: "10. 最終学歴（N型 Part 2）",
    label: "学校所在国・地域",
    note: "例：日本、中国",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "educationDegree",
    section: "10. 最終学歴（N型 Part 2）",
    label: "学位・区分",
    options: ["大学院（博士）", "大学院（修士）", "大学（学士）", "短期大学", "専門学校", "高等学校", "その他"],
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "educationSchoolName",
    section: "10. 最終学歴（N型 Part 2）",
    label: "学校名",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "educationGraduationDate",
    section: "10. 最終学歴（N型 Part 2）",
    label: "卒業（修了）年月日",
    note: "例：2018-03-31",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "majorCategory",
    section: "10. 最終学歴（N型 Part 2）",
    label: "専攻・専門分野",
    note: "例：情報工学、経営学、日本語",
    categories: ["N", "L", "I", "V"],
  },

  // ── 所属機関 Part 1（N型）────────────────────────────────────────────────
  {
    key: "orgName",
    section: "11. 所属機関情報（N型）",
    label: "法人名（所属機関名）",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "orgCorporateNumber",
    section: "11. 所属機関情報（N型）",
    label: "法人番号（13桁）",
    note: "国税庁法人番号公表サイトで確認",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "orgBranchName",
    section: "11. 所属機関情報（N型）",
    label: "支店・事業所名",
    note: "本社の場合は不要",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "orgAddress",
    section: "11. 所属機関情報（N型）",
    label: "所属機関所在地",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "orgPhone",
    section: "11. 所属機関情報（N型）",
    label: "所属機関電話番号",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "orgCapital",
    section: "11. 所属機関情報（N型）",
    label: "資本金（円）",
    note: "例：10000000",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "orgAnnualSales",
    section: "11. 所属機関情報（N型）",
    label: "年間売上高（円）",
    note: "直近決算期の売上高",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "orgEmployeeCount",
    section: "11. 所属機関情報（N型）",
    label: "常勤職員数（名）",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "orgForeignEmployeeCount",
    section: "11. 所属機関情報（N型）",
    label: "うち外国人職員数（名）",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "contractType",
    section: "11. 所属機関情報（N型）",
    label: "契約の種類",
    options: ["雇用", "委任", "委託", "その他"],
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "workPeriodFixed",
    section: "11. 所属機関情報（N型）",
    label: "就労期間の定め",
    options: ["定めあり", "定めなし"],
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "workPeriodDuration",
    section: "11. 所属機関情報（N型）",
    label: "就労期間（定めありの場合）",
    note: "例：2025-04-01 〜 2026-03-31",
    categories: ["N", "L", "I", "V"],
    condition: (f) => f.workPeriodFixed === "定めあり",
  },
  {
    key: "employmentStartDate",
    section: "11. 所属機関情報（N型）",
    label: "就労開始年月日",
    note: "例：2020-04-01",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "salary",
    section: "11. 所属機関情報（N型）",
    label: "給与・報酬（税引き前）",
    note: "例：350000（月額）、4200000（年額）",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "salaryType",
    section: "11. 所属機関情報（N型）",
    label: "給与の支払い形態",
    options: ["月額", "年額", "日額", "時間額"],
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "position",
    section: "11. 所属機関情報（N型）",
    label: "役職名",
    note: "例：システムエンジニア、主任研究員",
    categories: ["N", "L", "I", "V"],
  },
  {
    key: "activityDetails",
    section: "11. 所属機関情報（N型）",
    label: "従事する業務の内容",
    note: "具体的な業務内容を記入",
    categories: ["N", "L", "I", "V"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人 Part 2 — T型（日本人の配偶者等 / 永住者の配偶者等 / 定住者）
  // ══════════════════════════════════════════════════════════════════════════
  {
    key: "spouseFamilyNameEn",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者 — 姓（ローマ字 / Family Name）",
    categories: ["T"],
  },
  {
    key: "spouseGivenNameEn",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者 — 名（ローマ字 / Given Name）",
    categories: ["T"],
  },
  {
    key: "spouseDob",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者の生年月日",
    note: "例：1985-06-20",
    categories: ["T"],
  },
  {
    key: "spouseNationality",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者の国籍",
    categories: ["T"],
  },
  {
    key: "spouseResidenceStatus",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者の身分・在留資格",
    options: ["日本国籍", "永住者", "特別永住者", "その他"],
    categories: ["T"],
  },
  {
    key: "spouseResidenceCard",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者の在留カード番号（日本国籍以外）",
    note: "日本国籍の場合は不要",
    categories: ["T"],
  },
  {
    key: "spouseOccupation",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者の職業",
    note: "例：会社員、公務員",
    categories: ["T"],
  },
  {
    key: "spouseEmployer",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者の勤務先・通学先名称",
    categories: ["T"],
  },
  {
    key: "spouseAddress",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者の住所（別居の場合）",
    categories: ["T"],
    condition: (f) => f.cohabitation === "無",
  },
  {
    key: "marriageDate",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "婚姻（届出）年月日",
    note: "例：2020-05-10",
    categories: ["T"],
  },
  {
    key: "marriageRegistrationPlace",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "婚姻届出市区町村名",
    note: "例：東京都新宿区役所",
    categories: ["T"],
  },
  {
    key: "cohabitation",
    section: "12. 配偶者・身元保証人の情報（T型 Part 2）",
    label: "配偶者との同居の有無",
    options: ["有", "無"],
    categories: ["T"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人 Part 2 — R型（家族滞在）
  // ══════════════════════════════════════════════════════════════════════════

  // 17. 婚姻・出生届出
  {
    key: "marriageNotificationPlaceJapan",
    section: "13. 婚姻・出生届出（R型 Part 2 — 項目17）",
    label: "(1) 日本国届出先（市区町村役場名）",
    note: "例：東京都新宿区役所",
    categories: ["R"],
  },
  {
    key: "marriageNotificationDateJapan",
    section: "13. 婚姻・出生届出（R型 Part 2 — 項目17）",
    label: "(1) 日本国届出年月日",
    note: "例：2020-05-01",
    categories: ["R"],
  },
  {
    key: "marriageNotificationPlaceForeign",
    section: "13. 婚姻・出生届出（R型 Part 2 — 項目17）",
    label: "(2) 本国等届出先（登録機関名）",
    note: "例：中国民政局、ベトナム人民委員会",
    categories: ["R"],
  },
  {
    key: "marriageNotificationDateForeign",
    section: "13. 婚姻・出生届出（R型 Part 2 — 項目17）",
    label: "(2) 本国等届出年月日",
    note: "例：2020-04-20",
    categories: ["R"],
  },

  // 18. 滞在費支弁方法
  {
    key: "fundingMethod",
    section: "14. 滞在費支弁方法（R型 Part 2 — 項目18）",
    label: "滞在費支弁方法",
    options: ["親族負担", "外国からの送金", "身元保証人負担", "その他"],
    categories: ["R"],
  },

  // 19. 資格外活動
  {
    key: "partTimeWorkExistsR",
    section: "15. 資格外活動（R型 Part 2 — 項目19）",
    label: "資格外活動の有無",
    options: ["有", "無"],
    categories: ["R"],
  },
  {
    key: "partTimeWorkTypeR",
    section: "15. 資格外活動（R型 Part 2 — 項目19）",
    label: "資格外活動の内容",
    categories: ["R"],
    condition: (f) => f.partTimeWorkExistsR === "有",
  },
  {
    key: "partTimeWorkOrgNameR",
    section: "15. 資格外活動（R型 Part 2 — 項目19）",
    label: "資格外活動先の名称",
    categories: ["R"],
    condition: (f) => f.partTimeWorkExistsR === "有",
  },
  {
    key: "partTimeWorkHoursR",
    section: "15. 資格外活動（R型 Part 2 — 項目19）",
    label: "週間稼働時間（時間）",
    note: "例：28",
    categories: ["R"],
    condition: (f) => f.partTimeWorkExistsR === "有",
  },
  {
    key: "partTimeWorkSalaryR",
    section: "15. 資格外活動（R型 Part 2 — 項目19）",
    label: "報酬（円）",
    categories: ["R"],
    condition: (f) => f.partTimeWorkExistsR === "有",
  },

  // 扶養者情報（R型）
  {
    key: "supporterNameEn",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者 — 氏名（ローマ字）（例: YAMADA Taro）",
    categories: ["R"],
  },
  {
    key: "supporterDob",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の生年月日",
    note: "例：1985-04-15",
    categories: ["R"],
  },
  {
    key: "supporterNationality",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の国籍・地域",
    categories: ["R"],
  },
  {
    key: "supporterResidenceCard",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の在留カード番号（日本国籍以外）",
    note: "日本国籍の場合は不要",
    categories: ["R"],
  },
  {
    key: "supporterStatusOfResidence",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の在留資格",
    note: "例：技術・人文知識・国際業務、永住者",
    categories: ["R"],
  },
  {
    key: "supporterPeriodOfStay",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の在留期間",
    note: "例：3年、5年",
    categories: ["R"],
  },
  {
    key: "supporterPeriodExpiry",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の在留期間の満了日",
    note: "例：2026-09-30",
    categories: ["R"],
  },
  {
    key: "supporterRelationship",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者との関係（続柄）",
    options: ["夫", "妻", "父", "母", "養父", "養母", "その他"],
    categories: ["R"],
  },
  {
    key: "supporterEmployer",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の勤務先名称",
    categories: ["R"],
  },
  {
    key: "supporterCorporateNumber",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の勤務先法人番号（13桁）",
    categories: ["R"],
  },
  {
    key: "supporterBranchName",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の勤務先支店・事業所名",
    note: "本社勤務の場合は不要",
    categories: ["R"],
  },
  {
    key: "supporterAddress",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の勤務先所在地",
    categories: ["R"],
  },
  {
    key: "supporterAnnualIncome",
    section: "16. 扶養者の情報（R型 — 扶養者用Part 1）",
    label: "扶養者の年収（円）",
    note: "例：5000000",
    categories: ["R"],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人 Part 2 — P型（留学）
  // ══════════════════════════════════════════════════════════════════════════
  {
    key: "schoolName",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "学校名",
    categories: ["P"],
  },
  {
    key: "schoolType",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "学校の種別",
    options: ["大学院", "大学", "短期大学", "専門学校", "高等学校", "日本語学校", "その他"],
    categories: ["P"],
  },
  {
    key: "schoolAddress",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "学校所在地",
    categories: ["P"],
  },
  {
    key: "schoolPhone",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "学校電話番号",
    categories: ["P"],
  },
  {
    key: "enrollmentDate",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "入学年月日（または入学予定年月日）",
    note: "例：2023-04-01",
    categories: ["P"],
  },
  {
    key: "expectedGraduationDate",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "卒業予定年月日",
    note: "例：2025-03-31",
    categories: ["P"],
  },
  {
    key: "courseOfStudy",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "在籍コース・専攻",
    note: "例：日本語科、情報工学科",
    categories: ["P"],
  },
  {
    key: "annualTuition",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "年間学費（円）",
    note: "例：700000",
    categories: ["P"],
  },
  {
    key: "fundingSource",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "費用支弁方法",
    note: "例：本人負担、親族からの送金、奨学金",
    categories: ["P"],
  },
  {
    key: "fundingAmount",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "月額生活費（円）",
    note: "例：100000",
    categories: ["P"],
  },
  {
    key: "partTimeWorkPermit",
    section: "17. 在籍学校・学習内容（P型 Part 2）",
    label: "資格外活動許可の有無（アルバイト）",
    options: ["有", "無"],
    categories: ["P"],
  },
];

// ─── フォームタイプ変換 ────────────────────────────────────────────────────────
export function toFormType(t: string): string {
  if (t === "coe" || t === "certification") return "coe";
  if (t === "change") return "change";
  if (t === "extension" || t === "renewal") return "extension";
  return "extension";
}

// ─── 空欄質問フィルタリング ────────────────────────────────────────────────────
export function getEmptyQuestions(
  form: Partial<ApplicationFormData>,
  formType: string,
  cat: string,
): QQuestion[] {
  return ALL_QUESTIONS.filter((q) => {
    // formTypes フィルタ
    if (q.formTypes && !q.formTypes.includes(formType)) return false;
    // categories フィルタ
    if (q.categories && !q.categories.includes(cat)) return false;
    // 追加条件フィルタ
    if (q.condition && !q.condition(form)) return false;
    // 空欄チェック
    return isEmpty(form[q.key]);
  });
}
