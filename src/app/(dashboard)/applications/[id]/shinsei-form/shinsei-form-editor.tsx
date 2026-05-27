"use client";

import { useState } from "react";
import { saveApplicationFormData, prefillApplicationFormData } from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Sparkles, User, Building2, GraduationCap, Briefcase, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplicationFormData, FamilyMember } from "@/lib/form-types";

interface Props {
  applicationId: string;
  initialForm: ApplicationFormData;
  applicationType: string;
  userRole?: string;
}

// ── フィールド入力コンポーネント ─────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";
const selectCls = "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";
const textareaCls = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white resize-y";

export function ShinseiFormEditor({ applicationId, initialForm, applicationType, userRole }: Props) {
  const [form, setForm] = useState<ApplicationFormData>(initialForm);
  const [activeTab, setActiveTab] = useState<"p1" | "p2" | "org" | "statement">("p1");
  const [isSaving, setIsSaving] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  function set(key: keyof ApplicationFormData, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaveMsg("");
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveMsg("");
    const result = await saveApplicationFormData(applicationId, form as Record<string, any>);
    setSaveMsg(result.success ? "✓ 保存しました" : `エラー: ${result.error}`);
    setIsSaving(false);
  }

  async function handlePrefill() {
    setIsPrefilling(true);
    setSaveMsg("");
    const result = await prefillApplicationFormData(applicationId);
    if (result.success && result.formData) {
      setForm(result.formData as ApplicationFormData);
      setSaveMsg("✓ 自動入力が完了しました");
    } else {
      setSaveMsg(`エラー: ${result.error}`);
    }
    setIsPrefilling(false);
  }

  // 在日親族の追加・削除
  function addFamilyMember() {
    set("familyInJapan", [...(form.familyInJapan ?? []), {
      relationship: "", name: "", dateOfBirth: "", nationality: "",
      placeOfEmployment: "", residingTogether: false, residenceCardNumber: "",
    }]);
  }
  function updateFamilyMember(idx: number, key: keyof FamilyMember, value: any) {
    const updated = (form.familyInJapan ?? []).map((m, i) => i === idx ? { ...m, [key]: value } : m);
    set("familyInJapan", updated);
  }
  function removeFamilyMember(idx: number) {
    set("familyInJapan", (form.familyInJapan ?? []).filter((_, i) => i !== idx));
  }

  const tabs = [
    { key: "p1", label: "申請人 Part 1", sub: "基本情報・在留資格" },
    { key: "p2", label: "申請人 Part 2", sub: "学歴・勤務先・給与" },
    { key: "org", label: "所属機関", sub: "機関情報・採用理由" },
    { key: "statement", label: "申請理由書", sub: "自由記載" },
  ] as const;

  return (
    <div>
      {/* ツールバー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={handlePrefill}
            disabled={isPrefilling}
            className="inline-flex items-center gap-1.5 border border-purple-200 bg-purple-50 text-purple-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-purple-100 disabled:opacity-50"
          >
            {isPrefilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AIで自動入力
          </button>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={cn("text-xs", saveMsg.startsWith("エラー") ? "text-red-600" : "text-green-600")}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <div>{t.label}</div>
            <div className="text-xs font-normal text-gray-400">{t.sub}</div>
          </button>
        ))}
      </div>

      {/* ══ Part 1: 申請人基本情報 ═════════════════════════════════════════════ */}
      {activeTab === "p1" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4" />基本情報</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="国籍・地域" required><input className={inputCls} value={form.nationality} onChange={e => set("nationality", e.target.value)} placeholder="例: 中国" /></Field>
              <Field label="生年月日" required><input className={inputCls} type="date" value={form.dateOfBirth} onChange={e => set("dateOfBirth", e.target.value)} /></Field>
              <Field label="氏名（ローマ字・姓）" required><input className={inputCls} value={form.familyNameEn} onChange={e => set("familyNameEn", e.target.value)} placeholder="YAMADA" /></Field>
              <Field label="氏名（ローマ字・名）" required><input className={inputCls} value={form.givenNameEn} onChange={e => set("givenNameEn", e.target.value)} placeholder="TARO" /></Field>
              <Field label="氏名（漢字・姓）"><input className={inputCls} value={form.familyNameJa} onChange={e => set("familyNameJa", e.target.value)} placeholder="山田" /></Field>
              <Field label="氏名（漢字・名）"><input className={inputCls} value={form.givenNameJa} onChange={e => set("givenNameJa", e.target.value)} placeholder="太郎" /></Field>
              <Field label="性別" required>
                <select className={selectCls} value={form.sex} onChange={e => set("sex", e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="男">男（Male）</option>
                  <option value="女">女（Female）</option>
                </select>
              </Field>
              <Field label="配偶者の有無">
                <select className={selectCls} value={form.maritalStatus} onChange={e => set("maritalStatus", e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="有">有（Married）</option>
                  <option value="無">無（Single）</option>
                </select>
              </Field>
              <Field label="出生地"><input className={inputCls} value={form.placeOfBirth} onChange={e => set("placeOfBirth", e.target.value)} placeholder="例: 北京市" /></Field>
              <Field label="職業"><input className={inputCls} value={form.occupation} onChange={e => set("occupation", e.target.value)} placeholder="例: 会社員" /></Field>
              <Field label="本国における居住地" ><input className={inputCls} value={form.homeTownCity} onChange={e => set("homeTownCity", e.target.value)} placeholder="本国の住所" /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">日本における連絡先</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="住居地（日本）" required>
                <input className={inputCls} value={form.addressInJapan} onChange={e => set("addressInJapan", e.target.value)} placeholder="〒000-0000 東京都..." />
              </Field>
              <Field label="電話番号"><input className={inputCls} value={form.telephoneNo} onChange={e => set("telephoneNo", e.target.value)} placeholder="03-0000-0000" /></Field>
              <Field label="携帯電話番号"><input className={inputCls} value={form.cellularPhoneNo} onChange={e => set("cellularPhoneNo", e.target.value)} placeholder="090-0000-0000" /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">パスポート・在留資格</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="パスポート番号" required><input className={inputCls} value={form.passportNumber} onChange={e => set("passportNumber", e.target.value)} placeholder="AB1234567" /></Field>
              <Field label="パスポート有効期限" required><input className={inputCls} type="date" value={form.passportExpiry} onChange={e => set("passportExpiry", e.target.value)} /></Field>
              <Field label="現在の在留資格" required><input className={inputCls} value={form.currentStatusOfResidence} onChange={e => set("currentStatusOfResidence", e.target.value)} placeholder="技術・人文知識・国際業務" /></Field>
              <Field label="在留期間"><input className={inputCls} value={form.currentPeriodOfStay} onChange={e => set("currentPeriodOfStay", e.target.value)} placeholder="3年" /></Field>
              <Field label="在留期間満了日" required><input className={inputCls} type="date" value={form.currentPeriodExpiry} onChange={e => set("currentPeriodExpiry", e.target.value)} /></Field>
              <Field label="在留カード番号" required><input className={inputCls} value={form.residenceCardNumber} onChange={e => set("residenceCardNumber", e.target.value)} placeholder="AA12345678AB" /></Field>
              {(applicationType === "change") && (
                <>
                  <Field label="希望する在留資格" required><input className={inputCls} value={form.desiredStatusOfResidence} onChange={e => set("desiredStatusOfResidence", e.target.value)} /></Field>
                  <Field label="希望する在留期間"><input className={inputCls} value={form.desiredPeriodOfStay} onChange={e => set("desiredPeriodOfStay", e.target.value)} placeholder="3年" /></Field>
                </>
              )}
              <div className="sm:col-span-2">
                <Field label={applicationType === "change" ? "変更の理由" : "更新の理由"} required>
                  <textarea className={textareaCls} rows={3} value={form.reasonForApplication} onChange={e => set("reasonForApplication", e.target.value)} placeholder="申請の理由を記入してください" />
                </Field>
              </div>
              <Field label="犯罪を理由とする処分を受けたことの有無">
                <select className={selectCls} value={form.criminalRecord} onChange={e => set("criminalRecord", e.target.value)}>
                  <option value="無">無（No）</option>
                  <option value="有">有（Yes）</option>
                </select>
              </Field>
              {form.criminalRecord === "有" && (
                <Field label="犯罪記録の詳細">
                  <input className={inputCls} value={form.criminalRecordDetail} onChange={e => set("criminalRecordDetail", e.target.value)} />
                </Field>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">在日親族及び同居者</CardTitle>
                <button onClick={addFamilyMember} className="inline-flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
                  <Plus className="w-3 h-3" />追加
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {(form.familyInJapan ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">在日親族・同居者がいない場合は空欄のままにしてください</p>
              ) : (
                <div className="space-y-4">
                  {(form.familyInJapan ?? []).map((m, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 relative">
                      <button onClick={() => removeFamilyMember(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <Field label="続柄"><input className={inputCls} value={m.relationship} onChange={e => updateFamilyMember(idx, "relationship", e.target.value)} placeholder="配偶者・子 等" /></Field>
                        <Field label="氏名"><input className={inputCls} value={m.name} onChange={e => updateFamilyMember(idx, "name", e.target.value)} /></Field>
                        <Field label="生年月日"><input className={inputCls} type="date" value={m.dateOfBirth} onChange={e => updateFamilyMember(idx, "dateOfBirth", e.target.value)} /></Field>
                        <Field label="国籍"><input className={inputCls} value={m.nationality} onChange={e => updateFamilyMember(idx, "nationality", e.target.value)} /></Field>
                        <Field label="勤務先・通学先"><input className={inputCls} value={m.placeOfEmployment} onChange={e => updateFamilyMember(idx, "placeOfEmployment", e.target.value)} /></Field>
                        <Field label="在留カード番号"><input className={inputCls} value={m.residenceCardNumber} onChange={e => updateFamilyMember(idx, "residenceCardNumber", e.target.value)} /></Field>
                        <Field label="同居有無">
                          <select className={selectCls} value={m.residingTogether ? "yes" : "no"} onChange={e => updateFamilyMember(idx, "residingTogether", e.target.value === "yes")}>
                            <option value="yes">同居</option>
                            <option value="no">別居</option>
                          </select>
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ Part 2: 学歴・勤務先・給与 ═══════════════════════════════════════ */}
      {activeTab === "p2" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Briefcase className="w-4 h-4" />勤務先情報</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="勤務先名称" required><input className={inputCls} value={form.employerName} onChange={e => set("employerName", e.target.value)} /></Field>
              <Field label="支店・事業所名"><input className={inputCls} value={form.employerBranchName} onChange={e => set("employerBranchName", e.target.value)} /></Field>
              <Field label="勤務先所在地" required><input className={inputCls} value={form.employerAddress} onChange={e => set("employerAddress", e.target.value)} /></Field>
              <Field label="勤務先電話番号"><input className={inputCls} value={form.employerPhone} onChange={e => set("employerPhone", e.target.value)} /></Field>
              <Field label="職務上の地位（役職）"><input className={inputCls} value={form.position} onChange={e => set("position", e.target.value)} placeholder="例: エンジニア、SE" /></Field>
              <Field label="通算在職年数"><input className={inputCls} value={form.yearsOfService} onChange={e => set("yearsOfService", e.target.value)} placeholder="例: 2年3ヶ月" /></Field>
              <Field label="月額給与（円）" required><input className={inputCls} value={form.monthlySalary} onChange={e => set("monthlySalary", e.target.value)} placeholder="例: 300000" /></Field>
              <Field label="年額給与（円）"><input className={inputCls} value={form.annualSalary} onChange={e => set("annualSalary", e.target.value)} placeholder="例: 3600000" /></Field>
              <Field label="給与形態">
                <select className={selectCls} value={form.salaryType} onChange={e => set("salaryType", e.target.value)}>
                  <option value="月給">月給</option>
                  <option value="年俸">年俸</option>
                  <option value="日給">日給</option>
                  <option value="時給">時給</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="業務内容の概要" required>
                  <textarea className={textareaCls} rows={4} value={form.jobDescription} onChange={e => set("jobDescription", e.target.value)} placeholder="担当する業務内容を具体的に記入してください" />
                </Field>
              </div>
              <Field label="資格等（IT資格・語学資格等）">
                <input className={inputCls} value={form.qualifications} onChange={e => set("qualifications", e.target.value)} placeholder="例: 基本情報技術者試験、TOEIC 800点" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="w-4 h-4" />最終学歴</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="学校の所在国">
                <select className={selectCls} value={form.educationCountry} onChange={e => set("educationCountry", e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="日本">日本</option>
                  <option value="外国">外国</option>
                </select>
              </Field>
              <Field label="学位・区分">
                <select className={selectCls} value={form.educationDegree} onChange={e => set("educationDegree", e.target.value)}>
                  <option value="">選択してください</option>
                  <option value="博士">博士（Doctor）</option>
                  <option value="修士">修士（Master）</option>
                  <option value="学士">学士（Bachelor）</option>
                  <option value="短大">短大（Junior college）</option>
                  <option value="高専">高専（College of technology）</option>
                  <option value="専門学校">専門学校（Vocational school）</option>
                  <option value="高校">高校（Senior high school）</option>
                  <option value="その他">その他（Others）</option>
                </select>
              </Field>
              <Field label="学校名" required><input className={inputCls} value={form.educationSchoolName} onChange={e => set("educationSchoolName", e.target.value)} /></Field>
              <Field label="卒業年月日"><input className={inputCls} type="date" value={form.educationGraduationDate} onChange={e => set("educationGraduationDate", e.target.value)} /></Field>
              <Field label="専攻・専門分野">
                <input className={inputCls} value={form.majorField} onChange={e => set("majorField", e.target.value)} placeholder="例: 情報工学、コンピュータサイエンス" />
              </Field>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ 所属機関等作成用 ══════════════════════════════════════════════════ */}
      {activeTab === "org" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="w-4 h-4" />所属機関情報</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="機関の名称" required><input className={inputCls} value={form.orgName} onChange={e => set("orgName", e.target.value)} /></Field>
              <Field label="法人番号（13桁）"><input className={inputCls} value={form.orgCorporateNumber} onChange={e => set("orgCorporateNumber", e.target.value)} placeholder="1234567890123" maxLength={13} /></Field>
              <Field label="支店・事業所名"><input className={inputCls} value={form.orgBranchName} onChange={e => set("orgBranchName", e.target.value)} /></Field>
              <Field label="雇用保険適用事業所番号"><input className={inputCls} value={form.orgEmploymentInsuranceNo} onChange={e => set("orgEmploymentInsuranceNo", e.target.value)} placeholder="00-000000-0" /></Field>
              <Field label="事業内容（業種）" required><input className={inputCls} value={form.orgBusinessType} onChange={e => set("orgBusinessType", e.target.value)} placeholder="例: 情報通信業" /></Field>
              <Field label="機関の所在地" required><input className={inputCls} value={form.orgAddress} onChange={e => set("orgAddress", e.target.value)} /></Field>
              <Field label="電話番号"><input className={inputCls} value={form.orgPhone} onChange={e => set("orgPhone", e.target.value)} /></Field>
              <Field label="資本金（円）"><input className={inputCls} value={form.orgCapital} onChange={e => set("orgCapital", e.target.value)} placeholder="例: 10000000" /></Field>
              <Field label="年間売上高（円）"><input className={inputCls} value={form.orgAnnualSales} onChange={e => set("orgAnnualSales", e.target.value)} placeholder="例: 500000000" /></Field>
              <Field label="職員数（全体）"><input className={inputCls} value={form.orgEmployeeCount} onChange={e => set("orgEmployeeCount", e.target.value)} placeholder="例: 50" /></Field>
              <Field label="職員数（外国人）"><input className={inputCls} value={form.orgForeignEmployeeCount} onChange={e => set("orgForeignEmployeeCount", e.target.value)} placeholder="例: 5" /></Field>
              <Field label="契約の形態">
                <select className={selectCls} value={form.contractType} onChange={e => set("contractType", e.target.value)}>
                  <option value="雇用">雇用（Employment）</option>
                  <option value="委任">委任（Entrustment）</option>
                  <option value="請負">請負（Service contract）</option>
                  <option value="その他">その他（Others）</option>
                </select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">雇用条件</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="雇用契約開始日"><input className={inputCls} type="date" value={form.contractStartDate} onChange={e => set("contractStartDate", e.target.value)} /></Field>
              <Field label="雇用契約終了日（無期は空欄）"><input className={inputCls} type="date" value={form.contractEndDate} onChange={e => set("contractEndDate", e.target.value)} /></Field>
              <Field label="就労開始予定日"><input className={inputCls} type="date" value={form.workStartDate} onChange={e => set("workStartDate", e.target.value)} /></Field>
              <Field label="退職金制度">
                <select className={selectCls} value={form.severancePay} onChange={e => set("severancePay", e.target.value)}>
                  <option value="有">有（Yes）</option>
                  <option value="無">無（No）</option>
                </select>
              </Field>
              <Field label="健康保険">
                <select className={selectCls} value={form.healthInsurance} onChange={e => set("healthInsurance", e.target.value)}>
                  <option value="有">有（Yes）</option>
                  <option value="無">無（No）</option>
                </select>
              </Field>
              <Field label="厚生年金">
                <select className={selectCls} value={form.welfarePension} onChange={e => set("welfarePension", e.target.value)}>
                  <option value="有">有（Yes）</option>
                  <option value="無">無（No）</option>
                </select>
              </Field>
              <Field label="雇用保険">
                <select className={selectCls} value={form.employmentInsurance} onChange={e => set("employmentInsurance", e.target.value)}>
                  <option value="有">有（Yes）</option>
                  <option value="無">無（No）</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="採用理由" required>
                  <textarea className={textareaCls} rows={4} value={form.reasonForHiring} onChange={e => set("reasonForHiring", e.target.value)} placeholder="採用に至った理由・経緯を記入してください" />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">派遣先（派遣の場合のみ）</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="派遣先名称"><input className={inputCls} value={form.dispatchSiteName} onChange={e => set("dispatchSiteName", e.target.value)} /></Field>
              <Field label="派遣先所在地"><input className={inputCls} value={form.dispatchSiteAddress} onChange={e => set("dispatchSiteAddress", e.target.value)} /></Field>
              <Field label="派遣先電話番号"><input className={inputCls} value={form.dispatchSitePhone} onChange={e => set("dispatchSitePhone", e.target.value)} /></Field>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ 申請理由書 ═══════════════════════════════════════════════════════ */}
      {activeTab === "statement" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">申請理由書（自由記載）</CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              在留期間更新・変更の必要性・活動内容・今後の計画等を詳細に記載してください。
              AIが生成した下書きを参照し、内容を最終調整してください。
            </p>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white resize-y leading-relaxed"
              rows={20}
              value={form.applicationStatement}
              onChange={e => set("applicationStatement", e.target.value)}
              placeholder="申請理由を記入してください..."
            />
            <p className="text-xs text-gray-400 mt-2">
              ※ この申請理由書は、申請書に添付する別紙として使用します。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 下部保存ボタン */}
      <div className="mt-6 flex justify-end gap-3">
        {saveMsg && (
          <span className={cn("text-sm flex items-center", saveMsg.startsWith("エラー") ? "text-red-600" : "text-green-600")}>
            {saveMsg}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存
        </button>
      </div>
    </div>
  );
}
