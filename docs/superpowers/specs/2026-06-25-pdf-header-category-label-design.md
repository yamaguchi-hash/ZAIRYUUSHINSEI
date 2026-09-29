# PDFヘッダーの様式名＋在留資格種類表示 設計書

- 作成日: 2026-06-25
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

申請人用PDF（`shinsei-applicant.tsx`）・所属機関用PDF（`shinsei-org.tsx`）の各ページヘッダーは、現在「申請人等作成用　２」「所属機関等作成用　１」のような内部の構成順を示すラベルと、「Ｖ（「特定技能（１号）」・「特定技能（２号）」）」のような内部の様式区分コードを表示している。これらは入管職員や申請人にとって分かりにくい内部表記であるため、代わりに「在留資格認定証明書交付申請書」「在留資格変更許可申請書」「在留期間更新許可申請書」のいずれかの様式名と、「家族滞在」のような分かりやすい在留資格種類名を表示するように変更する。

## 対象範囲

申請人用PDF・所属機関用PDFの**全ページ**（ページ1〜最終ページ、計13箇所の`<FormHeader>`呼び出し）が対象。ページ1だけでなく、ページ2以降（所属機関等作成用２〜５など）も同様に変更する。

## 変更しないもの

- ページ1の様式番号（例: 「別記第三十号様式（第二十条関係）」）・枠付きタイトルボックス（日本語・英語の様式タイトル）・「日本国政府法務省」の表記は、現状のまま維持する。
- `shinsei-org.tsx`内の【扶養者用】【所属機関用】ロールバナー（`.role-banner`要素、`FormHeader`とは別の独立した要素）は変更しない。

## 表示形式

新しいヘッダーラベルは「[様式名]－[在留資格種類]」の1行テキストとする（例: 「在留資格変更許可申請書－家族滞在」）。英語表記は付けない。

- ページ1: 既存の様式番号・枠付きタイトルボックス・政府表記の下に、この1行が追加される（現在の`partLabel`の表示位置を差し替える）。
- ページ2以降: 現在「所属機関等作成用　２」等のみを表示している部分が、この1行に差し替わる。

## 実装方針

`src/app/(print)/print/[id]/shinsei-shared.tsx`に新しいヘルパー関数を追加する：

```ts
export function getPdfHeaderCategoryLabel(formType: ApplicationFormType, visaType: string): string {
  const title = FORM_TITLE_MAP[formType]?.ja ?? FORM_TITLE_MAP.change.ja;
  const visaLabel = VISA_TYPE_LABELS[visaType] ?? visaType;
  return `${title}－${visaLabel}`;
}
```

`FormHeader`コンポーネントのprops定義を変更し、`partLabel`（必須）・`partLabelEn`（任意）・`partLabelV`（任意）の3つを廃止して、新しい必須prop`categoryLabel: string`に統合する。コンポーネント内部のレンダリングも、3つの要素（`.part-label`/`.part-label-v`/`.part-label-en`）を1つの要素に統合する。

`shinsei-applicant/page.tsx`・`shinsei-org/page.tsx`の全13箇所の`<FormHeader>`呼び出しで、`partLabel`/`partLabelEn`/`partLabelV`の指定を削除し、`categoryLabel={getPdfHeaderCategoryLabel(formType, app.visaType)}`に統一する。

`PRINT_STYLES`内の使われなくなる`.part-label-v`/`.part-label-en`相当のCSS定義は削除し、`.part-label`（または新しいクラス名）のスタイルのみ残す。

## 影響範囲・スコープ外

- ページの内容（各項目の入力欄・テーブル構造）は変更しない。ヘッダー表示のみが対象。
- 様式番号・タイトルボックス・政府表記・ロールバナーは変更しない。
- 資格外活動許可申請書（`gaikatsu.tsx`）のヘッダーは今回のスコープ外とする（対象は申請人用PDF・所属機関用PDFのみ）。

## テスト手順

1. 在留資格変更許可申請（家族滞在）の申請人用PDFを開き、全ページのヘッダーが「在留資格変更許可申請書－家族滞在」と表示され、「申請人等作成用２」「Ｒ」等の内部表記が表示されないことを確認する。
2. 同様に所属機関用PDFを開き、全ページ（V型の場合は5ページ）で同じ形式のヘッダーが表示され、「所属機関等作成用１〜５」「Ｖ（「特定技能（１号）」・「特定技能（２号）」）」が表示されないことを確認する。
3. 【扶養者用】【所属機関用】のロールバナーが従来通り表示されることを確認する（回帰確認）。
4. ページ1の様式番号・枠付きタイトルボックス・政府表記が従来通り表示されることを確認する（回帰確認）。
5. 認定（COE）・変更・更新の3つの申請種別それぞれでヘッダーの様式名が正しく切り替わることを確認する。
6. `npx tsc --noEmit`・`npm run build`でエラーがないことを確認する。
