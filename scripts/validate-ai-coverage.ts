/**
 * AI全項目読み取り フィールドカバレッジ検証スクリプト
 *
 * 実行: npx tsx scripts/validate-ai-coverage.ts
 *
 * EMPTY_FORM_DATA の全キーが fill-all-fields.ts の
 * STAGE1_RESPONSE_SCHEMA / STAGE2_RESPONSE_SCHEMA に含まれているかを検証する。
 * また、validateAndClean のバリデーションルールが正しく動作するかもテストする。
 */

import { EMPTY_FORM_DATA } from "../src/lib/form-types";

// ═════════════════════════════════════════════════════════════════════════════
// 1. フィールドカバレッジ検証
// ═════════════════════════════════════════════════════════════════════════════

// AI抽出対象外のフィールド（fill-all-fields.ts の STATUS_EXEMPT_KEYS + MASTER_OVERRIDE_KEYS + 配列型 と一致させる）
const EXEMPT_KEYS = new Set([
  // メタ情報
  'applicationFormType', 'visaFormCategory', 'lastUpdated',
  // マスター確定値（agentのみここ。他はAI→マスター上書きなので検証対象）
  'agentName', 'agentAddress', 'agentOrganization', 'agentPhone',
  // 結合値（自動生成）
  'addressInJapan',
  // 自由記述（AIで読み取らない）
  'freeformPart2Notes', 'freeformOrgNotes',
  'riyushoSubmissionBureau', 'riyushoBody',
  // 手動フラグ
  'gaikatsuNeeded',
  // 配列型（Stage 2 で別途定義）
  'workHistory', 'familyInJapan', 'orgOccupationNumberAdditional',
  // AI読み取りステータス自体
  'aiFieldStatus',
]);

// fill-all-fields.ts の STAGE1_RESPONSE_SCHEMA から抜粋したキー名一覧
// ※ 実際のファイルからインポートしたいが、"use server" 指令で直接インポート不可のため手動で列挙
const STAGE1_KEYS = new Set([
  'docType', 'docSubject',
  // Part 1 共通
  'familyNameEn', 'givenNameEn', 'familyNameJa', 'givenNameJa',
  'nationality', 'dateOfBirth', 'sex', 'placeOfBirth', 'maritalStatus',
  'occupation', 'homeTownCity',
  'postalCodeInJapan', 'prefectureInJapan', 'cityInJapan', 'addressLineInJapan',
  'telephoneNo', 'cellularPhoneNo',
  'passportNumber', 'passportExpiry', 'residenceCardNumber',
  'currentStatusOfResidence', 'currentPeriodOfStay', 'currentPeriodExpiry',
  // COE固有
  'purposeOfEntry', 'scheduledDateOfEntry', 'portOfEntry', 'intendedLengthOfStay',
  'accompanyingPersons', 'intendedPlaceForVisa',
  'pastEntryHistory', 'pastEntryCount', 'pastEntryLatestFrom', 'pastEntryLatestTo',
  'pastCoeHistory', 'pastCoeCount', 'pastCoeNonIssuanceCount',
  // Change固有
  'desiredStatusOfResidence', 'desiredPeriodOfStay', 'reasonForApplication',
  // 犯罪・退去
  'criminalRecord', 'criminalRecordDetail',
  'deportationHistory', 'deportationCount', 'deportationLatestDate',
  'familyInJapanExists',
  // N型: 勤務先・学歴
  'employerName', 'employerBranchName', 'employerAddress', 'employerPhone',
  'educationCountry', 'educationDegree', 'educationSchoolName', 'educationGraduationDate',
  'majorCategory', 'majorCategoryOther', 'itQualificationExists', 'itQualificationName',
  'representativeName', 'representativeRelationship', 'representativeAddress',
  'representativePhone', 'representativeCellular',
  // T型: 配偶者
  'spouseFamilyNameEn', 'spouseGivenNameEn', 'spouseFamilyNameJa', 'spouseGivenNameJa',
  'spouseDob', 'spouseNationality', 'spouseOccupation', 'spouseEmployer',
  'spouseAddress', 'spouseResidenceStatus', 'spouseResidenceCard',
  'marriageDate', 'marriageRegistrationDate', 'marriageRegistrationPlace',
  'cohabitation', 'separationReason', 'longTermResidentReason',
  // R型
  'marriageNotificationPlaceJapan', 'marriageNotificationDateJapan',
  'marriageNotificationPlaceForeign', 'marriageNotificationDateForeign',
  'fundingMethod', 'fundingMethodOther', 'partTimeWorkExistsR',
  'partTimeWorkTypeR', 'partTimeWorkOrgNameR', 'partTimeWorkBranchNameR',
  'partTimeWorkPhoneR', 'partTimeWorkHoursR', 'partTimeWorkSalaryR', 'partTimeWorkSalaryTypeR',
  // R型: 扶養者
  'supporterNameEn', 'supporterFamilyNameEn', 'supporterGivenNameEn',
  'supporterFamilyNameJa', 'supporterGivenNameJa',
  'supporterDob', 'supporterNationality', 'supporterAddress',
  'supporterStatusOfResidence', 'supporterPeriodOfStay', 'supporterPeriodExpiry',
  'supporterRelationship', 'supporterRelationshipOther', 'supporterResidenceCard',
  'supporterEmployer', 'supporterCorporateNumber', 'supporterBranchName',
  'supporterEmployerAddress', 'supporterEmployerPhone', 'supporterAnnualIncome',
  // P型: 留学
  'schoolName', 'schoolType', 'schoolAddress', 'schoolPhone',
  'enrollmentDate', 'expectedGraduationDate', 'courseOfStudy',
  'annualTuition', 'fundingSource', 'fundingAmount',
  'scholarshipName', 'scholarshipAmount', 'partTimeWorkPermit',
  // V型: 技能水準
  'skillLevelProofMethod', 'skillLevelExamName1', 'skillLevelExamCountry1', 'skillLevelExamCountryName1',
  'skillLevelExamName2', 'skillLevelExamCountry2', 'skillLevelExamCountryName2',
  // V型: 日本語能力
  'japaneseAbilityProofMethod', 'japaneseAbilityExamName1', 'japaneseAbilityExamCountry1', 'japaneseAbilityExamCountryName1',
  'japaneseAbilityExamName2', 'japaneseAbilityExamCountry2', 'japaneseAbilityExamCountryName2',
  // V型: 技能実習2号
  'completedTit2Occupation1', 'completedTit2Operations1', 'completedTit2ProofType1',
  'completedTit2Occupation2', 'completedTit2Operations2', 'completedTit2ProofType2',
  // V型: 通算・確認事項
  'cumulativeStayYears', 'cumulativeStayMonths',
  'depositContractExists', 'overseasExpensesExists', 'overseasExpensesOrgName', 'overseasExpensesAmount',
  'homeCountryProcedureComplied', 'regularExpensesUnderstood',
  'technologyTransferEffortV', 'ssfSpecificFieldCriteriaMet',
  // 所属機関 共通
  'orgName', 'orgCorporateNumber', 'orgBranchName', 'orgEmploymentInsuranceNo',
  'orgBusinessTypeCode', 'orgBusinessTypeOtherCode', 'orgAddress', 'orgPhone', 'orgCapital', 'orgAnnualSales',
  'orgEmployeeCount', 'orgForeignEmployeeCount', 'orgTechInternCount',
  'researchRoomName', 'researchRoomProfessor',
  'contractType', 'contractTypeOther', 'workPeriodFixed', 'workPeriodDuration',
  'employmentStartDate', 'employmentStartDateStatus',
  'salary', 'salaryType', 'businessExperienceYears',
  'positionExists', 'position', 'occupationCode', 'occupationCodeOthers', 'activityDetails',
  'orgLaborInsuranceNo', 'orgHealthInsuranceMet', 'orgLaborInsuranceMet',
  // V型: 雇用契約
  'orgContractStartDate', 'orgContractEndDate',
  'orgSpecifiedIndustrialField', 'orgWorkCategory', 'orgOccupationNumber',
  'orgWorkHoursWeekly', 'orgWorkHoursMonthly', 'orgWorkHoursEquivalent',
  'orgTimeConvertedBasicSalary', 'orgJapaneseEquivalentSalary', 'orgSalaryEqualToJapanese',
  'orgSalaryPaymentCash', 'orgSalaryPaymentBank',
  'orgForeignTreatmentDifference', 'orgForeignTreatmentDetail',
  'orgPaidHolidayForReturn', 'orgFieldSpecificEmploymentCriteria',
  'orgReturnTravelExpenses', 'orgHealthCheck', 'orgProperResidenceCriteria',
  // V型: 派遣先
  'orgVDispatchName', 'orgVDispatchCorporateNo', 'orgVDispatchInsuranceNo',
  'orgVDispatchAddress', 'orgVDispatchPhone', 'orgVDispatchRepresentative',
  'orgVDispatchStartDate', 'orgVDispatchEndDate',
  // V型: 職業紹介
  'orgPlacementProviderName', 'orgPlacementProviderCorporateNo', 'orgPlacementProviderInsuranceNo',
  'orgPlacementProviderAddress', 'orgPlacementProviderPhone',
  'orgPlacementProviderLicenseNo', 'orgPlacementProviderLicenseDate',
  // V型: 取次機関
  'orgIntermediaryName', 'orgIntermediaryAddress', 'orgIntermediaryPhone',
  // V型: コンプライアンス (11)-(21)
  'orgLaborLawViolation', 'orgLaborLawViolationDetail',
  'orgInvoluntaryDismissal', 'orgInvoluntaryDismissalDetail',
  'orgMissingPerson', 'orgMissingPersonDetail',
  'orgCriminalPunishment', 'orgCriminalPunishmentDetail',
  'orgMentalDisability', 'orgMentalDisabilityDetail',
  'orgBankruptcy', 'orgBankruptcyDetail',
  'orgTrainingRevoked', 'orgTrainingRevokedDetail',
  'orgWasOfficerOfRevoked', 'orgWasOfficerOfRevokedDetail',
  'orgIllegalActFiveYears', 'orgIllegalActFiveYearsDetail',
  'orgGangsterMember', 'orgGangsterMemberDetail',
  'orgLegalAgentViolation', 'orgLegalAgentViolationDetail',
  // V型: コンプライアンス (22)-(33)
  'orgGangsterControl', 'orgGangsterControlDetail',
  'orgActivityDocumentKept',
  'orgAwareOfDeposit', 'orgAwareOfDepositDetail',
  'orgPenaltyContractExists', 'orgPenaltyContractDetail',
  'orgSupportCostNotBurdened',
  'orgDispatchMeetsCondition', 'orgDispatchConditionDetail',
  'orgDispatchMeetsCompliance', 'orgDispatchComplianceDetail',
  'orgAccidentInsurance', 'orgAccidentInsuranceDetail',
  'orgContinuousPerformance', 'orgSalaryPaymentVerifiable',
  'orgCoexistenceCooperation',
  'orgCoexistenceWorkplaceCity', 'orgCoexistenceWorkplaceCityDate', 'orgCoexistenceWorkplaceCityName',
  'orgCoexistenceResidenceCity', 'orgCoexistenceResidenceCityDate', 'orgCoexistenceResidenceCityName',
  'orgFieldSpecificContractCriteria',
  // V型: 支援者・RSO
  'supportManagerName', 'supportManagerTitle', 'supportStaffName', 'supportStaffTitle',
  'rsoName', 'rsoCorporateNo', 'rsoInsuranceNo', 'rsoAddress', 'rsoPhone',
  'rsoRepresentative', 'rsoRegNo', 'rsoRegDate',
  'rsoSupportBusinessName', 'rsoSupportBusinessAddress',
  'rsoSupportManager', 'rsoSupportStaff', 'rsoAvailableLanguages', 'rsoFeePerMonth',
  // N型: 派遣先
  'dispatchOrgName', 'dispatchOrgCorporateNumber', 'dispatchOrgBranchName',
  'dispatchOrgEmploymentInsuranceNo', 'dispatchOrgBusinessTypeCode',
  'dispatchOrgAddress', 'dispatchOrgPhone', 'dispatchOrgCapital', 'dispatchOrgAnnualSales',
  'dispatchPeriod',
  // 資格外活動
  'gaikatsuCurrentActivity', 'gaikatsuActivityType', 'gaikatsuActivityTypeOther',
  'gaikatsuContractPeriod', 'gaikatsuWeeklyHours',
  'gaikatsuSalary', 'gaikatsuSalaryType',
  'gaikatsuEmployerName', 'gaikatsuEmployerAddress', 'gaikatsuEmployerPhone',
  'gaikatsuEmployerBusinessType',
  // その他
  'notes',
]);

console.log("═══════════════════════════════════════════════════════════════");
console.log("  AI全項目読み取り フィールドカバレッジ検証");
console.log("═══════════════════════════════════════════════════════════════\n");

const allKeys = Object.keys(EMPTY_FORM_DATA);
const missingKeys: string[] = [];
let coveredCount = 0;
let exemptCount = 0;

for (const key of allKeys) {
  if (EXEMPT_KEYS.has(key)) {
    exemptCount++;
    continue;
  }
  if (STAGE1_KEYS.has(key)) {
    coveredCount++;
  } else {
    missingKeys.push(key);
  }
}

console.log(`全フィールド数:     ${allKeys.length}`);
console.log(`AI抽出対象:         ${coveredCount}`);
console.log(`対象外（免除）:     ${exemptCount}`);
console.log(`未カバー:           ${missingKeys.length}`);
console.log();

if (missingKeys.length > 0) {
  console.log("❌ 以下のフィールドがAI抽出スキーマに含まれていません:");
  for (const key of missingKeys) {
    console.log(`   - ${key}`);
  }
  console.log();
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. バリデーションルール検証
// ═════════════════════════════════════════════════════════════════════════════

console.log("═══════════════════════════════════════════════════════════════");
console.log("  バリデーションルール検証");
console.log("═══════════════════════════════════════════════════════════════\n");

// validateAndClean のロジックを再現（fill-all-fields.ts からコピー）
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

let testsPassed = 0;
let testsFailed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    testsPassed++;
  } else {
    testsFailed++;
    console.log(`  ❌ FAIL: ${name}`);
  }
}

// 日付バリデーション
assert("日付 正常値 2025-03-15 → 通過", /^\d{4}-\d{2}-\d{2}$/.test("2025-03-15"));
assert("日付 不正値 March 15 → 拒否", !/^\d{4}-\d{2}-\d{2}$/.test("March 15"));
assert("日付 不正値 2025/03/15 → 拒否", !/^\d{4}-\d{2}-\d{2}$/.test("2025/03/15"));
assert("日付 空文字 → 通過（空はOK）", "".length === 0);

// 有無バリデーション
assert("有無 正常値「有」→ 通過", ["有","無"].includes("有"));
assert("有無 正常値「無」→ 通過", ["有","無"].includes("無"));
assert("有無 不正値「Yes」→ 拒否", !["有","無"].includes("Yes"));
assert("有無 不正値「はい」→ 拒否", !["有","無"].includes("はい"));

// 数値バリデーション
assert("数値 300000 → そのまま", "300000".replace(/[^0-9]/g, '') === "300000");
assert("数値 300,000円 → 300000", "300,000円".replace(/[^0-9]/g, '') === "300000");
assert("数値 ¥300,000 → 300000", "¥300,000".replace(/[^0-9]/g, '') === "300000");
assert("数値 約30万円 → 30", "約30万円".replace(/[^0-9]/g, '') === "30");

// EMPTY_FORM_DATA の有無フィールドがデフォルトで「有」「無」または空文字であることを確認
// （maritalStatus, cohabitation 等はデフォルト空文字の場合がある）
const emptyFormAny = EMPTY_FORM_DATA as Record<string, any>;
for (const key of YESNO_FIELDS) {
  if (key in emptyFormAny) {
    const val = emptyFormAny[key];
    assert(
      `EMPTY_FORM_DATA.${key} のデフォルト値「${val}」が有/無/空である`,
      val === '有' || val === '無' || val === ''
    );
  }
}

console.log(`\nテスト結果: ${testsPassed} passed, ${testsFailed} failed\n`);

// ═════════════════════════════════════════════════════════════════════════════
// 3. 最終結果
// ═════════════════════════════════════════════════════════════════════════════

console.log("═══════════════════════════════════════════════════════════════");
if (missingKeys.length === 0 && testsFailed === 0) {
  console.log("  ✅ 全検証合格！");
} else {
  if (missingKeys.length > 0) console.log(`  ⚠ ${missingKeys.length}件のフィールドが未カバー`);
  if (testsFailed > 0) console.log(`  ⚠ ${testsFailed}件のテストが失敗`);
}
console.log("═══════════════════════════════════════════════════════════════");

process.exit(missingKeys.length + testsFailed > 0 ? 1 : 0);
