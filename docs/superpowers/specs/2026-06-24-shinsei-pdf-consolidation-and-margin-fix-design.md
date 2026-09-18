# 申請書PDF出力の2本化（一括版廃止）＋ 余白ドラッグ調整バグ修正 設計書

- 作成日: 2026-06-24
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

申請書PDF出力を「申請人用」「所属機関用（家族滞在等は『扶養者用』）」の2本に統合し、「一括」版（`shinsei.tsx`）を削除する。また、印刷プレビュー画面のマウスドラッグによる余白調整機能が正常に動作しない問題を根本原因から修正する。

## Phase 1 で確定した根本原因（余白ドラッグ調整バグ）

`shinsei.tsx`を含む**全ての印刷ページ**（`shinsei.tsx`・`shinsei-applicant.tsx`・`shinsei-org.tsx`・`riyusho.tsx`・`noufusho.tsx`・`azukari.tsx`・`questionnaire.tsx`・チェックリスト印刷`page.tsx`の計8ファイル）が、Next.jsのルートレイアウト（`src/app/layout.tsx`、既に`<html><body>`を出力済み）の子ページとして、**自分自身でも`<html><head>...</head><body>...</body></html>`を出力している**。

これは無効な「入れ子のhtml/body」構造であり、以下の実害がある：
1. ブラウザのHTMLパーサーは入れ子の`<html>`/`<body>`を「新規要素を作らず属性をマージする」形で復旧するため、Reactが想定する構造と実DOM構造が一致せず、`window.addEventListener('mousemove', ...)`を使う継続的なドラッグ処理（`ShinseiMarginControls`）でイベントリスナーが確実に結びつかない状態が起きる。単純なクリックハンドラ（`PrintTrigger`のボタン）はこの種の不整合に対して相対的に頑健なため、これまで実害として表面化していなかった。
2. ルートレイアウトは`<body className="...bg-gray-50 text-gray-900 antialiased">`のようにTailwindクラスでbodyを装飾している。印刷ページ側は`body{background:#f3f4f6;color:#000;font-family:"MS Mincho"...}`という型セレクタで対抗しているが、CSS優先順位ではクラスセレクタが型セレクタに勝るため、入れ子のbodyが実際にマージされた場合、印刷ページの配色・フォント設定が壊れるリスクを構造的に抱えている。

### 修正方針

Next.jsの「複数ルートレイアウト」パターンを使う。

- `app/layout.tsx`（現在の共通ルートレイアウト。`<html><body>`＋`SessionProvider`＋フォント設定）を削除し、その内容を`(dashboard)/layout.tsx`に統合する（`(dashboard)`を独立したルートレイアウトにする）。
- `app/print/`配下を新規ルートグループ`(print)/print/`に移動する（URLは`/print/...`のまま変わらない。route groupはURLに影響しない）。
- `(print)/layout.tsx`を新規作成し、最小限の`<html><body>{children}</body></html>`を出力する（ダッシュボード側のTailwindクラス・フォントは適用しない）。
- 各印刷ページ（8ファイル）から`<html>`/`<head>`/`<body>`のラップタグを削除し、`<style>{...}</style>`と実コンテンツを直接返すようにする（`<style>`タグはbody内に直接置いても正しく機能するため、デザイン・テーブル・フォントの見た目は一切変更しない）。

## Phase 2：所属機関用・申請人用PDFのコンテンツ完全化

### 現状の欠落（shinsei.tsxとの比較で判明）

`shinsei-applicant.tsx`は現在`isVtype`分岐のみを持ち、以下の申請人側Part2コンテンツが存在しない：

| 区分 | 実例 | 移植元（shinsei.tsx） |
|---|---|---|
| N型 | 技術・人文知識・国際業務、研究、高度専門職、介護、技能、特定活動 | 437-501行 |
| T型 | 日本人の配偶者等、永住者の配偶者等、定住者 | 502-557行 |
| R型 | 家族滞在（項目17〜20＋代理人欄＋申請人署名） | 558-712行 |
| P型 | 留学 | 831-878行 |
| 共通 | 代理人/取次者（項目22/27） | 1188-1218行 |
| 共通 | M/J/K/O/Q/Y/H/U用フリーフィールド | 1171-1187行 |
| 共通 | R型・V型以外の申請人署名欄 | 1622-1645行 |

`shinsei-org.tsx`は現在`isVtype`分岐のみを持ち（ファイル冒頭のコメントで明記："isVtype が false の場合は何も出力しない"）、以下が存在しない：

| 区分 | 移植元（shinsei.tsx） |
|---|---|
| N型所属機関情報（機関情報・就労条件・派遣先・署名） | 1221-1391行 |
| N型以外の就労系（M/L/I/P/Q/Y）用フリーフィールド | 1394-1408行 |

`shinsei.tsx`の「扶養者用」コンテンツ（R型・所属機関ロール、714-830行付近）は`shinsei-org.tsx`に移植する（扶養者氏名署名欄を含む。`shinsei-org.tsx`がV型専用の現在のドキュメントコメントは、移植後「V型・N型・R型」に対応する内容へ更新する）。

### 移植時の方針

- 既存の`shinsei-applicant.tsx`・`shinsei-org.tsx`のページ構成（`<div className="page">`単位、`FormHeader`呼び出し、`role-banner`バナー）パターンを完全に維持し、新しい条件分岐ブロックを「既存パターンに沿った新規ページ」として追加する。テーブルのCSSクラス・フォント・枠線は一切変更しない（`shinsei.tsx`から該当ブロックをそのまま移植するため、デザインの見た目は完全に同一になる）。
- N/T/R/P型のいずれにも該当しない場合（既存のV型ページ・共通ページのみ）は、現状の出力を維持する。
- 移植後、`shinsei.tsx`が持っていた「全カテゴリの内容を100%カバーする」という性質を、`shinsei-applicant.tsx`＋`shinsei-org.tsx`の組み合わせで完全に引き継ぐ。

### 資格外活動許可申請書の切り出し

`shinsei.tsx`の1410-1618行（様式28号、項目1〜13＋署名欄＋取次者欄を持つ独立した書式）を、新規ルート`src/app/print/[id]/gaikatsu/page.tsx`として切り出す（`riyusho.tsx`・`noufusho.tsx`と同じ構造パターンに従う）。表示条件（`form.gaikatsuNeeded === "有" || (isRtype && yes(form.partTimeWorkExistsR)) || isPtype`、かつ実際にgaikatsu系フィールドに入力がある場合）を`shinsei-form/page.tsx`の`showRiyusho`と同様の`showGaikatsu`変数として再現し、条件を満たす場合のみダウンロードボタンを表示する。

## Phase 3：余白ドラッグ調整機能の移植・多ページ対応化

`ShinseiMarginControls`（現在`shinsei.tsx`専用、単一の`.page`要素を前提）を、`shinsei-applicant.tsx`（最大3ページ）・`shinsei-org.tsx`（最大7ページ程度、N型ページ追加後）の複数`.page`要素構成に対応させる。

- `document.querySelectorAll(".page")`で全`.page`要素を取得し、**最初の要素の上端**・**最後の要素の下端**にそれぞれ上下マージン調整ハンドルを配置する（`@page`マージンは全物理ページに一律適用されるため、ハンドルは見た目上の最初/最後のページにのみ表示すれば十分）。
- ロール境界（`role-banner`）のハンドルは現行ロジック（`querySelectorAll(".role-banner")`で全件取得）をそのまま使う。
- Phase 1のhtml/body構造修正が前提となる（修正前の入れ子構造ではドラッグの信頼性が保証できないため）。
- `PrintTrigger`の`disableAutoPrint`は両ファイルの呼び出しに追加する。

## Phase 4：ボタン統合・一括版の削除

`src/app/(dashboard)/applications/[id]/shinsei-form/page.tsx`の3ボタンを2ボタンに変更する。

```tsx
const needsOrgDoc = VISA_CATEGORY_NEEDS_ORG[cat as keyof typeof VISA_CATEGORY_NEEDS_ORG] ?? false;
const isDependentCategory = cat === 'R';
const secondButtonLabel = isDependentCategory ? "扶養者用PDFダウンロード" : "所属機関用PDFダウンロード";
```

（`cat`は`form.visaFormCategory`相当の値。`getApplicationById`が返すデータから`form.visaFormCategory`を取得できることを実装時に確認する。）

- 「申請書PDF（一括）」ボタンと、そのリンク先`/print/${id}/shinsei`を削除する。
- 2つ目のボタンの文言を上記ロジックで動的化する（リンク先は引き続き`/print/${id}/shinsei-org`）。
- Phase 2・Phase 3が完了し、全カテゴリで`shinsei-applicant.tsx`・`shinsei-org.tsx`の出力内容が`shinsei.tsx`と同等であることを確認した後に、`src/app/print/[id]/shinsei/page.tsx`を削除する。

## 影響範囲・スコープ外

- `riyusho.tsx`・`noufusho.tsx`・`azukari.tsx`・`questionnaire.tsx`・チェックリスト印刷ページは、Phase 1のhtml/body構造修正のみ適用する（コンテンツ・ボタン構成は変更しない）。
- 既存のテーブルフォーマット・フォント・CSSクラス・データバインドロジックは一切変更しない。
- マージンドラッグ調整値のDB永続化は対象外（既存仕様を維持、リロードで初期値に戻る）。

## テスト手順

### Phase 1
1. 各印刷ページを開き、ブラウザの開発者ツールでDOM構造に入れ子の`<html>`/`<body>`が存在しないことを確認する。
2. 既存の表組み・フォント・印刷時レイアウトが変更前と見た目上同一であることを確認する。
3. `npm run build`でエラーがないことを確認する。

### Phase 2
1. N型（技術・人文知識・国際業務）・T型（日本人の配偶者等）・R型（家族滞在）・P型（留学）の案件それぞれで、申請人用PDF・所属機関用/扶養者用PDFを開き、`shinsei.tsx`（削除前）の対応箇所と内容が一致することを確認する。
2. 資格外活動の対象案件で、新規`/print/[id]/gaikatsu`が正しく出力され、`shinsei-form`画面に条件付きでボタンが表示されることを確認する。

### Phase 3
1. `shinsei-applicant.tsx`・`shinsei-org.tsx`それぞれで、最初のページ上端・最後のページ下端にハンドルが表示され、ドラッグで余白が連動して伸縮することを確認する。
2. 調整後、印刷プレビュー（Ctrl+P）で調整通りの余白が反映されることを確認する。

### Phase 4
1. N型・V型・R型それぞれの案件で`shinsei-form`画面を開き、ボタンが2つになっていること、2つ目のボタン文言が正しく切り替わっていることを確認する。
2. `/print/[id]/shinsei`へ直接アクセスすると404になることを確認する。
