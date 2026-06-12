"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Pencil, X, Mail, Phone, Shield, User, TrendingUp, Trash2, AlertTriangle } from "lucide-react";
import { AddOrganizationForm } from "./add-organization-form";
import { deleteOrganization } from "@/actions/organizations";

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
  fax: string | null;
  email: string | null;
  category: string | null;
  capital: number | null;
  annualSales: number | null;
  employeeCount: number | null;
  industry: string | null;
  workersAccidentInsuranceNo: string | null;
  employmentInsuranceNo: string | null;
  laborInsuranceNo: string | null;
  socialInsuranceSymbol: string | null;
  representativeTitle: string | null;
  representativeName: string | null;
};

// ── 削除確認ダイアログ ────────────────────────────────────────────────────────
function DeleteConfirmDialog({
  org,
  onCancel,
  onDeleted,
}: {
  org: Org;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteOrganization(org.id);
        onDeleted();
      } catch (e: any) {
        setError(e?.message ?? "削除に失敗しました");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">所属機関を削除しますか？</h2>
              <p className="text-sm text-gray-500 mt-0.5">{org.nameJa}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            この操作を行うと、この所属機関はマスター一覧から削除されます。<br />
            <span className="text-red-600 font-medium">既存の申請案件への影響はありません。</span>
          </p>
          {error && (
            <p className="mt-2 text-xs text-red-500">{error}</p>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-2">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isPending ? "削除中..." : "削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 一覧コンポーネント ────────────────────────────────────────────────────────
export function OrganizationList({ organizations }: { organizations: Org[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingOrg, setDeletingOrg] = useState<Org | null>(null);

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
            fax: editingOrg.fax ?? undefined,
            email: editingOrg.email ?? undefined,
            category: editingOrg.category ?? undefined,
            capital: editingOrg.capital,
            annualSales: editingOrg.annualSales,
            employeeCount: editingOrg.employeeCount,
            industry: editingOrg.industry ?? undefined,
            workersAccidentInsuranceNo: editingOrg.workersAccidentInsuranceNo ?? undefined,
            employmentInsuranceNo: editingOrg.employmentInsuranceNo ?? undefined,
            laborInsuranceNo: editingOrg.laborInsuranceNo ?? undefined,
            socialInsuranceSymbol: editingOrg.socialInsuranceSymbol ?? undefined,
            representativeTitle: editingOrg.representativeTitle ?? undefined,
            representativeName: editingOrg.representativeName ?? undefined,
          }}
          onSaved={() => setEditingId(null)}
        />
      </div>
    );
  }

  return (
    <>
      {/* 削除確認ダイアログ */}
      {deletingOrg && (
        <DeleteConfirmDialog
          org={deletingOrg}
          onCancel={() => setDeletingOrg(null)}
          onDeleted={() => setDeletingOrg(null)}
        />
      )}

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
                      {/* 法人名 + 操作ボタン */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{org.nameJa}</p>
                          {org.nameEn && <p className="text-xs text-gray-400">{org.nameEn}</p>}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 flex-shrink-0 transition-opacity">
                          <button
                            onClick={() => setEditingId(org.id)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <Pencil className="w-3 h-3" />
                            編集
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setDeletingOrg(org)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                            削除
                          </button>
                        </div>
                      </div>

                      {/* 基本情報 */}
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {org.corporateNumber && <span className="font-mono">法人番号: {org.corporateNumber}</span>}
                        {org.category && <span>カテゴリー{org.category}</span>}
                        {org.industry && <span>{org.industry}</span>}
                      </div>

                      {/* 財務・規模情報 */}
                      {(org.capital != null || org.annualSales != null || org.employeeCount != null) && (
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                          <TrendingUp className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-amber-500" />
                          {org.capital != null && (
                            <span>資本金: <span className="font-medium">{org.capital.toLocaleString()}円</span></span>
                          )}
                          {org.annualSales != null && (
                            <span>年間売上: <span className="font-medium">{org.annualSales.toLocaleString()}円</span></span>
                          )}
                          {org.employeeCount != null && (
                            <span>常勤: <span className="font-medium">{org.employeeCount}名</span></span>
                          )}
                        </div>
                      )}

                      {/* 住所・電話 */}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                        {(org.prefecture || org.city) && (
                          <span>{org.prefecture ?? ""} {org.city ?? ""}</span>
                        )}
                        {org.addressLine && (
                          <span>{org.addressLine}</span>
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
                      {(org.workersAccidentInsuranceNo || org.employmentInsuranceNo || org.laborInsuranceNo || org.socialInsuranceSymbol) && (
                        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-400">
                          <Shield className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                          {org.workersAccidentInsuranceNo && (
                            <span>労災: <span className="font-mono">{org.workersAccidentInsuranceNo}</span></span>
                          )}
                          {org.employmentInsuranceNo && (
                            <span>雇用: <span className="font-mono">{org.employmentInsuranceNo}</span></span>
                          )}
                          {org.laborInsuranceNo && (
                            <span>労保: <span className="font-mono">{org.laborInsuranceNo}</span></span>
                          )}
                          {org.socialInsuranceSymbol && (
                            <span>社保: <span className="font-mono">{org.socialInsuranceSymbol}</span></span>
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
    </>
  );
}
