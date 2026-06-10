"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function ShinseiPrintToolbar({ applicationId, label }: { applicationId: string; label: string }) {
  const [showSignDate, setShowSignDate] = useState(true);
  const [showDob, setShowDob] = useState(true);

  // 自動印刷（800ms後）
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  // 署名日の表示/非表示
  useEffect(() => {
    document.body.classList.toggle("hide-sign-date", !showSignDate);
  }, [showSignDate]);

  // 生年月日の表示/非表示
  useEffect(() => {
    document.body.classList.toggle("hide-dob", !showDob);
  }, [showDob]);

  return (
    <div className="no-print" style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      background: "white", borderBottom: "1px solid #e2e8f0",
      boxShadow: "0 1px 4px rgba(0,0,0,0.08)", padding: "8px 20px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href={`/applications/${applicationId}/shinsei-form`}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "#475569", textDecoration: "none" }}>
            ← 申請書に戻る
          </Link>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{label}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* 署名日 表示/非表示 */}
          <ToggleButton
            active={showSignDate}
            onToggle={() => setShowSignDate(v => !v)}
            labelOn="署名日：表示"
            labelOff="署名日：非表示"
            title={showSignDate ? "署名日の「年　月　日」を非表示にする" : "署名日の「年　月　日」を表示する"}
          />

          {/* 生年月日 表示/非表示 */}
          <ToggleButton
            active={showDob}
            onToggle={() => setShowDob(v => !v)}
            labelOn="生年月日：表示"
            labelOff="生年月日：非表示"
            title={showDob ? "生年月日を非表示にする" : "生年月日を表示する"}
          />

          <span style={{ fontSize: "13px", color: "#cbd5e1" }}>|</span>

          <button onClick={() => window.print()} style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "#2563eb", color: "white", border: "none", borderRadius: "6px",
            padding: "6px 14px", fontSize: "13px", fontWeight: 500, cursor: "pointer",
          }}>
            🖨 印刷 / PDFに保存
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 小さなトグルボタン ── */
function ToggleButton({ active, onToggle, labelOn, labelOff, title }: {
  active: boolean; onToggle: () => void; labelOn: string; labelOff: string; title: string;
}) {
  return (
    <button onClick={onToggle} title={title} style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      background: active ? "#f8fafc" : "#fef3c7",
      color: active ? "#475569" : "#92400e",
      border: active ? "1px solid #e2e8f0" : "1px solid #fbbf24",
      borderRadius: "6px", padding: "5px 12px",
      fontSize: "12px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
    }}>
      {active ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
      )}
      {active ? labelOn : labelOff}
    </button>
  );
}
