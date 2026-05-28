import { NextRequest, NextResponse } from "next/server";

/**
 * 住所 → 郵便番号 逆引きAPIルート
 *
 * 1. zipcloud の address 検索を試行
 * 2. 失敗した場合は Nominatim (OpenStreetMap) にフォールバック
 *
 * クライアントから /api/zip-from-address?address={住所} で呼び出す。
 * サーバーサイドで実行することで CORS・User-Agent の問題を回避する。
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address?.trim()) {
    return NextResponse.json({ zipcode: null });
  }

  // ── 1. zipcloud address 検索 ──────────────────────────────────────────────
  try {
    const url = `https://zipcloud.ibsnet.co.jp/api/search?address=${encodeURIComponent(address.trim())}&limit=5`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (res.ok) {
      const json = await res.json();
      const results: Array<{ zipcode: string }> | null = json.results;
      if (Array.isArray(results) && results.length > 0) {
        const raw = results[0].zipcode;
        if (raw && raw.length === 7) {
          return NextResponse.json({ zipcode: `${raw.slice(0, 3)}-${raw.slice(3)}` });
        }
      }
    }
  } catch (e) {
    console.error("[zip-from-address] zipcloud error:", e);
  }

  // ── 2. Nominatim (OpenStreetMap) フォールバック ───────────────────────────
  try {
    const query = address.trim().includes("日本") ? address.trim() : `${address.trim()}, Japan`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=jp&addressdetails=1&limit=3`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ZairyuShinseiSystem/1.0 (yamaguchi@jls-gyosei.jp)",
        "Accept-Language": "ja,en",
      },
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const json: Array<{ address?: { postcode?: string } }> = await res.json();
      for (const item of json) {
        const postcode = item.address?.postcode?.replace(/\s/g, "");
        if (postcode) {
          const zip = postcode.length === 7 && !postcode.includes("-")
            ? `${postcode.slice(0, 3)}-${postcode.slice(3)}`
            : postcode;
          return NextResponse.json({ zipcode: zip });
        }
      }
    }
  } catch (e) {
    console.error("[zip-from-address] nominatim error:", e);
  }

  return NextResponse.json({ zipcode: null });
}
