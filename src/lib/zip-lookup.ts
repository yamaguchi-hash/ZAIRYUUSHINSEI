/**
 * 住所 → 郵便番号 逆引きロジック（サーバーサイド共通）
 *
 * 1. 住所文字列を 都道府県 / 市区町村 / 町名 に分解する
 * 2. HeartRails Geo API（method=suggest, matching=prefix）で候補一覧を取得する
 * 3. 都道府県・市区町村が完全一致する候補のうち、
 *    町名の完全一致 → 前方最長一致 の順で郵便番号を確定する
 * 4. 候補が得られない場合のみ Nominatim (OpenStreetMap) にフォールバックするが、
 *    得られた郵便番号を zipcloud（郵便番号→住所の正引き）で逆検証し、
 *    都道府県・市区町村・町名が入力住所と一致する場合のみ採用する
 * 5. 上記いずれでも特定できなければ null を返す（誤った郵便番号は返さない）
 */

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const FETCH_TIMEOUT_MS = 5000;

export interface AddressParts {
  prefecture: string;
  city: string;
  town: string;
}

/** 住所文字列を 都道府県 / 市区町村 / 町名 に分解する */
export function parseAddressParts(address: string): AddressParts {
  // 郵便番号プレフィックス（〒123-4567 等）と空白を除去
  let rest = address
    .replace(/〒?\s*\d{3}[-ー−]?\d{4}/g, "")
    .replace(/\s/g, "")
    .trim();

  const prefecture = PREFECTURES.find((p) => rest.startsWith(p)) ?? "";
  rest = rest.slice(prefecture.length);

  // 政令指定都市（市+区）→ 郡+町村 → 市 → 区 → 町村 の順で抽出
  const cityPatterns = [
    /^(.+?市.+?区)/,
    /^(.+?郡.+?[町村])/,
    /^(.+?市)/,
    /^(.+?区)/,
    /^(.+?[町村])/,
  ];
  let city = "";
  for (const pattern of cityPatterns) {
    const m = rest.match(pattern);
    if (m) {
      city = m[1];
      break;
    }
  }
  rest = rest.slice(city.length);

  // 町名 = 最初の数字（番地）または漢数字+丁目 の手前まで
  const cutMatch = rest.match(/[0-9０-９]|[一二三四五六七八九十]+丁目/);
  const town = (cutMatch ? rest.slice(0, cutMatch.index) : rest).trim();

  return { prefecture, city, town };
}

/** 「大字」「字」プレフィックスを除去して比較用に正規化 */
function normalizeTown(town: string): string {
  return town.replace(/^大字/, "").replace(/^字/, "");
}

interface HeartRailsLocation {
  prefecture: string;
  city: string;
  town: string;
  postal: string;
}

/** HeartRails Geo API で町名候補を取得し、最も厳密に一致する郵便番号を返す */
async function lookupViaHeartRails(parts: AddressParts): Promise<string | null> {
  const keyword = `${parts.prefecture}${parts.city}${parts.town}`;
  const url = `https://geoapi.heartrails.com/api/json?method=suggest&keyword=${encodeURIComponent(keyword)}&matching=prefix`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json: { response?: { location?: HeartRailsLocation[]; error?: string } } = await res.json();
  const locations = json.response?.location;
  if (!Array.isArray(locations) || locations.length === 0) return null;

  // 都道府県・市区町村が完全一致する候補のみを対象にする
  const candidates = locations.filter(
    (l) =>
      l.prefecture === parts.prefecture &&
      l.city === parts.city &&
      /^\d{7}$/.test(l.postal ?? "")
  );
  if (candidates.length === 0) return null;

  const inputTown = normalizeTown(parts.town);

  if (inputTown) {
    // 1) 町名の完全一致
    const exact = candidates.find((c) => normalizeTown(c.town) === inputTown);
    if (exact) return exact.postal;

    // 2) 入力町名がマスタ町名で始まる（前方最長一致）
    //    例: 入力「彦成三丁目東」→ マスタ「彦成」
    const prefixOfInput = candidates
      .filter((c) => inputTown.startsWith(normalizeTown(c.town)) && normalizeTown(c.town).length > 0)
      .sort((a, b) => normalizeTown(b.town).length - normalizeTown(a.town).length);
    if (prefixOfInput.length > 0) return prefixOfInput[0].postal;

    // 3) マスタ町名が入力町名で始まる場合は、最も短い（=最も一般的な）候補を採用。
    //    ただし同じ長さの候補が複数あるとき（例: 入力「彦」に「彦江」「彦成」…）は
    //    一意に特定できないため採用しない
    const extendsInput = candidates
      .filter((c) => normalizeTown(c.town).startsWith(inputTown))
      .sort((a, b) => normalizeTown(a.town).length - normalizeTown(b.town).length);
    if (extendsInput.length > 0) {
      const minLen = normalizeTown(extendsInput[0].town).length;
      const shortest = extendsInput.filter((c) => normalizeTown(c.town).length === minLen);
      const uniquePostals = [...new Set(shortest.map((c) => c.postal))];
      if (uniquePostals.length === 1) return uniquePostals[0];
    }

    // 町名が指定されているのに一致候補がない → 誤ヒットを返さない
    return null;
  }

  // 町名未入力: 候補の郵便番号が1種類に定まる場合のみ採用（曖昧なら null）
  const uniquePostals = [...new Set(candidates.map((c) => c.postal))];
  return uniquePostals.length === 1 ? uniquePostals[0] : null;
}

/** zipcloud の正引き（郵便番号→住所）で、郵便番号が入力住所と整合するか検証 */
async function verifyZipMatchesAddress(zip7: string, parts: AddressParts): Promise<boolean> {
  try {
    const res = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip7}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" }
    );
    if (!res.ok) return false;
    const json: { results?: Array<{ address1: string; address2: string; address3: string }> | null } =
      await res.json();
    const results = json.results ?? [];

    const inputTown = normalizeTown(parts.town);
    return results.some((r) => {
      if (r.address1 !== parts.prefecture || r.address2 !== parts.city) return false;
      if (!inputTown) return true;
      const masterTown = normalizeTown(r.address3 ?? "");
      if (!masterTown) return false;
      return (
        masterTown === inputTown ||
        inputTown.startsWith(masterTown) ||
        masterTown.startsWith(inputTown)
      );
    });
  } catch {
    return false;
  }
}

/** Nominatim ジオコーディングで郵便番号候補を取得し、逆検証に通ったものだけ返す */
async function lookupViaNominatim(address: string, parts: AddressParts): Promise<string | null> {
  const query = address.includes("日本") ? address : `${address}, Japan`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=jp&addressdetails=1&limit=3`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "ZairyuShinseiSystem/1.0 (yamaguchi@jls-gyosei.jp)",
      "Accept-Language": "ja,en",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json: Array<{ address?: { postcode?: string } }> = await res.json();
  for (const item of json) {
    const postcode = item.address?.postcode?.replace(/[-\s]/g, "");
    if (!postcode || !/^\d{7}$/.test(postcode)) continue;
    // ジオコーディング結果は地点ベースで隣接町名の郵便番号を返すことがあるため、
    // 正引きで入力住所と一致することを確認できた場合のみ採用する
    if (await verifyZipMatchesAddress(postcode, parts)) return postcode;
  }
  return null;
}

/**
 * 住所から郵便番号を逆引きする。
 * 特定できた場合は "341-0058" 形式、特定できない場合は null を返す。
 */
export async function lookupZipFromAddress(address: string): Promise<string | null> {
  const trimmed = address?.trim();
  if (!trimmed) return null;

  const parts = parseAddressParts(trimmed);
  // 都道府県・市区町村が読み取れない住所は検索対象外（誤ヒット防止）
  if (!parts.prefecture || !parts.city) return null;

  let zip7: string | null = null;

  try {
    zip7 = await lookupViaHeartRails(parts);
  } catch (e) {
    console.error("[zip-lookup] HeartRails error:", e);
  }

  if (!zip7) {
    try {
      zip7 = await lookupViaNominatim(trimmed, parts);
    } catch (e) {
      console.error("[zip-lookup] Nominatim error:", e);
    }
  }

  return zip7 ? `${zip7.slice(0, 3)}-${zip7.slice(3)}` : null;
}
