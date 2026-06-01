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
            <div className="divide-y divide-gray-50">
              {applicants.map((a) => (
                <Link
                  key={a.id}
                  href={`/applicants/${a.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-700">
                      {a.familyNameEn.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {a.familyNameEn} {a.givenNameEn}
                      {a.familyNameJa && (
                        <span className="ml-2 text-gray-500 text-xs">
                          （{a.familyNameJa} {a.givenNameJa}）
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.nationality}
                      {a.dateOfBirth && (
                        <>
                          {` ・ ${formatDate(a.dateOfBirth)}`}
                          <span className="ml-1 text-gray-400">（{calcAge(a.dateOfBirth)}歳）</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {a.passportNumber && (
                      <p className="text-xs font-mono text-gray-500">{a.passportNumber}</p>
                    )}
                    {a.currentVisaType && (
                      <p className="text-xs text-gray-400">
                        {VISA_TYPE_LABELS[a.currentVisaType] ?? a.currentVisaType}
                      </p>
                    )}
                  </div>
                  <div className="text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
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
