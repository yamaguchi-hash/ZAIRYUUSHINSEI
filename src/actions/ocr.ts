"use server";

import { auth } from "@/lib/auth";
import { db, applicantDocuments, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { revalidatePath } from "next/cache";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  passport_front: "パスポート（表紙）",
  passport_data_page: "パスポート（顔写真・情報ページ）",
  residence_card_front: "在留カード（表面）",
  residence_card_back: "在留カード（裏面）",
};

// Save uploaded document metadata to DB
export async function saveApplicantDocument(data: {
  applicantId: string;
  documentType: "passport_front" | "passport_data_page" | "residence_card_front" | "residence_card_back";
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) throw new Error("テナントIDが不正です");

  // Upsert: delete existing same type and insert new
  await db
    .delete(applicantDocuments)
    .where(
      and(
        eq(applicantDocuments.applicantId, data.applicantId),
        eq(applicantDocuments.documentType, data.documentType)
      )
    );

  const [doc] = await db
    .insert(applicantDocuments)
    .values({ tenantId, ...data })
    .returning();

  revalidatePath(`/applicants/${data.applicantId}`);
  return doc;
}

// Get all documents for an applicant
export async function getApplicantDocuments(applicantId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = (session.user as any).tenantId;

  return db
    .select()
    .from(applicantDocuments)
    .where(
      and(
        eq(applicantDocuments.applicantId, applicantId),
        eq(applicantDocuments.tenantId, tenantId)
      )
    );
}

// Delete a document
export async function deleteApplicantDocument(documentId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");

  await db
    .delete(applicantDocuments)
    .where(eq(applicantDocuments.id, documentId));

  revalidatePath("/applicants");
}

// OCR a single document with Gemini
async function ocrSingleDocument(
  fileUrl: string,
  mimeType: string,
  documentTypeLabel: string
): Promise<Record<string, any>> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  let base64: string;
  let imageMimeType: string;

  const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

  if (fileUrl.startsWith("data:")) {
    // データURL: base64部分を直接使用
    const commaIdx = fileUrl.indexOf(",");
    base64 = fileUrl.slice(commaIdx + 1);
    const headerMime = fileUrl.slice(5, commaIdx).split(";")[0];
    imageMimeType = supportedTypes.includes(headerMime) ? headerMime : "image/jpeg";
  } else {
    // HTTP URL: ファイルを取得してBase64に変換
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`ファイルの取得に失敗しました: ${fileUrl}`);
    const arrayBuffer = await res.arrayBuffer();
    base64 = Buffer.from(arrayBuffer).toString("base64");
    imageMimeType = supportedTypes.includes(mimeType) ? mimeType : "image/jpeg";
  }

  const prompt = `あなたは身分証明書のOCR専門家です。
この画像は「${documentTypeLabel}」です。

画像から読み取れる全ての情報をJSON形式で抽出してください。
パスポートの場合は以下の項目を抽出:
- surname (姓・ファミリーネーム、ローマ字)
- given_name (名・ファーストネーム、ローマ字)
- nationality (国籍)
- date_of_birth (生年月日、YYYY-MM-DD形式)
- gender (性別: M or F)
- passport_number (パスポート番号)
- expiry_date (有効期限、YYYY-MM-DD形式)
- issuing_country (発行国)
- place_of_birth (出生地、読み取れる場合)
- mrz_line1 (MRZ第1行、読み取れる場合)
- mrz_line2 (MRZ第2行、読み取れる場合)

在留カード（表面）の場合:
- surname_ja (姓・漢字)
- given_name_ja (名・漢字)
- surname_en (姓・ローマ字)
- given_name_en (名・ローマ字)
- nationality (国籍・地域)
- date_of_birth (生年月日、YYYY-MM-DD形式)
- gender (性別)
- residence_card_number (在留カード番号)
- status_of_residence (在留資格)
- period_of_stay (在留期間)
- date_of_expiry (在留期限、YYYY-MM-DD形式)
- address (住居地)

在留カード（裏面）の場合:
- workplace (勤務先)
- qualification (資格外活動許可等)
- notes (備考欄の内容)

読み取れなかった項目はnullにしてください。
JSONのみを返し、説明文は不要です。`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: imageMimeType,
              data: base64,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  const text = response.text ?? "{}";

  // Extract JSON from response (strip markdown code fences if present)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) return {};
  try {
    return JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
  } catch {
    return {};
  }
}

// OCR all documents for an applicant and auto-fill master data
export async function ocrAndFillApplicant(applicantId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY が設定されていません。.env.local に追加してください。");
  }

  const tenantId = (session.user as any).tenantId;

  const docs = await db
    .select()
    .from(applicantDocuments)
    .where(
      and(
        eq(applicantDocuments.applicantId, applicantId),
        eq(applicantDocuments.tenantId, tenantId)
      )
    );

  if (docs.length === 0) {
    throw new Error("アップロードされた書類がありません");
  }

  const allExtracted: Record<string, any> = {};
  const docResults: Array<{ id: string; data: Record<string, any> }> = [];

  // OCR each document
  for (const doc of docs) {
    const label = DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType;
    const extracted = await ocrSingleDocument(
      doc.fileUrl,
      doc.mimeType ?? "image/jpeg",
      label
    );

    Object.assign(allExtracted, extracted);
    docResults.push({ id: doc.id, data: extracted });

    // Save OCR result to document record
    await db
      .update(applicantDocuments)
      .set({ ocrExtractedData: extracted, ocrProcessedAt: new Date() })
      .where(eq(applicantDocuments.id, doc.id));
  }

  // Build applicant master update from extracted data
  const update: Record<string, any> = { updatedAt: new Date() };

  // From passport data page
  if (allExtracted.surname) update.familyNameEn = allExtracted.surname.toUpperCase();
  if (allExtracted.given_name) update.givenNameEn = allExtracted.given_name.toUpperCase();
  if (allExtracted.nationality) update.nationality = allExtracted.nationality;
  if (allExtracted.date_of_birth) update.dateOfBirth = allExtracted.date_of_birth;
  if (allExtracted.gender) update.gender = allExtracted.gender === "F" ? "F" : "M";
  if (allExtracted.passport_number) update.passportNumber = allExtracted.passport_number;
  if (allExtracted.expiry_date) update.passportExpiry = allExtracted.expiry_date;

  // From residence card
  if (allExtracted.surname_ja) update.familyNameJa = allExtracted.surname_ja;
  if (allExtracted.given_name_ja) update.givenNameJa = allExtracted.given_name_ja;
  if (allExtracted.surname_en) update.familyNameEn = allExtracted.surname_en.toUpperCase();
  if (allExtracted.given_name_en) update.givenNameEn = allExtracted.given_name_en.toUpperCase();
  if (allExtracted.residence_card_number) update.residenceCardNumber = allExtracted.residence_card_number;
  if (allExtracted.date_of_expiry) update.currentVisaExpiry = allExtracted.date_of_expiry;
  if (allExtracted.address) update.japanAddress = allExtracted.address;

  if (Object.keys(update).length > 1) {
    await db
      .update(applicantMaster)
      .set(update)
      .where(eq(applicantMaster.id, applicantId));
  }

  revalidatePath(`/applicants/${applicantId}`);
  revalidatePath("/applicants");

  return { extracted: allExtracted, updatedFields: Object.keys(update).filter((k) => k !== "updatedAt") };
}

// ─── 新規登録用: DB保存なしでOCR実行してフォームデータを返す ─────────────────
export async function ocrFilesForRegistration(
  files: Array<{ url: string; mimeType: string; documentType: string }>
): Promise<{
  familyNameEn: string;
  givenNameEn: string;
  familyNameJa: string;
  givenNameJa: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  passportNumber: string;
  passportExpiry: string;
  residenceCardNumber: string;
  currentVisaType: string;
  currentVisaExpiry: string;
  japanAddress: string;
  raw: Record<string, any>;
}> {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }

  if (files.length === 0) throw new Error("書類がアップロードされていません");

  const allExtracted: Record<string, any> = {};

  for (const file of files) {
    const label = DOCUMENT_TYPE_LABELS[file.documentType] ?? file.documentType;
    const extracted = await ocrSingleDocument(file.url, file.mimeType, label);
    Object.assign(allExtracted, extracted);
  }

  // OCR結果をフォームフィールドにマッピング
  const result = {
    familyNameEn: "",
    givenNameEn: "",
    familyNameJa: "",
    givenNameJa: "",
    nationality: "",
    dateOfBirth: "",
    gender: "",
    passportNumber: "",
    passportExpiry: "",
    residenceCardNumber: "",
    currentVisaType: "",
    currentVisaExpiry: "",
    japanAddress: "",
    raw: allExtracted,
  };

  if (allExtracted.surname)          result.familyNameEn = String(allExtracted.surname).toUpperCase();
  if (allExtracted.given_name)       result.givenNameEn  = String(allExtracted.given_name).toUpperCase();
  if (allExtracted.surname_ja)       result.familyNameJa = String(allExtracted.surname_ja);
  if (allExtracted.given_name_ja)    result.givenNameJa  = String(allExtracted.given_name_ja);
  if (allExtracted.surname_en)       result.familyNameEn = String(allExtracted.surname_en).toUpperCase();
  if (allExtracted.given_name_en)    result.givenNameEn  = String(allExtracted.given_name_en).toUpperCase();
  if (allExtracted.nationality)      result.nationality  = String(allExtracted.nationality);
  if (allExtracted.date_of_birth)    result.dateOfBirth  = String(allExtracted.date_of_birth);
  if (allExtracted.gender)           result.gender       = allExtracted.gender === "F" ? "F" : allExtracted.gender === "M" ? "M" : "";
  if (allExtracted.passport_number)  result.passportNumber = String(allExtracted.passport_number);
  if (allExtracted.expiry_date)      result.passportExpiry = String(allExtracted.expiry_date);
  if (allExtracted.residence_card_number) result.residenceCardNumber = String(allExtracted.residence_card_number);
  if (allExtracted.date_of_expiry)   result.currentVisaExpiry = String(allExtracted.date_of_expiry);
  if (allExtracted.address)          result.japanAddress = String(allExtracted.address);

  return result;
}

// ─── 新規登録用: 申請人作成 + 書類保存を1トランザクションで行う ───────────────
export async function createApplicantWithDocuments(
  applicantData: {
    familyNameEn: string;
    givenNameEn: string;
    familyNameJa?: string;
    givenNameJa?: string;
    nationality: string;
    dateOfBirth?: string;
    gender?: string;
    passportNumber?: string;
    passportExpiry?: string;
    residenceCardNumber?: string;
    currentVisaType?: string;
    currentVisaExpiry?: string;
    phone?: string;
    emailAddress?: string;
    japanAddress?: string;
  },
  documents: Array<{
    documentType: "passport_front" | "passport_data_page" | "residence_card_front" | "residence_card_back";
    fileUrl: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    ocrExtractedData?: Record<string, any>;
  }>
) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) throw new Error("テナントIDが不正です");

  // 申請人マスター作成
  const [newApplicant] = await db
    .insert(applicantMaster)
    .values({
      tenantId,
      ...applicantData,
      dateOfBirth: applicantData.dateOfBirth || null,
      passportExpiry: applicantData.passportExpiry || null,
      currentVisaExpiry: applicantData.currentVisaExpiry || null,
    })
    .returning();

  // 書類レコードを保存
  if (documents.length > 0) {
    await db.insert(applicantDocuments).values(
      documents.map((doc) => ({
        applicantId: newApplicant.id,
        tenantId,
        documentType: doc.documentType,
        fileUrl: doc.fileUrl,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        ocrExtractedData: doc.ocrExtractedData,
        ocrProcessedAt: doc.ocrExtractedData ? new Date() : null,
      }))
    );
  }

  revalidatePath("/applicants");
  return newApplicant;
}
