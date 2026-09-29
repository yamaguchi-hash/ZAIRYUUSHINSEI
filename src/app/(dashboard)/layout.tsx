import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "../globals.css";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BackButton } from "@/components/layout/back-button";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "行政書士業務システム",
  description: "行政書士業務の顧客・案件・事件簿・書類を一元管理する業務システム",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // auth() は JWT 検証失敗等で throw することがあるため try-catch でラップ
  let session;
  try {
    session = await auth();
  } catch {
    redirect("/login");
  }

  if (!session?.user) {
    redirect("/login");
  }

  const userName = session.user.name ?? session.user.email ?? undefined;
  const userRole = (session.user as any).role;

  return (
    <html lang="ja">
      <body className={`${notoSansJP.className} bg-gray-50 text-gray-900 antialiased`}>
        <SessionProvider>
          <div className="flex min-h-screen">
            <Sidebar
              userRole={userRole}
              userName={userName ?? undefined}
            />
            <main className="flex-1 overflow-auto">
              <BackButton />
              {children}
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
