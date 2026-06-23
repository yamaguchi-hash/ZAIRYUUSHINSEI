"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Loader2, FileText, Eye, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { saveOrganizationDocument, deleteOrganizationDocument } from "@/actions/organization-documents";
import { DocumentLink, isImageFile } from "@/components/applicants/document-viewer";
import { VISA_TYPE_LABELS, ORG_RELEVANT_VISA_TYPES } from "@/lib/utils";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { cn } from "@/lib/utils";

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
  // 既に書類がある区分は開いた状態で初期表示し、空の区分は折りたたんでおく
  // （所属機関が必要としない区分が多いため、空のカードで画面が埋まらないようにする）
  const [isExpanded, setIsExpanded] = useState(documents.length > 0);

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
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-sm">
            {title}
            {documents.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">（{documents.length}件）</span>
            )}
          </CardTitle>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
      </CardHeader>
      {isExpanded && (
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
        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
      )}
    </Card>
  );
}
