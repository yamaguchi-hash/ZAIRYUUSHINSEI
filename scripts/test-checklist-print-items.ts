import assert from "node:assert/strict";
import {
  selectApplicableChecklistDocumentsForPrint,
  selectChecklistItemsForPrint,
} from "../src/lib/checklist-print-items";

const masterItems = [
  { id: "master-a", documentRequirementId: "master-a", documentName: "在職証明書" },
  { id: "master-b", documentRequirementId: "master-b", documentName: "納税証明書" },
];
const checklistItems = [
  { id: "checklist-a", documentRequirementId: "master-a", documentName: "在職証明書" },
  { id: "custom", documentRequirementId: null, documentName: "個別追加書類" },
];

assert.deepEqual(
  selectChecklistItemsForPrint(masterItems, checklistItems).map((item) => item.id),
  ["checklist-a", "master-b", "custom"],
);

assert.deepEqual(
  selectApplicableChecklistDocumentsForPrint([
    { id: "required", applicable: true, status: "required" },
    { id: "optional", applicable: true, status: "optional" },
    { id: "not-applicable", applicable: false, status: "required" },
    { id: "exempt", applicable: true, status: "exempt" },
  ]).map((item) => item.id),
  ["required", "optional"],
);

console.log("checklist print item tests passed");
