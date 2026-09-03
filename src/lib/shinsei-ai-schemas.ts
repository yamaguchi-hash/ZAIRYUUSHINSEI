/**
 * 特定技能申請書 AI抽出スキーマ（Gemini responseSchema）
 * ─────────────────────────────────────────────────
 * Stage 1: 書類個別OCR用（フラットフィールドのみ。配列を追加すると
 * Gemini responseSchema の状態数上限を超え 400 エラーになるため厳禁）
 * Stage 2: 統合用（workHistory / familyInJapan 配列を含む）
 */
import { Type } from "@google/genai";
import { FAMILY_IN_JAPAN_SCHEMA } from "@/lib/family-schema";

/** 文字列型nullable のショートカット */
const S = (desc: string) => ({ type: Type.STRING, description: desc, nullable: true });

// ═════════════════════════════════════════════════════════════════════════════
// Stage 1 個別書類OCR用スキーマ（フォームキー名で直接出力）
// ApplicationFormData の全フィールドを網羅（配列・メタ・マスター確定値は除外）
// ═════════════════════════════════════════════════════════════════════════════
export const STAGE1_RESPONSE_SCHEMA = {
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
    // 注意: Stage 1 に familyInJapan 配列を追加してはならない。
    // Gemini responseSchema の状態数上限を超え、全書類のOCRが400エラーになる。
    // 親族の書類は docSubject="在日親族" + フラットフィールドで抽出し、Stage 2 で配列に組み立てる。

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
export const STAGE2_RESPONSE_SCHEMA = {
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
    // 在日親族及び同居者（docSubject=在日親族 の書類読取結果から組み立てる）
    familyInJapan: FAMILY_IN_JAPAN_SCHEMA,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// プロンプト用フィールド定義リストの生成
// ─────────────────────────────────────────────────────────────────────────────
// 【重要】Gemini の responseSchema には状態数上限があり、本スキーマのような
// 大量（約300個）のプロパティを持つスキーマは 400 エラー
// "The specified schema produces a constraint that has too many states" になる。
// そのため STAGE1/STAGE2 では responseSchema を使わず、
// responseMimeType: "application/json" のみ（スキーマなしJSONモード）とし、
// フィールド定義はこの関数でプロンプト文字列に変換して渡す。
// ═════════════════════════════════════════════════════════════════════════════
export function schemaToFieldList(schema: { properties: Record<string, any> }): string {
  const lines: string[] = [];
  for (const [key, def] of Object.entries(schema.properties)) {
    if (def?.type === Type.ARRAY) {
      const sub = Object.entries((def.items?.properties ?? {}) as Record<string, any>)
        .map(([k, d]) => `"${k}": ${d?.description ?? ""}`)
        .join(", ");
      lines.push(`"${key}": 配列${def.description ? `（${def.description}）` : ""} — 要素: { ${sub} }`);
    } else {
      lines.push(`"${key}": ${def?.description ?? ""}`);
    }
  }
  return lines.join("\n");
}
