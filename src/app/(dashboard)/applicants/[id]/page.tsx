import { auth } from "@/lib/auth";
import { db, applicantMaster, applicantDocuments, applications } from "@/lib/db";
import { eq, and, ne, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, AlertTriangle, FileText, ExternalLink } from "lucide-react";
import Link from "next/link";
import { formatDate, VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS, APPLICATION_STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { OcrPanel } from "@/components/applicants/ocr-panel";
import { EditApplicantForm } from "./edit-applicant-form";
import { DeleteApplicantButton } from "./delete-applicant-button";

function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

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

  const docs = await db
    .select()
    .from(applicantDocuments)
    .where(and(eq(applicantDocuments.applicantId, id), eq(applicantDocuments.tenantId, tenantId)));

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

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left: OCR panel (upload + gallery) */}
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

        {/* Right: Edit form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-4 h-4" />
              申請人情報の編集
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EditApplicantForm applicant={applicant} />
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
