import { auth } from "@/lib/auth";
import { db, applicantMaster, applicantDocuments } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, FileText, Clock } from "lucide-react";
import Link from "next/link";
import { formatDate, VISA_TYPE_LABELS } from "@/lib/utils";
import { OcrPanel } from "@/components/applicants/ocr-panel";
import { EditApplicantForm } from "./edit-applicant-form";

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
    .where(
      and(
        eq(applicantDocuments.applicantId, id),
        eq(applicantDocuments.tenantId, tenantId)
      )
    );

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/applicants"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          申請人一覧
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium">
          {applicant.familyNameEn} {applicant.givenNameEn}
        </span>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {applicant.familyNameEn} {applicant.givenNameEn}
            {applicant.familyNameJa && (
              <span className="ml-3 text-lg font-normal text-gray-500">
                ({applicant.familyNameJa} {applicant.givenNameJa})
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span>{applicant.nationality}</span>
            <span>·</span>
            <span>{formatDate(applicant.dateOfBirth)}</span>
            {applicant.currentVisaType && (
              <>
                <span>·</span>
                <span>{VISA_TYPE_LABELS[applicant.currentVisaType]}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Document upload + OCR */}
        <div className="space-y-6">
          <OcrPanel
            applicantId={id}
            initialDocs={docs.map((d) => ({
              id: d.id,
              documentType: d.documentType,
              fileUrl: d.fileUrl,
              fileName: d.fileName,
              ocrProcessedAt: d.ocrProcessedAt,
            }))}
          />
        </div>

        {/* Right: Current master data + edit form */}
        <div className="space-y-6">
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

          {/* Document history */}
          {docs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4" />
                  アップロード済み書類
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-50">
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-xs font-medium text-gray-800">{doc.documentType}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[180px]">{doc.fileName}</p>
                      </div>
                      <div className="text-right">
                        {doc.ocrProcessedAt ? (
                          <span className="text-xs text-green-600">OCR完了</span>
                        ) : (
                          <span className="text-xs text-gray-400">未処理</span>
                        )}
                        <p className="text-xs text-gray-300">{formatDate(doc.uploadedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
