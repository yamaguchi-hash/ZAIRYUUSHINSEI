import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  db,
  applications,
  applicantMaster,
  documentRequirementMaster,
  applicationDocumentChecklist,
  auditLog,
} from "@/lib/db";
import { eq, and, or } from "drizzle-orm";

// ─── XML 解析ユーティリティ ────────────────────────────────────────────────────
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}
function extractCdata(xml: string, tag: string): string {
  const m = xml.match(
    new RegExp(`<${tag}>[\\s]*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>[\\s]*<\\/${tag}>`)
  );
  return m ? m[1].trim() : "";
}
function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ─── POST /api/applications/import-xml ────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.tenantId) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const tenantId: string = user.tenantId;

  try {
    const fd = await request.formData();
    const file = fd.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 400 });
    }
    if (!file.name.endsWith(".xml")) {
      return NextResponse.json({ error: "XMLファイル（.xml）を選択してください" }, { status: 400 });
    }

    const xml = await file.text();

    // JLS形式のバリデーション
    if (!xml.includes("<zairyu-shinsei-data")) {
      return NextResponse.json(
        { error: "JLS在留申請システムのXMLファイルではありません" },
        { status: 400 }
      );
    }

    // ── メタ情報の抽出 ──────────────────────────────────────────────────
    const applicationType =
      unescapeXml(extractTag(xml, "application-type")) || "extension";
    const visaType =
      unescapeXml(extractTag(xml, "visa-type")) || "tokutei-katsudo-kango";

    // ── 申請人情報の抽出 ────────────────────────────────────────────────
    const familyNameEn = unescapeXml(extractTag(xml, "family-name-en"));
    const givenNameEn  = unescapeXml(extractTag(xml, "given-name-en"));
    const familyNameJa = unescapeXml(extractTag(xml, "family-name-ja")) || null;
    const givenNameJa  = unescapeXml(extractTag(xml, "given-name-ja")) || null;
    const nationality  = unescapeXml(extractTag(xml, "nationality"));
    const dateOfBirth  = unescapeXml(extractTag(xml, "date-of-birth")) || null;
    const gender       = unescapeXml(extractTag(xml, "gender")) || null;
    const passportNumber      = unescapeXml(extractTag(xml, "passport-number")) || null;
    const residenceCardNumber = unescapeXml(extractTag(xml, "residence-card-number")) || null;
    const phone        = unescapeXml(extractTag(xml, "phone")) || null;
    const emailAddress = unescapeXml(extractTag(xml, "email")) || null;

    if (!familyNameEn || !nationality) {
      return NextResponse.json(
        { error: "申請人情報が不完全です（氏名（英）・国籍は必須です）" },
        { status: 400 }
      );
    }

    // ── フォームデータの抽出（CDATA 内 JSON） ───────────────────────────
    let importedFormData: Record<string, any> = {};
    const cdataContent = extractCdata(xml, "form-data");
    if (cdataContent) {
      try {
        importedFormData = JSON.parse(cdataContent);
      } catch (e) {
        console.warn("[import-xml] フォームデータJSONのパース失敗:", e);
        // パース失敗時は空で続行（申請人情報だけ登録）
      }
    }

    // ── 申請人をDBに新規登録 ────────────────────────────────────────────
    const [newApplicant] = await db
      .insert(applicantMaster)
      .values({
        tenantId,
        familyNameEn,
        givenNameEn: givenNameEn || "",
        familyNameJa,
        givenNameJa,
        nationality,
        dateOfBirth: dateOfBirth as any,
        gender,
        passportNumber,
        residenceCardNumber,
        phone,
        emailAddress,
      })
      .returning();

    // ── 申請案件を作成 ──────────────────────────────────────────────────
    const caseNumber = `APP-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    const [newApp] = await db
      .insert(applications)
      .values({
        tenantId,
        applicantId: newApplicant.id,
        applicationType: applicationType as any,
        visaType,
        caseNumber,
        status: "documents_collecting" as any,
        formData: {
          ...importedFormData,
          lastUpdated: new Date().toISOString(),
          _importedFromXml: true,
        },
      })
      .returning();

    // ── 必須書類チェックリストの自動追加 ────────────────────────────────
    const requiredDocs = await db
      .select()
      .from(documentRequirementMaster)
      .where(
        and(
          or(
            eq(documentRequirementMaster.visaType, visaType),
            eq(documentRequirementMaster.visaType, "common")
          ),
          or(
            eq(documentRequirementMaster.applicationType, applicationType),
            eq(documentRequirementMaster.applicationType, "all")
          ),
          eq(documentRequirementMaster.isAlwaysRequired, true),
          eq(documentRequirementMaster.isActive, true)
        )
      )
      .orderBy(documentRequirementMaster.sortOrder);

    if (requiredDocs.length > 0) {
      await db.insert(applicationDocumentChecklist).values(
        requiredDocs.map((doc) => ({
          applicationId: newApp.id,
          documentRequirementId: doc.id,
          documentName: doc.documentName,
          isRequiredByExpert: true,
          status: "not_submitted" as const,
        }))
      );
    }

    // ── 監査ログ ────────────────────────────────────────────────────────
    await db.insert(auditLog).values({
      tenantId,
      applicationId: newApp.id,
      userId: user.id,
      action: "create",
      entityType: "application",
      entityId: newApp.id,
      newValue: JSON.stringify({
        source: "xml-import",
        caseNumber,
        originalFile: file.name,
      }),
    });

    return NextResponse.json({
      success: true,
      applicationId: newApp.id,
      caseNumber,
      applicantName: `${familyNameEn} ${givenNameEn}`.trim(),
    });
  } catch (err: any) {
    console.error("[import-xml]", err);
    return NextResponse.json(
      { error: err.message ?? "インポートに失敗しました" },
      { status: 500 }
    );
  }
}
