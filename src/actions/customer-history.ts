"use server";

/**
 * 顧客（個人=applicant / 法人=organization）に紐づく横断履歴を取得する。
 *  - 過去の全案件（事件簿情報つき）
 *  - すべての打合せ・メール記録（consultation_logs）
 *  - 保管ファイル（application_attachments: 提出控え・預かり資料・PDF等）
 * すべて auth() 認証と tenantId 隔離を必須とする。
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, legalCaseLedger, consultationLogs, applicationAttachments } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";

const BUSINESS_CATEGORY_LABELS: Record<string, string> = {
  immigration: "入管業務",
  transportation: "運送業",
  construction: "建設業",
  other: "その他",
};

export interface CustomerCaseRow {
  id: string;
  caseNumber: string | null;
  businessCategory: string;
  subject: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  feeAmount: number | null;
  completedAt: string | null;
}
export interface CustomerLogRow {
  id: string;
  applicationId: string;
  type: string;
  summary: string | null;
  createdAt: string;
}
export interface CustomerFileRow {
  id: string;
  applicationId: string;
  documentType: string;
  documentLabel: string | null;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  uploadedAt: string;
}

function subjectOf(app: { businessCategory: string; applicationType: string; visaType: string | null }): string {
  const cat = BUSINESS_CATEGORY_LABELS[app.businessCategory] ?? app.businessCategory;
  if (app.businessCategory === "immigration") {
    const proc = APPLICATION_TYPE_LABELS[app.applicationType] ?? app.applicationType;
    const visa = app.visaType ? (VISA_TYPE_LABELS[app.visaType] ?? app.visaType) : "";
    return [visa, proc].filter(Boolean).join("／") || cat;
  }
  return cat;
}

export async function getCustomerHistory(params: {
  applicantId?: string;
  organizationId?: string;
}): Promise<{
  success: boolean;
  error?: string;
  cases?: CustomerCaseRow[];
  logs?: CustomerLogRow[];
  files?: CustomerFileRow[];
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) return { success: false, error: "テナントIDが不正です" };

    const customerCond = params.applicantId
      ? eq(applications.applicantId, params.applicantId)
      : params.organizationId
      ? eq(applications.organizationId, params.organizationId)
      : null;
    if (!customerCond) return { success: false, error: "顧客が指定されていません" };

    // 顧客の全案件（事件簿情報を結合）
    const appRows = await db
      .select({
        id: applications.id,
        caseNumber: applications.caseNumber,
        businessCategory: applications.businessCategory,
        applicationType: applications.applicationType,
        visaType: applications.visaType,
        status: applications.status,
        createdAt: applications.createdAt,
        acceptedAt: legalCaseLedger.acceptedAt,
        feeAmount: legalCaseLedger.feeAmount,
        completedAt: legalCaseLedger.completedAt,
      })
      .from(applications)
      .leftJoin(legalCaseLedger, and(eq(legalCaseLedger.applicationId, applications.id), eq(legalCaseLedger.tenantId, tenantId)))
      .where(and(eq(applications.tenantId, tenantId), customerCond))
      .orderBy(desc(applications.createdAt));

    const cases: CustomerCaseRow[] = appRows.map((r) => ({
      id: r.id,
      caseNumber: r.caseNumber,
      businessCategory: r.businessCategory,
      subject: subjectOf({ businessCategory: r.businessCategory, applicationType: r.applicationType, visaType: r.visaType }),
      status: r.status,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      acceptedAt: r.acceptedAt ? String(r.acceptedAt).slice(0, 10) : null,
      feeAmount: r.feeAmount ?? null,
      completedAt: r.completedAt ? String(r.completedAt).slice(0, 10) : null,
    }));

    const appIds = cases.map((c) => c.id);
    if (appIds.length === 0) {
      return { success: true, cases: [], logs: [], files: [] };
    }

    // 打合せ・メール記録（全案件横断）
    const logRows = await db
      .select({
        id: consultationLogs.id,
        applicationId: consultationLogs.applicationId,
        type: consultationLogs.type,
        summary: consultationLogs.summary,
        createdAt: consultationLogs.createdAt,
      })
      .from(consultationLogs)
      .where(and(eq(consultationLogs.tenantId, tenantId), inArray(consultationLogs.applicationId, appIds)))
      .orderBy(desc(consultationLogs.createdAt));

    const logs: CustomerLogRow[] = logRows.map((r) => ({
      id: r.id,
      applicationId: r.applicationId,
      type: r.type,
      summary: r.summary ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    // 保管ファイル（提出控え・預かり資料・PDF等）
    const fileRows = await db
      .select({
        id: applicationAttachments.id,
        applicationId: applicationAttachments.applicationId,
        documentType: applicationAttachments.documentType,
        documentLabel: applicationAttachments.documentLabel,
        fileName: applicationAttachments.fileName,
        fileUrl: applicationAttachments.fileUrl,
        mimeType: applicationAttachments.mimeType,
        uploadedAt: applicationAttachments.uploadedAt,
      })
      .from(applicationAttachments)
      .where(and(eq(applicationAttachments.tenantId, tenantId), inArray(applicationAttachments.applicationId, appIds)))
      .orderBy(desc(applicationAttachments.uploadedAt));

    const files: CustomerFileRow[] = fileRows.map((r) => ({
      id: r.id,
      applicationId: r.applicationId,
      documentType: r.documentType,
      documentLabel: r.documentLabel ?? null,
      fileName: r.fileName,
      fileUrl: r.fileUrl,
      mimeType: r.mimeType ?? null,
      uploadedAt: r.uploadedAt instanceof Date ? r.uploadedAt.toISOString() : String(r.uploadedAt),
    }));

    return { success: true, cases, logs, files };
  } catch (err: any) {
    return { success: false, error: err.message ?? "履歴の取得に失敗しました" };
  }
}
