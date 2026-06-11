/**
 * 業種・職種マスタによるAI抽出データのクレンジング
 * ────────────────────────────────────────────────
 * AIが添付書類から抽出した「業種」「職種」の値を
 * 業種一覧（BUSINESS_TYPES）・職種一覧（OCCUPATION_TYPES）と照合し、
 * - 正しいコード → そのまま
 * - ラベル（表記ゆれ含む） → コードに自動変換
 * - マスタに存在しない値 → ''（空）にして画面で手動選択させる
 */
import { BUSINESS_TYPES, OCCUPATION_TYPES } from "@/lib/form-types";

/** 照合用の文字列正規化（全角→半角、空白・記号差を吸収） */
function normalize(s: string): string {
  return s
    .normalize("NFKC")                 // 全角英数・カナ → 半角
    .replace(/[\s　]/g, "")            // 空白除去
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")")
    .replace(/[・･]/g, "・")
    .replace(/[，,、]/g, ",")
    .toLowerCase();
}

interface MasterEntry { code: number; label: string; }

/**
 * マスタ照合の共通ロジック
 * @returns 照合できたコード文字列、できなければ ''
 */
function matchAgainstMaster(value: string, master: MasterEntry[]): string {
  const raw = value.trim();
  if (!raw) return "";

  // ① 数値コードとして照合
  const numMatch = raw.match(/^\d+$/);
  if (numMatch) {
    const code = parseInt(raw, 10);
    return master.some(m => m.code === code) ? String(code) : "";
  }

  const normValue = normalize(raw);

  // ② ラベル完全一致
  for (const m of master) {
    if (normalize(m.label) === normValue) return String(m.code);
  }

  // ③ 部分一致（ラベルが値を含む、または値がラベルを含む）
  //    複数候補がある場合は誤マッピング防止のため照合失敗とする
  const partial = master.filter(m => {
    const normLabel = normalize(m.label);
    return normLabel.includes(normValue) || normValue.includes(normLabel);
  });
  if (partial.length === 1) return String(partial[0].code);

  return "";
}

/** 業種コードのクレンジング（業種一覧マスタと照合） */
export function cleanseBusinessTypeCode(value: string | null | undefined): string {
  if (!value) return "";
  return matchAgainstMaster(String(value), BUSINESS_TYPES);
}

/** 職種コードのクレンジング（職種一覧マスタと照合） */
export function cleanseOccupationCode(value: string | null | undefined): string {
  if (!value) return "";
  return matchAgainstMaster(String(value), OCCUPATION_TYPES);
}

/**
 * カンマ区切りの複数コード（追加職種番号等）のクレンジング
 * 照合できた要素のみ残す
 */
export function cleanseOccupationCodeList(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .split(/[,、，]/)
    .map(s => cleanseOccupationCode(s))
    .filter(Boolean)
    .join(",");
}

/**
 * AI抽出データ全体に業種・職種クレンジングを適用
 * （fill-all-fields.ts の validateAndClean 後に呼ぶ）
 */
export function cleanseMasterCodes(data: Record<string, any>): Record<string, any> {
  // 業種コード系
  for (const key of ["orgBusinessTypeCode", "orgBusinessTypeOtherCode", "dispatchOrgBusinessTypeCode"]) {
    if (typeof data[key] === "string" && data[key]) {
      data[key] = cleanseBusinessTypeCode(data[key]);
    }
  }
  // 職種コード系
  for (const key of ["occupationCode", "orgOccupationNumber"]) {
    if (typeof data[key] === "string" && data[key]) {
      data[key] = cleanseOccupationCode(data[key]);
    }
  }
  // 複数職種コード
  for (const key of ["occupationCodeOthers", "orgOccupationNumberAdditional"]) {
    if (typeof data[key] === "string" && data[key]) {
      data[key] = cleanseOccupationCodeList(data[key]);
    }
  }
  return data;
}
