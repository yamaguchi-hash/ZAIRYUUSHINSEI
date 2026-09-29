# 質問の個別削除・復元機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 質問書・顧客聴取パネルの各質問（セクションA/B/C）にゴミ箱ボタンを追加し、個別に除外（非表示）・復元できるようにする。除外状態は案件データに永続化し、画面リロードやAI再分析でも一度消した質問が復活しないようにする。

**Architecture:** 質問IDが決定的（`form:${formKey}` / `doc:${checkId}:${itemId}` / `ai:${field}`）であることを利用し、`applications`テーブルにID配列を1カラム追加して除外リストを永続化する。サーバー側の差分計算（`computeInterviewQuestions`／`analyzeInterviewWithAI`）は除外された質問を取り除かず`isExcluded`フラグを付与するのみとし、印刷・DOCX出力ルートだけが完全フィルタする。

**Tech Stack:** Next.js 16 (App Router) / TypeScript / Drizzle ORM + Neon Postgres / React 19（既存ライブラリのみ、新規依存追加なし）

**参照仕様書:** `docs/superpowers/specs/2026-06-19-interview-question-exclusion-design.md`

**検証方法について:** このプロジェクトには自動テストランナーが設定されていないため、各タスクの「テスト」は `npm run build` と最終タスクでの手動機能確認に置き換える。

---

### Task 1: applicationsテーブルにinterviewExcludedFieldsカラムを追加

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: スキーマにカラムを追加**

`src/lib/db/schema.ts` の `applications` テーブル定義内、`notes: text("notes"),` の行の直後に追加する。

変更前:
```typescript
  submittedAt: timestamp("submitted_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

変更後:
```typescript
  submittedAt: timestamp("submitted_at"),
  notes: text("notes"),
  // 質問書・顧客聴取で手動除外した質問ID一覧（form:xxx / doc:xxx:xxx / ai:xxx 形式）
  interviewExcludedFields: jsonb("interview_excluded_fields").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: DBマイグレーション実行**

`drizzle-kit push` はこの開発環境でハングする既知の問題があるため、`@neondatabase/serverless` の `neon()`（HTTP方式）を直接使うスクリプトでカラムを追加する。`.env.local` の `DATABASE_URL` はダブルクォートで囲まれており、かつ `channel_binding` パラメータが `neon()` で非対応のため、両方を除去してから接続する。

`scripts/add-interview-excluded-fields.cjs` を作成:

```javascript
/**
 * applications.interview_excluded_fields カラム追加スクリプト（一時使用・実行後に削除）
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

  console.log("ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_excluded_fields jsonb NOT NULL DEFAULT '[]' を実行中...");
  await sql`ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_excluded_fields jsonb NOT NULL DEFAULT '[]'::jsonb`;
  console.log("完了: interview_excluded_fields カラムを追加しました。");

  const check = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'applications' AND column_name = 'interview_excluded_fields'
  `;
  if (check.length === 1) {
    console.log("✓ カラムが正常に追加されていることを確認しました:", check[0]);
  } else {
    console.error("✗ カラムが見つかりません。手動で確認してください。");
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
```

- [ ] **Step 4: スクリプトを実行**

Run: `node scripts/add-interview-excluded-fields.cjs`
Expected: `完了: interview_excluded_fields カラムを追加しました。` および `✓ カラムが正常に追加されていることを確認しました` が出力される

- [ ] **Step 5: スクリプトを削除**

```bash
rm scripts/add-interview-excluded-fields.cjs
```

- [ ] **Step 6: コミット**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: applicationsにinterviewExcludedFieldsカラムを追加

質問書・顧客聴取で手動除外した質問IDを永続化するためのjsonb配列カラム。
DB側もALTER TABLE実行済み（デフォルト空配列・NOT NULL）。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## IMPORTANT: Pre-existing unrelated changes — DO NOT TOUCH（全タスク共通）

作業ディレクトリには本作業と無関係な未コミット変更が存在する場合がある:
- `src/app/print/[id]/shinsei-applicant/page.tsx`
- `src/app/print/[id]/shinsei-shared.tsx`
- `dev.log`, `dev-test.log`

**これらのファイルは一切ステージ・コミットしないこと。** コミット時は必ず対象ファイルのみを明示的に`git add`し、`git add -A`や`git add .`は使用しないこと。

---

### Task 2: InterviewQuestionにisExcludedを追加し、computeInterviewQuestionsを拡張

**Files:**
- Modify: `src/lib/interview-diff.ts`（全体）

- [ ] **Step 1: ファイル全体を書き換え**

```typescript
/**
 * 質問書・顧客聴取の統合差分エンジン。
 * 「申請書実効値の空欄・必須確認事項（セクションA/B）」と
 * 「書類チェックリスト突合質問」を1つの質問リストとして計算する。
 * 永続化は行わず、呼び出し時点の最新データから毎回ライブ計算する。
 */
import type { ApplicationFormData } from "./form-types";
import { getEmptyQuestions } from "./questionnaire-questions";
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
  /**
   * A: 全カテゴリ共通必須確認事項 / B: 資格別基本質問・書類突合質問 / C: AI検出事項
   * 注: "C" は本ファイルの computeInterviewQuestions では生成されない。
   * analyzeInterviewWithAI が付与するためのバケット。
   */
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
  /**
   * ユーザーが手動で除外（削除）した質問かどうか。
   * true でも質問自体は配列から取り除かれない（復元UIのために残す）。
   * 印刷・DOCX出力など復元UIを持たない出力先のみ、この値で完全フィルタすること。
   */
  isExcluded?: boolean;
}

/**
 * 統合差分エンジン本体。
 * effectiveForm は buildEffectiveFormData() の戻り値を渡すこと
 * （マスター由来の既知情報を誤って空欄判定しないため）。
 * excludedIds はユーザーが手動除外した質問IDの集合（application.interviewExcludedFields から構築）。
 */
export function computeInterviewQuestions(
  effectiveForm: Partial<ApplicationFormData>,
  formType: string,
  category: string,
  checklist: ChecklistItemForInterview[],
  excludedIds: Set<string> = new Set(),
): InterviewQuestion[] {
  const formQuestions: InterviewQuestion[] = getEmptyQuestions(
    effectiveForm,
    formType,
    category,
  ).map((q) => {
    const formKey = String(q.key);
    const id = `form:${formKey}`;
    return {
      id,
      bucket: q.categories ? "B" : "A",
      kind: "form" as const,
      section: q.section,
      label: q.label,
      note: q.note,
      options: q.options,
      formKey,
      isExcluded: excludedIds.has(id),
    };
  });

  const docQuestions: InterviewQuestion[] = [];
  for (const check of DOC_INTERVIEW_CHECKS) {
    for (const item of checklist) {
      if (!item.documentName.includes(check.matchDocumentName)) continue;
      const isUploaded = item.status === "submitted" || !!item.fileName;
      if (!isUploaded) continue;
      const alreadyAnswered = (item.expertNotes ?? "").includes(check.marker);
      if (alreadyAnswered) continue;
      const id = `doc:${check.id}:${item.id}`;
      docQuestions.push({
        id,
        bucket: "B",
        kind: "checklist",
        section: "書類確認事項",
        label: `${item.documentName}：${check.question}`,
        options: check.options,
        checklistItemId: item.id,
        marker: check.marker,
        isExcluded: excludedIds.has(id),
      });
    }
  }

  return [...formQuestions, ...docQuestions];
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: 一時的にエラーが出る可能性がある（`computeInterviewQuestions`の呼び出し元4箇所がまだ5番目の引数を渡していないため）。**5番目の引数 `excludedIds` はデフォルト値`new Set()`を持つためTypeScript的にはエラーにならないはずだが、念のため確認する。**
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/lib/interview-diff.ts
git commit -m "feat: InterviewQuestionにisExcludedフラグ、computeInterviewQuestionsにexcludedIds引数を追加

質問は除外せずフラグ付与のみ行う（復元UIのため配列から取り除かない）。
呼び出し元は後続タスクで除外リストを渡すよう更新する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 質問除外トグルアクションを追加

**Files:**
- Modify: `src/actions/interview.ts`

- [ ] **Step 1: 末尾に新規アクションを追加**

`src/actions/interview.ts` の末尾（`saveInterviewAnswer` 関数の閉じ括弧の後）に以下を追加する。

```typescript

/**
 * 質問書・顧客聴取の質問を手動で除外（または復元）する。
 * 質問自体はサーバー側の計算結果から取り除かれない（isExcludedフラグで制御）。
 * このアクションは application.interviewExcludedFields のID配列を更新するのみ。
 */
export async function setInterviewQuestionExcluded(
  applicationId: string,
  questionId: string,
  excluded: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const current = (app.interviewExcludedFields ?? []) as string[];
    const updated = excluded
      ? (current.includes(questionId) ? current : [...current, questionId])
      : current.filter((id) => id !== questionId);

    await db
      .update(applications)
      .set({ interviewExcludedFields: updated, updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "保存に失敗しました" };
  }
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功（`applications.interviewExcludedFields` は Task 1 で追加済みのため型解決される）

- [ ] **Step 3: コミット**

```bash
git add src/actions/interview.ts
git commit -m "feat: 質問除外トグルアクションsetInterviewQuestionExcludedを追加

application.interviewExcludedFieldsのID配列をadd/remove。
既存のsaveInterviewAnswerと同じ認証・テナントチェックパターンを踏襲。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: AI分析結果にもisExcludedフラグを付与

**Files:**
- Modify: `src/actions/interview-ai-analysis.ts`

- [ ] **Step 1: excludedIds構築とフラグ付与を追加**

変更前（68-78行目付近、`if (!process.env.GEMINI_API_KEY)` から `alreadyCovered` 構築まで）:
```typescript
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
```

変更後:
```typescript
    if (!process.env.GEMINI_API_KEY) {
      return { success: true, questions: [] };
    }

    const excludedIds = new Set((application.interviewExcludedFields ?? []) as string[]);

    const effectiveForm = buildEffectiveFormData(application, applicant, organization);
    const formType = toFormType(effectiveForm.applicationFormType ?? application.applicationType);
    const category = effectiveForm.visaFormCategory ?? "N";

    // ルールベースで既に出ている質問のフィールドキー（重複除去用）
    const ruleBasedQuestions = computeInterviewQuestions(effectiveForm, formType, category, checklist, excludedIds);
    const alreadyCovered = new Set(
      ruleBasedQuestions.filter((q) => q.kind === "form").map((q) => q.formKey)
    );
```

次に、AI検出結果を組み立てるループ内で `isExcluded` を設定する。

変更前:
```typescript
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
```

変更後:
```typescript
      seen.add(item.field);
      const id = `ai:${item.field}`;
      questions.push({
        id,
        bucket: "C",
        kind: "form",
        section: "AI検出事項",
        label: item.question,
        formKey: item.field,
        isExcluded: excludedIds.has(id),
      });
      if (questions.length >= 15) break;
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/actions/interview-ai-analysis.ts
git commit -m "feat: analyzeInterviewWithAIのAI検出結果にもisExcludedを付与

ルールベースとAI検出の両方で同一のexcludedIdsを参照し、
手動除外した質問が再分析後も自動的に「除外済み」表示になるようにする。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: applications/[id]/page.tsxにexcludedIdsを配線

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/page.tsx`

- [ ] **Step 1: computeInterviewQuestions呼び出しにexcludedIdsを追加**

変更前（91-101行目）:
```typescript
  const { application, applicant, organization, checklist } = data;

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

変更後:
```typescript
  const { application, applicant, organization, checklist } = data;

  const effectiveForm = buildEffectiveFormData(application, applicant, organization);
  const interviewFormType = toFormType(effectiveForm.applicationFormType ?? application.applicationType);
  const interviewCategory = effectiveForm.visaFormCategory ?? "N";
  const interviewExcludedIds = new Set((application.interviewExcludedFields ?? []) as string[]);
  const interviewQuestions = computeInterviewQuestions(
    effectiveForm,
    interviewFormType,
    interviewCategory,
    checklist,
    interviewExcludedIds
  );
```

`interviewQuestions`（`isExcluded`フラグ付きの配列）は、既存のまま`<QuestionnairePanel questions={interviewQuestions} .../>`に渡す（Task 7でパネル側がフラグを見て表示制御するため、ここでのフィルタは不要）。`hasQuestionnaire`／件数表示（`interviewQuestions.length`）は除外済みも含めた総数になるが、これは許容する（バッジ・カウント表示の意味合いを変えるのは本タスクのスコープ外）。

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add "src/app/(dashboard)/applications/[id]/page.tsx"
git commit -m "feat: applications/[id]/page.tsxにinterviewExcludedFieldsを配線

computeInterviewQuestionsへexcludedIdsを渡し、isExcludedフラグ付きで
QuestionnairePanelに渡すよう変更。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 印刷・DOCX出力3ルートでexcludedIdsを配線し完全フィルタ

**Files:**
- Modify: `src/app/api/applications/[id]/questionnaire-content/route.ts`
- Modify: `src/app/print/[id]/questionnaire/page.tsx`
- Modify: `src/app/api/applications/[id]/questionnaire-gdoc/route.ts`

3ファイルとも同一パターンで変更する：`computeInterviewQuestions`呼び出しに`excludedIds`を渡し、戻り値から`isExcluded`の質問を`.filter()`で完全除去してから後続処理に渡す。

- [ ] **Step 1: questionnaire-content/route.ts を変更**

変更前:
```typescript
  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist);
```

変更後:
```typescript
  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";
  const excludedIds = new Set((app.interviewExcludedFields ?? []) as string[]);

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist, excludedIds)
    .filter((q) => !q.isExcluded);
```

- [ ] **Step 2: print/[id]/questionnaire/page.tsx を変更**

変更前:
```typescript
  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist);
```

変更後:
```typescript
  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";
  const excludedIds = new Set((app.interviewExcludedFields ?? []) as string[]);

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist, excludedIds)
    .filter((q) => !q.isExcluded);
```

- [ ] **Step 3: questionnaire-gdoc/route.ts を変更**

変更前:
```typescript
  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist);
  const sections = emptyQuestions.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
```

変更後:
```typescript
  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";
  const excludedIds = new Set((app.interviewExcludedFields ?? []) as string[]);

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist, excludedIds)
    .filter((q) => !q.isExcluded);
  const sections = emptyQuestions.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
```

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add src/app/api/applications/[id]/questionnaire-content/route.ts \
        "src/app/print/[id]/questionnaire/page.tsx" \
        src/app/api/applications/[id]/questionnaire-gdoc/route.ts
git commit -m "feat: 印刷・DOCX出力3ルートで除外済み質問を完全フィルタ

復元UIを持たない出力先のため、isExcludedの質問は配列から取り除く。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: questionnaire-panel.tsxに削除・復元UIを実装

**Files:**
- Modify: `src/components/applications/questionnaire-panel.tsx`（全体書き換え）

- [ ] **Step 1: ファイル全体を書き換え**

```typescript
"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveInterviewAnswer, setInterviewQuestionExcluded } from "@/actions/interview";
import { analyzeInterviewWithAI } from "@/actions/interview-ai-analysis";
import type { InterviewQuestion } from "@/lib/interview-diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, CheckCircle, Loader2, Save, Sparkles, Info, Trash2, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuestionnairePanelProps {
  questions: InterviewQuestion[]; // セクションA/B（サーバーで計算済み、isExcludedフラグ付き）
  applicationId: string;
  userRole?: string;
}

const BUCKET_LABELS: Record<"A" | "B" | "C", string> = {
  A: "共通必須確認事項",
  B: "資格別・書類確認事項",
  C: "AI検出事項（論理矛盾・参考）",
};

// ── 削除トースト通知 ─────────────────────────────────────────────────────────
function UndoToast({
  onUndo,
  onDismiss,
}: {
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white rounded-lg px-4 py-3 shadow-lg text-sm">
      <span>質問を削除しました</span>
      <button
        onClick={onUndo}
        className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 font-medium"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        元に戻す
      </button>
    </div>
  );
}

// ── 1問分のカード（回答入力＋削除ボタン） ─────────────────────────────────────
function QuestionCard({
  question,
  applicationId,
  isExpert,
  onSaved,
  onExcluded,
}: {
  question: InterviewQuestion;
  applicationId: string;
  isExpert: boolean;
  onSaved: (questionId: string) => void;
  onExcluded: (question: InterviewQuestion) => void;
}) {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isExcludePending, setIsExcludePending] = useState(false);

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

  async function handleDelete() {
    if (question.bucket === "A") {
      const confirmed = window.confirm(
        "この質問は入管申請に強く推奨される項目です。本当に削除しますか？"
      );
      if (!confirmed) return;
    }

    setIsFadingOut(true);
    setIsExcludePending(true);
    const result = await setInterviewQuestionExcluded(applicationId, question.id, true);
    setIsExcludePending(false);

    if (result.success) {
      onExcluded(question);
    } else {
      setIsFadingOut(false);
      setError(result.error ?? "削除に失敗しました");
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all duration-300",
        isFadingOut ? "opacity-0 max-h-0 overflow-hidden p-0 border-0 mb-0" : "opacity-100",
        !isFadingOut && (saved ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-white")
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
        {isExpert && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isExcludePending}
            title="この質問を削除する"
            className="flex-shrink-0 text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
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

// ── 削除済み質問の折りたたみ一覧 ─────────────────────────────────────────────
function ExcludedAccordion({
  items,
  onRestore,
}: {
  items: InterviewQuestion[];
  onRestore: (question: InterviewQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
      >
        <span>削除済みの質問を表示（{items.length}件）</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-gray-100 p-2 space-y-1.5">
          {items.map((q) => (
            <div
              key={q.id}
              className="flex items-center justify-between gap-2 bg-gray-50 rounded px-3 py-2 text-xs text-gray-600"
            >
              <span className="flex-1">{q.label}</span>
              <button
                type="button"
                onClick={() => onRestore(q)}
                className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 flex-shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                元に戻す
              </button>
            </div>
          ))}
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
  const [locallyExcludedIds, setLocallyExcludedIds] = useState<Set<string>>(new Set());
  const [locallyRestoredIds, setLocallyRestoredIds] = useState<Set<string>>(new Set());
  const [undoTarget, setUndoTarget] = useState<InterviewQuestion | null>(null);

  function isQuestionExcluded(q: InterviewQuestion): boolean {
    if (locallyRestoredIds.has(q.id)) return false;
    return q.isExcluded === true || locallyExcludedIds.has(q.id);
  }

  const allRule = useMemo(
    () => questions.filter((q) => !resolvedIds.has(q.id)),
    [questions, resolvedIds]
  );
  const allAi = useMemo(
    () => aiQuestions.filter((q) => !resolvedIds.has(q.id)),
    [aiQuestions, resolvedIds]
  );

  const visibleRule = allRule.filter((q) => !isQuestionExcluded(q));
  const visibleAi = allAi.filter((q) => !isQuestionExcluded(q));
  const excludedRule = allRule.filter((q) => isQuestionExcluded(q));
  const excludedAi = allAi.filter((q) => isQuestionExcluded(q));

  function handleSaved(questionId: string) {
    setResolvedIds((prev) => new Set(prev).add(questionId));
    router.refresh();
  }

  function handleExcluded(question: InterviewQuestion) {
    setLocallyExcludedIds((prev) => new Set(prev).add(question.id));
    setLocallyRestoredIds((prev) => {
      const next = new Set(prev);
      next.delete(question.id);
      return next;
    });
    setUndoTarget(question);
  }

  async function restoreQuestion(question: InterviewQuestion) {
    setLocallyRestoredIds((prev) => new Set(prev).add(question.id));
    setLocallyExcludedIds((prev) => {
      const next = new Set(prev);
      next.delete(question.id);
      return next;
    });
    const result = await setInterviewQuestionExcluded(applicationId, question.id, false);
    if (!result.success) {
      // 復元に失敗した場合はロールバックし、除外状態のまま維持する
      setLocallyRestoredIds((prev) => {
        const next = new Set(prev);
        next.delete(question.id);
        return next;
      });
      setLocallyExcludedIds((prev) => new Set(prev).add(question.id));
    }
  }

  function handleUndoFromToast() {
    if (undoTarget) {
      restoreQuestion(undoTarget);
      setUndoTarget(null);
    }
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

  function renderBucket(bucket: "A" | "B" | "C", visibleItems: InterviewQuestion[], excludedItems: InterviewQuestion[]) {
    if (visibleItems.length === 0 && excludedItems.length === 0) return null;
    const bySection = visibleItems.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
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
                onExcluded={handleExcluded}
              />
            ))}
          </div>
        ))}
        {isExpert && <ExcludedAccordion items={excludedItems} onRestore={restoreQuestion} />}
      </div>
    );
  }

  const aQuestions = visibleRule.filter((q) => q.bucket === "A");
  const bQuestions = visibleRule.filter((q) => q.bucket === "B");
  const aExcluded = excludedRule.filter((q) => q.bucket === "A");
  const bExcluded = excludedRule.filter((q) => q.bucket === "B");
  const totalCount = aQuestions.length + bQuestions.length + visibleAi.length;

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

        {renderBucket("A", aQuestions, aExcluded)}
        {renderBucket("B", bQuestions, bExcluded)}

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

        {renderBucket("C", visibleAi, excludedAi)}
      </CardContent>

      {undoTarget && (
        <UndoToast onUndo={handleUndoFromToast} onDismiss={() => setUndoTarget(null)} />
      )}
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
git commit -m "feat: questionnaire-panel.tsxに質問の個別削除・復元UIを実装

各QuestionCardにゴミ箱ボタン（セクションAは確認ダイアログ付き）、
削除時のフェードアウト+Undoトースト、バケット別の削除済みアコーディオンを追加。
削除はsetInterviewQuestionExcludedで即時永続化し、楽観的UI更新+ロールバック対応。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: 最終ビルド確認・手動機能テスト・デプロイ

**Files:** なし（検証のみ）

- [ ] **Step 1: クリーンビルド**

```bash
rm -rf .next
npm run build
```

Expected: エラーなく成功

- [ ] **Step 2: 削除・復元の基本動作確認**

`npm run dev` を起動し、`questionnaire_sent`以降のステータスの既存案件で「質問書・顧客聴取」を開く。セクションA・Bそれぞれ1件ずつ削除ボタンを押し、フェードアウトしてリストから消えること、トーストに「元に戻す」が表示されることを確認する。

- [ ] **Step 3: 確認ダイアログの動作確認**

セクションAの質問を削除しようとした際に `window.confirm` ダイアログが表示されること、セクションBでは表示されないことを確認する。

- [ ] **Step 4: トーストUndoの動作確認**

トーストの「元に戻す」をクリックし、質問がリストへ復元されることを確認する。

- [ ] **Step 5: アコーディオン復元の動作確認**

別の質問を削除後、トーストが自動的に消えるまで待ち、「削除済みの質問を表示（1件）」を展開し、そこから「元に戻す」で復元できることを確認する。

- [ ] **Step 6: 永続化の確認（リロード）**

質問を1件削除した状態でページをリロードし、削除した質問が表示されないこと、対応するバケットのアコーディオンに正しく表示されることを確認する（DBの`interview_excluded_fields`に保存されている証拠）。

- [ ] **Step 7: AI再分析での復活防止確認**

「AIで分析」を押してセクションCに質問を表示させ、1件削除する。ページをリロードし、再度「AIで分析」を押した際に、削除した項目が一覧に再表示されないことを確認する。

- [ ] **Step 8: 印刷・DOCX出力での除外確認**

削除済みの質問が印刷ページ（`/print/[id]/questionnaire`）およびDOCX/Googleドキュメント出力に含まれないことを確認する。

- [ ] **Step 9: コミット・プッシュ・デプロイ**

```bash
git status
git push origin <現在のブランチ名>
npx vercel --prod
```

デプロイ完了後、本番URLで同様の確認を行う。

---

## スコープ外（将来拡張、本計画では実装しない）

- 複数質問の一括削除（チェックボックス選択）
- 削除理由のメモ入力
- セクションCの除外状態のDB永続化（リロード直後に一覧表示する方式）
