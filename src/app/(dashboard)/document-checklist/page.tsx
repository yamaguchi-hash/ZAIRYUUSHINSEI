import { GijinkokuRenewalChecklist } from "@/components/checklist/gijinkoku-renewal-checklist";
import { ListChecks } from "lucide-react";

export const metadata = { title: "必要書類チェックリスト" };

export default function DocumentChecklistPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2 mb-1">
        <ListChecks className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">必要書類チェックリスト</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        技術・人文知識・国際業務｜在留期間更新許可申請。申請条件を選ぶと、本人・所属機関・派遣先が準備すべき書類を一覧表示します。
      </p>

      <GijinkokuRenewalChecklist />
    </div>
  );
}
