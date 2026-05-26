import { auth } from "@/lib/auth";
import { db, applicantMaster, organizationMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { NewApplicationForm } from "./new-application-form";

export default async function NewApplicationPage() {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;

  const [applicants, organizations] = await Promise.all([
    db
      .select({
        id: applicantMaster.id,
        familyNameEn: applicantMaster.familyNameEn,
        givenNameEn: applicantMaster.givenNameEn,
        familyNameJa: applicantMaster.familyNameJa,
        givenNameJa: applicantMaster.givenNameJa,
        nationality: applicantMaster.nationality,
      })
      .from(applicantMaster)
      .where(and(eq(applicantMaster.tenantId, tenantId), eq(applicantMaster.isActive, true)))
      .orderBy(applicantMaster.familyNameEn),

    db
      .select({
        id: organizationMaster.id,
        nameJa: organizationMaster.nameJa,
        nameEn: organizationMaster.nameEn,
      })
      .from(organizationMaster)
      .where(and(eq(organizationMaster.tenantId, tenantId), eq(organizationMaster.isActive, true)))
      .orderBy(organizationMaster.nameJa),
  ]);

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/applications"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          申請一覧に戻る
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">新規申請作成</h1>

      <NewApplicationForm applicants={applicants} organizations={organizations} />
    </div>
  );
}
