"use server";

/**
 * 打合せ・相談履歴（consultationLogs）
 * 面談/電話/メール/LINE 等の応対記録を、案件(applications)ごとに時系列で管理する。
 * すべて auth() 認証と tenantId によるテナント隔離を必須とする。
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, consultationLogs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface ConsultationLogRow {
  id: string;
  type: string;
  summary: string | null;
  details: string | null;
  createdById: string | null;
  createdAt: string;
}

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

/** 案件が自テナントのものであることを確認する */
async function assertApplication(applicationId: string, tenantId: string): Promise<boolean> {
  const [a] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
    .limit(1);
  return !!a;
}

function toRow(r: typeof consultationLogs.$inferSelect): ConsultationLogRow {
  return {
    id: r.id,
    type: r.type,
    summary: r.summary ?? null,
    details: r.details ?? null,
    createdById: r.createdById ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

/** 案件の打合せ記録一覧（新しい順） */
export async function listConsultationLogs(
  applicationId: string
): Promise<{ success: boolean; error?: string; rows?: ConsultationLogRow[] }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);
    if (!(await assertApplication(applicationId, tenantId))) return { success: false, error: "案件が見つかりません" };

    const rows = await db
      .select()
      .from(consultationLogs)
      .where(and(eq(consultationLogs.applicationId, applicationId), eq(consultationLogs.tenantId, tenantId)))
      .orderBy(desc(consultationLogs.createdAt));

    return { success: true, rows: rows.map(toRow) };
  } catch (err: any) {
    return { success: false, error: err.message ?? "読み込みに失敗しました" };
  }
}

/** 打合せ記録を追加する */
export async function addConsultationLog(
  applicationId: string,
  data: { type: string; summary?: string; details?: string }
): Promise<{ success: boolean; error?: string; row?: ConsultationLogRow }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);
    if (!(await assertApplication(applicationId, tenantId))) return { success: false, error: "案件が見つかりません" };
    if (!data.type?.trim()) return { success: false, error: "種別を選択してください" };

    const [inserted] = await db
      .insert(consultationLogs)
      .values({
        tenantId,
        applicationId,
        type: data.type.trim(),
        summary: data.summary?.trim() || null,
        details: data.details?.trim() || null,
        createdById: session.user.id,
      })
      .returning();

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, row: toRow(inserted) };
  } catch (err: any) {
    return { success: false, error: err.message ?? "追加に失敗しました" };
  }
}

/** 打合せ記録を更新する */
export async function updateConsultationLog(
  applicationId: string,
  logId: string,
  data: { type: string; summary?: string; details?: string }
): Promise<{ success: boolean; error?: string; row?: ConsultationLogRow }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);
    if (!data.type?.trim()) return { success: false, error: "種別を選択してください" };

    const [updated] = await db
      .update(consultationLogs)
      .set({
        type: data.type.trim(),
        summary: data.summary?.trim() || null,
        details: data.details?.trim() || null,
      })
      .where(and(
        eq(consultationLogs.id, logId),
        eq(consultationLogs.applicationId, applicationId),
        eq(consultationLogs.tenantId, tenantId),
      ))
      .returning();

    if (!updated) return { success: false, error: "記録が見つかりません" };
    revalidatePath(`/applications/${applicationId}`);
    return { success: true, row: toRow(updated) };
  } catch (err: any) {
    return { success: false, error: err.message ?? "更新に失敗しました" };
  }
}

/** 打合せ記録を削除する */
export async function deleteConsultationLog(
  applicationId: string,
  logId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    await db
      .delete(consultationLogs)
      .where(and(
        eq(consultationLogs.id, logId),
        eq(consultationLogs.applicationId, applicationId),
        eq(consultationLogs.tenantId, tenantId),
      ));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "削除に失敗しました" };
  }
}
