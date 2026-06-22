"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizationDocuments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

/**
 * 所属機関マスターの書類を保存する（Upsert）。
 * 同一 (organizationId, visaType, documentName) の組について、既存レコードがあれば
 * 削除して新規挿入する（applicantDocuments の置き換え方式と同じ）。
 * visaType が null の場合は「共通書類」として保存する。
 */
export async function saveOrganizationDocument(data: {
  organizationId: string;
  visaType: string | null;
  documentName: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  if (!data.documentName.trim()) throw new Error("書類名を入力してください");

  await db
    .delete(organizationDocuments)
    .where(
      and(
        eq(organizationDocuments.organizationId, data.organizationId),
        data.visaType === null
          ? isNull(organizationDocuments.visaType)
          : eq(organizationDocuments.visaType, data.visaType),
        eq(organizationDocuments.documentName, data.documentName),
      )
    );

  const [doc] = await db
    .insert(organizationDocuments)
    .values({ tenantId, ...data })
    .returning();

  revalidatePath(`/organizations/${data.organizationId}`);
  return doc;
}

/** 所属機関の全書類を取得する（共通書類＋区分別書類すべて） */
export async function getOrganizationDocuments(organizationId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  return db
    .select()
    .from(organizationDocuments)
    .where(
      and(
        eq(organizationDocuments.organizationId, organizationId),
        eq(organizationDocuments.tenantId, tenantId),
      )
    );
}

/** 所属機関の書類を削除する */
export async function deleteOrganizationDocument(documentId: string, organizationId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("認証が必要です");
  const tenantId = requireTenantId((session.user as any).tenantId);

  await db
    .delete(organizationDocuments)
    .where(
      and(
        eq(organizationDocuments.id, documentId),
        eq(organizationDocuments.tenantId, tenantId),
      )
    );

  revalidatePath(`/organizations/${organizationId}`);
}
