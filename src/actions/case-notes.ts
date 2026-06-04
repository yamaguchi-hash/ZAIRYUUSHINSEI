"use server";

import { auth } from "@/lib/auth";
import { db, caseNotes, caseExpenses, caseRemarks, caseInformation, applications } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════
// 業務履歴（Case Notes）
// ═══════════════════════════════════════════════════════════════════════════

export async function getCaseNotes(applicationId: string) {
  try {
    console.log("[getCaseNotes] Starting for applicationId:", applicationId);

    const session = await auth();
    console.log("[getCaseNotes] Session:", session?.user?.email);
    if (!session?.user) throw new Error("認証が必要です");

    const tenantId = (session.user as any)?.tenantId;
    console.log("[getCaseNotes] TenantId:", tenantId);
    if (!tenantId) throw new Error("テナントIDが不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    console.log("[getCaseNotes] Application found:", !!app);
    if (!app) throw new Error("申請案件が見つかりません");

    try {
      const notes = await db
        .select()
        .from(caseNotes)
        .where(eq(caseNotes.applicationId, applicationId))
        .orderBy(caseNotes.entryDate);

      console.log("[getCaseNotes] Notes retrieved:", notes.length);
      return notes;
    } catch (dbErr: any) {
      // テーブルが存在しない場合の処理
      if (dbErr.message?.includes("does not exist") || dbErr.code === "42P01") {
        console.warn("[getCaseNotes] case_notes table does not exist yet, returning empty array");
        return [];
      }
      console.warn("[getCaseNotes] Database error, returning empty array:", dbErr.message);
      return [];
    }
  } catch (err: any) {
    console.error("[getCaseNotes] Error:", {
      message: err.message,
      code: err.code,
      details: err.detail,
    });
    // エラーをスローせず、空配列を返す（フォールバック）
    console.warn("[getCaseNotes] Returning empty array due to error");
    return [];
  }
}

export async function addCaseNote(applicationId: string, data: {
  entryDate: string;
  entryTime?: string;
  content: string;
  name?: string;
  assignee?: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    const result = await db
      .insert(caseNotes)
      .values({
        applicationId,
        tenantId,
        entryDate: data.entryDate,
        entryTime: data.entryTime || null,
        content: data.content,
        name: data.name || null,
        assignee: data.assignee || null,
        createdBy: userId,
      })
      .returning();
    return result[0];
  } catch (err: any) {
    console.error("Add case note error:", err.message);
    return null;
  }
}

export async function updateCaseNote(
  applicationId: string,
  caseNoteId: string,
  data: {
    entryDate: string;
    entryTime?: string;
    content: string;
    name?: string;
    assignee?: string;
  }
) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    const [note] = await db
      .select()
      .from(caseNotes)
      .where(and(eq(caseNotes.id, caseNoteId), eq(caseNotes.applicationId, applicationId)))
      .limit(1);
    if (!note) throw new Error("事件メモが見つかりません");

    const result = await db
      .update(caseNotes)
      .set({
        entryDate: data.entryDate,
        entryTime: data.entryTime || null,
        content: data.content,
        name: data.name || null,
        assignee: data.assignee || null,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(caseNotes.id, caseNoteId))
      .returning();
    return result[0];
  } catch (err: any) {
    console.error("Update case note error:", err.message);
    return null;
  }
}

export async function deleteCaseNote(applicationId: string, caseNoteId: string) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    const [note] = await db
      .select()
      .from(caseNotes)
      .where(and(eq(caseNotes.id, caseNoteId), eq(caseNotes.applicationId, applicationId)))
      .limit(1);
    if (!note) throw new Error("事件メモが見つかりません");

    await db.delete(caseNotes).where(eq(caseNotes.id, caseNoteId));
    return true;
  } catch (err: any) {
    console.error("Delete case note error:", err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 経費明細（Case Expenses）
// ═══════════════════════════════════════════════════════════════════════════

export async function getCaseExpenses(applicationId: string) {
  try {
    console.log("[getCaseExpenses] Starting for applicationId:", applicationId);

    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) throw new Error("テナントIDが不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    try {
      const expenses = await db
        .select()
        .from(caseExpenses)
        .where(eq(caseExpenses.applicationId, applicationId))
        .orderBy(caseExpenses.expenseDate);

      console.log("[getCaseExpenses] Expenses retrieved:", expenses.length);
      return expenses;
    } catch (dbErr: any) {
      if (dbErr.message?.includes("does not exist") || dbErr.code === "42P01") {
        console.warn("[getCaseExpenses] case_expenses table does not exist yet, returning empty array");
        return [];
      }
      return null;
    }
  } catch (err: any) {
    console.error("[getCaseExpenses] Error:", err.message);
    console.warn("[getCaseExpenses] Returning empty array due to error");
    return [];
  }
}

export async function addCaseExpense(applicationId: string, data: {
  expenseDate: string;
  item1?: string;
  item2?: string;
  amount?: number;
  remarks?: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    const result = await db
      .insert(caseExpenses)
      .values({
        applicationId,
        tenantId,
        expenseDate: data.expenseDate,
        item1: data.item1 || null,
        item2: data.item2 || null,
        amount: data.amount || null,
        remarks: data.remarks || null,
        createdBy: userId,
      })
      .returning();
    return result[0];
  } catch (err: any) {
    console.error("Add case expense error:", err.message);
    return null;
  }
}

export async function updateCaseExpense(
  applicationId: string,
  expenseId: string,
  data: {
    expenseDate: string;
    item1?: string;
    item2?: string;
    amount?: number;
    remarks?: string;
  }
) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    const result = await db
      .update(caseExpenses)
      .set({
        expenseDate: data.expenseDate,
        item1: data.item1 || null,
        item2: data.item2 || null,
        amount: data.amount || null,
        remarks: data.remarks || null,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(caseExpenses.id, expenseId), eq(caseExpenses.applicationId, applicationId)))
      .returning();
    return result[0];
  } catch (err: any) {
    console.error("Update case expense error:", err.message);
    return null;
  }
}

export async function deleteCaseExpense(applicationId: string, expenseId: string) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    await db
      .delete(caseExpenses)
      .where(and(eq(caseExpenses.id, expenseId), eq(caseExpenses.applicationId, applicationId)));
    return true;
  } catch (err: any) {
    console.error("Delete case expense error:", err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 備考・見積額情報（Case Information）
// ═══════════════════════════════════════════════════════════════════════════

export async function getCaseInformation(applicationId: string) {
  try {
    console.log("[getCaseInformation] Starting for applicationId:", applicationId);

    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) throw new Error("テナントIDが不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    try {
      console.log("[getCaseInformation] Querying case information...");
      const [info] = await db
        .select()
        .from(caseInformation)
        .where(eq(caseInformation.applicationId, applicationId));

      console.log("[getCaseInformation] Result:", !!info);
      if (!info) return null;
      // Date オブジェクトを ISO 文字列に変換
      return {
        ...info,
        createdAt: info.createdAt instanceof Date ? info.createdAt.toISOString() : info.createdAt,
        updatedAt: info.updatedAt instanceof Date ? info.updatedAt.toISOString() : info.updatedAt,
      };
    } catch (dbErr: any) {
      if (dbErr.message?.includes("does not exist") || dbErr.code === "42P01") {
        console.warn("[getCaseInformation] case_information table does not exist yet, returning null");
        return null;
      }
      console.warn("[getCaseInformation] Database error:", dbErr.message);
      return null;
    }
  } catch (err: any) {
    console.error("[getCaseInformation] Error:", {
      message: err.message,
      code: err.code,
    });
    console.warn("[getCaseInformation] Returning null due to error");
    return null;
  }
}

export async function updateCaseInformation(
  applicationId: string,
  data: {
    estimatedAmount?: number;
    actualAmount?: number;
    taxRate?: number;
  }
) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    try {
      const [existing] = await db
        .select()
        .from(caseInformation)
        .where(eq(caseInformation.applicationId, applicationId));

      if (existing) {
        const result = await db
          .update(caseInformation)
          .set({
            estimatedAmount: data.estimatedAmount || null,
            actualAmount: data.actualAmount || null,
            taxRate: data.taxRate !== undefined ? data.taxRate : existing.taxRate,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(caseInformation.applicationId, applicationId))
          .returning();
        const info = result[0];
        if (!info) return null;
        // Date オブジェクトを ISO 文字列に変換
        return {
          ...info,
          createdAt: info.createdAt instanceof Date ? info.createdAt.toISOString() : info.createdAt,
          updatedAt: info.updatedAt instanceof Date ? info.updatedAt.toISOString() : info.updatedAt,
        };
      } else {
        const result = await db
          .insert(caseInformation)
          .values({
            applicationId,
            tenantId,
            estimatedAmount: data.estimatedAmount || null,
            actualAmount: data.actualAmount || null,
            taxRate: data.taxRate || 0.1,
            createdBy: userId,
          })
          .returning();
        const info = result[0];
        if (!info) return null;
        // Date オブジェクトを ISO 文字列に変換
        return {
          ...info,
          createdAt: info.createdAt instanceof Date ? info.createdAt.toISOString() : info.createdAt,
          updatedAt: info.updatedAt instanceof Date ? info.updatedAt.toISOString() : info.updatedAt,
        };
      }
    } catch (dbErr: any) {
      // テーブルが存在しない場合の処理
      if (dbErr.message?.includes("does not exist") || dbErr.code === "42P01") {
        console.warn("[updateCaseInformation] case_information table does not exist yet, returning null");
        return null;
      }
      return null;
    }
  } catch (err: any) {
    console.error("[updateCaseInformation] Error:", {
      message: err.message,
      code: err.code,
      details: err.detail,
    });
    // エラーを throw しないで null を返す（graceful fallback）
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 備考（Case Remarks）
// ═══════════════════════════════════════════════════════════════════════════

export async function getCaseRemarks(applicationId: string) {
  try {
    console.log("[getCaseRemarks] Starting for applicationId:", applicationId);

    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) throw new Error("テナントIDが不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    try {
      const remarks = await db
        .select()
        .from(caseRemarks)
        .where(eq(caseRemarks.applicationId, applicationId))
        .orderBy(desc(caseRemarks.createdAt));

      console.log("[getCaseRemarks] Remarks retrieved:", remarks.length);
      // Date オブジェクトを ISO 文字列に変換
      return remarks.map(r => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      }));
    } catch (dbErr: any) {
      if (dbErr.message?.includes("does not exist") || dbErr.code === "42P01") {
        console.warn("[getCaseRemarks] case_remarks table does not exist yet, returning empty array");
        return [];
      }
      console.warn("[getCaseRemarks] Database error, returning empty array:", dbErr.message);
      return [];
    }
  } catch (err: any) {
    console.error("[getCaseRemarks] Error:", err.message);
    return [];
  }
}

export async function addCaseRemark(applicationId: string, content: string) {
  try {
    console.log("[addCaseRemark] Starting for applicationId:", applicationId);

    if (!content.trim()) throw new Error("備考内容が入力されていません");

    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    try {
      const result = await db
        .insert(caseRemarks)
        .values({
          applicationId,
          tenantId,
          content: content.trim(),
          createdBy: userId,
        })
        .returning();

      console.log("[addCaseRemark] Remark added successfully");
      const remark = result[0];
      if (!remark) return null;
      // Date オブジェクトを ISO 文字列に変換
      return {
        ...remark,
        createdAt: remark.createdAt instanceof Date ? remark.createdAt.toISOString() : remark.createdAt,
        updatedAt: remark.updatedAt instanceof Date ? remark.updatedAt.toISOString() : remark.updatedAt,
      };
    } catch (dbErr: any) {
      if (dbErr.code === "42P01") {
        console.warn("[addCaseRemark] case_remarks table does not exist yet");
        return null;
      }
      console.warn("[addCaseRemark] Database error:", dbErr.message);
      return null;
    }
  } catch (err: any) {
    console.error("[addCaseRemark] Error:", err.message);
    return null;
  }
}

export async function updateCaseRemark(applicationId: string, remarkId: string, content: string) {
  try {
    console.log("[updateCaseRemark] Starting for remarkId:", remarkId);

    if (!content.trim()) throw new Error("備考内容が入力されていません");

    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    const [existingRemark] = await db
      .select()
      .from(caseRemarks)
      .where(and(eq(caseRemarks.id, remarkId), eq(caseRemarks.applicationId, applicationId)))
      .limit(1);
    if (!existingRemark) throw new Error("備考が見つかりません");

    const result = await db
      .update(caseRemarks)
      .set({
        content: content.trim(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(caseRemarks.id, remarkId))
      .returning();

    console.log("[updateCaseRemark] Remark updated successfully");
    const remark = result[0];
    if (!remark) return null;
    // Date オブジェクトを ISO 文字列に変換
    return {
      ...remark,
      createdAt: remark.createdAt instanceof Date ? remark.createdAt.toISOString() : remark.createdAt,
      updatedAt: remark.updatedAt instanceof Date ? remark.updatedAt.toISOString() : remark.updatedAt,
    };
  } catch (err: any) {
    console.error("[updateCaseRemark] Error:", err.message);
    return null;
  }
}

export async function deleteCaseRemark(applicationId: string, remarkId: string) {
  try {
    console.log("[deleteCaseRemark] Starting for remarkId:", remarkId);

    const session = await auth();
    if (!session?.user) throw new Error("認証が必要です");
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) throw new Error("認証情報が不正です");

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) throw new Error("申請案件が見つかりません");

    const [remark] = await db
      .select()
      .from(caseRemarks)
      .where(and(eq(caseRemarks.id, remarkId), eq(caseRemarks.applicationId, applicationId)))
      .limit(1);
    if (!remark) throw new Error("備考が見つかりません");

    await db.delete(caseRemarks).where(eq(caseRemarks.id, remarkId));

    console.log("[deleteCaseRemark] Remark deleted successfully");
    return true;
  } catch (err: any) {
    console.error("[deleteCaseRemark] Error:", err.message);
    return false;
  }
}
