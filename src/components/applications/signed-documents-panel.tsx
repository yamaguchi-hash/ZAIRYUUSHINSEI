"use client";

import { useState } from "react";
import { Loader2, Upload, Download, Trash2, File, CheckCircle, User, Building2, Briefcase } from "lucide-react";

type DocumentType = "applicant" | "organization" | "gaikatsu";

interface SignedDoc {
  url: string;
  fileName: string;
  uploadedAt: string;
  documentType?: DocumentType;
}

interface Props {
  applicationId: string;
  signedDocs?: SignedDoc[];
  applicationStatus?: string;
}

const DOC_TYPE_CONFIG = {
  applicant: {
    label: "申請人用",
    icon: User,
    color: "bg-blue-50 border-blue-200",
    textColor: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  organization: {
    label: "所属機関用",
    icon: Building2,
    color: "bg-green-50 border-green-200",
    textColor: "text-green-700",
    bgColor: "bg-green-100",
  },
  gaikatsu: {
    label: "資格外活動許可申請書",
    icon: Briefcase,
    color: "bg-purple-50 border-purple-200",
    textColor: "text-purple-700",
    bgColor: "bg-purple-100",
  },
};

export function SignedDocumentsPanel({
  applicationId,
  signedDocs = [],
  applicationStatus,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType>("applicant");
  const [error, setError] = useState("");

  const isCompleted = applicationStatus === "completed";

  // ドキュメントをタイプごとに分類
  const docsByType = {
    applicant: signedDocs.filter((d) => !d.documentType || d.documentType === "applicant"),
    organization: signedDocs.filter((d) => d.documentType === "organization"),
    gaikatsu: signedDocs.filter((d) => d.documentType === "gaikatsu"),
  };

  async function handleUpload(file: File) {
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", selectedType);

      const response = await fetch(`/api/applications/${applicationId}/upload-signed-document`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("ファイルアップロードに失敗しました");
      }

      // アップロード成功後、ページをリロード
      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docUrl: string) {
    if (!confirm("この署名済み申請書を削除しますか？")) return;

    try {
      const response = await fetch(`/api/applications/${applicationId}/delete-signed-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: docUrl }),
      });

      if (!response.ok) {
        throw new Error("削除に失敗しました");
      }

      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "削除に失敗しました");
    }
  }

  const renderDocumentSection = (type: DocumentType, docs: SignedDoc[]) => {
    const config = DOC_TYPE_CONFIG[type];
    const Icon = config.icon;

    return (
      <div key={type} className={`border rounded-lg p-4 ${config.color}`}>
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`w-4 h-4 ${config.textColor}`} />
          <h4 className={`font-semibold text-sm ${config.textColor}`}>
            {config.label}
          </h4>
          {docs.length > 0 && (
            <span className={`ml-auto text-xs ${config.textColor}`}>{docs.length}件</span>
          )}
        </div>

        {docs.length === 0 ? (
          <p className="text-xs text-gray-400">まだアップロードされていません</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.url}
                className="flex items-center justify-between p-2 bg-white rounded border border-gray-100 hover:border-gray-300"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <File className={`w-3.5 h-3.5 shrink-0 ${config.textColor}`} />
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-xs font-medium ${config.textColor} hover:underline truncate`}
                      title={doc.fileName}
                    >
                      {doc.fileName}
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(doc.uploadedAt).toLocaleString("ja-JP")}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <a
                    href={doc.url}
                    download
                    title="ダウンロード"
                    className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {!isCompleted && (
                    <button
                      onClick={() => handleDelete(doc.url)}
                      title="削除"
                      className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="border border-teal-200 rounded-xl bg-teal-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-teal-200 bg-teal-100">
        <CheckCircle className="w-4 h-4 text-teal-700" />
        <span className="text-sm font-semibold text-teal-800">署名済み申請書</span>
        {signedDocs.length > 0 && (
          <span className="ml-auto text-xs text-teal-600">{signedDocs.length}件</span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-teal-600">
          申請人や所属機関から署名を貰った申請書類（PDF）をアップロードして保存します。
        </p>

        {/* アップロード */}
        {!isCompleted && (
          <div className="bg-white border border-teal-200 rounded-lg p-3 space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              書類タイプを選択してください
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as DocumentType)}
              disabled={uploading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 disabled:bg-gray-100"
            >
              <option value="applicant">👤 申請人用</option>
              <option value="organization">🏢 所属機関用</option>
              <option value="gaikatsu">💼 資格外活動許可申請書</option>
            </select>

            <label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) handleUpload(f);
                }}
                disabled={uploading}
                className="hidden"
              />
              <span className={`block text-center py-2 px-3 rounded-lg cursor-pointer text-xs font-medium transition-colors ${
                uploading
                  ? "bg-teal-200 text-teal-700"
                  : "bg-teal-100 text-teal-700 hover:bg-teal-200"
              }`}>
                {uploading
                  ? <>アップロード中...</>
                  : <><Upload className="w-3.5 h-3.5 inline mr-1" />PDF をアップロード</>}
              </span>
            </label>
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* ドキュメント一覧（タイプ別） */}
        <div className="space-y-3">
          {renderDocumentSection("applicant", docsByType.applicant)}
          {renderDocumentSection("organization", docsByType.organization)}
          {renderDocumentSection("gaikatsu", docsByType.gaikatsu)}
        </div>
      </div>
    </div>
  );
}
