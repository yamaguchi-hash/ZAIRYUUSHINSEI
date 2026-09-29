import assert from "node:assert/strict";
import { setPrintDocumentTitle } from "../src/lib/print-document-title";

const documentLike = { title: "行政書士業務システム" };

setPrintDocumentTitle(
  documentLike,
  "必要書類　家族滞在　在留資格認定証明書交付申請　20260901",
);

assert.equal(
  documentLike.title,
  "必要書類　家族滞在　在留資格認定証明書交付申請　20260901",
);

console.log("print document title tests passed");
