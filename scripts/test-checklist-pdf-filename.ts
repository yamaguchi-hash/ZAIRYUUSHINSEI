import assert from "node:assert/strict";
import { buildChecklistPdfFileName } from "../src/lib/checklist-pdf-file-name";

// この規則が崩れると、PDF保存時に在留資格・手続種別・日本時間の日付を
// 判別できないファイル名になる。
assert.equal(
  buildChecklistPdfFileName(
    "技術・人文知識・国際業務",
    "在留期間更新許可申請",
    new Date("2026-08-31T15:30:00.000Z"),
  ),
  "必要書類　技術・人文知識・国際業務　在留期間更新許可申請　20260901",
);

assert.equal(
  buildChecklistPdfFileName(
    "家族滞在",
    "在留資格認定証明書交付申請",
    new Date("2026-09-01T00:00:00.000Z"),
  ),
  "必要書類　家族滞在　在留資格認定証明書交付申請　20260901",
);

console.log("checklist PDF filename tests passed");
