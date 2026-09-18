"use server";

/**
 * 申請案件チェックリストの名前付き保存（案件セット）
 * ──────────────────────────────────────────────
 * 必要書類マスターのテンプレート（src/actions/document-master.ts の
 * saveDocumentTemplate 等）とは別機能。実際の申請案件で作り込んだ
 * チェックリスト（書類名・担当・注意事項・原本/写し・並び順）を丸ごと
 * 名前を付けて保存し、別の申請案件へ呼び出して反映するために使う。
 *
 * 必要書類マスター（documentRequirementMaster）へは一切書き戻さない。
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  applications,
  applicationDocumentChecklist,
  applicationChecklistTemplates,
  documentRequirementMaster,
} from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface ChecklistTemplateRow {
  id: string;
  name: string;
  note: string | null;
  visaType: string | null;
  applicationType: string | null;
  itemCount: number;
  createdAt: string;
}

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

/** 現在の申請案件のチェックリストを、名前を付けて保存する */
export async function saveChecklistAsTemplate(data: {
  applicationId: string;
  name: string;
  note?: string;
}): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);
    if (!data.name.trim()) return { success: false, error: "保存名を入力してください" };

    const [app] = await db
      .select({
        id: applications.id,
        visaType: applications.visaType,
        applicationType: applications.applicationType,
      })
      .from(applications)
      .where(and(eq(applications.id, data.applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    // チェックリストを取得（マスター結合で注意事項・原本/写し・並び順を補完）
    const rows = await db
      .select({
        documentName: applicationDocumentChecklist.documentName,
        preparedBy: applicationDocumentChecklist.preparedBy,
        descriptionOverride: applicationDocumentChecklist.descriptionOverride,
        documentRequirementId: applicationDocumentChecklist.documentRequirementId,
        createdAt: applicationDocumentChecklist.createdAt,
        masterDescription: documentRequirementMaster.description,
        masterOriginalOrCopy: documentRequirementMaster.originalOrCopy,
        masterSortOrder: documentRequirementMaster.sortOrder,
      })
      .from(applicationDocumentChecklist)
      .leftJoin(
        documentRequirementMaster,
        eq(applicationDocumentChecklist.documentRequirementId, documentRequirementMaster.id)
      )
      .where(eq(applicationDocumentChecklist.applicationId, data.applicationId));

    if (rows.length === 0) {
      return { success: false, error: "保存できる書類がありません（チェックリストが空です）" };
    }

    // 画面・PDFと同じ並び（マスターのsort_order → 追加順）で保存する
    const sorted = [...rows].sort((a, b) => {
      const sa = a.masterSortOrder ?? 9999;
      const sb = b.masterSortOrder ?? 9999;
      if (sa !== sb) return sa - sb;
      const ca = a.createdAt ? String(a.createdAt) : "";
      const cb = b.createdAt ? String(b.createdAt) : "";
      return ca.localeCompare(cb);
    });

    await db.insert(applicationChecklistTemplates).values({
      tenantId,
      name: data.name.trim(),
      visaType: String(app.visaType),
      applicationType: String(app.applicationType),
      note: data.note?.trim() || null,
      items: sorted.map((r, i) => ({
        documentName: r.documentName,
        // 注意事項は案件別の上書きを優先した実効値を保存する
        description: r.descriptionOverride ?? r.masterDescription ?? null,
        preparedBy: r.preparedBy ?? null,
        originalOrCopy: r.masterOriginalOrCopy ?? null,
        sortOrder: (i + 1) * 10,
      })),
      sourceApplicationId: data.applicationId,
      createdBy: session.user.id,
    });

    revalidatePath(`/applications/${data.applicationId}`);
    return { success: true, count: sorted.length };
  } catch (err: any) {
    return { success: false, error: err.message ?? "保存に失敗しました" };
  }
}

/** テナント内に保存済みの案件チェックリスト一覧を取得する（新しい順） */
export async function listChecklistTemplates(): Promise<{
  success: boolean; error?: string; rows?: ChecklistTemplateRow[];
}> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const rows = await db
      .select()
      .from(applicationChecklistTemplates)
      .where(eq(applicationChecklistTemplates.tenantId, tenantId))
      .orderBy(desc(applicationChecklistTemplates.createdAt));

    return {
      success: true,
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        note: r.note ?? null,
        visaType: r.visaType ?? null,
        applicationType: r.applicationType ?? null,
        itemCount: Array.isArray(r.items) ? r.items.length : 0,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message ?? "読み込みに失敗しました" };
  }
}

/**
 * 保存済みの案件チェックリストを、指定の申請案件へ呼び出して反映する。
 * 既にチェックリストに同名の書類がある場合はスキップし、不足分だけを追加する。
 */
export async function applyChecklistTemplate(
  applicationId: string,
  templateId: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select({
        id: applications.id,
        visaType: applications.visaType,
        applicationType: applications.applicationType,
      })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    const [tpl] = await db
      .select()
      .from(applicationChecklistTemplates)
      .where(and(
        eq(applicationChecklistTemplates.id, templateId),
        eq(applicationChecklistTemplates.tenantId, tenantId),
      ))
      .limit(1);
    if (!tpl) return { success: false, error: "保存データが見つかりません" };

    const items = Array.isArray(tpl.items) ? tpl.items : [];
    if (items.length === 0) return { success: false, error: "保存データに書類が含まれていません" };

    const existing = await db
      .select({ documentName: applicationDocumentChecklist.documentName })
      .from(applicationDocumentChecklist)
      .where(eq(applicationDocumentChecklist.applicationId, applicationId));
    const existingNames = new Set(existing.map((e) => e.documentName));

    const newItems = items.filter((it) => !existingNames.has(it.documentName));
    if (newItems.length === 0) return { success: true, count: 0 };

    // 反映先の案件の在留資格・申請種別のマスターと書類名で突き合わせ、
    // 一致すればdocumentRequirementIdを紐付ける（並び順・原本/写しバッジの連動用）
    const masters = await db
      .select({
        id: documentRequirementMaster.id,
        documentName: documentRequirementMaster.documentName,
        sortOrder: documentRequirementMaster.sortOrder,
      })
      .from(documentRequirementMaster)
      .where(and(
        eq(documentRequirementMaster.isActive, true),
        inArray(documentRequirementMaster.visaType, ["common", String(app.visaType)]),
        inArray(documentRequirementMaster.applicationType, ["all", String(app.applicationType)]),
      ));
    const masterByName = new Map(masters.map((m) => [m.documentName, m]));

    // マスターの現在の並び順で挿入し、反映後の並びが崩れないようにする
    const sortedNewItems = [...newItems].sort((a, b) => {
      const sa = masterByName.get(a.documentName)?.sortOrder ?? a.sortOrder ?? 9999;
      const sb = masterByName.get(b.documentName)?.sortOrder ?? b.sortOrder ?? 9999;
      return sa - sb;
    });

    await db.insert(applicationDocumentChecklist).values(
      sortedNewItems.map((it) => ({
        applicationId,
        documentRequirementId: masterByName.get(it.documentName)?.id ?? null,
        documentName: it.documentName,
        isRequiredByExpert: true,
        status: "not_submitted" as const,
        preparedBy: it.preparedBy ?? null,
        // 保存時の注意事項は案件別の上書きとして復元する（マスターには影響しない）
        descriptionOverride: it.description ?? null,
      }))
    );

    revalidatePath(`/applications/${applicationId}`);
    return { success: true, count: sortedNewItems.length };
  } catch (err: any) {
    return { success: false, error: err.message ?? "呼び出しに失敗しました" };
  }
}

/** 保存済みの案件チェックリストを削除する */
export async function deleteChecklistTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    await db
      .delete(applicationChecklistTemplates)
      .where(and(
        eq(applicationChecklistTemplates.id, templateId),
        eq(applicationChecklistTemplates.tenantId, tenantId),
      ));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "削除に失敗しました" };
  }
}
