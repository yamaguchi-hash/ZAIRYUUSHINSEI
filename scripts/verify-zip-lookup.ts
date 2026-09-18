/**
 * zip-lookup.ts の動作検証スクリプト（実APIに対して実行）
 * 実行: npx tsx scripts/verify-zip-lookup.ts
 */
import { lookupZipFromAddress, parseAddressParts } from "../src/lib/zip-lookup";

const cases: Array<{ address: string; expected: string | null; note: string }> = [
  // 今回のバグ（彦川戸と誤認 → 341-0054 が返っていた）
  { address: "埼玉県三郷市彦江", expected: "341-0058", note: "バグ報告の住所" },
  { address: "埼玉県三郷市彦江2-85", expected: "341-0058", note: "番地付き" },
  // 類似町名が正しく区別されること
  { address: "埼玉県三郷市彦川戸", expected: "341-0005", note: "類似町名" },
  { address: "埼玉県三郷市彦成3丁目", expected: "341-0003", note: "丁目付き類似町名" },
  { address: "埼玉県三郷市彦倉", expected: "341-0053", note: "類似町名" },
  // 既存の正常系が壊れていないこと
  { address: "東京都新宿区西新宿2丁目8-1", expected: "160-0023", note: "正常系（東京都新宿区）" },
  { address: "神奈川県横浜市港北区日吉", expected: "223-0061", note: "政令指定都市" },
  { address: "北海道札幌市中央区大通西1丁目", expected: "060-0042", note: "大字・方角付き町名" },
  // 厳密化: 特定できない入力は null
  { address: "埼玉県三郷市彦", expected: null, note: "曖昧な町名（候補多数）" },
  { address: "埼玉県三郷市存在しない町", expected: null, note: "実在しない町名" },
  { address: "ただの文字列", expected: null, note: "住所でない入力" },
];

async function main() {
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const parts = parseAddressParts(c.address);
    const got = await lookupZipFromAddress(c.address);
    const ok = got === c.expected;
    if (ok) pass++; else fail++;
    console.log(
      `${ok ? "PASS" : "FAIL"} | ${c.address} => ${got ?? "null"} (期待: ${c.expected ?? "null"}) ` +
      `[${parts.prefecture}/${parts.city}/${parts.town}] ${c.note}`
    );
    // API への連続アクセスを避ける
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
  if (fail > 0) process.exit(1);
}

main();
