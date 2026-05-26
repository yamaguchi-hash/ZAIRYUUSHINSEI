import { auth } from "@/lib/auth";
import { db, applicantMaster, applicantDocuments } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { formatDate, VISA_TYPE_LABELS } from "@/lib/utils";
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
    </div>
  );
}
