"use client";

import { AlertTriangle, XCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Issue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ConsistencyCheckPanelProps {
  issues: Issue[];
  applicationId: string;
}

export function ConsistencyCheckPanel({ issues, applicationId }: ConsistencyCheckPanelProps) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5" />
          整合性チェック結果 — {issues.length}件の問題
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {errors.map((issue, i) => (
          <div
            key={i}
            className="flex items-start gap-2 bg-white border border-red-200 rounded-lg p-3"
          >
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-700">{issue.field}</p>
              <p className="text-sm text-red-600">{issue.message}</p>
            </div>
          </div>
        ))}
        {warnings.map((issue, i) => (
          <div
            key={i}
            className="flex items-start gap-2 bg-white border border-yellow-200 rounded-lg p-3"
          >
            <Info className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-yellow-700">{issue.field}</p>
              <p className="text-sm text-yellow-600">{issue.message}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
