"use client";

import { useState, useTransition } from "react";
import { createOrganization, updateOrganization } from "@/actions/organizations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2, CheckCircle } from "lucide-react";
import { AddressSplitInput } from "@/components/ui/postal-code-input";

type OrgForm = {
  nameJa: string;
  nameEn: string;
  corporateNumber: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  phone: string;
  category: string;
  capital: string;
  employeeCount: string;
  industry: string;
  workersAccidentInsuranceNo: string;
  employmentInsuranceNo: string;
  representativeTitle: string;
  representativeName: string;
  email: string;
};

const EMPTY_FORM: OrgForm = {
  nameJa: "", nameEn: "", corporateNumber: "", postalCode: "",
  prefecture: "", city: "", addressLine: "", phone: "", category: "",
  capital: "", employeeCount: "", industry: "",
  workersAccidentInsuranceNo: "", employmentInsuranceNo: "",
  representativeTitle: "", representativeName: "", email: "",
};

type EditingOrg = {
  id: string;
  nameJa?: string;
  nameEn?: string;
  corporateNumber?: string;
  postalCode?: string;
  prefecture?: string;
  city?: string;
  addressLine?: string;
  phone?: string;
  email?: string;
  category?: string;
  capital?: number | null;
  employeeCount?: number | null;
  industry?: string;
  workersAccidentInsuranceNo?: string;
  employmentInsuranceNo?: string;
  representativeTitle?: string;
  representativeName?: string;
};

type Props = {
  editingOrg?: EditingOrg;
  onSaved?: () => void;
};

export function AddOrganizationForm({ editingOrg, onSaved }: Props) {
  const isEdit = !!editingOrg;
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<OrgForm>(() => {
    if (!editingOrg) return EMPTY_FORM;
    return {
      nameJa: editingOrg.nameJa ?? "",
      nameEn: editingOrg.nameEn ?? "",
      corporateNumber: editingOrg.corporateNumber ?? "",
      postalCode: editingOrg.postalCode ?? "",
      prefecture: editingOrg.prefecture ?? "",
      city: editingOrg.city ?? "",
      addressLine: editingOrg.addressLine ?? "",
      phone: editingOrg.phone ?? "",
      category: editingOrg.category ?? "",
      capital: editingOrg.capital != null ? String(editingOrg.capital) : "",
      employeeCount: editingOrg.employeeCount != null ? String(editingOrg.employeeCount) : "",
      industry: editingOrg.industry ?? "",
      workersAccidentInsuranceNo: editingOrg.workersAccidentInsuranceNo ?? "",
      employmentInsuranceNo: editingOrg.employmentInsuranceNo ?? "",
      representativeTitle: editingOrg.representativeTitle ?? "",
      representativeName: editingOrg.representativeName ?? "",
      email: editingOrg.email ?? "",
    };
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSuccess(false);
    setError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          ...form,
          capital: form.capital ? parseFloat(form.capital) : undefined,
          employeeCount: form.employeeCount ? parseInt(form.employeeCount) : undefined,
        };
        if (isEdit && editingOrg) {
          await updateOrganization(editingOrg.id, payload);
        } else {
          await createOrganization(payload as any);
          setForm(EMPTY_FORM);
        }
        setSuccess(true);
        onSaved?.();
      } catch (err: any) {
        setError(err.message ?? "保存に失敗しました");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          {isEdit ? "所属機関を編集" : "所属機関を新規登録"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
            <CheckCircle className="w-4 h-4" />
            {isEdit ? "更新しました" : "登録しました"}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* ── 基本情報 ──────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">法人名（日）<span className="text-red-500">*</span></label>
            <input name="nameJa" value={form.nameJa} onChange={handleChange} required placeholder="株式会社〇〇" className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">法人名（英）</label>
            <input name="nameEn" value={form.nameEn} onChange={handleChange} placeholder="ABC Company Ltd." className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">法人番号</label>
            <input name="corporateNumber" value={form.corporateNumber} onChange={handleChange} placeholder="1234567890123" maxLength={13} className="input-field font-mono" />
          </div>

          {/* ── 住所 ──────────────────────────────────────────────── */}
          <AddressSplitInput
            value={{ postalCode: form.postalCode, prefecture: form.prefecture, city: form.city, addressLine: form.addressLine }}
            onChange={(fields) => setForm(prev => ({ ...prev, ...fields }))}
            inputClassName="input-field w-full"
          />

          {/* ── 連絡先 ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
              <input name="phone" value={form.phone} onChange={handleChange} placeholder="03-0000-0000" className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="info@example.com" className="input-field" />
            </div>
          </div>

          {/* ── 代表者情報 ────────────────────────────────────────── */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">代表者情報</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">代表者役職</label>
                <input name="representativeTitle" value={form.representativeTitle} onChange={handleChange} placeholder="代表取締役" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">代表者氏名</label>
                <input name="representativeName" value={form.representativeName} onChange={handleChange} placeholder="山田 太郎" className="input-field" />
              </div>
            </div>
          </div>

          {/* ── 保険番号 ──────────────────────────────────────────── */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">保険番号</p>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">労働災害保険番号</label>
                <input name="workersAccidentInsuranceNo" value={form.workersAccidentInsuranceNo} onChange={handleChange} placeholder="01-123456-789012-000" className="input-field font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">雇用保険事業者番号</label>
                <input name="employmentInsuranceNo" value={form.employmentInsuranceNo} onChange={handleChange} placeholder="0100-012345-6" className="input-field font-mono" />
              </div>
            </div>
          </div>

          {/* ── 事業情報 ──────────────────────────────────────────── */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">事業情報</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリー</label>
                <select name="category" value={form.category} onChange={handleChange} className="input-field">
                  <option value="">選択</option>
                  <option value="1">カテゴリー1</option>
                  <option value="2">カテゴリー2</option>
                  <option value="3">カテゴリー3</option>
                  <option value="4">カテゴリー4</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">業種</label>
                <input name="industry" value={form.industry} onChange={handleChange} placeholder="IT・情報通信" className="input-field" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">従業員数</label>
                <input name="employeeCount" type="number" value={form.employeeCount} onChange={handleChange} placeholder="100" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">資本金（円）</label>
                <input name="capital" type="number" value={form.capital} onChange={handleChange} placeholder="10000000" className="input-field" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />{isEdit ? "更新中..." : "登録中..."}</> : isEdit ? "更新する" : "所属機関を登録"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
