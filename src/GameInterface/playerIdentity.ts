/** Birth date "YYYY-MM-DD" in the language's format (UTC, so it never shifts a day); null if invalid. */
export function formatBirthDate(iso: string, lang: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return new Intl.DateTimeFormat(lang, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Height in whole centimetres, or null when absent or not a sensible number. */
export function heightCmOf(cm: number | undefined): number | null {
  if (cm === undefined || !Number.isFinite(cm) || cm <= 0) return null;
  return Math.round(cm);
}
