"use server";

import { auth } from "@/lib/auth";
import { db, applicantDocuments, applicantMaster, applicantResidenceCardHistories } from "@/lib/db";
import { eq, and, ne, inArray, desc } from "drizzle-orm";
import { GoogleGenAI, Type } from "@google/genai";
import { revalidatePath } from "next/cache";
import { lookupZipFromAddress } from "@/lib/zip-lookup";
import { normalizeRomajiName } from "@/lib/utils";
import { buildAutoFileName, getApplicantNameForFile } from "@/lib/file-naming";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  passport_front: "パスポート（表紙）",
  passport_data_page: "パスポート（顔写真・情報ページ）",
  residence_card_front: "在留カード（表面）",
  residence_card_back: "在留カード（裏面）",
  residence_card: "在留カード（表面・裏面）",
};

// ファイル名生成専用ラベル（表示ラベルとは別にアンダースコア区切りで定義）
const FILENAME_LABELS: Record<string, string> = {
  passport_data_page:     "パスポート（顔写真ページ）",
  residence_card_front:   "在留カード_表面",
  residence_card_back:    "在留カード_裏面",
  residence_card:         "在留カード",
  residence_card_renewal: "最新の在留カード",
};

// ─── 構造化出力スキーマ定義 ──────────────────────────────────────────────────
const RESIDENCE_CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    surname_ja:            { type: Type.STRING, description: "姓（漢字）", nullable: true },
    given_name_ja:         { type: Type.STRING, description: "名（漢字）", nullable: true },
    surname_en:            { type: Type.STRING, description: "姓（ローマ字）", nullable: true },
    given_name_en:         { type: Type.STRING, description: "名（ローマ字）", nullable: true },
    nationality:           { type: Type.STRING, description: "国籍・地域", nullable: true },
    date_of_birth:         { type: Type.STRING, description: "生年月日（YYYY-MM-DD形式）", nullable: true },
    gender:                { type: Type.STRING, description: "性別（M または F）", nullable: true },
    residence_card_number: { type: Type.STRING, description: "在留カード番号", nullable: true },
    status_of_residence:   { type: Type.STRING, description: "在留資格（日本語）", nullable: true },
    period_of_stay:        { type: Type.STRING, description: "在留期間", nullable: true },
    date_of_expiry:        { type: Type.STRING, description: "在留期限（YYYY-MM-DD形式）", nullable: true },
    postal_code:           { type: Type.STRING, description: "郵便番号（数字7桁のみ）", nullable: true },
    address:               { type: Type.STRING, description: "住居地（郵便番号を除いた住所）", nullable: true },
    back_address:          { type: Type.STRING, description: "裏面の変更後最新住所", nullable: true },
    back_postal_code:      { type: Type.STRING, description: "裏面の変更後郵便番号（数字7桁）", nullable: true },
    workplace:             { type: Type.STRING, description: "勤務先・所属機関", nullable: true },
    qualification:         { type: Type.STRING, description: "資格外活動許可等", nullable: true },
  },
};

const PASSPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    surname:          { type: Type.STRING, description: "姓（ローマ字）", nullable: true },
    given_name:       { type: Type.STRING, description: "名（ローマ字）", nullable: true },
    nationality:      { type: Type.STRING, description: "国籍", nullable: true },
    date_of_birth:    { type: Type.STRING, description: "生年月日（YYYY-MM-DD形式）", nullable: true },
    gender:           { type: Type.STRING, description: "性別（M または F）", nullable: true },
    passport_number:  { type: Type.STRING, description: "パスポート番号", nullable: true },
    expiry_date:      { type: Type.STRING, description: "有効期限（YYYY-MM-DD形式）", nullable: true },
    issuing_country:  { type: Type.STRING, description: "発行国", nullable: true },
    place_of_birth:   { type: Type.STRING, description: "出生地", nullable: true },
    mrz_line1:        { type: Type.STRING, description: "MRZ第1行", nullable: true },
    mrz_line2:        { type: Type.STRING, description: "MRZ第2行", nullable: true },
  },
};

const GENERIC_DOC_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    doc_type:    { type: Type.STRING, description: "書類の種類", nullable: true },
    data:        { type: Type.STRING, description: "抽出された情報（JSON文字列）", nullable: true },
  },
};

/** documentType に対応する responseSchema を返す */
function getOcrSchema(documentType: string) {
  if (documentType === "residence_card" || documentType === "residence_card_front" || documentType === "residence_card_back") {
    return RESIDENCE_CARD_SCHEMA;
  }
  if (documentType === "passport_data_page" || documentType === "passport_front") {
    return PASSPORT_SCHEMA;
  }
  return undefined; // 汎用書類はスキーマなし（responseMimeTypeのみ）
}

// Save uploaded document metadata to DB
export async function saveApplicantDocument(data: {
  applicantId: string;
  documentType: "passport_data_page" | "residence_card_front" | "residence_card_back";
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) throw new Error("テナントIDが不正です");

  // ── ファイル名の自動判定・自動付与（申請人氏名_書類名_YYYYMMDD.拡張子） ──
  const [applicant] = await db
    .select({
      familyNameEn: applicantMaster.familyNameEn,
      givenNameEn: applicantMaster.givenNameEn,
      familyNameJa: applicantMaster.familyNameJa,
      givenNameJa: applicantMaster.givenNameJa,
    })
    .from(applicantMaster)
    .where(eq(applicantMaster.id, data.applicantId))
    .limit(1);

  // 同じ書類タイプの既存ファイルは置き換えられるため、衝突判定からは除外する
  const otherDocs = await db
    .select({ fileName: applicantDocuments.fileName })
    .from(applicantDocuments)
    .where(
      and(
        eq(applicantDocuments.applicantId, data.applicantId),
        ne(applicantDocuments.documentType, data.documentType)
      )
    );

  const fileName = applicant
    ? buildAutoFileName({
        applicantName: getApplicantNameForFile(applicant),
        docLabel: FILENAME_LABELS[data.documentType] ?? DOCUMENT_TYPE_LABELS[data.documentType] ?? data.documentType,
        originalFileName: data.fileName,
        existingNames: otherDocs.map((d) => d.fileName),
      })
    : data.fileName;

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
    .values({ tenantId, ...data, fileName })
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

// ─── プロンプト生成 ───────────────────────────────────────────────────────────
function buildPrompt(documentType: string): string {
  if (documentType === "residence_card" || documentType === "residence_card_front" || documentType === "residence_card_back") {
    return `【役割】あなたは在留資格申請を専門とする行政書士AIアシスタントです。身分証明書（在留カード）からの正確な情報読み取りを担当します。

【処理対象】在留カード（表面・裏面）

【処理手順】
1. まず書類全体を確認し、表面・裏面を識別する
2. 表面から氏名・国籍・在留資格等の基本情報を読み取る
3. 裏面から住所変更記録・勤務先情報を読み取る
4. 日付はすべてYYYY-MM-DD形式に変換する

【抽出フィールド（表面）】
- surname_ja: 姓（漢字）
- given_name_ja: 名（漢字）
- surname_en: 姓（ローマ字・大文字）
- given_name_en: 名（ローマ字・大文字）
- nationality: 国籍・地域
- date_of_birth: 生年月日（YYYY-MM-DD）
- gender: 性別（M または F のみ）
- residence_card_number: 在留カード番号（英数字12桁。大文字・スペースなしで出力）
- status_of_residence: 在留資格（日本語表記）
- period_of_stay: 在留期間（例：3年、1年）
- date_of_expiry: 在留期限（YYYY-MM-DD形式。和暦表記の場合は西暦に変換して出力）
- postal_code: 郵便番号（数字7桁のみ。〒マーク不要）
- address: 住居地（郵便番号を除いた住所のみ）

【抽出フィールド（裏面）】
- back_address: 住所変更がある場合の最新住所（変更記録の最終行。なければnull）
- back_postal_code: 変更後住所の郵便番号（数字7桁。なければnull）
- workplace: 勤務先・所属機関名
- qualification: 資格外活動許可等の記載

【制約】
・書類に明記されている情報のみ抽出し、推測・補完は行わないこと
・読み取れない項目はnullとすること
・日付は必ずYYYY-MM-DD形式（例：2025-03-15）
・和暦（令和・平成等）で記載されている場合は西暦のYYYY-MM-DD形式に変換すること（例：令和7年3月15日 → 2025-03-15）
・性別はMまたはFのみ（男/女/MALE/FEMALE等は変換すること）`;
  }

  if (documentType === "passport_data_page" || documentType === "passport_front") {
    return `【役割】あなたは在留資格申請を専門とする行政書士AIアシスタントです。パスポートからの正確な情報読み取りを担当します。

【処理対象】パスポート（顔写真・データページ）

【処理手順】
1. まずMRZ（機械読取領域）を確認し、基本情報の正確性を検証する
2. 顔写真ページの印字情報を読み取る
3. MRZと印字情報を照合し、より正確な方を採用する
4. 日付はすべてYYYY-MM-DD形式に変換する

【抽出フィールド】
- surname: 姓（ローマ字・大文字。ファミリーネーム）
- given_name: 名（ローマ字・大文字。ファーストネーム）
- nationality: 国籍（日本語表記。例：中国、ベトナム、フィリピン）
- date_of_birth: 生年月日（YYYY-MM-DD）
- gender: 性別（M または F のみ）
- passport_number: パスポート番号（英数字）
- expiry_date: 有効期限（YYYY-MM-DD）
- issuing_country: 発行国
- place_of_birth: 出生地（読み取れる場合）
- mrz_line1: MRZ第1行（読み取れる場合）
- mrz_line2: MRZ第2行（読み取れる場合）

【制約】
・書類に明記されている情報のみ抽出し、推測・補完は行わないこと
・読み取れない項目はnullとすること
・日付は必ずYYYY-MM-DD形式
・性別はMまたはFのみ`;
  }

  return `【役割】あなたは在留資格申請の専門行政書士AIです。
【指示】この書類から読み取れる全ての情報を正確に抽出してください。
【制約】書類に明記されている情報のみ抽出し、推測しないこと。読み取れない項目はnullとすること。`;
}

// ─── Base64変換ヘルパー ─────────────────────────────────────────────────────────
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function fetchAsBase64(fileUrl: string, mimeType: string): Promise<[string, string]> {
  if (fileUrl.startsWith("data:")) {
    const commaIdx = fileUrl.indexOf(",");
    const base64 = fileUrl.slice(commaIdx + 1);
    const headerMime = fileUrl.slice(5, commaIdx).split(";")[0];
    const fileMimeType = headerMime === "application/pdf" ? "application/pdf"
      : SUPPORTED_IMAGE_TYPES.includes(headerMime) ? headerMime : "image/jpeg";
    return [base64, fileMimeType];
  }
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`ファイルの取得に失敗しました: ${fileUrl}`);
  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const fileMimeType = mimeType === "application/pdf" ? "application/pdf"
    : SUPPORTED_IMAGE_TYPES.includes(mimeType) ? mimeType : "image/jpeg";
  return [base64, fileMimeType];
}

// OCR a single document with Gemini
async function ocrSingleDocument(
  fileUrl: string,
  mimeType: string,
  documentType: string
): Promise<Record<string, any>> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const [base64, fileMimeType] = await fetchAsBase64(fileUrl, mimeType);

  const prompt = buildPrompt(documentType);
  const schema = getOcrSchema(documentType);

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { inlineData: { mimeType: fileMimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        ...(schema ? { responseSchema: schema } : {}),
      },
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

  // responseMimeType: "application/json" により、レスポンスは常に有効なJSON
  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // フォールバック: マークダウンコードフェンスが含まれる場合の処理
    const m = text.match(/```json?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
    try { parsed = JSON.parse(m?.[1] ?? text.trim()); } catch { parsed = {}; }
  }

  console.log("[OCR] parsed fields:", JSON.stringify(parsed));
  return parsed;
}

// ─── 在留カード表面・裏面を同時にGeminiへ送信して解析 ──────────────────────────
async function ocrResidenceCardCombined(
  frontUrl: string, frontMime: string,
  backUrl: string,  backMime: string
): Promise<Record<string, any>> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const [frontBase64, frontFileMime] = await fetchAsBase64(frontUrl, frontMime);
  const [backBase64,  backFileMime]  = await fetchAsBase64(backUrl,  backMime);

  const prompt = `【役割】あなたは在留資格申請を専門とする行政書士AIアシスタントです。在留カードの表面（1枚目）と裏面（2枚目）の2枚の画像から正確な情報を読み取ります。

【処理対象】在留カード 表面（1枚目画像）・裏面（2枚目画像）
・1枚目：在留カードの表面
・2枚目：在留カードの裏面

【処理手順】
1. 1枚目（表面）から氏名・国籍・在留資格・在留期限・住所・在留カード番号を読み取る
2. 2枚目（裏面）から住所変更記録の最新住所・勤務先を読み取る
3. 日付はすべてYYYY-MM-DD形式に変換する

【抽出フィールド（表面）】
- surname_ja: 姓（漢字）
- given_name_ja: 名（漢字）
- surname_en: 姓（ローマ字・大文字）
- given_name_en: 名（ローマ字・大文字）
- nationality: 国籍・地域
- date_of_birth: 生年月日（YYYY-MM-DD）
- gender: 性別（M または F のみ）
- residence_card_number: 在留カード番号（英数字12桁。大文字・スペースなし）
- status_of_residence: 在留資格（日本語表記）
- period_of_stay: 在留期間（例：3年、1年）
- date_of_expiry: 在留期限（YYYY-MM-DD。和暦は西暦変換）
- postal_code: 表面の郵便番号（数字7桁のみ）
- address: 表面の住居地（郵便番号を除いた住所）

【抽出フィールド（裏面）】
- back_address: 裏面住所変更記録の最新住所（変更記録欄の最終行。なければnull）
- back_postal_code: 変更後住所の郵便番号（数字7桁。なければnull）
- workplace: 勤務先・所属機関名
- qualification: 資格外活動許可等の記載

【制約】
・書類に明記されている情報のみ抽出し、推測・補完は行わないこと
・読み取れない項目はnullとすること
・日付は必ずYYYY-MM-DD形式（例：2025-03-15）
・和暦（令和・平成等）の場合は西暦のYYYY-MM-DD形式に変換すること
・性別はMまたはFのみ`;

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        parts: [
          { inlineData: { mimeType: frontFileMime, data: frontBase64 } },
          { inlineData: { mimeType: backFileMime,  data: backBase64  } },
          { text: prompt },
        ],
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESIDENCE_CARD_SCHEMA,
      },
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
  console.log("[OCR/combined] raw response:", text.slice(0, 1000));

  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/```json?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
    try { parsed = JSON.parse(m?.[1] ?? text.trim()); } catch { parsed = {}; }
  }

  console.log("[OCR/combined] parsed fields:", JSON.stringify(parsed));
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

  // passport_front は廃止済みのため除外して処理
  const activeDocs = docs.filter(d => d.documentType !== "passport_front");

  if (activeDocs.length === 0) {
    throw new Error("アップロードされた書類がありません");
  }

  const allExtracted: Record<string, any> = {};
  const docResults: Array<{ id: string; data: Record<string, any> }> = [];

  const rcFront = activeDocs.find(d => d.documentType === "residence_card_front");
  const rcBack  = activeDocs.find(d => d.documentType === "residence_card_back");
  const otherDocs = activeDocs.filter(d =>
    d.documentType !== "residence_card_front" && d.documentType !== "residence_card_back"
  );

  // 在留カード以外の書類を個別OCR
  for (const doc of otherDocs) {
    const extracted = await ocrSingleDocument(doc.fileUrl, doc.mimeType ?? "image/jpeg", doc.documentType);
    Object.assign(allExtracted, extracted);
    docResults.push({ id: doc.id, data: extracted });
    await db.update(applicantDocuments)
      .set({ ocrExtractedData: extracted, ocrProcessedAt: new Date() })
      .where(eq(applicantDocuments.id, doc.id));
  }

  // 在留カード: 両面揃っていれば同時送信OCR、一方のみなら個別OCR
  if (rcFront && rcBack) {
    console.log("[OCR/fill] 在留カード表面・裏面の同時解析を実行");
    const combined = await ocrResidenceCardCombined(
      rcFront.fileUrl, rcFront.mimeType ?? "image/jpeg",
      rcBack.fileUrl,  rcBack.mimeType  ?? "image/jpeg"
    );
    Object.assign(allExtracted, combined);
    docResults.push({ id: rcFront.id, data: combined });
    docResults.push({ id: rcBack.id,  data: combined });
    await db.update(applicantDocuments)
      .set({ ocrExtractedData: combined, ocrProcessedAt: new Date() })
      .where(eq(applicantDocuments.id, rcFront.id));
    await db.update(applicantDocuments)
      .set({ ocrExtractedData: combined, ocrProcessedAt: new Date() })
      .where(eq(applicantDocuments.id, rcBack.id));
  } else {
    for (const doc of [rcFront, rcBack].filter((d): d is NonNullable<typeof d> => d != null)) {
      const extracted = await ocrSingleDocument(doc.fileUrl, doc.mimeType ?? "image/jpeg", doc.documentType);
      Object.assign(allExtracted, extracted);
      docResults.push({ id: doc.id, data: extracted });
      await db.update(applicantDocuments)
        .set({ ocrExtractedData: extracted, ocrProcessedAt: new Date() })
        .where(eq(applicantDocuments.id, doc.id));
    }
  }

  console.log("[OCR/fill] allExtracted:", JSON.stringify(allExtracted).slice(0, 800));

  // 書類タイプ別に整理
  const byType2: Record<string, Record<string, any>> = {};
  for (const dr of docResults) {
    const doc = activeDocs.find(d => d.id === dr.id);
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
  if (fnEn) update.familyNameEn = normalizeRomajiName(fnEn.toUpperCase());

  const gnEn = getVal("given_name_en", "given_name", "first_name");
  if (gnEn) update.givenNameEn = normalizeRomajiName(gnEn.toUpperCase());

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

  // 住所優先: 裏面住所変更(back_address) > 裏面単独OCR(address) > 表面住所
  // back_address は統合OCR時または裏面スキャン時に住所変更記録が入るフィールド
  const backAddrChange = allExtracted["back_address"];
  const backAddr2 = byType2["residence_card_back"]?.address;
  const frontAddr2 = byType2["residence_card_front"]?.address;
  let chosenAddr2 = "";
  let chosenPostal2 = "";
  if (backAddrChange && backAddrChange !== "null") {
    chosenAddr2 = String(backAddrChange);
    const bp = allExtracted["back_postal_code"];
    if (bp && bp !== "null") chosenPostal2 = String(bp);
    else {
      const fp = byType2["residence_card_front"]?.postal_code ?? allExtracted["postal_code"];
      if (fp && fp !== "null") chosenPostal2 = String(fp);
    }
  } else if (backAddr2 && backAddr2 !== "null") {
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
// 検索ロジックは zip-lookup.ts に集約（町名一致を検証し、特定できなければ空文字）
async function lookupPostalCode(address: string): Promise<string> {
  return (await lookupZipFromAddress(address)) ?? "";
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
      const extracted = await ocrSingleDocument(doc.fileUrl, doc.mimeType ?? "image/jpeg", doc.documentType);
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
    if (fnEn) result.familyNameEn = normalizeRomajiName(fnEn.toUpperCase());

    const gnEn = get("given_name_en", "given_name", "givenName", "first_name", "firstName");
    if (gnEn) result.givenNameEn = normalizeRomajiName(gnEn.toUpperCase());

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

    // 在留期限（在留カード表面 or 統合タイプ の date_of_expiry）
    const rcExpRaw = byType["residence_card_front"]?.date_of_expiry
      ?? byType["residence_card"]?.date_of_expiry;
    if (rcExpRaw && rcExpRaw !== "null") result.currentVisaExpiry = String(rcExpRaw);

    // ─── 住所・郵便番号の優先処理 ────────────────────────────────────────────
    // 統合タイプ（residence_card）: back_address → address の順で最新住所を取得
    // 分割タイプ（front/back）: 裏面 → 表面の順
    const cardData = byType["residence_card"];
    const frontData = byType["residence_card_front"];
    const backData  = byType["residence_card_back"];

    let chosenAddr = "";
    let chosenPostal = "";

    if (cardData) {
      // 統合PDFの場合: 裏面に住所変更記録があればそちらが最新
      const backAddr2  = cardData.back_address;
      const frontAddr2 = cardData.address;
      if (backAddr2 && backAddr2 !== "null") {
        chosenAddr = String(backAddr2);
        const bp = cardData.back_postal_code;
        if (bp && bp !== "null") chosenPostal = String(bp);
        else if (cardData.postal_code && cardData.postal_code !== "null") chosenPostal = String(cardData.postal_code);
        console.log("[OCR] 統合カード・裏面住所を使用:", chosenAddr);
      } else if (frontAddr2 && frontAddr2 !== "null") {
        chosenAddr = String(frontAddr2);
        if (cardData.postal_code && cardData.postal_code !== "null") chosenPostal = String(cardData.postal_code);
        console.log("[OCR] 統合カード・表面住所を使用:", chosenAddr);
      }
    } else {
      // 分割タイプ: 裏面 → 表面
      const backAddr  = backData?.address;
      const frontAddr = frontData?.address;
      if (backAddr && backAddr !== "null") {
        chosenAddr = String(backAddr);
        const backPostal = backData?.postal_code;
        if (backPostal && backPostal !== "null") chosenPostal = String(backPostal);
        else {
          const frontPostal = frontData?.postal_code;
          if (frontPostal && frontPostal !== "null") chosenPostal = String(frontPostal);
        }
        console.log("[OCR] 裏面住所を使用:", chosenAddr);
      } else if (frontAddr && frontAddr !== "null") {
        chosenAddr = String(frontAddr);
        const frontPostal = frontData?.postal_code;
        if (frontPostal && frontPostal !== "null") chosenPostal = String(frontPostal);
        console.log("[OCR] 表面住所を使用:", chosenAddr);
      }
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
    organizationId?: string | null;
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
        organizationId: applicantData.organizationId || null,
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

// ─── 在留カード更新（番号・在留期限の上書き） ─────────────────────────────────

/** Geminiが返すnull相当の値（null / "null" / "undefined" / 空文字）を除去する */
function cleanExtractedValue(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (s === "" || s === "null" || s === "undefined") return "";
  return s;
}

/** 和暦・各種日本語日付表記をYYYY-MM-DD形式に変換する */
function normalizeDateToIso(raw: unknown): string {
  const s = cleanExtractedValue(raw);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // 令和/平成/昭和/大正 + 年月日（「元年」表記にも対応）
  const eraMatch = s.match(/(令和|平成|昭和|大正)\s*(\d{1,2}|元)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (eraMatch) {
    const eraBase: Record<string, number> = { "令和": 2018, "平成": 1988, "昭和": 1925, "大正": 1911 };
    const eraYear = eraMatch[2] === "元" ? 1 : parseInt(eraMatch[2], 10);
    const year = eraBase[eraMatch[1]] + eraYear;
    return `${year}-${eraMatch[3].padStart(2, "0")}-${eraMatch[4].padStart(2, "0")}`;
  }

  // YYYY年MM月DD日 / YYYY/MM/DD / YYYY.MM.DD
  const ymd = s.match(/(\d{4})[年./-]\s*(\d{1,2})[月./-]\s*(\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }

  return s;
}

/** 在留カード番号を正規化する（大文字化・記号除去・英数字12桁の抽出） */
function normalizeResidenceCardNumber(raw: unknown): string {
  const s = cleanExtractedValue(raw);
  if (!s) return "";
  // 全角英数字を半角に変換してから、英数字以外（スペース・ハイフン等）を除去
  const halfWidth = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
  const cleaned = halfWidth.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // 在留カード番号は英数字12桁。12桁の連続部分が見つかればそれを優先する
  const match = cleaned.match(/[A-Z0-9]{12}/);
  return match ? match[0] : cleaned;
}

/**
 * 更新後の在留カードをAIで解析し、在留カード番号・在留期限のプレビューを返す。
 * この時点ではDBへの保存は行わない（ユーザーの確認後に confirmResidenceCardRenewal を呼ぶ）。
 */
export async function previewResidenceCardRenewal(fileUrl: string, mimeType: string) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY が設定されていません。.env.local に追加してください。");
    }

    const extracted = await ocrSingleDocument(fileUrl, mimeType, "residence_card");

    return {
      residenceCardNumber: normalizeResidenceCardNumber(extracted?.residence_card_number),
      currentVisaExpiry: normalizeDateToIso(extracted?.date_of_expiry),
      raw: extracted ?? {},
    };
  } catch (err: any) {
    console.error("[previewResidenceCardRenewal] error:", err);
    throw new Error(err?.message || "在留カードの解析に失敗しました");
  }
}

/**
 * ユーザーの確認後、申請人マスターの在留カード番号・在留期限を上書き更新し、
 * アップロードされた在留カードを添付書類履歴として保存する。
 */
export async function confirmResidenceCardRenewal(
  applicantId: string,
  data: {
    residenceCardNumber: string;
    currentVisaExpiry: string;
    fileUrl: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    raw?: Record<string, any>;
  }
) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const tenantId = (session.user as any).tenantId;
    if (!tenantId) throw new Error("テナントIDが不正です");

    const residenceCardNumber = normalizeResidenceCardNumber(data?.residenceCardNumber);
    const currentVisaExpiry = normalizeDateToIso(data?.currentVisaExpiry);

    if (!residenceCardNumber && !currentVisaExpiry) {
      throw new Error("在留カード番号または在留期限のいずれかを入力してください");
    }

    const [applicant] = await db
      .select({
        residenceCardNumber: applicantMaster.residenceCardNumber,
        currentVisaExpiry: applicantMaster.currentVisaExpiry,
        familyNameEn: applicantMaster.familyNameEn,
        givenNameEn: applicantMaster.givenNameEn,
        familyNameJa: applicantMaster.familyNameJa,
        givenNameJa: applicantMaster.givenNameJa,
      })
      .from(applicantMaster)
      .where(and(eq(applicantMaster.id, applicantId), eq(applicantMaster.tenantId, tenantId)))
      .limit(1);

    if (!applicant) throw new Error("申請人が見つかりません");

    // ── 既存の添付書類を取得（履歴退避用の旧ファイル特定 + ファイル名衝突回避の両方に使用） ──
    const existingDocs = await db
      .select({
        fileUrl: applicantDocuments.fileUrl,
        fileName: applicantDocuments.fileName,
        documentType: applicantDocuments.documentType,
        uploadedAt: applicantDocuments.uploadedAt,
      })
      .from(applicantDocuments)
      .where(eq(applicantDocuments.applicantId, applicantId));

    // ── 上書き前の「最新の在留カード」ファイルを特定（履歴退避用） ──
    const previousDoc = existingDocs
      .filter((d) => d.documentType === "residence_card_renewal")
      .sort((a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime())[0];

    // ── ファイル名の自動判定・自動付与（申請人氏名_最新の在留カード_YYYYMMDD.拡張子） ──
    const fileName = buildAutoFileName({
      applicantName: getApplicantNameForFile(applicant),
      docLabel: "最新の在留カード",
      originalFileName: data.fileName,
      existingNames: existingDocs.map((d) => d.fileName),
    });

    // ── 申請人マスターを最新情報へ上書きするための更新内容 ──
    const update: Record<string, any> = { updatedAt: new Date() };
    if (residenceCardNumber) update.residenceCardNumber = residenceCardNumber;
    if (currentVisaExpiry) update.currentVisaExpiry = currentVisaExpiry;

    const masterUpdateQuery = db
      .update(applicantMaster)
      .set(update)
      .where(and(eq(applicantMaster.id, applicantId), eq(applicantMaster.tenantId, tenantId)));

    const documentInsertQuery = db.insert(applicantDocuments).values({
      tenantId,
      applicantId,
      documentType: "residence_card_renewal",
      fileUrl: data.fileUrl,
      fileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      ocrExtractedData: data.raw ?? null,
      ocrProcessedAt: new Date(),
    });

    // ── マスタ上書き・履歴退避・新ファイル登録を1回のDBトランザクションで実行 ──
    // (neon-httpドライバは db.transaction() の対話的トランザクションをサポートしないため、
    //  db.batch() で複数クエリをまとめて単一のトランザクションとして送信する)
    if (applicant.residenceCardNumber || applicant.currentVisaExpiry || previousDoc) {
      const historyInsertQuery = db.insert(applicantResidenceCardHistories).values({
        tenantId,
        applicantId,
        oldResidenceCardNumber: applicant.residenceCardNumber,
        oldCurrentVisaExpiry: applicant.currentVisaExpiry,
        oldFileUrl: previousDoc?.fileUrl ?? null,
        oldFileName: previousDoc?.fileName ?? null,
      });
      await db.batch([historyInsertQuery, masterUpdateQuery, documentInsertQuery]);
    } else {
      await db.batch([masterUpdateQuery, documentInsertQuery]);
    }

    revalidatePath(`/applicants/${applicantId}`);
    revalidatePath("/applicants");

    return { residenceCardNumber, currentVisaExpiry };
  } catch (err: any) {
    console.error("[confirmResidenceCardRenewal] error:", err);
    throw new Error(err?.message || "在留カードの更新に失敗しました");
  }
}

/**
 * 申請人の在留カード変更履歴（上書き更新時に退避された旧情報）を取得する。
 */
export async function getApplicantResidenceCardHistories(applicantId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = (session.user as any).tenantId;

  return db
    .select()
    .from(applicantResidenceCardHistories)
    .where(
      and(
        eq(applicantResidenceCardHistories.applicantId, applicantId),
        eq(applicantResidenceCardHistories.tenantId, tenantId)
      )
    )
    .orderBy(desc(applicantResidenceCardHistories.replacedAt));
}
