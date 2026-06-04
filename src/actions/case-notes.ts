"use server";

import { auth } from "@/lib/auth";
import { db, caseNotes, caseExpenses, caseInformation, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";

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

    const notes = await db
      .select()
      .from(caseNotes)
      .where(eq(caseNotes.applicationId, applicationId))
      .orderBy(caseNotes.entryDate);

    console.log("[getCaseNotes] Notes retrieved:", notes.length);
    return notes;
  } catch (err: any) {
    console.error("[getCaseNotes] Error:", {
      message: err.message,
      code: err.code,
      stack: err.stack,
    });
    throw err;
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
    console.error("Add case note error:", err);
    throw err;
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
    console.error("Update case note error:", err);
    throw err;
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
    console.error("Delete case note error:", err);
    throw err;
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

    const expenses = await db
      .select()
      .from(caseExpenses)
      .where(eq(caseExpenses.applicationId, applicationId))
      .orderBy(caseExpenses.expenseDate);

    console.log("[getCaseExpenses] Expenses retrieved:", expenses.length);
    return expenses;
  } catch (err: any) {
    console.error("[getCaseExpenses] Error:", err.message);
    throw err;
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
    console.error("Add case expense error:", err);
    throw err;
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
    console.error("Update case expense error:", err);
    throw err;
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
    console.error("Delete case expense error:", err);
    throw err;
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

    console.log("[getCaseInformation] Querying case information...");
    const [info] = await db
      .select()
      .from(caseInformation)
      .where(eq(caseInformation.applicationId, applicationId));

    console.log("[getCaseInformation] Result:", !!info);
    return info || null;
  } catch (err: any) {
    console.error("[getCaseInformation] Error:", {
      message: err.message,
      code: err.code,
    });
    throw err;
  }
}

export async function updateCaseInformation(
  applicationId: string,
  data: {
    remarks?: string;
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

    const [existing] = await db
      .select()
      .from(caseInformation)
      .where(eq(caseInformation.applicationId, applicationId));

    if (existing) {
      const result = await db
        .update(caseInformation)
        .set({
          remarks: data.remarks || null,
          estimatedAmount: data.estimatedAmount || null,
          actualAmount: data.actualAmount || null,
          taxRate: data.taxRate !== undefined ? data.taxRate : existing.taxRate,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(caseInformation.applicationId, applicationId))
        .returning();
      return result[0];
    } else {
      const result = await db
        .insert(caseInformation)
        .values({
          applicationId,
          tenantId,
          remarks: data.remarks || null,
          estimatedAmount: data.estimatedAmount || null,
          actualAmount: data.actualAmount || null,
          taxRate: data.taxRate || 0.1,
          createdBy: userId,
        })
        .returning();
      return result[0];
    }
  } catch (err: any) {
    console.error("Update case information error:", err);
    throw err;
  }
}
