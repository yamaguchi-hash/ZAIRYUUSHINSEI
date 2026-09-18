# 申請書PDF（一括）の所属機関署名欄拡張 設計書

- 作成日: 2026-06-23
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master
- 対象ファイル: `src/app/print/[id]/shinsei/page.tsx`（「申請書PDF（一括）」、`/print/[id]/shinsei` ルート）のみ

## 背景・現状調査の要点

ユーザーから「申請人用署名欄」「所属機関用（扶養者用）署名・押印欄」をPDF出力末尾に追加する依頼があったが、調査の結果、対象の`shinsei/page.tsx`には既に以下の署名欄が各セクション末尾に存在することを確認した。

- 【申請人署名欄】（手書き用の空欄、4箇所）
- 【扶養者署名欄】（R型のみ、手書き用の空欄、1箇所）
- 【機関代表者・担当者署名】（N型本体・N型派遣先の2箇所）— ラベルのみで、値セルが完全に空白。会社名・代表者名の自動記入や印影枠は一切ない

ユーザーに確認し、申請人・扶養者の署名欄（手書き用空欄）はそのまま維持し重複追加しないこと、所属機関の空白セルのみをユーザー指定のデザイン（丸型・赤色破線の印影枠）で拡張する方針で合意した。

会社名・代表者名の自動記入については、既に`src/app/print/[id]/shinsei-org/page.tsx`が確立済みのパターンを持つ。

```tsx
<SignatureSection
  role="organization"
  orgName={fmt(org?.nameJa) || fmt(form.orgName)}
  representativeTitle={fmt(org?.representativeTitle)}
  representativeName={fmt(org?.representativeName) || fmt(form.position)}
/>
```

`org`（`organizationMaster`の行）は申請人マスター・所属機関マスターから直接取得した最新値を優先し、`form.orgName`/`form.position`（申請データ側の保存値）をフォールバックとして使う。`shinsei.tsx`は既にファイル先頭で`org`を取得済み（`organizationMaster`から`app.organizationId`をキーに取得）であり、同じパターンをそのまま使える。

## 変更内容

### 1. CSSの追加

`shinsei.tsx`の`<style>`ブロック（通常ルール部分、メディアクエリ外）に、ユーザー指定の印影枠スタイルを追加する。

```css
.seal-box{
  width:40px;height:40px;border:1px dashed #ff0000;border-radius:50%;
  color:#ff0000;text-align:center;line-height:40px;font-size:8pt;flex-shrink:0;
}
```

改ページ時の千切れ防止は、PDF密度最適化作業で既に追加済みの`tr{break-inside:avoid;page-break-inside:avoid;}`（スタイルシート末尾の`@media print`ブロック内）が、この署名欄の`<tr>`にも自動的に適用されるため、新規ルールは不要。

### 2. 「機関代表者・担当者署名」セルの拡張（2箇所）

現在の構造（N型本体、N型派遣先の両方で同一パターン）:

```tsx
<table className="sign-table" style={{ marginTop: "10px" }}>
  <tbody>
    <tr>
      <td className="lbl" style={{ width: "30%" }}>機関代表者・担当者署名</td>
      <td style={{ width: "40%" }}></td>
      <td className="lbl" style={{ width: "15%" }}>署名日</td>
      <td style={{ width: "15%" }}></td>
    </tr>
  </tbody>
</table>
```

空白の値セル（`<td style={{ width: "40%" }}></td>`）を、会社名・代表者役職・代表者氏名＋印影枠に拡張する:

```tsx
<td style={{ width: "40%" }}>
  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: "bold" }}>{fmt(org?.nameJa) || fmt(form.orgName)}</div>
      <div>{fmt(org?.representativeTitle)} {fmt(org?.representativeName) || fmt(form.position)}</div>
    </div>
    <div className="seal-box">印</div>
  </div>
</td>
```

署名日セル・ラベルセルは変更しない。

## 影響範囲・スコープ外

- `shinsei-applicant.tsx`/`shinsei-org.tsx`/`shinsei-shared.tsx`は変更しない（`shinsei-org.tsx`は既にこの機能を持っている）
- 申請人・扶養者の署名欄（手書き用空欄）は変更しない
- 「資格外活動許可申請書」内の署名欄は別様式の添付であり対象外とする

## テスト手順

1. 所属機関が紐づくN型（技人国等）の案件を開き、`/print/[id]/shinsei`を開く
2. 「所属機関等作成用 Part 1 N」末尾の署名欄に、会社名・代表者役職・代表者氏名と丸型の赤色破線印影枠が表示されることを確認する
3. 派遣先情報がある案件で「所属機関等作成用 Part 2 N」末尾の署名欄も同様に表示されることを確認する
4. ブラウザの印刷プレビューで、署名欄の行が途中でページを跨いで分断されないことを確認する
5. `npm run build`でTypeScriptエラーなしを確認する
