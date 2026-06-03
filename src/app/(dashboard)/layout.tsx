import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BackButton } from "@/components/layout/back-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // auth() は JWT 検証失敗等で throw することがあるため try-catch でラップ
  let session;
  try {
    session = await auth();
    console.log("[DashboardLayout] Session obtained - User:", {
      id: session?.user?.id,
      name: session?.user?.name,
      role: (session?.user as any)?.role,
    });
  } catch {
    console.error("[DashboardLayout] Auth error");
    redirect("/login");
  }

  if (!session?.user) {
    console.error("[DashboardLayout] No user in session");
    redirect("/login");
  }

  const userName = session.user.name ?? session.user.email;
  const userRole = (session.user as any).role;

  console.log("[DashboardLayout] Passing to Sidebar:", {
    userName,
    userRole,
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userRole={userRole}
        userName={userName}
      />
      <main className="flex-1 overflow-auto">
        <BackButton />
        {children}
      </main>
    </div>
  );
}
