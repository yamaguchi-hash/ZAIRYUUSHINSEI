import { NextRequest, NextResponse } from "next/server";
import { lookupZipFromAddress } from "@/lib/zip-lookup";

/**
 * 住所 → 郵便番号 逆引きAPIルート
 *
 * 検索ロジックは src/lib/zip-lookup.ts に集約。
 * 都道府県・市区町村・町名が一致した場合のみ郵便番号を返し、
 * 特定できない場合は { zipcode: null } を返す（誤った郵便番号は返さない）。
 *
 * クライアントから /api/zip-from-address?address={住所} で呼び出す。
 * サーバーサイドで実行することで CORS・User-Agent の問題を回避する。
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address?.trim()) {
    return NextResponse.json({ zipcode: null });
  }

  const zipcode = await lookupZipFromAddress(address);
  return NextResponse.json({ zipcode });
}
