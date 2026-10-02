/**
 * The game's standard table look, taken from the Leagues table (`StandingsTable`) and shared by
 * every ranking-like table (Leagues, Stats). See `.claude/rules/ui-standard.md` → Tabela.
 *
 * Only class strings live here, so a grid-based table (Leagues) and an HTML `<table>` (Stats) can
 * both use them and keep the exact same look.
 */
export const TABLE_STYLE = {
  /** Outer box: card background, thin border, rounded, clipped. */
  shell: "card-arcade rounded-md overflow-hidden",
  /** Header row: tinted background, bottom border, label-style text. */
  head: "bg-secondary/30 border-b border-border text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display",
  /** Body: thin dividers between rows. */
  body: "divide-y divide-border/50",
  /** Body row; add `rowClickable` when the row reacts to clicks. */
  row: "hover:bg-secondary/30 transition-colors",
  rowClickable: "cursor-pointer",
  /** Row of the player's own club / player. */
  rowHighlight: "bg-primary/10",
  /** Position column. */
  rank: "text-center font-bold text-muted-foreground",
  /** Club crest (32px). */
  crest: "w-8 h-8 rounded-full shrink-0",
  /** Club or player name. */
  name: "font-semibold text-foreground",
  nameHighlight: "font-semibold text-primary",
  /** Secondary numeric column. */
  number: "text-center text-muted-foreground tabular-nums",
  /** The column that matters most in the table (points, goals...). */
  key: "text-center font-black font-display text-primary tabular-nums",
} as const;

/** Cell padding for HTML tables; the grid version uses `gap-2 px-4` on the row instead. */
export const TABLE_CELL = {
  head: "px-2 py-3 first:pl-4 last:pr-4",
  body: "px-2 py-2.5 first:pl-4 last:pr-4",
} as const;
