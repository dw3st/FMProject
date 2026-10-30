/**
 * Banned or sent-off manager (tester report): from the stands he can still pass orders to the assistant
 * (mentality, a substitution). The assistant follows an order with a fixed chance; otherwise he keeps
 * his own plan (the AI rule for changes, the current mentality).
 */
export const ASSISTANT_ORDERS = {
  /** Chance the assistant follows an order. */
  FOLLOW: 0.7,
} as const;

export function assistantFollows(rng: () => number): boolean {
  return rng() < ASSISTANT_ORDERS.FOLLOW;
}
