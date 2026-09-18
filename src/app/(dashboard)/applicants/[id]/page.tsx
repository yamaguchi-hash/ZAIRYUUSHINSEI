import { auth } from "@/lib/auth";
import { db, applicantMaster, applicantDocuments, applicantResidenceCardHistories, applicantUpdateHistory, applications } from "@/lib/db";
import { getOrganizations } from "@/actions/organizations";
import { getApplicants } from "@/actions/applicants";
import { eq, and, ne, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, AlertTriangle, FileText, ExternalLink } from "lucide-react";
import Link from "next/link";
import { formatDate, VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS, APPLICATION_STATUS_LABELS, STATUS_COLORS, getDaysUntil } from "@/lib/utils";
import { OcrPanel } from "@/components/applicants/ocr-panel";
import { ResidenceCardHistoryPanel } from "@/components/applicants/residence-card-history-panel";
import { UpdateHistoryPanel } from "@/components/applicants/update-history-panel";
import { CustomerHistoryPanel } from "@/components/customers/customer-history-panel";
import { DocumentPrintButtons } from "@/components/applications/document-print-buttons";
import { ApplicantNotesPanel } from "@/components/applicants/applicant-notes-panel";
import { Printer } from "lucide-react";
import { EditApplicantForm } from "./edit-applicant-form";
import { DeleteApplicantButton } from "./delete-applicant-button";

export default async function ApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(and(eq(applicantMaster.id, id), eq(applicantMaster.tenantId, tenantId)))
    .limit(1);

  if (!applicant) notFound();

  const organizations = await getOrganizations();

  // 扶養者ピッカー用の申請人一覧（自分自身を除外）
  const allApplicants = await getApplicants();
  const supporterCandidates = allApplicants
    .filter((a) => a.id !== id)
    .map((a) => ({ id: a.id, familyNameEn: a.familyNameEn, givenNameEn: a.givenNameEn, nationality: a.nationality }));

  const docs = await db
    .select()
    .from(applicantDocuments)
    .where(and(eq(applicantDocuments.applicantId, id), eq(applicantDocuments.tenantId, tenantId)));

  // 在留カードの変更履歴（マスタ上書き時に退避された旧情報）
  const residenceCardHistories = await db
    .select()
    .from(applicantResidenceCardHistories)
    .where(and(eq(applicantResidenceCardHistories.applicantId, id), eq(applicantResidenceCardHistories.tenantId, tenantId)))
    .orderBy(desc(applicantResidenceCardHistories.replacedAt));

  // 更新履歴（書類差し替え・AI項目変更）
  const updateHistories = await db
    .select()
    .from(applicantUpdateHistory)
    .where(and(eq(applicantUpdateHistory.applicantId, id), eq(applicantUpdateHistory.tenantId, tenantId)))
    .orderBy(desc(applicantUpdateHistory.createdAt));

  // 過去の申請案件を取得
  const pastApplications = await db
    .select({
      id: applications.id,
      caseNumber: applications.caseNumber,
      applicationType: applications.applicationType,
      visaType: applications.visaType,
      status: applications.status,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      isApproved: applications.isApproved,
    })
    .from(applications)
    .where(
      and(
        eq(applications.applicantId, id),
        eq(applications.tenantId, tenantId),
        ne(applications.status, "cancelled")
      )
    )
    .orderBy(desc(applications.updatedAt));

  // 扶養者として紐付けられている申請を取得
  const supportedApplications = await db
    .select({
      id: applications.id,
      caseNumber: applications.caseNumber,
      applicationType: applications.applicationType,
      visaType: applications.visaType,
      status: applications.status,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      isApproved: applications.isApproved,
    })
    .from(applications)
    .where(
      and(
        eq(applications.supporterId, id),
        eq(applications.tenantId, tenantId),
        ne(applications.status, "cancelled")
      )
    )
    .orderBy(desc(applications.updatedAt));

  const visaDays = getDaysUntil(applicant.currentVisaExpiry);
  const passportDays = getDaysUntil(applicant.passportExpiry);

  return (
    <div className="p-8 max-w-6xl">
      {/* ── Breadcrumb + 削除ボタン ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link href="/applicants" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" />
            申請人一覧
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium">
            {applicant.familyNameEn} {applicant.givenNameEn}
          </span>
        </div>
        <DeleteApplicantButton
          applicantId={applicant.id}
          applicantName={`${applicant.familyNameEn} ${applicant.givenNameEn}${applicant.familyNameJa ? `（${applicant.familyNameJa} ${applicant.givenNameJa}）` : ""}`}
        />
      </div>

      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {applicant.familyNameEn} {applicant.givenNameEn}
          {applicant.familyNameJa && (
            <span className="ml-3 text-lg font-normal text-gray-500">
              ({applicant.familyNameJa} {applicant.givenNameJa})
            </span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
          <span>{applicant.nationality}</span>
          {applicant.dateOfBirth && <><span>·</span><span>{formatDate(applicant.dateOfBirth)}</span></>}
          {applicant.currentVisaType && (
            <><span>·</span><span>{VISA_TYPE_LABELS[applicant.currentVisaType] ?? applicant.currentVisaType}</span></>
          )}
        </div>

        {/* Expiry warnings */}
        <div className="flex flex-wrap gap-2 mt-3">
          {visaDays !== null && visaDays <= 90 && (
            <div className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 ${
              visaDays < 0 ? "bg-gray-100 text-gray-600" :
              visaDays <= 30 ? "bg-red-100 text-red-700" :
              visaDays <= 60 ? "bg-orange-100 text-orange-700" :
              "bg-yellow-100 text-yellow-700"
            }`}>
              <AlertTriangle className="w-3 h-3" />
              在留期限: {formatDate(applicant.currentVisaExpiry)}
              {visaDays < 0 ? "（期限切れ）" : `（残${visaDays}日）`}
            </div>
          )}
          {passportDays !== null && passportDays <= 90 && (
            <div className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 ${
              passportDays < 0 ? "bg-gray-100 text-gray-600" :
              passportDays <= 30 ? "bg-red-100 text-red-700" :
              "bg-orange-100 text-orange-700"
            }`}>
              <AlertTriangle className="w-3 h-3" />
              パスポート期限: {formatDate(applicant.passportExpiry)}
              {passportDays < 0 ? "（期限切れ）" : `（残${passportDays}日）`}
            </div>
          )}
        </div>
      </div>

      {/* ── 1. 申請人情報の編集（最上部） ── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-4 h-4" />
            申請人情報の編集
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-2xl">
            <EditApplicantForm
              applicant={applicant}
              organizations={organizations.map((o) => ({ id: o.id, nameJa: o.nameJa }))}
              supporters={supporterCandidates}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── メモ記録（タイトル・日付・内容） ── */}
      <div className="mt-6">
        <ApplicantNotesPanel applicantId={id} />
      </div>

      {/* ── 学歴・職歴（申請書の保存時に自動同期される読み取り専用情報） ── */}
      {(() => {
        const edu = (applicant.educationHistory ?? null) as Record<string, string> | null;
        const work = Array.isArray(applicant.workHistory)
          ? (applicant.workHistory as Array<{ joinDate?: string; leaveDate?: string; employer?: string }>)
          : [];
        const hasEdu = !!edu && typeof edu === "object" && !Array.isArray(edu) && Object.values(edu).some(Boolean);
        if (!hasEdu && work.length === 0) return null;
        const EDU_LABELS: [string, string][] = [
          ["educationCountry", "学校の所在国"],
          ["educationDegree", "学位・区分"],
          ["educationSchoolName", "学校名"],
          ["educationGraduationDate", "卒業年月日"],
          ["majorCategory", "専攻・専門分野"],
          ["itQualificationName", "情報処理技術者資格"],
        ];
        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                学歴・職歴
                <span className="text-xs font-normal text-gray-400 ml-1">
                  （申請書の保存時に自動同期・次回の申請書作成で初期値に使用）
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasEdu && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">最終学歴</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                    {EDU_LABELS.filter(([k]) => edu![k]).map(([k, label]) => (
                      <div key={k}>
                        <span className="text-xs text-gray-400 block">{label}</span>
                        <span className="text-gray-700">{edu![k]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {work.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">職歴（{work.length}件）</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left py-1 font-normal w-28">入社年月</th>
                        <th className="text-left py-1 font-normal w-28">退社年月</th>
                        <th className="text-left py-1 font-normal">勤務先名称</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {work.map((w, i) => (
                        <tr key={i}>
                          <td className="py-1.5 text-gray-600">{w.joinDate || "—"}</td>
                          <td className="py-1.5 text-gray-600">{w.leaveDate || "在職中"}</td>
                          <td className="py-1.5 text-gray-700">{w.employer || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ── パスポート・在留カードのPDF印刷 ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4" />
            パスポート・在留カードの印刷
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-500 mb-3">
            アップロード済みのパスポート・在留カード（表／裏）をPDFで印刷します。パスポートと在留カード（裏表）は別々のページに出力されます。
          </p>
          <DocumentPrintButtons applicantId={id} />
        </CardContent>
      </Card>

      {/* ── 2. 保存済み書類 / 3. 書類アップロード ＆ AI自動読み込み ── */}
      <OcrPanel
        applicantId={id}
        initialDocs={docs.map((d) => ({
          id: d.id,
          documentType: d.documentType,
          fileUrl: d.fileUrl,
          fileName: d.fileName,
          ocrProcessedAt: d.ocrProcessedAt,
          uploadedAt: d.uploadedAt,
        }))}
      />

      {/* ── 過去の申請案件 ── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            申請案件の履歴
            {pastApplications.length > 0 && (
              <span className="text-xs font-normal text-gray-400 ml-1">
                （{pastApplications.length}件）
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pastApplications.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">申請案件がありません</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">案件番号</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">申請種別</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">在留資格</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">ステータス</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">作成日</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">最終更新</th>
                    <th className="px-4 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pastApplications.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/applications/${app.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {app.caseNumber ?? app.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {APPLICATION_TYPE_LABELS[app.applicationType] ?? app.applicationType}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {VISA_TYPE_LABELS[app.visaType] ?? app.visaType}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(app.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(app.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/applications/${app.id}`} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 扶養者として紐付けられている申請 ── */}
      {supportedApplications.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              扶養者として紐付けられている申請
              <span className="text-xs font-normal text-gray-400 ml-1">
                （{supportedApplications.length}件）
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">案件番号</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">申請種別</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">在留資格</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">ステータス</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">作成日</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">最終更新</th>
                    <th className="px-4 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {supportedApplications.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/applications/${app.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {app.caseNumber ?? app.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {APPLICATION_TYPE_LABELS[app.applicationType] ?? app.applicationType}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {VISA_TYPE_LABELS[app.visaType] ?? app.visaType}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(app.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(app.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/applications/${app.id}`} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 顧客履歴（全案件・打合せ・保管書類の一元表示）── */}
      <div className="mt-6">
        <CustomerHistoryPanel applicantId={id} />
      </div>

      {/* ── 更新履歴（書類差し替え・AI項目変更）── */}
      <div className="mt-4">
        <UpdateHistoryPanel
          histories={updateHistories.map((h) => ({
            id: h.id,
            changeType: h.changeType,
            source: h.source,
            documentType: h.documentType,
            fieldKey: h.fieldKey,
            oldValue: h.oldValue,
            newValue: h.newValue,
            oldFileUrl: h.oldFileUrl,
            oldFileName: h.oldFileName,
            createdAt: h.createdAt,
          }))}
        />
      </div>

      {/* ── 在留カードの変更履歴（折りたたみ） ── */}
      <div className="mt-4">
        <ResidenceCardHistoryPanel
          histories={residenceCardHistories.map((h) => ({
            id: h.id,
            oldResidenceCardNumber: h.oldResidenceCardNumber,
            oldCurrentVisaExpiry: h.oldCurrentVisaExpiry,
            oldFileUrl: h.oldFileUrl,
            oldFileName: h.oldFileName,
            replacedAt: h.replacedAt,
          }))}
        />
      </div>
    </div>
  );
}
