/**
 * Gemini responseSchema 状態数上限の実機検証
 * 実行: npx tsx scripts/test-gemini-schemas.ts
 * STAGE1 / STAGE2 / family セクションの各スキーマで実際にAPIを呼び、
 * 400 "too many states" が出ないことを確認する。
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { GoogleGenAI } from "@google/genai";
import { STAGE1_RESPONSE_SCHEMA, STAGE2_RESPONSE_SCHEMA, schemaToFieldList } from "../src/lib/shinsei-ai-schemas";
import { FAMILY_IN_JAPAN_SCHEMA } from "../src/lib/family-schema";
import { Type } from "@google/genai";

async function testSchema(name: string, schema: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  try {
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: "テスト: 空のJSONを返してください。全フィールドnullで構いません。" }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
    const txt = resp.text ?? "";
    JSON.parse(txt); // パース可能か確認
    console.log(`✓ ${name}: OK (response ${txt.length} chars)`);
    return true;
  } catch (e: any) {
    console.error(`✗ ${name}: FAILED — ${String(e?.message ?? e).slice(0, 300)}`);
    return false;
  }
}

/** スキーマから description を全除去（状態数削減の検証用） */
function stripDescriptions(schema: any): any {
  if (Array.isArray(schema)) return schema.map(stripDescriptions);
  if (schema && typeof schema === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "description") continue;
      out[k] = stripDescriptions(v);
    }
    return out;
  }
  return schema;
}

/** スキーマなしJSONモード＋プロンプト内フィールド定義（本番方式）のテスト */
async function testJsonModeWithFieldList(name: string, fieldList: string, sampleDoc: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  try {
    const prompt = `あなたは在留申請の行政書士AIです。以下の書類テキストから情報を抽出してください。

【書類テキスト】
${sampleDoc}

【出力フィールド定義】（このキー名のJSONオブジェクトで出力。該当ありのみ設定、それ以外は省略可）
${fieldList}

【制約】JSONオブジェクトのみを出力。日付はYYYY-MM-DD形式。`;
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });
    const data = JSON.parse(resp.text ?? "");
    const keys = Object.keys(data).filter(k => data[k]);
    console.log(`✓ ${name}: OK — 抽出キー: ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? "..." : ""}`);
    return true;
  } catch (e: any) {
    console.error(`✗ ${name}: FAILED — ${String(e?.message ?? e).slice(0, 250)}`);
    return false;
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not set");
    process.exit(1);
  }

  const familySectionSchema = {
    type: Type.OBJECT,
    properties: { familyInJapan: FAMILY_IN_JAPAN_SCHEMA },
  };

  const samplePassport = `PASSPORT
Type: P / Country: VNM
Surname: NGUYEN / Given names: VAN A
Date of birth: 15 MAR 1995 / Sex: M
Passport No: C1234567 / Date of expiry: 20 JUN 2030`;

  const r1 = await testJsonModeWithFieldList(
    "STAGE1 本番方式（JSONモード＋フィールド定義）",
    schemaToFieldList(STAGE1_RESPONSE_SCHEMA),
    samplePassport,
  );
  const r2 = await testJsonModeWithFieldList(
    "STAGE2 本番方式（JSONモード＋フィールド定義）",
    schemaToFieldList(STAGE2_RESPONSE_SCHEMA),
    `【書類1: パスポート】\n{"docType":"パスポート","familyNameEn":"NGUYEN","givenNameEn":"VAN A","dateOfBirth":"1995-03-15","sex":"男","passportNumber":"C1234567","passportExpiry":"2030-06-20"}\n【書類2: 在日親族の在留カード】\n{"docType":"在留カード","docSubject":"在日親族","familyNameEn":"NGUYEN","givenNameEn":"THI B","dateOfBirth":"1997-08-01","nationality":"ベトナム","residenceCardNumber":"AB12345678CD","notes":"続柄: 配偶者、同居: 有"}`,
  );
  const r3 = await testSchema("family セクション (responseSchema)", familySectionSchema);

  process.exit(r1 && r2 && r3 ? 0 : 1);
}

main();
