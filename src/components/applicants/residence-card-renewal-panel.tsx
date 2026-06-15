"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { previewResidenceCardRenewal, confirmResidenceCardRenewal } from "@/actions/ocr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload, Loader2, Sparkles, CheckCircle, AlertCircle, X, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  applicantId: string;
}

type Stage = "idle" | "processing" | "review" | "saving";

interface PreviewState {
  residenceCardNumber: string;
  currentVisaExpiry: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  raw: Record<string, any>;
}

export function ResidenceCardRenewalPanel({ applicantId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);

  async function handleFile(file: File) {
    setError("");
    setSuccessMsg("");
    setStage("processing");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "アップロードに失敗しました");
      }
      const { url, fileName, fileSize, mimeType } = await res.json();

      const result = await previewResidenceCardRenewal(url, mimeType);

      setPreview({
        residenceCardNumber: result.residenceCardNumber,
        currentVisaExpiry: result.currentVisaExpiry,
        fileUrl: url,
        fileName,
        fileSize,
        mimeType,
        raw: result.raw,
      });
      setStage("review");
    } catch (err: any) {
      setError(err.message ?? "処理に失敗しました");
      setStage("idle");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setStage("saving");
    setError("");
    try {
      await confirmResidenceCardRenewal(applicantId, preview);
      setSuccessMsg("在留カード番号・在留期限を更新しました");
      setPreview(null);
      setStage("idle");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "更新に失敗しました");
      setStage("review");
    }
  }

  function handleCancel() {
    setPreview(null);
    setError("");
    setStage("idle");
  }

  const isPdf = preview?.fileName.toLowerCase().endsWith(".pdf");
  const isProcessing = stage === "processing";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="w-4 h-4 text-teal-600" />
          在留カードの更新
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          更新後の新しい在留カード（表面）をアップロードすると、AIが「在留カード番号」と「在留期間満了日」を自動で読み取ります。内容を確認のうえマスターを更新できます。
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {successMsg && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> {successMsg}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p>{error}</p>
              {error.includes("GEMINI_API_KEY") && (
                <p className="text-xs mt-1 text-red-500">GEMINI_API_KEY を環境変数に設定してください。</p>
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            "border-2 border-dashed rounded-xl py-8 px-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center",
            isDragging ? "border-teal-400 bg-teal-50" : "border-gray-200 bg-gray-50 hover:border-teal-300 hover:bg-teal-50/50",
            isProcessing && "pointer-events-none opacity-60"
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
          {isProcessing ? (
            <>
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              <p className="text-sm font-medium text-teal-700">AIで解析中...</p>
              <p className="text-xs text-gray-400">在留カード番号・在留期限を読み取っています</p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">
                新しい在留カード（更新後）をドラッグ＆ドロップ
              </p>
              <p className="text-xs text-gray-400">またはクリックして選択（JPEG / PNG / WebP / PDF・10MB以下）</p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </CardContent>

      {/* 確認ポップアップ */}
      {stage !== "idle" && stage !== "processing" && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                AI読み取り結果の確認
              </h3>
              <button onClick={handleCancel} disabled={stage === "saving"} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              {preview.fileName}{isPdf ? "（PDF）" : ""} から読み取った内容です。必要に応じて修正し、「マスターを更新する」を押すと申請人マスターに反映されます。
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">在留カード番号</label>
              <input
                value={preview.residenceCardNumber}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[\s　]/g, "");
                  setPreview((p) => (p ? { ...p, residenceCardNumber: v } : p));
                }}
                placeholder="AB12345678CD"
                className="input-field text-sm py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">在留期間満了日</label>
              <input
                type="date"
                value={preview.currentVisaExpiry}
                onChange={(e) => {
                  const v = e.target.value;
                  setPreview((p) => (p ? { ...p, currentVisaExpiry: v } : p));
                }}
                className="input-field text-sm py-1.5"
              />
            </div>

            {(!preview.residenceCardNumber || !preview.currentVisaExpiry) && (
              <p className="text-xs text-orange-600">
                AIが一部の項目を読み取れませんでした。内容を確認し、必要な値を入力してください。
              </p>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5 text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={stage === "saving"}
                className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={stage === "saving" || (!preview.residenceCardNumber && !preview.currentVisaExpiry)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stage === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                マスターを更新する
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
