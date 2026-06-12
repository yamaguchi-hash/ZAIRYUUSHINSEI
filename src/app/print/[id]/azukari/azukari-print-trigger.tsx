"use client";

export function AzukariPrintTrigger({ applicantName, title = "在留カード預証" }: { applicantName: string; title?: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        background: "#1e293b",
        color: "white",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 1000,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
      className="no-print"
    >
      <span style={{ fontSize: "13px" }}>
        {title} — {applicantName}
      </span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => window.print()}
            style={{
              background: "#3b82f6",
              color: "white",
              border: "none",
              padding: "8px 20px",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🖨️ 印刷 / PDF保存
          </button>
          <button
            onClick={() => window.close()}
            style={{
              background: "#64748b",
              color: "white",
              border: "none",
              padding: "8px 20px",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </div>
        {/* 日付・URLの印字をオフにする案内 */}
        <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
          ※ 印刷ダイアログの「詳細設定」→「ヘッダーとフッター」のチェックを外すと、日付やURLが印刷されなくなります
        </div>
      </div>
    </div>
  );
}
