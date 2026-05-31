import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown } from "lucide-react";
import { ExcelDownloadButton } from "@/components/applications/excel-download-button";
import { QuestionnaireDocxButton } from "@/components/applications/questionnaire-docx-button";
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
    sex:                        applicant.gender === 'M' ? '男' : applicant.gender === 'F' ? '女' : '',
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
    currentStatusOfResidence:   VISA_TYPE_LABELS[applicant.currentVisaType ?? ''] ?? applicant.currentVisaType ?? '',
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

  // 在留資格の英語キー → 日本語ラベル変換
  const toJaVisaType = (v: string | null | undefined): string => {
    if (!v) return '';
    return VISA_TYPE_LABELS[v] ?? v;  // キーが一致すれば日本語、なければ値をそのまま
  };

  // 現在の在留資格・在留期限・在留カード番号（申請人マスターから常に取得）
  const masterStatusFields = {
    currentStatusOfResidence: toJaVisaType(applicant.currentVisaType),
    currentPeriodExpiry:      applicant.currentVisaExpiry  ?? '',
    residenceCardNumber:      applicant.residenceCardNumber ?? '',
  };

  // 取次者情報（固定値）
  const fixedAgentFields = {
    agentName:         '山口忠士',
    agentOrganization: '兵庫県行政書士会',
    agentAddress:      '〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B',
    agentPhone:        '090-2596-0128',
  };

  // EMPTY_FORM_DATA を基底として savedForm（または masterData）を上書きマージしたうえで、
  // 「8. 日本における連絡先」「現在の在留資格」「取次者」は常にマスター/固定値で上書きする。
  const initialForm: ApplicationFormData = {
    ...EMPTY_FORM_DATA,
    ...(savedForm ?? masterData),
    ...masterContactFields,   // ← 連絡先は savedForm に関わらずマスターを使用
    ...masterStatusFields,    // ← 在留資格・期限・カード番号は savedForm に関わらずマスターを使用
    ...fixedAgentFields,      // ← 取次者は常に固定値
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <QuestionnaireDocxButton applicationId={id} />
          <ExcelDownloadButton applicationId={id} />
          <Link
            href={`/print/${id}/shinsei`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-300"
          >
            <FileDown className="w-4 h-4" />
            申請書PDF出力
          </Link>
        </div>
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
