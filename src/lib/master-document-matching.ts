/**
 * 必要書類チェックリスト項目のdocumentNameから、申請人マスター書類
 * （パスポート・在留カード）との連携対象かどうかを判定する純粋関数。
 * DBアクセスは行わない（呼び出し元がマスター書類の有無を別途確認する）。
 */

const NORMALIZE_STRIP = /[\s　・,、.。/\\()（）【】「」『』〔〕\[\]:：\-－]/g;

function normalize(s: string): string {
  return s.normalize("NFKC").replace(NORMALIZE_STRIP, "");
}

export type MasterDocumentMatch =
  | { kind: "passport" }
  | { kind: "residence_card_front" }
  | { kind: "residence_card_back" }
  | { kind: "residence_card_both" };

/**
 * チェックリスト項目のdocumentNameを判定する。
 * - 「扶養者」を含む項目（申請人本人ではない別人の書類）は対象外（null）
 * - 「パスポート」「旅券」を含む → passport
 * - 「在留カード」を含み「表面」のみ → residence_card_front
 * - 「在留カード」を含み「裏面」のみ → residence_card_back
 * - 「在留カード」を含み表面・裏面の区別がない（単一項目） → residence_card_both
 *   （表面をメインファイル、裏面を additionalFiles として反映する想定）
 */
export function matchMasterDocumentType(documentName: string): MasterDocumentMatch | null {
  const n = normalize(documentName);
  if (!n) return null;
  if (n.includes(normalize("扶養者"))) return null;

  if (n.includes(normalize("パスポート")) || n.includes(normalize("旅券"))) {
    return { kind: "passport" };
  }

  if (n.includes(normalize("在留カード"))) {
    const hasFront = n.includes(normalize("表面"));
    const hasBack = n.includes(normalize("裏面"));
    if (hasFront && !hasBack) return { kind: "residence_card_front" };
    if (hasBack && !hasFront) return { kind: "residence_card_back" };
    return { kind: "residence_card_both" };
  }

  return null;
}
