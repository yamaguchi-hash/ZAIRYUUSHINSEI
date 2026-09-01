import { auth } from "@/lib/auth";
import { getApplicationById, syncMasterDocumentsToChecklist, syncOrgMasterDocumentsToChecklist, getAvailableMasterDocumentsForApplication, type MasterFileOption } from "@/actions/applications";
import { notFound, redirect } from "next/navigation";
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
  User,
  Building2,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { WorkflowStepper } from "@/components/applications/workflow-stepper";
import { DocumentChecklist } from "@/components/applications/document-checklist";
import { DocumentSelector } from "@/components/applications/document-selector";
import { ChecklistTemplatePanel } from "@/components/applications/checklist-template-panel";
import { DocumentPrintButtons } from "@/components/applications/document-print-buttons";
import { ApproveButton } from "@/components/applications/approve-button";
import { QuestionnairePanel } from "@/components/applications/questionnaire-panel";
import { getDocumentRequirements } from "@/actions/applications";
import { listDocumentTemplates } from "@/actions/document-master";
import { DeleteApplicationButton } from "./delete-application-button";
import { FileDown, FolderArchive, Zap } from "lucide-react";
import { MergePdfButton } from "@/components/applications/merge-pdf-button";
import { QuestionnaireDocxButton } from "@/components/applications/questionnaire-docx-button";
import { RasensXmlPanel } from "@/components/applications/rasens-xml-panel";
import { SubmissionInfoPanel } from "@/components/applications/submission-info-panel";
import { PermitResultPanel } from "@/components/applications/permit-result-panel";
import { SignedDocumentsPanel } from "@/components/applications/signed-documents-panel";
import { CaseNotesPanel } from "@/components/applications/case-notes-panel";
import { ConsultationLogsPanel } from "@/components/applications/consultation-logs-panel";
import { DispatchRecordsPanel } from "@/components/applications/dispatch-records-panel";
import { LedgerInfoPanel } from "@/components/applications/ledger-info-panel";
import { GijinkokuRenewalChecklist } from "@/components/checklist/gijinkoku-renewal-checklist";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { NoufushoPanel } from "@/components/applications/noufusho-panel";
import { AzukariPanel } from "@/components/applications/azukari-panel";
import { db, applicantDocuments, applicationAttachments, applicantMaster } from "@/lib/db";
import { KazokuTairyuCoeChecklist } from "@/components/checklist/kazoku-tairyu-coe-checklist";
import { eq, desc } from "drizzle-orm";
import { AttachmentUploadPanel } from "@/components/applications/attachment-upload-panel";
import { buildEffectiveFormData } from "@/lib/effective-form-data";
import { computeInterviewQuestions } from "@/lib/interview-diff";
import { toFormType } from "@/lib/questionnaire-questions";

// 9ステップのワークフロー
const WORKFLOW_STEPS = [
  { key: "draft",                label: "①基本設定" },
  { key: "documents_requested",  label: "②書類リスト" },
  { key: "documents_collecting", label: "③書類収集" },
  { key: "ocr_processing",       label: "④申請書作成" },
  { key: "questionnaire_sent",   label: "⑤質問書聴取" },
  { key: "under_review",         label: "⑥申請書反映" },
  { key: "submitted",            label: "⑦署名・提出" },
  { key: "applying",             label: "⑧申請中" },
  { key: "completed",            label: "⑨許可・完了" },
];

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // auth() は JWT 検証失敗・期限切れ等で throw することがある
  // try-catch でラップして 500 ではなく適切なレスポンスにする
  let session;
  try {
    session = await auth();
  } catch (authErr) {
    console.error("[ApplicationDetailPage] auth() failed:", authErr);
    redirect("/login");
  }
  const userRole = (session?.user as any)?.role;
  const { id } = await params;

  try {
    await syncMasterDocumentsToChecklist(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] syncMasterDocumentsToChecklist failed:", e);
    // マスター連携に失敗してもページ表示は継続する
  }

  try {
    await syncOrgMasterDocumentsToChecklist(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] syncOrgMasterDocumentsToChecklist failed:", e);
    // マスター連携に失敗してもページ表示は継続する
  }

  let data;
  try {
    data = await getApplicationById(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] getApplicationById failed:", e);
    notFound();
  }

  // data が取れなかった場合は notFound() が throw するので、ここには到達しない
  if (!data) notFound();

  const { application, applicant, organization, checklist } = data;

  // 扶養者（家族滞在等のR型のみ使用）。氏名の自動反映にのみ使用する。
  const supporter = application.supporterId
    ? await db
        .select({
          familyNameJa: applicantMaster.familyNameJa,
          givenNameJa: applicantMaster.givenNameJa,
          familyNameEn: applicantMaster.familyNameEn,
          givenNameEn: applicantMaster.givenNameEn,
        })
        .from(applicantMaster)
        .where(eq(applicantMaster.id, application.supporterId))
        .limit(1)
        .then((r) => r[0] ?? null)
    : null;

  // チェックリストの「マスターから選択」用。既存のmasterDocuments（書類要件マスターの
  // カタログ）とは別概念のため、availableMasterFilesという別名で区別する。
  let availableMasterFiles: { applicant: MasterFileOption[]; organization: MasterFileOption[]; supporter: MasterFileOption[] } = { applicant: [], organization: [], supporter: [] };
  try {
    availableMasterFiles = await getAvailableMasterDocumentsForApplication(application.id);
  } catch (e) {
    console.error("[ApplicationDetailPage] getAvailableMasterDocumentsForApplication failed:", e);
    // マスター書類一覧の取得に失敗してもページ表示は継続する（チェックリストのマスター選択UIが空になるのみ）
  }

  const effectiveForm = buildEffectiveFormData(application, applicant, organization);
  const interviewFormType = toFormType(effectiveForm.applicationFormType ?? application.applicationType);
  const interviewCategory = effectiveForm.visaFormCategory ?? "N";
  const interviewExcludedIds = new Set((application.interviewExcludedFields ?? []) as string[]);
  const interviewQuestions = computeInterviewQuestions(
    effectiveForm,
    interviewFormType,
    interviewCategory,
    checklist,
    interviewExcludedIds
  );

  // 書類マスター取得（ビザ種別・申請種別でフィルタ）
  // masterDocuments: Date オブジェクトを持つフィールドを除外して RSC シリアライズを安全にする
  type SafeMasterDoc = {
    id: string;
    documentName: string;
    documentNameEn: string | null;
    description: string | null;
    isAlwaysRequired: boolean;
    conditions: Record<string, unknown> | null;
    sortOrder: number;
    visaType: string;
    applicationType: string;
    /** 必要書類マスターで設定した担当・原本/写し（セレクタでの参考表示用） */
    preparedBy: string | null;
    originalOrCopy: string | null;
  };
  let masterDocuments: SafeMasterDoc[] = [];
  try {
    const rawMasterDocuments = await getDocumentRequirements(
      application.visaType,
      application.applicationType
    );
    // Date オブジェクト（createdAt・updatedAt 等）を除外
    masterDocuments = rawMasterDocuments.map((r) => ({
      id:               r.id,
      visaType:         r.visaType,
      applicationType:  r.applicationType,
      documentName:     r.documentName,
      documentNameEn:   r.documentNameEn ?? null,
      description:      r.description ?? null,
      isAlwaysRequired: r.isAlwaysRequired,
      conditions:       (r.conditions ?? null) as Record<string, unknown> | null,
      sortOrder:        r.sortOrder,
      preparedBy:       (r as any).preparedBy ?? null,
      originalOrCopy:   (r as any).originalOrCopy ?? null,
    }));
  } catch (e) {
    console.error("[ApplicationDetailPage] getDocumentRequirements failed:", e);
  }

  // この案件の在留資格・申請種別に合わせて保存されている必要書類テンプレート
  let checklistTemplates: { id: string; name: string; note: string | null; itemCount: number }[] = [];
  try {
    const tplResult = await listDocumentTemplates(application.visaType, application.applicationType);
    if (tplResult.success && tplResult.rows) {
      checklistTemplates = tplResult.rows.map((r) => ({
        id: r.id,
        name: r.name,
        note: r.note,
        itemCount: r.itemCount,
      }));
    }
  } catch (e) {
    console.error("[ApplicationDetailPage] listDocumentTemplates failed:", e);
  }

  // 申請人マスターのアップロード書類を取得（預証用）
  let azukariImages: { residenceCardFrontUrl?: string; residenceCardBackUrl?: string; passportUrl?: string } = {};
  try {
    const appDocs = await db
      .select({ documentType: applicantDocuments.documentType, fileUrl: applicantDocuments.fileUrl })
      .from(applicantDocuments)
      .where(eq(applicantDocuments.applicantId, application.applicantId));
    for (const doc of appDocs) {
      if (doc.documentType === "residence_card_front") azukariImages.residenceCardFrontUrl = doc.fileUrl;
      if (doc.documentType === "residence_card_back") azukariImages.residenceCardBackUrl = doc.fileUrl;
      if (doc.documentType === "passport_data_page" || doc.documentType === "passport_front") {
        azukariImages.passportUrl = doc.fileUrl;
      }
    }
  } catch (e) {
    console.error("[ApplicationDetailPage] applicantDocuments fetch failed:", e);
  }

  // 入管提出用添付書類を取得
  let attachmentsList: {
    id: string; documentType: string; documentLabel: string | null;
    fileUrl: string; fileName: string; fileSize: number | null;
    mimeType: string | null; uploadedAt: string;
  }[] = [];
  try {
    const rows = await db.select().from(applicationAttachments)
      .where(eq(applicationAttachments.applicationId, application.id))
      .orderBy(desc(applicationAttachments.uploadedAt));
    attachmentsList = rows.map(r => ({
      id: r.id,
      documentType: r.documentType,
      documentLabel: r.documentLabel,
      fileUrl: r.fileUrl,
      fileName: r.fileName,
      fileSize: r.fileSize,
      mimeType: r.mimeType,
      uploadedAt: r.uploadedAt.toISOString(),
    }));
  } catch (e) {
    console.error("[ApplicationDetailPage] applicationAttachments fetch failed:", e);
  }

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
      <div className="mb-6">
        {/* 申請人名・ステータス */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {applicant.familyNameEn} {applicant.givenNameEn}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
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
        </div>

        {/* ── ボタン群（均一サイズ h-9） ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ── 申請書類 ── */}
          <Link
            href={`/applications/${application.id}/shinsei-form`}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            申請書を作成
          </Link>
          <QuestionnaireDocxButton applicationId={application.id} />
          <MergePdfButton applicationId={application.id} />

          {/* 区切り */}
          <div className="h-6 w-px bg-gray-200" />

          {/* ── 出力・連携 ── */}
          <Link
            href={`/print/${application.id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <FileDown className="w-4 h-4" />
            書類一覧PDF
          </Link>
          <Link
            href={`/applications/${application.id}/rasens-transfer`}
            title="RASENSへのコピー＆ペースト転記データシートを表示"
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Zap className="w-4 h-4" />
            RASENS転記シート
          </Link>

          {/* 区切り */}
          <div className="h-6 w-px bg-gray-200" />

          {/* ── 承認 ── */}
          {(userRole === "expert" || userRole === "admin") && !application.isApproved && (
            <ApproveButton applicationId={application.id} />
          )}
          {application.isApproved && (
            <div className="inline-flex items-center gap-1.5 h-9 px-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium whitespace-nowrap">
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
            hasQuestionnaire={interviewQuestions.length > 0}
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
                  <dt className="text-gray-500">所在地（都道府県）</dt>
                  <dd>{organization.prefecture || "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">所在地（市区町村）</dt>
                  <dd>{organization.city || "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">所在地（番地以降）</dt>
                  <dd>{organization.addressLine || "—"}</dd>
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
                <dt className="text-gray-500">質問書</dt>
                <dd>{interviewQuestions.length}件</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* 1. 事件メモ（全ステータスで表示） */}
      <CollapsibleSection
        title="事件メモ"
        defaultOpen={true}
        accentClass="bg-blue-500"
      >
        <CaseNotesPanel applicationId={application.id} />
      </CollapsibleSection>

      {/* 1.5 打合せ・相談履歴（面談/電話/メール/LINE のタイムライン） */}
      <CollapsibleSection
        title="打合せ・相談履歴"
        defaultOpen={false}
        accentClass="bg-blue-500"
      >
        <ConsultationLogsPanel applicationId={application.id} />
      </CollapsibleSection>

      {/* 1.6 郵送・発送記録（追跡番号→日本郵便追跡リンク） */}
      <CollapsibleSection
        title="郵送・発送記録"
        defaultOpen={false}
        accentClass="bg-teal-500"
      >
        <DispatchRecordsPanel applicationId={application.id} />
      </CollapsibleSection>

      {/* 1.7 事件簿情報（行政書士法第11条: 受任日・報酬額・完結日） */}
      <CollapsibleSection
        title="事件簿情報"
        defaultOpen={false}
        accentClass="bg-indigo-500"
      >
        <LedgerInfoPanel applicationId={application.id} />
      </CollapsibleSection>

      {/* 1.75 必要書類チェックリスト（技人国・更新のみ。案件情報を自動反映） */}
      {application.visaType === "engineer_humanities" && (
        <CollapsibleSection
          title="必要書類チェックリスト（技人国・在留期間更新）"
          defaultOpen={false}
          accentClass="bg-blue-500"
        >
          <GijinkokuRenewalChecklist
            defaultCaseName={application.caseNumber ?? ""}
            defaultApplicantName={
              (`${applicant.familyNameJa ?? ""} ${applicant.givenNameJa ?? ""}`.trim()) ||
              (`${applicant.familyNameEn ?? ""} ${applicant.givenNameEn ?? ""}`.trim())
            }
            defaultOrganizationName={organization?.nameJa ?? ""}
          />
        </CollapsibleSection>
      )}

      {/* 1.76 必要書類チェックリスト（家族滞在・COEのみ。案件情報を自動反映） */}
      {application.visaType === "dependent" && application.applicationType === "certification" && (
        <CollapsibleSection
          title="必要書類チェックリスト（家族滞在・在留資格認定証明書交付申請）"
          defaultOpen={false}
          accentClass="bg-rose-500"
        >
          <KazokuTairyuCoeChecklist
            defaultCaseName={application.caseNumber ?? ""}
            defaultApplicantName={
              (`${applicant.familyNameJa ?? ""} ${applicant.givenNameJa ?? ""}`.trim()) ||
              (`${applicant.familyNameEn ?? ""} ${applicant.givenNameEn ?? ""}`.trim())
            }
            defaultSupporterName={
              supporter
                ? ((`${supporter.familyNameJa ?? ""} ${supporter.givenNameJa ?? ""}`.trim()) ||
                   (`${supporter.familyNameEn ?? ""} ${supporter.givenNameEn ?? ""}`.trim()))
                : ""
            }
          />
        </CollapsibleSection>
      )}

      {/* 1.8 提出書類控え・預かり資料（ドラッグ&ドロップでBlob保管） */}
      <CollapsibleSection
        title="提出書類控え・預かり資料"
        defaultOpen={false}
        accentClass="bg-cyan-500"
      >
        <p className="text-xs text-gray-500 mb-3 px-1">
          入管等へ提出した書類の控えや、依頼者からお預かりした資料（PDF・画像）をドラッグ＆ドロップで保管します。
        </p>
        <AttachmentUploadPanel
          applicationId={application.id}
          initialAttachments={attachmentsList}
          sections={["case_file"]}
          showHeader={false}
        />
      </CollapsibleSection>

      {/* 2. 必要書類チェックリスト（申請書作成用添付書類のアップロードを統合） */}
      <CollapsibleSection
        title="必要書類チェックリスト"
        badge={checklist.length > 0 ? `${checklist.length}件` : undefined}
        defaultOpen={true}
        accentClass="bg-blue-500"
      >
        <DocumentChecklist
          availableMasterFiles={availableMasterFiles}
          checklist={checklist.map((c) => ({
            id: c.id,
            documentName: c.documentName,
            isRequiredByExpert: c.isRequiredByExpert,
            status: c.status,
            expertNotes: c.expertNotes,
            preparedBy: (c as any).preparedBy ?? null,
            masterOriginalOrCopy: (c as any).masterOriginalOrCopy ?? null,
            ocrExtractedData: c.ocrExtractedData as Record<string, any> | null,
            masterDescription: c.masterDescription,
            descriptionOverride: (c as any).descriptionOverride ?? null,
            documentRequirementId: c.documentRequirementId,
            masterSortOrder: c.masterSortOrder,
            createdAt: c.createdAt,
            fileUrl: c.fileUrl,
            fileName: c.fileName,
            fileSize: c.fileSize,
            mimeType: c.mimeType,
            additionalFiles: c.additionalFiles ?? null,
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
            documentRequirementId: c.documentRequirementId,
            isRequiredByExpert: c.isRequiredByExpert,
            status: c.status,
          }))}
          templates={checklistTemplates}
        />
        <ChecklistTemplatePanel applicationId={application.id} />

        {/* パスポート・在留カードのPDF印刷（申請人マスターの画像を使用） */}
        <div className="mt-4 border border-gray-100 rounded-xl p-3 bg-gray-50/40">
          <p className="text-sm font-semibold text-gray-700 mb-1">パスポート・在留カードの印刷</p>
          <p className="text-xs text-gray-500 mb-2">
            パスポート／在留カード（表・裏）をPDFで印刷します。パスポートと在留カード（裏表）は別々のページに出力されます。
          </p>
          <DocumentPrintButtons applicantId={application.applicantId} />
        </div>
      </CollapsibleSection>

      {/* 3. 質問書・顧客聴取（ステップ5以降） */}
      {(application.status === "questionnaire_sent" || application.status === "under_review" || application.status === "submitted" || application.status === "applying" || application.status === "completed") && (
        <CollapsibleSection
          title="質問書・顧客聴取"
          badge={interviewQuestions.length > 0 ? `${interviewQuestions.length}件` : undefined}
          defaultOpen={application.status === "questionnaire_sent"}
          accentClass="bg-orange-400"
        >
          <QuestionnairePanel
            questions={interviewQuestions}
            applicationId={application.id}
            userRole={userRole}
          />
        </CollapsibleSection>
      )}

      {/* 4. 署名済み申請書（⑦以降・理由書等の提出書類アップロードを統合） */}
      {(application.status === "submitted" || application.status === "applying" || application.status === "completed") && (
        <CollapsibleSection
          title="署名済み申請書"
          badge={((application.draftData as any)?._signedDocuments?.length ?? 0) > 0
            ? `${(application.draftData as any)._signedDocuments.length}件`
            : undefined}
          defaultOpen={true}
          accentClass="bg-cyan-500"
        >
          <SignedDocumentsPanel
            applicationId={application.id}
            signedDocs={(application.draftData as any)?._signedDocuments ?? []}
            applicationStatus={application.status}
          />
          <div className="p-4 border-t border-gray-100">
            <AttachmentUploadPanel
              applicationId={application.id}
              initialAttachments={attachmentsList}
              sections={["output"]}
              showHeader={false}
            />
          </div>
        </CollapsibleSection>
      )}

      {/* 申請日・申請番号の記録（submitted 以降） */}
      {(application.status === "submitted" || application.status === "applying" || application.status === "completed") && (
        <CollapsibleSection
          title="申請日・申請番号の記録"
          defaultOpen={!((application.draftData as any)?._submission?.applicationDate)}
          accentClass="bg-teal-500"
        >
          <SubmissionInfoPanel
            applicationId={application.id}
            savedData={(application.draftData as any)?._submission}
          />
        </CollapsibleSection>
      )}

      {/* 5. 入管オンライン申請XML管理 */}
      <CollapsibleSection
        title="入管オンライン申請XML管理"
        defaultOpen={false}
        accentClass="bg-indigo-400"
      >
        <RasensXmlPanel applicationId={application.id} />
      </CollapsibleSection>

      {/* 6. パスポート・在留カード預証（submitted 以降・変更/更新申請のみ） */}
      {(application.status === "submitted" || application.status === "applying" || application.status === "completed") &&
        (application.applicationType === "change" || application.applicationType === "renewal") && (
        <CollapsibleSection
          title="パスポート・在留カード預証"
          defaultOpen={!((application.draftData as any)?._azukari?.residenceCardFrontUrl)}
          accentClass="bg-violet-500"
        >
          <AzukariPanel
            applicationId={application.id}
            applicationType={application.applicationType}
            applicantName={
              (applicant.familyNameJa && applicant.givenNameJa)
                ? `${applicant.familyNameJa} ${applicant.givenNameJa}`
                : `${applicant.familyNameEn ?? ""} ${applicant.givenNameEn ?? ""}`.trim()
            }
            existingImages={azukariImages}
            submissionInfo={(application.draftData as any)?._submission}
            savedData={(application.draftData as any)?._azukari}
          />
        </CollapsibleSection>
      )}

      {/* 7. 納付書作成（submitted 以降） */}
      {(application.status === "submitted" || application.status === "applying" || application.status === "completed") && (
        <CollapsibleSection
          title="納付書作成"
          defaultOpen={false}
          accentClass="bg-amber-500"
        >
          <NoufushoPanel
            applicationId={application.id}
            applicantName={
              (applicant.familyNameJa && applicant.givenNameJa)
                ? `${applicant.familyNameJa} ${applicant.givenNameJa}`
                : `${applicant.familyNameEn ?? ""} ${applicant.givenNameEn ?? ""}`.trim()
            }
            submissionApplicationNumber={(application.draftData as any)?._submission?.applicationNumber}
          />
        </CollapsibleSection>
      )}

      {/* 8. 許可・完了処理（submitted 以降） */}
      {(application.status === "submitted" || application.status === "applying" || application.status === "completed") && (
        <CollapsibleSection
          title="許可・完了処理"
          defaultOpen={!((application.draftData as any)?._result?.completedAt)}
          accentClass="bg-emerald-500"
        >
          <PermitResultPanel
            applicationId={application.id}
            applicantId={applicant.id}
            applicationType={application.applicationType}
            currentVisaType={(application.formData as any)?.currentStatusOfResidence}
            desiredVisaType={(application.formData as any)?.desiredStatusOfResidence}
            resultData={(application.draftData as any)?._result}
          />
        </CollapsibleSection>
      )}
    </div>
  );
}
