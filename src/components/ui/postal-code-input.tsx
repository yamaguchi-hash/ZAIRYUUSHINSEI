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
 * UI は2セクション：位置情報（都道府県・市区町村・町村）と詳細住所（番地以下）
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

  // addressLine を town + block に分割
  const { town, block } = extractTown(value.addressLine);

  function cleanZip(v: string) {
    return v.replace(/[-ー−\s]/g, "");
  }

  /** 郵便番号 → 都道府県・市区町村・町村を自動入力 */
  async function zipToAddress(zipValue: string) {
    setZipLoading(true);
    setZipError("");
    const result = await fetchAddressFromZip(zipValue);
    if (result) {
      // city + town を結合して city に、town は別に設定
      onChange({ prefecture: result.prefecture, city: result.city, addressLine: result.town + block });
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
    const addr = `${value.prefecture}${value.city}${town}`.trim();
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

  function handleTownChange(newTown: string) {
    onChange({ addressLine: newTown + block });
  }

  function handleBlockChange(newBlock: string) {
    onChange({ addressLine: town + newBlock });
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

      {/* 位置情報 */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-700">位置情報</label>
        <div>
          <label className={labelClassName}>
            都道府県・市区町村{required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            type="text"
            value={`${value.prefecture}${value.city}`}
            onChange={(e) => {
              const fullAddr = e.target.value;
              // 都道府県を判定して分割
              const prefMatch = PREFECTURES.find(p => fullAddr.startsWith(p));
              if (prefMatch) {
                const pref = prefMatch;
                const city = fullAddr.substring(pref.length);
                onChange({ prefecture: pref, city: city });
              } else {
                // 判定できない場合は全部を city に
                onChange({ prefecture: "", city: fullAddr });
              }
              setZipError("");
            }}
            placeholder="埼玉県三郷市"
            className={inputClassName}
          />
        </div>
      </div>

      {/* 詳細住所 */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-700">詳細住所</label>
        <div>
          <label className={labelClassName}>丁目・番地・建物・部屋番号</label>
          <input
            type="text"
            value={`${town}${block}`}
            onChange={(e) => {
              const fullAddr = e.target.value;
              // 簡易的な分割: 最初の方を town、後ろを block にする
              // 例: "代々木1丁目319番地6" → town="代々木", block="1丁目319番地6"
              // より良い実装のため、既存の town/block の更新方法を使う
              onChange({ addressLine: fullAddr });
              setZipError("");
            }}
            placeholder="代々木戸成1丁目319番地6"
            className={inputClassName}
          />
        </div>
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

/** addressLine から町村+丁目部分を抽出（数字部分の直前まで） */
function extractTown(addressLine: string): { town: string; block: string } {
  // 「町」「村」「丁目」「丁」で始まる部分を抽出
  // 例: 売布4-3-30 → town: 売布, block: 4-3-30
  // 例: 3丁目1-1 → town: 3丁目, block: 1-1
  const townMatch = addressLine.match(/^([^0-9]*?(?:町|村|丁目|丁))/);
  if (townMatch) {
    const town = townMatch[1];
    const block = addressLine.slice(town.length);
    return { town, block };
  }

  // 丁目が見つからない場合、全て block とする
  return { town: "", block: addressLine };
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
  const { town, block } = extractTown(addressLine);

  function handleChange(pref: string, ct: string, twn: string, blk: string) {
    onChange(`${pref}${ct}${twn}${blk}`);
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
      handleChange(result.prefecture, result.city, result.town, block);
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
    const addr = `${prefecture}${city}${town}`.trim();
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

      {/* 位置情報 */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-700">{labelPrefix}位置情報</label>

        <div className="flex gap-2">
          {/* 都道府県（ドロップダウン） */}
          <select
            value={prefecture}
            onChange={(e) => { handleChange(e.target.value, city, town, block); setZipError(""); }}
            className={inputClassName + " flex-shrink-0 w-32"}
          >
            <option value="">選択</option>
            {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* 市区町村（テキスト） */}
          <input
            type="text"
            value={city}
            onChange={(e) => { handleChange(prefecture, e.target.value, town, block); setZipError(""); }}
            placeholder="三郷市"
            className={inputClassName + " flex-1"}
          />
        </div>
      </div>

      {/* 詳細住所 */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-700">{labelPrefix}詳細住所</label>
        <input
          type="text"
          value={town + block}
          onChange={(e) => {
            const fullAddr = e.target.value;
            // town と block を分割することは難しいため、全体を town に格納
            handleChange(prefecture, city, fullAddr, "");
            setZipError("");
          }}
          placeholder="代々木1-1-1 〇〇ビル101号室"
          className={inputClassName}
        />
      </div>
    </div>
  );
}
