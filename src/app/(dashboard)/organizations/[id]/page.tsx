import { auth } from "@/lib/auth";
import { getOrganizationById } from "@/actions/organizations";
import { getOrganizationDocuments } from "@/actions/organization-documents";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { OrganizationDocumentsPanel } from "@/components/organizations/organization-documents-panel";
import { CustomerHistoryPanel } from "@/components/customers/customer-history-panel";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await auth();

  const organization = await getOrganizationById(id);
  if (!organization) notFound();

  const documents = await getOrganizationDocuments(id);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/organizations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />
          所属機関一覧
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium">{organization.nameJa}</span>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-purple-600" />
        <h1 className="text-2xl font-bold text-gray-900">{organization.nameJa}</h1>
      </div>

      <OrganizationDocumentsPanel
        organizationId={id}
        initialDocuments={documents.map((d) => ({
          id: d.id,
          visaType: d.visaType,
          documentName: d.documentName,
          fileUrl: d.fileUrl,
          fileName: d.fileName,
        }))}
      />

      {/* 顧客履歴（全案件・打合せ・保管書類の一元表示） */}
      <div className="mt-6">
        <CustomerHistoryPanel organizationId={id} />
      </div>
    </div>
  );
}
