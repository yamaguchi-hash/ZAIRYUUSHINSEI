"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  applications,
  applicantMaster,
  organizationMaster,
  applicationDocumentChecklist,
  documentRequirementMaster,
  applicationSnapshots,
  questionnaireQuestions,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, desc, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

export async function getApplications(searchQuery?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const query = db
    .select({
      id: applications.id,
      caseNumber: applications.caseNumber,
      status: applications.status,
      applicationType: applications.applicationType,
      visaType: applications.visaType,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      applicantName: applicantMaster.familyNameEn,
      applicantGivenName: applicantMaster.givenNameEn,
      applicantNationality: applicantMaster.nationality,
      organizationName: organizationMaster.nameJa,
    })
    .from(applications)
    .leftJoin(applicantMaster, eq(applications.applicantId, applicantMaster.id))
    .leftJoin(organizationMaster, eq(applications.organizationId, organizationMaster.id))
    .where(eq(applications.tenantId, tenantId))
    .orderBy(desc(applications.updatedAt));

  return query;
}

export async function getApplicationById(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);

  if (!application) throw new Error("申請案件が見つかりません");

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(eq(applicantMaster.id, application.applicantId))
    .limit(1);

  const organization = application.organizationId
    ? await db
        .select()
        .from(organizationMaster)
        .where(eq(organizationMaster.id, application.organizationId))
        .limit(1)
        .then((r) => r[0])
    : null;

  const checklist = await db
    .select()
    .from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id))
    .orderBy(applicationDocumentChecklist.createdAt);

  const questionnaire = await db
    .select()
    .from(questionnaireQuestions)
    .where(eq(questionnaireQuestions.applicationId, id));

  return { application, applicant, organization, checklist, questionnaire };
}

export async function createApplication(data: {
  applicantId: string;
  organizationId?: string;
  applicationType: string;
  visaType: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const caseNumber = `APP-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const [newApp] = await db
    .insert(applications)
    .values({
      tenantId,
      applicantId: data.applicantId,
      organizationId: data.organizationId,
      applicationType: data.applicationType as any,
      visaType: data.visaType as any,
      caseNumber,
      status: "draft",
    })
    .returning();

  // Auto-generate document checklist from master data
  const requiredDocs = await db
    .select()
    .from(documentRequirementMaster)
    .where(
      and(
        eq(documentRequirementMaster.visaType, data.visaType as any),
        eq(documentRequirementMaster.applicationType, data.applicationType as any),
        eq(documentRequirementMaster.isActive, true)
      )
    );

  if (requiredDocs.length > 0) {
    await db.insert(applicationDocumentChecklist).values(
      requiredDocs.map((doc) => ({
        applicationId: newApp.id,
        documentRequirementId: doc.id,
        documentName: doc.documentName,
        isRequiredByExpert: doc.isAlwaysRequired,
        status: "not_submitted" as const,
      }))
    );
  }

  await db.insert(auditLog).values({
    tenantId,
    applicationId: newApp.id,
    userId: session.user.id,
    action: "create",
    entityType: "application",
    entityId: newApp.id,
    newValue: JSON.stringify({ caseNumber, status: "draft" }),
  });

  revalidatePath("/applications");
  return newApp;
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const [current] = await db
    .select({ status: applications.status })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
    .limit(1);

  if (!current) throw new Error("申請案件が見つかりません");

  await db
    .update(applications)
    .set({ status: status as any, updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

  await db.insert(auditLog).values({
    tenantId,
    applicationId,
    userId: session.user.id,
    action: "status_change",
    entityType: "application",
    entityId: applicationId,
    fieldKey: "status",
    oldValue: current.status,
    newValue: status,
  });

  revalidatePath(`/applications/${applicationId}`);
}

export async function approveApplication(applicationId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);
  const userRole = (session.user as any).role;

  if (userRole !== "expert" && userRole !== "admin") {
    throw new Error("承認権限がありません");
  }

  const { application, applicant, organization } = await getApplicationById(applicationId);

  // Create snapshots
  await db.insert(applicationSnapshots).values([
    {
      applicationId,
      snapshotType: "applicant",
      snapshotData: applicant as any,
    },
    ...(organization
      ? [
          {
            applicationId,
            snapshotType: "organization",
            snapshotData: organization as any,
          },
        ]
      : []),
  ]);

  await db
    .update(applications)
    .set({
      isApproved: true,
      approvedAt: new Date(),
      approvedBy: session.user.id,
      status: "approved",
      updatedAt: new Date(),
    })
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

  await db.insert(auditLog).values({
    tenantId,
    applicationId,
    userId: session.user.id,
    action: "approve",
    entityType: "application",
    entityId: applicationId,
    newValue: "approved",
  });

  revalidatePath(`/applications/${applicationId}`);
}

export async function updateDocumentStatus(
  checklistItemId: string,
  status: string,
  expertNotes?: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");

  await db
    .update(applicationDocumentChecklist)
    .set({
      status: status as any,
      expertNotes,
      reviewedAt: new Date(),
      reviewedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(applicationDocumentChecklist.id, checklistItemId));

  revalidatePath("/applications");
}

export async function toggleExpertCheckmark(
  checklistItemId: string,
  isRequired: boolean
) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const userRole = (session.user as any).role;

  if (userRole !== "expert" && userRole !== "admin") {
    throw new Error("この操作は専門家のみ実行できます");
  }

  await db
    .update(applicationDocumentChecklist)
    .set({ isRequiredByExpert: isRequired, updatedAt: new Date() })
    .where(eq(applicationDocumentChecklist.id, checklistItemId));

  revalidatePath("/applications");
}

export async function runConsistencyCheck(applicationId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");

  const { application, applicant, checklist } = await getApplicationById(applicationId);
  const draftData = application.draftData as Record<string, any> ?? {};
  const ocrData = application.ocrData as Record<string, any> ?? {};

  const issues: Array<{ field: string; message: string; severity: "error" | "warning" }> = [];

  // Check passport number consistency
  if (ocrData.passportNumber && applicant.passportNumber) {
    if (ocrData.passportNumber !== applicant.passportNumber) {
      issues.push({
        field: "passportNumber",
        message: `パスポート番号不一致: OCR「${ocrData.passportNumber}」vs マスター「${applicant.passportNumber}」`,
        severity: "error",
      });
    }
  }

  // Check name consistency
  if (ocrData.familyName && draftData.familyNameEn) {
    if (ocrData.familyName.toUpperCase() !== draftData.familyNameEn.toUpperCase()) {
      issues.push({
        field: "familyName",
        message: `氏名不一致: OCR「${ocrData.familyName}」vs 申請書「${draftData.familyNameEn}」`,
        severity: "error",
      });
    }
  }

  // Check passport expiry
  if (applicant.passportExpiry) {
    const expiry = new Date(applicant.passportExpiry);
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
    if (expiry < sixMonthsFromNow) {
      issues.push({
        field: "passportExpiry",
        message: `パスポートの有効期限が6ヶ月以内（${applicant.passportExpiry}）`,
        severity: "warning",
      });
    }
  }

  // Check all required documents are submitted
  const requiredButNotSubmitted = checklist.filter(
    (item) => item.isRequiredByExpert && item.status === "not_submitted"
  );
  if (requiredButNotSubmitted.length > 0) {
    issues.push({
      field: "documents",
      message: `未提出の必要書類が${requiredButNotSubmitted.length}件あります`,
      severity: "error",
    });
  }

  await db
    .update(applications)
    .set({
      consistencyCheckResult: { issues, checkedAt: new Date() } as any,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId));

  revalidatePath(`/applications/${applicationId}`);
  return { issues };
}

// ── 書類マスター取得（visaType + applicationType でフィルタ）────────────────
export async function getDocumentRequirements(visaType: string, applicationType: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");

  const { inArray } = await import("drizzle-orm");

  // "common"（全ビザ共通）と指定ビザ種別の書類を返す
  const searchVisaTypes = ["common", visaType];
  // applicationType: "all"（全申請種別共通）と指定申請種別の書類を返す
  const searchAppTypes = ["all", applicationType];

  const rows = await db
    .select()
    .from(documentRequirementMaster)
    .where(
      and(
        eq(documentRequirementMaster.isActive, true),
        inArray(documentRequirementMaster.visaType, searchVisaTypes),
        inArray(documentRequirementMaster.applicationType, searchAppTypes)
      )
    )
    .orderBy(documentRequirementMaster.sortOrder);

  return rows;
}

// ── チェックリストに書類を追加（選択した書類IDから一括登録）────────────────
export async function addDocumentsToChecklist(
  applicationId: string,
  documentRequirementIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    // 申請案件の確認
    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    // 既存チェックリストのdocumentRequirementIdを取得
    const existing = await db
      .select({ documentRequirementId: applicationDocumentChecklist.documentRequirementId })
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));
    const existingIds = new Set(existing.map((e) => e.documentRequirementId).filter(Boolean));

    // まだ追加されていない書類だけを対象に
    const newIds = documentRequirementIds.filter((id) => !existingIds.has(id));
    if (newIds.length === 0) {
      revalidatePath(`/applications/${applicationId}`);
      return { success: true };
    }

    // マスターから書類名を取得
    const { inArray } = await import("drizzle-orm");
    const masters = await db
      .select()
      .from(documentRequirementMaster)
      .where(inArray(documentRequirementMaster.id, newIds));

    await db.insert(applicationDocumentChecklist).values(
      masters.map((m) => ({
        applicationId,
        documentRequirementId: m.id,
        documentName: m.documentName,
        isRequiredByExpert: true,
        status: "not_submitted" as const,
      }))
    );

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "追加に失敗しました" };
  }
}

// ── チェックリストから書類を削除 ─────────────────────────────────────────────
export async function removeDocumentFromChecklist(
  checklistItemId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };

    const [item] = await db
      .select({ applicationId: applicationDocumentChecklist.applicationId })
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.id, checklistItemId))
      .limit(1);

    await db.delete(applicationDocumentChecklist).where(eq(applicationDocumentChecklist.id, checklistItemId));

    if (item?.applicationId) revalidatePath(`/applications/${item.applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "削除に失敗しました" };
  }
}

// ── チェックリスト書類のアップロード＋Gemini自動解析 ────────────────────────
export async function saveChecklistDocumentAndOcr(
  checklistItemId: string,
  fileUrl: string,
  fileName: string,
  fileSize: number | undefined,
  mimeType: string,
  documentName: string
): Promise<{ success: boolean; error?: string; extracted?: Record<string, any>; summary?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };

    // ファイル情報を保存・ステータスを「提出済」に更新
    await db
      .update(applicationDocumentChecklist)
      .set({
        fileUrl,
        fileName,
        fileSize: fileSize ?? null,
        mimeType,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, checklistItemId));

    // Gemini APIキーがなければここで返す
    if (!process.env.GEMINI_API_KEY) {
      const [item] = await db.select({ applicationId: applicationDocumentChecklist.applicationId })
        .from(applicationDocumentChecklist).where(eq(applicationDocumentChecklist.id, checklistItemId)).limit(1);
      if (item) revalidatePath(`/applications/${item.applicationId}`);
      return { success: true };
    }

    // Gemini で書類内容を解析
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    let base64: string;
    let imageMimeType: string;

    if (fileUrl.startsWith("data:")) {
      const commaIdx = fileUrl.indexOf(",");
      base64 = fileUrl.slice(commaIdx + 1);
      imageMimeType = fileUrl.slice(5, commaIdx).split(";")[0];
    } else {
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error("ファイルの取得に失敗しました");
      const buf = await res.arrayBuffer();
      base64 = Buffer.from(buf).toString("base64");
      imageMimeType = mimeType;
    }

    const supportedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    const isPdf = imageMimeType === "application/pdf";
    const isImage = supportedImageTypes.includes(imageMimeType);
    if (!isImage && !isPdf) {
      return { success: true }; // 非対応形式はスキップ
    }

    const prompt = `あなたは在留資格申請書類の読み取り専門家です。
この書類は「${documentName}」です。

書類から読み取れる全ての重要な情報をJSON形式で抽出してください。
以下の項目が含まれる場合は必ず抽出してください：
- full_name_ja: 氏名（日本語）
- full_name_en: 氏名（英語・ローマ字）
- company_name: 会社名・機関名・組織名
- company_name_en: 会社名（英語）
- position: 役職・職種・業務内容
- employment_start: 雇用開始日・在籍開始日（YYYY-MM-DD形式）
- employment_end: 雇用終了日（YYYY-MM-DD形式、現職はnull）
- annual_salary: 年収・報酬（数値のみ、単位：円）
- monthly_salary: 月収（数値のみ、単位：円）
- school_name: 学校名・大学名
- major: 学部・学科・専攻
- degree: 学位（学士・修士・博士等）
- graduation_date: 卒業日（YYYY-MM-DD形式）
- qualification: 資格・免許・称号
- address: 住所
- issue_date: 発行日（YYYY-MM-DD形式）
- expiry_date: 有効期限（YYYY-MM-DD形式）
- notes: その他の重要事項

読み取れない項目はnullにしてください（省略不要）。
JSONのみを返し、説明文は不要です。`;

    let extracted: Record<string, any> = {};
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          parts: [
            { inlineData: { mimeType: isImage ? imageMimeType : "image/jpeg", data: base64 } },
            { text: prompt },
          ],
        }],
      });

      const text = response.text ?? "{}";
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        try { extracted = JSON.parse(jsonMatch[1] ?? jsonMatch[0]); } catch { extracted = {}; }
      }
    } catch (ocrErr: any) {
      console.error("[OCR] checklist doc error:", ocrErr?.message);
      // OCRエラーでもファイル保存は成功扱い
    }

    // 非nullフィールドのサマリー生成
    const summaryParts: string[] = [];
    if (extracted.company_name) summaryParts.push(`会社: ${extracted.company_name}`);
    if (extracted.position) summaryParts.push(`役職: ${extracted.position}`);
    if (extracted.annual_salary) summaryParts.push(`年収: ${Number(extracted.annual_salary).toLocaleString()}円`);
    if (extracted.monthly_salary && !extracted.annual_salary) summaryParts.push(`月収: ${Number(extracted.monthly_salary).toLocaleString()}円`);
    if (extracted.school_name) summaryParts.push(`学校: ${extracted.school_name}`);
    if (extracted.degree) summaryParts.push(`学位: ${extracted.degree}`);
    if (extracted.graduation_date) summaryParts.push(`卒業: ${extracted.graduation_date}`);
    if (extracted.qualification) summaryParts.push(`資格: ${extracted.qualification}`);
    const summary = summaryParts.join(" / ");

    // 解析結果をDBに保存
    await db
      .update(applicationDocumentChecklist)
      .set({ ocrExtractedData: extracted, updatedAt: new Date() })
      .where(eq(applicationDocumentChecklist.id, checklistItemId));

    const [item] = await db.select({ applicationId: applicationDocumentChecklist.applicationId })
      .from(applicationDocumentChecklist).where(eq(applicationDocumentChecklist.id, checklistItemId)).limit(1);
    if (item) revalidatePath(`/applications/${item.applicationId}`);

    return { success: true, extracted, summary };
  } catch (err: any) {
    return { success: false, error: err.message ?? "アップロードに失敗しました" };
  }
}
