# PDFヘッダーの様式名＋在留資格種類表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 申請人用PDF・所属機関用PDFの全ページヘッダーを、内部区分コード（「申請人等作成用２」「Ｖ（「特定技能（１号）」・「特定技能（２号）」）」等）の表示から、「[様式名]－[在留資格種類]」（例: 「在留資格変更許可申請書－家族滞在」）のシンプルな1行表示に統一する。

**Architecture:** `FormHeader`コンポーネントの`partLabel`/`partLabelEn`/`partLabelV`の3propsを廃止し、新しい単一prop`categoryLabel`に統合する。新しいヘルパー関数`getPdfHeaderCategoryLabel(formType, visaType)`を`shinsei-shared.tsx`に追加し、`shinsei-applicant/page.tsx`・`shinsei-org/page.tsx`の全15箇所の`<FormHeader>`呼び出しをこの新しい形式に書き換える。

**Tech Stack:** Next.js 16 App Router、TypeScript。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

参考設計書: [docs/superpowers/specs/2026-06-25-pdf-header-category-label-design.md](../specs/2026-06-25-pdf-header-category-label-design.md)

---

### Task 1: `FormHeader`を`categoryLabel`propに統合し、ヘルパー関数を追加する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-shared.tsx`

- [ ] **Step 1: `getPdfHeaderCategoryLabel`ヘルパーを追加する**

`getFormNumber`関数（177〜180行目付近）の直後に追加する。

変更前:
```ts
/** 様式番号を取得する（書類種別が主軸。在留資格カテゴリ別の例外があればここに追加） */
export function getFormNumber(formType: ApplicationFormType, cat?: string): string {
  return FORM_NUMBER_MAP[formType] ?? FORM_NUMBER_MAP.change;
}
```

変更後:
```ts
/** 様式番号を取得する（書類種別が主軸。在留資格カテゴリ別の例外があればここに追加） */
export function getFormNumber(formType: ApplicationFormType, cat?: string): string {
  return FORM_NUMBER_MAP[formType] ?? FORM_NUMBER_MAP.change;
}

/** PDFヘッダーに表示する「様式名－在留資格種類」ラベルを返す（例: 在留資格変更許可申請書－家族滞在） */
export function getPdfHeaderCategoryLabel(formType: ApplicationFormType, visaType: string): string {
  const title = FORM_TITLE_MAP[formType]?.ja ?? FORM_TITLE_MAP.change.ja;
  const visaLabel = VISA_TYPE_LABELS[visaType] ?? visaType;
  return `${title}－${visaLabel}`;
}
```

`VISA_TYPE_LABELS`は既に9行目で`@/lib/utils`からimport済みのため、新たなimportは不要。

- [ ] **Step 2: `FormHeader`コンポーネントのpropsを変更する**

変更前:
```tsx
/** 申請書ヘッダー（全様式共通） */
export function FormHeader({
  formNumber, title, titleEn, partLabel, partLabelEn, partLabelV, showGov,
}: {
  /** 様式番号（例: 別記第三十号様式（第二十条関係）） */
  formNumber?: string;
  /** 様式タイトル（例: 在留資格変更許可申請書）— 枠付き表示 */
  title?: string;
  titleEn?: string;
  /** 作成用ラベル（例: 申請人等作成用　１） */
  partLabel: string;
  partLabelEn?: string;
  /** V型ラベル（例: Ｖ（「特定技能（１号）」・「特定技能（２号）」）） */
  partLabelV?: string;
  /** 「日本国政府法務省」行の表示 */
  showGov?: boolean;
}) {
  return (
    <div className="form-header">
      {showGov && <div className="gov">日本国政府法務省　Ministry of Justice, Government of Japan</div>}
      {formNumber && <div className="form-number">{formNumber}</div>}
      {title && (
        <div className="form-title-box">
          {title}
          {titleEn && <div className="form-title-en">{titleEn}</div>}
        </div>
      )}
      <div className="part-label">{partLabel}</div>
      {partLabelV && <div className="part-label-v">{partLabelV}</div>}
      {partLabelEn && <div className="part-label-en">{partLabelEn}</div>}
    </div>
```

変更後:
```tsx
/** 申請書ヘッダー（全様式共通） */
export function FormHeader({
  formNumber, title, titleEn, categoryLabel, showGov,
}: {
  /** 様式番号（例: 別記第三十号様式（第二十条関係）） */
  formNumber?: string;
  /** 様式タイトル（例: 在留資格変更許可申請書）— 枠付き表示 */
  title?: string;
  titleEn?: string;
  /** 様式名－在留資格種類（例: 在留資格変更許可申請書－家族滞在） */
  categoryLabel: string;
  /** 「日本国政府法務省」行の表示 */
  showGov?: boolean;
}) {
  return (
    <div className="form-header">
      {showGov && <div className="gov">日本国政府法務省　Ministry of Justice, Government of Japan</div>}
      {formNumber && <div className="form-number">{formNumber}</div>}
      {title && (
        <div className="form-title-box">
          {title}
          {titleEn && <div className="form-title-en">{titleEn}</div>}
        </div>
      )}
      <div className="part-label">{categoryLabel}</div>
    </div>
```

（残りの関数本体・閉じタグは変更しない。）

- [ ] **Step 3: 使われなくなるCSSを削除する**

変更前:
```css
  .form-header .part-label{font-size:10px;font-weight:bold;margin-top:5px;letter-spacing:0.05em;}
  .form-header .part-label-en{font-size:8px;font-weight:normal;color:#333;}
  .form-header .part-label-v{font-size:9px;font-weight:bold;margin-top:4px;letter-spacing:0.03em;}
```

変更後:
```css
  .form-header .part-label{font-size:10px;font-weight:bold;margin-top:5px;letter-spacing:0.05em;}
```

- [ ] **Step 4: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: `shinsei-applicant/page.tsx`・`shinsei-org/page.tsx`内の`<FormHeader>`呼び出しが`partLabel`（必須プロパティ）を渡していないというエラーが多数出る。これはTask 2・3で解消される、想定された一時的な状態。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-shared.tsx"
git commit -m "feat: FormHeaderをcategoryLabel propに統合

申請人等作成用２のような内部区分名やＶ（「特定技能（１号）」・
「特定技能（２号）」）のような内部コードの代わりに、様式名と
在留資格種類を組み合わせた1行ラベルを表示するため、FormHeaderの
partLabel/partLabelEn/partLabelVの3propsをcategoryLabelに統合する。
新しいヘルパーgetPdfHeaderCategoryLabelも追加する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: `shinsei-applicant/page.tsx`の全7箇所の`<FormHeader>`を更新する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-applicant/page.tsx`

- [ ] **Step 1: importと`categoryLabel`変数を追加する**

変更前:
```tsx
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes, omitFor2Go,
  fmtAdditionalOccupations, buildAddress,
  FormHeader, SignatureSection, AgentSection,
  FORM_TITLE_MAP, FORM_DECLARATION_MAP, getFormNumber,
} from "../shinsei-shared";
```

変更後:
```tsx
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes, omitFor2Go,
  fmtAdditionalOccupations, buildAddress,
  FormHeader, SignatureSection, AgentSection,
  FORM_TITLE_MAP, FORM_DECLARATION_MAP, getFormNumber, getPdfHeaderCategoryLabel,
} from "../shinsei-shared";
```

変更前:
```tsx
  // ── ヘッド部分（様式番号・タイトル）: 申請書類の種別に応じて動的に切り替え ──
  const formNumber = getFormNumber(formType, cat);
  const formTitle = FORM_TITLE_MAP[formType];
  const formDeclaration = FORM_DECLARATION_MAP[formType];
```

変更後:
```tsx
  // ── ヘッド部分（様式番号・タイトル）: 申請書類の種別に応じて動的に切り替え ──
  const formNumber = getFormNumber(formType, cat);
  const formTitle = FORM_TITLE_MAP[formType];
  const formDeclaration = FORM_DECLARATION_MAP[formType];
  const categoryLabel = getPdfHeaderCategoryLabel(formType, app.visaType);
```

- [ ] **Step 2: Page 1のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            partLabel="申請人等作成用　１"
            partLabelEn="For applicant, Part 1"
          />
```

変更後:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            categoryLabel={categoryLabel}
          />
```

- [ ] **Step 3: N型Part2のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="申請人等作成用　２"
            partLabelEn="For applicant, Part 2"
          />

          <div className="section3">{p2Base}. 勤務先</div>
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="section3">{p2Base}. 勤務先</div>
```

- [ ] **Step 4: T型Part2のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="申請人等作成用　２"
            partLabelEn="For applicant, Part 2"
          />

          <div className="section3">配偶者・日本人等の情報</div>
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="section3">配偶者・日本人等の情報</div>
```

- [ ] **Step 5: P型Part2のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="申請人等作成用　２"
            partLabelEn="For applicant, Part 2"
          />

          <div className="section3">在籍学校の情報</div>
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="section3">在籍学校の情報</div>
```

- [ ] **Step 6: R型Part2のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="申請人等作成用　２　Ｒ"
            partLabelEn={`For applicant, Part 2 R ("Dependent")`}
          />

          <div className="section">
            申請人等作成用　２　Ｒ　—「家族滞在」{isChange ? '在留資格変更用' : '在留期間更新用'}　（項目 17〜20）
          </div>
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="section">
            申請人等作成用　２　Ｒ　—「家族滞在」{isChange ? '在留資格変更用' : '在留期間更新用'}　（項目 17〜20）
          </div>
```

（直下の`<div className="section">`内の「申請人等作成用　２　Ｒ」表記はページ内見出しであり`FormHeader`とは別要素のため、今回は変更しない。）

- [ ] **Step 7: V型Part2のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="申請人等作成用　２"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For applicant, Part 2 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          {/* 17. 特定技能所属機関 */}
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          {/* 17. 特定技能所属機関 */}
```

- [ ] **Step 8: V型Part3のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="申請人等作成用　３"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For applicant, Part 3 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          {/* 確認事項（22〜27） */}
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          {/* 確認事項（22〜27） */}
```

- [ ] **Step 9: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: `shinsei-applicant/page.tsx`関連のエラーが解消される（`shinsei-org/page.tsx`側のエラーはTask 3まで残る）。

- [ ] **Step 10: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-applicant/page.tsx"
git commit -m "feat: 申請人用PDFの全ページヘッダーをcategoryLabelに統一

全7箇所のFormHeader呼び出しのpartLabel/partLabelEn/partLabelVを
categoryLabel（様式名－在留資格種類）に統一する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: `shinsei-org/page.tsx`の全8箇所の`<FormHeader>`を更新する

**Files:**
- Modify: `src/app/(print)/print/[id]/shinsei-org/page.tsx`

- [ ] **Step 1: importと`categoryLabel`変数を追加する**

変更前:
```tsx
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes, omitFor2Go,
  fmtAdditionalOccupations, buildAddress, businessTypeLabel,
  FormHeader, SignatureSection, AgentSection,
  FORM_TITLE_MAP, getFormNumber,
} from "../shinsei-shared";
```

変更後:
```tsx
import {
  loadShinseiData, PRINT_STYLES,
  fmt, fmtDate, fmtMoney, fmtAddr, fmtSex, fmtYesNo, yes, omitFor2Go,
  fmtAdditionalOccupations, buildAddress, businessTypeLabel,
  FormHeader, SignatureSection, AgentSection,
  FORM_TITLE_MAP, getFormNumber, getPdfHeaderCategoryLabel,
} from "../shinsei-shared";
```

変更前:
```tsx
  // ── ヘッド部分（様式番号・タイトル）: 申請書類の種別に応じて動的に切り替え ──
  const formNumber = getFormNumber(formType, cat);
  const formTitle = FORM_TITLE_MAP[formType];
```

変更後:
```tsx
  // ── ヘッド部分（様式番号・タイトル）: 申請書類の種別に応じて動的に切り替え ──
  const formNumber = getFormNumber(formType, cat);
  const formTitle = FORM_TITLE_MAP[formType];
  const categoryLabel = getPdfHeaderCategoryLabel(formType, app.visaType);
```

- [ ] **Step 2: N型Page1のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            partLabel="所属機関等作成用　１"
            partLabelEn="For organization, Part 1"
          />

          <div className="section">所属機関等作成用　Part 1 N　— 機関情報・雇用条件</div>
```

変更後:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            categoryLabel={categoryLabel}
          />

          <div className="section">所属機関等作成用　Part 1 N　— 機関情報・雇用条件</div>
```

- [ ] **Step 3: R型（扶養者用）のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            partLabel="扶養者用"
            partLabelEn="For supporter"
          />
          <div className="role-banner">【扶養者用】</div>
```

変更後:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            categoryLabel={categoryLabel}
          />
          <div className="role-banner">【扶養者用】</div>
```

（直後の`.role-banner`要素は変更しない。）

- [ ] **Step 4: フリーフィールド用のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            partLabel="所属機関等作成用"
            partLabelEn="For organization"
          />

          <div className="role-banner">【所属機関用】</div>
```

変更後:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            categoryLabel={categoryLabel}
          />

          <div className="role-banner">【所属機関用】</div>
```

- [ ] **Step 5: V型Page1のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            partLabel="所属機関等作成用　１"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 1 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />
```

変更後:
```tsx
          <FormHeader
            showGov
            formNumber={formNumber}
            title={formTitle.ja}
            titleEn={formTitle.en}
            categoryLabel={categoryLabel}
          />
```

- [ ] **Step 6: V型Page2のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="所属機関等作成用　２"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 2 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          {/* 4. 派遣先 */}
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          {/* 4. 派遣先 */}
```

- [ ] **Step 7: V型Page3のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="所属機関等作成用　３"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 3 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          <div className="item-title">
            コンプライアンス確認事項（(11)〜(21)）
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="item-title">
            コンプライアンス確認事項（(11)〜(21)）
```

- [ ] **Step 8: V型Page4のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="所属機関等作成用　４"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 4 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)")`}
          />

          <div className="item-title">
            コンプライアンス確認事項（(22)〜(33)）
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="item-title">
            コンプライアンス確認事項（(22)〜(33)）
```

- [ ] **Step 9: V型Page5のFormHeader呼び出しを更新する**

変更前:
```tsx
          <FormHeader
            partLabel="所属機関等作成用　５"
            partLabelV="Ｖ（「特定技能（１号）」・「特定技能（２号）」）"
            partLabelEn={`For organization, Part 4 V ("Specified Skilled Worker (i)" / "Specified Skilled Worker (ii)") — Support plan`}
          />

          <div className="item-title">
            1号特定技能外国人支援計画（(34)〜(42)）
```

変更後:
```tsx
          <FormHeader
            categoryLabel={categoryLabel}
          />

          <div className="item-title">
            1号特定技能外国人支援計画（(34)〜(42)）
```

- [ ] **Step 10: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし（Task1で発生した一時的なエラーがすべて解消されることを確認する）。

- [ ] **Step 11: コミットする**

```bash
git add "src/app/(print)/print/[id]/shinsei-org/page.tsx"
git commit -m "feat: 所属機関用PDFの全ページヘッダーをcategoryLabelに統一

全8箇所のFormHeader呼び出しのpartLabel/partLabelEn/partLabelVを
categoryLabel（様式名－在留資格種類）に統一する。
【扶養者用】【所属機関用】のロールバナーは変更しない。

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

1. 在留資格変更許可申請（家族滞在＝R型）の申請人用PDFを開き、全ページのヘッダーが「在留資格変更許可申請書－家族滞在」と表示され、「申請人等作成用２」「Ｒ」等の内部表記が表示されないことを確認する。
2. 同じ案件の所属機関用PDFを開き、扶養者用ページのヘッダーも同様に「在留資格変更許可申請書－家族滞在」と表示され、【扶養者用】バナーは従来通り表示されることを確認する。
3. 特定技能（V型）の申請で所属機関用PDF（5ページ）を開き、全ページで同じ形式のヘッダーが表示され、「所属機関等作成用１〜５」「Ｖ（「特定技能（１号）」・「特定技能（２号）」）」が表示されないことを確認する。
4. 在留資格認定証明書交付申請（COE）・在留期間更新許可申請のそれぞれで、ヘッダーの様式名が正しく切り替わることを確認する。
5. ページ1の様式番号・枠付きタイトルボックス・「日本国政府法務省」表記が従来通り表示されることを確認する（回帰確認）。

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
