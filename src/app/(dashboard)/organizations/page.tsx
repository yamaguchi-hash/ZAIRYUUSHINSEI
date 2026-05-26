import { auth } from "@/lib/auth";
import { getOrganizations } from "@/actions/organizations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { AddOrganizationForm } from "./add-organization-form";

export default async function OrganizationsPage() {
  const organizations = await getOrganizations();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">所属機関マスター</h1>
          <p className="text-gray-500 text-sm mt-1">全 {organizations.length} 件</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <AddOrganizationForm />
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                所属機関一覧
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {organizations.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">所属機関が登録されていません</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {organizations.map((org) => (
                    <div key={org.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{org.nameJa}</p>
                        <p className="text-xs text-gray-500">
                          {org.corporateNumber && <span className="font-mono mr-2">{org.corporateNumber}</span>}
                          {org.category && <span>カテゴリー{org.category} ・ </span>}
                          {org.employeeCount && <span>{org.employeeCount}名</span>}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">{[org.prefecture, org.city].filter(Boolean).join(" ")}</p>
                        <p className="text-xs font-mono text-gray-300">{org.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
