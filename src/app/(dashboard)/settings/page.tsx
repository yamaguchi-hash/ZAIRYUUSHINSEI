import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Lock, Users } from "lucide-react";
import { ROLE_LABELS } from "@/lib/utils";
import { EmailForm } from "./email-form";
import { PasswordForm } from "./password-form";
import { NameForm } from "./name-form";
import { UserManagementPanel } from "./user-management-panel";
import { BackupSection } from "./backup-section";

export default async function SettingsPage() {
  console.log("[SettingsPage] Rendering settings page");

  let session;
  try {
    session = await auth();
    console.log("[SettingsPage] Session obtained:", session?.user?.id);
  } catch (err) {
    console.error("[SettingsPage] Auth error:", err);
    throw err;
  }

  const userId = session?.user?.id;
  const userRole = (session?.user as any)?.role;

  console.log("[SettingsPage] User role:", userRole);

  let currentUser;
  try {
    const result = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, userId!))
      .limit(1);

    [currentUser] = result;
    console.log("[SettingsPage] Current user loaded:", currentUser?.id);
  } catch (err) {
    console.error("[SettingsPage] Database error:", err);
    throw err;
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">アカウント設定</h1>
        <p className="text-gray-500 text-sm mt-1">
          ログイン情報の変更・管理
        </p>
      </div>

      <div className="space-y-6">
        {/* Current user info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-4 h-4" />
              現在のアカウント情報
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500 mb-1">メールアドレス</dt>
                <dd className="font-medium">{currentUser?.email}</dd>
              </div>
              <div>
                <dt className="text-gray-500 mb-1">表示名</dt>
                <dd className="font-medium">{currentUser?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500 mb-1">ロール</dt>
                <dd className="font-medium">{ROLE_LABELS[currentUser?.role ?? ""] ?? currentUser?.role}</dd>
              </div>
              <div>
                <dt className="text-gray-500 mb-1">ユーザーID</dt>
                <dd className="font-mono text-xs text-gray-400">{currentUser?.id}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Name change */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-4 h-4" />
              表示名の変更
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NameForm currentName={currentUser?.name ?? ""} />
          </CardContent>
        </Card>

        {/* Email change */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-4 h-4" />
              メールアドレスの変更
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              変更後は新しいメールアドレスで再ログインが必要です。
            </p>
            <EmailForm currentEmail={currentUser?.email ?? ""} />
          </CardContent>
        </Card>

        {/* Password change */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              パスワードの変更
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        {/* Admin: user management */}
        {userRole === "admin" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                ユーザー管理（管理者）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UserManagementPanel />
            </CardContent>
          </Card>
        )}

        {/* Admin: backup & restore */}
        {userRole === "admin" && (
          <>
            <BackupSection />
          </>
        )}
      </div>
    </div>
  );
}
