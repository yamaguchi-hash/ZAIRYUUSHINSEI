import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, applicantMaster, organizationMaster } from "@/lib/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Plus,
  Search,
  Filter,
} from "lucide-react";
import { XmlImportButton } from "@/components/applications/xml-import-button";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_TYPE_LABELS,
  STATUS_COLORS,
  VISA_TYPE_LABELS,
  formatDate,
} from "@/lib/utils";
import Link from "next/link";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  const params = await searchParams;

  const apps = await db
    .select({
      id: applications.id,
      caseNumber: applications.caseNumber,
      status: applications.status,
      applicationType: applications.applicationType,
      visaType: applications.visaType,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      isApproved: applications.isApproved,
      applicantFamilyName: applicantMaster.familyNameEn,
      applicantGivenName: applicantMaster.givenNameEn,
      applicantNationality: applicantMaster.nationality,
      organizationName: organizationMaster.nameJa,
    })
    .from(applications)
    .leftJoin(applicantMaster, eq(applications.applicantId, applicantMaster.id))
    .leftJoin(organizationMaster, eq(applications.organizationId, organizationMaster.id))
    .where(and(eq(applications.tenantId, tenantId ?? ""), ne(applications.status, "cancelled")))
    .orderBy(desc(applications.updatedAt));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">申請案件一覧</h1>
          <p className="text-gray-500 text-sm mt-1">全 {apps.length} 件</p>
        </div>
        <div className="flex items-center gap-2">
          <XmlImportButton />
          <Link
            href="/applications/new"
            className="inline-flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新規申請作成
          </Link>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {apps.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm font-medium">申請案件がありません</p>
              <Link
                href="/applications/new"
                className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                最初の申請を作成する
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">案件番号</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">申請人</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">所属機関</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">在留資格</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">申請種別</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">ステータス</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">更新日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {apps.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/applications/${app.id}`}
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          {app.caseNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">
                            {app.applicantFamilyName} {app.applicantGivenName}
                          </p>
                          <p className="text-xs text-gray-400">{app.applicantNationality}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {app.organizationName ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-xs">
                        {VISA_TYPE_LABELS[app.visaType] ?? app.visaType}
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-xs">
                        {APPLICATION_TYPE_LABELS[app.applicationType] ?? app.applicationType}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {formatDate(app.updatedAt)}
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
