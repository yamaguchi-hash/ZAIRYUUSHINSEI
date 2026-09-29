# 所属機関マスター書類の必要書類チェックリスト自動連携 設計書

- 作成日: 2026-06-23
- 対象: 在留申請システム（zairyu-shinsei-system）
- ブランチ: feature/pdf-split-and-org-master

## 背景・目的

所属機関（受入企業）側が提出すべき書類（登記事項証明書、決算書、法定調書合計表、特定技能用の各種説明書等）を、案件ごとに毎回手動でアップロードしている。これらは多くの場合、所属機関マスターに一度登録すれば複数案件で再利用できるはずだが、現状【所属機関マスター】には書類保管機能が一切ない。本機能では、所属機関マスターに在留資格区分別・共通の書類を保存できるようにし、案件の必要書類チェックリストへ自動反映する。

直前に実装済みの「申請人マスター書類のチェックリスト自動連携」機能（`fileSourcedFromMaster`フラグ、`syncMasterDocumentsToChecklist`、`document-checklist.tsx`のバッジUI）と同じ設計思想・安全制御を踏襲し、所属機関側に拡張する。

## 現状調査の要点

- `organizationMaster`（`src/lib/db/schema.ts`）はメタデータのみのテーブルで、ファイル・書類カラムは一切存在しない。`applicantMaster`に対する`applicantDocuments`のような対になるテーブルも存在しない。
- 所属機関マスターの編集は`src/app/(dashboard)/organizations/`配下の一覧ページ内インライン編集（`add-organization-form.tsx`を`organization-list.tsx`から再利用）のみで、申請人マスターのような専用詳細ページ（`/applicants/[id]`相当）は存在しない。
- `documentRequirementMaster`（チェックリストの雛形マスター）は`visaType`（例: `"engineer_humanities"`, `"specified_skilled_worker_2"`）+ `applicationType`で書類を管理しており、これは`applications.visaType`と同じ粒度の文字列である。所属機関マスターの新規書類テーブルもこの`visaType`値をそのまま再利用できる。
- `document-classifier.ts`の`matchChecklistItem<T extends {id, documentName}>(name, checklist)`は、NFKC正規化＋同義語グループ（「登記事項証明書」「決算書」「雇用契約書」等、所属機関側書類の主要な同義語を既に含む）による汎用ファジーマッチング関数で、AI書類判別時のマッチングに使われている。これは入力名と任意のリストとの照合に使える汎用関数であり、所属機関マスターの書類名とチェックリスト項目のマッチングにそのまま再利用できる。
- `VISA_CATEGORY_NEEDS_ORG`（`src/lib/form-types.ts`）は、所属機関情報の記載が必要な在留資格カテゴリのみを管理する既存フラグ。
- 直前に実装済みの申請人マスター連携（`src/actions/applications.ts`の`syncMasterDocumentsToChecklist`、`src/lib/db/schema.ts`の`fileSourcedFromMaster`カラム、`src/app/api/applications/[id]/checklist/[itemId]/document/route.ts`のBlob誤削除防止ロジック、`document-checklist.tsx`のバッジUI）が確立済みの設計パターンとして存在する。

## アーキテクチャ概要

```
所属機関マスター詳細ページ（/organizations/[id]/page.tsx, 新規）
  └─ 在留資格区分（VISA_CATEGORY_NEEDS_ORGが必要とする区分のみ）ごとの書類アップロード欄
     ＋「共通書類（すべての在留資格に適用）」欄
  └─ organizationDocuments テーブルへ保存

申請案件詳細画面を開く（src/app/(dashboard)/applications/[id]/page.tsx）
  ↓
syncMasterDocumentsToChecklist(applicationId)       ← 既存（申請人マスター、変更なし）
syncOrgMasterDocumentsToChecklist(applicationId)    ← 新規（所属機関マスター）
  ├─ 案件の organizationId と visaType を取得
  ├─ organizationDocuments を取得（visaType一致 + 共通(visaType IS NULL)）
  ├─ 案件のチェックリストのうち未提出（fileUrl が null）の項目を対象に、
  │   matchChecklistItem() で書類名をマッチング（専用書類を共通書類より優先）
  └─ マッチした項目に UPDATE で fileUrl/fileName/fileSize/mimeType +
      fileSourcedFromMaster=true, fileSourcedFromMasterType='organization',
      status="submitted", submittedAt=now を書き込み
  ↓
getApplicationById(applicationId)  ← 既存の読み取り専用関数（変更なし）
  ↓
DocumentChecklist コンポーネント（バッジ表示・閲覧・ZIP同梱は既存ロジックがそのまま動作）
```

## データモデル変更

### 新規テーブル: `organizationDocuments`

`applicantDocuments`と対になる、所属機関マスターの書類保存テーブル。

```ts
export const organizationDocuments = pgTable("organization_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizationMaster.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  // null = 共通書類（すべての在留資格に適用）。値がある場合は applications.visaType /
  // documentRequirementMaster.visaType と同じ粒度の文字列（例: "engineer_humanities"）。
  visaType: text("visa_type"),
  documentName: text("document_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
```

`documentName`は固定enumではなく自由入力（または定型文言から選択）のテキストとし、`matchChecklistItem()`による名前ベースのファジーマッチングでチェックリスト項目と結びつける。同一`(organizationId, visaType, documentName)`の組について、新規アップロードは既存レコードを上書き（旧ファイルは削除）するUpsert方式とする（`applicantDocuments`の「同タイプは1件のみ保持」という既存方式に合わせる）。

### `applicationDocumentChecklist`への追加カラム

```ts
fileSourcedFromMasterType: text("file_sourced_from_master_type"), // 'applicant' | 'organization' | null
```

既存の`fileSourcedFromMaster: boolean`は「ファイルがいずれかのマスターから反映されたものか」を表す判定（Blob誤削除防止等の安全制御に使用）としてそのまま維持し、変更しない。新規の`fileSourcedFromMasterType`は「どちらのマスターから反映されたか」を表す付加情報としてのみ使い、UIのバッジ文言を区別する。既存の申請人マスター同期関数（`syncMasterDocumentsToChecklist`）も本対応時に合わせて更新し、`fileSourcedFromMasterType='applicant'`を設定するようにする。

## マッチング・優先順位ロジック

新規ファイル`src/lib/org-document-matching.ts`は作らず、既存の`src/lib/document-classifier.ts`の`matchChecklistItem<T extends {id, documentName}>(name, candidates)`を直接インポートして使う（新規の固定enumマッチャーは作らない）。この関数は「名前」と「候補リスト」を受け取り、候補リストを**先頭から順に**走査して最初に一致したものを返す（完全一致・包含関係・同義語グループのいずれか）。

1. 案件の`organizationId`・`visaType`を取得
2. `organizationDocuments`から、`organizationId`一致かつ（`visaType`が案件と一致 または `visaType IS NULL`）のレコードを取得
3. 取得したレコードを「専用書類（visaType一致）を先頭、共通書類（visaType IS NULL）を後方」の順に並べた候補リスト`prioritizedOrgDocs`を作る（`matchChecklistItem`が先頭優先で走査するため、この並び順だけで優先順位が実現できる）
4. 未提出（`fileUrl`がnull）のチェックリスト項目それぞれについて、`matchChecklistItem(checklistItem.documentName, prioritizedOrgDocs)`を呼び、一致した`organizationDocuments`レコードがあればそのファイルを反映する。これは既存の`syncMasterDocumentsToChecklist`が「チェックリスト項目を主語にして、それぞれに合うマスター書類を探す」という走査方向と一致しており、設計として整合する。

## UI変更

### 新規ページ: `src/app/(dashboard)/organizations/[id]/page.tsx`

申請人マスターの`/applicants/[id]/page.tsx` + `ocr-panel.tsx`と同様の構成。所属機関一覧（`organization-list.tsx`）の各行に「書類管理」リンクを追加し、このページへ遷移する。

- 「共通書類（すべての在留資格に適用）」セクション
- `VISA_CATEGORY_NEEDS_ORG`が`true`を返す在留資格区分ごとのセクション（区分名は`VISA_TYPE_LABELS`から取得）
- 各セクション内に、書類名（自由入力 or 定型リストから選択）＋ファイルアップロードのドロップゾーンを複数件登録できるUI
- 既存の`applicantMaster`書類アップロードAPI（`src/actions/ocr.ts`等）と同様の保存方式（Vercel Blob、ファイル名自動生成）を踏襲

### `document-checklist.tsx`のバッジ文言

既存の`fileSourcedFromMaster`バッジ表示を、新規の`fileSourcedFromMasterType`に応じて文言を分岐させる。
- `'applicant'` → 「アップロード済み（申請人マスターから反映）」
- `'organization'` → 「アップロード済み（所属機関マスターから反映）」
- 値なし（既存データ等） → 既存の汎用文言「マスターから反映」をフォールバック表示

閲覧（`DocumentLink`による画像モーダル/PDF新規タブ）・サムネイル非表示の既存仕様は変更なし。

## 上書き・削除時の制御

申請人マスター連携と完全に同じ仕組みを継承する。

- 案件側ドロップイン枠への新規アップロード: `fileSourcedFromMaster: false`, `fileSourcedFromMasterType: null`を設定（案件固有データとして確定）
- 削除: 既存のリセット処理に加え`fileSourcedFromMasterType: null`を設定。`fileSourcedFromMaster`が`true`だった場合はBlob物理削除をスキップする既存ロジックをそのまま適用（所属機関マスター由来のファイルも、削除時に所属機関マスター側の書類を破壊してはならないため）
- 次回画面表示時、両方の同期関数（申請人・所属機関）が`fileUrl`が空であることを検知し、対応するマスターに書類が依然存在すれば再度自動反映する

## ZIP・閲覧への影響

`fileUrl`/`fileName`/`fileSize`/`mimeType`は既存の同じカラムに書き込まれるため、`submission-package`（ZIP出力）・`DocumentLink`（閲覧）は一切変更不要でそのまま機能する。

## エラーハンドリング

`syncOrgMasterDocumentsToChecklist`は`syncMasterDocumentsToChecklist`と同じく、ベストエフォートの補助処理とする。失敗時は`console.error`にログを残しつつ例外を投げず、呼び出し元（`page.tsx`）でもtry/catchで保護し、ページ表示自体を妨げない。

## テスト手順

1. 所属機関マスター詳細ページで、「共通書類」に「登記事項証明書」を、「技術・人文知識・国際業務」区分に「直近の決算書」を、それぞれアップロードする
2. その所属機関に紐づく技人国の案件のチェックリストに「登記事項証明書（商業・法人登記）」「直近の年度の決算文書の写し」を追加し、案件詳細画面を開く
3. 両項目が「アップロード済み（所属機関マスターから反映）」バッジ付きで自動的に埋まっていることを確認する
4. 同一所属機関の別の特定技能案件を開き、技人国専用に登録した決算書は反映されず、共通書類（登記事項証明書）のみ反映されることを確認する
5. 「共通書類」と「特定技能専用書類」の両方に同名の書類（例: 登記事項証明書）を登録し、特定技能案件では専用書類が優先して反映されることを確認する
6. ファイル名リンクをクリックして画像モーダル/PDF新規タブの閲覧動作を確認する
7. 「提出用データ（一括）ダウンロード」を実行し、ZIP内に所属機関マスターから反映された書類が正しく同梱されていることを確認する
8. 案件側のドロップイン枠に別ファイルをアップロードして上書きされバッジが消えること、削除後の再表示でマスターから再反映されることを確認する
9. `npm run build`でTypeScriptエラーなしを確認する

## スコープ外（将来拡張）

- 所属機関マスター書類の自由入力書類名に対する入力支援（候補リストのサジェスト等）の高度化
- 所属機関の登録時点（作成時）への同期トリガー追加（チェックリスト項目がまだ存在しないため、案件詳細画面表示時の同期で実質的にカバーされる）
- `documentRequirementMaster`と`organizationDocuments`の書類名候補の一元管理（現状は別々の自由入力/定型リストとして扱う）
