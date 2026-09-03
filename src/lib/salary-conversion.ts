import { cleanseNumeric } from "./numeric-cleansing";

// ─── 基本給の時間換算額（円/時）の確定ロジック ─────────────────────────────────
// 参考様式第1-6号 雇用条件書の別紙「賃金の支払に関する書面」の「１．基本賃金」
// （月給／日給／時給）と、本体「IV．労働時間等」の所定労働時間から、
// 申請書（所属機関用）の「基本給の時間換算額」を算出する。
//
// 優先順位:
//   1. 書面に時間換算額が直接記載されていればその値（direct）
//   2. 時給制 → 時給の額そのまま
//   3. 日給制 → 日額 ÷ 1日の所定労働時間
//   4. 月給制 → 月額 ÷ 月平均所定労働時間（②月）
// いずれも四捨五入した整数（カンマ・円なしの数値文字列）で返す。
// 計算に必要な値が欠けている場合は ""（自動入力しない）。

export interface TimeConvertedSalaryInput {
  /** 書面に直接記載された時間換算額（あれば最優先） */
  direct?: unknown;
  /** 基本賃金の区分（月給／日給／時給） */
  salaryType?: unknown;
  /** 基本賃金の額 */
  salary?: unknown;
  /** 月平均所定労働時間（②月） */
  monthlyHours?: unknown;
  /** 1日の所定労働時間 */
  dailyHours?: unknown;
}

export function computeTimeConvertedBasicSalary(input: TimeConvertedSalaryInput): string {
  // 1. 書面に直接記載がある場合はそれを採用
  const direct = parseFloat(cleanseNumeric(input.direct));
  if (isFinite(direct) && direct > 0) return String(Math.round(direct));

  const base = parseFloat(cleanseNumeric(input.salary));
  if (!isFinite(base) || base <= 0) return "";

  // 区分が読み取れなかった場合は金額の規模から推定する
  // （時給はおおむね数千円以下、日給は数万円以下、それ以上は月給）
  let type = String(input.salaryType ?? "").trim();
  if (!type) {
    type = base < 5000 ? "時給" : base < 50000 ? "日給" : "月給";
  }

  if (type.includes("時給") || type.includes("時間給")) {
    return String(Math.round(base));
  }
  if (type.includes("日給")) {
    const dh = parseFloat(cleanseNumeric(input.dailyHours));
    return isFinite(dh) && dh > 0 ? String(Math.round(base / dh)) : "";
  }
  // 月給（その他の区分も月額とみなす）
  const mh = parseFloat(cleanseNumeric(input.monthlyHours));
  return isFinite(mh) && mh > 0 ? String(Math.round(base / mh)) : "";
}
