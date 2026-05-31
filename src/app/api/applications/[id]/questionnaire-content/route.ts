import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData } from "@/lib/form-types";
import { ALL_QUESTIONS, toFormType, getEmptyQuestions } from "@/lib/questionnaire-questions";

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

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId))).limit(1);
  if (!app) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId)).limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const formType = toFormType(form.applicationFormType ?? app.applicationType);
  const cat = (form.visaFormCategory ?? "N") as string;

  const emptyQuestions = getEmptyQuestions(form, formType, cat);

  const sections = emptyQuestions.reduce<Record<string, typeof emptyQuestions>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  const applicantName = [applicant?.familyNameEn, applicant?.givenNameEn].filter(Boolean).join(" ") || "（氏名不明）";
  const title = `在留申請 質問書 — ${applicantName} (${app.caseNumber ?? id})`;

  // ── プレーンテキスト生成（Googleドキュメント貼り付け用）──────────────────────
  const lines: string[] = [];
  lines.push("在留申請　ご確認・ご記入のお願い");
  lines.push("");
  lines.push(`申請人：${applicantName}　|　案件番号：${app.caseNumber ?? ""}　|　作成日：${today}`);
  lines.push("");
  lines.push("━".repeat(60));
  lines.push("【お客様へ】");
  lines.push("下記の項目について、行政書士が申請書を作成するために必要な情報が不足しています。");
  lines.push("各質問に対してご回答をご記入のうえ、担当行政書士（090-2596-0128）までご返送ください。");
  lines.push("※ 記入漏れがある場合、申請書の提出が遅れる場合がございます。");
  lines.push("━".repeat(60));
  lines.push("");

  if (Object.keys(sections).length === 0) {
    lines.push("✅ 現時点で不足している情報はありません。申請書の全フィールドに情報が入力されています。");
  } else {
    for (const [section, questions] of Object.entries(sections)) {
      lines.push(`■ ${section}`);
      lines.push("─".repeat(40));
      for (const q of questions) {
        const labelText = q.note ? `【${q.label}】（${q.note}）` : `【${q.label}】`;
        lines.push(labelText);
        if (q.options && q.options.length > 0) {
          lines.push("　" + q.options.map(o => `☐ ${o}`).join("　　"));
        } else {
          lines.push("　回答：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿");
        }
        lines.push("");
      }
    }
  }

  lines.push("━".repeat(60));
  lines.push("お客様署名・確認日：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿");
  lines.push("");
  lines.push("行政書士法人 JLS　山口忠士（yamaguchi@jls-gyosei.jp / 090-2596-0128）");
  lines.push(`出力日：${today}　|　案件番号：${app.caseNumber ?? ""}`);

  // ── Apps Script 用構造化データ ───────────────────────────────────────────
  type DocLine = { type: string; text: string };
  const structuredLines: DocLine[] = [];
  structuredLines.push({ type: "title",  text: "在留申請　ご確認・ご記入のお願い" });
  structuredLines.push({ type: "meta",   text: `申請人：${applicantName}　|　案件番号：${app.caseNumber ?? ""}　|　作成日：${today}` });
  structuredLines.push({ type: "spacer", text: "" });
  structuredLines.push({ type: "instruction", text: "【お客様へ】" });
  structuredLines.push({ type: "instruction", text: "下記の項目について、行政書士が申請書を作成するために必要な情報が不足しています。" });
  structuredLines.push({ type: "instruction", text: "各質問に対してご回答をご記入のうえ、担当行政書士（090-2596-0128）までご返送ください。" });
  structuredLines.push({ type: "instruction", text: "※ 記入漏れがある場合、申請書の提出が遅れる場合がございます。" });
  structuredLines.push({ type: "spacer", text: "" });

  if (Object.keys(sections).length === 0) {
    structuredLines.push({ type: "instruction", text: "✅ 現時点で不足している情報はありません。" });
  } else {
    for (const [section, questions] of Object.entries(sections)) {
      structuredLines.push({ type: "section", text: `■ ${section}` });
      for (const q of questions) {
        const labelText = q.note ? `${q.label}　（${q.note}）` : q.label;
        structuredLines.push({ type: "question", text: labelText });
        if (q.options && q.options.length > 0) {
          structuredLines.push({ type: "options", text: q.options.map(o => `☐ ${o}`).join("　　") });
        } else {
          structuredLines.push({ type: "answer", text: "回答：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿" });
        }
      }
      structuredLines.push({ type: "spacer", text: "" });
    }
  }
  structuredLines.push({ type: "instruction", text: "お客様署名・確認日：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿" });
  structuredLines.push({ type: "instruction", text: "行政書士法人 JLS　山口忠士（yamaguchi@jls-gyosei.jp / 090-2596-0128）" });

  return NextResponse.json({ title, plainText: lines.join("\n"), lines: structuredLines });
}
