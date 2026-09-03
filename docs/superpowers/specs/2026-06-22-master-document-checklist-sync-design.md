# 申請人マスター書類の必要書類チェックリスト自動連携 設計書

- 作成日: 2026-06-22
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

申請案件の【必要書類チェックリスト】では、「パスポート」「在留カード（表面・裏面）」をスタッフが毎回手動でアップロードしている。これらは多くの場合【申請人マスター】（`applicantDocuments`）に既に登録済みであるため、案件詳細画面を開いた際にマスターのファイルをチェックリストへ自動的に反映し、手動アップロードの手間を省く。

## 現状調査の要点

- `applicantDocuments`（申請人マスター書類）で実際に運用されている書類タイプは `passport_data_page` / `residence_card_front` / `residence_card_back` の3種（`passport_front`は事実上未使用、`residence_card_renewal`は在留カード更新時の別履歴フローであり対象外）
- `applicationDocumentChecklist`の`documentName`は申請書類により表記が揺れる：「パスポート（提示）」「在留カード」のような単一項目もあれば、「在留カード（表面）」「在留カード（裏面）」と分割2項目になっているケースもある
- `documentName`に「扶養者」を含む項目（例：「扶養者の在留カード（表面）の写し」）は申請人本人ではなく扶養者本人の書類であり、マスター連携の対象外としなければならない
- チェックリストには既に`additionalFiles`（2枚目以降アップロード）の仕組みが実装済みであり、在留カードの表面・裏面を「メイン＋追加ファイル1枚目」として1項目に収める設計と相性が良い
- 書類のリンク表示（画像はクリックでモーダル、PDFは新規タブ）は`DocumentLink`コンポーネント（`src/components/applicants/document-viewer.tsx`）で既に実装済みであり、サムネイル表示は元々行われていない
- 類似の「マスター→案件」連携の既存パターンとして`mapOrganizationToFormData`（`src/lib/org-master-mapping.ts`）があり、ライブ計算かつ案件固有データが優先される設計思想を踏襲する

## アーキテクチャ概要

```
申請案件詳細画面を開く（src/app/(dashboard)/applications/[id]/page.tsx）
  ↓
syncMasterDocumentsToChecklist(applicationId, applicantId)  ← 新規関数（書き込み副作用）
  ├─ applicantDocuments を取得（passport_data_page / residence_card_front / residence_card_back）
  ├─ 案件のチェックリストを走査し、未提出（fileUrl が null）かつマッチ対象の項目を特定
  └─ マッチした項目に UPDATE で fileUrl/fileName/fileSize/mimeType + fileSourcedFromMaster=true,
      status="submitted", submittedAt=now を書き込み
  ↓
getApplicationById(applicationId)  ← 既存の読み取り専用関数（変更なし）
  ↓
DocumentChecklist コンポーネント（バッジ表示・閲覧・ZIP同梱は既存ロジックがそのまま動作）
```

`getApplicationById`自体には書き込み副作用を持たせない。`interview-ai-analysis.ts`等、`getApplicationById`の他の呼び出し元に意図しない書き込みが波及しないよう、同期処理は**詳細画面のサーバーコンポーネントから明示的に呼ぶ専用関数**として分離する。

## マッチング・除外ルール

チェックリスト項目の`documentName`を正規化（NFKC・記号除去。既存の`document-classifier.ts`の`normalize()`と同方式）した上で判定する。

1. **除外**: 正規化後の文字列が「扶養者」を含む場合は対象外（手動アップロードのみ）
2. **パスポート判定**: 「パスポート」または「旅券」を含む場合 → `applicantDocuments`の`documentType = 'passport_data_page'`の最新レコードを反映
3. **在留カード判定**: 「在留カード」を含む場合
   - 「表面」を含む → `residence_card_front`のみを当該項目のメインファイルとして反映
   - 「裏面」を含む → `residence_card_back`のみを当該項目のメインファイルとして反映
   - どちらも含まない（単一項目）→ `residence_card_front`をメインファイル、`residence_card_back`が存在する場合は既存の`additionalFiles`配列の先頭（2枚目）として反映

いずれの判定にも該当しない、またはマスターに対応する書類がまだ存在しない場合は、既存の手動ドロップイン枠での動作のまま変更しない。

## データモデル変更

`applicationDocumentChecklist`テーブルに新規カラムを追加する。

```ts
fileSourcedFromMaster: boolean("file_sourced_from_master").default(false).notNull(),
```

このフラグは「現在のfileUrlがマスターから自動反映されたものか、案件固有にアップロードされたものか」を区別するために使う（バッジ表示と上書き検知）。

## 同期ロジックの詳細

新規関数 `syncMasterDocumentsToChecklist(applicationId: string, applicantId: string, tenantId: string): Promise<void>` を`src/actions/applications.ts`に追加する。

- 案件のチェックリスト全件と、申請人マスターの`applicantDocuments`（`passport_data_page`/`residence_card_front`/`residence_card_back`）を取得
- 各チェックリスト項目について、`fileUrl`が`null`かつ上記マッチングルールに該当する場合のみ、対応するマスター書類でUPDATEする
- すでに`fileUrl`が設定されている項目（案件固有アップロード済み、または既にマスターから反映済み）はスキップする（冪等性のため、毎回の画面表示で不要な再書き込みを行わない）
- マスター側に対応する書類が存在しない場合は何もしない（既存の手動アップロード枠がそのまま使える）

呼び出し元（`src/app/(dashboard)/applications/[id]/page.tsx`）では、`getApplicationById`を呼ぶ前に`syncMasterDocumentsToChecklist`を実行してから取得することで、同一リクエスト内で最新の反映結果を表示する。

## 上書き・削除時の制御

- **案件側ドロップイン枠への新規アップロード**（`src/app/api/applications/[id]/checklist/[itemId]/document/route.ts`のPOSTハンドラ）: 既存の上書きロジックに加えて`fileSourcedFromMaster: false`を明示的に設定する（案件固有データとして確定し、以後のマスター同期で上書きされないようにする）
- **削除**（同ルートのDELETEハンドラ、および書類再分類時の旧項目クリア処理）: 既存のリセット処理（`fileUrl/fileName/fileSize/mimeType: null`, `status: "not_submitted"`）に加えて`fileSourcedFromMaster: false`を設定する。次回画面表示時、`syncMasterDocumentsToChecklist`が`fileUrl`が空であることを検知し、マスターに書類が依然存在すれば**再度自動反映する**（要件確認済みの仕様）

## UI変更

`src/components/applications/document-checklist.tsx`の`ChecklistDropzone`コンポーネントに、`fileSourcedFromMaster`が`true`の場合のみ「マスターから反映」バッジ（既存の緑色枠内、ファイル名リンクの隣に小さく表示）を追加する。サムネイル表示は元々実装されていないため変更不要。`DocumentLink`による閲覧動作（画像→モーダル、PDF→新規タブ）はそのまま動作する。

## ZIP・AI連携への影響

`fileUrl`/`fileName`/`fileSize`/`mimeType`/`additionalFiles`は通常の手動アップロードと全く同じカラムに書き込まれるため、`src/app/api/applications/[id]/submission-package/route.ts`（ZIP出力）と`src/actions/fill-all-fields.ts`（AI自動入力のソース）は**一切変更不要**でそのまま機能する。

## エラーハンドリング

`syncMasterDocumentsToChecklist`はベストエフォートの補助処理であり、失敗してもページ表示自体は妨げない。DB更新は既存のチェックリスト更新パターン（try/catchなしの単純なUPDATE）に準拠するが、呼び出し元（`page.tsx`）でこの関数呼び出し全体をtry/catchし、エラー時はログ出力のみでページ表示を継続する（マスター連携が使えなくても通常のチェックリスト機能は動作し続けるべきため）。

## テスト手順

1. 申請人マスターに「パスポート（顔写真ページ）」と「在留カード（表面）」「在留カード（裏面）」をアップロード済みの申請人で、新規案件を作成し、必要書類チェックリストに「パスポート（提示）」「在留カード」を追加する
2. 案件詳細画面を開き、両項目が初期状態から「アップロード済み（マスターから反映）」バッジ付きで自動的に埋まっていることを確認する
3. 「在留カード」項目のファイル名リンク（表面）をクリックして画像モーダルが開くこと、2枚目（裏面、`additionalFiles`）も同様に閲覧できることを確認する
4. 「扶養者の在留カード（表面）の写し」のような扶養者向け項目が自動反映されない（手動アップロード枠のままである）ことを確認する
5. 「提出用データ（一括）ダウンロード」を実行し、ZIP内にマスターから反映された両書類が正しく同梱されていることを確認する
6. 案件側の「在留カード」ドロップイン枠に別ファイルをドラッグ＆ドロップし、案件固有のファイルに上書きされ、バッジが消えることを確認する
7. 上書きしたファイルをゴミ箱ボタンで削除し、画面をリロードした際、マスターの書類が再度自動反映されることを確認する
8. `npm run build`でTypeScriptエラーなしを確認する

## スコープ外（将来拡張）

- 「在留カード（表面）」「在留カード（裏面）」が分割2項目として存在するケースへの個別マッチング（今回は単一項目を前提に実装。分割2項目の場合は各項目が「表面」「裏面」という語を含むため③のルールでそれぞれ独立してマッチするため、追加実装は不要だが、本番データでの確認は実装後に行う）
- `residence_card_renewal`（在留カード更新履歴）の自動連携
- 案件作成アクション（`createApplication`）自体への同期トリガー追加（チェックリスト項目がまだ存在しないため、詳細画面表示時の同期で実質的にカバーされる）
