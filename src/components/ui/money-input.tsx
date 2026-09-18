"use client";

/**
 * 金額入力欄。表示上は3桁区切りのカンマを入れ、保持する値は数字のみの
 * 文字列（例: "10000000"）のまま維持する（印刷側のfmtMoney()やDB保存形式と揃える）。
 * 入力中（フォーカス中）はカンマなしの生の数字で編集し、フォーカスを外すと
 * カンマ区切り表示に戻る。
 */
import { useState } from "react";

function formatWithCommas(digits: string): string {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  name,
}: {
  /** 文字列を想定しているが、AI自動入力等で数値がそのまま保存されているケースもあるため許容する */
  value: string | number | null | undefined;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
}) {
  const [focused, setFocused] = useState(false);
  const digits = String(value ?? "").replace(/[^\d]/g, "");

  return (
    <input
      type="text"
      inputMode="numeric"
      name={name}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={focused ? digits : formatWithCommas(digits)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
    />
  );
}
