import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster, applicationDocumentChecklist, documentRequirementMaster } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { buildChecklistPdfFileName } from "@/lib/checklist-pdf-file-name";
import { selectChecklistItemsForPrint } from "@/lib/checklist-print-items";
import { PrintTrigger } from "./print-trigger";
import { ChecklistFilterTable, type ChecklistPrintItem } from "./checklist-filter-table";

function formatDateJa(date?: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default async function ChecklistPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!application) notFound();

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.id, application.applicantId))
    .limit(1);

  const organization = application.organizationId
    ? await db.select().from(organizationMaster)
        .where(eq(organizationMaster.id, application.organizationId))
        .limit(1).then(r => r[0])
    : null;

  // チェックリストを masterSortOrder → createdAt の順でソート（画面と同じ順番）
  const rawChecklist = await db
    .select({
      id: applicationDocumentChecklist.id,
      documentName: applicationDocumentChecklist.documentName,
      documentRequirementId: applicationDocumentChecklist.documentRequirementId,
      isRequiredByExpert: applicationDocumentChecklist.isRequiredByExpert,
      status: applicationDocumentChecklist.status,
      expertNotes: applicationDocumentChecklist.expertNotes,
      descriptionOverride: applicationDocumentChecklist.descriptionOverride,
      preparedBy: applicationDocumentChecklist.preparedBy,
      createdAt: applicationDocumentChecklist.createdAt,
      masterSortOrder: documentRequirementMaster.sortOrder,
      masterOriginalOrCopy: documentRequirementMaster.originalOrCopy,
      masterDescription: documentRequirementMaster.description,
    })
    .from(applicationDocumentChecklist)
    .leftJoin(
      documentRequirementMaster,
      eq(applicationDocumentChecklist.documentRequirementId, documentRequirementMaster.id)
    )
    .where(eq(applicationDocumentChecklist.applicationId, id));

  // documentRequirementId が無い（またはFK解決できない）項目も、書類名が現在有効な
  // マスターと一致すればその並び順に従わせるためのフォールバック（画面側と同じロジック）
  const searchVisaTypes = ["common", String(application.visaType)];
  const searchAppTypes = ["all", String(application.applicationType)];
  const allActiveMasters = await db
    .select({
      id: documentRequirementMaster.id,
      documentName: documentRequirementMaster.documentName,
      sortOrder: documentRequirementMaster.sortOrder,
      originalOrCopy: documentRequirementMaster.originalOrCopy,
      description: documentRequirementMaster.description,
      preparedBy: documentRequirementMaster.preparedBy,
    })
    .from(documentRequirementMaster)
    .where(and(
      eq(documentRequirementMaster.isActive, true),
      inArray(documentRequirementMaster.visaType, searchVisaTypes),
      inArray(documentRequirementMaster.applicationType, searchAppTypes),
    ));
  const masterSortOrderByName: Record<string, number> = {};
  for (const m of allActiveMasters) {
    if (masterSortOrderByName[m.documentName] === undefined || m.sortOrder < masterSortOrderByName[m.documentName]) {
      masterSortOrderByName[m.documentName] = m.sortOrder;
    }
  }

  // masterSortOrder → createdAt でソート
  rawChecklist.sort((a, b) => {
    const sortA = a.masterSortOrder ?? masterSortOrderByName[a.documentName] ?? 9999;
    const sortB = b.masterSortOrder ?? masterSortOrderByName[b.documentName] ?? 9999;
    if (sortA !== sortB) return sortA - sortB;
    const ca = a.createdAt ? (a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt)) : "";
    const cb = b.createdAt ? (b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt)) : "";
    return ca.localeCompare(cb);
  });

  const masterItems = allActiveMasters.map((master) => ({
    id: `master-${master.id}`,
    documentName: master.documentName,
    documentRequirementId: master.id,
    isRequiredByExpert: false,
    status: "not_submitted" as const,
    expertNotes: null,
    descriptionOverride: null,
    preparedBy: master.preparedBy,
    createdAt: null,
    masterSortOrder: master.sortOrder,
    masterOriginalOrCopy: master.originalOrCopy,
    masterDescription: master.description,
  }));
  const requiredItems = selectChecklistItemsForPrint(masterItems, rawChecklist);
  requiredItems.sort((a, b) => {
    const sortA = a.masterSortOrder ?? masterSortOrderByName[a.documentName] ?? 9999;
    const sortB = b.masterSortOrder ?? masterSortOrderByName[b.documentName] ?? 9999;
    if (sortA !== sortB) return sortA - sortB;
    return a.documentName.localeCompare(b.documentName, "ja");
  });

  // 写真を含む書類は番号なし
  let docNum = 0;
  const docNumbers: Record<string, number | null> = {};
  for (const item of requiredItems) {
    docNumbers[item.id] = item.documentName.includes("写真") ? null : ++docNum;
  }

  const checklistItems: ChecklistPrintItem[] = requiredItems.map((item) => ({
    id: item.id,
    documentName: item.documentName,
    masterOriginalOrCopy: item.masterOriginalOrCopy ?? null,
    preparedBy: item.preparedBy ?? null,
    status: item.status,
    // 注意事項: 案件別の上書きがあればそれを優先し、無ければマスターの注意事項を使う
    masterDescription: item.descriptionOverride ?? item.masterDescription ?? null,
    expertNotes: item.expertNotes ?? null,
    docNumber: docNumbers[item.id],
  }));

  const today = formatDateJa(new Date());
  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ");
  const applicantNameJa = [applicant?.familyNameJa, applicant?.givenNameJa].filter(Boolean).join(" ");
  const fileName = buildChecklistPdfFileName(
    VISA_TYPE_LABELS[application.visaType] ?? application.visaType,
    APPLICATION_TYPE_LABELS[application.applicationType] ?? application.applicationType,
  );

  return (
    <>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fileName}</title>
        <style>{`
          /* 必要書類チェックリスト（本ファイル）専用のページ設定。備考欄が広くなるようA4横向き(297mm)を
             採用しており、--pdf-print-width（shinsei-applicant/shinsei-org等）とは独立している。 */
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif; font-size: 12px; color: #111; background: #f3f4f6; }
          .page { background: white; max-width: 210mm; margin: 0 auto; padding: 12mm; min-height: 297mm; }

          /* ヘッダー */
          .header { border-bottom: 2px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
          .header-title { font-size: 16px; font-weight: bold; }
          .header-sub { font-size: 11px; color: #64748b; margin-top: 4px; }
          .header-right { text-align: right; font-size: 11px; color: #475569; }
          .case-number { font-family: monospace; font-size: 10px; margin-top: 2px; }

          /* 申請人情報テーブル */
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11.5px; }
          .info-table td { border: 1px solid #cbd5e1; padding: 5px 8px; }
          .info-table .label { background: #f1f5f9; font-weight: 600; width: 80px; }

          /* 説明ボックス */
          .notice { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #3b82f6; padding: 8px 12px; margin-bottom: 14px; font-size: 11px; line-height: 1.6; }
          .notice-title { font-weight: 700; margin-bottom: 3px; }

          /* チェックリストテーブル */
          .checklist { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
          .checklist th { background: #1e293b; color: white; padding: 5px 4px; text-align: left; }
          .checklist th.center { text-align: center; }
          .checklist td { border: 1px solid #cbd5e1; padding: 5px 4px; vertical-align: top; overflow-wrap: anywhere; }
          .checklist tr:nth-child(even) td { background: #f8fafc; }
          .col-no { width: 26px; text-align: center; color: #94a3b8; font-size: 9px; }
          .col-check { width: 24px; text-align: center; font-size: 13px; }
          .col-doc { width: 43%; }
          .col-status { display: none; }
          .col-prepared { width: 52px; text-align: center; font-size: 9px; }
          .col-notes { width: auto; }
          .doc-name { font-weight: 600; line-height: 1.4; }
          .notes-cell { color: #475569; font-size: 9px; line-height: 1.4; min-height: 24px; }

          /* ステータスバッジ */
          .status-ok { color: #15803d; font-weight: 700; }
          .status-submitted { color: #1d4ed8; font-weight: 700; }
          .status-resubmit { color: #dc2626; font-weight: 700; }
          .status-pending { color: #94a3b8; }

          /* 凡例・フッター */
          .legend { margin-top: 10px; font-size: 10px; color: #64748b; display: flex; gap: 20px; }
          .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; }
          .footer-title { font-weight: 700; margin-bottom: 4px; }
          .footer-note { color: #64748b; font-size: 10px; margin-top: 8px; }
          .total-row { text-align: right; font-size: 11px; color: #64748b; margin-top: 8px; }

          /* 印刷時 */
          @media print {
            body { background: white; }
            .page { padding: 0; min-height: auto; max-width: 100%; }
            .no-print { display: none !important; }
            .checklist tr { page-break-inside: avoid; }
          }
          @media screen {
            .page { margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,0.12); border-radius: 4px; }
          }
        `}</style>
        {/* 画面表示のみ：印刷ボタンバー */}
        <PrintTrigger applicationId={application.id} fileName={fileName} />

        <div className="page" style={{ paddingTop: "60px" }}>
          {/* ヘッダー */}
          <div className="header">
            <div>
              <div className="header-title">在留資格申請　必要書類チェックリスト</div>
              <div className="header-sub">行政書士 JLS　（yamaguchi@jls-gyosei.jp）</div>
            </div>
            <div className="header-right">
              <div>作成日：{today}</div>
              <div className="case-number">{application.caseNumber}</div>
            </div>
          </div>

          {/* 申請人情報 */}
          <table className="info-table">
            <tbody>
              <tr>
                <td className="label">申請人</td>
                <td>
                  <strong>{applicantName}</strong>
                  {applicantNameJa && <span style={{ marginLeft: "8px", color: "#64748b" }}>（{applicantNameJa}）</span>}
                  <span style={{ marginLeft: "4px" }}>様</span>
                </td>
                <td className="label" style={{ width: "60px" }}>国籍</td>
                <td>{applicant?.nationality ?? "—"}</td>
              </tr>
              <tr>
                <td className="label">在留資格</td>
                <td>{VISA_TYPE_LABELS[application.visaType] ?? application.visaType}</td>
                <td className="label">申請種別</td>
                <td>{APPLICATION_TYPE_LABELS[application.applicationType] ?? application.applicationType}</td>
              </tr>
              {organization && (
                <tr>
                  <td className="label">所属機関</td>
                  <td colSpan={3}>{organization.nameJa} 御中</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 説明 */}
          <div className="notice">
            <div className="notice-title">【ご提出のお願い】</div>
            <div>以下の書類をご準備いただき、担当行政書士へご提出ください。</div>
            <div style={{ color: "#64748b", fontSize: "10px", marginTop: "3px" }}>
              ※ 原本が必要な書類は原本でご用意ください。コピー可の書類はA4サイズでご準備ください。
            </div>
          </div>

          {/* チェックリスト（担当・状態フィルター付き） */}
          <ChecklistFilterTable items={checklistItems} />

          {/* フッター */}
          <div className="footer">
            <div className="footer-title">【ご連絡先】</div>
            <div>行政書士 JLS</div>
            <div>Email: yamaguchi@jls-gyosei.jp</div>
            <div className="footer-note">書類に関してご不明な点は、お気軽にご相談ください。</div>
          </div>
        </div>
    </>
  );
}
