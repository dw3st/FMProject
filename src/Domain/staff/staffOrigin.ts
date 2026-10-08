import countriesRaw from "@/Data/countries.json";

/**
 * Where coaching staff come from (`.claude/rules/game/staff.md` → "Nacionalidades"). Pure.
 *
 * A name book per game country (the 60 of `countries.json`): first names and surnames taken from the
 * world's players of that nationality (too few: the players of the country's clubs), and a weight
 * from the country's clubs. A club's starting staff is mostly from its own country, the rest from its
 * continent; the free pool draws from every country, bigger football countries more often.
 */

const COUNTRIES = countriesRaw as Record<string, { continent?: string }>;

export interface StaffNameEntry {
  first: string[];
  last: string[];
  /** Clubs of the country's leagues in the world (the draw weight). */
  clubs: number;
}
/** Game country (`countries.json` key) → names and weight. */
export type StaffNameBook = Record<string, StaffNameEntry>;

export const STAFF_ORIGIN = {
  /** Share of a club's starting staff from the club's own country (the rest: same continent). */
  HOME_SHARE: 0.8,
  /** Weight of a country in a draw = clubs ^ this (bigger football countries more often). */
  WEIGHT_POWER: 0.5,
  /** Fewer distinct names than this from the nationality: the country's clubs' players fill in. */
  MIN_NAMES: 15,
} as const;

/** Player nationalities spelled differently from the game country (`countries.json` key). */
const NATIONALITY_ALIASES: Record<string, string> = { Czechia: "Czech Republic", "Türkiye": "Turkey", "United States": "USA" };

/** A player as the name book reads him. */
interface NamedPlayer { name: string; fullName?: string; nationality?: string }

const WORD = /^[\p{L}][\p{L}'’-]+$/u;
const firstToken = (s: string | undefined) => s?.trim().split(/\s+/)[0] ?? "";
const lastToken = (s: string | undefined) => {
  const parts = s?.trim().split(/\s+/) ?? [];
  return parts[parts.length - 1] ?? "";
};

function namesOf(players: NamedPlayer[]): { first: Set<string>; last: Set<string> } {
  const first = new Set<string>();
  const last = new Set<string>();
  for (const p of players) {
    for (const f of [firstToken(p.fullName), firstToken(p.name)]) if (WORD.test(f)) { first.add(f); break; }
    const l = lastToken(p.name);
    if (WORD.test(l)) last.add(l);
  }
  return { first, last };
}

/**
 * Builds the name book from the world's squads, each with the country of its league (`""` when
 * unknown). Deterministic: the lists are sorted.
 */
export function buildStaffNameBook(squads: { country: string; players: NamedPlayer[] }[]): StaffNameBook {
  const byNationality = new Map<string, NamedPlayer[]>();
  const byClubCountry = new Map<string, NamedPlayer[]>();
  const clubs = new Map<string, number>();
  for (const s of squads) {
    if (s.country) {
      clubs.set(s.country, (clubs.get(s.country) ?? 0) + 1);
      const local = byClubCountry.get(s.country) ?? [];
      for (const p of s.players) local.push(p);
      byClubCountry.set(s.country, local);
    }
    for (const p of s.players) {
      const nat = p.nationality ? (NATIONALITY_ALIASES[p.nationality] ?? p.nationality) : "";
      if (!nat || !(nat in COUNTRIES)) continue;
      const list = byNationality.get(nat) ?? [];
      list.push(p);
      byNationality.set(nat, list);
    }
  }
  const book: StaffNameBook = {};
  for (const country of Object.keys(COUNTRIES)) {
    const own = namesOf(byNationality.get(country) ?? []);
    if (own.first.size < STAFF_ORIGIN.MIN_NAMES || own.last.size < STAFF_ORIGIN.MIN_NAMES) {
      const local = namesOf(byClubCountry.get(country) ?? []);
      for (const f of local.first) own.first.add(f);
      for (const l of local.last) own.last.add(l);
    }
    if (own.first.size === 0 || own.last.size === 0) continue;
    book[country] = { first: [...own.first].sort(), last: [...own.last].sort(), clubs: clubs.get(country) ?? 0 };
  }
  return book;
}

const weightOf = (e: StaffNameEntry) => Math.pow(Math.max(1, e.clubs), STAFF_ORIGIN.WEIGHT_POWER);

function weighted(countries: string[], book: StaffNameBook, rng: () => number): string | undefined {
  if (countries.length === 0) return undefined;
  const w = countries.map((c) => weightOf(book[c]!));
  let x = rng() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < countries.length; i++) {
    x -= w[i]!;
    if (x < 0) return countries[i];
  }
  return countries[countries.length - 1];
}

/**
 * A nationality and a name. With `home` (a club's starting staff): `HOME_SHARE` from the home
 * country, the rest from another country of its continent (none: home). Without: any country,
 * weighted by its clubs. `null` when the book has nothing usable (the caller keeps its fallback).
 */
export function drawStaffOrigin(book: StaffNameBook, rng: () => number, home?: string): { nationality: string; name: string } | null {
  const countries = Object.keys(book).sort();
  if (countries.length === 0) return null;
  let nationality: string | undefined;
  if (home && book[home]) {
    if (rng() < STAFF_ORIGIN.HOME_SHARE) nationality = home;
    else {
      const continent = COUNTRIES[home]?.continent;
      nationality = weighted(countries.filter((c) => c !== home && COUNTRIES[c]?.continent === continent), book, rng) ?? home;
    }
  } else {
    nationality = weighted(countries, book, rng);
  }
  const entry = nationality ? book[nationality] : undefined;
  if (!nationality || !entry) return null;
  const first = entry.first[Math.floor(rng() * entry.first.length)]!;
  const last = entry.last[Math.floor(rng() * entry.last.length)]!;
  return { nationality, name: `${first} ${last}` };
}
