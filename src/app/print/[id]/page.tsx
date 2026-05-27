import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster, applicationDocumentChecklist } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { PrintTrigger } from "./print-trigger";

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

  const checklist = await db
    .select()
    .from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id));

  const requiredItems = checklist.filter(c => c.isRequiredByExpert);

  const today = formatDateJa(new Date());
  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ");
  const applicantNameJa = [applicant?.familyNameJa, applicant?.givenNameJa].filter(Boolean).join(" ");

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>必要書類チェックリスト - {applicantName}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif; font-size: 12px; color: #111; background: #f3f4f6; }
          .page { background: white; max-width: 210mm; margin: 0 auto; padding: 16mm 18mm; min-height: 297mm; }

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
          .checklist { width: 100%; border-collapse: collapse; font-size: 11.5px; }
          .checklist th { background: #1e293b; color: white; padding: 6px 8px; text-align: left; }
          .checklist th.center { text-align: center; }
          .checklist td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
          .checklist tr:nth-child(even) td { background: #f8fafc; }
          .col-no { width: 30px; text-align: center; color: #94a3b8; font-size: 10px; }
          .col-check { width: 28px; text-align: center; font-size: 15px; }
          .col-doc { width: auto; }
          .col-status { width: 55px; text-align: center; font-size: 10px; }
          .col-notes { width: 120px; }
          .doc-name { font-weight: 600; line-height: 1.4; }
          .notes-cell { color: #475569; font-size: 10.5px; line-height: 1.5; min-height: 30px; }

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
            .page { padding: 10mm 15mm; min-height: auto; max-width: 100%; }
            .no-print { display: none !important; }
            .checklist tr { page-break-inside: avoid; }
          }
          @media screen {
            .page { margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,0.12); border-radius: 4px; }
          }
        `}</style>
      </head>
      <body>
        {/* 画面表示のみ：印刷ボタンバー */}
        <PrintTrigger applicationId={application.id} />

        <div className="page" style={{ paddingTop: "60px" }}>
          {/* ヘッダー */}
          <div className="header">
            <div>
              <div className="header-title">在留資格申請　必要書類チェックリスト</div>
              <div className="header-sub">行政書士法人 JLS　（yamaguchi@jls-gyosei.jp）</div>
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
                  <td colSpan={3}>{organization.nameJa}</td>
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

          {/* チェックリスト */}
          <table className="checklist">
            <thead>
              <tr>
                <th className="col-no center">No.</th>
                <th className="col-check center">□</th>
                <th>書類名</th>
                <th className="col-status center">状態</th>
                <th className="col-notes">備考</th>
              </tr>
            </thead>
            <tbody>
              {requiredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "#94a3b8" }}>
                    必要書類が登録されていません
                  </td>
                </tr>
              ) : (
                requiredItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="col-no">{idx + 1}</td>
                    <td className="col-check">
                      {item.status === "approved" ? "✓" :
                       item.status === "submitted" ? "◎" : "□"}
                    </td>
                    <td className="col-doc">
                      <div className="doc-name">{item.documentName}</div>
                    </td>
                    <td className="col-status">
                      {item.status === "approved" ? <span className="status-ok">確認済</span> :
                       item.status === "submitted" ? <span className="status-submitted">提出済</span> :
                       item.status === "resubmit_required" ? <span className="status-resubmit">再提出</span> :
                       <span className="status-pending">未提出</span>}
                    </td>
                    <td className="col-notes">
                      <div className="notes-cell">{item.expertNotes ?? ""}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* 凡例 */}
          <div className="legend">
            <span>□ 未提出</span>
            <span>◎ 提出済（確認中）</span>
            <span>✓ 確認済</span>
          </div>

          {/* フッター */}
          <div className="footer">
            <div className="footer-title">【ご連絡先】</div>
            <div>行政書士法人 JLS</div>
            <div>Email: yamaguchi@jls-gyosei.jp</div>
            <div className="footer-note">書類に関してご不明な点は、お気軽にご相談ください。</div>
          </div>

          {/* 合計 */}
          <div className="total-row">
            必要書類合計：{requiredItems.length} 件　／
            提出済：{requiredItems.filter(i => i.status !== "not_submitted").length} 件
          </div>
        </div>
      </body>
    </html>
  );
}
