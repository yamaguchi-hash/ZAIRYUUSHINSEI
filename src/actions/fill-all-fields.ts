"use server";

import { auth } from "@/lib/auth";
import {
  db, applications, applicationDocumentChecklist,
  applicantMaster, organizationMaster,
} from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { Type } from "@google/genai";
import { VISA_TYPE_LABELS } from "@/lib/utils";
import { EMPTY_FORM_DATA } from "@/lib/form-types";

/** 文字列型nullable のショートカット */
const S = (desc: string) => ({ type: Type.STRING, description: desc, nullable: true });

// ═════════════════════════════════════════════════════════════════════════════
// Stage 1 個別書類OCR用スキーマ（フォームキー名で直接出力）
// ApplicationFormData の全フィールドを網羅（配列・メタ・マスター確定値は除外）
// ═════════════════════════════════════════════════════════════════════════════
const STAGE1_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // ── 書類メタ ──────────────────────────────────────────────────────────────
    docType:        S("書類の種類（例：パスポート、在留カード、雇用条件書）"),
    docSubject:     S("この書類の主体（申請人/扶養者/配偶者/機関）"),

    // ── Part 1 共通：基本情報 ─────────────────────────────────────────────────
    familyNameEn:   S("姓（ローマ字）"),
    givenNameEn:    S("名（ローマ字）"),
    familyNameJa:   S("姓（漢字）"),
    givenNameJa:    S("名（漢字）"),
    nationality:    S("国籍・地域"),
    dateOfBirth:    S("生年月日 YYYY-MM-DD"),
    sex:            S("性別（男 または 女）"),
    placeOfBirth:   S("出生地"),
    maritalStatus:  S("配偶者の有無（有 または 無）"),
    occupation:     S("職業"),
    homeTownCity:   S("本国居住地"),

    // ── Part 1 共通：連絡先 ──────────────────────────────────────────────────
    postalCodeInJapan:  S("郵便番号（7桁）"),
    prefectureInJapan:  S("都道府県"),
    cityInJapan:        S("市区町村"),
    addressLineInJapan: S("番地・建物・部屋番号"),
    telephoneNo:        S("電話番号"),
    cellularPhoneNo:    S("携帯電話番号"),

    // ── Part 1 共通：旅券・在留 ──────────────────────────────────────────────
    passportNumber:             S("パスポート番号"),
    passportExpiry:             S("パスポート有効期限 YYYY-MM-DD"),
    residenceCardNumber:        S("在留カード番号"),
    currentStatusOfResidence:   S("在留資格（日本語）"),
    currentPeriodOfStay:        S("在留期間（例：3年）"),
    currentPeriodExpiry:        S("在留期間満了日 YYYY-MM-DD"),

    // ── COE固有フィールド ────────────────────────────────────────────────────
    purposeOfEntry:         S("入国目的（在留資格名）"),
    scheduledDateOfEntry:   S("入国予定年月日 YYYY-MM-DD"),
    portOfEntry:            S("上陸予定港"),
    intendedLengthOfStay:   S("滞在予定期間"),
    accompanyingPersons:    S("同伴者の有無（有 または 無）"),
    intendedPlaceForVisa:   S("査証申請予定地"),
    pastEntryHistory:       S("過去の出入国歴の有無（有 または 無）"),
    pastEntryCount:         S("入国回数（数値のみ）"),
    pastEntryLatestFrom:    S("直近入国日 YYYY-MM-DD"),
    pastEntryLatestTo:      S("直近出国日 YYYY-MM-DD"),
    pastCoeHistory:         S("過去のCOE申請歴の有無（有 または 無）"),
    pastCoeCount:           S("COE申請回数（数値のみ）"),
    pastCoeNonIssuanceCount: S("不交付回数（数値のみ）"),

    // ── Change固有フィールド ─────────────────────────────────────────────────
    desiredStatusOfResidence: S("希望する在留資格（日本語）"),
    desiredPeriodOfStay:     S("希望する在留期間"),
    reasonForApplication:    S("変更・更新の理由"),

    // ── 共通：犯罪・退去 ────────────────────────────────────────────────────
    criminalRecord:         S("犯罪記録の有無（有 または 無）"),
    criminalRecordDetail:   S("犯罪記録の詳細"),
    deportationHistory:     S("退去強制歴の有無（有 または 無）"),
    deportationCount:       S("退去強制回数（数値のみ）"),
    deportationLatestDate:  S("最終退去強制日 YYYY-MM-DD"),
    familyInJapanExists:    S("在日親族の有無（有 または 無）"),

    // ── Part 2 N型：勤務先・学歴 ────────────────────────────────────────────
    employerName:       S("勤務先名称"),
    employerBranchName: S("支店・事業所名"),
    employerAddress:    S("勤務先所在地"),
    employerPhone:      S("勤務先電話番号"),
    educationCountry:   S("学校所在国（本邦 または 外国）"),
    educationDegree:    S("学位（大学院（博士）/大学院（修士）/大学/短期大学/専門学校/高等学校等）"),
    educationSchoolName: S("学校名"),
    educationGraduationDate: S("卒業日 YYYY-MM-DD"),
    majorCategory:      S("専攻・専門分野"),
    majorCategoryOther: S("専攻（その他の場合の詳細）"),
    itQualificationExists: S("情報処理技術者資格の有無（有 または 無）"),
    itQualificationName:   S("資格名"),
    representativeName:         S("法定代理人 氏名"),
    representativeRelationship: S("法定代理人 申請人との関係"),
    representativeAddress:      S("法定代理人 住所"),
    representativePhone:        S("法定代理人 電話番号"),
    representativeCellular:     S("法定代理人 携帯電話番号"),

    // ── Part 2 T型：配偶者 ──────────────────────────────────────────────────
    spouseFamilyNameEn:   S("配偶者 姓（ローマ字）"),
    spouseGivenNameEn:    S("配偶者 名（ローマ字）"),
    spouseFamilyNameJa:   S("配偶者 姓（漢字）"),
    spouseGivenNameJa:    S("配偶者 名（漢字）"),
    spouseDob:            S("配偶者 生年月日 YYYY-MM-DD"),
    spouseNationality:    S("配偶者 国籍"),
    spouseOccupation:     S("配偶者 職業"),
    spouseEmployer:       S("配偶者 勤務先・通学先"),
    spouseAddress:        S("配偶者 住所"),
    spouseResidenceStatus: S("配偶者 身分（日本国籍/永住者/特別永住者）"),
    spouseResidenceCard:  S("配偶者 在留カード番号"),
    marriageDate:         S("婚姻年月日 YYYY-MM-DD"),
    marriageRegistrationDate: S("婚姻届出年月日 YYYY-MM-DD"),
    marriageRegistrationPlace: S("婚姻届出市区町村"),
    cohabitation:         S("同居の有無（有 または 無）"),
    separationReason:     S("別居の理由"),
    longTermResidentReason: S("定住者の根拠・理由"),

    // ── Part 2 R型 ──────────────────────────────────────────────────────────
    marriageNotificationPlaceJapan:   S("日本国届出先"),
    marriageNotificationDateJapan:    S("日本国届出年月日 YYYY-MM-DD"),
    marriageNotificationPlaceForeign: S("本国等届出先"),
    marriageNotificationDateForeign:  S("本国等届出年月日 YYYY-MM-DD"),
    fundingMethod:       S("滞在費支弁方法（親族負担/外国からの送金/身元保証人負担/その他）"),
    fundingMethodOther:  S("支弁方法（その他の詳細）"),
    partTimeWorkExistsR: S("資格外活動の有無（有 または 無）"),
    partTimeWorkTypeR:        S("資格外活動 内容"),
    partTimeWorkOrgNameR:     S("資格外活動 勤務先名称"),
    partTimeWorkBranchNameR:  S("資格外活動 支店・事業所名"),
    partTimeWorkPhoneR:       S("資格外活動 電話番号"),
    partTimeWorkHoursR:       S("資格外活動 週間稼働時間"),
    partTimeWorkSalaryR:      S("資格外活動 報酬（数値のみ・円）"),
    partTimeWorkSalaryTypeR:  S("資格外活動 報酬種別（月額/日額）"),

    // ── Part 2 R型：扶養者 ──────────────────────────────────────────────────
    supporterNameEn:            S("扶養者 氏名（ローマ字）"),
    supporterFamilyNameEn:      S("扶養者 姓（ローマ字）"),
    supporterGivenNameEn:       S("扶養者 名（ローマ字）"),
    supporterFamilyNameJa:      S("扶養者 姓（漢字）"),
    supporterGivenNameJa:       S("扶養者 名（漢字）"),
    supporterDob:               S("扶養者 生年月日 YYYY-MM-DD"),
    supporterNationality:       S("扶養者 国籍"),
    supporterAddress:           S("扶養者 住居地"),
    supporterStatusOfResidence: S("扶養者 在留資格"),
    supporterPeriodOfStay:      S("扶養者 在留期間"),
    supporterPeriodExpiry:      S("扶養者 在留期間満了日 YYYY-MM-DD"),
    supporterRelationship:      S("申請人との続柄（夫/妻/父/母/養父/養母/その他）"),
    supporterRelationshipOther: S("続柄（その他の詳細）"),
    supporterResidenceCard:     S("扶養者 在留カード番号"),
    supporterEmployer:          S("扶養者 勤務先名称"),
    supporterCorporateNumber:   S("扶養者 法人番号（13桁）"),
    supporterBranchName:        S("扶養者 支店・事業所名"),
    supporterEmployerAddress:   S("扶養者 勤務先所在地"),
    supporterEmployerPhone:     S("扶養者 勤務先電話番号"),
    supporterAnnualIncome:      S("扶養者 年収（数値のみ・円）"),

    // ── Part 2 P型：留学 ────────────────────────────────────────────────────
    schoolName:             S("学校名（正式名称）"),
    schoolType:             S("学校種別（大学院/大学/短期大学/専門学校/高等学校/日本語学校/その他）"),
    schoolAddress:          S("学校所在地"),
    schoolPhone:            S("学校電話番号"),
    enrollmentDate:         S("入学年月日 YYYY-MM-DD"),
    expectedGraduationDate: S("卒業予定年月日 YYYY-MM-DD"),
    courseOfStudy:           S("在籍コース・専攻名"),
    annualTuition:          S("年間学費（数値のみ・円）"),
    fundingSource:          S("費用支弁方法"),
    fundingAmount:          S("月額生活費（数値のみ・円）"),
    scholarshipName:        S("奨学金名称"),
    scholarshipAmount:      S("奨学金月額（数値のみ・円）"),
    partTimeWorkPermit:     S("資格外活動許可の有無（有 または 無）"),

    // ── Part 2 V型：技能水準（項目18）───────────────────────────────────────
    skillLevelProofMethod:       S("技能水準証明方法（分野別方針/試験/その他/技能実習2号修了）"),
    skillLevelExamName1:         S("技能試験名1"),
    skillLevelExamCountry1:      S("試験地1（国内 または 国外）"),
    skillLevelExamCountryName1:  S("試験地1の国名（国外の場合）"),
    skillLevelExamName2:         S("技能試験名2"),
    skillLevelExamCountry2:      S("試験地2（国内 または 国外）"),
    skillLevelExamCountryName2:  S("試験地2の国名（国外の場合）"),

    // ── Part 2 V型：日本語能力（項目19）──────────────────────────────────────
    japaneseAbilityProofMethod:       S("日本語能力証明方法"),
    japaneseAbilityExamName1:         S("日本語試験名1"),
    japaneseAbilityExamCountry1:      S("試験地1（国内 または 国外）"),
    japaneseAbilityExamCountryName1:  S("試験地1の国名"),
    japaneseAbilityExamName2:         S("日本語試験名2"),
    japaneseAbilityExamCountry2:      S("試験地2（国内 または 国外）"),
    japaneseAbilityExamCountryName2:  S("試験地2の国名"),

    // ── Part 2 V型：技能実習2号（項目20）─────────────────────────────────────
    completedTit2Occupation1:   S("技能実習2号 職種1"),
    completedTit2Operations1:   S("技能実習2号 作業1"),
    completedTit2ProofType1:    S("修了証明方法1（実技試験合格/訓練状況書類）"),
    completedTit2Occupation2:   S("技能実習2号 職種2"),
    completedTit2Operations2:   S("技能実習2号 作業2"),
    completedTit2ProofType2:    S("修了証明方法2"),

    // ── Part 2 V型：通算在留・確認事項（項目21-27）───────────────────────────
    cumulativeStayYears:           S("通算在留期間 年（数値のみ）"),
    cumulativeStayMonths:          S("通算在留期間 月（数値のみ）"),
    depositContractExists:         S("保証金徴収等の有無（有 または 無）"),
    overseasExpensesExists:        S("外国機関への費用の有無（有 または 無）"),
    overseasExpensesOrgName:       S("外国機関名"),
    overseasExpensesAmount:        S("費用額（数値のみ・円換算）"),
    homeCountryProcedureComplied:  S("本国手続き実施の有無（有 または 無）"),
    regularExpensesUnderstood:     S("定期費用了解の有無（有 または 無）"),
    technologyTransferEffortV:     S("技能移転努力の有無（有 または 無）"),
    ssfSpecificFieldCriteriaMet:   S("特定産業分野基準適合の有無（有 または 無）"),

    // ── 所属機関 Part 1 共通 ────────────────────────────────────────────────
    orgName:                    S("機関名称"),
    orgCorporateNumber:         S("法人番号（13桁）"),
    orgBranchName:              S("支店・事業所名"),
    orgEmploymentInsuranceNo:   S("雇用保険適用事業所番号（11桁）"),
    orgBusinessTypeCode:        S("業種コード（数値のみ）"),
    orgBusinessTypeOtherCode:   S("業種コード（その他の場合の詳細コード）"),
    orgAddress:                 S("所在地"),
    orgPhone:                   S("電話番号"),
    orgCapital:                 S("資本金（数値のみ・円）"),
    orgAnnualSales:             S("年間売上高（数値のみ・円）"),
    orgEmployeeCount:           S("従業員数（数値のみ）"),
    orgForeignEmployeeCount:    S("外国人職員数（数値のみ）"),
    orgTechInternCount:         S("技能実習生数（数値のみ）"),
    researchRoomName:           S("研究室名"),
    researchRoomProfessor:      S("指導教授名"),

    // ── 所属機関：就労条件 ──────────────────────────────────────────────────
    contractType:               S("契約形態（雇用/委任/請負/その他）"),
    contractTypeOther:          S("契約形態（その他の詳細）"),
    workPeriodFixed:            S("就労期間（定めなし または 定めあり）"),
    workPeriodDuration:         S("就労期間の長さ（定めありの場合）"),
    employmentStartDate:        S("雇用開始日 YYYY-MM-DD"),
    employmentStartDateStatus:  S("雇用開始状態（就任済 または 未就任）"),
    salary:                     S("月額報酬（数値のみ・円）"),
    salaryType:                 S("給与種別（月額 または 年額）"),
    businessExperienceYears:    S("実務経験年数（数値のみ）"),
    positionExists:             S("役職の有無（あり または なし）"),
    position:                   S("役職・職種名"),
    occupationCode:             S("職種コード番号"),
    occupationCodeOthers:       S("他の職種番号（複数の場合、カンマ区切り）"),
    activityDetails:            S("業務内容・活動の詳細"),

    // ── 所属機関：保険・V型共通 ─────────────────────────────────────────────
    orgLaborInsuranceNo:        S("労働保険番号（14桁）"),
    orgHealthInsuranceMet:      S("健康保険・厚生年金加入（有 または 無）"),
    orgLaborInsuranceMet:       S("労災・雇用保険加入（有 または 無）"),

    // ── V型：雇用契約 ───────────────────────────────────────────────────────
    orgContractStartDate:       S("雇用契約期間（始）YYYY-MM-DD"),
    orgContractEndDate:         S("雇用契約期間（終）YYYY-MM-DD"),
    orgSpecifiedIndustrialField: S("特定産業分野"),
    orgWorkCategory:            S("業務区分"),
    orgOccupationNumber:        S("主職種番号"),
    orgWorkHoursWeekly:         S("所定労働時間（週平均・数値のみ・時間）"),
    orgWorkHoursMonthly:        S("所定労働時間（月平均・数値のみ・時間）"),
    orgWorkHoursEquivalent:     S("正規労働者と同等か（有 または 無）"),
    orgTimeConvertedBasicSalary: S("基本給の時間換算額（数値のみ・円）"),
    orgJapaneseEquivalentSalary: S("同種業務日本人の月額報酬（数値のみ・円）"),
    orgSalaryEqualToJapanese:   S("日本人同等以上か（有 または 無）"),
    orgSalaryPaymentCash:       S("現金払い（有 または 無）"),
    orgSalaryPaymentBank:       S("銀行振込（有 または 無）"),
    orgForeignTreatmentDifference: S("外国人差別的扱い（有 または 無）"),
    orgForeignTreatmentDetail:  S("差別的扱いの詳細"),
    orgPaidHolidayForReturn:    S("一時帰国有給休暇（有 または 無）"),
    orgFieldSpecificEmploymentCriteria: S("分野別雇用基準への適合（有 または 無）"),
    orgReturnTravelExpenses:    S("帰国旅費負担（有 または 無）"),
    orgHealthCheck:             S("健康状況確認（有 または 無）"),
    orgProperResidenceCriteria: S("適正在留基準（有 または 無）"),

    // ── V型：派遣先 ─────────────────────────────────────────────────────────
    orgVDispatchName:           S("派遣先 名称"),
    orgVDispatchCorporateNo:    S("派遣先 法人番号（13桁）"),
    orgVDispatchInsuranceNo:    S("派遣先 雇用保険適用事業所番号"),
    orgVDispatchAddress:        S("派遣先 住所"),
    orgVDispatchPhone:          S("派遣先 電話番号"),
    orgVDispatchRepresentative: S("派遣先 代表者氏名"),
    orgVDispatchStartDate:      S("派遣期間（始）YYYY-MM-DD"),
    orgVDispatchEndDate:        S("派遣期間（終）YYYY-MM-DD"),

    // ── V型：職業紹介事業者 ─────────────────────────────────────────────────
    orgPlacementProviderName:         S("職業紹介事業者 名称"),
    orgPlacementProviderCorporateNo:  S("職業紹介事業者 法人番号（13桁）"),
    orgPlacementProviderInsuranceNo:  S("職業紹介事業者 雇用保険適用事業所番号"),
    orgPlacementProviderAddress:      S("職業紹介事業者 住所"),
    orgPlacementProviderPhone:        S("職業紹介事業者 電話番号"),
    orgPlacementProviderLicenseNo:    S("職業紹介事業者 許可番号"),
    orgPlacementProviderLicenseDate:  S("職業紹介事業者 許可年月日 YYYY-MM-DD"),

    // ── V型：取次機関 ───────────────────────────────────────────────────────
    orgIntermediaryName:    S("取次機関 名称"),
    orgIntermediaryAddress: S("取次機関 住所"),
    orgIntermediaryPhone:   S("取次機関 電話番号"),

    // ── V型：コンプライアンス(11)-(21) ───────────────────────────────────────
    orgLaborLawViolation:           S("労働・社会保険・租税法令違反の有無（有 または 無）"),
    orgLaborLawViolationDetail:     S("労働法令違反の詳細"),
    orgInvoluntaryDismissal:        S("非自発的離職の有無（有 または 無）"),
    orgInvoluntaryDismissalDetail:  S("非自発的離職の詳細"),
    orgMissingPerson:               S("行方不明者発生の有無（有 または 無）"),
    orgMissingPersonDetail:         S("行方不明者の詳細"),
    orgCriminalPunishment:          S("刑事処分の有無（有 または 無）"),
    orgCriminalPunishmentDetail:    S("刑事処分の詳細"),
    orgMentalDisability:            S("精神障害による欠格の有無（有 または 無）"),
    orgMentalDisabilityDetail:      S("精神障害の詳細"),
    orgBankruptcy:                  S("破産手続開始の有無（有 または 無）"),
    orgBankruptcyDetail:            S("破産の詳細"),
    orgTrainingRevoked:             S("実習認定取消の有無（有 または 無）"),
    orgTrainingRevokedDetail:       S("実習認定取消の詳細"),
    orgWasOfficerOfRevoked:         S("実習認定取消法人の役員であった有無（有 または 無）"),
    orgWasOfficerOfRevokedDetail:   S("詳細"),
    orgIllegalActFiveYears:         S("出入国・労働法令上の不正行為5年以内の有無（有 または 無）"),
    orgIllegalActFiveYearsDetail:   S("不正行為の詳細"),
    orgGangsterMember:              S("暴力団員の有無（有 または 無）"),
    orgGangsterMemberDetail:        S("暴力団員の詳細"),
    orgLegalAgentViolation:         S("法定代理人が(14)-(20)に該当の有無（有 または 無）"),
    orgLegalAgentViolationDetail:   S("法定代理人違反の詳細"),

    // ── V型：コンプライアンス(22)-(33) ───────────────────────────────────────
    orgGangsterControl:             S("暴力団員等に事業活動を支配される者か（有 または 無）"),
    orgGangsterControlDetail:       S("暴力団支配の詳細"),
    orgActivityDocumentKept:        S("活動内容文書の作成・1年以上保管（有 または 無）"),
    orgAwareOfDeposit:              S("保証金・財産管理等契約を認識しての締結（有 または 無）"),
    orgAwareOfDepositDetail:        S("保証金認識の詳細"),
    orgPenaltyContractExists:       S("不履行違約金支払契約の有無（有 または 無）"),
    orgPenaltyContractDetail:       S("違約金契約の詳細"),
    orgSupportCostNotBurdened:      S("支援費用を外国人に負担させないこと（有 または 無）"),
    orgDispatchMeetsCondition:      S("派遣先が法定要件に該当（有 または 無）"),
    orgDispatchConditionDetail:     S("派遣先条件の詳細"),
    orgDispatchMeetsCompliance:     S("派遣先が(11)-(22)に該当しないこと（有 または 無）"),
    orgDispatchComplianceDetail:    S("派遣先コンプライアンスの詳細"),
    orgAccidentInsurance:           S("労災保険加入等の措置（有 または 無）"),
    orgAccidentInsuranceDetail:     S("労災保険の詳細"),
    orgContinuousPerformance:       S("特定技能雇用契約を継続して履行する体制（有 または 無）"),
    orgSalaryPaymentVerifiable:     S("報酬の支払を客観的方法で確認できること（有 または 無）"),
    orgCoexistenceCooperation:      S("共生社会施策への協力（有 または 無）"),
    orgCoexistenceWorkplaceCity:    S("勤務地市区町村への協力確認書提出（有 または 無）"),
    orgCoexistenceWorkplaceCityDate: S("勤務地市区町村提出日 YYYY-MM-DD"),
    orgCoexistenceWorkplaceCityName: S("勤務地市区町村名"),
    orgCoexistenceResidenceCity:    S("住居地市区町村への協力確認書提出（有 または 無）"),
    orgCoexistenceResidenceCityDate: S("住居地市区町村提出日 YYYY-MM-DD"),
    orgCoexistenceResidenceCityName: S("住居地市区町村名"),
    orgFieldSpecificContractCriteria: S("分野別雇用契約適正履行基準への適合（有 または 無）"),

    // ── V型：支援責任者・支援担当者 ─────────────────────────────────────────
    supportManagerName:  S("支援責任者 氏名"),
    supportManagerTitle: S("支援責任者 役職・部署"),
    supportStaffName:    S("支援担当者 氏名"),
    supportStaffTitle:   S("支援担当者 役職・部署"),

    // ── V型：登録支援機関（RSO）─────────────────────────────────────────────
    rsoName:                    S("登録支援機関 名称"),
    rsoCorporateNo:             S("登録支援機関 法人番号（13桁）"),
    rsoInsuranceNo:             S("登録支援機関 雇用保険適用事業所番号"),
    rsoAddress:                 S("登録支援機関 住所"),
    rsoPhone:                   S("登録支援機関 電話番号"),
    rsoRepresentative:          S("登録支援機関 代表者氏名"),
    rsoRegNo:                   S("登録支援機関 登録番号"),
    rsoRegDate:                 S("登録支援機関 登録年月日 YYYY-MM-DD"),
    rsoSupportBusinessName:     S("登録支援機関 支援実施事業所名"),
    rsoSupportBusinessAddress:  S("登録支援機関 支援実施事業所所在地"),
    rsoSupportManager:          S("登録支援機関 支援責任者"),
    rsoSupportStaff:            S("登録支援機関 支援担当者"),
    rsoAvailableLanguages:      S("登録支援機関 対応可能言語"),
    rsoFeePerMonth:             S("登録支援機関 支援委託費用（月額・数値のみ・円）"),

    // ── N型：所属機関 Part 2 派遣先 ─────────────────────────────────────────
    dispatchOrgName:                  S("派遣先 名称（N型）"),
    dispatchOrgCorporateNumber:       S("派遣先 法人番号（13桁）"),
    dispatchOrgBranchName:            S("派遣先 支店・事業所名"),
    dispatchOrgEmploymentInsuranceNo: S("派遣先 雇用保険適用事業所番号"),
    dispatchOrgBusinessTypeCode:      S("派遣先 業種コード"),
    dispatchOrgAddress:               S("派遣先 所在地"),
    dispatchOrgPhone:                 S("派遣先 電話番号"),
    dispatchOrgCapital:               S("派遣先 資本金（数値のみ・円）"),
    dispatchOrgAnnualSales:           S("派遣先 年間売上高（数値のみ・円）"),
    dispatchPeriod:                   S("派遣期間"),

    // ── 資格外活動許可申請 ──────────────────────────────────────────────────
    gaikatsuCurrentActivity:       S("現在の在留活動の内容"),
    gaikatsuActivityType:          S("資格外活動 職務内容（翻訳・通訳/語学教師/その他）"),
    gaikatsuActivityTypeOther:     S("資格外活動 職務（その他の詳細）"),
    gaikatsuContractPeriod:        S("資格外活動 雇用契約期間"),
    gaikatsuWeeklyHours:           S("資格外活動 週間稼働時間"),
    gaikatsuSalary:                S("資格外活動 報酬（数値のみ・円）"),
    gaikatsuSalaryType:            S("資格外活動 報酬種別（月額/週額/日額）"),
    gaikatsuEmployerName:          S("資格外活動 勤務先名称"),
    gaikatsuEmployerAddress:       S("資格外活動 勤務先所在地"),
    gaikatsuEmployerPhone:         S("資格外活動 勤務先電話番号"),
    gaikatsuEmployerBusinessType:  S("資格外活動 業種（製造/商業/教育/その他）"),

    // ── その他 ──────────────────────────────────────────────────────────────
    notes: S("その他重要事項"),
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Stage 2 統合用スキーマ（responseSchema 強制 — 配列型を含む）
// ═════════════════════════════════════════════════════════════════════════════
const STAGE2_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // Stage 1 の全フィールドを継承（docType/docSubject/notes は除外）
    ...(() => {
      const { docType, docSubject, notes, ...rest } = STAGE1_RESPONSE_SCHEMA.properties;
      return rest;
    })(),

    // 配列型フィールド
    workHistory: {
      type: Type.ARRAY,
      description: "職歴一覧（最大10件）",
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          joinDate:  S("入社年月（YYYY-MM）"),
          leaveDate: S("退社年月（YYYY-MM。現職は空文字）"),
          employer:  S("勤務先名称"),
        },
      },
    },
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// ポスト処理バリデーション — ハルシネーション防止
// ═════════════════════════════════════════════════════════════════════════════

/** 日付フィールド（YYYY-MM-DD 形式のみ許可） */
const DATE_FIELDS = new Set([
  'dateOfBirth','passportExpiry','currentPeriodExpiry','scheduledDateOfEntry',
  'pastEntryLatestFrom','pastEntryLatestTo','deportationLatestDate',
  'orgContractStartDate','orgContractEndDate',
  'orgVDispatchStartDate','orgVDispatchEndDate',
  'orgPlacementProviderLicenseDate',
  'marriageDate','marriageRegistrationDate',
  'marriageNotificationDateJapan','marriageNotificationDateForeign',
  'educationGraduationDate','enrollmentDate','expectedGraduationDate',
  'employmentStartDate',
  'spouseDob','supporterDob','supporterPeriodExpiry',
  'rsoRegDate',
  'orgCoexistenceWorkplaceCityDate','orgCoexistenceResidenceCityDate',
]);

/** 有無フィールド（「有」「無」のみ許可） */
const YESNO_FIELDS = new Set([
  'maritalStatus','criminalRecord','familyInJapanExists',
  'pastEntryHistory','pastCoeHistory','deportationHistory',
  'accompanyingPersons','itQualificationExists',
  'partTimeWorkExistsR','partTimeWorkPermit','cohabitation',
  'depositContractExists','overseasExpensesExists',
  'homeCountryProcedureComplied','regularExpensesUnderstood',
  'technologyTransferEffortV','ssfSpecificFieldCriteriaMet',
  'orgWorkHoursEquivalent','orgSalaryEqualToJapanese',
  'orgSalaryPaymentCash','orgSalaryPaymentBank',
  'orgForeignTreatmentDifference','orgPaidHolidayForReturn',
  'orgFieldSpecificEmploymentCriteria','orgReturnTravelExpenses',
  'orgHealthCheck','orgProperResidenceCriteria',
  'orgHealthInsuranceMet','orgLaborInsuranceMet',
  'orgLaborLawViolation','orgInvoluntaryDismissal','orgMissingPerson',
  'orgCriminalPunishment','orgMentalDisability','orgBankruptcy',
  'orgTrainingRevoked','orgWasOfficerOfRevoked','orgIllegalActFiveYears',
  'orgGangsterMember','orgLegalAgentViolation',
  'orgGangsterControl','orgActivityDocumentKept',
  'orgAwareOfDeposit','orgPenaltyContractExists',
  'orgSupportCostNotBurdened',
  'orgDispatchMeetsCondition','orgDispatchMeetsCompliance',
  'orgAccidentInsurance','orgContinuousPerformance',
  'orgSalaryPaymentVerifiable','orgCoexistenceCooperation',
  'orgCoexistenceWorkplaceCity','orgCoexistenceResidenceCity',
  'orgFieldSpecificContractCriteria',
]);

/** 数値のみフィールド（数字以外を除去） */
const NUMERIC_FIELDS = new Set([
  'salary','orgCapital','orgAnnualSales','orgEmployeeCount',
  'orgForeignEmployeeCount','orgTechInternCount',
  'orgTimeConvertedBasicSalary','orgJapaneseEquivalentSalary',
  'orgWorkHoursWeekly','orgWorkHoursMonthly',
  'annualTuition','fundingAmount','scholarshipAmount',
  'supporterAnnualIncome','businessExperienceYears',
  'pastEntryCount','pastCoeCount','pastCoeNonIssuanceCount',
  'deportationCount','cumulativeStayYears','cumulativeStayMonths',
  'overseasExpensesAmount','rsoFeePerMonth',
  'partTimeWorkSalaryR','gaikatsuSalary',
  'dispatchOrgCapital','dispatchOrgAnnualSales',
]);

/** AI出力のバリデーション・クリーニング */
function validateAndClean(data: Record<string, any>): Record<string, any> {
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v === null || v === undefined) { data[k] = ''; continue; }
    if (typeof v !== 'string') continue;

    if (DATE_FIELDS.has(k)) {
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) data[k] = '';
    }
    if (YESNO_FIELDS.has(k)) {
      if (v && !['有','無'].includes(v)) data[k] = '';
    }
    if (NUMERIC_FIELDS.has(k)) {
      if (v) data[k] = v.replace(/[^0-9]/g, '');
    }
  }
  return data;
}

// ═════════════════════════════════════════════════════════════════════════════
// マスター確定値・AI非対象のフィールドキー
// ═════════════════════════════════════════════════════════════════════════════
const MASTER_OVERRIDE_KEYS = new Set([
  'applicationFormType','visaFormCategory','lastUpdated',
  'agentName','agentAddress','agentOrganization','agentPhone',
  'nationality','dateOfBirth','familyNameEn','givenNameEn',
  'familyNameJa','givenNameJa','sex',
  'postalCodeInJapan','prefectureInJapan','cityInJapan',
  'addressLineInJapan','addressInJapan','telephoneNo','cellularPhoneNo',
  'passportNumber','passportExpiry',
  'currentStatusOfResidence','currentPeriodExpiry','residenceCardNumber',
  'desiredStatusOfResidence',
  'employerName','employerAddress','employerPhone',
  'orgName','orgCorporateNumber','orgAddress','orgPhone',
  'orgCapital','orgEmployeeCount','orgEmploymentInsuranceNo',
]);

/** AI抽出対象外のフィールドキー（ステータス判定で除外） */
const STATUS_EXEMPT_KEYS = new Set([
  'applicationFormType','visaFormCategory','lastUpdated',
  'agentName','agentAddress','agentOrganization','agentPhone',
  'addressInJapan', // 結合値（自動生成）
  'freeformPart2Notes','freeformOrgNotes',
  'riyushoSubmissionBureau','riyushoBody',
  'gaikatsuNeeded',
]);

// ─── MIMEタイプ正規化 ────────────────────────────────────────────────────────
function normalizeMime(m: string): string {
  const lower = m.toLowerCase().trim();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  return lower;
}

// ─── ファイルをbase64で取得 ───────────────────────────────────────────────────
async function fileToBase64(
  fileUrl: string, mimeType: string | null
): Promise<{ base64: string; mime: string } | null> {
  try {
    let base64: string, mime: string;
    if (fileUrl.startsWith("data:")) {
      const ci = fileUrl.indexOf(",");
      base64 = fileUrl.slice(ci + 1);
      mime = normalizeMime(fileUrl.slice(5, ci).split(";")[0]);
    } else {
      const res = await fetch(fileUrl, { cache: "no-store" });
      if (!res.ok) {
        console.error(`[fillAllFields] fetch failed: ${res.status} ${res.statusText} for ${fileUrl.slice(0, 100)}`);
        return null;
      }
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      mime = normalizeMime(mimeType ?? "image/jpeg");
    }
    const ok = ["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf"];
    if (!ok.includes(mime)) {
      console.error(`[fillAllFields] unsupported mime: ${mime}`);
      return null;
    }
    return { base64, mime };
  } catch (e: any) {
    console.error(`[fillAllFields] fileToBase64 error: ${e?.message}`);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// メインアクション
// ═════════════════════════════════════════════════════════════════════════════
export async function fillAllFieldsFromDocs(
  applicationId: string
): Promise<{
  success: boolean;
  error?: string;
  formData?: Record<string, any>;
  docsRead?: number;
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = (session.user as any)?.tenantId as string | undefined;
    if (!tenantId) return { success: false, error: "テナントIDが取得できません" };

    if (!process.env.GEMINI_API_KEY) {
      return { success: false, error: "AI機能が設定されていません（GEMINI_API_KEY未設定）" };
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ── 1. 申請案件・申請人・所属機関を取得 ────────────────────────────────────
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId))).limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const [applicant] = await db.select().from(applicantMaster)
      .where(eq(applicantMaster.id, app.applicantId)).limit(1);
    const org = app.organizationId
      ? await db.select().from(organizationMaster)
          .where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
      : null;

    // 申請人氏名（扶養者と区別するため）
    const applicantNameEn = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ");
    const applicantNameJa = [applicant?.familyNameJa, applicant?.givenNameJa].filter(Boolean).join(" ");

    // ── 2. 提出済み書類を取得 ─────────────────────────────────────────────────
    const checklist = await db.select().from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));
    const submitted = checklist.filter(c => c.fileUrl && c.status === "submitted");

    if (submitted.length === 0) {
      return { success: false, error: "提出済みの書類がありません。書類をアップロードしてから実行してください。" };
    }

    // ── 3. 全書類を個別にGeminiで読み取り（Stage 1）────────────────────────────
    const ocrPerDoc: { name: string; data: Record<string, any> }[] = [];
    let docsRead = 0;
    const docErrors: string[] = [];

    for (const doc of submitted.slice(0, 20)) {
      const file = await fileToBase64(doc.fileUrl!, doc.mimeType);
      if (!file) {
        const reason = `ファイル取得失敗 (mime=${doc.mimeType}, url=${doc.fileUrl?.slice(0, 80)}...)`;
        console.error(`[fillAllFields] skip "${doc.documentName}": ${reason}`);
        docErrors.push(`${doc.documentName}: ${reason}`);
        continue;
      }

      try {
        const ocrPrompt = `【役割】あなたは特定技能の在留申請手続きを専門とする行政書士AIアシスタントです。提出書類から申請書記入に必要な情報を正確に読み取ります。

【処理対象】書類「${doc.documentName}」

【申請人の情報】
申請人氏名: ${applicantNameEn}${applicantNameJa ? `（${applicantNameJa}）` : ""}
※この書類に申請人と別人の情報が混在する場合（扶養者の書類等）、それぞれ区別して抽出してください。

【処理手順】
1. 書類全体を確認し、書類の種類を特定する（パスポート、在留カード、雇用条件書、雇用契約書、登記簿謄本 等）
2. 申請人の情報か、別人（扶養者・配偶者等）の情報かを判別する
3. スキーマに定義された各フィールドに該当する情報を正確に読み取る
4. 日付・数値等のフォーマットを指定形式に変換する

【データ形式に関する注意】
・入力データがExcelから出力されたCSV形式の場合、大量のカンマ（,,,）、空白セル、改行、日本語と英語の併記が含まれることがあります。
・項目名の前後・周辺にあるデータや、離れたセル位置にある数値も文脈から慎重に紐づけて抽出してください。
・チェックボックス（□ / ☑ / ■ / ✓ や「有・無」の選択）は、文脈からどちらが選択されているか判断し「有」または「無」で出力してください。
・表形式で項目名と値が離れている場合（例：「所定労働時間,,,,40」のような形式）、カンマ区切りの位置関係から値を正確に読み取ってください。

【制約（必ず遵守）】
・書類に明記されている情報のみ抽出し、推測・補完は行わないこと
・該当情報がない場合は ""（空文字列）とすること
・日付は必ずYYYY-MM-DD形式
・性別は「男」または「女」（M/Fは使用しない）
・有無は「有」または「無」（英語不可）
・数値フィールドは数値のみ（単位・記号・カンマ不可）`;

        const resp = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [
            { inlineData: { mimeType: file.mime, data: file.base64 } },
            { text: ocrPrompt },
          ]}],
          config: {
            responseMimeType: "application/json",
            responseSchema: STAGE1_RESPONSE_SCHEMA,
          },
        });

        const txt = resp.text ?? "{}";
        try {
          const data = JSON.parse(txt);
          ocrPerDoc.push({ name: doc.documentName, data });
          docsRead++;
        } catch (parseErr: any) {
          console.error(`[fillAllFields] JSON parse error for "${doc.documentName}":`, parseErr?.message, "raw:", txt.slice(0, 500));
          const m = txt.match(/```json?\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
          if (m) {
            try {
              const data = JSON.parse(m[1] ?? m[0]);
              ocrPerDoc.push({ name: doc.documentName, data });
              docsRead++;
            } catch (e2: any) {
              docErrors.push(`${doc.documentName}: JSONパース失敗`);
              console.error(`[fillAllFields] fallback parse also failed for "${doc.documentName}":`, e2?.message);
            }
          } else {
            docErrors.push(`${doc.documentName}: JSONパース失敗`);
          }
        }
      } catch (geminiErr: any) {
        const msg = geminiErr?.message ?? String(geminiErr);
        console.error(`[fillAllFields] Gemini Stage1 error for "${doc.documentName}":`, msg);
        docErrors.push(`${doc.documentName}: ${msg.slice(0, 200)}`);
      }
    }

    if (ocrPerDoc.length === 0) {
      const detail = docErrors.length > 0
        ? `\n詳細:\n${docErrors.join("\n")}`
        : "";
      console.error(`[fillAllFields] all docs failed. submitted=${submitted.length}, errors:`, docErrors);
      return { success: false, error: `書類の読み取りに失敗しました。${detail}` };
    }

    // ── 4. 全書類OCR結果を統合サマリーとして構築 ────────────────────────────
    const docSummary = ocrPerDoc.map((d, i) =>
      `【書類${i + 1}: ${d.name}】\n${JSON.stringify(d.data, null, 2)}`
    ).join("\n\n");

    // ── 5. 申請人マスターの確定値をベースに構築 ──────────────────────────────
    const toJaVisa = (v: string | null | undefined) =>
      v ? (VISA_TYPE_LABELS[v] ?? v) : "";

    const masterBase: Record<string, any> = {
      nationality:              applicant?.nationality ?? "",
      dateOfBirth:              applicant?.dateOfBirth ?? "",
      familyNameEn:             applicant?.familyNameEn ?? "",
      givenNameEn:              applicant?.givenNameEn ?? "",
      familyNameJa:             applicant?.familyNameJa ?? "",
      givenNameJa:              applicant?.givenNameJa ?? "",
      sex:                      applicant?.gender === "M" ? "男" : applicant?.gender === "F" ? "女" : "",
      postalCodeInJapan:        (applicant as any)?.postalCode ?? "",
      prefectureInJapan:        (applicant as any)?.japanPrefecture ?? "",
      cityInJapan:              (applicant as any)?.japanCity ?? "",
      addressLineInJapan:       (applicant as any)?.japanAddressLine ?? "",
      addressInJapan:           applicant?.japanAddress ?? "",
      telephoneNo:              applicant?.phone ?? "",
      cellularPhoneNo:          (applicant as any)?.mobilePhone ?? "",
      passportNumber:           applicant?.passportNumber ?? "",
      passportExpiry:           applicant?.passportExpiry ?? "",
      currentStatusOfResidence: toJaVisa(applicant?.currentVisaType),
      currentPeriodExpiry:      applicant?.currentVisaExpiry ?? "",
      residenceCardNumber:      applicant?.residenceCardNumber ?? "",
      desiredStatusOfResidence: VISA_TYPE_LABELS[app.visaType] ?? app.visaType ?? "",
      employerName:    org?.nameJa ?? "",
      employerAddress: [org?.prefecture, org?.city, org?.addressLine].filter(Boolean).join(""),
      employerPhone:   org?.phone ?? "",
      orgName:         org?.nameJa ?? "",
      orgCorporateNumber: org?.corporateNumber ?? "",
      orgAddress:      [org?.prefecture, org?.city, org?.addressLine].filter(Boolean).join(""),
      orgPhone:        org?.phone ?? "",
      orgCapital:      org?.capital ? String(org.capital) : "",
      orgEmployeeCount: org?.employeeCount ? String(org.employeeCount) : "",
      orgEmploymentInsuranceNo: org?.employmentInsuranceNo ?? "",
      agentName:         "山口忠士",
      agentOrganization: "兵庫県行政書士会",
      agentAddress:      "〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B",
      agentPhone:        "090-2596-0128",
    };

    // ── 6. 包括的Geminiコール：全フィールドを一括統合（Stage 2）──────────────
    const synthPrompt = `【役割】あなたは在留資格申請を専門とする行政書士AIアシスタントです。複数の提出書類から読み取った情報を統合し、申請書の全フィールドを正確に埋めます。

【処理手順】
1. 全${docsRead}件の書類読取結果を確認する（キー名は出力JSONと同じフォームフィールド名です）
2. 同一フィールドに複数の情報源がある場合、最も公的かつ最新の書類（パスポート・在留カード等）を優先する
3. 申請人の情報と扶養者・配偶者の情報を正確に区別する
4. 各フィールドの値を指定されたフォーマットに整形する

━━ 申請人情報（確定値・変更不可） ━━
氏名: ${applicantNameEn}${applicantNameJa ? `（${applicantNameJa}）` : ""}
国籍: ${applicant?.nationality ?? "不明"} / 在留資格: ${applicant?.currentVisaType ?? "不明"}
申請種別: ${app.applicationType} / 申請在留資格: ${app.visaType ?? ""}

━━ 読み取り済み書類（${docsRead}件） ━━
${docSummary}

━━ 所属機関情報 ━━
${org ? `${org.nameJa ?? ""} / 法人番号: ${org.corporateNumber ?? ""} / ${[org.prefecture, org.city, org.addressLine].filter(Boolean).join("")}` : "（なし）"}

上記の書類情報を精査し、responseSchemaに定義された全フィールドを埋めてください。

【データ形式に関する注意】
・入力データがExcelから出力されたCSV形式の場合、大量のカンマ（,,,）、空白セル、改行、日本語と英語の併記が含まれることがあります。
・項目名の前後・周辺にあるデータや、離れたセル位置にある数値も文脈から慎重に紐づけて抽出してください。
・チェックボックス（□ / ☑ / ■ / ✓ や「有・無」の選択）は、文脈からどちらが選択されているか判断し「有」または「無」で出力してください。
・表形式で項目名と値が離れている場合（例：「所定労働時間,,,,40」のような形式）、カンマ区切りの位置関係から値を正確に読み取ってください。

【制約（必ず遵守）】
・書類に明記されている情報を最優先（推測・補完は行わない）
・日付は必ずYYYY-MM-DD形式（例：2025-03-15）
・有無は「有」または「無」のみ（英語不可）
・性別は「男」または「女」のみ（M/F不可）
・数値フィールドは数値のみ（単位・記号・カンマ不可）
・不明・書類に記載なしは ""（空文字列）とすること`;

    const synthResp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: synthPrompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: STAGE2_RESPONSE_SCHEMA,
      },
    });

    const synthTxt = synthResp.text ?? "{}";
    let aiData: Record<string, any>;
    try {
      aiData = JSON.parse(synthTxt);
    } catch {
      const synthM = synthTxt.match(/```json?\s*([\s\S]*?)```/) ?? synthTxt.match(/(\{[\s\S]*\})/);
      aiData = synthM ? JSON.parse(synthM[1] ?? synthM[0]) : {};
    }

    // ── 6-b. バリデーション・クリーニング ────────────────────────────────────
    aiData = validateAndClean(aiData);

    // ── 7. マスターデータ優先でマージ ────────────────────────────────────────
    // EMPTY_FORM_DATA → 既存保存データ → AI抽出 → マスター確定値 の順で上書き
    const existingForm = (app.formData ?? {}) as Record<string, any>;
    const merged: Record<string, any> = { ...EMPTY_FORM_DATA, ...existingForm };

    // AIデータで空フィールドのみ埋める
    for (const [k, v] of Object.entries(aiData)) {
      if (v !== null && v !== undefined && v !== "" && !merged[k]) {
        merged[k] = v;
      }
    }
    // workHistory は配列処理
    if (aiData.workHistory && Array.isArray(aiData.workHistory) && aiData.workHistory.length > 0) {
      const wh = (merged.workHistory ?? []) as any[];
      if (wh.every((w: any) => !w.employer && !w.joinDate)) {
        merged.workHistory = aiData.workHistory;
      }
    }

    // マスター確定値を最後に上書き（変更不可フィールド）
    Object.assign(merged, masterBase);

    // ── 7-b. 家族滞在の場合、扶養者情報を在日親族に自動反映 ─────────────────
    if (app.visaType === 'dependent') {
      const supporterName = merged.supporterNameEn
        || [merged.supporterFamilyNameEn, merged.supporterGivenNameEn].filter(Boolean).join(' ');
      if (supporterName) {
        const familyList = (merged.familyInJapan ?? []) as any[];
        const alreadyExists = familyList.some((m: any) =>
          m.name && supporterName && m.name.replace(/\s/g, '') === supporterName.replace(/\s/g, '')
        );
        if (!alreadyExists) {
          familyList.unshift({
            relationship: merged.supporterRelationship || '',
            name: supporterName,
            dateOfBirth: merged.supporterDob || '',
            nationality: merged.supporterNationality || '',
            placeOfEmployment: merged.supporterEmployer || '',
            residingTogether: true,
            residenceCardNumber: merged.supporterResidenceCard || '',
          });
          merged.familyInJapan = familyList;
          merged.familyInJapanExists = '有';
        }
      }
    }

    // ── 7-c. AIフィールドステータスの生成 ───────────────────────────────────
    const fieldStatus: Record<string, 'confirmed' | 'empty'> = {};
    for (const key of Object.keys(EMPTY_FORM_DATA)) {
      if (STATUS_EXEMPT_KEYS.has(key)) continue;
      if (MASTER_OVERRIDE_KEYS.has(key)) continue;
      // 配列型は個別判定
      if (key === 'workHistory' || key === 'familyInJapan' || key === 'orgOccupationNumberAdditional') continue;

      const val = merged[key];
      if (val && val !== '' && val !== '無' && val !== '有') {
        // 実質的な値がある → confirmed
        fieldStatus[key] = 'confirmed';
      } else if (YESNO_FIELDS.has(key) && (val === '有' || val === '無')) {
        // 有無フィールドでデフォルト値と異なるか、AIが設定した → confirmed
        const defaultVal = (EMPTY_FORM_DATA as any)[key];
        if (aiData[key] && aiData[key] !== '') {
          fieldStatus[key] = 'confirmed';
        } else if (val !== defaultVal) {
          fieldStatus[key] = 'confirmed';
        } else {
          fieldStatus[key] = 'empty';
        }
      } else {
        fieldStatus[key] = 'empty';
      }
    }
    merged.aiFieldStatus = fieldStatus;

    // ── 8. DBに保存 ───────────────────────────────────────────────────────────
    await db.update(applications)
      .set({ formData: merged, updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    return { success: true, formData: merged, docsRead };
  } catch (err: any) {
    console.error("[fillAllFields] error:", err?.message);
    return { success: false, error: err.message ?? "処理中にエラーが発生しました" };
  }
}
