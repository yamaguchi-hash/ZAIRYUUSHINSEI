"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applicantMaster, auditLog } from "@/lib/db/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

export async function getApplicants(search?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const query = db
    .select()
    .from(applicantMaster)
    .where(
      and(
        eq(applicantMaster.tenantId, tenantId),
        eq(applicantMaster.isActive, true),
        search
          ? or(
              ilike(applicantMaster.familyNameEn, `%${search}%`),
              ilike(applicantMaster.givenNameEn, `%${search}%`),
              ilike(applicantMaster.nationality, `%${search}%`)
            )
          : undefined
      )
    );

  return query;
}

export async function getApplicantById(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const [applicant] = await db
    .select()
    .from(applicantMaster)
    .where(and(eq(applicantMaster.id, id), eq(applicantMaster.tenantId, tenantId)))
    .limit(1);

  if (!applicant) throw new Error("申請人が見つかりません");
  return applicant;
}

export async function createApplicant(data: {
  familyNameEn: string;
  givenNameEn: string;
  familyNameJa?: string;
  givenNameJa?: string;
  gender?: string;
  dateOfBirth?: string;
  nationality: string;
  passportNumber?: string;
  passportExpiry?: string;
  residenceCardNumber?: string;
  phone?: string;
  emailAddress?: string;
  postalCode?: string;
  japanAddress?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const [newApplicant] = await db
    .insert(applicantMaster)
    .values({
      tenantId,
      ...data,
      dateOfBirth: data.dateOfBirth || null,
      passportExpiry: data.passportExpiry || null,
    })
    .returning();

  await db.insert(auditLog).values({
    tenantId,
    userId: session.user.id,
    action: "create",
    entityType: "applicant",
    entityId: newApplicant.id,
  });

  revalidatePath("/applicants");
  return newApplicant;
}

export async function updateApplicant(
  id: string,
  data: Partial<{
    familyNameEn: string;
    givenNameEn: string;
    familyNameJa: string;
    givenNameJa: string;
    gender: string;
    dateOfBirth: string;
    nationality: string;
    passportNumber: string;
    passportExpiry: string;
    residenceCardNumber: string;
    phone: string;
    emailAddress: string;
    postalCode: string;
    japanAddress: string;
    educationHistory: any;
    workHistory: any;
  }>
) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  await db
    .update(applicantMaster)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(applicantMaster.id, id), eq(applicantMaster.tenantId, tenantId)));

  await db.insert(auditLog).values({
    tenantId,
    userId: session.user.id,
    action: "update",
    entityType: "applicant",
    entityId: id,
    newValue: JSON.stringify(data),
  });

  revalidatePath("/applicants");
  revalidatePath(`/applicants/${id}`);
}

export async function deleteApplicant(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    await db
      .update(applicantMaster)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(applicantMaster.id, id), eq(applicantMaster.tenantId, tenantId)));

    await db.insert(auditLog).values({
      tenantId,
      userId: session.user.id,
      action: "delete",
      entityType: "applicant",
      entityId: id,
    });

    revalidatePath("/applicants");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "削除に失敗しました" };
  }
}
