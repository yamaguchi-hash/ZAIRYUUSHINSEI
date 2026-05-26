"use client";

import { useState, useTransition } from "react";
import { updateApplicant } from "@/actions/applicants";
import { VISA_TYPE_LABELS } from "@/lib/utils";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface EditApplicantFormProps {
  applicant: {
    id: string;
    familyNameEn: string;
    givenNameEn: string;
    familyNameJa: string | null;
    givenNameJa: string | null;
    nationality: string;
    dateOfBirth: string | null;
    gender: string | null;
    passportNumber: string | null;
    passportExpiry: string | null;
    residenceCardNumber: string | null;
    currentVisaType: string | null;
    currentVisaExpiry: string | null;
    phone: string | null;
    emailAddress: string | null;
    japanAddress: string | null;
  };
}

export function EditApplicantForm({ applicant }: EditApplicantFormProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    familyNameEn: applicant.familyNameEn,
    givenNameEn: applicant.givenNameEn,
    familyNameJa: applicant.familyNameJa ?? "",
    givenNameJa: applicant.givenNameJa ?? "",
    nationality: applicant.nationality,
    dateOfBirth: applicant.dateOfBirth ?? "",
    gender: applicant.gender ?? "",
    passportNumber: applicant.passportNumber ?? "",
    passportExpiry: applicant.passportExpiry ?? "",
    residenceCardNumber: applicant.residenceCardNumber ?? "",
    currentVisaType: applicant.currentVisaType ?? "",
    currentVisaExpiry: applicant.currentVisaExpiry ?? "",
    phone: applicant.phone ?? "",
    emailAddress: applicant.emailAddress ?? "",
    japanAddress: applicant.japanAddress ?? "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setStatus("idle");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateApplicant(applicant.id, form);
        setStatus("success");
        setMessage("保存しました");
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message ?? "保存に失敗しました");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {status === "success" && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
          <CheckCircle className="w-4 h-4" /> {message}
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          <AlertCircle className="w-4 h-4" /> {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">姓（英）<span className="text-red-500">*</span></label>
          <input name="familyNameEn" value={form.familyNameEn} onChange={handleChange} required className="input-field text-sm py-1.5" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">名（英）<span className="text-red-500">*</span></label>
          <input name="givenNameEn" value={form.givenNameEn} onChange={handleChange} required className="input-field text-sm py-1.5" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">姓（日）</label>
          <input name="familyNameJa" value={form.familyNameJa} onChange={handleChange} className="input-field text-sm py-1.5" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">名（日）</label>
          <input name="givenNameJa" value={form.givenNameJa} onChange={handleChange} className="input-field text-sm py-1.5" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">国籍<span className="text-red-500">*</span></label>
          <input name="nationality" value={form.nationality} onChange={handleChange} required className="input-field text-sm py-1.5" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">生年月日</label>
          <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} className="input-field text-sm py-1.5" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">性別</label>
          <select name="gender" value={form.gender} onChange={handleChange} className="input-field text-sm py-1.5">
            <option value="">—</option>
            <option value="M">男</option>
            <option value="F">女</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
          <input name="phone" value={form.phone} onChange={handleChange} className="input-field text-sm py-1.5" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">パスポート番号</label>
        <input name="passportNumber" value={form.passportNumber} onChange={handleChange} className="input-field text-sm py-1.5 font-mono" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">パスポート有効期限</label>
        <input name="passportExpiry" type="date" value={form.passportExpiry} onChange={handleChange} className="input-field text-sm py-1.5" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">在留カード番号</label>
        <input name="residenceCardNumber" value={form.residenceCardNumber} onChange={handleChange} className="input-field text-sm py-1.5 font-mono" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">現在の在留資格</label>
          <select name="currentVisaType" value={form.currentVisaType} onChange={handleChange} className="input-field text-sm py-1.5">
            <option value="">—</option>
            {Object.entries(VISA_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">在留期限</label>
          <input name="currentVisaExpiry" type="date" value={form.currentVisaExpiry} onChange={handleChange} className="input-field text-sm py-1.5" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
        <input name="emailAddress" type="email" value={form.emailAddress} onChange={handleChange} className="input-field text-sm py-1.5" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">日本の住所</label>
        <input name="japanAddress" value={form.japanAddress} onChange={handleChange} className="input-field text-sm py-1.5" />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
      >
        {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</> : "変更を保存する"}
      </button>
    </form>
  );
}
