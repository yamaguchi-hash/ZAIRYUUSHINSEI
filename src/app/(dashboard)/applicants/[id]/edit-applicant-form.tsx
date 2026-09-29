"use client";

import { useState, useTransition, useEffect } from "react";
import { updateApplicant } from "@/actions/applicants";
import { VISA_TYPE_LABELS, isWorkVisaType } from "@/lib/utils";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { AddressSplitInput } from "@/components/ui/postal-code-input";
import { PREFECTURES } from "@/lib/prefectures";
import { MAJOR_CATEGORIES_UNIVERSITY, MAJOR_CATEGORIES_VOCATIONAL } from "@/lib/form-types";
import { Plus, Trash2 } from "lucide-react";

/** 最終学歴（申請書作成の教育欄と同じキー構成。src/lib/effective-form-data.ts の EDUCATION_KEYS と揃える） */
interface EducationHistoryData {
  educationCountry: string;
  educationDegree: string;
  educationSchoolName: string;
  educationGraduationDate: string;
  majorCategory: string;
  majorCategoryOther: string;
  itQualificationExists: string;
  itQualificationName: string;
}

/** 職歴の1件（申請書作成の WorkHistoryEntry と同じ形） */
interface WorkHistoryEntry {
  joinDate: string;
  leaveDate: string;
  employer: string;
  country: string;
  employerNameEnExists: string;
  employerNameEn: string;
  employerNameKanjiExists: string;
  employerNameKanji: string;
}

const EMPTY_WORK_HISTORY_ROW: WorkHistoryEntry = {
  joinDate: "", leaveDate: "", employer: "", country: "",
  employerNameEnExists: "", employerNameEn: "", employerNameKanjiExists: "", employerNameKanji: "",
};

const EMPTY_EDUCATION: EducationHistoryData = {
  educationCountry: "", educationDegree: "", educationSchoolName: "", educationGraduationDate: "",
  majorCategory: "", majorCategoryOther: "", itQualificationExists: "", itQualificationName: "",
};

interface EditApplicantFormProps {
  applicant: {
    educationHistory?: unknown;
    workHistory?: unknown;
    id: string;
    familyNameEn: string;
    givenNameEn: string;
    familyNameJa: string | null;
    givenNameJa: string | null;
    nationality: string;
    dateOfBirth: string | null;
    gender: string | null;
    maritalStatus?: string | null;
    passportNumber: string | null;
    passportExpiry: string | null;
    residenceCardNumber: string | null;
    currentVisaType: string | null;
    currentVisaExpiry: string | null;
    organizationId: string | null;
    supporterId?: string | null;
    phone: string | null;
    mobilePhone: string | null;
    emailAddress: string | null;
    postalCode?: string | null;
    japanPrefecture?: string | null;
    japanCity?: string | null;
    japanAddressLine?: string | null;
    japanAddress: string | null;
    placeOfBirth?: string | null;
    homeCountryAddress?: string | null;
  };
  organizations: { id: string; nameJa: string }[];
  supporters: { id: string; familyNameEn: string; givenNameEn: string; nationality: string }[];
}

export function EditApplicantForm({ applicant, organizations, supporters }: EditApplicantFormProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // japanAddress から都道府県・市区町村・住所を抽出するヘルパー
  const extractAddressComponents = () => {
    const hasSplitFields = !!(applicant.japanPrefecture || applicant.japanCity || applicant.japanAddressLine);

    if (hasSplitFields) {
      // 既に分割されているデータを使用
      return {
        prefix: applicant.japanPrefecture ?? "",
        city: applicant.japanCity ?? "",
        addressLine: applicant.japanAddressLine ?? "",
      };
    }

    // japanAddress から自動分割（古いデータ形式）
    const address = applicant.japanAddress ?? "";

    if (!address) {
      return { prefix: "", city: "", addressLine: "" };
    }

    const prefMatch = PREFECTURES.find(p => address.startsWith(p));

    if (!prefMatch) {
      return { prefix: "", city: "", addressLine: address };
    }

    const rest = address.substring(prefMatch.length);
    // 最初の3-5文字を市区町村として抽出（簡易的な方法）
    const cityMatch = rest.match(/^[ぁ-ん一-龥々〆〤〥ーa-zA-Z0-9]+[市区町村]?/);
    const city = cityMatch ? cityMatch[0] : rest.substring(0, 3);
    const addressLine = rest.substring(city.length);

    return { prefix: prefMatch, city, addressLine };
  };

  const { prefix, city, addressLine } = extractAddressComponents();

  const initialEducation: EducationHistoryData = {
    ...EMPTY_EDUCATION,
    ...(applicant.educationHistory && typeof applicant.educationHistory === "object" && !Array.isArray(applicant.educationHistory)
      ? (applicant.educationHistory as Partial<EducationHistoryData>)
      : {}),
  };
  const initialWorkHistory: WorkHistoryEntry[] = Array.isArray(applicant.workHistory)
    ? (applicant.workHistory as WorkHistoryEntry[])
    : [];

  const [education, setEducation] = useState<EducationHistoryData>(initialEducation);
  const [workHistory, setWorkHistory] = useState<WorkHistoryEntry[]>(initialWorkHistory);

  function handleEducationChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setEducation((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setStatus("idle");
  }
  function updateWorkHistoryRow(idx: number, key: keyof WorkHistoryEntry, value: string) {
    setWorkHistory((prev) => prev.map((w, i) => {
      if (i !== idx) return w;
      const updated = { ...w, [key]: value };
      // 勤務先名称の入力欄は廃止し、機関名（英語表記／漢字表記等）から自動的に反映する
      // （印刷・転記シート等、既存のemployerフィールドを参照する箇所との互換性のため）
      if (key === "employerNameEn" || key === "employerNameKanji") {
        updated.employer = updated.employerNameKanji || updated.employerNameEn || "";
      }
      return updated;
    }));
    setStatus("idle");
  }
  function addWorkHistoryRow() {
    setWorkHistory((prev) => [...prev, { ...EMPTY_WORK_HISTORY_ROW }]);
  }
  function removeWorkHistoryRow(idx: number) {
    setWorkHistory((prev) => prev.filter((_, i) => i !== idx));
  }

  const [form, setForm] = useState({
    familyNameEn: applicant.familyNameEn,
    givenNameEn: applicant.givenNameEn,
    familyNameJa: applicant.familyNameJa ?? "",
    givenNameJa: applicant.givenNameJa ?? "",
    nationality: applicant.nationality,
    dateOfBirth: applicant.dateOfBirth ?? "",
    gender: applicant.gender ?? "",
    maritalStatus: applicant.maritalStatus ?? "",
    passportNumber: applicant.passportNumber ?? "",
    passportExpiry: applicant.passportExpiry ?? "",
    residenceCardNumber: applicant.residenceCardNumber ?? "",
    currentVisaType: applicant.currentVisaType ?? "",
    currentVisaExpiry: applicant.currentVisaExpiry ?? "",
    organizationId: applicant.organizationId ?? "",
    phone: applicant.phone ?? "",
    mobilePhone: applicant.mobilePhone ?? "",
    emailAddress: applicant.emailAddress ?? "",
    postalCode: applicant.postalCode ?? "",
    japanPrefecture: prefix,
    japanCity: city,
    japanAddressLine: addressLine,
    japanAddress: applicant.japanAddress ?? "",
    placeOfBirth: applicant.placeOfBirth ?? "",
    homeCountryAddress: applicant.homeCountryAddress ?? "",
    supporterId: applicant.supporterId ?? "",
  });

  // 在留カード更新パネルでのマスター上書き（router.refresh()）後、
  // このフォームのローカルStateにも最新の在留カード番号・在留期限を反映する。
  // useStateの初期値はマウント時のpropsしか見ないため、refresh時のprops更新を
  // 明示的に同期しないと旧値が残り、誤って「変更を保存する」で上書きされてしまう。
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      residenceCardNumber: applicant.residenceCardNumber ?? "",
      currentVisaExpiry: applicant.currentVisaExpiry ?? "",
    }));
  }, [applicant.residenceCardNumber, applicant.currentVisaExpiry]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setStatus("idle");
  }

  const isWorkVisa = isWorkVisaType(form.currentVisaType);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await updateApplicant(applicant.id, {
          ...form,
          japanPrefecture: form.japanPrefecture,
          japanCity: form.japanCity,
          japanAddressLine: form.japanAddressLine,
          // 非就労資格の場合は所属機関の紐付けを残さない（データの汚染防止）
          organizationId: isWorkVisa ? (form.organizationId || null) : null,
          supporterId: form.currentVisaType === "dependent" ? (form.supporterId || null) : null,
          educationHistory: education,
          // 完全に空の行は保存しない（申請書作成側のsaveApplicationFormDataと同じ絞り込み）
          workHistory: workHistory.filter((w) =>
            w.joinDate || w.leaveDate || w.employer || w.country || w.employerNameEn || w.employerNameKanji
          ),
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
            setStatus("idle");
          }}
          required
          placeholder="YAMADA TARO"
          className="input-field text-sm py-1.5"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">氏名（日）</label>
        <input
          value={`${form.familyNameJa} ${form.givenNameJa}`.trim()}
          onChange={(e) => {
            const parts = e.target.value.split(/\s+/);
            setForm(prev => ({
              ...prev,
              familyNameJa: parts[0] || "",
              givenNameJa: parts.slice(1).join(" ") || "",
            }));
            setStatus("idle");
          }}
          placeholder="山田 太郎"
          className="input-field text-sm py-1.5"
        />
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
          <label className="block text-xs font-medium text-gray-600 mb-1">婚姻の有無（配偶者の有無）</label>
          <select name="maritalStatus" value={form.maritalStatus} onChange={handleChange} className="input-field text-sm py-1.5">
            <option value="">—</option>
            <option value="有">有（既婚）</option>
            <option value="無">無（未婚）</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="03-0000-0000" className="input-field text-sm py-1.5" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">携帯番号</label>
        <input name="mobilePhone" value={form.mobilePhone} onChange={handleChange} placeholder="090-0000-0000" className="input-field text-sm py-1.5" />
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
      {isWorkVisa && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
          <label className="block text-xs font-medium text-blue-700 mb-1">
            所属機関（受入企業）<span className="text-red-500">*</span>
          </label>
          <select name="organizationId" value={form.organizationId} onChange={handleChange} className="input-field text-sm py-1.5 bg-white">
            <option value="">選択してください</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.nameJa}</option>
            ))}
          </select>
          <p className="text-xs text-blue-600 mt-1">就労資格のため、所属機関の登録を推奨します。</p>
        </div>
      )}
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
      {form.currentVisaType === "dependent" && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
          <label className="block text-xs font-medium text-purple-700 mb-1">
            扶養者（スポンサー）
          </label>
          <select name="supporterId" value={form.supporterId} onChange={handleChange} className="input-field text-sm py-1.5 bg-white">
            <option value="">— 選択してください —</option>
            {supporters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.familyNameEn} {s.givenNameEn}（{s.nationality}）
              </option>
            ))}
          </select>
          <p className="text-xs text-purple-600 mt-1">家族滞在のため、スポンサーとなる扶養者を登録できます。</p>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">出生地</label>
        <input name="placeOfBirth" value={form.placeOfBirth} onChange={handleChange} placeholder="北京市" className="input-field text-sm py-1.5" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">本国における居住地</label>
        <input name="homeCountryAddress" value={form.homeCountryAddress} onChange={handleChange} placeholder="中国北京市朝陽区〇〇路1番" className="input-field text-sm py-1.5" />
      </div>

      {/* 最終学歴・職歴（申請書作成画面と共有される） */}
      <div className="border-t border-gray-200 pt-3 mt-1">
        <p className="text-xs font-semibold text-gray-500 mb-2">
          最終学歴・職歴
          <span className="text-gray-400 font-normal ml-1">（申請書作成画面に自動反映されます）</span>
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">学校の所在国</label>
            <select name="educationCountry" value={education.educationCountry} onChange={handleEducationChange} className="input-field text-sm py-1.5">
              <option value="">—</option>
              <option value="本邦（日本）">本邦（日本）</option>
              <option value="外国">外国</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">学位・区分</label>
            <select name="educationDegree" value={education.educationDegree} onChange={handleEducationChange} className="input-field text-sm py-1.5">
              <option value="">—</option>
              <option value="大学院（博士）">大学院（博士）</option>
              <option value="大学院（修士）">大学院（修士）</option>
              <option value="大学">大学</option>
              <option value="短期大学">短期大学</option>
              <option value="専門学校">専門学校</option>
              <option value="高等学校">高等学校</option>
              <option value="中学校">中学校</option>
              <option value="その他">その他</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">学校名</label>
            <input name="educationSchoolName" value={education.educationSchoolName} onChange={handleEducationChange} className="input-field text-sm py-1.5" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">卒業年月日</label>
            <input name="educationGraduationDate" type="date" value={education.educationGraduationDate} onChange={handleEducationChange} className="input-field text-sm py-1.5" />
          </div>
        </div>
        <div className="mt-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {education.educationDegree === "専門学校" ? "専攻分野（専門学校）" : "専攻・専門分野"}
          </label>
          {education.educationDegree === "大学院（博士）" || education.educationDegree === "大学院（修士）" || education.educationDegree === "大学" || education.educationDegree === "短期大学" ? (
            <select name="majorCategory" value={education.majorCategory} onChange={handleEducationChange} className="input-field text-sm py-1.5">
              <option value="">選択してください</option>
              {MAJOR_CATEGORIES_UNIVERSITY.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : education.educationDegree === "専門学校" ? (
            <select name="majorCategory" value={education.majorCategory} onChange={handleEducationChange} className="input-field text-sm py-1.5">
              <option value="">選択してください</option>
              {MAJOR_CATEGORIES_VOCATIONAL.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input name="majorCategory" value={education.majorCategory} onChange={handleEducationChange} placeholder="例: 情報工学" className="input-field text-sm py-1.5" />
          )}
          {["その他人文・社会科学", "その他自然科学", "その他"].includes(education.majorCategory) && (
            <div className="mt-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">その他の詳細</label>
              <input name="majorCategoryOther" value={education.majorCategoryOther} onChange={handleEducationChange} className="input-field text-sm py-1.5" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">情報処理技術者資格又は試験合格の有無</label>
            <select name="itQualificationExists" value={education.itQualificationExists} onChange={handleEducationChange} className="input-field text-sm py-1.5">
              <option value="">—</option>
              <option value="有">有</option>
              <option value="無">無</option>
            </select>
          </div>
          {education.itQualificationExists === "有" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">資格名又は試験名</label>
              <input name="itQualificationName" value={education.itQualificationName} onChange={handleEducationChange} placeholder="例: 基本情報技術者試験" className="input-field text-sm py-1.5" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 mb-1">
          <label className="block text-xs font-medium text-gray-600">職歴（外国におけるものを含む）</label>
          <button type="button" onClick={addWorkHistoryRow} className="inline-flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
            <Plus className="w-3 h-3" />追加
          </button>
        </div>
        {workHistory.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">「追加」で職歴を入力してください</p>
        ) : (
          <div className="space-y-2">
            {workHistory.map((w, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-2.5 relative">
                <button type="button" onClick={() => removeWorkHistoryRow(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">入社年月</label>
                    <input type="month" value={w.joinDate} onChange={(e) => updateWorkHistoryRow(idx, "joinDate", e.target.value)} className="input-field text-sm py-1.5" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">退社年月</label>
                    <input type="month" value={w.leaveDate} onChange={(e) => updateWorkHistoryRow(idx, "leaveDate", e.target.value)} className="input-field text-sm py-1.5" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">国・地域</label>
                    <input value={w.country} onChange={(e) => updateWorkHistoryRow(idx, "country", e.target.value)} className="input-field text-sm py-1.5" />
                  </div>
                  <div />
                  <div className="flex gap-2 items-end">
                    <div className="w-24 flex-none">
                      <label className="block text-[11px] text-gray-500 mb-1">機関名（英語表記）の有無</label>
                      <select value={w.employerNameEnExists} onChange={(e) => updateWorkHistoryRow(idx, "employerNameEnExists", e.target.value)} className="input-field text-sm py-1.5">
                        <option value="">—</option>
                        <option value="有">有</option>
                        <option value="無">無</option>
                      </select>
                    </div>
                    {w.employerNameEnExists === "有" && (
                      <div className="flex-1">
                        <label className="block text-[11px] text-gray-500 mb-1">機関名（英語表記）</label>
                        <input value={w.employerNameEn} onChange={(e) => updateWorkHistoryRow(idx, "employerNameEn", e.target.value)} className="input-field text-sm py-1.5" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="w-24 flex-none">
                      <label className="block text-[11px] text-gray-500 mb-1">機関名（漢字表記等）の有無</label>
                      <select value={w.employerNameKanjiExists} onChange={(e) => updateWorkHistoryRow(idx, "employerNameKanjiExists", e.target.value)} className="input-field text-sm py-1.5">
                        <option value="">—</option>
                        <option value="有">有</option>
                        <option value="無">無</option>
                      </select>
                    </div>
                    {w.employerNameKanjiExists === "有" && (
                      <div className="flex-1">
                        <label className="block text-[11px] text-gray-500 mb-1">機関名（漢字表記等）</label>
                        <input value={w.employerNameKanji} onChange={(e) => updateWorkHistoryRow(idx, "employerNameKanji", e.target.value)} className="input-field text-sm py-1.5" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
