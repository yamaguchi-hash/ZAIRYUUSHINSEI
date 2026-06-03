"use client";

import { Suspense } from "react";
import { HardDrive } from "lucide-react";
import { BackupSettings } from "@/components/settings/backup-settings";

export function BackupSection() {
  return (
    <div>
      <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ borderTop: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb", borderLeft: "1px solid #e5e7eb", borderRadius: "0.5rem", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "1rem", borderBottom: "1px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
              <HardDrive style={{ width: "1rem", height: "1rem" }} />
              バックアップ・復元（管理者）
            </h3>
          </div>

          {/* Content */}
          <div style={{ padding: "1.5rem" }}>
            <p style={{ fontSize: "0.875rem", color: "#4b5563", marginBottom: "1.5rem" }}>
              システムのすべての申請人と案件情報をバックアップ・復元できます。
              データ損失に備えて定期的にバックアップを作成することをお勧めします。
            </p>

            <Suspense fallback={<p>読み込み中...</p>}>
              <BackupSettings />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
