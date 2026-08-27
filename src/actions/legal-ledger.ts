"use server";

/**
 * 法定事件簿（legalCaseLedger）— 行政書士法第11条の事件簿要件に対応。
 * applications と 1対1。依頼者は個人(applicant)または法人(organization)のいずれか。
 * すべて auth() 認証と tenantId によるテナント隔離を必須とする。
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, legalCaseLedger, applicantMaster, organizationMaster } from "@/lib/db/schema";
import { eq, and, desc, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";

// 完了とみなす案件ステータス（完結日の自動反映に使用）
const COMPLETED_STATUSES = new Set(["completed", "approved"]);

const BUSINESS_CATEGORY_LABELS: Record<string, string> = {
  immigration: "入管業務",
  transportation: "運送業",
  construction: "建設業",
  other: "その他",
};

export interface LedgerRow {
  id: string;
  applicationId: string;
  caseNumber: string | null;
  clientName: string;            // 依頼者（個人氏名 or 法人名）
  clientType: "individual" | "corporate" | "unknown";
  subject: string;               // 受任事項
  businessCategory: string;
  acceptedAt: string | null;     // 受任日
  completedAt: string | null;    // 完結日
  feeAmount: number | null;      // 報酬額（円）
  status: string | null;
  applicationStatus: string;
}

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

async function assertApplication(applicationId: string, tenantId: string) {
  const [a] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
    .limit(1);
  return a ?? null;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 受任事項の表示文字列を組み立てる（業務カテゴリ＋手続き＋在留資格 等） */
function buildSubject(app: { businessCategory: string; applicationType: string; visaType: string | null }): string {
  const cat = BUSINESS_CATEGORY_LABELS[app.businessCategory] ?? app.businessCategory;
  if (app.businessCategory === "immigration") {
    const proc = APPLICATION_TYPE_LABELS[app.applicationType] ?? app.applicationType;
    const visa = app.visaType ? (VISA_TYPE_LABELS[app.visaType] ?? app.visaType) : "";
    return [visa, proc].filter(Boolean).join("／") || cat;
  }
  return cat;
}

/** 事件簿一覧（テナント全件・受任日の新しい順）。依頼者名・受任事項を結合して返す。 */
export async function listLegalLedger(): Promise<{ success: boolean; error?: string; rows?: LedgerRow[] }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const rows = await db
      .select({
        id: legalCaseLedger.id,
        applicationId: legalCaseLedger.applicationId,
        caseNumber: legalCaseLedger.caseNumber,
        acceptedAt: legalCaseLedger.acceptedAt,
        completedAt: legalCaseLedger.completedAt,
        feeAmount: legalCaseLedger.feeAmount,
        status: legalCaseLedger.status,
        ledgerApplicantId: legalCaseLedger.applicantId,
        ledgerOrganizationId: legalCaseLedger.organizationId,
        businessCategory: applications.businessCategory,
        applicationType: applications.applicationType,
        visaType: applications.visaType,
        applicationStatus: applications.status,
        appApplicantId: applications.applicantId,
        appOrganizationId: applications.organizationId,
        applicantFamilyJa: applicantMaster.familyNameJa,
        applicantGivenJa: applicantMaster.givenNameJa,
        applicantFamilyEn: applicantMaster.familyNameEn,
        applicantGivenEn: applicantMaster.givenNameEn,
        organizationName: organizationMaster.nameJa,
      })
      .from(legalCaseLedger)
      .innerJoin(applications, eq(applications.id, legalCaseLedger.applicationId))
      .leftJoin(applicantMaster, eq(applicantMaster.id, legalCaseLedger.applicantId))
      .leftJoin(organizationMaster, eq(organizationMaster.id, legalCaseLedger.organizationId))
      .where(and(eq(legalCaseLedger.tenantId, tenantId), eq(applications.tenantId, tenantId)))
      .orderBy(desc(legalCaseLedger.acceptedAt), desc(legalCaseLedger.createdAt));

    const mapped: LedgerRow[] = rows.map((r) => {
      const nameJa = [r.applicantFamilyJa, r.applicantGivenJa].filter(Boolean).join(" ").trim();
      const nameEn = [r.applicantFamilyEn, r.applicantGivenEn].filter(Boolean).join(" ").trim();
      const individualName = nameJa || nameEn;
      let clientName = "—";
      let clientType: LedgerRow["clientType"] = "unknown";
      if (r.organizationName) { clientName = r.organizationName; clientType = "corporate"; }
      else if (individualName) { clientName = individualName; clientType = "individual"; }

      return {
        id: r.id,
        applicationId: r.applicationId,
        caseNumber: r.caseNumber,
        clientName,
        clientType,
        subject: buildSubject({ businessCategory: r.businessCategory, applicationType: r.applicationType, visaType: r.visaType }),
        businessCategory: r.businessCategory,
        acceptedAt: r.acceptedAt ? String(r.acceptedAt).slice(0, 10) : null,
        // 完結日: 明示値がなくても案件が完了状態なら反映（表示上の連動）
        completedAt: r.completedAt
          ? String(r.completedAt).slice(0, 10)
          : (COMPLETED_STATUSES.has(r.applicationStatus) ? "（案件完了）" : null),
        feeAmount: r.feeAmount ?? null,
        status: r.status,
        applicationStatus: r.applicationStatus,
      };
    });

    return { success: true, rows: mapped };
  } catch (err: any) {
    return { success: false, error: err.message ?? "読み込みに失敗しました" };
  }
}

/**
 * 事件簿の登録簿ビュー（テナントの全案件を基点に、事件簿情報を結合して一覧）。
 * 事件簿行が未作成の案件も「未登録」として表示されるため、登録漏れが分かる。
 * cancelled（削除済み）案件は除外する。
 */
export async function listCaseLedgerRegister(): Promise<{ success: boolean; error?: string; rows?: LedgerRow[] }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const rows = await db
      .select({
        ledgerId: legalCaseLedger.id,
        applicationId: applications.id,
        appCaseNumber: applications.caseNumber,
        ledgerCaseNumber: legalCaseLedger.caseNumber,
        acceptedAt: legalCaseLedger.acceptedAt,
        completedAt: legalCaseLedger.completedAt,
        feeAmount: legalCaseLedger.feeAmount,
        ledgerStatus: legalCaseLedger.status,
        businessCategory: applications.businessCategory,
        applicationType: applications.applicationType,
        visaType: applications.visaType,
        applicationStatus: applications.status,
        createdAt: applications.createdAt,
        applicantFamilyJa: applicantMaster.familyNameJa,
        applicantGivenJa: applicantMaster.givenNameJa,
        applicantFamilyEn: applicantMaster.familyNameEn,
        applicantGivenEn: applicantMaster.givenNameEn,
        organizationName: organizationMaster.nameJa,
      })
      .from(applications)
      .leftJoin(legalCaseLedger, and(eq(legalCaseLedger.applicationId, applications.id), eq(legalCaseLedger.tenantId, tenantId)))
      .leftJoin(applicantMaster, eq(applicantMaster.id, applications.applicantId))
      .leftJoin(organizationMaster, eq(organizationMaster.id, applications.organizationId))
      .where(and(eq(applications.tenantId, tenantId), ne(applications.status, "cancelled")))
      .orderBy(desc(legalCaseLedger.acceptedAt), desc(applications.createdAt));

    const mapped: LedgerRow[] = rows.map((r) => {
      const nameJa = [r.applicantFamilyJa, r.applicantGivenJa].filter(Boolean).join(" ").trim();
      const nameEn = [r.applicantFamilyEn, r.applicantGivenEn].filter(Boolean).join(" ").trim();
      const individualName = nameJa || nameEn;
      let clientName = "—";
      let clientType: LedgerRow["clientType"] = "unknown";
      if (r.organizationName) { clientName = r.organizationName; clientType = "corporate"; }
      else if (individualName) { clientName = individualName; clientType = "individual"; }

      return {
        id: r.ledgerId ?? r.applicationId, // 未登録案件は applicationId をキーに使う
        applicationId: r.applicationId,
        caseNumber: r.ledgerCaseNumber ?? r.appCaseNumber ?? null,
        clientName,
        clientType,
        subject: buildSubject({ businessCategory: r.businessCategory, applicationType: r.applicationType, visaType: r.visaType }),
        businessCategory: r.businessCategory,
        acceptedAt: r.acceptedAt ? String(r.acceptedAt).slice(0, 10) : null,
        completedAt: r.completedAt
          ? String(r.completedAt).slice(0, 10)
          : (COMPLETED_STATUSES.has(r.applicationStatus) ? "（案件完了）" : null),
        feeAmount: r.feeAmount ?? null,
        status: r.ledgerStatus ?? (r.ledgerId ? null : "未登録"),
        applicationStatus: r.applicationStatus,
      };
    });

    return { success: true, rows: mapped };
  } catch (err: any) {
    return { success: false, error: err.message ?? "読み込みに失敗しました" };
  }
}

/** 案件の事件簿を取得（無ければ null） */
export async function getLegalLedger(
  applicationId: string
): Promise<{ success: boolean; error?: string; row?: typeof legalCaseLedger.$inferSelect | null }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [row] = await db
      .select()
      .from(legalCaseLedger)
      .where(and(eq(legalCaseLedger.applicationId, applicationId), eq(legalCaseLedger.tenantId, tenantId)))
      .limit(1);

    return { success: true, row: row ?? null };
  } catch (err: any) {
    return { success: false, error: err.message ?? "読み込みに失敗しました" };
  }
}

/**
 * 事件簿を作成または更新（application と 1対1）。依頼者(applicantId/organizationId)は
 * 未指定なら案件から引き継ぐ。案件が完了状態で完結日未設定なら本日を自動反映する。
 */
export async function upsertLegalLedger(
  applicationId: string,
  data: { caseNumber?: string; acceptedAt?: string; completedAt?: string; feeAmount?: number | string | null; status?: string }
): Promise<{ success: boolean; error?: string; row?: typeof legalCaseLedger.$inferSelect }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const app = await assertApplication(applicationId, tenantId);
    if (!app) return { success: false, error: "案件が見つかりません" };

    const feeAmount =
      data.feeAmount === "" || data.feeAmount == null
        ? null
        : (typeof data.feeAmount === "string" ? parseInt(data.feeAmount.replace(/[^\d-]/g, ""), 10) : data.feeAmount);
    const feeVal = Number.isFinite(feeAmount as number) ? (feeAmount as number) : null;

    // 完了状態なら完結日を自動反映（明示指定があればそれを優先）
    const completedAt = data.completedAt?.trim()
      ? data.completedAt.trim()
      : (COMPLETED_STATUSES.has(app.status) ? todayIso() : null);

    const [existing] = await db
      .select()
      .from(legalCaseLedger)
      .where(and(eq(legalCaseLedger.applicationId, applicationId), eq(legalCaseLedger.tenantId, tenantId)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(legalCaseLedger)
        .set({
          caseNumber: data.caseNumber?.trim() || app.caseNumber || null,
          acceptedAt: data.acceptedAt?.trim() || existing.acceptedAt || null,
          completedAt: completedAt || existing.completedAt || null,
          feeAmount: feeVal,
          status: data.status?.trim() || existing.status || null,
          updatedAt: new Date(),
        })
        .where(and(eq(legalCaseLedger.id, existing.id), eq(legalCaseLedger.tenantId, tenantId)))
        .returning();
      revalidatePath("/ledger");
      revalidatePath(`/applications/${applicationId}`);
      return { success: true, row: updated };
    }

    const [inserted] = await db
      .insert(legalCaseLedger)
      .values({
        tenantId,
        applicationId,
        caseNumber: data.caseNumber?.trim() || app.caseNumber || null,
        applicantId: app.applicantId ?? null,
        organizationId: app.organizationId ?? null,
        acceptedAt: data.acceptedAt?.trim() || todayIso(),
        completedAt: completedAt,
        feeAmount: feeVal,
        status: data.status?.trim() || null,
      })
      .returning();

    revalidatePath("/ledger");
    revalidatePath(`/applications/${applicationId}`);
    return { success: true, row: inserted };
  } catch (err: any) {
    return { success: false, error: err.message ?? "保存に失敗しました" };
  }
}

/**
 * 案件ステータス変更時の連動: 完了状態になったら事件簿の完結日を自動セットする。
 * 事件簿が未作成の場合は何もしない（作成は upsertLegalLedger で行う）。
 * applications 側のステータス更新処理から呼び出す想定。
 */
export async function syncLedgerCompletion(applicationId: string, newStatus: string): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) return;
    const tenantId = (session.user as any).tenantId;
    if (!tenantId) return;
    if (!COMPLETED_STATUSES.has(newStatus)) return;

    // 未設定のもののみ完結日をセット（既に完結日があれば尊重）
    await db
      .update(legalCaseLedger)
      .set({ completedAt: todayIso(), updatedAt: new Date() })
      .where(and(
        eq(legalCaseLedger.applicationId, applicationId),
        eq(legalCaseLedger.tenantId, tenantId),
        isNull(legalCaseLedger.completedAt),
      ));
  } catch {
    // 連動失敗は致命的でないため握りつぶす（本処理を妨げない）
  }
}
