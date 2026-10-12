/**
 * Game dates ("YYYY-MM-DD") in the player's language (#154). Read at noon so a time zone never shifts the day;
 * an invalid date comes back as is.
 */
export type GameDateStyle = "numeric" | "dayMonth" | "dayMonthLong" | "long" | "weekdayLong";

const OPTIONS: Record<GameDateStyle, Intl.DateTimeFormatOptions> = {
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  dayMonth: { day: "numeric", month: "short" },
  dayMonthLong: { day: "numeric", month: "long" },
  long: { day: "numeric", month: "long", year: "numeric" },
  weekdayLong: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
};

/** English dates in the British order the game always used ("15 Aug"). */
export function dateLocale(lang: string): string {
  return lang === "en" ? "en-GB" : lang;
}

export function formatGameDate(iso: string | undefined | null, lang: string, style: GameDateStyle = "numeric"): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(dateLocale(lang), OPTIONS[style]);
}

/** Whole number with the language's thousands separator. */
export function formatInt(n: number, lang: string): string {
  return Math.round(n).toLocaleString(lang);
}

/** Signed decimal ("+0,15" / "−0,30") with the language's decimal separator. */
export function formatSigned(n: number, lang: string, digits = 2): string {
  const abs = Math.abs(n).toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n >= 0 ? "+" : "−"}${abs}`;
}
