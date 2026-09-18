import { normalizeRomajiName } from "./utils";

// ファイル名に使用できない記号
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

function sanitizeFileNamePart(s: string): string {
  return s.replace(INVALID_FILENAME_CHARS, "").replace(/[\s　]+/g, " ").trim();
}

/** YYYYMMDD形式の日付文字列を返す */
export function formatDateForFileName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * ファイル名に使用する申請人氏名を組み立てる。
 * 漢字氏名があれば漢字を、なければローマ字氏名（半角スペース1つに統一済み）を使用する。
 */
export function getApplicantNameForFile(applicant: {
  familyNameEn: string;
  givenNameEn: string;
  familyNameJa?: string | null;
  givenNameJa?: string | null;
}): string {
  const ja = `${applicant.familyNameJa ?? ""}${applicant.givenNameJa ?? ""}`.trim();
  if (ja) return sanitizeFileNamePart(ja);
  return sanitizeFileNamePart(normalizeRomajiName(`${applicant.familyNameEn} ${applicant.givenNameEn}`));
}

/**
 * 「申請人氏名_書類名_YYYYMMDD.拡張子」形式のファイル名を生成する。
 * 既存ファイル名と衝突する場合は末尾に枝番（_2, _3...）を付与する。
 */
export function buildAutoFileName(opts: {
  applicantName: string;
  docLabel: string;
  originalFileName: string;
  existingNames: Iterable<string>;
  date?: Date;
}): string {
  const ext = (opts.originalFileName.split(".").pop() || "bin").toLowerCase();
  const docLabel = sanitizeFileNamePart(opts.docLabel);
  const dateStr = formatDateForFileName(opts.date ?? new Date());
  const base = `${opts.applicantName}_${docLabel}_${dateStr}`;
  const existing = new Set(opts.existingNames);

  let fileName = `${base}.${ext}`;
  let counter = 2;
  while (existing.has(fileName)) {
    fileName = `${base}_${counter}.${ext}`;
    counter++;
  }
  return fileName;
}
