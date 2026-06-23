/**
 * アップロード書類のAI内容判定（書類タイプ自動識別）
 * ──────────────────────────────────────────
 * 画像/PDFをGemini Visionに渡し、在留資格申請実務における正式な書類名を判定する。
 * チェックリスト項目とのマッチング（キーワード・同義語ベース）も提供する。
 */

const SUPPORTED_MIMES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf",
];

function normalizeMime(m: string): string {
  const lower = m.toLowerCase().trim();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  return lower;
}

export type DocumentClassification = {
  /** AIが判定した正式書類名（日本語）。判定不能な場合は空文字列 */
  documentName: string;
  confidence: "high" | "medium" | "low";
};

/** 在留資格申請実務でよく使われる書類名（AIへの判定候補として提示） */
const CANDIDATE_DOCUMENT_TYPES = [
  "パスポート（旅券）の写し",
  "在留カードの写し",
  "住民票",
  "住民税の課税証明書",
  "住民税の納税証明書",
  "確定申告書の控え",
  "決算書（損益計算書・法人税確定申告書類等）",
  "雇用契約書",
  "雇用条件書",
  "登記事項証明書（法人登記簿謄本）",
  "履歴書",
  "卒業証明書",
  "成績証明書",
  "資格・検定試験の合格証明書",
  "日本語能力を証する証明書",
  "在職証明書",
  "賃貸借契約書",
  "預金残高証明書",
  "扶養者の在留カードの写し",
  "写真（証明写真）",
];

// ─── ファイルをbase64で取得 ───────────────────────────────────────────────────
export async function fileToBase64(
  fileUrl: string, mimeType: string | null
): Promise<{ base64: string; mime: string } | null> {
  try {
    let base64: string, mime: string;
    if (fileUrl.startsWith("data:")) {
      const ci = fileUrl.indexOf(",");
      base64 = fileUrl.slice(ci + 1);
      mime = normalizeMime(fileUrl.slice(5, ci).split(";")[0]);
    } else {
      const res = await fetch(fileUrl, { cache: "no-store" });
      if (!res.ok) return null;
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      mime = normalizeMime(mimeType ?? "image/jpeg");
    }
    if (!SUPPORTED_MIMES.includes(mime)) return null;
    return { base64, mime };
  } catch (e: any) {
    console.error(`[document-classifier] fileToBase64 error: ${e?.message}`);
    return null;
  }
}

// ─── AIによる書類タイプ判定 ──────────────────────────────────────────────────
export async function classifyDocumentType(
  base64: string, mimeType: string
): Promise<DocumentClassification> {
  const mime = normalizeMime(mimeType);
  if (!process.env.GEMINI_API_KEY || !SUPPORTED_MIMES.includes(mime)) {
    return { documentName: "", confidence: "low" };
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `【役割】あなたは日本の出入国在留管理庁への在留資格申請手続きを専門とする行政書士AIアシスタントです。

【処理内容】
アップロードされた書類の画像（またはPDFの1ページ目）を解析し、これが在留資格申請実務において何の書類であるかを判定してください。

【よくある書類タイプの例】（書類の内容がこれらに該当する場合は、下記の名称をそのまま使用してください）
${CANDIDATE_DOCUMENT_TYPES.map((d) => `- ${d}`).join("\n")}

上記のいずれにも該当しない場合は、書類のタイトル・発行者・記載内容から判断した適切な正式書類名を日本語で出力してください。

【出力形式】
次のJSON形式のみで出力すること（説明文・マークダウン・コードブロック不可）：
{"documentName": "判定した書類の正式名称（日本語）。判定できない場合は空文字列", "confidence": "high または medium または low のいずれか"}

【判定基準】
- "high": 書類のタイトルや発行者名等から書類の種類が明確に判別できる
- "medium": 記載内容から書類の種類がある程度推測できるが、確証が薄い
- "low": 不鮮明・情報不足・対象外の書類等で判別が困難（この場合 documentName は空文字列でよい）`;

    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [
        { inlineData: { mimeType: mime, data: base64 } },
        { text: prompt },
      ]}],
      config: {
        responseMimeType: "application/json",
      },
    });

    const txt = resp.text ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(txt);
    } catch {
      const m = txt.match(/```json?\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
      if (!m) return { documentName: "", confidence: "low" };
      try {
        parsed = JSON.parse(m[1] ?? m[0]);
      } catch {
        return { documentName: "", confidence: "low" };
      }
    }

    const documentName = typeof parsed?.documentName === "string" ? parsed.documentName.trim() : "";
    const confRaw = typeof parsed?.confidence === "string" ? parsed.confidence.toLowerCase().trim() : "";
    const confidence: DocumentClassification["confidence"] =
      confRaw === "high" ? "high" : confRaw === "medium" ? "medium" : "low";

    if (!documentName) return { documentName: "", confidence: "low" };
    return { documentName, confidence };
  } catch (e: any) {
    console.error(`[document-classifier] classify error: ${e?.message}`);
    return { documentName: "", confidence: "low" };
  }
}

// ─── チェックリスト項目とのマッチング ─────────────────────────────────────────
const NORMALIZE_STRIP = /[\s　・,、.。/\\()（）【】「」『』〔〕\[\]:：\-－]/g;

function normalize(s: string): string {
  return s.normalize("NFKC").replace(NORMALIZE_STRIP, "");
}

/** AIの判定名とチェックリストの書類名で表記が異なりやすいものの同義語グループ */
const SYNONYM_GROUPS: string[][] = [
  ["課税証明書", "住民税課税証明書", "市民税県民税課税証明書", "所得証明書"],
  ["納税証明書", "住民税納税証明書"],
  ["住民票", "住民票の写し", "住民票記載事項証明書"],
  ["確定申告書", "確定申告書の控え", "確定申告書類"],
  ["決算書", "損益計算書", "法人税確定申告書類", "財務諸表", "決算文書"],
  ["雇用契約書", "労働契約書"],
  ["雇用条件書", "労働条件通知書"],
  ["登記事項証明書", "登記簿謄本", "法人登記簿謄本", "履歴事項全部証明書"],
  ["パスポート", "旅券"],
  ["在留カード", "在留カードの写し"],
  ["卒業証明書", "学位記", "修了証明書"],
  ["成績証明書", "学業成績証明書"],
  ["在職証明書", "就労証明書"],
  ["賃貸借契約書", "不動産賃貸契約書"],
  ["預金残高証明書", "残高証明書", "銀行口座残高証明書"],
  ["写真", "証明写真"],
];

function synonymGroupFor(name: string): string[] | null {
  const n = normalize(name);
  if (!n) return null;
  for (const group of SYNONYM_GROUPS) {
    if (group.some((g) => {
      const gn = normalize(g);
      return n.includes(gn) || gn.includes(n);
    })) return group;
  }
  return null;
}

/**
 * AIが判定した書類名と、チェックリスト項目（documentName）を内部マッチングする。
 * 完全一致・包含関係・同義語グループのいずれかに該当する最初の項目を返す。
 */
export function matchChecklistItem<T extends { id: string; documentName: string }>(
  aiDocumentName: string, checklist: T[]
): T | null {
  if (!aiDocumentName) return null;
  const aiNorm = normalize(aiDocumentName);
  if (!aiNorm) return null;
  const group = synonymGroupFor(aiDocumentName);

  for (const item of checklist) {
    const itemNorm = normalize(item.documentName);
    if (!itemNorm) continue;
    if (aiNorm.includes(itemNorm) || itemNorm.includes(aiNorm)) return item;
    if (group && group.some((g) => {
      const gn = normalize(g);
      return itemNorm.includes(gn) || gn.includes(itemNorm);
    })) return item;
  }
  return null;
}

/** 判定不能時のフォールバック書類名 */
export const UNCLASSIFIED_DOC_LABEL = "未判別の書類";
