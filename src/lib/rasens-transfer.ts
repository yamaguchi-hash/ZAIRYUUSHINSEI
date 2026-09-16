/**
 * RASENS（在留申請オンラインシステム）転記データ生成
 *
 * JLSシステムの申請データをRASENSへ手動転記するための
 * フィールドマッピングとセクション分けロジック。
 *
 * フォーマット規則:
 * - 日付: YYYYMMDD（ハイフンなし）
 * - 住所: 郵便番号と分離、都道府県市区町村/番地以降で分割、全角
 * - 電話番号: ハイフンなし
 */

import type { ApplicationFormData, FamilyMember, WorkHistoryEntry, Part2Type } from "@/lib/form-types";
import { VISA_CATEGORY_PART2 } from "@/lib/form-types";
import { normalizeRomajiName } from "@/lib/utils";
import { ALL_QUESTIONS, isEmpty } from "@/lib/questionnaire-questions";
import { STAGE1_RESPONSE_SCHEMA } from "@/lib/shinsei-ai-schemas";

export interface RasensField {
  /** RASENSページ上のラベルテキスト */
  label: string;
  /** 入力する値 */
  value: string;
  /** 補足メモ */
  note?: string;
  /** セクション名（指定時はbuildTransferSectionsでこの名前のセクションに分類される） */
  section?: string;
  /**
   * このフィールドの由来となるフォームキー。申請書作成画面（shinsei-form-editor）と
   * 同じ並び順で転記シートを組み立てるためのソート・セクション判定に使う。
   * 固定出力（取次者）には "__agentN" のセンチネルを与える。
   */
  key?: string;
}

// ─── ユーティリティ関数 ──────────────────────────────────────────────────────

/** 半角数字を全角数字に変換 */
function toFullWidthDigits(str: string): string {
  return str.replace(/[0-9]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
  );
}

/** 半角英字を全角英字に変換 */
function toFullWidthAlpha(str: string): string {
  return str.replace(/[A-Za-z]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
  );
}

/** 半角ハイフン・スラッシュ等を全角に変換 */
function toFullWidthSymbols(str: string): string {
  return str
    .replace(/-/g, "ー")
    .replace(/\//g, "／")
    .replace(/\(/g, "（")
    .replace(/\)/g, "）")
    .replace(/\s/g, "　");
}

/** 住所用：文字列を全角に変換（数字・英字・記号） */
function toFullWidthAddress(str: string): string {
  if (!str) return "";
  let result = stripZipPrefix(str);
  result = toFullWidthDigits(result);
  result = toFullWidthAlpha(result);
  result = toFullWidthSymbols(result);
  return result;
}

/** AddressSplitSimple が埋め込む「〒1234567|」プレフィックスを除去して住所部分のみ返す */
function stripZipPrefix(str: string): string {
  return str.replace(/^〒\d{7}\|/, "");
}

/** AddressSplitSimple が埋め込む「〒1234567|」プレフィックスから郵便番号を取り出す */
function extractZipFromValue(str: string): string {
  const m = (str || "").match(/^〒(\d{7})\|/);
  return m ? m[1] : "";
}

/** 日付をYYYYMMDD形式に変換（ハイフン除去） */
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  // YYYY-MM-DD → YYYYMMDD
  return dateStr.replace(/-/g, "").replace(/\//g, "");
}

/** 電話番号からハイフンを除去 */
function formatPhone(phone: string): string {
  if (!phone) return "";
  return phone.replace(/-/g, "").replace(/\s/g, "");
}

/** 郵便番号からハイフンを除去 */
function formatPostalCode(code: string): string {
  if (!code) return "";
  return code.replace(/-/g, "").replace(/\s/g, "");
}

/**
 * 「〒1234567|住所」形式の値を、他の住所欄やPDF出力と揃う
 * 「〒123-4567　住所」の標準表記に変換する（PDF側の fmtAddr() と同じ規則）
 */
function formatStandardAddress(value: string | null | undefined): string {
  if (!value) return "";
  const m = value.match(/^〒(\d{3})(\d{4})\|(.*)$/);
  if (m) return `〒${m[1]}-${m[2]}　${m[3] || ""}`.trim();
  return value;
}

/**
 * 申請書のPart2種別（N/T/R/P/V/none）を判定する。
 * visaFormCategory未設定の古いデータは null（＝カテゴリでの絞り込みをしない）を返す。
 */
function formPart2Of(f: Partial<ApplicationFormData>): Part2Type | null {
  const cat = f.visaFormCategory;
  if (!cat) return null;
  return VISA_CATEGORY_PART2[cat] ?? "none";
}

/**
 * 指定のフォームキーが、この申請書（カテゴリ）の様式に存在する項目かどうかを判定する。
 * 他カテゴリ専用の項目（例: 特定技能の申請書に家族滞在用の扶養者情報）が
 * 残存データとして紛れ込んでいても転記シートに出さないためのゲート。
 */
function isKeyOnForm(key: string, f: Partial<ApplicationFormData>): boolean {
  // ── 申請種別（認定/変更/更新/永住）によるゲート ─────────────────────────
  // 申請書エディタ（shinsei-form-editor.tsx）の表示条件と一致させること。
  const ft = f.applicationFormType;
  if (ft) {
    // 認定（COE）専用: 入国目的・入国予定（11〜16）・過去の出入国歴/申請歴（17〜18）・退去強制歴（20）
    if (/^(purposeOfEntry|scheduledDateOfEntry|portOfEntry|intendedLengthOfStay|accompanyingPersons|intendedPlaceForVisa|pastEntry|pastCoe|deportation)/.test(key)) {
      return ft === "coe";
    }
    // 在留中の申請（変更・更新・永住）のみ: 現在の在留資格・在留期間・満了日・在留カード番号
    if (/^(currentStatusOfResidence|currentPeriodOfStay|currentPeriodExpiry|residenceCardNumber)$/.test(key)) {
      return ft !== "coe";
    }
    // 希望する在留資格は変更申請のみ（更新は同一資格のため様式に無い）
    if (key === "desiredStatusOfResidence") return ft === "change";
    // 希望する在留期間は変更・更新のみ
    if (key === "desiredPeriodOfStay") return ft === "change" || ft === "extension";
    // 変更・更新・永住の理由
    if (key === "reasonForApplication") return ft === "change" || ft === "extension" || ft === "permanent";
    // 出生地は認定・変更のみ（更新様式では項目5=配偶者の有無）
    if (key === "placeOfBirth") return ft === "coe" || ft === "change";
    // 受領方法等（オンライン申請システム転記用）は認定申請のみ
    if (/^(coeReceiptMethod|notificationEmail|portalPhotoFileName|portalAttachmentFileName)/.test(key)) {
      return ft === "coe";
    }
  }

  const part2 = formPart2Of(f);
  if (part2 === null) return true;

  // 特定技能2号: 1号の場合のみ記入する項目は申請書上「省略」となるため転記しない。
  // 対象: 日本語能力の立証(19)・通算在留期間(21)・支援費用負担(26)・
  // 支援体制(34)〜(42)・支援計画(1)〜(16)・登録支援機関。
  // 判定式は shinsei-form-editor.tsx / shinsei-shared.tsx の is2Go と一致させること。
  // ※ 下の条件付きゲートより先に判定する（2号では日本語試験欄なども出さない）
  const is2Go = part2 === "V" && f.desiredStatusOfResidence === "特定技能2号";
  if (is2Go && (/^(japaneseAbility|cumulativeStay|rso|support[A-Z])/.test(key) || key === "orgSupportCostNotBurdened")) {
    return false;
  }

  // ── 申請書上で入力条件付きの項目（選択に応じて表示される項目）のゲート ──
  // 技能水準の試験欄: 証明方法が「試験」または「分野別運用方針に定める評価方法」の場合のみ
  if (/^skillLevelExam/.test(key)) {
    return part2 === "V"
      && (f.skillLevelProofMethod === "試験" || f.skillLevelProofMethod === "分野別運用方針に定める評価方法");
  }
  // 日本語能力の試験欄: 証明方法が「日本語試験」の場合のみ
  if (/^japaneseAbilityExam/.test(key)) {
    return part2 === "V" && f.japaneseAbilityProofMethod === "日本語試験";
  }
  // 良好に修了した技能実習2号: 技能水準または日本語能力で「技能実習2号を良好に修了」を選択した場合のみ
  if (/^completedTit2/.test(key)) {
    return part2 === "V"
      && (f.skillLevelProofMethod === "技能実習2号を良好に修了" || f.japaneseAbilityProofMethod === "技能実習2号を良好に修了");
  }
  // R型（家族滞在）専用: 資格外活動(R)
  if (/^partTimeWork/.test(key)) return part2 === "R";
  // R型・T型共用: 扶養者・婚姻/出生届出・滞在費支弁（定住者COE等は家族滞在と同じ様式を流用）
  if (/^(supporter|marriageNotification|fundingMethod|fundingMonthlyAmount|fundingRemittanceType|fundingRemittanceAmount)/.test(key)) {
    return part2 === "R" || part2 === "T";
  }
  // T型（日本人配偶者等・定住者）専用: 配偶者・婚姻届出・同居・定住理由・身分地位・経費支弁者・身元保証人・申請人年収
  if (/^(spouse|marriageRegistration|cohabitation|longTermResidentReason|statusOrPosition|expensePayer|guarantor|applicantAnnualIncome)/.test(key) || key === "marriageDate") {
    return part2 === "T";
  }
  // P型（留学）専用: 在籍学校・奨学金・研究室等
  if (/^(school|scholarship|enrollment|expectedGraduation|courseOfStudy|annualTuition|fundingSource|fundingAmount|researchRoom)/.test(key)) return part2 === "P";
  // N型（就労系）専用: 最終学歴・情報処理資格・専攻
  if (/^(education|itQualification|majorCategory)/.test(key)) return part2 === "N";
  // V型（特定技能）専用: 特定技能所属機関・支援計画・登録支援機関・派遣・技能/日本語試験等
  if (/^(orgV|rso|support[A-Z]|dispatch|completedTit2|skillLevel|japaneseAbility|ssf|technologyTransfer|cumulativeStay)/.test(key)) return part2 === "V";
  // 資格外活動許可申請書: R型・P型、または明示的に「希望有」の場合のみ
  if (/^gaikatsu/.test(key)) return part2 === "R" || part2 === "P" || f.gaikatsuNeeded === "有";
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// 申請書作成画面（shinsei-form-editor.tsx）と同じ項目順序で転記シートを並べるための
// 正準順序（EDITOR_ORDER）とセクション境界（SECTION_BOUNDARIES）。
// EDITOR_ORDER はエディタのフィールド出現順を反映する。ここに無いキーは
// 「その他の申請書記載項目」として既知項目の後・取次者の前にまとめる。
// ─────────────────────────────────────────────────────────────────────────────
const EDITOR_ORDER: string[] = [
  // Part1 基本情報（1〜7）
  "nationality", "dateOfBirth", "familyNameEn", "givenNameEn", "familyNameJa", "givenNameJa",
  "sex", "placeOfBirth", "maritalStatus", "occupation", "homeTownCity",
  // 日本における連絡先（8/9）
  "postalCodeInJapan", "prefectureInJapan", "cityInJapan", "addressLineInJapan", "addressInJapan",
  "telephoneNo", "cellularPhoneNo", "emailAddress",
  // 旅券（9/10）
  "passportNumber", "passportExpiry",
  // 入国目的・入国予定（認定申請 11〜16）
  "purposeOfEntry", "scheduledDateOfEntry", "portOfEntry", "intendedLengthOfStay", "accompanyingPersons", "intendedPlaceForVisa",
  // 過去の出入国歴・申請歴（認定申請 17〜18）
  "pastEntryHistory", "pastEntryCount", "pastEntryLatestFrom", "pastEntryLatestTo", "pastCoeHistory", "pastCoeCount", "pastCoeNonIssuanceCount",
  // 現在の在留状況・申請内容（11〜14）
  "currentStatusOfResidence", "currentPeriodOfStay", "currentPeriodExpiry", "residenceCardNumber",
  "desiredStatusOfResidence", "desiredPeriodOfStay", "reasonForApplication",
  // 犯罪・退去強制歴（15/19・20）
  "criminalRecord", "criminalRecordDetail", "deportationHistory", "deportationCount", "deportationLatestDate",
  // 在日親族及び同居者（16/21）
  "familyInJapanExists",
  // 勤務先（N型）／特定技能所属機関（V型 17）
  "employerName", "employerBranchName", "employerAddress", "employerPhone",
  // 最終学歴（N型）
  "educationCountry", "educationDegree", "educationSchoolName", "educationGraduationDate",
  // 専攻・情報処理技術者資格（N型）
  "majorCategory", "majorCategoryOther", "itQualificationExists", "itQualificationName",
  // 配偶者の情報（T型）
  "spouseFamilyNameEn", "spouseGivenNameEn", "spouseFamilyNameJa", "spouseGivenNameJa", "spouseDob",
  "spouseNationality", "spouseResidenceStatus", "spouseResidenceCard", "spouseOccupation", "spouseEmployer", "spouseAddress",
  // 婚姻・家族関係（T型）
  "marriageDate", "marriageRegistrationPlace", "marriageRegistrationDate", "cohabitation", "separationReason", "longTermResidentReason",
  "statusOrPosition",
  // 婚姻・出生等の届出（R型・T型共用）
  "marriageNotificationPlaceJapan", "marriageNotificationDateJapan", "marriageNotificationPlaceForeign", "marriageNotificationDateForeign",
  // 申請人の勤務先等（T型。名称等は employerXxx を流用）
  "applicantAnnualIncome",
  // 滞在費支弁方法（R型・T型共用）
  "fundingMethod", "fundingMethodOther", "fundingMonthlyAmount", "fundingRemittanceType", "fundingRemittanceAmount",
  // 経費支弁者（T型）
  "expensePayerName", "expensePayerNationality", "expensePayerAddress", "expensePayerPhone",
  "expensePayerOccupation", "expensePayerWorkPhone", "expensePayerAnnualIncome",
  // 資格外活動（R型）
  "partTimeWorkExistsR", "partTimeWorkTypeR", "partTimeWorkOrgNameR", "partTimeWorkBranchNameR", "partTimeWorkPhoneR", "partTimeWorkHoursR", "partTimeWorkSalaryR", "partTimeWorkSalaryTypeR",
  // 扶養者の情報（R型・T型共用）
  "supporterNameEn", "supporterFamilyNameEn", "supporterGivenNameEn", "supporterDob", "supporterNationality", "supporterResidenceCard",
  "supporterStatusOfResidence", "supporterPeriodOfStay", "supporterPeriodExpiry", "supporterRelationship", "supporterRelationshipOther",
  "supporterEmployer", "supporterCorporateNumber", "supporterBranchName", "supporterEmployerAddress", "supporterAddress", "supporterEmployerPhone", "supporterAnnualIncome",
  // 在日身元保証人又は連絡先（T型）
  "guarantorName", "guarantorOccupation", "guarantorAddress", "guarantorPhone", "guarantorCellular",
  // 在籍学校・学習内容（P型）
  "schoolName", "schoolType", "schoolAddress", "schoolPhone", "courseOfStudy", "enrollmentDate", "expectedGraduationDate", "annualTuition",
  "fundingSource", "fundingAmount", "scholarshipName", "scholarshipAmount", "partTimeWorkPermit",
  // 技能水準（V型 18）
  "skillLevelProofMethod", "skillLevelExamName1", "skillLevelExamCountry1", "skillLevelExamCountryName1", "skillLevelExamName2", "skillLevelExamCountry2", "skillLevelExamCountryName2",
  // 日本語能力（V型 19）
  "japaneseAbilityProofMethod", "japaneseAbilityExamName1", "japaneseAbilityExamCountry1", "japaneseAbilityExamCountryName1", "japaneseAbilityExamName2", "japaneseAbilityExamCountry2", "japaneseAbilityExamCountryName2",
  // 良好に修了した技能実習2号（V型 20）
  "completedTit2Occupation1", "completedTit2Operations1", "completedTit2ProofType1", "completedTit2Occupation2", "completedTit2Operations2", "completedTit2ProofType2",
  // 特定技能1号での通算在留期間（V型 21）
  "cumulativeStayYears", "cumulativeStayMonths",
  // 申請人等作成用 ３Ｖ（項目22〜27）
  "depositContractExists", "overseasExpensesExists", "overseasExpensesOrgName", "overseasExpensesAmount",
  "homeCountryProcedureComplied", "regularExpensesUnderstood", "technologyTransferEffortV", "ssfSpecificFieldCriteriaMet",
  // 職歴（V型 28 等）
  "workHistory",
  // 補足情報（申請人等作成用）
  "freeformPart2Notes",
  // 代理人（法定代理人による申請）
  "representativeName", "representativeRelationship", "representativeAddress", "representativePhone", "representativeCellular",
  // 受領方法等（COE申請・オンライン申請システム転記用）
  "coeReceiptMethod", "notificationEmail", "notificationEmailConfirm", "portalPhotoFileName", "portalAttachmentFileName",
  // 所属機関・就労条件・雇用契約・給与・職種
  "contractType", "contractTypeOther", "orgName", "orgCorporateNumber", "orgBranchName", "orgEmploymentInsuranceNo",
  "orgBusinessTypeCode", "orgBusinessTypeOtherCode", "orgAddress", "orgPhone", "orgCapital", "orgAnnualSales",
  "orgEmployeeCount", "orgForeignEmployeeCount", "orgTechInternCount",
  "researchRoomName", "researchRoomProfessor",
  "workPeriodFixed", "workPeriodDuration", "employmentStartDate", "employmentStartDateStatus", "salary", "salaryType",
  "businessExperienceYears", "positionExists", "position", "occupationCode", "occupationCodeOthers", "activityDetails",
  "orgContractStartDate", "orgContractEndDate", "orgContractRenewal", "orgSpecifiedIndustrialField", "orgWorkCategory",
  "orgVWorkplaceName", "orgVWorkplaceAddress", "orgOccupationNumber", "orgOccupationNumberAdditional",
  "orgWorkHoursWeekly", "orgWorkHoursMonthly", "orgWorkDaysWeekly", "orgWorkHoursEquivalent", "orgTimeConvertedBasicSalary",
  "orgJapaneseEquivalentSalary", "orgSalaryEqualToJapanese", "orgAllowancesDetail", "orgMonthlyTotalEstimate", "orgSalaryEqualityExplanation",
  "orgOvertimeRate", "orgHolidayRate", "orgNightShiftRate", "orgSalaryPaymentCash", "orgSalaryPaymentBank",
  "orgSalaryClosingDate", "orgSalaryPaymentDate", "orgDeductionItems", "orgForeignTreatmentDifference", "orgForeignTreatmentDetail",
  // 派遣先（労働者派遣・V型）
  "orgVDispatchName", "orgVDispatchCorporateNo", "orgVDispatchInsuranceNo", "orgVDispatchAddress", "orgVDispatchPhone",
  "orgVDispatchRepresentative", "orgVDispatchStartDate", "orgVDispatchEndDate",
  // 職業紹介事業者・取次機関
  "orgPlacementProviderName", "orgPlacementProviderCorporateNo", "orgPlacementProviderInsuranceNo", "orgPlacementProviderAddress",
  "orgPlacementProviderPhone", "orgPlacementProviderLicenseNo", "orgPlacementProviderLicenseDate",
  "orgIntermediaryName", "orgIntermediaryAddress", "orgIntermediaryPhone",
  "freeformOrgNotes",
  // コンプライアンス・追加確認事項
  "orgLaborInsuranceNo", "orgHealthInsuranceMet", "orgLaborInsuranceMet", "orgActivityDocumentKept", "orgSupportCostNotBurdened",
  "orgAccidentInsurance", "orgAccidentInsuranceDetail", "orgCoexistenceCooperation",
  "orgCoexistenceWorkplaceCity", "orgCoexistenceWorkplaceCityDate", "orgCoexistenceWorkplaceCityName",
  "orgCoexistenceResidenceCity", "orgCoexistenceResidenceCityDate", "orgCoexistenceResidenceCityName", "orgFieldSpecificContractCriteria",
  "orgBankruptcy", "orgBankruptcyDetail", "orgCriminalPunishment", "orgCriminalPunishmentDetail",
  "orgLaborLawViolation", "orgLaborLawViolationDetail", "orgIllegalActFiveYears", "orgIllegalActFiveYearsDetail",
  "orgGangsterMember", "orgGangsterMemberDetail", "orgGangsterControl", "orgGangsterControlDetail",
  "orgMissingPerson", "orgMissingPersonDetail", "orgInvoluntaryDismissal", "orgInvoluntaryDismissalDetail",
  "orgTrainingRevoked", "orgTrainingRevokedDetail", "orgWasOfficerOfRevoked", "orgWasOfficerOfRevokedDetail",
  "orgMentalDisability", "orgMentalDisabilityDetail", "orgLegalAgentViolation", "orgLegalAgentViolationDetail",
  "orgAwareOfDeposit", "orgAwareOfDepositDetail", "orgPenaltyContractExists", "orgPenaltyContractDetail",
  "orgContinuousPerformance", "orgProperResidenceCriteria", "orgHealthCheck", "orgHealthCheckCostBurden",
  "orgPaidHolidayForReturn", "orgReturnTravelExpenses", "orgReturnTravelExpenseDetail",
  // 支援体制（支援責任者・支援担当者 34〜42）
  "supportManagerName", "supportManagerTitle", "supportManagerAppointed", "supportStaffName", "supportStaffTitle", "supportStaffAppointed",
  "supportExperienceCriteria", "supportExperienceCriteriaItem1", "supportExperienceCriteriaItem2", "supportExperienceCriteriaItem3", "supportExperienceCriteriaItem3Detail",
  "supportLanguageCapability", "supportDocumentKept", "supportNeutralPosition", "supportFailureHistory", "supportFailureHistoryDetail",
  "supportPeriodicInterviewCapability", "supportImplementationFieldCriteria",
  // 1号特定技能外国人支援計画（1〜16）
  "supportPlanInfoProvision", "supportPlanInfoProvisionMethod", "supportPlanAirportTransfer", "supportPlanHousingSupport",
  "supportPlanLifeContractSupport", "supportPlanLivingInfoProvision", "supportPlanProcedureAccompany", "supportPlanJapaneseLearning",
  "supportPlanConsultationResponse", "supportPlanExchangePromotion", "supportPlanJobChangeSupport", "supportPlanPeriodicInterview",
  "supportPlanCopyProvided", "supportPlanFieldSpecificMatters", "supportPlanContentAppropriate", "supportPlanFieldSpecificCriteria",
  // 登録支援機関
  "rsoName", "rsoCorporateNo", "rsoInsuranceNo", "rsoAddress", "rsoPhone", "rsoRepresentative", "rsoRegNo", "rsoRegDate",
  "rsoSupportBusinessName", "rsoSupportBusinessAddress", "rsoSupportManager", "rsoSupportStaff", "rsoAvailableLanguages", "rsoFeePerMonth",
  // 派遣先等（勤務地が所属機関と異なる場合）
  "dispatchOrgName", "dispatchOrgCorporateNumber", "dispatchOrgBranchName", "dispatchOrgEmploymentInsuranceNo",
  "dispatchOrgBusinessTypeCode", "dispatchOrgAddress", "dispatchOrgPhone", "dispatchOrgCapital", "dispatchOrgAnnualSales", "dispatchPeriod",
  // 資格外活動許可申請書
  "gaikatsuNeeded", "gaikatsuCurrentActivity", "gaikatsuActivityType", "gaikatsuActivityTypeOther", "gaikatsuContractPeriod",
  "gaikatsuWeeklyHours", "gaikatsuSalary", "gaikatsuSalaryType", "gaikatsuEmployerName", "gaikatsuEmployerAddress",
  "gaikatsuEmployerPhone", "gaikatsuEmployerBusinessType",
];

const EDITOR_ORDER_INDEX: Map<string, number> = new Map(EDITOR_ORDER.map((k, i) => [k, i]));
const UNKNOWN_ORDER = 900000; // 正準順序に無いキー（既知項目の後・取次者の前）
const AGENT_ORDER = 1000000;  // 取次者（常に最後）

// ── 特定技能（V型）専用の並び順 ─────────────────────────────────────────────
// 特定技能の申請書（所属機関に関する情報等）は「特定技能雇用契約（項目2：契約期間・
// 従事すべき業務・報酬・労働時間・支払方法・派遣先・職業紹介事業者・取次機関等）」を
// 「特定技能所属機関の基本情報（項目3：名称・所在地・資本金・職員数・勤務させる事業所・
// 各種保険の適用・コンプライアンス等）」より前に記載する。RASENS転記シートもこの順に
// 合わせるため、V型のときだけ所属機関領域内で「雇用契約ブロック」を「機関基本情報ブロック」
// より前へ並べ替える。他の在留資格（N/T/P/R型）の並び順には一切影響しない。
// 特定技能雇用契約ブロック（申請書「所属機関に関する情報等」の項目2）を、オンライン
// 申請書と同じ順序で明示的に並べる。契約期間→従事業務→職種→労働時間→報酬→支払方法→
// 待遇→一時帰国→告示基準→派遣先→職業紹介事業者→取次機関 の順。
const V_CONTRACT_ORDER: string[] = [
  "orgContractStartDate", "orgContractEndDate",                     // 2.1, 2.2 雇用契約期間
  "orgSpecifiedIndustrialField", "orgWorkCategory",                 // 2.3, 2.4 特定産業分野・業務区分
  "orgOccupationNumber", "orgOccupationNumberAdditional",           // 2.5, 2.6 職種
  "orgWorkHoursWeekly", "orgWorkHoursMonthly", "orgWorkDaysWeekly", "orgWorkHoursEquivalent", // 2.7〜2.9 所定労働時間
  "salary", "salaryType", "orgTimeConvertedBasicSalary",            // 2.10 月額報酬・2.11 基本給時間換算額
  "orgJapaneseEquivalentSalary", "orgSalaryEqualToJapanese",        // 2.12, 2.13 日本人同等報酬
  "orgAllowancesDetail", "orgMonthlyTotalEstimate", "orgSalaryEqualityExplanation",
  "orgOvertimeRate", "orgHolidayRate", "orgNightShiftRate",
  "orgSalaryPaymentCash", "orgSalaryPaymentBank",                   // 2.14 支払方法
  "orgSalaryClosingDate", "orgSalaryPaymentDate", "orgDeductionItems",
  "orgForeignTreatmentDifference", "orgForeignTreatmentDetail",     // 2.15 異なる待遇
  "orgPaidHolidayForReturn",                                        // 2.16 一時帰国有給
  "orgFieldSpecificContractCriteria",                              // 2.17/2.20 告示基準
  "orgReturnTravelExpenses", "orgReturnTravelExpenseDetail",        // 2.18 帰国旅費負担
  // 2.21〜2.29 派遣先
  "orgVDispatchName", "orgVDispatchCorporateNo", "orgVDispatchInsuranceNo", "orgVDispatchAddress", "orgVDispatchPhone",
  "orgVDispatchRepresentative", "orgVDispatchStartDate", "orgVDispatchEndDate",
  // 2.30〜2.37 職業紹介事業者
  "orgPlacementProviderName", "orgPlacementProviderCorporateNo", "orgPlacementProviderInsuranceNo", "orgPlacementProviderAddress",
  "orgPlacementProviderPhone", "orgPlacementProviderLicenseNo", "orgPlacementProviderLicenseDate",
  // 2.38〜2.42 取次機関
  "orgIntermediaryName", "orgIntermediaryAddress", "orgIntermediaryPhone",
];
const V_CONTRACT_KEY_SET = new Set(V_CONTRACT_ORDER);

// 所属機関領域（contractType 〜 gaikatsu の直前）内で、雇用契約ブロックを（申請書順で）
// 機関基本情報ブロックより前へ並べ替えた V 用順序。契約ブロックは V_CONTRACT_ORDER の
// 明示順、機関基本情報ブロック（残り）は EDITOR_ORDER の相対順を維持する。
const EDITOR_ORDER_V: string[] = (() => {
  const orgStart = EDITOR_ORDER.indexOf("contractType");
  const gaikatsuStart = EDITOR_ORDER.indexOf("gaikatsuNeeded");
  if (orgStart < 0 || gaikatsuStart < 0 || gaikatsuStart < orgStart) return EDITOR_ORDER;
  const before = EDITOR_ORDER.slice(0, orgStart);
  const region = EDITOR_ORDER.slice(orgStart, gaikatsuStart);
  const after = EDITOR_ORDER.slice(gaikatsuStart);
  // 契約ブロック: 明示順のうち region に実在するキーのみ
  const contractFirst = V_CONTRACT_ORDER.filter((k) => region.includes(k));
  // 機関基本情報ブロック: region から契約ブロックを除いた残り（EDITOR_ORDER順を維持）
  const rest = region.filter((k) => !V_CONTRACT_KEY_SET.has(k));
  return [...before, ...contractFirst, ...rest, ...after];
})();
const EDITOR_ORDER_V_INDEX: Map<string, number> = new Map(EDITOR_ORDER_V.map((k, i) => [k, i]));

/** フォームキーの正準順序インデックスを返す。useV=true のとき特定技能（V型）専用順序を使う。 */
function orderOf(key: string | undefined, useV = false): number {
  if (!key) return UNKNOWN_ORDER;
  if (key.startsWith("__agent")) return AGENT_ORDER;
  const idx = (useV ? EDITOR_ORDER_V_INDEX : EDITOR_ORDER_INDEX).get(key);
  return idx === undefined ? UNKNOWN_ORDER : idx;
}

/** セクション境界（アンカーキー → セクション名）。順序はorderOfで自動整列する。 */
const SECTION_BOUNDARIES: [string, string][] = [
  ["nationality", "申請人　基本情報"],
  ["postalCodeInJapan", "日本における連絡先"],
  ["passportNumber", "旅券（パスポート）"],
  ["purposeOfEntry", "入国目的・入国予定（認定申請）"],
  ["pastEntryHistory", "過去の出入国歴・申請歴（認定申請）"],
  ["currentStatusOfResidence", "現在の在留状況・申請内容"],
  ["criminalRecord", "犯罪・退去強制歴"],
  ["familyInJapanExists", "在日親族及び同居者"],
  ["employerName", "勤務先・特定技能所属機関"],
  ["educationCountry", "最終学歴"],
  ["majorCategory", "専攻・情報処理技術者資格"],
  ["spouseFamilyNameEn", "配偶者の情報"],
  ["marriageDate", "婚姻・家族関係"],
  ["statusOrPosition", "身分又は地位"],
  ["marriageNotificationPlaceJapan", "婚姻・出生等の届出"],
  ["applicantAnnualIncome", "申請人の勤務先等"],
  ["fundingMethod", "滞在費支弁方法"],
  ["expensePayerName", "経費支弁者"],
  ["partTimeWorkExistsR", "資格外活動（家族滞在）"],
  ["supporterNameEn", "扶養者の情報"],
  ["guarantorName", "在日身元保証人又は連絡先"],
  ["schoolName", "在籍学校・学習内容"],
  ["skillLevelProofMethod", "技能水準"],
  ["japaneseAbilityProofMethod", "日本語能力"],
  ["completedTit2Occupation1", "良好に修了した技能実習2号"],
  ["cumulativeStayYears", "特定技能1号での通算在留期間"],
  ["depositContractExists", "申請人等作成用 ３Ｖ（項目22〜27）"],
  ["workHistory", "職歴"],
  ["freeformPart2Notes", "補足情報（申請人等作成用）"],
  ["representativeName", "代理人（法定代理人による申請）"],
  ["coeReceiptMethod", "受領方法等"],
  ["contractType", "所属機関・就労条件・雇用契約・給与・職種"],
  ["orgVDispatchName", "派遣先（労働者派遣）"],
  ["orgPlacementProviderName", "職業紹介事業者・取次機関"],
  ["freeformOrgNotes", "補足情報（所属機関等作成用）"],
  ["orgLaborInsuranceNo", "コンプライアンス・追加確認事項"],
  ["supportManagerName", "支援体制（支援責任者・支援担当者）"],
  ["supportPlanInfoProvision", "1号特定技能外国人支援計画"],
  ["rsoName", "登録支援機関"],
  ["dispatchOrgName", "派遣先等（勤務地が異なる場合）"],
  ["gaikatsuNeeded", "資格外活動許可申請書"],
];

// V型（特定技能）専用のセクション境界。所属機関領域を「特定技能雇用契約」ブロックと
// 「特定技能所属機関（受入れ機関の情報）」ブロックに分けて見出しを付ける。
// ・"orgContractStartDate"（V順で雇用契約ブロックの先頭）に契約ブロックの見出しを置く
// ・"contractType"（V順で機関基本情報ブロックの先頭）の見出しを機関情報用に差し替える
const SECTION_BOUNDARIES_V: [string, string][] = [
  ...SECTION_BOUNDARIES.map(([anchor, title]): [string, string] =>
    anchor === "contractType" ? [anchor, "特定技能所属機関（受入れ機関の情報）"] : [anchor, title]
  ),
  ["orgContractStartDate", "特定技能雇用契約（就労条件・報酬・従事業務等）"],
];

// アンカーキーを正準順序で昇順に整列しておく（通常順 / V型専用順）
const SORTED_BOUNDARIES = SECTION_BOUNDARIES
  .map(([anchor, title]) => ({ idx: orderOf(anchor), title }))
  .sort((a, b) => a.idx - b.idx);
const SORTED_BOUNDARIES_V = SECTION_BOUNDARIES_V
  .map(([anchor, title]) => ({ idx: orderOf(anchor, true), title }))
  .sort((a, b) => a.idx - b.idx);

/** フォームキーが属するセクション名を返す（申請書作成画面のカード相当）。useV=特定技能順。 */
function sectionForKey(key: string | undefined, useV = false): string {
  if (key && key.startsWith("__agent")) return "取次者情報（固定）";
  const idx = orderOf(key, useV);
  if (idx >= UNKNOWN_ORDER) return "その他の申請書記載項目";
  const boundaries = useV ? SORTED_BOUNDARIES_V : SORTED_BOUNDARIES;
  let title = boundaries[0].title;
  for (const b of boundaries) {
    if (b.idx <= idx) title = b.title;
    else break;
  }
  return title;
}

// ── オンライン申請書（在留申請オンラインシステム）の項目番号 ─────────────────
// 転記シートの各ラベル先頭に、オンライン申請書と同じ項目番号を付す。
// 身分事項（1〜16）・連絡先（9.x）・旅券（10.x）・在留状況（11.x〜16.x）は
// 申請様式共通。区分V（特定技能）申請人情報（18〜29）も申請書と共通番号。
const FORM_NO: Record<string, string> = {
  // 身分事項
  nationality: "1", dateOfBirth: "2", familyNameEn: "3", familyNameJa: "3",
  sex: "4", placeOfBirth: "5", maritalStatus: "6", occupation: "7", homeTownCity: "8",
  // 日本における連絡先
  postalCodeInJapan: "9.1", prefectureInJapan: "9.2", cityInJapan: "9.2",
  addressLineInJapan: "9.2", addressInJapan: "9.2", telephoneNo: "9.3", cellularPhoneNo: "9.4",
  // 旅券・在留状況
  passportNumber: "10.1", passportExpiry: "10.2",
  currentStatusOfResidence: "11.1", currentPeriodOfStay: "11.2", currentPeriodExpiry: "11.3",
  residenceCardNumber: "12",
  desiredStatusOfResidence: "13.1", desiredPeriodOfStay: "13.2", reasonForApplication: "14",
  criminalRecord: "15", criminalRecordDetail: "15", familyInJapanExists: "16.1",
  // 区分V 申請人に関する情報等
  skillLevelProofMethod: "18.1", skillLevelExamName1: "18.2",
  skillLevelExamCountry1: "18.3", skillLevelExamCountryName1: "18.3",
  skillLevelExamName2: "18.4", skillLevelExamCountry2: "18.4", skillLevelExamCountryName2: "18.4",
  japaneseAbilityProofMethod: "19.1",
  cumulativeStayYears: "21.1", cumulativeStayMonths: "21.2",
  depositContractExists: "22.1",
  overseasExpensesExists: "23.1", overseasExpensesOrgName: "23.2", overseasExpensesAmount: "23.3",
  homeCountryProcedureComplied: "24", regularExpensesUnderstood: "25",
  technologyTransferEffortV: "26", ssfSpecificFieldCriteriaMet: "27",
  workHistory: "28",
  representativeName: "29.1", representativeRelationship: "29.2",
  representativeAddress: "29.4", representativePhone: "29.5", representativeCellular: "29.6",
};

// V型（特定技能）の「所属機関に関する情報等」の項目番号。
// 項目2＝特定技能雇用契約（2.1〜2.42）、項目3＝特定技能所属機関（3.1〜）。
// これらは特定技能の申請書に固有の番号のため、V型のときのみ適用する。
const FORM_NO_V_ORG: Record<string, string> = {
  // 2. 特定技能雇用契約
  orgContractStartDate: "2.1", orgContractEndDate: "2.2",
  orgSpecifiedIndustrialField: "2.3", orgWorkCategory: "2.4",
  orgOccupationNumber: "2.5", orgOccupationNumberAdditional: "2.6",
  orgWorkHoursWeekly: "2.7", orgWorkHoursMonthly: "2.8", orgWorkHoursEquivalent: "2.9",
  salary: "2.10", orgTimeConvertedBasicSalary: "2.11",
  orgJapaneseEquivalentSalary: "2.12", orgSalaryEqualToJapanese: "2.13",
  orgSalaryPaymentCash: "2.14", orgSalaryPaymentBank: "2.14",
  orgForeignTreatmentDifference: "2.15", orgForeignTreatmentDetail: "2.15",
  orgPaidHolidayForReturn: "2.16", orgFieldSpecificContractCriteria: "2.17",
  orgReturnTravelExpenses: "2.18",
  orgVDispatchName: "2.21", orgVDispatchCorporateNo: "2.22", orgVDispatchInsuranceNo: "2.23",
  orgVDispatchAddress: "2.25", orgVDispatchPhone: "2.26", orgVDispatchRepresentative: "2.27",
  orgVDispatchStartDate: "2.28", orgVDispatchEndDate: "2.29",
  orgPlacementProviderName: "2.30", orgPlacementProviderCorporateNo: "2.31",
  orgPlacementProviderInsuranceNo: "2.32", orgPlacementProviderAddress: "2.34",
  orgPlacementProviderPhone: "2.35", orgPlacementProviderLicenseNo: "2.36", orgPlacementProviderLicenseDate: "2.37",
  orgIntermediaryName: "2.38", orgIntermediaryAddress: "2.40", orgIntermediaryPhone: "2.42",
  // 3. 特定技能所属機関
  orgName: "3.1", orgCorporateNumber: "3.2", orgEmploymentInsuranceNo: "3.3",
  orgBusinessTypeCode: "3.4", orgBusinessTypeOtherCode: "3.6",
  orgAddress: "3.9", orgPhone: "3.10", orgCapital: "3.11", orgAnnualSales: "3.12", orgEmployeeCount: "3.13",
  orgVWorkplaceName: "3.15", orgVWorkplaceAddress: "3.17",
  orgHealthInsuranceMet: "3.18", orgLaborInsuranceMet: "3.19", orgLaborInsuranceNo: "3.20",
  orgLaborLawViolation: "3.21", orgInvoluntaryDismissal: "3.22",
  orgMissingPerson: "3.23", orgCriminalPunishment: "3.24",
};

/** キーに対応するオンライン申請書の項目番号を返す（V型は所属機関番号も適用）。 */
function formNoFor(key: string | undefined, useV: boolean): string | undefined {
  if (!key) return undefined;
  return FORM_NO[key] ?? (useV ? FORM_NO_V_ORG[key] : undefined);
}

/** JLSフォームデータからRASENSフィールド一覧を生成 */
export function buildRasensFields(
  form: Partial<ApplicationFormData>,
  applicant?: {
    familyNameEn?: string;
    givenNameEn?: string;
    familyNameJa?: string | null;
    givenNameJa?: string | null;
    nationality?: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    passportNumber?: string | null;
    residenceCardNumber?: string | null;
    phone?: string | null;
    email?: string | null;
  }
): RasensField[] {
  const f = form;

  const nationality   = f.nationality   || applicant?.nationality   || "";
  const familyNameEn  = normalizeRomajiName(f.familyNameEn  || applicant?.familyNameEn  || "");
  const givenNameEn   = normalizeRomajiName(f.givenNameEn   || applicant?.givenNameEn   || "");
  const familyNameJa  = f.familyNameJa  || applicant?.familyNameJa  || "";
  const givenNameJa   = f.givenNameJa   || applicant?.givenNameJa   || "";
  const dob           = f.dateOfBirth   || applicant?.dateOfBirth   || "";
  // 性別: 申請書と同じ「男/女」表記に統一（マスターのM/Fフォールバック時も変換する）
  const sex           = f.sex
    || (applicant?.gender === "M" ? "男" : applicant?.gender === "F" ? "女" : applicant?.gender ?? "")
    || "";
  const passportNum   = f.passportNumber || applicant?.passportNumber || "";
  const residenceCard = f.residenceCardNumber || applicant?.residenceCardNumber || "";
  const phone         = f.telephoneNo   || applicant?.phone         || "";
  const cellPhone     = f.cellularPhoneNo || "";
  const occupation    = f.occupation    || "";
  const placeOfBirth  = f.placeOfBirth  || "";
  const homeTownCity  = f.homeTownCity  || "";
  const email         = applicant?.email || "";

  // ── 住所の処理 ──
  // 郵便番号（ハイフンなし）
  const postalCode = formatPostalCode(f.postalCodeInJapan || "");

  // 都道府県＋市区町村（全角）
  const prefCity = toFullWidthAddress(
    `${f.prefectureInJapan ?? ""}${f.cityInJapan ?? ""}`
  );

  // 番地以降（全角）
  const addressLine = toFullWidthAddress(f.addressLineInJapan ?? "");

  const fields: RasensField[] = [
    // ── 申請人 基本情報 ──────────────────────────────────────────────
    { key: "nationality",  label: "国籍・地域",        value: nationality },
    { key: "dateOfBirth",  label: "生年月日",          value: formatDate(dob),    note: "YYYYMMDD" },
    { key: "familyNameEn", label: "氏名（ローマ字）",  value: `${familyNameEn} ${givenNameEn}`.trim(), note: "姓 名" },
    ...((familyNameJa || givenNameJa)
      ? [{ key: "familyNameJa", label: "氏名（漢字）", value: `${familyNameJa} ${givenNameJa}`.trim(), note: "姓 名" }]
      : []),
    { key: "sex",          label: "性別",              value: sex },
    { key: "placeOfBirth", label: "出生地",            value: placeOfBirth },
    { key: "maritalStatus", label: "配偶者の有無",     value: f.maritalStatus || "" },
    { key: "occupation",   label: "職業",              value: occupation },
    { key: "homeTownCity", label: "本国における居住地", value: homeTownCity },

    // ── 住所（郵便番号と分離、都道府県市区町村/番地以降で分割、全角）──
    ...(postalCode ? [{ key: "postalCodeInJapan", label: "郵便番号", value: postalCode, note: "ハイフンなし" }] : []),
    ...(prefCity   ? [{ key: "prefectureInJapan", label: "住居地（都道府県・市区町村）", value: prefCity }] : []),
    ...(addressLine ? [{ key: "addressLineInJapan", label: "住居地（番地以降）", value: addressLine }] : []),
    // フォールバック: 分割入力がない場合
    ...(!prefCity && !addressLine && f.addressInJapan
      ? [{ key: "addressInJapan", label: "住居地", value: toFullWidthAddress(f.addressInJapan) }]
      : []),

    // ── 電話番号（ハイフンなし）・メールアドレス ──
    { key: "telephoneNo",  label: "電話番号",          value: formatPhone(phone),     note: "ハイフンなし" },
    ...(cellPhone ? [{ key: "cellularPhoneNo", label: "携帯電話番号", value: formatPhone(cellPhone), note: "ハイフンなし" }] : []),
    { key: "emailAddress", label: "メールアドレス",    value: email },

    // ── 旅券・在留情報 ───────────────────────────────────────────────
    { key: "passportNumber",           label: "旅券番号",          value: passportNum },
    { key: "passportExpiry",           label: "旅券有効期限",      value: formatDate(f.passportExpiry || ""), note: "YYYYMMDD" },
    { key: "currentStatusOfResidence", label: "現在の在留資格",    value: f.currentStatusOfResidence || "" },
    { key: "currentPeriodOfStay",      label: "在留期間",          value: f.currentPeriodOfStay || "" },
    { key: "currentPeriodExpiry",      label: "在留期間の満了日",  value: formatDate(f.currentPeriodExpiry || ""), note: "YYYYMMDD" },
    { key: "residenceCardNumber",      label: "在留カード番号",    value: residenceCard },

    // ── 申請内容 ─────────────────────────────────────────────────────
    { key: "desiredStatusOfResidence", label: "希望する在留資格",  value: f.desiredStatusOfResidence || "" },
    { key: "desiredPeriodOfStay",      label: "希望する在留期間",  value: f.desiredPeriodOfStay || "" },
    ...(f.reasonForApplication
      ? [{
          key: "reasonForApplication",
          label: f.applicationFormType === "change" ? "変更の理由"
            : f.applicationFormType === "permanent" ? "永住許可を必要とする理由"
            : "更新の理由",
          value: f.reasonForApplication,
        }]
      : []),
    { key: "criminalRecord",     label: "犯罪記録の有無",    value: f.criminalRecord || "無" },
    { key: "deportationHistory", label: "退去強制歴の有無",  value: f.deportationHistory || "無" },

    // ── 在日親族及び同居者 ────────────────────────────────────────────
    ...buildFamilyInJapanFields(f),

    // ── 届出情報（配偶者: 婚姻届出、子: 出生届出/縁組届出）────────────
    ...buildNotificationFields(f),

    // ── 扶養者情報（家族滞在の様式にのみ存在する項目のため、R型以外では出さない）──
    ...((isKeyOnForm("supporterNameEn", f) && (f.supporterNameEn || f.supporterFamilyNameEn)) ? [
      { key: "supporterNameEn", label: "扶養者　氏名（ローマ字）",
        value: normalizeRomajiName(f.supporterNameEn || `${f.supporterFamilyNameEn ?? ""} ${f.supporterGivenNameEn ?? ""}`.trim()) },
      { key: "supporterDob",              label: "扶養者　生年月日",        value: formatDate(f.supporterDob || ""),  note: "YYYYMMDD" },
      { key: "supporterNationality",      label: "扶養者　国籍・地域",      value: f.supporterNationality || "" },
      { key: "supporterStatusOfResidence", label: "扶養者　在留資格",       value: f.supporterStatusOfResidence || "" },
      { key: "supporterPeriodOfStay",     label: "扶養者　在留期間",        value: f.supporterPeriodOfStay || "" },
      { key: "supporterPeriodExpiry",     label: "扶養者　在留期間満了日",  value: formatDate(f.supporterPeriodExpiry || ""), note: "YYYYMMDD" },
      { key: "supporterResidenceCard",    label: "扶養者　在留カード番号",  value: f.supporterResidenceCard || "" },
      { key: "supporterRelationship",     label: "申請人との関係",          value: f.supporterRelationship || "" },
      { key: "supporterEmployer",         label: "扶養者　勤務先名称",      value: f.supporterEmployer || "" },
      ...(f.supporterCorporateNumber
        ? [{ key: "supporterCorporateNumber", label: "扶養者　法人番号", value: f.supporterCorporateNumber }]
        : []),
      ...(f.supporterBranchName
        ? [{ key: "supporterBranchName", label: "扶養者　支店・事業所名", value: f.supporterBranchName }]
        : []),
      ...(f.supporterEmployerAddress || f.supporterAddress
        ? [{ key: "supporterEmployerAddress", label: "扶養者　勤務先所在地", value: formatStandardAddress(f.supporterEmployerAddress || f.supporterAddress || "") }]
        : []),
      ...(f.supporterEmployerPhone
        ? [{ key: "supporterEmployerPhone", label: "扶養者　勤務先電話番号", value: f.supporterEmployerPhone }]
        : []),
      ...(f.supporterAnnualIncome
        ? [{ key: "supporterAnnualIncome", label: "扶養者　年収", value: `${Number(f.supporterAnnualIncome).toLocaleString()} 円` }]
        : []),
    ] : []),

    // ── 資格外活動許可申請書 ──────────────────────────────────────────
    ...buildGaikatsuFields(f),

    // ── 職歴 ─────────────────────────────────────────────────────────
    ...buildWorkHistoryFields(f),

    // ── 上記以外の申請書記載項目（全項目網羅） ─────────────────────────
    ...buildRemainingFormFields(f),

    // ── 取次者情報（固定） ────────────────────────────────────────────
    { key: "__agent1", label: "取次者　氏名",      value: "山口忠士" },
    { key: "__agent2", label: "取次者　電話番号",  value: "09025960128", note: "ハイフンなし" },
    { key: "__agent3", label: "取次者　所属機関等", value: "兵庫県行政書士会" },
    { key: "__agent4", label: "取次者　郵便番号",  value: "6650864", note: "ハイフンなし" },
    { key: "__agent5", label: "取次者　住所（都道府県・市区町村）",
      value: "兵庫県宝塚市" },
    { key: "__agent6", label: "取次者　住所（番地以降）",
      value: "泉町２２ー２５　島上マンション南棟１ーＢ" },
  ];

  // 空値を除き、申請種別・在留資格カテゴリの様式に存在する項目のみに絞り込む。
  // （固定出力の取次者 __agent* と、キー未設定のフィールドはそのまま通す）
  // その後、申請書作成画面と同じ並び順にソートする（正準順序 → 未登録キー → 取次者）。
  // JSのsortは安定ソートのため、同一orderのフィールドは元の出現順を保つ。
  // 特定技能（V型）は所属機関領域の並び順が申請書と異なる（雇用契約→機関基本情報）ため専用順を使う
  const useV = formPart2Of(f) === "V";
  return fields
    .filter((x) => x.value.trim() !== "")
    .filter((x) => !x.key || x.key.startsWith("__agent") || isKeyOnForm(x.key, f))
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (orderOf(a.x.key, useV) - orderOf(b.x.key, useV)) || (a.i - b.i))
    .map(({ x }) => {
      // ラベル先頭にオンライン申請書の項目番号を付す（既に番号がある場合は付けない）
      const no = formNoFor(x.key, useV);
      return no && !/^\d/.test(x.label) ? { ...x, label: `${no}　${x.label}` } : x;
    });
}

// ─── 申請書全項目の網羅出力 ──────────────────────────────────────────────────

/** buildRasensFields本体（専用フォーマット部分）で既に出力済みのフォームキー。重複出力防止用 */
const CURATED_KEYS = new Set<string>([
  // 基本情報
  "nationality", "dateOfBirth", "familyNameEn", "givenNameEn", "familyNameJa", "givenNameJa",
  "sex", "placeOfBirth", "maritalStatus", "occupation", "homeTownCity",
  // 住所・連絡先
  "postalCodeInJapan", "prefectureInJapan", "cityInJapan", "addressLineInJapan", "addressInJapan",
  "telephoneNo", "cellularPhoneNo",
  // 旅券・在留情報
  "passportNumber", "passportExpiry", "currentStatusOfResidence", "currentPeriodOfStay",
  "currentPeriodExpiry", "residenceCardNumber",
  // 申請内容
  "desiredStatusOfResidence", "desiredPeriodOfStay", "reasonForApplication", "criminalRecord", "deportationHistory",
  // 在日親族
  "familyInJapanExists",
  // 届出情報
  "marriageNotificationPlaceJapan", "marriageNotificationDateJapan",
  "marriageNotificationPlaceForeign", "marriageNotificationDateForeign",
  "marriageRegistrationPlace", "marriageRegistrationDate", "marriageDate",
  // 扶養者情報
  "supporterNameEn", "supporterFamilyNameEn", "supporterGivenNameEn", "supporterDob",
  "supporterNationality", "supporterStatusOfResidence", "supporterPeriodOfStay",
  "supporterPeriodExpiry", "supporterResidenceCard", "supporterRelationship",
  "supporterEmployer", "supporterCorporateNumber", "supporterBranchName",
  "supporterEmployerAddress", "supporterAddress", "supporterEmployerPhone", "supporterAnnualIncome",
  // 資格外活動（値の出力に使用済みのもの）
  "gaikatsuCurrentActivity", "gaikatsuActivityType", "gaikatsuActivityTypeOther",
  "gaikatsuContractPeriod", "gaikatsuWeeklyHours", "gaikatsuSalary", "gaikatsuSalaryType",
  "gaikatsuEmployerName", "gaikatsuEmployerAddress", "gaikatsuEmployerPhone",
  "gaikatsuEmployerBusinessType",
  "partTimeWorkOrgNameR", "partTimeWorkBranchNameR", "partTimeWorkPhoneR", "partTimeWorkTypeR",
  "partTimeWorkHoursR", "partTimeWorkSalaryR", "partTimeWorkSalaryTypeR",
]);

/** 転記対象外のフォームキー（メタ情報・固定出力済みの取次者・理由書・別途展開する配列） */
const EXCLUDED_KEYS = new Set<string>([
  "applicationFormType", "visaFormCategory", "lastUpdated",
  "agentName", "agentOrganization", "agentAddress", "agentPhone",
  "riyushoBody", "riyushoSubmissionBureau",
  "familyInJapan", "workHistory",
]);

/**
 * 質問書定義・AIスキーマのどちらにも存在しないフォームキーの日本語ラベル。
 * （特定技能の支援体制・支援計画・雇用条件書由来の項目など）
 * ここに無いキーが増えた場合、転記シートには英字キー名のまま表示されるため、
 * form-types.ts にフィールドを追加した際はこの表にも追加すること。
 */
const EXTRA_KEY_LABELS: Record<string, string> = {
  gaikatsuNeeded:                 "資格外活動許可申請の希望の有無",
  freeformPart2Notes:             "補足・自由記載（申請人等作成用）",
  freeformOrgNotes:               "補足・自由記載（所属機関等作成用）",
  // 雇用契約・雇用条件書由来（V型）
  orgContractRenewal:             "雇用契約期間 更新の有無・内容",
  orgOccupationNumberAdditional:  "追加職種番号",
  orgVWorkplaceName:              "就業の場所（名称）",
  orgVWorkplaceAddress:           "就業の場所（所在地）",
  orgWorkDaysWeekly:              "所定労働日数（週）",
  orgAllowancesDetail:            "諸手当の名称・金額の内訳",
  orgMonthlyTotalEstimate:        "1か月当たりの支払概算額合計",
  orgSalaryEqualityExplanation:   "報酬が日本人と同等以上であることの説明",
  orgOvertimeRate:                "時間外労働の割増賃金率（％）",
  orgHolidayRate:                 "休日労働の割増賃金率（％）",
  orgNightShiftRate:              "深夜労働の割増賃金率（％）",
  orgSalaryClosingDate:           "賃金締切日",
  orgSalaryPaymentDate:           "賃金支払日",
  orgDeductionItems:              "賃金支払時の控除項目の内訳",
  orgReturnTravelExpenseDetail:   "帰国旅費負担の規定内容・負担者",
  orgHealthCheckCostBurden:       "健康診断の受診費用負担",
  // 支援体制 (34)〜(42)（V型）
  supportManagerAppointed:            "(34) 支援責任者の選任の有無",
  supportStaffAppointed:              "(35) 支援担当者の選任の有無",
  supportExperienceCriteria:          "(36) 支援実施体制の基準適合の有無",
  supportExperienceCriteriaItem1:     "(36)① 中長期在留者の受入れ・管理実績",
  supportExperienceCriteriaItem2:     "(36)② 支援責任者・担当者の生活相談等従事経験",
  supportExperienceCriteriaItem3:     "(36)③ その他支援業務を適正に実施できる事情",
  supportExperienceCriteriaItem3Detail: "(36)③ の詳細",
  supportLanguageCapability:          "(37) 外国人が理解できる言語による支援体制の有無",
  supportDocumentKept:                "(38) 支援状況文書の作成・保管の有無",
  supportNeutralPosition:             "(39) 支援責任者・担当者の中立性の有無",
  supportFailureHistory:              "(40) 過去の支援懈怠の有無",
  supportFailureHistoryDetail:        "(40) 支援懈怠の詳細",
  supportPeriodicInterviewCapability: "(41) 定期面談実施体制の有無",
  supportImplementationFieldCriteria: "(42) 支援計画実施の分野別基準適合の有無",
  // 支援計画 (1)〜(16)（V型）
  supportPlanInfoProvision:        "支援計画(1) 在留に関する留意事項等の情報提供",
  supportPlanInfoProvisionMethod:  "支援計画(2) 対面・テレビ電話等による実施",
  supportPlanAirportTransfer:      "支援計画(3) 出入国時の送迎",
  supportPlanHousingSupport:       "支援計画(4) 住居確保に係る支援",
  supportPlanLifeContractSupport:  "支援計画(5) 預金口座開設・携帯電話契約等の支援",
  supportPlanLivingInfoProvision:  "支援計画(6) 生活一般に関する情報提供",
  supportPlanProcedureAccompany:   "支援計画(7) 行政手続への同行等",
  supportPlanJapaneseLearning:     "支援計画(8) 日本語学習機会の提供",
  supportPlanConsultationResponse: "支援計画(9) 相談・苦情対応",
  supportPlanExchangePromotion:    "支援計画(10) 日本人との交流促進支援",
  supportPlanJobChangeSupport:     "支援計画(11) 非自発的離職時の転職支援",
  supportPlanPeriodicInterview:    "支援計画(12) 定期面談・行政機関への通報",
  supportPlanCopyProvided:         "支援計画(13) 支援計画の作成・写しの交付",
  supportPlanFieldSpecificMatters: "支援計画(14) 分野別告示事項の記載",
  supportPlanContentAppropriate:   "支援計画(15) 支援内容の適正性",
  supportPlanFieldSpecificCriteria: "支援計画(16) 分野別告示基準への適合",
  // 定住者COE（T型）— 身分地位・勤務先・滞在費支弁・経費支弁者・身元保証人
  statusOrPosition:          "身分又は地位",
  applicantAnnualIncome:     "申請人の勤務先　年収",
  fundingMonthlyAmount:      "滞在費支弁方法　月平均支弁額",
  fundingRemittanceType:     "滞在費支弁方法　送金・携行等の別",
  fundingRemittanceAmount:   "滞在費支弁方法　送金・携行等の別　金額",
  expensePayerName:          "経費支弁者　氏名",
  expensePayerNationality:   "経費支弁者　住所（国・地域）",
  expensePayerAddress:       "経費支弁者　住所",
  expensePayerPhone:         "経費支弁者　電話番号",
  expensePayerOccupation:    "経費支弁者　職業（勤務先の名称）",
  expensePayerWorkPhone:     "経費支弁者　電話番号（勤務場所）",
  expensePayerAnnualIncome:  "経費支弁者　年収",
  guarantorName:             "在日身元保証人又は連絡先　氏名",
  guarantorOccupation:       "在日身元保証人又は連絡先　職業",
  guarantorAddress:          "在日身元保証人又は連絡先　住所",
  guarantorPhone:            "在日身元保証人又は連絡先　電話番号",
  guarantorCellular:         "在日身元保証人又は連絡先　携帯電話番号",
  coeReceiptMethod:          "在留資格認定証明書の受領方法",
  notificationEmail:         "通知送信用メールアドレス",
  notificationEmailConfirm:  "通知送信用メールアドレス再入力",
  portalPhotoFileName:       "顔写真（添付ファイル名）",
  portalAttachmentFileName:  "資料添付（添付ファイル名）",
};

/** AIスキーマのdescriptionからラベルに不要なフォーマット指示を除去 */
function cleanupSchemaLabel(desc: string): string {
  return desc
    .replace(/\s*YYYY-MM-DD/g, "")
    .replace(/（YYYY-MM-DD）/g, "")
    .replace(/（数値のみ[^）]*）/g, "")
    .replace(/（有 または 無）/g, "")
    .trim();
}

/** 値をRASENSフォーマット規則（日付YYYYMMDD・電話/郵便番号ハイフンなし）で整形 */
function formatGenericValue(key: string, raw: unknown): { value: string; note?: string } {
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return { value: formatDate(str), note: "YYYYMMDD" };
  if (/^〒\d{7}\|/.test(str))          return { value: formatStandardAddress(str) };
  if (/phone/i.test(key))              return { value: formatPhone(str), note: "ハイフンなし" };
  if (/postalcode/i.test(key))         return { value: formatPostalCode(str), note: "ハイフンなし" };
  return { value: str };
}

/** 職歴フィールドを生成 */
function buildWorkHistoryFields(f: Partial<ApplicationFormData>): RasensField[] {
  const list = (f.workHistory ?? []) as WorkHistoryEntry[];
  return list.flatMap((w, idx) => {
    const prefix = `職歴${idx + 1}`;
    const fields: RasensField[] = [];
    if (w.joinDate)  fields.push({ key: "workHistory", label: `${prefix}　入社年月`,   value: formatDate(w.joinDate),  note: "YYYYMMDD" });
    if (w.leaveDate) fields.push({ key: "workHistory", label: `${prefix}　退社年月`,   value: formatDate(w.leaveDate), note: "YYYYMMDD" });
    if (w.employer)  fields.push({ key: "workHistory", label: `${prefix}　勤務先名称`, value: w.employer });
    return fields;
  });
}

/**
 * 専用フォーマット部分でカバーしていない申請書の全記載項目を出力する。
 * 1) 質問書定義（ALL_QUESTIONS）: 様式・在留資格カテゴリの条件に合う項目をセクション名付きで
 * 2) AI抽出スキーマ（STAGE1）: 残りの全フィールド（所属機関・特定技能・支援計画等を含む）
 * いずれも値が入力されている項目のみ出力する。
 */
function buildRemainingFormFields(f: Partial<ApplicationFormData>): RasensField[] {
  const handled = new Set<string>([...CURATED_KEYS, ...EXCLUDED_KEYS]);
  const out: RasensField[] = [];

  // 1) 質問書定義から（申請書と同じ項目ラベル・セクションで出力）
  for (const q of ALL_QUESTIONS) {
    const key = q.key as string;
    if (handled.has(key)) continue;
    if (!isKeyOnForm(key, f)) continue;
    if (q.formTypes && f.applicationFormType && !q.formTypes.includes(f.applicationFormType)) continue;
    if (q.categories && f.visaFormCategory && !q.categories.includes(f.visaFormCategory)) continue;
    if (q.condition && !q.condition(f)) continue;
    const raw = (f as Record<string, unknown>)[key];
    if (isEmpty(raw) || typeof raw === "object") continue;
    const { value, note } = formatGenericValue(key, raw);
    if (value.trim()) out.push({ key, label: q.label, value, note });
    handled.add(key);
  }

  // 2) AI抽出スキーマの説明文をラベルとして残り全フィールドを出力
  const stage1Props = (STAGE1_RESPONSE_SCHEMA as { properties?: Record<string, { description?: string }> }).properties ?? {};
  for (const [key, schema] of Object.entries(stage1Props)) {
    if (handled.has(key) || key === "docType" || key === "docSubject") continue;
    if (!isKeyOnForm(key, f)) continue;
    const raw = (f as Record<string, unknown>)[key];
    if (isEmpty(raw) || typeof raw === "object") continue;
    const label = EXTRA_KEY_LABELS[key] ?? cleanupSchemaLabel(schema?.description || key);
    const { value, note } = formatGenericValue(key, raw);
    if (value.trim()) out.push({ key, label, value, note });
    handled.add(key);
  }

  // 3) スキーマ未定義の残りキー（支援体制・支援計画・雇用条件書由来の項目等）
  for (const [key, raw] of Object.entries(f)) {
    if (handled.has(key)) continue;
    if (!isKeyOnForm(key, f)) continue;
    // 値の型ごとに表示用文字列へ変換（チェック項目は有/無、文字列配列は読点区切り）
    let rendered: string;
    if (typeof raw === "boolean") {
      rendered = raw ? "有" : "無";
    } else if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
      rendered = (raw as string[]).filter(Boolean).join("、");
    } else if (isEmpty(raw) || typeof raw === "object") {
      continue;
    } else {
      rendered = String(raw);
    }
    if (!rendered.trim()) continue;
    const label = EXTRA_KEY_LABELS[key] ?? key;
    const { value, note } = formatGenericValue(key, rendered);
    if (value.trim()) out.push({ key, label, value, note });
  }

  return out;
}

/** 在日親族及び同居者フィールドを生成 */
function buildFamilyInJapanFields(f: Partial<ApplicationFormData>): RasensField[] {
  const fields: RasensField[] = [];

  // 在日親族の有無
  fields.push({
    key: "familyInJapanExists",
    label: "在日親族及び同居者の有無",
    value: f.familyInJapanExists || "無",
  });

  // 親族情報を展開（申請書PDFと同じく「無」の場合は残存データがあっても出さない）
  const family = f.familyInJapanExists === "無" ? [] : (f.familyInJapan || []);
  if (family.length === 0) return fields;

  family.forEach((member: FamilyMember, idx: number) => {
    const num = idx + 1;
    const prefix = `親族${num}`;

    if (member.relationship) {
      fields.push({ key: "familyInJapanExists", label: `${prefix}　続柄`, value: member.relationship });
    }
    if (member.name) {
      fields.push({ key: "familyInJapanExists", label: `${prefix}　氏名`, value: member.name });
    }
    if (member.dateOfBirth) {
      fields.push({ key: "familyInJapanExists", label: `${prefix}　生年月日`, value: formatDate(member.dateOfBirth), note: "YYYYMMDD" });
    }
    if (member.nationality) {
      fields.push({ key: "familyInJapanExists", label: `${prefix}　国籍・地域`, value: member.nationality });
    }
    if (member.placeOfEmployment) {
      fields.push({ key: "familyInJapanExists", label: `${prefix}　勤務先・通学先`, value: member.placeOfEmployment });
    }
    fields.push({
      key: "familyInJapanExists",
      label: `${prefix}　同居の有無`,
      value: member.residingTogether ? "有" : "無",
    });
    if (member.residenceCardNumber) {
      fields.push({ key: "familyInJapanExists", label: `${prefix}　在留カード番号`, value: member.residenceCardNumber });
    }
  });

  return fields;
}

/** 届出情報フィールドを生成（配偶者: 婚姻届出、子: 出生届出/縁組届出）*/
function buildNotificationFields(f: Partial<ApplicationFormData>): RasensField[] {
  const fields: RasensField[] = [];

  // R型（家族滞在）の婚姻・出生届出情報（R型の様式にのみ存在）
  if (isKeyOnForm("marriageNotificationPlaceJapan", f)
      && (f.marriageNotificationPlaceJapan || f.marriageNotificationDateJapan)) {
    fields.push({
      key: "marriageNotificationPlaceJapan",
      label: "届出先（日本）",
      value: f.marriageNotificationPlaceJapan || "",
      note: "婚姻/出生/縁組",
    });
    if (f.marriageNotificationDateJapan) {
      fields.push({
        key: "marriageNotificationDateJapan",
        label: "届出年月日（日本）",
        value: formatDate(f.marriageNotificationDateJapan),
        note: "YYYYMMDD",
      });
    }
  }

  if (isKeyOnForm("marriageNotificationPlaceForeign", f)
      && (f.marriageNotificationPlaceForeign || f.marriageNotificationDateForeign)) {
    fields.push({
      key: "marriageNotificationPlaceForeign",
      label: "届出先（本国等）",
      value: f.marriageNotificationPlaceForeign || "",
      note: "婚姻/出生/縁組",
    });
    if (f.marriageNotificationDateForeign) {
      fields.push({
        key: "marriageNotificationDateForeign",
        label: "届出年月日（本国等）",
        value: formatDate(f.marriageNotificationDateForeign),
        note: "YYYYMMDD",
      });
    }
  }

  // T型（日本人配偶者等）の婚姻届出情報（T型の様式にのみ存在）
  if (isKeyOnForm("marriageRegistrationPlace", f)
      && (f.marriageRegistrationPlace || f.marriageRegistrationDate)) {
    // 重複防止（R型と同時に入ることはないが念のため）
    if (!f.marriageNotificationPlaceJapan && !f.marriageNotificationDateJapan) {
      if (f.marriageRegistrationPlace) {
        fields.push({
          key: "marriageRegistrationPlace",
          label: "婚姻届出先",
          value: f.marriageRegistrationPlace,
        });
      }
      if (f.marriageRegistrationDate) {
        fields.push({
          key: "marriageRegistrationDate",
          label: "婚姻届出年月日",
          value: formatDate(f.marriageRegistrationDate),
          note: "YYYYMMDD",
        });
      }
    }
  }

  if (isKeyOnForm("marriageDate", f) && f.marriageDate) {
    fields.push({
      key: "marriageDate",
      label: "婚姻年月日",
      value: formatDate(f.marriageDate),
      note: "YYYYMMDD",
    });
  }

  return fields;
}

/** 資格外活動許可申請書フィールドを生成 */
function buildGaikatsuFields(f: Partial<ApplicationFormData>): RasensField[] {
  // この申請書の様式に資格外活動の項目が存在しない場合は出力しない
  if (!isKeyOnForm("gaikatsuCurrentActivity", f) && !isKeyOnForm("partTimeWorkExistsR", f)) return [];

  const needsGaikatsu =
    f.gaikatsuNeeded === "有" ||
    f.gaikatsuEmployerName ||
    f.gaikatsuCurrentActivity ||
    f.partTimeWorkExistsR === "有" ||
    f.partTimeWorkOrgNameR;

  if (!needsGaikatsu) return [];

  const employerName    = f.gaikatsuEmployerName    || f.partTimeWorkOrgNameR    || "";
  const employerBranch  = f.partTimeWorkBranchNameR || "";
  const employerAddress = f.gaikatsuEmployerAddress || "";
  const employerPhone   = f.gaikatsuEmployerPhone   || f.partTimeWorkPhoneR      || "";
  const bizType         = f.gaikatsuEmployerBusinessType || f.partTimeWorkTypeR  || "";
  const weeklyHours     = f.gaikatsuWeeklyHours     || f.partTimeWorkHoursR      || "";
  const salary          = f.gaikatsuSalary          || f.partTimeWorkSalaryR     || "";
  const salaryType      = f.gaikatsuSalaryType      || f.partTimeWorkSalaryTypeR || "";
  const activityType    = f.gaikatsuActivityType
    ? f.gaikatsuActivityType === "その他"
      ? `その他（${f.gaikatsuActivityTypeOther ?? ""}）`
      : f.gaikatsuActivityType
    : "";
  const salaryStr = salary
    ? `${Number(salary).toLocaleString()} 円（${salaryType}）`
    : "";

  return [
    { key: "gaikatsuCurrentActivity", label: "資格外　現在の在留活動の内容",      value: f.gaikatsuCurrentActivity || "" },
    ...(activityType
      ? [{ key: "gaikatsuActivityType", label: "資格外　他に従事する活動（職務の内容）", value: activityType }]
      : []),
    { key: "gaikatsuContractPeriod", label: "資格外　雇用契約期間",              value: f.gaikatsuContractPeriod || "" },
    ...(weeklyHours
      ? [{ key: "gaikatsuWeeklyHours", label: "資格外　週間稼働時間",          value: `${weeklyHours} 時間` }]
      : []),
    ...(salaryStr
      ? [{ key: "gaikatsuSalary", label: "資格外　報酬",                  value: salaryStr }]
      : []),
    { key: "gaikatsuEmployerName", label: "資格外　勤務先名称",                 value: employerName },
    ...(employerBranch
      ? [{ key: "gaikatsuEmployerName", label: "資格外　支店・事業所名",         value: employerBranch }]
      : []),
    { key: "gaikatsuEmployerAddress", label: "資格外　勤務先所在地",               value: toFullWidthAddress(employerAddress) },
    { key: "gaikatsuEmployerPhone", label: "資格外　勤務先電話番号",             value: formatPhone(employerPhone), note: "ハイフンなし" },
    ...(bizType
      ? [{ key: "gaikatsuEmployerBusinessType", label: "資格外　業種",                  value: bizType }]
      : []),
  ].filter((item) => item.value.trim() !== "");
}

/**
 * セクション別に分類する。
 * fields は buildRasensFields で既に申請書作成画面と同じ並び順にソート済みのため、
 * 各フィールドの由来キーからセクション名を判定し、出現順にセクションを組み立てる。
 * （セクションは正準順序の連続範囲なので、単純に出現順で並べれば申請書の並びと一致する）
 */
export function buildTransferSections(
  fields: RasensField[],
  form?: Partial<ApplicationFormData>,
) {
  const useV = form ? formPart2Of(form) === "V" : false;
  const ordered: { title: string; fields: RasensField[] }[] = [];
  const byTitle = new Map<string, RasensField[]>();

  for (const f of fields) {
    const title = f.section ?? sectionForKey(f.key, useV);
    let bucket = byTitle.get(title);
    if (!bucket) {
      bucket = [];
      byTitle.set(title, bucket);
      ordered.push({ title, fields: bucket });
    }
    bucket.push(f);
  }

  return ordered.filter((s) => s.fields.length > 0);
}
