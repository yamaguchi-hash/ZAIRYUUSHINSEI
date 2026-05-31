"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationMaster, auditLog } from "@/lib/db/schema";
import { eq, and, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getOrganizationById(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const [org] = await db
    .select()
    .from(organizationMaster)
    .where(and(eq(organizationMaster.id, id), eq(organizationMaster.tenantId, tenantId)))
    .limit(1);
  return org ?? null;
}

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

export async function getOrganizations(search?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  return db
    .select()
    .from(organizationMaster)
    .where(
      and(
        eq(organizationMaster.tenantId, tenantId),
        eq(organizationMaster.isActive, true),
        search ? ilike(organizationMaster.nameJa, `%${search}%`) : undefined
      )
    );
}

export async function createOrganization(data: {
  corporateNumber?: string;
  nameJa: string;
  nameEn?: string;
  postalCode?: string;
  prefecture?: string;
  city?: string;
  addressLine?: string;
  phone?: string;
  capital?: number;
  annualSales?: number;
  employeeCount?: number;
  fiscalYearEnd?: string;
  category?: string;
  industry?: string;
  workersAccidentInsuranceNo?: string;
  employmentInsuranceNo?: string;
  representativeTitle?: string;
  representativeName?: string;
  email?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  const [org] = await db
    .insert(organizationMaster)
    .values({ tenantId, ...data })
    .returning();

  await db.insert(auditLog).values({
    tenantId,
    userId: session.user.id,
    action: "create",
    entityType: "organization",
    entityId: org.id,
  });

  revalidatePath("/organizations");
  return org;
}

export async function updateOrganization(
  id: string,
  data: Partial<{
    nameJa: string;
    nameEn: string;
    postalCode: string;
    prefecture: string;
    city: string;
    addressLine: string;
    phone: string;
    capital: number;
    annualSales: number;
    employeeCount: number;
    fiscalYearEnd: string;
    category: string;
    industry: string;
    workersAccidentInsuranceNo: string;
    employmentInsuranceNo: string;
    representativeTitle: string;
    representativeName: string;
    email: string;
  }>
) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  await db
    .update(organizationMaster)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(organizationMaster.id, id), eq(organizationMaster.tenantId, tenantId)));

  await db.insert(auditLog).values({
    tenantId,
    userId: session.user.id,
    action: "update",
    entityType: "organization",
    entityId: id,
    newValue: JSON.stringify(data),
  });

  revalidatePath("/organizations");
}

export async function deleteOrganization(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  // ソフトデリート（isActive = false）
  await db
    .update(organizationMaster)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(organizationMaster.id, id), eq(organizationMaster.tenantId, tenantId)));

  await db.insert(auditLog).values({
    tenantId,
    userId: session.user.id,
    action: "delete",
    entityType: "organization",
    entityId: id,
  });

  revalidatePath("/organizations");
}
