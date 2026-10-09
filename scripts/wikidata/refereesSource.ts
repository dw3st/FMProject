/**
 * Referees and assistant referees of the main-league countries, from Wikidata (CC0). Pure helpers of
 * `scripts/fetchWikidataReferees.ts` and `scripts/fetchTransfermarktReferees.ts`; spec
 * `docs/superpowers/specs/2026-10-09-referees-design.md` §1.
 */
import { decodeHtmlEntities } from "@/../scripts/espn/normalize";

export const MAX_REAL_REFEREES = 24;
export const MAX_REAL_ASSISTANTS = 12;
export const MIN_AGE = 27;
export const MAX_AGE = 50;
/** A FIFA badge ending this year or later still counts. */
export const FIFA_RECENT_YEAR = 2024;

export interface WdRefereeRow {
  qid: string;
  label: string;
  /** Citizenship (P27 → P297). */
  iso2: string | null;
  /** Country for sport (P1532 → P297), preferred over citizenship. */
  sportIso2: string | null;
  birth: string | null;
  death: string | null;
  gender: "male" | "female" | null;
  sitelinks: number;
  /** "FIFA referee" position (P39 Q20994440) start/end; both null = no badge. */
  fifaFrom: string | null;
  fifaTo: string | null;
  /** Any P39 that is not "FIFA referee" (politicians who also refereed). */
  otherPositions: number;
  role: "referee" | "assistant";
  /** Transfermarkt referee id (P3699). */
  tmId?: string | null;
  /** True when the row carries a P39 "FIFA referee" statement (open or closed). */
  hasFifa?: boolean;
}

export interface RefereeSource {
  id: string;
  wikidataQid: string;
  name: string;
  country: string;
  birthDate: string;
  role: "referee" | "assistant";
  gender: "male" | "female";
  fifa: boolean;
  sitelinks: number;
  tmId?: string;
  strictness?: number;
  tmMatches?: number;
}

export interface PickOptions {
  /** Season year the ages are measured on (2027 = the world's first season). */
  year: number;
  /** ISO2 → game country name, or null when the country is not in the game ("GB" → "England"). */
  countryOfIso: (iso2: string) => string | null;
}

const ageIn = (birth: string, year: number) => year - Number(birth.slice(0, 4));

function isFifa(r: WdRefereeRow): boolean {
  if (!r.fifaFrom && !r.fifaTo && !r.hasFifa) return false;
  if (!r.fifaTo) return true;
  return Number(r.fifaTo.slice(0, 4)) >= FIFA_RECENT_YEAR;
}

/** Filters, maps to game countries, ranks and caps the Wikidata rows (one entry per person). */
export function pickReferees(rows: readonly WdRefereeRow[], opts: PickOptions): RefereeSource[] {
  // Merge the rows of one person: referee wins over assistant, max sitelinks, any fifa.
  const byQid = new Map<string, WdRefereeRow>();
  for (const r of rows) {
    const prev = byQid.get(r.qid);
    if (!prev) { byQid.set(r.qid, { ...r }); continue; }
    if (r.role === "referee") prev.role = "referee";
    prev.sitelinks = Math.max(prev.sitelinks, r.sitelinks);
    prev.otherPositions = Math.max(prev.otherPositions, r.otherPositions);
    if (isFifa(r) && !isFifa(prev)) { prev.fifaFrom = r.fifaFrom; prev.fifaTo = r.fifaTo; prev.hasFifa = r.hasFifa; }
    prev.sportIso2 ??= r.sportIso2;
    prev.iso2 ??= r.iso2;
    prev.birth ??= r.birth;
    prev.death ??= r.death;
    prev.gender ??= r.gender;
    prev.tmId ??= r.tmId;
  }
  const kept: RefereeSource[] = [];
  for (const r of byQid.values()) {
    if (!r.gender || r.death || !r.birth || r.otherPositions > 0) continue;
    const age = ageIn(r.birth, opts.year);
    if (age < MIN_AGE || age > MAX_AGE) continue;
    const country = (r.sportIso2 && opts.countryOfIso(r.sportIso2)) || (r.iso2 && opts.countryOfIso(r.iso2)) || null;
    if (!country) continue;
    const name = decodeHtmlEntities(r.label).replace(/\s+/g, " ").trim();
    if (!name || /^Q\d+$/.test(name)) continue;
    kept.push({
      id: `ref_${r.qid}`, wikidataQid: r.qid, name, country, birthDate: r.birth.slice(0, 10), role: r.role,
      gender: r.gender, fifa: isFifa(r), sitelinks: r.sitelinks, ...(r.tmId ? { tmId: r.tmId } : {}),
    });
  }
  const rank = (a: RefereeSource, b: RefereeSource) =>
    Number(b.fifa) - Number(a.fifa) || Number(!!b.tmId) - Number(!!a.tmId) || b.sitelinks - a.sitelinks || b.birthDate.localeCompare(a.birthDate)
    || a.wikidataQid.localeCompare(b.wikidataQid, undefined, { numeric: true });
  const out: RefereeSource[] = [];
  const countries = [...new Set(kept.map((r) => r.country))].sort();
  for (const c of countries) {
    for (const role of ["referee", "assistant"] as const) {
      const cap = role === "referee" ? MAX_REAL_REFEREES : MAX_REAL_ASSISTANTS;
      out.push(...kept.filter((r) => r.country === c && r.role === role).sort(rank).slice(0, cap));
    }
  }
  return out;
}

// ---- Transfermarkt rigor ------------------------------------------------------------------------------------

export interface TmCareerTotals {
  matches: number;
  yellows: number;
  secondYellows: number;
  reds: number;
  penalties: number;
}

/** The totals row of a Transfermarkt referee profile (`/profil/schiedsrichter/<id>/saison_id/0`), or null. */
export function parseTmRefereeTotals(html: string): TmCareerTotals | null {
  const at = html.indexOf("responsive-table");
  if (at < 0) return null;
  const foot = /<tfoot>([\s\S]*?)<\/tfoot>/.exec(html.slice(at, at + 30000));
  if (!foot) return null;
  const cells = [...foot[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    m[1]!.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\./g, "").trim());
  if (cells.length < 5) return null;
  const nums = cells.slice(-5).map((c) => (c === "-" || c === "" ? 0 : Number(c)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [matches, yellows, secondYellows, reds, penalties] = nums as [number, number, number, number, number];
  if (matches <= 0) return null;
  return { matches, yellows, secondYellows, reds, penalties };
}

export const TM_MIN_MATCHES = 20;
export const TM_SHRINK = 40;
export const TM_MIN_COUNTRY = 5;
export const TARGET_SD = 0.41;

/** Cards per match, the rigor signal (a red weighs two yellows). */
export const cardRate = (t: TmCareerTotals) => (t.yellows + t.secondYellows + 2 * t.reds) / t.matches;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Real strictness per referee id (spec §1.3): log of the card rate over the country median, shrunk by the sample,
 * scaled to the drawn rigor's spread (sd 0.41), re-centred to mean 0, clamped to [−1, 1], two decimals.
 */
export function realStrictness(entries: readonly { id: string; country: string; totals: TmCareerTotals }[]): Map<string, number> {
  const usable = entries.filter((e) => e.totals.matches >= TM_MIN_MATCHES);
  const out = new Map<string, number>();
  if (usable.length === 0) return out;
  const world = median(usable.map((e) => cardRate(e.totals)));
  const byCountry = new Map<string, number[]>();
  for (const e of usable) byCountry.set(e.country, [...(byCountry.get(e.country) ?? []), cardRate(e.totals)]);
  const ref = (c: string) => { const xs = byCountry.get(c) ?? []; return xs.length >= TM_MIN_COUNTRY ? median(xs) : world; };
  const z = usable.map((e) => {
    const rate = Math.max(cardRate(e.totals), 0.05);
    return Math.log(rate / ref(e.country)) * (e.totals.matches / (e.totals.matches + TM_SHRINK));
  });
  const mean = z.reduce((a, b) => a + b, 0) / z.length;
  const sd = Math.sqrt(z.reduce((a, b) => a + (b - mean) ** 2, 0) / z.length) || 1;
  let s = z.map((v) => Math.max(-1, Math.min(1, ((v - mean) / sd) * TARGET_SD)));
  const m2 = s.reduce((a, b) => a + b, 0) / s.length; // re-centre after the clamp
  s = s.map((v) => Math.max(-1, Math.min(1, v - m2)));
  usable.forEach((e, i) => out.set(e.id, Math.round(s[i]! * 100) / 100));
  return out;
}
