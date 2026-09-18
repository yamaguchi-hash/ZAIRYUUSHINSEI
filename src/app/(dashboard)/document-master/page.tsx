import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FileCheck } from "lucide-react";
import { DocumentMasterClient } from "./document-master-client";

/**
 * 必要書類マスター 基本設定ページ
 * 在留申請の種別（認定証明書/変更/更新/永住・共通）×在留資格の種別ごとに、
 * 必要書類（書類名・担当・注意事項・原本/写し・並び順・必須）を設定する。
 */
export default async function DocumentMasterPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role;
  if (role !== "expert" && role !== "admin") redirect("/dashboard");

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileCheck className="w-6 h-6 text-blue-600" />
          必要書類マスター
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          在留申請の種別と在留資格ごとに必要書類の基本設定を行います。
          ここで設定した内容は、申請案件の必要書類チェックリスト（自動追加・書類セレクタ）に反映されます。
          技人国・在留期間更新／家族滞在・在留資格認定証明書交付申請を選ぶと、条件付き自動チェックリスト（編集機能つき）が表示されます。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          ※ 基本の書類データは出入国在留管理庁ホームページの必要書類一覧に基づいて登録されており、並び順も原則として入管ホームページの記載順です。
        </p>
      </div>
      <DocumentMasterClient />
    </div>
  );
}
