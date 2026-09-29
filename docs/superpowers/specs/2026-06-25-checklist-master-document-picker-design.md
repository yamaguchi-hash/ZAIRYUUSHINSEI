# 必要書類チェックリストのマスター書類選択機能 設計書

- 作成日: 2026-06-25
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

必要書類チェックリストの各項目には、現在「新規ファイルをアップロード（ドラッグ&ドロップ／クリック）」する手段のみがある。申請人マスター・所属機関マスター・扶養者（申請人マスターを参照する人物）には既に書類がアップロードされている場合があり、それらを選び直してアップロードする手間を省きたい。

既に「自動同期」機能（`syncMasterDocumentsToChecklist`／`syncOrgMasterDocumentsToChecklist`、書類名のあいまい一致による自動反映）は存在するが、これは申請読み込み時の自動処理であり、ユーザーが手動で選び直す手段ではない。本機能は、ユーザーが明示的に「マスターから選択」できる手動UIを追加する。

## 対象書類の取得元（3種類）

| 取得元 | テーブル | 検索キー | 備考 |
|---|---|---|---|
| 申請人マスター | `applicantDocuments` | `applicantId = application.applicantId` | パスポート・在留カード表裏など固定enum |
| 所属機関マスター | `organizationDocuments` | `organizationId = application.organizationId` | `organizationId`が未設定の申請では非表示 |
| 扶養者 | `applicantDocuments` | `applicantId = application.supporterId` | `supporterId`が未設定の申請では非表示。新規テーブルは作らない（扶養者は申請人マスターの1行であるため） |

## UI

チェックリストの1枚目用（`ChecklistDropzone`）・2枚目以降用（`ExtraFilesSection`）の両方に「マスターから選択」ボタンを追加する。新規アップロード（ドロップイン）と並列の選択肢として表示する。

クリックすると、利用可能な書類を取得元別（申請人／所属機関／扶養者）にグループ化した一覧が展開する。各行にファイル名・取得元バッジ・「この書類を使用」ボタンを表示する。取得元が0件のグループは表示しない。

「この書類を使用」をクリックすると、既存のBlob URLをそのまま参照する形でチェックリスト項目（1枚目の場合は`fileUrl`等、2枚目以降の場合は`additionalFiles`配列への追加）に反映する。ファイルの複製は行わない。

## データの扱い

- 既存の`fileSourcedFromMaster`（boolean）・`fileSourcedFromMasterType`（text、現在`'applicant'|'organization'|null`）の仕組みをそのまま使う。`fileSourcedFromMasterType`に新たに`'supporter'`を追加する（既存カラムは`text()`型のためスキーマ変更は不要）。
- `additionalFiles`配列内の各要素（`ExtraFile`型）にも、既存の`sourcedFromMaster?: boolean`に加えて`sourcedFromMasterType?: 'applicant'|'organization'|'supporter'`を追加する。
- `document-checklist.tsx`のバッジ表示ロジックを拡張し、`'supporter'`の場合は「アップロード済み（扶養者マスターから反映）」と表示する。
- マスターから反映されたファイルは、既存の削除ロジック（`sourcedFromMaster`がtrueの場合はBlobを削除しない）にそのまま従う。

## 新規サーバーアクション

- `getAvailableMasterDocumentsForApplication(applicationId: string)`: 3種類の取得元から利用可能な書類一覧をまとめて返す（`{ applicant: [...], organization: [...], supporter: [...] }`）。`organizationId`/`supporterId`が未設定の場合はそれぞれ空配列を返す。
- `useMasterDocumentForChecklistItem(applicationId: string, itemId: string, source: 'applicant'|'organization'|'supporter', masterDocumentId: string, slot: 'primary'|'extra')`: 選択した書類をチェックリスト項目に反映する。`slot==='primary'`の場合は`fileUrl`等を直接更新、`slot==='extra'`の場合は`additionalFiles`配列に追加する。

## 影響範囲・スコープ外

- 既存の自動同期機能（`syncMasterDocumentsToChecklist`／`syncOrgMasterDocumentsToChecklist`）は変更しない。本機能は手動選択の追加であり、自動同期と共存する。
- マスター側（`applicantDocuments`／`organizationDocuments`）のアップロード機能自体は変更しない。
- ファイルの複製・別保存は行わない（既存のBlob URLをそのまま参照する）。

## テスト手順

1. 所属機関マスター・扶養者（`supporterId`）の両方が設定された申請でチェックリストの「マスターから選択」を開き、3種類の取得元がそれぞれグループ表示されることを確認する。
2. `organizationId`未設定の申請では、所属機関グループが表示されないことを確認する。
3. `supporterId`未設定の申請では、扶養者グループが表示されないことを確認する。
4. 申請人マスターの書類を1枚目に反映し、「アップロード済み（申請人マスターから反映）」バッジが表示されることを確認する。
5. 扶養者の書類を2枚目以降に追加し、「（扶養者マスターから反映）」バッジが表示されることを確認する。
6. マスターから反映した書類を削除しても、元のマスター側のBlobファイルが削除されないことを確認する（既存の`sourcedFromMaster`保護ロジックの回帰確認）。
7. 既存の新規アップロード（ドロップイン）が従来通り動作することを確認する（回帰確認）。
8. `npx tsc --noEmit`・`npm run build`でエラーがないことを確認する。
