"use client";

import { useState, useTransition } from "react";
import { updateApplicant } from "@/actions/applicants";
import { VISA_TYPE_LABELS } from "@/lib/utils";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { AddressSplitInput } from "@/components/ui/postal-code-input";

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
    postalCode?: string | null;
    japanPrefecture?: string | null;
    japanCity?: string | null;
    japanAddressLine?: string | null;
    japanAddress: string | null;
  };
}

export function EditApplicantForm({ applicant }: EditApplicantFormProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // japanAddress から都道府県・市区町村・住所を抽出するヘルパー
  const extractAddressComponents = () => {
    const hasSplitFields = !!(applicant.japanPrefecture || applicant.japanCity || applicant.japanAddressLine);

    if (hasSplitFields) {
      // 既に分割されているデータを使用
      console.log("[EditApplicantForm] Using split fields:", {
        prefix: applicant.japanPrefecture,
        city: applicant.japanCity,
        addressLine: applicant.japanAddressLine
      });
      return {
        prefix: applicant.japanPrefecture ?? "",
        city: applicant.japanCity ?? "",
        addressLine: applicant.japanAddressLine ?? "",
      };
    }

    // japanAddress から自動分割（古いデータ形式）
    const PREFECTURES = [
      "北海道","青森県","青森県","岩手県","宮城県","秋田県","山形県","福島県",
      "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
      "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
      "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
      "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
      "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
      "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
    ];

    const address = applicant.japanAddress ?? "";
    console.log("[EditApplicantForm] Extracting from japanAddress:", address);

    if (!address) {
      console.log("[EditApplicantForm] Empty address");
      return { prefix: "", city: "", addressLine: "" };
    }

    const prefMatch = PREFECTURES.find(p => address.startsWith(p));

    if (!prefMatch) {
      console.log("[EditApplicantForm] No prefecture match found");
      return { prefix: "", city: "", addressLine: address };
    }

    const rest = address.substring(prefMatch.length);
    // 最初の3-5文字を市区町村として抽出（簡易的な方法）
    const cityMatch = rest.match(/^[ぁ-ん一-龥々〆〤〥ーa-zA-Z0-9]+[市区町村]?/);
    const city = cityMatch ? cityMatch[0] : rest.substring(0, 3);
    const addressLine = rest.substring(city.length);

    console.log("[EditApplicantForm] Extracted:", { prefix: prefMatch, city, addressLine });
    return { prefix: prefMatch, city, addressLine };
  };

  const { prefix, city, addressLine } = extractAddressComponents();

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
    postalCode: applicant.postalCode ?? "",
    japanPrefecture: prefix,
    japanCity: city,
    japanAddressLine: addressLine,
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
        await updateApplicant(applicant.id, {
          ...form,
          japanPrefecture: form.japanPrefecture,
          japanCity: form.japanCity,
          japanAddressLine: form.japanAddressLine,
        });
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
        inputClassName="input-field text-sm py-1.5 w-full"
        labelClassName="block text-xs font-medium text-gray-600 mb-1"
      />

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
