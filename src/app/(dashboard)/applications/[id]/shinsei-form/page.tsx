import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { ShinseiFormEditor } from "./shinsei-form-editor";
import type { ApplicationFormData } from "@/lib/form-types";
import { EMPTY_FORM_DATA } from "@/lib/form-types";

export default async function ShinseiFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userRole = (session?.user as any)?.role;

  let data;
  try { data = await getApplicationById(id); } catch { notFound(); }

  const { application, applicant, organization } = data;

  // 既存のformDataがあれば使い、なければ空フォームをベースに自動埋め
  const savedForm = (application.formData ?? null) as Partial<ApplicationFormData> | null;

  // applicationType（DBの値）→ ApplicationFormType（form-types.tsの値）マッピング
  const toFormType = (t: string): import("@/lib/form-types").ApplicationFormType => {
    if (t === "coe" || t === "certification") return "coe";
    if (t === "change") return "change";
    if (t === "extension" || t === "renewal") return "extension";
    if (t === "permanent" || t === "permanent_residence") return "permanent";
    return "extension";
  };

  // マスターデータからの初期値（savedForm がない場合に使用）
  const masterData: Partial<ApplicationFormData> = {
    applicationFormType:        toFormType(application.applicationType),
    nationality:                applicant.nationality ?? '',
    dateOfBirth:                applicant.dateOfBirth ?? '',
    familyNameEn:               applicant.familyNameEn ?? '',
    givenNameEn:                applicant.givenNameEn ?? '',
    familyNameJa:               applicant.familyNameJa ?? '',
    givenNameJa:                applicant.givenNameJa ?? '',
    sex:                        applicant.gender === 'M' ? '男（Male）' : applicant.gender === 'F' ? '女（Female）' : '',
    postalCodeInJapan:          (applicant as any).postalCode ?? '',
    prefectureInJapan:          (applicant as any).japanPrefecture ?? '',
    cityInJapan:                (applicant as any).japanCity ?? '',
    addressLineInJapan:         (applicant as any).japanAddressLine ?? (
      !(applicant as any).japanPrefecture ? (applicant.japanAddress ?? '') : ''
    ),
    addressInJapan:             applicant.japanAddress ?? '',
    telephoneNo:                applicant.phone ?? '',
    passportNumber:             applicant.passportNumber ?? '',
    passportExpiry:             applicant.passportExpiry ?? '',
    currentStatusOfResidence:   applicant.currentVisaType ?? '',
    currentPeriodExpiry:        applicant.currentVisaExpiry ?? '',
    residenceCardNumber:        applicant.residenceCardNumber ?? '',
    desiredStatusOfResidence:   application.visaType ?? '',
    employerName:               organization?.nameJa ?? '',
    employerAddress:            [organization?.prefecture, organization?.city, organization?.addressLine].filter(Boolean).join(''),
    employerPhone:              organization?.phone ?? '',
    orgName:                    organization?.nameJa ?? '',
    orgCorporateNumber:         organization?.corporateNumber ?? '',
    orgAddress:                 [organization?.prefecture, organization?.city, organization?.addressLine].filter(Boolean).join(''),
    orgPhone:                   organization?.phone ?? '',
    orgCapital:                 organization?.capital ? String(organization.capital) : '',
    orgEmployeeCount:           organization?.employeeCount ? String(organization.employeeCount) : '',
  };

  // 8. 日本における連絡先（申請人マスターから常に取得）
  const masterContactFields = {
    postalCodeInJapan:  (applicant as any).postalCode      ?? '',
    prefectureInJapan:  (applicant as any).japanPrefecture ?? '',
    cityInJapan:        (applicant as any).japanCity        ?? '',
    addressLineInJapan: (applicant as any).japanAddressLine ?? (
      !(applicant as any).japanPrefecture ? (applicant.japanAddress ?? '') : ''
    ),
    addressInJapan: applicant.japanAddress ?? '',
    telephoneNo:    applicant.phone        ?? '',
  };

  // 現在の在留資格・在留期限・在留カード番号（申請人マスターから常に取得）
  const masterStatusFields = {
    currentStatusOfResidence: applicant.currentVisaType    ?? '',
    currentPeriodExpiry:      applicant.currentVisaExpiry  ?? '',
    residenceCardNumber:      applicant.residenceCardNumber ?? '',
  };

  // EMPTY_FORM_DATA を基底として savedForm（または masterData）を上書きマージしたうえで、
  // 「8. 日本における連絡先」と「現在の在留資格」は常にマスターの最新値で上書きする。
  const initialForm: ApplicationFormData = {
    ...EMPTY_FORM_DATA,
    ...(savedForm ?? masterData),
    ...masterContactFields,   // ← 連絡先は savedForm に関わらずマスターを使用
    ...masterStatusFields,    // ← 在留資格・期限・カード番号は savedForm に関わらずマスターを使用
  } as ApplicationFormData;

  const visaLabel = VISA_TYPE_LABELS[application.visaType] ?? application.visaType;
  const appTypeLabel = APPLICATION_TYPE_LABELS[application.applicationType] ?? application.applicationType;

  return (
    <div className="p-6 max-w-5xl">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href={`/applications/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" />
            申請案件に戻る
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium">申請書作成</span>
        </div>
        <Link
          href={`/print/${id}/shinsei`}
          target="_blank"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <FileDown className="w-4 h-4" />
          申請書を印刷・PDF出力
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">申請書作成</h1>
        <p className="text-sm text-gray-500 mt-1">
          {applicant.familyNameEn} {applicant.givenNameEn}　|　{visaLabel}　|　{appTypeLabel}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          法務省入管庁の様式に基づき、既存データを自動入力しています。不足項目を追記してください。
        </p>
      </div>

      <ShinseiFormEditor
        applicationId={id}
        initialForm={initialForm}
        applicationType={application.applicationType}
        userRole={userRole}
      />
    </div>
  );
}
