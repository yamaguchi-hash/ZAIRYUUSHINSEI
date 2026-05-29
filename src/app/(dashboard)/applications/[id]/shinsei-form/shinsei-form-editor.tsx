"use client";

import { useState } from "react";
import { saveApplicationFormData, prefillApplicationFormData, extractMarriageNotificationFromDocs } from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2, Save, Sparkles, User, Building2, GraduationCap, Briefcase,
  Plus, Trash2, FileText, Settings, Heart, GraduationCap as School, ScanText,
} from "lucide-react";
import { SectionExtractButton } from "@/components/applications/section-extract-button";
import { cn } from "@/lib/utils";
import { AddressSplitInput } from "@/components/ui/postal-code-input";
import type { ApplicationFormData, WorkHistoryEntry, FamilyMember, ApplicationFormType, VisaFormCategory } from "@/lib/form-types";
import {
  FORM_TYPE_LABELS, PURPOSE_OF_ENTRY_OPTIONS,
  MAJOR_CATEGORIES_UNIVERSITY, MAJOR_CATEGORIES_VOCATIONAL,
  BUSINESS_TYPES, VISA_CATEGORY_NEEDS_ORG, VISA_CATEGORY_PART2,
} from "@/lib/form-types";

interface Props {
  applicationId: string;
  initialForm: ApplicationFormData;
  applicationType: string;
  userRole?: string;
}

const inputCls = "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";
const selectCls = "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";
const textareaCls = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white resize-y";

function Field({ label, required, note, children }: { label: string; required?: boolean; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {note && <span className="text-gray-400 font-normal ml-1">（{note}）</span>}
      </label>
      {children}
    </div>
  );
}

function RadioGroup({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex items-center gap-4 text-sm flex-wrap">
      {options.map(o => (
        <label key={o} className="flex items-center gap-1 cursor-pointer">
          <input type="radio" value={o} checked={value === o} onChange={() => onChange(o)} className="text-blue-600" />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}

// 在留資格カテゴリのラベル
const CATEGORY_LABELS: Record<VisaFormCategory, string> = {
  N: 'N型 — 技術・人文知識・国際業務 / 研究 / 高度専門職 / 介護 / 技能',
  M: 'M型 — 経営・管理',
  L: 'L型 — 企業内転勤 / 報道 / 研究（転勤）',
  I: 'I型 — 教授 / 教育',
  J: 'J型 — 芸術 / 文化活動',
  K: 'K型 — 宗教',
  O: 'O型 — 興行',
  P: 'P型 — 留学',
  Q: 'Q型 — 研修',
  R: 'R型 — 家族滞在 / 特定活動（家族）',
  T: 'T型 — 日本人の配偶者等 / 永住者の配偶者等 / 定住者',
  V: 'V型 — 特定技能（1号・2号）',
  Y: 'Y型 — 技能実習（1号〜3号）',
  H: 'H型 — 短期滞在',
  U: 'U型 — その他',
};

type TabKey = "meta" | "p1a" | "p1b" | "p2" | "org1" | "org2" | "statement";

export function ShinseiFormEditor({ applicationId, initialForm, applicationType, userRole }: Props) {
  const [form, setForm] = useState<ApplicationFormData>(initialForm);
  const [tab, setTab] = useState<TabKey>("meta");
  const [isSaving, setIsSaving] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [isExtractingMarriage, setIsExtractingMarriage] = useState(false);
  const [marriageMsg, setMarriageMsg] = useState("");
  const [msg, setMsg] = useState("");

  // 申請書種別
  const isCoe = form.applicationFormType === 'coe';
  const isChange = form.applicationFormType === 'change';
  const isExtension = form.applicationFormType === 'extension';

  // 在留資格カテゴリ
  const cat = form.visaFormCategory;
  const isNtype = ['N', 'L', 'I', 'V'].includes(cat);  // 就労系N型フォーム使用
  const isTtype = cat === 'T';                           // 日本人配偶者等
  const isRtype = cat === 'R';                           // 家族滞在
  const isPtype = cat === 'P';                           // 留学
  const needsOrg = VISA_CATEGORY_NEEDS_ORG[cat];
  const part2Type = VISA_CATEGORY_PART2[cat];

  // COEの場合の項目番号オフセット
  const p2Offset = isCoe ? 5 : 0;  // COE: +5 (22起点), Change/Extension: +0 (17起点)
  const orgDispatchNo = isCoe ? 12 : 11;  // COE:12, Change/Extension:11

  function set<K extends keyof ApplicationFormData>(key: K, value: ApplicationFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setMsg("");
  }

  function updateWorkHistory(idx: number, key: keyof WorkHistoryEntry, value: string) {
    const updated = (form.workHistory ?? []).map((w, i) => i === idx ? { ...w, [key]: value } : w);
    set("workHistory", updated);
  }
  function addWorkHistory() {
    set("workHistory", [...(form.workHistory ?? []), { joinDate: '', leaveDate: '', employer: '' }]);
  }
  function removeWorkHistory(idx: number) {
    set("workHistory", (form.workHistory ?? []).filter((_, i) => i !== idx));
  }

  function updateFamilyMember(idx: number, key: keyof FamilyMember, value: any) {
    const updated = (form.familyInJapan ?? []).map((m, i) => i === idx ? { ...m, [key]: value } : m);
    set("familyInJapan", updated);
  }
  function addFamilyMember() {
    set("familyInJapan", [...(form.familyInJapan ?? []), {
      relationship: '', name: '', dateOfBirth: '', nationality: '',
      placeOfEmployment: '', residingTogether: false, residenceCardNumber: '',
    }]);
  }
  function removeFamilyMember(idx: number) {
    set("familyInJapan", (form.familyInJapan ?? []).filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setIsSaving(true);
    const result = await saveApplicationFormData(applicationId, form as Record<string, any>);
    setMsg(result.success ? "✓ 保存しました" : `エラー: ${result.error}`);
    setIsSaving(false);
  }

  // 書類抽出結果をフォームにマージ
  function applyExtracted(data: Record<string, any>) {
    setForm(prev => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined && v !== "") {
          (next as any)[k] = v;
        }
      }
      return next;
    });
    setMsg("✓ 書類から読み取りました");
  }

  async function handleExtractMarriage() {
    setIsExtractingMarriage(true);
    setMarriageMsg("");
    const result = await extractMarriageNotificationFromDocs(applicationId);
    if (result.success && result.data) {
      const d = result.data;
      setForm(prev => ({
        ...prev,
        ...(d.marriageNotificationPlaceJapan   ? { marriageNotificationPlaceJapan:   d.marriageNotificationPlaceJapan   } : {}),
        ...(d.marriageNotificationDateJapan    ? { marriageNotificationDateJapan:    d.marriageNotificationDateJapan    } : {}),
        ...(d.marriageNotificationPlaceForeign ? { marriageNotificationPlaceForeign: d.marriageNotificationPlaceForeign } : {}),
        ...(d.marriageNotificationDateForeign  ? { marriageNotificationDateForeign:  d.marriageNotificationDateForeign  } : {}),
      }));
      const found = [d.marriageNotificationPlaceJapan, d.marriageNotificationDateJapan, d.marriageNotificationPlaceForeign, d.marriageNotificationDateForeign].filter(Boolean);
      setMarriageMsg(`✓ ${result.docsChecked}件確認・${found.length}項目を入力しました`);
    } else {
      setMarriageMsg(`⚠ ${result.error ?? "読み取りに失敗しました"}`);
    }
    setIsExtractingMarriage(false);
  }

  async function handlePrefill() {
    setIsPrefilling(true);
    const result = await prefillApplicationFormData(applicationId);
    if (result.success && result.formData) {
      setForm(result.formData as ApplicationFormData);
      setMsg("✓ AIで自動入力しました");
    } else {
      setMsg(`エラー: ${result.error}`);
    }
    setIsPrefilling(false);
  }

  const tabs: { key: TabKey; label: string; sub: string; show?: boolean }[] = [
    { key: "meta",      label: "申請書設定",       sub: "様式・在留資格種別" },
    { key: "p1a",       label: "申請人 Part 1a",   sub: "基本情報・旅券" },
    { key: "p1b",       label: "申請人 Part 1b",   sub: "在留資格・家族" },
    { key: "p2",        label: "申請人 Part 2",    sub: part2Type === 'N' ? "学歴・勤務先" : part2Type === 'T' ? "配偶者情報" : part2Type === 'R' ? "扶養者情報" : part2Type === 'P' ? "学校情報" : "補足情報" },
    { key: "org1",      label: "所属機関 Part 1",  sub: needsOrg ? "機関情報・雇用条件" : "（不要）", show: needsOrg },
    { key: "org2",      label: "所属機関 Part 2",  sub: needsOrg ? `派遣先等（項目${orgDispatchNo}）` : "（不要）", show: needsOrg },
    { key: "statement", label: "申請理由書",        sub: "別紙・自由記載" },
  ];

  return (
    <div>
      {/* ツールバー */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <button onClick={handlePrefill} disabled={isPrefilling}
          className="inline-flex items-center gap-1.5 border border-purple-200 bg-purple-50 text-purple-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-purple-100 disabled:opacity-50">
          {isPrefilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          AIで自動入力
        </button>
        <div className="flex items-center gap-3">
          {msg && <span className={cn("text-xs", msg.startsWith("エラー") ? "text-red-600" : "text-green-600")}>{msg}</span>}
          <button onClick={handleSave} disabled={isSaving}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}保存
          </button>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto gap-0">
        {tabs.filter(t => t.show !== false).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("flex-shrink-0 px-4 py-2.5 text-xs border-b-2 transition-colors text-left",
              tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}>
            <div className="font-semibold">{t.label}</div>
            <div className="text-gray-400">{t.sub}</div>
          </button>
        ))}
      </div>

      {/* ══ 申請書設定 ══════════════════════════════════════════════════════════ */}
      {tab === "meta" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings className="w-4 h-4" />申請書の種類を選択してください</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <Field label="申請書種類（様式番号）" required>
                <div className="space-y-2">
                  {(["coe", "change", "extension", "permanent"] as ApplicationFormType[]).map(ft => (
                    <label key={ft} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                      <input type="radio" value={ft} checked={form.applicationFormType === ft}
                        onChange={() => set("applicationFormType", ft)} className="mt-0.5 text-blue-600" />
                      <span className="text-sm">{FORM_TYPE_LABELS[ft]}</span>
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="在留資格の種類（フォーム区分）" required>
                <select className={selectCls} value={form.visaFormCategory}
                  onChange={e => set("visaFormCategory", e.target.value as VisaFormCategory)}>
                  {(Object.entries(CATEGORY_LABELS) as [VisaFormCategory, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>

              <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 space-y-1">
                <p className="font-semibold">選択中：{FORM_TYPE_LABELS[form.applicationFormType]}</p>
                <p className="text-xs text-blue-700">在留資格区分：{CATEGORY_LABELS[form.visaFormCategory]}</p>
                <p className="text-xs text-blue-600">
                  申請人 Part 2：
                  {part2Type === 'N' ? 'N型（就労系：学歴・勤務先・職歴）' :
                   part2Type === 'T' ? 'T型（配偶者等：配偶者/日本人情報）' :
                   part2Type === 'R' ? 'R型（家族滞在：扶養者情報）' :
                   part2Type === 'P' ? 'P型（留学：学校・費用支弁）' : '補足メモ欄のみ'}
                  　|　所属機関等作成用：{needsOrg ? '必要' : '不要'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ 申請人 Part 1a — 基本情報・旅券 ══════════════════════════════════════ */}
      {tab === "p1a" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4" />基本情報（項目 1〜{isCoe || isChange ? '8' : '7'}）</CardTitle>
                <SectionExtractButton applicationId={applicationId} sectionKey="basic" onExtracted={applyExtracted} />
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="1. 国籍・地域" required>
                <input className={inputCls} value={form.nationality} onChange={e => set("nationality", e.target.value)} placeholder="例: 中国 / China" />
              </Field>
              <Field label="2. 生年月日" required>
                <input className={inputCls} type="date" value={form.dateOfBirth} onChange={e => set("dateOfBirth", e.target.value)} />
              </Field>
              <Field label="3. 氏名 — Family Name（ローマ字）" required>
                <input className={inputCls} value={form.familyNameEn} onChange={e => set("familyNameEn", e.target.value)} placeholder="YAMADA" />
              </Field>
              <Field label="3. 氏名 — Given Name（ローマ字）" required>
                <input className={inputCls} value={form.givenNameEn} onChange={e => set("givenNameEn", e.target.value)} placeholder="TARO" />
              </Field>
              <Field label="3. 氏名（漢字・姓）">
                <input className={inputCls} value={form.familyNameJa} onChange={e => set("familyNameJa", e.target.value)} placeholder="山田" />
              </Field>
              <Field label="3. 氏名（漢字・名）">
                <input className={inputCls} value={form.givenNameJa} onChange={e => set("givenNameJa", e.target.value)} placeholder="太郎" />
              </Field>
              <Field label="4. 性別" required>
                <RadioGroup value={form.sex} onChange={v => set("sex", v)} options={["男", "女"]} />
              </Field>

              {/* 出生地は COE/Change のみ（項目5）。Extension は項目5=配偶者の有無のため不要 */}
              {(isCoe || isChange) && (
                <Field label="5. 出生地">
                  <input className={inputCls} value={form.placeOfBirth} onChange={e => set("placeOfBirth", e.target.value)} placeholder="例: 北京市 / Beijing" />
                </Field>
              )}

              <Field label={`${isCoe || isChange ? '6' : '5'}. 配偶者の有無`}>
                <RadioGroup value={form.maritalStatus} onChange={v => set("maritalStatus", v)} options={["有", "無"]} />
              </Field>
              <Field label={`${isCoe || isChange ? '7' : '6'}. 職業`}>
                <input className={inputCls} value={form.occupation} onChange={e => set("occupation", e.target.value)} placeholder="例: 会社員 / Company Employee" />
              </Field>
              <div className="sm:col-span-2">
                <Field label={`${isCoe || isChange ? '8' : '7'}. 本国における居住地`}>
                  <input className={inputCls} value={form.homeTownCity} onChange={e => set("homeTownCity", e.target.value)} placeholder="本国での住所" />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isCoe ? '9' : '8'}. 日本における連絡先</CardTitle>
                <SectionExtractButton applicationId={applicationId} sectionKey="contact" onExtracted={applyExtracted} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddressSplitInput
                value={{
                  postalCode: form.postalCodeInJapan ?? '',
                  prefecture: form.prefectureInJapan ?? '',
                  city: form.cityInJapan ?? '',
                  addressLine: form.addressLineInJapan ?? '',
                }}
                onChange={(fields) => {
                  if (fields.postalCode !== undefined) set("postalCodeInJapan", fields.postalCode);
                  if (fields.prefecture !== undefined) set("prefectureInJapan", fields.prefecture);
                  if (fields.city !== undefined) set("cityInJapan", fields.city);
                  if (fields.addressLine !== undefined) set("addressLineInJapan", fields.addressLine);
                  // addressInJapan を自動結合（印刷用）
                  const p = fields.prefecture ?? form.prefectureInJapan ?? '';
                  const c = fields.city ?? form.cityInJapan ?? '';
                  const a = fields.addressLine ?? form.addressLineInJapan ?? '';
                  set("addressInJapan", `${p}${c}${a}`);
                }}
                inputClassName={inputCls}
                labelClassName="block text-xs font-medium text-gray-600 mb-1"
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="電話番号">
                  <input className={inputCls} value={form.telephoneNo} onChange={e => set("telephoneNo", e.target.value)} placeholder="03-0000-0000" />
                </Field>
                <Field label="携帯電話番号">
                  <input className={inputCls} value={form.cellularPhoneNo} onChange={e => set("cellularPhoneNo", e.target.value)} placeholder="090-0000-0000" />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isCoe ? '10' : '9'}. 旅券（パスポート）</CardTitle>
                <SectionExtractButton applicationId={applicationId} sectionKey="passport" onExtracted={applyExtracted} />
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="(1) 旅券番号" required>
                <input className={inputCls} value={form.passportNumber} onChange={e => set("passportNumber", e.target.value)} placeholder="AB1234567" />
              </Field>
              <Field label="(2) 有効期限" required>
                <input className={inputCls} type="date" value={form.passportExpiry} onChange={e => set("passportExpiry", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ 申請人 Part 1b — 在留資格・犯罪・家族 ══════════════════════════════ */}
      {tab === "p1b" && (
        <div className="space-y-6">
          {/* ── COE 固有（項目11〜20） ─────────────────────────── */}
          {isCoe && (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">入国目的・入国予定（項目 11〜16）</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="11. 入国目的（在留資格を選択）" required>
                      <select className={selectCls} value={form.purposeOfEntry}
                        onChange={e => {
                          const opt = PURPOSE_OF_ENTRY_OPTIONS.find(o => o.value === e.target.value);
                          set("purposeOfEntry", e.target.value);
                          if (opt) set("visaFormCategory", opt.category);
                        }}>
                        <option value="">選択してください</option>
                        {PURPOSE_OF_ENTRY_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    {form.purposeOfEntry && (
                      <p className="text-xs text-blue-600 mt-1">→ フォーム区分が「{form.visaFormCategory}型」に自動設定されました</p>
                    )}
                  </div>
                  <Field label="12. 入国予定年月日">
                    <input className={inputCls} type="date" value={form.scheduledDateOfEntry} onChange={e => set("scheduledDateOfEntry", e.target.value)} />
                  </Field>
                  <Field label="13. 上陸予定港">
                    <input className={inputCls} value={form.portOfEntry} onChange={e => set("portOfEntry", e.target.value)} placeholder="例: 成田国際空港" />
                  </Field>
                  <Field label="14. 滞在予定期間">
                    <input className={inputCls} value={form.intendedLengthOfStay} onChange={e => set("intendedLengthOfStay", e.target.value)} placeholder="例: 3年" />
                  </Field>
                  <Field label="15. 同伴者の有無">
                    <RadioGroup value={form.accompanyingPersons} onChange={v => set("accompanyingPersons", v)} options={["有", "無"]} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="16. 査証申請予定地">
                      <input className={inputCls} value={form.intendedPlaceForVisa} onChange={e => set("intendedPlaceForVisa", e.target.value)} placeholder="例: 在中国日本国大使館" />
                    </Field>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">過去の出入国歴・申請歴（項目 17〜18）</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="17. 過去の出入国歴">
                    <RadioGroup value={form.pastEntryHistory} onChange={v => set("pastEntryHistory", v)} options={["有", "無"]} />
                  </Field>
                  {form.pastEntryHistory === "有" && (
                    <>
                      <Field label="回数">
                        <input className={inputCls} value={form.pastEntryCount} onChange={e => set("pastEntryCount", e.target.value)} placeholder="例: 2回" />
                      </Field>
                      <Field label="直近（From）">
                        <input className={inputCls} type="date" value={form.pastEntryLatestFrom} onChange={e => set("pastEntryLatestFrom", e.target.value)} />
                      </Field>
                      <Field label="直近（To）">
                        <input className={inputCls} type="date" value={form.pastEntryLatestTo} onChange={e => set("pastEntryLatestTo", e.target.value)} />
                      </Field>
                    </>
                  )}
                  <Field label="18. 過去の在留資格認定証明書交付申請歴">
                    <RadioGroup value={form.pastCoeHistory} onChange={v => set("pastCoeHistory", v)} options={["有", "無"]} />
                  </Field>
                  {form.pastCoeHistory === "有" && (
                    <>
                      <Field label="回数">
                        <input className={inputCls} value={form.pastCoeCount} onChange={e => set("pastCoeCount", e.target.value)} placeholder="例: 1回" />
                      </Field>
                      <Field label="うち不交付回数">
                        <input className={inputCls} value={form.pastCoeNonIssuanceCount} onChange={e => set("pastCoeNonIssuanceCount", e.target.value)} placeholder="例: 0回" />
                      </Field>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Change固有（項目11〜14） ──────────────────────────── */}
          {isChange && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">現在の在留状況・変更申請（項目 11〜14）</CardTitle>
                  <SectionExtractButton applicationId={applicationId} sectionKey="status" onExtracted={applyExtracted} />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="11. 現在の在留資格" required>
                  <input className={inputCls} value={form.currentStatusOfResidence} onChange={e => set("currentStatusOfResidence", e.target.value)} placeholder="例: 技術・人文知識・国際業務" />
                </Field>
                <Field label="    在留期間">
                  <input className={inputCls} value={form.currentPeriodOfStay} onChange={e => set("currentPeriodOfStay", e.target.value)} placeholder="例: 3年" />
                </Field>
                <Field label="    在留期間の満了日" required>
                  <input className={inputCls} type="date" value={form.currentPeriodExpiry} onChange={e => set("currentPeriodExpiry", e.target.value)} />
                </Field>
                <Field label="12. 在留カード番号" required>
                  <input className={inputCls} value={form.residenceCardNumber} onChange={e => set("residenceCardNumber", e.target.value)} placeholder="AA12345678AB" />
                </Field>
                <Field label="13. 希望する在留資格" required>
                  <input className={inputCls} value={form.desiredStatusOfResidence} onChange={e => set("desiredStatusOfResidence", e.target.value)} />
                </Field>
                <Field label="    希望する在留期間">
                  <input className={inputCls} value={form.desiredPeriodOfStay} onChange={e => set("desiredPeriodOfStay", e.target.value)} placeholder="例: 3年" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="14. 変更の理由" required>
                    <textarea className={textareaCls} rows={3} value={form.reasonForApplication} onChange={e => set("reasonForApplication", e.target.value)} placeholder="変更の理由を記載してください" />
                  </Field>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Extension固有（項目11〜14） ─────────────────────────── */}
          {isExtension && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">現在の在留状況・更新申請（項目 11〜14）</CardTitle>
                  <SectionExtractButton applicationId={applicationId} sectionKey="status" onExtracted={applyExtracted} />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="11. 現在の在留資格" required>
                  <input className={inputCls} value={form.currentStatusOfResidence} onChange={e => set("currentStatusOfResidence", e.target.value)} placeholder="例: 技術・人文知識・国際業務" />
                </Field>
                <Field label="    在留期間">
                  <input className={inputCls} value={form.currentPeriodOfStay} onChange={e => set("currentPeriodOfStay", e.target.value)} placeholder="例: 3年" />
                </Field>
                <Field label="    在留期間の満了日" required>
                  <input className={inputCls} type="date" value={form.currentPeriodExpiry} onChange={e => set("currentPeriodExpiry", e.target.value)} />
                </Field>
                <Field label="12. 在留カード番号" required>
                  <input className={inputCls} value={form.residenceCardNumber} onChange={e => set("residenceCardNumber", e.target.value)} placeholder="AA12345678AB" />
                </Field>
                {/* ★ Extension 項目13: 希望する在留期間（在留資格は変わらないため「期間」のみ） */}
                <div className="sm:col-span-2">
                  <Field label="13. 希望する在留期間" note="審査の結果によって希望の期間とならない場合があります">
                    <input className={inputCls} value={form.desiredPeriodOfStay} onChange={e => set("desiredPeriodOfStay", e.target.value)} placeholder="例: 3年" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="14. 更新の理由" required>
                    <textarea className={textareaCls} rows={3} value={form.reasonForApplication} onChange={e => set("reasonForApplication", e.target.value)} placeholder="更新の理由を記載してください" />
                  </Field>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── 共通：犯罪記録・退去強制歴 ──────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isCoe ? "19. 犯罪記録" : isChange ? "15. 犯罪記録" : "15. 犯罪記録"}
                {isCoe && " / 20. 退去強制歴（COE専用）"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={`${isCoe ? "19" : "15"}. 犯罪を理由とする処分を受けたことの有無`} note="日本国外を含む。交通違反等を含む">
                <RadioGroup value={form.criminalRecord} onChange={v => set("criminalRecord", v)} options={["有", "無"]} />
              </Field>
              {form.criminalRecord === "有" && (
                <Field label="具体的内容">
                  <input className={inputCls} value={form.criminalRecordDetail} onChange={e => set("criminalRecordDetail", e.target.value)} />
                </Field>
              )}
              {isCoe && (
                <>
                  <Field label="20. 退去強制又は出国命令による出国の有無">
                    <RadioGroup value={form.deportationHistory} onChange={v => set("deportationHistory", v)} options={["有", "無"]} />
                  </Field>
                  {form.deportationHistory === "有" && (
                    <>
                      <Field label="回数">
                        <input className={inputCls} value={form.deportationCount} onChange={e => set("deportationCount", e.target.value)} />
                      </Field>
                      <Field label="直近の送還歴（年月日）">
                        <input className={inputCls} type="date" value={form.deportationLatestDate} onChange={e => set("deportationLatestDate", e.target.value)} />
                      </Field>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ── 共通：在日親族及び同居者 ─────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isCoe ? "21." : isChange ? "16." : "16."} 在日親族及び同居者</CardTitle>
                <div className="flex gap-2">
                  <button onClick={() => set("familyInJapanExists", form.familyInJapanExists === "有" ? "無" : "有")}
                    className={cn("text-xs px-2 py-1 rounded border",
                      form.familyInJapanExists === "有" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-500")}>
                    {form.familyInJapanExists === "有" ? "有（あり）" : "無（なし）"}
                  </button>
                  {form.familyInJapanExists === "有" && (
                    <button onClick={addFamilyMember} className="inline-flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
                      <Plus className="w-3 h-3" />追加
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            {form.familyInJapanExists === "有" && (
              <CardContent>
                {(form.familyInJapan ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">「追加」で在日親族を追加してください</p>
                ) : (
                  <div className="space-y-4">
                    {(form.familyInJapan ?? []).map((m, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3 relative">
                        <button onClick={() => removeFamilyMember(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <Field label="続柄"><input className={inputCls} value={m.relationship} onChange={e => updateFamilyMember(idx, "relationship", e.target.value)} placeholder="配偶者・子 等" /></Field>
                          <Field label="氏名"><input className={inputCls} value={m.name} onChange={e => updateFamilyMember(idx, "name", e.target.value)} /></Field>
                          <Field label="生年月日"><input className={inputCls} type="date" value={m.dateOfBirth} onChange={e => updateFamilyMember(idx, "dateOfBirth", e.target.value)} /></Field>
                          <Field label="国籍・地域"><input className={inputCls} value={m.nationality} onChange={e => updateFamilyMember(idx, "nationality", e.target.value)} /></Field>
                          <Field label="勤務先・通学先"><input className={inputCls} value={m.placeOfEmployment} onChange={e => updateFamilyMember(idx, "placeOfEmployment", e.target.value)} /></Field>
                          <Field label="在留カード番号"><input className={inputCls} value={m.residenceCardNumber} onChange={e => updateFamilyMember(idx, "residenceCardNumber", e.target.value)} /></Field>
                          <Field label="同居（予定）の有無">
                            <select className={selectCls} value={m.residingTogether ? "yes" : "no"} onChange={e => updateFamilyMember(idx, "residingTogether", e.target.value === "yes")}>
                              <option value="yes">有</option>
                              <option value="no">無</option>
                            </select>
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* ══ 申請人 Part 2 ════════════════════════════════════════════════════════ */}
      {tab === "p2" && (
        <div className="space-y-6">

          {/* ── N型 Part 2（就労系） ────────────────────────────────────────── */}
          {isNtype && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base"><Briefcase className="w-4 h-4" />{isCoe ? "22." : "17."} 勤務先</CardTitle>
                    <SectionExtractButton applicationId={applicationId} sectionKey="employer" onExtracted={applyExtracted} />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="(1) 名称（勤務先）" required><input className={inputCls} value={form.employerName} onChange={e => set("employerName", e.target.value)} /></Field>
                  <Field label="    支店・事業所名"><input className={inputCls} value={form.employerBranchName} onChange={e => set("employerBranchName", e.target.value)} /></Field>
                  <Field label="(2) 所在地（主たる勤務場所）"><input className={inputCls} value={form.employerAddress} onChange={e => set("employerAddress", e.target.value)} /></Field>
                  <Field label="(3) 電話番号"><input className={inputCls} value={form.employerPhone} onChange={e => set("employerPhone", e.target.value)} /></Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="w-4 h-4" />{isCoe ? "23." : "18."} 最終学歴</CardTitle>
                    <SectionExtractButton applicationId={applicationId} sectionKey="education" onExtracted={applyExtracted} />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="(1) 学校の所在国">
                    <RadioGroup value={form.educationCountry} onChange={v => set("educationCountry", v)} options={["本邦（日本）", "外国"]} />
                  </Field>
                  <Field label="(2) 学位・区分" required>
                    <select className={selectCls} value={form.educationDegree} onChange={e => set("educationDegree", e.target.value)}>
                      <option value="">選択してください</option>
                      <option value="大学院（博士）">大学院（博士）</option>
                      <option value="大学院（修士）">大学院（修士）</option>
                      <option value="大学">大学</option>
                      <option value="短期大学">短期大学</option>
                      <option value="高等専門学校">高等専門学校 College of technology</option>
                      <option value="専門学校">専門学校</option>
                      <option value="高等学校">高等学校</option>
                      <option value="中学校">中学校</option>
                      <option value="その他">その他 Others</option>
                    </select>
                  </Field>
                  <Field label="(3) 学校名" required><input className={inputCls} value={form.educationSchoolName} onChange={e => set("educationSchoolName", e.target.value)} /></Field>
                  <Field label="(4) 卒業年月日"><input className={inputCls} type="date" value={form.educationGraduationDate} onChange={e => set("educationGraduationDate", e.target.value)} /></Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">{isCoe ? "24." : "19."} 専攻・専門分野</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {['大学院（博士）','大学院（修士）','大学','短期大学','高等専門学校'].includes(form.educationDegree) ? (
                    <div className="sm:col-span-2">
                      <Field label="専攻分野（大学・短大・大学院）">
                        <select className={selectCls} value={form.majorCategory} onChange={e => set("majorCategory", e.target.value)}>
                          <option value="">選択してください</option>
                          {MAJOR_CATEGORIES_UNIVERSITY.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </Field>
                    </div>
                  ) : form.educationDegree === '専門学校' ? (
                    <div className="sm:col-span-2">
                      <Field label="専攻分野（専門学校）">
                        <select className={selectCls} value={form.majorCategory} onChange={e => set("majorCategory", e.target.value)}>
                          <option value="">選択してください</option>
                          {MAJOR_CATEGORIES_VOCATIONAL.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </Field>
                    </div>
                  ) : (
                    <Field label="専攻・専門分野（自由記載）">
                      <input className={inputCls} value={form.majorCategory} onChange={e => set("majorCategory", e.target.value)} />
                    </Field>
                  )}
                  {['その他人文・社会科学','その他自然科学','その他'].includes(form.majorCategory) && (
                    <Field label="その他の詳細">
                      <input className={inputCls} value={form.majorCategoryOther} onChange={e => set("majorCategoryOther", e.target.value)} />
                    </Field>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">{isCoe ? "25." : "20."} 情報処理技術者資格等（情報処理業務従事者のみ）</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="資格の有無">
                    <RadioGroup value={form.itQualificationExists} onChange={v => set("itQualificationExists", v)} options={["有", "無"]} />
                  </Field>
                  {form.itQualificationExists === "有" && (
                    <Field label="資格名又は試験名">
                      <input className={inputCls} value={form.itQualificationName} onChange={e => set("itQualificationName", e.target.value)} placeholder="例: 基本情報技術者試験" />
                    </Field>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{isCoe ? "26." : "21."} 職歴（外国におけるものを含む）</CardTitle>
                    <button onClick={addWorkHistory} className="inline-flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"><Plus className="w-3 h-3" />追加</button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(form.workHistory ?? []).map((w, idx) => (
                    <div key={idx} className="grid grid-cols-3 gap-2 items-end">
                      <Field label={`${idx + 1}. 入社年月`}><input className={inputCls} type="month" value={w.joinDate} onChange={e => updateWorkHistory(idx, "joinDate", e.target.value)} /></Field>
                      <Field label="退社年月（在職中は空欄）"><input className={inputCls} type="month" value={w.leaveDate} onChange={e => updateWorkHistory(idx, "leaveDate", e.target.value)} /></Field>
                      <div className="flex gap-1">
                        <div className="flex-1"><Field label="勤務先名称"><input className={inputCls} value={w.employer} onChange={e => updateWorkHistory(idx, "employer", e.target.value)} /></Field></div>
                        <button onClick={() => removeWorkHistory(idx)} className="mb-1 text-gray-300 hover:text-red-500 self-end"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                  {(form.workHistory ?? []).length === 0 && <p className="text-sm text-gray-400 text-center py-2">「追加」で職歴を入力してください</p>}
                </CardContent>
              </Card>
            </>
          )}

          {/* ── T型 Part 2（日本人配偶者等） ────────────────────────────────── */}
          {isTtype && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Heart className="w-4 h-4 text-red-500" />
                    配偶者等（日本人・永住者等）の情報
                  </CardTitle>
                  <p className="text-xs text-gray-500 mt-1">日本人の配偶者等・永住者の配偶者等・定住者の場合に記入</p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="氏名 Family Name（ローマ字）">
                    <input className={inputCls} value={form.spouseFamilyNameEn} onChange={e => set("spouseFamilyNameEn", e.target.value)} placeholder="YAMADA" />
                  </Field>
                  <Field label="氏名 Given Name（ローマ字）">
                    <input className={inputCls} value={form.spouseGivenNameEn} onChange={e => set("spouseGivenNameEn", e.target.value)} placeholder="HANAKO" />
                  </Field>
                  <Field label="氏名（漢字・姓）">
                    <input className={inputCls} value={form.spouseFamilyNameJa} onChange={e => set("spouseFamilyNameJa", e.target.value)} placeholder="山田" />
                  </Field>
                  <Field label="氏名（漢字・名）">
                    <input className={inputCls} value={form.spouseGivenNameJa} onChange={e => set("spouseGivenNameJa", e.target.value)} placeholder="花子" />
                  </Field>
                  <Field label="生年月日">
                    <input className={inputCls} type="date" value={form.spouseDob} onChange={e => set("spouseDob", e.target.value)} />
                  </Field>
                  <Field label="国籍・身分">
                    <select className={selectCls} value={form.spouseResidenceStatus} onChange={e => set("spouseResidenceStatus", e.target.value)}>
                      <option value="日本国籍">日本国籍</option>
                      <option value="永住者">永住者（在留カードあり）</option>
                      <option value="特別永住者">特別永住者</option>
                    </select>
                  </Field>
                  <Field label="在留カード番号 / 特別永住者証明書番号">
                    <input className={inputCls} value={form.spouseResidenceCard} onChange={e => set("spouseResidenceCard", e.target.value)} placeholder="AA12345678AB（日本国籍の場合は不要）" />
                  </Field>
                  <Field label="職業">
                    <input className={inputCls} value={form.spouseOccupation} onChange={e => set("spouseOccupation", e.target.value)} placeholder="例: 会社員" />
                  </Field>
                  <Field label="勤務先または通学先">
                    <input className={inputCls} value={form.spouseEmployer} onChange={e => set("spouseEmployer", e.target.value)} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="住所（日本）">
                      <input className={inputCls} value={form.spouseAddress} onChange={e => set("spouseAddress", e.target.value)} />
                    </Field>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">婚姻・家族関係</CardTitle>
                    <SectionExtractButton applicationId={applicationId} sectionKey="spouse" onExtracted={applyExtracted} />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="婚姻（届出）年月日">
                    <input className={inputCls} type="date" value={form.marriageDate} onChange={e => set("marriageDate", e.target.value)} />
                  </Field>
                  <Field label="婚姻届出市区町村名">
                    <input className={inputCls} value={form.marriageRegistrationPlace} onChange={e => set("marriageRegistrationPlace", e.target.value)} placeholder="例: 東京都渋谷区" />
                  </Field>
                  <Field label="同居の有無">
                    <RadioGroup value={form.cohabitation} onChange={v => set("cohabitation", v)} options={["有", "無"]} />
                  </Field>
                  {form.cohabitation === "無" && (
                    <div className="sm:col-span-2">
                      <Field label="別居理由">
                        <input className={inputCls} value={form.separationReason} onChange={e => set("separationReason", e.target.value)} />
                      </Field>
                    </div>
                  )}
                  {form.visaFormCategory === 'T' && (
                    <div className="sm:col-span-2">
                      <Field label="定住者の場合の根拠（定住者ビザの場合のみ）" note="例：日本人の実子、難民認定、特定の告示">
                        <textarea className={textareaCls} rows={2} value={form.longTermResidentReason} onChange={e => set("longTermResidentReason", e.target.value)} />
                      </Field>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ── R型 Part 2（家族滞在）─────────────────────────────────────────── */}
          {isRtype && (
            <>
              {/* 17. 婚姻・出生届出 */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Heart className="w-4 h-4 text-red-500" />
                        17. 婚姻・出生又は縁組の届出先及び届出年月日
                      </CardTitle>
                      <p className="text-xs text-gray-500 mt-1">配偶者→婚姻届、子→出生届又は縁組届</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={handleExtractMarriage}
                        disabled={isExtractingMarriage}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                        title="アップロード済み書類（婚姻証明書・戸籍謄本等）から届出情報を読み取ります"
                      >
                        {isExtractingMarriage
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <ScanText className="w-3.5 h-3.5" />}
                        {isExtractingMarriage ? "読み取り中..." : "書類から読み取る"}
                      </button>
                      {marriageMsg && (
                        <p className={cn("text-xs", marriageMsg.startsWith("✓") ? "text-green-600" : "text-amber-600")}>
                          {marriageMsg}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="(1) 日本国届出先">
                    <input className={inputCls} value={form.marriageNotificationPlaceJapan} onChange={e => set("marriageNotificationPlaceJapan", e.target.value)} placeholder="例: 東京都渋谷区" />
                  </Field>
                  <Field label="    届出年月日">
                    <input className={inputCls} type="date" value={form.marriageNotificationDateJapan} onChange={e => set("marriageNotificationDateJapan", e.target.value)} />
                  </Field>
                  <Field label="(2) 本国等届出先">
                    <input className={inputCls} value={form.marriageNotificationPlaceForeign} onChange={e => set("marriageNotificationPlaceForeign", e.target.value)} placeholder="例: 中国民政局" />
                  </Field>
                  <Field label="    届出年月日">
                    <input className={inputCls} type="date" value={form.marriageNotificationDateForeign} onChange={e => set("marriageNotificationDateForeign", e.target.value)} />
                  </Field>
                </CardContent>
              </Card>

              {/* 18. 滞在費支弁方法 */}
              <Card>
                <CardHeader><CardTitle className="text-base">18. 滞在費支弁方法</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-4 text-sm">
                    {['親族負担', '外国からの送金', '身元保証人負担', 'その他'].map(opt => (
                      <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" value={opt} checked={form.fundingMethod === opt}
                          onChange={() => set("fundingMethod", opt)} className="text-blue-600" />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                  {form.fundingMethod === 'その他' && (
                    <Field label="その他の詳細">
                      <input className={inputCls} value={form.fundingMethodOther} onChange={e => set("fundingMethodOther", e.target.value)} />
                    </Field>
                  )}
                </CardContent>
              </Card>

              {/* 19. 資格外活動の有無 */}
              <Card>
                <CardHeader><CardTitle className="text-base">19. 資格外活動の有無</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup value={form.partTimeWorkExistsR} onChange={v => set("partTimeWorkExistsR", v)} options={["有", "無"]} />
                  {form.partTimeWorkExistsR === "有" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                      <div className="sm:col-span-2">
                        <Field label="(1) 内容">
                          <input className={inputCls} value={form.partTimeWorkTypeR} onChange={e => set("partTimeWorkTypeR", e.target.value)} placeholder="例: 飲食店のアルバイト" />
                        </Field>
                      </div>
                      <Field label="(2) 名称">
                        <input className={inputCls} value={form.partTimeWorkOrgNameR} onChange={e => set("partTimeWorkOrgNameR", e.target.value)} />
                      </Field>
                      <Field label="    支店・事業所名">
                        <input className={inputCls} value={form.partTimeWorkBranchNameR} onChange={e => set("partTimeWorkBranchNameR", e.target.value)} />
                      </Field>
                      <Field label="    電話番号">
                        <input className={inputCls} value={form.partTimeWorkPhoneR} onChange={e => set("partTimeWorkPhoneR", e.target.value)} />
                      </Field>
                      <Field label="(3) 週間稼働時間" note="時間">
                        <input className={inputCls} value={form.partTimeWorkHoursR} onChange={e => set("partTimeWorkHoursR", e.target.value)} placeholder="例: 28" />
                      </Field>
                      <Field label="(4) 報酬（円）">
                        <div className="flex gap-2">
                          <input className={inputCls} value={form.partTimeWorkSalaryR} onChange={e => set("partTimeWorkSalaryR", e.target.value)} placeholder="例: 100000" />
                          <select className="text-sm border border-gray-300 rounded-lg px-2 bg-white" value={form.partTimeWorkSalaryTypeR} onChange={e => set("partTimeWorkSalaryTypeR", e.target.value)}>
                            <option value="月額">月額</option>
                            <option value="日額">日額</option>
                          </select>
                        </div>
                      </Field>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 扶養者情報（扶養者用Ｒ）*/}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <User className="w-4 h-4" />
                        扶養者の情報（扶養者用Ｒ）
                      </CardTitle>
                      <p className="text-xs text-gray-500 mt-1">別紙「扶養者等作成用 Part 1 R」に対応</p>
                    </div>
                    <SectionExtractButton applicationId={applicationId} sectionKey="supporter" onExtracted={applyExtracted} />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="(1) 氏名 Family Name（ローマ字）">
                    <input className={inputCls} value={form.supporterFamilyNameEn} onChange={e => set("supporterFamilyNameEn", e.target.value)} />
                  </Field>
                  <Field label="    氏名 Given Name（ローマ字）">
                    <input className={inputCls} value={form.supporterGivenNameEn} onChange={e => set("supporterGivenNameEn", e.target.value)} />
                  </Field>
                  <Field label="    氏名（漢字・姓）">
                    <input className={inputCls} value={form.supporterFamilyNameJa} onChange={e => set("supporterFamilyNameJa", e.target.value)} />
                  </Field>
                  <Field label="    氏名（漢字・名）">
                    <input className={inputCls} value={form.supporterGivenNameJa} onChange={e => set("supporterGivenNameJa", e.target.value)} />
                  </Field>
                  <Field label="(2) 生年月日">
                    <input className={inputCls} type="date" value={form.supporterDob} onChange={e => set("supporterDob", e.target.value)} />
                  </Field>
                  <Field label="(3) 国籍・地域">
                    <input className={inputCls} value={form.supporterNationality} onChange={e => set("supporterNationality", e.target.value)} placeholder="例: 日本" />
                  </Field>
                  <Field label="(4) 在留カード番号">
                    <input className={inputCls} value={form.supporterResidenceCard} onChange={e => set("supporterResidenceCard", e.target.value)} placeholder="日本国籍の場合は不要" />
                  </Field>
                  <Field label="(5) 在留資格">
                    <input className={inputCls} value={form.supporterStatusOfResidence} onChange={e => set("supporterStatusOfResidence", e.target.value)} placeholder="例: 技術・人文知識・国際業務" />
                  </Field>
                  <Field label="(6) 在留期間">
                    <input className={inputCls} value={form.supporterPeriodOfStay} onChange={e => set("supporterPeriodOfStay", e.target.value)} placeholder="例: 3年" />
                  </Field>
                  <Field label="(7) 在留期間の満了日">
                    <input className={inputCls} type="date" value={form.supporterPeriodExpiry} onChange={e => set("supporterPeriodExpiry", e.target.value)} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="(8) 申請人との関係（続柄）">
                      <div className="flex flex-wrap gap-4 text-sm">
                        {['夫', '妻', '父', '母', '養父', '養母', 'その他'].map(opt => (
                          <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" value={opt} checked={form.supporterRelationship === opt}
                              onChange={() => set("supporterRelationship", opt)} className="text-blue-600" />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                      {form.supporterRelationship === 'その他' && (
                        <input className={cn(inputCls, "mt-2")} value={form.supporterRelationshipOther} onChange={e => set("supporterRelationshipOther", e.target.value)} placeholder="その他の続柄を入力" />
                      )}
                    </Field>
                  </div>
                  <Field label="(9) 勤務先名称（留学生を除く）">
                    <input className={inputCls} value={form.supporterEmployer} onChange={e => set("supporterEmployer", e.target.value)} />
                  </Field>
                  <Field label="(10) 法人番号（13桁）">
                    <input className={inputCls} value={form.supporterCorporateNumber} onChange={e => set("supporterCorporateNumber", e.target.value)} placeholder="1234567890123" maxLength={13} />
                  </Field>
                  <Field label="(11) 支店・事業所名">
                    <input className={inputCls} value={form.supporterBranchName} onChange={e => set("supporterBranchName", e.target.value)} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="(12) 勤務先所在地">
                      <input className={inputCls} value={form.supporterAddress} onChange={e => set("supporterAddress", e.target.value)} />
                    </Field>
                  </div>
                  <Field label="(13) 年収（円）">
                    <input className={inputCls} value={form.supporterAnnualIncome} onChange={e => set("supporterAnnualIncome", e.target.value)} placeholder="例: 5000000" />
                  </Field>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── P型 Part 2（留学） ──────────────────────────────────────────── */}
          {isPtype && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <School className="w-4 h-4" />
                      在籍学校の情報（留学）
                    </CardTitle>
                    <SectionExtractButton applicationId={applicationId} sectionKey="school" onExtracted={applyExtracted} />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="学校名（Name of school）" required>
                      <input className={inputCls} value={form.schoolName} onChange={e => set("schoolName", e.target.value)} />
                    </Field>
                  </div>
                  <Field label="学校の種別">
                    <select className={selectCls} value={form.schoolType} onChange={e => set("schoolType", e.target.value)}>
                      <option value="">選択してください</option>
                      <option value="大学院">大学院</option>
                      <option value="大学">大学</option>
                      <option value="短期大学">短期大学</option>
                      <option value="高等専門学校">高等専門学校</option>
                      <option value="専門学校">専門学校（専修学校）</option>
                      <option value="高等学校">高等学校</option>
                      <option value="日本語学校">日本語学校</option>
                      <option value="その他">その他</option>
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="所在地">
                      <input className={inputCls} value={form.schoolAddress} onChange={e => set("schoolAddress", e.target.value)} />
                    </Field>
                  </div>
                  <Field label="電話番号">
                    <input className={inputCls} value={form.schoolPhone} onChange={e => set("schoolPhone", e.target.value)} />
                  </Field>
                  <Field label="在籍コース・専攻">
                    <input className={inputCls} value={form.courseOfStudy} onChange={e => set("courseOfStudy", e.target.value)} placeholder="例: 情報工学専攻 博士後期課程" />
                  </Field>
                  <Field label="入学（予定）年月日">
                    <input className={inputCls} type="date" value={form.enrollmentDate} onChange={e => set("enrollmentDate", e.target.value)} />
                  </Field>
                  <Field label="卒業（修了）予定年月日">
                    <input className={inputCls} type="date" value={form.expectedGraduationDate} onChange={e => set("expectedGraduationDate", e.target.value)} />
                  </Field>
                  <Field label="年間学費（円）">
                    <input className={inputCls} value={form.annualTuition} onChange={e => set("annualTuition", e.target.value)} placeholder="例: 535800" />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">費用支弁方法</CardTitle>
                    <SectionExtractButton applicationId={applicationId} sectionKey="school" onExtracted={applyExtracted} />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="費用支弁方法">
                    <select className={selectCls} value={form.fundingSource} onChange={e => set("fundingSource", e.target.value)}>
                      <option value="">選択してください</option>
                      <option value="本人負担（貯蓄等）">本人負担（貯蓄等）</option>
                      <option value="親族（父母等）の送金">親族（父母等）の送金</option>
                      <option value="奨学金（日本政府）">奨学金（日本政府）</option>
                      <option value="奨学金（外国政府）">奨学金（外国政府）</option>
                      <option value="奨学金（民間）">奨学金（民間）</option>
                      <option value="アルバイト">アルバイト（資格外活動許可）</option>
                      <option value="その他">その他</option>
                    </select>
                  </Field>
                  <Field label="月額生活費（概算・円）">
                    <input className={inputCls} value={form.fundingAmount} onChange={e => set("fundingAmount", e.target.value)} placeholder="例: 100000" />
                  </Field>
                  <Field label="奨学金の名称（奨学金の場合）">
                    <input className={inputCls} value={form.scholarshipName} onChange={e => set("scholarshipName", e.target.value)} />
                  </Field>
                  <Field label="奨学金の額（月額・円）">
                    <input className={inputCls} value={form.scholarshipAmount} onChange={e => set("scholarshipAmount", e.target.value)} />
                  </Field>
                  <Field label="資格外活動許可の有無">
                    <RadioGroup value={form.partTimeWorkPermit} onChange={v => set("partTimeWorkPermit", v)} options={["有", "無"]} />
                  </Field>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── その他（J/K/O/M/Q/Y/H/U型）── フリーフィールド ─────────────── */}
          {!isNtype && !isTtype && !isRtype && !isPtype && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">申請人等作成用 Part 2 — 補足情報</CardTitle>
                <p className="text-xs text-gray-500 mt-1">
                  選択中の在留資格（{form.visaFormCategory}型）には、別途 Part 2 様式が必要です。
                  下記に必要事項を記載し、印刷後に手書き・別紙で補足してください。
                </p>
              </CardHeader>
              <CardContent>
                <Field label="補足メモ（活動内容・申請理由・その他必要情報）">
                  <textarea className={textareaCls} rows={8} value={form.freeformPart2Notes} onChange={e => set("freeformPart2Notes", e.target.value)} placeholder="在留資格の種別に応じた必要情報を記載してください" />
                </Field>
              </CardContent>
            </Card>
          )}

          {/* ── 共通：代理人・取次者 ─────────────────────────────────────────── */}
          <Card>
            <CardHeader><CardTitle className="text-base">{isCoe ? "27." : "22."} 代理人（法定代理人による申請の場合）</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="(1) 氏名"><input className={inputCls} value={form.representativeName} onChange={e => set("representativeName", e.target.value)} /></Field>
              <Field label="(2) 本人との関係"><input className={inputCls} value={form.representativeRelationship} onChange={e => set("representativeRelationship", e.target.value)} placeholder="例: 法定代理人（親）" /></Field>
              <div className="sm:col-span-2"><Field label="(3) 住所"><input className={inputCls} value={form.representativeAddress} onChange={e => set("representativeAddress", e.target.value)} /></Field></div>
              <Field label="電話番号"><input className={inputCls} value={form.representativePhone} onChange={e => set("representativePhone", e.target.value)} /></Field>
              <Field label="携帯電話番号"><input className={inputCls} value={form.representativeCellular} onChange={e => set("representativeCellular", e.target.value)} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">取次者（固定）</CardTitle></CardHeader>
            <CardContent>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-1">
                <p className="text-xs text-amber-700 font-semibold mb-2">※ 取次者情報は固定です（変更不可）</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                  <span className="font-medium text-gray-500">(1) 氏名</span>
                  <span>{form.agentName}</span>
                  <span className="font-medium text-gray-500">(2) 住所</span>
                  <span>{form.agentAddress}</span>
                  <span className="font-medium text-gray-500">(3) 所属機関等</span>
                  <span>{form.agentOrganization}</span>
                  <span className="font-medium text-gray-500">電話番号</span>
                  <span>{form.agentPhone}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ 所属機関 Part 1（就労系のみ表示） ══════════════════════════════════ */}
      {tab === "org1" && (
        <div className="space-y-6">
          {!needsOrg ? (
            <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-500">
              <p className="font-medium text-gray-700 mb-1">所属機関等作成用は不要です</p>
              <p>「{CATEGORY_LABELS[cat]}」では所属機関等作成用の提出は不要です。</p>
            </div>
          ) : (
            <>
              {/* N/L/I/V型 Org Part 1 */}
              {isNtype && (
                <>
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base"><Building2 className="w-4 h-4" />1〜3. 外国人氏名・契約形態・所属機関</CardTitle>
                        <SectionExtractButton applicationId={applicationId} sectionKey="org" onExtracted={applyExtracted} />
                      </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <Field label="2. 契約の形態">
                          <RadioGroup value={form.contractType} onChange={v => set("contractType", v)} options={["雇用", "委任", "請負", "その他"]} />
                        </Field>
                        {form.contractType === "その他" && (
                          <div className="mt-2"><Field label="その他の詳細"><input className={inputCls} value={form.contractTypeOther} onChange={e => set("contractTypeOther", e.target.value)} /></Field></div>
                        )}
                      </div>
                      <Field label="(1) 名称（Name）" required><input className={inputCls} value={form.orgName} onChange={e => set("orgName", e.target.value)} /></Field>
                      <Field label="(2) 法人番号（13桁）"><input className={inputCls} value={form.orgCorporateNumber} onChange={e => set("orgCorporateNumber", e.target.value)} placeholder="1234567890123" maxLength={13} /></Field>
                      <Field label="(3) 支店・事業所名"><input className={inputCls} value={form.orgBranchName} onChange={e => set("orgBranchName", e.target.value)} /></Field>
                      <Field label="(4) 雇用保険適用事業所番号（11桁）"><input className={inputCls} value={form.orgEmploymentInsuranceNo} onChange={e => set("orgEmploymentInsuranceNo", e.target.value)} placeholder="00-000000-0" /></Field>
                      <Field label="(5) 業種" note="別紙業種一覧番号">
                        <select className={selectCls} value={form.orgBusinessTypeCode} onChange={e => set("orgBusinessTypeCode", e.target.value)}>
                          <option value="">選択してください</option>
                          {BUSINESS_TYPES.map(b => <option key={b.code} value={String(b.code)}>{b.code}. {b.label}</option>)}
                        </select>
                      </Field>
                      <Field label="    他の業種（複数選択可）"><input className={inputCls} value={form.orgBusinessTypeOtherCode} onChange={e => set("orgBusinessTypeOtherCode", e.target.value)} placeholder="例: 14, 27" /></Field>
                      <div className="sm:col-span-2"><Field label="(6) 所在地（Address）" required><input className={inputCls} value={form.orgAddress} onChange={e => set("orgAddress", e.target.value)} /></Field></div>
                      <Field label="    電話番号"><input className={inputCls} value={form.orgPhone} onChange={e => set("orgPhone", e.target.value)} /></Field>
                      <Field label="(7) 資本金（円）"><input className={inputCls} value={form.orgCapital} onChange={e => set("orgCapital", e.target.value)} placeholder="例: 10000000" /></Field>
                      <Field label="(8) 年間売上高（直近年度・円）"><input className={inputCls} value={form.orgAnnualSales} onChange={e => set("orgAnnualSales", e.target.value)} /></Field>
                      <Field label="(9) 従業員数（全体）" note="名"><input className={inputCls} value={form.orgEmployeeCount} onChange={e => set("orgEmployeeCount", e.target.value)} /></Field>
                      <Field label="    うち外国人職員数" note="名"><input className={inputCls} value={form.orgForeignEmployeeCount} onChange={e => set("orgForeignEmployeeCount", e.target.value)} /></Field>
                      <Field label="    うち技能実習生" note="名"><input className={inputCls} value={form.orgTechInternCount} onChange={e => set("orgTechInternCount", e.target.value)} /></Field>
                    </CardContent>
                  </Card>

                  {/* 研究室：COEのみ（項目4） */}
                  {isCoe && (
                    <Card>
                      <CardHeader><CardTitle className="text-base">4. 研究室（高度専門職・研究・特定活動の場合のみ）</CardTitle></CardHeader>
                      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="(1) 研究室名"><input className={inputCls} value={form.researchRoomName} onChange={e => set("researchRoomName", e.target.value)} /></Field>
                        <Field label="(2) 指導教員氏名"><input className={inputCls} value={form.researchRoomProfessor} onChange={e => set("researchRoomProfessor", e.target.value)} /></Field>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader><CardTitle className="text-base">就労条件・給与・職種</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label={`${isCoe ? "5." : "4."} 就労予定期間`}>
                        <RadioGroup value={form.workPeriodFixed} onChange={v => set("workPeriodFixed", v)} options={["定めなし", "定めあり"]} />
                      </Field>
                      {form.workPeriodFixed === "定めあり（Fixed）" && (
                        <Field label="期間（年・月）"><input className={inputCls} value={form.workPeriodDuration} onChange={e => set("workPeriodDuration", e.target.value)} placeholder="例: 1年6ヶ月" /></Field>
                      )}
                      <Field label={`${isCoe ? "6." : "5."} 雇用開始（入社）年月日`}>
                        <input className={inputCls} type="date" value={form.employmentStartDate} onChange={e => set("employmentStartDate", e.target.value)} />
                      </Field>
                      <Field label="   未定の場合">
                        <select className={selectCls} value={form.employmentStartDateStatus} onChange={e => set("employmentStartDateStatus", e.target.value)}>
                          <option value="">— 日付を指定（上記）</option>
                          <option value="今次申請の許可を受け次第">今次申請の許可を受け次第</option>
                          <option value="在籍機関を卒業後、今次申請の許可を受け次第">在籍機関を卒業後、今次申請の許可を受け次第</option>
                          <option value="その他">その他</option>
                        </select>
                      </Field>
                      <Field label={`${isCoe ? "7." : "6."} 給与・報酬（税引き前）`} required>
                        <div className="flex gap-2">
                          <input className={inputCls} value={form.salary} onChange={e => set("salary", e.target.value)} placeholder="例: 300000" />
                          <select className="text-sm border border-gray-300 rounded-lg px-2 focus:outline-none bg-white" value={form.salaryType} onChange={e => set("salaryType", e.target.value)}>
                            <option value="月額">月額</option>
                            <option value="年額">年額</option>
                          </select>
                        </div>
                      </Field>
                      <Field label={`${isCoe ? "8." : "7."} 実務経験年数`} note="年">
                        <input className={inputCls} value={form.businessExperienceYears} onChange={e => set("businessExperienceYears", e.target.value)} placeholder="例: 3" />
                      </Field>
                      <Field label={`${isCoe ? "9." : "8."} 職務上の地位（役職名）`}>
                        <RadioGroup value={form.positionExists} onChange={v => set("positionExists", v)} options={["あり", "なし"]} />
                      </Field>
                      {form.positionExists === "あり" && (
                        <Field label="   役職名（Title）"><input className={inputCls} value={form.position} onChange={e => set("position", e.target.value)} placeholder="例: システムエンジニア" /></Field>
                      )}
                      <Field label={`${isCoe ? "10." : "9."} 職種`} note="別紙職種一覧番号">
                        <input className={inputCls} value={form.occupationCode} onChange={e => set("occupationCode", e.target.value)} placeholder="例: 12（情報処理・通信技術）" />
                      </Field>
                      <Field label="    他の職種番号（複数の場合）">
                        <input className={inputCls} value={form.occupationCodeOthers} onChange={e => set("occupationCodeOthers", e.target.value)} placeholder="例: 25, 30" />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label={`${isCoe ? "11." : "10."} 活動内容詳細`} required>
                          <textarea className={textareaCls} rows={6} value={form.activityDetails} onChange={e => set("activityDetails", e.target.value)} placeholder="担当する業務内容・活動の詳細を具体的に記載してください" />
                        </Field>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* N型以外（M/P/Q/Y等）のフリーフィールド */}
              {!isNtype && needsOrg && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">所属機関等の情報</CardTitle>
                    <p className="text-xs text-gray-500 mt-1">{CATEGORY_LABELS[cat]} の所属機関等作成用様式に必要な情報を記載してください</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="機関名称">
                      <input className={inputCls} value={form.orgName} onChange={e => set("orgName", e.target.value)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="法人番号">
                        <input className={inputCls} value={form.orgCorporateNumber} onChange={e => set("orgCorporateNumber", e.target.value)} />
                      </Field>
                      <Field label="電話番号">
                        <input className={inputCls} value={form.orgPhone} onChange={e => set("orgPhone", e.target.value)} />
                      </Field>
                    </div>
                    <Field label="所在地">
                      <input className={inputCls} value={form.orgAddress} onChange={e => set("orgAddress", e.target.value)} />
                    </Field>
                    <Field label="補足情報（活動内容・雇用条件等）">
                      <textarea className={textareaCls} rows={6} value={form.freeformOrgNotes} onChange={e => set("freeformOrgNotes", e.target.value)} placeholder="活動内容、給与、雇用条件などを記載してください" />
                    </Field>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ 所属機関 Part 2（就労系のみ・派遣先等） ════════════════════════════ */}
      {tab === "org2" && (
        <div className="space-y-6">
          {!needsOrg ? (
            <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-500">
              <p className="font-medium text-gray-700 mb-1">所属機関等作成用 Part 2 は不要です</p>
              <p>「{CATEGORY_LABELS[cat]}」では所属機関等作成用（Part 2）の提出は不要です。</p>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{orgDispatchNo}. 派遣先等（人材派遣または勤務地が所属機関と異なる場合）</CardTitle>
                <p className="text-xs text-gray-500 mt-1">
                  ※ {isCoe ? 'COE（認定）の場合' : '更新・変更の場合'}は、該当しない場合でもこのシートを提出してください（空欄可）
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="(1) 名称（Name）"><input className={inputCls} value={form.dispatchOrgName} onChange={e => set("dispatchOrgName", e.target.value)} /></Field>
                <Field label="(2) 法人番号（13桁）"><input className={inputCls} value={form.dispatchOrgCorporateNumber} onChange={e => set("dispatchOrgCorporateNumber", e.target.value)} placeholder="1234567890123" maxLength={13} /></Field>
                <Field label="(3) 支店・事業所名"><input className={inputCls} value={form.dispatchOrgBranchName} onChange={e => set("dispatchOrgBranchName", e.target.value)} /></Field>
                <Field label="(4) 雇用保険適用事業所番号"><input className={inputCls} value={form.dispatchOrgEmploymentInsuranceNo} onChange={e => set("dispatchOrgEmploymentInsuranceNo", e.target.value)} /></Field>
                <Field label="(5) 業種番号">
                  <select className={selectCls} value={form.dispatchOrgBusinessTypeCode} onChange={e => set("dispatchOrgBusinessTypeCode", e.target.value)}>
                    <option value="">選択してください</option>
                    {BUSINESS_TYPES.map(b => <option key={b.code} value={String(b.code)}>{b.code}. {b.label}</option>)}
                  </select>
                </Field>
                <div className="sm:col-span-2"><Field label="(6) 所在地（Address）"><input className={inputCls} value={form.dispatchOrgAddress} onChange={e => set("dispatchOrgAddress", e.target.value)} /></Field></div>
                <Field label="    電話番号"><input className={inputCls} value={form.dispatchOrgPhone} onChange={e => set("dispatchOrgPhone", e.target.value)} /></Field>
                <Field label="(7) 資本金（円）"><input className={inputCls} value={form.dispatchOrgCapital} onChange={e => set("dispatchOrgCapital", e.target.value)} /></Field>
                <Field label="(8) 年間売上高（直近年度・円）"><input className={inputCls} value={form.dispatchOrgAnnualSales} onChange={e => set("dispatchOrgAnnualSales", e.target.value)} /></Field>
                <div className="sm:col-span-2"><Field label="(9) 派遣予定期間"><input className={inputCls} value={form.dispatchPeriod} onChange={e => set("dispatchPeriod", e.target.value)} placeholder="例: 2025年4月1日〜2026年3月31日" /></Field></div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══ 申請理由書 ════════════════════════════════════════════════════════ */}
      {tab === "statement" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="w-4 h-4" />申請理由書（別紙）</CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              在留の必要性、活動内容の詳細、今後の計画等を具体的に記載してください。
              AIの下書き（申請書類下書きパネル）を参照し、最終調整してください。
            </p>
          </CardHeader>
          <CardContent>
            <textarea className={cn(textareaCls, "leading-relaxed")} rows={22}
              value={form.applicationStatement} onChange={e => set("applicationStatement", e.target.value)}
              placeholder="申請理由を記載してください..." />
            <p className="text-xs text-gray-400 mt-2">※ 印刷時に申請書の後ろに自動的に別紙として添付されます。</p>
          </CardContent>
        </Card>
      )}

      {/* 下部保存ボタン */}
      <div className="mt-6 flex justify-end gap-3">
        {msg && <span className={cn("text-sm flex items-center", msg.startsWith("エラー") ? "text-red-600" : "text-green-600")}>{msg}</span>}
        <button onClick={handleSave} disabled={isSaving}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}保存
        </button>
      </div>
    </div>
  );
}
