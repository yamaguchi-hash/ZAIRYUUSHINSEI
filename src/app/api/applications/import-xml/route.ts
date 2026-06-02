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
  // 末尾の > を含む開始タグと閉じタグにマッチ（属性付き開始タグも考慮）
  const m = xml.match(new RegExp(`<${tag}(?:[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}
function extractCdata(xml: string, tag: string): string {
  const m = xml.match(
    new RegExp(`<${tag}(?:[^>]*)?>[\\s]*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>[\\s]*<\\/${tag}>`)
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
  let step = "auth";

  try {
    // ── 1. 認証 ─────────────────────────────────────────────────────────────
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    const userId   = (session?.user as any)?.id as string | undefined;

    if (!tenantId) {
      return NextResponse.json({ error: "ログインが必要です。再ログイン後にお試しください。", step }, { status: 401 });
    }

    // ── 2. ファイル取得 ───────────────────────────────────────────────────
    step = "file-parse";
    const fd   = await request.formData();
    const file = fd.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません。", step }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xml")) {
      return NextResponse.json({ error: "XMLファイル（.xml）を選択してください。", step }, { status: 400 });
    }

    const xml = await file.text();

    // ── 3. JLS形式チェック ───────────────────────────────────────────────
    step = "format-check";
    if (!xml.includes("zairyu-shinsei-data")) {
      return NextResponse.json(
        { error: "このファイルはJLS在留申請システムのXMLではありません。\n「XMLで保存」ボタンで出力したファイルをご使用ください。", step },
        { status: 400 }
      );
    }

    // ── 4. メタ情報の抽出 ──────────────────────────────────────────────
    step = "meta-extract";
    const applicationType = unescapeXml(extractTag(xml, "application-type")) || "extension";
    const visaType        = unescapeXml(extractTag(xml, "visa-type"))         || "other";

    // ── 5. 申請人情報の抽出 ────────────────────────────────────────────
    step = "applicant-extract";
    const familyNameEn        = unescapeXml(extractTag(xml, "family-name-en"));
    const givenNameEn         = unescapeXml(extractTag(xml, "given-name-en"));
    const familyNameJa        = unescapeXml(extractTag(xml, "family-name-ja")) || null;
    const givenNameJa         = unescapeXml(extractTag(xml, "given-name-ja"))  || null;
    const nationality         = unescapeXml(extractTag(xml, "nationality"));
    const rawDob              = unescapeXml(extractTag(xml, "date-of-birth"));
    const dateOfBirth         = rawDob  || null;
    const gender              = unescapeXml(extractTag(xml, "gender"))               || null;
    const passportNumber      = unescapeXml(extractTag(xml, "passport-number"))      || null;
    const residenceCardNumber = unescapeXml(extractTag(xml, "residence-card-number")) || null;
    const phone               = unescapeXml(extractTag(xml, "phone"))                || null;
    const emailAddress        = unescapeXml(extractTag(xml, "email"))                || null;

    if (!familyNameEn) {
      return NextResponse.json(
        { error: "申請人の氏名（ローマ字）が見つかりません。XMLファイルを確認してください。", step },
        { status: 400 }
      );
    }
    if (!nationality) {
      return NextResponse.json(
        { error: "申請人の国籍が見つかりません。XMLファイルを確認してください。", step },
        { status: 400 }
      );
    }

    // ── 6. フォームデータの抽出（CDATA内JSON） ─────────────────────────
    step = "form-data-extract";
    let importedFormData: Record<string, any> = {};
    const cdataContent = extractCdata(xml, "form-data");
    if (cdataContent) {
      try {
        importedFormData = JSON.parse(cdataContent);
      } catch (jsonErr: any) {
        console.error("[import-xml] フォームデータJSONのパース失敗:", jsonErr.message);
        // パース失敗でも続行（基本情報のみで申請を作成）
      }
    }

    // ── 7. 申請人をDBに登録 ──────────────────────────────────────────
    step = "applicant-insert";
    const applicantInsertData: Record<string, any> = {
      tenantId,
      familyNameEn,
      givenNameEn: givenNameEn || "",
      nationality,
    };
    if (familyNameJa)        applicantInsertData.familyNameJa = familyNameJa;
    if (givenNameJa)         applicantInsertData.givenNameJa  = givenNameJa;
    if (dateOfBirth)         applicantInsertData.dateOfBirth  = dateOfBirth;
    if (gender)              applicantInsertData.gender        = gender;
    if (passportNumber)      applicantInsertData.passportNumber      = passportNumber;
    if (residenceCardNumber) applicantInsertData.residenceCardNumber = residenceCardNumber;
    if (phone)               applicantInsertData.phone         = phone;
    if (emailAddress)        applicantInsertData.emailAddress   = emailAddress;

    const [newApplicant] = await db
      .insert(applicantMaster)
      .values(applicantInsertData as any)
      .returning();

    // ── 8. 申請案件を作成 ────────────────────────────────────────────
    step = "application-insert";
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
        },
      } as any)
      .returning();

    // ── 9. 必須書類チェックリストの自動追加 ─────────────────────────
    step = "checklist-insert";
    try {
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
    } catch (checklistErr: any) {
      console.error("[import-xml] checklist insert error (non-fatal):", checklistErr.message);
      // チェックリスト追加失敗は非致命的 — 続行
    }

    // ── 10. 監査ログ（非致命的） ─────────────────────────────────────
    step = "audit-log";
    try {
      const auditValues: Record<string, any> = {
        tenantId,
        applicationId: newApp.id,
        action: "create",
        entityType: "application",
        entityId: newApp.id,
        newValue: JSON.stringify({ source: "xml-import", caseNumber, originalFile: file.name }),
      };
      if (userId) auditValues.userId = userId;
      await db.insert(auditLog).values(auditValues as any);
    } catch (auditErr: any) {
      console.error("[import-xml] audit log error (non-fatal):", auditErr.message);
      // 監査ログ失敗は非致命的 — 続行
    }

    // ── 成功 ──────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      applicationId: newApp.id,
      caseNumber,
      applicantName: [familyNameEn, givenNameEn].filter(Boolean).join(" "),
    });

  } catch (err: any) {
    console.error(`[import-xml] step="${step}" error:`, err);
    return NextResponse.json(
      {
        error: `インポートに失敗しました（ステップ: ${step}）\n${err.message ?? "不明なエラー"}`,
        step,
      },
      { status: 500 }
    );
  }
}
