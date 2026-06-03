"use server";

import { auth } from "@/lib/auth";
import { db, users, auditLog } from "@/lib/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

export async function updateEmail(newEmail: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("認証が必要です");

  newEmail = newEmail.trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new Error("有効なメールアドレスを入力してください");
  }

  // Check if email is already taken by another user
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .limit(1);

  if (existing && existing.id !== session.user.id) {
    throw new Error("このメールアドレスはすでに使用されています");
  }

  const [current] = await db
    .select({ email: users.email, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  await db
    .update(users)
    .set({ email: newEmail, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  await db.insert(auditLog).values({
    tenantId: current.tenantId ?? session.user.id,
    userId: session.user.id,
    action: "update_email",
    entityType: "user",
    entityId: session.user.id,
    fieldKey: "email",
    oldValue: current.email,
    newValue: newEmail,
  });

  revalidatePath("/settings");
}

export async function updatePassword(
  currentPassword: string,
  newPassword: string
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("認証が必要です");

  if (!newPassword || newPassword.length < 8) {
    throw new Error("新しいパスワードは8文字以上で入力してください");
  }

  const [user] = await db
    .select({ passwordHash: users.passwordHash, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user?.passwordHash) throw new Error("パスワードが設定されていません");

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) throw new Error("現在のパスワードが正しくありません");

  const newHash = await bcrypt.hash(newPassword, 12);

  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  await db.insert(auditLog).values({
    tenantId: user.tenantId ?? session.user.id,
    userId: session.user.id,
    action: "update_password",
    entityType: "user",
    entityId: session.user.id,
    fieldKey: "password",
    newValue: "(変更済み)",
  });
}

export async function updateDisplayName(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("認証が必要です");

  name = name.trim();
  if (!name) throw new Error("氏名を入力してください");

  const [current] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  await db
    .update(users)
    .set({ name, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  await db.insert(auditLog).values({
    tenantId: current.tenantId ?? session.user.id,
    userId: session.user.id,
    action: "update_name",
    entityType: "user",
    entityId: session.user.id,
    fieldKey: "name",
    newValue: name,
  });

  // キャッシュを無効化（ダッシュボード内のすべてのページ）
  revalidatePath("/settings");
  revalidatePath("/(dashboard)");
  revalidatePath("/");
}

// Admin: update any user's email/password
export async function adminUpdateUser(
  targetUserId: string,
  updates: { email?: string; password?: string; name?: string; role?: string }
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("認証が必要です");
  const callerRole = (session.user as any).role;
  if (callerRole !== "admin") throw new Error("管理者権限が必要です");

  const updateData: Record<string, any> = { updatedAt: new Date() };

  if (updates.email) {
    const email = updates.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("有効なメールアドレスを入力してください");
    }
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing && existing.id !== targetUserId) {
      throw new Error("このメールアドレスはすでに使用されています");
    }
    updateData.email = email;
  }

  if (updates.password) {
    if (updates.password.length < 8) {
      throw new Error("パスワードは8文字以上で入力してください");
    }
    updateData.passwordHash = await bcrypt.hash(updates.password, 12);
  }

  if (updates.name) updateData.name = updates.name.trim();
  if (updates.role) updateData.role = updates.role;

  await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, targetUserId));

  const [caller] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  await db.insert(auditLog).values({
    tenantId: caller.tenantId ?? session.user.id,
    userId: session.user.id,
    action: "admin_update_user",
    entityType: "user",
    entityId: targetUserId,
    newValue: JSON.stringify({ ...updates, password: updates.password ? "(変更済み)" : undefined }),
  });

  revalidatePath("/settings");
  revalidatePath("/admin");
}

export async function getUsers() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("認証が必要です");
  const callerRole = (session.user as any).role;
  if (callerRole !== "admin") throw new Error("管理者権限が必要です");

  const tenantId = (session.user as any).tenantId;

  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.tenantId, tenantId));
}
