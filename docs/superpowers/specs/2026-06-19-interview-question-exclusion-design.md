# 質問書・顧客聴取 — 質問の個別削除・復元機能 設計書

- 作成日: 2026-06-19
- 対象: 在留申請システム（zairyu-shinsei-system）
- 前提: `docs/superpowers/specs/2026-06-19-interview-questionnaire-design.md`（質問書・顧客聴取の動的差分生成＋AI拡張）の上に構築する

## 背景・目的

質問書・顧客聴取パネル（セクションA：共通必須確認事項／B：資格別・書類確認事項／C：AI検出事項）は、申請書データ・必要書類・Geminiによる論理矛盾検出から自動的に質問リストを生成する。しかし実務上、表示された質問の中に「この案件では不要」と判断できるものが含まれる場合があり、現状はそれを個別に非表示にする手段がない。

本機能は、各質問行にゴミ箱ボタンを設け、ユーザーが個別に質問をリストから除外し、誤操作時には即座に元へ戻せるようにする。除外状態は案件データに永続化し、画面を再読み込みしても、AIが再分析を行っても、一度消した質問が勝手に復活しないようにする。

## アーキテクチャ概要

質問ID（`form:${formKey}` / `doc:${checkId}:${itemId}` / `ai:${field}`）は既に決定的に生成されるため、除外リストは**案件（`applications`）テーブルにIDの配列を1カラム追加するだけ**で永続化できる。

```
[questionnaire-panel.tsx] ← questions (isExcluded フラグ付き)
        │                          ↑
        │                  computeInterviewQuestions(..., excludedIds)
        │                  analyzeInterviewWithAI(...) （AI検出にも同じフラグ付与）
        │                          ↑
        │                  application.interviewExcludedFields（DB, string[]）
        │
        │ 削除/復元クリック
        ▼
setInterviewQuestionExcluded(applicationId, questionId, excluded)
        → DB更新 → revalidatePath
        │
        └─ クライアント側は楽観的にローカルstateを即時更新（フェードアウト/イン）
           + トースト通知（Undoボタン付き）
```

サーバー側の差分計算（`computeInterviewQuestions`／`analyzeInterviewWithAI`）は除外された質問を配列から**取り除かず**、`isExcluded: true` フラグを付けて返す。これにより「削除済み質問一覧」アコーディオンは、画面を再読み込みしてもサーバーから受け取ったデータだけで即座に正しい内容を表示できる（セクションA/Bのみ。セクションCはユーザー確認の通り、再度「AIで分析」ボタンを押すまで一覧データそのものが存在しないため対象外）。**印刷・DOCX出力系統だけは** `isExcluded` の質問を完全にフィルタして除外する（復元UIが存在しない出力先のため）。

## データモデル

`src/lib/db/schema.ts` の `applications` テーブルに新規カラムを追加する。

```ts
interviewExcludedFields: jsonb("interview_excluded_fields").$type<string[]>().default([]).notNull()
```

- 既存カラムと同じJSONB方式（`additionalFiles`等の前例に倣う）
- デフォルト空配列・NOT NULLとし、既存レコードもマイグレーション直後から安全に扱える

## バックエンド変更

### `src/lib/interview-diff.ts`
- `InterviewQuestion` インターフェースに `isExcluded?: boolean` を追加
- `computeInterviewQuestions` に5番目の引数 `excludedIds: Set<string>` を追加。生成する各質問（form由来・checklist由来の両方）に `isExcluded: excludedIds.has(id)` を設定する。**質問自体は除外しない**（配列から取り除かない）

### `src/actions/interview-ai-analysis.ts`
- `getApplicationById` で取得した `application.interviewExcludedFields` から `excludedIds: Set<string>` を構築
- ルールベース質問の重複除去（既存の `alreadyCovered`）は変更しない
- AI検出結果を組み立てる際、各質問に `isExcluded: excludedIds.has(\`ai:${field}\`)` を設定する（除外はしない。表示制御はクライアント側）

### `src/actions/interview.ts`
- 新規アクション `setInterviewQuestionExcluded(applicationId: string, questionId: string, excluded: boolean): Promise<{success, error?}>` を追加
  - 既存の `saveInterviewAnswer` と同じ認証・テナントスコープチェックパターンを踏襲
  - `application.interviewExcludedFields` を読み込み、`excluded === true` なら配列に `questionId` を追加（重複防止）、`false` なら配列から取り除く
  - 連打防止はクライアント側のボタン`disabled`制御のみで対応し、サーバー側にデバウンス機構は設けない（トグル操作は低頻度のため、過剰な設計を避ける）

### 印刷・DOCX出力3ルート（`questionnaire-content/route.ts` / `print/[id]/questionnaire/page.tsx` / `questionnaire-gdoc/route.ts`）
- `application.interviewExcludedFields` から `excludedIds` を構築し `computeInterviewQuestions` に渡す
- 戻り値から `isExcluded === true` の質問を `.filter()` で完全に除去してから出力ロジックに渡す

### `src/app/(dashboard)/applications/[id]/page.tsx`
- `application.interviewExcludedFields` から `excludedIds` を構築し `computeInterviewQuestions` に渡す（フィルタはしない。フラグ付きで`QuestionnairePanel`にそのまま渡す）

## フロントエンド変更（`src/components/applications/questionnaire-panel.tsx`）

- **削除ボタン**: 各 `QuestionCard` の右端にゴミ箱アイコン（`lucide-react`の`Trash2`）。`title`属性で「この質問を削除する」ツールチップを表示
- **確認ダイアログ**: `bucket === "A"` の質問を削除しようとした場合のみ、`window.confirm()` ベースの簡易確認（「この質問は入管申請に強く推奨される項目です。本当に削除しますか？」）を挟む。B/Cは確認なしで即削除
- **楽観的UI更新**: 削除確定後、CSSトランジション（`opacity`+`max-height`、200〜300ms）でカードをフェードアウトしつつ `setInterviewQuestionExcluded(applicationId, id, true)` を呼び出す。失敗時はフェードインで復元し、エラートーストを表示
- **トースト通知**: 画面下部固定の軽量な自前コンポーネント（新規ライブラリ依存なし）。「質問を削除しました」＋「元に戻す」ボタンを表示し、5秒で自動的に消える
- **復元アコーディオン**: 各バケット（A/B/C）の最下部に「削除済みの質問を表示（N件）」の折りたたみ領域。展開すると各質問に「元に戻す」ボタンが付いたカード一覧を表示。クリックで `setInterviewQuestionExcluded(applicationId, id, false)` を呼び、フェードインで通常リストへ戻す
- **状態管理**: 「表示用リスト」は **「回答済み（既存の `resolvedIds` に含まれない）」かつ「除外されていない（`isExcluded !== true` かつローカルの楽観的除外stateに含まれない）」** の両方を満たす質問とする。「削除済み一覧用リスト」は `isExcluded === true` または楽観的除外state内の質問（かつ未回答）とする。回答済み非表示（`resolvedIds`）と除外非表示（`isExcluded`/楽観的state）は完全に独立した2軸のフィルタであり、`useMemo` でこの2軸をAND結合して最終的な表示リストを導出する

## エラーハンドリング

`setInterviewQuestionExcluded` は既存アクション群と同じ try/catch ラップ＋`{success, error?}` 形式を踏襲する。クライアント側は楽観的更新失敗時に必ずロールバック（フェードイン復元）し、トーストでエラーを通知する。

## テスト手順

1. V/Nカテゴリの実案件を開き、セクションA/Bの任意の質問（A各1件・B各1件）を削除し、即座にフェードアウトしてリストから消えること、トーストに「元に戻す」が表示されることを確認
2. セクションAの質問を削除しようとした際に確認ダイアログが出ること、Bでは出ないことを確認
3. トーストの「元に戻す」をクリックし、質問がフェードインで復元されることを確認
4. 別の質問を削除後、トーストが自動的に消えてから「削除済みの質問を表示（1件）」アコーディオンを展開し、そこから「元に戻す」で復元できることを確認
5. 質問を削除した状態でページをリロードし、削除した質問が表示されず、アコーディオンにも正しく表示されることを確認（セクションA/B）
6. 「AIで分析」を押してセクションCの質問を1件削除→ページをリロード→再度「AIで分析」を押し、その質問が一覧に再表示されないこと（要件4の復活防止）を確認
7. 印刷ページ（`/print/[id]/questionnaire`）・DOCX/Googleドキュメント出力で、削除済みの質問が出力に含まれないことを確認
8. `npm run build` でTypeScriptエラーなしを確認

## スコープ外（将来拡張）

- 複数質問の一括削除（チェックボックスでの選択削除）
- 削除理由のメモ入力
- セクションCの除外状態をDBに永続化し、リロード直後から一覧表示する方式（今回は不採用。ユーザー確認済み）
