import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster, applicationDocumentChecklist } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { PrintTrigger } from "./print-trigger";

function formatDateJa(date: Date | string | null | undefined): string {
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
        .where(eq(organizationMaster.id, application.organizationId)).limit(1).then(r => r[0])
    : null;

  const checklist = await db
    .select()
    .from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id));

  // 必須書類のみ表示（isRequiredByExpert=true）
  const requiredItems = checklist.filter(c => c.isRequiredByExpert);

  const today = formatDateJa(new Date());
  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ");
  const applicantNameJa = [applicant?.familyNameJa, applicant?.givenNameJa].filter(Boolean).join(" ");

  return (
    <>
      {/* 印刷トリガー（画面表示のみ・印刷時非表示） */}
      <PrintTrigger applicationId={id} />

      {/* 印刷コンテンツ */}
      <div className="print-page bg-white min-h-screen p-10 font-sans text-gray-900 max-w-3xl mx-auto">

        {/* ヘッダー */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold">在留資格申請　必要書類チェックリスト</h1>
              <p className="text-sm text-gray-600 mt-1">
                行政書士法人 JLS（yamaguchi@jls-gyosei.jp）
              </p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <p>作成日：{today}</p>
              <p className="font-mono text-xs mt-1">{application.caseNumber}</p>
            </div>
          </div>
        </div>

        {/* 申請人情報 */}
        <table className="w-full text-sm mb-6 border border-gray-300">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="bg-gray-100 px-3 py-2 font-medium w-28">申請人</td>
              <td className="px-3 py-2">
                {applicantName}
                {applicantNameJa && <span className="ml-2 text-gray-600">（{applicantNameJa}）</span>}
              </td>
              <td className="bg-gray-100 px-3 py-2 font-medium w-24">国籍</td>
              <td className="px-3 py-2">{applicant?.nationality ?? "—"}</td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className="bg-gray-100 px-3 py-2 font-medium">在留資格</td>
              <td className="px-3 py-2">{VISA_TYPE_LABELS[application.visaType] ?? application.visaType}</td>
              <td className="bg-gray-100 px-3 py-2 font-medium">申請種別</td>
              <td className="px-3 py-2">{APPLICATION_TYPE_LABELS[application.applicationType] ?? application.applicationType}</td>
            </tr>
            {organization && (
              <tr>
                <td className="bg-gray-100 px-3 py-2 font-medium">所属機関</td>
                <td className="px-3 py-2" colSpan={3}>{organization.nameJa}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 説明文 */}
        <div className="bg-gray-50 border border-gray-300 rounded p-3 mb-6 text-sm">
          <p className="font-semibold mb-1">【ご提出のお願い】</p>
          <p>以下の書類をご用意いただき、担当行政書士へご提出ください。</p>
          <p className="text-gray-600 text-xs mt-1">
            ※ 原本が必要な書類は原本でご用意ください。コピー可の書類はA4サイズでご準備ください。
          </p>
        </div>

        {/* チェックリスト表 */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="px-2 py-2 text-center w-8">No.</th>
              <th className="px-3 py-2 text-center w-8">□</th>
              <th className="px-3 py-2 text-left">書類名</th>
              <th className="px-3 py-2 text-center w-20">状態</th>
            </tr>
          </thead>
          <tbody>
            {requiredItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400 border border-gray-200">
                  必要書類が登録されていません
                </td>
              </tr>
            ) : (
              requiredItems.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-gray-200 px-2 py-2.5 text-center text-gray-500">
                    {idx + 1}
                  </td>
                  <td className="border border-gray-200 px-2 py-2.5 text-center text-lg">
                    {item.status === "approved" ? "✓" :
                     item.status === "submitted" ? "◎" : "□"}
                  </td>
                  <td className="border border-gray-200 px-3 py-2.5">
                    <span className="font-medium">{item.documentName}</span>
                    {item.expertNotes && (
                      <p className="text-xs text-gray-500 mt-0.5">※ {item.expertNotes}</p>
                    )}
                  </td>
                  <td className="border border-gray-200 px-2 py-2.5 text-center text-xs">
                    {item.status === "approved" ? (
                      <span className="text-green-700 font-medium">確認済</span>
                    ) : item.status === "submitted" ? (
                      <span className="text-blue-700 font-medium">提出済</span>
                    ) : item.status === "resubmit_required" ? (
                      <span className="text-red-700 font-medium">再提出</span>
                    ) : (
                      <span className="text-gray-400">未提出</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 凡例 */}
        <div className="mt-4 text-xs text-gray-500 flex gap-6">
          <span>□ 未提出</span>
          <span>◎ 提出済（確認中）</span>
          <span>✓ 確認済</span>
        </div>

        {/* フッター */}
        <div className="mt-10 pt-4 border-t border-gray-300 text-sm">
          <p className="font-semibold">【ご連絡先】</p>
          <p className="text-gray-700 mt-1">行政書士法人 JLS</p>
          <p className="text-gray-700">Email: yamaguchi@jls-gyosei.jp</p>
          <p className="text-gray-500 text-xs mt-3">
            書類に関してご不明な点は、お気軽にご相談ください。
          </p>
        </div>

        {/* 合計件数 */}
        <div className="mt-6 text-right text-sm text-gray-600">
          必要書類合計：{requiredItems.length} 件
          提出済：{requiredItems.filter(i => i.status !== "not_submitted").length} 件
        </div>
      </div>

      {/* 印刷用スタイル */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page { padding: 0; max-width: 100%; }
        }
        @media screen {
          body { background: #f3f4f6; }
        }
      `}</style>
    </>
  );
}
