import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ApplicationFormData } from "@/lib/form-types";
import { buildRasensFields, buildTransferSections } from "@/lib/rasens-transfer";
import { TransferSheet } from "./transfer-sheet";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";

export default async function RasensTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId;
  if (!tenantId) notFound();

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .limit(1);
  if (!app) notFound();

  const [applicant] = await db.select().from(applicantMaster)
    .where(eq(applicantMaster.id, app.applicantId))
    .limit(1);

  const form = (app.formData ?? {}) as Partial<ApplicationFormData>;
  const applicantName = `${applicant?.familyNameEn ?? ""} ${applicant?.givenNameEn ?? ""}`.trim();

  const fields = buildRasensFields(form, {
    familyNameEn: applicant?.familyNameEn,
    givenNameEn:  applicant?.givenNameEn,
    familyNameJa: applicant?.familyNameJa ?? null,
    givenNameJa:  applicant?.givenNameJa  ?? null,
    nationality:  applicant?.nationality,
    dateOfBirth:  applicant?.dateOfBirth  ?? null,
    gender:       applicant?.gender       ?? null,
    passportNumber:      applicant?.passportNumber      ?? null,
    residenceCardNumber: applicant?.residenceCardNumber ?? null,
    phone:        applicant?.phone ?? null,
  });

  const sections = buildTransferSections(fields);

  return (
    <div className="p-8 max-w-3xl">
      {/* 戻る */}
      <Link
        href={`/applications/${id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        申請詳細に戻る
      </Link>

      {/* タイトル */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">RASENS 転記データシート</h1>
          <p className="text-sm text-gray-500 mt-1">
            申請人：<span className="font-medium text-gray-700">{applicantName}</span>
            　｜　全 {fields.length} 項目
          </p>
        </div>
        <a
          href="https://www.rasens-immi.moj.go.jp/rasens-u/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
        >
          <ExternalLink className="w-4 h-4" />
          RASENSを開く
        </a>
      </div>

      {/* 使い方説明 */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-400" />
        <div className="space-y-1">
          <p className="font-semibold text-blue-800">使い方</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
            <li>右上の「RASENSを開く」からRASENSにログインし、申請フォームを選択</li>
            <li>このシートの各項目の右にある <strong>「コピー」</strong> ボタンをクリック</li>
            <li>RASENSの対応フィールドに貼り付け（Ctrl+V）</li>
            <li>全項目入力後、RASENSで「申込データを保存」または「申請」をクリック</li>
          </ol>
        </div>
      </div>

      {/* 転記シート（クライアントコンポーネント） */}
      <TransferSheet sections={sections} />
    </div>
  );
}
