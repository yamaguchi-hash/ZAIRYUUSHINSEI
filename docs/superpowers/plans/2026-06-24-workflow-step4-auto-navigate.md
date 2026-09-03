# 「申請書作成」ステップ自動遷移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ワークフローが④「申請書作成」ステップ（`ocr_processing`）に前進したとき、申請案件詳細ページのリロードではなく申請書作成画面（`/applications/[id]/shinsei-form`）へ自動的に遷移させる。

**Architecture:** `src/components/applications/workflow-stepper.tsx`に`next/navigation`の`useRouter`を導入し、ステータス更新後に`window.location.reload()`を呼んでいる箇所のうち、前進方向で遷移先が`ocr_processing`の場合のみ`router.push`に置き換える。後退方向（「前のステップへ戻る」、ステップドットの後退クリック）は対象外とし、従来通りリロードする。

**Tech Stack:** Next.js 16 App Router、TypeScript、React Client Component。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

参考設計書: [docs/superpowers/specs/2026-06-24-workflow-step4-auto-navigate-design.md](../specs/2026-06-24-workflow-step4-auto-navigate-design.md)

---

### Task 1: ステップ④到達時の自動遷移を実装する

**Files:**
- Modify: `src/components/applications/workflow-stepper.tsx`

- [ ] **Step 1: `useRouter`をimportし、コンポーネント内で初期化する**

変更前:
```tsx
"use client";

import { useState } from "react";
import { updateApplicationStatus } from "@/actions/applications";
import { CheckCircle, ArrowRight, ArrowLeft, Loader2, Info, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
```

変更後:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateApplicationStatus } from "@/actions/applications";
import { CheckCircle, ArrowRight, ArrowLeft, Loader2, Info, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
```

`WorkflowStepper`関数の先頭（`useState`群の前）に`const router = useRouter();`を追加する。

変更前:
```tsx
export function WorkflowStepper({
  steps,
  currentStep,
  applicationId,
  userRole,
}: WorkflowStepperProps) {
  const [optimisticStep, setOptimisticStep] = useState(currentStep);
```

変更後:
```tsx
export function WorkflowStepper({
  steps,
  currentStep,
  applicationId,
  userRole,
}: WorkflowStepperProps) {
  const router = useRouter();
  const [optimisticStep, setOptimisticStep] = useState(currentStep);
```

- [ ] **Step 2: `handleStepClick`を変更する（前進方向かつ`ocr_processing`の場合のみ自動遷移）**

変更前:
```tsx
  // ステップドットを直接クリックして移動
  async function handleStepClick(targetKey: string) {
    if (isLoading) return;
    const targetIndex = STEP_ORDER.indexOf(targetKey);
    if (targetIndex < 0 || targetIndex === currentIndex) return;

    // 次ステップへの自動処理は「進む」方向のみ
    setIsLoading(true);
    setErrorMessage("");

    try {
      if (targetIndex > currentIndex) {
        // 前進: ステップ間の自動処理
        await runAutoProcess(targetKey);
      }

      setProcessingMessage("ステータスを更新中...");
      const result = await updateApplicationStatus(applicationId, targetKey);
      if (!result.success) {
        setErrorMessage(result.error ?? "ステータス更新に失敗しました");
        setIsLoading(false);
        setProcessingMessage("");
        return;
      }
      setOptimisticStep(targetKey);
      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err?.message ?? "ステップの移動に失敗しました");
      setIsLoading(false);
      setProcessingMessage("");
    }
  }
```

変更後:
```tsx
  // ステップドットを直接クリックして移動
  async function handleStepClick(targetKey: string) {
    if (isLoading) return;
    const targetIndex = STEP_ORDER.indexOf(targetKey);
    if (targetIndex < 0 || targetIndex === currentIndex) return;

    // 次ステップへの自動処理は「進む」方向のみ
    const isForward = targetIndex > currentIndex;
    setIsLoading(true);
    setErrorMessage("");

    try {
      if (isForward) {
        // 前進: ステップ間の自動処理
        await runAutoProcess(targetKey);
      }

      setProcessingMessage("ステータスを更新中...");
      const result = await updateApplicationStatus(applicationId, targetKey);
      if (!result.success) {
        setErrorMessage(result.error ?? "ステータス更新に失敗しました");
        setIsLoading(false);
        setProcessingMessage("");
        return;
      }
      setOptimisticStep(targetKey);
      if (isForward && targetKey === "ocr_processing") {
        router.push(`/applications/${applicationId}/shinsei-form`);
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMessage(err?.message ?? "ステップの移動に失敗しました");
      setIsLoading(false);
      setProcessingMessage("");
    }
  }
```

- [ ] **Step 3: `handleAdvance`を変更する（遷移先が`ocr_processing`の場合のみ自動遷移）**

変更前:
```tsx
  async function handleAdvance() {
    if (!canAdvance) return;
    const nextStep = STEP_ORDER[currentIndex + 1];
    setIsLoading(true);
    setErrorMessage("");

    try {
      await runAutoProcess(nextStep);
      setProcessingMessage("ステータスを更新中...");
      const result = await updateApplicationStatus(applicationId, nextStep);
      if (!result.success) {
        setErrorMessage(result.error ?? "ステータス更新に失敗しました");
        setIsLoading(false);
        setProcessingMessage("");
        return;
      }
      setOptimisticStep(nextStep);
      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err?.message ?? "ステップ移行に失敗しました");
      setIsLoading(false);
      setProcessingMessage("");
    }
  }
```

変更後:
```tsx
  async function handleAdvance() {
    if (!canAdvance) return;
    const nextStep = STEP_ORDER[currentIndex + 1];
    setIsLoading(true);
    setErrorMessage("");

    try {
      await runAutoProcess(nextStep);
      setProcessingMessage("ステータスを更新中...");
      const result = await updateApplicationStatus(applicationId, nextStep);
      if (!result.success) {
        setErrorMessage(result.error ?? "ステータス更新に失敗しました");
        setIsLoading(false);
        setProcessingMessage("");
        return;
      }
      setOptimisticStep(nextStep);
      if (nextStep === "ocr_processing") {
        router.push(`/applications/${applicationId}/shinsei-form`);
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMessage(err?.message ?? "ステップ移行に失敗しました");
      setIsLoading(false);
      setProcessingMessage("");
    }
  }
```

`handleGoBack`は変更しない（設計書の通り、後退方向は常に従来のリロード動作を維持する）。

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: コミットする**

```bash
git add "src/components/applications/workflow-stepper.tsx"
git commit -m "feat: 申請書作成ステップへ前進時に申請書作成画面へ自動遷移

ワークフローが④申請書作成ステップ（ocr_processing）に前進した場合
（次へボタン、またはステップドットの前進クリック）、申請案件詳細
ページのリロードではなく申請書作成画面（/applications/[id]/shinsei-form）
へ自動的に遷移する。前のステップへ戻るボタン・ステップドットの後退
クリックでocr_processingに戻ってきた場合は対象外とし、従来通り
申請案件詳細ページをリロードする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: ビルド確認・手動テスト・デプロイ・報告

**Files:** なし（検証のみ）

- [ ] **Step 1: フルビルドを実行する**

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: 全ルートがエラーなくビルドされる。

- [ ] **Step 2: 手動機能テストの確認項目を整理する（実際の確認はユーザーに依頼）**

1. ステータスが`documents_collecting`（③）の申請案件を開き、「次のステップへ進む」をクリックして、申請書作成画面（`/applications/[id]/shinsei-form`）へ自動的に遷移することを確認する。
2. ステータスが`draft`（①）の申請案件を開き、ステップドット④を直接クリックして、同様に申請書作成画面へ自動遷移することを確認する。
3. ステータスが`questionnaire_sent`（⑤）以降の申請案件を開き、「前のステップへ戻る」を④まで複数回クリックして、申請案件詳細ページがリロードされる（自動遷移しない）ことを確認する。
4. ステータスが`questionnaire_sent`（⑤）の申請案件を開き、ステップドット④（後退方向）を直接クリックして、同様に申請案件詳細ページがリロードされる（自動遷移しない）ことを確認する。
5. `ocr_processing`以外のステップへの前進・後退（例: ①→②、③→④以外の遷移）で、従来通りページがリロードされることを確認する。

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
