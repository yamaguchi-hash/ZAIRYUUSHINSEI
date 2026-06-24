# 余白ドラッグ調整機能の多ページ対応・移植（Phase 3） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ShinseiMarginControls`（現在`shinsei.tsx`専用、単一の`.page`要素を前提）を、`shinsei-applicant.tsx`（最大3ページ）・`shinsei-org.tsx`（最大7ページ程度）の複数`.page`要素構成に対応させ、両ファイルに配線する。

**Architecture:** `ShinseiMarginControls`の位置計算ロジックを`document.querySelector(".page")`（単数）から`document.querySelectorAll(".page")`（複数）に変更し、「最初の要素の上端」「最後の要素の下端」にそれぞれ上下マージン調整ハンドルを配置する。また、初期余白値（現状ハードコードされた6mm/6mm/8mm固定）を任意のpropsとして受け取れるようにし、`shinsei.tsx`は現状値（6/6/8）をそのまま使い続け、`shinsei-applicant.tsx`・`shinsei-org.tsx`は両ファイルが実際に使っている共通スタイル`PRINT_STYLES`の`@page{margin:7mm 9mm}`と一致する値（7/7/9）を渡す（既存の見た目を変えないため）。

**Tech Stack:** Next.js 16 App Router、TypeScript、React。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

参考設計書: [docs/superpowers/specs/2026-06-24-shinsei-pdf-consolidation-and-margin-fix-design.md](../specs/2026-06-24-shinsei-pdf-consolidation-and-margin-fix-design.md)（Phase 3部分）

---

### Task 1: ShinseiPrintToolbarにdisableAutoPrintを追加

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-print-toolbar.tsx`

- [ ] **Step 1: propを追加し、自動印刷を条件分岐させる**

変更前:
```tsx
export function ShinseiPrintToolbar({ applicationId, label }: { applicationId: string; label: string }) {
  const [printSignDate, setPrintSignDate] = useState(true);

  // 自動印刷（800ms後）
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);
```

変更後:
```tsx
export function ShinseiPrintToolbar({
  applicationId, label, disableAutoPrint,
}: { applicationId: string; label: string; disableAutoPrint?: boolean }) {
  const [printSignDate, setPrintSignDate] = useState(true);

  // 自動印刷（800ms後）。余白ドラッグ調整UIがある画面では、調整前に
  // 印刷ダイアログが開いてしまうため disableAutoPrint で無効化できる。
  useEffect(() => {
    if (disableAutoPrint) return;
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, [disableAutoPrint]);
```

- [ ] **Step 2: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし（既存の2箇所の`<ShinseiPrintToolbar applicationId={id} label="..." />`呼び出しは`disableAutoPrint`が任意propのため、そのまま動作する）

- [ ] **Step 3: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-print-toolbar.tsx"
git commit -m "feat: ShinseiPrintToolbarにdisableAutoPrintを追加

余白ドラッグ調整UIを持つ画面では、調整前に印刷ダイアログが
自動で開いてしまうため、画面ごとに自動印刷を無効化できるようにする。
PrintTrigger（チェックリスト等で使用）には既に同種のpropが
あるが、ShinseiPrintToolbar（申請人用・所属機関用PDFで使用）は
別コンポーネントのため、こちらにも同じ仕組みを追加する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: ShinseiMarginControlsを複数ページ・可変初期値に対応させる

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-margin-controls.tsx`

- [ ] **Step 1: Propsを追加し、初期余白値を可変にする**

変更前:
```tsx
"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_MARGIN_MM = 2;
const MAX_MARGIN_MM = 25;
/** @page の左右マージン（固定・調整対象外）。shinsei/page.tsx の @page{margin:6mm 8mm} と合わせること */
const PAGE_SIDE_MARGIN_MM = 8;
/** 96dpi基準でのCSS上の mm→px 換算（1mm = 96/25.4 px） */
const PX_PER_MM = 96 / 25.4;

function clampMm(mm: number): number {
  return Math.max(MIN_MARGIN_MM, Math.min(MAX_MARGIN_MM, mm));
}

type HandleKind = "top" | "bottom" | "roleGap";

type DragState = { kind: HandleKind; startY: number; startMm: number };

export function ShinseiMarginControls() {
  const [topMargin, setTopMargin] = useState(6);
  const [bottomMargin, setBottomMargin] = useState(6);
  const [roleGapMargin, setRoleGapMargin] = useState(0);
```

変更後:
```tsx
"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const MIN_MARGIN_MM = 2;
const MAX_MARGIN_MM = 25;
/** 96dpi基準でのCSS上の mm→px 換算（1mm = 96/25.4 px） */
const PX_PER_MM = 96 / 25.4;

function clampMm(mm: number): number {
  return Math.max(MIN_MARGIN_MM, Math.min(MAX_MARGIN_MM, mm));
}

type HandleKind = "top" | "bottom" | "roleGap";

type DragState = { kind: HandleKind; startY: number; startMm: number };

interface ShinseiMarginControlsProps {
  /** 初期上余白（mm）。呼び出し元の @page margin-top の現状値と合わせること */
  initialTopMm?: number;
  /** 初期下余白（mm）。呼び出し元の @page margin-bottom の現状値と合わせること */
  initialBottomMm?: number;
  /** @page の左右マージン（固定・調整対象外）。呼び出し元の @page margin-left/right の現状値と合わせること */
  sideMm?: number;
}

export function ShinseiMarginControls({
  initialTopMm = 6,
  initialBottomMm = 6,
  sideMm = 8,
}: ShinseiMarginControlsProps = {}) {
  const [topMargin, setTopMargin] = useState(initialTopMm);
  const [bottomMargin, setBottomMargin] = useState(initialBottomMm);
  const [roleGapMargin, setRoleGapMargin] = useState(0);
```

（`PAGE_SIDE_MARGIN_MM`定数を削除し、`sideMm`propに置き換える。デフォルト値`6`/`6`/`8`は`shinsei.tsx`の既存の`@page{margin:6mm 8mm}`と完全に一致させているため、`shinsei.tsx`側の呼び出し`<ShinseiMarginControls />`は無変更で動作し続ける。）

- [ ] **Step 2: `recomputePositions`を複数`.page`要素対応にする**

変更前:
```tsx
  const recomputePositions = useCallback(() => {
    const pageEl = document.querySelector(".page");
    if (!pageEl) return;
    const pageRect = pageEl.getBoundingClientRect();
    const roleBannerEls = Array.from(document.querySelectorAll(".role-banner"));
    setPositions({
      top: pageRect.top,
      bottom: pageRect.bottom,
      roleGaps: roleBannerEls.map((el) => el.getBoundingClientRect().top),
    });
  }, []);

  useEffect(() => {
    recomputePositions();
    const pageEl = document.querySelector(".page");
    const ro = new ResizeObserver(() => recomputePositions());
    if (pageEl) ro.observe(pageEl);
    window.addEventListener("resize", recomputePositions);
    window.addEventListener("scroll", recomputePositions, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recomputePositions);
      window.removeEventListener("scroll", recomputePositions, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

変更後:
```tsx
  const recomputePositions = useCallback(() => {
    const pageEls = Array.from(document.querySelectorAll(".page"));
    if (pageEls.length === 0) return;
    const firstRect = pageEls[0].getBoundingClientRect();
    const lastRect = pageEls[pageEls.length - 1].getBoundingClientRect();
    const roleBannerEls = Array.from(document.querySelectorAll(".role-banner"));
    setPositions({
      top: firstRect.top,
      bottom: lastRect.bottom,
      roleGaps: roleBannerEls.map((el) => el.getBoundingClientRect().top),
    });
  }, []);

  useEffect(() => {
    recomputePositions();
    const pageEls = document.querySelectorAll(".page");
    const ro = new ResizeObserver(() => recomputePositions());
    pageEls.forEach((el) => ro.observe(el));
    window.addEventListener("resize", recomputePositions);
    window.addEventListener("scroll", recomputePositions, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recomputePositions);
      window.removeEventListener("scroll", recomputePositions, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

（1ページ構成の`shinsei.tsx`では`pageEls.length === 1`となり、`firstRect`と`lastRect`が同じ要素を指すため、挙動は完全に変わらない。複数ページ構成では、最初のページの上端・最後のページの下端にハンドルが配置される。）

- [ ] **Step 3: 動的`<style>`タグ内の`PAGE_SIDE_MARGIN_MM`参照を`sideMm`に変更する**

変更前:
```tsx
        @page{
          margin-top:${topMargin}mm;margin-bottom:${bottomMargin}mm;
          margin-left:${PAGE_SIDE_MARGIN_MM}mm;margin-right:${PAGE_SIDE_MARGIN_MM}mm;
        }
```

変更後:
```tsx
        @page{
          margin-top:${topMargin}mm;margin-bottom:${bottomMargin}mm;
          margin-left:${sideMm}mm;margin-right:${sideMm}mm;
        }
```

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-margin-controls.tsx"
git commit -m "feat: ShinseiMarginControlsを複数ページ・可変初期値に対応

document.querySelectorAll('.page')で全ページを取得し、最初の要素の
上端・最後の要素の下端にハンドルを配置するようにする（1ページ構成
では従来と同じ挙動）。初期余白値（上/下/左右）をpropsとして受け取れ
るようにし、shinsei.tsx以外のファイル（@page margin の既定値が
異なる）でも見た目を変えずに利用できるようにする。デフォルト値は
shinsei.tsxの既存値と完全に一致させているため、shinsei.tsx側の
呼び出しは無変更で動作する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: shinsei-applicant.tsx・shinsei-org.tsxに配線する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-applicant/page.tsx`
- Modify: `src/app/(print)/print/[id]/shinsei-org/page.tsx`

- [ ] **Step 1: shinsei-applicant.tsxにimportを追加する**

変更前（importの末尾付近、`ShinseiPrintToolbar`のimport行）:
```tsx
import { ShinseiPrintToolbar } from "../shinsei-print-toolbar";
```

変更後:
```tsx
import { ShinseiPrintToolbar } from "../shinsei-print-toolbar";
import { ShinseiMarginControls } from "../shinsei-margin-controls";
```

- [ ] **Step 2: shinsei-applicant.tsxのツールバー呼び出しを変更し、ShinseiMarginControlsを追加する**

変更前:
```tsx
        <ShinseiPrintToolbar applicationId={id} label="申請人等作成用（3ページ）" />
```

変更後:
```tsx
        <ShinseiPrintToolbar applicationId={id} label="申請人等作成用（3ページ）" disableAutoPrint />
        <ShinseiMarginControls initialTopMm={7} initialBottomMm={7} sideMm={9} />
```

（`7`/`7`/`9`は、このファイルが読み込む共通スタイル`PRINT_STYLES`（`shinsei-shared.tsx`）の`@page{margin:7mm 9mm}`と一致させるための値。実装時に`shinsei-shared.tsx`の`@page`の現在値を必ず確認し、ずれていればその値に合わせること。）

- [ ] **Step 3: shinsei-org.tsxにも同様の変更を加える**

変更前:
```tsx
import { ShinseiPrintToolbar } from "../shinsei-print-toolbar";
```
```tsx
        <ShinseiPrintToolbar applicationId={id} label="所属機関等作成用（5ページ）" />
```

変更後:
```tsx
import { ShinseiPrintToolbar } from "../shinsei-print-toolbar";
import { ShinseiMarginControls } from "../shinsei-margin-controls";
```
```tsx
        <ShinseiPrintToolbar applicationId={id} label="所属機関等作成用（5ページ）" disableAutoPrint />
        <ShinseiMarginControls initialTopMm={7} initialBottomMm={7} sideMm={9} />
```

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-applicant/page.tsx" "src/app/(print)/print/[id]/shinsei-org/page.tsx"
git commit -m "feat: 申請人用・所属機関用PDFに余白ドラッグ調整UIを配線

自動印刷を無効化し、ShinseiMarginControlsを配置することで、
申請人用PDF（最大3ページ）・所属機関用PDF（最大7ページ程度）の
プレビュー画面でも、上下マージン・ロール境目の隙間をマウス
ドラッグで調整できるようにする。初期値はこれらのファイルが
使用するPRINT_STYLESのデフォルト@page margin（7mm/9mm）と
一致させ、見た目を変えない。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: ビルド確認・手動テスト・デプロイ・報告

**Files:** なし（検証のみ）

- [ ] **Step 1: フルビルドを実行する**

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: 全ルートがエラーなくビルドされる。

- [ ] **Step 2: 手動機能テストの確認項目を整理する（実際の確認はユーザーに依頼）**

1. `shinsei.tsx`（一括版、まだ削除前）を開き、Phase 1〜2と同様に余白ドラッグが従来通り動作することを確認する（回帰確認、デフォルト値変更なし）。
2. `/print/[id]/shinsei-applicant`（V型・3ページ構成の案件）を開き、自動印刷ダイアログが開かないこと、1ページ目の上端と3ページ目の下端にハンドルが表示され、ドラッグで連動して全ページの余白が変化することを確認する。
3. `/print/[id]/shinsei-applicant`（N型等・1ページ構成の案件）を開き、1ページのみでもハンドルが正しく上端・下端に表示されることを確認する。
4. `/print/[id]/shinsei-org`（V型・5ページ構成、またはN型等・1〜2ページ構成）でも同様に確認する。
5. 調整後、印刷プレビュー（Ctrl+P）で調整通りの余白が全ページに反映されることを確認する。

- [ ] **Step 3: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 4: 本番環境にデプロイする**

```bash
npx vercel --prod
```

- [ ] **Step 5: ユーザーに報告する**

Step2で整理した手動テスト項目（実際の確認はユーザー自身に依頼する旨を明記）と、次のフェーズ（Phase 4：ボタン統合・一括版の削除）に進む準備ができていることを報告する。
