/**
 * 配列の各要素に対して非同期処理を並行実行する（同時実行数を制限）。
 * 結果は入力と同じ順序の配列で返される。
 *
 * Gemini等の外部APIを多数の書類に対して呼び出す際、逐次実行だと
 * Vercelのサーバーレス関数タイムアウト（300秒）を超過するため、
 * 適度な並行度で処理時間を短縮する目的で使用する。
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
