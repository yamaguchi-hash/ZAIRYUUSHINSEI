import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, applicantMaster, organizationMaster } from "@/lib/db/schema";
import { eq, count, and, lte, isNotNull, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, Building2, AlertTriangle } from "lucide-react";
import { APPLICATION_STATUS_LABELS, STATUS_COLORS, VISA_TYPE_LABELS, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ExpiryAlertList, type ExpiryAlertItem } from "./expiry-alert-list";

export default async function DashboardPage() {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;

  if (!tenantId) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">テナント未設定</h2>
          <p className="text-yellow-700 text-sm">システム管理者にテナントIDの設定を依頼してください。</p>
        </div>
      </div>
    );
  }

  // 90日以内に在留期限が到来する申請人
  const today = new Date();
  const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [appCount, applicantCount, orgCount, recentApps, expiringApplicants] = await Promise.all([
    db.select({ count: count() }).from(applications).where(eq(applications.tenantId, tenantId)),
    db.select({ count: count() }).from(applicantMaster).where(and(eq(applicantMaster.tenantId, tenantId), eq(applicantMaster.isActive, true))),
    db.select({ count: count() }).from(organizationMaster).where(and(eq(organizationMaster.tenantId, tenantId), eq(organizationMaster.isActive, true))),
    db.select({
      id: applications.id,
      caseNumber: applications.caseNumber,
      status: applications.status,
      visaType: applications.visaType,
      applicationType: applications.applicationType,
      updatedAt: applications.updatedAt,
      applicantFamilyName: applicantMaster.familyNameEn,
      applicantGivenName: applicantMaster.givenNameEn,
    })
    .from(applications)
    .leftJoin(applicantMaster, eq(applications.applicantId, applicantMaster.id))
    .where(eq(applications.tenantId, tenantId))
    .orderBy(desc(applications.updatedAt))
    .limit(10),

    // 在留期限アラート: 期限切れ〜90日以内（非表示設定分も取得し、クライアント側で振り分け）
    db.select({
      id: applicantMaster.id,
      familyNameEn: applicantMaster.familyNameEn,
      givenNameEn: applicantMaster.givenNameEn,
      familyNameJa: applicantMaster.familyNameJa,
      givenNameJa: applicantMaster.givenNameJa,
      nationality: applicantMaster.nationality,
      currentVisaType: applicantMaster.currentVisaType,
      currentVisaExpiry: applicantMaster.currentVisaExpiry,
      passportExpiry: applicantMaster.passportExpiry,
      hideExpiryAlert: applicantMaster.hideExpiryAlert,
    })
    .from(applicantMaster)
    .where(
      and(
        eq(applicantMaster.tenantId, tenantId),
        eq(applicantMaster.isActive, true),
        isNotNull(applicantMaster.currentVisaExpiry),
        lte(applicantMaster.currentVisaExpiry, in90Days),
      )
    )
    .orderBy(applicantMaster.currentVisaExpiry)
    .limit(40),
  ]);

  // RSC シリアライズ安全化（date型は文字列化して渡す）
  const expiryAlertItems: ExpiryAlertItem[] = expiringApplicants.map((a) => ({
    id: a.id,
    familyNameEn: a.familyNameEn ?? null,
    givenNameEn: a.givenNameEn ?? null,
    familyNameJa: a.familyNameJa ?? null,
    givenNameJa: a.givenNameJa ?? null,
    nationality: a.nationality ?? null,
    currentVisaType: a.currentVisaType ?? null,
    currentVisaExpiry: a.currentVisaExpiry ? String(a.currentVisaExpiry) : null,
    passportExpiry: a.passportExpiry ? String(a.passportExpiry) : null,
    hideExpiryAlert: a.hideExpiryAlert,
  }));

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-500 text-sm mt-1">行政書士業務システム</p>
      </div>

      {/* ── 在留期限アラート（申請人個別に非表示設定可） ── */}
      <ExpiryAlertList items={expiryAlertItems} />

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">総申請案件数</p>
              <p className="text-3xl font-bold text-gray-900">{appCount[0]?.count ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">申請人マスター数</p>
              <p className="text-3xl font-bold text-gray-900">{applicantCount[0]?.count ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">所属機関マスター数</p>
              <p className="text-3xl font-bold text-gray-900">{orgCount[0]?.count ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Applications ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>最近の申請案件</CardTitle>
          <Link href="/applications" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            すべて表示
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentApps.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">申請案件がありません</p>
              <Link href="/applications/new" className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-700 font-medium">
                新規申請を作成する
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentApps.map((app) => (
                <Link
                  key={app.id}
                  href={`/applications/${app.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {app.applicantFamilyName} {app.applicantGivenName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {VISA_TYPE_LABELS[app.visaType] ?? app.visaType} ・ {app.caseNumber}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(app.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
