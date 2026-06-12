// ─── 数値クレンジング ─────────────────────────────────────────────────────────
// フォーム側が <input type="number"> のフィールドは、AIが「160時間00分」「１６０」
// 「250,000円」「25%」のような文字列を返すと HTML上は空欄表示になり「反映されない」
// ように見える。また「数字以外を単純除去」する方式では「160時間30分」→ "16030"、
// 「160.5」→ "1605" のような誤値が生まれるため、必ず本関数で正規化する。

/** 全角数字・全角小数点を半角に変換 */
export function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * AI抽出値を <input type="number"> にそのまま渡せる数値文字列へ正規化する。
 * 「160時間00分」→ "160"、「160時間30分」→ "160.5"、「250,000円」→ "250000"、
 * 「25%」→ "25"、「１６０」→ "160"、「週5日」→ "5"。
 * 数値が読み取れない場合は ""（空文字列）を返し、フォームへの誤反映を防ぐ。
 */
export function cleanseNumeric(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = toHalfWidthDigits(String(v).trim()).replace(/[,，\s]/g, "");
  if (!s) return "";
  // 「X時間Y分」（分は省略可）→ 10進の時間
  const hm = s.match(/(\d+(?:\.\d+)?)時間(?:(\d{1,2})分)?/);
  if (hm) {
    const hours = parseFloat(hm[1]) + (hm[2] ? parseInt(hm[2], 10) / 60 : 0);
    return String(Math.round(hours * 100) / 100);
  }
  // 一般: 先頭の数値部分のみ採用（円・%・日・名 等の単位や接頭語を除去）
  const n = s.match(/-?\d+(?:\.\d+)?/);
  return n ? n[0] : "";
}
