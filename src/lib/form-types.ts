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
export type Part2Type = 'N' | 'T' | 'R' | 'P' | 'none';
export const VISA_CATEGORY_PART2: Record<VisaFormCategory, Part2Type> = {
  N: 'N', L: 'N', I: 'N', V: 'N',
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
  // 扶養者（別記第三十号の二様式 B 項目21）
  // ══════════════════════════════════════════════════════════════════════════
  supporterFamilyNameEn: string;
  supporterGivenNameEn: string;
  supporterFamilyNameJa: string;
  supporterGivenNameJa: string;
  supporterDob: string;
  supporterAddress: string;
  supporterStatusOfResidence: string;
  supporterResidenceCard: string;
  supporterEmployer: string;        // 勤務先または通学先

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
  // 申請理由書（別紙）
  // ══════════════════════════════════════════════════════════════════════════
  applicationStatement: string;
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
  // Part 2 R
  supporterFamilyNameEn: '', supporterGivenNameEn: '',
  supporterFamilyNameJa: '', supporterGivenNameJa: '',
  supporterDob: '', supporterAddress: '', supporterStatusOfResidence: '',
  supporterResidenceCard: '', supporterEmployer: '',
  // Part 2 P
  schoolName: '', schoolType: '', schoolAddress: '', schoolPhone: '',
  enrollmentDate: '', expectedGraduationDate: '', courseOfStudy: '',
  annualTuition: '', fundingSource: '', fundingAmount: '',
  scholarshipName: '', scholarshipAmount: '', partTimeWorkPermit: '無',
  // フリーフィールド
  freeformPart2Notes: '',
  freeformOrgNotes: '',
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
  // 理由書
  applicationStatement: '',
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
