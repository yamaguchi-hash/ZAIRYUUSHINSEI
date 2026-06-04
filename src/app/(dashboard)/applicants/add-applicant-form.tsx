"use client";

import { useState, useTransition } from "react";
import { createApplicant } from "@/actions/applicants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Loader2, CheckCircle } from "lucide-react";
import { AddressSplitInput } from "@/components/ui/postal-code-input";

export function AddApplicantForm({ onSaved }: { onSaved?: () => void } = {}) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    familyNameEn: "",
    givenNameEn: "",
    familyNameJa: "",
    givenNameJa: "",
    nationality: "",
    dateOfBirth: "",
    gender: "",
    passportNumber: "",
    passportExpiry: "",
    residenceCardNumber: "",
    phone: "",
    emailAddress: "",
    postalCode: "",
    japanPrefecture: "",
    japanCity: "",
    japanAddressLine: "",
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
        await createApplicant(form);
        setSuccess(true);
        setForm({
          familyNameEn: "", givenNameEn: "", familyNameJa: "", givenNameJa: "",
          nationality: "", dateOfBirth: "", gender: "", passportNumber: "",
          passportExpiry: "", residenceCardNumber: "", phone: "", emailAddress: "",
          postalCode: "", japanPrefecture: "", japanCity: "", japanAddressLine: "",
        });
        if (onSaved) setTimeout(onSaved, 800);
      } catch (err: any) {
        setError(err.message ?? "登録に失敗しました");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          申請人を新規登録
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
            <label className="block text-xs font-medium text-gray-600 mb-1">氏名（英）<span className="text-red-500">*</span></label>
            <input
              value={`${form.familyNameEn} ${form.givenNameEn}`.trim()}
              onChange={(e) => {
                const parts = e.target.value.split(/\s+/);
                setForm(prev => ({
                  ...prev,
                  familyNameEn: parts[0] || "",
                  givenNameEn: parts.slice(1).join(" ") || "",
                }));
                setSuccess(false);
                setError("");
              }}
              required
              placeholder="YAMADA TARO"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">氏名（日）</label>
            <input
              value={`${form.familyNameJa} ${form.givenNameJa}`.trim()}
              onChange={(e) => {
                const val = e.target.value;
                const parts = val.split(/\s+/);
                setForm(prev => ({
                  ...prev,
                  familyNameJa: parts[0] || "",
                  givenNameJa: parts.slice(1).join(" ") || "",
                }));
                setSuccess(false);
                setError("");
              }}
              placeholder="山田 太郎"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">国籍<span className="text-red-500">*</span></label>
            <input name="nationality" value={form.nationality} onChange={handleChange} required placeholder="中国" className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">生年月日</label>
              <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">性別</label>
              <select name="gender" value={form.gender} onChange={handleChange} className="input-field">
                <option value="">選択</option>
                <option value="M">男</option>
                <option value="F">女</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">パスポート番号</label>
            <input name="passportNumber" value={form.passportNumber} onChange={handleChange} placeholder="AA1234567" className="input-field font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">パスポート有効期限</label>
            <input name="passportExpiry" type="date" value={form.passportExpiry} onChange={handleChange} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">在留カード番号</label>
            <input name="residenceCardNumber" value={form.residenceCardNumber} onChange={handleChange} placeholder="AA12345678CD" className="input-field font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">連絡先メール</label>
            <input name="emailAddress" type="email" value={form.emailAddress} onChange={handleChange} className="input-field" />
          </div>
          <AddressSplitInput
            value={{
              postalCode: form.postalCode,
              prefecture: form.japanPrefecture,
              city: form.japanCity,
              addressLine: form.japanAddressLine,
            }}
            onChange={(fields) => setForm(prev => ({
              ...prev,
              ...(fields.postalCode !== undefined && { postalCode: fields.postalCode }),
              ...(fields.prefecture !== undefined && { japanPrefecture: fields.prefecture }),
              ...(fields.city !== undefined && { japanCity: fields.city }),
              ...(fields.addressLine !== undefined && { japanAddressLine: fields.addressLine }),
            }))}
            inputClassName="input-field w-full"
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />登録中...</> : "申請人を登録"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
