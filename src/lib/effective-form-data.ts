import type { ApplicationFormData } from "./form-types";
import { EMPTY_FORM_DATA } from "./form-types";
import { mapOrganizationToFormData, type OrgMasterRecord } from "./org-master-mapping";
import { VISA_TYPE_LABELS } from "./utils";

/** 申請人マスター（applicantMaster）の行のうち、本関数が参照するフィールドのみの構造的型 */
export interface ApplicantMasterLike {
  nationality?: string | null;
  dateOfBirth?: string | null;
  familyNameEn?: string | null;
  givenNameEn?: string | null;
  familyNameJa?: string | null;
  givenNameJa?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  postalCode?: string | null;
  japanPrefecture?: string | null;
  japanCity?: string | null;
  japanAddressLine?: string | null;
  japanAddress?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  currentVisaType?: string | null;
  currentVisaExpiry?: string | null;
  residenceCardNumber?: string | null;
  placeOfBirth?: string | null;
  homeCountryAddress?: string | null;
  /** 申請書保存時に同期される最終学歴（educationCountry 等のキーを持つオブジェクト） */
  educationHistory?: unknown;
  /** 申請書保存時に同期される職歴（WorkHistoryEntry[] 相当の配列） */
  workHistory?: unknown;
}

/** applications の行のうち、本関数が参照するフィールドのみの構造的型 */
export interface ApplicationMasterLike {
  applicationType: string;
  visaType: string;
  formData?: unknown;
}

/** applicationType（DBの値）→ ApplicationFormType（form-types.tsの値）マッピング。永住許可も区別する。 */
function toApplicationFormType(t: string): ApplicationFormData["applicationFormType"] {
  if (t === "coe" || t === "certification") return "coe";
  if (t === "change") return "change";
  if (t === "extension" || t === "renewal") return "extension";
  if (t === "permanent" || t === "permanent_residence") return "permanent";
  return "extension";
}

/**
 * 申請書フォームの「実効値」を構築する。
 * 優先順位: 保存済みformData ＞ マスター（申請人・所属機関）由来の値 ＞ EMPTY_FORM_DATA。
 * 「8. 日本における連絡先」「現在の在留資格・期限・カード番号」「出生地・本国住所・婚姻の有無」
 * 「最終学歴・専攻分野・職歴」は savedForm の有無に関わらず、マスターに値があれば
 * 常にその最新値で上書きする（shinsei-form/page.tsx の既存仕様を踏襲）。
 */
export function buildEffectiveFormData(
  application: ApplicationMasterLike,
  applicant: ApplicantMasterLike,
  organization: OrgMasterRecord | null | undefined,
): ApplicationFormData {
  const savedForm = (application.formData ?? null) as Partial<ApplicationFormData> | null;

  const masterData: Partial<ApplicationFormData> = {
    applicationFormType:        toApplicationFormType(application.applicationType),
    nationality:                applicant.nationality ?? '',
    dateOfBirth:                applicant.dateOfBirth ?? '',
    familyNameEn:               applicant.familyNameEn ?? '',
    givenNameEn:                applicant.givenNameEn ?? '',
    familyNameJa:               applicant.familyNameJa ?? '',
    givenNameJa:                applicant.givenNameJa ?? '',
    sex:                        applicant.gender === 'M' ? '男' : applicant.gender === 'F' ? '女' : '',
    maritalStatus:              applicant.maritalStatus ?? '',
    placeOfBirth:               applicant.placeOfBirth ?? '',
    homeTownCity:               applicant.homeCountryAddress ?? '',
    postalCodeInJapan:          applicant.postalCode ?? '',
    prefectureInJapan:          applicant.japanPrefecture ?? '',
    cityInJapan:                applicant.japanCity ?? '',
    addressLineInJapan:         applicant.japanAddressLine ?? (
      !applicant.japanPrefecture ? (applicant.japanAddress ?? '') : ''
    ),
    addressInJapan:             applicant.japanAddress ?? '',
    telephoneNo:                applicant.phone ?? '',
    cellularPhoneNo:            applicant.mobilePhone ?? '',
    passportNumber:             applicant.passportNumber ?? '',
    passportExpiry:             applicant.passportExpiry ?? '',
    currentStatusOfResidence:   VISA_TYPE_LABELS[applicant.currentVisaType ?? ''] ?? applicant.currentVisaType ?? '',
    currentPeriodExpiry:        applicant.currentVisaExpiry ?? '',
    residenceCardNumber:        applicant.residenceCardNumber ?? '',
    desiredStatusOfResidence:   VISA_TYPE_LABELS[application.visaType] ?? application.visaType ?? '',
    // 所属機関マスター（全申請書共通の企業基本情報のみを自動反映）
    ...mapOrganizationToFormData(organization),
  };

  // 日本における連絡先（申請人マスターから常に取得）
  const masterContactFields = {
    postalCodeInJapan:  applicant.postalCode      ?? '',
    prefectureInJapan:  applicant.japanPrefecture ?? '',
    cityInJapan:        applicant.japanCity        ?? '',
    addressLineInJapan: applicant.japanAddressLine ?? (
      !applicant.japanPrefecture ? (applicant.japanAddress ?? '') : ''
    ),
    addressInJapan:  applicant.japanAddress ?? '',
    telephoneNo:     applicant.phone        ?? '',
    cellularPhoneNo: applicant.mobilePhone ?? '',
  };

  // 現在の在留資格・在留期限・在留カード番号（申請人マスターから常に取得）
  const toJaVisaType = (v: string | null | undefined): string => {
    if (!v) return '';
    return VISA_TYPE_LABELS[v] ?? v;
  };
  const masterStatusFields = {
    currentStatusOfResidence: toJaVisaType(applicant.currentVisaType),
    currentPeriodExpiry:      applicant.currentVisaExpiry  ?? '',
    residenceCardNumber:      applicant.residenceCardNumber ?? '',
  };

  // 出生地・本国における居住地（マスターに値がある場合は常にマスターの最新値を使用する。
  // マスター未登録の場合のみ、保存済みフォームの値を維持する）
  const masterProfileFallbacks = {
    ...(applicant.placeOfBirth ? { placeOfBirth: applicant.placeOfBirth } : {}),
    ...(applicant.homeCountryAddress ? { homeTownCity: applicant.homeCountryAddress } : {}),
    // 婚姻の有無（配偶者の有無）: マスターに値がある場合は常にマスターの最新値を反映する
    ...(applicant.maritalStatus ? { maritalStatus: applicant.maritalStatus } : {}),
  };

  // 学歴・職歴（顧客名簿（個人）に値がある場合は常にマスターの最新値を使用する。
  // マスター未登録の項目のみ、保存済みフォームの値を維持する＝マスターの更新を
  // 常に申請書へ反映する）
  const EDUCATION_KEYS = [
    "educationCountry", "educationDegree", "educationSchoolName", "educationGraduationDate",
    "majorCategory", "majorCategoryOther", "itQualificationExists", "itQualificationName",
  ] as const;
  const masterEdu = (applicant.educationHistory ?? null) as Record<string, string> | null;
  const educationOverrides: Partial<ApplicationFormData> = {};
  if (masterEdu && typeof masterEdu === "object" && !Array.isArray(masterEdu)) {
    for (const k of EDUCATION_KEYS) {
      if (typeof masterEdu[k] === "string" && masterEdu[k]) {
        (educationOverrides as Record<string, string>)[k] = masterEdu[k];
      }
    }
  }
  const masterWork = Array.isArray(applicant.workHistory) ? applicant.workHistory : null;
  const workHistoryOverride =
    masterWork && masterWork.length > 0
      ? { workHistory: masterWork as ApplicationFormData["workHistory"] }
      : {};

  return {
    ...EMPTY_FORM_DATA,
    ...(savedForm ?? masterData),
    ...masterContactFields,
    ...masterStatusFields,
    ...masterProfileFallbacks,
    ...educationOverrides,
    ...workHistoryOverride,
  } as ApplicationFormData;
}
