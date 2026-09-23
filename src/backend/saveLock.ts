/**
 * Per-key (per-save) async mutex: calls for the same key run one after another,
 * in arrival order; calls for different keys run concurrently. The lock is
 * released in `finally`, so a throwing or rejecting `fn` never blocks the queue.
 * Process-local — it serialises requests within one server instance only.
 */
const tails = new Map<string, Promise<void>>();

export async function withSaveLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  // The next caller waits for us; `previous` never rejects (it only ever resolves).
  const tail = previous.then(() => held);
  tails.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

/** Number of keys with a held or queued lock (for tests / diagnostics). */
export function activeSaveLocks(): number {
  return tails.size;
}
