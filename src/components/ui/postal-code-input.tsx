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

// ─── 簡易住所分割入力（1つの string フィールドを都道府県/市区町村/番地以降に分割）──
// 既存のデータが「東京都渋谷区代々木1-1-1」のような1行形式のフィールドに使う
// 内部で都道府県/市区町村+町名/番地以降に分割して入力し、結合して onChange に返す

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

/** 住所文字列から都道府県を抽出 */
function extractPrefecture(address: string): { prefecture: string; rest: string } {
  for (const pref of PREFECTURES) {
    if (address.startsWith(pref)) {
      return { prefecture: pref, rest: address.slice(pref.length) };
    }
  }
  return { prefecture: "", rest: address };
}

/** 残りの住所から市区町村部分を抽出 */
function extractCity(rest: string): { city: string; addressLine: string } {
  const cityPatterns = [
    /^(.+?市.+?区)/,     // 政令指定都市（例: 横浜市港北区）
    /^(.+?[市])/,         // 普通の市
    /^(.+?郡.+?[町村])/,  // 郡+町村
    /^(.+?[区])/,         // 東京23区
    /^(.+?[町村])/,       // 町村
  ];

  for (const pattern of cityPatterns) {
    const match = rest.match(pattern);
    if (match) {
      return { city: match[1], addressLine: rest.slice(match[1].length) };
    }
  }

  return { city: "", addressLine: rest };
}

interface AddressSplitSimpleProps {
  value: string;
  onChange: (value: string) => void;
  inputClassName?: string;
  labelClassName?: string;
  labelPrefix?: string;
}

/**
 * 1つの住所 string を郵便番号 / 都道府県 / 市区町村 / 番地以降に分割して入力するコンポーネント。
 * 郵便番号7桁入力で都道府県・市区町村を自動入力。
 * 住所入力後に〒検索で郵便番号を逆引き。
 */
export function AddressSplitSimple({
  value,
  onChange,
  inputClassName = "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white",
  labelClassName = "block text-xs font-medium text-gray-600 mb-1",
  labelPrefix = "",
}: AddressSplitSimpleProps) {
  const [zipCode, setZipCode] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [zipError, setZipError] = useState("");

  const { prefecture, rest } = extractPrefecture(value || "");
  const { city, addressLine } = extractCity(rest);

  function handleChange(pref: string, ct: string, addr: string) {
    onChange(`${pref}${ct}${addr}`);
  }

  function cleanZip(v: string) {
    return v.replace(/[-ー−\s]/g, "");
  }

  /** 郵便番号 → 都道府県・市区町村を自動入力 */
  async function zipToAddress(zipValue: string) {
    setZipLoading(true);
    setZipError("");
    const result = await fetchAddressFromZip(zipValue);
    if (result) {
      handleChange(result.prefecture, result.city + result.town, addressLine);
    } else {
      setZipError("該当する住所が見つかりませんでした");
    }
    setZipLoading(false);
  }

  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setZipCode(v);
    setZipError("");
    if (cleanZip(v).length === 7) {
      setTimeout(() => zipToAddress(v), 100);
    }
  }

  /** 住所 → 郵便番号を逆引き */
  async function addressToZip() {
    const addr = `${prefecture}${city}${addressLine}`.trim();
    if (!addr) { setZipError("都道府県・市区町村を入力してください"); return; }
    setReverseLoading(true);
    setZipError("");
    const zip = await fetchZipFromAddress(addr);
    if (zip) {
      setZipCode(zip);
    } else {
      setZipError("郵便番号が見つかりませんでした");
    }
    setReverseLoading(false);
  }

  return (
    <div className="space-y-2">
      {/* 郵便番号 */}
      <div>
        <label className={labelClassName}>
          {labelPrefix}郵便番号
          <span className="text-gray-400 font-normal ml-1">（7桁入力で住所を自動入力）</span>
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={zipCode}
            onChange={handleZipChange}
            placeholder="1600023"
            maxLength={8}
            className={inputClassName + " font-mono max-w-[160px]"}
          />
          <button
            type="button"
            onClick={() => zipToAddress(zipCode)}
            disabled={zipLoading || cleanZip(zipCode).length !== 7}
            title="郵便番号から住所を自動入力"
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {zipLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
            住所入力
          </button>
          <button
            type="button"
            onClick={addressToZip}
            disabled={reverseLoading || !(prefecture || city)}
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
          <label className={labelClassName}>{labelPrefix}都道府県</label>
          <select
            value={prefecture}
            onChange={(e) => { handleChange(e.target.value, city, addressLine); setZipError(""); }}
            className={inputClassName}
          >
            <option value="">選択してください</option>
            {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClassName}>{labelPrefix}市区町村</label>
          <input
            type="text"
            value={city}
            onChange={(e) => { handleChange(prefecture, e.target.value, addressLine); setZipError(""); }}
            placeholder="渋谷区"
            className={inputClassName}
          />
        </div>
      </div>

      {/* 番地・建物・部屋番号 */}
      <div>
        <label className={labelClassName}>{labelPrefix}番地・建物・部屋番号</label>
        <input
          type="text"
          value={addressLine}
          onChange={(e) => { handleChange(prefecture, city, e.target.value); setZipError(""); }}
          placeholder="代々木1-1-1 〇〇ビル101号室"
          className={inputClassName}
        />
      </div>
    </div>
  );
}
