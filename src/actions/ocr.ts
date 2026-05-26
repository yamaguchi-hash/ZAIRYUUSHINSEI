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
- postal_code (郵便番号、数字7桁のみ例:1234567。〒マーク不要。記載があれば抽出)
- address (住居地。郵便番号を除いた住所のみ)

在留カード（裏面）の場合:
重要: 在留カード裏面には住所変更の記録が記載されている場合があります。
- address (変更後の新しい住所。「住居地」「新住所」「変更後」などの欄に記載された最新の住所。記載がない場合はnull)
- postal_code (変更後住所の郵便番号、数字7桁のみ。記載がない場合はnull)
- workplace (勤務先・所属機関)
- qualification (資格外活動許可等)
- notes (その他備考欄の内容)

読み取れなかった項目はnullにしてください。
JSONのみを返し、説明文は不要です。`;

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

  // 書類タイプ別に整理
  const byType2: Record<string, Record<string, any>> = {};
  for (const dr of docResults) {
    const doc = docs.find(d => d.id === dr.id);
    if (doc) byType2[doc.documentType] = dr.data;
  }

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

  const rcExp2 = byType2["residence_card_front"]?.date_of_expiry;
  if (rcExp2 && rcExp2 !== "null") update.currentVisaExpiry = String(rcExp2);

  // 住所優先: 裏面 > 表面
  const backAddr2 = byType2["residence_card_back"]?.address;
  const frontAddr2 = byType2["residence_card_front"]?.address;
  let chosenAddr2 = "";
  let chosenPostal2 = "";
  if (backAddr2 && backAddr2 !== "null") {
    chosenAddr2 = String(backAddr2);
    const bp = byType2["residence_card_back"]?.postal_code;
    if (bp && bp !== "null") chosenPostal2 = String(bp);
  } else if (frontAddr2 && frontAddr2 !== "null") {
    chosenAddr2 = String(frontAddr2);
    const fp = byType2["residence_card_front"]?.postal_code;
    if (fp && fp !== "null") chosenPostal2 = String(fp);
  }
  if (chosenAddr2) update.japanAddress = chosenAddr2;
  if (chosenPostal2) {
    update.postalCode = formatPostalCode(chosenPostal2);
  } else if (chosenAddr2) {
    const lookedUp = await lookupPostalCode(chosenAddr2);
    if (lookedUp) update.postalCode = lookedUp;
  }

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

// ─── 郵便番号フォーマット ─────────────────────────────────────────────────────
function formatPostalCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return raw;
}

// ─── 住所から郵便番号をAPIで検索 ────────────────────────────────────────────
async function lookupPostalCode(address: string): Promise<string> {
  try {
    // 都道府県＋市区町村レベルで検索（先頭50文字）
    const query = address.replace(/[0-9０-９\-－]/g, "").slice(0, 50);
    const url = `https://geoapi.heartrails.com/api/json?method=suggest&address=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return "";
    const data: any = await res.json();
    const postal = data?.response?.location?.[0]?.postal as string | undefined;
    if (postal && /^\d{7}$/.test(postal)) return `${postal.slice(0, 3)}-${postal.slice(3)}`;
  } catch {
    // タイムアウト・ネットワークエラーは無視
  }
  return "";
}

// ─── 新規登録用: DBに保存済みのdocIdを使ってOCR実行 ──────────────────────────
export async function ocrFilesForRegistration(docIds: string[]): Promise<
  | { success: true; familyNameEn: string; givenNameEn: string; familyNameJa: string; givenNameJa: string; nationality: string; dateOfBirth: string; gender: string; passportNumber: string; passportExpiry: string; residenceCardNumber: string; currentVisaType: string; currentVisaExpiry: string; japanPostalCode: string; japanAddress: string; raw: Record<string, any> }
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
    // 書類タイプ別に結果を保持（住所優先判定に使用）
    const byType: Record<string, Record<string, any>> = {};

    for (const doc of docs) {
      const label = DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType;
      const extracted = await ocrSingleDocument(doc.fileUrl, doc.mimeType ?? "image/jpeg", label);
      byType[doc.documentType] = extracted;
      Object.assign(allExtracted, extracted);

      await db
        .update(applicantDocuments)
        .set({ ocrExtractedData: extracted, ocrProcessedAt: new Date() })
        .where(eq(applicantDocuments.id, doc.id));
    }

    console.log("[OCR] allExtracted keys:", Object.keys(allExtracted));
    console.log("[OCR] byType keys:", Object.keys(byType));

    const result = {
      success: true as const,
      familyNameEn: "", givenNameEn: "", familyNameJa: "", givenNameJa: "",
      nationality: "", dateOfBirth: "", gender: "",
      passportNumber: "", passportExpiry: "",
      residenceCardNumber: "", currentVisaType: "", currentVisaExpiry: "",
      japanPostalCode: "", japanAddress: "",
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

    const fnEn = get("surname_en", "surname", "family_name", "familyName", "last_name", "lastName");
    if (fnEn) result.familyNameEn = fnEn.toUpperCase();

    const gnEn = get("given_name_en", "given_name", "givenName", "first_name", "firstName");
    if (gnEn) result.givenNameEn = gnEn.toUpperCase();

    const fnJa = get("surname_ja", "family_name_ja", "familyNameJa", "last_name_ja");
    if (fnJa) result.familyNameJa = fnJa;

    const gnJa = get("given_name_ja", "first_name_ja", "givenNameJa", "firstName_ja");
    if (gnJa) result.givenNameJa = gnJa;

    const nat = get("nationality", "country", "citizenship");
    if (nat) result.nationality = nat;

    const dob = get("date_of_birth", "birth_date", "birthDate", "dateOfBirth", "dob");
    if (dob) result.dateOfBirth = dob;

    const genderRaw = get("gender", "sex");
    if (genderRaw) {
      const g = genderRaw.toUpperCase();
      result.gender = g === "F" || g.includes("女") || g === "FEMALE" ? "F"
        : g === "M" || g.includes("男") || g === "MALE" ? "M" : "";
    }

    const ppNum = get("passport_number", "passportNumber", "document_number");
    if (ppNum) result.passportNumber = ppNum;

    // パスポート有効期限（passport の expiry_date のみ）
    const ppExpRaw = byType["passport_data_page"]?.expiry_date ?? byType["passport_front"]?.expiry_date;
    if (ppExpRaw && ppExpRaw !== "null") result.passportExpiry = String(ppExpRaw);

    const rcNum = get("residence_card_number", "residenceCardNumber", "card_number");
    if (rcNum) result.residenceCardNumber = rcNum;

    // 在留期限（在留カード表面の date_of_expiry）
    const rcExpRaw = byType["residence_card_front"]?.date_of_expiry;
    if (rcExpRaw && rcExpRaw !== "null") result.currentVisaExpiry = String(rcExpRaw);

    // ─── 住所・郵便番号の優先処理 ────────────────────────────────────────────
    // 在留カード裏面に住所変更記録がある場合はそちらが最新
    const backAddr = byType["residence_card_back"]?.address;
    const frontAddr = byType["residence_card_front"]?.address;

    let chosenAddr = "";
    let chosenPostal = "";

    if (backAddr && backAddr !== "null") {
      // 裏面の住所が最新
      chosenAddr = String(backAddr);
      const backPostal = byType["residence_card_back"]?.postal_code;
      if (backPostal && backPostal !== "null") chosenPostal = String(backPostal);
      else {
        const frontPostal = byType["residence_card_front"]?.postal_code;
        if (frontPostal && frontPostal !== "null") chosenPostal = String(frontPostal);
      }
      console.log("[OCR] 裏面住所を使用:", chosenAddr);
    } else if (frontAddr && frontAddr !== "null") {
      // 表面の住所
      chosenAddr = String(frontAddr);
      const frontPostal = byType["residence_card_front"]?.postal_code;
      if (frontPostal && frontPostal !== "null") chosenPostal = String(frontPostal);
      console.log("[OCR] 表面住所を使用:", chosenAddr);
    }

    result.japanAddress = chosenAddr;

    // 郵便番号: OCRで取得できなければAPIで検索
    if (chosenPostal) {
      result.japanPostalCode = formatPostalCode(chosenPostal);
    } else if (chosenAddr) {
      console.log("[OCR] 郵便番号をAPIで検索:", chosenAddr);
      result.japanPostalCode = await lookupPostalCode(chosenAddr);
    }

    console.log("[OCR] mapped result:", JSON.stringify({
      familyNameEn: result.familyNameEn,
      givenNameEn: result.givenNameEn,
      nationality: result.nationality,
      japanAddress: result.japanAddress,
      japanPostalCode: result.japanPostalCode,
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
    phone?: string; emailAddress?: string; postalCode?: string; japanAddress?: string;
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
