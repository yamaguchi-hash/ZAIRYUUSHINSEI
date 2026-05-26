"use server";

import { auth } from "@/lib/auth";
import { db, applicantDocuments, applicantMaster } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
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

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          parts: [
            { inlineData: { mimeType: imageMimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
    });
  } catch (err: any) {
    const body = err?.errorDetails ?? err?.message ?? "";
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    if (err?.status === 429 || bodyStr.includes("429") || bodyStr.includes("RESOURCE_EXHAUSTED") || bodyStr.includes("credits are depleted")) {
      throw new Error("Gemini APIのクレジットが不足しています。Google AI Studio（https://aistudio.google.com）でお支払い方法を確認してください。");
    }
    if (err?.status === 400 || bodyStr.includes("400")) {
      throw new Error("画像の読み取りに失敗しました。別の形式（JPEGなど）でお試しください。");
    }
    throw new Error(`AI読み込みエラー: ${err?.message ?? "不明なエラー"}`);
  }

  const text = response.text ?? "{}";
  console.log("[OCR] raw response text:", text.slice(0, 1000));

  // Extract JSON from response (strip markdown code fences if present)
  let parsed: Record<string, any> = {};
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/```\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    } catch {
      // フォールバック: テキスト全体をパース
      try { parsed = JSON.parse(text.trim()); } catch { parsed = {}; }
    }
  } else {
    // コードブロックなしで直接JSONが返された場合
    try { parsed = JSON.parse(text.trim()); } catch { parsed = {}; }
  }

  console.log("[OCR] parsed fields:", JSON.stringify(parsed));
  return parsed;
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

  console.log("[OCR/fill] allExtracted:", JSON.stringify(allExtracted).slice(0, 800));

  // Build applicant master update from extracted data
  const update: Record<string, any> = { updatedAt: new Date() };

  const getVal = (...keys: string[]): string => {
    for (const k of keys) {
      const v = allExtracted[k];
      if (v && v !== "null" && v !== "undefined") return String(v);
    }
    return "";
  };

  const fnEn = getVal("surname_en", "surname", "family_name", "last_name");
  if (fnEn) update.familyNameEn = fnEn.toUpperCase();

  const gnEn = getVal("given_name_en", "given_name", "first_name");
  if (gnEn) update.givenNameEn = gnEn.toUpperCase();

  const nat = getVal("nationality", "country", "citizenship");
  if (nat) update.nationality = nat;

  const dob = getVal("date_of_birth", "birth_date", "dateOfBirth");
  if (dob) update.dateOfBirth = dob;

  const gRaw = getVal("gender", "sex");
  if (gRaw) {
    const g = gRaw.toUpperCase();
    update.gender = g === "F" || g.includes("女") || g === "FEMALE" ? "F" : "M";
  }

  const ppNum = getVal("passport_number", "passportNumber");
  if (ppNum) update.passportNumber = ppNum;

  const ppExp = getVal("expiry_date", "expiration_date");
  if (ppExp) update.passportExpiry = ppExp;

  const fnJa = getVal("surname_ja", "family_name_ja");
  if (fnJa) update.familyNameJa = fnJa;

  const gnJa = getVal("given_name_ja", "first_name_ja");
  if (gnJa) update.givenNameJa = gnJa;

  const rcNum = getVal("residence_card_number", "residenceCardNumber");
  if (rcNum) update.residenceCardNumber = rcNum;

  const rcExp = getVal("date_of_expiry", "residence_expiry");
  if (rcExp) update.currentVisaExpiry = rcExp;

  const addr = getVal("address", "japan_address");
  if (addr) update.japanAddress = addr;

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

// ─── 新規登録用: DBに保存済みのdocIdを使ってOCR実行 ──────────────────────────
export async function ocrFilesForRegistration(docIds: string[]): Promise<
  | { success: true; familyNameEn: string; givenNameEn: string; familyNameJa: string; givenNameJa: string; nationality: string; dateOfBirth: string; gender: string; passportNumber: string; passportExpiry: string; residenceCardNumber: string; currentVisaType: string; currentVisaExpiry: string; japanAddress: string; raw: Record<string, any> }
  | { success: false; error: string }
> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };

    if (!process.env.GEMINI_API_KEY) {
      return { success: false, error: "GEMINI_API_KEY が設定されていません" };
    }

    if (docIds.length === 0) return { success: false, error: "書類がアップロードされていません" };

    const docs = await db
      .select()
      .from(applicantDocuments)
      .where(inArray(applicantDocuments.id, docIds));

    if (docs.length === 0) return { success: false, error: "書類が見つかりません" };

    const allExtracted: Record<string, any> = {};

    for (const doc of docs) {
      const label = DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType;
      const extracted = await ocrSingleDocument(doc.fileUrl, doc.mimeType ?? "image/jpeg", label);
      Object.assign(allExtracted, extracted);

      await db
        .update(applicantDocuments)
        .set({ ocrExtractedData: extracted, ocrProcessedAt: new Date() })
        .where(eq(applicantDocuments.id, doc.id));
    }

    console.log("[OCR] allExtracted keys:", Object.keys(allExtracted));
    console.log("[OCR] allExtracted values:", JSON.stringify(allExtracted).slice(0, 500));

    const result = {
      success: true as const,
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

    // キー名の正規化（Geminiが返すバリエーションに対応）
    const get = (...keys: string[]): string => {
      for (const k of keys) {
        const v = allExtracted[k];
        if (v && v !== "null" && v !== "undefined") return String(v);
      }
      return "";
    };

    // 姓（英）: パスポートの surname / 在留カードの surname_en
    const fnEn = get("surname_en", "surname", "family_name", "familyName", "last_name", "lastName");
    if (fnEn) result.familyNameEn = fnEn.toUpperCase();

    // 名（英）: パスポートの given_name / 在留カードの given_name_en
    const gnEn = get("given_name_en", "given_name", "givenName", "first_name", "firstName");
    if (gnEn) result.givenNameEn = gnEn.toUpperCase();

    // 姓（日）
    const fnJa = get("surname_ja", "family_name_ja", "familyNameJa", "last_name_ja");
    if (fnJa) result.familyNameJa = fnJa;

    // 名（日）
    const gnJa = get("given_name_ja", "first_name_ja", "givenNameJa", "firstName_ja");
    if (gnJa) result.givenNameJa = gnJa;

    // 国籍
    const nat = get("nationality", "country", "citizenship");
    if (nat) result.nationality = nat;

    // 生年月日
    const dob = get("date_of_birth", "birth_date", "birthDate", "dateOfBirth", "dob");
    if (dob) result.dateOfBirth = dob;

    // 性別
    const genderRaw = get("gender", "sex");
    if (genderRaw) {
      const g = genderRaw.toUpperCase();
      result.gender = g === "F" || g.includes("女") || g === "FEMALE" ? "F"
        : g === "M" || g.includes("男") || g === "MALE" ? "M" : "";
    }

    // パスポート番号
    const ppNum = get("passport_number", "passportNumber", "document_number");
    if (ppNum) result.passportNumber = ppNum;

    // パスポート有効期限
    const ppExp = get("expiry_date", "expiration_date", "date_of_expiry", "expiryDate", "passportExpiry");
    if (ppExp) result.passportExpiry = ppExp;

    // 在留カード番号
    const rcNum = get("residence_card_number", "residenceCardNumber", "card_number");
    if (rcNum) result.residenceCardNumber = rcNum;

    // 在留期限（在留カードの date_of_expiry はパスポートと重複する可能性があるため別途処理）
    const rcExp = get("date_of_expiry", "residence_expiry", "status_expiry");
    if (rcExp && !result.passportExpiry) result.currentVisaExpiry = rcExp;
    else if (allExtracted.date_of_expiry && result.passportExpiry) result.currentVisaExpiry = String(allExtracted.date_of_expiry);

    // 住所
    const addr = get("address", "japanAddress", "japan_address", "residence_address");
    if (addr) result.japanAddress = addr;

    console.log("[OCR] mapped result:", JSON.stringify({
      familyNameEn: result.familyNameEn,
      givenNameEn: result.givenNameEn,
      nationality: result.nationality,
      dateOfBirth: result.dateOfBirth,
    }));

    return result;
  } catch (err: any) {
    return { success: false, error: err.message ?? "OCR処理に失敗しました" };
  }
}

// ─── 新規登録用: 申請人作成 + 既存の一時書類レコードを紐付け ──────────────────
export async function createApplicantWithDocuments(
  applicantData: {
    familyNameEn: string; givenNameEn: string; familyNameJa?: string; givenNameJa?: string;
    nationality: string; dateOfBirth?: string; gender?: string;
    passportNumber?: string; passportExpiry?: string;
    residenceCardNumber?: string; currentVisaType?: string; currentVisaExpiry?: string;
    phone?: string; emailAddress?: string; japanAddress?: string;
  },
  docIds: string[]
): Promise<{ success: true; applicantId: string } | { success: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = (session.user as any).tenantId;
    if (!tenantId) return { success: false, error: "テナントIDが不正です" };

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

    if (docIds.length > 0) {
      for (const docId of docIds) {
        await db
          .update(applicantDocuments)
          .set({ applicantId: newApplicant.id })
          .where(eq(applicantDocuments.id, docId));
      }
    }

    revalidatePath("/applicants");
    return { success: true, applicantId: newApplicant.id };
  } catch (err: any) {
    return { success: false, error: err.message ?? "登録に失敗しました" };
  }
}
