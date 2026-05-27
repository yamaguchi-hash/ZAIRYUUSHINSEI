"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createApplication } from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { Loader2, AlertCircle, Search, Check, ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Applicant {
  id: string;
  familyNameEn: string;
  givenNameEn: string;
  familyNameJa: string | null;
  givenNameJa: string | null;
  nationality: string;
}

interface Organization {
  id: string;
  nameJa: string;
  nameEn: string | null;
}

interface Props {
  applicants: Applicant[];
  organizations: Organization[];
}

// ── 検索付きコンボボックス ────────────────────────────────────────────────────
function SearchableSelect<T extends { id: string }>({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  renderItem,
  renderSelected,
  required,
}: {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  renderItem: (item: T) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode;
  required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.id === value) ?? null;

  const filtered = search.trim()
    ? items.filter((item) =>
        JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
      )
    : items;

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function open() {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function select(id: string) {
    onChange(id);
    setIsOpen(false);
    setSearch("");
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative">
      {/* トリガー */}
      <button
        type="button"
        onClick={open}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm text-left transition-colors",
          isOpen ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300 hover:border-gray-400",
          !selected && "text-gray-400"
        )}
      >
        <span className="truncate">
          {selected ? renderSelected(selected) : placeholder}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selected && (
            <span onClick={clear} className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isOpen && "rotate-180")} />
        </span>
      </button>

      {/* ドロップダウン */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* 検索ボックス */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* リスト */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                {search ? `「${search}」に一致する結果がありません` : "データがありません"}
              </div>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => select(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-blue-50 transition-colors",
                    item.id === value && "bg-blue-50"
                  )}
                >
                  <Check className={cn("w-4 h-4 text-blue-600 flex-shrink-0", item.id !== value && "invisible")} />
                  <span className="flex-1 min-w-0">{renderItem(item)}</span>
                </button>
              ))
            )}
          </div>

          {/* 件数 */}
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} / {items.length} 件
          </div>
        </div>
      )}

      {/* hidden input for form validation */}
      {required && <input type="text" required value={value} onChange={() => {}} className="sr-only" tabIndex={-1} />}
    </div>
  );
}

// ── メインフォーム ────────────────────────────────────────────────────────────
export function NewApplicationForm({ applicants, organizations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    applicantId: "",
    organizationId: "",
    applicationType: "renewal",
    visaType: "engineer_humanities",
  });

  function handleSelectChange(field: string) {
    return (value: string) => setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.applicantId) {
      setError("申請人を選択してください");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createApplication({
        applicantId: formData.applicantId,
        organizationId: formData.organizationId || undefined,
        applicationType: formData.applicationType,
        visaType: formData.visaType,
      });
      if (!result.success || !result.data) {
        setError(result.error ?? "申請の作成に失敗しました");
        return;
      }
      router.push(`/applications/${result.data.id}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>申請情報の入力</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 申請人 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              申請人 <span className="text-red-500">*</span>
            </label>
            <SearchableSelect<Applicant>
              items={applicants}
              value={formData.applicantId}
              onChange={handleSelectChange("applicantId")}
              placeholder="申請人を選択してください"
              searchPlaceholder="名前・国籍で検索..."
              required
              renderSelected={(a) => (
                <span>
                  <span className="font-medium">{a.familyNameEn} {a.givenNameEn}</span>
                  {(a.familyNameJa || a.givenNameJa) && (
                    <span className="text-gray-500 ml-2 text-xs">（{a.familyNameJa} {a.givenNameJa}）</span>
                  )}
                </span>
              )}
              renderItem={(a) => (
                <div>
                  <div className="font-medium text-gray-900">
                    {a.familyNameEn} {a.givenNameEn}
                    {(a.familyNameJa || a.givenNameJa) && (
                      <span className="text-gray-500 font-normal ml-2 text-xs">
                        （{a.familyNameJa} {a.givenNameJa}）
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{a.nationality}</div>
                </div>
              )}
            />
            {applicants.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                <Link href="/applicants" className="text-blue-600 hover:underline">申請人マスター</Link>に登録してから申請を作成してください
              </p>
            )}
          </div>

          {/* 所属機関 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              所属機関（任意）
            </label>
            <SearchableSelect<Organization>
              items={organizations}
              value={formData.organizationId}
              onChange={handleSelectChange("organizationId")}
              placeholder="所属機関を選択（任意）"
              searchPlaceholder="機関名で検索..."
              renderSelected={(o) => (
                <span>{o.nameJa}{o.nameEn && <span className="text-gray-400 ml-2 text-xs">{o.nameEn}</span>}</span>
              )}
              renderItem={(o) => (
                <div>
                  <div className="font-medium text-gray-900">{o.nameJa}</div>
                  {o.nameEn && <div className="text-xs text-gray-400 mt-0.5">{o.nameEn}</div>}
                </div>
              )}
            />
          </div>

          {/* 申請種別 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              申請種別 <span className="text-red-500">*</span>
            </label>
            <select
              name="applicationType"
              value={formData.applicationType}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(APPLICATION_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* 在留資格 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              在留資格種別 <span className="text-red-500">*</span>
            </label>
            <select
              name="visaType"
              value={formData.visaType}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(VISA_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="submit"
              disabled={isPending || !formData.applicantId}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />作成中...</>
              ) : (
                "申請を作成する"
              )}
            </button>
            <Link
              href="/applications"
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
