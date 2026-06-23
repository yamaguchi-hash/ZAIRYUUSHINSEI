# 所属機関マスターのドロップイン化 ＋ チェックリスト即時反映 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 所属機関マスターの書類アップロードUIをドラッグ&ドロップ対応にし、既存書類への直接ドロップで上書きできるようにする。(2) 申請案件チェックリストに手動で新規項目を追加した際、既存のマスター照合ロジックを再利用してリアルタイムに（画面リロードなしで）自動反映する。

**Architecture:** 既存の`document-upload-zone.tsx`にあるドラッグ&ドロップの見た目・操作ロジックを、新規の共通プレゼンテーショナルコンポーネント`FileDropzone`として切り出し、`DocumentUploadZone`（申請人マスター側）をそれを使うように軽量リファクタしつつ、`organization-documents-panel.tsx`（所属機関マスター側）にも適用する。チェックリスト側は、既存の`syncMasterDocumentsToChecklist`・`syncOrgMasterDocumentsToChecklist`（表記揺れ対応のマッチングロジック込み）を`addCustomDocumentToChecklist`から追加で呼び出し、新規行のマッチ結果をアクションの戻り値に含めてクライアントに即時反映させる。

**Tech Stack:** Next.js 16 App Router、TypeScript、React（Server Actions）、Drizzle ORM。自動テストフレームワークは未導入のため、検証は`npx tsc --noEmit`＋`npm run build`＋ブラウザでの手動機能確認で行う。

参考設計書: [docs/superpowers/specs/2026-06-23-org-doc-dropzone-and-checklist-realtime-sync-design.md](../specs/2026-06-23-org-doc-dropzone-and-checklist-realtime-sync-design.md)

---

## タスクグループA：所属機関マスターのドロップイン化

### TaskA1: 共通FileDropzoneコンポーネントを新規作成

**Files:**
- Create: `src/components/ui/file-dropzone.tsx`

- [ ] **Step 1: ファイルを新規作成する**

`src/components/ui/file-dropzone.tsx`を以下の内容で新規作成する。

```tsx
"use client";

import { useRef, useState, type ReactNode } from "react";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,application/pdf";

interface FileDropzoneProps {
  label: string;
  description?: string;
  accept?: string;
  isUploading: boolean;
  uploadingLabel?: string;
  onFile: (file: File) => void;
  className?: string;
  children?: ReactNode;
}

/**
 * クリック選択とドラッグ&ドロップの両方に対応した汎用アップロード枠。
 * 保存・削除等のデータ処理は呼び出し元が onFile コールバックで行う
 * （このコンポーネント自身はファイル選択UIの見た目と操作のみを担当する）。
 */
export function FileDropzone({
  label,
  description,
  accept,
  isUploading,
  uploadingLabel,
  onFile,
  className,
  children,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex items-center gap-3 border-2 border-dashed rounded-lg px-3 py-2.5 cursor-pointer transition-colors select-none",
        isDragging
          ? "border-blue-400 bg-blue-50"
          : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/40",
        isUploading && "pointer-events-none opacity-60",
        className
      )}
    >
      {isUploading ? (
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
      ) : (
        <Upload className="w-4 h-4 text-gray-300 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
        {description && (
          <p className="text-[10px] text-gray-400 truncate">
            {isUploading ? (uploadingLabel ?? "アップロード中...") : description}
          </p>
        )}
      </div>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? DEFAULT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/components/ui/file-dropzone.tsx
git commit -m "feat: 共通のFileDropzoneコンポーネントを新規作成

クリック選択とドラッグ&ドロップの両方に対応した汎用アップロード枠。
document-upload-zone.tsxにある既存のドラッグ&ドロップの見た目・操作ロジックを
切り出し、所属機関マスター側でも同じ操作感を再利用できるようにする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### TaskA2: DocumentUploadZoneをFileDropzone利用に書き換え

**Files:**
- Modify: `src/components/applicants/document-upload-zone.tsx`

- [ ] **Step 1: importを追加する**

`src/components/applicants/document-upload-zone.tsx`の先頭のimport群に以下を追加する。

変更前:
```tsx
import { useRef, useState } from "react";
import { saveApplicantDocument, deleteApplicantDocument } from "@/actions/ocr";
import { Upload, X, CheckCircle, Loader2, FileText, Eye, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentLink, isImageFile } from "./document-viewer";
```

変更後:
```tsx
import { useRef, useState } from "react";
import { saveApplicantDocument, deleteApplicantDocument } from "@/actions/ocr";
import { X, CheckCircle, Loader2, FileText, Eye, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentLink, isImageFile } from "./document-viewer";
import { FileDropzone } from "@/components/ui/file-dropzone";
```

（`Upload`アイコンは`FileDropzone`内部で使われるため、このファイル側のimportからは外す）

- [ ] **Step 2: 「未アップロード」分岐をFileDropzoneの呼び出しに置き換える**

未アップロード時のJSX（"／*** 未アップロード: コンパクトなインライン型ドロップゾーン ***／"のコメントがある箇所）を変更する。

変更前:
```tsx
      ) : (
        /* ─── 未アップロード: コンパクトなインライン型ドロップゾーン ─── */
        <div
          className={cn(
            "flex items-center gap-3 border-2 border-dashed rounded-lg px-3 py-2.5 cursor-pointer transition-colors select-none",
            isDragging
              ? "border-blue-400 bg-blue-50"
              : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/40",
            isUploading && "pointer-events-none opacity-60"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
          ) : (
            <Upload className="w-4 h-4 text-gray-300 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
            <p className="text-[10px] text-gray-400 truncate">
              {isUploading
                ? "アップロード中..."
                : `${description}　·　クリックまたはドラッグ＆ドロップ`}
            </p>
          </div>
          <span className="text-[10px] text-gray-300 flex-shrink-0 hidden sm:inline">
            JPEG · PNG · PDF
          </span>
        </div>
      )}
```

変更後:
```tsx
      ) : (
        /* ─── 未アップロード: コンパクトなインライン型ドロップゾーン ─── */
        <FileDropzone
          label={label}
          description={`${description}　·　クリックまたはドラッグ＆ドロップ`}
          isUploading={isUploading}
          onFile={handleFile}
        >
          <span className="text-[10px] text-gray-300 flex-shrink-0 hidden sm:inline">
            JPEG · PNG · PDF
          </span>
        </FileDropzone>
      )}
```

- [ ] **Step 3: 不要になったisDragging stateを削除する**

`const [isDragging, setIsDragging] = useState(false);`の行を削除する（`FileDropzone`が自身のドラッグ状態を内部で管理するため、`DocumentUploadZone`側ではもう使われない）。

変更前:
```tsx
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
```

変更後:
```tsx
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
```

- [ ] **Step 4: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし（`isDragging`/`setIsDragging`が他の場所で使われていないこと、`inputRef`は「アップロード済み」分岐の「差し替え」ボタンとファイル末尾の共通`<input ref={inputRef}>`で引き続き使われているため残すこと、を確認する）

- [ ] **Step 5: コミット**

```bash
git add src/components/applicants/document-upload-zone.tsx
git commit -m "refactor: DocumentUploadZoneをFileDropzone利用に書き換え

ドラッグ&ドロップの見た目・操作ロジックを共通コンポーネントに統一する。
「アップロード済み」分岐の差し替えボタン・削除ボタンの動作は変更しない。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### TaskA3: organization-documents-panel.tsx の新規追加枠をFileDropzone化

**Files:**
- Modify: `src/components/organizations/organization-documents-panel.tsx`

- [ ] **Step 1: importを変更する**

ファイル先頭のimport群を変更する（`FileDropzone`・`cn`を追加し、不要になる`Plus`を削除する）。

変更前:
```tsx
import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Loader2, FileText, Eye, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { saveOrganizationDocument, deleteOrganizationDocument } from "@/actions/organization-documents";
import { DocumentLink, isImageFile } from "@/components/applicants/document-viewer";
import { VISA_TYPE_LABELS, ORG_RELEVANT_VISA_TYPES } from "@/lib/utils";
```

変更後:
```tsx
import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Loader2, FileText, Eye, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { saveOrganizationDocument, deleteOrganizationDocument } from "@/actions/organization-documents";
import { DocumentLink, isImageFile } from "@/components/applicants/document-viewer";
import { VISA_TYPE_LABELS, ORG_RELEVANT_VISA_TYPES } from "@/lib/utils";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { cn } from "@/lib/utils";
```

（`Plus`は新規追加枠の見た目を`FileDropzone`に置き換えるため不要になり削除する。`Loader2`は既存書類行の削除中アイコンとして引き続き使われるため残す。）

- [ ] **Step 2: handleFileSelectedを共通アップロード処理として整理する**

`DocumentCategorySection`内の`handleFileSelected`関数を変更する。

変更前:
```tsx
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
```

変更後:
```tsx
  async function uploadAndSave(file: File, name: string) {
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
      documentName: name,
      fileUrl: url,
      fileName,
      fileSize,
      mimeType,
    });
    onAdded({ id: saved.id, visaType: saved.visaType, documentName: saved.documentName, fileUrl: saved.fileUrl, fileName: saved.fileName });
  }

  function handleFileSelected(file: File) {
    if (!docName.trim()) {
      setError("先に書類名を入力してください");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await uploadAndSave(file, docName.trim());
        setDocName("");
      } catch (err: any) {
        setError(err.message ?? "アップロードに失敗しました");
      }
    });
  }

  function handleReplace(doc: OrgDoc, file: File) {
    setError("");
    startTransition(async () => {
      try {
        await uploadAndSave(file, doc.documentName);
      } catch (err: any) {
        setError(err.message ?? "アップロードに失敗しました");
      }
    });
  }
```

- [ ] **Step 3: 新規追加用UIをFileDropzoneに置き換える**

書類名入力＋「追加」ボタンのJSXを変更する。

変更前:
```tsx
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
```

変更後:
```tsx
        <div className="space-y-1.5 pt-1">
          <input
            type="text"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="書類名（例: 登記事項証明書）"
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
          />
          <FileDropzone
            label="ファイルをドラッグ＆ドロップ、またはクリックして選択"
            description="JPEG・PNG・PDF対応"
            isUploading={isPending}
            onFile={handleFileSelected}
          />
        </div>
```

- [ ] **Step 4: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: 現時点ではまだ`handleReplace`が未使用のため警告が出る可能性があるが、エラーにはならないことを確認する（TaskA4で使用箇所を追加する）。`Plus`importを削除したことで未使用import起因のエラーが出ないことを確認する。

- [ ] **Step 5: コミット**

```bash
git add src/components/organizations/organization-documents-panel.tsx
git commit -m "feat: 所属機関マスターの新規書類追加をドラッグ&ドロップ対応に変更

FileDropzoneを使い、書類名入力後にファイルをドラッグ&ドロップ、
または従来通りクリックして選択できるようにする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### TaskA4: 既存書類行への直接ドロップで上書き

**Files:**
- Modify: `src/components/organizations/organization-documents-panel.tsx`

- [ ] **Step 1: ExistingDocumentRowコンポーネントを新規追加する**

`DocumentCategorySection`関数の直前（ファイル内のどこでもよいが、`DocumentCategorySection`の直前を推奨）に、以下の新しい関数コンポーネントを追加する。

```tsx
function ExistingDocumentRow({
  doc,
  isPending,
  onReplace,
  onDelete,
}: {
  doc: OrgDoc;
  isPending: boolean;
  onReplace: (file: File) => void;
  onDelete: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (confirm(`「${doc.fileName}」を新しいファイルに上書きしますか？`)) {
          onReplace(file);
        }
      }}
      className={cn(
        "flex items-center gap-2 border rounded-lg px-3 py-2 transition-colors",
        isDragging ? "border-blue-400 bg-blue-50" : "bg-gray-50 border-gray-100"
      )}
    >
      <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{doc.documentName}</p>
        {isDragging ? (
          <p className="text-xs text-blue-600">ここにドロップして上書き</p>
        ) : (
          <DocumentLink
            url={doc.fileUrl}
            fileName={doc.fileName}
            documentType={doc.documentName}
            className="text-xs text-gray-500 hover:text-blue-600 truncate flex items-center gap-1 text-left"
          >
            <span className="truncate">{doc.fileName}</span>
            {isImageFile(doc.fileName) ? <Eye className="w-3 h-3 text-gray-300 flex-shrink-0" /> : <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />}
          </DocumentLink>
        )}
      </div>
      <button
        onClick={onDelete}
        disabled={isPending}
        className="p-0.5 text-gray-300 hover:text-red-500 disabled:opacity-50 flex-shrink-0"
        title="削除"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 既存書類一覧のレンダリングをExistingDocumentRowの利用に置き換える**

`DocumentCategorySection`内の、既存書類を一覧表示している`documents.map(...)`部分を変更する。

変更前:
```tsx
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
```

変更後:
```tsx
          documents.map((doc) => (
            <ExistingDocumentRow
              key={doc.id}
              doc={doc}
              isPending={isPending}
              onReplace={(file) => handleReplace(doc, file)}
              onDelete={() => handleDelete(doc.id)}
            />
          ))
```

- [ ] **Step 3: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし。TaskA3で追加した`handleReplace`がここで使用されるため、未使用警告も解消される。

- [ ] **Step 4: コミット**

```bash
git add src/components/organizations/organization-documents-panel.tsx
git commit -m "feat: 所属機関マスターの既存書類行への直接ドロップで上書き対応

既存の書類行にファイルを直接ドラッグ&ドロップすると、確認ダイアログを
経て同じ書類名のまま新しいファイルに置き換えられるようにする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## タスクグループB：チェックリスト手動追加時のリアルタイム自動反映

### TaskB1: addCustomDocumentToChecklistを拡張

**Files:**
- Modify: `src/actions/applications.ts:826-861`

- [ ] **Step 1: 戻り値の型と本体を変更する**

`addCustomDocumentToChecklist`関数全体を以下のように変更する。

変更前:
```ts
// ── カスタム書類をチェックリストに直接追加 ────────────────────────────────────
export async function addCustomDocumentToChecklist(
  applicationId: string,
  documentName: string
): Promise<{ success: boolean; error?: string; newItemId?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    if (!documentName.trim()) return { success: false, error: "書類名を入力してください" };

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const [inserted] = await db
      .insert(applicationDocumentChecklist)
      .values({
        applicationId,
        documentRequirementId: null,
        documentName: documentName.trim(),
        isRequiredByExpert: true,
        status: "not_submitted",
      })
      .returning({ id: applicationDocumentChecklist.id });

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, newItemId: inserted.id };
  } catch (err: any) {
    return { success: false, error: err.message ?? "追加に失敗しました" };
  }
}
```

変更後:
```ts
// ── カスタム書類をチェックリストに直接追加 ────────────────────────────────────
export async function addCustomDocumentToChecklist(
  applicationId: string,
  documentName: string
): Promise<{
  success: boolean;
  error?: string;
  newItemId?: string;
  /** マスター同期処理後の最新の状態（マッチした場合はファイル情報込み）。
   *  画面リロードなしでチェックリスト表示を即時更新するために使う。 */
  item?: {
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    status: string;
    fileSourcedFromMaster: boolean;
    fileSourcedFromMasterType: string | null;
  };
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    if (!documentName.trim()) return { success: false, error: "書類名を入力してください" };

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const [inserted] = await db
      .insert(applicationDocumentChecklist)
      .values({
        applicationId,
        documentRequirementId: null,
        documentName: documentName.trim(),
        isRequiredByExpert: true,
        status: "not_submitted",
      })
      .returning({ id: applicationDocumentChecklist.id });

    // 追加直後にマスターとの自動反映を試みる（画面リロード不要にするため）。
    // 両関数とも「未提出の全項目」を対象にするため、今INSERTした新規行も対象に含まれる。
    await syncMasterDocumentsToChecklist(applicationId);
    await syncOrgMasterDocumentsToChecklist(applicationId);

    const [updated] = await db
      .select({
        fileUrl: applicationDocumentChecklist.fileUrl,
        fileName: applicationDocumentChecklist.fileName,
        fileSize: applicationDocumentChecklist.fileSize,
        mimeType: applicationDocumentChecklist.mimeType,
        status: applicationDocumentChecklist.status,
        fileSourcedFromMaster: applicationDocumentChecklist.fileSourcedFromMaster,
        fileSourcedFromMasterType: applicationDocumentChecklist.fileSourcedFromMasterType,
      })
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.id, inserted.id))
      .limit(1);

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, newItemId: inserted.id, item: updated };
  } catch (err: any) {
    return { success: false, error: err.message ?? "追加に失敗しました" };
  }
}
```

- [ ] **Step 2: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし（`syncMasterDocumentsToChecklist`・`syncOrgMasterDocumentsToChecklist`は同ファイル内で既に定義済みのため追加importは不要）

- [ ] **Step 3: コミット**

```bash
git add src/actions/applications.ts
git commit -m "feat: addCustomDocumentToChecklistでマスター即時反映を実行

新規項目をINSERTした直後に既存のsyncMasterDocumentsToChecklist・
syncOrgMasterDocumentsToChecklistを呼び出し、マッチ結果を含めた
最新状態を戻り値に含める。表記揺れ対応のマッチングロジックは
既存実装をそのまま再利用する。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### TaskB2: document-checklist.tsx の handleAddCustomDoc を更新

**Files:**
- Modify: `src/components/applications/document-checklist.tsx:631-664`

- [ ] **Step 1: handleAddCustomDocを変更する**

変更前:
```tsx
  async function handleAddCustomDoc() {
    const name = customDocName.trim();
    if (!name) { setCustomDocError("書類名を入力してください"); return; }
    setCustomDocError("");
    setIsAddingCustom(true);
    try {
      const result = await addCustomDocumentToChecklist(applicationId, name);
      if (result.success && result.newItemId) {
        const newEntry: ChecklistItem = {
          id: result.newItemId,
          documentName: name,
          documentRequirementId: null,
          isRequiredByExpert: true,
          status: "not_submitted",
          expertNotes: null,
          ocrExtractedData: null,
          masterDescription: null,
          masterSortOrder: 9999,
          createdAt: new Date().toISOString(),
          fileUrl: null,
          fileName: null,
          fileSize: null,
          mimeType: null,
        };
        setLocalChecklist(prev => [...prev, newEntry]);
        setCustomDocName("");
        customDocInputRef.current?.focus();
      } else {
        setCustomDocError(result.error ?? "追加に失敗しました");
      }
    } finally {
      setIsAddingCustom(false);
    }
  }
```

変更後:
```tsx
  async function handleAddCustomDoc() {
    const name = customDocName.trim();
    if (!name) { setCustomDocError("書類名を入力してください"); return; }
    setCustomDocError("");
    setIsAddingCustom(true);
    try {
      const result = await addCustomDocumentToChecklist(applicationId, name);
      if (result.success && result.newItemId) {
        const newEntry: ChecklistItem = {
          id: result.newItemId,
          documentName: name,
          documentRequirementId: null,
          isRequiredByExpert: true,
          status: result.item?.status ?? "not_submitted",
          expertNotes: null,
          ocrExtractedData: null,
          masterDescription: null,
          masterSortOrder: 9999,
          createdAt: new Date().toISOString(),
          fileUrl: result.item?.fileUrl ?? null,
          fileName: result.item?.fileName ?? null,
          fileSize: result.item?.fileSize ?? null,
          mimeType: result.item?.mimeType ?? null,
          fileSourcedFromMaster: result.item?.fileSourcedFromMaster ?? false,
          fileSourcedFromMasterType: result.item?.fileSourcedFromMasterType ?? null,
        };
        setLocalChecklist(prev => [...prev, newEntry]);
        setCustomDocName("");
        customDocInputRef.current?.focus();
      } else {
        setCustomDocError(result.error ?? "追加に失敗しました");
      }
    } finally {
      setIsAddingCustom(false);
    }
  }
```

- [ ] **Step 2: TypeScriptの型チェックを確認**

Run: `npx tsc --noEmit`
Expected: エラーなし。`ChecklistItem`インターフェース（同ファイル39〜57行目）には既に`fileSourcedFromMaster?: boolean`・`fileSourcedFromMasterType?: string | null`が定義済みのため、型エラーは出ないことを確認する。

- [ ] **Step 3: コミット**

```bash
git add src/components/applications/document-checklist.tsx
git commit -m "feat: チェックリスト手動追加時にマスター反映結果を即時表示

addCustomDocumentToChecklistの戻り値（マッチ済みならファイル情報込み）を
そのままローカルStateに反映することで、画面リロードなしで
「アップロード済み（マスターから反映）」バッジが即座に表示されるようにする。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## TaskFinal: ビルド確認・手動テスト・デプロイ・報告

**Files:** なし（検証のみ）

- [ ] **Step 1: フルビルドを実行する**

Run: `npm run build`

OneDriveの同期ロックにより`EPERM: operation not permitted, unlink '...\.next\static\...'`で失敗する場合は、`.next`ディレクトリを削除して再実行する（このプロジェクトで既知の問題）。

```bash
rm -rf .next
rm -rf .next
npm run build
```

Expected: 全ルートがエラーなくビルドされる。

- [ ] **Step 2: 手動機能テストの確認項目を整理する（実際のクリック操作はユーザー確認を依頼）**

以下を確認用チェックリストとして整理し、報告時にユーザーへ依頼する：

1. 所属機関マスター詳細ページ（`/organizations/[id]`）を開き、書類名を入力した状態でファイルを「追加」枠にドラッグ→枠線の色が変わり「ここにドロップ」相当の表示になることを確認する。
2. ドロップして、アップロードが成功し、ファイル名とプレビューリンクが表示されることを確認する。
3. 既にアップロード済みの書類行に別のファイルを直接ドラッグ&ドロップ→確認ダイアログが表示され、OKすると上書きされて新しいファイル名がその場で表示されることを確認する。
4. クリックでのファイル選択（従来方式）も引き続き動作することを確認する。
5. 申請人マスター側（OCRパネル、パスポート・在留カードのアップロード）が、リファクタ後も従来通り動作することを確認する。
6. 案件詳細ページのチェックリストで、所属機関マスターまたは申請人マスターに既に登録されている書類名（または表記揺れのある類似名）を「追加書類をチェックリストに追加」欄から追加する→画面をリロードせずに「アップロード済み（マスターから反映）」バッジ付きで即座に表示されることを確認する。
7. マスターに該当書類が無い名前を追加した場合は、従来通り空のプレースホルダー行として追加されることを確認する。

- [ ] **Step 3: 一時ファイルを削除する**

```bash
rm -f dev.log dev-test.log
```

（開発サーバー起動時に生成されたログファイルが残っている場合のみ）

- [ ] **Step 4: featureブランチにpushする**

```bash
git push origin feature/pdf-split-and-org-master
```

- [ ] **Step 5: 本番環境にデプロイする**

```bash
npx vercel --prod
```

Expected: `https://zairyu-shinsei-system.vercel.app` に正常デプロイされる。

- [ ] **Step 6: ユーザーに報告する**

以下を含めて報告する：
- タスク1で変更・新規作成したファイル一覧（`FileDropzone`新規作成、`DocumentUploadZone`リファクタ、`organization-documents-panel.tsx`の2変更）
- タスク2でマスター即時反映を行っているコード箇所（`addCustomDocumentToChecklist`内の`syncMasterDocumentsToChecklist`・`syncOrgMasterDocumentsToChecklist`呼び出し、`document-checklist.tsx`の`handleAddCustomDoc`）
- Step 2で整理した手動テスト手順（実際の操作はユーザー自身による確認を依頼する旨を明記する）
