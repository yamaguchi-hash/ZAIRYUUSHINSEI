"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCircle, UserPlus, X, Search, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatDate, normalizeRomajiName, VISA_TYPE_LABELS } from "@/lib/utils";
import Link from "next/link";
import { AiRegistrationForm } from "@/components/applicants/ai-registration-form";

type Applicant = {
  id: string;
  familyNameEn: string;
  givenNameEn: string;
  familyNameJa: string | null;
  givenNameJa: string | null;
  nationality: string;
  dateOfBirth: string | null;
  passportNumber: string | null;
  currentVisaType: string | null;
  currentVisaExpiry: string | null;
  organizationId: string | null;
  phone: string | null;
  emailAddress: string | null;
  postalCode: string | null;
  japanPrefecture: string | null;
  japanCity: string | null;
  japanAddressLine: string | null;
  japanAddress: string | null;
};

type SortKey = "name" | "nationality" | "age" | "visaType" | "visaExpiry" | "organization" | "phone" | "email";

/** 満年齢を計算する */
function calcAge(dateOfBirth: string): number {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/** 並び替え用の比較値を取得する（null/undefinedは末尾に配置） */
function getSortValue(a: Applicant, key: SortKey, orgMap: Map<string, string>): string | number | null {
  switch (key) {
    case "name":
      return normalizeRomajiName(`${a.familyNameEn} ${a.givenNameEn}`).toLowerCase();
    case "nationality":
      return a.nationality?.toLowerCase() ?? null;
    case "age":
      return a.dateOfBirth ? calcAge(a.dateOfBirth) : null;
    case "visaType":
      return a.currentVisaType ? (VISA_TYPE_LABELS[a.currentVisaType] ?? a.currentVisaType) : null;
    case "visaExpiry":
      return a.currentVisaExpiry ? new Date(a.currentVisaExpiry).getTime() : null;
    case "organization":
      return a.organizationId ? (orgMap.get(a.organizationId) ?? null) : null;
    case "phone":
      return a.phone || null;
    case "email":
      return a.emailAddress ? a.emailAddress.toLowerCase() : null;
    default:
      return null;
  }
}

export function ApplicantsPageClient({
  applicants,
  organizations,
}: {
  applicants: Applicant[];
  organizations: { id: string; nameJa: string }[];
}) {
  const [showModal, setShowModal] = useState(false);

  // ─── 検索・絞り込み条件 ───────────────────────────────────────────────
  const [nameQuery, setNameQuery] = useState("");
  const [visaTypeFilter, setVisaTypeFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");

  // ─── 並び替え条件 ─────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const orgMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.nameJa])),
    [organizations]
  );

  // 一覧に存在する在留資格のみを選択肢として表示
  const visaTypeOptions = useMemo(() => {
    const set = new Set<string>();
    applicants.forEach((a) => {
      if (a.currentVisaType) set.add(a.currentVisaType);
    });
    return Array.from(set).sort();
  }, [applicants]);

  const filtered = useMemo(() => {
    const nameNeedle = nameQuery.trim().toLowerCase();
    const nameNeedleRaw = nameQuery.trim();
    return applicants.filter((a) => {
      if (nameNeedle) {
        const romaji = normalizeRomajiName(`${a.familyNameEn} ${a.givenNameEn}`).toLowerCase();
        const kanji = `${a.familyNameJa ?? ""}${a.givenNameJa ?? ""}`;
        const kanjiSpaced = `${a.familyNameJa ?? ""} ${a.givenNameJa ?? ""}`;
        const matched =
          romaji.includes(nameNeedle) ||
          kanji.includes(nameNeedleRaw) ||
          kanjiSpaced.includes(nameNeedleRaw);
        if (!matched) return false;
      }
      if (visaTypeFilter && a.currentVisaType !== visaTypeFilter) return false;
      if (orgFilter && a.organizationId !== orgFilter) return false;
      return true;
    });
  }, [applicants, nameQuery, visaTypeFilter, orgFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, sortKey, orgMap);
      const vb = getSortValue(b, sortKey, orgMap);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "ja") * dir;
    });
  }, [filtered, sortKey, sortDir, orgMap]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleClearFilters() {
    setNameQuery("");
    setVisaTypeFilter("");
    setOrgFilter("");
  }

  const hasActiveFilters = !!(nameQuery || visaTypeFilter || orgFilter);

  function renderSortableTh(label: string, key: SortKey, extraClass = "") {
    const active = sortKey === key;
    return (
      <th
        onClick={() => handleSort(key)}
        className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap ${extraClass}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active ? (
            sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-300" />
          )}
        </span>
      </th>
    );
  }

  return (
    <div className="p-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">申請人マスター</h1>
          <p className="text-gray-500 text-sm mt-1">全 {applicants.length} 件</p>
        </div>
        {/* 新規登録ボタン */}
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          申請人を新規登録
        </button>
      </div>

      {/* 申請人一覧（フルワイド） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            申請人一覧
          </CardTitle>
        </CardHeader>

        {/* 検索・絞り込みフォーム */}
        <div className="px-4 pb-4 flex flex-wrap items-end gap-3 border-b border-gray-100">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">氏名で検索</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="漢字氏名・ローマ字氏名で検索"
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">在留資格</label>
            <select
              value={visaTypeFilter}
              onChange={(e) => setVisaTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            >
              <option value="">すべて</option>
              {visaTypeOptions.map((v) => (
                <option key={v} value={v}>
                  {VISA_TYPE_LABELS[v] ?? v}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">所属機関</label>
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            >
              <option value="">すべて</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nameJa}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleClearFilters}
            disabled={!hasActiveFilters}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            条件をクリア
          </button>

          <div className="text-xs text-gray-400 ml-auto whitespace-nowrap">
            {hasActiveFilters ? `${sorted.length} / ${applicants.length} 件を表示` : `${applicants.length} 件`}
          </div>
        </div>

        <CardContent className="p-0">
          {applicants.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <UserCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">申請人が登録されていません</p>
              <p className="text-xs text-gray-300 mt-1">右上のボタンから登録してください</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">検索条件に一致する申請人が見つかりません</p>
              <p className="text-xs text-gray-300 mt-1">条件を変更するか「条件をクリア」をお試しください</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {renderSortableTh("氏名", "name", "min-w-[160px]")}
                    {renderSortableTh("国籍", "nationality")}
                    {renderSortableTh("年齢", "age")}
                    {renderSortableTh("在留資格", "visaType")}
                    {renderSortableTh("在留期限", "visaExpiry")}
                    {renderSortableTh("所属機関", "organization", "min-w-[160px]")}
                    {renderSortableTh("電話番号", "phone")}
                    {renderSortableTh("メール", "email", "min-w-[160px]")}
                    <th className="px-4 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map((a) => {
                    const visaDays = a.currentVisaExpiry ? (() => {
                      const expiry = new Date(a.currentVisaExpiry);
                      const today = new Date(); today.setHours(0,0,0,0);
                      return Math.floor((expiry.getTime() - today.getTime()) / (1000*60*60*24));
                    })() : null;
                    const orgName = a.organizationId ? orgMap.get(a.organizationId) : null;

                    return (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-4 py-3">
                          <Link href={`/applicants/${a.id}`} className="block">
                            <p className="font-medium text-gray-900">
                              {normalizeRomajiName(`${a.familyNameEn} ${a.givenNameEn}`)}
                            </p>
                            {a.familyNameJa && (
                              <p className="text-xs text-gray-500">
                                {a.familyNameJa} {a.givenNameJa}
                              </p>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{a.nationality}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {a.dateOfBirth ? `${calcAge(a.dateOfBirth)}歳` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {a.currentVisaType ? (VISA_TYPE_LABELS[a.currentVisaType] ?? a.currentVisaType) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {a.currentVisaExpiry ? (
                            <span className={
                              visaDays !== null && visaDays < 0 ? "text-gray-400 line-through" :
                              visaDays !== null && visaDays <= 30 ? "text-red-600 font-semibold" :
                              visaDays !== null && visaDays <= 90 ? "text-orange-600 font-medium" :
                              "text-gray-600"
                            }>
                              {formatDate(a.currentVisaExpiry)}
                              {visaDays !== null && visaDays <= 90 && (
                                <span className="ml-1">
                                  {visaDays < 0 ? "（期限切れ）" : `（残${visaDays}日）`}
                                </span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate" title={orgName ?? ""}>
                          {orgName || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {a.phone || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate" title={a.emailAddress ?? ""}>
                          {a.emailAddress || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/applicants/${a.id}`} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* モーダル：新規登録（AI自動読込 + 手動入力） */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12 overflow-y-auto">
          <div className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-sm flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" />申請人を新規登録
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/70 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <AiRegistrationForm organizations={organizations} />
          </div>
        </div>
      )}
    </div>
  );
}
