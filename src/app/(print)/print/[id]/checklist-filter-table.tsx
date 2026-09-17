"use client";

import { useMemo, useState } from "react";

export interface ChecklistPrintItem {
  id: string;
  documentName: string;
  masterOriginalOrCopy: string | null;
  preparedBy: string | null;
  status: string;
  masterDescription: string | null;
  expertNotes: string | null;
  docNumber: number | null;
}

const STATUS_OPTIONS = [
  { value: "not_submitted", label: "未提出" },
  { value: "submitted", label: "提出済" },
  { value: "approved", label: "確認済" },
  { value: "resubmit_required", label: "再提出" },
] as const;

const UNSET_PREPARED_BY = "__unset__";

/** チェックボックス1つ分（選択中は色付きのピル表示） */
function FilterChip({
  label, checked, onToggle, activeColor,
}: { label: string; checked: boolean; onToggle: () => void; activeColor: string }) {
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        fontSize: "12px", cursor: "pointer", padding: "2px 8px", borderRadius: "999px",
        whiteSpace: "nowrap",
        color: checked ? activeColor : "#334155",
        background: checked ? `${activeColor}14` : "#fff",
        border: `1px solid ${checked ? activeColor : "#e2e8f0"}`,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ accentColor: activeColor, margin: 0 }}
      />
      {label}
    </label>
  );
}

export function ChecklistFilterTable({ items }: { items: ChecklistPrintItem[] }) {
  // 空集合 = 条件なし（すべて表示）。複数選択した場合は、いずれかに一致すれば表示（OR）。
  const [filterPreparedBy, setFilterPreparedBy] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());

  const preparedByOptions = useMemo(() => {
    const set = new Set<string>();
    let hasUnset = false;
    for (const it of items) {
      if (it.preparedBy && it.preparedBy.trim()) set.add(it.preparedBy);
      else hasUnset = true;
    }
    const opts = [...set].sort((a, b) => a.localeCompare(b, "ja"));
    return hasUnset ? [...opts, UNSET_PREPARED_BY] : opts;
  }, [items]);

  function toggle(setFn: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterPreparedBy.size > 0) {
        const key = it.preparedBy && it.preparedBy.trim() ? it.preparedBy : UNSET_PREPARED_BY;
        if (!filterPreparedBy.has(key)) return false;
      }
      if (filterStatus.size > 0 && !filterStatus.has(it.status)) return false;
      return true;
    });
  }, [items, filterPreparedBy, filterStatus]);

  const isFiltering = filterPreparedBy.size > 0 || filterStatus.size > 0;

  return (
    <>
      {/* 担当・状態フィルター（複数選択可・画面表示のみ） */}
      <div
        className="no-print"
        style={{
          background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
          padding: "8px 14px", marginBottom: "12px", fontSize: "13px",
          display: "flex", flexDirection: "column", gap: "6px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ color: "#475569", fontWeight: 600, minWidth: "42px" }}>担当：</span>
          {preparedByOptions.length === 0 ? (
            <span style={{ color: "#94a3b8", fontSize: "12px" }}>（該当なし）</span>
          ) : preparedByOptions.map((p) => (
            <FilterChip
              key={p}
              label={p === UNSET_PREPARED_BY ? "（未設定）" : p}
              checked={filterPreparedBy.has(p)}
              onToggle={() => toggle(setFilterPreparedBy, p)}
              activeColor="#7c3aed"
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ color: "#475569", fontWeight: 600, minWidth: "42px" }}>状態：</span>
          {STATUS_OPTIONS.map((s) => (
            <FilterChip
              key={s.value}
              label={s.label}
              checked={filterStatus.has(s.value)}
              onToggle={() => toggle(setFilterStatus, s.value)}
              activeColor="#2563eb"
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ color: "#64748b" }}>
            表示中：{filtered.length} / {items.length} 件
          </span>
          <span style={{ color: "#94a3b8", fontSize: "11px" }}>
            ※ 未選択の項目は絞り込みなし（すべて表示）。複数選択すると、いずれかに一致する書類を表示します。
          </span>
          {isFiltering && (
            <button
              type="button"
              onClick={() => { setFilterPreparedBy(new Set()); setFilterStatus(new Set()); }}
              style={{ marginLeft: "auto", fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              条件をクリア
            </button>
          )}
        </div>
      </div>

      {/* チェックリスト */}
      <table className="checklist">
        <thead>
          <tr>
            <th className="col-no center">No.</th>
            <th className="col-check center">□</th>
            <th>書類名</th>
            <th className="col-prepared center">担当</th>
            <th className="col-status center">状態</th>
            <th className="col-notes">備考</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "#94a3b8" }}>
                必要書類が登録されていません
              </td>
            </tr>
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "#94a3b8" }}>
                条件に一致する書類がありません
              </td>
            </tr>
          ) : filtered.map((item) => (
            <tr key={item.id}>
              <td className="col-no">{item.docNumber ?? "—"}</td>
              <td className="col-check">
                {item.status === "approved" ? "✓" :
                 item.status === "submitted" ? "◎" : "□"}
              </td>
              <td className="col-doc">
                <div className="doc-name">
                  {item.documentName}
                  {item.masterOriginalOrCopy && (
                    <span style={{ marginLeft: "6px", fontSize: "9px", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "3px", padding: "0 4px", whiteSpace: "nowrap" }}>
                      {item.masterOriginalOrCopy}
                    </span>
                  )}
                </div>
              </td>
              <td className="col-prepared">{item.preparedBy ?? ""}</td>
              <td className="col-status">
                {item.status === "approved" ? <span className="status-ok">確認済</span> :
                 item.status === "submitted" ? <span className="status-submitted">提出済</span> :
                 item.status === "resubmit_required" ? <span className="status-resubmit">再提出</span> :
                 <span className="status-pending">未提出</span>}
              </td>
              <td className="col-notes">
                <div className="notes-cell">
                  {item.masterDescription && <div>{item.masterDescription}</div>}
                  {item.expertNotes && <div>{item.expertNotes}</div>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 凡例 */}
      <div className="legend">
        <span>□ 未提出</span>
        <span>◎ 提出済（確認中）</span>
        <span>✓ 確認済</span>
      </div>

      {/* 合計（表示中の件数を基準） */}
      <div className="total-row">
        必要書類合計：{filtered.length} 件　／
        提出済：{filtered.filter((i) => i.status !== "not_submitted").length} 件
      </div>
    </>
  );
}
