import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ApplicationFormData } from "@/lib/form-types";
import { PrintTrigger } from "../print-trigger";

function fmt(v: string | null | undefined) { return v || ""; }
function fmtDate(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 理由書本文をパラグラフに分割。空行で段落分け。見出し行はボールドにする */
function parseBody(body: string): { type: "heading" | "paragraph"; text: string }[] {
  if (!body) return [];
  const lines = body.split(/\n/);
  const blocks: { type: "heading" | "paragraph"; text: string }[] = [];
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push({ type: "paragraph", text: currentParagraph.join("\n") });
      currentParagraph = [];
    }
  };

  const headingPatterns = [
    /^申請の趣旨/,
    /^交際.*経緯/,
    /^経済的基盤/,
    /^経済的.*について/,
    /^結婚.*経緯/,
    /^招へい.*理由/,
    /^来日.*経緯/,
    /^同居.*必要性/,
    /^扶養.*能力/,
    /^在留.*必要性/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      flushParagraph();
      continue;
    }
    const isHeading = headingPatterns.some(p => p.test(trimmed));
    if (isHeading) {
      flushParagraph();
      blocks.push({ type: "heading", text: trimmed });
    } else {
      currentParagraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

export default async function RiyushoPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) notFound();

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;

  // 提出先管理局
  const bureau = form.riyushoSubmissionBureau || "";
  const bureauFull = bureau ? `${bureau}出入国在留管理局長` : "＿＿＿＿出入国在留管理局長";

  // 申請人情報（申請書データから引用）
  const applicantNameEn = [form.familyNameEn, form.givenNameEn].filter(Boolean).join(" ")
    || [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ");
  const nationality = form.nationality || applicant?.nationality || "";
  const dob = form.dateOfBirth || applicant?.dateOfBirth || "";
  const sex = form.sex || "";
  const sexLabel = sex.startsWith("男") ? "男" : sex.startsWith("女") ? "女" : "";

  // 理由書本文
  const bodyBlocks = parseBody(form.riyushoBody || "");

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>理由書 - {applicantNameEn}</title>
        <style>{`
          /* ── リセット ─────────────────────────────────────── */
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            margin: 0;
            background: #f3f4f6;
            font-family: "MS Mincho", "Yu Mincho", "Hiragino Mincho ProN", "游明朝", serif;
            font-size: 11pt;
            line-height: 1.9;
            color: #000;
          }

          /* ── 画面表示用 ──────────────────────────────────── */
          /* 理由書専用の上下余白。この .riyusho-page は本ファイル内のみで使用するクラスのため、
             他の申請書（申請人用・所属機関用等）のレイアウトには影響しない。 */
          .riyusho-page {
            max-width: 210mm;
            margin: 60px auto 40px;
            background: white;
            padding: 30mm 25mm 25mm 25mm;
            box-shadow: 0 0 12px rgba(0,0,0,0.08);
          }
          @media screen {
            /* 画面表示時のみ、固定ツールバー(PrintTrigger)との重なりを避けるための追加オフセット */
            .riyusho-page {
              padding-top: calc(30mm + 56px);
            }
          }

          /* 宛先 */
          .bureau {
            text-align: left;
            font-size: 12pt;
            margin-bottom: 20px;
          }

          /* タイトル */
          .doc-title {
            text-align: center;
            font-size: 18pt;
            font-weight: bold;
            margin: 16px 0 24px;
            letter-spacing: 0.3em;
          }

          /* 申請人情報テーブル */
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 28px;
          }
          .info-table th {
            width: 100px;
            text-align: left;
            padding: 4px 12px 4px 0;
            font-weight: normal;
            vertical-align: top;
            white-space: nowrap;
            border: none;
            background: transparent;
          }
          .info-table td {
            padding: 4px 0;
            border: none;
          }

          /* 本文 */
          .body-content {
            margin-bottom: 28px;
          }
          .section-heading {
            font-size: 11pt;
            font-weight: bold;
            margin: 20px 0 8px;
          }
          .section-paragraph {
            text-indent: 1em;
            margin: 0 0 12px;
            white-space: pre-wrap;
            text-align: justify;
          }
          .empty-note {
            color: #999;
            text-align: center;
            padding: 40px 0;
          }

          /* ── ツールバー非表示用 ──────────────────────────── */
          .no-print {}

          /* ── 印刷用 ─────────────────────────────────────── */
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; margin: 0; }
            .riyusho-page {
              margin: 0;
              padding: 0;
              box-shadow: none;
              max-width: 100%;
            }
          }
          /* 理由書（本ファイル）専用のページ余白。@pageのmarginは全ページ（複数ページにまたがる
             場合も各ページ共通）に適用されるため、.riyusho-pageのpaddingではなくこちらで
             上下の余白を確保する。他の印刷用ページ（shinsei-shared.tsx等）の@page定義とは
             独立しており影響しない。 */
          @page {
            size: A4;
            margin: 30mm 25mm 25mm 25mm;
          }
        `}</style>
      </head>
      <body>
        <PrintTrigger applicationId={id} />

        <div className="riyusho-page">
          {/* 宛先 */}
          <div className="bureau">
            {bureauFull}　殿
          </div>

          {/* タイトル */}
          <div className="doc-title">理由書</div>

          {/* 申請人情報テーブル */}
          <table className="info-table">
            <tbody>
              <tr>
                <th>氏　　名</th>
                <td>{fmt(applicantNameEn)}{sexLabel ? `（${sexLabel}）` : ""}</td>
              </tr>
              <tr>
                <th>国　　籍</th>
                <td>{fmt(nationality)}</td>
              </tr>
              <tr>
                <th>生年月日</th>
                <td>{fmtDate(dob)}</td>
              </tr>
            </tbody>
          </table>

          {/* 理由書本文 */}
          <div className="body-content">
            {bodyBlocks.length > 0 ? (
              bodyBlocks.map((block, i) =>
                block.type === "heading" ? (
                  <div key={i} className="section-heading">{block.text}</div>
                ) : (
                  <p key={i} className="section-paragraph">{block.text}</p>
                )
              )
            ) : (
              <p className="empty-note">（理由書本文が入力されていません）</p>
            )}
          </div>

        </div>
      </body>
    </html>
  );
}
