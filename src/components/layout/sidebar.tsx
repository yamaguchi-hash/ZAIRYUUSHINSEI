"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
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
  ChevronLeft,
  ChevronRight,
  FileCheck,
  BookText,
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
    icon: <LayoutDashboard className="w-4 h-4 flex-shrink-0" />,
  },
  {
    href: "/applications",
    label: "申請案件",
    icon: <FileText className="w-4 h-4 flex-shrink-0" />,
  },
  {
    href: "/ledger",
    label: "事件簿",
    icon: <BookText className="w-4 h-4 flex-shrink-0" />,
    roles: ["expert", "admin", "hr_manager"],
  },
  {
    href: "/applicants",
    label: "申請人マスター",
    icon: <Users className="w-4 h-4 flex-shrink-0" />,
    roles: ["expert", "admin", "hr_manager"],
  },
  {
    href: "/organizations",
    label: "所属機関マスター",
    icon: <Building2 className="w-4 h-4 flex-shrink-0" />,
    roles: ["expert", "admin", "hr_manager"],
  },
  {
    href: "/document-master",
    label: "必要書類マスター",
    icon: <FileCheck className="w-4 h-4 flex-shrink-0" />,
    roles: ["expert", "admin"],
  },
  {
    href: "/admin",
    label: "システム管理",
    icon: <Settings className="w-4 h-4 flex-shrink-0" />,
    roles: ["admin", "expert"],
  },
  {
    href: "/settings",
    label: "アカウント設定",
    icon: <UserCog className="w-4 h-4 flex-shrink-0" />,
  },
];

interface SidebarProps {
  userRole?: string;
  userName?: string;
}

const STORAGE_KEY = "sidebar_collapsed";

export function Sidebar({ userRole: initialUserRole, userName: initialUserName }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setIsCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const userRole = (session?.user as any)?.role ?? initialUserRole;
  const userName = session?.user?.name ?? initialUserName;

  const visibleItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole ?? "")
  );

  return (
    <aside
      className={cn(
        "bg-gray-900 text-white flex flex-col min-h-screen transition-all duration-200",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo + toggle */}
      <div className="px-3 py-5 border-b border-gray-700 flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-2 overflow-hidden", isCollapsed && "justify-center w-full")}>
          <ShieldCheck className="w-6 h-6 text-blue-400 flex-shrink-0" />
          {!isCollapsed && (
            <div>
              <p className="text-sm font-bold leading-tight">在留申請</p>
              <p className="text-xs text-gray-400 leading-tight">書類作成システム</p>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <button
            onClick={toggleCollapsed}
            title="メニューを折りたたむ"
            className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button (collapsed state) */}
      {isCollapsed && (
        <div className="flex justify-center py-2 border-b border-gray-700">
          <button
            onClick={toggleCollapsed}
            title="メニューを展開する"
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isCollapsed ? "justify-center px-2" : "",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
            >
              {item.icon}
              {!isCollapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="px-2 py-4 border-t border-gray-700">
        <div className={cn("flex items-center gap-3 px-3 py-2 mb-2", isCollapsed && "justify-center px-1")}>
          <div
            className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold flex-shrink-0"
            title={isCollapsed ? (userName ?? "ユーザー") : undefined}
          >
            {userName?.charAt(0).toUpperCase() ?? "U"}
          </div>
          {!isCollapsed && (
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
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={isCollapsed ? "ログアウト" : undefined}
          className={cn(
            "flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors",
            isCollapsed && "justify-center px-2"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && "ログアウト"}
        </button>
      </div>
    </aside>
  );
}
