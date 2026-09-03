"use server";

/**
 * 郵送・発送記録（dispatchRecords）
 * レターパック/書留等の発送記録を案件(applications)ごとに管理する。
 * すべて auth() 認証と tenantId によるテナント隔離を必須とする。
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, dispatchRecords } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface DispatchRecordRow {
  id: string;
  dispatchDate: string | null;
  destination: string | null;
  method: string | null;
  trackingNumber: string | null;
  contents: string | null;
  createdById: string | null;
  createdAt: string;
}

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

async function assertApplication(applicationId: string, tenantId: string): Promise<boolean> {
  const [a] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
    .limit(1);
  return !!a;
}

function toRow(r: typeof dispatchRecords.$inferSelect): DispatchRecordRow {
  return {
    id: r.id,
    dispatchDate: r.dispatchDate ? String(r.dispatchDate).slice(0, 10) : null,
    destination: r.destination ?? null,
    method: r.method ?? null,
    trackingNumber: r.trackingNumber ?? null,
    contents: r.contents ?? null,
    createdById: r.createdById ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

/** 案件の郵送記録一覧（発送日の新しい順→作成の新しい順） */
export async function listDispatchRecords(
  applicationId: string
): Promise<{ success: boolean; error?: string; rows?: DispatchRecordRow[] }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);
    if (!(await assertApplication(applicationId, tenantId))) return { success: false, error: "案件が見つかりません" };

    const rows = await db
      .select()
      .from(dispatchRecords)
      .where(and(eq(dispatchRecords.applicationId, applicationId), eq(dispatchRecords.tenantId, tenantId)))
      .orderBy(desc(dispatchRecords.dispatchDate), desc(dispatchRecords.createdAt));

    return { success: true, rows: rows.map(toRow) };
  } catch (err: any) {
    return { success: false, error: err.message ?? "読み込みに失敗しました" };
  }
}

/** 郵送記録を追加する */
export async function addDispatchRecord(
  applicationId: string,
  data: { dispatchDate?: string; destination?: string; method?: string; trackingNumber?: string; contents?: string }
): Promise<{ success: boolean; error?: string; row?: DispatchRecordRow }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);
    if (!(await assertApplication(applicationId, tenantId))) return { success: false, error: "案件が見つかりません" };

    const [inserted] = await db
      .insert(dispatchRecords)
      .values({
        tenantId,
        applicationId,
        dispatchDate: data.dispatchDate?.trim() || null,
        destination: data.destination?.trim() || null,
        method: data.method?.trim() || null,
        trackingNumber: data.trackingNumber?.trim() || null,
        contents: data.contents?.trim() || null,
        createdById: session.user.id,
      })
      .returning();

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, row: toRow(inserted) };
  } catch (err: any) {
    return { success: false, error: err.message ?? "追加に失敗しました" };
  }
}

/** 郵送記録を更新する */
export async function updateDispatchRecord(
  applicationId: string,
  recordId: string,
  data: { dispatchDate?: string; destination?: string; method?: string; trackingNumber?: string; contents?: string }
): Promise<{ success: boolean; error?: string; row?: DispatchRecordRow }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [updated] = await db
      .update(dispatchRecords)
      .set({
        dispatchDate: data.dispatchDate?.trim() || null,
        destination: data.destination?.trim() || null,
        method: data.method?.trim() || null,
        trackingNumber: data.trackingNumber?.trim() || null,
        contents: data.contents?.trim() || null,
      })
      .where(and(
        eq(dispatchRecords.id, recordId),
        eq(dispatchRecords.applicationId, applicationId),
        eq(dispatchRecords.tenantId, tenantId),
      ))
      .returning();

    if (!updated) return { success: false, error: "記録が見つかりません" };
    revalidatePath(`/applications/${applicationId}`);
    return { success: true, row: toRow(updated) };
  } catch (err: any) {
    return { success: false, error: err.message ?? "更新に失敗しました" };
  }
}

/** 郵送記録を削除する */
export async function deleteDispatchRecord(
  applicationId: string,
  recordId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    await db
      .delete(dispatchRecords)
      .where(and(
        eq(dispatchRecords.id, recordId),
        eq(dispatchRecords.applicationId, applicationId),
        eq(dispatchRecords.tenantId, tenantId),
      ));

    revalidatePath(`/applications/${applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "削除に失敗しました" };
  }
}
