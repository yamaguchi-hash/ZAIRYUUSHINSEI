# 扶養者の申請人マスター登録・連携 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** R型（家族滞在）申請の「扶養者」を、既存の申請人マスター（`applicantMaster`）に登録・再利用できるようにする。同一人物が別の申請では申請人本人になることも自然にサポートする。

**Architecture:** 新規テーブルは作らず、`applications`テーブルに`supporterId`（`applicantMaster.id`を参照、NULL許容・編集中も変更可能）を追加する。申請書編集画面の扶養者セクションに「既存から選択」ドロップダウンと「＋新規登録」インライン簡易フォームを追加し、選択/作成した人物のマスター値を既存の自由入力`supporterXxx`フィールドへ一括反映する（反映後は通常通り上書き編集可能）。`supporterId`の更新は専用サーバーアクションで即時保存する。

**Tech Stack:** Next.js 16 App Router、TypeScript、Drizzle ORM + Neon Postgres。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

参考設計書: [docs/superpowers/specs/2026-06-24-supporter-applicant-master-design.md](../specs/2026-06-24-supporter-applicant-master-design.md)

---

### Task 1: `applications`テーブルに`supporterId`カラムを追加する

**Files:**
- Modify: `src/lib/db/schema.ts:134-158`

- [ ] **Step 1: `applications`テーブル定義に`supporterId`を追加する**

変更前:
```ts
// ─── Applications ─────────────────────────────────────────────────────────────
export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  applicantId: uuid("applicant_id").notNull().references(() => applicantMaster.id),
  organizationId: uuid("organization_id").references(() => organizationMaster.id),
  applicationType: applicationTypeEnum("application_type").notNull(),
```

変更後:
```ts
// ─── Applications ─────────────────────────────────────────────────────────────
export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  applicantId: uuid("applicant_id").notNull().references(() => applicantMaster.id),
  organizationId: uuid("organization_id").references(() => organizationMaster.id),
  // 扶養者（R型／家族滞在の場合のみ使用）。申請人マスターと同一テーブルを参照する。
  // applicantId/organizationIdと異なり、作成後も編集画面から変更可能。
  supporterId: uuid("supporter_id").references(() => applicantMaster.id),
  applicationType: applicationTypeEnum("application_type").notNull(),
```

- [ ] **Step 2: DBへマイグレーションを反映する**

Run: `npm run db:push`
Expected: `applications`テーブルに`supporter_id`カラムが追加される旨のログが表示され、エラーなく完了する。

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: コミットする**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: applicationsテーブルにsupporterIdカラムを追加

R型（家族滞在）申請の扶養者を既存の申請人マスターから参照できるよう、
applicationsテーブルにsupporterId（applicantMaster.id参照、NULL許容）
を追加する。applicantId/organizationIdとは異なり、申請作成後も
編集画面から変更可能なカラムとする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: `setApplicationSupporter`サーバーアクションを新規作成する

**Files:**
- Modify: `src/actions/applications.ts:1186-1206`（`saveApplicationFormData`の直後に追加）

- [ ] **Step 1: `setApplicationSupporter`を追加する**

`saveApplicationFormData`関数の直後（1206行目の`}`の後）に以下を追加する。既存の`updateApplicationStatus`関数と同じ「現在値取得→更新→監査ログ記録」のパターンに従う。

```ts
// ── 扶養者（申請人マスター参照）の紐付け更新 ──────────────────────────────────
export async function setApplicationSupporter(
  applicationId: string,
  supporterId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [current] = await db
      .select({ supporterId: applications.supporterId })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);

    if (!current) return { success: false, error: "申請案件が見つかりません" };

    await db
      .update(applications)
      .set({ supporterId, updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    await db.insert(auditLog).values({
      tenantId,
      applicationId,
      userId: session.user.id,
      action: "supporter_change",
      fieldKey: "supporterId",
      oldValue: current.supporterId,
      newValue: supporterId,
    });

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    console.error("[setApplicationSupporter]", err);
    return { success: false, error: err.message ?? "扶養者の紐付け更新に失敗しました" };
  }
}
```

- [ ] **Step 2: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミットする**

```bash
git add src/actions/applications.ts
git commit -m "feat: setApplicationSupporterアクションを新規作成

applications.supporterIdを更新する専用アクションを追加する。
saveApplicationFormData（フォーム本文JSONBのみ更新）とは別に、
このカラムを即時更新するために使う。既存のupdateApplicationStatus
と同じパターンで監査ログも記録する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: `shinsei-form/page.tsx`に申請人一覧・扶養者紐付け情報を配線する

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx`

- [ ] **Step 1: `getApplicants`をimportし、申請人一覧を取得・整形する**

変更前:
```tsx
import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown, AlertCircle } from "lucide-react";
import { QuestionnaireDocxButton } from "@/components/applications/questionnaire-docx-button";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { ShinseiFormEditor } from "./shinsei-form-editor";
import type { ApplicationFormData } from "@/lib/form-types";
import { buildEffectiveFormData } from "@/lib/effective-form-data";

export default async function ShinseiFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userRole = (session?.user as any)?.role;

  let data;
  try { data = await getApplicationById(id); } catch { notFound(); }

  const { application, applicant, organization } = data;
```

変更後:
```tsx
import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { getApplicants } from "@/actions/applicants";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown, AlertCircle } from "lucide-react";
import { QuestionnaireDocxButton } from "@/components/applications/questionnaire-docx-button";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { ShinseiFormEditor } from "./shinsei-form-editor";
import type { ApplicationFormData } from "@/lib/form-types";
import { buildEffectiveFormData } from "@/lib/effective-form-data";

export default async function ShinseiFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userRole = (session?.user as any)?.role;

  let data;
  try { data = await getApplicationById(id); } catch { notFound(); }

  const { application, applicant, organization } = data;

  // 扶養者選択ドロップダウン用の申請人一覧（この申請の申請人本人は除外）
  const allApplicants = await getApplicants();
  const supporterCandidates = allApplicants
    .filter((a) => a.id !== application.applicantId)
    .map((a) => ({
      id: a.id,
      familyNameEn: a.familyNameEn,
      givenNameEn: a.givenNameEn,
      nationality: a.nationality,
      dateOfBirth: a.dateOfBirth,
      residenceCardNumber: a.residenceCardNumber,
      currentVisaType: a.currentVisaType,
      currentVisaExpiry: a.currentVisaExpiry,
      japanAddress: a.japanAddress,
    }));
```

- [ ] **Step 2: `ShinseiFormEditor`に新しいpropsを渡す**

変更前:
```tsx
      <ShinseiFormEditor
        applicationId={id}
        initialForm={initialForm}
        applicationType={application.applicationType}
        userRole={userRole}
        isCompleted={application.status === "completed"}
      />
```

変更後:
```tsx
      <ShinseiFormEditor
        applicationId={id}
        initialForm={initialForm}
        applicationType={application.applicationType}
        userRole={userRole}
        isCompleted={application.status === "completed"}
        supporterCandidates={supporterCandidates}
        initialSupporterId={application.supporterId}
      />
```

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: 現時点では`ShinseiFormEditor`が`supporterCandidates`/`initialSupporterId`を未定義のためエラーになる。これはTask 4で解消される。エラー内容が「`supporterCandidates`は存在しないプロパティです」という趣旨であることを確認する。

- [ ] **Step 4: コミットする**

```bash
git add "src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx"
git commit -m "feat: shinsei-form/page.tsxに扶養者選択用の申請人一覧を配線

扶養者を申請人マスターから選択できるようにするため、申請人一覧
（この申請の申請人本人を除く）と現在の扶養者紐付け状態（supporterId）
をShinseiFormEditorに渡す。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: `shinsei-form-editor.tsx`に扶養者選択・新規登録UIを実装する

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/shinsei-form/shinsei-form-editor.tsx`

- [ ] **Step 1: importとPropsを更新する**

変更前（ファイル冒頭）:
```tsx
"use client";

import { useState } from "react";
import { saveApplicationFormData, extractMarriageNotificationFromDocs } from "@/actions/applications";
import { extractSectionFromDocs } from "@/actions/extract-section";
import { fillAllFieldsFromDocs } from "@/actions/fill-all-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2, Save, User, Building2, GraduationCap, Briefcase,
  Plus, Trash2, FileText, Settings, Heart, GraduationCap as School, ScanText, BookOpen, ChevronDown,
} from "lucide-react";
import { cn, VISA_TYPE_LABELS } from "@/lib/utils";
import { AddressSplitInput, AddressSplitSimple } from "@/components/ui/postal-code-input";
import type { ApplicationFormData, WorkHistoryEntry, FamilyMember, ApplicationFormType, VisaFormCategory } from "@/lib/form-types";
import {
  FORM_TYPE_LABELS, PURPOSE_OF_ENTRY_OPTIONS,
  MAJOR_CATEGORIES_UNIVERSITY, MAJOR_CATEGORIES_VOCATIONAL,
  BUSINESS_TYPES, OCCUPATION_TYPES, VISA_CATEGORY_NEEDS_ORG, VISA_CATEGORY_PART2,
} from "@/lib/form-types";

interface Props {
  applicationId: string;
  initialForm: ApplicationFormData;
  applicationType: string;
  userRole?: string;
  isCompleted?: boolean;
}
```

変更後:
```tsx
"use client";

import { useState } from "react";
import { saveApplicationFormData, extractMarriageNotificationFromDocs, setApplicationSupporter } from "@/actions/applications";
import { createApplicant } from "@/actions/applicants";
import { extractSectionFromDocs } from "@/actions/extract-section";
import { fillAllFieldsFromDocs } from "@/actions/fill-all-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2, Save, User, Building2, GraduationCap, Briefcase,
  Plus, Trash2, FileText, Settings, Heart, GraduationCap as School, ScanText, BookOpen, ChevronDown,
} from "lucide-react";
import { cn, VISA_TYPE_LABELS } from "@/lib/utils";
import { AddressSplitInput, AddressSplitSimple } from "@/components/ui/postal-code-input";
import type { ApplicationFormData, WorkHistoryEntry, FamilyMember, ApplicationFormType, VisaFormCategory } from "@/lib/form-types";
import {
  FORM_TYPE_LABELS, PURPOSE_OF_ENTRY_OPTIONS,
  MAJOR_CATEGORIES_UNIVERSITY, MAJOR_CATEGORIES_VOCATIONAL,
  BUSINESS_TYPES, OCCUPATION_TYPES, VISA_CATEGORY_NEEDS_ORG, VISA_CATEGORY_PART2,
} from "@/lib/form-types";

/** 扶養者ドロップダウンの選択肢（申請人マスターから取得した最小限の項目） */
interface SupporterCandidate {
  id: string;
  familyNameEn: string;
  givenNameEn: string;
  nationality: string;
  dateOfBirth: string | null;
  residenceCardNumber: string | null;
  currentVisaType: string | null;
  currentVisaExpiry: string | null;
  japanAddress: string | null;
}

interface Props {
  applicationId: string;
  initialForm: ApplicationFormData;
  applicationType: string;
  userRole?: string;
  isCompleted?: boolean;
  supporterCandidates?: SupporterCandidate[];
  initialSupporterId?: string | null;
}
```

- [ ] **Step 2: コンポーネント引数・状態・ハンドラーを追加する**

変更前:
```tsx
export function ShinseiFormEditor({ applicationId, initialForm, applicationType, userRole, isCompleted }: Props) {
  const [form, setForm] = useState<ApplicationFormData>(initialForm);
  const [tab, setTab] = useState<TabKey>("meta");
```

変更後:
```tsx
export function ShinseiFormEditor({ applicationId, initialForm, applicationType, userRole, isCompleted, supporterCandidates = [], initialSupporterId }: Props) {
  const [form, setForm] = useState<ApplicationFormData>(initialForm);
  const [tab, setTab] = useState<TabKey>("meta");
  // 扶養者の申請人マスター紐付け
  const [supporterApplicantId, setSupporterApplicantId] = useState<string | null>(initialSupporterId ?? null);
  const [showNewSupporterForm, setShowNewSupporterForm] = useState(false);
  const [isSavingSupporter, setIsSavingSupporter] = useState(false);
  const [supporterMsg, setSupporterMsg] = useState("");
  const [newSupporter, setNewSupporter] = useState({
    familyNameEn: "", givenNameEn: "", nationality: "", dateOfBirth: "",
    gender: "", residenceCardNumber: "", currentVisaType: "", currentVisaExpiry: "", japanAddress: "",
  });
```

`set`関数（209行目付近）の直後に、以下の扶養者用ヘルパーを追加する。

変更前:
```tsx
  function set<K extends keyof ApplicationFormData>(key: K, value: ApplicationFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setMsg("");
  }
```

変更後:
```tsx
  function set<K extends keyof ApplicationFormData>(key: K, value: ApplicationFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setMsg("");
  }

  // 選択/新規作成した申請人マスターの値を扶養者フィールドへ反映する（反映後は上書き編集可能）
  function applySupporterMaster(master: SupporterCandidate) {
    setForm(prev => ({
      ...prev,
      supporterNameEn: [master.familyNameEn, master.givenNameEn].filter(Boolean).join(' '),
      supporterFamilyNameEn: master.familyNameEn,
      supporterGivenNameEn: master.givenNameEn,
      supporterDob: master.dateOfBirth ?? '',
      supporterNationality: master.nationality,
      supporterResidenceCard: master.residenceCardNumber ?? '',
      supporterStatusOfResidence: master.currentVisaType ? (VISA_TYPE_LABELS[master.currentVisaType] ?? master.currentVisaType) : '',
      supporterPeriodExpiry: master.currentVisaExpiry ?? '',
      supporterAddress: master.japanAddress ?? '',
    }));
  }

  async function handleSupporterSelect(id: string) {
    setSupporterMsg("");
    setSupporterApplicantId(id || null);
    if (id) {
      const master = supporterCandidates.find(a => a.id === id);
      if (master) applySupporterMaster(master);
    }
    const result = await setApplicationSupporter(applicationId, id || null);
    if (!result.success) setSupporterMsg(result.error ?? "扶養者の紐付けに失敗しました");
  }

  async function handleCreateSupporter() {
    if (!newSupporter.familyNameEn || !newSupporter.givenNameEn || !newSupporter.nationality) {
      setSupporterMsg("氏名（姓・名）・国籍は必須です");
      return;
    }
    setIsSavingSupporter(true);
    setSupporterMsg("");
    try {
      const created = await createApplicant(newSupporter);
      applySupporterMaster(created);
      setSupporterApplicantId(created.id);
      const result = await setApplicationSupporter(applicationId, created.id);
      if (!result.success) setSupporterMsg(result.error ?? "扶養者の紐付けに失敗しました");
      setShowNewSupporterForm(false);
      setNewSupporter({
        familyNameEn: "", givenNameEn: "", nationality: "", dateOfBirth: "",
        gender: "", residenceCardNumber: "", currentVisaType: "", currentVisaExpiry: "", japanAddress: "",
      });
    } catch (err: any) {
      setSupporterMsg(err?.message ?? "新規登録に失敗しました");
    } finally {
      setIsSavingSupporter(false);
    }
  }
```

- [ ] **Step 3: 扶養者セクションのCardContent冒頭に選択UIを追加する**

変更前:
```tsx
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="(1) 氏名（ローマ字）">
                    <input className={inputCls} value={form.supporterNameEn || [form.supporterFamilyNameEn, form.supporterGivenNameEn].filter(Boolean).join(' ')} onChange={e => set("supporterNameEn", e.target.value)} placeholder="例: YAMADA Taro" />
                  </Field>
```

変更後:
```tsx
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <label className="block text-xs font-medium text-amber-700 mb-1">
                      扶養者を申請人マスターから選択（任意・自由入力のまま使う場合は未選択のままでよい）
                    </label>
                    <div className="flex gap-2 items-start">
                      <select
                        className={cn(selectCls, "flex-1")}
                        value={supporterApplicantId ?? ""}
                        onChange={e => handleSupporterSelect(e.target.value)}
                      >
                        <option value="">選択してください</option>
                        {supporterCandidates.map(a => (
                          <option key={a.id} value={a.id}>{a.familyNameEn} {a.givenNameEn}（{a.nationality}）</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewSupporterForm(v => !v)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-amber-700 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        新規登録
                      </button>
                    </div>
                    {supporterMsg && <p className="text-xs text-red-600 mt-1">{supporterMsg}</p>}
                    {showNewSupporterForm && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white border border-amber-200 rounded-lg p-3">
                        <input className={inputCls} placeholder="氏名（姓・ローマ字）※必須" value={newSupporter.familyNameEn} onChange={e => setNewSupporter(prev => ({ ...prev, familyNameEn: e.target.value }))} />
                        <input className={inputCls} placeholder="氏名（名・ローマ字）※必須" value={newSupporter.givenNameEn} onChange={e => setNewSupporter(prev => ({ ...prev, givenNameEn: e.target.value }))} />
                        <input className={inputCls} placeholder="国籍・地域 ※必須" value={newSupporter.nationality} onChange={e => setNewSupporter(prev => ({ ...prev, nationality: e.target.value }))} />
                        <input className={inputCls} type="date" value={newSupporter.dateOfBirth} onChange={e => setNewSupporter(prev => ({ ...prev, dateOfBirth: e.target.value }))} />
                        <select className={selectCls} value={newSupporter.gender} onChange={e => setNewSupporter(prev => ({ ...prev, gender: e.target.value }))}>
                          <option value="">性別（任意）</option>
                          <option value="M">男性</option>
                          <option value="F">女性</option>
                        </select>
                        <input className={inputCls} placeholder="在留カード番号（任意）" value={newSupporter.residenceCardNumber} onChange={e => setNewSupporter(prev => ({ ...prev, residenceCardNumber: e.target.value }))} />
                        <select className={selectCls} value={newSupporter.currentVisaType} onChange={e => setNewSupporter(prev => ({ ...prev, currentVisaType: e.target.value }))}>
                          <option value="">在留資格（任意）</option>
                          {Object.entries(VISA_TYPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                        <input className={inputCls} type="date" placeholder="在留期限" value={newSupporter.currentVisaExpiry} onChange={e => setNewSupporter(prev => ({ ...prev, currentVisaExpiry: e.target.value }))} />
                        <input className={cn(inputCls, "sm:col-span-2")} placeholder="住所（任意）" value={newSupporter.japanAddress} onChange={e => setNewSupporter(prev => ({ ...prev, japanAddress: e.target.value }))} />
                        <div className="sm:col-span-2 flex justify-end">
                          <button
                            type="button"
                            disabled={isSavingSupporter}
                            onClick={handleCreateSupporter}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg"
                          >
                            {isSavingSupporter ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            登録して反映
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <Field label="(1) 氏名（ローマ字）">
                    <input className={inputCls} value={form.supporterNameEn || [form.supporterFamilyNameEn, form.supporterGivenNameEn].filter(Boolean).join(' ')} onChange={e => set("supporterNameEn", e.target.value)} placeholder="例: YAMADA Taro" />
                  </Field>
```

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし（Task 3で発生していたエラーも解消されることを確認する）。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/(dashboard)/applications/[id]/shinsei-form/shinsei-form-editor.tsx"
git commit -m "feat: 扶養者セクションに申請人マスター選択・新規登録UIを実装

R型申請の扶養者セクションに「既存から選択」ドロップダウンと
「＋新規登録」インライン簡易フォームを追加する。選択/新規作成した
人物のマスター値（氏名・生年月日・国籍・在留カード番号・在留資格・
在留期限・住所）を既存の自由入力supporterXxxフィールドへ一括反映し、
以降は通常のテキスト入力として上書き編集できる。紐付け状態は
setApplicationSupporterで即時保存する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 申請人マスター詳細ページに「扶養者として紐付けられている申請」一覧を追加する

**Files:**
- Modify: `src/app/(dashboard)/applicants/[id]/page.tsx`

- [ ] **Step 1: 扶養者として紐付けられている申請を取得するクエリを追加する**

変更前:
```tsx
  // 過去の申請案件を取得
  const pastApplications = await db
    .select({
      id: applications.id,
      caseNumber: applications.caseNumber,
      applicationType: applications.applicationType,
      visaType: applications.visaType,
      status: applications.status,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      isApproved: applications.isApproved,
    })
    .from(applications)
    .where(
      and(
        eq(applications.applicantId, id),
        eq(applications.tenantId, tenantId),
        ne(applications.status, "cancelled")
      )
    )
    .orderBy(desc(applications.updatedAt));
```

変更後:
```tsx
  // 過去の申請案件を取得
  const pastApplications = await db
    .select({
      id: applications.id,
      caseNumber: applications.caseNumber,
      applicationType: applications.applicationType,
      visaType: applications.visaType,
      status: applications.status,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      isApproved: applications.isApproved,
    })
    .from(applications)
    .where(
      and(
        eq(applications.applicantId, id),
        eq(applications.tenantId, tenantId),
        ne(applications.status, "cancelled")
      )
    )
    .orderBy(desc(applications.updatedAt));

  // 扶養者として紐付けられている申請を取得
  const supportedApplications = await db
    .select({
      id: applications.id,
      caseNumber: applications.caseNumber,
      applicationType: applications.applicationType,
      visaType: applications.visaType,
      status: applications.status,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      isApproved: applications.isApproved,
    })
    .from(applications)
    .where(
      and(
        eq(applications.supporterId, id),
        eq(applications.tenantId, tenantId),
        ne(applications.status, "cancelled")
      )
    )
    .orderBy(desc(applications.updatedAt));
```

- [ ] **Step 2: 「扶養者として紐付けられている申請」一覧セクションを追加する**

「過去の申請案件」のCardの直後（在留カード変更履歴セクションの前）に、同じ表形式の新しいセクションを追加する。

変更前:
```tsx
      {/* ── 在留カードの変更履歴（折りたたみ） ── */}
      <div className="mt-4">
```

変更後:
```tsx
      {/* ── 扶養者として紐付けられている申請 ── */}
      {supportedApplications.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              扶養者として紐付けられている申請
              <span className="text-xs font-normal text-gray-400 ml-1">
                （{supportedApplications.length}件）
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">案件番号</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">申請種別</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">在留資格</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">ステータス</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">作成日</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">最終更新</th>
                    <th className="px-4 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {supportedApplications.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/applications/${app.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {app.caseNumber ?? app.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {APPLICATION_TYPE_LABELS[app.applicationType] ?? app.applicationType}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {VISA_TYPE_LABELS[app.visaType] ?? app.visaType}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(app.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(app.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/applications/${app.id}`} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 在留カードの変更履歴（折りたたみ） ── */}
      <div className="mt-4">
```

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: コミットする**

```bash
git add "src/app/(dashboard)/applicants/[id]/page.tsx"
git commit -m "feat: 申請人マスター詳細に扶養者として紐付けられている申請一覧を追加

applications.supporterIdでこの人物が扶養者として紐付けられている
申請を取得し、既存の「申請案件の履歴」と同じ表形式で表示する。
0件の場合はセクション自体を表示しない。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: ビルド確認・手動テスト・デプロイ・報告

**Files:** なし（検証のみ）

- [ ] **Step 1: フルビルドを実行する**

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: 全ルートがエラーなくビルドされる。

- [ ] **Step 2: 手動機能テストの確認項目を整理する（実際の確認はユーザーに依頼）**

1. R型の申請を開き、扶養者セクションの「既存から選択」ドロップダウンに、この申請の申請人本人を除いた申請人マスター一覧が表示されることを確認する。
2. 既存の人物を選択し、氏名・生年月日・国籍・在留カード番号・在留資格・在留期限・住所が自動反映されることを確認する。
3. 自動反映された項目を手動で上書き編集し、保存（既存の保存ボタン）後に再読み込みしても編集後の値が保持されることを確認する。
4. 「＋新規登録」から氏名（姓・名）・国籍などを入力して登録すると、新しい申請人マスターが作成され、同様に自動反映されることを確認する。
5. `/applicants`一覧に、Step4で作成した人物が新規の申請人マスターとして表示されることを確認する。
6. ドロップダウンを「選択してください」に戻しても、既に入力されていたテキスト項目の値が消えないことを確認する。
7. Step2またはStep4で扶養者として選択した人物の`/applicants/[id]`詳細ページを開き、「扶養者として紐付けられている申請」一覧にこの申請が表示されることを確認する。
8. `supporterId`が未設定の既存R型申請を開き、従来通り自由入力のテキストがそのまま表示・編集できることを確認する（回帰確認）。
9. R型以外の申請で、画面・PDF出力に変化がないことを確認する。

- [ ] **Step 3: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 4: 本番環境にデプロイする**

```bash
npx vercel --prod
```

- [ ] **Step 5: ユーザーに報告する**

Step2で整理した手動テスト項目（実際の確認はユーザー自身に依頼する旨を明記）を報告する。
