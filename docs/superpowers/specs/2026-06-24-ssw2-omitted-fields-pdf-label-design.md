# 特定技能2号で省略される項目のPDF「省略」表記 設計書

- 作成日: 2026-06-24
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

入力フォーム（`shinsei-form-editor.tsx`）では、特定技能2号を選択した場合（`is2Go`）、特定技能1号の場合のみ必要な5つの項目グループが自動的に非活性化（ロック）される。しかし、申請人用PDF（`shinsei-applicant.tsx`）・所属機関用PDF（`shinsei-org.tsx`）にはこの判定が存在せず、該当欄は単に空欄として出力される。入管職員から見て「未記入」と「2号のため記載不要」を区別できるよう、該当欄に「省略」と明示する。

## 対象の5グループ

入力フォーム側の`is2Go`非活性化ロジック（`shinsei-form-editor.tsx`）を基準とする：

| グループ | PDFファイル | 対応フィールド |
|---|---|---|
| 項目19（日本語能力） | shinsei-applicant.tsx | `japaneseAbilityProofMethod`、`japaneseAbilityExamName1/2`、`japaneseAbilityExamCountry1/2`、`japaneseAbilityExamCountryName1/2` |
| 項目21（通算在留期間） | shinsei-applicant.tsx | `cumulativeStayYears`、`cumulativeStayMonths` |
| (26) 支援費用負担 | shinsei-org.tsx | `orgSupportCostNotBurdened` |
| 支援責任者・支援担当者＋(34)〜(42)＋支援計画(1)〜(16) | shinsei-org.tsx | `supportManagerName/Title/Appointed`、`supportStaffName/Title/Appointed`、`supportExperienceCriteria`系、`supportLanguageCapability`、`supportDocumentKept`、`supportNeutralPosition`、`supportFailureHistory`系、`supportPeriodicInterviewCapability`、`supportImplementationFieldCriteria`、`supportPlan*`（(1)〜(16)、16フィールド） |
| (5) 登録支援機関 | shinsei-org.tsx | `rsoName`、`rsoCorporateNo`、`rsoInsuranceNo`、`rsoPhone`、`rsoRepresentative`、`rsoRegNo`、`rsoRegDate`、`rsoSupportBusinessName`、`rsoSupportManager`、`rsoSupportStaff`、`rsoAvailableLanguages`、`rsoFeePerMonth` |

## 実装方針

### `is2Go`の共通化

`shinsei-shared.tsx`の`loadShinseiData`が返す`ShinseiData`に`is2Go: boolean`を追加する。判定式は入力フォーム側と完全に一致させる：

```ts
const is2Go = isVtype && form.desiredStatusOfResidence === '特定技能2号';
```

これにより、`shinsei-applicant.tsx`・`shinsei-org.tsx`の両方が`loadShinseiData`の戻り値から`is2Go`をそのまま分割代入で取得できる（既存の`isNtype`/`isRtype`等と同じパターン）。

### 共通ヘルパー`omitFor2Go`

`shinsei-shared.tsx`に以下のヘルパーを追加してexportする：

```ts
/** is2Goがtrueの場合、表示値を「省略」に置き換える（特定技能2号では不要な項目用） */
export function omitFor2Go(is2Go: boolean, formattedValue: string): string {
  return is2Go ? "省略" : formattedValue;
}
```

### 各セルの書き換え

対象の各セルを、既存の`fmt(form.xxx)`・`fmtYesNo(form.xxx)`をそのまま`omitFor2Go(is2Go, ...)`でラップする形に変更する。テーブルの構造・項目番号・ラベル文言・CSSクラスは一切変更しない。

```tsx
// 変更前
<td>{fmt(form.japaneseAbilityProofMethod)}</td>
// 変更後
<td>{omitFor2Go(is2Go, fmt(form.japaneseAbilityProofMethod))}</td>
```

`useState`配列を`.map()`でレンダリングしている箇所（支援計画(1)〜(16)等）は、`val:`の算出式自体を`omitFor2Go(is2Go, fmtYesNo(...))`に変更する。

## 影響範囲・スコープ外

- 入力フォーム（`shinsei-form-editor.tsx`）の既存の自動非活性化ロジック・手動「記載不要」トグルは変更しない。
- 手動「記載不要」トグル（`skip1go`）はDBに保存されない画面上の一時的な状態のため、PDF側では反映できない。PDFに反映されるのは「特定技能2号を選択している」という自動判定（`is2Go`）のみ。
- V型以外の在留資格区分・特定技能1号選択時の出力内容は変更しない（`is2Go`がfalseのため、全フィールドが従来通りの値で出力される）。
- 既存のテーブルフォーマット・フォント・CSSクラスは一切変更しない。

## テスト手順

1. 特定技能2号を選択した案件で申請人用PDFを開き、項目19（日本語能力）・項目21（通算在留期間）の該当欄が全て「省略」と表示されることを確認する。
2. 同案件で所属機関用PDFを開き、(26)・支援責任者・支援担当者・(34)〜(42)・支援計画(1)〜(16)・(5)登録支援機関の該当欄が全て「省略」と表示されることを確認する。
3. 特定技能1号を選択した同種の案件で両PDFを開き、上記の欄が従来通り入力値（または空欄）で表示されることを確認する（回帰確認）。
4. V型以外の在留資格区分の案件で両PDFを開き、出力内容に変化がないことを確認する。
5. `npm run build`でTypeScriptエラーがないことを確認する。
