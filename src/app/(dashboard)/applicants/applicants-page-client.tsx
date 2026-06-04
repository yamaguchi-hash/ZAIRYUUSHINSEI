"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCircle, UserPlus, X } from "lucide-react";
import { formatDate, VISA_TYPE_LABELS } from "@/lib/utils";
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
  phone: string | null;
  emailAddress: string | null;
  japanPrefecture: string | null;
  japanCity: string | null;
  japanAddressLine: string | null;
  japanAddress: string | null;
};

/** 満年齢を計算する */
function calcAge(dateOfBirth: string): number {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function ApplicantsPageClient({ applicants }: { applicants: Applicant[] }) {
  const [showModal, setShowModal] = useState(false);

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
        <CardContent className="p-0">
          {applicants.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <UserCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">申請人が登録されていません</p>
              <p className="text-xs text-gray-300 mt-1">右上のボタンから登録してください</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">氏名</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">国籍</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">年齢</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">在留資格</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">在留期限</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">住所</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">電話番号</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">メール</th>
                    <th className="px-4 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {applicants.map((a) => {
                    const address = a.japanPrefecture || a.japanCity || a.japanAddressLine
                      ? `${a.japanPrefecture ?? ""}${a.japanCity ?? ""}${a.japanAddressLine ?? ""}`
                      : a.japanAddress ?? "";
                    const visaDays = a.currentVisaExpiry ? (() => {
                      const expiry = new Date(a.currentVisaExpiry);
                      const today = new Date(); today.setHours(0,0,0,0);
                      return Math.floor((expiry.getTime() - today.getTime()) / (1000*60*60*24));
                    })() : null;

                    return (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-4 py-3">
                          <Link href={`/applicants/${a.id}`} className="block">
                            <p className="font-medium text-gray-900">
                              {a.familyNameEn} {a.givenNameEn}
                            </p>
                            {a.familyNameJa && (
                              <p className="text-xs text-gray-500">
                                {a.familyNameJa} {a.givenNameJa}
                              </p>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{a.nationality}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {a.dateOfBirth ? `${calcAge(a.dateOfBirth)}歳` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {a.currentVisaType ? (VISA_TYPE_LABELS[a.currentVisaType] ?? a.currentVisaType) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">
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
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate" title={address}>
                          {address || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {a.phone || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[180px] truncate" title={a.emailAddress ?? ""}>
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
            <AiRegistrationForm />
          </div>
        </div>
      )}
    </div>
  );
}
