/**
 * Money labels shown in the game. Amounts are whole euros; every helper keeps the format its
 * screen has always shown.
 */

/** Signed, compact: `-€1.2M`, `€350K`, `€900`. `symbol` "" drops the currency (status bar). */
export function formatEuros(value: number, symbol = "€"): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${symbol}${Math.round(abs)}`;
}

/** Club-finance table: `€123M`, `€12.3M`, `€120k`, `€45.5k`, `€900`. */
export function formatEurosDetailed(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return `€${Math.round(n)}`;
}

/** Inbox message text: `-€1.2M`, `€350k`, `€900`. */
export function formatEurosText(euros: number): string {
  if (euros < 0) return `-${formatEurosText(-euros)}`;
  if (euros >= 1_000_000) return `€${(euros / 1_000_000).toFixed(1)}M`;
  if (euros >= 1_000) return `€${Math.round(euros / 1_000)}k`;
  return `€${euros}`;
}

/** Transfer fee: `€123M` (from €100M up), `€12.3M`, `€450K`. */
export function formatFee(fee: number, symbol = "€"): string {
  const m = fee / 1_000_000;
  if (m >= 100) return `${symbol}${Math.round(m)}M`;
  if (m >= 1) return `${symbol}${m.toFixed(1)}M`;
  return `${symbol}${(fee / 1000).toFixed(0)}K`;
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
