/**
 * Run `worker` over `items` with at most `limit` calls in flight. Resolves when
 * every item has been processed. If a worker rejects, the returned promise
 * rejects with that error (lanes already running finish in the background), so
 * callers that must attempt every item catch inside the worker.
 */
export async function runPool<T>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, lane));
}
