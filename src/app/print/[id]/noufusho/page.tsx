import { auth } from "@/lib/auth";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { NoufushoPrintTrigger } from "./noufusho-print-trigger";

// ── 手数料種別定義 ─────────────────────────────────────────────────────────────
const FEE_ITEMS = [
  { num: 1, ja: "在 留 資 格 の 変 更 許 可", en: "Change of status of residence" },
  { num: 2, ja: "在 留 期 間 の 更 新 許 可", en: "Extension of period of stay" },
  { num: 3, ja: "永　　　住　　　許　　　可", en: "Permanent residence" },
  { num: 4, ja: "再入国（一回限り・数次有効）の許可", en: "Single / Multiple Re-entry into Japan" },
  { num: 5, ja: "特 定 登 録 者 カ ー ド の 交 付", en: "Issuance of Registered user card" },
  { num: 6, ja: "特 定 登 録 者 カ ー ド の 再 交 付", en: "Re-issuance of Registered user card" },
  { num: 7, ja: "就 労 資 格 証 明 書 の 交 付", en: "Certificate of Qualification to Work" },
  { num: 8, ja: "在 留 カ ー ド の 再 交 付", en: "Re-issuance(optional renewal) of Residence card" },
  { num: 9, ja: "難 民 旅 行 証 明 書 の 交 付", en: "Refugee Travel Document" },
];

export default async function NoufushoPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let session;
  try { session = await auth(); } catch { notFound(); }
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [application] = await db
    .select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!application) notFound();

  const draftData = (application.draftData as Record<string, any>) ?? {};
  const noufusho = draftData._noufusho ?? {};

  const feeType: number = noufusho.feeType ?? 2;
  const amount: number = noufusho.amount ?? 4000;
  const payerName: string = noufusho.payerName ?? "";
  const applicationNumber: string = noufusho.applicationNumber ?? draftData._submission?.applicationNumber ?? application.caseNumber ?? "";

  const amountFormatted = amount.toLocaleString("ja-JP");

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>手数料納付書 - {payerName || applicationNumber}</title>
        <style>{`
          @page {
            size: A4 portrait;
            margin: 18mm 20mm 15mm 20mm;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "MS PMincho", serif;
            font-size: 12px;
            color: #000;
            background: #d1d5db;
            line-height: 1.6;
          }
          .page {
            background: white;
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 18mm 22mm 15mm 22mm;
            position: relative;
          }

          /* ── ヘッダー ──────────────────────── */
          .header { margin-bottom: 8px; }
          .form-ref { font-size: 11px; font-weight: bold; }
          .form-ref-en { font-size: 9.5px; margin-top: 1px; }

          /* ── 番号＋省名 ────────────────────── */
          .top-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 12px;
            margin-bottom: 6px;
          }
          .ministry { font-size: 11px; }
          .ministry-en { font-size: 9px; }
          .no-box {
            text-align: center;
            min-width: 160px;
          }
          .no-label {
            font-size: 13px;
            letter-spacing: 8px;
          }
          .no-label-en { font-size: 9px; }
          .no-value {
            font-size: 13px;
            font-weight: bold;
            margin-top: 4px;
            min-height: 20px;
          }

          /* ── 日付＋タイトル ─────────────────── */
          .date-title-row {
            display: flex;
            justify-content: flex-end;
            align-items: flex-end;
            margin-top: 10px;
            margin-bottom: 4px;
          }
          .date-boxes {
            display: flex;
            gap: 0;
            border: 1px solid #000;
          }
          .date-cell {
            width: 48px;
            text-align: center;
            padding: 2px 4px;
            border-right: 1px solid #000;
            font-size: 11px;
            line-height: 1.4;
          }
          .date-cell:last-child { border-right: none; }
          .date-cell .label { font-size: 10px; }
          .date-cell .label-en { font-size: 7.5px; color: #333; }

          .title-section {
            text-align: center;
            margin: 8px 0 4px;
          }
          .title-ja {
            font-size: 22px;
            font-weight: bold;
            letter-spacing: 16px;
            margin-bottom: 4px;
          }
          .title-en {
            font-size: 11px;
            letter-spacing: 1px;
          }

          /* ── 印紙枠 ────────────────────────── */
          .inshi-area {
            position: absolute;
            top: 120px;
            right: 22mm;
            width: 68px;
            text-align: center;
          }
          .inshi-box {
            border: 1px solid #000;
            width: 68px;
            height: 90px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .inshi-label {
            font-size: 16px;
            letter-spacing: 6px;
            writing-mode: vertical-rl;
          }

          /* ── 宛名 ─────────────────────────── */
          .addressee {
            margin: 16px 0 10px;
            font-size: 14px;
            line-height: 2.0;
          }
          .addressee-main {
            letter-spacing: 12px;
          }
          .addressee-sub {
            font-size: 13px;
          }
          .addressee-en {
            font-size: 9.5px;
            line-height: 1.5;
            margin-left: 20px;
          }

          /* ── 金額 ─────────────────────────── */
          .amount-row {
            text-align: center;
            margin: 20px 0 4px;
            font-size: 15px;
          }
          .amount-value {
            font-size: 18px;
            font-weight: bold;
            text-decoration: underline;
            text-underline-offset: 4px;
            letter-spacing: 2px;
          }
          .amount-yen {
            font-size: 9px;
            text-align: center;
            margin-bottom: 10px;
          }

          /* ── 法的文言 ──────────────────────── */
          .legal-text {
            font-size: 11px;
            line-height: 1.7;
            margin-bottom: 14px;
          }
          .legal-text-en {
            font-size: 9px;
            line-height: 1.5;
            margin-left: 16px;
          }

          /* ── 手数料種別リスト ───────────────── */
          .fee-list-container {
            display: flex;
            align-items: stretch;
            margin: 10px 0 16px;
          }
          .fee-left-label {
            writing-mode: vertical-rl;
            font-size: 13px;
            letter-spacing: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding-right: 6px;
            min-width: 28px;
          }
          .fee-bracket {
            border-left: 1.5px solid #000;
            border-top: 1.5px solid #000;
            border-bottom: 1.5px solid #000;
            width: 8px;
            border-radius: 4px 0 0 4px;
          }
          .fee-items {
            flex: 1;
            padding: 4px 0 4px 4px;
          }
          .fee-item {
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 2px;
            line-height: 1.3;
          }
          .fee-num {
            width: 18px;
            text-align: center;
            font-size: 12px;
            flex-shrink: 0;
          }
          .fee-circle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border: 2px solid #000;
            border-radius: 50%;
            font-size: 12px;
            font-weight: bold;
            flex-shrink: 0;
          }
          .fee-label-ja {
            font-size: 12px;
            letter-spacing: 2px;
          }
          .fee-label-en {
            font-size: 8.5px;
            color: #333;
            margin-left: 26px;
            margin-bottom: 4px;
          }
          .fee-bracket-right {
            border-right: 1.5px solid #000;
            border-top: 1.5px solid #000;
            border-bottom: 1.5px solid #000;
            width: 8px;
            border-radius: 0 4px 4px 0;
          }
          .fee-right-label {
            writing-mode: vertical-rl;
            font-size: 12px;
            letter-spacing: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding-left: 6px;
            min-width: 24px;
          }

          /* ── 納付者氏名 ────────────────────── */
          .payer-section {
            margin-top: 24px;
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 12px;
          }
          .payer-label {
            font-size: 13px;
            white-space: nowrap;
          }
          .payer-name {
            font-size: 16px;
            font-weight: bold;
            border-bottom: 1.5px solid #000;
            min-width: 260px;
            padding-bottom: 2px;
            text-align: center;
          }
          .kimeisection {
            text-align: center;
            margin-top: 8px;
            margin-right: 40px;
          }
          .kimei-ja {
            font-size: 13px;
            letter-spacing: 16px;
          }
          .kimei-en {
            font-size: 9px;
          }

          /* ── フッター ──────────────────────── */
          .footer-note {
            position: absolute;
            bottom: 15mm;
            left: 22mm;
            right: 22mm;
            font-size: 9.5px;
            line-height: 1.5;
          }

          /* ── 印刷時 ────────────────────────── */
          @media print {
            body { background: white; }
            .page {
              padding: 0;
              min-height: auto;
              max-width: 100%;
              box-shadow: none;
            }
            .no-print { display: none !important; }
            .inshi-area { right: 0; }
            .footer-note { left: 0; right: 0; }
          }
          @media screen {
            .page {
              margin: 54px auto 40px;
              box-shadow: 0 4px 24px rgba(0,0,0,0.18);
              border-radius: 3px;
            }
          }
        `}</style>
      </head>
      <body>
        <NoufushoPrintTrigger label={payerName || applicationNumber} />

        <div className="page">
          {/* ── ヘッダー（様式番号） ─── */}
          <div className="header">
            <div className="form-ref">別記第八十四号様式（第六十一条関係）</div>
            <div className="form-ref-en">Annex No. 84 (Related to Article 61)</div>
          </div>

          {/* ── 番号＋省名 ─── */}
          <div className="top-row">
            <div>
              <div className="ministry">日本国政府法務省</div>
              <div className="ministry-en">Ministry of Justice, Government of Japan</div>
            </div>
            <div className="no-box">
              <div className="no-label">番　号</div>
              <div className="no-label-en">No.</div>
              <div className="no-value">{applicationNumber}</div>
            </div>
          </div>

          {/* ── 日付 ─── */}
          <div className="date-title-row">
            <div className="date-boxes">
              <div className="date-cell">
                <div className="label">年</div>
                <div className="label-en">Year</div>
              </div>
              <div className="date-cell">
                <div className="label">月</div>
                <div className="label-en">Month</div>
              </div>
              <div className="date-cell">
                <div className="label">日</div>
                <div className="label-en">Day</div>
              </div>
            </div>
          </div>

          {/* ── タイトル ─── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="title-section">
                <div className="title-ja">手 数 料 納 付 書</div>
                <div className="title-en">CERTIFICATE FOR PAYMENT OF FEE</div>
              </div>
            </div>
            {/* 印紙枠 */}
            <div className="inshi-area" style={{ position: "relative", top: 0, right: 0 }}>
              <div className="inshi-box">
                <div className="inshi-label">印　紙</div>
              </div>
            </div>
          </div>

          {/* ── 宛名 ─── */}
          <div className="addressee">
            <div><span className="addressee-main">法　　務　　大　　臣</span></div>
            <div className="addressee-sub">出入国在留管理庁長官　殿</div>
            <div className="addressee-en">
              To&nbsp;&nbsp;the Minister of Justice<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;the Commissioner of the Immigration Services Agency
            </div>
          </div>

          {/* ── 金額 ─── */}
          <div className="amount-row">
            金　<span className="amount-value">{amountFormatted}</span>　円　也（￥　<span style={{ fontWeight: "bold" }}>{amountFormatted}</span>　）
          </div>
          <div className="amount-yen">Yen</div>

          {/* ── 法的文言 ─── */}
          <div className="legal-text">
            出入国管理及び難民認定法第67条，第67条の2又は第68条の規定により，
            <div className="legal-text-en">
              In accordance with Article 67, 67-2 or 68 of the Immigration Control and Refugee Recognition Act,<br />
              I hereby pay the amount shown as fee for permission for
            </div>
          </div>

          {/* ── 手数料種別リスト ─── */}
          <div className="fee-list-container">
            <div className="fee-left-label">上記金額を</div>
            <div className="fee-bracket" />
            <div className="fee-items">
              {FEE_ITEMS.map((item) => (
                <div key={item.num}>
                  <div className="fee-item">
                    {item.num === feeType ? (
                      <div className="fee-circle">{item.num}</div>
                    ) : (
                      <div className="fee-num">{item.num}</div>
                    )}
                    <div className="fee-label-ja">{item.ja}</div>
                  </div>
                  <div className="fee-label-en">{item.en}</div>
                </div>
              ))}
            </div>
            <div className="fee-bracket-right" />
            <div className="fee-right-label">手数料として納付いたします。</div>
          </div>

          {/* ── 納付者氏名 ─── */}
          <div className="payer-section">
            <div className="payer-label">納付者氏名</div>
            <div className="payer-name">{payerName}</div>
          </div>
          <div className="kimeisection">
            <div className="kimei-ja">記　名</div>
            <div className="kimei-en">Name</div>
          </div>

          {/* ── フッター ─── */}
          <div className="footer-note">
            （注）用紙の大きさは，日本産業規格Ａ列４番とする。<br />
            Note: Paper size must be A-4 as specified in the Japanese Industrial Standards.
          </div>
        </div>
      </body>
    </html>
  );
}
