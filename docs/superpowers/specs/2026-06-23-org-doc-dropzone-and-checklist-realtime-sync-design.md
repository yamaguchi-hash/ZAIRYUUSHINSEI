# 所属機関マスターのドロップイン化 ＋ チェックリスト追加時のリアルタイム自動反映 設計書

- 作成日: 2026-06-23
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

2つの独立したサブプロジェクトから構成される。それぞれ別タスクとして実装するが、設計書は1つにまとめる。

---

## タスク1：所属機関マスターの書類アップロードをドロップイン方式へ

### 背景・目的

所属機関マスター（[src/app/(dashboard)/organizations/[id]/page.tsx](../../../src/app/(dashboard)/organizations/[id]/page.tsx)）の書類管理パネルは現在クリック選択のみで、ドラッグ&ドロップに対応していない。既存の申請人マスター側（[src/components/applicants/document-upload-zone.tsx](../../../src/components/applicants/document-upload-zone.tsx)）にあるドラッグ&ドロップUIと同じ操作感・デザインを所属機関側にも適用する。

### 現状調査の要点

- `src/components/applicants/document-upload-zone.tsx`の`DocumentUploadZone`は、ドラッグ&ドロップ対応済みだが、`documentType`が`"passport_data_page" | "residence_card_front" | "residence_card_back"`の固定union型で、`saveApplicantDocument`/`deleteApplicantDocument`を直接ハードコード呼び出ししている。所属機関側で直接importして使うことはできない（型・保存先が異なる）。
- `src/components/organizations/organization-documents-panel.tsx`の`DocumentCategorySection`は、書類名テキスト入力＋`<label>`で囲んだ隠し`<input type="file">`のみ。`handleFileSelected(file)`関数は既に実装済みで、`saveOrganizationDocument`を呼び出す処理自体は変更不要。
- `src/actions/organization-documents.ts`の`saveOrganizationDocument`は、同一`(organizationId, visaType, documentName)`の既存レコードを削除してから新規挿入する「置き換え方式」のUpsertを既に実装済み。バックエンドの変更は不要。
- `src/components/applications/document-checklist.tsx`の`ChecklistDropzone`にも同様のドラッグ&ドロップ実装があるが、チェックリスト項目専用API（`/api/applications/[id]/checklist/[itemId]/document`）に強く結合しているため、これも直接流用はできない。

### 方針

ドラッグ&ドロップの**見た目・操作ロジック**（枠線のスタイル、`isDragging`状態、ホバー時の枠線色変化、クリックでの`<input>`起動、`onDrop`でのファイル取得）を、新規の共通プレゼンテーショナル（見た目のみを担当する）コンポーネント`FileDropzone`として切り出す。保存・削除などのデータ処理は呼び出し元に残し、`FileDropzone`は`onFile: (file: File) => void`のコールバックのみを受け取る。

### 新規コンポーネント: `FileDropzone`

- 配置: `src/components/ui/file-dropzone.tsx`
- Props: `label: string`、`description?: string`、`accept?: string`（デフォルトは既存の画像/PDF許可リストと同じ）、`isUploading: boolean`、`uploadingLabel?: string`、`onFile: (file: File) => void`、`className?: string`
- 内部: `useState`で`isDragging`を管理。`onDragOver`/`onDragLeave`/`onDrop`/クリックでの`<input type="file">`起動。ドラッグ中は枠線色が変わり「ここにドロップ」を表示する（`document-upload-zone.tsx`の既存ロジックをそのまま移植）。
- `DocumentUploadZone`（既存ファイル）の「未アップロード」分岐を`<FileDropzone>`の呼び出しに置き換える。`accept`は既存のデフォルト値をそのまま渡すため、既存3箇所の呼び出し元（`ocr-panel.tsx`）の見た目・動作は変化しない。

### `organization-documents-panel.tsx`の変更

1. **新規追加用ドロップゾーン**: 現在の`<label>`＋隠し`<input>`を`<FileDropzone>`に置き換える。`onFile`は既存の`handleFileSelected`を呼ぶ。書類名が未入力の場合のエラー処理は現状維持。
2. **既存書類行への直接ドロップで即上書き**: 既にアップロード済みの書類を表示する行（148〜172行目付近）に、同じ`onDragOver`/`onDragLeave`/`onDrop`のロジックを追加する。ドロップされたファイルは、その行の既存`doc.documentName`をそのまま使って`handleFileSelected`相当の処理（`saveOrganizationDocument`呼び出し）を実行し、`onAdded`で同名の既存エントリを置き換える。ドラッグ中は行の背景色が変わるなど、新規ドロップゾーンと一貫した視覚フィードバックを与える。既存の削除ボタンが`confirm()`による確認を行っていることと一貫させ、上書きも`confirm("「{ファイル名}」を新しいファイルに上書きしますか？")`相当の確認を経てから実行する（曖昧さを避けるため明示：確認なしの即時上書きは行わない）。

---

## タスク2：チェックリスト手動追加時のリアルタイム自動反映

### 背景・目的

申請案件の必要書類チェックリストに新しい項目を手動で追加した際、所属機関マスター・申請人マスターに既に登録済みの書類があれば、画面リロードなしで即座に自動反映されるようにする。

### 現状調査の要点

- `src/actions/applications.ts`の`addCustomDocumentToChecklist`（827行目〜）は、`applicationDocumentChecklist`に空の行（`fileUrl`等はすべて未設定）を1件INSERTするだけで、マスターとの照合は一切行っていない。
- マスター照合ロジックは既に2つの関数として実装済み：
  - `syncMasterDocumentsToChecklist`（208行目〜）: 申請人マスター（`applicantDocuments`、パスポート・在留カード）との照合。`matchMasterDocumentType`（[src/lib/master-document-matching.ts](../../../src/lib/master-document-matching.ts)）を使用。
  - `syncOrgMasterDocumentsToChecklist`（341行目〜）: 所属機関マスター（`organizationDocuments`）との照合。`matchChecklistItem`（[src/lib/document-classifier.ts](../../../src/lib/document-classifier.ts)）の表記揺れ対応キーワード部分一致（SYNONYM_GROUPS）を使用。
  - どちらも「チェックリスト内の未提出（`fileUrl`がnull）の全項目」をループして照合する設計で、**特定の1項目だけを対象にする引数は無い**。
- これら2関数は現在、[src/app/(dashboard)/applications/[id]/page.tsx](../../../src/app/(dashboard)/applications/[id]/page.tsx)の81・88行目で、ページの**読み込み時のみ**呼ばれている。手動追加時には呼ばれないため、次回リロードまで反映されない。
- フロント側（`document-checklist.tsx`の`handleAddCustomDoc`、631〜664行目）は、`addCustomDocumentToChecklist`の戻り値（`newItemId`のみ）を使って、ファイル情報が空のプレースホルダー行をローカルStateに追加している。

### 方針

新しい項目専用の照合APIを別途作るのではなく、**既存の2つの同期関数をそのまま再利用**する。`addCustomDocumentToChecklist`は新規行をINSERTした直後に、既存の`syncMasterDocumentsToChecklist`・`syncOrgMasterDocumentsToChecklist`を呼び出す（この2関数は「未提出の全項目」を対象にするため、たった今INSERTした新規行も対象に含まれる）。呼び出し後、新規行を再取得し、マッチ結果（あれば）を含めてアクションの戻り値に含める。

この方式により、表記揺れ対応のロジック（キーワード部分一致・SYNONYM_GROUPS）を一切複製せず、既存の検証済みコードを再利用できる。

### 実装詳細

**`addCustomDocumentToChecklist`の変更:**
- 戻り値の型に`item`（新規行の最新状態：`fileUrl`/`fileName`/`fileSize`/`mimeType`/`status`/`fileSourcedFromMaster`/`fileSourcedFromMasterType`を含む）を追加する。
- INSERT後、`await syncMasterDocumentsToChecklist(applicationId)`→`await syncOrgMasterDocumentsToChecklist(applicationId)`を順に呼ぶ（両関数とも例外を投げずベストエフォートで処理するため、追加処理自体の失敗リスクは増えない）。
- 新規行のIDで`applicationDocumentChecklist`を再取得し、`item`として返す。

**`document-checklist.tsx`の`handleAddCustomDoc`の変更:**
- これまで空のプレースホルダーを手組みしていた箇所を、アクションが返す`item`（マッチ結果が反映済みの最新状態）でそのまま`localChecklist`に追加するように変更する。
- マッチ済み（`fileSourcedFromMaster: true`）の場合、既存の`ChecklistDropzone`内のバッジ表示（「アップロード済み（所属機関マスターから反映）」等）が、新規追加した行にも自動的に表示される（既存のバッジ表示ロジックをそのまま再利用するため、追加の表示コードは不要）。

### 既知の副作用（許容する）

`syncMasterDocumentsToChecklist`・`syncOrgMasterDocumentsToChecklist`は「未提出の全項目」を対象にするため、新規追加した項目以外に、たまたま他の未提出項目も同時にマッチして更新される可能性がある。これは既存関数の元々の挙動であり、新規追加項目以外の項目についてはクライアント側のローカルStateには反映されない（次回リロードで反映される）。新規追加項目自体は今回の変更で確実にリアルタイム反映されるため、これを許容する。

---

## テスト手順

### タスク1
1. 所属機関マスター詳細ページを開き、書類名を入力した状態で、ファイルを「追加」枠にドラッグして枠に重ねる→枠線の色が変わることを確認する。
2. ファイルをドロップし、アップロードが成功し、ファイル名とプレビューリンクが表示されることを確認する。
3. 既にアップロード済みの書類行に、別のファイルを直接ドラッグ&ドロップする→確認ダイアログが表示され、OKすると上書きされて新しいファイル名がその場で表示されることを確認する。
4. クリックでのファイル選択（従来の方式）も引き続き動作することを確認する。
5. 申請人マスター側（OCRパネル）の既存のパスポート・在留カードアップロードが、今回の変更後も従来通り動作することを確認する（`DocumentUploadZone`のリファクタの回帰確認）。

### タスク2
1. 案件詳細ページで、所属機関マスターまたは申請人マスターに既に登録されている書類名（または表記揺れのある類似名、例:「登記事項証明書」⇔「履歴事項全部証明書」）を、チェックリストの「追加書類をチェックリストに追加」欄に入力して追加する。
2. 画面をリロードせずに、追加した行が即座に「アップロード済み（マスターから反映）」のバッジ付きで表示されることを確認する。
3. マスターに該当する書類が無い書類名を追加した場合は、従来通り空のプレースホルダー行として追加されることを確認する。
4. `npm run build`でTypeScriptエラーがないことを確認する。
