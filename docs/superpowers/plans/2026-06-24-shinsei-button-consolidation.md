# ボタン統合・一括版の削除（Phase 4） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 申請書作成画面のPDFダウンロードボタンを3つ（一括／申請人用／所属機関用）から2つ（申請人用／所属機関用または扶養者用に動的切替）に統合し、不要になった「一括」版（`shinsei.tsx`）を削除する。

**Architecture:** Phase 2・3で`shinsei-applicant.tsx`・`shinsei-org.tsx`が全カテゴリの内容・余白調整機能を`shinsei.tsx`と同等に備えたことを前提に、`shinsei-form/page.tsx`のボタンを書き換え、最後に`shinsei.tsx`本体を削除する。在留資格区分の判定（R型＝家族滞在か否か）は、既にこのファイルに存在する`isRtypeForm`変数をそのまま再利用する（新たな判定ロジックは追加しない）。

**Tech Stack:** Next.js 16 App Router、TypeScript。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

参考設計書: [docs/superpowers/specs/2026-06-24-shinsei-pdf-consolidation-and-margin-fix-design.md](../specs/2026-06-24-shinsei-pdf-consolidation-and-margin-fix-design.md)（Phase 4部分）

---

### Task 1: ボタンを3つから2つに統合する

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx`

- [ ] **Step 1: 2つ目のボタンの動的文言を算出する変数を追加する**

`isRtypeForm`・`isPtypeForm`の定義の直後（53〜54行目付近）に以下を追加する。

変更前:
```tsx
  const isRtypeForm = initialForm.visaFormCategory === 'R';
  const isPtypeForm = initialForm.visaFormCategory === 'P';
  const showGaikatsu =
```

変更後:
```tsx
  const isRtypeForm = initialForm.visaFormCategory === 'R';
  const isPtypeForm = initialForm.visaFormCategory === 'P';
  // 2つ目のボタンの文言: 家族滞在（R型）の場合のみ「扶養者用」、それ以外は「所属機関用」
  const secondButtonLabel = isRtypeForm ? "扶養者用PDFダウンロード" : "所属機関用PDFダウンロード";
  const showGaikatsu =
```

- [ ] **Step 2: 3つのボタンを2つに書き換える**

変更前:
```tsx
          <Link
            href={`/print/${id}/shinsei`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-300"
          >
            <FileDown className="w-4 h-4" />
            申請書PDF（一括）
          </Link>
          <Link
            href={`/print/${id}/shinsei-applicant`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" />
            申請人用PDF
          </Link>
          <Link
            href={`/print/${id}/shinsei-org`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" />
            所属機関用PDF
          </Link>
```

変更後:
```tsx
          <Link
            href={`/print/${id}/shinsei-applicant`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" />
            申請人用PDFダウンロード
          </Link>
          <Link
            href={`/print/${id}/shinsei-org`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" />
            {secondButtonLabel}
          </Link>
```

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: コミットする**

```bash
git add "src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx"
git commit -m "feat: 申請書PDFダウンロードボタンを2つに統合

「申請書PDF（一括）」ボタンを削除し、「申請人用PDF」「所属機関用PDF」
の2ボタンに統合する。2つ目のボタンは在留資格区分に応じて文言を
動的に切り替える（家族滞在＝R型の場合は「扶養者用PDFダウンロード」、
それ以外は「所属機関用PDFダウンロード」）。Phase 2・3で
shinsei-applicant.tsx・shinsei-org.tsxが全カテゴリの内容・余白調整
機能を備えたため、一括版に依存する理由がなくなったことに基づく変更。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 一括版（shinsei.tsx）を削除する

**Files:**
- Delete: `src/app/(print)/print/[id]/shinsei/page.tsx`

- [ ] **Step 1: 他に参照が無いことを確認する**

Run: `grep -rn "print/\${id}/shinsei\"" src --include="*.tsx" --include="*.ts" | grep -v "shinsei-applicant\|shinsei-org\|shinsei-form"`
Expected: 何も出力されない（Task 1で唯一の参照を削除済みのため）。

Run: `grep -rln "from \"\.\./shinsei/page\"" src`
Expected: 何も出力されない。

- [ ] **Step 2: ファイルを削除する**

```bash
git rm "src/app/(print)/print/[id]/shinsei/page.tsx"
```

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: コミットする**

```bash
git commit -m "chore: 申請書PDF（一括）版（shinsei.tsx）を削除

Phase 2・3でshinsei-applicant.tsx・shinsei-org.tsxが
shinsei.tsxと同等の内容・余白調整機能を完全に備え、Task 1で
唯一の参照（ダウンロードボタン）を削除したため、不要になった
一括版の実体ファイルを削除する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 最終ビルド確認・手動テスト・デプロイ・全体完了報告

**Files:** なし（検証のみ）

- [ ] **Step 1: フルビルドを実行する**

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: `/print/[id]/shinsei`がルート一覧から消えていること、他の全ルートがエラーなくビルドされることを確認する。

- [ ] **Step 2: 手動機能テストの確認項目を整理する（実際の確認はユーザーに依頼）**

1. N型・V型・R型それぞれの案件で`shinsei-form`画面を開き、ボタンが2つ（申請人用PDFダウンロード／所属機関用PDFダウンロードまたは扶養者用PDFダウンロード）になっていることを確認する。
2. R型（家族滞在）の案件でのみ2つ目のボタンが「扶養者用PDFダウンロード」と表示され、それ以外のカテゴリでは「所属機関用PDFダウンロード」と表示されることを確認する。
3. `/print/${id}/shinsei`へ直接アクセスすると404になることを確認する。
4. 各カテゴリで「申請人用PDFダウンロード」「所属機関用PDFダウンロード」を実際に開き、Phase 2で移植した内容が正しく表示され、Phase 3の余白ドラッグ調整が機能することを最終確認する。

- [ ] **Step 3: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 4: 本番環境にデプロイする**

```bash
npx vercel --prod
```

- [ ] **Step 5: ユーザーに全4フェーズの完了を報告する**

以下を含めて報告する：
- Phase 1〜4で実施した内容の要約（html/body構造修正、コンテンツ完全化、余白ドラッグ機能移植、ボタン統合・一括版削除）
- Step2で整理した最終手動テスト項目（実際の確認はユーザー自身に依頼する旨を明記）
- 元の依頼（在留資格に応じた2つ目のボタン文言・PDFヘッダーの動的切替ロジックの箇所、余白ドラッグが動かなかった原因と修正箇所、テスト手順）に対する直接的な回答
