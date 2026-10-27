/** The public world steps at fixed Brasília times: every screen shows them in that time zone. */
export const PUBLIC_WORLD_TIME_ZONE = "America/Sao_Paulo";

/** "18:00" for the ISO of a step, in Brasília time; "" for an invalid date. */
export function brasiliaTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang, {
    timeZone: PUBLIC_WORLD_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}
