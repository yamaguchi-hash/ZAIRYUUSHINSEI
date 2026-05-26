import { auth } from "@/lib/auth";
import { getApplicants } from "@/actions/applicants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCircle, PenLine, Sparkles } from "lucide-react";
import { formatDate, VISA_TYPE_LABELS } from "@/lib/utils";
import Link from "next/link";
import { AiRegistrationForm } from "@/components/applicants/ai-registration-form";
import { AddApplicantForm } from "./add-applicant-form";

export default async function ApplicantsPage() {
  const applicants = await getApplicants();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">申請人マスター</h1>
          <p className="text-gray-500 text-sm mt-1">全 {applicants.length} 件</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        {/* Left column: Registration forms */}
        <div className="space-y-4">
          {/* AI-powered registration */}
          <AiRegistrationForm />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <PenLine className="w-3 h-3" />手動入力
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Manual registration */}
          <AddApplicantForm />
        </div>

        {/* Right column: Applicant list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              申請人一覧
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {applicants.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <UserCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">申請人が登録されていません</p>
                <p className="text-xs text-gray-300 mt-1">左のフォームから登録してください</p>
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
                          <span className="ml-2 text-gray-500 text-xs">（{a.familyNameJa} {a.givenNameJa}）</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {a.nationality}
                        {a.dateOfBirth && ` ・ ${formatDate(a.dateOfBirth)}`}
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
      </div>
    </div>
  );
}
