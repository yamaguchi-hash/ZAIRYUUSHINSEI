/**
 * 打合せ記録・郵送記録の定数とヘルパー（非 Server Action）。
 * "use server" ファイルは async 関数以外を export できないため、
 * 定数・同期関数はこの通常モジュールに置く。
 */

export const CONSULTATION_TYPES = ["面談", "電話", "メール", "LINE", "その他"] as const;

export const DISPATCH_METHODS = [
  "レターパックプラス",
  "レターパックライト",
  "簡易書留",
  "書留",
  "特定記録",
  "普通郵便",
  "宅配便",
  "その他",
] as const;

/** 日本郵便 追跡サービスURL（追跡番号から生成） */
export function japanPostTrackingUrl(trackingNumber: string): string {
  return `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo=${encodeURIComponent(trackingNumber)}`;
}
