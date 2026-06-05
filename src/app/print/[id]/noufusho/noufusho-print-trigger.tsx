"use client";

export function NoufushoPrintTrigger({ label }: { label: string }) {
  return (
    <div className="no-print" style={{
      position: "fixed", top: 0, left: 0, right: 0,
      background: "#1e293b", color: "white",
      padding: "10px 24px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      zIndex: 1000, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    }}>
      <span style={{ fontSize: "13px" }}>手数料納付書 — {label}</span>
      <div style={{ display: "flex", gap: "10px" }}>
        <button onClick={() => window.print()} style={{
          background: "#3b82f6", color: "white", border: "none",
          padding: "8px 20px", borderRadius: "6px",
          fontSize: "14px", fontWeight: 600, cursor: "pointer",
        }}>
          🖨️ 印刷 / PDF保存
        </button>
        <button onClick={() => window.close()} style={{
          background: "#64748b", color: "white", border: "none",
          padding: "8px 20px", borderRadius: "6px",
          fontSize: "14px", fontWeight: 600, cursor: "pointer",
        }}>
          閉じる
        </button>
      </div>
    </div>
  );
}
