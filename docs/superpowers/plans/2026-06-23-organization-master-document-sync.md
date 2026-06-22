# 所属機関マスター書類のチェックリスト自動連携 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所属機関マスターに在留資格区分別・共通の書類を保存できるようにし、案件の必要書類チェックリストへ自動反映する。

**Architecture:** 新規テーブル`organizationDocuments`（所属機関ID＋在留資格visaType（null=共通）＋書類名＋ファイル）を追加し、新規詳細ページ`/organizations/[id]`から管理する。案件詳細画面表示時に新規`syncOrgMasterDocumentsToChecklist`を呼び、既存の`matchChecklistItem()`（AI書類判別で実証済みのファジーマッチング）を使って、案件の`visaType`専用書類を共通書類より優先してチェックリストへ書き込み同期する。安全制御（Blob誤削除防止・上書き・再反映）は直前に実装済みの申請人マスター連携と同じ仕組みを継承する。

**Tech Stack:** Next.js 16 (App Router) / TypeScript / Drizzle ORM + Neon Postgres / Vercel Blob

**参照仕様書:** `docs/superpowers/specs/2026-06-23-organization-master-document-sync-design.md`

**検証方法について:** このプロジェクトには自動テストランナーが設定されていないため、各タスクの「テスト」は `npm run build` と最終タスクでの手動機能確認に置き換える。

**実装上の注記（設計書からの精緻化）:** 設計書では「VISA_CATEGORY_NEEDS_ORGが`true`を返す区分のみ」と記載したが、`VISA_CATEGORY_NEEDS_ORG`は在留資格カテゴリコード（N/M/L/I/V/P/Q/Y等）をキーとするフラグであり、`applications.visaType`の具体的な文字列（例: `"engineer_humanities"`）とは粒度が異なり、両者を機械的に変換する既存関数は存在しない。そのため本計画では、`src/lib/utils.ts`の`VISA_TYPE_LABELS`の33種類のうち、所属機関の記載が実務上必要となる区分を明示的に列挙した`ORG_RELEVANT_VISA_TYPES`という定数リストを新設し、これを「区分ごとの書類アップロード欄」の対象とする（Task 1で定義）。

---

## IMPORTANT: Pre-existing unrelated changes — DO NOT TOUCH（全タスク共通）

作業ディレクトリには本作業と無関係な未コミット変更が存在する（`dev.log`, `dev-test.log`, `src/actions/applications.ts`, `src/app/api/applications/[id]/checklist/[itemId]/extra-file/route.ts`, `src/app/print/[id]/shinsei-applicant/page.tsx`, `src/app/print/[id]/shinsei-shared.tsx`, `src/lib/db/schema.ts`）。これらは別の作業（バックグラウンドタスク）による進行中の変更であり、**本計画の対象ではない**。

`src/actions/applications.ts` と `src/lib/db/schema.ts` は本計画でも編集対象になるため、**git add時は必ず編集した行が含まれるファイル全体をステージするが、その前に対象ファイルの現在の内容を必ず読み直してから編集すること**（他の変更と競合する可能性があるため、古い記憶の内容で编集しないこと）。コミット時は対象ファイルのみを明示的に`git add`し、`git add -A`や`git add .`は使用しないこと。他の無関係なファイル（`dev.log`等）は絶対にステージ・コミットしないこと。

---

### Task 1: organizationDocumentsテーブル新規追加・fileSourcedFromMasterTypeカラム追加・ORG_RELEVANT_VISA_TYPES定数追加

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: schema.tsに新規テーブルとカラムを追加**

`src/lib/db/schema.ts`を読み、`applicantDocuments`テーブル定義（`organizationMaster`の後、`applications`より前のセクション）を見つける。その直後（`applicantDocuments`テーブル定義の閉じ括弧`});`の直後）に以下を追加する:

```typescript
// ─── Organization documents（所属機関マスター書類） ──────────────────────────────
// visaType が null の行は「共通書類（すべての在留資格に適用）」。
// 値がある場合は applications.visaType / documentRequirementMaster.visaType と
// 同じ粒度の文字列（例: "engineer_humanities", "specified_skilled_worker_2"）。
export const organizationDocuments = pgTable("organization_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizationMaster.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  visaType: text("visa_type"),
  documentName: text("document_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
```

次に、`applicationDocumentChecklist`テーブル定義内の`fileSourcedFromMaster: boolean(...)`の行を見つけ、その直後に以下を追加する:

```typescript
  // 'applicant' | 'organization' | null。fileSourcedFromMasterがtrueの場合のみ意味を持ち、
  // どちらのマスターから反映されたかをUIバッジの文言分岐に使う。
  fileSourcedFromMasterType: text("file_sourced_from_master_type"),
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: DBマイグレーション実行**

`drizzle-kit push`はこの開発環境でハングする既知の問題があるため、`@neondatabase/serverless`の`neon()`を直接使うスクリプトでDDLを実行する。

`scripts/add-org-documents-table.cjs`を作成:

```javascript
/**
 * organization_documents テーブル新規作成・
 * application_document_checklist.file_sourced_from_master_type カラム追加スクリプト
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

  console.log("CREATE TABLE organization_documents を実行中...");
  await sql`
    CREATE TABLE IF NOT EXISTS organization_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organization_master(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      visa_type text,
      document_name text NOT NULL,
      file_url text NOT NULL,
      file_name text NOT NULL,
      file_size integer,
      mime_type text,
      uploaded_at timestamp NOT NULL DEFAULT now()
    )
  `;
  console.log("完了: organization_documents テーブルを作成しました。");

  console.log("ALTER TABLE application_document_checklist ADD COLUMN file_sourced_from_master_type を実行中...");
  await sql`ALTER TABLE application_document_checklist ADD COLUMN IF NOT EXISTS file_sourced_from_master_type text`;
  console.log("完了: file_sourced_from_master_type カラムを追加しました。");

  const tableCheck = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'organization_documents' ORDER BY ordinal_position
  `;
  console.log("✓ organization_documents の列一覧:", tableCheck);

  const colCheck = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'application_document_checklist' AND column_name = 'file_sourced_from_master_type'
  `;
  if (colCheck.length === 1) {
    console.log("✓ file_sourced_from_master_type カラムを確認しました:", colCheck[0]);
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

Run: `node scripts/add-org-documents-table.cjs`
Expected: `organization_documents`の列一覧（9列）と`file_sourced_from_master_type`カラムの確認メッセージが出力される

- [ ] **Step 5: スクリプトを削除**

```bash
rm scripts/add-org-documents-table.cjs
```

- [ ] **Step 6: ORG_RELEVANT_VISA_TYPES定数を追加**

`src/lib/utils.ts`を読み、`VISA_TYPE_LABELS`の定義（閉じ括弧`};`）の直後に以下を追加する:

```typescript
/**
 * 所属機関の記載・書類提出が実務上必要となる在留資格区分（visaType）の一覧。
 * 所属機関マスターの書類管理画面で、区分別アップロード欄を表示する対象を絞り込むために使う。
 * 家族滞在・永住者・配偶者等・短期滞在など、所属機関（雇用主・受入企業）が
 * 存在しない区分は含めない。
 */
export const ORG_RELEVANT_VISA_TYPES: string[] = [
  "engineer_humanities",
  "intra_company_transferee",
  "skilled_labor",
  "specified_skilled_worker_1",
  "specified_skilled_worker_2",
  "professor",
  "journalist",
  "business_manager",
  "legal_accounting",
  "medical_services",
  "researcher",
  "instructor",
  "highly_skilled_professional_1",
  "highly_skilled_professional_2",
  "highly_skilled_professional_3",
  "student",
  "training",
  "designated_activities",
  "technical_intern_1i",
  "technical_intern_1ro",
  "technical_intern_2i",
  "technical_intern_2ro",
  "technical_intern_3i",
  "technical_intern_3ro",
];
```

- [ ] **Step 7: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 8: コミット**

```bash
git add src/lib/db/schema.ts src/lib/utils.ts
git commit -m "feat: organizationDocumentsテーブルとfileSourcedFromMasterTypeカラムを追加

所属機関マスターの在留資格区分別・共通書類を保存する新規テーブルと、
チェックリスト項目がどちらのマスター（申請人/所属機関）から反映されたかを
区別するカラムを追加。所属機関の記載が必要な在留資格区分の一覧
（ORG_RELEVANT_VISA_TYPES）も追加。DB側もDDL実行済み。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 所属機関マスター書類の保存・取得・削除アクションを新規作成

**Files:**
- Create: `src/actions/organization-documents.ts`

- [ ] **Step 1: 新規ファイルを作成**

```typescript
"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationDocuments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

/**
 * 所属機関マスターの書類を保存する（Upsert）。
 * 同一 (organizationId, visaType, documentName) の組について、既存レコードがあれば
 * 削除して新規挿入する（applicantDocuments の置き換え方式と同じ）。
 * visaType が null の場合は「共通書類」として保存する。
 */
export async function saveOrganizationDocument(data: {
  organizationId: string;
  visaType: string | null;
  documentName: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  if (!data.documentName.trim()) throw new Error("書類名を入力してください");

  await db
    .delete(organizationDocuments)
    .where(
      and(
        eq(organizationDocuments.organizationId, data.organizationId),
        data.visaType === null
          ? isNull(organizationDocuments.visaType)
          : eq(organizationDocuments.visaType, data.visaType),
        eq(organizationDocuments.documentName, data.documentName),
      )
    );

  const [doc] = await db
    .insert(organizationDocuments)
    .values({ tenantId, ...data })
    .returning();

  revalidatePath(`/organizations/${data.organizationId}`);
  return doc;
}

/** 所属機関の全書類を取得する（共通書類＋区分別書類すべて） */
export async function getOrganizationDocuments(organizationId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  return db
    .select()
    .from(organizationDocuments)
    .where(
      and(
        eq(organizationDocuments.organizationId, organizationId),
        eq(organizationDocuments.tenantId, tenantId),
      )
    );
}

/** 所属機関の書類を削除する */
export async function deleteOrganizationDocument(documentId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  await db
    .delete(organizationDocuments)
    .where(
      and(
        eq(organizationDocuments.id, documentId),
        eq(organizationDocuments.tenantId, tenantId),
      )
    );

  revalidatePath(`/organizations/${organizationId}`);
}
```

- [ ] **Step 2: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 3: コミット**

```bash
git add src/actions/organization-documents.ts
git commit -m "feat: 所属機関マスター書類の保存・取得・削除アクションを追加

organizationDocumentsテーブルに対するCRUDアクション。保存はUpsert方式
（同一organizationId+visaType+documentNameの既存レコードを置き換える）。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 所属機関マスター詳細ページ（書類管理）を新規作成

**Files:**
- Create: `src/app/(dashboard)/organizations/[id]/page.tsx`
- Create: `src/components/organizations/organization-documents-panel.tsx`
- Modify: `src/app/(dashboard)/organizations/organization-list.tsx`

- [ ] **Step 1: 詳細ページを新規作成**

```typescript
import { auth } from "@/lib/auth";
import { getOrganizationById } from "@/actions/organizations";
import { getOrganizationDocuments } from "@/actions/organization-documents";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { OrganizationDocumentsPanel } from "@/components/organizations/organization-documents-panel";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await auth();

  const organization = await getOrganizationById(id);
  if (!organization) notFound();

  const documents = await getOrganizationDocuments(id);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/organizations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />
          所属機関一覧
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium">{organization.nameJa}</span>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-purple-600" />
        <h1 className="text-2xl font-bold text-gray-900">{organization.nameJa}</h1>
      </div>

      <OrganizationDocumentsPanel
        organizationId={id}
        initialDocuments={documents.map((d) => ({
          id: d.id,
          visaType: d.visaType,
          documentName: d.documentName,
          fileUrl: d.fileUrl,
          fileName: d.fileName,
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: 書類管理パネル（クライアントコンポーネント）を新規作成**

```typescript
"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Loader2, FileText, Eye, ExternalLink } from "lucide-react";
import { saveOrganizationDocument, deleteOrganizationDocument } from "@/actions/organization-documents";
import { DocumentLink, isImageFile } from "@/components/applicants/document-viewer";
import { VISA_TYPE_LABELS, ORG_RELEVANT_VISA_TYPES } from "@/lib/utils";

interface OrgDoc {
  id: string;
  visaType: string | null;
  documentName: string;
  fileUrl: string;
  fileName: string;
}

interface OrganizationDocumentsPanelProps {
  organizationId: string;
  initialDocuments: OrgDoc[];
}

export function OrganizationDocumentsPanel({ organizationId, initialDocuments }: OrganizationDocumentsPanelProps) {
  const [documents, setDocuments] = useState<OrgDoc[]>(initialDocuments);

  function handleAdded(doc: OrgDoc) {
    setDocuments((prev) => [...prev.filter((d) => !(d.visaType === doc.visaType && d.documentName === doc.documentName)), doc]);
  }

  function handleDeleted(docId: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  }

  return (
    <div className="space-y-4">
      <DocumentCategorySection
        title="共通書類（すべての在留資格に適用）"
        organizationId={organizationId}
        visaType={null}
        documents={documents.filter((d) => d.visaType === null)}
        onAdded={handleAdded}
        onDeleted={handleDeleted}
      />
      {ORG_RELEVANT_VISA_TYPES.map((visaType) => (
        <DocumentCategorySection
          key={visaType}
          title={VISA_TYPE_LABELS[visaType] ?? visaType}
          organizationId={organizationId}
          visaType={visaType}
          documents={documents.filter((d) => d.visaType === visaType)}
          onAdded={handleAdded}
          onDeleted={handleDeleted}
        />
      ))}
    </div>
  );
}

function DocumentCategorySection({
  title,
  organizationId,
  visaType,
  documents,
  onAdded,
  onDeleted,
}: {
  title: string;
  organizationId: string;
  visaType: string | null;
  documents: OrgDoc[];
  onAdded: (doc: OrgDoc) => void;
  onDeleted: (docId: string) => void;
}) {
  const [docName, setDocName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleFileSelected(file: File) {
    if (!docName.trim()) {
      setError("先に書類名を入力してください");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "アップロードに失敗しました");
        }
        const { url, fileName, fileSize, mimeType } = await res.json();

        const saved = await saveOrganizationDocument({
          organizationId,
          visaType,
          documentName: docName.trim(),
          fileUrl: url,
          fileName,
          fileSize,
          mimeType,
        });
        onAdded({ id: saved.id, visaType: saved.visaType, documentName: saved.documentName, fileUrl: saved.fileUrl, fileName: saved.fileName });
        setDocName("");
      } catch (err: any) {
        setError(err.message ?? "アップロードに失敗しました");
      }
    });
  }

  function handleDelete(docId: string) {
    startTransition(async () => {
      try {
        await deleteOrganizationDocument(docId, organizationId);
        onDeleted(docId);
      } catch (err: any) {
        setError(err.message ?? "削除に失敗しました");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.length === 0 ? (
          <p className="text-xs text-gray-400">登録済みの書類はありません</p>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{doc.documentName}</p>
                <DocumentLink
                  url={doc.fileUrl}
                  fileName={doc.fileName}
                  documentType={doc.documentName}
                  className="text-xs text-gray-500 hover:text-blue-600 truncate flex items-center gap-1 text-left"
                >
                  <span className="truncate">{doc.fileName}</span>
                  {isImageFile(doc.fileName) ? <Eye className="w-3 h-3 text-gray-300 flex-shrink-0" /> : <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />}
                </DocumentLink>
              </div>
              <button
                onClick={() => handleDelete(doc.id)}
                disabled={isPending}
                className="p-0.5 text-gray-300 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
                title="削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}

        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="書類名（例: 登記事項証明書）"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
          />
          <label className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer px-2 py-1.5 border border-blue-200 rounded-lg">
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            追加
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="hidden"
              disabled={isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 一覧ページから詳細ページへのリンクを追加**

`src/app/(dashboard)/organizations/organization-list.tsx`を読み、以下のブロックを見つける（編集ボタンの直前にリンクを追加する）:

変更前:
```typescript
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 flex-shrink-0 transition-opacity">
                          <button
                            onClick={() => setEditingId(org.id)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <Pencil className="w-3 h-3" />
                            編集
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setDeletingOrg(org)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                            削除
                          </button>
                        </div>
```

変更後:
```typescript
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 flex-shrink-0 transition-opacity">
                          <Link
                            href={`/organizations/${org.id}`}
                            className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800"
                          >
                            <FileText className="w-3 h-3" />
                            書類管理
                          </Link>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setEditingId(org.id)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <Pencil className="w-3 h-3" />
                            編集
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setDeletingOrg(org)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                            削除
                          </button>
                        </div>
```

ファイル先頭のimport文に`Link`と`FileText`を追加する。

変更前:
```typescript
import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Pencil, X, Mail, Phone, Shield, User, TrendingUp, Trash2, AlertTriangle } from "lucide-react";
import { AddOrganizationForm } from "./add-organization-form";
import { deleteOrganization } from "@/actions/organizations";
```

変更後:
```typescript
import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Pencil, X, Mail, Phone, Shield, User, TrendingUp, Trash2, AlertTriangle, FileText } from "lucide-react";
import { AddOrganizationForm } from "./add-organization-form";
import { deleteOrganization } from "@/actions/organizations";
```

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add "src/app/(dashboard)/organizations/[id]/page.tsx" src/components/organizations/organization-documents-panel.tsx "src/app/(dashboard)/organizations/organization-list.tsx"
git commit -m "feat: 所属機関マスターの書類管理詳細ページを新規作成

/organizations/[id]に「共通書類」＋ORG_RELEVANT_VISA_TYPES区分別の
書類アップロード・閲覧・削除UIを追加。一覧から「書類管理」リンクで遷移。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: syncOrgMasterDocumentsToChecklistアクションを新規作成・既存の申請人マスター同期を更新

**Files:**
- Modify: `src/actions/applications.ts`

**重要:** このファイルには本計画と無関係な未コミット変更が既に存在する（背景タスクによる進行中の編集）。編集前に必ず現在の内容を読み直し、以下の「変更前」テキストが実際に一致することを確認してから編集すること。一致しない場合はNEEDS_CONTEXTとして報告すること。

- [ ] **Step 1: importにorganizationDocumentsとmatchChecklistItemを追加**

`src/actions/applications.ts`の先頭付近、`import { matchMasterDocumentType } from "@/lib/master-document-matching";`の行を見つけ、その直後に以下を追加する:

```typescript
import { matchChecklistItem } from "@/lib/document-classifier";
```

`@/lib/db/schema`からのimportに`organizationDocuments`を追加する必要がある場合（既に含まれていなければ）、そのimport文に`organizationDocuments`を追加する。

- [ ] **Step 2: 既存のsyncMasterDocumentsToChecklistにfileSourcedFromMasterTypeを追加**

`syncMasterDocumentsToChecklist`関数内の`for (const item of unsynced) { ... }`ループ全体（`match.kind`の4分岐）を、以下のとおり一括で置き換える。

変更前:
```typescript
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
                  mimeType: backDoc.mimeType ?? "image/jpeg",
                  sourcedFromMaster: true,
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
```

変更後（各分岐の`fileSourcedFromMaster: true,`の直後に`fileSourcedFromMasterType: "applicant",`を追加。それ以外は無変更）:
```typescript
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
              fileSourcedFromMasterType: "applicant",
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
              fileSourcedFromMasterType: "applicant",
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
              fileSourcedFromMasterType: "applicant",
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
                  mimeType: backDoc.mimeType ?? "image/jpeg",
                  sourcedFromMaster: true,
                }],
              } : {}),
              fileSourcedFromMaster: true,
              fileSourcedFromMasterType: "applicant",
              status: "submitted",
              submittedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(applicationDocumentChecklist.id, item.id))
        );
      }
    }
```

**注記:** このループの直前にある`if (unsynced.length === 0) return;`などのガード文や、ループの前後の他のコードは変更しない。上記は`for (const item of unsynced) { ... }`ループの開始`{`から終了`}`までの完全な置き換えである。実際のファイルに無関係な背景タスクによる差分（`additionalFiles`内の`sourcedFromMaster: true`等）が既に含まれている場合があるため、置き換え前に実際の現在の内容を読み、上記「変更前」と完全に一致することを確認すること。一致しない場合（背景タスクの変更が更に進んでいる場合）は、その差分を保持したまま`fileSourcedFromMasterType: "applicant",`の追加のみを行うこと。

- [ ] **Step 3: syncOrgMasterDocumentsToChecklistアクションを追加**

`syncMasterDocumentsToChecklist`関数の閉じ括弧（最後の`}`）の直後に、以下の新規関数を追加する。

```typescript

/**
 * 所属機関マスター（organizationDocuments）に登録済みの書類を、
 * 案件の必要書類チェックリストへ自動反映する（書き込み同期）。
 * - 案件のorganizationId・visaTypeをキーに、共通書類（visaType IS NULL）と
 *   案件の在留資格専用書類の両方を取得し、専用書類を優先する候補リストを作る
 * - 未提出（fileUrlがnull）のチェックリスト項目ごとに、matchChecklistItem()で
 *   候補リストとのファジーマッチングを行い、一致したものを反映する
 * - ベストエフォート処理: 失敗してもページ表示を妨げないよう例外を投げない
 */
export async function syncOrgMasterDocumentsToChecklist(applicationId: string): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) return;
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [application] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!application || !application.organizationId) return;

    const checklistItems = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));

    const unsynced = checklistItems.filter((item) => !item.fileUrl);
    if (unsynced.length === 0) return;

    const orgDocs = await db
      .select()
      .from(organizationDocuments)
      .where(and(
        eq(organizationDocuments.organizationId, application.organizationId),
        eq(organizationDocuments.tenantId, tenantId),
      ));

    // 案件のvisaType専用書類を先頭、共通書類（visaType IS NULL）を後方に配置する。
    // matchChecklistItemは候補リストを先頭から走査して最初に一致したものを返すため、
    // この並び順だけで「専用書類を優先」が実現できる。
    const specificDocs = orgDocs.filter((d) => d.visaType === application.visaType);
    const commonDocs = orgDocs.filter((d) => d.visaType === null);
    const prioritizedOrgDocs = [...specificDocs, ...commonDocs];
    if (prioritizedOrgDocs.length === 0) return;

    const updates: Promise<unknown>[] = [];

    for (const item of unsynced) {
      const matched = matchChecklistItem(item.documentName, prioritizedOrgDocs);
      if (!matched) continue;

      updates.push(
        db.update(applicationDocumentChecklist)
          .set({
            fileUrl: matched.fileUrl,
            fileName: matched.fileName,
            fileSize: matched.fileSize,
            mimeType: matched.mimeType,
            fileSourcedFromMaster: true,
            fileSourcedFromMasterType: "organization",
            status: "submitted",
            submittedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(applicationDocumentChecklist.id, item.id))
      );
    }

    if (updates.length === 0) return;
    await Promise.all(updates);
    revalidatePath(`/applications/${applicationId}`);
  } catch (err: any) {
    console.error("[syncOrgMasterDocumentsToChecklist] error:", { applicationId, err });
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
git commit -m "feat: syncOrgMasterDocumentsToChecklistアクションを追加

所属機関マスターの書類（共通＋在留資格専用、専用を優先）を、既存の
matchChecklistItem()によるファジーマッチングでチェックリスト未提出項目へ
書き込み同期する。既存のsyncMasterDocumentsToChecklistにも
fileSourcedFromMasterType='applicant'を設定するよう追加する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: page.tsxへの同期呼び出し配線・getApplicationByIdの拡張

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/page.tsx`
- Modify: `src/actions/applications.ts`

**重要:** `src/actions/applications.ts`は本計画と無関係な未コミット変更が既に存在する。編集前に必ず現在の内容を読み直すこと。

- [ ] **Step 1: page.tsxのimportにsyncOrgMasterDocumentsToChecklistを追加**

変更前:
```typescript
import { getApplicationById, syncMasterDocumentsToChecklist } from "@/actions/applications";
```

変更後:
```typescript
import { getApplicationById, syncMasterDocumentsToChecklist, syncOrgMasterDocumentsToChecklist } from "@/actions/applications";
```

- [ ] **Step 2: syncMasterDocumentsToChecklistの直後に新規同期呼び出しを追加**

変更前:
```typescript
  try {
    await syncMasterDocumentsToChecklist(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] syncMasterDocumentsToChecklist failed:", e);
    // マスター連携に失敗してもページ表示は継続する
  }

  let data;
```

変更後:
```typescript
  try {
    await syncMasterDocumentsToChecklist(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] syncMasterDocumentsToChecklist failed:", e);
    // マスター連携に失敗してもページ表示は継続する
  }

  try {
    await syncOrgMasterDocumentsToChecklist(id);
  } catch (e) {
    console.error("[ApplicationDetailPage] syncOrgMasterDocumentsToChecklist failed:", e);
    // マスター連携に失敗してもページ表示は継続する
  }

  let data;
```

- [ ] **Step 3: getApplicationByIdのSELECTとマッピングにfileSourcedFromMasterTypeを追加**

`src/actions/applications.ts`内の`getApplicationById`関数を見つける。`rawChecklist`の明示的SELECT部分で、`fileSourcedFromMaster: applicationDocumentChecklist.fileSourcedFromMaster,`の行を見つけ、その直後に追加する:

変更前:
```typescript
      fileSourcedFromMaster: applicationDocumentChecklist.fileSourcedFromMaster,
      submittedAt:           applicationDocumentChecklist.submittedAt,
```

変更後:
```typescript
      fileSourcedFromMaster: applicationDocumentChecklist.fileSourcedFromMaster,
      fileSourcedFromMasterType: applicationDocumentChecklist.fileSourcedFromMasterType,
      submittedAt:           applicationDocumentChecklist.submittedAt,
```

次に、`checklist`マッピング部分で`fileSourcedFromMaster: item.fileSourcedFromMaster,`の行を見つけ、その直後に追加する:

変更前:
```typescript
    fileSourcedFromMaster: item.fileSourcedFromMaster,
    // OCR データ: null または plain object（シリアライズ可）
```

変更後:
```typescript
    fileSourcedFromMaster: item.fileSourcedFromMaster,
    fileSourcedFromMasterType: item.fileSourcedFromMasterType ?? null,
    // OCR データ: null または plain object（シリアライズ可）
```

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add "src/app/(dashboard)/applications/[id]/page.tsx" src/actions/applications.ts
git commit -m "feat: 案件詳細画面表示時にsyncOrgMasterDocumentsToChecklistを実行

申請人マスター同期の直後に所属機関マスター同期も実行する。
getApplicationByIdにfileSourcedFromMasterTypeも追加する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: チェックリストAPIでfileSourcedFromMasterTypeをリセット・引き継ぎ

**Files:**
- Modify: `src/app/api/applications/[id]/checklist/[itemId]/document/route.ts`

- [ ] **Step 1: POSTハンドラでfileSourcedFromMasterTypeをnullに設定**

変更前:
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
        fileSourcedFromMasterType: null,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, targetItemId))
      .returning();
```

POSTハンドラのレスポンス`item: {...}`オブジェクトに`fileSourcedFromMasterType: updated.fileSourcedFromMasterType,`を追加する（`fileSourcedFromMaster: updated.fileSourcedFromMaster,`の行の直後）:

変更前:
```typescript
      item: {
        id: updated.id,
        fileUrl: updated.fileUrl,
        fileName: updated.fileName,
        fileSize: updated.fileSize,
        mimeType: updated.mimeType,
        fileSourcedFromMaster: updated.fileSourcedFromMaster,
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
      },
```

変更後:
```typescript
      item: {
        id: updated.id,
        fileUrl: updated.fileUrl,
        fileName: updated.fileName,
        fileSize: updated.fileSize,
        mimeType: updated.mimeType,
        fileSourcedFromMaster: updated.fileSourcedFromMaster,
        fileSourcedFromMasterType: updated.fileSourcedFromMasterType,
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
      },
```

- [ ] **Step 2: PATCHハンドラでfileSourcedFromMasterTypeを引き継ぎ・リセット**

変更前:
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

変更後:
```typescript
    const [updatedTarget] = await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: sourceItem.fileUrl,
        fileName: newFileName,
        fileSize: sourceItem.fileSize,
        mimeType: sourceItem.mimeType,
        fileSourcedFromMaster: sourceItem.fileSourcedFromMaster,
        fileSourcedFromMasterType: sourceItem.fileSourcedFromMasterType,
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
        fileSourcedFromMasterType: null,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));
```

PATCHハンドラのレスポンス`item: {...}`オブジェクトにも`fileSourcedFromMasterType: updatedTarget.fileSourcedFromMasterType,`を追加する（`fileSourcedFromMaster: updatedTarget.fileSourcedFromMaster,`の行の直後）。

- [ ] **Step 3: DELETEハンドラでfileSourcedFromMasterTypeをnullに設定**

変更前:
```typescript
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

変更後:
```typescript
    await db.update(applicationDocumentChecklist)
      .set({
        fileUrl: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
        fileSourcedFromMaster: false,
        fileSourcedFromMasterType: null,
        status: "not_submitted",
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, itemId));

    revalidatePath(`/applications/${applicationId}`);
    return NextResponse.json({ success: true });
```

DELETEハンドラ内のBlob誤削除防止チェック（`!item.fileSourcedFromMaster`を使う条件）は変更不要（`fileSourcedFromMaster`真偽値はどのマスターから来たかに関わらず同じ安全制御として機能するため）。

- [ ] **Step 4: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 5: コミット**

```bash
git add "src/app/api/applications/[id]/checklist/[itemId]/document/route.ts"
git commit -m "fix: チェックリストAPIでfileSourcedFromMasterTypeをリセット・引き継ぎ

POST（手動アップロード）でnullへリセット、PATCH（再分類）で引き継ぎ、
DELETE（削除）でnullへリセットする。Blob誤削除防止ロジックは
fileSourcedFromMaster（真偽値）のみで判定するため変更不要。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: document-checklist.tsxのバッジ文言を分岐

**Files:**
- Modify: `src/components/applications/document-checklist.tsx`

- [ ] **Step 1: ChecklistItem・ChecklistFileインターフェースにfileSourcedFromMasterTypeを追加**

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
  fileSourcedFromMaster?: boolean;
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
  fileSourcedFromMasterType?: string | null;
}
```

`ChecklistFile`インターフェース（`fileSourcedFromMaster?: boolean;`を含む方、`ChecklistDropzone`の`file`プロップ型）にも同様に`fileSourcedFromMasterType?: string | null;`を追加する。

- [ ] **Step 2: バッジ表示をfileSourcedFromMasterTypeで分岐**

変更前:
```typescript
          {file.fileSourcedFromMaster && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 whitespace-nowrap"
              title="申請人マスターに登録済みの書類が自動的に反映されました"
            >
              マスターから反映
            </span>
          )}
```

変更後:
```typescript
          {file.fileSourcedFromMaster && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 whitespace-nowrap"
              title={
                file.fileSourcedFromMasterType === "organization"
                  ? "所属機関マスターに登録済みの書類が自動的に反映されました"
                  : "申請人マスターに登録済みの書類が自動的に反映されました"
              }
            >
              {file.fileSourcedFromMasterType === "organization"
                ? "アップロード済み（所属機関マスターから反映）"
                : file.fileSourcedFromMasterType === "applicant"
                ? "アップロード済み（申請人マスターから反映）"
                : "マスターから反映"}
            </span>
          )}
```

- [ ] **Step 3: ChecklistDropzoneへのfileプロップにfileSourcedFromMasterTypeを渡す**

変更前:
```typescript
                        file={{
                          fileUrl: item.fileUrl ?? null,
                          fileName: item.fileName ?? null,
                          fileSize: item.fileSize ?? null,
                          mimeType: item.mimeType ?? null,
                          fileSourcedFromMaster: item.fileSourcedFromMaster ?? false,
                        }}
```

変更後:
```typescript
                        file={{
                          fileUrl: item.fileUrl ?? null,
                          fileName: item.fileName ?? null,
                          fileSize: item.fileSize ?? null,
                          mimeType: item.mimeType ?? null,
                          fileSourcedFromMaster: item.fileSourcedFromMaster ?? false,
                          fileSourcedFromMasterType: item.fileSourcedFromMasterType ?? null,
                        }}
```

- [ ] **Step 4: 楽観的更新（アップロード・削除・再分類）でfileSourcedFromMasterTypeをリセット・引き継ぎ**

`handleFileUploaded`内の`fileSourcedFromMaster: false`の箇所に`fileSourcedFromMasterType: null`を追加する。変更前:
```typescript
        ? { ...i, fileUrl: file.fileUrl, fileName: file.fileName, fileSize: file.fileSize, mimeType: file.mimeType, status: file.status, fileSourcedFromMaster: false }
```
変更後:
```typescript
        ? { ...i, fileUrl: file.fileUrl, fileName: file.fileName, fileSize: file.fileSize, mimeType: file.mimeType, status: file.status, fileSourcedFromMaster: false, fileSourcedFromMasterType: null }
```

`handleFileDeleted`内の`fileSourcedFromMaster: false`の箇所も同様に`fileSourcedFromMasterType: null`を追加する。変更前:
```typescript
        ? { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, status: "not_submitted", fileSourcedFromMaster: false }
```
変更後:
```typescript
        ? { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, status: "not_submitted", fileSourcedFromMaster: false, fileSourcedFromMasterType: null }
```

再分類（PATCH再分類のレスポンスを反映する箇所）の楽観的更新も同様に変更する。変更前:
```typescript
      setLocalChecklist((prev) => prev.map((i) => {
        if (i.id === fromId) return { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, fileSourcedFromMaster: false, status: "not_submitted" };
        if (i.id === toId) return { ...i, fileUrl: data.item.fileUrl, fileName: data.item.fileName, fileSize: data.item.fileSize, mimeType: data.item.mimeType, fileSourcedFromMaster: data.item.fileSourcedFromMaster, status: data.item.status };
        return i;
      }));
```

変更後:
```typescript
      setLocalChecklist((prev) => prev.map((i) => {
        if (i.id === fromId) return { ...i, fileUrl: null, fileName: null, fileSize: null, mimeType: null, fileSourcedFromMaster: false, fileSourcedFromMasterType: null, status: "not_submitted" };
        if (i.id === toId) return { ...i, fileUrl: data.item.fileUrl, fileName: data.item.fileName, fileSize: data.item.fileSize, mimeType: data.item.mimeType, fileSourcedFromMaster: data.item.fileSourcedFromMaster, fileSourcedFromMasterType: data.item.fileSourcedFromMasterType, status: data.item.status };
        return i;
      }));
```

- [ ] **Step 5: ビルドで型エラーがないことを確認**

Run: `npm run build`
Expected: エラーなく成功

- [ ] **Step 6: コミット**

```bash
git add src/components/applications/document-checklist.tsx
git commit -m "feat: チェックリストバッジに所属機関マスターから反映の文言を追加

fileSourcedFromMasterTypeに応じて「アップロード済み（所属機関マスター
から反映）」「アップロード済み（申請人マスターから反映）」を分岐表示する。
既存データ（typeが未設定）は汎用文言「マスターから反映」をフォールバック表示する。
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: 最終ビルド確認・手動機能テスト・デプロイ

**Files:** なし（検証のみ）

- [ ] **Step 1: クリーンビルド**

```bash
rm -rf .next
npm run build
```

Expected: エラーなく成功

- [ ] **Step 2: 実データでの動作確認準備**

実在の所属機関（特定技能2号または技術・人文知識・国際業務の案件に紐づくもの）を1件選ぶ。`/organizations/<id>`を開き、「共通書類」に「登記事項証明書」をアップロードし、当該所属機関が対応する在留資格区分のセクションにもう1件（例:「直近の決算書」）をアップロードする。

- [ ] **Step 3: 自動反映の確認**

その所属機関に紐づく案件の必要書類チェックリストに「登記事項証明書（商業・法人登記）」のような項目を追加（または既存の案件で）、案件詳細画面を開く。「アップロード済み（所属機関マスターから反映）」バッジ付きで自動的に埋まることを確認する。

- [ ] **Step 4: 優先順位の確認**

「共通書類」と専用区分の両方に同名の書類（例: 登記事項証明書）を登録し、専用区分の案件では専用書類が優先して反映されることを確認する。

- [ ] **Step 5: 閲覧・ZIP同梱の確認**

ファイル名リンクのクリックで画像モーダル/PDF新規タブの閲覧動作を確認する。「提出用データ（一括）ダウンロード」を実行し、ZIP内に所属機関マスターから反映された書類が同梱されていることを確認する。

- [ ] **Step 6: 上書き・削除・再反映の確認**

案件側のドロップイン枠に別ファイルをアップロードし、バッジが消えて案件固有データに上書きされることを確認する。削除後、画面をリロードし、所属機関マスターの書類が再度自動反映されることを確認する。

- [ ] **Step 7: 既存の申請人マスター連携への回帰がないことの確認**

申請人マスター由来のバッジ（「アップロード済み（申請人マスターから反映）」）が正しく表示され、Blob誤削除防止ロジックが引き続き機能することを確認する。

- [ ] **Step 8: コミット・プッシュ・デプロイ**

```bash
git status
git push origin feature/pdf-split-and-org-master
npx vercel --prod
```

デプロイ完了後、本番URL（`https://zairyu-shinsei-system.vercel.app`）で同様の確認を行う。

---

## スコープ外（将来拡張、本計画では実装しない）

- 所属機関マスター書類の自由入力書類名に対する入力支援（候補リストのサジェスト等）
- 所属機関の登録時点（作成時）への同期トリガー追加
- `documentRequirementMaster`と`organizationDocuments`の書類名候補の一元管理
- `shinsei-applicant`/`shinsei-org`/`shinsei-shared.tsx`の変更（対象外）
