"use client";

import { useState } from "react";
import { MapPin, Loader2, Search } from "lucide-react";

export interface ZipResult {
  prefecture: string;
  city: string;
  town: string;
}

// ─── 郵便番号 → 住所 ─────────────────────────────────────────────────────────
export async function fetchAddressFromZip(zip: string): Promise<ZipResult | null> {
  const clean = zip.replace(/[-ー−\s]/g, "");
  if (clean.length !== 7) return null;
  try {
    const res = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${clean}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    const r = json.results?.[0];
    if (!r) return null;
    return { prefecture: r.address1 ?? "", city: r.address2 ?? "", town: r.address3 ?? "" };
  } catch {
    return null;
  }
}

// ─── 住所 → 郵便番号（zipcloud address search） ──────────────────────────────
export async function fetchZipFromAddress(address: string): Promise<string | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?address=${encodeURIComponent(trimmed)}&limit=1`,
      { cache: "no-store" }
    );
    const json = await res.json();
    const zip = json.results?.[0]?.zipcode as string | undefined;
    if (!zip) return null;
    // 7桁 → "123-4567" 形式
    return zip.length === 7 ? `${zip.slice(0, 3)}-${zip.slice(3)}` : zip;
  } catch {
    return null;
  }
}

// ─── 郵便番号入力コンポーネント（zip → 住所自動入力） ───────────────────────────
interface PostalCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onAddressFound: (result: ZipResult) => void;
  placeholder?: string;
  inputClassName?: string;
}

export function PostalCodeInput({
  value,
  onChange,
  onAddressFound,
  placeholder = "1234567",
  inputClassName = "",
}: PostalCodeInputProps) {
  const [isLooking, setIsLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");

  function clean(v: string) {
    return v.replace(/[-ー−\s]/g, "");
  }

  async function lookup(zip: string) {
    setIsLooking(true);
    setLookupError("");
    const result = await fetchAddressFromZip(zip);
    if (result) {
      onAddressFound(result);
    } else {
      setLookupError("該当する住所が見つかりませんでした");
    }
    setIsLooking(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setLookupError("");
    if (clean(v).length === 7) {
      setTimeout(() => lookup(v), 100);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          maxLength={8}
          className={inputClassName}
        />
        <button
          type="button"
          onClick={() => lookup(value)}
          disabled={isLooking || clean(value).length !== 7}
          title="郵便番号から住所を自動入力"
          className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {isLooking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
          住所入力
        </button>
      </div>
      {lookupError && <p className="text-xs text-red-500">{lookupError}</p>}
    </div>
  );
}

// ─── 住所入力 + 郵便番号逆引きボタン ─────────────────────────────────────────
interface AddressInputProps {
  addressValue: string;
  onAddressChange: (v: string) => void;
  postalValue: string;
  onPostalChange: (v: string) => void;
  onAddressFound?: (result: ZipResult) => void;
  addressPlaceholder?: string;
  inputClassName?: string;
  /** 住所と郵便番号を縦に並べる場合 true（デフォルト false = 横並び） */
  stacked?: boolean;
}

/**
 * 住所入力 + 郵便番号入力 の組み合わせコンポーネント。
 * - 郵便番号7桁 → 住所自動入力
 * - 住所テキスト → 郵便番号を自動検索
 */
export function AddressWithZip({
  addressValue,
  onAddressChange,
  postalValue,
  onPostalChange,
  onAddressFound,
  addressPlaceholder = "〒 自動入力後、番地・号を追記してください",
  inputClassName = "",
}: AddressInputProps) {
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState("");

  async function reverseZipLookup() {
    if (!addressValue.trim()) {
      setZipError("住所を入力してください");
      return;
    }
    setZipLoading(true);
    setZipError("");
    const zip = await fetchZipFromAddress(addressValue);
    if (zip) {
      onPostalChange(zip);
    } else {
      setZipError("郵便番号が見つかりませんでした（都道府県・市区町村まで入力してください）");
    }
    setZipLoading(false);
  }

  return (
    <div className="space-y-2">
      {/* 郵便番号行 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          郵便番号
          <span className="text-gray-400 font-normal ml-1">（7桁入力で住所を自動入力）</span>
        </label>
        <PostalCodeInput
          value={postalValue}
          onChange={onPostalChange}
          onAddressFound={(r) => {
            onAddressChange(r.prefecture + r.city + r.town);
            onAddressFound?.(r);
          }}
          placeholder="1234567"
          inputClassName={inputClassName || "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white font-mono"}
        />
      </div>

      {/* 住所行 */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          住所
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={addressValue}
            onChange={(e) => { onAddressChange(e.target.value); setZipError(""); }}
            placeholder={addressPlaceholder}
            className={inputClassName || "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"}
          />
          <button
            type="button"
            onClick={reverseZipLookup}
            disabled={zipLoading || !addressValue.trim()}
            title="住所から郵便番号を自動入力"
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
          >
            {zipLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            〒検索
          </button>
        </div>
        {zipError && <p className="text-xs text-red-500 mt-1">{zipError}</p>}
      </div>
    </div>
  );
}
