"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ocrFilesForRegistration, createApplicantWithDocuments } from "@/actions/ocr";
import { DocumentViewTrigger } from "./document-viewer";
import { VISA_TYPE_LABELS } from "@/lib/utils";
import {
  Sparkles, Upload, X, Loader2, CheckCircle, AlertCircle,
  FileText, ChevronRight, ChevronLeft, UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DocType = "passport_front" | "passport_data_page" | "residence_card_front" | "residence_card_back";

const DOC_CONFIGS: { type: DocType; label: string; hint: string }[] = [
  { type: "passport_front",      label: "パスポート（表紙）",        hint: "表紙面" },
  { type: "passport_data_page",  label: "パスポート（顔写真ページ）", hint: "氏名・番号・有効期限" },
  { type: "residence_card_front",label: "在留カード（表面）",         hint: "氏名・在留資格" },
  { type: "residence_card_back", label: "在留カード（裏面）",         hint: "勤務先等" },
];

interface UploadedDoc {
  type: DocType;
  docId: string;   // DB上の一時レコードID
  url: string;     // 表示用URL（data URL またはBlob URL）
  fileName: string;
  mimeType: string;
}

type Phase = "upload" | "review";

const emptyForm = {
  familyNameEn: "", givenNameEn: "", familyNameJa: "", givenNameJa: "",
  nationality: "", dateOfBirth: "", gender: "",
  passportNumber: "", passportExpiry: "",
  residenceCardNumber: "", currentVisaType: "", currentVisaExpiry: "",
  phone: "", emailAddress: "", japanAddress: "",
};

export function AiRegistrationForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("upload");
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isOcrRunning, startOcr] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [ocrError, setOcrError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const inputRefs = useRef<Partial<Record<DocType, HTMLInputElement>>>({});
  const [draggingType, setDraggingType] = useState<DocType | null>(null);

  // ── ファイルアップロード ──────────────────────────────────────────────────
  async function handleFileSelect(file: File, docType: DocType) {
    setUploadError("");
    setUploadingType(docType);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentType", docType);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "アップロード失敗");

      setDocs((prev) => {
        const filtered = prev.filter((d) => d.type !== docType);
        return [...filtered, {
          type: docType,
          docId: data.docId,
          url: data.url,
          fileName: data.fileName,
          mimeType: data.mimeType,
        }];
      });
    } catch (err: any) {
      setUploadError(err.message ?? "アップロードに失敗しました");
    } finally {
      setUploadingType(null);
    }
  }

  function removeDoc(type: DocType) {
    setDocs((prev) => prev.filter((d) => d.type !== type));
  }

  // ── AI読込 ───────────────────────────────────────────────────────────────
  function handleRunOcr() {
    setOcrError("");
    startOcr(async () => {
      try {
        const docIds = docs.map((d) => d.docId).filter(Boolean) as string[];
        if (docIds.length === 0) throw new Error("書類がアップロードされていません");
        const result = await ocrFilesForRegistration(docIds);
        setForm({
          familyNameEn: result.familyNameEn,
          givenNameEn: result.givenNameEn,
          familyNameJa: result.familyNameJa,
          givenNameJa: result.givenNameJa,
          nationality: result.nationality,
          dateOfBirth: result.dateOfBirth,
          gender: result.gender,
          passportNumber: result.passportNumber,
          passportExpiry: result.passportExpiry,
          residenceCardNumber: result.residenceCardNumber,
          currentVisaType: result.currentVisaType,
          currentVisaExpiry: result.currentVisaExpiry,
          phone: "",
          emailAddress: "",
          japanAddress: result.japanAddress,
        });
        setPhase("review");
      } catch (err: any) {
        setOcrError(err.message ?? "OCR処理に失敗しました");
      }
    });
  }

  // ── フォーム変更 ─────────────────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // ── 登録 ─────────────────────────────────────────────────────────────────
  function handleSave() {
    setSaveError("");
    startSave(async () => {
      try {
        const docIds = docs.map((d) => d.docId).filter(Boolean) as string[];
        const applicant = await createApplicantWithDocuments(form, docIds);
        router.push(`/applicants/${applicant.id}`);
        router.refresh();
      } catch (err: any) {
        setSaveError(err.message ?? "登録に失敗しました");
      }
    });
  }

  // ── render: Upload phase ─────────────────────────────────────────────────
  if (phase === "upload") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            AI自動読込で新規登録
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            パスポート・在留カードをアップロードするとGemini AIが自動で情報を読み取ります
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 4 upload zones */}
          <div className="grid grid-cols-2 gap-3">
            {DOC_CONFIGS.map((cfg) => {
              const existing = docs.find((d) => d.type === cfg.type);
              const isLoading = uploadingType === cfg.type;
              const isPdf = existing?.fileName.toLowerCase().endsWith(".pdf");

              return (
                <div key={cfg.type}>
                  <p className="text-xs font-medium text-gray-700 mb-1">{cfg.label}</p>
                  <p className="text-xs text-gray-400 mb-1.5">{cfg.hint}</p>

                  {existing ? (
                    <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50 group aspect-[3/2]">
                      <DocumentViewTrigger url={existing.url} fileName={existing.fileName} documentType={existing.type}>
                        <div className="w-full h-full flex items-center justify-center">
                          {isPdf ? (
                            <div className="flex flex-col items-center gap-1 text-gray-400">
                              <FileText className="w-8 h-8" />
                              <span className="text-xs">{existing.fileName}</span>
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={existing.url} alt={cfg.label} className="object-contain w-full h-full p-2" />
                          )}
                        </div>
                      </DocumentViewTrigger>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none group-hover:pointer-events-auto">
                        <button
                          onClick={(e) => { e.stopPropagation(); inputRefs.current[cfg.type]?.click(); }}
                          className="bg-white text-gray-800 rounded-lg px-2 py-1 text-xs font-medium hover:bg-gray-100"
                        >
                          差し替え
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeDoc(cfg.type); }}
                          className="bg-red-500 text-white rounded-lg px-2 py-1 text-xs font-medium hover:bg-red-600 flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />削除
                        </button>
                      </div>
                      <div className="absolute bottom-1 left-1 bg-green-500 text-white rounded px-1 py-0.5 text-xs flex items-center gap-0.5">
                        <CheckCircle className="w-2.5 h-2.5" /> 完了
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "border-2 border-dashed rounded-xl aspect-[3/2] flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors",
                        isLoading
                          ? "border-blue-300 bg-blue-50 pointer-events-none"
                          : draggingType === cfg.type
                          ? "border-purple-500 bg-purple-50 scale-[1.02]"
                          : "border-gray-200 hover:border-purple-400 hover:bg-purple-50/40"
                      )}
                      onClick={() => { inputRefs.current[cfg.type]?.click(); }}
                      onDragOver={(e) => { e.preventDefault(); setDraggingType(cfg.type); }}
                      onDragLeave={() => setDraggingType(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDraggingType(null);
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileSelect(file, cfg.type);
                      }}
                    >
                      {isLoading ? (
                        <><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /><p className="text-xs text-blue-600">アップロード中...</p></>
                      ) : draggingType === cfg.type ? (
                        <><Upload className="w-6 h-6 text-purple-500" /><p className="text-xs text-purple-600 font-medium text-center px-2">ここにドロップ</p></>
                      ) : (
                        <><Upload className="w-6 h-6 text-gray-300" /><p className="text-xs text-gray-400 text-center px-2">クリックまたはドロップ<br/>JPEG/PNG/PDF</p></>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hidden file inputs — one per zone */}
          {DOC_CONFIGS.map((cfg) => (
            <input
              key={cfg.type}
              ref={(el) => { if (el) inputRefs.current[cfg.type] = el; }}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { handleFileSelect(file, cfg.type); e.target.value = ""; }
              }}
            />
          ))}

          {uploadError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{uploadError}
            </div>
          )}

          {ocrError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p>{ocrError}</p>
                {ocrError.includes("GEMINI") && <p className="text-xs mt-1">GEMINI_API_KEY を環境変数に設定してください。</p>}
              </div>
            </div>
          )}

          {/* Progress indicator */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold", docs.length > 0 ? "bg-purple-600 text-white" : "bg-gray-200 text-gray-500")}>
              {docs.length}
            </span>
            / 4 件アップロード済み
          </div>

          {/* AI read button */}
          <button
            onClick={handleRunOcr}
            disabled={docs.length === 0 || isOcrRunning}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isOcrRunning ? (
              <><Loader2 className="w-4 h-4 animate-spin" />AIで読み込み中...（しばらくお待ちください）</>
            ) : (
              <><Sparkles className="w-4 h-4" />AIで自動読み込み・フォームへ反映<ChevronRight className="w-4 h-4 ml-auto" /></>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            または手動で入力する場合は
            <button onClick={() => setPhase("review")} className="text-blue-500 hover:underline ml-1">
              こちら
            </button>
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── render: Review phase ─────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <button onClick={() => setPhase("upload")} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            内容確認・修正して登録
          </CardTitle>
        </div>
        {docs.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            <p className="text-xs text-green-600 font-medium">AIが自動入力しました。内容を確認・修正してください。</p>
          </div>
        )}
        {/* doc thumbnails */}
        {docs.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {docs.map((d) => (
              <DocumentViewTrigger key={d.type} url={d.url} fileName={d.fileName} documentType={d.type}>
                <div className="w-14 h-10 rounded border border-gray-200 overflow-hidden bg-gray-50 cursor-zoom-in hover:border-blue-400 transition-colors">
                  {d.fileName.toLowerCase().endsWith(".pdf") ? (
                    <div className="flex items-center justify-center h-full"><FileText className="w-4 h-4 text-gray-400" /></div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.url} alt={d.fileName} className="object-contain w-full h-full p-0.5" />
                  )}
                </div>
              </DocumentViewTrigger>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {saveError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{saveError}
          </div>
        )}

        {/* Form fields */}
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label-xs">姓（英）<span className="text-red-500">*</span></label><input name="familyNameEn" value={form.familyNameEn} onChange={handleChange} required placeholder="YAMADA" className="input-field text-sm py-1.5" /></div>
          <div><label className="label-xs">名（英）<span className="text-red-500">*</span></label><input name="givenNameEn" value={form.givenNameEn} onChange={handleChange} required placeholder="TARO" className="input-field text-sm py-1.5" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label-xs">姓（日）</label><input name="familyNameJa" value={form.familyNameJa} onChange={handleChange} placeholder="山田" className="input-field text-sm py-1.5" /></div>
          <div><label className="label-xs">名（日）</label><input name="givenNameJa" value={form.givenNameJa} onChange={handleChange} placeholder="太郎" className="input-field text-sm py-1.5" /></div>
        </div>
        <div><label className="label-xs">国籍<span className="text-red-500">*</span></label><input name="nationality" value={form.nationality} onChange={handleChange} required placeholder="中国" className="input-field text-sm py-1.5" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label-xs">生年月日</label><input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} className="input-field text-sm py-1.5" /></div>
          <div><label className="label-xs">性別</label>
            <select name="gender" value={form.gender} onChange={handleChange} className="input-field text-sm py-1.5">
              <option value="">—</option><option value="M">男</option><option value="F">女</option>
            </select>
          </div>
        </div>
        <div><label className="label-xs">パスポート番号</label><input name="passportNumber" value={form.passportNumber} onChange={handleChange} placeholder="AB1234567" className="input-field text-sm py-1.5 font-mono" /></div>
        <div><label className="label-xs">パスポート有効期限</label><input name="passportExpiry" type="date" value={form.passportExpiry} onChange={handleChange} className="input-field text-sm py-1.5" /></div>
        <div><label className="label-xs">在留カード番号</label><input name="residenceCardNumber" value={form.residenceCardNumber} onChange={handleChange} placeholder="AA12345678CD" className="input-field text-sm py-1.5 font-mono" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label-xs">在留資格</label>
            <select name="currentVisaType" value={form.currentVisaType} onChange={handleChange} className="input-field text-sm py-1.5">
              <option value="">—</option>
              {Object.entries(VISA_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="label-xs">在留期限</label><input name="currentVisaExpiry" type="date" value={form.currentVisaExpiry} onChange={handleChange} className="input-field text-sm py-1.5" /></div>
        </div>
        <div><label className="label-xs">電話番号</label><input name="phone" value={form.phone} onChange={handleChange} className="input-field text-sm py-1.5" /></div>
        <div><label className="label-xs">メールアドレス</label><input name="emailAddress" type="email" value={form.emailAddress} onChange={handleChange} className="input-field text-sm py-1.5" /></div>
        <div><label className="label-xs">日本の住所</label><input name="japanAddress" value={form.japanAddress} onChange={handleChange} className="input-field text-sm py-1.5" /></div>

        <button
          onClick={handleSave}
          disabled={isSaving || !form.familyNameEn || !form.givenNameEn || !form.nationality}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
        >
          {isSaving ? (
            <><Loader2 className="w-4 h-4 animate-spin" />登録中...</>
          ) : (
            <><UserPlus className="w-4 h-4" />申請人を登録する</>
          )}
        </button>
      </CardContent>
    </Card>
  );
}
