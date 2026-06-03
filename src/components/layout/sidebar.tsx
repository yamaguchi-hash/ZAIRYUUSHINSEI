"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  Settings,
  LogOut,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { signOut } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: string[];
}

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "ダッシュボード",
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    href: "/applications",
    label: "申請案件",
    icon: <FileText className="w-4 h-4" />,
  },
  {
    href: "/applicants",
    label: "申請人マスター",
    icon: <Users className="w-4 h-4" />,
    roles: ["expert", "admin", "hr_manager"],
  },
  {
    href: "/organizations",
    label: "所属機関マスター",
    icon: <Building2 className="w-4 h-4" />,
    roles: ["expert", "admin", "hr_manager"],
  },
  {
    href: "/admin",
    label: "システム管理",
    icon: <Settings className="w-4 h-4" />,
    roles: ["admin"],
  },
  {
    href: "/settings",
    label: "アカウント設定",
    icon: <UserCog className="w-4 h-4" />,
  },
];

interface SidebarProps {
  userRole?: string;
  userName?: string;
}

export function Sidebar({ userRole: initialUserRole, userName: initialUserName }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  // useSession() から取得した値を使用（これは常に最新の値）
  const userRole = (session?.user as any)?.role ?? initialUserRole;
  const userName = session?.user?.name ?? initialUserName;

  const visibleItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole ?? "")
  );

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-400" />
          <div>
            <p className="text-sm font-bold leading-tight">在留申請</p>
            <p className="text-xs text-gray-400 leading-tight">書類作成システム</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname === item.href || pathname.startsWith(item.href + "/")
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User info */}
      <div className="px-3 py-4 border-t border-gray-700">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {userName?.charAt(0).toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{userName ?? "ユーザー"}</p>
            <p className="text-xs text-gray-400 truncate">
              {userRole === "expert"
                ? "行政書士"
                : userRole === "admin"
                ? "管理者"
                : userRole === "hr_manager"
                ? "HR担当者"
                : "申請者"}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          ログアウト
        </button>
      </div>
    </aside>
  );
}
