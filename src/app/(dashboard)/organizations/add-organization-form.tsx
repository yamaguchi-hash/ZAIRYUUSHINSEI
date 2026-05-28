"use client";

import { useState, useTransition } from "react";
import { createOrganization } from "@/actions/organizations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2, CheckCircle } from "lucide-react";
import { AddressSplitInput } from "@/components/ui/postal-code-input";

export function AddOrganizationForm() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    nameJa: "",
    nameEn: "",
    corporateNumber: "",
    postalCode: "",
    prefecture: "",
    city: "",
    addressLine: "",
    phone: "",
    category: "",
    capital: "",
    employeeCount: "",
    industry: "",
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
        await createOrganization({
          ...form,
          capital: form.capital ? parseFloat(form.capital) : undefined,
          employeeCount: form.employeeCount ? parseInt(form.employeeCount) : undefined,
        });
        setSuccess(true);
        setForm({
          nameJa: "", nameEn: "", corporateNumber: "", postalCode: "",
          prefecture: "", city: "", addressLine: "", phone: "", category: "",
          capital: "", employeeCount: "", industry: "",
        });
      } catch (err: any) {
        setError(err.message ?? "登録に失敗しました");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          所属機関を新規登録
        </CardTitle>
      </CardHeader>
      <CardContent>
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
            <CheckCircle className="w-4 h-4" />
            登録しました
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
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
          <AddressSplitInput
            value={{
              postalCode: form.postalCode,
              prefecture: form.prefecture,
              city: form.city,
              addressLine: form.addressLine,
            }}
            onChange={(fields) => setForm(prev => ({
              ...prev,
              ...(fields.postalCode !== undefined && { postalCode: fields.postalCode }),
              ...(fields.prefecture !== undefined && { prefecture: fields.prefecture }),
              ...(fields.city !== undefined && { city: fields.city }),
              ...(fields.addressLine !== undefined && { addressLine: fields.addressLine }),
            }))}
            inputClassName="input-field w-full"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
              <input name="phone" value={form.phone} onChange={handleChange} placeholder="03-0000-0000" className="input-field" />
            </div>
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
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">従業員数</label>
              <input name="employeeCount" type="number" value={form.employeeCount} onChange={handleChange} placeholder="100" className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">業種</label>
              <input name="industry" value={form.industry} onChange={handleChange} placeholder="IT・情報通信" className="input-field" />
            </div>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />登録中...</> : "所属機関を登録"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
