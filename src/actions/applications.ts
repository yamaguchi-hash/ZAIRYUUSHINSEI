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
import { VISA_TYPE_LABELS } from "@/lib/utils";

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

  // ── チェックリスト取得（file_url を除外して DB 転送量を削減）
  // file_url は base64 data URL として最大 1MB+ になるため SELECT から除外する。
  // ファイルの有無は file_name の有無（null チェック）で判断する。
  const rawChecklist = await db
    .select({
      id:                    applicationDocumentChecklist.id,
      applicationId:         applicationDocumentChecklist.applicationId,
      documentRequirementId: applicationDocumentChecklist.documentRequirementId,
      documentName:          applicationDocumentChecklist.documentName,
      isRequiredByExpert:    applicationDocumentChecklist.isRequiredByExpert,
      status:                applicationDocumentChecklist.status,
      // file_url は除外（base64 が巨大なため）
      fileName:              applicationDocumentChecklist.fileName,
      fileSize:              applicationDocumentChecklist.fileSize,
      mimeType:              applicationDocumentChecklist.mimeType,
      ocrExtractedData:      applicationDocumentChecklist.ocrExtractedData,
      expertNotes:           applicationDocumentChecklist.expertNotes,
      submittedAt:           applicationDocumentChecklist.submittedAt,
      createdAt:             applicationDocumentChecklist.createdAt,
    })
    .from(applicationDocumentChecklist)
    .where(eq(applicationDocumentChecklist.applicationId, id))
    .orderBy(applicationDocumentChecklist.createdAt);

  // マスターの留意事項と並び順を別クエリで取得
  const requirementIds = [
    ...new Set(rawChecklist.map((c) => c.documentRequirementId).filter((id): id is string => !!id))
  ];
  const masterDescMap: Record<string, string | null> = {};
  const masterSortOrderMap: Record<string, number> = {};
  if (requirementIds.length > 0) {
    const masters = await db
      .select({
        id: documentRequirementMaster.id,
        description: documentRequirementMaster.description,
        sortOrder: documentRequirementMaster.sortOrder,
      })
      .from(documentRequirementMaster)
      .where(inArray(documentRequirementMaster.id, requirementIds));
    for (const m of masters) {
      masterDescMap[m.id] = m.description ?? null;
      masterSortOrderMap[m.id] = m.sortOrder;
    }
  }

  // ── 安全なシリアライズのために加工
  //    1. data: URL → "(data)" 置換（RSC ペイロード肥大化防止）
  //    2. Date オブジェクトを除外（RSC シリアライズ問題の回避）
  //    3. 不要フィールドを除外
  const checklist = rawChecklist.map((item) => ({
    id:                    item.id,
    applicationId:         item.applicationId,
    documentRequirementId: item.documentRequirementId ?? null,
    documentName:          item.documentName,
    isRequiredByExpert:    item.isRequiredByExpert,
    status:                item.status,
    // fileUrl は SELECT から除外済み（巨大な base64 URL を DB から取得しない）
    // file_name が存在すればファイルアップロード済みと判断する
    fileUrl:    item.fileName ? "(uploaded)" : null,
    fileName:   item.fileName ?? null,
    fileSize:   item.fileSize ?? null,
    mimeType:   item.mimeType ?? null,
    expertNotes: item.expertNotes ?? null,
    // OCR データ: null または plain object（シリアライズ可）
    // 空オブジェクト {} は null に変換（React hydration の安全化）
    ocrExtractedData: (() => {
      const ocr = item.ocrExtractedData;
      if (ocr === null || ocr === undefined) return null;
      if (typeof ocr !== 'object') return null;
      if (Object.keys(ocr as object).length === 0) return null;
      return ocr as Record<string, unknown>;
    })(),
    // マスターの留意事項
    masterDescription: item.documentRequirementId
      ? (masterDescMap[item.documentRequirementId] ?? null)
      : null,
    // 並び順: マスターの sort_order を保持（ソートに使用）
    masterSortOrder: item.documentRequirementId
      ? (masterSortOrderMap[item.documentRequirementId] ?? 9999)
      : 9999,
    // Date オブジェクトは文字列に変換（RSC シリアライズ安全化）
    // Neon HTTP ドライバーが文字列で返す場合も対応
    submittedAt: item.submittedAt
      ? (item.submittedAt instanceof Date
          ? item.submittedAt.toISOString()
          : String(item.submittedAt))
      : null,
    // created_at は Date → string（ソートの二次キー用）
    createdAt: item.createdAt
      ? (item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : String(item.createdAt))
      : null,
  }));

  // ── 入管提出順にソート ────────────────────────────────────────────────────
  //   1次キー: マスターの sort_order（書類提出順）
  //   2次キー: created_at（同一書類の複数枠は追加順）
  checklist.sort((a, b) => {
    if (a.masterSortOrder !== b.masterSortOrder) {
      return a.masterSortOrder - b.masterSortOrder;
    }
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });

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

    // 初期ステータスは「①基本設定」(draft) から開始
    const [newApp] = await db
      .insert(applications)
      .values({
        tenantId,
        applicantId: data.applicantId,
        organizationId: data.organizationId,
        applicationType: data.applicationType as any,
        visaType: data.visaType as any,
        caseNumber,
        status: "draft" as any,
      })
      .returning();

    // チェックリストは空の状態でスタート（書類選択画面から追加する）

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

/** アップロード済みファイルを取り消してアップロード前の状態に戻す */
export async function clearChecklistFile(
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
    if (!item) return { success: false, error: "アイテムが見つかりません" };

    await db
      .update(applicationDocumentChecklist)
      .set({
        fileUrl:          null,
        fileName:         null,
        fileSize:         null,
        mimeType:         null,
        ocrExtractedData: null,
        status:           "not_submitted" as const,
        submittedAt:      null,
        updatedAt:        new Date(),
      })
      .where(eq(applicationDocumentChecklist.id, checklistItemId));

    revalidatePath(`/applications/${item.applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "取り消しに失敗しました" };
  }
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
      // Vercel Blob URL など外部 URL からファイルを取得
      // 失敗してもアップロード自体は成功扱いにする（OCR のみスキップ）
      let fetchRes: Response;
      try {
        fetchRes = await fetch(fileUrl, { signal: AbortSignal.timeout(15000) });
      } catch (fetchErr: any) {
        console.error("[OCR] Blob fetch failed:", fetchErr?.message);
        // ファイル保存は成功済み。OCR のみスキップして正常終了
        const [item2] = await db.select({ applicationId: applicationDocumentChecklist.applicationId })
          .from(applicationDocumentChecklist).where(eq(applicationDocumentChecklist.id, checklistItemId)).limit(1);
        if (item2) revalidatePath(`/applications/${item2.applicationId}`);
        return { success: true };
      }
      if (!fetchRes.ok) {
        console.error("[OCR] Blob fetch not ok:", fetchRes.status);
        const [item2] = await db.select({ applicationId: applicationDocumentChecklist.applicationId })
          .from(applicationDocumentChecklist).where(eq(applicationDocumentChecklist.id, checklistItemId)).limit(1);
        if (item2) revalidatePath(`/applications/${item2.applicationId}`);
        return { success: true }; // OCR のみスキップ
      }
      const buf = await fetchRes.arrayBuffer();
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
- family_name_en: 姓（ローマ字）
- given_name_en: 名（ローマ字）
- nationality: 国籍・地域
- date_of_birth: 生年月日（YYYY-MM-DD形式）
- gender: 性別（M または F）
- company_name: 会社名・機関名・組織名
- company_name_en: 会社名（英語）
- corporate_number: 法人番号（13桁）
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
- passport_number: パスポート番号
- residence_card_number: 在留カード番号
- current_visa_type: 在留資格（日本語で。例：家族滞在、技術・人文知識・国際業務）
- current_period_of_stay: 在留期間の長さ（例：3年、1年、3年6月。数字＋単位で記載）
- current_visa_expiry: 在留期間満了日（YYYY-MM-DD形式）
- issue_date: 発行日（YYYY-MM-DD形式）
- expiry_date: 有効期限（YYYY-MM-DD形式）
- marriage_date: 婚姻年月日（YYYY-MM-DD形式）
- marriage_notification_place_japan: 日本国での婚姻・出生・縁組の届出先（市区町村役場名。例：東京都新宿区役所）
- marriage_notification_date_japan: 日本国での届出年月日（YYYY-MM-DD形式）
- marriage_notification_place_foreign: 本国等での婚姻・出生・縁組の届出先・登録機関名（例：中国民政局、韓国家族関係登録事務所）
- marriage_notification_date_foreign: 本国等での届出年月日（YYYY-MM-DD形式）
- notes: その他の重要事項

【在留カードの場合】
在留カード表面に記載の「在留期間」（例：3年、1年）を必ず current_period_of_stay に抽出すること。
在留期間の満了日（例：2026年10月15日）は current_visa_expiry に YYYY-MM-DD形式で抽出すること。

【婚姻届受理証明書・戸籍謄本・戸籍抄本の場合】
日本の市区町村に届け出た情報を marriage_notification_place_japan と marriage_notification_date_japan に抽出すること。

【外国の婚姻証明書・出生証明書・縁組証明書の場合】
本国等の登録機関名を marriage_notification_place_foreign、登録年月日を marriage_notification_date_foreign に抽出すること。

読み取れない項目はnullにしてください（省略不要）。
JSONのみを返し、説明文は不要です。`;

    let extracted: Record<string, any> = {};
    try {
      // PDF は "application/pdf"、画像は実際の mimeType を使用
      const inlineMime = isPdf ? "application/pdf" : imageMimeType;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          parts: [
            { inlineData: { mimeType: inlineMime, data: base64 } },
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

      // ─── 在留カード ──────────────────────────────────────────
      // 申請人マスターでは "residence_card" タイプで保存されるため両方を確認
      else if (/在留カード/.test(name)) {
        uploadedDoc =
          docByType["residence_card"] ??
          docByType["residence_card_front"] ??
          null;

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
): Promise<{ success: boolean; error?: string; newItemId?: string }> {
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

    const [inserted] = await db
      .insert(applicationDocumentChecklist)
      .values({
        applicationId,
        documentRequirementId: null,
        documentName: documentName.trim(),
        isRequiredByExpert: true,
        status: "not_submitted",
      })
      .returning({ id: applicationDocumentChecklist.id });

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, newItemId: inserted.id };
  } catch (err: any) {
    return { success: false, error: err.message ?? "追加に失敗しました" };
  }
}

// ── チェックリスト項目の枠を1件追加（同一書類の複数アップロード用）────────────
export async function duplicateChecklistItem(
  checklistItemId: string,
  applicationId: string
): Promise<{
  success: boolean;
  error?: string;
  /** 追加された新アイテムのID・書類名・requirementId（UI即時反映用） */
  newItem?: {
    id: string;
    documentName: string;
    documentRequirementId: string | null;
    isRequiredByExpert: boolean;
  };
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    // 元のアイテムを取得
    const [original] = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.id, checklistItemId))
      .limit(1);
    if (!original) return { success: false, error: "アイテムが見つかりません" };

    // 権限チェック（同一申請案件か確認）
    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    // 同じ書類名・requirementId で新行を追加（返り値で ID を取得）
    const [inserted] = await db
      .insert(applicationDocumentChecklist)
      .values({
        applicationId,
        documentRequirementId: original.documentRequirementId,
        documentName: original.documentName,
        isRequiredByExpert: original.isRequiredByExpert,
        status: "not_submitted",
      })
      .returning({ id: applicationDocumentChecklist.id });

    revalidatePath(`/applications/${applicationId}`);
    return {
      success: true,
      newItem: {
        id: inserted.id,
        documentName: original.documentName,
        documentRequirementId: original.documentRequirementId ?? null,
        isRequiredByExpert: original.isRequiredByExpert,
      },
    };
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

// ── 申請書フォームデータ保存 ──────────────────────────────────────────────────
export async function saveApplicationFormData(
  applicationId: string,
  formData: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    await db
      .update(applications)
      .set({ formData: { ...formData, lastUpdated: new Date().toISOString() }, updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "保存に失敗しました" };
  }
}

// ── 申請書フォームデータをAIで自動入力 ───────────────────────────────────────
export async function prefillApplicationFormData(
  applicationId: string
): Promise<{ success: boolean; error?: string; formData?: Record<string, any> }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    // ── 1. 申請案件・申請人・所属機関を取得 ────────────────────────────────────
    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId))).limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const [applicant] = await db.select().from(applicantMaster)
      .where(eq(applicantMaster.id, app.applicantId)).limit(1);

    const org = app.organizationId
      ? await db.select().from(organizationMaster)
          .where(eq(organizationMaster.id, app.organizationId)).limit(1).then(r => r[0])
      : null;

    const existingForm = (app.formData ?? {}) as Record<string, any>;

    // ── 2. 必要書類チェックリストを全件取得 ────────────────────────────────────
    const checklist = await db.select().from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));

    // ── 3. 申請人マスターの保存書類も取得（パスポート・在留カード等） ─────────────
    const applicantDocs = applicant
      ? await db.select().from(applicantDocuments)
          .where(eq(applicantDocuments.applicantId, applicant.id))
      : [];

    // ── 婚姻・届出関連書類の判定ヘルパー（ステップ4・8共通） ──────────────────
    const MARRIAGE_KEYWORDS_PREFILL = ['婚姻', '結婚', 'marriage', '出生', '縁組', '戸籍', '家族', 'birth', 'family'];
    const isMarriageDoc = (name: string) =>
      MARRIAGE_KEYWORDS_PREFILL.some(kw => name.toLowerCase().includes(kw.toLowerCase()));
    const needsMarriageReOcr = (data: any) => {
      if (!data) return true;
      return !(data.marriage_notification_place_japan ||
               data.marriage_notification_place_foreign ||
               data.marriage_notification_date_japan ||
               data.marriage_notification_date_foreign);
    };

    // ── 4. OCR未処理の書類ファイルをここで処理 ─────────────────────────────────
    if (process.env.GEMINI_API_KEY) {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      // Gemini でファイルを読み取る内部ヘルパー
      const ocrFile = async (fileUrl: string, mimeType: string | null, docName: string) => {
        try {
          let base64: string;
          let useMime: string;
          if (fileUrl.startsWith("data:")) {
            const ci = fileUrl.indexOf(",");
            base64 = fileUrl.slice(ci + 1);
            useMime = fileUrl.slice(5, ci).split(";")[0];
          } else {
            const res = await fetch(fileUrl);
            if (!res.ok) return null;
            base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
            useMime = mimeType ?? "image/jpeg";
          }
          const supported = ["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf"];
          if (!supported.includes(useMime)) return null;

          const ocrPrompt = `あなたは在留資格申請書類の読み取り専門家です。書類「${docName}」から全情報をJSON抽出してください。
以下のフィールド名で抽出してください:
full_name_ja(氏名日本語), full_name_en(氏名英語), family_name_en(姓英字), given_name_en(名英字),
nationality(国籍), date_of_birth(生年月日YYYY-MM-DD), gender(性別M/F),
passport_number(パスポート番号), expiry_date(パスポート有効期限YYYY-MM-DD),
residence_card_number(在留カード番号),
current_visa_type(在留資格・日本語で。例：家族滞在),
current_period_of_stay(在留期間の長さ。在留カードに記載の期間。例：3年、1年、3年6月),
current_visa_expiry(在留期間満了日YYYY-MM-DD),
address(日本の住所), phone(電話番号),
company_name(勤務先名称), corporate_number(法人番号13桁), position(役職),
annual_salary(年収・数値円), monthly_salary(月収・数値円),
school_name(学校名), degree(学位), graduation_date(卒業日YYYY-MM-DD), major(専攻),
marriage_date(婚姻年月日YYYY-MM-DD),
marriage_notification_place_japan(日本国への婚姻・出生・縁組届出先の市区町村役場名。例：大阪市北区役所),
marriage_notification_date_japan(日本国への届出年月日YYYY-MM-DD),
marriage_notification_place_foreign(本国等への婚姻・出生・縁組届出先の登録機関名。例：中国民政局),
marriage_notification_date_foreign(本国等への届出年月日YYYY-MM-DD),
family_members(在日家族の配列: [{name, relationship, nationality, dateOfBirth, employer}]),
notes(その他重要事項)
【婚姻届受理証明書・戸籍謄本の場合】日本の届出先をmarriage_notification_place_japanへ。
【外国の婚姻/出生証明書の場合】本国登録機関をmarriage_notification_place_foreignへ。
読み取れない項目はnull。JSONのみ返答。`;
          const resp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ parts: [{ inlineData: { mimeType: useMime, data: base64 } }, { text: ocrPrompt }] }],
          });
          const txt = resp.text ?? "{}";
          const m = txt.match(/```json\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
          return m ? JSON.parse(m[1] ?? m[0]) : null;
        } catch { return null; }
      };

      // チェックリスト書類を処理
      // ・OCR未処理 → 必ず実行
      // ・婚姻関連書類でnotificationフィールドが未取得 → 強制再OCR
      let processed = 0;
      for (const item of checklist) {
        if (!item.fileUrl || processed >= 10) continue;
        const alreadyHasOcr = !!item.ocrExtractedData;
        const isMarriage = isMarriageDoc(item.documentName);
        const needsReOcr = !alreadyHasOcr || (isMarriage && needsMarriageReOcr(item.ocrExtractedData));
        if (!needsReOcr) continue;

        const extracted = await ocrFile(item.fileUrl, item.mimeType, item.documentName);
        if (extracted) {
          await db.update(applicationDocumentChecklist)
            .set({ ocrExtractedData: extracted, updatedAt: new Date() })
            .where(eq(applicationDocumentChecklist.id, item.id));
          (item as any).ocrExtractedData = extracted;
          processed++;
        }
      }

      // 申請人マスター書類でOCR未済のものを処理（最大5件）
      let procAd = 0;
      for (const doc of applicantDocs) {
        if (!(doc as any).ocrExtractedData && doc.fileUrl && procAd < 5) {
          const extracted = await ocrFile(doc.fileUrl, null, String(doc.documentType));
          if (extracted) {
            await db.update(applicantDocuments)
              .set({ ocrExtractedData: extracted })
              .where(eq(applicantDocuments.id, doc.id));
            (doc as any).ocrExtractedData = extracted;
            procAd++;
          }
        }
      }
    }

    // ── 5. 全書類のOCRデータを集約（書類名付きで保持） ──────────────────────────
    interface DocEntry { name: string; data: Record<string, any> }
    const allDocs: DocEntry[] = [];
    for (const item of checklist) {
      if (item.ocrExtractedData) {
        allDocs.push({ name: item.documentName, data: item.ocrExtractedData as Record<string, any> });
      }
    }
    for (const doc of applicantDocs) {
      if ((doc as any).ocrExtractedData) {
        allDocs.push({ name: String(doc.documentType), data: (doc as any).ocrExtractedData as Record<string, any> });
      }
    }

    // 後方互換: フラット ocrMap も作成
    const ocrMap: Record<string, any> = {};
    for (const d of allDocs) Object.assign(ocrMap, d.data);

    // ── 6. マスターデータをベースに基本フィールドをセット ──────────────────────
    const { VISA_TYPE_LABELS: VTL } = await import("@/lib/utils");
    const toJaVisa = (v: string | null | undefined) => (v ? (VTL[v] ?? v) : '');

    const prefilled: Record<string, any> = {
      ...existingForm,
      // 申請人マスター（高信頼度: 常に上書き）
      nationality:              applicant?.nationality ?? existingForm.nationality ?? '',
      dateOfBirth:              applicant?.dateOfBirth ?? existingForm.dateOfBirth ?? '',
      familyNameEn:             applicant?.familyNameEn ?? existingForm.familyNameEn ?? '',
      givenNameEn:              applicant?.givenNameEn ?? existingForm.givenNameEn ?? '',
      familyNameJa:             applicant?.familyNameJa ?? existingForm.familyNameJa ?? '',
      givenNameJa:              applicant?.givenNameJa ?? existingForm.givenNameJa ?? '',
      sex:                      (applicant?.gender === 'M' ? '男' : applicant?.gender === 'F' ? '女' : null) ?? existingForm.sex ?? '',
      postalCodeInJapan:        (applicant as any)?.postalCode ?? existingForm.postalCodeInJapan ?? '',
      prefectureInJapan:        (applicant as any)?.japanPrefecture ?? existingForm.prefectureInJapan ?? '',
      cityInJapan:              (applicant as any)?.japanCity ?? existingForm.cityInJapan ?? '',
      addressLineInJapan:       (applicant as any)?.japanAddressLine ?? existingForm.addressLineInJapan ?? '',
      addressInJapan:           applicant?.japanAddress ?? existingForm.addressInJapan ?? '',
      telephoneNo:              applicant?.phone ?? existingForm.telephoneNo ?? '',
      cellularPhoneNo:          (applicant as any)?.mobilePhone ?? existingForm.cellularPhoneNo ?? '',
      passportNumber:           applicant?.passportNumber ?? existingForm.passportNumber ?? '',
      passportExpiry:           applicant?.passportExpiry ?? existingForm.passportExpiry ?? '',
      currentStatusOfResidence: toJaVisa(applicant?.currentVisaType) || existingForm.currentStatusOfResidence || '',
      // currentPeriodOfStay（在留期間）: マスターに専用フィールドがないため
      // OCRデータ→既存フォームの順で取得する（AIで補完）
      currentPeriodOfStay:      ocrMap.current_period_of_stay ?? existingForm.currentPeriodOfStay ?? '',
      // 17. 婚姻・出生・縁組届出情報（OCRデータ→既存フォームの順）
      marriageNotificationPlaceJapan:   ocrMap.marriage_notification_place_japan   ?? existingForm.marriageNotificationPlaceJapan   ?? '',
      marriageNotificationDateJapan:    ocrMap.marriage_notification_date_japan    ?? existingForm.marriageNotificationDateJapan    ?? '',
      marriageNotificationPlaceForeign: ocrMap.marriage_notification_place_foreign ?? existingForm.marriageNotificationPlaceForeign ?? '',
      marriageNotificationDateForeign:  ocrMap.marriage_notification_date_foreign  ?? existingForm.marriageNotificationDateForeign  ?? '',
      currentPeriodExpiry:      applicant?.currentVisaExpiry ?? existingForm.currentPeriodExpiry ?? '',
      residenceCardNumber:      applicant?.residenceCardNumber ?? existingForm.residenceCardNumber ?? '',
      // 申請情報
      desiredStatusOfResidence: VISA_TYPE_LABELS[app.visaType] ?? app.visaType ?? existingForm.desiredStatusOfResidence ?? '',
      // 組織マスター
      employerName:             org?.nameJa ?? existingForm.employerName ?? '',
      employerAddress:          [org?.prefecture, org?.city, org?.addressLine].filter(Boolean).join('') || existingForm.employerAddress || '',
      employerPhone:            org?.phone ?? existingForm.employerPhone ?? '',
      orgName:                  org?.nameJa ?? existingForm.orgName ?? '',
      orgCorporateNumber:       org?.corporateNumber ?? existingForm.orgCorporateNumber ?? '',
      orgAddress:               [org?.prefecture, org?.city, org?.addressLine].filter(Boolean).join('') || existingForm.orgAddress || '',
      orgPhone:                 org?.phone ?? existingForm.orgPhone ?? '',
      orgCapital:               org?.capital ? String(org.capital) : existingForm.orgCapital ?? '',
      orgEmployeeCount:         org?.employeeCount ? String(org.employeeCount) : existingForm.orgEmployeeCount ?? '',
      // 取次者固定
      agentName:         '山口忠士',
      agentOrganization: '兵庫県行政書士会',
      agentAddress:      '〒665-0864 兵庫県宝塚市泉町22-25 島上マンション南棟1-B',
      agentPhone:        '090-2596-0128',
    };

    // ── 7. 全書類データを使った包括的Gemini解析 ──────────────────────────────
    if (process.env.GEMINI_API_KEY && allDocs.length > 0) {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // 書類サマリーを文字列化
        const docSummary = allDocs.map((d, i) =>
          `【書類${i + 1}】${d.name}\n${JSON.stringify(d.data, null, 2)}`
        ).join("\n\n");

        const comprehensivePrompt = `あなたは在留資格申請の専門行政書士AIです。
以下の提出書類データをすべて精査し、法務省入管庁の申請書（在留期間更新・資格変更・認定証明書交付）の
全フィールドを正確に埋めてください。

━━ 提出書類一覧（${allDocs.length}件） ━━
${docSummary}

━━ 申請人マスター情報 ━━
氏名: ${applicant?.familyNameEn ?? ''} ${applicant?.givenNameEn ?? ''} / ${applicant?.familyNameJa ?? ''} ${applicant?.givenNameJa ?? ''}
国籍: ${applicant?.nationality ?? ''} / 性別: ${applicant?.gender ?? ''}
在留資格: ${applicant?.currentVisaType ?? ''} / 在留期限: ${applicant?.currentVisaExpiry ?? ''}

━━ 所属機関情報 ━━
${org ? `機関名: ${org.nameJa ?? ''} / 法人番号: ${org.corporateNumber ?? ''} / 所在地: ${[org.prefecture, org.city, org.addressLine].filter(Boolean).join('')}` : '（なし）'}

━━ 申請種別: ${app.applicationType} / 在留資格: ${app.visaType} ━━

上記の書類データから読み取れる全情報を精査し、以下のJSONフィールドを埋めてください。
書類に明記されている情報を最優先し、推測・補完は最小限にしてください。
不明・書類に記載なしの場合は ""（空文字列）にしてください。
日付はすべてYYYY-MM-DD形式で返してください。

{
  "placeOfBirth": "出生地（都市・国名）",
  "homeTownCity": "本国における居住地（都市・国）",
  "occupation": "職業（例：主婦、会社員）",
  "maritalStatus": "配偶者の有無（有 または 無）",
  "reasonForApplication": "更新・変更の理由（書類から読み取れる事実を具体的に記述）",

  "employerName": "勤務先名称（書類記載の正式名称）",
  "employerBranchName": "支店・事業所名",
  "employerAddress": "勤務先所在地（フル住所）",
  "employerPhone": "勤務先電話番号",
  "salary": "給与・報酬（数値のみ）",
  "salaryType": "給与種別（月額 または 年額）",
  "position": "職務上の地位・役職名",
  "activityDetails": "業務活動内容（具体的に）",

  "educationCountry": "学校所在国（本邦（日本） または 外国）",
  "educationDegree": "学位・区分（大学院（博士）/大学院（修士）/大学/短期大学/専門学校/高等学校等）",
  "educationSchoolName": "学校名（正式名称）",
  "educationGraduationDate": "卒業年月日（YYYY-MM-DD）",
  "majorCategory": "専攻・専門分野",

  "itQualificationExists": "情報処理技術者資格の有無（有 または 無）",
  "itQualificationName": "資格名（有の場合）",

  "currentPeriodOfStay": "申請人の現在の在留期間の長さ（在留カード表面に記載。例：3年、1年、3年6月。数字と単位を含めて正確に）",

  "marriageDate": "婚姻年月日（T型・YYYY-MM-DD）",
  "marriageRegistrationDate": "婚姻届出年月日（YYYY-MM-DD）",
  "marriageRegistrationPlace": "婚姻届出市区町村",
  "cohabitation": "同居の有無（有 または 無）",

  "marriageNotificationPlaceJapan": "日本国への婚姻・出生・縁組の届出先（市区町村役場名。婚姻届受理証明書・戸籍謄本から抽出。例：大阪市北区役所）",
  "marriageNotificationDateJapan": "日本国への届出年月日（YYYY-MM-DD。婚姻届受理証明書・戸籍謄本に記載の届出受理日）",
  "marriageNotificationPlaceForeign": "本国等への婚姻・出生・縁組の届出先・登録機関名（外国の婚姻証明書・出生証明書から抽出。例：中国民政局、韓国家族関係登録事務所）",
  "marriageNotificationDateForeign": "本国等への届出年月日（YYYY-MM-DD。外国の証明書に記載の登録日）",
  "fundingMethod": "滞在費支弁方法（親族負担/外国からの送金/身元保証人負担/その他）",

  "supporterNameEn": "扶養者 氏名（ローマ字。姓名を半角スペース区切りで。例：YAMADA Taro）",
  "supporterDob": "扶養者 生年月日（YYYY-MM-DD）",
  "supporterNationality": "扶養者 国籍・地域",
  "supporterResidenceCard": "扶養者 在留カード番号",
  "supporterStatusOfResidence": "扶養者 在留資格（日本語）",
  "supporterPeriodOfStay": "扶養者 在留期間（例：3年）",
  "supporterPeriodExpiry": "扶養者 在留期間満了日（YYYY-MM-DD）",
  "supporterRelationship": "申請人との続柄（夫/妻/父/母/養父/養母/その他）",
  "supporterEmployer": "扶養者 勤務先名称",
  "supporterCorporateNumber": "扶養者 法人番号（13桁）",
  "supporterBranchName": "扶養者 支店・事業所名",
  "supporterEmployerAddress": "扶養者 勤務先所在地（フル住所）",
  "supporterEmployerPhone": "扶養者 勤務先電話番号",
  "supporterAnnualIncome": "扶養者 年収（数値・円）",

  "spouseFamilyNameEn": "配偶者 姓（ローマ字）",
  "spouseGivenNameEn": "配偶者 名（ローマ字）",
  "spouseDob": "配偶者 生年月日（YYYY-MM-DD）",
  "spouseNationality": "配偶者 国籍",
  "spouseResidenceCard": "配偶者 在留カード番号",
  "spouseOccupation": "配偶者 職業",
  "spouseEmployer": "配偶者 勤務先",
  "spouseAddress": "配偶者 住所",
  "spouseResidenceStatus": "配偶者 身分（日本国籍/永住者/特別永住者）",

  "schoolName": "在籍学校名",
  "schoolType": "学校種別（大学院/大学/短期大学/専門学校/高等学校/日本語学校/その他）",
  "schoolAddress": "学校所在地",
  "schoolPhone": "学校電話番号",
  "enrollmentDate": "入学年月日（YYYY-MM-DD）",
  "expectedGraduationDate": "卒業予定年月日（YYYY-MM-DD）",
  "courseOfStudy": "在籍コース・専攻",
  "annualTuition": "年間学費（数値・円）",
  "fundingSource": "費用支弁方法",
  "fundingAmount": "月額生活費（数値・円）",

  "familyInJapanExists": "在日親族の有無（有 または 無）",
  "criminalRecord": "犯罪記録の有無（有 または 無）",

  "orgBranchName": "所属機関 支店・事業所名",
  "orgEmploymentInsuranceNo": "雇用保険適用事業所番号",
  "orgAnnualSales": "年間売上高（数値・円）",
  "orgForeignEmployeeCount": "外国人職員数",
  "workPeriodFixed": "就労予定期間（定めなし または 定めあり）",
  "workPeriodDuration": "就労期間（定めありの場合）",
  "employmentStartDate": "雇用開始年月日（YYYY-MM-DD）",
  "businessExperienceYears": "実務経験年数（数値）",
  "occupationCode": "職種コード番号"
}`;

        const resp = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: comprehensivePrompt }] }],
        });
        const text = resp.text ?? "{}";
        const m = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
        if (m) {
          const aiData: Record<string, any> = JSON.parse(m[1] ?? m[0]);
          // AIの値は「現在空欄のフィールドのみ」に適用（マスターデータ優先）
          for (const [k, v] of Object.entries(aiData)) {
            if (v !== null && v !== undefined && v !== '' && !prefilled[k]) {
              prefilled[k] = v;
            }
          }
        }
      } catch (aiErr: any) {
        console.error("[prefill] comprehensive AI error:", aiErr?.message);
        /* AI失敗は無視して続行 */
      }
    }

    // ── 8. 婚姻関連書類の画像を直接Geminiに渡して項目17を高精度抽出 ─────────────
    // 包括的テキスト解析でも未取得の場合、書類画像を直接読んで補完する
    const stillNeedsMarriage = !prefilled.marriageNotificationPlaceJapan &&
                               !prefilled.marriageNotificationPlaceForeign &&
                               !prefilled.marriageNotificationDateJapan &&
                               !prefilled.marriageNotificationDateForeign;

    if (stillNeedsMarriage && process.env.GEMINI_API_KEY) {
      const marriageDocs = checklist.filter(
        (item) => item.fileUrl && isMarriageDoc(item.documentName)
      );

      if (marriageDocs.length > 0) {
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

          for (const doc of marriageDocs.slice(0, 5)) {
            const bytes = await (async () => {
              try {
                if (doc.fileUrl!.startsWith("data:")) {
                  const ci = doc.fileUrl!.indexOf(",");
                  return Buffer.from(doc.fileUrl!.slice(ci + 1), "base64");
                }
                const r = await fetch(doc.fileUrl!, { cache: "no-store" });
                if (!r.ok) return null;
                return Buffer.from(await r.arrayBuffer());
              } catch { return null; }
            })();
            if (!bytes) continue;

            let useMime = doc.mimeType ?? "image/jpeg";
            if (doc.fileUrl!.startsWith("data:")) {
              useMime = doc.fileUrl!.slice(5, doc.fileUrl!.indexOf(";"));
            }
            const supported = ["image/jpeg","image/png","image/webp","image/heic","image/heif","application/pdf"];
            if (!supported.includes(useMime)) continue;

            const marriagePrompt = `この書類「${doc.documentName}」を精査して、以下のJSONを日本語で返してください。
書類に記載されている事実のみを抽出し、不明な場合は""にしてください。
日付はYYYY-MM-DD形式で返してください。

{
  "marriage_notification_place_japan": "日本の市区町村役場への婚姻・出生・縁組の届出先（役場名。例：大阪市北区役所、東京都新宿区役所）",
  "marriage_notification_date_japan": "日本の役場への届出年月日（YYYY-MM-DD）",
  "marriage_notification_place_foreign": "本国・外国の登録機関への届出先（機関名。例：中国民政局、韓国家族関係登録事務所）",
  "marriage_notification_date_foreign": "本国・外国への届出年月日（YYYY-MM-DD）"
}

【ヒント】
- 婚姻届受理証明書・戸籍謄本・戸籍抄本 → marriage_notification_place_japan と marriage_notification_date_japan に記入
- 外国の婚姻証明書（Marriage Certificate）・公証書 → marriage_notification_place_foreign と marriage_notification_date_foreign に記入
- 届出年月日（Notification Date）＝役場に届け出た日（婚姻成立日と異なる場合あり）`;

            const resp = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [{ parts: [
                { inlineData: { mimeType: useMime, data: bytes.toString("base64") } },
                { text: marriagePrompt },
              ]}],
            });
            const txt = resp.text ?? "{}";
            const mm = txt.match(/```json\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
            if (mm) {
              const mData: Record<string, any> = JSON.parse(mm[1] ?? mm[0]);
              if (mData.marriage_notification_place_japan && !prefilled.marriageNotificationPlaceJapan)
                prefilled.marriageNotificationPlaceJapan = mData.marriage_notification_place_japan;
              if (mData.marriage_notification_date_japan && !prefilled.marriageNotificationDateJapan)
                prefilled.marriageNotificationDateJapan = mData.marriage_notification_date_japan;
              if (mData.marriage_notification_place_foreign && !prefilled.marriageNotificationPlaceForeign)
                prefilled.marriageNotificationPlaceForeign = mData.marriage_notification_place_foreign;
              if (mData.marriage_notification_date_foreign && !prefilled.marriageNotificationDateForeign)
                prefilled.marriageNotificationDateForeign = mData.marriage_notification_date_foreign;
            }
          }
        } catch (mErr: any) {
          console.error("[prefill] marriage doc analysis error:", mErr?.message);
        }
      }
    }

    // ── 9. 在日親族リストをOCRデータから自動構築（familyInJapan が空の場合）────
    if (!prefilled.familyInJapan || (prefilled.familyInJapan as any[]).length === 0) {
      const familyFromOcr: any[] = [];
      // OCR から家族情報らしきデータを拾う
      const ocr = ocrMap;
      if (ocr.family_members && Array.isArray(ocr.family_members)) {
        for (const m of ocr.family_members) {
          familyFromOcr.push({
            relationship: m.relationship ?? '',
            name: m.name ?? '',
            dateOfBirth: m.dateOfBirth ?? m.date_of_birth ?? '',
            nationality: m.nationality ?? '',
            placeOfEmployment: m.employer ?? m.school ?? '',
            residingTogether: true,
            residenceCardNumber: m.residenceCard ?? m.residence_card ?? '',
          });
        }
      }
      if (familyFromOcr.length > 0) {
        prefilled.familyInJapan = familyFromOcr;
        prefilled.familyInJapanExists = '有';
      }
    }

    // ── 9-b. 家族滞在（認定・更新・変更すべて）の場合、扶養者情報を在日親族に自動反映 ──
    if (app.visaType === 'dependent') {
      const supporterName = prefilled.supporterNameEn
        || [prefilled.supporterFamilyNameEn, prefilled.supporterGivenNameEn].filter(Boolean).join(' ');
      if (supporterName) {
        const familyList = (prefilled.familyInJapan ?? []) as any[];
        // 既に同名の扶養者が登録されていなければ追加
        const alreadyExists = familyList.some((m: any) =>
          m.name && supporterName && m.name.replace(/\s/g, '') === supporterName.replace(/\s/g, '')
        );
        if (!alreadyExists) {
          familyList.unshift({
            relationship: prefilled.supporterRelationship || '',
            name: supporterName,
            dateOfBirth: prefilled.supporterDob || '',
            nationality: prefilled.supporterNationality || '',
            placeOfEmployment: prefilled.supporterEmployer || '',
            residingTogether: true,
            residenceCardNumber: prefilled.supporterResidenceCard || '',
          });
          prefilled.familyInJapan = familyList;
          prefilled.familyInJapanExists = '有';
        }
      }
    }

    // ── 9. 保存・返却 ────────────────────────────────────────────────────────
    await db.update(applications)
      .set({ formData: prefilled, updatedAt: new Date() })
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, formData: prefilled };
  } catch (err: any) {
    return { success: false, error: err.message ?? "自動入力に失敗しました" };
  }
}

// ── 申請書類下書きの保存（手動編集） ─────────────────────────────────────────
// ─── 項目17 婚姻・出生・縁組届出情報を書類画像から直接抽出 ──────────────────────
// 全提出済み書類をGeminiに直接送り、届出先・届出年月日だけを集中抽出する
export async function extractMarriageNotificationFromDocs(
  applicationId: string
): Promise<{
  success: boolean;
  error?: string;
  data?: {
    marriageNotificationPlaceJapan: string;
    marriageNotificationDateJapan: string;
    marriageNotificationPlaceForeign: string;
    marriageNotificationDateForeign: string;
  };
  docsChecked?: number;
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    if (!process.env.GEMINI_API_KEY) {
      return { success: false, error: "AI機能が設定されていません" };
    }

    // 提出済み書類を取得
    const checklist = await db
      .select()
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));

    const submitted = checklist.filter(
      (item) => item.fileUrl && item.status === "submitted"
    );

    if (submitted.length === 0) {
      return { success: false, error: "提出済みの書類がありません" };
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const result = {
      marriageNotificationPlaceJapan: "",
      marriageNotificationDateJapan: "",
      marriageNotificationPlaceForeign: "",
      marriageNotificationDateForeign: "",
    };

    let docsChecked = 0;

    // 全提出済み書類を順に処理（届出先が見つかれば残りも確認）
    for (const doc of submitted.slice(0, 15)) {
      try {
        let base64: string;
        let useMime: string;

        if (doc.fileUrl!.startsWith("data:")) {
          const ci = doc.fileUrl!.indexOf(",");
          base64 = doc.fileUrl!.slice(ci + 1);
          useMime = doc.fileUrl!.slice(5, ci).split(";")[0];
        } else {
          const res = await fetch(doc.fileUrl!, { cache: "no-store" });
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          base64 = Buffer.from(buf).toString("base64");
          useMime = doc.mimeType ?? "image/jpeg";
        }

        const supported = [
          "image/jpeg", "image/png", "image/webp",
          "image/heic", "image/heif", "application/pdf",
        ];
        if (!supported.includes(useMime)) continue;

        docsChecked++;

        const prompt = `この書類「${doc.documentName}」を見て、婚姻・出生・縁組に関する届出情報を探してください。

以下のJSONのみを返してください（該当情報がない書類の場合はすべて""）：
{
  "marriage_notification_place_japan": "日本の役所（市区町村役場）へ婚姻・出生・縁組を届け出た場合の届出先役場名。例：東京都新宿区役所、大阪市北区役所",
  "marriage_notification_date_japan": "日本の役所への届出年月日（YYYY-MM-DD形式）",
  "marriage_notification_place_foreign": "本国（外国）の機関へ婚姻・出生・縁組を届け出た場合の届出先機関名。例：中国民政局上海市徐匯区民政局、韓国首爾家族関係登録事務所",
  "marriage_notification_date_foreign": "本国（外国）機関への届出年月日（YYYY-MM-DD形式）"
}

【重要】
- 婚姻届受理証明書・戸籍謄本・戸籍抄本 → 日本の届出先とその日付を記入
- 外国の婚姻証明書・結婚証明書・Marriage Certificate・公証書 → 本国の届出先とその日付を記入
- 「届出年月日」は婚姻した日ではなく、役所や機関に届け出た日付
- この書類に該当情報がない場合は ""（空文字）を返す
- JSONのみ返し、説明文は不要`;

        const resp = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{
            parts: [
              { inlineData: { mimeType: useMime, data: base64 } },
              { text: prompt },
            ],
          }],
        });

        const txt = resp.text ?? "{}";
        const m = txt.match(/```json\s*([\s\S]*?)```/) ?? txt.match(/(\{[\s\S]*\})/);
        if (!m) continue;

        const extracted = JSON.parse(m[1] ?? m[0]) as Record<string, string>;

        if (extracted.marriage_notification_place_japan && !result.marriageNotificationPlaceJapan)
          result.marriageNotificationPlaceJapan = extracted.marriage_notification_place_japan;
        if (extracted.marriage_notification_date_japan && !result.marriageNotificationDateJapan)
          result.marriageNotificationDateJapan = extracted.marriage_notification_date_japan;
        if (extracted.marriage_notification_place_foreign && !result.marriageNotificationPlaceForeign)
          result.marriageNotificationPlaceForeign = extracted.marriage_notification_place_foreign;
        if (extracted.marriage_notification_date_foreign && !result.marriageNotificationDateForeign)
          result.marriageNotificationDateForeign = extracted.marriage_notification_date_foreign;

      } catch {
        // 1書類のエラーは無視して次へ
      }
    }

    const found = Object.values(result).some((v) => v !== "");
    if (!found) {
      return {
        success: false,
        docsChecked,
        error: `${docsChecked}件の書類を確認しましたが、婚姻・出生・縁組の届出情報が見つかりませんでした。婚姻届受理証明書・戸籍謄本・外国の婚姻証明書をアップロードしてください。`,
      };
    }

    return { success: true, data: result, docsChecked };
  } catch (err: any) {
    return { success: false, error: err.message ?? "読み取りに失敗しました" };
  }
}

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

// ─── ⑦ 申請日・申請番号を保存し、申請番号を案件番号に統一 ──────────────────
export async function saveSubmissionInfo(
  applicationId: string,
  data: { applicationDate: string; applicationNumber: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId))).limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const existing = (app.draftData as Record<string, any>) ?? {};

    // 申請番号が入力されていれば、案件番号に統一
    const updateData: Record<string, any> = {
      draftData: { ...existing, _submission: data },
      updatedAt: new Date(),
    };
    if (data.applicationNumber) {
      updateData.caseNumber = data.applicationNumber;
    }

    await db.update(applications)
      .set(updateData)
      .where(eq(applications.id, applicationId));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "保存に失敗しました" };
  }
}

// ─── ⑧ 許可日・完了処理（申請人マスター更新含む） ───────────────────────────
export async function completeWithPermit(
  applicationId: string,
  data: {
    permittedDate: string;
    newCardNumber?: string;
    newVisaExpiry?: string;
    newVisaType?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId))).limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const existing = (app.draftData as Record<string, any>) ?? {};

    // 申請人マスターを更新（新しい在留カード番号・有効期限）
    if (data.newCardNumber || data.newVisaExpiry || data.newVisaType) {
      const updateFields: Record<string, any> = { updatedAt: new Date() };
      if (data.newCardNumber)  updateFields.residenceCardNumber = data.newCardNumber;
      if (data.newVisaExpiry)  updateFields.currentVisaExpiry = data.newVisaExpiry;
      if (data.newVisaType)    updateFields.currentVisaType = data.newVisaType;
      await db.update(applicantMaster)
        .set(updateFields)
        .where(eq(applicantMaster.id, app.applicantId));
    }

    // アプリケーションを completed に更新
    await db.update(applications)
      .set({
        status: "completed" as any,
        draftData: {
          ...existing,
          _result: { ...data, completedAt: new Date().toISOString() },
        },
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    revalidatePath(`/applications/${applicationId}`);
    revalidatePath("/applications");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "完了処理に失敗しました" };
  }
}

// ─── 納付書データ保存 ────────────────────────────────────────────────────────
export async function saveNoufushoData(
  applicationId: string,
  noufushoData: {
    feeType: number;
    amount: number;
    payerName: string;
    applicationNumber?: string;
  }
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

    const existing = (app.draftData as Record<string, any>) ?? {};

    await db
      .update(applications)
      .set({
        draftData: { ...existing, _noufusho: noufushoData },
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "保存に失敗しました" };
  }
}

// ─── 預証データ保存（パスポート含めるトグルのみ保存） ─────────────────────────
export async function saveAzukariData(
  applicationId: string,
  azukariData: {
    includePassport?: boolean;
  }
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

    const existing = (app.draftData as Record<string, any>) ?? {};

    await db
      .update(applications)
      .set({
        draftData: { ...existing, _azukari: azukariData },
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "保存に失敗しました" };
  }
}

// ─── 新在留カード画像アップロード（Vercel Blob） ─────────────────────────────
export async function uploadNewResidenceCard(
  applicationId: string,
  file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db.select().from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId))).limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    // ファイルを Vercel Blob にアップロード
    const buffer = await file.arrayBuffer();
    const blobPath = `residence-cards/${applicationId}/${Date.now()}-${file.name}`;

    // Note: Vercel Blob API を使う場合、server action で fetch を使用
    const blobResponse = await fetch(`/api/applications/${applicationId}/upload-residence-card`, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: buffer,
    });

    if (!blobResponse.ok) {
      return { success: false, error: "ファイルアップロードに失敗しました" };
    }

    const result = await blobResponse.json();
    return { success: true, url: result.url };
  } catch (err: any) {
    return { success: false, error: err.message ?? "アップロードに失敗しました" };
  }
}
