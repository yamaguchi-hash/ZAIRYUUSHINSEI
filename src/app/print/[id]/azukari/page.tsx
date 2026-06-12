import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, applicantDocuments } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { AGENT_MASTER } from "@/lib/agent-master";
import { AzukariPrintTrigger } from "./azukari-print-trigger";

function formatDateJaLong(dateStr?: string | null): string {
  if (!dateStr) return "　　年　　月　　日";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default async function AzukariPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let session;
  try {
    session = await auth();
  } catch {
    notFound();
  }
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!application) notFound();

  // 預書は在留資格変更許可申請・在留期間更新許可申請の場合のみ発行可能
  if (application.applicationType !== "change" && application.applicationType !== "renewal") {
    notFound();
  }

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.id, application.applicantId))
    .limit(1);

  const draftData = (application.draftData as Record<string, any>) ?? {};
  const azukari = draftData._azukari ?? {};
  const submission = draftData._submission ?? {};

  // 申請人マスターのアップロード書類から画像URLを取得
  let cardFrontUrl = "";
  let cardBackUrl = "";
  let passportUrl = "";
  try {
    const appDocs = await db
      .select({ documentType: applicantDocuments.documentType, fileUrl: applicantDocuments.fileUrl })
      .from(applicantDocuments)
      .where(eq(applicantDocuments.applicantId, application.applicantId));
    for (const doc of appDocs) {
      if (doc.documentType === "residence_card_front") cardFrontUrl = doc.fileUrl;
      if (doc.documentType === "residence_card_back") cardBackUrl = doc.fileUrl;
      if (doc.documentType === "passport_data_page" || doc.documentType === "passport_front") {
        passportUrl = doc.fileUrl;
      }
    }
  } catch (e) {
    console.error("[AzukariPrintPage] applicantDocuments fetch failed:", e);
  }

  const includePassport = azukari.includePassport ?? false;
  const residenceCardKind: string = azukari.residenceCardKind ?? "原本";
  const passportKind: string = azukari.passportKind ?? "原本";
  // 申請日・申請番号は⑦の記録から自動引用
  const applicationDate = submission.applicationDate ?? "";
  const applicationNumber = submission.applicationNumber
    ?? application.caseNumber
    ?? "";

  // 申請種別テキスト
  const appTypeLabel = APPLICATION_TYPE_LABELS[application.applicationType] ?? application.applicationType;

  // タイトル（パスポートを含むかで動的に切替）
  const docTitle = includePassport ? "パスポート及び在留カード預証" : "在留カード預証";

  // 申請人名
  const applicantNameJa = [applicant?.familyNameJa, applicant?.givenNameJa].filter(Boolean).join("　") || "";
  const applicantNameEn = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ") || "";

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{docTitle} - {applicantNameEn || applicantNameJa}</title>
        <style>{`
          /* 在留カード預証（本ファイル）専用のページ設定。固定A4サイズを採用しており、
             --pdf-print-width（shinsei-applicant/shinsei-org等）とは独立しているため、
             その変更による影響は受けない。 */
          @page {
            size: A4 portrait;
            margin: 15mm 20mm;
          }

          * { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            font-family: "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "MS PMincho", serif;
            font-size: 14px;
            color: #000;
            background: #e5e7eb;
            line-height: 1.8;
          }

          .page {
            background: white;
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 20mm 25mm;
            position: relative;
          }

          /* ── タイトル ──────────────────────────── */
          .title {
            text-align: center;
            font-size: 26px;
            font-weight: bold;
            letter-spacing: 6px;
            margin-bottom: 20px;
            color: #000;
          }

          /* ── 対象外国人情報 ─────────────────────── */
          .applicant-info {
            width: fit-content;
            margin: 0 auto 18px;
            font-size: 14px;
            line-height: 2;
          }
          .applicant-info .row { display: flex; }
          .applicant-info .lbl {
            width: 7.5em;
            font-weight: bold;
            flex-shrink: 0;
          }

          /* ── お預かり対象物 ─────────────────────── */
          .deposit-items {
            width: fit-content;
            margin: 0 auto 20px;
            font-size: 14px;
            line-height: 2;
            border: 1px solid #999;
            border-radius: 4px;
            padding: 8px 24px;
          }
          .deposit-items .heading {
            font-weight: bold;
            margin-bottom: 2px;
          }

          /* ── カード画像エリア ──────────────────── */
          .card-images {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            margin-bottom: 30px;
          }

          .card-image-wrapper {
            width: 100%;
            max-width: 460px;
            border: 1px solid #bbb;
            border-radius: 4px;
            overflow: hidden;
            box-shadow: 1px 2px 6px rgba(0,0,0,0.12);
          }

          .card-image-wrapper img {
            width: 100%;
            display: block;
          }

          /* ── パスポート画像 ──────────────────── */
          .passport-section {
            margin-bottom: 30px;
            text-align: center;
          }

          .passport-image-wrapper {
            display: inline-block;
            max-width: 420px;
            width: 100%;
            border: 1px solid #bbb;
            border-radius: 4px;
            overflow: hidden;
            box-shadow: 1px 2px 6px rgba(0,0,0,0.12);
          }

          .passport-image-wrapper img {
            width: 100%;
            display: block;
          }

          /* ── テキストセクション ──────────────── */
          .info-section {
            text-align: center;
            margin-top: 36px;
            font-size: 15px;
            line-height: 2.2;
          }

          .info-section .main-text {
            font-size: 15px;
            margin-bottom: 10px;
          }

          .info-section .detail-line {
            font-size: 14px;
          }

          /* ── 印鑑位置 ──────────────────────── */
          .seal-area {
            position: absolute;
            bottom: 25mm;
            right: 30mm;
            width: 80px;
            height: 80px;
            border: 2px solid #c0392b;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: #c0392b;
            text-align: center;
            line-height: 1.3;
          }

          .no-print { }

          @media print {
            body { background: white; }
            .page {
              padding: 0;
              min-height: auto;
              max-width: 100%;
              box-shadow: none;
            }
            .no-print { display: none !important; }
            .seal-area {
              bottom: 15mm;
              right: 20mm;
            }
          }

          @media screen {
            .page {
              margin: 60px auto 40px;
              box-shadow: 0 4px 24px rgba(0,0,0,0.15);
              border-radius: 4px;
            }
          }
        `}</style>
      </head>
      <body>
        {/* 印刷ボタンバー（クライアントコンポーネント） */}
        <AzukariPrintTrigger applicantName={applicantNameEn || applicantNameJa} title={docTitle} />

        <div className="page">
          {/* タイトル（パスポートを含むかで動的に切替） */}
          <div className="title">{docTitle}</div>

          {/* 対象外国人情報（案件DBから自動マージ） */}
          <div className="applicant-info">
            <div className="row">
              <span className="lbl">氏　名</span>
              <span>
                {applicantNameEn}
                {applicantNameJa ? `（${applicantNameJa}）` : ""}
              </span>
            </div>
            <div className="row">
              <span className="lbl">国籍・地域</span>
              <span>{applicant?.nationality ?? ""}</span>
            </div>
            <div className="row">
              <span className="lbl">生年月日</span>
              <span>{formatDateJaLong(applicant?.dateOfBirth)}</span>
            </div>
          </div>

          {/* お預かり対象物（選択結果に応じて■/□・区分を表示） */}
          <div className="deposit-items">
            <div className="heading">お預かりする対象物</div>
            <div>■　在留カード（{residenceCardKind}）</div>
            <div>{includePassport ? "■" : "□"}　パスポート（{includePassport ? passportKind : "　　"}）</div>
          </div>

          {/* 在留カード画像 */}
          <div className="card-images">
            {cardFrontUrl && (
              <div className="card-image-wrapper">
                <img src={cardFrontUrl} alt="在留カード表面" />
              </div>
            )}
            {cardBackUrl && (
              <div className="card-image-wrapper">
                <img src={cardBackUrl} alt="在留カード裏面" />
              </div>
            )}
          </div>

          {/* パスポート（任意） */}
          {includePassport && passportUrl && (
            <div className="passport-section">
              <div className="passport-image-wrapper">
                <img src={passportUrl} alt="パスポート" />
              </div>
            </div>
          )}

          {/* テキストセクション */}
          <div className="info-section">
            <div className="main-text">
              上記記載の外国人は、現在オンラインで{appTypeLabel}中である。
            </div>
            <div className="detail-line">
              オンラインシステム利用者（取次者）氏名　{AGENT_MASTER.name}　（職業：{AGENT_MASTER.occupation}）
            </div>
            <div className="detail-line">
              オンラインシステム利用者（取次者）の連絡先　{AGENT_MASTER.phone}
            </div>
            <div className="detail-line">
              申請受付日　{applicationDate ? formatDateJaLong(applicationDate) : "　　年　　月　　日"}
            </div>
            <div className="detail-line">
              申請受付番号　{applicationNumber || "＿＿＿＿＿＿＿＿＿＿＿＿"}
            </div>
          </div>

          {/* 職印エリア（印刷用スペース） */}
          <div className="seal-area">
            行政書士<br />職印
          </div>
        </div>
      </body>
    </html>
  );
}
