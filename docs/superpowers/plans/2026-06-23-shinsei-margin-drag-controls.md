# 申請書PDF（一括）余白ドラッグ調整機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/print/[id]/shinsei`（申請書PDF・一括版）の印刷プレビューで、上下マージン・ロール境目（申請人用→所属機関用／扶養者用）の隙間をマウスドラッグでリアルタイム調整でき、その値が実際の印刷・PDF出力にも反映される機能を追加する。

**Architecture:** `shinsei.tsx`はサーバーコンポーネントのため変更しない。新規クライアントコンポーネント`ShinseiMarginControls`を`<body>`内に追加し、State（mm単位、2〜25でクランプ）を動的な`<style>`タグとして注入することで、`@page`（印刷時の実余白）と`.page`の画面表示用マージン・`.role-banner`の隙間を同時に書き換える。ドラッグハンドルは`getBoundingClientRect()`で実際のDOM位置を追跡し、`position:fixed`で重ねて表示する。既存の`PrintTrigger`の自動印刷（800ms後`window.print()`）は、ユーザーが調整する前に印刷ダイアログが開いてしまうため、新規の`disableAutoPrint`propで`shinsei.tsx`のみ無効化する。

**Tech Stack:** Next.js 16 App Router（Server/Client Components）、TypeScript、React useState/useEffect/useRef。このプロジェクトには自動テストフレームワーク（Jest/Vitest等）が導入されていないため、検証は`npm run build`（型チェック）＋ブラウザでの手動機能確認で行う（既存タスクと同じ方式）。

参考設計書: [docs/superpowers/specs/2026-06-23-shinsei-margin-drag-controls-design.md](../specs/2026-06-23-shinsei-margin-drag-controls-design.md)

---

### Task 1: PrintTriggerにdisableAutoPrintプロパティを追加

**Files:**
- Modify: `src/app/print/[id]/print-trigger.tsx:18-27`

- [ ] **Step 1: propを追加し、自動印刷を条件分岐させる**

`src/app/print/[id]/print-trigger.tsx`の18行目〜27行目を以下のように変更する。

変更前:
```tsx
export function PrintTrigger({ applicationId }: { applicationId: string }) {
  const [showDate, setShowDate] = useState(true);
  const [omitSections, setOmitSections] = useState<Record<string, boolean>>({});
  const [showOmitPanel, setShowOmitPanel] = useState(false);

  // 自動印刷（800ms後）
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);
```

変更後:
```tsx
export function PrintTrigger({
  applicationId, disableAutoPrint,
}: { applicationId: string; disableAutoPrint?: boolean }) {
  const [showDate, setShowDate] = useState(true);
  const [omitSections, setOmitSections] = useState<Record<string, boolean>>({});
  const [showOmitPanel, setShowOmitPanel] = useState(false);

  // 自動印刷（800ms後）。余白ドラッグ調整UIがある画面では、調整前に
  // 印刷ダイアログが開いてしまうため disableAutoPrint で無効化できる。
  useEffect(() => {
    if (disableAutoPrint) return;
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, [disableAutoPrint]);
```

- [ ] **Step 2: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし（既存の`<PrintTrigger applicationId={id} />`呼び出しは`disableAutoPrint`が任意propのため、そのまま動作する）

- [ ] **Step 3: コミット**

```bash
git add src/app/print/[id]/print-trigger.tsx
git commit -m "feat: PrintTriggerにdisableAutoPrintプロパティを追加

余白ドラッグ調整UIを持つ画面では、調整前に印刷ダイアログが
自動で開いてしまうため、画面ごとに自動印刷を無効化できるようにする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: ShinseiMarginControlsコンポーネントを新規作成

**Files:**
- Create: `src/app/print/[id]/shinsei-margin-controls.tsx`

- [ ] **Step 1: ファイルを新規作成する**

`src/app/print/[id]/shinsei-margin-controls.tsx`を以下の内容で新規作成する。

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
  const [positions, setPositions] = useState<{ top: number; bottom: number; roleGaps: number[] }>({
    top: 0, bottom: 0, roleGaps: [],
  });
  const draggingRef = useRef<DragState | null>(null);

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

  const handleMouseDown = useCallback((kind: HandleKind, startMm: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = { kind, startY: e.clientY, startMm };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const deltaMm = (moveEvent.clientY - d.startY) / PX_PER_MM;
      const next = clampMm(d.startMm + deltaMm);
      if (d.kind === "top") setTopMargin(next);
      else if (d.kind === "bottom") setBottomMargin(next);
      else setRoleGapMargin(next);
      requestAnimationFrame(recomputePositions);
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [recomputePositions]);

  const handleBarStyle = (topPx: number): CSSProperties => ({
    position: "fixed", left: 0, right: 0, top: `${topPx - 3}px`, height: "6px",
    cursor: "ns-resize", background: "transparent", zIndex: 60,
  });

  return (
    <>
      <style>{`
        @page{
          margin-top:${topMargin}mm;margin-bottom:${bottomMargin}mm;
          margin-left:${PAGE_SIDE_MARGIN_MM}mm;margin-right:${PAGE_SIDE_MARGIN_MM}mm;
        }
        @media screen{
          .page{margin-top:${topMargin}mm;margin-bottom:${bottomMargin}mm;}
        }
        .role-banner{margin-top:${roleGapMargin}mm;}
        .margin-drag-handle:hover{background:rgba(37,99,235,0.18)!important;}
      `}</style>

      <div
        className="no-print margin-drag-handle"
        style={handleBarStyle(positions.top)}
        onMouseDown={handleMouseDown("top", topMargin)}
        title={`上余白: ${topMargin.toFixed(1)}mm（ドラッグで調整）`}
      />
      <div
        className="no-print margin-drag-handle"
        style={handleBarStyle(positions.bottom)}
        onMouseDown={handleMouseDown("bottom", bottomMargin)}
        title={`下余白: ${bottomMargin.toFixed(1)}mm（ドラッグで調整）`}
      />
      {positions.roleGaps.map((topPx, i) => (
        <div
          key={i}
          className="no-print margin-drag-handle"
          style={handleBarStyle(topPx)}
          onMouseDown={handleMouseDown("roleGap", roleGapMargin)}
          title={`セクション境界の隙間: ${roleGapMargin.toFixed(1)}mm（ドラッグで調整）`}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 2: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/app/print/[id]/shinsei-margin-controls.tsx
git commit -m "feat: 余白ドラッグ調整用のShinseiMarginControlsを新規作成

shinsei.tsxはサーバーコンポーネントのため、ドラッグ状態を持つ
クライアントコンポーネントを別ファイルとして用意する。
@page（印刷時の実余白）と画面表示用マージン、ロール境目の隙間を
同じState値で同時に書き換えることで、画面プレビューと印刷結果を一致させる。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: shinsei.tsxへ配線

**Files:**
- Modify: `src/app/print/[id]/shinsei/page.tsx:7` (import追加)
- Modify: `src/app/print/[id]/shinsei/page.tsx:220` (PrintTrigger呼び出し・ShinseiMarginControls追加)

- [ ] **Step 1: importを追加する**

`src/app/print/[id]/shinsei/page.tsx`の7行目（`import { PrintTrigger } from "../print-trigger";`の直後）に以下を追加する。

変更前:
```tsx
import { PrintTrigger } from "../print-trigger";
import { PDF_PRINT_WIDTH } from "../shinsei-shared";
```

変更後:
```tsx
import { PrintTrigger } from "../print-trigger";
import { ShinseiMarginControls } from "../shinsei-margin-controls";
import { PDF_PRINT_WIDTH } from "../shinsei-shared";
```

- [ ] **Step 2: PrintTrigger呼び出しを変更し、ShinseiMarginControlsを追加する**

220行目を以下のように変更する。

変更前:
```tsx
        <PrintTrigger applicationId={id} />
        <div className="page" style={{ paddingTop: "56px" }}>
```

変更後:
```tsx
        <PrintTrigger applicationId={id} disableAutoPrint />
        <ShinseiMarginControls />
        <div className="page" style={{ paddingTop: "56px" }}>
```

- [ ] **Step 3: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add "src/app/print/[id]/shinsei/page.tsx"
git commit -m "feat: shinsei.tsxに余白ドラッグ調整UIを配線

自動印刷を無効化し、ShinseiMarginControlsを配置することで
申請書PDF（一括）のプレビュー画面で上下マージン・
ロール境目の隙間をマウスドラッグで調整できるようにする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: ビルド確認・手動機能テスト・デプロイ・報告

**Files:** なし（検証のみ）

- [ ] **Step 1: フルビルドを実行する**

Run: `npm run build`

OneDriveの同期ロックにより`EPERM: operation not permitted, unlink '...\.next\static\...'`で失敗する場合は、`.next`ディレクトリを削除して再実行する（このプロジェクトで既知の問題）。

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: 全ルート（`/print/[id]/shinsei`を含む）が`ƒ`（Dynamic）としてエラーなくビルドされる。

- [ ] **Step 2: 開発サーバーで手動機能テストを行う**

Run: `npm run dev`

ブラウザで以下を確認する（設計書のテスト手順1〜8と同一）：

1. N型・V型・R型それぞれの案件で`/print/[id]/shinsei`を開き、自動印刷ダイアログが**開かない**ことを確認する。
2. 上端・下端のハンドルにマウスを乗せ、カーソルが`ns-resize`に変わり、薄い青のバーが見えることを確認する。
3. 上端ハンドルをドラッグし、画面上の余白がリアルタイムに変化することを確認する。2mm未満・25mm超に動かそうとしても止まることを確認する。
4. ロール境目（所属機関用または扶養者用バナーの直前）のハンドルが正しい位置に表示され、ドラッグで隙間が変化することを確認する（V型案件で所属機関用バナーが2個ある場合、両方の位置にハンドルが表示され、どちらをドラッグしても連動することを確認する）。
5. ウィンドウサイズを変更し、ハンドルの位置が正しく再計算されることを確認する。
6. 余白を調整した状態でブラウザの印刷プレビュー（Ctrl+P）を開き、調整した余白通りに反映されていることを確認する。
7. ページをリロードし、余白が初期値（6mm/6mm/0mm）に戻ることを確認する。
8. 他の印刷画面（`/print/[id]`のチェックリスト等、`PrintTrigger`を使う既存ルート）で、自動印刷ダイアログが従来通り開くことを確認する（`disableAutoPrint`未指定時の後方互換性）。

問題が見つかった場合は、該当するTaskに戻って修正し、再度Step 1から確認する。

- [ ] **Step 3: 一時ファイルを削除する**

```bash
rm -f dev.log dev-test.log
```

（開発サーバー起動時に生成されたログファイルが残っている場合のみ）

- [ ] **Step 4: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 5: 本番環境にデプロイする**

```bash
npx vercel --prod
```

Expected: `https://zairyu-shinsei-system.vercel.app` に正常デプロイされる。

- [ ] **Step 6: ユーザーに報告する**

以下を含めて報告する：
- 実装内容（ドラッグ調整できる3つの余白：上端・下端・ロール境目の隙間、可動限界2〜25mm）
- 自動印刷を無効化したこと（他画面には影響しないこと）
- 調整値はリロードで初期値に戻ること（DB保存はしない設計であることの確認）
- V型で所属機関用バナーが2個表示されるケースがあり、両方にハンドルが付くことの説明
