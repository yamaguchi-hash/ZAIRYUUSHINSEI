import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { ApplicationFormData } from "@/lib/form-types";

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function xf(tag: string, value: string | null | undefined): string {
  if (!value) return "";
  return `    <${tag}>${escapeXml(value)}</${tag}>\n`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) return new Response("Unauthorized", { status: 401 });

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) return new Response("Not Found", { status: 404 });

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId))
    .limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const now = new Date().toISOString();
  const formJson = JSON.stringify(form, null, 2);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  JLS在留申請システム エクスポートファイル
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  このファイルは JLS在留申請システム の申請データを保存したものです。
  「XMLから新規作成」ボタンでインポートすると、申請書の内容を
  そのまま引き継いで新規申請書を作成できます（更新申請・類似申請に活用）。
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  生成日時: ${now}
  行政書士法人 JLS （yamaguchi@jls-gyosei.jp）
-->
<zairyu-shinsei-data version="1.0" exported-at="${now}" system="JLS在留申請システム">

  <!-- ── ケース基本情報 ────────────────────────────────────────── -->
  <meta>
${xf("case-number", app.caseNumber)}${xf("application-type", app.applicationType)}${xf("visa-type", app.visaType)}${xf("status", app.status)}  </meta>

  <!-- ── 申請人情報（インポート時に新規申請人として登録されます） ──── -->
  <applicant>
${xf("family-name-en", applicant?.familyNameEn)}${xf("given-name-en", applicant?.givenNameEn)}${xf("family-name-ja", applicant?.familyNameJa)}${xf("given-name-ja", applicant?.givenNameJa)}${xf("nationality", applicant?.nationality)}${xf("date-of-birth", applicant?.dateOfBirth ?? undefined)}${xf("gender", applicant?.gender)}${xf("passport-number", applicant?.passportNumber)}${xf("residence-card-number", applicant?.residenceCardNumber)}${xf("phone", applicant?.phone)}${xf("email", applicant?.emailAddress)}  </applicant>

  <!-- ── 申請書フォームデータ（全項目・JSON形式） ─────────────────── -->
  <!--
    form-data の内容はインポート時に申請書フォームへ自動入力されます。
    手動で編集する場合は CDATA 内の JSON を直接修正してください。
  -->
  <form-data><![CDATA[
${formJson}
  ]]></form-data>

</zairyu-shinsei-data>
`;

  const safeName = (app.caseNumber ?? id).replace(/[^A-Za-z0-9\-_]/g, "_");
  const filename = `zairyu_${safeName}_${now.slice(0, 10)}.xml`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
