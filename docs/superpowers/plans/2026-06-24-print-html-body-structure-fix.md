# 印刷ページのhtml/body構造修正（Phase 1） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/print`配下の全8ページが自分自身で`<html>/<head>/<body>`を出力し、Next.jsのルートレイアウト（既に`<html>/<body>`を出力済み）の子として入れ子になっている無効なHTML構造を解消する。

**Architecture:** Next.jsの「複数ルートレイアウト」パターンを採用する。`app/print`を新規ルートグループ`app/(print)/print`へ移動し、専用の最小限ルートレイアウト（`(print)/layout.tsx`、ダッシュボードのTailwindクラス・フォントを継承しない）を新設する。既存の共通ルートレイアウト（`app/layout.tsx`）の内容は`(dashboard)/layout.tsx`へ統合し、`app/layout.tsx`自体は削除する（Next.jsの複数ルートレイアウト機能は、`app/`直下にlayout.tsxが存在しないことを要求するため）。各印刷ページからは`<html>/<head>/<body>`のラップタグのみを削除し、内部の`<meta>`/`<title>`/`<style>`タグとコンテンツは一切変更しない。

**Tech Stack:** Next.js 16 App Router（Route Groups・複数ルートレイアウト機能）、TypeScript。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

**重要な注意:** このPhaseの変更（ルートグループの新設・ファイル移動・レイアウト統合・8ページのタグ除去）は、互いに強く依存しており、途中の状態でビルドが通らない区間が発生する（例えば`app/layout.tsx`を削除した直後、印刷ページ用の新ルートレイアウトがまだ存在しないとNext.jsがビルドエラーになる）。そのため、Task1は**全ステップを完了してから一度だけビルド確認・コミットする**（途中でのコミットは行わない）。

参考設計書: [docs/superpowers/specs/2026-06-24-shinsei-pdf-consolidation-and-margin-fix-design.md](../specs/2026-06-24-shinsei-pdf-consolidation-and-margin-fix-design.md)（Phase 1部分）

---

### Task 1: ルートグループの新設・ファイル移動・8ページのタグ除去

**Files:**
- Delete: `src/app/layout.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(print)/layout.tsx`
- Move: `src/app/print/` 配下全体 → `src/app/(print)/print/`（URLは`/print/...`のまま変わらない）
- Modify（移動後のパス）:
  - `src/app/(print)/print/[id]/page.tsx`
  - `src/app/(print)/print/[id]/shinsei/page.tsx`
  - `src/app/(print)/print/[id]/shinsei-applicant/page.tsx`
  - `src/app/(print)/print/[id]/shinsei-org/page.tsx`
  - `src/app/(print)/print/[id]/riyusho/page.tsx`
  - `src/app/(print)/print/[id]/noufusho/page.tsx`
  - `src/app/(print)/print/[id]/azukari/page.tsx`
  - `src/app/(print)/print/[id]/questionnaire/page.tsx`

- [ ] **Step 1: `src/app/print`を`src/app/(print)/print`へ移動する**

```bash
mkdir -p "src/app/(print)"
git mv src/app/print "src/app/(print)/print"
```

Run: `ls "src/app/(print)/print"`
Expected: `[id]`ディレクトリが存在する（中身は元の`print/[id]/`と同一）。

- [ ] **Step 2: `(print)/layout.tsx`を新規作成する**

`src/app/(print)/layout.tsx`を以下の内容で新規作成する。

```tsx
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
```

（印刷ページはTailwindクラスを一切使用せず、各ページ自身の`<style>`タグで完全にスタイルを制御しているため、`globals.css`のimportやフォント設定は不要。）

- [ ] **Step 3: `app/layout.tsx`の内容を`(dashboard)/layout.tsx`へ統合する**

`src/app/(dashboard)/layout.tsx`の現在の内容:
```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BackButton } from "@/components/layout/back-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // auth() は JWT 検証失敗等で throw することがあるため try-catch でラップ
  let session;
  try {
    session = await auth();
  } catch {
    redirect("/login");
  }

  if (!session?.user) {
    redirect("/login");
  }

  const userName = session.user.name ?? session.user.email ?? undefined;
  const userRole = (session.user as any).role;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userRole={userRole}
        userName={userName ?? undefined}
      />
      <main className="flex-1 overflow-auto">
        <BackButton />
        {children}
      </main>
    </div>
  );
}
```

これを以下に書き換える（`app/layout.tsx`が持っていた`<html>/<body>`・フォント・`SessionProvider`・`metadata`を統合する）。

```tsx
import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "../globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BackButton } from "@/components/layout/back-button";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "在留資格申請書類作成システム",
  description: "在留資格申請書類を効率的・正確・セキュアに一元管理・作成・出力するシステム",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // auth() は JWT 検証失敗等で throw することがあるため try-catch でラップ
  let session;
  try {
    session = await auth();
  } catch {
    redirect("/login");
  }

  if (!session?.user) {
    redirect("/login");
  }

  const userName = session.user.name ?? session.user.email ?? undefined;
  const userRole = (session.user as any).role;

  return (
    <html lang="ja">
      <body className={`${notoSansJP.className} bg-gray-50 text-gray-900 antialiased`}>
        <SessionProvider>
          <div className="flex min-h-screen">
            <Sidebar
              userRole={userRole}
              userName={userName ?? undefined}
            />
            <main className="flex-1 overflow-auto">
              <BackButton />
              {children}
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: `app/layout.tsx`を削除する**

```bash
git rm src/app/layout.tsx
```

- [ ] **Step 5: 8つの印刷ページから`<html>/<head>/<body>`ラップタグを除去する**

以下の8ファイルそれぞれに、同じパターンの修正を適用する。**`<meta>`・`<title>`・`<style>`タグとその内容、それ以降のコンテンツは一切変更しない**（ラップタグの除去のみ）。各ファイルの正確な行番号は移動前のものなので、移動後は若干前後している可能性がある——該当するタグを実際のファイル内で検索して特定すること。

**5-1. `src/app/(print)/print/[id]/page.tsx`**（移動前の行番号: html=86, head=87, head終了=152, body開始=153, body終了=270, html終了=271）

変更前（ファイル冒頭の`return (`直後）:
```tsx
    <html lang="ja">
      <head>
```
変更後:
```tsx
    <>
```

変更前（head終了からbody開始）:
```tsx
      </head>
      <body>
```
変更後: （この2行を削除し、何も挿入しない。直前の`<style>{...}</style>`の閉じタグの直後に、直後の実コンテンツが続く形になる）

変更前（ファイル末尾、body終了からhtml終了）:
```tsx
      </body>
    </html>
```
変更後:
```tsx
    </>
```

**5-2. `src/app/(print)/print/[id]/shinsei/page.tsx`**（移動前の行番号: html=126, head=127, head終了=219, body開始=220, body終了=1657, html終了=1658）

変更前（ファイル冒頭の`return (`直後）:
```tsx
    <html lang="ja">
      <head>
```
変更後:
```tsx
    <>
```
変更前（head終了からbody開始）:
```tsx
      </head>
      <body>
```
変更後: （この2行を削除する。何も挿入しない）
変更前（ファイル末尾、body終了からhtml終了）:
```tsx
      </body>
    </html>
```
変更後:
```tsx
    </>
```

**5-3. `src/app/(print)/print/[id]/shinsei-applicant/page.tsx`**（移動前の行番号: html=37, head=38, head終了=42, body開始=43, body終了=449, html終了=450）

変更前（ファイル冒頭の`return (`直後）:
```tsx
    <html lang="ja">
      <head>
```
変更後:
```tsx
    <>
```
変更前（head終了からbody開始）:
```tsx
      </head>
      <body>
```
変更後: （この2行を削除する。何も挿入しない）
変更前（ファイル末尾、body終了からhtml終了）:
```tsx
      </body>
    </html>
```
変更後:
```tsx
    </>
```

**5-4. `src/app/(print)/print/[id]/shinsei-org/page.tsx`**（移動前の行番号: html=38, head=39, head終了=43, body開始=44, body終了=718, html終了=719）

変更前（ファイル冒頭の`return (`直後）:
```tsx
    <html lang="ja">
      <head>
```
変更後:
```tsx
    <>
```
変更前（head終了からbody開始）:
```tsx
      </head>
      <body>
```
変更後: （この2行を削除する。何も挿入しない）
変更前（ファイル末尾、body終了からhtml終了）:
```tsx
      </body>
    </html>
```
変更後:
```tsx
    </>
```

**5-5. `src/app/(print)/print/[id]/riyusho/page.tsx`**（移動前の行番号: html=92, head=93, head終了=239, body開始=240, body終了=297, html終了=298）

変更前（ファイル冒頭の`return (`直後）:
```tsx
    <html lang="ja">
      <head>
```
変更後:
```tsx
    <>
```
変更前（head終了からbody開始）:
```tsx
      </head>
      <body>
```
変更後: （この2行を削除する。何も挿入しない）
変更前（ファイル末尾、body終了からhtml終了）:
```tsx
      </body>
    </html>
```
変更後:
```tsx
    </>
```

**5-6. `src/app/(print)/print/[id]/noufusho/page.tsx`**（移動前の行番号: html=45, head=46, head終了=160, body開始=161, body終了=286, html終了=287）

変更前（ファイル冒頭の`return (`直後）:
```tsx
    <html lang="ja">
      <head>
```
変更後:
```tsx
    <>
```
変更前（head終了からbody開始）:
```tsx
      </head>
      <body>
```
変更後: （この2行を削除する。何も挿入しない）
変更前（ファイル末尾、body終了からhtml終了）:
```tsx
      </body>
    </html>
```
変更後:
```tsx
    </>
```

**5-7. `src/app/(print)/print/[id]/azukari/page.tsx`**（移動前の行番号: html=94, head=95, head終了=270, body開始=271, body終了=352, html終了=353）

変更前（ファイル冒頭の`return (`直後）:
```tsx
    <html lang="ja">
      <head>
```
変更後:
```tsx
    <>
```
変更前（head終了からbody開始）:
```tsx
      </head>
      <body>
```
変更後: （この2行を削除する。何も挿入しない）
変更前（ファイル末尾、body終了からhtml終了）:
```tsx
      </body>
    </html>
```
変更後:
```tsx
    </>
```

**5-8. `src/app/(print)/print/[id]/questionnaire/page.tsx`**（移動前の行番号: html=67, head=68, head終了=97, body開始=98, body終了=164, html終了=165）

変更前（ファイル冒頭の`return (`直後）:
```tsx
    <html lang="ja">
      <head>
```
変更後:
```tsx
    <>
```
変更前（head終了からbody開始）:
```tsx
      </head>
      <body>
```
変更後: （この2行を削除する。何も挿入しない）
変更前（ファイル末尾、body終了からhtml終了）:
```tsx
      </body>
    </html>
```
変更後:
```tsx
    </>
```

各ファイルとも、修正後の構造は以下の形になる（中身は各ファイル固有のため省略）：
```tsx
  return (
    <>
      <meta charSet="utf-8" />
      {/* viewportのmetaがある場合はそのまま残す */}
      <title>...</title>
      <style>{`...`}</style>
      {/* または <style>{PRINT_STYLES}</style> */}

      ...既存のコンテンツ（変更しない）...

    </>
  );
}
```

- [ ] **Step 6: import文中の相対パスを確認する**

`print/`ディレクトリが`(print)/print/`へ移動しても、ディレクトリの**深さ**（`[id]/`からの相対位置）は変わらないため、`shinsei-applicant/page.tsx`の`import { PrintTrigger } from "../print-trigger";`のような相対importは変更不要である。ただし、`src/components/`・`src/lib/`・`src/actions/`への`@/`始まりの絶対importは元々パスエイリアスのため、ファイル移動の影響を受けない。実際に移動が完了した後、次のステップでTypeScriptの型チェックを行うことで、解決できないimportがないか確認する。

- [ ] **Step 7: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。エラーが出た場合は、importパスの解決失敗である可能性が高いため、該当ファイルの相対importを確認して修正する。

- [ ] **Step 8: フルビルドを実行して確認する**

Run: `npm run build`

OneDriveの同期ロックにより`EPERM`エラーが出る場合は`.next`を削除して再実行する（既知の問題）。

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: 全ルート（`/print/[id]`・`/print/[id]/shinsei`・`/print/[id]/shinsei-applicant`・`/print/[id]/shinsei-org`・`/print/[id]/riyusho`・`/print/[id]/noufusho`・`/print/[id]/azukari`・`/print/[id]/questionnaire`を含む）がエラーなくビルドされる。`(print)`や`(dashboard)`はルートグループ名のためURLパスには出現しないことを確認する。

- [ ] **Step 9: コミットする**

```bash
git add -A
git commit -m "fix: 印刷ページの無効なhtml/body入れ子構造を解消

/print配下の全8ページが、Next.jsのルートレイアウト（既にhtml/bodyを
出力済み）の子として自分自身でもhtml/head/bodyを出力しており、
無効な入れ子構造になっていた。これがマウスドラッグ等の継続的な
クライアントサイドイベント処理がページによって不安定になる原因と
なっていた。

Next.jsの複数ルートレイアウト機能を使い、print配下を専用の
ルートグループ(print)に移動し、最小限の専用ルートレイアウトを
新設。app/layout.tsxの内容は(dashboard)/layout.tsxへ統合し、
app/layout.tsx自体は削除した。各印刷ページからはhtml/head/bodyの
ラップタグのみを除去し、内部のmeta/title/styleタグとコンテンツ
（テーブルフォーマット・フォント・データバインドロジック）は
一切変更していない。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: 手動機能テスト・デプロイ・報告

**Files:** なし（検証のみ）

- [ ] **Step 1: 開発サーバーでの手動確認項目を整理する（実際のクリック操作はユーザー確認を依頼）**

以下を確認用チェックリストとして整理し、報告時にユーザーへ依頼する：

1. `/print/[id]/shinsei`・`/print/[id]/shinsei-applicant`・`/print/[id]/shinsei-org`・`/print/[id]/riyusho`・`/print/[id]/noufusho`・`/print/[id]/azukari`・`/print/[id]/questionnaire`・`/print/[id]`（チェックリスト）のそれぞれを開き、ブラウザの開発者ツールのElementsパネルで、入れ子の`<html>`/`<body>`が存在しないこと（`<html>`が1つだけであること）を確認する。
2. 各ページの見た目（テーブル枠線・フォント・配色・余白）が修正前と変わっていないことを確認する。
3. `/print/[id]/shinsei`で、`ShinseiMarginControls`の上端・下端のドラッグハンドルにマウスを乗せ、カーソルが`ns-resize`に変わり、実際にドラッグして余白が連動して変化することを確認する（Phase 1の本来の目的）。

- [ ] **Step 2: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 3: 本番環境にデプロイする**

```bash
npx vercel --prod
```

Expected: `https://zairyu-shinsei-system.vercel.app` に正常デプロイされる。

- [ ] **Step 4: ユーザーに報告する**

以下を含めて報告する：
- 根本原因（全印刷ページの入れ子html/body構造）と修正内容（複数ルートレイアウト化）
- Step1で整理した手動確認項目（実際の操作はユーザー自身による確認を依頼する旨を明記）
- 次のフェーズ（Phase 2：所属機関用・申請人用PDFのコンテンツ完全化）に進む準備ができていること
