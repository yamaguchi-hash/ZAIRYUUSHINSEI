type ChecklistPrintSource = {
  documentRequirementId: string | null;
  documentName: string;
};

type EvaluatedChecklistDocument = {
  applicable: boolean;
  status: string;
};

/**
 * マスター由来の評価済み書類から、現在の申請条件に該当する印刷対象を選ぶ。
 * チェックボックスは案件への反映用であり、PDFの掲載条件にはしない。
 */
export function selectApplicableChecklistDocumentsForPrint<T extends EvaluatedChecklistDocument>(
  items: readonly T[],
): T[] {
  return items.filter((item) => item.applicable && item.status !== "exempt");
}

/**
 * 必要書類マスターの全書類を印刷し、申請側に同じ書類がある場合は、
 * 担当者・進捗などを含む申請側の行を優先する。
 */
export function selectChecklistItemsForPrint<
  TMaster extends ChecklistPrintSource,
  TChecklist extends ChecklistPrintSource,
>(
  masterItems: readonly TMaster[],
  checklistItems: readonly TChecklist[],
): Array<TMaster | TChecklist> {
  const checklistByRequirementId = new Map(
    checklistItems
      .filter((item) => item.documentRequirementId)
      .map((item) => [item.documentRequirementId, item]),
  );
  const checklistByName = new Map(checklistItems.map((item) => [item.documentName, item]));
  const matchedChecklistItems = new Set<TChecklist>();

  const selected = masterItems.map((master) => {
    const checklistItem = checklistByRequirementId.get(master.documentRequirementId)
      ?? checklistByName.get(master.documentName);
    if (checklistItem) matchedChecklistItems.add(checklistItem);
    return checklistItem ?? master;
  });

  return [...selected, ...checklistItems.filter((item) => !matchedChecklistItems.has(item))];
}
