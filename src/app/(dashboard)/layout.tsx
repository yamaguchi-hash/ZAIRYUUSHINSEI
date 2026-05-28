import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BackButton } from "@/components/layout/back-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userRole={(session.user as any).role}
        userName={session.user.name ?? session.user.email ?? undefined}
      />
      <main className="flex-1 overflow-auto">
        <BackButton />
        {children}
      </main>
    </div>
  );
}
