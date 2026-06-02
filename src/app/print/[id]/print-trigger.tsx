"use client";

import { useEffect, useState } from "react";
import { Printer, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export function PrintTrigger({ applicationId }: { applicationId: string }) {
  const [showDate, setShowDate] = useState(true);

  // 自動印刷（800ms後）
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  // 年月日の表示/非表示を body クラスで制御
  useEffect(() => {
    if (showDate) {
      document.body.classList.remove("hide-sign-date");
    } else {
      document.body.classList.add("hide-sign-date");
    }
  }, [showDate]);

  return (
    <div
      className="no-print"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "white",
        borderBottom: "1px solid #e2e8f0",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        padding: "10px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      {/* 戻るリンク */}
      <Link
        href={`/applications/${applicationId}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "14px",
          color: "#475569",
          textDecoration: "none",
        }}
      >
        <ArrowLeft style={{ width: "16px", height: "16px" }} />
        申請案件に戻る
      </Link>

      {/* 中央: 操作ボタン群 */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>

        {/* 署名日・年月日 表示/非表示トグル */}
        <button
          onClick={() => setShowDate(v => !v)}
          title={showDate ? "署名日の「年　月　日」を非表示にする" : "署名日の「年　月　日」を表示する"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: showDate ? "#f8fafc" : "#fef3c7",
            color: showDate ? "#475569" : "#92400e",
            border: showDate ? "1px solid #e2e8f0" : "1px solid #fbbf24",
            borderRadius: "8px",
            padding: "6px 14px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {showDate
            ? <><Eye style={{ width: "15px", height: "15px" }} />署名日の年月日：表示中</>
            : <><EyeOff style={{ width: "15px", height: "15px" }} />署名日の年月日：非表示</>
          }
        </button>

        <span style={{ fontSize: "13px", color: "#94a3b8" }}>|</span>
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          印刷ダイアログが開きます。「PDFに保存」を選択してください。
        </span>

        {/* 印刷ボタン */}
        <button
          onClick={() => window.print()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <Printer style={{ width: "16px", height: "16px" }} />
          印刷 / PDFに保存
        </button>
      </div>
    </div>
  );
}
