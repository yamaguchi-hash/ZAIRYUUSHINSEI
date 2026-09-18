"use server";

import { auth } from "@/lib/auth";
import { db, applications, applicationDocumentChecklist, applicationAttachments, applicantMaster } from "@/lib/db";
import { cleanseMasterCodes } from "@/lib/master-cleansing";
import { cleanseNumeric, cleanseNumericInt } from "@/lib/numeric-cleansing";
import { computeTimeConvertedBasicSalary } from "@/lib/salary-conversion";
import { FAMILY_IN_JAPAN_SCHEMA, normalizeFamilyMembers, mergeFamilyMembers } from "@/lib/family-schema";
import { mapWithConcurrency } from "@/lib/concurrency";
import { eq, and } from "drizzle-orm";
import { Type } from "@google/genai";

// ─── セクションキー定義 ───────────────────────────────────────────────────────
export type SectionKey =
  | "basic"       // 基本情報（氏名・国籍・生年月日・出生地・職業等）
  | "contact"     // 日本の連絡先（住所・電話）
  | "passport"    // 旅券（番号・有効期限）
  | "status"      // 現在の在留状況（資格・期間・満了日・カード番号）
  | "employer"    // 勤務先情報（N型）
  | "education"   // 学歴（N型）
  | "workhistory" // 職歴（N型）
  | "family"      // 在日親族及び同居者（全申請種別共通・項目16/21）
  | "marriage"    // 婚姻・出生・縁組届出（R型 項目17）
  | "supporter"   // 扶養者情報（R型）
  | "spouse"      // 配偶者情報（T型）
  | "school"      // 学校情報（P型）
  | "org"         // 所属機関情報
  | "orgV"        // 特定技能 雇用契約・所属機関詳細（V型）
  | "orgVCompliance" // 特定技能 所属機関コンプライアンス確認（V型）
  | "orgEmploymentConditions" // 雇用条件書（参考様式第1-6号）からの特定技能雇用契約 (1)〜(11) 抽出
  | "rso";        // 登録支援機関（V型）

// ─── セクション別プロンプト定義 ───────────────────────────────────────────────
/** 文字列型nullable のショートカット */
const S = (desc: string) => ({ type: Type.STRING, description: desc, nullable: true });

// 数値クレンジング対象（<input type="number"> へバインドされるフィールド）
const NUMERIC_FIELDS_BY_SECTION: Partial<Record<SectionKey, string[]>> = {
  orgEmploymentConditions: [
    "orgWorkHoursWeekly", "orgWorkHoursMonthly", "orgWorkDaysWeekly", "orgWorkHoursDaily",
    "salary", "orgMonthlyTotalEstimate", "orgTimeConvertedBasicSalary",
    "orgOvertimeRate", "orgHolidayRate", "orgNightShiftRate",
  ],
  orgV: [
    "orgWorkHoursWeekly", "orgWorkHoursMonthly",
    "salary", "orgTimeConvertedBasicSalary", "orgJapaneseEquivalentSalary",
  ],
};

// 申請書様式が整数を前提とするフィールド（小数点以下を四捨五入して整数化する）
const INTEGER_NUMERIC_FIELDS = new Set(["orgWorkHoursWeekly", "orgWorkHoursMonthly"]);

// 就業の場所（所在地）等の住所文字列を AddressSplitSimple の永続形式
// 「〒1234567|住所」へ正規化する（郵便番号が含まれない場合はそのまま）
function normalizeAddressWithZip(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s || /^〒\d{7}\|/.test(s)) return s;
  const m = s.match(/〒?\s*(\d{3})[-ー−]?(\d{4})\s*/);
  if (!m) return s;
  const rest = (s.slice(0, m.index) + s.slice((m.index ?? 0) + m[0].length)).trim();
  return `〒${m[1]}${m[2]}|${rest}`;
}

const SECTION_CONFIG: Record<
  SectionKey,
  { label: string; sources: string; jsonTemplate: string; responseSchema: any; extraInstructions?: string }
> = {
  basic: {
    label: "基本情報",
    sources: "パスポート・在留カード・戸籍謄本・出生証明書",
    jsonTemplate: `{
  "nationality": "国籍・地域（例：中国、ベトナム）",
  "dateOfBirth": "生年月日（YYYY-MM-DD）",
  "familyNameEn": "姓（ローマ字・パスポート記載の大文字）",
  "givenNameEn": "名（ローマ字・パスポート記載の大文字）",
  "sex": "性別（男 または 女）",
  "placeOfBirth": "出生地（都市・国名）",
  "maritalStatus": "配偶者の有無（有 または 無）",
  "occupation": "職業（例：会社員、主婦、留学生）",
  "homeTownCity": "本国における居住地（都市・国名）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        nationality:   S("国籍・地域（例：中国、ベトナム）"),
        dateOfBirth:   S("生年月日（YYYY-MM-DD）"),
        familyNameEn:  S("姓（ローマ字・パスポート記載の大文字）"),
        givenNameEn:   S("名（ローマ字・パスポート記載の大文字）"),
        sex:           S("性別（男 または 女）"),
        placeOfBirth:  S("出生地（都市・国名）"),
        maritalStatus: S("配偶者の有無（有 または 無）"),
        occupation:    S("職業（例：会社員、主婦、留学生）"),
        homeTownCity:  S("本国における居住地（都市・国名）"),
      },
    },
  },

  contact: {
    label: "日本の連絡先",
    sources: "住民票・在留カード・公共料金領収書",
    jsonTemplate: `{
  "postalCodeInJapan": "郵便番号（7桁・ハイフンなし。例：1600023）",
  "prefectureInJapan": "都道府県（例：東京都、大阪府）",
  "cityInJapan": "市区町村（例：新宿区西新宿、大阪市北区）",
  "addressLineInJapan": "番地・建物名・部屋番号（例：2-8-1 ○○マンション305号室）",
  "telephoneNo": "固定電話番号（例：03-1234-5678）",
  "cellularPhoneNo": "携帯電話番号（例：090-1234-5678）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        postalCodeInJapan: S("郵便番号（7桁・ハイフンなし）"),
        prefectureInJapan: S("都道府県"),
        cityInJapan:       S("市区町村"),
        addressLineInJapan: S("番地・建物名・部屋番号"),
        telephoneNo:       S("固定電話番号"),
        cellularPhoneNo:   S("携帯電話番号"),
      },
    },
  },

  passport: {
    label: "旅券（パスポート）",
    sources: "パスポート（顔写真ページ・データページ）",
    jsonTemplate: `{
  "passportNumber": "パスポート番号（英数字。例：AB1234567）",
  "passportExpiry": "パスポート有効期限（YYYY-MM-DD）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        passportNumber: S("パスポート番号（英数字）"),
        passportExpiry: S("パスポート有効期限（YYYY-MM-DD）"),
      },
    },
  },

  status: {
    label: "現在の在留状況",
    sources: "在留カード（表面・裏面）・在留資格変更許可証",
    jsonTemplate: `{
  "currentStatusOfResidence": "在留資格（日本語。例：家族滞在、技術・人文知識・国際業務、留学）",
  "currentPeriodOfStay": "在留期間の長さ（在留カード記載。例：3年、1年、3年6月）",
  "currentPeriodExpiry": "在留期間満了日（YYYY-MM-DD）",
  "residenceCardNumber": "在留カード番号（英数字12桁。例：AB12345678CD）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        currentStatusOfResidence: S("在留資格（日本語）"),
        currentPeriodOfStay:     S("在留期間の長さ"),
        currentPeriodExpiry:     S("在留期間満了日（YYYY-MM-DD）"),
        residenceCardNumber:     S("在留カード番号（英数字12桁）"),
      },
    },
  },

  employer: {
    label: "勤務先情報",
    sources: "雇用契約書・在職証明書・採用通知書・給与明細・源泉徴収票",
    jsonTemplate: `{
  "employerName": "勤務先名称（正式名称）",
  "employerBranchName": "支店・事業所名（ある場合）",
  "employerAddress": "勤務先所在地（フル住所）",
  "employerPhone": "勤務先電話番号",
  "salary": "給与・報酬額（数値のみ。例：300000）",
  "salaryType": "給与種別（月額 または 年額）",
  "position": "職務上の地位・役職名（例：システムエンジニア、営業部長）",
  "activityDetails": "業務内容・職務内容の詳細",
  "employmentStartDate": "雇用開始年月日（YYYY-MM-DD）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        employerName:       S("勤務先名称（正式名称）"),
        employerBranchName: S("支店・事業所名"),
        employerAddress:    S("勤務先所在地（フル住所）"),
        employerPhone:      S("勤務先電話番号"),
        salary:             S("給与・報酬額（数値のみ）"),
        salaryType:         S("給与種別（月額 または 年額）"),
        position:           S("職務上の地位・役職名"),
        activityDetails:    S("業務内容・職務内容の詳細"),
        employmentStartDate: S("雇用開始年月日（YYYY-MM-DD）"),
      },
    },
  },

  education: {
    label: "最終学歴",
    sources: "卒業証明書・学位記・成績証明書・在学証明書",
    jsonTemplate: `{
  "educationCountry": "学校所在国（本邦（日本） または 外国）",
  "educationDegree": "学位・区分（大学院（博士）/大学院（修士）/大学/短期大学/専門学校/高等学校等）",
  "educationSchoolName": "学校名（正式名称）",
  "educationGraduationDate": "卒業年月日（YYYY-MM-DD）",
  "majorCategory": "専攻・専門分野（例：情報工学、経営学）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        educationCountry:        S("学校所在国（本邦（日本） または 外国）"),
        educationDegree:         S("学位・区分"),
        educationSchoolName:     S("学校名（正式名称）"),
        educationGraduationDate: S("卒業年月日（YYYY-MM-DD）"),
        majorCategory:           S("専攻・専門分野"),
      },
    },
  },

  workhistory: {
    label: "職歴",
    sources: "職務経歴書・退職証明書・在職証明書・源泉徴収票",
    jsonTemplate: `{
  "workHistory": [
    {
      "joinDate": "入社年月（YYYY-MM形式）",
      "leaveDate": "退社年月（YYYY-MM形式。現職は空文字）",
      "employer": "勤務先名称"
    }
  ]
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        workHistory: {
          type: Type.ARRAY,
          description: "職歴一覧（古い順）",
          items: {
            type: Type.OBJECT,
            properties: {
              joinDate:  S("入社年月（YYYY-MM形式）"),
              leaveDate: S("退社年月（YYYY-MM形式。現職は空文字）"),
              employer:  S("勤務先名称"),
            },
          },
        },
      },
    },
  },

  family: {
    label: "在日親族及び同居者",
    sources: "親族の在留カード・親族情報のメモ・住民票・戸籍謄本",
    jsonTemplate: `{
  "familyInJapan": [
    {
      "relationship": "申請人との続柄（父/母/配偶者/子/兄/姉/弟/妹/祖父/祖母/その他）",
      "name": "氏名（在留カード記載のローマ字または漢字）",
      "dateOfBirth": "生年月日（YYYY-MM-DD形式）",
      "nationality": "国籍・地域",
      "placeOfEmployment": "勤務先・通学先の名称",
      "residingTogether": "同居の有無（有 または 無）",
      "residenceCardNumber": "在留カード番号（例：AB12345678CD）"
    }
  ]
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        familyInJapan: FAMILY_IN_JAPAN_SCHEMA,
      },
    },
  },

  marriage: {
    label: "婚姻・出生・縁組届出（項目17）",
    sources: "婚姻届受理証明書・戸籍謄本・戸籍抄本・外国の婚姻証明書・出生証明書",
    jsonTemplate: `{
  "marriageNotificationPlaceJapan": "日本の市区町村役場への届出先（例：大阪市北区役所）",
  "marriageNotificationDateJapan": "日本の役場への届出年月日（YYYY-MM-DD）",
  "marriageNotificationPlaceForeign": "本国等の機関への届出先（例：中国民政局上海市徐匯区）",
  "marriageNotificationDateForeign": "本国等への届出年月日（YYYY-MM-DD）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        marriageNotificationPlaceJapan:   S("日本の市区町村役場への届出先"),
        marriageNotificationDateJapan:    S("日本への届出年月日（YYYY-MM-DD）"),
        marriageNotificationPlaceForeign: S("本国等の機関への届出先"),
        marriageNotificationDateForeign:  S("本国等への届出年月日（YYYY-MM-DD）"),
      },
    },
  },

  supporter: {
    label: "扶養者情報（R型）",
    sources: "扶養者のパスポート・在留カード・在職証明書・源泉徴収票・雇用契約書・登記簿謄本",
    jsonTemplate: `{
  "supporterNameEn": "扶養者（申請人の配偶者や親）の氏名（ローマ字。姓名を半角スペース区切りで。例：YAMADA Taro）",
  "supporterDob": "扶養者の生年月日（YYYY-MM-DD）",
  "supporterNationality": "扶養者の国籍・地域",
  "supporterResidenceCard": "扶養者の在留カード番号（英数字12桁）",
  "supporterStatusOfResidence": "扶養者の在留資格（日本語。例：技術・人文知識・国際業務、永住者）",
  "supporterPeriodOfStay": "扶養者の在留期間の長さ（在留カード記載。例：3年、1年）",
  "supporterPeriodExpiry": "扶養者の在留期間満了日（在留カードの満了日欄。YYYY-MM-DD形式）",
  "supporterRelationship": "申請人との続柄（夫/妻/父/母/養父/養母/その他）",
  "supporterEmployer": "扶養者の勤務先名称",
  "supporterCorporateNumber": "扶養者の勤務先法人番号（13桁）",
  "supporterBranchName": "扶養者の支店・事業所名",
  "supporterEmployerAddress": "扶養者の勤務先所在地（フル住所）",
  "supporterEmployerPhone": "扶養者の勤務先電話番号",
  "supporterAnnualIncome": "扶養者の年収（数値のみ・円）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        supporterNameEn:             S("扶養者の氏名（ローマ字）"),
        supporterDob:                S("扶養者の生年月日（YYYY-MM-DD）"),
        supporterNationality:        S("扶養者の国籍・地域"),
        supporterResidenceCard:      S("扶養者の在留カード番号（英数字12桁）"),
        supporterStatusOfResidence:  S("扶養者の在留資格（日本語）"),
        supporterPeriodOfStay:       S("扶養者の在留期間の長さ"),
        supporterPeriodExpiry:       S("扶養者の在留期間満了日（YYYY-MM-DD）"),
        supporterRelationship:       S("申請人との続柄（夫/妻/父/母 等）"),
        supporterEmployer:           S("扶養者の勤務先名称"),
        supporterCorporateNumber:    S("扶養者の勤務先法人番号（13桁）"),
        supporterBranchName:         S("扶養者の支店・事業所名"),
        supporterEmployerAddress:    S("扶養者の勤務先所在地"),
        supporterEmployerPhone:      S("扶養者の勤務先電話番号"),
        supporterAnnualIncome:       S("扶養者の年収（数値のみ・円）"),
      },
    },
  },

  spouse: {
    label: "配偶者情報（T型）",
    sources: "戸籍謄本・婚姻届受理証明書・配偶者のパスポート・在留カード",
    jsonTemplate: `{
  "spouseFamilyNameEn": "配偶者 姓（ローマ字）",
  "spouseGivenNameEn": "配偶者 名（ローマ字）",
  "spouseDob": "配偶者 生年月日（YYYY-MM-DD）",
  "spouseNationality": "配偶者 国籍（例：日本）",
  "spouseResidenceStatus": "配偶者 身分（日本国籍/永住者/特別永住者）",
  "spouseResidenceCard": "配偶者 在留カード番号（日本国籍の場合は空文字）",
  "spouseOccupation": "配偶者 職業",
  "spouseEmployer": "配偶者 勤務先・通学先",
  "spouseAddress": "配偶者 住所（日本）",
  "marriageDate": "婚姻年月日（YYYY-MM-DD）",
  "marriageRegistrationPlace": "婚姻届出市区町村名",
  "cohabitation": "同居の有無（有 または 無）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        spouseFamilyNameEn:      S("配偶者 姓（ローマ字）"),
        spouseGivenNameEn:       S("配偶者 名（ローマ字）"),
        spouseDob:               S("配偶者 生年月日（YYYY-MM-DD）"),
        spouseNationality:       S("配偶者 国籍"),
        spouseResidenceStatus:   S("配偶者 身分（日本国籍/永住者/特別永住者）"),
        spouseResidenceCard:     S("配偶者 在留カード番号"),
        spouseOccupation:        S("配偶者 職業"),
        spouseEmployer:          S("配偶者 勤務先・通学先"),
        spouseAddress:           S("配偶者 住所"),
        marriageDate:            S("婚姻年月日（YYYY-MM-DD）"),
        marriageRegistrationPlace: S("婚姻届出市区町村名"),
        cohabitation:            S("同居の有無（有 または 無）"),
      },
    },
  },

  school: {
    label: "学校情報（P型）",
    sources: "在学証明書・合格通知書・授業料納入証明書・入学許可書",
    jsonTemplate: `{
  "schoolName": "学校名（正式名称）",
  "schoolType": "学校種別（大学院/大学/短期大学/専門学校/高等学校/日本語学校/その他）",
  "schoolAddress": "学校所在地",
  "schoolPhone": "学校電話番号",
  "enrollmentDate": "入学年月日（YYYY-MM-DD）",
  "expectedGraduationDate": "卒業（修了）予定年月日（YYYY-MM-DD）",
  "courseOfStudy": "在籍コース・専攻名",
  "annualTuition": "年間学費（数値のみ・円）",
  "fundingSource": "費用支弁方法（例：親族負担、奨学金）",
  "fundingAmount": "月額生活費（数値のみ・円）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        schoolName:             S("学校名（正式名称）"),
        schoolType:             S("学校種別"),
        schoolAddress:          S("学校所在地"),
        schoolPhone:            S("学校電話番号"),
        enrollmentDate:         S("入学年月日（YYYY-MM-DD）"),
        expectedGraduationDate: S("卒業予定年月日（YYYY-MM-DD）"),
        courseOfStudy:          S("在籍コース・専攻名"),
        annualTuition:          S("年間学費（数値のみ・円）"),
        fundingSource:          S("費用支弁方法"),
        fundingAmount:          S("月額生活費（数値のみ・円）"),
      },
    },
  },

  org: {
    label: "所属機関情報",
    sources: "登記簿謄本・決算書・会社案内・雇用保険適用事業所番号通知書・社会保険料納入証明書",
    jsonTemplate: `{
  "orgName": "機関名称（正式名称）",
  "orgCorporateNumber": "法人番号（13桁）",
  "orgBranchName": "支店・事業所名",
  "orgEmploymentInsuranceNo": "雇用保険適用事業所番号（11桁）",
  "orgLaborInsuranceNo": "労働保険番号（14桁）",
  "orgAddress": "所在地（フル住所）",
  "orgPhone": "電話番号",
  "orgCapital": "資本金（数値のみ・円）",
  "orgAnnualSales": "年間売上高（数値のみ・円）",
  "orgEmployeeCount": "従業員数（数値のみ）",
  "orgForeignEmployeeCount": "うち外国人職員数（数値のみ）",
  "orgHealthInsuranceMet": "健康保険・厚生年金保険の加入状況（有 または 無）",
  "orgLaborInsuranceMet": "労災保険・雇用保険の加入状況（有 または 無）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        orgName:                    S("機関名称（正式名称）"),
        orgCorporateNumber:         S("法人番号（13桁）"),
        orgBranchName:              S("支店・事業所名"),
        orgEmploymentInsuranceNo:   S("雇用保険適用事業所番号（11桁）"),
        orgLaborInsuranceNo:        S("労働保険番号（14桁）"),
        orgAddress:                 S("所在地（フル住所）"),
        orgPhone:                   S("電話番号"),
        orgCapital:                 S("資本金（数値のみ・円）"),
        orgAnnualSales:             S("年間売上高（数値のみ・円）"),
        orgEmployeeCount:           S("従業員数（数値のみ）"),
        orgForeignEmployeeCount:    S("うち外国人職員数（数値のみ）"),
        orgHealthInsuranceMet:      S("健康保険・厚生年金保険の加入状況（有 または 無）"),
        orgLaborInsuranceMet:       S("労災保険・雇用保険の加入状況（有 または 無）"),
      },
    },
  },

  orgV: {
    label: "特定技能 雇用契約・所属機関詳細",
    sources: "雇用契約書・雇用条件書・労働条件通知書・特定技能所属機関概要書・登録支援機関概要書・派遣計画書",
    jsonTemplate: `{
  "orgContractStartDate": "雇用契約期間（始）（YYYY-MM-DD）",
  "orgContractEndDate": "雇用契約期間（終）（YYYY-MM-DD）",
  "orgSpecifiedIndustrialField": "特定産業分野（例：飲食料品製造業、建設業 等）",
  "orgWorkCategory": "業務区分",
  "orgOccupationNumber": "主職種番号",
  "orgWorkHoursWeekly": "所定労働時間（週平均）（数値のみ・時間）",
  "orgWorkHoursMonthly": "所定労働時間（月平均）（数値のみ・時間）",
  "orgWorkHoursEquivalent": "正規労働者と同等の所定労働時間か（有 または 無）",
  "salary": "給与・報酬額（月額 数値のみ・円）",
  "orgTimeConvertedBasicSalary": "基本給の時間換算額（数値のみ・円）",
  "orgJapaneseEquivalentSalary": "同種業務に従事する日本人の月額報酬（数値のみ・円）",
  "orgSalaryEqualToJapanese": "日本人と同等以上の報酬か（有 または 無）",
  "orgSalaryPaymentCash": "現金払い（有 または 無）",
  "orgSalaryPaymentBank": "銀行振込（有 または 無）",
  "orgForeignTreatmentDifference": "外国人であることを理由とした差別的な取扱いの有無（有 または 無）",
  "orgPaidHolidayForReturn": "一時帰国のための有給休暇の付与（有 または 無）",
  "orgFieldSpecificEmploymentCriteria": "分野別雇用形態に関する基準への適合（有 または 無）",
  "orgReturnTravelExpenses": "帰国旅費の負担（有 または 無）",
  "orgHealthCheck": "健康状況その他の生活状況の把握（有 または 無）",
  "orgProperResidenceCriteria": "適正な在留に必要な措置（有 または 無）",
  "orgVDispatchName": "派遣先 名称",
  "orgVDispatchCorporateNo": "派遣先 法人番号（13桁）",
  "orgVDispatchInsuranceNo": "派遣先 雇用保険適用事業所番号",
  "orgVDispatchAddress": "派遣先 住所",
  "orgVDispatchPhone": "派遣先 電話番号",
  "orgVDispatchRepresentative": "派遣先 代表者氏名",
  "orgVDispatchStartDate": "派遣期間（始）（YYYY-MM-DD）",
  "orgVDispatchEndDate": "派遣期間（終）（YYYY-MM-DD）",
  "orgPlacementProviderName": "職業紹介事業者 名称",
  "orgPlacementProviderCorporateNo": "職業紹介事業者 法人番号（13桁）",
  "orgPlacementProviderInsuranceNo": "職業紹介事業者 雇用保険適用事業所番号",
  "orgPlacementProviderAddress": "職業紹介事業者 住所",
  "orgPlacementProviderPhone": "職業紹介事業者 電話番号",
  "orgPlacementProviderLicenseNo": "職業紹介事業者 許可番号",
  "orgPlacementProviderLicenseDate": "職業紹介事業者 許可年月日（YYYY-MM-DD）",
  "orgIntermediaryName": "取次機関 名称",
  "orgIntermediaryAddress": "取次機関 住所",
  "orgIntermediaryPhone": "取次機関 電話番号",
  "supportManagerName": "支援責任者 氏名",
  "supportManagerTitle": "支援責任者 役職・部署",
  "supportStaffName": "支援担当者 氏名",
  "supportStaffTitle": "支援担当者 役職・部署",
  "rsoName": "登録支援機関 名称",
  "rsoCorporateNo": "登録支援機関 法人番号（13桁）",
  "rsoInsuranceNo": "登録支援機関 雇用保険適用事業所番号",
  "rsoAddress": "登録支援機関 住所",
  "rsoPhone": "登録支援機関 電話番号",
  "rsoRepresentative": "登録支援機関 代表者氏名",
  "rsoRegNo": "登録支援機関 登録番号"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        // 雇用契約
        orgContractStartDate:       S("雇用契約期間（始）YYYY-MM-DD"),
        orgContractEndDate:         S("雇用契約期間（終）YYYY-MM-DD"),
        orgSpecifiedIndustrialField: S("特定産業分野"),
        orgWorkCategory:            S("業務区分"),
        orgOccupationNumber:        S("主職種番号"),
        // 所定労働時間
        orgWorkHoursWeekly:         S("所定労働時間（週平均・数値のみ・時間）"),
        orgWorkHoursMonthly:        S("所定労働時間（月平均・数値のみ・時間）"),
        orgWorkHoursEquivalent:     S("正規労働者と同等か（有 または 無）"),
        // 報酬
        salary:                     S("給与・報酬額（月額・数値のみ・円）"),
        orgTimeConvertedBasicSalary: S("基本給の時間換算額（数値のみ・円）"),
        orgJapaneseEquivalentSalary: S("同種業務日本人の月額報酬（数値のみ・円）"),
        orgSalaryEqualToJapanese:   S("日本人同等以上の報酬か（有 または 無）"),
        // 支払方法
        orgSalaryPaymentCash:       S("現金払い（有 または 無）"),
        orgSalaryPaymentBank:       S("銀行振込（有 または 無）"),
        // 雇用条件チェック項目 (6)-(11)
        orgForeignTreatmentDifference: S("外国人差別的取扱い（有 または 無）"),
        orgPaidHolidayForReturn:    S("一時帰国有給休暇（有 または 無）"),
        orgFieldSpecificEmploymentCriteria: S("分野別雇用基準（有 または 無）"),
        orgReturnTravelExpenses:    S("帰国旅費負担（有 または 無）"),
        orgHealthCheck:             S("健康状況確認（有 または 無）"),
        orgProperResidenceCriteria: S("適正在留基準（有 または 無）"),
        // 派遣先 (12)
        orgVDispatchName:           S("派遣先 名称"),
        orgVDispatchCorporateNo:    S("派遣先 法人番号（13桁）"),
        orgVDispatchInsuranceNo:    S("派遣先 雇用保険適用事業所番号"),
        orgVDispatchAddress:        S("派遣先 住所"),
        orgVDispatchPhone:          S("派遣先 電話番号"),
        orgVDispatchRepresentative: S("派遣先 代表者氏名"),
        orgVDispatchStartDate:      S("派遣期間（始）YYYY-MM-DD"),
        orgVDispatchEndDate:        S("派遣期間（終）YYYY-MM-DD"),
        // 職業紹介事業者 (13)
        orgPlacementProviderName:           S("職業紹介事業者 名称"),
        orgPlacementProviderCorporateNo:    S("職業紹介事業者 法人番号（13桁）"),
        orgPlacementProviderInsuranceNo:    S("職業紹介事業者 雇用保険適用事業所番号"),
        orgPlacementProviderAddress:        S("職業紹介事業者 住所"),
        orgPlacementProviderPhone:          S("職業紹介事業者 電話番号"),
        orgPlacementProviderLicenseNo:      S("職業紹介事業者 許可番号"),
        orgPlacementProviderLicenseDate:    S("職業紹介事業者 許可年月日 YYYY-MM-DD"),
        // 取次機関 (14)
        orgIntermediaryName:        S("取次機関 名称"),
        orgIntermediaryAddress:     S("取次機関 住所"),
        orgIntermediaryPhone:       S("取次機関 電話番号"),
        // 支援計画
        supportManagerName:         S("支援責任者 氏名"),
        supportManagerTitle:        S("支援責任者 役職・部署"),
        supportStaffName:           S("支援担当者 氏名"),
        supportStaffTitle:          S("支援担当者 役職・部署"),
        // 登録支援機関
        rsoName:                    S("登録支援機関 名称"),
        rsoCorporateNo:             S("登録支援機関 法人番号（13桁）"),
        rsoInsuranceNo:             S("登録支援機関 雇用保険適用事業所番号"),
        rsoAddress:                 S("登録支援機関 住所"),
        rsoPhone:                   S("登録支援機関 電話番号"),
        rsoRepresentative:          S("登録支援機関 代表者氏名"),
        rsoRegNo:                   S("登録支援機関 登録番号"),
      },
    },
  },

  orgVCompliance: {
    label: "特定技能 所属機関コンプライアンス確認",
    sources: "特定技能所属機関概要書・誓約書・宣誓書",
    jsonTemplate: `{
  "orgLaborLawViolation": "労働・社会保険・租税法令違反の有無（有 または 無）",
  "orgLaborLawViolationDetail": "違反の詳細（有の場合のみ）",
  "orgInvoluntaryDismissal": "非自発的離職の有無（有 または 無）",
  "orgInvoluntaryDismissalDetail": "詳細",
  "orgMissingPerson": "行方不明者を発生させたことの有無（有 または 無）",
  "orgMissingPersonDetail": "詳細",
  "orgCriminalPunishment": "刑事処分（刑罰）の有無（有 または 無）",
  "orgCriminalPunishmentDetail": "詳細",
  "orgMentalDisability": "精神の機能の障害による欠格の有無（有 または 無）",
  "orgBankruptcy": "破産手続開始の有無（有 または 無）",
  "orgTrainingRevoked": "実習認定取消の有無（有 または 無）",
  "orgWasOfficerOfRevoked": "実習認定取消法人の役員であった有無（有 または 無）",
  "orgIllegalActFiveYears": "出入国・労働法令上の不正行為5年以内の有無（有 または 無）",
  "orgGangsterMember": "暴力団員の有無（有 または 無）",
  "orgLegalAgentViolation": "法定代理人が(14)〜(20)に該当（有 または 無）",
  "orgGangsterControl": "暴力団員等に事業活動を支配される者か（有 または 無）",
  "orgActivityDocumentKept": "活動内容文書の作成・1年以上保管（有 または 無）",
  "orgAwareOfDeposit": "保証金・財産管理等契約を認識しての締結（有 または 無）",
  "orgPenaltyContractExists": "不履行についての違約金支払契約の有無（有 または 無）",
  "orgSupportCostNotBurdened": "支援費用を外国人に負担させないこと（有 または 無）",
  "orgDispatchMeetsCondition": "労働者派遣の場合，派遣先が法定要件のいずれかに該当（有 または 無）",
  "orgDispatchConditionDetail": "該当する項目・内容（有の場合のみ）",
  "orgDispatchMeetsCompliance": "労働者派遣の場合，派遣先が(11)〜(22)に該当していることの有無（有 または 無）",
  "orgDispatchComplianceDetail": "詳細（有の場合のみ）",
  "orgAccidentInsurance": "労災保険加入等の措置（有 または 無）",
  "orgContinuousPerformance": "雇用契約を継続して履行する体制（有 または 無）",
  "orgSalaryPaymentVerifiable": "報酬の支払を口座振込等の客観的方法で確認できること（有 または 無）",
  "orgCoexistenceCooperation": "地方公共団体からの共生社会関係施策への協力要請に必要な協力をすること（有 または 無）",
  "orgFieldSpecificContractCriteria": "分野別雇用契約適正履行基準への適合（有 または 無）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        orgLaborLawViolation:        S("労働・社会保険・租税法令違反（有 または 無）"),
        orgLaborLawViolationDetail:  S("詳細"),
        orgInvoluntaryDismissal:     S("非自発的離職（有 または 無）"),
        orgInvoluntaryDismissalDetail: S("詳細"),
        orgMissingPerson:            S("行方不明者発生（有 または 無）"),
        orgMissingPersonDetail:      S("詳細"),
        orgCriminalPunishment:       S("刑事処分（有 または 無）"),
        orgCriminalPunishmentDetail: S("詳細"),
        orgMentalDisability:         S("精神の機能の障害（有 または 無）"),
        orgMentalDisabilityDetail:   S("詳細"),
        orgBankruptcy:               S("破産手続開始（有 または 無）"),
        orgBankruptcyDetail:         S("詳細"),
        orgTrainingRevoked:          S("実習認定取消（有 または 無）"),
        orgTrainingRevokedDetail:    S("詳細"),
        orgWasOfficerOfRevoked:      S("取消法人の役員（有 または 無）"),
        orgWasOfficerOfRevokedDetail: S("詳細"),
        orgIllegalActFiveYears:      S("不正行為5年以内（有 または 無）"),
        orgIllegalActFiveYearsDetail: S("詳細"),
        orgGangsterMember:           S("暴力団員（有 または 無）"),
        orgGangsterMemberDetail:     S("詳細"),
        orgLegalAgentViolation:      S("法定代理人該当（有 または 無）"),
        orgLegalAgentViolationDetail: S("詳細"),
        orgGangsterControl:          S("暴力団支配（有 または 無）"),
        orgGangsterControlDetail:    S("詳細"),
        orgActivityDocumentKept:     S("活動内容文書の保管（有 または 無）"),
        orgAwareOfDeposit:           S("保証金認識（有 または 無）"),
        orgAwareOfDepositDetail:     S("詳細"),
        orgPenaltyContractExists:    S("違約金契約（有 または 無）"),
        orgPenaltyContractDetail:    S("詳細"),
        orgSupportCostNotBurdened:   S("支援費用不負担（有 または 無）"),
        orgDispatchMeetsCondition:   S("派遣先法定要件該当（有 または 無）"),
        orgDispatchConditionDetail:  S("詳細"),
        orgDispatchMeetsCompliance:  S("派遣先コンプライアンス（有 または 無）"),
        orgDispatchComplianceDetail: S("詳細"),
        orgAccidentInsurance:        S("労災保険加入（有 または 無）"),
        orgAccidentInsuranceDetail:  S("詳細"),
        orgContinuousPerformance:    S("雇用契約継続履行体制（有 または 無）"),
        orgSalaryPaymentVerifiable:  S("報酬支払確認可能（有 または 無）"),
        orgCoexistenceCooperation:   S("共生社会施策協力（有 または 無）"),
        orgFieldSpecificContractCriteria: S("分野別基準適合（有 または 無）"),
      },
    },
  },

  orgEmploymentConditions: {
    label: "雇用条件書（特定技能雇用契約 (1)〜(11)）",
    sources: "雇用条件書（参考様式第1-6号）・別紙「賃金の支払に関する書面」・特定技能雇用契約書",
    jsonTemplate: `{
  "orgContractStartDate": "(1) 雇用契約期間の開始日（YYYY-MM-DD）",
  "orgContractEndDate": "(1) 雇用契約期間の満了日（YYYY-MM-DD）",
  "orgContractRenewal": "(1) 契約更新の有無・内容（自動的に更新する／更新する場合があり得る／契約の更新はしない 等）",
  "orgVWorkplaceName": "(2) 就業の場所の名称",
  "orgVWorkplaceAddress": "(2) 就業の場所の所在地（住所）",
  "orgWorkCategory": "(3) 業務区分（特定産業分野の業務区分。例：飲食料品製造、機械金属加工 等）",
  "orgWorkHoursWeekly": "(4) 所定労働時間（週・数値のみ・時間）",
  "orgWorkHoursMonthly": "(4) 所定労働時間（月・数値のみ・時間）",
  "orgWorkDaysWeekly": "(4) 所定労働日数（週・数値のみ・日）",
  "orgWorkHoursDaily": "(4) 1日の所定労働時間（数値のみ・時間。例：8）",
  "salary": "(5) 基本賃金（月給・日給・時給等の額。数値のみ・円、カンマ除去）",
  "orgBasicSalaryType": "(5) 基本賃金の区分（月給／日給／時給 のいずれか。チェックされている区分）",
  "orgTimeConvertedBasicSalary": "(5) 基本給の時間換算額（書面に直接記載がある場合のみ。数値のみ・円。記載がなければ空文字列）",
  "orgAllowancesDetail": "(5) 諸手当の名称と金額の一覧（例：役職手当 10000円、技能手当 5000円。複数は読点区切り）",
  "orgMonthlyTotalEstimate": "(5) 1か月当たりの支払概算額の合計（数値のみ・円、カンマ除去）",
  "orgSalaryEqualityExplanation": "(6) 報酬が日本人と同等以上であることの説明・支給要件・決定理由（諸手当の支給要件等から抽出）",
  "orgOvertimeRate": "(7) 所定時間外（時間外）労働の割増賃金率（数値のみ・%）",
  "orgHolidayRate": "(7) 休日労働の割増賃金率（数値のみ・%）",
  "orgNightShiftRate": "(7) 深夜労働の割増賃金率（数値のみ・%）",
  "orgSalaryClosingDate": "(8) 賃金締切日（例：毎月20日）",
  "orgSalaryPaymentDate": "(8) 賃金支払日（例：翌月10日、当月末日）",
  "orgSalaryPaymentCash": "(8) 通貨払いの有無（有 または 無）",
  "orgSalaryPaymentBank": "(8) 口座振込の有無（有 または 無）",
  "orgDeductionItems": "(9) 賃金支払時に控除する項目と金額（宿舎費・水道光熱費・食費等。例：寮費 20000円、水道光熱費 5000円）",
  "orgHealthCheckCostBurden": "(10) 健康診断の受診費用負担に関する記述（例：特定技能所属機関が全額負担）",
  "orgReturnTravelExpenses": "(11) 帰国旅費負担規定の有無（有 または 無）",
  "orgReturnTravelExpenseDetail": "(11) 帰国旅費の負担に関する規定内容・負担者（例：乙が負担できないときは甲が負担する）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        orgContractStartDate:        S("(1) 雇用契約期間の開始日 YYYY-MM-DD"),
        orgContractEndDate:          S("(1) 雇用契約期間の満了日 YYYY-MM-DD"),
        orgContractRenewal:          S("(1) 契約更新の有無・内容"),
        orgVWorkplaceName:           S("(2) 就業の場所の名称"),
        orgVWorkplaceAddress:        S("(2) 就業の場所の所在地"),
        orgWorkCategory:             S("(3) 業務区分"),
        orgWorkHoursWeekly:          S("(4) 所定労働時間（週・数値のみ・時間）"),
        orgWorkHoursMonthly:         S("(4) 所定労働時間（月・数値のみ・時間）"),
        orgWorkDaysWeekly:           S("(4) 所定労働日数（週・数値のみ・日）"),
        orgWorkHoursDaily:           S("(4) 1日の所定労働時間（数値のみ・時間）"),
        salary:                      S("(5) 基本賃金（月給・日給・時給の額・数値のみ・円）"),
        orgBasicSalaryType:          S("(5) 基本賃金の区分（月給／日給／時給）"),
        orgTimeConvertedBasicSalary: S("(5) 基本給の時間換算額（書面記載がある場合のみ・数値のみ・円）"),
        orgAllowancesDetail:         S("(5) 諸手当の名称・金額の一覧"),
        orgMonthlyTotalEstimate:     S("(5) 1か月当たりの支払概算額合計（数値のみ・円）"),
        orgSalaryEqualityExplanation: S("(6) 報酬が日本人と同等以上であることの説明・支給要件"),
        orgOvertimeRate:             S("(7) 時間外労働の割増賃金率（数値のみ・%）"),
        orgHolidayRate:              S("(7) 休日労働の割増賃金率（数値のみ・%）"),
        orgNightShiftRate:           S("(7) 深夜労働の割増賃金率（数値のみ・%）"),
        orgSalaryClosingDate:        S("(8) 賃金締切日"),
        orgSalaryPaymentDate:        S("(8) 賃金支払日"),
        orgSalaryPaymentCash:        S("(8) 通貨払い（有 または 無）"),
        orgSalaryPaymentBank:        S("(8) 口座振込（有 または 無）"),
        orgDeductionItems:           S("(9) 控除項目（宿舎費・水道光熱費・食費等）の内訳"),
        orgHealthCheckCostBurden:    S("(10) 健康診断の受診費用負担に関する記述"),
        orgReturnTravelExpenses:     S("(11) 帰国旅費負担規定の有無（有 または 無）"),
        orgReturnTravelExpenseDetail: S("(11) 帰国旅費負担の規定内容・負担者"),
      },
    },
    extraInstructions: `
【雇用条件書（参考様式第1-6号）専用 公式様式マッピングルール】
書類は「雇用条件書」（本紙）と別紙「賃金の支払に関する書面」で構成されることが多い。以下の対応表に基づき、PDF内の日本語見出しをアンカー（目印）として、その直後に記載されている数値・テキスト・チェック状態を抽出すること。

(1) 雇用契約期間（開始日・終了日・更新の有無）
　・参照箇所: 1ページ目「I．雇用契約期間」
　・「１．雇用契約期間」の開始日と満了日（年月日）→ orgContractStartDate / orgContractEndDate（YYYY-MM-DD）
　・「２．契約の更新の有無」のチェック状態（自動的に更新する／更新する場合があり得る／契約の更新はしない 等）→ orgContractRenewal にそのまま記載のテキストで出力

(2) 就業の場所（名称・所在地）
　・参照箇所: 2ページ目「II．就業の場所」（「事業所名」「所在地」「連絡先」等の行で構成される）
　・「名称」（事業所名）→ orgVWorkplaceName
　・「所在地」（住所）→ orgVWorkplaceAddress。郵便番号が記載されている場合は「〒1234567|都道府県以下の住所」の形式（郵便番号7桁＋縦棒＋住所）で出力し、郵便番号がない場合は住所のみを出力すること。この欄は必ず確認し、記載があれば省略せずに抽出すること
　・日本語の下にベトナム語・英語等の翻訳が併記されている場合は、日本語の記載内容のみを抽出すること

(3) 業務区分
　・参照箇所: 2ページ目「III．従事する業務の内容」の「２．業務区分（　　）」
　・カッコ内に記載されている正式な業務区分名（例：飲食料品製造、機械金属加工 等）を orgWorkCategory に抽出

(4) 労働時間等（所定労働時間・所定労働日数）
　・参照箇所: 3ページ目「IV．労働時間等」の「３．所定労働時間数」「４．所定労働日数」
　・「３．所定労働時間数」は「①週（　時間　分）」「②月（　時間　分）」「③年（　時間　分）」の形式で記載されている。
　　「①週（」の直後の数値→ orgWorkHoursWeekly、「②月（」の直後の数値→ orgWorkHoursMonthly に抽出すること（②月の値は見落としやすいので必ず確認する）
　・週の所定労働日数（例：週5日）→ orgWorkDaysWeekly に数値のみで抽出
　・この様式は日本語の下にベトナム語・英語等の翻訳が併記されていることが多い。翻訳行の数値ではなく、日本語の記入欄に書かれた数値を抽出すること
　・週・月の所定労働時間は整数で出力する。「160時間00分」のように分が併記されている場合は分を時間に換算し、小数になる場合は小数点以下を四捨五入すること（例：160時間00分 → 160、160時間30分 → 161、40.5 → 41、164.4 → 164）

(5) 報酬の額（基本給・諸手当・月額概算合計・時間換算額）
　・参照箇所: 5ページ目「VII．賃金」の１・２項、または別紙7〜8ページ目「１．基本賃金」「２．諸手当の額」「３．１か月当たりの支払概算額」
　・別紙「１．基本賃金」は「月給（　円）／日給（　円）／時給（　円）」の選択式。チェック（記入）されている区分→ orgBasicSalaryType（「月給」「日給」「時給」のいずれか）、その金額→ salary
　・各諸手当（役職手当・技能手当等）の名称と金額→ orgAllowancesDetail（「名称 金額円」を読点区切りで列挙）
　・最終的な「１か月当たりの支払概算額（合計）」→ orgMonthlyTotalEstimate
　・「時間換算額」「時間当たりの額」等の名目で1時間あたりの基本給額が書面に明記されている場合のみ→ orgTimeConvertedBasicSalary（明記がなければ必ず空文字列のままにする。月額÷労働時間の計算はシステム側で行うため、AIが自分で計算してはならない）
　・1日の所定労働時間（本体3ページ目「IV．労働時間等」の「１．始業・終業の時刻等」にある「１日の所定労働時間数（　時間　分）」）→ orgWorkHoursDaily（日給制の時間換算に使用）
　・いずれもカンマを除去した整数で出力すること

(6) 報酬が日本人と同等以上であることの説明・比較対象
　・参照箇所: 別紙7〜8ページ目「基本賃金・諸手当の決定理由、支給要件」
　・手当の支給要件・決定理由として記載されているテキスト（例：「経験・能力を考慮して決定」「〇〇資格保持者に支給」等）、および賃金比較資料の記述から、日本人と同等以上であることの根拠説明を orgSalaryEqualityExplanation に抽出

(7) 割増賃金率（時間外・休日・深夜）
　・参照箇所: 5ページ目「VII．賃金」の「３．所定時間外，休日又は深夜労働に対して支払われる割増賃金率」
　・①時間外→ orgOvertimeRate、②休日→ orgHolidayRate、③深夜→ orgNightShiftRate にそれぞれ数値（%）のみで抽出

(8) 報酬の支払方法及び支払時期
　・参照箇所: 5ページ目「VII．賃金」の「４．賃金締切日」「５．賃金支払日」「６．賃金支払方法」
　・締め日（例：毎月20日）→ orgSalaryClosingDate、支払日（例：当月末日）→ orgSalaryPaymentDate
　・支払方法のチェック状態から口座振込→ orgSalaryPaymentBank、通貨（現金）払→ orgSalaryPaymentCash を「有」または「無」で判定

(9) 宿舎の確保や生計維持に要する費用の負担（控除項目）
　・参照箇所: 5ページ目「７．労使協定に基づく賃金支払時の控除」、または別紙9ページ目「４．賃金支払時に控除する項目」
　・外国人が負担（給与から控除）する宿舎費（家賃）・水道光熱費・食費等の名目と金額を orgDeductionItems に「名目 金額円」を読点区切りで列挙

(10) 健康診断の受診費用の負担
　・参照箇所: 6ページ目「２．雇入れ時の健康診断」「３．初回の定期健康診断」または「IX．その他」
　・健康診断費用の負担に関する記述（通常「特定技能所属機関が全額負担」「甲が負担」等）をそのまま orgHealthCheckCostBurden に抽出

(11) 帰国旅費の負担
　・参照箇所: 6ページ目「IX．その他」の「５．本契約終了後に乙が帰国するに当たり…」
　・条文内の帰国旅費負担に関する規定（「乙が負担することができないときは、甲（特定技能所属機関）が当該旅費を負担する」等）の有無→ orgReturnTravelExpenses（有/無）、規定内容・負担者→ orgReturnTravelExpenseDetail にテキストで抽出

【データ形式の注意（再掲・本セクション特有）】
・チェックボックス（□／☑／■）はチェック済みの選択肢のテキストをそのまま採用すること
・割増賃金率や金額は「25%」「250,000円」のような表記からカンマ・円・%記号を除去し、数値のみを出力すること
・該当箇所が複数ページにまたがる場合（本紙と別紙）、両方を確認して情報を補完すること`,
  },

  rso: {
    label: "登録支援機関",
    sources: "登録支援機関概要書・支援委託契約書",
    jsonTemplate: `{
  "rsoName": "登録支援機関 名称",
  "rsoCorporateNo": "法人番号（13桁）",
  "rsoInsuranceNo": "雇用保険適用事業所番号",
  "rsoAddress": "所在地",
  "rsoPhone": "電話番号",
  "rsoRepresentative": "代表者氏名",
  "rsoRegNo": "登録番号",
  "rsoRegDate": "登録年月日（YYYY-MM-DD）",
  "rsoSupportBusinessName": "支援実施事業所名",
  "rsoSupportBusinessAddress": "支援実施事業所所在地",
  "rsoSupportManager": "支援責任者",
  "rsoSupportStaff": "支援担当者",
  "rsoAvailableLanguages": "対応可能言語",
  "rsoFeePerMonth": "支援委託費用（月額・数値のみ・円）"
}`,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        rsoName:                    S("登録支援機関 名称"),
        rsoCorporateNo:             S("法人番号（13桁）"),
        rsoInsuranceNo:             S("雇用保険適用事業所番号"),
        rsoAddress:                 S("所在地"),
        rsoPhone:                   S("電話番号"),
        rsoRepresentative:          S("代表者氏名"),
        rsoRegNo:                   S("登録番号"),
        rsoRegDate:                 S("登録年月日 YYYY-MM-DD"),
        rsoSupportBusinessName:     S("支援実施事業所名"),
        rsoSupportBusinessAddress:  S("支援実施事業所所在地"),
        rsoSupportManager:          S("支援責任者"),
        rsoSupportStaff:            S("支援担当者"),
        rsoAvailableLanguages:      S("対応可能言語"),
        rsoFeePerMonth:             S("支援委託費用（月額・数値のみ・円）"),
      },
    },
  },
};

// ─── ファイルを取得する内部ヘルパー ──────────────────────────────────────────
async function fetchAsBase64(
  fileUrl: string,
  mimeType: string | null
): Promise<{ base64: string; useMime: string } | null> {
  try {
    let base64: string;
    let useMime: string;

    if (fileUrl.startsWith("data:")) {
      const ci = fileUrl.indexOf(",");
      base64 = fileUrl.slice(ci + 1);
      useMime = fileUrl.slice(5, ci).split(";")[0];
    } else {
      const res = await fetch(fileUrl, { cache: "no-store" });
      if (!res.ok) return null;
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      useMime = mimeType ?? "image/jpeg";
    }

    const supported = [
      "image/jpeg", "image/png", "image/webp",
      "image/heic", "image/heif", "application/pdf",
    ];
    if (!supported.includes(useMime)) return null;

    return { base64, useMime };
  } catch {
    return null;
  }
}

// ─── メインアクション ─────────────────────────────────────────────────────────
export async function extractSectionFromDocs(
  applicationId: string,
  sectionKey: SectionKey
): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, any>;
  docsChecked?: number;
  label?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = (session.user as any)?.tenantId as string | undefined;
    if (!tenantId) return { success: false, error: "テナントIDが取得できません" };

    if (!process.env.GEMINI_API_KEY) {
      return { success: false, error: "AI機能が設定されていません" };
    }

    const config = SECTION_CONFIG[sectionKey];

    // 申請案件の確認
    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    // 添付書類を取得（主: application_attachments / 互換: 旧チェックリスト）
    const attachmentRows = await db
      .select()
      .from(applicationAttachments)
      .where(eq(applicationAttachments.applicationId, applicationId));
    const checklist = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));
    const legacySubmitted = checklist.filter((c) => c.fileUrl && c.status === "submitted");

    const submitted: { documentName: string; fileUrl: string; mimeType: string | null }[] = [
      ...attachmentRows.map((a) => ({
        documentName: a.documentLabel ?? a.documentType,
        fileUrl: a.fileUrl,
        mimeType: a.mimeType,
      })),
      ...legacySubmitted.map((c) => ({
        documentName: c.documentName,
        fileUrl: c.fileUrl!,
        mimeType: c.mimeType,
      })),
    ];

    if (submitted.length === 0) {
      return {
        success: false,
        error: "添付書類がありません。「申請書作成用 添付書類」パネルから書類をアップロードしてから実行してください。",
        label: config.label,
      };
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    // supporter / family セクション専用: 申請人氏名を取得して区別コンテキストに使用
    let applicantNameContext = "";
    let applicantNames: string[] = [];
    if (sectionKey === "supporter" || sectionKey === "family") {
      const [applicant] = await db
        .select()
        .from(applicantMaster)
        .where(eq(applicantMaster.id, app.applicantId))
        .limit(1);
      if (applicant) {
        const nameEn = [applicant.familyNameEn, applicant.givenNameEn].filter(Boolean).join(" ");
        const nameJa = [applicant.familyNameJa, applicant.givenNameJa].filter(Boolean).join(" ");
        applicantNames = [nameEn, nameJa].filter(Boolean);
        if (sectionKey === "supporter") {
          applicantNameContext = `
【重要】この申請は家族滞在ビザの更新申請です。
・申請人（家族滞在ビザ所持者）の氏名：${nameEn}${nameJa ? `（${nameJa}）` : ""}
・扶養者とは申請人の配偶者や親など、メインのビザ（就労・永住等）を持つ人物です。
・この書類に申請人と扶養者の両方の情報がある場合は、申請人以外の人物（扶養者）の情報を抽出してください。
・在留カードが複数ある場合は、申請人のもの以外が扶養者の在留カードです。
・在留期間満了日（supporterPeriodExpiry）は扶養者の在留カードに記載されている満了日です。必ず日付を読み取ってください。`;
        } else {
          applicantNameContext = `
【重要】「在日親族及び同居者」の抽出です。
・申請人本人の氏名：${nameEn}${nameJa ? `（${nameJa}）` : ""}
・申請人本人は絶対に familyInJapan に含めないでください。
・親族の在留カードからは、氏名・生年月日・国籍・在留カード番号を読み取ってください。
・メモ・住民票等に続柄（父/母/配偶者/子 等）や勤務先・同居の有無が記載されていれば合わせて読み取ってください。
・複数人の親族が記載されている場合は全員分を配列で出力してください。`;
        }
      }
    }

    const prompt = `【役割】あなたは在留資格申請を専門とする行政書士AIアシスタントです。提出書類から申請書記入に必要な情報を正確に読み取ります。

【処理対象】書類「{DOC_NAME}」から「${config.label}」セクションの情報を抽出
${applicantNameContext}
【参考書類の種類】${config.sources}

【処理手順】
1. 書類全体を確認し、書類の種類・内容を把握する
2. 抽出対象フィールドに該当する情報を書類から探す
3. 該当情報が見つかった場合のみ値を設定する
4. 日付・数値等のフォーマットを指定形式に変換する

【抽出対象フィールド】
${config.jsonTemplate}
${config.extraInstructions ?? ""}
【データ形式に関する注意】
・入力データがExcelから出力されたCSV形式の場合、大量のカンマ（,,,）、空白セル、改行、日本語と英語の併記が含まれることがあります。
・項目名の前後・周辺にあるデータや、離れたセル位置にある数値も文脈から慎重に紐づけて抽出してください。
・チェックボックス（□ / ☑ / ■ / ✓ や「有・無」の選択）は、文脈からどちらが選択されているか判断し「有」または「無」で出力してください。
・表形式で項目名と値が離れている場合（例：「所定労働時間,,,,40」のような形式）、カンマ区切りの位置関係から値を正確に読み取ってください。

【制約（必ず遵守）】
・書類に明記されている情報のみ抽出し、推測・補完は行わないこと
・該当情報がない場合は ""（空文字列）とすること（nullは使用しない）
・日付はすべて YYYY-MM-DD 形式（例：2028-03-15）
・数値フィールド（金額・人数等）は数値のみ（単位・記号・カンマ不可）
・性別は「男」または「女」（M/Fは使用しない）
・有無は「有」または「無」（英語不可）`;

    // 全提出済み書類を並行処理（逐次実行だとVercelの関数タイムアウト300秒を超過するため）
    type SectionDocResult = { fileOk: boolean; extracted: Record<string, any> | null };
    const SECTION_CONCURRENCY = 4;

    const docResults = await mapWithConcurrency(
      submitted.slice(0, 15),
      SECTION_CONCURRENCY,
      async (doc): Promise<SectionDocResult> => {
        const file = await fetchAsBase64(doc.fileUrl!, doc.mimeType);
        if (!file) return { fileOk: false, extracted: null };

        try {
          const docPrompt = prompt.replace("{DOC_NAME}", doc.documentName);

          const resp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
              parts: [
                { inlineData: { mimeType: file.useMime, data: file.base64 } },
                { text: docPrompt },
              ],
            }],
            config: {
              responseMimeType: "application/json",
              responseSchema: config.responseSchema,
            },
          });

          const txt = resp.text ?? "{}";
          try {
            return { fileOk: true, extracted: JSON.parse(txt) };
          } catch {
            // フォールバック: マークダウンコードフェンスが含まれる場合
            const m = txt.match(/```json?\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
            if (!m) return { fileOk: true, extracted: null };
            return { fileOk: true, extracted: JSON.parse(m[1] ?? m[0]) };
          }
        } catch {
          // 1書類のエラーは無視
          return { fileOk: true, extracted: null };
        }
      }
    );

    // 結果を元の書類順でマージ（同一フィールドは先勝ち、family/workHistoryは蓄積マージ）
    const result: Record<string, any> = {};
    let docsChecked = 0;

    for (const { fileOk, extracted } of docResults) {
      if (!fileOk) continue;
      docsChecked++;
      if (!extracted) continue;

      // 空でない値をマージ（既に取得済みのフィールドは上書きしない）
      for (const [k, v] of Object.entries(extracted)) {
        if (!result[k] && v !== null && v !== undefined && v !== "") {
          result[k] = v;
        }
      }

      // workHistory は配列なので特別処理
      if (sectionKey === "workhistory" && extracted.workHistory && Array.isArray(extracted.workHistory)) {
        if (!result.workHistory || result.workHistory.length === 0) {
          result.workHistory = extracted.workHistory.filter(
            (w: any) => w.employer || w.joinDate
          );
        }
      }

      // familyInJapan は複数書類（親族ごとの在留カード等）から蓄積マージ
      if (sectionKey === "family" && extracted.familyInJapan && Array.isArray(extracted.familyInJapan)) {
        const newMembers = normalizeFamilyMembers(extracted.familyInJapan);
        result.familyInJapan = mergeFamilyMembers(
          (result.familyInJapan ?? []) as any[],
          newMembers,
          applicantNames,
        );
      }
    }

    // 業種・職種マスタ照合クレンジング（表記ゆれ→コード変換、不正値→空）
    cleanseMasterCodes(result);

    // 数値フィールドの正規化（「160時間00分」「250,000円」「25%」「全角数字」→ 数値のみ）
    // <input type="number"> は非数値文字列を表示できず空欄に見えるため必須。
    // 所定労働時間（週・月）は様式上整数のため小数点以下を四捨五入する
    for (const key of NUMERIC_FIELDS_BY_SECTION[sectionKey] ?? []) {
      if (result[key] !== undefined && result[key] !== null && result[key] !== "") {
        result[key] = INTEGER_NUMERIC_FIELDS.has(key)
          ? cleanseNumericInt(result[key])
          : cleanseNumeric(result[key]);
      }
    }

    // 就業の場所（所在地）を AddressSplitSimple の「〒1234567|住所」形式へ正規化
    if (sectionKey === "orgEmploymentConditions" && result.orgVWorkplaceAddress) {
      result.orgVWorkplaceAddress = normalizeAddressWithZip(result.orgVWorkplaceAddress);
    }

    // 基本給の時間換算額の確定（必ず数値クレンジング後に実行する）
    // 書面記載値 → 時給そのまま → 日給÷1日所定労働時間 → 月給÷月平均所定労働時間 の順
    if (sectionKey === "orgEmploymentConditions") {
      const converted = computeTimeConvertedBasicSalary({
        direct:       result.orgTimeConvertedBasicSalary,
        salaryType:   result.orgBasicSalaryType,
        salary:       result.salary,
        monthlyHours: result.orgWorkHoursMonthly,
        dailyHours:   result.orgWorkHoursDaily,
      });
      if (converted) result.orgTimeConvertedBasicSalary = converted;
      else delete result.orgTimeConvertedBasicSalary;
      // 計算用ヘルパーキーはApplicationFormDataに存在しないためフォームへ渡す前に除去
      delete result.orgBasicSalaryType;
      delete result.orgWorkHoursDaily;
    }

    const hasAnyValue = Object.values(result).some((v) =>
      Array.isArray(v) ? v.length > 0 : v !== "" && v !== null && v !== undefined
    );

    if (!hasAnyValue) {
      return {
        success: false,
        docsChecked,
        label: config.label,
        error: `${docsChecked}件の書類を確認しましたが、「${config.label}」に関する情報が見つかりませんでした。【対象書類】${config.sources} をアップロードしてください。`,
      };
    }

    return { success: true, data: result, docsChecked, label: config.label };
  } catch (err: any) {
    return { success: false, error: err.message ?? "読み取りに失敗しました" };
  }
}
