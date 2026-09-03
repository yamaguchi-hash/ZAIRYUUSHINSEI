# 質問書・顧客聴取機能（動的差分生成＋AI拡張） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の静的印刷専用の質問リストと、AI一発生成型の対話質問パネルを1つのライブ差分エンジンに統合し、回答が申請書フィールド/チェックリストへ自動的に書き込まれる「質問書・顧客聴取」機能を実装する。

**Architecture:** ページ表示ごとに「申請書実効値（マスター反映込み）」「資格別必須確認事項」「書類チェックリスト」からルールベースで差分質問（セクションA/B）を即時計算し、スタッフのボタン操作でGemini 2.5 Flashによる論理矛盾検出（セクションC）を追加する。回答保存は専用アクションが直接 `application.formData` または `checklist.expertNotes` に書き込み、永続化用の中間テーブルは持たない。

**Tech Stack:** Next.js 16 (App Router) / TypeScript / Drizzle ORM + Neon Postgres / `@google/genai`（Gemini 2.5 Flash） / React 19

**参照仕様書:** `docs/superpowers/specs/2026-06-19-interview-questionnaire-design.md`

**検証方法について:** このプロジェクトには自動テストランナー（Jest/Vitest等）が設定されていないため、各タスクの「テスト」は `npm run build`（TypeScript型チェック含む）と、最終タスクでの手動機能確認に置き換える。これは本プロジェクトの既存タスクすべてで使われている検証パターンと同一。

---

### Task 1: ApplicationFormDataへ新規フィールド6件を追加

**Files:**
- Modify: `src/lib/form-types.ts:160-161`（インターフェース定義への追加）
- Modify: `src/lib/form-types.ts:632`（EMPTY_FORM_DATAデフォルト値への追加）

- [ ] **Step 1: インターフェースに新規フィールドを追加**

`src/lib/form-types.ts` の160-161行目（`criminalRecord`/`criminalRecordDetail` の直後）を次のように変更する。

変更前:
```typescript
  criminalRecord: string;
  criminalRecordDetail: string;
```

変更後:
```typescript
  criminalRecord: string;
  criminalRecordDetail: string;
  // ── 必須確認事項（顧客聴取専用・V/Nカテゴリ） ──────────────────────────────
  disciplinaryActionExists: string;
  disciplinaryActionDetail: string;
  doubleContractExists: string;
  doubleContractDetail: string;
  taxInsuranceArrearsExists: string;
  taxInsuranceArrearsDetail: string;
```

- [ ] **Step 2: EMPTY_FORM_DATAにデフォルト値を追加**

632行目（`criminalRecord: '無', criminalRecordDetail: '',` の行）を次のように変更する。

変更前:
```typescript
  criminalRecord: '無', criminalRecordDetail: '',
```

変更後:
```typescript
  criminalRecord: '無', criminalRecordDetail: '',
  disciplinaryActionExists: '', disciplinaryActionDetail: '',
  doubleContractExists: '', doubleContractDetail: '',
  taxInsuranceArrearsExists: '', taxInsuranceArrearsDetail: '',
```

注: `criminalRecord` はデフォルト`'無'`（既存パターン）だが、新規3項目は顧客から未確認の状態を表すため空文字`''`をデフォルトとする（空欄＝質問対象として検出されるようにするため）。

- [ ] **Step 3: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功（新規フィールドはoptionalではなく必須文字列のため、EMPTY_FORM_DATA側で値を入れ忘れるとTS型エラーになる。これにより入れ忘れを検知できる）

- [ ] **Step 4: コミット**

```bash
git add src/lib/form-types.ts
git commit -m "feat: 質問書・顧客聴取用の必須確認事項フィールドを追加

disciplinaryActionExists/Detail, doubleContractExists/Detail,
taxInsuranceArrearsExists/Detail の6フィールドをApplicationFormDataに追加。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: ALL_QUESTIONSへ新規必須確認質問6件を追加

**Files:**
- Modify: `src/lib/questionnaire-questions.ts:282`（`criminalRecordDetail` エントリの直後に追加）

- [ ] **Step 1: 新規質問エントリを追加**

`src/lib/questionnaire-questions.ts` の `criminalRecordDetail` エントリ（277-282行目）の直後に、以下の6エントリを追加する。

変更前（280-283行目付近）:
```typescript
  {
    key: "criminalRecordDetail",
    section: "7. 犯罪・退去強制歴",
    label: "犯罪記録の詳細（内容・処分年月日・機関名）",
    condition: (f) => f.criminalRecord === "有",
  },
  {
    key: "deportationHistory",
```

変更後:
```typescript
  {
    key: "criminalRecordDetail",
    section: "7. 犯罪・退去強制歴",
    label: "犯罪記録の詳細（内容・処分年月日・機関名）",
    condition: (f) => f.criminalRecord === "有",
  },
  // ══════════════════════════════════════════════════════════════════════════
  // 必須確認事項（顧客聴取専用・V特定技能 / N技人国等就労系のみ）
  // ══════════════════════════════════════════════════════════════════════════
  {
    key: "disciplinaryActionExists",
    section: "7. 犯罪・退去強制歴",
    label: "懲戒処分を受けたことの有無（勤務先・学校等での処分を含む）",
    options: ["有", "無"],
    categories: ["V", "N"],
  },
  {
    key: "disciplinaryActionDetail",
    section: "7. 犯罪・退去強制歴",
    label: "懲戒処分の詳細（内容・処分年月日・機関名）",
    categories: ["V", "N"],
    condition: (f) => f.disciplinaryActionExists === "有",
  },
  {
    key: "doubleContractExists",
    section: "7. 犯罪・退去強制歴",
    label: "現在の勤務先以外との二重契約・二重雇用の有無",
    options: ["有", "無"],
    categories: ["V", "N"],
  },
  {
    key: "doubleContractDetail",
    section: "7. 犯罪・退去強制歴",
    label: "二重契約・二重雇用の詳細（契約先名・契約期間）",
    categories: ["V", "N"],
    condition: (f) => f.doubleContractExists === "有",
  },
  {
    key: "taxInsuranceArrearsExists",
    section: "7. 犯罪・退去強制歴",
    label: "税金・社会保険料の未納・滞納の有無",
    options: ["有", "無"],
    categories: ["V", "N"],
  },
  {
    key: "taxInsuranceArrearsDetail",
    section: "7. 犯罪・退去強制歴",
    label: "未納・滞納の詳細（税目・対象期間・現在の対応状況）",
    categories: ["V", "N"],
    condition: (f) => f.taxInsuranceArrearsExists === "有",
  },
  {
    key: "deportationHistory",
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/lib/questionnaire-questions.ts
git commit -m "feat: ALL_QUESTIONSにV/N向け必須確認事項6項目を追加

懲戒処分・二重契約・税保険料滞納の有無+詳細をcategories: [\"V\",\"N\"]で追加。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: buildEffectiveFormData共通関数を新規作成

**Files:**
- Create: `src/lib/effective-form-data.ts`

- [ ] **Step 1: 新規ファイルを作成**

`shinsei-form/page.tsx` 内にあるマスターデータ統合ロジックを共通関数として抽出する。これにより、印刷系統・対話質問系統が「申請書に保存済みの値がなくても、マスター（申請人・所属機関）に既知の値があれば空欄と誤判定しない」という同一ロジックを共有できる（現状の静的印刷系統が抱えていたバグの修正でもある）。

```typescript
import type { ApplicationFormData } from "./form-types";
import { EMPTY_FORM_DATA } from "./form-types";
import { mapOrganizationToFormData, type OrgMasterRecord } from "./org-master-mapping";
import { VISA_TYPE_LABELS } from "./utils";

/** 申請人マスター（applicantMaster）の行のうち、本関数が参照するフィールドのみの構造的型 */
export interface ApplicantMasterLike {
  nationality?: string | null;
  dateOfBirth?: string | null;
  familyNameEn?: string | null;
  givenNameEn?: string | null;
  familyNameJa?: string | null;
  givenNameJa?: string | null;
  gender?: string | null;
  postalCode?: string | null;
  japanPrefecture?: string | null;
  japanCity?: string | null;
  japanAddressLine?: string | null;
  japanAddress?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  currentVisaType?: string | null;
  currentVisaExpiry?: string | null;
  residenceCardNumber?: string | null;
}

/** applications の行のうち、本関数が参照するフィールドのみの構造的型 */
export interface ApplicationMasterLike {
  applicationType: string;
  visaType: string;
  formData?: unknown;
}

/** applicationType（DBの値）→ ApplicationFormType（form-types.tsの値）マッピング。永住許可も区別する。 */
function toApplicationFormType(t: string): ApplicationFormData["applicationFormType"] {
  if (t === "coe" || t === "certification") return "coe";
  if (t === "change") return "change";
  if (t === "extension" || t === "renewal") return "extension";
  if (t === "permanent" || t === "permanent_residence") return "permanent";
  return "extension";
}

/**
 * 申請書フォームの「実効値」を構築する。
 * 優先順位: 保存済みformData ＞ マスター（申請人・所属機関）由来の値 ＞ EMPTY_FORM_DATA。
 * 「8. 日本における連絡先」「現在の在留資格・期限・カード番号」は savedForm の有無に関わらず
 * 常にマスターの最新値を使用する（shinsei-form/page.tsx の既存仕様を踏襲）。
 */
export function buildEffectiveFormData(
  application: ApplicationMasterLike,
  applicant: ApplicantMasterLike,
  organization: OrgMasterRecord | null | undefined,
): ApplicationFormData {
  const savedForm = (application.formData ?? null) as Partial<ApplicationFormData> | null;

  const masterData: Partial<ApplicationFormData> = {
    applicationFormType:        toApplicationFormType(application.applicationType),
    nationality:                applicant.nationality ?? '',
    dateOfBirth:                applicant.dateOfBirth ?? '',
    familyNameEn:               applicant.familyNameEn ?? '',
    givenNameEn:                applicant.givenNameEn ?? '',
    familyNameJa:               applicant.familyNameJa ?? '',
    givenNameJa:                applicant.givenNameJa ?? '',
    sex:                        applicant.gender === 'M' ? '男' : applicant.gender === 'F' ? '女' : '',
    postalCodeInJapan:          applicant.postalCode ?? '',
    prefectureInJapan:          applicant.japanPrefecture ?? '',
    cityInJapan:                applicant.japanCity ?? '',
    addressLineInJapan:         applicant.japanAddressLine ?? (
      !applicant.japanPrefecture ? (applicant.japanAddress ?? '') : ''
    ),
    addressInJapan:             applicant.japanAddress ?? '',
    telephoneNo:                applicant.phone ?? '',
    cellularPhoneNo:            applicant.mobilePhone ?? '',
    passportNumber:             applicant.passportNumber ?? '',
    passportExpiry:             applicant.passportExpiry ?? '',
    currentStatusOfResidence:   VISA_TYPE_LABELS[applicant.currentVisaType ?? ''] ?? applicant.currentVisaType ?? '',
    currentPeriodExpiry:        applicant.currentVisaExpiry ?? '',
    residenceCardNumber:        applicant.residenceCardNumber ?? '',
    desiredStatusOfResidence:   VISA_TYPE_LABELS[application.visaType] ?? application.visaType ?? '',
    // 所属機関マスター（全申請書共通の企業基本情報のみを自動反映）
    ...mapOrganizationToFormData(organization),
  };

  // 日本における連絡先（申請人マスターから常に取得）
  const masterContactFields = {
    postalCodeInJapan:  applicant.postalCode      ?? '',
    prefectureInJapan:  applicant.japanPrefecture ?? '',
    cityInJapan:        applicant.japanCity        ?? '',
    addressLineInJapan: applicant.japanAddressLine ?? (
      !applicant.japanPrefecture ? (applicant.japanAddress ?? '') : ''
    ),
    addressInJapan:  applicant.japanAddress ?? '',
    telephoneNo:     applicant.phone        ?? '',
    cellularPhoneNo: applicant.mobilePhone ?? '',
  };

  // 現在の在留資格・在留期限・在留カード番号（申請人マスターから常に取得）
  const toJaVisaType = (v: string | null | undefined): string => {
    if (!v) return '';
    return VISA_TYPE_LABELS[v] ?? v;
  };
  const masterStatusFields = {
    currentStatusOfResidence: toJaVisaType(applicant.currentVisaType),
    currentPeriodExpiry:      applicant.currentVisaExpiry  ?? '',
    residenceCardNumber:      applicant.residenceCardNumber ?? '',
  };

  return {
    ...EMPTY_FORM_DATA,
    ...(savedForm ?? masterData),
    ...masterContactFields,
    ...masterStatusFields,
  } as ApplicationFormData;
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/lib/effective-form-data.ts
git commit -m "feat: 申請書実効値を構築する共通関数buildEffectiveFormDataを追加

shinsei-form/page.tsxのマスターデータ統合ロジックを共通化する土台。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: shinsei-form/page.tsxをbuildEffectiveFormData利用に書き換え

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx:1-110`

- [ ] **Step 1: import文を変更**

変更前（1-11行目）:
```typescript
import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileDown, AlertCircle } from "lucide-react";
import { QuestionnaireDocxButton } from "@/components/applications/questionnaire-docx-button";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { ShinseiFormEditor } from "./shinsei-form-editor";
import type { ApplicationFormData } from "@/lib/form-types";
import { EMPTY_FORM_DATA } from "@/lib/form-types";
import { mapOrganizationToFormData } from "@/lib/org-master-mapping";
```

変更後:
```typescript
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
```

- [ ] **Step 2: マスターデータ統合ロジックをbuildEffectiveFormData呼び出しに置き換え**

変更前（25-110行目）:
```typescript
  const { application, applicant, organization } = data;

  // 既存のformDataがあれば使い、なければ空フォームをベースに自動埋め
  const savedForm = (application.formData ?? null) as Partial<ApplicationFormData> | null;

  // applicationType（DBの値）→ ApplicationFormType（form-types.tsの値）マッピング
  const toFormType = (t: string): import("@/lib/form-types").ApplicationFormType => {
    if (t === "coe" || t === "certification") return "coe";
    if (t === "change") return "change";
    if (t === "extension" || t === "renewal") return "extension";
    if (t === "permanent" || t === "permanent_residence") return "permanent";
    return "extension";
  };

  // マスターデータからの初期値（savedForm がない場合に使用）
  const masterData: Partial<ApplicationFormData> = {
    applicationFormType:        toFormType(application.applicationType),
    nationality:                applicant.nationality ?? '',
    dateOfBirth:                applicant.dateOfBirth ?? '',
    familyNameEn:               applicant.familyNameEn ?? '',
    givenNameEn:                applicant.givenNameEn ?? '',
    familyNameJa:               applicant.familyNameJa ?? '',
    givenNameJa:                applicant.givenNameJa ?? '',
    sex:                        applicant.gender === 'M' ? '男' : applicant.gender === 'F' ? '女' : '',
    postalCodeInJapan:          (applicant as any).postalCode ?? '',
    prefectureInJapan:          (applicant as any).japanPrefecture ?? '',
    cityInJapan:                (applicant as any).japanCity ?? '',
    addressLineInJapan:         (applicant as any).japanAddressLine ?? (
      !(applicant as any).japanPrefecture ? (applicant.japanAddress ?? '') : ''
    ),
    addressInJapan:             applicant.japanAddress ?? '',
    telephoneNo:                applicant.phone ?? '',
    cellularPhoneNo:            (applicant as any).mobilePhone ?? '',
    passportNumber:             applicant.passportNumber ?? '',
    passportExpiry:             applicant.passportExpiry ?? '',
    currentStatusOfResidence:   VISA_TYPE_LABELS[applicant.currentVisaType ?? ''] ?? applicant.currentVisaType ?? '',
    currentPeriodExpiry:        applicant.currentVisaExpiry ?? '',
    residenceCardNumber:        applicant.residenceCardNumber ?? '',
    desiredStatusOfResidence:   VISA_TYPE_LABELS[application.visaType] ?? application.visaType ?? '',
    // 所属機関マスター（全申請書共通の企業基本情報のみを自動反映）
    ...mapOrganizationToFormData(organization),
  };

  // 8. 日本における連絡先（申請人マスターから常に取得）
  const masterContactFields = {
    postalCodeInJapan:  (applicant as any).postalCode      ?? '',
    prefectureInJapan:  (applicant as any).japanPrefecture ?? '',
    cityInJapan:        (applicant as any).japanCity        ?? '',
    addressLineInJapan: (applicant as any).japanAddressLine ?? (
      !(applicant as any).japanPrefecture ? (applicant.japanAddress ?? '') : ''
    ),
    addressInJapan:  applicant.japanAddress ?? '',
    telephoneNo:     applicant.phone        ?? '',
    cellularPhoneNo: (applicant as any).mobilePhone ?? '',
  };

  // 在留資格の英語キー → 日本語ラベル変換
  const toJaVisaType = (v: string | null | undefined): string => {
    if (!v) return '';
    return VISA_TYPE_LABELS[v] ?? v;  // キーが一致すれば日本語、なければ値をそのまま
  };

  // 現在の在留資格・在留期限・在留カード番号（申請人マスターから常に取得）
  const masterStatusFields = {
    currentStatusOfResidence: toJaVisaType(applicant.currentVisaType),
    currentPeriodExpiry:      applicant.currentVisaExpiry  ?? '',
    residenceCardNumber:      applicant.residenceCardNumber ?? '',
  };

  // 取次者情報（固定値）
  const fixedAgentFields = {
    agentName:         '山口忠士',
    agentOrganization: '兵庫県行政書士会',
    agentAddress:      '〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B',
    agentPhone:        '090-2596-0128',
  };

  // EMPTY_FORM_DATA を基底として savedForm（または masterData）を上書きマージしたうえで、
  // 「8. 日本における連絡先」「現在の在留資格」「取次者」は常にマスター/固定値で上書きする。
  const initialForm: ApplicationFormData = {
    ...EMPTY_FORM_DATA,
    ...(savedForm ?? masterData),
    ...masterContactFields,   // ← 連絡先は savedForm に関わらずマスターを使用
    ...masterStatusFields,    // ← 在留資格・期限・カード番号は savedForm に関わらずマスターを使用
    ...fixedAgentFields,      // ← 取次者は常に固定値
  } as ApplicationFormData;
```

変更後:
```typescript
  const { application, applicant, organization } = data;

  // 取次者情報（固定値）
  const fixedAgentFields = {
    agentName:         '山口忠士',
    agentOrganization: '兵庫県行政書士会',
    agentAddress:      '〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B',
    agentPhone:        '090-2596-0128',
  };

  // 実効値（保存済みformData ＞ マスター由来 ＞ 空フォーム）を構築したうえで、
  // 取次者は常に固定値で上書きする。
  const initialForm: ApplicationFormData = {
    ...buildEffectiveFormData(application, applicant, organization),
    ...fixedAgentFields,
  };
```

- [ ] **Step 3: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 4: 動作確認**

`npm run dev` を起動し、既存案件の `/applications/[id]/shinsei-form` を開いて、画面に表示される値が変更前と同じであることを目視確認する（リファクタリングのみで動作変更なし）。

- [ ] **Step 5: コミット**

```bash
git add "src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx"
git commit -m "refactor: shinsei-form/page.tsxをbuildEffectiveFormData利用に統一

マスターデータ統合ロジックを共通関数に委譲。動作は変更なし。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 書類チェックリスト突合質問の定義（document-interview-checks.ts）

**Files:**
- Create: `src/lib/document-interview-checks.ts`

- [ ] **Step 1: 新規ファイルを作成**

```typescript
/**
 * 書類チェックリスト突合質問の定義。
 * チェックリストに該当書類が提出済みの場合、書類の中身について追加で確認すべき
 * 事項を質問化する。回答は applicationDocumentChecklist.expertNotes に
 * marker付きで追記され、再度同じ質問が出ないようにする。
 *
 * 対象を拡張する場合は本配列に要素を追加するだけでよい。
 */
export interface DocInterviewCheck {
  /** 質問の一意キー */
  id: string;
  /** チェックリスト項目の documentName に対する部分一致文字列 */
  matchDocumentName: string;
  /** 質問文 */
  question: string;
  /** 選択肢（有/無等） */
  options: string[];
  /** 回答済み判定・expertNotes追記に使うマーカー文字列 */
  marker: string;
}

export const DOC_INTERVIEW_CHECKS: DocInterviewCheck[] = [
  {
    id: "residence_cert_all_members",
    matchDocumentName: "住民票",
    question: "世帯全員の記載があるか確認してください",
    options: ["有", "無"],
    marker: "[顧客聴取] 世帯全員の記載",
  },
  {
    id: "tax_cert_arrears",
    matchDocumentName: "課税証明書",
    question: "未納額の有無を確認してください",
    options: ["有", "無"],
    marker: "[顧客聴取] 未納額の有無",
  },
];
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/lib/document-interview-checks.ts
git commit -m "feat: 書類チェックリスト突合質問の定義テーブルを追加

住民票（世帯全員記載確認）・課税証明書（未納額確認）の2件を初期実装。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 統合差分エンジン（interview-diff.ts）

**Files:**
- Create: `src/lib/interview-diff.ts`

- [ ] **Step 1: 新規ファイルを作成**

```typescript
/**
 * 質問書・顧客聴取の統合差分エンジン。
 * 「申請書実効値の空欄・必須確認事項（セクションA/B）」と
 * 「書類チェックリスト突合質問」を1つの質問リストとして計算する。
 * 永続化は行わず、呼び出し時点の最新データから毎回ライブ計算する。
 */
import type { ApplicationFormData } from "./form-types";
import { ALL_QUESTIONS, isEmpty } from "./questionnaire-questions";
import { DOC_INTERVIEW_CHECKS } from "./document-interview-checks";

/** applicationDocumentChecklist の行のうち、本関数が参照するフィールドのみの構造的型 */
export interface ChecklistItemForInterview {
  id: string;
  documentName: string;
  status: string;
  fileName: string | null;
  expertNotes: string | null;
}

export interface InterviewQuestion {
  /** 一意キー（保存時のターゲット特定に使用） */
  id: string;
  /** A: 全カテゴリ共通必須確認事項 / B: 資格別基本質問・書類突合質問 / C: AI検出事項 */
  bucket: "A" | "B" | "C";
  /** form: application.formData の該当キーへ保存 / checklist: 該当チェックリスト項目のexpertNotesへ追記 */
  kind: "form" | "checklist";
  section: string;
  label: string;
  note?: string;
  options?: string[];
  /** kind === "form" の場合に設定される ApplicationFormData のキー */
  formKey?: string;
  /** kind === "checklist" の場合に設定される対象チェックリスト項目ID */
  checklistItemId?: string;
  /** kind === "checklist" の場合に設定される回答済み判定・追記用マーカー */
  marker?: string;
}

/**
 * 統合差分エンジン本体。
 * effectiveForm は buildEffectiveFormData() の戻り値を渡すこと
 * （マスター由来の既知情報を誤って空欄判定しないため）。
 */
export function computeInterviewQuestions(
  effectiveForm: Partial<ApplicationFormData>,
  formType: string,
  category: string,
  checklist: ChecklistItemForInterview[],
): InterviewQuestion[] {
  const formQuestions: InterviewQuestion[] = ALL_QUESTIONS.filter((q) => {
    if (q.formTypes && !q.formTypes.includes(formType)) return false;
    if (q.categories && !q.categories.includes(category)) return false;
    if (q.condition && !q.condition(effectiveForm)) return false;
    return isEmpty(effectiveForm[q.key]);
  }).map((q) => ({
    id: `form:${String(q.key)}`,
    bucket: (q.categories ? "B" : "A") as "A" | "B",
    kind: "form" as const,
    section: q.section,
    label: q.label,
    note: q.note,
    options: q.options,
    formKey: String(q.key),
  }));

  const docQuestions: InterviewQuestion[] = [];
  for (const check of DOC_INTERVIEW_CHECKS) {
    for (const item of checklist) {
      if (!item.documentName.includes(check.matchDocumentName)) continue;
      const isUploaded = item.status === "submitted" || !!item.fileName;
      if (!isUploaded) continue;
      const alreadyAnswered = (item.expertNotes ?? "").includes(check.marker);
      if (alreadyAnswered) continue;
      docQuestions.push({
        id: `doc:${check.id}:${item.id}`,
        bucket: "B",
        kind: "checklist",
        section: "書類確認事項",
        label: `${item.documentName}：${check.question}`,
        options: check.options,
        checklistItemId: item.id,
        marker: check.marker,
      });
    }
  }

  return [...formQuestions, ...docQuestions];
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/lib/interview-diff.ts
git commit -m "feat: 質問書・顧客聴取の統合差分エンジンcomputeInterviewQuestionsを追加

セクションA/B（空欄+必須確認事項+書類突合）をライブ計算する中核ロジック。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 回答保存アクション（src/actions/interview.ts）

**Files:**
- Create: `src/actions/interview.ts`

- [ ] **Step 1: 新規ファイルを作成**

```typescript
"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, applicationDocumentChecklist } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ApplicationFormData } from "@/lib/form-types";

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

export type SaveInterviewAnswerInput =
  | { kind: "form"; applicationId: string; formKey: string; value: string }
  | {
      kind: "checklist";
      applicationId: string;
      checklistItemId: string;
      marker: string;
      value: string;
    };

/**
 * 質問書・顧客聴取の回答を直接保存する。
 * kind:"form" は application.formData の該当キーへマージ保存。
 * kind:"checklist" は該当チェックリスト項目の expertNotes へ marker付きで追記する
 * （次回の差分計算で同じ質問が再度出ないようにするため）。
 */
export async function saveInterviewAnswer(
  input: SaveInterviewAnswerInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    if (input.kind === "form") {
      const current = (app.formData ?? {}) as Partial<ApplicationFormData>;
      const updated = { ...current, [input.formKey]: input.value };

      await db
        .update(applications)
        .set({ formData: updated, updatedAt: new Date() })
        .where(and(eq(applications.id, input.applicationId), eq(applications.tenantId, tenantId)));
    } else {
      const [item] = await db
        .select()
        .from(applicationDocumentChecklist)
        .where(eq(applicationDocumentChecklist.id, input.checklistItemId))
        .limit(1);
      if (!item || item.applicationId !== input.applicationId) {
        return { success: false, error: "チェックリスト項目が見つかりません" };
      }

      const today = new Date().toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const appendLine = `${input.marker}: ${input.value}（聴取日: ${today}）`;
      const updatedNotes = [item.expertNotes, appendLine].filter(Boolean).join("\n");

      await db
        .update(applicationDocumentChecklist)
        .set({ expertNotes: updatedNotes, updatedAt: new Date() })
        .where(eq(applicationDocumentChecklist.id, input.checklistItemId));
    }

    revalidatePath(`/applications/${input.applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "保存に失敗しました" };
  }
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/actions/interview.ts
git commit -m "feat: 質問書・顧客聴取の回答保存アクションsaveInterviewAnswerを追加

formData直書込み/checklist.expertNotes追記の2方式に対応。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: AI論理矛盾検出アクション（src/actions/interview-ai-analysis.ts）

**Files:**
- Create: `src/actions/interview-ai-analysis.ts`

- [ ] **Step 1: 新規ファイルを作成**

```typescript
"use server";

import { auth } from "@/lib/auth";
import { getApplicationById } from "@/actions/applications";
import { buildEffectiveFormData } from "@/lib/effective-form-data";
import { computeInterviewQuestions, type InterviewQuestion } from "@/lib/interview-diff";
import { toFormType } from "@/lib/questionnaire-questions";
import { EMPTY_FORM_DATA, type ApplicationFormData } from "@/lib/form-types";

const SYSTEM_PROMPT = `あなたは入管申請（在留資格手続き）の専門家および優秀なヒアリングアシスタントです。
提供された「現在作成中の申請書データ（JSON）」を厳密に分析し、以下の指示に従って顧客向けの質問リストをJSON形式で出力してください。

1. データの分析:
   - 値が空欄（null, "", 未定義）になっている項目をすべてリストアップしてください。
   - すでに値が入っている項目でも、前後の論理的矛盾（例：既婚となっているが配偶者情報が空、など）がある項目を特定してください。
2. 質問文への変換:
   - テクニカルな変数名（例: \`office_address_postal_code\`）を、顧客（外国人や受入企業）が直感的に理解できる親切で分かりやすい日本語の質問文（例: 「会社の事務所の郵便番号を教えてください」）に変換してください。
3. 出力フォーマット:
   - 必ず以下の構造のプレーンなJSON配列で返却してください。
     [
       { "field": "変数名", "question": "分かりやすい質問文", "category": "C" }
     ]`;

const KNOWN_FORM_KEYS = new Set(Object.keys(EMPTY_FORM_DATA));

interface AIRawItem {
  field?: unknown;
  question?: unknown;
  category?: unknown;
}

export interface AnalyzeInterviewResult {
  success: boolean;
  questions: InterviewQuestion[];
  skipped?: boolean;
  message?: string;
  error?: string;
}

/**
 * Gemini 2.5 Flash で申請書実効値を分析し、論理矛盾等の追加確認事項（セクションC）を検出する。
 * ルールベース（セクションA/B）で既に出ている項目は重複除去し、AIの価値を矛盾検出に限定する。
 * データなし・APIキー未設定・呼び出し失敗・パース失敗のいずれの場合も例外を投げず、
 * 安全に空配列を返す（クラッシュ防止）。
 */
export async function analyzeInterviewWithAI(
  applicationId: string
): Promise<AnalyzeInterviewResult> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, questions: [], error: "認証が必要です" };

    const data = await getApplicationById(applicationId);
    const { application, applicant, organization, checklist } = data;

    const rawFormData = application.formData as Partial<ApplicationFormData> | null;
    if (!rawFormData || Object.keys(rawFormData).length === 0) {
      return {
        success: true,
        questions: [],
        skipped: true,
        message: "申請書データがまだ作成されていません。セクションA・Bの内容をご確認ください。",
      };
    }

    if (!process.env.GEMINI_API_KEY) {
      return { success: true, questions: [] };
    }

    const effectiveForm = buildEffectiveFormData(application, applicant, organization);
    const formType = toFormType(effectiveForm.applicationFormType ?? application.applicationType);
    const category = effectiveForm.visaFormCategory ?? "N";

    // ルールベースで既に出ている質問のフィールドキー（重複除去用）
    const ruleBasedQuestions = computeInterviewQuestions(effectiveForm, formType, category, checklist);
    const alreadyCovered = new Set(
      ruleBasedQuestions.filter((q) => q.kind === "form").map((q) => q.formKey)
    );

    let aiItems: AIRawItem[] = [];
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              { text: `【現在作成中の申請書データ（JSON）】\n${JSON.stringify(effectiveForm)}` },
            ],
          },
        ],
      });
      const text = response.text ?? "[]";
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          aiItems = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
        } catch {
          aiItems = [];
        }
      }
    } catch (aiErr: any) {
      console.error("[analyzeInterviewWithAI] Gemini error:", aiErr?.message);
      return { success: true, questions: [] };
    }

    const seen = new Set<string>();
    const questions: InterviewQuestion[] = [];
    for (const item of aiItems) {
      if (!item || typeof item.field !== "string" || typeof item.question !== "string") continue;
      if (!KNOWN_FORM_KEYS.has(item.field)) continue;
      if (alreadyCovered.has(item.field)) continue;
      if (seen.has(item.field)) continue;
      seen.add(item.field);
      questions.push({
        id: `ai:${item.field}`,
        bucket: "C",
        kind: "form",
        section: "AI検出事項",
        label: item.question,
        formKey: item.field,
      });
      if (questions.length >= 15) break;
    }

    return { success: true, questions };
  } catch (err: any) {
    console.error("[analyzeInterviewWithAI] error:", err?.message);
    return { success: true, questions: [], error: err?.message };
  }
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/actions/interview-ai-analysis.ts
git commit -m "feat: Gemini論理矛盾検出アクションanalyzeInterviewWithAIを追加

データなし/APIキー未設定/呼び出し失敗時は全て空配列で安全にフォールバック。
ルールベース質問との重複は除去し、最大15件にキャップ。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: questionnaire-panel.tsxをA/B/C構成に書き換え

**Files:**
- Modify: `src/components/applications/questionnaire-panel.tsx`（全体書き換え）

- [ ] **Step 1: ファイル全体を書き換え**

既存の `Question` インターフェース（`questionnaireQuestions` テーブル由来）を `InterviewQuestion` ベースに置き換え、セクションA/B（props由来・即時表示）とセクションC（AIボタン押下後）を表示する構成に変更する。

```typescript
"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInterviewAnswer } from "@/actions/interview";
import { analyzeInterviewWithAI } from "@/actions/interview-ai-analysis";
import type { InterviewQuestion } from "@/lib/interview-diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, CheckCircle, Loader2, Save, Sparkles, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionnairePanelProps {
  questions: InterviewQuestion[]; // セクションA/B（サーバーで計算済み）
  applicationId: string;
  userRole?: string;
}

const BUCKET_LABELS: Record<"A" | "B" | "C", string> = {
  A: "共通必須確認事項",
  B: "資格別・書類確認事項",
  C: "AI検出事項（論理矛盾・参考）",
};

function QuestionCard({
  question,
  applicationId,
  isExpert,
  onSaved,
}: {
  question: InterviewQuestion;
  applicationId: string;
  isExpert: boolean;
  onSaved: (questionId: string) => void;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function handleSave() {
    if (!value.trim()) return;
    setError("");
    startTransition(async () => {
      const result =
        question.kind === "form"
          ? await saveInterviewAnswer({
              kind: "form",
              applicationId,
              formKey: question.formKey!,
              value,
            })
          : await saveInterviewAnswer({
              kind: "checklist",
              applicationId,
              checklistItemId: question.checklistItemId!,
              marker: question.marker!,
              value,
            });

      if (result.success) {
        setSaved(true);
        onSaved(question.id);
      } else {
        setError(result.error ?? "保存に失敗しました");
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        saved ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-white"
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5",
            saved ? "bg-green-500 text-white" : "bg-amber-200 text-amber-700"
          )}
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : "?"}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800 leading-snug">
            {question.label}
            {question.note && (
              <span className="ml-1 text-xs text-gray-400">（{question.note}）</span>
            )}
          </p>
        </div>
      </div>

      {!saved && (
        <div className="ml-9">
          {question.options && question.options.length > 0 ? (
            <div className="flex gap-2">
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={!isExpert || isPending}
                  onClick={() => setValue(opt)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-lg border",
                    value === opt
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              readOnly={!isExpert}
              rows={2}
              placeholder={isExpert ? "お客様からの回答を入力してください..." : ""}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          )}

          {isExpert && (
            <div className="flex items-center justify-end mt-2 gap-2">
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button
                onClick={handleSave}
                disabled={isPending || !value.trim()}
                className="inline-flex items-center gap-1 text-xs text-amber-700 border border-amber-300 rounded px-2 py-1 hover:bg-amber-50 disabled:opacity-40"
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                保存
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionnairePanel({ questions, applicationId, userRole }: QuestionnairePanelProps) {
  const router = useRouter();
  const isExpert = userRole === "expert" || userRole === "admin";

  const [aiQuestions, setAiQuestions] = useState<InterviewQuestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiRequested, setAiRequested] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const visibleRuleQuestions = useMemo(
    () => questions.filter((q) => !resolvedIds.has(q.id)),
    [questions, resolvedIds]
  );
  const visibleAiQuestions = useMemo(
    () => aiQuestions.filter((q) => !resolvedIds.has(q.id)),
    [aiQuestions, resolvedIds]
  );

  function handleSaved(questionId: string) {
    setResolvedIds((prev) => new Set(prev).add(questionId));
    // セクションA/Bはサーバー側の差分計算結果なので、保存内容を反映させて再計算する
    router.refresh();
  }

  async function handleAnalyze() {
    setAiLoading(true);
    setAiError("");
    setAiMessage("");
    setAiRequested(true);
    try {
      const result = await analyzeInterviewWithAI(applicationId);
      if (!result.success) {
        setAiError(result.error ?? "AI分析に失敗しました");
      } else if (result.skipped) {
        setAiMessage(result.message ?? "AI分析をスキップしました");
      } else {
        setAiQuestions(result.questions);
        if (result.questions.length === 0) {
          setAiMessage("AIによる追加検出事項はありませんでした。");
        }
      }
    } catch (e: any) {
      setAiError(e?.message ?? "AI分析に失敗しました");
    } finally {
      setAiLoading(false);
    }
  }

  function renderBucket(bucket: "A" | "B" | "C", items: InterviewQuestion[]) {
    if (items.length === 0) return null;
    const bySection = items.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
      (acc[q.section] ??= []).push(q);
      return acc;
    }, {});
    return (
      <div key={bucket} className="space-y-3">
        <h3 className="text-sm font-semibold text-amber-900">{BUCKET_LABELS[bucket]}</h3>
        {Object.entries(bySection).map(([section, sectionQuestions]) => (
          <div key={section} className="space-y-2">
            <p className="text-xs text-gray-500">{section}</p>
            {sectionQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                applicationId={applicationId}
                isExpert={isExpert}
                onSaved={handleSaved}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  const aQuestions = visibleRuleQuestions.filter((q) => q.bucket === "A");
  const bQuestions = visibleRuleQuestions.filter((q) => q.bucket === "B");
  const totalCount = aQuestions.length + bQuestions.length + visibleAiQuestions.length;

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <MessageSquare className="w-5 h-5 text-amber-600" />
            質問書　— お客様への確認事項
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-amber-700 bg-amber-100 rounded-full px-3 py-1">
              {totalCount} 件
            </span>
            {isExpert && (
              <button
                onClick={handleAnalyze}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                AIで分析
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-amber-700 mt-1">
          以下の質問をお客様に確認し、回答を入力してください。回答は申請書に自動反映されます。
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {aQuestions.length === 0 && bQuestions.length === 0 && !aiRequested && (
          <p className="text-sm text-amber-700 text-center py-4">
            聴取が必要な事項はありません。
          </p>
        )}

        {renderBucket("A", aQuestions)}
        {renderBucket("B", bQuestions)}

        {(aiMessage || aiError) && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
              aiError ? "bg-red-50 text-red-700 border border-red-200" : "bg-blue-50 text-blue-700 border border-blue-200"
            )}
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {aiError || aiMessage}
          </div>
        )}

        {renderBucket("C", visibleAiQuestions)}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/components/applications/questionnaire-panel.tsx
git commit -m "feat: questionnaire-panel.tsxをセクションA/B/C構成に書き換え

ライブ計算されたA/Bを即時表示、AIボタン押下でセクションCを追加表示。
選択肢付き質問はボタン選択、自由記述はtextareaで回答。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: applications/[id]/page.tsxの配線変更

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/page.tsx:88, 276, 416, 474-496`

- [ ] **Step 1: importを追加し、destructureから questionnaire を削除**

88行目を変更:

変更前:
```typescript
  const { application, applicant, organization, checklist, questionnaire } = data;
```

変更後:
```typescript
  const { application, applicant, organization, checklist } = data;
```

ファイル先頭の import 群に以下を追加する（既存の `import { QuestionnairePanel } ...` の直後など、適切な位置）:

```typescript
import { buildEffectiveFormData } from "@/lib/effective-form-data";
import { computeInterviewQuestions } from "@/lib/interview-diff";
import { toFormType } from "@/lib/questionnaire-questions";
```

`const { application, applicant, organization, checklist } = data;` の直後に、差分質問の計算を追加する:

```typescript
  const effectiveForm = buildEffectiveFormData(application, applicant, organization);
  const interviewFormType = toFormType(effectiveForm.applicationFormType ?? application.applicationType);
  const interviewCategory = effectiveForm.visaFormCategory ?? "N";
  const interviewQuestions = computeInterviewQuestions(
    effectiveForm,
    interviewFormType,
    interviewCategory,
    checklist
  );
```

- [ ] **Step 2: WorkflowStepperへのhasQuestionnaireを更新**

276行目を変更:

変更前:
```typescript
            hasQuestionnaire={questionnaire.length > 0}
```

変更後:
```typescript
            hasQuestionnaire={interviewQuestions.length > 0}
```

- [ ] **Step 3: 質問書件数表示を更新**

416行目を変更:

変更前:
```typescript
                <dd>{questionnaire.length}件</dd>
```

変更後:
```typescript
                <dd>{interviewQuestions.length}件</dd>
```

- [ ] **Step 4: QuestionnairePanelへの渡し方を更新**

474-496行目を変更:

変更前:
```typescript
      {/* 3. 質問書・顧客聴取（ステップ5以降） */}
      {(application.status === "questionnaire_sent" || application.status === "under_review" || application.status === "submitted" || application.status === "completed") && (
        <CollapsibleSection
          title="質問書・顧客聴取"
          badge={questionnaire.length > 0 ? `${questionnaire.length}件` : undefined}
          defaultOpen={application.status === "questionnaire_sent"}
          accentClass="bg-orange-400"
        >
          <QuestionnairePanel
            questions={questionnaire.map((q) => ({
              id: q.id,
              fieldKey: q.fieldKey,
              questionJa: q.questionJa,
              answer: q.answer,
              answeredAt: q.answeredAt,
              isRequired: q.isRequired,
              answerType: q.answerType,
            }))}
            applicationId={application.id}
            userRole={userRole}
          />
        </CollapsibleSection>
      )}
```

変更後:
```typescript
      {/* 3. 質問書・顧客聴取（ステップ5以降） */}
      {(application.status === "questionnaire_sent" || application.status === "under_review" || application.status === "submitted" || application.status === "completed") && (
        <CollapsibleSection
          title="質問書・顧客聴取"
          badge={interviewQuestions.length > 0 ? `${interviewQuestions.length}件` : undefined}
          defaultOpen={application.status === "questionnaire_sent"}
          accentClass="bg-orange-400"
        >
          <QuestionnairePanel
            questions={interviewQuestions}
            applicationId={application.id}
            userRole={userRole}
          />
        </CollapsibleSection>
      )}
```

- [ ] **Step 5: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 6: コミット**

```bash
git add "src/app/(dashboard)/applications/[id]/page.tsx"
git commit -m "feat: applications/[id]/page.tsxを統合差分エンジン配線に変更

questionnaireQuestionsテーブル参照を廃止し、computeInterviewQuestions
のライブ計算結果をQuestionnairePanelに渡すよう変更。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 11: workflow-stepper.tsxからAI自動生成呼び出しを削除

**Files:**
- Modify: `src/components/applications/workflow-stepper.tsx:1-70, 123-128`

- [ ] **Step 1: importを変更**

変更前（4-8行目）:
```typescript
import { useState } from "react";
import {
  updateApplicationStatus,
  generateQuestionnaire,
} from "@/actions/applications";
```

変更後:
```typescript
import { useState } from "react";
import { updateApplicationStatus } from "@/actions/applications";
```

- [ ] **Step 2: runAutoProcessからAI呼び出しを削除**

変更前（123-128行目）:
```typescript
  async function runAutoProcess(nextStep: string) {
    if (nextStep === "questionnaire_sent") {
      setProcessingMessage("AIが質問書を生成中...");
      await generateQuestionnaire(applicationId);
    }
  }
```

変更後:
```typescript
  async function runAutoProcess(_nextStep: string) {
    // 質問書・顧客聴取はライブ計算（computeInterviewQuestions）に置き換えたため、
    // ステップ遷移時の事前生成処理は不要になった。
  }
```

- [ ] **Step 3: STEP_DESCRIPTIONSの説明文を更新**

`questionnaire_sent` の説明文（54-57行目）を変更:

変更前:
```typescript
  questionnaire_sent: {
    action: "不足情報の質問書をAIが自動生成しました。お客様に確認して回答を入力してください",
    hint: "全質問への回答を保存してから、次のステップへ進んでください",
  },
```

変更後:
```typescript
  questionnaire_sent: {
    action: "不足している情報をシステムが自動検出しました。お客様に確認して回答を入力してください",
    hint: "必要に応じて「AIで分析」ボタンで論理矛盾の検出も行えます。全質問への回答を保存してから、次のステップへ進んでください",
  },
```

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add src/components/applications/workflow-stepper.tsx
git commit -m "refactor: workflow-stepperからgenerateQuestionnaireのAI呼び出しを削除

質問書はページ表示時にライブ計算されるため、ステップ遷移時の事前生成が不要に。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 12: 印刷・DOCX出力系統を統合差分エンジンに接続

**Files:**
- Modify: `src/app/api/applications/[id]/questionnaire-content/route.ts`
- Modify: `src/app/print/[id]/questionnaire/page.tsx`
- Modify: `src/app/api/applications/[id]/questionnaire-gdoc/route.ts`

3ファイルとも同一のパターン（`organizationMaster` 取得の追加、`getEmptyQuestions` 直呼びを `computeInterviewQuestions` に置き換え、AI(セクションC)は印刷に含めない）で変更する。

- [ ] **Step 1: questionnaire-content/route.ts を変更**

変更前（1-30行目）:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData } from "@/lib/form-types";
import { ALL_QUESTIONS, toFormType, getEmptyQuestions } from "@/lib/questionnaire-questions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!session?.user || !tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const cat = (form.visaFormCategory ?? "N") as string;

  const emptyQuestions = getEmptyQuestions(form, formType, cat);
```

変更後:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster, applicationDocumentChecklist } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { toFormType } from "@/lib/questionnaire-questions";
import { buildEffectiveFormData } from "@/lib/effective-form-data";
import { computeInterviewQuestions } from "@/lib/interview-diff";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!session?.user || !tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);

  const organization = app.organizationId
    ? await db.select().from(organizationMaster).where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
    : null;

  const checklist = await db.select().from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id));

  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist);
```

ファイル後半（32行目以降）で `emptyQuestions` を使ったセクション分け・テキスト生成ロジックはそのまま残す（`q.section`/`q.label`/`q.note`/`q.options` のプロパティ名が一致しているため変更不要）。

- [ ] **Step 2: print/[id]/questionnaire/page.tsx を変更**

変更前（1-35行目）:
```typescript
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ApplicationFormData } from "@/lib/form-types";
import { toFormType, getEmptyQuestions } from "@/lib/questionnaire-questions";

export default async function QuestionnairePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) notFound();

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId))
    .limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const cat = (form.visaFormCategory ?? "N") as string;

  const emptyQuestions = getEmptyQuestions(form, formType, cat);
```

変更後:
```typescript
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster, applicationDocumentChecklist } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { toFormType } from "@/lib/questionnaire-questions";
import { buildEffectiveFormData } from "@/lib/effective-form-data";
import { computeInterviewQuestions } from "@/lib/interview-diff";

export default async function QuestionnairePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) notFound();

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId))
    .limit(1);

  const organization = app.organizationId
    ? await db.select().from(organizationMaster).where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
    : null;

  const checklist = await db.select().from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id));

  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist);
```

ファイル後半（37行目以降）の `sections` 構築・JSX描画ロジックはそのまま残す。ただし `InterviewQuestion` には `.key` プロパティが存在しない（`.id` に置き換わっている）ため、React の `key` 属性として `q.key` を参照している箇所を `q.id` に置き換える必要がある。該当箇所（`<div key={String(q.key)} className="question-block">`）を次のように変更する:

変更前:
```typescript
                  <div key={String(q.key)} className="question-block">
```

変更後:
```typescript
                  <div key={q.id} className="question-block">
```

- [ ] **Step 3: questionnaire-gdoc/route.ts を変更**

変更前（1-89行目のうち、データ取得・差分計算部分）:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData } from "@/lib/form-types";
import { toFormType, getEmptyQuestions, type QQuestion } from "@/lib/questionnaire-questions";
```

変更後:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster, applicationDocumentChecklist } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { toFormType } from "@/lib/questionnaire-questions";
import { buildEffectiveFormData } from "@/lib/effective-form-data";
import { computeInterviewQuestions, type InterviewQuestion } from "@/lib/interview-diff";
```

`buildLines` 関数の型シグネチャ（14-19行目）を変更:

変更前:
```typescript
function buildLines(
  applicantName: string,
  caseNumber: string | null,
  sections: Record<string, QQuestion[]>,
  today: string,
): DocLine[] {
```

変更後:
```typescript
function buildLines(
  applicantName: string,
  caseNumber: string | null,
  sections: Record<string, InterviewQuestion[]>,
  today: string,
): DocLine[] {
```

GETハンドラ内のデータ取得・差分計算部分（73-89行目）を変更:

変更前:
```typescript
  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const cat = (form.visaFormCategory ?? "N") as string;

  const emptyQuestions = getEmptyQuestions(form, formType, cat);
  const sections = emptyQuestions.reduce<Record<string, QQuestion[]>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});
```

変更後:
```typescript
  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);

  const organization = app.organizationId
    ? await db.select().from(organizationMaster).where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
    : null;

  const checklist = await db.select().from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id));

  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist);
  const sections = emptyQuestions.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});
```

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add src/app/api/applications/[id]/questionnaire-content/route.ts \
        "src/app/print/[id]/questionnaire/page.tsx" \
        "src/app/api/applications/[id]/questionnaire-gdoc/route.ts"
git commit -m "refactor: 印刷・DOCX出力系統を統合差分エンジンに接続

getEmptyQuestions直呼びをcomputeInterviewQuestions経由に変更し、
マスター由来の既知情報を誤って空欄判定するバグも解消。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 13: 旧AI生成系統の削除（actions/applications.ts）

**Files:**
- Modify: `src/actions/applications.ts:12, 191-196, 1069-1302`

- [ ] **Step 1: questionnaireQuestionsのimportを削除**

12行目を変更:

変更前:
```typescript
import {
  applications,
  applicantMaster,
  organizationMaster,
  applicationDocumentChecklist,
  documentRequirementMaster,
  applicationSnapshots,
  questionnaireQuestions,
  auditLog,
  applicantDocuments,
} from "@/lib/db/schema";
```

変更後:
```typescript
import {
  applications,
  applicantMaster,
  organizationMaster,
  applicationDocumentChecklist,
  documentRequirementMaster,
  applicationSnapshots,
  auditLog,
  applicantDocuments,
} from "@/lib/db/schema";
```

- [ ] **Step 2: getApplicationByIdからquestionnaireクエリを削除**

191-196行目を変更:

変更前:
```typescript
  const questionnaire = await db
    .select()
    .from(questionnaireQuestions)
    .where(eq(questionnaireQuestions.applicationId, id));

  return { application, applicant, organization, checklist, questionnaire };
}
```

変更後:
```typescript
  return { application, applicant, organization, checklist };
}
```

- [ ] **Step 3: 旧AI生成3関数を削除**

1069行目（`// ── 質問書の自動生成（下書きの不足情報をAIが抽出） ───────────────────────────`）から1302行目（`applyQuestionnaireToDraft` の閉じ括弧）までの全体を削除する。次の行（1304行目 `// ── 申請書フォームデータ保存 ──...`）の直前は空行1行のみにする。

削除対象の開始行（1069行目）:
```typescript
// ── 質問書の自動生成（下書きの不足情報をAIが抽出） ───────────────────────────
export async function generateQuestionnaire(
```

削除対象の終了行（1302行目）:
```typescript
}
```
（`applyQuestionnaireToDraft` 関数の最後の閉じ括弧。直後は `saveApplicationFormData` 関数の直前コメント）

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功（`generateQuestionnaire`/`updateQuestionnaireAnswer`/`applyQuestionnaireToDraft` への参照が残っていればこの時点でビルドエラーになるはずなので、Task 9〜11で参照を削除済みであることがここで検証される）

- [ ] **Step 5: コミット**

```bash
git add src/actions/applications.ts
git commit -m "refactor: 旧AI質問生成系統（generateQuestionnaire等）を削除

questionnaireQuestionsテーブルへの参照も含めて削除。
質問書・顧客聴取はcomputeInterviewQuestions+analyzeInterviewWithAIに統合済み。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 14: questionnaire_questionsテーブルのDBマイグレーション削除

**Files:**
- Modify: `src/lib/db/schema.ts:212-226, 346`
- Create（一時）: `scripts/drop-questionnaire-questions.cjs`（実行後に削除）

- [ ] **Step 1: schema.tsからテーブル定義とrelationsを削除**

212-226行目（`questionnaireQuestions` テーブル定義全体）を削除する。

削除対象:
```typescript
// ─── Questionnaire ────────────────────────────────────────────────────────────
export const questionnaireQuestions = pgTable("questionnaire_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull().references(() => applications.id),
  fieldKey: text("field_key").notNull(),
  questionJa: text("question_ja").notNull(),
  questionEn: text("question_en"),
  questionNative: text("question_native"),
  nativeLanguage: text("native_language"),
  answerType: text("answer_type").notNull(),
  options: jsonb("options"),
  answer: text("answer"),
  answeredAt: timestamp("answered_at"),
  isRequired: boolean("is_required").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

346行目（`applicationsRelations` 内）を変更:

変更前:
```typescript
  documentChecklist: many(applicationDocumentChecklist),
  questionnaire: many(questionnaireQuestions),
  auditLogs: many(auditLog),
```

変更後:
```typescript
  documentChecklist: many(applicationDocumentChecklist),
  auditLogs: many(auditLog),
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: 既存データのバックアップ確認＋テーブル削除スクリプトを作成**

`drizzle-kit push` はこの開発環境でNeonへのWebSocket接続がハングする既知の問題があるため、`@neondatabase/serverless` の `neon()`（HTTP方式）を直接使うスクリプトで削除する。`.env.local` の `DATABASE_URL` は値がダブルクォートで囲まれており、かつ `channel_binding` パラメータが `neon()` で非対応のため、両方を除去してから接続する（前回のカラム削除作業で確認済みの手順）。

`scripts/drop-questionnaire-questions.cjs` を作成:

```javascript
/**
 * questionnaire_questions テーブル削除スクリプト（一時使用・実行後に削除）
 */
const { neon } = require("@neondatabase/serverless");
const { readFileSync } = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf8");

const urlLine = envContent.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!urlLine) throw new Error("DATABASE_URL not found in .env.local");
let dbUrl = urlLine.slice("DATABASE_URL=".length).trim().replace(/\r/g, "");
dbUrl = dbUrl.replace(/&channel_binding=[^&]*/g, "").replace(/\?channel_binding=[^&]*/g, "");
dbUrl = dbUrl.replace(/^["']|["']$/g, "");

async function main() {
  const sql = neon(dbUrl);

  const existing = await sql`
    SELECT id, application_id, field_key, question_ja, answer
    FROM questionnaire_questions
    WHERE answer IS NOT NULL AND answer != ''
  `;
  if (existing.length > 0) {
    console.log("【バックアップ】回答済みデータが存在する行:");
    for (const row of existing) {
      console.log(`  id=${row.id} | app=${row.application_id} | ${row.field_key}: ${row.question_ja} => ${row.answer}`);
    }
  } else {
    console.log("回答済みデータはありません（バックアップ不要）");
  }

  console.log("\nDROP TABLE IF EXISTS questionnaire_questions を実行中...");
  await sql`DROP TABLE IF EXISTS questionnaire_questions`;
  console.log("完了: questionnaire_questions テーブルを削除しました。");
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
```

- [ ] **Step 4: スクリプトを実行**

Run: `node scripts/drop-questionnaire-questions.cjs`
Expected: バックアップ表示（あれば）の後 `完了: questionnaire_questions テーブルを削除しました。` が出力される

- [ ] **Step 5: スクリプトを削除**

```bash
rm scripts/drop-questionnaire-questions.cjs
```

- [ ] **Step 6: コミット**

```bash
git add src/lib/db/schema.ts
git commit -m "refactor: questionnaire_questionsテーブルをスキーマから削除

DB側も既存データ確認後にDROP TABLE済み（回答済みデータはなし）。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 15: 最終ビルド確認・手動機能テスト・デプロイ

**Files:** なし（検証のみ）

- [ ] **Step 1: クリーンビルド**

```bash
rm -rf .next
npm run build
```

Expected: エラーなく成功

- [ ] **Step 2: クラッシュ安全性の確認（formDataが空の新規案件）**

`npm run dev` を起動し、まだ申請書フォームを一度も保存していない新規案件で `/applications/[id]` を開き、「質問書・顧客聴取」セクションがエラーなく表示され、セクションA・Bの項目（空欄＋共通必須確認事項）が表示されることを確認する。

- [ ] **Step 3: AI分析スキップの確認**

同じ新規案件（formData未保存）で「AIで分析」ボタンを押し、Geminiを呼び出さずに「申請書データがまだ作成されていません」のメッセージが表示されることを確認する。

- [ ] **Step 4: ルールベース質問の確認（データありの案件）**

V または N カテゴリで `ApplicationFormData` に一部入力済みの既存案件を開き、空欄項目・新規6フィールド（二重契約・税滞納等）・書類確認質問（住民票/課税証明書を提出済みの場合）が表示されることを確認する。

- [ ] **Step 5: 回答保存と自動消去の確認**

セクションBの空欄項目を1つ選び、値を入力して保存。保存後、該当質問がリストから消えることを確認する。「申請書作成」画面（`/applications/[id]/shinsei-form`）を開き、該当フィールドに保存した値が反映されていることを確認する。

書類確認質問（住民票等）がある場合は同様に回答・保存し、消えることを確認したうえで、チェックリストの該当項目の `expertNotes` に確認文言が追記されていることを確認する（チェックリストUIに既存の備考欄表示があれば、そこで確認できる）。

- [ ] **Step 6: AI分析（データありの場合）の確認**

`GEMINI_API_KEY` が設定された環境で、「AIで分析」ボタンを押し、セクションCにAI検出事項が表示されることを確認する（論理矛盾がない案件では「AIによる追加検出事項はありませんでした。」と表示されることも正常）。

- [ ] **Step 7: 印刷・DOCX出力の確認**

`/print/[id]/questionnaire` を開き、画面と同じ縮小済みのA/Bリストが表示されることを確認する（AI検出事項は含まれない）。「顧客向け質問書」ボタン（DOCX/Googleドキュメント出力）も同様に確認する。

- [ ] **Step 8: コミット・プッシュ・デプロイ**

```bash
git status
git push origin feature/pdf-split-and-org-master
npx vercel --prod
```

デプロイ完了後、本番URL（`https://zairyu-shinsei-system.vercel.app`）で同様の確認を行う。

---

## スコープ外（将来拡張、本計画では実装しない）

- V（特定技能）固有の追加確認項目（共通3項目をV/N両カテゴリに適用するのみ）
- ③書類突合質問の対象拡大（雇用契約書・身元保証書・在留カードコピー等）
- 他の在留資格カテゴリ（M/L/I/J/K/O/P/Q/R/T/Y/H/U）への必須確認事項拡張
