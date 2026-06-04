"use server";

import { auth } from "@/lib/auth";
import { db, caseNotes, applications } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function getCaseNotes(applicationId: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      throw new Error("認証が必要です");
    }

    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) {
      throw new Error("テナントIDが不正です");
    }

    // 申請案件の存在確認
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!app) {
      throw new Error("申請案件が見つかりません");
    }

    // 事件メモを取得
    const notes = await db
      .select()
      .from(caseNotes)
      .where(eq(caseNotes.applicationId, applicationId))
      .orderBy(caseNotes.entryDate);

    return notes;
  } catch (err: any) {
    console.error("Get case notes error:", err);
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
    if (!session?.user) {
      throw new Error("認証が必要です");
    }

    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) {
      throw new Error("認証情報が不正です");
    }

    // 申請案件の存在確認
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!app) {
      throw new Error("申請案件が見つかりません");
    }

    // 事件メモを追加
    const result = await db
      .insert(caseNotes)
      .values({
        applicationId,
        tenantId,
        entryDate: new Date(data.entryDate),
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
    if (!session?.user) {
      throw new Error("認証が必要です");
    }

    const userId = (session.user as any)?.id;
    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId || !userId) {
      throw new Error("認証情報が不正です");
    }

    // 申請案件の存在確認
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!app) {
      throw new Error("申請案件が見つかりません");
    }

    // 事件メモの存在確認
    const [note] = await db
      .select()
      .from(caseNotes)
      .where(
        and(
          eq(caseNotes.id, caseNoteId),
          eq(caseNotes.applicationId, applicationId)
        )
      )
      .limit(1);

    if (!note) {
      throw new Error("事件メモが見つかりません");
    }

    // 事件メモを更新
    const result = await db
      .update(caseNotes)
      .set({
        entryDate: new Date(data.entryDate),
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

export async function deleteCaseNote(
  applicationId: string,
  caseNoteId: string
) {
  try {
    const session = await auth();
    if (!session?.user) {
      throw new Error("認証が必要です");
    }

    const tenantId = (session.user as any)?.tenantId;
    if (!tenantId) {
      throw new Error("認証情報が不正です");
    }

    // 申請案件の存在確認
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!app) {
      throw new Error("申請案件が見つかりません");
    }

    // 事件メモの存在確認
    const [note] = await db
      .select()
      .from(caseNotes)
      .where(
        and(
          eq(caseNotes.id, caseNoteId),
          eq(caseNotes.applicationId, applicationId)
        )
      )
      .limit(1);

    if (!note) {
      throw new Error("事件メモが見つかりません");
    }

    // 事件メモを削除
    await db.delete(caseNotes).where(eq(caseNotes.id, caseNoteId));

    return true;
  } catch (err: any) {
    console.error("Delete case note error:", err);
    throw err;
  }
}
