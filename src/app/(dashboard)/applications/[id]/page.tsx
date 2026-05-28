import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { notFound } from "next/navigation";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_TYPE_LABELS,
  STATUS_COLORS,
  VISA_TYPE_LABELS,
  formatDate,
  ROLE_LABELS,
} from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  AlertTriangle,
  User,
  Building2,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { WorkflowStepper } from "@/components/applications/workflow-stepper";
import { DocumentChecklist } from "@/components/applications/document-checklist";
import { DocumentSelector } from "@/components/applications/document-selector";
import { ConsistencyCheckPanel } from "@/components/applications/consistency-check-panel";
import { ApproveButton } from "@/components/applications/approve-button";
import { QuestionnairePanel } from "@/components/applications/questionnaire-panel";
import { getDocumentRequirements } from "@/actions/applications";
import { DeleteApplicationButton } from "./delete-application-button";
import { FileDown } from "lucide-react";

// 7ステップのワークフロー
const WORKFLOW_STEPS = [
  { key: "draft",                label: "①基本設定" },
  { key: "documents_requested",  label: "②書類リスト" },
  { key: "documents_collecting", label: "③書類収集" },
  { key: "ocr_processing",       label: "④申請書作成" },
  { key: "questionnaire_sent",   label: "⑤質問書聴取" },
  { key: "under_review",         label: "⑥申請書反映" },
  { key: "submitted",            label: "⑦署名・提出" },
];

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const userRole = (session?.user as any)?.role;
  const { id } = await params;

  let data;
  try {
    data = await getApplicationById(id);
  } catch {
    notFound();
  }

  const { application, applicant, organization, checklist, questionnaire } = data;
  const checkResult = application.consistencyCheckResult as any;

  // 書類マスター取得（ビザ種別・申請種別でフィルタ）
  const masterDocuments = await getDocumentRequirements(
    application.visaType,
    application.applicationType
  );
  const issues = checkResult?.issues ?? [];

  const currentStepIndex = WORKFLOW_STEPS.findIndex((s) => s.key === application.status);

  return (
    <div className="p-8 max-w-5xl">
      {/* Back + 削除ボタン */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link
            href="/applications"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            申請一覧
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium">{application.caseNumber}</span>
        </div>
        <DeleteApplicationButton
          applicationId={application.id}
          caseNumber={application.caseNumber ?? ""}
          applicantName={`${applicant.familyNameEn ?? ""} ${applicant.givenNameEn ?? ""}`.trim()}
        />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {applicant.familyNameEn} {applicant.givenNameEn}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[application.status] ?? "bg-gray-100 text-gray-700"}`}
            >
              {APPLICATION_STATUS_LABELS[application.status] ?? application.status}
            </span>
            <span className="text-sm text-gray-500">
              {VISA_TYPE_LABELS[application.visaType] ?? application.visaType}
            </span>
            <span className="text-sm text-gray-500">
              {APPLICATION_TYPE_LABELS[application.applicationType] ?? application.applicationType}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 申請書作成ボタン */}
          <Link
            href={`/applications/${application.id}/shinsei-form`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
            申請書を作成
          </Link>
          {/* PDF出力ボタン */}
          <Link
            href={`/print/${application.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileDown className="w-4 h-4" />
            書類一覧PDF
          </Link>
          {(userRole === "expert" || userRole === "admin") && !application.isApproved && (
            <ApproveButton applicationId={application.id} />
          )}
          {application.isApproved && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              承認済み（{formatDate(application.approvedAt)}）
            </div>
          )}
        </div>
      </div>

      {/* Workflow stepper */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>ワークフロー進捗（7ステップ）</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowStepper
            steps={WORKFLOW_STEPS}
            currentStep={application.status}
            applicationId={application.id}
            userRole={userRole}
            hasQuestionnaire={questionnaire.length > 0}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Applicant info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-4 h-4" />
              申請人情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">氏名（英）</dt>
                <dd className="font-medium">{applicant.familyNameEn} {applicant.givenNameEn}</dd>
              </div>
              {applicant.familyNameJa && (
                <div>
                  <dt className="text-gray-500">氏名（日）</dt>
                  <dd className="font-medium">{applicant.familyNameJa} {applicant.givenNameJa}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">国籍</dt>
                <dd>{applicant.nationality}</dd>
              </div>
              <div>
                <dt className="text-gray-500">生年月日</dt>
                <dd>{formatDate(applicant.dateOfBirth)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">パスポート番号</dt>
                <dd className="font-mono">{applicant.passportNumber ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">パスポート有効期限</dt>
                <dd>{formatDate(applicant.passportExpiry)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">在留カード番号</dt>
                <dd className="font-mono">{applicant.residenceCardNumber ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">現在の在留資格</dt>
                <dd>{applicant.currentVisaType ? VISA_TYPE_LABELS[applicant.currentVisaType] : "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Organization info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              所属機関情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            {organization ? (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500">法人名</dt>
                  <dd className="font-medium">{organization.nameJa}</dd>
                </div>
                {organization.nameEn && (
                  <div>
                    <dt className="text-gray-500">英語名</dt>
                    <dd>{organization.nameEn}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-500">法人番号</dt>
                  <dd className="font-mono">{organization.corporateNumber ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">カテゴリー</dt>
                  <dd>{organization.category ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">従業員数</dt>
                  <dd>{organization.employeeCount ? `${organization.employeeCount}名` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">所在地</dt>
                  <dd>{[organization.prefecture, organization.city, organization.addressLine].filter(Boolean).join(" ") || "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">所属機関未設定</p>
            )}
          </CardContent>
        </Card>

        {/* Application info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              申請案件情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">案件番号</dt>
                <dd className="font-mono text-xs">{application.caseNumber}</dd>
              </div>
              <div>
                <dt className="text-gray-500">作成日</dt>
                <dd>{formatDate(application.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">最終更新</dt>
                <dd>{formatDate(application.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">承認状況</dt>
                <dd>
                  {application.isApproved ? (
                    <span className="text-green-600 font-medium">承認済み</span>
                  ) : (
                    <span className="text-gray-500">未承認</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">整合性チェック</dt>
                <dd>
                  {checkResult ? (
                    issues.length === 0 ? (
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> 問題なし
                      </span>
                    ) : (
                      <span className="text-red-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {issues.length}件の問題
                      </span>
                    )
                  ) : (
                    <span className="text-gray-400">未チェック</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">質問書</dt>
                <dd>{questionnaire.length}件</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Consistency check panel */}
      {issues.length > 0 && (
        <div className="mb-6">
          <ConsistencyCheckPanel issues={issues} applicationId={application.id} />
        </div>
      )}

      {/* ⑤ 質問書パネル（ステップ5以降に表示） */}
      {(application.status === "questionnaire_sent" || application.status === "under_review" || application.status === "submitted") && (
        <div className="mb-6">
          <QuestionnairePanel
            questions={questionnaire.map((q) => ({
              id: q.id,
              fieldKey: q.fieldKey,
              questionJa: q.questionJa,
              answer: q.answer,
              answeredAt: q.answeredAt,
              isRequired: q.isRequired,
              answerType: q.answerType,
            }))}
            applicationId={application.id}
            userRole={userRole}
          />
        </div>
      )}

      {/* Document checklist + selector */}
      <div>
        <DocumentChecklist
          checklist={checklist.map((c) => ({
            id: c.id,
            documentName: c.documentName,
            isRequiredByExpert: c.isRequiredByExpert,
            status: c.status,
            fileUrl: c.fileUrl,
            fileName: c.fileName,
            expertNotes: c.expertNotes,
            ocrExtractedData: (c.ocrExtractedData ?? null) as Record<string, any> | null,
          }))}
          applicationId={application.id}
          userRole={userRole}
          applicationStatus={application.status}
        />
        <DocumentSelector
          applicationId={application.id}
          masterDocuments={masterDocuments}
          checklist={checklist.map((c) => ({
            id: c.id,
            documentName: c.documentName,
            documentRequirementId: (c as any).documentRequirementId ?? null,
            isRequiredByExpert: c.isRequiredByExpert,
            status: c.status,
          }))}
        />
      </div>
    </div>
  );
}
