import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { documentRequirementMaster, pdfFieldMapping } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Database, Map, FileText } from "lucide-react";
import { VISA_TYPE_LABELS, APPLICATION_TYPE_LABELS } from "@/lib/utils";

export default async function AdminPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role;

  if (userRole !== "admin" && userRole !== "expert") {
    redirect("/dashboard");
  }

  const [docCount, mappingCount] = await Promise.all([
    db.select({ count: count() }).from(documentRequirementMaster).where(eq(documentRequirementMaster.isActive, true)),
    db.select({ count: count() }).from(pdfFieldMapping).where(eq(pdfFieldMapping.isActive, true)),
  ]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">システム管理</h1>
        <p className="text-gray-500 text-sm mt-1">
          ISA準拠マスターデータのメンテナンス
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">書類要件マスター</p>
              <p className="text-3xl font-bold text-gray-900">{docCount[0]?.count ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Map className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">PDF座標マッピング</p>
              <p className="text-3xl font-bold text-gray-900">{mappingCount[0]?.count ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              書類要件マスター管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              出入国在留管理庁（ISA）Webサイトに準拠した、在留資格種別ごとの必要書類とその要件を管理します。
              プログラムコードを変更せずに必要書類の追加・変更が可能です。
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
              <p className="font-medium text-gray-700 mb-2">管理できる情報:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>在留資格種別・申請種別ごとの必要書類</li>
                <li>書類の必須/任意条件</li>
                <li>提出条件（企業カテゴリー、学歴等）</li>
                <li>表示順序の制御</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="w-4 h-4" />
              PDF座標マッピング管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              入管指定様式PDFのどの座標にどのデータ項目をマッピングするかを管理します。
              法改正や様式変更時も、管理画面から修正するだけでシステム全体に反映されます。
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
              <p className="font-medium text-gray-700 mb-2">管理できる情報:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>フォームバージョン管理</li>
                <li>ページ番号・X/Y座標</li>
                <li>フィールドタイプ（テキスト/チェックボックス/日付）</li>
                <li>フォントサイズ・文字数制限</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              テナント・ユーザー管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              マルチテナント対応のユーザー管理。事務所・企業単位でデータを完全分離し、
              ロール（申請者/HR担当者/行政書士/管理者）ごとの権限を制御します。
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
              データのアイソレーション（分離）: 全クエリにテナントIDフィルターを強制適用
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              監査ログ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              人間による上書き修正履歴を永続記録。「いつ・誰が・どのデータをどう変更したか」を
              完全なトレーサビリティで保護します。
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
              <p className="font-medium text-gray-700 mb-2">記録される操作:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>申請データの作成・更新</li>
                <li>ステータス変更</li>
                <li>承認アクション</li>
                <li>マスターデータ変更</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
