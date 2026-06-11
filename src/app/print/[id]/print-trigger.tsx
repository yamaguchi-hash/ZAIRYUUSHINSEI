"use client";

import { useEffect, useState, useCallback } from "react";
import { Printer, ArrowLeft, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

/** 省略可能セクションのキーとラベル */
const OMITTABLE_SECTIONS = [
  { key: "vCompliance1", label: "コンプライアンス(11)-(21)" },
  { key: "vCompliance2", label: "コンプライアンス(22)-(33)" },
  { key: "vDispatch",    label: "派遣先・職業紹介・取次機関" },
  { key: "vPlacement",   label: "職業紹介事業者" },
  { key: "vIntermediary", label: "取次機関" },
  { key: "vRso",         label: "登録支援機関（詳細）" },
  { key: "vWorkHistory", label: "職歴" },
] as const;

export function PrintTrigger({ applicationId }: { applicationId: string }) {
  const [showDate, setShowDate] = useState(true);
  const [omitSections, setOmitSections] = useState<Record<string, boolean>>({});
  const [showOmitPanel, setShowOmitPanel] = useState(false);

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

  // 省略セクションの body クラス制御
  useEffect(() => {
    for (const s of OMITTABLE_SECTIONS) {
      if (omitSections[s.key]) {
        document.body.classList.add(`omit-${s.key}`);
      } else {
        document.body.classList.remove(`omit-${s.key}`);
      }
    }
  }, [omitSections]);

  const toggleOmit = useCallback((key: string) => {
    setOmitSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const omitCount = Object.values(omitSections).filter(Boolean).length;

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
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
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
              ? <><Eye style={{ width: "15px", height: "15px" }} />署名日：表示</>
              : <><EyeOff style={{ width: "15px", height: "15px" }} />署名日：非表示</>
            }
          </button>

          {/* 省略可能セクション トグル */}
          <button
            onClick={() => setShowOmitPanel(v => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: omitCount > 0 ? "#fef3c7" : "#f8fafc",
              color: omitCount > 0 ? "#92400e" : "#475569",
              border: omitCount > 0 ? "1px solid #fbbf24" : "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            省略可能{omitCount > 0 ? `（${omitCount}件省略中）` : ''}
            {showOmitPanel
              ? <ChevronUp style={{ width: "14px", height: "14px" }} />
              : <ChevronDown style={{ width: "14px", height: "14px" }} />
            }
          </button>

          <span style={{ fontSize: "13px", color: "#94a3b8" }}>|</span>

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

      {/* 日付・URLの印字をオフにする案内 */}
      <div style={{ marginTop: "6px", fontSize: "11px", color: "#94a3b8" }}>
        ※ 印刷ダイアログの「詳細設定」→「ヘッダーとフッター」のチェックを外すと、日付やURLが印刷されなくなります
      </div>

      {/* 省略可能パネル */}
      {showOmitPanel && (
        <div style={{
          marginTop: "8px",
          padding: "10px 16px",
          background: "#f8fafc",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 16px",
        }}>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, lineHeight: "28px" }}>
            省略可能セクション：
          </span>
          {OMITTABLE_SECTIONS.map(s => (
            <label
              key={s.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                color: omitSections[s.key] ? "#dc2626" : "#334155",
                cursor: "pointer",
                padding: "2px 8px",
                borderRadius: "4px",
                background: omitSections[s.key] ? "#fef2f2" : "transparent",
                border: omitSections[s.key] ? "1px solid #fecaca" : "1px solid transparent",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={!!omitSections[s.key]}
                onChange={() => toggleOmit(s.key)}
                style={{ accentColor: "#dc2626" }}
              />
              {omitSections[s.key] ? `${s.label}（省略）` : s.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
