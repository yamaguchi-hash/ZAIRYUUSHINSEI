import { auth } from "@/lib/auth";
import { db, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { NoufushoPrintTrigger } from "./noufusho-print-trigger";

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

  const [application] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!application) notFound();

  const dd = (application.draftData as Record<string, any>) ?? {};
  const n = dd._noufusho ?? {};

  const feeType: number = n.feeType ?? 2;
  const amount: number = n.amount ?? 4000;
  const payerName: string = n.payerName ?? "";
  const appNum: string = n.applicationNumber ?? dd._submission?.applicationNumber ?? application.caseNumber ?? "";
  const amtStr = amount.toLocaleString("ja-JP");

  /* ── 手数料種別 ─────────────────────────────────────────── */
  const fees = [
    { n:1, ja:"在 留 資 格 の 変 更 許 可",            en:"Change of status of residence" },
    { n:2, ja:"在 留 期 間 の 更 新 許 可",            en:"Extension of period of stay" },
    { n:3, ja:"永　　　住　　　許　　　可",            en:"Permanent residence" },
    { n:4, ja:"再入国（一回限り・数次有効）の許可",      en:"Single / Multiple Re-entry into Japan" },
    { n:5, ja:"特 定 登 録 者 カ ー ド の 交 付",       en:"Issuance of Registered user card" },
    { n:6, ja:"特 定 登 録 者 カ ー ド の 再 交 付",    en:"Re-issuance of Registered user card" },
    { n:7, ja:"就 労 資 格 証 明 書 の 交 付",          en:"Certificate of Qualification to Work" },
    { n:8, ja:"在 留 カ ー ド の 再 交 付",             en:"Re-issuance(optional renewal) of Residence card" },
    { n:9, ja:"難 民 旅 行 証 明 書 の 交 付",          en:"Refugee Travel Document" },
  ];

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>手数料納付書</title>
        <style>{`
/* 手数料納付書（本ファイル）専用のページ設定。法務省様式に合わせた固定サイズ(174mm)を
   採用しており、--pdf-print-width（shinsei-applicant/shinsei-org等）とは独立している。 */
@page{size:A4 portrait;margin:19mm 18mm 18mm 18mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"MS PMincho","ＭＳ Ｐ明朝","Yu Mincho","YuMincho","Hiragino Mincho ProN",serif;
     color:#000;background:#bbb;font-size:11px;line-height:1.35}
.en{font-family:"Times New Roman",Times,serif}

/* ── 外枠 ── */
.page{background:#fff;width:174mm;min-height:260mm;margin:0 auto;padding:0;position:relative}

/* 番号枠（右上、外枠の外） */
.no-box{position:absolute;top:-18mm;right:0;width:62mm;border:0.5px solid #000}
.no-box-inner{padding:2.5mm 3mm}
.no-label{text-align:center;font-size:11px;letter-spacing:6px}
.no-label-en{text-align:center;font-size:10px;margin-top:0.5mm}
.no-value{text-align:center;font-size:13px;font-weight:bold;margin-top:1mm;min-height:5mm}

/* 様式番号（外枠の上） */
.form-ref{position:absolute;top:-18mm;left:0}
.form-ref .ja{font-size:11px}
.form-ref .en{font-size:10px;margin-top:0.5mm}

/* 省名（外枠の上） */
.ministry{position:absolute;top:-8mm;left:0}
.ministry .ja{font-size:11px}
.ministry .en{font-size:10px;margin-top:0.5mm}

/* 外枠 */
.outer{border:0.5px solid #000;width:100%;min-height:232mm;position:relative;padding:0}

/* ── 日付枠（右寄せ） ── */
.date-area{display:flex;justify-content:flex-end;padding:1.5mm 0 0 0}
.date-tbl{border-collapse:collapse}
.date-tbl td{border:0.5px solid #000;width:12mm;text-align:center;padding:0.5mm 0;font-size:10px;line-height:1.3}
.date-tbl .lbl-en{font-size:9px}

/* ── タイトル ── */
.title-row{text-align:center;padding:3mm 0 1mm}
.title-ja{font-size:14px;letter-spacing:10px}
.title-en{font-size:12px;margin-top:1mm}

/* ── 印紙欄 ── */
.stamp-box{position:absolute;top:8mm;right:4mm;width:17mm;height:22mm;
           border:0.5px solid #000;display:flex;align-items:center;justify-content:center;
           writing-mode:vertical-rl;font-size:14px;letter-spacing:4px}

/* ── 宛名 ── */
.addr{padding:4mm 0 0 3mm}
.addr-ja{font-size:14px;line-height:1.8}
.addr-distributed{letter-spacing:10px}
.addr-dono{letter-spacing:0;margin-left:4px}
.addr-en{font-size:10px;line-height:1.5;margin:0.5mm 0 0 5mm}

/* ── 金額 ── */
.amt{text-align:center;padding:5mm 0 0}
.amt-line{font-size:11px}
.amt-val{font-size:13px;font-weight:bold}
.amt-yen{text-align:center;font-size:10px;padding:0.5mm 0 0}
.amt-uline{margin:0.5mm auto 0;width:65%;border-bottom:0.5px solid #000;height:1px}

/* ── 法的文言 ── */
.legal{padding:3mm 0 0 8mm;font-size:11px;line-height:1.7}
.legal-en{font-size:10px;line-height:1.5;margin:0.5mm 0 0 8mm}

/* ── 手数料リスト ── */
.fee-wrap{display:flex;align-items:stretch;padding:3mm 0 0 4mm}
.fee-left{writing-mode:vertical-rl;font-size:11px;letter-spacing:2px;
          display:flex;align-items:center;justify-content:center;padding:0 2mm 0 0}
.fee-bracket-l{width:2mm;border-left:0.8px solid #000;border-top:0.8px solid #000;border-bottom:0.8px solid #000;
               border-radius:3px 0 0 3px}
.fee-list{flex:1;padding:1mm 0}
.fee-row{display:flex;align-items:baseline;gap:2mm;line-height:1.25}
.fee-num{width:5mm;text-align:center;font-size:11px;flex-shrink:0}
.fee-circle{width:6mm;height:6mm;border:1.5px solid #000;border-radius:50%;
            display:inline-flex;align-items:center;justify-content:center;
            font-size:11px;font-weight:bold;flex-shrink:0}
.fee-ja{font-size:11px;letter-spacing:1.5px}
.fee-en{font-size:10px;padding:0 0 1.5mm 7mm}
.fee-bracket-r{width:2mm;border-right:0.8px solid #000;border-top:0.8px solid #000;border-bottom:0.8px solid #000;
               border-radius:0 3px 3px 0}
.fee-right{writing-mode:vertical-rl;font-size:11px;letter-spacing:1.5px;
           display:flex;align-items:center;justify-content:center;padding:0 0 0 2mm}

/* ── 納付者 ── */
.payer{display:flex;align-items:baseline;justify-content:center;gap:3mm;padding:6mm 0 0}
.payer-lbl{font-size:11px;white-space:nowrap}
.payer-val{font-size:14px;font-weight:bold;border-bottom:1px solid #000;
           min-width:65mm;padding:0 2mm 1mm;text-align:center}
.kimei{text-align:center;padding:2mm 15mm 0 0}
.kimei-ja{font-size:11px;letter-spacing:12px}
.kimei-en{font-size:10px}

/* ── 注 ── */
.note{padding:4mm 0 0 3mm;font-size:11px;line-height:1.6}
.note-en{font-size:10px}

/* ── 印刷 ── */
.no-print{}
@media print{
  body{background:#fff}
  .no-print{display:none!important}
  .wrapper{padding:0;margin:0}
  .page{margin:0;box-shadow:none;width:100%}
}
@media screen{
  .wrapper{padding:50px 0 30px}
  .page{margin:0 auto;box-shadow:0 3px 20px rgba(0,0,0,.2);border-radius:2px}
}
`}</style>
      </head>
      <body>
        <NoufushoPrintTrigger label={payerName || appNum} />
        <div className="wrapper">
        <div className="page" style={{padding:"22mm 5mm 8mm 5mm"}}>

          {/* 様式番号 */}
          <div className="form-ref">
            <div className="ja" style={{fontWeight:"bold"}}>別記第八十四号様式（第六十一条関係）</div>
            <div className="en" style={{fontFamily:"'Times New Roman',serif",fontSize:"10px"}}>Annex No. 84 (Related to Article 61)</div>
          </div>

          {/* 省名 */}
          <div className="ministry">
            <div className="ja">日本国政府法務省</div>
            <div className="en" style={{fontFamily:"'Times New Roman',serif",fontSize:"10px"}}>Ministry of Justice, Government of Japan</div>
          </div>

          {/* 番号枠 */}
          <div className="no-box">
            <div className="no-box-inner">
              <div className="no-label">番　号</div>
              <div className="no-label-en en">No.</div>
              <div className="no-value">{appNum}</div>
            </div>
          </div>

          {/* ===== 外枠 ===== */}
          <div className="outer">

            {/* 日付 */}
            <div className="date-area">
              <table className="date-tbl">
                <tbody>
                  <tr>
                    <td>年</td><td>月</td><td>日</td>
                  </tr>
                  <tr>
                    <td className="en lbl-en">Year</td>
                    <td className="en lbl-en">Month</td>
                    <td className="en lbl-en">Day</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* タイトル */}
            <div className="title-row">
              <div className="title-ja">手　数　料　納　付　書</div>
              <div className="title-en en">CERTIFICATE FOR PAYMENT OF FEE</div>
            </div>

            {/* 印紙 */}
            <div className="stamp-box">印　紙</div>

            {/* 宛名 */}
            <div className="addr">
              <div className="addr-ja">
                <span className="addr-distributed">法　務　大　臣</span><br/>
                出入国在留管理庁長官<span className="addr-dono">　殿</span>
              </div>
              <div className="addr-en en">
                To&ensp;the Minister of Justice<br/>
                &emsp;&ensp;the Commissioner of the Immigration Services Agency
              </div>
            </div>

            {/* 金額 */}
            <div className="amt">
              <div className="amt-line">
                金　<span className="amt-val">{amtStr}</span>　円　也（￥<span className="amt-val">{amtStr}</span>）
              </div>
            </div>
            <div className="amt-yen en">Yen</div>
            <div className="amt-uline"></div>

            {/* 法的文言 */}
            <div className="legal">
              出入国管理及び難民認定法第67条，第67条の2又は第68条の規定により，
            </div>
            <div className="legal-en en">
              In accordance with Article 67, 67-2 or 68 of the Immigration Control and Refugee Recognition Act,<br/>
              I hereby pay the amount shown as fee for permission for
            </div>

            {/* 手数料種別リスト */}
            <div className="fee-wrap">
              <div className="fee-left">上記金額を</div>
              <div className="fee-bracket-l"></div>
              <div className="fee-list">
                {fees.map((f)=>(
                  <div key={f.n}>
                    <div className="fee-row">
                      {f.n===feeType
                        ? <div className="fee-circle">{f.n}</div>
                        : <div className="fee-num">{f.n}</div>}
                      <div className="fee-ja">{f.ja}</div>
                    </div>
                    <div className="fee-en en">{f.en}</div>
                  </div>
                ))}
              </div>
              <div className="fee-bracket-r"></div>
              <div className="fee-right">手数料として納付いたします。</div>
            </div>

            {/* 納付者氏名 */}
            <div className="payer">
              <div className="payer-lbl">納付者氏名</div>
              <div className="payer-val">{payerName}</div>
            </div>
            <div className="kimei">
              <div className="kimei-ja">記　名</div>
              <div className="kimei-en en">Name</div>
            </div>

          </div>{/* /outer */}

          {/* 注 */}
          <div className="note">
            （注）用紙の大きさは，日本産業規格Ａ列４番とする。<br/>
            <span className="note-en en">Note: Paper size must be A-4 as specified in the Japanese Industrial Standards.</span>
          </div>

        </div>{/* /page */}
        </div>
      </body>
    </html>
  );
}
