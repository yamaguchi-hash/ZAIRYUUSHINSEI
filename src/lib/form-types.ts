// ─── 在留申請書フォームデータ型定義 ───────────────────────────────────────────
// 法務省入管庁 各種様式に対応したフィールド定義

export interface FamilyMember {
  relationship: string;        // 続柄
  name: string;                // 氏名
  dateOfBirth: string;         // 生年月日
  nationality: string;         // 国籍
  placeOfEmployment: string;   // 勤務先・通学先
  residingTogether: boolean;   // 同居有無
  residenceCardNumber: string; // 在留カード番号
}

// ─── 申請書フォームデータ（全在留資格共通） ────────────────────────────────────
export interface ApplicationFormData {
  // メタ情報
  formType?: string;           // renewal | change | certification
  lastUpdated?: string;        // 最終更新日時

  // ══ 申請人等作成用 Part 1 ══════════════════════════════════════════════════
  // 1. 国籍・地域
  nationality: string;
  // 2. 生年月日
  dateOfBirth: string;
  // 3. 氏名
  familyNameEn: string;
  givenNameEn: string;
  familyNameJa: string;
  givenNameJa: string;
  // 4. 性別 / 5. 出生地 / 6. 配偶者の有無
  sex: string;                 // 男 / 女
  placeOfBirth: string;
  maritalStatus: string;       // 有 / 無
  // 7. 職業 / 8. 本国における居住地
  occupation: string;
  homeTownCity: string;
  // 9. 住居地
  addressInJapan: string;
  telephoneNo: string;
  cellularPhoneNo: string;
  // 10. パスポート番号・有効期限
  passportNumber: string;
  passportExpiry: string;
  // 11. 現在の在留資格・在留期間・満了日
  currentStatusOfResidence: string;
  currentPeriodOfStay: string;
  currentPeriodExpiry: string;
  // 12. 在留カード番号
  residenceCardNumber: string;
  // 13. 希望する在留資格・在留期間（変更申請時）
  desiredStatusOfResidence: string;
  desiredPeriodOfStay: string;
  // 14. 変更・更新の理由
  reasonForApplication: string;
  // 15. 犯罪記録
  criminalRecord: string;      // 有 / 無
  criminalRecordDetail: string;
  // 16. 在日親族及び同居者
  familyInJapan: FamilyMember[];

  // ══ 申請人等作成用 Part 2 ══════════════════════════════════════════════════
  // 技術・人文知識・国際業務 / 研究 / 高度専門職 / 介護 / 技能 等
  // 17. 勤務先
  employerName: string;
  employerBranchName: string;
  employerAddress: string;
  employerPhone: string;
  // 18. 最終学歴
  educationCountry: string;    // 日本 / 外国
  educationDegree: string;     // 博士 / 修士 / 学士 / 短大 / 専門学校 / 高校 / その他
  educationSchoolName: string;
  educationGraduationDate: string;
  // 19. 専攻・専門分野
  majorField: string;
  // 20. 業務処理技術者資格等 / 職務上の地位
  qualifications: string;
  position: string;
  // 業務内容の概要
  jobDescription: string;
  // 通算在職年数
  yearsOfService: string;
  // 賃金（月額・年額）
  monthlySalary: string;
  annualSalary: string;

  // ══ 所属機関等作成用 Part 1 ═══════════════════════════════════════════════
  // 1. 外国人の氏名・在留カード番号（申請人氏名と同じ）
  // 2. 契約の形態
  contractType: string;        // 雇用 / 委任 / 請負 / その他
  // 3. 所属機関情報
  orgName: string;
  orgCorporateNumber: string;  // 法人番号（13桁）
  orgBranchName: string;
  orgEmploymentInsuranceNo: string; // 雇用保険適用事業所番号
  orgBusinessType: string;
  orgAddress: string;
  orgPhone: string;
  orgCapital: string;          // 資本金
  orgAnnualSales: string;      // 年間売上高
  orgEmployeeCount: string;    // 職員数（全体）
  orgForeignEmployeeCount: string; // 職員数（外国人）

  // ══ 所属機関等作成用 Part 2 ═══════════════════════════════════════════════
  // 採用理由
  reasonForHiring: string;
  // 活動内容の詳細（派遣先）
  dispatchSiteName: string;
  dispatchSiteAddress: string;
  dispatchSitePhone: string;
  // 雇用契約期間・就労開始日
  contractStartDate: string;
  contractEndDate: string;
  workStartDate: string;
  // 給与形態（月給 / 年俸 / 日給 / 時給）
  salaryType: string;
  // 退職金制度
  severancePay: string;        // 有 / 無
  // 社会保険（健康保険・厚生年金）
  healthInsurance: string;     // 有 / 無
  welfarePension: string;      // 有 / 無
  // 雇用保険
  employmentInsurance: string; // 有 / 無

  // ══ 申請理由書（自由記載） ═════════════════════════════════════════════════
  applicationStatement: string;
}

export const EMPTY_FORM_DATA: ApplicationFormData = {
  formType: '',
  lastUpdated: '',
  nationality: '',
  dateOfBirth: '',
  familyNameEn: '',
  givenNameEn: '',
  familyNameJa: '',
  givenNameJa: '',
  sex: '',
  placeOfBirth: '',
  maritalStatus: '',
  occupation: '',
  homeTownCity: '',
  addressInJapan: '',
  telephoneNo: '',
  cellularPhoneNo: '',
  passportNumber: '',
  passportExpiry: '',
  currentStatusOfResidence: '',
  currentPeriodOfStay: '',
  currentPeriodExpiry: '',
  residenceCardNumber: '',
  desiredStatusOfResidence: '',
  desiredPeriodOfStay: '',
  reasonForApplication: '',
  criminalRecord: '無',
  criminalRecordDetail: '',
  familyInJapan: [],
  employerName: '',
  employerBranchName: '',
  employerAddress: '',
  employerPhone: '',
  educationCountry: '',
  educationDegree: '',
  educationSchoolName: '',
  educationGraduationDate: '',
  majorField: '',
  qualifications: '',
  position: '',
  jobDescription: '',
  yearsOfService: '',
  monthlySalary: '',
  annualSalary: '',
  contractType: '雇用',
  orgName: '',
  orgCorporateNumber: '',
  orgBranchName: '',
  orgEmploymentInsuranceNo: '',
  orgBusinessType: '',
  orgAddress: '',
  orgPhone: '',
  orgCapital: '',
  orgAnnualSales: '',
  orgEmployeeCount: '',
  orgForeignEmployeeCount: '',
  reasonForHiring: '',
  dispatchSiteName: '',
  dispatchSiteAddress: '',
  dispatchSitePhone: '',
  contractStartDate: '',
  contractEndDate: '',
  workStartDate: '',
  salaryType: '月給',
  severancePay: '有',
  healthInsurance: '有',
  welfarePension: '有',
  employmentInsurance: '有',
  applicationStatement: '',
};
