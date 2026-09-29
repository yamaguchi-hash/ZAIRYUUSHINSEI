/**
 * 質問書 → Apps Script 経由 Google ドキュメント作成 API
 * GOOGLE_APPS_SCRIPT_URL が設定済みの場合のみ動作。
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster, organizationMaster, applicationDocumentChecklist } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { toFormType } from "@/lib/questionnaire-questions";
import { buildEffectiveFormData } from "@/lib/effective-form-data";
import { computeInterviewQuestions, type InterviewQuestion } from "@/lib/interview-diff";

type DocLine = { type: string; text: string };

function buildLines(
  applicantName: string,
  caseNumber: string | null,
  sections: Record<string, InterviewQuestion[]>,
  today: string,
): DocLine[] {
  const out: DocLine[] = [];
  out.push({ type: "title",  text: "在留申請　ご確認・ご記入のお願い" });
  out.push({ type: "meta",   text: `申請人：${applicantName}　|　案件番号：${caseNumber ?? ""}　|　作成日：${today}` });
  out.push({ type: "spacer", text: "" });
  out.push({ type: "instruction", text: "【お客様へ】" });
  out.push({ type: "instruction", text: "下記の項目について、行政書士が申請書を作成するために必要な情報が不足しています。" });
  out.push({ type: "instruction", text: "各質問に対してご回答をご記入のうえ、担当行政書士（090-2596-0128）までご返送ください。" });
  out.push({ type: "instruction", text: "※ 記入漏れがある場合、申請書の提出が遅れる場合がございます。" });
  out.push({ type: "spacer", text: "" });

  if (Object.keys(sections).length === 0) {
    out.push({ type: "instruction", text: "✅ 現時点で不足している情報はありません。" });
  } else {
    for (const [section, questions] of Object.entries(sections)) {
      out.push({ type: "section", text: `■ ${section}` });
      for (const q of questions) {
        const labelText = q.note ? `${q.label}　（${q.note}）` : q.label;
        out.push({ type: "question", text: labelText });
        if (q.options && q.options.length > 0) {
          out.push({ type: "options", text: q.options.map(o => `☐ ${o}`).join("　　") });
        } else {
          out.push({ type: "answer", text: "回答：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿" });
        }
      }
      out.push({ type: "spacer", text: "" });
    }
  }

  out.push({ type: "instruction", text: "お客様署名・確認日：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿" });
  out.push({ type: "instruction", text: "行政書士法人 JLS　山口忠士（yamaguchi@jls-gyosei.jp / 090-2596-0128）" });
  out.push({ type: "instruction", text: `出力日：${today}　|　案件番号：${caseNumber ?? ""}` });
  return out;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!session?.user || !tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!scriptUrl) {
    return NextResponse.json(
      { error: "GOOGLE_APPS_SCRIPT_URL が未設定です", needsSetup: true },
      { status: 503 },
    );
  }

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);

  const organization = app.organizationId
    ? await db.select().from(organizationMaster).where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
    : null;

  const checklist = await db.select({
    id: applicationDocumentChecklist.id,
    documentName: applicationDocumentChecklist.documentName,
    status: applicationDocumentChecklist.status,
    fileName: applicationDocumentChecklist.fileName,
    expertNotes: applicationDocumentChecklist.expertNotes,
  }).from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id));

  const effectiveForm = buildEffectiveFormData(app, applicant, organization);
  const formType = toFormType(effectiveForm.applicationFormType ?? app.applicationType);
  const cat = effectiveForm.visaFormCategory ?? "N";
  const excludedIds = new Set((app.interviewExcludedFields ?? []) as string[]);

  const emptyQuestions = computeInterviewQuestions(effectiveForm, formType, cat, checklist, excludedIds)
    .filter((q) => !q.isExcluded);
  const sections = emptyQuestions.reduce<Record<string, InterviewQuestion[]>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ") || "（氏名不明）";
  const docTitle = `在留申請 質問書 — ${applicantName} (${app.caseNumber ?? id})`;
  const lines = buildLines(applicantName, app.caseNumber, sections, today);

  let scriptRes: Response;
  try {
    scriptRes = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: docTitle, lines }),
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Apps Script 呼び出し失敗: ${e?.message}` }, { status: 502 });
  }

  let result: any;
  try {
    result = await scriptRes.json();
  } catch {
    return NextResponse.json({ error: "Apps Script からの応答が不正です" }, { status: 502 });
  }

  if (!result?.success || !result?.url) {
    return NextResponse.json({ error: result?.error ?? "Googleドキュメント作成失敗" }, { status: 500 });
  }

  return NextResponse.json({ url: result.url, id: result.id });
}
