"use server";

/**
 * 必要書類マスター（documentRequirementMaster）の基本設定用アクション
 * ──────────────────────────────────────────────
 * 在留申請の種別（認定証明書/変更/更新/永住・共通）×在留資格の種別ごとに、
 * 書類名・担当（誰が取得/作成するか）・注意事項・原本/写し・並び順・必須区分を管理する。
 *
 * ベースの書類データは入管庁ホームページの必要書類一覧に基づくシード
 * （scripts/seed-document-master.ts ほか）で登録済み。並び順（sortOrder）は
 * 原則として入管ホームページの記載順を反映しており、この画面で調整できる。
 *
 * 削除はソフトデリート（isActive=false）。既存の申請案件チェックリストが
 * マスター行をFK参照しているため物理削除は行わない。
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentRequirementMaster, documentRequirementTemplates } from "@/lib/db/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface DocMasterRow {
  id: string;
  visaType: string;
  applicationType: string;
  documentName: string;
  description: string | null;
  preparedBy: string | null;
  originalOrCopy: string | null;
  isAlwaysRequired: boolean;
  /** 条件付き適用ルール（技人国・更新のチェックリスト等で使用。他の組み合わせでは表示グルーピング用メタデータのことが多い） */
  conditions: Record<string, unknown> | null;
  sortOrder: number;
  isActive: boolean;
}

async function requireExpert(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "認証が必要です" };
  const role = (session.user as any).role;
  if (role !== "expert" && role !== "admin") {
    return { ok: false, error: "必要書類マスターの編集権限がありません" };
  }
  return { ok: true };
}

/** 指定の在留資格×申請種別の書類一覧を取得（無効化済みも含む・並び順昇順） */
export async function listDocumentRequirements(
  visaType: string,
  applicationType: string
): Promise<{ success: boolean; error?: string; rows?: DocMasterRow[] }> {
  const guard = await requireExpert();
  if (!guard.ok) return { success: false, error: guard.error };

  const rows = await db
    .select({
      id: documentRequirementMaster.id,
      visaType: documentRequirementMaster.visaType,
      applicationType: documentRequirementMaster.applicationType,
      documentName: documentRequirementMaster.documentName,
      description: documentRequirementMaster.description,
      preparedBy: documentRequirementMaster.preparedBy,
      originalOrCopy: documentRequirementMaster.originalOrCopy,
      isAlwaysRequired: documentRequirementMaster.isAlwaysRequired,
      conditions: documentRequirementMaster.conditions,
      sortOrder: documentRequirementMaster.sortOrder,
      isActive: documentRequirementMaster.isActive,
    })
    .from(documentRequirementMaster)
    .where(and(
      eq(documentRequirementMaster.visaType, visaType),
      eq(documentRequirementMaster.applicationType, applicationType),
    ))
    .orderBy(asc(documentRequirementMaster.sortOrder), asc(documentRequirementMaster.createdAt));

  return { success: true, rows: rows.map((r) => ({ ...r, conditions: (r.conditions as Record<string, unknown> | null) ?? null })) };
}

/**
 * 有効な書類のみを取得する読み取り専用API（編集権限不要・認証のみ）。
 * 申請案件の必要書類チェックリスト（自動判定タブ）等、閲覧権限を持つ全ロールから使う。
 */
export interface ActiveDocMasterRow {
  id: string;
  documentName: string;
  description: string | null;
  preparedBy: string | null;
  isAlwaysRequired: boolean;
  conditions: Record<string, unknown> | null;
  sortOrder: number;
}

export async function getActiveDocumentRequirements(
  visaType: string,
  applicationType: string
): Promise<{ success: boolean; error?: string; rows?: ActiveDocMasterRow[] }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "認証が必要です" };

  const rows = await db
    .select({
      id: documentRequirementMaster.id,
      documentName: documentRequirementMaster.documentName,
      description: documentRequirementMaster.description,
      preparedBy: documentRequirementMaster.preparedBy,
      isAlwaysRequired: documentRequirementMaster.isAlwaysRequired,
      conditions: documentRequirementMaster.conditions,
      sortOrder: documentRequirementMaster.sortOrder,
    })
    .from(documentRequirementMaster)
    .where(and(
      eq(documentRequirementMaster.visaType, visaType),
      eq(documentRequirementMaster.applicationType, applicationType),
      eq(documentRequirementMaster.isActive, true),
    ))
    .orderBy(asc(documentRequirementMaster.sortOrder), asc(documentRequirementMaster.createdAt));

  return { success: true, rows: rows.map((r) => ({ ...r, conditions: (r.conditions as Record<string, unknown> | null) ?? null })) };
}

/** 書類を新規追加する（並び順は同一グループの末尾＋10） */
export async function createDocumentRequirement(data: {
  visaType: string;
  applicationType: string;
  documentName: string;
  description?: string;
  preparedBy?: string;
  originalOrCopy?: string;
  isAlwaysRequired?: boolean;
  conditions?: Record<string, unknown> | null;
}): Promise<{ success: boolean; error?: string; row?: DocMasterRow }> {
  const guard = await requireExpert();
  if (!guard.ok) return { success: false, error: guard.error };
  if (!data.documentName.trim()) return { success: false, error: "書類名を入力してください" };

  const existing = await db
    .select({ sortOrder: documentRequirementMaster.sortOrder })
    .from(documentRequirementMaster)
    .where(and(
      eq(documentRequirementMaster.visaType, data.visaType),
      eq(documentRequirementMaster.applicationType, data.applicationType),
    ));
  const maxOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);

  const [inserted] = await db
    .insert(documentRequirementMaster)
    .values({
      visaType: data.visaType,
      applicationType: data.applicationType,
      documentName: data.documentName.trim(),
      description: data.description?.trim() || null,
      preparedBy: data.preparedBy?.trim() || null,
      originalOrCopy: data.originalOrCopy?.trim() || null,
      isAlwaysRequired: data.isAlwaysRequired ?? false,
      conditions: data.conditions ?? null,
      sortOrder: maxOrder + 10,
      isActive: true,
    })
    .returning({
      id: documentRequirementMaster.id,
      visaType: documentRequirementMaster.visaType,
      applicationType: documentRequirementMaster.applicationType,
      documentName: documentRequirementMaster.documentName,
      description: documentRequirementMaster.description,
      preparedBy: documentRequirementMaster.preparedBy,
      originalOrCopy: documentRequirementMaster.originalOrCopy,
      isAlwaysRequired: documentRequirementMaster.isAlwaysRequired,
      conditions: documentRequirementMaster.conditions,
      sortOrder: documentRequirementMaster.sortOrder,
      isActive: documentRequirementMaster.isActive,
    });

  revalidatePath("/document-master");
  return { success: true, row: { ...inserted, conditions: (inserted.conditions as Record<string, unknown> | null) ?? null } };
}

/** 書類の内容を更新する */
export async function updateDocumentRequirement(
  id: string,
  data: {
    documentName?: string;
    description?: string;
    preparedBy?: string;
    originalOrCopy?: string;
    isAlwaysRequired?: boolean;
    conditions?: Record<string, unknown> | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const guard = await requireExpert();
  if (!guard.ok) return { success: false, error: guard.error };
  if (data.documentName !== undefined && !data.documentName.trim()) {
    return { success: false, error: "書類名を入力してください" };
  }

  await db
    .update(documentRequirementMaster)
    .set({
      ...(data.documentName !== undefined && { documentName: data.documentName.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() || null }),
      ...(data.preparedBy !== undefined && { preparedBy: data.preparedBy.trim() || null }),
      ...(data.originalOrCopy !== undefined && { originalOrCopy: data.originalOrCopy.trim() || null }),
      ...(data.isAlwaysRequired !== undefined && { isAlwaysRequired: data.isAlwaysRequired }),
      ...(data.conditions !== undefined && { conditions: data.conditions }),
      updatedAt: new Date(),
    })
    .where(eq(documentRequirementMaster.id, id));

  revalidatePath("/document-master");
  return { success: true };
}

/** 書類の有効/無効を切り替える（削除はソフトデリート） */
export async function setDocumentRequirementActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const guard = await requireExpert();
  if (!guard.ok) return { success: false, error: guard.error };

  await db
    .update(documentRequirementMaster)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(documentRequirementMaster.id, id));

  revalidatePath("/document-master");
  return { success: true };
}

/**
 * ドラッグ＆ドロップでの並び替え結果を一括保存する。
 * 渡されたIDの並び順どおりに sortOrder を 10, 20, 30... と振り直す（1クエリで更新）。
 */
export async function reorderDocumentRequirements(
  orderedIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const guard = await requireExpert();
  if (!guard.ok) return { success: false, error: guard.error };
  if (orderedIds.length === 0) return { success: true };

  const cases = sql.join(
    orderedIds.map((id, i) => sql`WHEN ${id}::uuid THEN ${(i + 1) * 10}`),
    sql` `
  );
  const idList = sql.join(orderedIds.map((id) => sql`${id}::uuid`), sql`, `);
  await db.execute(sql`
    UPDATE document_requirement_master
    SET sort_order = CASE id ${cases} END,
        updated_at = now()
    WHERE id IN (${idList})
  `);

  revalidatePath("/document-master");
  return { success: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// 必要書類一覧のテンプレート（名前を付けて保存・呼び出し）
// ─────────────────────────────────────────────────────────────────────────────
// 在留資格×申請種別ごとの書類一式に名前を付けて保存し、後から呼び出して
// マスターへ復元できる。事務所ごとの標準セットを複数持ち分けるために使う。
// ═════════════════════════════════════════════════════════════════════════════

export interface DocTemplateRow {
  id: string;
  name: string;
  visaType: string;
  applicationType: string;
  note: string | null;
  itemCount: number;
  createdAt: string;
}

export interface DocTemplateItem {
  documentName: string;
  description: string | null;
  preparedBy: string | null;
  originalOrCopy: string | null;
  isAlwaysRequired: boolean;
  sortOrder: number;
}

export interface DocTemplateDetail {
  id: string;
  name: string;
  visaType: string;
  applicationType: string;
  note: string | null;
  items: DocTemplateItem[];
}

/** 現在のマスター設定をテンプレートとして名前を付けて保存する */
export async function saveDocumentTemplate(data: {
  name: string;
  visaType: string;
  applicationType: string;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "認証が必要です" };
  const role = (session.user as any).role;
  if (role !== "expert" && role !== "admin") {
    return { success: false, error: "必要書類マスターの編集権限がありません" };
  }
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) return { success: false, error: "テナントIDが不正です" };
  if (!data.name.trim()) return { success: false, error: "テンプレート名を入力してください" };

  // 保存対象は「有効な書類」のみ（無効化した書類はテンプレートに含めない）
  const rows = await db
    .select({
      documentName: documentRequirementMaster.documentName,
      description: documentRequirementMaster.description,
      preparedBy: documentRequirementMaster.preparedBy,
      originalOrCopy: documentRequirementMaster.originalOrCopy,
      isAlwaysRequired: documentRequirementMaster.isAlwaysRequired,
      sortOrder: documentRequirementMaster.sortOrder,
    })
    .from(documentRequirementMaster)
    .where(and(
      eq(documentRequirementMaster.visaType, data.visaType),
      eq(documentRequirementMaster.applicationType, data.applicationType),
      eq(documentRequirementMaster.isActive, true),
    ))
    .orderBy(asc(documentRequirementMaster.sortOrder), asc(documentRequirementMaster.createdAt));

  if (rows.length === 0) {
    return { success: false, error: "保存できる書類がありません（有効な書類が0件です）" };
  }

  await db.insert(documentRequirementTemplates).values({
    tenantId,
    name: data.name.trim(),
    visaType: data.visaType,
    applicationType: data.applicationType,
    note: data.note?.trim() || null,
    items: rows.map((r) => ({
      documentName: r.documentName,
      description: r.description ?? null,
      preparedBy: r.preparedBy ?? null,
      originalOrCopy: r.originalOrCopy ?? null,
      isAlwaysRequired: r.isAlwaysRequired,
      sortOrder: r.sortOrder,
    })),
    createdBy: session.user.id,
  });

  revalidatePath("/document-master");
  return { success: true };
}

/** 指定の在留資格×申請種別に保存されたテンプレート一覧を取得する */
export async function listDocumentTemplates(
  visaType: string,
  applicationType: string
): Promise<{ success: boolean; error?: string; rows?: DocTemplateRow[] }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "認証が必要です" };
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) return { success: false, error: "テナントIDが不正です" };

  const rows = await db
    .select({
      id: documentRequirementTemplates.id,
      name: documentRequirementTemplates.name,
      visaType: documentRequirementTemplates.visaType,
      applicationType: documentRequirementTemplates.applicationType,
      note: documentRequirementTemplates.note,
      items: documentRequirementTemplates.items,
      createdAt: documentRequirementTemplates.createdAt,
    })
    .from(documentRequirementTemplates)
    .where(and(
      eq(documentRequirementTemplates.tenantId, tenantId),
      eq(documentRequirementTemplates.visaType, visaType),
      eq(documentRequirementTemplates.applicationType, applicationType),
    ))
    .orderBy(desc(documentRequirementTemplates.createdAt));

  return {
    success: true,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      visaType: r.visaType,
      applicationType: r.applicationType,
      note: r.note ?? null,
      itemCount: Array.isArray(r.items) ? r.items.length : 0,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
  };
}

/** 指定のテンプレートを編集用に詳細取得する（items含む） */
export async function getDocumentTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string; template?: DocTemplateDetail }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "認証が必要です" };
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) return { success: false, error: "テナントIDが不正です" };

  const [tpl] = await db
    .select()
    .from(documentRequirementTemplates)
    .where(and(
      eq(documentRequirementTemplates.id, templateId),
      eq(documentRequirementTemplates.tenantId, tenantId),
    ))
    .limit(1);
  if (!tpl) return { success: false, error: "テンプレートが見つかりません" };

  const items = Array.isArray(tpl.items) ? tpl.items : [];
  return {
    success: true,
    template: {
      id: tpl.id,
      name: tpl.name,
      visaType: tpl.visaType,
      applicationType: tpl.applicationType,
      note: tpl.note ?? null,
      items: items
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((it) => ({
          documentName: it.documentName,
          description: it.description ?? null,
          preparedBy: it.preparedBy ?? null,
          originalOrCopy: it.originalOrCopy ?? null,
          isAlwaysRequired: it.isAlwaysRequired,
          sortOrder: it.sortOrder,
        })),
    },
  };
}

/**
 * テンプレートの内容（名前・メモ・書類一式）を直接編集して保存する。
 * マスター（documentRequirementMaster）には一切触れず、テンプレートのスナップショットのみを書き換える。
 */
export async function updateDocumentTemplate(
  templateId: string,
  data: {
    name?: string;
    note?: string;
    items?: DocTemplateItem[];
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "認証が必要です" };
  const role = (session.user as any).role;
  if (role !== "expert" && role !== "admin") {
    return { success: false, error: "必要書類マスターの編集権限がありません" };
  }
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) return { success: false, error: "テナントIDが不正です" };
  if (data.name !== undefined && !data.name.trim()) {
    return { success: false, error: "テンプレート名を入力してください" };
  }
  if (data.items !== undefined) {
    if (data.items.length === 0) return { success: false, error: "テンプレートに書類が1件以上必要です" };
    if (data.items.some((it) => !it.documentName.trim())) {
      return { success: false, error: "書類名が未入力の行があります" };
    }
  }

  const [existing] = await db
    .select({ id: documentRequirementTemplates.id })
    .from(documentRequirementTemplates)
    .where(and(
      eq(documentRequirementTemplates.id, templateId),
      eq(documentRequirementTemplates.tenantId, tenantId),
    ))
    .limit(1);
  if (!existing) return { success: false, error: "テンプレートが見つかりません" };

  await db
    .update(documentRequirementTemplates)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.note !== undefined && { note: data.note.trim() || null }),
      ...(data.items !== undefined && {
        items: data.items.map((it, i) => ({
          documentName: it.documentName.trim(),
          description: it.description?.trim() || null,
          preparedBy: it.preparedBy?.trim() || null,
          originalOrCopy: it.originalOrCopy?.trim() || null,
          isAlwaysRequired: it.isAlwaysRequired,
          sortOrder: (i + 1) * 10,
        })),
      }),
      updatedAt: new Date(),
    })
    .where(eq(documentRequirementTemplates.id, templateId));

  revalidatePath("/document-master");
  return { success: true };
}

/**
 * テンプレートをマスターへ適用（復元）する。
 * 既存の同一グループの書類は全て無効化（isActive=false）したうえで、
 * テンプレートの内容を新規行として登録する。
 * ※ 既存の申請案件チェックリストは各行をFK参照しているため物理削除はしない。
 */
export async function applyDocumentTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "認証が必要です" };
  const role = (session.user as any).role;
  if (role !== "expert" && role !== "admin") {
    return { success: false, error: "必要書類マスターの編集権限がありません" };
  }
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) return { success: false, error: "テナントIDが不正です" };

  const [tpl] = await db
    .select()
    .from(documentRequirementTemplates)
    .where(and(
      eq(documentRequirementTemplates.id, templateId),
      eq(documentRequirementTemplates.tenantId, tenantId),
    ))
    .limit(1);
  if (!tpl) return { success: false, error: "テンプレートが見つかりません" };

  const items = Array.isArray(tpl.items) ? tpl.items : [];
  if (items.length === 0) return { success: false, error: "テンプレートに書類が含まれていません" };

  // 既存の書類を無効化（後から個別に「復元」も可能）
  await db
    .update(documentRequirementMaster)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(
      eq(documentRequirementMaster.visaType, tpl.visaType),
      eq(documentRequirementMaster.applicationType, tpl.applicationType),
      eq(documentRequirementMaster.isActive, true),
    ));

  await db.insert(documentRequirementMaster).values(
    items.map((it) => ({
      visaType: tpl.visaType,
      applicationType: tpl.applicationType,
      documentName: it.documentName,
      description: it.description ?? null,
      preparedBy: it.preparedBy ?? null,
      originalOrCopy: it.originalOrCopy ?? null,
      isAlwaysRequired: it.isAlwaysRequired,
      sortOrder: it.sortOrder,
      isActive: true,
    }))
  );

  revalidatePath("/document-master");
  return { success: true, count: items.length };
}

/** テンプレートを削除する */
export async function deleteDocumentTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: "認証が必要です" };
  const role = (session.user as any).role;
  if (role !== "expert" && role !== "admin") {
    return { success: false, error: "必要書類マスターの編集権限がありません" };
  }
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) return { success: false, error: "テナントIDが不正です" };

  await db
    .delete(documentRequirementTemplates)
    .where(and(
      eq(documentRequirementTemplates.id, templateId),
      eq(documentRequirementTemplates.tenantId, tenantId),
    ));

  revalidatePath("/document-master");
  return { success: true };
}
