"use server";

import { auth } from "@/lib/auth";
import { db, applications, applicationDocumentChecklist, applicantMaster } from "@/lib/db";
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
  | "marriage"    // 婚姻・出生・縁組届出（R型 項目17）
  | "supporter"   // 扶養者情報（R型）
  | "spouse"      // 配偶者情報（T型）
  | "school"      // 学校情報（P型）
  | "org"         // 所属機関情報
  | "orgV"        // 特定技能 雇用契約・所属機関詳細（V型）
  | "orgVCompliance" // 特定技能 所属機関コンプライアンス確認（V型）
  | "rso";        // 登録支援機関（V型）

// ─── セクション別プロンプト定義 ───────────────────────────────────────────────
/** 文字列型nullable のショートカット */
const S = (desc: string) => ({ type: Type.STRING, description: desc, nullable: true });

const SECTION_CONFIG: Record<
  SectionKey,
  { label: string; sources: string; jsonTemplate: string; responseSchema: any }
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
  "orgAccidentInsurance": "労災保険加入等の措置（有 または 無）",
  "orgContinuousPerformance": "雇用契約を継続して履行する体制（有 または 無）",
  "orgSalaryPaymentVerifiable": "報酬の支払を客観的方法で確認できること（有 または 無）",
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

    // 提出済み書類を取得
    const checklist = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));

    const submitted = checklist.filter((c) => c.fileUrl && c.status === "submitted");

    if (submitted.length === 0) {
      return {
        success: false,
        error: "提出済みの書類がありません。必要書類をアップロードしてから実行してください。",
        label: config.label,
      };
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const result: Record<string, any> = {};
    let docsChecked = 0;

    // supporter セクション専用: 申請人氏名を取得して区別コンテキストに使用
    let applicantNameContext = "";
    if (sectionKey === "supporter") {
      const [applicant] = await db
        .select()
        .from(applicantMaster)
        .where(eq(applicantMaster.id, app.applicantId))
        .limit(1);
      if (applicant) {
        const nameEn = [applicant.familyNameEn, applicant.givenNameEn].filter(Boolean).join(" ");
        const nameJa = [applicant.familyNameJa, applicant.givenNameJa].filter(Boolean).join(" ");
        applicantNameContext = `
【重要】この申請は家族滞在ビザの更新申請です。
・申請人（家族滞在ビザ所持者）の氏名：${nameEn}${nameJa ? `（${nameJa}）` : ""}
・扶養者とは申請人の配偶者や親など、メインのビザ（就労・永住等）を持つ人物です。
・この書類に申請人と扶養者の両方の情報がある場合は、申請人以外の人物（扶養者）の情報を抽出してください。
・在留カードが複数ある場合は、申請人のもの以外が扶養者の在留カードです。
・在留期間満了日（supporterPeriodExpiry）は扶養者の在留カードに記載されている満了日です。必ず日付を読み取ってください。`;
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

    // 全提出済み書類を順に処理
    for (const doc of submitted.slice(0, 15)) {
      const file = await fetchAsBase64(doc.fileUrl!, doc.mimeType);
      if (!file) continue;

      docsChecked++;

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
        let extracted: Record<string, any>;
        try {
          extracted = JSON.parse(txt);
        } catch {
          // フォールバック: マークダウンコードフェンスが含まれる場合
          const m = txt.match(/```json?\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
          if (!m) continue;
          extracted = JSON.parse(m[1] ?? m[0]);
        }

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
      } catch {
        // 1書類のエラーは無視
      }
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
