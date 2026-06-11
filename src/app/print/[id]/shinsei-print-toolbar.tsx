"use client";

/**
 * 印刷ツールバー（全申請書共通・非印刷エリア）
 * ─────────────────────────────────────────
 * ・「署名日を印刷する」チェックボックス: body.hide-sign-date を切り替え、
 *   署名欄の「令和　年　月　日」の表示/非表示を画面・印刷の両方で制御
 * ・印刷ボタン: window.print() でブラウザの印刷ダイアログ（PDF保存）を起動
 * ・ツールバー全体は .no-print のため印刷時は自動非表示
 */
import { useEffect, useState } from "react";
import Link from "next/link";

export function ShinseiPrintToolbar({ applicationId, label }: { applicationId: string; label: string }) {
  const [printSignDate, setPrintSignDate] = useState(true);

  // 自動印刷（800ms後）
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  // 署名日の表示/非表示（.sign-date を CSS で制御）
  useEffect(() => {
    document.body.classList.toggle("hide-sign-date", !printSignDate);
  }, [printSignDate]);

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

        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          {/* 署名日を印刷する チェックボックス */}
          <CheckToggle
            checked={printSignDate}
            onChange={setPrintSignDate}
            label="署名日を印刷する"
            title="署名欄の「令和　年　月　日」を印刷に含めるかを切り替えます"
          />

          <span style={{ fontSize: "13px", color: "#cbd5e1" }}>|</span>

          {/* 印刷ボタン */}
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

/* ── チェックボックス型トグル ── */
function CheckToggle({ checked, onChange, label, title }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <label
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: "6px",
        fontSize: "13px", fontWeight: 500, cursor: "pointer", userSelect: "none",
        color: checked ? "#1e293b" : "#92400e",
        background: checked ? "transparent" : "#fef3c7",
        border: checked ? "1px solid transparent" : "1px solid #fbbf24",
        borderRadius: "6px", padding: "4px 10px",
        whiteSpace: "nowrap",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: "15px", height: "15px", accentColor: "#2563eb", cursor: "pointer" }}
      />
      {label}
      {!checked && <span style={{ fontSize: "11px", color: "#b45309" }}>（非表示中）</span>}
    </label>
  );
}
