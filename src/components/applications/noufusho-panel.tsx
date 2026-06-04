"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

// ── 手数料種別の定義 ────────────────────────────────────────────────────────────
const FEE_TYPES = [
  { value: 1, label: "1. 在留資格の変更許可", defaultAmount: 4000 },
  { value: 2, label: "2. 在留期間の更新許可", defaultAmount: 4000 },
  { value: 3, label: "3. 永住許可", defaultAmount: 8000 },
  { value: 4, label: "4. 再入国の許可（一回限り）", defaultAmount: 3000 },
  { value: 5, label: "5. 特定登録者カードの交付", defaultAmount: 4000 },
  { value: 6, label: "6. 特定登録者カードの再交付", defaultAmount: 4000 },
  { value: 7, label: "7. 就労資格証明書の交付", defaultAmount: 1200 },
  { value: 8, label: "8. 在留カードの再交付", defaultAmount: 1600 },
  { value: 9, label: "9. 難民旅行証明書の交付", defaultAmount: 5000 },
] as const;

interface NoufushoPanelProps {
  applicationId: string;
  applicantName?: string;
}

export function NoufushoPanel({ applicationId, applicantName }: NoufushoPanelProps) {
  const [feeType, setFeeType] = useState<number>(1);
  const [amount, setAmount] = useState<number>(4000);
  const [amountOverride, setAmountOverride] = useState<string>("");
  const [payerName, setPayerName] = useState(applicantName ?? "");
  const [applicationNumber, setApplicationNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleFeeTypeChange(value: number) {
    setFeeType(value);
    const found = FEE_TYPES.find((f) => f.value === value);
    if (found) {
      setAmount(found.defaultAmount);
      setAmountOverride("");
    }
  }

  function handleAmountOverride(value: string) {
    setAmountOverride(value);
    const parsed = parseInt(value.replace(/,/g, ""), 10);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    } else if (value === "") {
      const found = FEE_TYPES.find((f) => f.value === feeType);
      if (found) setAmount(found.defaultAmount);
    }
  }

  async function handleDownload() {
    if (!payerName.trim()) {
      setError("納付者氏名を入力してください");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/applications/${applicationId}/noufusho`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeType,
          amount,
          payerName: payerName.trim(),
          applicationNumber: applicationNumber.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "納付書の作成に失敗しました");
      }

      // ダウンロード処理
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Content-Disposition からファイル名を取得
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''(.+)/);
      a.download = fileNameMatch
        ? decodeURIComponent(fileNameMatch[1])
        : `納付書_${applicationId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  const effectiveAmount = amountOverride
    ? parseInt(amountOverride.replace(/,/g, ""), 10) || amount
    : amount;

  return (
    <div className="space-y-4">
      {/* 手数料の種類 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          手数料の種類
        </label>
        <select
          value={feeType}
          onChange={(e) => handleFeeTypeChange(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {FEE_TYPES.map((ft) => (
            <option key={ft.value} value={ft.value}>
              {ft.label}
            </option>
          ))}
        </select>
      </div>

      {/* 金額 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            金額（自動設定）
          </label>
          <div className="text-lg font-semibold text-gray-900">
            {effectiveAmount.toLocaleString("ja-JP")} 円
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            金額を手動で変更
          </label>
          <input
            type="text"
            value={amountOverride}
            onChange={(e) => handleAmountOverride(e.target.value)}
            placeholder={amount.toLocaleString("ja-JP")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 納付者氏名 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          納付者氏名
        </label>
        <input
          type="text"
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          placeholder="例：山田太郎"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* 申請番号 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          申請番号（任意）
        </label>
        <input
          type="text"
          value={applicationNumber}
          onChange={(e) => setApplicationNumber(e.target.value)}
          placeholder="番号がある場合に入力"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* エラー表示 */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* ダウンロードボタン */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileDown className="w-4 h-4" />
        )}
        {loading ? "作成中..." : "納付書を作成"}
      </button>
    </div>
  );
}
