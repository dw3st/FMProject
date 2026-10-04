/**
 * Money labels shown in the game. The game's money is euros: every amount is whole euros and every
 * label carries `€`. Negative amounts use the typographic minus sign (U+2212) before the symbol:
 * `−€1.2M`.
 */

/** Typographic minus sign used in front of negative amounts. */
export const MINUS = "−";

/** Signed, compact: `−€1.2M`, `€350K`, `€900`. */
export function formatEuros(value: number): string {
  const sign = value < 0 ? MINUS : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}K`;
  return `${sign}€${Math.round(abs)}`;
}

/** Club-finance table: `€123M`, `€12.3M`, `€120k`, `€45.5k`, `€900`. */
export function formatEurosDetailed(n: number): string {
  if (n < 0) return `${MINUS}${formatEurosDetailed(-n)}`;
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `€${Math.round(n)}`;
}

/** Inbox message text: `−€1.2M`, `€350k`, `€900`. */
export function formatEurosText(euros: number): string {
  if (euros < 0) return `${MINUS}${formatEurosText(-euros)}`;
  if (euros >= 1_000_000) return `€${(euros / 1_000_000).toFixed(1)}M`;
  if (euros >= 1_000) return `€${Math.round(euros / 1_000)}k`;
  return `€${euros}`;
}

/** Transfer fee: `€123M` (from €100M up), `€12.3M`, `€450K`; negative: `−€12.3M`. */
export function formatFee(fee: number): string {
  if (fee < 0) return `${MINUS}${formatFee(-fee)}`;
  const m = fee / 1_000_000;
  if (m >= 100) return `€${Math.round(m)}M`;
  if (m >= 1) return `€${m.toFixed(1)}M`;
  return `€${(fee / 1000).toFixed(0)}K`;
}

/** Weekly wage, compact, no currency: `45k`, `900`. */
export function formatWageShort(weekly: number): string {
  const w = Math.round(weekly);
  return w >= 1000 ? `${(w / 1000).toFixed(0)}k` : `${w}`;
}

/** Weekly wage, full: `€12,345`. */
export function formatWageFull(n: number): string {
  return `€${Math.round(n).toLocaleString("en-US")}`;
}
