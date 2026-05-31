import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ApplicationFormData } from "@/lib/form-types";
import { toFormType, getEmptyQuestions } from "@/lib/questionnaire-questions";

export default async function QuestionnairePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) notFound();

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId))
    .limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const cat = (form.visaFormCategory ?? "N") as string;

  const emptyQuestions = getEmptyQuestions(form, formType, cat);

  const sections = emptyQuestions.reduce<Record<string, typeof emptyQuestions>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
  });

  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn]
    .filter(Boolean).join(" ") || "（氏名不明）";

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <title>顧客確認質問書 — {applicantName}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: "MS Gothic", "Hiragino Kaku Gothic ProN", sans-serif; font-size: 11px; color: #111; background: #f3f4f6; }
          .page { background: #fff; max-width: 210mm; margin: 0 auto; padding: 14mm 16mm; min-height: 297mm; }
          @media screen { .page { margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,.12); border-radius: 4px; } }
          @media print { body { background: #fff; } .page { padding: 10mm 12mm; max-width: 100%; } .no-print { display: none !important; } }

          h1 { font-size: 16px; font-weight: bold; text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 4px; }
          .meta { font-size: 10px; color: #555; text-align: center; margin-bottom: 12px; }
          .instruction { background: #fff9e6; border: 1px solid #f0c040; border-radius: 4px; padding: 8px 12px; font-size: 10px; margin-bottom: 14px; line-height: 1.7; }

          .section-header { background: #1e3a5f; color: #fff; font-weight: bold; font-size: 11px; padding: 4px 8px; margin: 14px 0 4px; }
          .question-block { border: 1px solid #ccc; border-radius: 3px; margin-bottom: 6px; page-break-inside: avoid; }
          .question-label { background: #f0f4fa; font-weight: bold; font-size: 10.5px; padding: 4px 8px; border-bottom: 1px solid #ddd; }
          .question-note { font-size: 9px; color: #777; font-weight: normal; margin-left: 6px; }
          .answer-options { padding: 5px 8px; font-size: 10px; display: flex; flex-wrap: wrap; gap: 16px; }
          .answer-option { display: flex; align-items: center; gap: 4px; }
          .answer-line { height: 28px; border-bottom: 1px solid #aaa; margin: 5px 8px 6px; }

          .no-questions { text-align: center; padding: 30px; color: #666; font-size: 13px; border: 1px dashed #ccc; margin: 20px 0; }
          .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #bbb; font-size: 9px; color: #888; display: flex; justify-content: space-between; }

          .sign-area { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
        `}</style>
      </head>
      <body>
        <div className="page">
          <h1>在留申請　ご確認・ご記入のお願い</h1>
          <p className="meta">
            申請人：{applicantName}　|　案件番号：{app.caseNumber}　|　作成日：{today}
          </p>

          <div className="instruction">
            <strong>【お客様へ】</strong><br />
            下記の項目について、行政書士が申請書を作成するために必要な情報が不足しています。<br />
            各質問に対してご回答をご記入のうえ、担当行政書士までご返送ください。<br />
            ご不明な点がございましたら、担当者（090-2596-0128）までお問い合わせください。<br />
            <span style={{ color: "#c00", fontWeight: "bold" }}>
              ※ 記入漏れがある場合、申請書の提出が遅れる場合がございます。
            </span>
          </div>

          {Object.keys(sections).length === 0 ? (
            <div className="no-questions">
              ✅ 現時点で不足している情報はありません。<br />
              <span style={{ fontSize: "10px", color: "#888" }}>申請書の全フィールドに情報が入力されています。</span>
            </div>
          ) : (
            Object.entries(sections).map(([section, questions]) => (
              <div key={section}>
                <div className="section-header">{section}</div>
                {questions.map((q) => (
                  <div key={String(q.key)} className="question-block">
                    <div className="question-label">
                      {q.label}
                      {q.note && <span className="question-note">（{q.note}）</span>}
                    </div>
                    {q.options ? (
                      <div className="answer-options">
                        {q.options.map((opt) => (
                          <div key={opt} className="answer-option">
                            <span style={{ fontSize: "12px", border: "1px solid #999", width: "14px", height: "14px", display: "inline-block", flexShrink: 0 }} />
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="answer-line" />
                    )}
                  </div>
                ))}
              </div>
            ))
          )}

          <div className="sign-area" style={{ marginTop: "24px" }}>
            <div>
              <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px" }}>お客様署名・確認日</div>
              <div style={{ border: "1px solid #999", height: "48px", padding: "4px 8px" }} />
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px" }}>担当者確認欄（行政書士記入）</div>
              <div style={{ border: "1px solid #999", height: "48px", padding: "4px 8px" }} />
            </div>
          </div>

          <div className="footer">
            <span>行政書士法人 JLS　山口忠士　（yamaguchi@jls-gyosei.jp / 090-2596-0128）</span>
            <span>出力日：{today}　|　案件番号：{app.caseNumber}</span>
          </div>
        </div>
      </body>
    </html>
  );
}
