"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createApplication } from "@/actions/applications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function NewApplicationPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    applicantId: "",
    organizationId: "",
    applicationType: "renewal",
    visaType: "engineer_humanities",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const app = await createApplication({
          applicantId: formData.applicantId,
          organizationId: formData.organizationId || undefined,
          applicationType: formData.applicationType,
          visaType: formData.visaType,
        });
        router.push(`/applications/${app.id}`);
      } catch (err: any) {
        setError(err.message ?? "申請の作成に失敗しました");
      }
    });
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/applications"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          申請一覧に戻る
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">新規申請作成</h1>

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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                申請人ID <span className="text-red-500">*</span>
              </label>
              <input
                name="applicantId"
                type="text"
                required
                value={formData.applicantId}
                onChange={handleChange}
                placeholder="申請人マスターのUUID"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                <Link href="/applicants" className="text-blue-600 hover:underline">申請人一覧</Link>からIDをコピーしてください
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                所属機関ID（任意）
              </label>
              <input
                name="organizationId"
                type="text"
                value={formData.organizationId}
                onChange={handleChange}
                placeholder="所属機関マスターのUUID（任意）"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

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
                {Object.entries(APPLICATION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

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
                {Object.entries(VISA_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    作成中...
                  </>
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
    </div>
  );
}
