# 申請書PDF（一括）の余白ドラッグ調整機能 設計書

- 作成日: 2026-06-23
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master
- 対象ファイル: `src/app/print/[id]/shinsei/page.tsx`（「申請書PDF（一括）」、`/print/[id]/shinsei` ルート）のみ

## 背景・目的

申請書PDF（一括）の印刷プレビュー画面で、ユーザーがマウスドラッグにより上下の余白・ロール境目（申請人用→所属機関用／扶養者用）の隙間をリアルタイムに調整できるようにする。調整した値は、ブラウザの印刷・PDF保存実行時の実際の出力にも反映される。

## 現状調査の要点

- `shinsei.tsx`はサーバーコンポーネント（`async function`、DB直接アクセス）であり、`useState`やマウスイベントハンドラを直接持つことができない。既存の`PrintTrigger`（クライアントコンポーネント、`src/app/print/[id]/print-trigger.tsx`）と同様に、別ファイルの`"use client"`コンポーネントとして実装し、サーバー側コンテンツと並べて配置する必要がある。
- `PrintTrigger`には、ページ読み込み800ms後に`window.print()`を自動実行する既存ロジックがある。今回の機能はユーザーが余白を調整した後に印刷する想定のため、この自動印刷と競合する。`PrintTrigger`に`disableAutoPrint`（任意prop、デフォルト`false`）を追加し、`shinsei.tsx`での呼び出しのみ`true`を指定する。他の印刷画面（`print/[id]/page.tsx`等、`PrintTrigger`を使う他のルート）の動作は変更しない。
- 現在、画面表示時の余白は`.page`要素のCSS `padding`（固定14mm）、印刷時の余白は`@page{margin:6mm 8mm}`（固定値）と、別々の固定値で管理されている。これは直前のPDF密度最適化作業（`@page{margin:0}`+content paddingが改ページ後のページで余白を失う不具合の修正）で確立した設計である。
- CSSカスタムプロパティはReactのServer/Client境界に関係なく、DOMツリー上を自然に継承する。クライアントコンポーネントが祖先要素にカスタムプロパティを設定し、既存のスタイルシート側でそれを参照すれば、サーバー側でレンダリングされた子要素（`.role-banner`等）にも反映できる。
- `.role-banner`（申請人用→所属機関用／扶養者用の境目を示すバナー）は、在留資格カテゴリに応じて1〜2個レンダリングされる（実装時に判明：V型は所属機関用バナーが2個表示されるケースがある）。そのため、ロール境目ハンドルは`document.querySelectorAll('.role-banner')`で見つかった**すべての要素**にハンドルを重ねて表示し、いずれのハンドルをドラッグしても同一の`roleGapMargin`を変更する（CSSクラスセレクタで全`.role-banner`要素に同じ値が反映されるため、表示位置が複数でも調整値は1つで一貫する）。

## アーキテクチャ概要

```
shinsei.tsx（サーバーコンポーネント、変更なし）
  ├─ <PrintTrigger applicationId={id} disableAutoPrint />  ← propを1つ追加
  ├─ <ShinseiMarginControls />                              ← 新規クライアントコンポーネント
  └─ <div className="page">...（既存の全コンテンツ、変更なし）...</div>

ShinseiMarginControls（新規、"use client"）
  ├─ State: topMargin / bottomMargin / roleGapMargin（mm、2〜25でクランプ）
  ├─ useEffect + ResizeObserver: document.querySelector('.page') と
  │   '.role-banner' の位置をgetBoundingClientRect()で取得し、
  │   ハンドルバー（position:fixed、no-print）をその位置に重ねて表示
  ├─ マウスドラッグ（onMouseDown→window.mousemove/mouseup）でState変更
  └─ Stateの値を反映した<style>タグを動的に1つ追加:
      @page{margin-top:Xmm;margin-bottom:Ymm;}        ← 印刷時の余白
      .page{padding-top:Xmm;padding-bottom:Ymm;}       ← 画面プレビューの余白（印刷値と統一）
      .role-banner{margin-top:Zmm;}                     ← ロール境目の追加の隙間
```

## ハンドルの配置・挙動

- 上端ハンドル: `.page`要素の最上部に重ねて配置。ドラッグで`topMargin`を変更。
- 下端ハンドル: `.page`要素の最下部に重ねて配置。ドラッグで`bottomMargin`を変更。
- ロール境目ハンドル: `.role-banner`要素が存在する場合のみ、その**すべて**（0〜2個程度）の直前にそれぞれ重ねて配置。いずれのハンドルをドラッグしても共通の`roleGapMargin`を変更する。
- 各ハンドルは高さ6pxで、通常時は透過（`background:transparent`）。`onMouseEnter`で薄いグレーの背景＋カーソルを`ns-resize`に変更し、ドラッグ可能であることを示す。
- ハンドル自体は`.no-print`相当のクラスを付与し、印刷時には非表示にする（既存の`.no-print{display:none!important}`ルールをそのまま利用）。

## State管理・可動限界

```ts
const [topMargin, setTopMargin] = useState(6);     // mm、初期値は現状の@page margin-topと同じ
const [bottomMargin, setBottomMargin] = useState(6); // mm
const [roleGapMargin, setRoleGapMargin] = useState(0); // mm、追加の隙間（初期値0=現状と同じ見た目）
```

ドラッグ中の移動量（`clientY`の差分）をmmに変換し、`Math.max(2, Math.min(25, ...))`で2mm〜25mmにクランプする。

## 動的スタイルの注入

`ShinseiMarginControls`内で、現在のState値を反映した`<style>`タグをコンポーネント自身がレンダリングする（`<style>{`@page{...} .page{...} .role-banner{...}`}</style>`）。このタグはReactのレンダーツリー上は`shinsei.tsx`の既存`<style>{...}</style>`（`<head>`内）より後にDOM上配置されるため、CSSのカスケード順により後勝ちとなり、確実に上書きされる（直前のPDF密度最適化作業で確認済みの仕組みと同じ）。

`.page{padding-top:...}`は画面表示時のみ意味を持つ値だが、`@media print`の制約は付けない（印刷時は既存の`.page{padding:0}`ルールがさらに後で評価されるため、印刷結果には影響しない）。

## 永続化・印刷適用

- 調整した余白値はReact Stateのみで保持し、DBには保存しない。ページをリロードする、または他の職員が同じ案件のPDFを開くと初期値（6mm/6mm/0mm）に戻る。
- ブラウザの印刷ボタン（`PrintTrigger`の既存ボタン）またはCtrl+Pで印刷ダイアログを開いた時点で、その時の動的`<style>`タグの内容がそのまま使われるため、調整した余白通りの結果が得られる。

## 影響範囲・スコープ外

- `shinsei-applicant.tsx`/`shinsei-org.tsx`/`shinsei-shared.tsx`は変更しない（別の複数`.page`要素構造のため、本機能の対象外）。
- 左右の余白（`@page`の`margin-left`/`margin-right`、現状8mm固定）は調整対象外とする（ご要望が「上下の余白」「セクション境界の隙間」に限定されているため）。
- 調整値のDB永続化は対象外（将来的に必要であれば別途検討）。

## テスト手順

1. N型・V型・R型それぞれの案件で`/print/[id]/shinsei`を開き、自動印刷ダイアログが開かないことを確認する（`disableAutoPrint`の動作確認）。
2. 上端・下端のハンドルにマウスを乗せ、カーソルが`ns-resize`に変わり、薄いグレーのバーが見えることを確認する。
3. 上端ハンドルをドラッグし、画面上の余白がリアルタイムに変化することを確認する。2mm未満・25mm超に動かそうとしても止まることを確認する。
4. ロール境目（所属機関用または扶養者用バナーの直前）のハンドルが正しい位置に表示され、ドラッグで隙間が変化することを確認する。
5. ウィンドウサイズを変更し、ハンドルの位置が正しく再計算されることを確認する。
6. 余白を調整した状態でブラウザの印刷プレビュー（Ctrl+P）を開き、調整した余白通りに反映されていることを確認する。
7. ページをリロードし、余白が初期値（6mm/6mm/0mm）に戻ることを確認する。
8. 他の印刷画面（チェックリスト等、`PrintTrigger`を使う既存ルート）で、自動印刷ダイアログが従来通り開くことを確認する（`disableAutoPrint`未指定時の後方互換性）。
9. `npm run build`でTypeScriptエラーなしを確認する。
