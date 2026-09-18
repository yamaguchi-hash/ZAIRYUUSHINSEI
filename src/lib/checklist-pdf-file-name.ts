/**
 * 必要書類チェックリストをブラウザからPDF保存する際の既定ファイル名を作る。
 * PDF保存ダイアログは document.title を既定名として使用する。
 */
export function buildChecklistPdfFileName(
  visaTypeLabel: string,
  applicationTypeLabel: string,
  date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const ymd = `${dateParts.year}${dateParts.month}${dateParts.day}`;

  return ["必要書類", visaTypeLabel, applicationTypeLabel, ymd].join("　");
}
