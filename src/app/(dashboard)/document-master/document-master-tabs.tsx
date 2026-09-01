"use client";

import { useState } from "react";
import { FileCheck, ListChecks } from "lucide-react";
import { DocumentMasterClient } from "./document-master-client";
import { GijinkokuRenewalChecklist } from "@/components/checklist/gijinkoku-renewal-checklist";
import { KazokuTairyuCoeChecklist } from "@/components/checklist/kazoku-tairyu-coe-checklist";

type Tab = "master" | "gijinkoku_renewal" | "kazoku_tairyu_coe";

const TABS: { key: Tab; label: string; icon: typeof FileCheck }[] = [
  { key: "master", label: "基本設定", icon: FileCheck },
  { key: "gijinkoku_renewal", label: "技人国・在留期間更新 チェックリスト", icon: ListChecks },
  { key: "kazoku_tairyu_coe", label: "家族滞在・COE チェックリスト", icon: ListChecks },
];

export function DocumentMasterTabs() {
  const [tab, setTab] = useState<Tab>("master");

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "master" && <DocumentMasterClient />}

      {tab === "gijinkoku_renewal" && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            技術・人文知識・国際業務｜在留期間更新許可申請。申請条件を選ぶと、本人・所属機関・派遣先が準備すべき書類を一覧表示します。書類の追加・編集もこの画面から直接行えます。
          </p>
          <GijinkokuRenewalChecklist />
        </div>
      )}

      {tab === "kazoku_tairyu_coe" && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            家族滞在｜在留資格認定証明書交付申請。案件情報と条件を選ぶと、申請人・扶養者・申請代理人が準備すべき書類を一覧表示します。書類の追加・編集もこの画面から直接行えます。
          </p>
          <KazokuTairyuCoeChecklist />
        </div>
      )}
    </div>
  );
}
