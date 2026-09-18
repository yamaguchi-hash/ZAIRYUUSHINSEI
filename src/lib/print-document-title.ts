/**
 * PDF 保存ダイアログが参照するブラウザタイトルを、印刷直前に設定する。
 */
export function setPrintDocumentTitle(
  documentLike: { title: string },
  fileName: string,
): void {
  documentLike.title = fileName;
}
