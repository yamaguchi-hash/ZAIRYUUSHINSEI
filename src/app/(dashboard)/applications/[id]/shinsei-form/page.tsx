import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { getApplicants } from "@/actions/applicants";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown, AlertCircle } from "lucide-react";
import { QuestionnaireDocxButton } from "@/components/applications/questionnaire-docx-button";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { ShinseiFormEditor } from "./shinsei-form-editor";
import type { ApplicationFormData } from "@/lib/form-types";
import { buildEffectiveFormData } from "@/lib/effective-form-data";

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

  // 扶養者選択ドロップダウン用の申請人一覧（この申請の申請人本人は除外）
  const allApplicants = await getApplicants();
  const supporterCandidates = allApplicants
    .filter((a) => a.id !== application.applicantId)
    .map((a) => ({
      id: a.id,
      familyNameEn: a.familyNameEn,
      givenNameEn: a.givenNameEn,
      nationality: a.nationality,
      dateOfBirth: a.dateOfBirth,
      residenceCardNumber: a.residenceCardNumber,
      currentVisaType: a.currentVisaType,
      currentVisaExpiry: a.currentVisaExpiry,
      japanAddress: a.japanAddress,
    }));

  // 取次者情報（固定値）
  const fixedAgentFields = {
    agentName:         '山口忠士',
    agentOrganization: '兵庫県行政書士会',
    agentAddress:      '〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B',
    agentPhone:        '090-2596-0128',
  };

  // 実効値（保存済みformData ＞ マスター由来 ＞ 空フォーム）を構築したうえで、
  // 取次者は常に固定値で上書きする。
  const initialForm: ApplicationFormData = {
    ...buildEffectiveFormData(application, applicant, organization),
    ...fixedAgentFields,
  };

  const visaLabel = VISA_TYPE_LABELS[application.visaType] ?? application.visaType;
  const appTypeLabel = APPLICATION_TYPE_LABELS[application.applicationType] ?? application.applicationType;

  // 理由書PDF表示条件: 家族滞在 かつ（認定 or 変更）
  const showRiyusho = application.visaType === "dependent"
    && (application.applicationType === "certification" || application.applicationType === "change");

  // 資格外活動許可申請書PDF表示条件: 資格外活動の入力があり、必要事項が入力されている場合
  // isYes()はshinsei-shared.tsxのyes()と同じ判定基準をこのファイル内で再現したもの
  // （(print)配下と(dashboard)配下をまたぐimportを避けるため、ロジックのみ複製する）
  const isYes = (v: string | null | undefined) =>
    !!v && (v === "有" || v.startsWith("有（") || v === "あり" || v.startsWith("あり（"));
  const isRtypeForm = initialForm.visaFormCategory === 'R';
  const isPtypeForm = initialForm.visaFormCategory === 'P';
  // 2つ目のボタンの文言: 家族滞在（R型）の場合のみ「扶養者用」、それ以外は「所属機関用」
  const secondButtonLabel = isRtypeForm ? "扶養者用PDFダウンロード" : "所属機関用PDFダウンロード";
  const showGaikatsu =
    (isYes(initialForm.gaikatsuNeeded) || (isRtypeForm && isYes(initialForm.partTimeWorkExistsR)) || isPtypeForm) &&
    !!(initialForm.gaikatsuActivityType || initialForm.gaikatsuCurrentActivity || initialForm.gaikatsuEmployerName);

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
          <Link
            href={`/print/${id}/shinsei-applicant`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" />
            申請人用PDFダウンロード
          </Link>
          <Link
            href={`/print/${id}/shinsei-org`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" />
            {secondButtonLabel}
          </Link>
          {showRiyusho && (
            <Link
              href={`/print/${id}/riyusho`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-300"
            >
              <FileDown className="w-4 h-4" />
              理由書PDF
            </Link>
          )}
          {showGaikatsu && (
            <Link
              href={`/print/${id}/gaikatsu`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-300"
            >
              <FileDown className="w-4 h-4" />
              資格外活動許可申請書PDF
            </Link>
          )}
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

      {/* 完了後は編集不可 */}
      {application.status === "completed" && (
        <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">申請が完了しています</p>
            <p className="text-amber-700">
              この申請案件は完了済みのため、申請書の内容は編集できません。
              申請人マスターの情報は更新されます（新在留カード番号など）。
            </p>
          </div>
        </div>
      )}

      <ShinseiFormEditor
        applicationId={id}
        initialForm={initialForm}
        applicationType={application.applicationType}
        userRole={userRole}
        isCompleted={application.status === "completed"}
        supporterCandidates={supporterCandidates}
        initialSupporterId={application.supporterId}
      />
    </div>
  );
}
