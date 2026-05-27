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
  applicantDocuments,
} from "@/lib/db/schema";
import { eq, and, ne, inArray, desc, ilike, or } from "drizzle-orm";
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
    .where(and(eq(applications.tenantId, tenantId), ne(applications.status, "cancelled")))
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
}): Promise<{ success: boolean; error?: string; data?: { id: string } }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const caseNumber = `APP-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // 基本情報入力＋必須書類リスト自動生成が完了するので、
    // 初期ステータスは「③書類収集中」(documents_collecting) から開始
    const [newApp] = await db
      .insert(applications)
      .values({
        tenantId,
        applicantId: data.applicantId,
        organizationId: data.organizationId,
        applicationType: data.applicationType as any,
        visaType: data.visaType as any,
        caseNumber,
        status: "documents_collecting" as any,
      })
      .returning();

    // 必須書類（isAlwaysRequired=true）を自動追加
    const visaTypeStr = String(data.visaType);
    const appTypeStr  = String(data.applicationType);
    const requiredDocs = await db
      .select()
      .from(documentRequirementMaster)
      .where(
        and(
          or(
            eq(documentRequirementMaster.visaType, visaTypeStr),
            eq(documentRequirementMaster.visaType, "common")
          ),
          or(
            eq(documentRequirementMaster.applicationType, appTypeStr),
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

    await db.insert(auditLog).values({
      tenantId,
      applicationId: newApp.id,
      userId: session.user.id,
      action: "create",
      entityType: "application",
      entityId: newApp.id,
      newValue: JSON.stringify({ caseNumber, status: "documents_collecting" }),
    });

    revalidatePath("/applications");
    return { success: true, data: { id: newApp.id } };
  } catch (err: any) {
    console.error("[createApplication]", err);
    return { success: false, error: err.message ?? "申請の作成に失敗しました" };
  }
}

export async function updateApplicationStatus(
  applicationId: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [current] = await db
      .select({ status: applications.status })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);

    if (!current) return { success: false, error: "申請案件が見つかりません" };

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
    return { success: true };
  } catch (err: any) {
    console.error("[updateApplicationStatus]", err);
    return { success: false, error: err.message ?? "ステータス更新に失敗しました" };
  }
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

export async function updateChecklistNotes(
  checklistItemId: string,
  notes: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");

  await db
    .update(applicationDocumentChecklist)
    .set({
      expertNotes: notes || null,
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
    let newIds = documentRequirementIds.filter((id) => !existingIds.has(id));
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

    // 在留カード表面が含まれる場合、同カテゴリーの裏面も自動追加（逆も同様）
    const cardNames = masters.map((m) => m.documentName);
    const hasFront = cardNames.some((n) => /在留カード（表面）/.test(n));
    const hasBack  = cardNames.some((n) => /在留カード（裏面）/.test(n));
    if (hasFront && !hasBack) {
      // 表面と同じ visa_type・application_type の裏面を探す
      const frontMaster = masters.find((m) => /在留カード（表面）/.test(m.documentName))!;
      const [backMaster] = await db.select().from(documentRequirementMaster)
        .where(and(
          eq(documentRequirementMaster.visaType, frontMaster.visaType),
          eq(documentRequirementMaster.applicationType, frontMaster.applicationType),
          eq(documentRequirementMaster.isActive, true)
        ))
        .then(rows => rows.filter(r => /在留カード（裏面）/.test(r.documentName)));
      if (backMaster && !existingIds.has(backMaster.id) && !newIds.includes(backMaster.id)) {
        masters.push(backMaster);
        newIds.push(backMaster.id);
      }
    }
    if (hasBack && !hasFront) {
      const backMaster = masters.find((m) => /在留カード（裏面）/.test(m.documentName))!;
      const [frontMasterAuto] = await db.select().from(documentRequirementMaster)
        .where(and(
          eq(documentRequirementMaster.visaType, backMaster.visaType),
          eq(documentRequirementMaster.applicationType, backMaster.applicationType),
          eq(documentRequirementMaster.isActive, true)
        ))
        .then(rows => rows.filter(r => /在留カード（表面）/.test(r.documentName)));
      if (frontMasterAuto && !existingIds.has(frontMasterAuto.id) && !newIds.includes(frontMasterAuto.id)) {
        masters.push(frontMasterAuto);
        newIds.push(frontMasterAuto.id);
      }
    }

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

// ── 申請人マスターの書類・情報をチェックリストへ共有 ─────────────────────────
export async function shareApplicantDocumentsToChecklist(
  applicationId: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    // 申請案件を取得
    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    // 申請人マスター情報を取得
    const [applicant] = await db
      .select()
      .from(applicantMaster)
      .where(eq(applicantMaster.id, app.applicantId))
      .limit(1);
    if (!applicant) return { success: false, error: "申請人が見つかりません" };

    // 申請人マスターのアップロード書類を取得
    const uploadedDocs = await db
      .select()
      .from(applicantDocuments)
      .where(eq(applicantDocuments.applicantId, app.applicantId));

    // タイプ別マップ
    const docByType: Record<string, typeof uploadedDocs[0]> = {};
    for (const d of uploadedDocs) docByType[d.documentType] = d;

    // チェックリスト取得
    const checklist = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));

    let updatedCount = 0;

    for (const item of checklist) {
      const name = item.documentName;
      let uploadedDoc: typeof uploadedDocs[0] | null = null;
      let ocrData: Record<string, any> = {};

      // ─── パスポート ───────────────────────────────────────────
      if (/パスポート/.test(name)) {
        uploadedDoc =
          docByType["passport_data_page"] ?? docByType["passport_front"] ?? null;

        // 申請人マスターの情報をベースにOCRデータを組み立て
        ocrData = {
          full_name_en: `${applicant.familyNameEn} ${applicant.givenNameEn}`.trim(),
          nationality: applicant.nationality ?? null,
          date_of_birth: applicant.dateOfBirth ?? null,
          gender: applicant.gender ?? null,
          passport_number: applicant.passportNumber ?? null,
          expiry_date: applicant.passportExpiry ?? null,
        };
        // アップロード書類のOCRデータがあればマージ（マスター値優先）
        if (uploadedDoc?.ocrExtractedData) {
          ocrData = {
            ...(uploadedDoc.ocrExtractedData as Record<string, any>),
            ...ocrData,
          };
        }
      }

      // ─── 在留カード（裏面） ───────────────────────────────────
      else if (/在留カード/.test(name) && /裏面|裏/.test(name)) {
        uploadedDoc = docByType["residence_card_back"] ?? null;
        if (uploadedDoc?.ocrExtractedData) {
          ocrData = uploadedDoc.ocrExtractedData as Record<string, any>;
        }
      }

      // ─── 在留カード（表面・一般） ─────────────────────────────
      else if (/在留カード/.test(name)) {
        uploadedDoc = docByType["residence_card_front"] ?? null;

        ocrData = {
          full_name_ja: [applicant.familyNameJa, applicant.givenNameJa].filter(Boolean).join(" ") || null,
          full_name_en: `${applicant.familyNameEn} ${applicant.givenNameEn}`.trim(),
          nationality: applicant.nationality ?? null,
          date_of_birth: applicant.dateOfBirth ?? null,
          gender: applicant.gender ?? null,
          residence_card_number: applicant.residenceCardNumber ?? null,
          date_of_expiry: applicant.currentVisaExpiry ?? null,
          address: applicant.japanAddress ?? null,
        };
        if (uploadedDoc?.ocrExtractedData) {
          ocrData = {
            ...(uploadedDoc.ocrExtractedData as Record<string, any>),
            ...ocrData,
          };
        }
      }

      // 一致なしはスキップ
      if (!uploadedDoc && Object.keys(ocrData).every((k) => !ocrData[k])) continue;

      await db
        .update(applicationDocumentChecklist)
        .set({
          ...(uploadedDoc
            ? {
                fileUrl: uploadedDoc.fileUrl,
                fileName: uploadedDoc.fileName,
                fileSize: uploadedDoc.fileSize ?? null,
                mimeType: uploadedDoc.mimeType ?? null,
                status: "submitted",
                submittedAt: item.submittedAt ?? new Date(),
              }
            : {}),
          ocrExtractedData: Object.keys(ocrData).length > 0 ? ocrData : item.ocrExtractedData,
          updatedAt: new Date(),
        })
        .where(eq(applicationDocumentChecklist.id, item.id));

      updatedCount++;
    }

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, count: updatedCount };
  } catch (err: any) {
    return { success: false, error: err.message ?? "エラーが発生しました" };
  }
}

// ── 申請案件の削除（論理削除） ─────────────────────────────────────────────────
export async function deleteApplication(
  applicationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    await db
      .update(applications)
      .set({ status: "cancelled" as any, updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    await db.insert(auditLog).values({
      tenantId,
      applicationId,
      userId: session.user.id,
      action: "delete",
      entityType: "application",
      entityId: applicationId,
    });

    revalidatePath("/applications");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "削除に失敗しました" };
  }
}

// ── カスタム書類をチェックリストに直接追加 ────────────────────────────────────
export async function addCustomDocumentToChecklist(
  applicationId: string,
  documentName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    if (!documentName.trim()) return { success: false, error: "書類名を入力してください" };

    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    await db.insert(applicationDocumentChecklist).values({
      applicationId,
      documentRequirementId: null,
      documentName: documentName.trim(),
      isRequiredByExpert: true,
      status: "not_submitted",
    });

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "追加に失敗しました" };
  }
}

// ── 既存申請に必須書類を追加 ───────────────────────────────────────────────────
export async function addRequiredDocumentsToChecklist(
  applicationId: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select({ id: applications.id, visaType: applications.visaType, applicationType: applications.applicationType })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    // 必須書類を取得（common + visaType固有、all + applicationType固有）
    const vtStr = String(app.visaType);
    const atStr = String(app.applicationType);
    const requiredDocs = await db
      .select()
      .from(documentRequirementMaster)
      .where(
        and(
          or(
            eq(documentRequirementMaster.visaType, vtStr),
            eq(documentRequirementMaster.visaType, "common")
          ),
          or(
            eq(documentRequirementMaster.applicationType, atStr),
            eq(documentRequirementMaster.applicationType, "all")
          ),
          eq(documentRequirementMaster.isAlwaysRequired, true),
          eq(documentRequirementMaster.isActive, true)
        )
      )
      .orderBy(documentRequirementMaster.sortOrder);
    console.log("[addRequired] requiredDocs count:", requiredDocs.length, "visaType:", vtStr, "applicationType:", atStr);

    // 既にチェックリストにあるものを除外
    const existing = await db
      .select({ documentRequirementId: applicationDocumentChecklist.documentRequirementId })
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));
    const existingIds = new Set(existing.map((e) => e.documentRequirementId).filter(Boolean));

    const newDocs = requiredDocs.filter((d) => !existingIds.has(d.id));
    if (newDocs.length === 0) {
      return { success: true, count: 0 };
    }

    await db.insert(applicationDocumentChecklist).values(
      newDocs.map((doc) => ({
        applicationId,
        documentRequirementId: doc.id,
        documentName: doc.documentName,
        isRequiredByExpert: true,
        status: "not_submitted" as const,
      }))
    );

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, count: newDocs.length };
  } catch (err: any) {
    return { success: false, error: err.message ?? "追加に失敗しました" };
  }
}

// ── 申請書類の下書き生成（Gemini AI） ─────────────────────────────────────────
export async function generateApplicationFormDraft(
  applicationId: string
): Promise<{ success: boolean; error?: string; draft?: Record<string, any> }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    // 申請案件・申請人・組織を取得
    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const [applicant] = await db
      .select()
      .from(applicantMaster)
      .where(eq(applicantMaster.id, app.applicantId))
      .limit(1);

    const org = app.organizationId
      ? await db.select().from(organizationMaster)
          .where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
      : null;

    // チェックリスト（OCRデータ含む）を取得
    const checklist = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(and(
        eq(applicationDocumentChecklist.applicationId, applicationId),
        eq(applicationDocumentChecklist.isRequiredByExpert, true),
      ));

    // OCRデータのサマリーを構築
    const ocrSummary = checklist
      .filter(c => c.ocrExtractedData)
      .map(c => {
        const ocr = c.ocrExtractedData as Record<string, any>;
        const fields = Object.entries(ocr)
          .filter(([, v]) => v !== null && v !== "null" && v !== "")
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n");
        return `【${c.documentName}】\n${fields}`;
      })
      .join("\n\n");

    // visa/申請種別ラベル
    const VISA_LABELS: Record<string, string> = {
      engineer_humanities: "技術・人文知識・国際業務",
      intra_company_transferee: "企業内転勤",
      skilled_labor: "技能",
      specified_skilled_worker_1: "特定技能1号",
      business_manager: "経営・管理",
      researcher: "研究",
      professor: "教授",
      highly_skilled_professional_1: "高度専門職1号",
      student: "留学",
      dependent: "家族滞在",
      spouse_of_japanese: "日本人の配偶者等",
      long_term_resident: "定住者",
      permanent_resident: "永住者",
    };
    const APP_LABELS: Record<string, string> = {
      certification: "在留資格認定証明書交付申請",
      change: "在留資格変更許可申請",
      renewal: "在留期間更新許可申請",
      permanent_residence: "永住許可申請",
    };
    const visaLabel = VISA_LABELS[app.visaType] ?? app.visaType;
    const appTypeLabel = APP_LABELS[app.applicationType] ?? app.applicationType;

    // Gemini プロンプト
    const prompt = `あなたは日本の在留資格申請を専門とする行政書士です。
以下の情報をもとに、入管への申請書類（申請理由書・説明書）の下書きを作成してください。

【申請概要】
- 申請種別: ${appTypeLabel}
- 在留資格: ${visaLabel}
- 申請人氏名: ${applicant.familyNameEn} ${applicant.givenNameEn}${applicant.familyNameJa ? `（${applicant.familyNameJa}${applicant.givenNameJa}）` : ""}
- 国籍: ${applicant.nationality ?? "不明"}
- 生年月日: ${applicant.dateOfBirth ?? "不明"}
${org ? `- 所属機関: ${org.nameJa}${org.nameEn ? `（${org.nameEn}）` : ""}
- 従業員数: ${org.employeeCount ?? "不明"}名
- 業種: ${org.industry ?? "不明"}
- カテゴリー: ${org.category ?? "不明"}` : "（所属機関なし）"}

【書類OCR読取データ】
${ocrSummary || "（OCRデータなし）"}

以下の5つのセクションを、実際の申請書に使用できるレベルで具体的に日本語で記述してください。

必ずJSON形式のみで返答してください（説明文・前置き不要）：
{
  "applicationReason": "申請理由（申請に至った経緯、目的、日本滞在の必要性を3〜5文で説明）",
  "jobDescription": "業務内容（具体的な職務内容、担当業務、使用技術・スキルを詳細に記述）",
  "contractDetails": {
    "salary": "契約年収または月収（数値と通貨単位）",
    "workingHours": "勤務時間（例：9:00〜18:00、週40時間）",
    "workLocation": "勤務地（都道府県・市区町村）",
    "contractPeriod": "雇用期間または契約期間",
    "contractType": "雇用形態（正社員・契約社員・パート等）"
  },
  "qualificationsAndBackground": "申請人の学歴・職歴・資格等、在留資格に関連する経歴の説明（3〜5文）",
  "additionalNotes": "特記事項（添付書類の補足説明、特殊な事情、審査官へのアピールポイントなど）"
}`;

    let draft: Record<string, any> = {
      generatedAt: new Date().toISOString(),
      visaType: app.visaType,
      applicationType: app.applicationType,
      applicationReason: "",
      jobDescription: "",
      contractDetails: { salary: "", workingHours: "", workLocation: "", contractPeriod: "", contractType: "" },
      qualificationsAndBackground: "",
      additionalNotes: "",
    };

    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: prompt }] }],
        });
        const text = response.text ?? "{}";
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
          draft = { ...draft, ...parsed, generatedAt: draft.generatedAt, visaType: draft.visaType, applicationType: draft.applicationType };
        }
      } catch (aiErr: any) {
        console.error("[Draft] Gemini error:", aiErr?.message);
        // AI失敗でも保存は続行（空の下書きとして）
      }
    }

    // draftDataに保存し、ステータスを更新
    await db
      .update(applications)
      .set({
        draftData: draft,
        status: "ocr_processing" as any,
        updatedAt: new Date(),
      })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, draft };
  } catch (err: any) {
    return { success: false, error: err.message ?? "下書き生成に失敗しました" };
  }
}

// ── 質問書の自動生成（下書きの不足情報をAIが抽出） ───────────────────────────
export async function generateQuestionnaire(
  applicationId: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const draft = (app.draftData ?? {}) as Record<string, any>;
    const contract = (draft.contractDetails ?? {}) as Record<string, any>;

    const draftSummary = [
      `申請理由: ${draft.applicationReason || "（未記入）"}`,
      `業務内容: ${draft.jobDescription || "（未記入）"}`,
      `年収/月収: ${contract.salary || "（未記入）"}`,
      `勤務時間: ${contract.workingHours || "（未記入）"}`,
      `勤務地: ${contract.workLocation || "（未記入）"}`,
      `雇用期間: ${contract.contractPeriod || "（未記入）"}`,
      `雇用形態: ${contract.contractType || "（未記入）"}`,
      `学歴・職歴: ${draft.qualificationsAndBackground || "（未記入）"}`,
      `特記事項: ${draft.additionalNotes || "（未記入）"}`,
    ].join("\n");

    const prompt = `あなたは日本の在留資格申請を専門とする行政書士です。
以下は申請書の下書きです。入管審査で必要になる情報のうち、不足・不明確な点を洗い出し、
お客様（申請人）に確認すべき質問を生成してください。

【申請書下書き】
${draftSummary}

以下のJSONのみを返してください（前置き・説明文不要）：
[
  {
    "fieldKey": "フィールドキー（英語スネークケース）",
    "questionJa": "お客様への質問文（日本語・丁寧語）",
    "answerType": "text",
    "isRequired": true
  },
  ...
]

重要なルール：
- 未記入・不明確な項目についてのみ質問を生成する（記入済みは除外）
- 質問は具体的で答えやすい表現にする
- 最大10問まで
- 在留資格審査で重要度の高いものを優先する`;

    let questions: Array<{ fieldKey: string; questionJa: string; answerType: string; isRequired: boolean }> = [];

    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: prompt }] }],
        });
        const text = response.text ?? "[]";
        const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\[[\s\S]*\])/);
        if (jsonMatch) {
          try { questions = JSON.parse(jsonMatch[1] ?? jsonMatch[0]); } catch { questions = []; }
        }
      } catch (aiErr: any) {
        console.error("[Questionnaire] Gemini error:", aiErr?.message);
      }
    }

    // フォールバック: 基本的な質問
    if (questions.length === 0) {
      questions = [
        { fieldKey: "salary_confirm", questionJa: "年収（税込）はいくらですか？", answerType: "text", isRequired: true },
        { fieldKey: "job_detail", questionJa: "具体的な業務内容・担当プロジェクトを教えてください", answerType: "text", isRequired: true },
        { fieldKey: "work_location", questionJa: "主な勤務地（都道府県・市区町村）を教えてください", answerType: "text", isRequired: true },
      ];
    }

    // 既存の質問を削除して新しく挿入
    await db.delete(questionnaireQuestions).where(eq(questionnaireQuestions.applicationId, applicationId));
    await db.insert(questionnaireQuestions).values(
      questions.map((q) => ({
        applicationId,
        fieldKey: q.fieldKey,
        questionJa: q.questionJa,
        answerType: q.answerType ?? "text",
        isRequired: q.isRequired ?? true,
      }))
    );

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, count: questions.length };
  } catch (err: any) {
    return { success: false, error: err.message ?? "質問書生成に失敗しました" };
  }
}

// ── 質問書の回答を保存 ────────────────────────────────────────────────────────
export async function updateQuestionnaireAnswer(
  questionId: string,
  answer: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };

    await db
      .update(questionnaireQuestions)
      .set({ answer: answer || null, answeredAt: answer ? new Date() : null })
      .where(eq(questionnaireQuestions.id, questionId));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "保存に失敗しました" };
  }
}

// ── 質問書の回答を申請書下書きに反映（AI） ───────────────────────────────────
export async function applyQuestionnaireToDraft(
  applicationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const questions = await db
      .select()
      .from(questionnaireQuestions)
      .where(eq(questionnaireQuestions.applicationId, applicationId));

    const answeredQA = questions
      .filter((q) => q.answer)
      .map((q) => `Q: ${q.questionJa}\nA: ${q.answer}`)
      .join("\n\n");

    const draft = (app.draftData ?? {}) as Record<string, any>;

    if (!answeredQA || !process.env.GEMINI_API_KEY) {
      // AI不使用の場合は additionalNotes に Q&A を追記
      const notes = questions
        .filter((q) => q.answer)
        .map((q) => `・${q.questionJa}：${q.answer}`)
        .join("\n");
      const updated = {
        ...draft,
        additionalNotes: [draft.additionalNotes, notes].filter(Boolean).join("\n\n"),
      };
      await db.update(applications)
        .set({ draftData: updated, updatedAt: new Date() })
        .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));
      revalidatePath(`/applications/${applicationId}`);
      return { success: true };
    }

    const prompt = `あなたは日本の在留資格申請を専門とする行政書士です。
以下の申請書下書きに、お客様から得た回答を反映させ、申請書を更新してください。

【現在の申請書下書き】
申請理由: ${draft.applicationReason || ""}
業務内容: ${draft.jobDescription || ""}
年収/月収: ${(draft.contractDetails as any)?.salary || ""}
勤務時間: ${(draft.contractDetails as any)?.workingHours || ""}
勤務地: ${(draft.contractDetails as any)?.workLocation || ""}
雇用期間: ${(draft.contractDetails as any)?.contractPeriod || ""}
雇用形態: ${(draft.contractDetails as any)?.contractType || ""}
学歴・職歴: ${draft.qualificationsAndBackground || ""}
特記事項: ${draft.additionalNotes || ""}

【お客様からの回答（Q&A）】
${answeredQA}

上記の回答を反映して申請書を更新してください。
以下のJSONのみを返してください：
{
  "applicationReason": "更新された申請理由",
  "jobDescription": "更新された業務内容",
  "contractDetails": {
    "salary": "年収",
    "workingHours": "勤務時間",
    "workLocation": "勤務地",
    "contractPeriod": "雇用期間",
    "contractType": "雇用形態"
  },
  "qualificationsAndBackground": "更新された学歴・職歴",
  "additionalNotes": "更新された特記事項"
}`;

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
      });
      const text = response.text ?? "{}";
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
        const updated = {
          ...draft,
          ...parsed,
          generatedAt: draft.generatedAt,
          visaType: draft.visaType,
          applicationType: draft.applicationType,
          updatedFromQuestionnaire: new Date().toISOString(),
        };
        await db.update(applications)
          .set({ draftData: updated, updatedAt: new Date() })
          .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));
      }
    } catch (aiErr: any) {
      console.error("[Apply QA] Gemini error:", aiErr?.message);
    }

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "反映に失敗しました" };
  }
}

// ── 申請書類下書きの保存（手動編集） ─────────────────────────────────────────
export async function saveApplicationDraft(
  applicationId: string,
  draftData: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    await db
      .update(applications)
      .set({ draftData, updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "保存に失敗しました" };
  }
}
