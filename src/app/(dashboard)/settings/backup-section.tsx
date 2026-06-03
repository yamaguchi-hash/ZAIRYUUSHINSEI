"use client";

import { HardDrive } from "lucide-react";
import { BackupSettings } from "@/components/settings/backup-settings";

interface BackupSectionProps {
  userRole?: string;
}

export function BackupSection({ userRole }: BackupSectionProps) {
  // Admin ロールでない場合は表示しない
  if (userRole !== "admin") {
    return null;
  }

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
          <p className="text-sm text-gray-600 mb-6">
            システムのすべての申請人と案件情報をバックアップ・復元できます。
            データ損失に備えて定期的にバックアップを作成することをお勧めします。
          </p>

          <BackupSettings />
        </div>
      </div>
    </div>
  );
}
