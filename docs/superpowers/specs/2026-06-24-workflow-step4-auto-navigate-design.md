# 「申請書作成」ステップ到達時の自動画面遷移 設計書

- 作成日: 2026-06-24
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

申請案件のワークフローは8ステップ（`draft`〜`completed`）で構成されており、現在は`src/components/applications/workflow-stepper.tsx`の「次のステップへ進む」ボタン・ステップドット直接クリック・「前のステップへ戻る」ボタンのいずれでステップを移動しても、`window.location.reload()`で同じ申請案件詳細ページ（`/applications/[id]`）を再読込するだけになっている。

④「申請書作成」ステップ（内部キー`ocr_processing`）に前進した場合は、申請書作成画面（`/applications/[id]/shinsei-form`）へ自動的に遷移させ、ユーザーが手動で「申請書を作成」ボタンを探してクリックする手間を省く。

## 対象範囲

「申請書作成」ステップへ**前進**した場合のみ自動遷移する：

- 「次のステップへ進む」ボタン（`handleAdvance`）で、遷移先が`ocr_processing`の場合。
- ステップドットの直接クリック（`handleStepClick`）で、**前進方向**（`targetIndex > currentIndex`）かつ遷移先が`ocr_processing`の場合。

以下は対象外（従来通り、申請案件詳細ページをリロード）：

- 「前のステップへ戻る」ボタン（`handleGoBack`）。
- ステップドットの後退方向クリック（`targetIndex < currentIndex`）で、結果的に`ocr_processing`に戻ってきた場合。
- 他の7ステップ（`ocr_processing`以外）への遷移（前進・後退問わず）。

既存の「申請書を作成」ボタン（`src/app/(dashboard)/applications/[id]/page.tsx`内のLink）はそのまま残し、変更しない。

## 実装方針

`src/components/applications/workflow-stepper.tsx`に`next/navigation`の`useRouter`を導入する。

`handleAdvance()`・`handleStepClick()`それぞれで、`updateApplicationStatus`成功後の`window.location.reload()`を、遷移先ステップが`ocr_processing`かつ前進方向の場合のみ`router.push(`/applications/${applicationId}/shinsei-form`)`に置き換える条件分岐を追加する。

```tsx
// 変更前（handleAdvanceの該当部分）
setOptimisticStep(nextStep);
window.location.reload();

// 変更後
setOptimisticStep(nextStep);
if (nextStep === "ocr_processing") {
  router.push(`/applications/${applicationId}/shinsei-form`);
} else {
  window.location.reload();
}
```

```tsx
// 変更前（handleStepClickの該当部分）
setOptimisticStep(targetKey);
window.location.reload();

// 変更後
setOptimisticStep(targetKey);
if (targetIndex > currentIndex && targetKey === "ocr_processing") {
  router.push(`/applications/${applicationId}/shinsei-form`);
} else {
  window.location.reload();
}
```

`handleGoBack()`は変更しない。

## 影響範囲・スコープ外

- ステータス更新のサーバーアクション（`updateApplicationStatus`）・監査ログ（`auditLog`）・`revalidatePath`の挙動は変更しない。
- ステップ一覧・各ステップの説明文・UIデザイン（ドット・ボタンの見た目）は変更しない。
- 既存の「申請書を作成」ボタン（手動導線）は変更しない。
- `ocr_processing`以外のステップへの自動遷移は今回追加しない（必要になれば別途要望ベースで追加する）。

## テスト手順

1. ステータスが`documents_collecting`（③）の申請案件で「次のステップへ進む」をクリックし、申請書作成画面（`/applications/[id]/shinsei-form`）へ自動的に遷移することを確認する。
2. ステータスが`draft`（①）の申請案件でステップドット④を直接クリックし、同様に申請書作成画面へ自動遷移することを確認する。
3. ステータスが`questionnaire_sent`（⑤）以降の申請案件で「前のステップへ戻る」を④まで複数回クリックし、申請案件詳細ページがリロードされる（自動遷移しない）ことを確認する。
4. ステータスが`questionnaire_sent`（⑤）の申請案件でステップドット④（後退方向）を直接クリックし、同様に申請案件詳細ページがリロードされる（自動遷移しない）ことを確認する。
5. `ocr_processing`以外のステップへの前進・後退で、従来通りページがリロードされることを確認する。
6. `npx tsc --noEmit`でTypeScriptエラーがないことを確認する。
