"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, applicationDocumentChecklist } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ApplicationFormData } from "@/lib/form-types";
import { EMPTY_FORM_DATA } from "@/lib/form-types";

function requireTenantId(tenantId: string | undefined | null): string {
  if (!tenantId) throw new Error("テナントIDが不正です");
  return tenantId;
}

const KNOWN_FORM_KEYS = new Set(Object.keys(EMPTY_FORM_DATA));

export type SaveInterviewAnswerInput =
  | { kind: "form"; applicationId: string; formKey: string; value: string }
  | {
      kind: "checklist";
      applicationId: string;
      checklistItemId: string;
      marker: string;
      value: string;
    };

/**
 * 質問書・顧客聴取の回答を直接保存する。
 * kind:"form" は application.formData の該当キーへマージ保存。
 * kind:"checklist" は該当チェックリスト項目の expertNotes へ marker付きで追記する
 * （次回の差分計算で同じ質問が再度出ないようにするため）。
 */
export async function saveInterviewAnswer(
  input: SaveInterviewAnswerInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "認証が必要です" };
    const tenantId = requireTenantId((session.user as any).tenantId);

    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.tenantId, tenantId)))
      .limit(1);
    if (!app) return { success: false, error: "申請案件が見つかりません" };

    if (input.kind === "form") {
      if (!KNOWN_FORM_KEYS.has(input.formKey)) {
        return { success: false, error: "不正な項目です" };
      }
      const current = (app.formData ?? {}) as Partial<ApplicationFormData>;
      const updated = { ...current, [input.formKey]: input.value };

      await db
        .update(applications)
        .set({ formData: updated, updatedAt: new Date() })
        .where(and(eq(applications.id, input.applicationId), eq(applications.tenantId, tenantId)));
    } else {
      const [item] = await db
        .select()
        .from(applicationDocumentChecklist)
        .where(eq(applicationDocumentChecklist.id, input.checklistItemId))
        .limit(1);
      if (!item || item.applicationId !== input.applicationId) {
        return { success: false, error: "チェックリスト項目が見つかりません" };
      }

      const today = new Date().toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const appendLine = `${input.marker}: ${input.value}（聴取日: ${today}）`;
      const updatedNotes = [item.expertNotes, appendLine].filter(Boolean).join("\n");

      await db
        .update(applicationDocumentChecklist)
        .set({ expertNotes: updatedNotes, updatedAt: new Date() })
        .where(eq(applicationDocumentChecklist.id, input.checklistItemId));
    }

    revalidatePath(`/applications/${input.applicationId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "保存に失敗しました" };
  }
}
