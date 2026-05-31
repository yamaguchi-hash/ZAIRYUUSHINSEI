"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Pencil, X, Mail, Phone, Shield, Briefcase, User } from "lucide-react";
import { AddOrganizationForm } from "./add-organization-form";

type Org = {
  id: string;
  nameJa: string;
  nameEn: string | null;
  corporateNumber: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  capital: number | null;
  employeeCount: number | null;
  industry: string | null;
  workersAccidentInsuranceNo: string | null;
  employmentInsuranceNo: string | null;
  representativeTitle: string | null;
  representativeName: string | null;
};

export function OrganizationList({ organizations }: { organizations: Org[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingOrg = organizations.find((o) => o.id === editingId);

  if (editingOrg) {
    return (
      <div>
        <button
          onClick={() => setEditingId(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <X className="w-4 h-4" />
          編集をキャンセル
        </button>
        <AddOrganizationForm
          editingOrg={{
            id: editingOrg.id,
            nameJa: editingOrg.nameJa,
            nameEn: editingOrg.nameEn ?? undefined,
            corporateNumber: editingOrg.corporateNumber ?? undefined,
            postalCode: editingOrg.postalCode ?? undefined,
            prefecture: editingOrg.prefecture ?? undefined,
            city: editingOrg.city ?? undefined,
            addressLine: editingOrg.addressLine ?? undefined,
            phone: editingOrg.phone ?? undefined,
            email: editingOrg.email ?? undefined,
            category: editingOrg.category ?? undefined,
            capital: editingOrg.capital,
            employeeCount: editingOrg.employeeCount,
            industry: editingOrg.industry ?? undefined,
            workersAccidentInsuranceNo: editingOrg.workersAccidentInsuranceNo ?? undefined,
            employmentInsuranceNo: editingOrg.employmentInsuranceNo ?? undefined,
            representativeTitle: editingOrg.representativeTitle ?? undefined,
            representativeName: editingOrg.representativeName ?? undefined,
          }}
          onSaved={() => setEditingId(null)}
        />
      </div>
    );
  }

  return (
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
          <div className="divide-y divide-gray-100">
            {organizations.map((org) => (
              <div key={org.id} className="px-6 py-4 hover:bg-gray-50 group">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Building2 className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* 法人名 */}
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{org.nameJa}</p>
                        {org.nameEn && <p className="text-xs text-gray-400">{org.nameEn}</p>}
                      </div>
                      <button
                        onClick={() => setEditingId(org.id)}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0 transition-opacity"
                      >
                        <Pencil className="w-3 h-3" />
                        編集
                      </button>
                    </div>

                    {/* 基本情報 */}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      {org.corporateNumber && <span className="font-mono">法人番号: {org.corporateNumber}</span>}
                      {org.category && <span>カテゴリー{org.category}</span>}
                      {org.employeeCount && <span>{org.employeeCount}名</span>}
                      {org.industry && <span>{org.industry}</span>}
                    </div>

                    {/* 住所・電話 */}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                      {(org.prefecture || org.city) && (
                        <span>{[org.prefecture, org.city, org.addressLine].filter(Boolean).join(" ")}</span>
                      )}
                      {org.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5" />
                          {org.phone}
                        </span>
                      )}
                      {org.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-2.5 h-2.5" />
                          {org.email}
                        </span>
                      )}
                    </div>

                    {/* 代表者 */}
                    {(org.representativeName || org.representativeTitle) && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <User className="w-2.5 h-2.5" />
                        <span>{[org.representativeTitle, org.representativeName].filter(Boolean).join(" ")}</span>
                      </div>
                    )}

                    {/* 保険番号 */}
                    {(org.workersAccidentInsuranceNo || org.employmentInsuranceNo) && (
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-400">
                        <Shield className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                        {org.workersAccidentInsuranceNo && (
                          <span>労災: <span className="font-mono">{org.workersAccidentInsuranceNo}</span></span>
                        )}
                        {org.employmentInsuranceNo && (
                          <span>雇用: <span className="font-mono">{org.employmentInsuranceNo}</span></span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
