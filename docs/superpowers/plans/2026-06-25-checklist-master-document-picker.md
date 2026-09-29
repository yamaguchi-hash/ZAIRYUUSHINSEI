# 必要書類チェックリストのマスター書類選択機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 必要書類チェックリストの各項目（1枚目・2枚目以降）で、申請人マスター・所属機関マスター・扶養者（申請人マスターを参照）に既にアップロード済みの書類を選択して使い回せるようにする。

**Architecture:** 既存の`getApplicantDocuments`/`getOrganizationDocuments`アクションを再利用して3種類の取得元の書類一覧をまとめる新規アクション`getAvailableMasterDocumentsForApplication`と、選択した書類をチェックリスト項目に反映する新規アクション`useMasterDocumentForChecklistItem`を追加する。一覧は申請案件詳細ページでサーバー側で1回だけ取得し、`DocumentChecklist`に props で渡す。新規共通コンポーネント`MasterDocumentPicker`を作り、既存の1枚目用`ChecklistDropzone`・2枚目以降用`ExtraFilesSection`の両方に組み込む。

**Tech Stack:** Next.js 16 App Router、TypeScript、Drizzle ORM + Neon Postgres、React Client Component。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動確認で行う。

参考設計書: [docs/superpowers/specs/2026-06-25-checklist-master-document-picker-design.md](../specs/2026-06-25-checklist-master-document-picker-design.md)

---

### Task 1: `additionalFiles`の型に`sourcedFromMasterType`を追加する

**Files:**
- Modify: `src/lib/db/schema.ts:190-223`

`additionalFiles`は`jsonb`カラムのため、フィールド追加にDBマイグレーションは不要（TypeScript型注釈のみの変更）。

- [ ] **Step 1: 型定義に`sourcedFromMasterType`を追加する**

変更前:
```ts
  additionalFiles: jsonb("additional_files").$type<Array<{
    fileUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    // このエントリがマスター（applicantDocuments）から反映されたものかどうか。
    // trueの場合、マスター側も同じBlob URLを参照しているため物理削除してはならない。
    sourcedFromMaster?: boolean;
  }>>(),
  expertNotes: text("expert_notes"),
  // 現在のfileUrl/additionalFilesが申請人マスター（applicantDocuments）から
  // 自動反映されたものかどうか。trueの場合、マスター同期処理が再度上書きしてよい。
  fileSourcedFromMaster: boolean("file_sourced_from_master").default(false).notNull(),
  // 'applicant' | 'organization' | null。fileSourcedFromMasterがtrueの場合のみ意味を持ち、
  // どちらのマスターから反映されたかをUIバッジの文言分岐に使う。
  fileSourcedFromMasterType: text("file_sourced_from_master_type"),
```

変更後:
```ts
  additionalFiles: jsonb("additional_files").$type<Array<{
    fileUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    // このエントリがマスター（applicantDocuments／organizationDocuments）から反映されたものかどうか。
    // trueの場合、マスター側も同じBlob URLを参照しているため物理削除してはならない。
    sourcedFromMaster?: boolean;
    // 'applicant' | 'organization' | 'supporter'。sourcedFromMasterがtrueの場合のみ意味を持ち、
    // どのマスターから反映されたかをUIバッジの文言分岐に使う。
    sourcedFromMasterType?: 'applicant' | 'organization' | 'supporter';
  }>>(),
  expertNotes: text("expert_notes"),
  // 現在のfileUrl/additionalFilesが申請人マスター（applicantDocuments）・所属機関マスター
  // （organizationDocuments）・扶養者（applicantDocumentsをsupporterId経由で参照）から
  // 自動反映または手動選択されたものかどうか。trueの場合、マスター同期処理が再度上書きしてよい。
  fileSourcedFromMaster: boolean("file_sourced_from_master").default(false).notNull(),
  // 'applicant' | 'organization' | 'supporter' | null。fileSourcedFromMasterがtrueの場合のみ
  // 意味を持ち、どのマスターから反映されたかをUIバッジの文言分岐に使う。
  fileSourcedFromMasterType: text("file_sourced_from_master_type"),
```

- [ ] **Step 2: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミットする**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: additionalFilesの型にsourcedFromMasterTypeを追加

jsonbカラムのTypeScript型注釈のみの変更（DBマイグレーション不要）。
扶養者マスターから反映された2枚目以降の書類を区別できるようにする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: マスター書類取得・反映の新規サーバーアクションを追加する

**Files:**
- Modify: `src/actions/applications.ts`

`applicantDocuments`／`organizationDocuments`は既に5〜15行目付近のimportに含まれている（追加import不要）。

- [ ] **Step 1: `getAvailableMasterDocumentsForApplication`を追加する**

ファイル末尾に以下を追加する。

```ts
// ── チェックリスト用: 利用可能なマスター書類一覧（申請人・所属機関・扶養者） ──────
const APPLICANT_DOC_TYPE_LABELS: Record<string, string> = {
  passport_front: "パスポート（表紙）",
  passport_data_page: "パスポート（顔写真ページ）",
  residence_card_front: "在留カード（表面）",
  residence_card_back: "在留カード（裏面）",
  residence_card: "在留カード",
  residence_card_renewal: "最新の在留カード",
};

export type MasterFileOption = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  label: string;
};

export async function getAvailableMasterDocumentsForApplication(applicationId: string): Promise<{
  applicant: MasterFileOption[];
  organization: MasterFileOption[];
  supporter: MasterFileOption[];
}> {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const [app] = await db
    .select({
      applicantId: applications.applicantId,
      organizationId: applications.organizationId,
      supporterId: applications.supporterId,
    })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) throw new Error("申請案件が見つかりません");

  const applicantDocs = await db
    .select()
    .from(applicantDocuments)
    .where(and(eq(applicantDocuments.applicantId, app.applicantId), eq(applicantDocuments.tenantId, tenantId)));

  const organizationDocs = app.organizationId
    ? await db
        .select()
        .from(organizationDocuments)
        .where(and(eq(organizationDocuments.organizationId, app.organizationId), eq(organizationDocuments.tenantId, tenantId)))
    : [];

  const supporterDocs = app.supporterId
    ? await db
        .select()
        .from(applicantDocuments)
        .where(and(eq(applicantDocuments.applicantId, app.supporterId), eq(applicantDocuments.tenantId, tenantId)))
    : [];

  return {
    applicant: applicantDocs.map((d) => ({
      id: d.id, fileName: d.fileName, fileUrl: d.fileUrl, fileSize: d.fileSize, mimeType: d.mimeType,
      label: APPLICANT_DOC_TYPE_LABELS[d.documentType] ?? d.documentType,
    })),
    organization: organizationDocs.map((d) => ({
      id: d.id, fileName: d.fileName, fileUrl: d.fileUrl, fileSize: d.fileSize, mimeType: d.mimeType,
      label: d.documentName,
    })),
    supporter: supporterDocs.map((d) => ({
      id: d.id, fileName: d.fileName, fileUrl: d.fileUrl, fileSize: d.fileSize, mimeType: d.mimeType,
      label: APPLICANT_DOC_TYPE_LABELS[d.documentType] ?? d.documentType,
    })),
  };
}
```

- [ ] **Step 2: `useMasterDocumentForChecklistItem`を追加する**

`getAvailableMasterDocumentsForApplication`の直後に追加する。

```ts
// ── チェックリスト用: 選択したマスター書類をチェックリスト項目に反映 ──────────────
export async function useMasterDocumentForChecklistItem(
  applicationId: string,
  itemId: string,
  source: "applicant" | "organization" | "supporter",
  masterDocumentId: string,
  slot: "primary" | "extra"
): Promise<{
  success: boolean;
  error?: string;
  item?: {
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    status: string;
    fileSourcedFromMaster: boolean;
    fileSourcedFromMasterType: string | null;
  };
  addedFile?: {
    fileUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    sourcedFromMaster: boolean;
    sourcedFromMasterType: "applicant" | "organization" | "supporter";
  };
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select({
        applicantId: applications.applicantId,
        organizationId: applications.organizationId,
        supporterId: applications.supporterId,
      })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    let masterDoc: { fileUrl: string; fileName: string; fileSize: number | null; mimeType: string | null } | undefined;

    if (source === "organization") {
      if (!app.organizationId) return { success: false, error: "所属機関が設定されていません" };
      const [doc] = await db
        .select()
        .from(organizationDocuments)
        .where(and(
          eq(organizationDocuments.id, masterDocumentId),
          eq(organizationDocuments.organizationId, app.organizationId),
          eq(organizationDocuments.tenantId, tenantId)
        ))
        .limit(1);
      masterDoc = doc;
    } else {
      const ownerId = source === "applicant" ? app.applicantId : app.supporterId;
      if (!ownerId) return { success: false, error: "対象の人物が設定されていません" };
      const [doc] = await db
        .select()
        .from(applicantDocuments)
        .where(and(
          eq(applicantDocuments.id, masterDocumentId),
          eq(applicantDocuments.applicantId, ownerId),
          eq(applicantDocuments.tenantId, tenantId)
        ))
        .limit(1);
      masterDoc = doc;
    }
    if (!masterDoc) return { success: false, error: "書類が見つかりません" };

    const [item] = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(and(eq(applicationDocumentChecklist.id, itemId), eq(applicationDocumentChecklist.applicationId, applicationId)))
      .limit(1);
    if (!item) return { success: false, error: "チェックリスト項目が見つかりません" };

    if (slot === "primary") {
      await db
        .update(applicationDocumentChecklist)
        .set({
          fileUrl: masterDoc.fileUrl,
          fileName: masterDoc.fileName,
          fileSize: masterDoc.fileSize,
          mimeType: masterDoc.mimeType,
          status: "submitted",
          fileSourcedFromMaster: true,
          fileSourcedFromMasterType: source,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(applicationDocumentChecklist.id, itemId));

      revalidatePath(`/applications/${applicationId}`);
      return {
        success: true,
        item: {
          fileUrl: masterDoc.fileUrl, fileName: masterDoc.fileName, fileSize: masterDoc.fileSize, mimeType: masterDoc.mimeType,
          status: "submitted", fileSourcedFromMaster: true, fileSourcedFromMasterType: source,
        },
      };
    } else {
      const addedFile = {
        fileUrl: masterDoc.fileUrl,
        fileName: masterDoc.fileName,
        fileSize: masterDoc.fileSize ?? 0,
        mimeType: masterDoc.mimeType ?? "",
        sourcedFromMaster: true,
        sourcedFromMasterType: source,
      };
      const nextFiles = [...(item.additionalFiles ?? []), addedFile];
      await db
        .update(applicationDocumentChecklist)
        .set({ additionalFiles: nextFiles, updatedAt: new Date() })
        .where(eq(applicationDocumentChecklist.id, itemId));

      revalidatePath(`/applications/${applicationId}`);
      return { success: true, addedFile };
    }
  } catch (err: any) {
    return { success: false, error: err.message ?? "マスター書類の反映に失敗しました" };
  }
}
```

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: コミットする**

```bash
git add src/actions/applications.ts
git commit -m "feat: マスター書類取得・反映の新規サーバーアクションを追加

getAvailableMasterDocumentsForApplicationで申請人・所属機関・扶養者の
利用可能な書類一覧をまとめて取得する。useMasterDocumentForChecklistItem
で選択した書類をチェックリスト項目（1枚目または2枚目以降）に反映する。
ファイルはコピーせず既存のBlob URLをそのまま参照する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: `MasterDocumentPicker`共通コンポーネントを新規作成する

**Files:**
- Create: `src/components/applications/master-document-picker.tsx`

- [ ] **Step 1: コンポーネントを作成する**

```tsx
"use client";

import { useState } from "react";
import { useMasterDocumentForChecklistItem, type MasterFileOption } from "@/actions/applications";
import { Loader2, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AvailableMasterFiles {
  applicant: MasterFileOption[];
  organization: MasterFileOption[];
  supporter: MasterFileOption[];
}

const SOURCE_LABELS: Record<"applicant" | "organization" | "supporter", string> = {
  applicant: "申請人マスター",
  organization: "所属機関マスター",
  supporter: "扶養者",
};

export function MasterDocumentPicker({
  applicationId,
  itemId,
  slot,
  availableMasterFiles,
  onPrimaryApplied,
  onExtraApplied,
}: {
  applicationId: string;
  itemId: string;
  slot: "primary" | "extra";
  availableMasterFiles: AvailableMasterFiles;
  onPrimaryApplied?: (itemId: string, item: {
    fileUrl: string | null; fileName: string | null; fileSize: number | null; mimeType: string | null;
    status: string; fileSourcedFromMaster: boolean; fileSourcedFromMasterType: string | null;
  }) => void;
  onExtraApplied?: (itemId: string, file: {
    fileUrl: string; fileName: string; fileSize: number; mimeType: string;
    sourcedFromMaster: boolean; sourcedFromMasterType: "applicant" | "organization" | "supporter";
  }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const groups: { source: "applicant" | "organization" | "supporter"; files: MasterFileOption[] }[] = [
    { source: "applicant", files: availableMasterFiles.applicant },
    { source: "organization", files: availableMasterFiles.organization },
    { source: "supporter", files: availableMasterFiles.supporter },
  ].filter((g) => g.files.length > 0);

  if (groups.length === 0) return null;

  async function handleUse(source: "applicant" | "organization" | "supporter", file: MasterFileOption) {
    setApplyingId(file.id);
    setError("");
    try {
      const result = await useMasterDocumentForChecklistItem(applicationId, itemId, source, file.id, slot);
      if (!result.success) {
        setError(result.error ?? "反映に失敗しました");
        return;
      }
      if (slot === "primary" && result.item) onPrimaryApplied?.(itemId, result.item);
      if (slot === "extra" && result.addedFile) onExtraApplied?.(itemId, result.addedFile);
      setExpanded(false);
    } catch (err: any) {
      setError(err.message ?? "反映に失敗しました");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        マスターから選択
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-1 w-72 max-w-full bg-white border border-indigo-200 rounded-lg shadow-sm p-2 space-y-2">
          {groups.map((g) => (
            <div key={g.source}>
              <p className="text-[11px] font-semibold text-gray-500 mb-1">{SOURCE_LABELS[g.source]}</p>
              <div className="space-y-1">
                {g.files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                    <span className="truncate" title={f.label}>{f.label}</span>
                    <button
                      type="button"
                      disabled={applyingId === f.id}
                      onClick={() => handleUse(g.source, f)}
                      className={cn(
                        "flex-shrink-0 px-2 py-0.5 rounded text-white text-[11px]",
                        applyingId === f.id ? "bg-indigo-300" : "bg-indigo-600 hover:bg-indigo-700"
                      )}
                    >
                      {applyingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "この書類を使用"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {error && <p className="text-xs text-red-500 whitespace-pre-wrap">{error}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミットする**

```bash
git add src/components/applications/master-document-picker.tsx
git commit -m "feat: MasterDocumentPicker共通コンポーネントを新規作成

申請人・所属機関・扶養者マスターの利用可能な書類一覧を取得元別に
表示し、選択した書類をチェックリスト項目（1枚目または2枚目以降）に
反映するための共通UIコンポーネントを追加する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 申請案件詳細ページから一覧を取得し、`DocumentChecklist`に配線する

**Files:**
- Modify: `src/app/(dashboard)/applications/[id]/page.tsx`
- Modify: `src/components/applications/document-checklist.tsx`

- [ ] **Step 1: 申請案件詳細ページで一覧を取得する**

ファイル冒頭の既存import文（1行目付近、`@/actions/applications`から`getApplicationById, syncMasterDocumentsToChecklist, syncOrgMasterDocumentsToChecklist`をimportしている行）に`getAvailableMasterDocumentsForApplication`を追加する。

変更前:
```tsx
import { getApplicationById, syncMasterDocumentsToChecklist, syncOrgMasterDocumentsToChecklist } from "@/actions/applications";
```

変更後:
```tsx
import { getApplicationById, syncMasterDocumentsToChecklist, syncOrgMasterDocumentsToChecklist, getAvailableMasterDocumentsForApplication } from "@/actions/applications";
```

`const { application, applicant, organization, checklist } = data;`の直後（105行目付近）に以下を追加する。

変更前:
```tsx
  const { application, applicant, organization, checklist } = data;

  const effectiveForm = buildEffectiveFormData(application, applicant, organization);
```

変更後:
```tsx
  const { application, applicant, organization, checklist } = data;

  // チェックリストの「マスターから選択」用。既存のmasterDocuments（書類要件マスターの
  // カタログ）とは別概念のため、availableMasterFilesという別名で区別する。
  const availableMasterFiles = await getAvailableMasterDocumentsForApplication(application.id);

  const effectiveForm = buildEffectiveFormData(application, applicant, organization);
```

`<DocumentChecklist>`の呼び出し（469行目付近）に新しいpropを追加する。

変更前:
```tsx
        <DocumentChecklist
          checklist={checklist.map((c) => ({
```

変更後:
```tsx
        <DocumentChecklist
          availableMasterFiles={availableMasterFiles}
          checklist={checklist.map((c) => ({
```

- [ ] **Step 2: `DocumentChecklist`のpropsと型定義を拡張する**

変更前:
```tsx
interface DocumentChecklistProps {
  checklist: ChecklistItem[];
  applicationId: string;
  userRole?: string;
  applicationStatus: string;
}
```

変更後:
```tsx
interface DocumentChecklistProps {
  checklist: ChecklistItem[];
  applicationId: string;
  userRole?: string;
  applicationStatus: string;
  availableMasterFiles: AvailableMasterFiles;
}
```

ファイル冒頭のimportに追加する。

変更前:
```tsx
import { cn } from "@/lib/utils";
import { DocumentLink } from "@/components/applicants/document-viewer";
```

変更後:
```tsx
import { cn } from "@/lib/utils";
import { DocumentLink } from "@/components/applicants/document-viewer";
import { MasterDocumentPicker, type AvailableMasterFiles } from "./master-document-picker";
```

`AdditionalFile`インターフェースに`sourcedFromMaster`/`sourcedFromMasterType`を追加する。

変更前:
```tsx
interface AdditionalFile {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}
```

変更後:
```tsx
interface AdditionalFile {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sourcedFromMaster?: boolean;
  sourcedFromMasterType?: "applicant" | "organization" | "supporter";
}
```

`DocumentChecklist`関数の引数に`availableMasterFiles`を追加する。

変更前:
```tsx
export function DocumentChecklist({
  checklist,
  applicationId,
  userRole,
}: DocumentChecklistProps) {
```

変更後:
```tsx
export function DocumentChecklist({
  checklist,
  applicationId,
  userRole,
  availableMasterFiles,
}: DocumentChecklistProps) {
```

- [ ] **Step 3: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: `applications/[id]/page.tsx`のエラーは解消されるが、`document-checklist.tsx`内で`availableMasterFiles`が未使用（実際の配線はTask 5）という警告未満の状態であり、エラーにはならないことを確認する。`MasterDocumentPicker`/`AvailableMasterFiles`のimportが解決できることを確認する。

- [ ] **Step 4: コミットする**

```bash
git add "src/app/(dashboard)/applications/[id]/page.tsx" "src/components/applications/document-checklist.tsx"
git commit -m "feat: availableMasterFilesをDocumentChecklistに配線

申請案件詳細ページでgetAvailableMasterDocumentsForApplicationを
1回だけ呼び出し、DocumentChecklistにpropsとして渡す。既存の
masterDocuments（書類要件マスターのカタログ）とは別概念のため
availableMasterFilesという別名で区別する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: `ChecklistDropzone`・`ExtraFilesSection`に選択UI・バッジを組み込む

**Files:**
- Modify: `src/components/applications/document-checklist.tsx`

- [ ] **Step 1: `ChecklistFile`型に`sourcedFromMasterType`の`'supporter'`を許容する**

既存の`ChecklistFile`インターフェース（`fileSourcedFromMasterType?: string | null;`）は既に`string`型のため変更不要。バッジ表示ロジックのみ拡張する。

`ChecklistDropzone`内の既存バッジ表示を変更する。

変更前:
```tsx
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

変更後:
```tsx
          {file.fileSourcedFromMaster && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 whitespace-nowrap"
              title={
                file.fileSourcedFromMasterType === "organization"
                  ? "所属機関マスターに登録済みの書類が反映されました"
                  : file.fileSourcedFromMasterType === "supporter"
                  ? "扶養者の書類が反映されました"
                  : "申請人マスターに登録済みの書類が反映されました"
              }
            >
              {file.fileSourcedFromMasterType === "organization"
                ? "アップロード済み（所属機関マスターから反映）"
                : file.fileSourcedFromMasterType === "supporter"
                ? "アップロード済み（扶養者マスターから反映）"
                : file.fileSourcedFromMasterType === "applicant"
                ? "アップロード済み（申請人マスターから反映）"
                : "マスターから反映"}
            </span>
          )}
```

- [ ] **Step 2: `ChecklistDropzone`に`MasterDocumentPicker`（1枚目用）を組み込む**

`ChecklistDropzone`のpropsに`applicationId`/`availableMasterFiles`を追加し、未アップロード時の表示に`MasterDocumentPicker`を並べる。

変更前:
```tsx
const ChecklistDropzone = memo(function ChecklistDropzone({
  itemId,
  applicationId,
  documentName,
  file,
  onUploaded,
  onDeleted,
  onAiResult,
}: {
  itemId: string;
  applicationId: string;
  documentName: string;
  file: ChecklistFile;
  onUploaded: (targetItemId: string, file: UploadedFileResult, meta?: UploadMeta) => void;
  onDeleted: (itemId: string) => void;
  onAiResult: (result: AiFillResult) => void;
}) {
```

変更後:
```tsx
const ChecklistDropzone = memo(function ChecklistDropzone({
  itemId,
  applicationId,
  documentName,
  file,
  availableMasterFiles,
  onUploaded,
  onDeleted,
  onAiResult,
  onMasterApplied,
}: {
  itemId: string;
  applicationId: string;
  documentName: string;
  file: ChecklistFile;
  availableMasterFiles: AvailableMasterFiles;
  onUploaded: (targetItemId: string, file: UploadedFileResult, meta?: UploadMeta) => void;
  onDeleted: (itemId: string) => void;
  onAiResult: (result: AiFillResult) => void;
  onMasterApplied: (itemId: string, item: {
    fileUrl: string | null; fileName: string | null; fileSize: number | null; mimeType: string | null;
    status: string; fileSourcedFromMaster: boolean; fileSourcedFromMasterType: string | null;
  }) => void;
}) {
```

未アップロード時のドロップゾーン表示の直後に`MasterDocumentPicker`を追加する。

変更前:
```tsx
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const fl = Array.from(e.dataTransfer.files);
            if (fl.length) handleFiles(fl);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 border border-dashed rounded-lg px-2 py-1 cursor-pointer transition-colors text-xs",
            isDragging
              ? "border-blue-400 bg-blue-50 text-blue-600"
              : "border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:bg-blue-50/40",
            isUploading && "pointer-events-none opacity-60"
          )}
        >
          {isUploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /><span className="text-blue-600">アップロード中...</span></>
          ) : isDragging ? (
            <><Upload className="w-3.5 h-3.5" /><span>ここにドロップ</span></>
          ) : (
            <><Upload className="w-3.5 h-3.5" /><span>ドラッグ&amp;ドロップ または クリックで添付</span></>
          )}
        </div>
      )}
```

変更後:
```tsx
      ) : (
        <div className="inline-flex items-start gap-1.5 flex-wrap">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const fl = Array.from(e.dataTransfer.files);
              if (fl.length) handleFiles(fl);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 border border-dashed rounded-lg px-2 py-1 cursor-pointer transition-colors text-xs",
              isDragging
                ? "border-blue-400 bg-blue-50 text-blue-600"
                : "border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:bg-blue-50/40",
              isUploading && "pointer-events-none opacity-60"
            )}
          >
            {isUploading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /><span className="text-blue-600">アップロード中...</span></>
            ) : isDragging ? (
              <><Upload className="w-3.5 h-3.5" /><span>ここにドロップ</span></>
            ) : (
              <><Upload className="w-3.5 h-3.5" /><span>ドラッグ&amp;ドロップ または クリックで添付</span></>
            )}
          </div>
          <MasterDocumentPicker
            applicationId={applicationId}
            itemId={itemId}
            slot="primary"
            availableMasterFiles={availableMasterFiles}
            onPrimaryApplied={onMasterApplied}
          />
        </div>
      )}
```

- [ ] **Step 3: `ExtraFilesSection`にバッジ表示と`MasterDocumentPicker`（2枚目以降用）を組み込む**

変更前:
```tsx
const ExtraFilesSection = memo(function ExtraFilesSection({
  itemId,
  applicationId,
  documentName,
  extraFiles,
  onFileAdded,
  onFileDeleted,
  onAiResult,
}: {
  itemId: string;
  applicationId: string;
  documentName: string;
  extraFiles: AdditionalFile[];
  onFileAdded: (itemId: string, file: AdditionalFile) => void;
  onFileDeleted: (itemId: string, index: number) => void;
  onAiResult: (result: AiFillResult) => void;
}) {
```

変更後:
```tsx
const ExtraFilesSection = memo(function ExtraFilesSection({
  itemId,
  applicationId,
  documentName,
  extraFiles,
  availableMasterFiles,
  onFileAdded,
  onFileDeleted,
  onAiResult,
}: {
  itemId: string;
  applicationId: string;
  documentName: string;
  extraFiles: AdditionalFile[];
  availableMasterFiles: AvailableMasterFiles;
  onFileAdded: (itemId: string, file: AdditionalFile) => void;
  onFileDeleted: (itemId: string, index: number) => void;
  onAiResult: (result: AiFillResult) => void;
}) {
```

ファイル一覧の各行にバッジを追加する。

変更前:
```tsx
      {extraFiles.map((f, idx) => (
        <div key={idx} className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg pl-1.5 pr-1 py-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          {f.fileUrl && f.fileUrl !== "(uploaded)" ? (
            <DocumentLink
              url={f.fileUrl}
              fileName={f.fileName}
              documentType={documentName}
              className="text-xs text-green-700 hover:text-green-900 hover:underline truncate max-w-[160px]"
            >
              {f.fileName}
            </DocumentLink>
          ) : (
            <span className="text-xs text-green-700 truncate max-w-[160px]" title={f.fileName}>{f.fileName}</span>
          )}
          <button
            type="button"
            onClick={() => handleDelete(idx)}
            disabled={deletingIdx === idx}
            className="p-0.5 text-green-400 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
            title="削除"
          >
            {deletingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      ))}
```

変更後:
```tsx
      {extraFiles.map((f, idx) => (
        <div key={idx} className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg pl-1.5 pr-1 py-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          {f.fileUrl && f.fileUrl !== "(uploaded)" ? (
            <DocumentLink
              url={f.fileUrl}
              fileName={f.fileName}
              documentType={documentName}
              className="text-xs text-green-700 hover:text-green-900 hover:underline truncate max-w-[160px]"
            >
              {f.fileName}
            </DocumentLink>
          ) : (
            <span className="text-xs text-green-700 truncate max-w-[160px]" title={f.fileName}>{f.fileName}</span>
          )}
          {f.sourcedFromMaster && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 whitespace-nowrap">
              {f.sourcedFromMasterType === "organization"
                ? "所属機関マスターから反映"
                : f.sourcedFromMasterType === "supporter"
                ? "扶養者マスターから反映"
                : "申請人マスターから反映"}
            </span>
          )}
          <button
            type="button"
            onClick={() => handleDelete(idx)}
            disabled={deletingIdx === idx}
            className="p-0.5 text-green-400 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
            title="削除"
          >
            {deletingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      ))}
```

追加アップロードゾーンの直後に`MasterDocumentPicker`を追加する。

変更前:
```tsx
      {error && <p className="w-full text-xs text-red-500 mt-0.5 whitespace-pre-wrap max-w-[240px]">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={(e) => {
          const fl = Array.from(e.target.files ?? []);
          if (fl.length) { handleFiles(fl); e.target.value = ""; }
        }}
      />
    </div>
  );
});
```

変更後:
```tsx
      <MasterDocumentPicker
        applicationId={applicationId}
        itemId={itemId}
        slot="extra"
        availableMasterFiles={availableMasterFiles}
        onExtraApplied={onFileAdded}
      />

      {error && <p className="w-full text-xs text-red-500 mt-0.5 whitespace-pre-wrap max-w-[240px]">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={(e) => {
          const fl = Array.from(e.target.files ?? []);
          if (fl.length) { handleFiles(fl); e.target.value = ""; }
        }}
      />
    </div>
  );
});
```

（`onFileAdded`は既存の`(itemId: string, file: AdditionalFile) => void`シグネチャのままで、`MasterDocumentPicker`の`onExtraApplied`の引数型（`fileUrl/fileName/fileSize/mimeType/sourcedFromMaster/sourcedFromMasterType`を持つオブジェクト）は`AdditionalFile`の構造と一致するため、そのまま渡せる。）

- [ ] **Step 4: メインのレンダリング箇所で`availableMasterFiles`・`onMasterApplied`を渡す**

`handleFileUploaded`と同じパターンの新しいハンドラーを追加する。`handleFileUploaded`の直後に追加する。

変更前:
```tsx
  const handleFileDeleted = useCallback((itemId: string) => {
```

変更後:
```tsx
  const handleMasterApplied = useCallback((targetItemId: string, item: {
    fileUrl: string | null; fileName: string | null; fileSize: number | null; mimeType: string | null;
    status: string; fileSourcedFromMaster: boolean; fileSourcedFromMasterType: string | null;
  }) => {
    setLocalChecklist((prev) =>
      prev.map((i) => (i.id === targetItemId
        ? { ...i, fileUrl: item.fileUrl, fileName: item.fileName, fileSize: item.fileSize, mimeType: item.mimeType, status: item.status, fileSourcedFromMaster: item.fileSourcedFromMaster, fileSourcedFromMasterType: item.fileSourcedFromMasterType }
        : i))
    );
  }, []);

  const handleFileDeleted = useCallback((itemId: string) => {
```

`<ChecklistDropzone>`・`<ExtraFilesSection>`の呼び出しに新しいpropsを渡す。

変更前:
```tsx
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
                          fileSourcedFromMasterType: item.fileSourcedFromMasterType ?? null,
                        }}
                        onUploaded={handleFileUploaded}
                        onDeleted={handleFileDeleted}
                        onAiResult={handleAiResult}
                      />
                      {/* 1枚目が存在する場合のみ2枚目以降のUI */}
                      {item.fileName && (
                        <ExtraFilesSection
                          itemId={item.id}
                          applicationId={applicationId}
                          documentName={item.documentName}
                          extraFiles={item.additionalFiles ?? []}
                          onFileAdded={handleExtraFileAdded}
                          onFileDeleted={handleExtraFileDeleted}
                          onAiResult={handleAiResult}
                        />
                      )}
```

変更後:
```tsx
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
                          fileSourcedFromMasterType: item.fileSourcedFromMasterType ?? null,
                        }}
                        availableMasterFiles={availableMasterFiles}
                        onUploaded={handleFileUploaded}
                        onDeleted={handleFileDeleted}
                        onAiResult={handleAiResult}
                        onMasterApplied={handleMasterApplied}
                      />
                      {/* 1枚目が存在する場合のみ2枚目以降のUI */}
                      {item.fileName && (
                        <ExtraFilesSection
                          itemId={item.id}
                          applicationId={applicationId}
                          documentName={item.documentName}
                          extraFiles={item.additionalFiles ?? []}
                          availableMasterFiles={availableMasterFiles}
                          onFileAdded={handleExtraFileAdded}
                          onFileDeleted={handleExtraFileDeleted}
                          onAiResult={handleAiResult}
                        />
                      )}
```

- [ ] **Step 5: TypeScriptの型チェックを確認する**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 6: コミットする**

```bash
git add "src/components/applications/document-checklist.tsx"
git commit -m "feat: チェックリストの1枚目・2枚目以降にマスター書類選択UIを組み込む

ChecklistDropzone（1枚目）・ExtraFilesSection（2枚目以降）の両方に
MasterDocumentPickerを組み込み、申請人・所属機関・扶養者マスターの
既存書類を選択して反映できるようにする。2枚目以降のバッジ表示も
追加する（従来は表示されていなかった）。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: ビルド確認・手動テスト・デプロイ・報告

**Files:** なし（検証のみ）

- [ ] **Step 1: フルビルドを実行する**

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: 全ルートがエラーなくビルドされる。

- [ ] **Step 2: 手動機能テストの確認項目を整理する（実際の確認はユーザーに依頼）**

1. 所属機関マスター・扶養者（`supporterId`）の両方が設定された申請を開き、チェックリストの未アップロード項目で「マスターから選択」を開くと、申請人マスター・所属機関マスター・扶養者の3グループ（取得可能な書類がある場合のみ）が表示されることを確認する。
2. `organizationId`未設定の申請では所属機関グループが表示されないこと、`supporterId`未設定の申請では扶養者グループが表示されないことを確認する。
3. 申請人マスターの書類を1枚目に反映し、「アップロード済み（申請人マスターから反映）」バッジが表示されることを確認する。
4. 既に1枚目がある項目で「2枚目を追加」の横の「マスターから選択」から扶養者の書類を追加し、「（扶養者マスターから反映）」バッジが2枚目側にも表示されることを確認する。
5. マスターから反映した書類を削除しても、元のマスター側のファイルが削除されないことを確認する（既存の`sourcedFromMaster`保護ロジックの回帰確認）。
6. 既存の新規アップロード（ドロップイン）・AI自動入力が従来通り動作することを確認する（回帰確認）。

- [ ] **Step 3: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 4: 本番環境にデプロイする**

```bash
npx vercel --prod
```

- [ ] **Step 5: ユーザーに報告する**

Step2で整理した手動テスト項目（実際の確認はユーザー自身に依頼する旨を明記）を報告する。
