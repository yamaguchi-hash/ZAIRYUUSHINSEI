/**
 * 書類チェックリスト突合質問の定義。
 * チェックリストに該当書類が提出済みの場合、書類の中身について追加で確認すべき
 * 事項を質問化する。回答は applicationDocumentChecklist.expertNotes に
 * marker付きで追記され、再度同じ質問が出ないようにする。
 *
 * 対象を拡張する場合は本配列に要素を追加するだけでよい。
 */
export interface DocInterviewCheck {
  /** 質問の一意キー */
  id: string;
  /** チェックリスト項目の documentName に対する部分一致文字列 */
  matchDocumentName: string;
  /** 質問文 */
  question: string;
  /** 選択肢（有/無等） */
  options: string[];
  /** 回答済み判定・expertNotes追記に使うマーカー文字列 */
  marker: string;
}

export const DOC_INTERVIEW_CHECKS: DocInterviewCheck[] = [
  {
    id: "residence_cert_all_members",
    matchDocumentName: "住民票",
    question: "世帯全員の記載があるか確認してください",
    options: ["有", "無"],
    marker: "[顧客聴取] 世帯全員の記載",
  },
  {
    id: "tax_cert_arrears",
    matchDocumentName: "課税証明書",
    question: "未納額の有無を確認してください",
    options: ["有", "無"],
    marker: "[顧客聴取] 未納額の有無",
  },
];
