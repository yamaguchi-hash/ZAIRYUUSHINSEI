# 申請人マスター書類のチェックリスト自動連携 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 申請人マスター（`applicantDocuments`）に登録済みのパスポート・在留カードを、申請案件詳細画面を開いた際に必要書類チェックリストへ自動的に反映し、手動アップロードの手間を省く。

**Architecture:** 案件詳細ページのサーバーコンポーネントが`getApplicationById`の前に新規アクション`syncMasterDocumentsToChecklist`を呼び、チェックリストのうち未提出（`fileUrl`がnull）かつパスポート/在留カードに一致する項目へ、マスターのファイル参照（URL文字列）を書き込み同期する。新規`fileSourcedFromMaster`フラグで「マスターから反映」か「案件固有アップロード」かを区別し、UI・上書き・削除制御に使う。

**Tech Stack:** Next.js 16 (App Router) / TypeScript / Drizzle ORM + Neon Postgres / Vercel Blob

**参照仕様書:** `docs/superpowers/specs/2026-06-22-master-document-checklist-sync-design.md`

**検証方法について:** このプロジェクトには自動テストランナーが設定されていないため、各タスクの「テスト」は `npm run build` と最終タスクでの手動機能確認に置き換える。

---

### Task 1: applicationDocumentChecklistにfileSourcedFromMasterカラムを追加

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: スキーマにカラムを追加**

`src/lib/db/schema.ts` の `applicationDocumentChecklist` テーブル定義内、`expertNotes: text("expert_notes"),` の行の直後に追加する。

変更前:
```typescript
  additionalFiles: jsonb("additional_files").$type<Array<{
    fileUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }>>(),
  expertNotes: text("expert_notes"),
  submittedAt: timestamp("submitted_at"),
```

変更後:
```typescript
  additionalFiles: jsonb("additional_files").$type<Array<{
    fileUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }>>(),
  expertNotes: text("expert_notes"),
  // 現在のfileUrl/additionalFilesが申請人マスター（applicantDocuments）から
  // 自動反映されたものかどうか。trueの場合、マスター同期処理が再度上書きしてよい。
  fileSourcedFromMaster: boolean("file_sourced_from_master").default(false).notNull(),
  submittedAt: timestamp("submitted_at"),
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: DBマイグレーション実行**

`drizzle-kit push` はこの開発環境でハングする既知の問題があるため、`@neondatabase/serverless` の `neon()`（HTTP方式）を直接使うスクリプトでカラムを追加する。`.env.local` の `DATABASE_URL` はダブルクォートで囲まれており、かつ `channel_binding` パラメータが `neon()` で非対応のため、両方を除去してから接続する。

`scripts/add-file-sourced-from-master.cjs` を作成:

```javascript
/**
 * application_document_checklist.file_sourced_from_master カラム追加スクリプト
 * （一時使用・実行後に削除）
 */
const { neon } = require("@neondatabase/serverless");
const { readFileSync } = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf8");

const urlLine = envContent.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!urlLine) throw new Error("DATABASE_URL not found in .env.local");
let dbUrl = urlLine.slice("DATABASE_URL=".length).trim().replace(/\r/g, "");
dbUrl = dbUrl.replace(/&channel_binding=[^&]*/g, "").replace(/\?channel_binding=[^&]*/g, "");
dbUrl = dbUrl.replace(/^["']|["']$/g, "");

async function main() {
  const sql = neon(dbUrl);

  console.log("ALTER TABLE application_document_checklist ADD COLUMN IF NOT EXISTS file_sourced_from_master boolean NOT NULL DEFAULT false を実行中...");
  await sql`ALTER TABLE application_document_checklist ADD COLUMN IF NOT EXISTS file_sourced_from_master boolean NOT NULL DEFAULT false`;
  console.log("完了: file_sourced_from_master カラムを追加しました。");

  const check = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'application_document_checklist' AND column_name = 'file_sourced_from_master'
  `;
  if (check.length === 1) {
    console.log("✓ カラムが正常に追加されていることを確認しました:", check[0]);
  } else {
    console.error("✗ カラムが見つかりません。手動で確認してください。");
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
```

- [ ] **Step 4: スクリプトを実行**

Run: `node scripts/add-file-sourced-from-master.cjs`
Expected: `完了: file_sourced_from_master カラムを追加しました。` および `✓ カラムが正常に追加されていることを確認しました` が出力される

- [ ] **Step 5: スクリプトを削除**

```bash
rm scripts/add-file-sourced-from-master.cjs
```

- [ ] **Step 6: コミット**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: applicationDocumentChecklistにfileSourcedFromMasterカラムを追加

申請人マスター書類からの自動反映かどうかを区別するためのboolean列。
DB側もALTER TABLE実行済み（デフォルトfalse・NOT NULL）。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## IMPORTANT: Pre-existing unrelated changes — DO NOT TOUCH（全タスク共通）

作業ディレクトリには本作業と無関係な未コミット変更が存在する場合がある:
- `src/app/print/[id]/shinsei-applicant/page.tsx`
- `src/app/print/[id]/shinsei-shared.tsx`
- `dev.log`, `dev-test.log`

**これらのファイルは一切ステージ・コミットしないこと。** コミット時は必ず対象ファイルのみを明示的に`git add`し、`git add -A`や`git add .`は使用しないこと。

---

### Task 2: マッチング判定ロジックを新規作成

**Files:**
- Create: `src/lib/master-document-matching.ts`

- [ ] **Step 1: 新規ファイルを作成**

```typescript
/**
 * 必要書類チェックリスト項目のdocumentNameから、申請人マスター書類
 * （パスポート・在留カード）との連携対象かどうかを判定する純粋関数。
 * DBアクセスは行わない（呼び出し元がマスター書類の有無を別途確認する）。
 */

const NORMALIZE_STRIP = /[\s　・,、.。/\\()（）【】「」『』〔〕\[\]:：\-－]/g;

function normalize(s: string): string {
  return s.normalize("NFKC").replace(NORMALIZE_STRIP, "");
}

export type MasterDocumentMatch =
  | { kind: "passport" }
  | { kind: "residence_card_front" }
  | { kind: "residence_card_back" }
  | { kind: "residence_card_both" };

/**
 * チェックリスト項目のdocumentNameを判定する。
 * - 「扶養者」を含む項目（申請人本人ではない別人の書類）は対象外（null）
 * - 「パスポート」「旅券」を含む → passport
 * - 「在留カード」を含み「表面」のみ → residence_card_front
 * - 「在留カード」を含み「裏面」のみ → residence_card_back
 * - 「在留カード」を含み表面・裏面の区別がない（単一項目） → residence_card_both
 *   （表面をメインファイル、裏面を additionalFiles として反映する想定）
 */
export function matchMasterDocumentType(documentName: string): MasterDocumentMatch | null {
  const n = normalize(documentName);
  if (!n) return null;
  if (n.includes(normalize("扶養者"))) return null;

  if (n.includes(normalize("パスポート")) || n.includes(normalize("旅券"))) {
    return { kind: "passport" };
  }

  if (n.includes(normalize("在留カード"))) {
    const hasFront = n.includes(normalize("表面"));
    const hasBack = n.includes(normalize("裏面"));
    if (hasFront && !hasBack) return { kind: "residence_card_front" };
    if (hasBack && !hasFront) return { kind: "residence_card_back" };
    return { kind: "residence_card_both" };
  }

  return null;
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/lib/master-document-matching.ts
git commit -m "feat: チェックリスト項目とマスター書類のマッチング判定ロジックを追加

パスポート/在留カード（表面・裏面・単一項目）を判定する純粋関数。
「扶養者」を含む項目は別人の書類のため明示的に除外する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: syncMasterDocumentsToChecklistアクションを新規作成し、getApplicationByIdを拡張

**Files:**
- Modify: `src/actions/applications.ts`

- [ ] **Step 1: importにapplicantDocumentsとmatchMasterDocumentTypeを追加**

ファイル先頭のimport群を確認し、`applicantDocuments`が`@/lib/db/schema`からまだimportされていなければ追加する。

変更前（12-15行目付近）:
```typescript
import {
  applications,
  applicantMaster,
  organizationMaster,
  applicationDocumentChecklist,
  documentRequirementMaster,
  applicationSnapshots,
  auditLog,
  applicantDocuments,
} from "@/lib/db/schema";
```

（すでに `applicantDocuments` がある場合はこのステップは不要。なければ追加する。）

ファイル先頭に以下のimportを追加する:
```typescript
import { matchMasterDocumentType } from "@/lib/master-document-matching";
```

- [ ] **Step 2: getApplicationByIdのSELECTとマッピングにfileSourcedFromMasterを追加**

変更前（`rawChecklist`の明示的SELECT部分）:
```typescript
  const rawChecklist = await db
    .select({
      id:                    applicationDocumentChecklist.id,
      applicationId:         applicationDocumentChecklist.applicationId,
      documentRequirementId: applicationDocumentChecklist.documentRequirementId,
      documentName:          applicationDocumentChecklist.documentName,
      isRequiredByExpert:    applicationDocumentChecklist.isRequiredByExpert,
      status:                applicationDocumentChecklist.status,
      fileUrl:               applicationDocumentChecklist.fileUrl,
      fileName:              applicationDocumentChecklist.fileName,
      fileSize:              applicationDocumentChecklist.fileSize,
      mimeType:              applicationDocumentChecklist.mimeType,
      additionalFiles:       applicationDocumentChecklist.additionalFiles,
      ocrExtractedData:      applicationDocumentChecklist.ocrExtractedData,
      expertNotes:           applicationDocumentChecklist.expertNotes,
      submittedAt:           applicationDocumentChecklist.submittedAt,
      createdAt:             applicationDocumentChecklist.createdAt,
    })
    .from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id))
    .orderBy(applicationDocumentChecklist.createdAt);
```

変更後:
```typescript
  const rawChecklist = await db
    .select({
      id:                    applicationDocumentChecklist.id,
      applicationId:         applicationDocumentChecklist.applicationId,
      documentRequirementId: applicationDocumentChecklist.documentRequirementId,
      documentName:          applicationDocumentChecklist.documentName,
      isRequiredByExpert:    applicationDocumentChecklist.isRequiredByExpert,
      status:                applicationDocumentChecklist.status,
      fileUrl:               applicationDocumentChecklist.fileUrl,
      fileName:              applicationDocumentChecklist.fileName,
      fileSize:              applicationDocumentChecklist.fileSize,
      mimeType:              applicationDocumentChecklist.mimeType,
      additionalFiles:       applicationDocumentChecklist.additionalFiles,
      ocrExtractedData:      applicationDocumentChecklist.ocrExtractedData,
      expertNotes:           applicationDocumentChecklist.expertNotes,
      fileSourcedFromMaster: applicationDocumentChecklist.fileSourcedFromMaster,
      submittedAt:           applicationDocumentChecklist.submittedAt,
      createdAt:             applicationDocumentChecklist.createdAt,
    })
    .from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id))
    .orderBy(applicationDocumentChecklist.createdAt);
```

変更前（`checklist`マッピングの`expertNotes`行付近）:
```typescript
    additionalFiles: (item.additionalFiles ?? null) as Array<{ fileUrl: string; fileName: string; fileSize: number; mimeType: string }> | null,
    expertNotes: item.expertNotes ?? null,
```

変更後:
```typescript
    additionalFiles: (item.additionalFiles ?? null) as Array<{ fileUrl: string; fileName: string; fileSize: number; mimeType: string }> | null,
    expertNotes: item.expertNotes ?? null,
    fileSourcedFromMaster: item.fileSourcedFromMaster,
```

- [ ] **Step 3: syncMasterDocumentsToChecklistアクションを追加**

`getApplicationById`関数の閉じ括弧（`return { application, applicant, organization, checklist };` の直後の `}`）の直後に、新規関数を追加する。

```typescript

/**
 * 申請人マスター（applicantDocuments）に登録済みのパスポート・在留カードを、
 * 案件の必要書類チェックリストへ自動反映する（書き込み同期）。
 * - チェックリスト項目のfileUrlがnull（未提出）かつマッチ対象の場合のみ反映する
 * - 既にfileUrlが設定されている項目（案件固有アップロード済み or 既に反映済み）は変更しない
 * - マスターに対応する書類が存在しない場合は何もしない
 * - ベストエフォート処理: 失敗してもページ表示を妨げないよう例外を投げない
 */
export async function syncMasterDocumentsToChecklist(applicationId: string): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) return;
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [application] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!application) return;

    const checklistItems = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));

    const unsynced = checklistItems.filter((item) => !item.fileUrl);
    if (unsynced.length === 0) return;

    const masterDocs = await db
      .select()
      .from(applicantDocuments)
      .where(and(
        eq(applicantDocuments.applicantId, application.applicantId),
        eq(applicantDocuments.tenantId, tenantId),
      ));

    const passportDoc = masterDocs.find((d) => d.documentType === "passport_data_page") ?? null;
    const frontDoc = masterDocs.find((d) => d.documentType === "residence_card_front") ?? null;
    const backDoc = masterDocs.find((d) => d.documentType === "residence_card_back") ?? null;

    const updates: Promise<unknown>[] = [];

    for (const item of unsynced) {
      const match = matchMasterDocumentType(item.documentName);
      if (!match) continue;

      if (match.kind === "passport" && passportDoc) {
        updates.push(
          db.update(applicationDocumentChecklist)
            .set({
              fileUrl: passportDoc.fileUrl,
              fileName: passportDoc.fileName,
              fileSize: passportDoc.fileSize,
              mimeType: passportDoc.mimeType,
              fileSourcedFromMaster: true,
              status: "submitted",
              submittedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(applicationDocumentChecklist.id, item.id))
        );
      } else if (match.kind === "residence_card_front" && frontDoc) {
        updates.push(
          db.update(applicationDocumentChecklist)
            .set({
              fileUrl: frontDoc.fileUrl,
              fileName: frontDoc.fileName,
              fileSize: frontDoc.fileSize,
              mimeType: frontDoc.mimeType,
              fileSourcedFromMaster: true,
              status: "submitted",
              submittedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(applicationDocumentChecklist.id, item.id))
        );
      } else if (match.kind === "residence_card_back" && backDoc) {
        updates.push(
          db.update(applicationDocumentChecklist)
            .set({
              fileUrl: backDoc.fileUrl,
              fileName: backDoc.fileName,
              fileSize: backDoc.fileSize,
              mimeType: backDoc.mimeType,
              fileSourcedFromMaster: true,
              status: "submitted",
              submittedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(applicationDocumentChecklist.id, item.id))
        );
      } else if (match.kind === "residence_card_both" && frontDoc) {
        updates.push(
          db.update(applicationDocumentChecklist)
            .set({
              fileUrl: frontDoc.fileUrl,
              fileName: frontDoc.fileName,
              fileSize: frontDoc.fileSize,
              mimeType: frontDoc.mimeType,
              ...(backDoc ? {
                additionalFiles: [{
                  fileUrl: backDoc.fileUrl,
                  fileName: backDoc.fileName,
                  fileSize: backDoc.fileSize ?? 0,
                  mimeType: backDoc.mimeType ?? "",
                }],
              } : {}),
              fileSourcedFromMaster: true,
              status: "submitted",
              submittedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(applicationDocumentChecklist.id, item.id))
        );
      }
    }

    if (updates.length === 0) return;
    await Promise.all(updates);
    revalidatePath(`/applications/${applicationId}`);
  } catch (err: any) {
    console.error("[syncMasterDocumentsToChecklist] error:", err?.message);
    // ベストエフォート処理のため、エラーはログのみで握る（呼び出し元はページ表示を継続する）
  }
}
```

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add src/actions/applications.ts
git commit -m "feat: syncMasterDocumentsToChecklistアクションを追加

申請人マスターのパスポート・在留カードをチェックリスト未提出項目へ
書き込み同期する。getApplicationByIdにfileSourcedFromMasterも追加。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: applications/[id]/page.tsxに同期呼び出しを配線

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/page.tsx`

- [ ] **Step 1: importにsyncMasterDocumentsToChecklistを追加**

変更前:
```typescript
import { getApplicationById } from "@/actions/applications";
```

変更後:
```typescript
import { getApplicationById, syncMasterDocumentsToChecklist } from "@/actions/applications";
```

- [ ] **Step 2: getApplicationByIdの直前に同期呼び出しを追加**

変更前:
```typescript
  let data;
  try {
    data = await getApplicationById(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] getApplicationById failed:", e);
    notFound();
  }
```

変更後:
```typescript
  try {
    await syncMasterDocumentsToChecklist(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] syncMasterDocumentsToChecklist failed:", e);
    // マスター連携に失敗してもページ表示は継続する
  }

  let data;
  try {
    data = await getApplicationById(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] getApplicationById failed:", e);
    notFound();
  }
```

（`syncMasterDocumentsToChecklist`自体は内部でtry/catchして例外を投げない設計だが、呼び出し側でも二重に保護しておく。）

- [ ] **Step 3: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 4: コミット**

```bash
git add "src/app/(dashboard)/applications/[id]/page.tsx"
git commit -m "feat: 案件詳細画面表示時にsyncMasterDocumentsToChecklistを実行

getApplicationByIdの直前に呼ぶことで、同一リクエスト内で
マスターからの自動反映結果を表示できるようにする。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: チェックリスト個別アップロードAPIでfileSourcedFromMasterを制御

**Files:**
- Modify: `src/app/api/applications/[id]/checklist/[itemId]/document/route.ts`

**Step 1: POSTハンドラ（⑥チェックリスト項目を更新）でfalseに設定**

案件固有の新規アップロードは常に「マスターからの反映」ではなくなるため、明示的にfalseを設定する。

変更前:
```typescript
    // ── ⑥ チェックリスト項目を更新（targetItemId = AI一致先 or ドロップ先） ────
    const [updated] = await db.update(applicationDocumentChecklist)
      .set({
        fileUrl,
        fileName,
        fileSize: file.size,
        mimeType,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, targetItemId))
      .returning();
```

変更後:
```typescript
    // ── ⑥ チェックリスト項目を更新（targetItemId = AI一致先 or ドロップ先） ────
    // 案件固有のアップロードのため、マスター反映フラグは明示的にfalseへ戻す
    const [updated] = await db.update(applicationDocumentChecklist)
      .set({
        fileUrl,
        fileName,
        fileSize: file.size,
        mimeType,
        fileSourcedFromMaster: false,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, targetItemId))
      .returning();
```

**Step 2: DELETEハンドラで「マスターから反映されたファイルの場合はBlob削除をスキップ」する**

**重要**: 現在のDELETEハンドラは、Vercel Blob上の実ファイルを`del(item.fileUrl)`で物理削除している。マスターから反映されたファイルのURLは、申請人マスター側の`applicantDocuments`テーブルの行が**今も同じURLを参照している**ため、ここでBlobを物理削除すると、マスター側の書類閲覧も同時に壊れてしまう。マスターから反映されたファイルの場合は、チェックリスト側の参照（DBのfileUrl等のカラム）だけをクリアし、Blob自体は削除してはならない。

変更前:
```typescript
  try {
    const [item] = await db.select().from(applicationDocumentChecklist)
      .where(and(
        eq(applicationDocumentChecklist.id, itemId),
        eq(applicationDocumentChecklist.applicationId, applicationId),
      )).limit(1);
    if (!item) {
      return NextResponse.json({ error: "チェックリスト項目が見つかりません" }, { status: 404 });
    }

    if (item.fileUrl && process.env.BLOB_READ_WRITE_TOKEN && item.fileUrl.startsWith("https://")) {
      try { await del(item.fileUrl); } catch (e) {
        console.warn("[checklist document DELETE] blob del failed:", e);
      }
    }

    await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));

    revalidatePath(`/applications/${applicationId}`);
    return NextResponse.json({ success: true });
```

変更後:
```typescript
  try {
    const [item] = await db.select().from(applicationDocumentChecklist)
      .where(and(
        eq(applicationDocumentChecklist.id, itemId),
        eq(applicationDocumentChecklist.applicationId, applicationId),
      )).limit(1);
    if (!item) {
      return NextResponse.json({ error: "チェックリスト項目が見つかりません" }, { status: 404 });
    }

    // マスターから反映されたファイルは申請人マスター側も同じURLを参照しているため、
    // Blob自体は削除せずチェックリスト側の参照のみクリアする。
    if (
      !item.fileSourcedFromMaster &&
      item.fileUrl && process.env.BLOB_READ_WRITE_TOKEN && item.fileUrl.startsWith("https://")
    ) {
      try { await del(item.fileUrl); } catch (e) {
        console.warn("[checklist document DELETE] blob del failed:", e);
      }
    }

    await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
        fileSourcedFromMaster: false,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));

    revalidatePath(`/applications/${applicationId}`);
    return NextResponse.json({ success: true });
```

**Step 3: PATCHハンドラ（再分類）でフラグを引き継ぐ**

移動先には移動元の`fileSourcedFromMaster`を引き継ぎ、移動元は他のフィールドと同様にfalseへリセットする。

変更前（移動先の更新）:
```typescript
    const [updatedTarget] = await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: sourceItem.fileUrl,
        fileName: newFileName,
        fileSize: sourceItem.fileSize,
        mimeType: sourceItem.mimeType,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, targetItemId))
      .returning();

    await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));
```

変更後:
```typescript
    const [updatedTarget] = await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: sourceItem.fileUrl,
        fileName: newFileName,
        fileSize: sourceItem.fileSize,
        mimeType: sourceItem.mimeType,
        fileSourcedFromMaster: sourceItem.fileSourcedFromMaster,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, targetItemId))
      .returning();

    await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
        fileSourcedFromMaster: false,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));
```

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add src/app/api/applications/[id]/checklist/[itemId]/document/route.ts
git commit -m "fix: チェックリスト削除時にマスター反映ファイルのBlobを誤って物理削除しないよう修正

マスターから反映されたfileUrlは申請人マスター側も同じBlobを参照しているため、
DELETE時にfileSourcedFromMasterがtrueの場合はBlob削除をスキップし、
チェックリスト側の参照のみクリアする。POST/PATCHでもフラグを適切に設定・引き継ぐ。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: document-checklist.tsxにマスター反映バッジを表示

**Files:**
- Modify: `src/components/applications/document-checklist.tsx`

**Step 1: ChecklistItemインターフェースにfileSourcedFromMasterを追加**

変更前:
```typescript
interface ChecklistItem {
  id: string;
  documentName: string;
  isRequiredByExpert: boolean;
  status: string;
  expertNotes: string | null;
  ocrExtractedData?: Record<string, any> | null;
  masterDescription?: string | null;
  documentRequirementId?: string | null;
  masterSortOrder?: number;
  createdAt?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  additionalFiles?: AdditionalFile[] | null;
}
```

変更後:
```typescript
interface ChecklistItem {
  id: string;
  documentName: string;
  isRequiredByExpert: boolean;
  status: string;
  expertNotes: string | null;
  ocrExtractedData?: Record<string, any> | null;
  masterDescription?: string | null;
  documentRequirementId?: string | null;
  masterSortOrder?: number;
  createdAt?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  additionalFiles?: AdditionalFile[] | null;
  fileSourcedFromMaster?: boolean;
}
```

**Step 2: ChecklistFileインターフェースとChecklistDropzoneにfileSourcedFromMasterを追加**

変更前:
```typescript
interface ChecklistFile {
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
}
```

変更後:
```typescript
interface ChecklistFile {
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  fileSourcedFromMaster?: boolean;
}
```

変更前（`ChecklistDropzone`内、ファイルがある場合のバッジ表示部分）:
```typescript
  const hasFile = !!file.fileName;

  return (
    <div className="inline-block">
      {hasFile ? (
        <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg pl-1.5 pr-1 py-1 max-w-full">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          {file.fileUrl && file.fileUrl !== "(uploaded)" ? (
            <DocumentLink
              url={file.fileUrl}
              fileName={file.fileName!}
              documentType={documentName}
              className="text-xs text-green-700 hover:text-green-900 hover:underline truncate max-w-[180px]"
            >
              {file.fileName}
            </DocumentLink>
          ) : (
            <span className="text-xs text-green-700 truncate max-w-[180px]" title={file.fileName ?? ""}>
              {file.fileName}
            </span>
          )}
          <button
```

変更後:
```typescript
  const hasFile = !!file.fileName;

  return (
    <div className="inline-block">
      {hasFile ? (
        <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg pl-1.5 pr-1 py-1 max-w-full">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          {file.fileUrl && file.fileUrl !== "(uploaded)" ? (
            <DocumentLink
              url={file.fileUrl}
              fileName={file.fileName!}
              documentType={documentName}
              className="text-xs text-green-700 hover:text-green-900 hover:underline truncate max-w-[180px]"
            >
              {file.fileName}
            </DocumentLink>
          ) : (
            <span className="text-xs text-green-700 truncate max-w-[180px]" title={file.fileName ?? ""}>
              {file.fileName}
            </span>
          )}
          {file.fileSourcedFromMaster && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 whitespace-nowrap"
              title="申請人マスターに登録済みの書類が自動的に反映されました"
            >
              マスターから反映
            </span>
          )}
          <button
```

**Step 3: DocumentChecklist本体でChecklistDropzoneにfileプロパティを渡す箇所を更新**

変更前:
```typescript
                      <ChecklistDropzone
                        itemId={item.id}
                        applicationId={applicationId}
                        documentName={item.documentName}
                        file={{
                          fileUrl: item.fileUrl ?? null,
                          fileName: item.fileName ?? null,
                          fileSize: item.fileSize ?? null,
                          mimeType: item.mimeType ?? null,
                        }}
                        onUploaded={handleFileUploaded}
                        onDeleted={handleFileDeleted}
                        onAiResult={handleAiResult}
                      />
```

変更後:
```typescript
                      <ChecklistDropzone
                        itemId={item.id}
                        applicationId={applicationId}
                        documentName={item.documentName}
                        file={{
                          fileUrl: item.fileUrl ?? null,
                          fileName: item.fileName ?? null,
                          fileSize: item.fileSize ?? null,
                          mimeType: item.mimeType ?? null,
                          fileSourcedFromMaster: item.fileSourcedFromMaster ?? false,
                        }}
                        onUploaded={handleFileUploaded}
                        onDeleted={handleFileDeleted}
                        onAiResult={handleAiResult}
                      />
```

**Step 4: handleFileUploaded/handleFileDeletedでfileSourcedFromMasterをローカルstateにも反映**

変更前:
```typescript
  const handleFileUploaded = useCallback((targetItemId: string, file: UploadedFileResult, meta?: UploadMeta) => {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === targetItemId
        ? { ...i, fileUrl: file.fileUrl, fileName: file.fileName, fileSize: file.fileSize, mimeType: file.mimeType, status: file.status }
        : i))
    );
```

変更後:
```typescript
  const handleFileUploaded = useCallback((targetItemId: string, file: UploadedFileResult, meta?: UploadMeta) => {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === targetItemId
        ? { ...i, fileUrl: file.fileUrl, fileName: file.fileName, fileSize: file.fileSize, mimeType: file.mimeType, status: file.status, fileSourcedFromMaster: false }
        : i))
    );
```

変更前:
```typescript
  const handleFileDeleted = useCallback((itemId: string) => {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === itemId
        ? { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, status: "not_submitted" }
        : i))
    );
```

変更後:
```typescript
  const handleFileDeleted = useCallback((itemId: string) => {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === itemId
        ? { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, status: "not_submitted", fileSourcedFromMaster: false }
        : i))
    );
```

（手動アップロードは常に案件固有データとして`fileSourcedFromMaster: false`になる。これはバックエンドの実際の挙動と一致する楽観的更新であり、サーバーレスポンスを待たずに即時UIへ反映するためのもの。）

- [ ] **Step 5: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 6: コミット**

```bash
git add src/components/applications/document-checklist.tsx
git commit -m "feat: チェックリストに「マスターから反映」バッジを表示

fileSourcedFromMasterがtrueの項目に、既存の緑色枠内へ小さなバッジを追加。
手動アップロード・削除時はローカルstateも楽観的にfalseへ更新する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 最終ビルド確認・手動機能テスト・デプロイ

**Files:** なし（検証のみ）

- [ ] **Step 1: クリーンビルド**

```bash
rm -rf .next
npm run build
```

Expected: エラーなく成功（OneDriveのファイルロックでEPERMが出た場合は、もう一度`rm -rf .next`を実行してから再試行する）

- [ ] **Step 2: 本番データでのマッチング動作確認（読み取りのみのスクリプトで検証）**

実際の案件・申請人データに対し、`matchMasterDocumentType`の判定結果と`applicantDocuments`の登録状況を直接クエリして確認する（DB書き込みは行わず、ロジックの正しさのみ検証する）。具体的には、申請人マスターにパスポート・在留カード（表面・裏面）が登録済みの実申請人を1件選び、その申請人に紐づく案件のチェックリスト項目名（例:「パスポート（提示）」「在留カード」）に対して`matchMasterDocumentType`を実行し、期待した`kind`が返ることを確認する。「扶養者の在留カード（表面）の写し」のような項目に対しては`null`が返ることも確認する。

- [ ] **Step 3: 実際の画面での自動反映確認**

`npm run dev`を起動し、申請人マスターにパスポート・在留カード（表面・裏面）が登録済みの申請人の案件詳細画面を開く。チェックリストの該当項目が「マスターから反映」バッジ付きで自動的に埋まっていることを確認する。

- [ ] **Step 4: 閲覧動作確認**

反映されたファイル名リンクをクリックし、画像はモーダル表示、PDFは新規タブで開くことを確認する。在留カードが単一項目だった場合、裏面が「2枚目を追加」エリアの一覧（`additionalFiles`）として表示・閲覧できることを確認する。

- [ ] **Step 5: 扶養者項目が対象外であることの確認**

家族滞在等の案件で「扶養者の在留カード（表面）の写し」のような項目があれば、自動反映されず通常の手動アップロード枠のままであることを確認する。

- [ ] **Step 6: 上書き・削除・再反映の確認**

マスターから反映された項目のドロップイン枠に別ファイルをドラッグ＆ドロップし、案件固有のファイルに上書きされ、バッジが消えることを確認する。続けてゴミ箱ボタンで削除し、画面をリロードした際、マスターの書類が再度自動反映されることを確認する（この際、ブラウザの開発者ツール等で確認できればVercel Blobの当該URLが依然有効であることも確認する）。

- [ ] **Step 7: ZIP一括ダウンロードの確認**

「提出用データ（一括）ダウンロード」を実行し、ZIP内にマスターから反映されたパスポート・在留カード（表面・裏面）が正しく同梱されていることを確認する。

- [ ] **Step 8: コミット・プッシュ・デプロイ**

```bash
git status
git push origin feature/pdf-split-and-org-master
npx vercel --prod
```

デプロイ完了後、本番URL（`https://zairyu-shinsei-system.vercel.app`）で同様の確認を行う。

---

## スコープ外（将来拡張、本計画では実装しない）

- 「在留カード（表面）」「在留カード（裏面）」が分割2項目として存在するケースの実機確認（ロジック上は対応済みだが、実データでの動作確認は本計画のTask 7で行う基本ケースに留める）
- `residence_card_renewal`（在留カード更新履歴）の自動連携
- 案件作成アクション（`createApplication`）自体への同期トリガー追加
