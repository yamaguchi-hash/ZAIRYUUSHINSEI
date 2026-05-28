"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// トップレベルのページ（戻るボタン不要）
const TOP_LEVEL_PATHS = [
  "/dashboard",
  "/applications",
  "/applicants",
  "/organizations",
  "/settings",
  "/admin",
];

function isTopLevel(pathname: string): boolean {
  return TOP_LEVEL_PATHS.some((p) => pathname === p || pathname === p + "/");
}

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  // トップレベルページでは表示しない
  if (isTopLevel(pathname)) return null;

  return (
    <div className="sticky top-0 z-10 flex items-center bg-white/90 backdrop-blur border-b border-gray-100 px-4 py-1.5">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors rounded-lg px-2 py-1 hover:bg-gray-100"
      >
        <ArrowLeft className="w-4 h-4" />
        前のページへ戻る
      </button>
    </div>
  );
}
