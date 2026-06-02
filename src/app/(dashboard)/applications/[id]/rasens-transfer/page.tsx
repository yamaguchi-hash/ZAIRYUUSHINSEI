import { auth } from "@/lib/auth";
import { db, applications, applicantMaster } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ApplicationFormData } from "@/lib/form-types";
import {
  buildRasensFields,
  buildTransferSections,
  generateBookmarklet,
} from "@/lib/rasens-transfer";
import { BookmarkletButton } from "./bookmarklet-button";
import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";

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
    dateOfBirth:  applicant?.dateOfBirth ?? null,
    gender:       applicant?.gender      ?? null,
    passportNumber:      applicant?.passportNumber      ?? null,
    residenceCardNumber: applicant?.residenceCardNumber ?? null,
    phone:        applicant?.phone ?? null,
  });

  const sections = buildTransferSections(fields);
  const bookmarkletUrl = generateBookmarklet(fields, applicantName);
  const rasensUrl = "https://www.rasens-immi.moj.go.jp/rasens-u/";

  return (
    <div className="p-8 max-w-4xl">
      {/* 戻るリンク */}
      <Link
        href={`/applications/${id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        申請詳細に戻る
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        RASENS 自動入力ツール
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        {applicantName} の申請データをRASENSフォームに自動入力します
      </p>

      {/* ── STEP 1: ブックマークレット設定 ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h2 className="font-bold text-blue-900 text-base mb-3 flex items-center gap-2">
          <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
          ブックマークレットを登録（初回のみ）
        </h2>
        <p className="text-sm text-blue-700 mb-3">
          下のボタンをブラウザのブックマークバーにドラッグ＆ドロップしてください。
        </p>
        <BookmarkletButton
          bookmarkletUrl={bookmarkletUrl}
          label={`JLS自動入力 - ${applicantName}`}
        />
        <p className="text-xs text-blue-500 mt-2">
          ※ 申請人が変わるたびに新しいブックマークレットを登録してください
        </p>
      </div>

      {/* ── STEP 2: RASENSでフォームを開く ── */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
        <h2 className="font-bold text-green-900 text-base mb-3 flex items-center gap-2">
          <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
          RASENSで申請フォームを開く
        </h2>
        <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
          <li>RASENSにログイン</li>
          <li>「在留期間更新許可申請」→ 申請書の種類を選択</li>
          <li>申請フォームが表示されたら次のステップへ</li>
        </ol>
        <a
          href={rasensUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          RASENSを開く
        </a>
      </div>

      {/* ── STEP 3: ブックマークレット実行 ── */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-8">
        <h2 className="font-bold text-purple-900 text-base mb-3 flex items-center gap-2">
          <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
          ブックマークレットをクリックして自動入力
        </h2>
        <ol className="text-sm text-purple-700 space-y-1 list-decimal list-inside">
          <li>RASENSのフォームページで、登録したブックマークレットをクリック</li>
          <li>自動入力が実行されます（数秒かかります）</li>
          <li>完了ダイアログで入力結果を確認</li>
          <li>未入力項目は手動で補完してください</li>
          <li>確認して「申込データを保存」または「申請」をクリック</li>
        </ol>
      </div>

      {/* ── 転記データ確認シート ── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <h2 className="font-bold text-gray-800 text-sm">
            📋 転記データ確認シート（{fields.length}項目）
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            自動入力できなかった項目は、この表を参照して手動入力してください
          </p>
        </div>

        <div className="p-4 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 border-b pb-1">
                {section.title}
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {section.fields.map((field, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap w-1/3 text-xs">
                        {field.label}
                      </td>
                      <td className="py-2 font-medium text-gray-900 break-all">
                        {field.value || <span className="text-gray-300 italic">（空欄）</span>}
                      </td>
                      <td className="py-2 pl-2 w-12">
                        <CopyButton text={field.value} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  if (!text) return null;
  return (
    <button
      onClick={undefined}
      data-copy={text}
      className="p-1 text-gray-300 hover:text-gray-600 transition-colors copy-btn"
      title="コピー"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}
