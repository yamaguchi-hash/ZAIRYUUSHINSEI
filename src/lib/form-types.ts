// ─── 在留申請書フォームデータ型定義 ───────────────────────────────────────────
// 法務省入管庁 公式様式（2025年版）全フィールド対応
// - 別記第六号の三様式（COE 在留資格認定証明書交付申請）
// - 別記第三十号様式（Change 在留資格変更許可申請）
// - 別記第三十号の二様式（Extension 在留期間更新許可申請）
//   ※ A版（就労系）/ B版（家族系）を統合
// - 別記第三十六号様式（Permanent 永住許可申請）

export type ApplicationFormType = 'coe' | 'change' | 'extension' | 'permanent';

// 申請書種別 → ラベル
export const FORM_TYPE_LABELS: Record<ApplicationFormType, string> = {
  coe:       '在留資格認定証明書交付申請書（別記第六号の三様式）',
  change:    '在留資格変更許可申請書（別記第三十号様式）',
  extension: '在留期間更新許可申請書（別記第三十号の二様式）',
  permanent: '永住許可申請書（別記第三十六号様式）',
};

// 申請書タイプ → 入管法条番号
export const FORM_TYPE_ARTICLE: Record<ApplicationFormType, string> = {
  coe:       '出入国管理及び難民認定法第７条の２の規定',
  change:    '出入国管理及び難民認定法第２０条第２項の規定',
  extension: '出入国管理及び難民認定法第２１条第２項の規定',
  permanent: '出入国管理及び難民認定法第２２条第２項の規定',
};

// ─── 在留資格フォームカテゴリ ──────────────────────────────────────────────────
export type VisaFormCategory =
  | 'N'   // 技術・人文知識・国際業務 / 研究 / 高度専門職 / 介護 / 技能 / 特定活動
  | 'M'   // 経営・管理
  | 'L'   // 企業内転勤 / 報道 / 研究（転勤）
  | 'I'   // 教授 / 教育
  | 'J'   // 芸術 / 文化活動
  | 'K'   // 宗教
  | 'O'   // 興行
  | 'P'   // 留学
  | 'Q'   // 研修
  | 'R'   // 家族滞在 / 特定活動（家族）
  | 'T'   // 日本人配偶者等 / 永住者配偶者等 / 定住者
  | 'V'   // 特定技能
  | 'Y'   // 技能実習
  | 'H'   // 短期滞在
  | 'U';  // その他

// カテゴリ別の特性
export const VISA_CATEGORY_NEEDS_ORG: Record<VisaFormCategory, boolean> = {
  N: true, M: true, L: true, I: true, V: true,
  P: true, Q: true, Y: true,
  J: false, K: false, O: false, R: false, T: false, H: false, U: false,
};

// Part 2 の種類
export type Part2Type = 'N' | 'T' | 'R' | 'P' | 'V' | 'none';
export const VISA_CATEGORY_PART2: Record<VisaFormCategory, Part2Type> = {
  N: 'N', L: 'N', I: 'N',
  V: 'V',   // 特定技能 — 専用 Part 2 V
  T: 'T',
  R: 'R',
  P: 'P',
  M: 'none', J: 'none', K: 'none', O: 'none',
  Q: 'none', Y: 'none', H: 'none', U: 'none',
};

export interface WorkHistoryEntry {
  joinDate: string;    // 入社年月
  leaveDate: string;   // 退社年月
  employer: string;    // 勤務先名称
}

export interface FamilyMember {
  relationship: string;        // 続柄
  name: string;                // 氏名
  dateOfBirth: string;         // 生年月日
  nationality: string;         // 国籍・地域
  placeOfEmployment: string;   // 勤務先名称・通学先名称
  residingTogether: boolean;   // 同居（予定）の有無
  residenceCardNumber: string; // 在留カード番号 or 特別永住者証明書番号
}

// ═══════════════════════════════════════════════════════════════════════════
// メインフォームデータ型
// ═══════════════════════════════════════════════════════════════════════════
export interface ApplicationFormData {
  // ── メタ情報 ──────────────────────────────────────────────────────────────
  applicationFormType: ApplicationFormType;
  visaFormCategory: VisaFormCategory;
  lastUpdated: string;

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人等作成用 Part 1 — 共通フィールド（全様式）
  // ══════════════════════════════════════════════════════════════════════════
  // 1. 国籍・地域
  nationality: string;
  // 2. 生年月日
  dateOfBirth: string;
  // 3. 氏名
  familyNameEn: string;
  givenNameEn: string;
  familyNameJa: string;
  givenNameJa: string;
  // 4. 性別
  sex: string;                     // 男 / 女
  // 5. 出生地（COE/Changeのみ。Extensionは5=配偶者の有無）
  placeOfBirth: string;
  // 5/6. 配偶者の有無
  maritalStatus: string;           // 有 / 無
  // 6/7. 職業
  occupation: string;
  // 7/8. 本国における居住地
  homeTownCity: string;
  // 8/9. 住居地・電話番号（分割入力）
  postalCodeInJapan: string;   // 郵便番号（例: 160-0023）
  prefectureInJapan: string;   // 都道府県
  cityInJapan: string;         // 市区町村
  addressLineInJapan: string;  // 番地・建物・部屋番号
  addressInJapan: string;      // 結合値（後方互換・印刷用）
  telephoneNo: string;
  cellularPhoneNo: string;
  // 9/10. 旅券番号・有効期限
  passportNumber: string;
  passportExpiry: string;

  // ── COE固有フィールド（別記第六号の三様式）──────────────────────────────
  // 11. 入国目的（在留資格選択）
  purposeOfEntry: string;
  // 12. 入国予定年月日
  scheduledDateOfEntry: string;
  // 13. 上陸予定港
  portOfEntry: string;
  // 14. 滞在予定期間
  intendedLengthOfStay: string;
  // 15. 同伴者の有無
  accompanyingPersons: string;
  // 16. 査証申請予定地
  intendedPlaceForVisa: string;
  // 17. 過去の出入国歴
  pastEntryHistory: string;
  pastEntryCount: string;
  pastEntryLatestFrom: string;
  pastEntryLatestTo: string;
  // 18. 過去の在留資格認定証明書交付申請歴
  pastCoeHistory: string;
  pastCoeCount: string;
  pastCoeNonIssuanceCount: string;

  // ── Change固有フィールド（別記第三十号様式）──────────────────────────────
  // 11. 現在の在留資格 / 在留期間 / 満了日
  currentStatusOfResidence: string;
  currentPeriodOfStay: string;
  currentPeriodExpiry: string;
  // 12. 在留カード番号
  residenceCardNumber: string;
  // 13. 希望する在留資格（変更のみ）/ 在留期間
  desiredStatusOfResidence: string;
  desiredPeriodOfStay: string;     // Change: 希望する在留期間 / Extension: 希望する在留期間（項目13）
  // 14. 変更の理由
  reasonForApplication: string;

  // ── 共通：犯罪・退去強制・家族 ────────────────────────────────────────
  criminalRecord: string;
  criminalRecordDetail: string;
  // 20. 退去強制歴（COEのみ）
  deportationHistory: string;
  deportationCount: string;
  deportationLatestDate: string;
  // 21/16. 在日親族及び同居者
  familyInJapanExists: string;
  familyInJapan: FamilyMember[];

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人等作成用 Part 2 — N型
  // 技術・人文知識・国際業務 / 企業内転勤 / 研究 / 高度専門職 / 介護 / 技能 / 特定活動
  // COE: 22〜27 / Change・Extension: 17〜22
  // ══════════════════════════════════════════════════════════════════════════
  employerName: string;
  employerBranchName: string;
  employerAddress: string;
  employerPhone: string;
  educationCountry: string;
  educationDegree: string;
  educationSchoolName: string;
  educationGraduationDate: string;
  majorCategory: string;
  majorCategoryOther: string;
  itQualificationExists: string;
  itQualificationName: string;
  workHistory: WorkHistoryEntry[];
  representativeName: string;
  representativeRelationship: string;
  representativeAddress: string;
  representativePhone: string;
  representativeCellular: string;
  agentName: string;
  agentAddress: string;
  agentOrganization: string;
  agentPhone: string;

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人等作成用 Part 2 — T型
  // 日本人の配偶者等 / 永住者の配偶者等 / 定住者
  // ══════════════════════════════════════════════════════════════════════════
  // 配偶者・親（身元保証人）の情報
  spouseFamilyNameEn: string;
  spouseGivenNameEn: string;
  spouseFamilyNameJa: string;
  spouseGivenNameJa: string;
  spouseDob: string;
  spouseNationality: string;        // 日本 / その他
  spouseOccupation: string;
  spouseEmployer: string;
  spouseAddress: string;
  spouseResidenceStatus: string;    // 日本国籍 / 永住者 / 特別永住者
  spouseResidenceCard: string;      // 在留カード番号 or 特別永住者証明書番号
  // 婚姻・家族関係
  marriageDate: string;
  marriageRegistrationDate: string;
  marriageRegistrationPlace: string;  // 婚姻届出市区町村
  cohabitation: string;             // 同居の有無 有/無
  separationReason: string;         // 別居理由（別居の場合）
  // 定住者の場合の根拠
  longTermResidentReason: string;

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人等作成用 Part 2 — R型（家族滞在）
  // 別記第三十号の二様式 B（更新）申請人用２Ｒ
  // ══════════════════════════════════════════════════════════════════════════
  // 17. 配偶者については婚姻、子については出生又は縁組の届出先及び届出年月日
  marriageNotificationPlaceJapan: string;    // (1) 日本国届出先
  marriageNotificationDateJapan: string;     // (1) 届出年月日
  marriageNotificationPlaceForeign: string;  // (2) 本国等届出先
  marriageNotificationDateForeign: string;   // (2) 届出年月日
  // 18. 滞在費支弁方法
  fundingMethod: string;        // 親族負担 / 外国からの送金 / 身元保証人負担 / その他
  fundingMethodOther: string;   // その他の詳細
  // 19. 資格外活動の有無
  partTimeWorkExistsR: string;       // 有 / 無
  partTimeWorkTypeR: string;         // (1) 内容
  partTimeWorkOrgNameR: string;      // (2) 名称
  partTimeWorkBranchNameR: string;   // (2) 支店・事業所名
  partTimeWorkPhoneR: string;        // (2) 電話番号
  partTimeWorkHoursR: string;        // (3) 週間稼働時間
  partTimeWorkSalaryR: string;       // (4) 報酬（円）
  partTimeWorkSalaryTypeR: string;   // 月額 / 日額
  // ── 扶養者用Ｒ（扶養者等作成用 Part 1 R）─────────────────────────────────
  // 2. 扶養者
  supporterNameEn: string;          // (1) 氏名（ローマ字）統合フィールド
  supporterFamilyNameEn: string;    // レガシー（後方互換用）
  supporterGivenNameEn: string;     // レガシー（後方互換用）
  supporterFamilyNameJa: string;
  supporterGivenNameJa: string;
  supporterDob: string;
  supporterNationality: string;      // (3) 国籍・地域
  supporterAddress: string;          // 住居地（扶養者）
  supporterStatusOfResidence: string; // (5) 在留資格
  supporterPeriodOfStay: string;     // (6) 在留期間
  supporterPeriodExpiry: string;     // (7) 在留期間の満了日
  supporterRelationship: string;     // (8) 申請人との関係: 夫/妻/父/母/養父/養母/その他
  supporterRelationshipOther: string; // その他の詳細
  supporterResidenceCard: string;    // (4) 在留カード番号
  supporterEmployer: string;         // (9) 勤務先名称（留学生を除く）
  supporterCorporateNumber: string;  // (10) 法人番号（13桁）
  supporterBranchName: string;       // (11) 支店・事業所名
  supporterEmployerAddress: string;   // (12) 勤務先所在地
  supporterEmployerPhone: string;    // (12) 勤務先電話番号
  supporterAnnualIncome: string;     // (13) 年収（円）

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人等作成用 Part 2 — P型（留学）
  // ══════════════════════════════════════════════════════════════════════════
  schoolName: string;
  schoolType: string;               // 大学院/大学/短大/専門学校/高校/日本語学校/その他
  schoolAddress: string;
  schoolPhone: string;
  enrollmentDate: string;           // 入学予定/在学中の場合は入学年月日
  expectedGraduationDate: string;
  courseOfStudy: string;            // 在籍コース・専攻
  annualTuition: string;            // 年間学費（円）
  fundingSource: string;            // 費用支弁方法
  fundingAmount: string;            // 月額生活費（円）
  scholarshipName: string;          // 奨学金の名称
  scholarshipAmount: string;        // 奨学金の額（月額）
  partTimeWorkPermit: string;       // 資格外活動許可の有無

  // ── フリーフィールド（その他種別用）────────────────────────────────────
  freeformPart2Notes: string;       // J/K/O/Q/Y/U/H 等の種別向け補足
  freeformOrgNotes: string;         // 所属機関等の補足・自由記載

  // ══════════════════════════════════════════════════════════════════════════
  // 申請人等作成用 Part 2 — V型（特定技能１号・２号）
  // 別記第三十号様式（変更）・第三十号の二様式（更新）申請人用２V・３V
  // ══════════════════════════════════════════════════════════════════════════
  // 17. 特定技能所属機関（employerName / employerAddress / employerPhone と共用）

  // 18. 技能水準
  skillLevelProofMethod: string;      // 証明方法: 分野別方針/試験/その他/技能実習2号修了
  skillLevelExamName1: string;        // 試験名1
  skillLevelExamCountry1: string;     // 試験地1: 国内/国外
  skillLevelExamCountryName1: string; // 試験地1の国名（国外の場合）
  skillLevelExamName2: string;        // 試験名2
  skillLevelExamCountry2: string;     // 試験地2
  skillLevelExamCountryName2: string; // 試験地2の国名

  // 19. 日本語能力（特定技能１号の場合のみ）
  japaneseAbilityProofMethod: string;
  japaneseAbilityExamName1: string;
  japaneseAbilityExamCountry1: string;
  japaneseAbilityExamCountryName1: string;
  japaneseAbilityExamName2: string;
  japaneseAbilityExamCountry2: string;
  japaneseAbilityExamCountryName2: string;

  // 20. 修了した技能実習2号（18・19で技能実習2号修了を選択した場合）
  completedTit2Occupation1: string;   // 職種1
  completedTit2Operations1: string;   // 作業1
  completedTit2ProofType1: string;    // 修了証明方法1: 実技試験合格/訓練状況書類
  completedTit2Occupation2: string;   // 職種2（複数ある場合）
  completedTit2Operations2: string;   // 作業2
  completedTit2ProofType2: string;    // 修了証明方法2

  // 21. 通算在留期間（特定技能１号を希望する場合のみ）
  cumulativeStayYears: string;        // 年
  cumulativeStayMonths: string;       // 月

  // ── 申請人 Part 3 V（項目22〜27）────────────────────────────────────────
  // 22. 保証金徴収等の有無
  depositContractExists: string;       // 有/無
  // 23. 外国の機関への費用
  overseasExpensesExists: string;      // 有/無
  overseasExpensesOrgName: string;     // 機関名
  overseasExpensesAmount: string;      // 費用額（円換算）
  // 24. 本国の手続きの実施
  homeCountryProcedureComplied: string; // 有/無
  // 25. 定期的な費用の了解
  regularExpensesUnderstood: string;   // 有/無
  // 26. 技能移転への努力（技能実習歴あり＋2号希望の場合）
  technologyTransferEffortV: string;   // 有/無
  // 27. 特定産業分野の基準への適合
  ssfSpecificFieldCriteriaMet: string; // 有/無

  // ── 所属機関等作成用 Part 1 V — 特定技能雇用契約 ───────────────────────
  // V型 Item 2: 雇用契約
  orgContractStartDate: string;       // 雇用契約期間（始）
  orgContractEndDate: string;         // 雇用契約期間（終）
  orgSpecifiedIndustrialField: string; // (2) 特定産業分野
  orgWorkCategory: string;            // (2) 業務区分
  orgOccupationNumber: string;        // (2) 主職種番号
  orgOccupationNumberAdditional: string[]; // (2) 追加職種番号（複数選択・配列）
  orgWorkHoursWeekly: string;         // (3) 所定労働時間（週平均）
  orgWorkHoursMonthly: string;        // (3) 所定労働時間（月平均）
  orgWorkHoursEquivalent: string;     // (3) 正規労働者と同等か 有/無
  orgTimeConvertedBasicSalary: string; // (4) 基本給の時間換算額
  orgJapaneseEquivalentSalary: string; // (4) 同種業務日本人の月額報酬
  orgSalaryEqualToJapanese: string;   // (4) 日本人同等以上か 有/無
  orgSalaryPaymentCash: string;       // (5) 現金払い 有/無
  orgSalaryPaymentBank: string;       // (5) 銀行振込 有/無
  orgForeignTreatmentDifference: string; // (6) 外国人差別的扱い 有/無
  orgForeignTreatmentDetail: string;   // (6) 差別的扱いの詳細
  orgPaidHolidayForReturn: string;    // (7) 一時帰国有給休暇 有/無
  orgFieldSpecificEmploymentCriteria: string; // (8) 分野別雇用基準 有/無
  orgReturnTravelExpenses: string;    // (9) 帰国旅費負担 有/無
  orgHealthCheck: string;             // (10) 健康状況確認 有/無
  orgProperResidenceCriteria: string; // (11) 適正在留基準 有/無

  // V型 Item 3: 所属機関情報（既存のorg系フィールドを共用）
  orgLaborInsuranceNo: string;        // 労働保険番号（14桁）
  orgHealthInsuranceMet: string;      // 健康保険・厚生年金 有/無
  orgLaborInsuranceMet: string;       // 労災・雇用保険 有/無

  // 職業紹介事業者（Item 2 (13)）
  orgPlacementProviderName: string;
  orgPlacementProviderCorporateNo: string;
  orgPlacementProviderInsuranceNo: string;
  orgPlacementProviderAddress: string;
  orgPlacementProviderPhone: string;
  orgPlacementProviderLicenseNo: string;
  orgPlacementProviderLicenseDate: string;

  // 派遣先（Item 2 (12) — V型用詳細）
  orgVDispatchName: string;            // 氏名又は名称
  orgVDispatchCorporateNo: string;     // 法人番号（13桁）
  orgVDispatchInsuranceNo: string;     // 雇用保険適用事業所番号
  orgVDispatchAddress: string;         // 住所（所在地）
  orgVDispatchPhone: string;           // 電話番号
  orgVDispatchRepresentative: string;  // 代表者の氏名
  orgVDispatchStartDate: string;       // 派遣期間（始）
  orgVDispatchEndDate: string;         // 派遣期間（終）

  // 取次機関（Item 2 (14) — V2シート）
  orgIntermediaryName: string;         // 氏名又は名称
  orgIntermediaryAddress: string;      // 住所（所在地）
  orgIntermediaryPhone: string;        // 電話番号

  // 所属機関コンプライアンス確認 — V2シート (11)〜(21)
  orgLaborLawViolation: string;        // (11) 労働・社会保険・租税法令違反の有無
  orgLaborLawViolationDetail: string;  // (11) 詳細
  orgInvoluntaryDismissal: string;     // (12) 非自発的離職の有無
  orgInvoluntaryDismissalDetail: string;
  orgMissingPerson: string;            // (13) 行方不明者を発生させたことの有無
  orgMissingPersonDetail: string;
  orgCriminalPunishment: string;       // (14) 刑事処分（刑罰）の有無
  orgCriminalPunishmentDetail: string;
  orgMentalDisability: string;         // (15) 精神の機能の障害による欠格の有無
  orgMentalDisabilityDetail: string;
  orgBankruptcy: string;               // (16) 破産手続開始の有無
  orgBankruptcyDetail: string;
  orgTrainingRevoked: string;          // (17) 実習認定取消の有無
  orgTrainingRevokedDetail: string;
  orgWasOfficerOfRevoked: string;      // (18) 実習認定取消法人の役員であった有無
  orgWasOfficerOfRevokedDetail: string;
  orgIllegalActFiveYears: string;      // (19) 出入国・労働法令上の不正行為（5年以内）
  orgIllegalActFiveYearsDetail: string;
  orgGangsterMember: string;           // (20) 暴力団員（現在または5年以内）
  orgGangsterMemberDetail: string;
  orgLegalAgentViolation: string;      // (21) 法定代理人が(14)〜(20)に該当（未成年の場合）
  orgLegalAgentViolationDetail: string;

  // 所属機関追加コンプライアンス — V3シート (22)〜(33)
  orgGangsterControl: string;          // (22) 暴力団員等に事業活動を支配される者か
  orgGangsterControlDetail: string;
  orgActivityDocumentKept: string;     // (23) 活動内容文書の作成・1年以上保管
  orgAwareOfDeposit: string;           // (24) 保証金・財産管理等契約を認識しての締結
  orgAwareOfDepositDetail: string;
  orgPenaltyContractExists: string;    // (25) 不履行についての違約金支払契約の有無
  orgPenaltyContractDetail: string;
  orgSupportCostNotBurdened: string;   // (26) 支援費用を外国人に負担させないこと（1号）
  orgDispatchMeetsCondition: string;   // (27) 派遣先が法定要件のいずれかに該当
  orgDispatchConditionDetail: string;
  orgDispatchMeetsCompliance: string;  // (28) 派遣先が(11)〜(22)に該当しないこと
  orgDispatchComplianceDetail: string;
  orgAccidentInsurance: string;        // (29) 労災保険加入等の措置
  orgAccidentInsuranceDetail: string;
  orgContinuousPerformance: string;    // (30) 特定技能雇用契約を継続して履行する体制
  orgSalaryPaymentVerifiable: string;  // (31) 報酬の支払を客観的方法で確認できること
  orgCoexistenceCooperation: string;   // (32) 共生社会施策への協力・協力確認書提出
  orgCoexistenceWorkplaceCity: string; // (32) 勤務地市区町村への協力確認書提出日
  orgCoexistenceWorkplaceCityDate: string;
  orgCoexistenceWorkplaceCityName: string;
  orgCoexistenceResidenceCity: string; // (32) 住居地市区町村への協力確認書提出日
  orgCoexistenceResidenceCityDate: string;
  orgCoexistenceResidenceCityName: string;
  orgFieldSpecificContractCriteria: string; // (33) 分野別雇用契約適正履行基準への適合

  // 特定技能１号支援計画（特定技能１号の場合のみ）
  // 支援責任者・支援担当者
  supportManagerName: string;         // 支援責任者氏名
  supportManagerTitle: string;        // 支援責任者役職・部署
  supportManagerAppointed: string;    // (34) 役員又は職員の中から支援責任者を選任していることの有無
  supportStaffName: string;           // 支援担当者氏名
  supportStaffTitle: string;          // 支援担当者役職・部署
  supportStaffAppointed: string;      // (35) 役員又は職員の中から支援担当者を選任していることの有無

  // (36) 中長期在留者受入・管理実績等のいずれかに該当することの有無 — V3シート
  supportExperienceCriteria: string;
  supportExperienceCriteriaItem1: boolean; // ① 中長期在留者の受入れ又は管理を適正に行った実績
  supportExperienceCriteriaItem2: boolean; // ② 支援責任者・担当者の生活相談等従事経験
  supportExperienceCriteriaItem3: boolean; // ③ その他支援業務を適正に実施できる事情
  supportExperienceCriteriaItem3Detail: string;

  supportLanguageCapability: string;  // (37) 外国人が理解できる言語による支援体制の有無
  supportDocumentKept: string;        // (38) 1号支援状況に関する文書の作成・1年以上保管

  // V4シート (39)〜(42)
  supportNeutralPosition: string;     // (39) 支援責任者・担当者が中立な立場であることの有無
  supportFailureHistory: string;      // (40) 過去の1号特定技能外国人支援の懈怠の有無
  supportFailureHistoryDetail: string;
  supportPeriodicInterviewCapability: string; // (41) 定期面談を実施できる体制の有無
  supportImplementationFieldCriteria: string; // (42) 支援計画実施の分野別基準への適合の有無

  // 4 1号特定技能外国人支援計画の内容（特定技能1号の場合のみ）— V4シート (1)〜(16)
  supportPlanInfoProvision: string;       // (1) 在留に関する留意事項等の情報提供
  supportPlanInfoProvisionMethod: string; // (2) 対面・テレビ電話等による実施
  supportPlanAirportTransfer: string;     // (3) 出入国時の送迎
  supportPlanHousingSupport: string;      // (4) 住居確保に係る支援
  supportPlanLifeContractSupport: string; // (5) 預金口座開設・携帯電話契約等の支援
  supportPlanLivingInfoProvision: string; // (6) 生活一般に関する情報提供
  supportPlanProcedureAccompany: string;  // (7) 行政手続への同行等
  supportPlanJapaneseLearning: string;    // (8) 日本語学習機会の提供
  supportPlanConsultationResponse: string;// (9) 相談・苦情対応
  supportPlanExchangePromotion: string;   // (10) 日本人との交流促進支援
  supportPlanJobChangeSupport: string;    // (11) 非自発的離職時の転職支援
  supportPlanPeriodicInterview: string;   // (12) 定期面談・行政機関への通報
  supportPlanCopyProvided: string;        // (13) 支援計画の作成・写しの交付
  supportPlanFieldSpecificMatters: string;// (14) 分野別告示事項の記載（該当する場合のみ）
  supportPlanContentAppropriate: string;  // (15) 支援内容の適正性
  supportPlanFieldSpecificCriteria: string; // (16) 分野別告示基準への適合（該当する場合のみ）

  // 登録支援機関（特定技能１号・全支援委託の場合）
  rsoName: string;                    // (5-1) 登録支援機関名称
  rsoCorporateNo: string;             // (5-2) 法人番号
  rsoInsuranceNo: string;             // (5-3) 雇用保険適用事業所番号
  rsoAddress: string;                 // (5-4) 所在地
  rsoPhone: string;                   // 電話番号
  rsoRepresentative: string;          // (5-5) 代表者氏名
  rsoRegNo: string;                   // (5-6) 登録番号
  rsoRegDate: string;                 // (5-7) 登録年月日
  rsoSupportBusinessName: string;     // (5-8) 支援実施事業所名
  rsoSupportBusinessAddress: string;  // 支援実施事業所所在地
  rsoSupportManager: string;          // (5-10) 支援責任者
  rsoSupportStaff: string;            // (5-11) 支援担当者
  rsoAvailableLanguages: string;      // (5-12) 対応可能言語
  rsoFeePerMonth: string;             // (5-13) 支援委託費用（月額・円）

  // ══════════════════════════════════════════════════════════════════════════
  // 所属機関等作成用 Part 1 — N型
  // ══════════════════════════════════════════════════════════════════════════
  contractType: string;
  contractTypeOther: string;
  orgName: string;
  orgCorporateNumber: string;
  orgBranchName: string;
  orgEmploymentInsuranceNo: string;
  orgBusinessTypeCode: string;
  orgBusinessTypeOtherCode: string;
  orgAddress: string;
  orgPhone: string;
  orgCapital: string;
  orgAnnualSales: string;
  orgEmployeeCount: string;
  orgForeignEmployeeCount: string;
  orgTechInternCount: string;
  // 4. 研究室（COEのみ、高度専門職・研究・特定活動の場合）
  researchRoomName: string;
  researchRoomProfessor: string;
  // 就労条件
  workPeriodFixed: string;
  workPeriodDuration: string;
  employmentStartDate: string;
  employmentStartDateStatus: string;
  salary: string;
  salaryType: string;
  businessExperienceYears: string;
  positionExists: string;
  position: string;
  occupationCode: string;
  occupationCodeOthers: string;
  activityDetails: string;

  // ══════════════════════════════════════════════════════════════════════════
  // 所属機関等作成用 Part 2 — N型（派遣先等）
  // COE: 項目12 / Change・Extension: 項目11
  // ══════════════════════════════════════════════════════════════════════════
  dispatchOrgName: string;
  dispatchOrgCorporateNumber: string;
  dispatchOrgBranchName: string;
  dispatchOrgEmploymentInsuranceNo: string;
  dispatchOrgBusinessTypeCode: string;
  dispatchOrgAddress: string;
  dispatchOrgPhone: string;
  dispatchOrgCapital: string;
  dispatchOrgAnnualSales: string;
  dispatchPeriod: string;

  // ══════════════════════════════════════════════════════════════════════════
  // 資格外活動許可申請書（別記第二十八号様式）
  // 資格外活動の有無が「有」または手動で必要とした場合に使用
  // ══════════════════════════════════════════════════════════════════════════
  /** 資格外活動許可申請書を作成するか（手動フラグ） */
  gaikatsuNeeded: string;                // 有 / 無
  /** 10. 現在の在留活動の内容（学生は学校名・週間授業時間等） */
  gaikatsuCurrentActivity: string;
  /** 11(1) 職務の内容 */
  gaikatsuActivityType: string;          // 翻訳・通訳 / 語学教師 / その他
  gaikatsuActivityTypeOther: string;     // その他の場合の詳細
  /** 11(2) 雇用契約期間 */
  gaikatsuContractPeriod: string;
  /** 11(3) 週間稼働時間 */
  gaikatsuWeeklyHours: string;
  /** 11(4) 報酬 */
  gaikatsuSalary: string;               // 金額（円）
  gaikatsuSalaryType: string;           // 月額 / 週額 / 日額
  /** 12(1) 勤務先名称 */
  gaikatsuEmployerName: string;
  /** 12(2) 勤務先所在地・電話番号 */
  gaikatsuEmployerAddress: string;
  gaikatsuEmployerPhone: string;
  /** 12(3) 業種 */
  gaikatsuEmployerBusinessType: string;  // 製造 / 商業 / 教育 / その他

  // ══════════════════════════════════════════════════════════════════════════
  // 理由書（家族滞在用）
  // ══════════════════════════════════════════════════════════════════════════
  riyushoSubmissionBureau: string;   // 提出先管理局（例: "大阪", "東京", "名古屋"）
  riyushoBody: string;               // 理由書本文

  // ══════════════════════════════════════════════════════════════════════════
  // AI読み取りステータス（各フィールドの確信度）
  // confirmed: AI/手入力で値が設定済み / empty: 要手動入力
  // ══════════════════════════════════════════════════════════════════════════
  aiFieldStatus?: Record<string, 'confirmed' | 'empty'>;
}

// ─── 空フォームデータ ─────────────────────────────────────────────────────────
export const EMPTY_FORM_DATA: ApplicationFormData = {
  applicationFormType: 'extension',
  visaFormCategory: 'N',
  lastUpdated: '',
  // Part 1 共通
  nationality: '', dateOfBirth: '',
  familyNameEn: '', givenNameEn: '', familyNameJa: '', givenNameJa: '',
  sex: '', placeOfBirth: '', maritalStatus: '',
  occupation: '', homeTownCity: '',
  postalCodeInJapan: '', prefectureInJapan: '', cityInJapan: '', addressLineInJapan: '',
  addressInJapan: '', telephoneNo: '', cellularPhoneNo: '',
  passportNumber: '', passportExpiry: '',
  // COE固有
  purposeOfEntry: '',
  scheduledDateOfEntry: '', portOfEntry: '', intendedLengthOfStay: '',
  accompanyingPersons: '無', intendedPlaceForVisa: '',
  pastEntryHistory: '無', pastEntryCount: '', pastEntryLatestFrom: '', pastEntryLatestTo: '',
  pastCoeHistory: '無', pastCoeCount: '', pastCoeNonIssuanceCount: '',
  // Change固有
  currentStatusOfResidence: '', currentPeriodOfStay: '', currentPeriodExpiry: '',
  residenceCardNumber: '',
  desiredStatusOfResidence: '', desiredPeriodOfStay: '',
  reasonForApplication: '',
  // 共通
  criminalRecord: '無', criminalRecordDetail: '',
  deportationHistory: '無', deportationCount: '', deportationLatestDate: '',
  familyInJapanExists: '無', familyInJapan: [],
  // Part 2 N
  employerName: '', employerBranchName: '', employerAddress: '', employerPhone: '',
  educationCountry: '', educationDegree: '', educationSchoolName: '', educationGraduationDate: '',
  majorCategory: '', majorCategoryOther: '',
  itQualificationExists: '無', itQualificationName: '',
  workHistory: [
    { joinDate: '', leaveDate: '', employer: '' },
    { joinDate: '', leaveDate: '', employer: '' },
  ],
  representativeName: '', representativeRelationship: '',
  representativeAddress: '', representativePhone: '', representativeCellular: '',
  agentName: '', agentAddress: '', agentOrganization: '', agentPhone: '',
  // Part 2 T
  spouseFamilyNameEn: '', spouseGivenNameEn: '', spouseFamilyNameJa: '', spouseGivenNameJa: '',
  spouseDob: '', spouseNationality: '日本', spouseOccupation: '', spouseEmployer: '',
  spouseAddress: '', spouseResidenceStatus: '日本国籍', spouseResidenceCard: '',
  marriageDate: '', marriageRegistrationDate: '', marriageRegistrationPlace: '',
  cohabitation: '有', separationReason: '',
  longTermResidentReason: '',
  // Part 2 R — 項目17: 婚姻・出生届出
  marriageNotificationPlaceJapan: '', marriageNotificationDateJapan: '',
  marriageNotificationPlaceForeign: '', marriageNotificationDateForeign: '',
  // Part 2 R — 項目18: 滞在費支弁方法
  fundingMethod: '親族負担', fundingMethodOther: '',
  // Part 2 R — 項目19: 資格外活動
  partTimeWorkExistsR: '無',
  partTimeWorkTypeR: '', partTimeWorkOrgNameR: '', partTimeWorkBranchNameR: '',
  partTimeWorkPhoneR: '', partTimeWorkHoursR: '', partTimeWorkSalaryR: '', partTimeWorkSalaryTypeR: '月額',
  // Part 2 R — 扶養者
  supporterNameEn: '', supporterFamilyNameEn: '', supporterGivenNameEn: '',
  supporterFamilyNameJa: '', supporterGivenNameJa: '',
  supporterDob: '', supporterNationality: '',
  supporterAddress: '', supporterStatusOfResidence: '',
  supporterPeriodOfStay: '', supporterPeriodExpiry: '',
  supporterRelationship: '夫', supporterRelationshipOther: '',
  supporterResidenceCard: '', supporterEmployer: '',
  supporterCorporateNumber: '', supporterBranchName: '',
  supporterEmployerAddress: '', supporterEmployerPhone: '', supporterAnnualIncome: '',
  // Part 2 P
  schoolName: '', schoolType: '', schoolAddress: '', schoolPhone: '',
  enrollmentDate: '', expectedGraduationDate: '', courseOfStudy: '',
  annualTuition: '', fundingSource: '', fundingAmount: '',
  scholarshipName: '', scholarshipAmount: '', partTimeWorkPermit: '無',
  // フリーフィールド
  freeformPart2Notes: '',
  freeformOrgNotes: '',
  // Part 2 V — 特定技能
  skillLevelProofMethod: '', skillLevelExamName1: '', skillLevelExamCountry1: '', skillLevelExamCountryName1: '',
  skillLevelExamName2: '', skillLevelExamCountry2: '', skillLevelExamCountryName2: '',
  japaneseAbilityProofMethod: '', japaneseAbilityExamName1: '', japaneseAbilityExamCountry1: '', japaneseAbilityExamCountryName1: '',
  japaneseAbilityExamName2: '', japaneseAbilityExamCountry2: '', japaneseAbilityExamCountryName2: '',
  completedTit2Occupation1: '', completedTit2Operations1: '', completedTit2ProofType1: '',
  completedTit2Occupation2: '', completedTit2Operations2: '', completedTit2ProofType2: '',
  cumulativeStayYears: '', cumulativeStayMonths: '',
  depositContractExists: '無', overseasExpensesExists: '無', overseasExpensesOrgName: '', overseasExpensesAmount: '',
  homeCountryProcedureComplied: '有', regularExpensesUnderstood: '有',
  technologyTransferEffortV: '有', ssfSpecificFieldCriteriaMet: '有',
  // 所属機関 V型固有
  orgContractStartDate: '', orgContractEndDate: '',
  orgSpecifiedIndustrialField: '', orgWorkCategory: '',
  orgOccupationNumber: '', orgOccupationNumberAdditional: [],
  orgWorkHoursWeekly: '', orgWorkHoursMonthly: '', orgWorkHoursEquivalent: '有',
  orgTimeConvertedBasicSalary: '', orgJapaneseEquivalentSalary: '', orgSalaryEqualToJapanese: '有',
  orgSalaryPaymentCash: '無', orgSalaryPaymentBank: '有',
  orgForeignTreatmentDifference: '無', orgForeignTreatmentDetail: '',
  orgPaidHolidayForReturn: '有', orgFieldSpecificEmploymentCriteria: '有',
  orgReturnTravelExpenses: '有', orgHealthCheck: '有', orgProperResidenceCriteria: '有',
  orgLaborInsuranceNo: '', orgHealthInsuranceMet: '有', orgLaborInsuranceMet: '有',
  orgPlacementProviderName: '', orgPlacementProviderCorporateNo: '', orgPlacementProviderInsuranceNo: '',
  orgPlacementProviderAddress: '', orgPlacementProviderPhone: '',
  orgPlacementProviderLicenseNo: '', orgPlacementProviderLicenseDate: '',
  // V型 派遣先詳細
  orgVDispatchName: '', orgVDispatchCorporateNo: '', orgVDispatchInsuranceNo: '',
  orgVDispatchAddress: '', orgVDispatchPhone: '', orgVDispatchRepresentative: '',
  orgVDispatchStartDate: '', orgVDispatchEndDate: '',
  // V型 取次機関
  orgIntermediaryName: '', orgIntermediaryAddress: '', orgIntermediaryPhone: '',
  // V型 機関コンプライアンス (11)〜(21)
  orgLaborLawViolation: '無', orgLaborLawViolationDetail: '',
  orgInvoluntaryDismissal: '無', orgInvoluntaryDismissalDetail: '',
  orgMissingPerson: '無', orgMissingPersonDetail: '',
  orgCriminalPunishment: '無', orgCriminalPunishmentDetail: '',
  orgMentalDisability: '無', orgMentalDisabilityDetail: '',
  orgBankruptcy: '無', orgBankruptcyDetail: '',
  orgTrainingRevoked: '無', orgTrainingRevokedDetail: '',
  orgWasOfficerOfRevoked: '無', orgWasOfficerOfRevokedDetail: '',
  orgIllegalActFiveYears: '無', orgIllegalActFiveYearsDetail: '',
  orgGangsterMember: '無', orgGangsterMemberDetail: '',
  orgLegalAgentViolation: '無', orgLegalAgentViolationDetail: '',
  // V型 追加コンプライアンス (22)〜(33)
  orgGangsterControl: '無', orgGangsterControlDetail: '',
  orgActivityDocumentKept: '有',
  orgAwareOfDeposit: '無', orgAwareOfDepositDetail: '',
  orgPenaltyContractExists: '無', orgPenaltyContractDetail: '',
  orgSupportCostNotBurdened: '有',
  orgDispatchMeetsCondition: '無', orgDispatchConditionDetail: '',
  orgDispatchMeetsCompliance: '無', orgDispatchComplianceDetail: '',
  orgAccidentInsurance: '有', orgAccidentInsuranceDetail: '',
  orgContinuousPerformance: '有',
  orgSalaryPaymentVerifiable: '有',
  orgCoexistenceCooperation: '有',
  orgCoexistenceWorkplaceCity: '有', orgCoexistenceWorkplaceCityDate: '', orgCoexistenceWorkplaceCityName: '',
  orgCoexistenceResidenceCity: '有', orgCoexistenceResidenceCityDate: '', orgCoexistenceResidenceCityName: '',
  orgFieldSpecificContractCriteria: '有',
  supportManagerName: '', supportManagerTitle: '', supportManagerAppointed: '有',
  supportStaffName: '', supportStaffTitle: '', supportStaffAppointed: '有',
  supportExperienceCriteria: '無',
  supportExperienceCriteriaItem1: false, supportExperienceCriteriaItem2: false,
  supportExperienceCriteriaItem3: false, supportExperienceCriteriaItem3Detail: '',
  supportLanguageCapability: '有',
  supportDocumentKept: '有',
  supportNeutralPosition: '有',
  supportFailureHistory: '無', supportFailureHistoryDetail: '',
  supportPeriodicInterviewCapability: '有',
  supportImplementationFieldCriteria: '有',
  // 4 1号特定技能外国人支援計画 (1)〜(16)
  supportPlanInfoProvision: '有',
  supportPlanInfoProvisionMethod: '有',
  supportPlanAirportTransfer: '有',
  supportPlanHousingSupport: '有',
  supportPlanLifeContractSupport: '有',
  supportPlanLivingInfoProvision: '有',
  supportPlanProcedureAccompany: '有',
  supportPlanJapaneseLearning: '有',
  supportPlanConsultationResponse: '有',
  supportPlanExchangePromotion: '有',
  supportPlanJobChangeSupport: '有',
  supportPlanPeriodicInterview: '有',
  supportPlanCopyProvided: '有',
  supportPlanFieldSpecificMatters: '有',
  supportPlanContentAppropriate: '有',
  supportPlanFieldSpecificCriteria: '有',
  rsoName: '', rsoCorporateNo: '', rsoInsuranceNo: '', rsoAddress: '', rsoPhone: '',
  rsoRepresentative: '', rsoRegNo: '', rsoRegDate: '',
  rsoSupportBusinessName: '', rsoSupportBusinessAddress: '',
  rsoSupportManager: '', rsoSupportStaff: '', rsoAvailableLanguages: '', rsoFeePerMonth: '',
  // 所属機関 Part 1
  contractType: '雇用', contractTypeOther: '',
  orgName: '', orgCorporateNumber: '', orgBranchName: '',
  orgEmploymentInsuranceNo: '',
  orgBusinessTypeCode: '', orgBusinessTypeOtherCode: '',
  orgAddress: '', orgPhone: '',
  orgCapital: '', orgAnnualSales: '',
  orgEmployeeCount: '', orgForeignEmployeeCount: '', orgTechInternCount: '',
  researchRoomName: '', researchRoomProfessor: '',
  workPeriodFixed: '定めなし', workPeriodDuration: '',
  employmentStartDate: '', employmentStartDateStatus: '',
  salary: '', salaryType: '月額',
  businessExperienceYears: '',
  positionExists: 'あり', position: '',
  occupationCode: '', occupationCodeOthers: '',
  activityDetails: '',
  // 所属機関 Part 2
  dispatchOrgName: '', dispatchOrgCorporateNumber: '', dispatchOrgBranchName: '',
  dispatchOrgEmploymentInsuranceNo: '', dispatchOrgBusinessTypeCode: '',
  dispatchOrgAddress: '', dispatchOrgPhone: '',
  dispatchOrgCapital: '', dispatchOrgAnnualSales: '', dispatchPeriod: '',
  // 資格外活動許可申請書
  gaikatsuNeeded: '無',
  gaikatsuCurrentActivity: '',
  gaikatsuActivityType: '', gaikatsuActivityTypeOther: '',
  gaikatsuContractPeriod: '', gaikatsuWeeklyHours: '',
  gaikatsuSalary: '', gaikatsuSalaryType: '月額',
  gaikatsuEmployerName: '', gaikatsuEmployerAddress: '', gaikatsuEmployerPhone: '',
  gaikatsuEmployerBusinessType: '',
  // 理由書（家族滞在用）
  riyushoSubmissionBureau: '',
  riyushoBody: '',
};

// ─── 業種一覧（別紙） ─────────────────────────────────────────────────────────
export const BUSINESS_TYPES: { code: number; label: string }[] = [
  { code: 1, label: '農林業' }, { code: 2, label: '漁業' },
  { code: 3, label: '鉱業，採石業，砂利採取業' }, { code: 4, label: '建設業' },
  { code: 5, label: '製造業（食料品）' }, { code: 6, label: '製造業（繊維工業）' },
  { code: 7, label: '製造業（プラスチック製品）' }, { code: 8, label: '製造業（金属製品）' },
  { code: 9, label: '製造業（生産用機械器具）' }, { code: 10, label: '製造業（電気機械器具）' },
  { code: 11, label: '製造業（輸送用機械器具）' }, { code: 12, label: '製造業（その他）' },
  { code: 13, label: '電気・ガス・熱供給・水道業' }, { code: 14, label: '情報通信業' },
  { code: 15, label: '運輸・信書便事業' }, { code: 16, label: '卸売業（各種商品）' },
  { code: 17, label: '卸売業（繊維・衣服等）' }, { code: 18, label: '卸売業（飲食料品）' },
  { code: 19, label: '卸売業（建築材料・鉱物・金属）' }, { code: 20, label: '卸売業（機械器具）' },
  { code: 21, label: '卸売業（その他）' }, { code: 22, label: '小売業（各種商品）' },
  { code: 23, label: '小売業（織物・衣服・身の回り品）' }, { code: 24, label: '小売業（飲食料品）' },
  { code: 25, label: '小売業（機械器具）' }, { code: 26, label: '小売業（その他）' },
  { code: 27, label: '金融・保険業' }, { code: 28, label: '不動産・物品賃貸業' },
  { code: 29, label: '学術研究・専門技術（学術・開発研究機関）' },
  { code: 30, label: '学術研究・専門技術（専門サービス業）' },
  { code: 31, label: '学術研究・専門技術（広告業）' },
  { code: 32, label: '学術研究・専門技術（技術サービス業その他）' },
  { code: 33, label: '宿泊業' }, { code: 34, label: '飲食サービス業' },
  { code: 35, label: '生活関連サービス・娯楽業' }, { code: 36, label: '学校教育' },
  { code: 37, label: 'その他の教育・学習支援業' }, { code: 38, label: '医療業' },
  { code: 39, label: '保健衛生' }, { code: 40, label: '社会保険・社会福祉・介護事業' },
  { code: 41, label: '複合サービス事業（郵便局等）' },
  { code: 42, label: '職業紹介・労働者派遣業' },
  { code: 43, label: 'その他の事業サービス業' }, { code: 44, label: 'その他のサービス業' },
  { code: 45, label: '宗教' }, { code: 46, label: '公務' }, { code: 47, label: '分類不能の産業' },
];

// ─── 職種一覧（別紙） ──────────────────────────────────────────────────────────
export const OCCUPATION_TYPES: { code: number; label: string }[] = [
  { code: 1, label: '経営' }, { code: 2, label: '管理業務（経営者を除く）' },
  { code: 3, label: '調査研究' }, { code: 4, label: '技術開発（農林水産分野）' },
  { code: 5, label: '技術開発（食品分野）' }, { code: 6, label: '技術開発（機械器具分野）' },
  { code: 7, label: '技術開発（その他製造分野）' }, { code: 8, label: '生産管理（食品分野）' },
  { code: 9, label: '生産管理（機械器具分野）' }, { code: 10, label: '生産管理（その他製造分野）' },
  { code: 11, label: '建築・土木・測量技術' }, { code: 12, label: '情報処理・通信技術' },
  { code: 13, label: '法律関係業務' }, { code: 14, label: '金融・保険' },
  { code: 15, label: 'コピーライティング' }, { code: 16, label: '報道' },
  { code: 17, label: '編集' }, { code: 18, label: 'デザイン' },
  { code: 19, label: '教育（教員免許を有する者が行う教育）' },
  { code: 20, label: '教育（小学校・中学校・高等学校における語学教育）' },
  { code: 21, label: '教育（専修学校）' }, { code: 22, label: '教育（各種学校）' },
  { code: 23, label: '教育（インターナショナルスクール）' },
  { code: 24, label: '教育（教育機関を除く）' }, { code: 25, label: '翻訳・通訳' },
  { code: 26, label: '海外取引業務' }, { code: 27, label: '企画事務（マーケティング，リサーチ）' },
  { code: 28, label: '企画事務（広報・宣伝）' }, { code: 29, label: '会計事務' },
  { code: 30, label: '法人営業' }, { code: 31, label: 'ＣＡＤオペレーション' },
  { code: 32, label: '調理' }, { code: 33, label: '外国特有の建築技術' },
  { code: 34, label: '外国特有の製品製造' }, { code: 35, label: '宝石・貴金属・毛皮加工' },
  { code: 36, label: '動物の調教' }, { code: 37, label: '石油・地熱等掘削調査' },
  { code: 38, label: 'パイロット' }, { code: 39, label: 'スポーツ指導' },
  { code: 40, label: 'ソムリエ' }, { code: 41, label: '介護福祉士' },
  { code: 42, label: '研究' }, { code: 43, label: '研究の指導' },
  { code: 45, label: '記者' }, { code: 46, label: '報道カメラマン' },
  { code: 47, label: '医師' }, { code: 48, label: '歯科医師' },
  { code: 49, label: '薬剤師' }, { code: 50, label: '看護師' },
  { code: 55, label: '保健師' }, { code: 56, label: '助産師' },
  { code: 57, label: '准看護師' }, { code: 58, label: '歯科衛生士' },
  { code: 59, label: '診療放射線技師' }, { code: 60, label: '理学療法士' },
  { code: 61, label: '作業療法士' }, { code: 62, label: '視能訓練士' },
  { code: 63, label: '臨床工学技士' }, { code: 64, label: '義肢装具士' },
  { code: 65, label: '弁護士' }, { code: 66, label: '司法書士' },
  { code: 67, label: '弁理士' }, { code: 68, label: '土地家屋調査士' },
  { code: 69, label: '外国法事務弁護士' }, { code: 70, label: '公認会計士' },
  { code: 71, label: '外国公認会計士' }, { code: 72, label: '税理士' },
  { code: 73, label: '社会保険労務士' }, { code: 74, label: '行政書士' },
  { code: 75, label: '海事代理士' }, { code: 76, label: '著述家' },
  { code: 77, label: '美術家・写真家' }, { code: 78, label: '音楽家・舞台芸術家' },
  { code: 79, label: '宗教家' }, { code: 80, label: '家事使用人' },
  { code: 81, label: 'プロスポーツ選手' },
  { code: 100, label: 'その他のサービス職業従事者（他に分類されないもの）' },
  { code: 101, label: '農林漁業従事者' },
  { code: 102, label: '製品製造・加工処理従事者（金属製品）' },
  { code: 103, label: '製品製造・加工処理従事者（金属製品を除く）' },
  { code: 104, label: '機械組立従事者' }, { code: 105, label: '機械整備・修理従事者' },
  { code: 106, label: '機械検査従事者' }, { code: 107, label: '建設躯体工事従事者' },
  { code: 108, label: '建設従事者（建設躯体工事従事者を除く）' },
  { code: 109, label: 'その他の建設・採掘従事者（他に分類されないもの）' },
  { code: 110, label: '運搬・清掃・包装等従事者' },
  { code: 111, label: '外交' }, { code: 112, label: '公用' },
  { code: 999, label: 'その他' },
];

// ─── 専攻・専門分野（大学・短大・大学院） ────────────────────────────────────────
export const MAJOR_CATEGORIES_UNIVERSITY: string[] = [
  '法学', '経済学', '政治学', '商学', '経営学', '文学',
  '語学', '社会学', '歴史学', '心理学', '教育学', '芸術学',
  'その他人文・社会科学', '理学', '化学', '工学',
  '農学', '水産学', '薬学', '医学', '歯学',
  'その他自然科学', '体育学', '介護福祉', 'その他',
];

export const MAJOR_CATEGORIES_VOCATIONAL: string[] = [
  '工業', '農業', '医療・衛生', '教育・社会福祉', '法律',
  '商業実務', '服飾・家政', '文化・教養', '介護福祉', 'その他',
];

// ─── 入国目的 / 在留資格（COE用） ─────────────────────────────────────────────
export const PURPOSE_OF_ENTRY_OPTIONS: { value: string; label: string; category: VisaFormCategory }[] = [
  { value: '教授', label: '教授（Professor）', category: 'I' },
  { value: '教育', label: '教育（Instructor）', category: 'I' },
  { value: '芸術', label: '芸術（Artist）', category: 'J' },
  { value: '文化活動', label: '文化活動（Cultural Activities）', category: 'J' },
  { value: '宗教', label: '宗教（Religious Activities）', category: 'K' },
  { value: '報道', label: '報道（Journalist）', category: 'L' },
  { value: '企業内転勤', label: '企業内転勤（Intra-company Transferee）', category: 'L' },
  { value: '研究（転勤）', label: '研究（転勤）（Researcher-Transferee）', category: 'L' },
  { value: '経営・管理', label: '経営・管理（Business Manager）', category: 'M' },
  { value: '研究', label: '研究（Researcher）', category: 'N' },
  { value: '技術・人文知識・国際業務', label: '技術・人文知識・国際業務（Engineer/Specialist in Humanities）', category: 'N' },
  { value: '介護', label: '介護（Nursing Care）', category: 'N' },
  { value: '技能', label: '技能（Skilled Labor）', category: 'N' },
  { value: '特定活動（研究活動等）', label: '特定活動（研究活動等）', category: 'N' },
  { value: '特定活動（本邦大学卒業者）', label: '特定活動（本邦大学卒業者）', category: 'N' },
  { value: '特定技能（1号）', label: '特定技能（1号）（Specified Skilled Worker i）', category: 'V' },
  { value: '特定技能（2号）', label: '特定技能（2号）（Specified Skilled Worker ii）', category: 'V' },
  { value: '高度専門職（1号イ）', label: '高度専門職（1号イ）（Highly Skilled Professional i-a）', category: 'N' },
  { value: '高度専門職（1号ロ）', label: '高度専門職（1号ロ）（Highly Skilled Professional i-b）', category: 'N' },
  { value: '高度専門職（1号ハ）', label: '高度専門職（1号ハ）（Highly Skilled Professional i-c）', category: 'N' },
  { value: '興行', label: '興行（Entertainer）', category: 'O' },
  { value: '技能実習（1号）', label: '技能実習（1号）（Technical Intern Training i）', category: 'Y' },
  { value: '技能実習（2号）', label: '技能実習（2号）（Technical Intern Training ii）', category: 'Y' },
  { value: '技能実習（3号）', label: '技能実習（3号）（Technical Intern Training iii）', category: 'Y' },
  { value: '留学', label: '留学（Student）', category: 'P' },
  { value: '研修', label: '研修（Trainee）', category: 'Q' },
  { value: '家族滞在', label: '家族滞在（Dependent）', category: 'R' },
  { value: '特定活動（研究活動等家族）', label: '特定活動（研究活動等家族）', category: 'R' },
  { value: '日本人の配偶者等', label: '日本人の配偶者等（Spouse/Child of Japanese National）', category: 'T' },
  { value: '永住者の配偶者等', label: '永住者の配偶者等（Spouse/Child of Permanent Resident）', category: 'T' },
  { value: '定住者', label: '定住者（Long Term Resident）', category: 'T' },
  { value: 'その他', label: 'その他（Others）', category: 'U' },
];
