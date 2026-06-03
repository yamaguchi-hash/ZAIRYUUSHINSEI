"use client";

import { HardDrive, Lock } from "lucide-react";
import { BackupSettings } from "@/components/settings/backup-settings";

interface BackupSectionProps {
  userRole?: string;
}

export function BackupSection({ userRole }: BackupSectionProps) {
  const isAdmin = userRole === "admin";

  return (
    <div className="mt-6 mb-6">
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            バックアップ・復元（管理者）
          </h3>
        </div>

        {/* Content */}
        <div className="p-6">
          {!isAdmin ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <Lock className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-900 mb-1">管理者のみが利用可能</p>
                <p className="text-sm text-yellow-700">
                  バックアップ・復元機能は管理者のみが利用できます。現在のロールは「{userRole || "不明"}」です。
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-6">
                システムのすべての申請人と案件情報をバックアップ・復元できます。
                データ損失に備えて定期的にバックアップを作成することをお勧めします。
              </p>
              <BackupSettings />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
