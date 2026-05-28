"use client";

import { useState } from "react";
import { MapPin, Loader2, Search } from "lucide-react";

// ─── 分割住所フィールドの型 ───────────────────────────────────────────────────
export interface AddressFields {
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
}

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

// ─── 住所 → 郵便番号（サーバーサイド API ルート経由） ───────────────────────────
// /api/zip-from-address が zipcloud → Nominatim の順で試行する
export async function fetchZipFromAddress(address: string): Promise<string | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(
      `/api/zip-from-address?address=${encodeURIComponent(trimmed)}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    return (json.zipcode as string | null) ?? null;
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

// ─── 住所分割入力コンポーネント（郵便番号→都道府県→市区町村→番地） ─────────────
interface AddressSplitInputProps {
  value: AddressFields;
  onChange: (fields: Partial<AddressFields>) => void;
  /** input の基本クラス */
  inputClassName?: string;
  /** ラベルの基本クラス */
  labelClassName?: string;
  required?: boolean;
}

/**
 * 郵便番号・都道府県・市区町村・番地を分割して入力するコンポーネント。
 * - 郵便番号7桁入力 → 都道府県・市区町村を自動入力（青ボタン）
 * - 都道府県+市区町村+番地入力後 → 〒検索ボタンで郵便番号を逆引き（緑ボタン）
 */
export function AddressSplitInput({
  value,
  onChange,
  inputClassName = "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white",
  labelClassName = "block text-xs font-medium text-gray-600 mb-1",
  required = false,
}: AddressSplitInputProps) {
  const [zipLoading, setZipLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [zipError, setZipError] = useState("");

  function cleanZip(v: string) {
    return v.replace(/[-ー−\s]/g, "");
  }

  /** 郵便番号 → 都道府県・市区町村を自動入力 */
  async function zipToAddress(zipValue: string) {
    setZipLoading(true);
    setZipError("");
    const result = await fetchAddressFromZip(zipValue);
    if (result) {
      onChange({ prefecture: result.prefecture, city: result.city + result.town });
    } else {
      setZipError("該当する住所が見つかりませんでした");
    }
    setZipLoading(false);
  }

  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange({ postalCode: v });
    setZipError("");
    if (cleanZip(v).length === 7) {
      setTimeout(() => zipToAddress(v), 100);
    }
  }

  /** 住所 → 郵便番号を逆引き */
  async function addressToZip() {
    const addr = `${value.prefecture}${value.city}${value.addressLine}`.trim();
    if (!addr) { setZipError("都道府県・市区町村を入力してください"); return; }
    setReverseLoading(true);
    setZipError("");
    const zip = await fetchZipFromAddress(addr);
    if (zip) {
      onChange({ postalCode: zip });
    } else {
      setZipError("郵便番号が見つかりませんでした（都道府県・市区町村まで入力後に検索してください）");
    }
    setReverseLoading(false);
  }

  return (
    <div className="space-y-2">
      {/* 郵便番号 */}
      <div>
        <label className={labelClassName}>
          郵便番号{required && <span className="text-red-500 ml-0.5">*</span>}
          <span className="text-gray-400 font-normal ml-1">（7桁入力で住所を自動入力　例: 1600023）</span>
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={value.postalCode}
            onChange={handleZipChange}
            placeholder="1600023"
            maxLength={8}
            className={inputClassName + " font-mono max-w-[160px]"}
          />
          <button
            type="button"
            onClick={() => zipToAddress(value.postalCode)}
            disabled={zipLoading || cleanZip(value.postalCode).length !== 7}
            title="郵便番号から住所を自動入力"
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {zipLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
            住所入力
          </button>
          <button
            type="button"
            onClick={addressToZip}
            disabled={reverseLoading || !(value.prefecture || value.city)}
            title="住所から郵便番号を自動検索"
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {reverseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            〒検索
          </button>
        </div>
        {zipError && <p className="text-xs text-red-500 mt-1">{zipError}</p>}
      </div>

      {/* 都道府県 + 市区町村 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClassName}>
            都道府県{required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type="text"
            value={value.prefecture}
            onChange={(e) => { onChange({ prefecture: e.target.value }); setZipError(""); }}
            placeholder="東京都"
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName}>
            市区町村{required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type="text"
            value={value.city}
            onChange={(e) => { onChange({ city: e.target.value }); setZipError(""); }}
            placeholder="渋谷区代々木"
            className={inputClassName}
          />
        </div>
      </div>

      {/* 番地・建物・部屋番号 */}
      <div>
        <label className={labelClassName}>
          番地・建物・部屋番号
        </label>
        <input
          type="text"
          value={value.addressLine}
          onChange={(e) => { onChange({ addressLine: e.target.value }); setZipError(""); }}
          placeholder="1-1-1 〇〇ビル 101号室"
          className={inputClassName}
        />
      </div>
    </div>
  );
}
