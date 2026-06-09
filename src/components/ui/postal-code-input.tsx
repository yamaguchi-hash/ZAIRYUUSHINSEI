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
 *
 * UI は2セクション：住所（都道府県・市区町村）と詳細住所（丁目・番地・建物・部屋番号）
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

  // ── town / block を独立した内部 state で管理 ──
  // addressLine の初期値から1回だけ分割し、以降は各フィールドの onChange で個別に更新
  const [internalTown, setInternalTown] = useState(() => extractTown(value.addressLine).town);
  const [internalBlock, setInternalBlock] = useState(() => extractTown(value.addressLine).block);

  // フィールド1（都道府県・市区町村・町名）の表示値
  const field1Value = `${value.prefecture}${value.city}${internalTown}`;

  function cleanZip(v: string) {
    return v.replace(/[-ー−\s]/g, "");
  }

  /** 郵便番号 → 都道府県・市区町村・町名を自動入力 */
  async function zipToAddress(zipValue: string) {
    setZipLoading(true);
    setZipError("");
    const result = await fetchAddressFromZip(zipValue);
    if (result) {
      setInternalTown(result.town);
      onChange({ prefecture: result.prefecture, city: result.city, addressLine: result.town + internalBlock });
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
    const addr = `${value.prefecture}${value.city}${internalTown}`.trim();
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
    <div className="space-y-3">
      {/* 郵便番号 */}
      <div>
        <label className={labelClassName}>
          郵便番号{required && <span className="text-red-500 ml-0.5">*</span>}
          <span className="text-gray-400 font-normal ml-1">（7桁入力で住所を自動入力）</span>
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
            disabled={reverseLoading || !(value.prefecture && value.city)}
            title="住所から郵便番号を自動検索"
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {reverseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            〒検索
          </button>
        </div>
        {zipError && <p className="text-xs text-red-500 mt-1">{zipError}</p>}
      </div>

      {/* 住所（都道府県・市区町村・町名） */}
      <div>
        <label className={labelClassName}>
          都道府県・市区町村・町名{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <input
          type="text"
          value={field1Value}
          onChange={(e) => {
            const fullAddr = e.target.value;
            const prefMatch = PREFECTURES.find(p => fullAddr.startsWith(p));
            if (prefMatch) {
              const afterPref = fullAddr.substring(prefMatch.length);
              const cityMatch = afterPref.match(/^(.+?[市区町村郡])/);
              if (cityMatch) {
                const cityVal = cityMatch[1];
                const townVal = afterPref.substring(cityVal.length);
                setInternalTown(townVal);
                onChange({ prefecture: prefMatch, city: cityVal, addressLine: townVal + internalBlock });
              } else {
                onChange({ prefecture: prefMatch, city: afterPref, addressLine: internalBlock });
              }
            } else {
              onChange({ prefecture: fullAddr, city: "", addressLine: internalBlock });
            }
            setZipError("");
          }}
          placeholder="埼玉県三郷市彦成"
          className={inputClassName}
        />
      </div>

      {/* 丁目・番地・建物・部屋番号 */}
      <div>
        <label className={labelClassName}>丁目・番地・建物・部屋番号</label>
        <input
          type="text"
          value={internalBlock}
          onChange={(e) => {
            const newBlock = e.target.value;
            setInternalBlock(newBlock);
            onChange({ addressLine: internalTown + newBlock });
            setZipError("");
          }}
          placeholder="1丁目319番地6"
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

/** addressLine から町名と丁目以降を分割（最初の数字の直前で分割）
 *  例: "彦成1丁目319番地6" → town: "彦成", block: "1丁目319番地6"
 *  例: "代々木1-1-1"       → town: "代々木", block: "1-1-1"
 *  例: "売布4-3-30"        → town: "売布", block: "4-3-30"
 */
function extractTown(addressLine: string): { town: string; block: string } {
  // 最初の数字（半角・全角）の直前で分割
  const match = addressLine.match(/^([^0-9０-９]*)/);
  const town = match ? match[1] : "";
  const block = addressLine.slice(town.length);
  return { town, block };
}

interface AddressSplitSimpleProps {
  value: string;
  onChange: (value: string) => void;
  inputClassName?: string;
  labelClassName?: string;
  labelPrefix?: string;
}

// ── 郵便番号を住所文字列に埋め込む/取り出すユーティリティ ──────────────────
// 形式: "〒1234567|東京都渋谷区..." → zipCode="1234567", address="東京都渋谷区..."
const ZIP_PREFIX_RE = /^〒(\d{7})\|/;

function parseZipFromValue(value: string): { zipCode: string; address: string } {
  const m = (value || "").match(ZIP_PREFIX_RE);
  if (m) return { zipCode: m[1], address: value.slice(m[0].length) };
  return { zipCode: "", address: value || "" };
}

function embedZipInValue(zipCode: string, address: string): string {
  const clean = zipCode.replace(/[-ー−\s]/g, "");
  if (clean.length === 7) return `〒${clean}|${address}`;
  return address;
}

/**
 * 1つの住所 string を郵便番号 / 都道府県 / 市区町村 / 番地以降に分割して入力するコンポーネント。
 * 郵便番号7桁入力で都道府県・市区町村を自動入力。
 * 住所入力後に〒検索で郵便番号を逆引き。
 *
 * 郵便番号は value 文字列の先頭に "〒1234567|" として永続化される。
 */
export function AddressSplitSimple({
  value,
  onChange,
  inputClassName = "w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white",
  labelClassName = "block text-xs font-medium text-gray-600 mb-1",
  labelPrefix = "",
}: AddressSplitSimpleProps) {
  const { zipCode: savedZip, address: addressPart } = parseZipFromValue(value);
  const [zipInput, setZipInput] = useState(savedZip);
  const [zipLoading, setZipLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [zipError, setZipError] = useState("");

  // savedZip が外部から変わった場合（AI自動入力等）にローカルstate を同期
  const [prevSavedZip, setPrevSavedZip] = useState(savedZip);
  if (savedZip !== prevSavedZip) {
    setPrevSavedZip(savedZip);
    if (savedZip && savedZip !== zipInput) setZipInput(savedZip);
  }

  const { prefecture, rest } = extractPrefecture(addressPart);
  const { city, addressLine } = extractCity(rest);
  const { town, block } = extractTown(addressLine);

  function handleChange(pref: string, ct: string, twn: string, blk: string, zip?: string) {
    const addr = `${pref}${ct}${twn}${blk}`;
    const z = zip ?? zipInput;
    onChange(embedZipInValue(z, addr));
  }

  function cleanZip(v: string) {
    return v.replace(/[-ー−\s]/g, "");
  }

  /** 郵便番号 → 都道府県・市区町村・町村を自動入力 */
  async function zipToAddress(zipValue: string) {
    setZipLoading(true);
    setZipError("");
    const result = await fetchAddressFromZip(zipValue);
    if (result) {
      handleChange(result.prefecture, result.city, result.town, block, zipValue);
    } else {
      setZipError("該当する住所が見つかりませんでした");
    }
    setZipLoading(false);
  }

  function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setZipInput(v);
    setZipError("");
    const clean = cleanZip(v);
    if (clean.length === 7) {
      // 郵便番号を即座に保存（住所は後で自動入力）
      onChange(embedZipInValue(v, addressPart));
      setTimeout(() => zipToAddress(v), 100);
    } else {
      // 7桁未満: 郵便番号プレフィックスを除去して住所のみ保存
      onChange(addressPart);
    }
  }

  /** 住所 → 郵便番号を逆引き */
  async function addressToZip() {
    const addr = `${prefecture}${city}${town}`.trim();
    if (!addr) { setZipError("都道府県・市区町村を入力してください"); return; }
    setReverseLoading(true);
    setZipError("");
    const zip = await fetchZipFromAddress(addr);
    if (zip) {
      setZipInput(zip);
      onChange(embedZipInValue(zip, addressPart));
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
            value={zipInput}
            onChange={handleZipChange}
            placeholder="1600023"
            maxLength={8}
            className={inputClassName + " font-mono max-w-[160px]"}
          />
          <button
            type="button"
            onClick={() => zipToAddress(zipInput)}
            disabled={zipLoading || cleanZip(zipInput).length !== 7}
            title="郵便番号から住所を自動入力"
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {zipLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
            住所入力
          </button>
          <button
            type="button"
            onClick={addressToZip}
            disabled={reverseLoading || !(prefecture && city)}
            title="住所から郵便番号を自動検索"
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {reverseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            〒検索
          </button>
        </div>
        {zipError && <p className="text-xs text-red-500 mt-1">{zipError}</p>}
      </div>

      {/* 都道府県・市区町村・町名 */}
      <div>
        <label className={labelClassName}>{labelPrefix}都道府県・市区町村・町名</label>
        <input
          type="text"
          value={`${prefecture}${city}${town}`}
          onChange={(e) => {
            const fullAddr = e.target.value;
            const prefMatch = PREFECTURES.find(p => fullAddr.startsWith(p));
            if (prefMatch) {
              const afterPref = fullAddr.substring(prefMatch.length);
              const cityMatch = afterPref.match(/^(.+?[市区町村郡])/);
              if (cityMatch) {
                const cityVal = cityMatch[1];
                const townVal = afterPref.substring(cityVal.length);
                handleChange(prefMatch, cityVal, townVal, block);
              } else {
                handleChange(prefMatch, afterPref, "", block);
              }
            } else {
              handleChange("", "", fullAddr, block);
            }
            setZipError("");
          }}
          placeholder="埼玉県三郷市彦成"
          className={inputClassName}
        />
      </div>

      {/* 丁目・番地・建物・部屋番号 */}
      <div>
        <label className={labelClassName}>{labelPrefix}丁目・番地・建物・部屋番号</label>
        <input
          type="text"
          value={block}
          onChange={(e) => {
            handleChange(prefecture, city, town, e.target.value);
            setZipError("");
          }}
          placeholder="1丁目319番地6"
          className={inputClassName}
        />
      </div>
    </div>
  );
}
