import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableHeaderProps {
  label: string;
  href: string;
  isActive: boolean;
  order: "asc" | "desc";
  className?: string;
}

export function SortableHeader({ label, href, isActive, order, className }: SortableHeaderProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors select-none",
        isActive
          ? "text-blue-600 hover:text-blue-700"
          : "text-gray-500 hover:text-gray-700",
        className
      )}
    >
      {label}
      {isActive ? (
        order === "asc" ? (
          <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        )
      ) : (
        <ChevronsUpDown className="w-3 h-3 flex-shrink-0 opacity-30" />
      )}
    </Link>
  );
}
