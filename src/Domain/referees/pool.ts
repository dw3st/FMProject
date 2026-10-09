/**
 * A country's referee pool (spec `docs/superpowers/specs/2026-10-09-referees-design.md` §2). Pure.
 *
 * Real referees (Wikidata, main-league countries only, `src/Data/referees.json`) first; the rest generated from the
 * staff name book of the country (no book: the built-in name lists). Quality decides the appointments; the rigor is
 * the real one (Transfermarkt) when the file has it, else drawn from the id.
 */
import { REFEREE } from "@/Domain/referees/refereeConfig";
import { strictnessOf } from "@/Domain/referees/strictness";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { StaffNameBook } from "@/Domain/staff/staffOrigin";
import { STAFF_NAME_POOLS } from "@/Domain/staff/staffNames";
import type { Referee, RefereePool, RefereeRole } from "@/types/refereeTypes";

/** A real referee as `referees.json` stores him (game copy, no Transfermarkt id, no card counts). */
export interface RealReferee {
  id: string;
  wikidataQid: string;
  name: string;
  country: string;
  birthDate: string;
  role: RefereeRole;
  gender: "male" | "female";
  fifa: boolean;
  sitelinks: number;
  strictness?: number;
  tmMatches?: number;
}

export function poolSizeFor(matchesPerRound: number): { referees: number; assistants: number } {
  const referees = Math.max(REFEREE.MIN_POOL, Math.ceil(REFEREE.POOL_PER_ROUND * matchesPerRound));
  return { referees, assistants: referees * REFEREE.ASSISTANTS_PER_REFEREE };
}

/** Age in whole years on `date` (both YYYY-MM-DD). */
export function ageOn(birthDate: string, date: string): number {
  const age = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return date.slice(5) < birthDate.slice(5) ? age - 1 : age;
}

const clampQ = (q: number) => Math.max(REFEREE.QUALITY_LIMITS[0], Math.min(REFEREE.QUALITY_LIMITS[1], Math.round(q)));

function ageBonus(age: number): number {
  if (age < 32) return -6;
  if (age <= 37) return 0;
  if (age <= 45) return 3;
  return 0;
}

/** Quality of a real referee: fame within his country (sitelinks percentile), FIFA badge, age. */
export function realQuality(ref: RealReferee, countryReals: readonly RealReferee[], date: string): number {
  const others = countryReals.filter((r) => r.role === ref.role);
  const below = others.filter((r) => r.sitelinks < ref.sitelinks).length;
  const equal = others.filter((r) => r.sitelinks === ref.sitelinks).length;
  const pct = others.length <= 1 ? 1 : (below + (equal - 1) / 2) / (others.length - 1);
  const q = 45 + 40 * pct + (ref.fifa ? 12 : 0) + ageBonus(ageOn(ref.birthDate, date));
  return Math.max(30, Math.min(98, Math.round(q)));
}

export const countrySlug = (country: string) => country.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function namePools(country: string, book: StaffNameBook | undefined): { first: string[]; last: string[] } {
  const entry = book?.[country];
  if (entry && entry.first.length > 0 && entry.last.length > 0) return entry;
  return STAFF_NAME_POOLS[country] ?? STAFF_NAME_POOLS.England!;
}

function isoDate(year: number, rng: () => number): string {
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A generated official of `country` (deterministic by save, country, date and index). */
export function generateReferee(args: {
  saveId: string; country: string; date: string; n: number; role: RefereeRole; book?: StaffNameBook;
}): Referee {
  const { saveId, country, date, n, role, book } = args;
  const year = Number(date.slice(0, 4));
  const id = `ref_g_${countrySlug(country)}_${year}_${n}`;
  const rng = mulberry32(seedFrom(`referee:${saveId}:${country}:${date}:${n}`));
  const names = namePools(country, book);
  const first = names.first[Math.floor(rng() * names.first.length)]!;
  const last = names.last[Math.floor(rng() * names.last.length)]!;
  const [a0, a1] = REFEREE.GENERATED_AGE;
  const age = a0 + Math.floor(rng() * (a1 - a0 + 1));
  const [q0, q1] = REFEREE.GENERATED_QUALITY;
  return {
    id, name: `${first} ${last}`, country, birthDate: isoDate(year - age - 1, rng), role, gender: "male",
    quality: q0 + Math.floor(rng() * (q1 - q0 + 1)), strictness: strictnessOf(id), fifa: false, generated: true, since: date,
  };
}

function fromReal(ref: RealReferee, countryReals: readonly RealReferee[], date: string): Referee {
  const real = ref.strictness !== undefined;
  return {
    id: ref.id, name: ref.name, country: ref.country, birthDate: ref.birthDate, role: ref.role, gender: ref.gender,
    quality: realQuality(ref, countryReals, date), strictness: real ? ref.strictness! : strictnessOf(ref.id),
    fifa: ref.fifa, ...(real ? { realStrictness: true as const } : {}), since: date,
  };
}

/** Fills `country` up to the size with generated officials (ids never reused). */
function fillCountry(existing: Referee[], args: {
  saveId: string; country: string; date: string; matchesPerRound: number; book?: StaffNameBook; usedIds: Set<string>;
}): Referee[] {
  const size = poolSizeFor(args.matchesPerRound);
  const out = [...existing];
  let n = 0;
  for (const role of ["referee", "assistant"] as const) {
    const want = role === "referee" ? size.referees : size.assistants;
    while (out.filter((r) => r.role === role).length < want) {
      let gen: Referee;
      do {
        gen = generateReferee({ ...args, n: n++, role });
      } while (args.usedIds.has(gen.id));
      args.usedIds.add(gen.id);
      out.push(gen);
    }
  }
  return out;
}

/** The pool of a country at the start of a career: reals first (best first), the rest generated. */
export function buildCountryPool(args: {
  country: string; real: readonly RealReferee[]; matchesPerRound: number; book?: StaffNameBook; saveId: string; date: string;
}): Referee[] {
  const size = poolSizeFor(args.matchesPerRound);
  const reals = args.real.filter((r) => r.country === args.country && ageOn(r.birthDate, args.date) < REFEREE.RETIRE_AGE);
  const mapped = reals.map((r) => fromReal(r, reals, args.date));
  const kept: Referee[] = [];
  for (const role of ["referee", "assistant"] as const) {
    const cap = role === "referee" ? size.referees : size.assistants;
    kept.push(...mapped.filter((r) => r.role === role).sort((a, b) => b.quality - a.quality || a.id.localeCompare(b.id)).slice(0, cap));
  }
  return fillCountry(kept, { ...args, usedIds: new Set(kept.map((r) => r.id)) });
}

/** True when the official retires at the renewal of `date` (50+ always, 46+ with a chance). */
export function retires(ref: Referee, date: string, saveId: string): boolean {
  const age = ageOn(ref.birthDate, date);
  if (age >= REFEREE.RETIRE_AGE) return true;
  if (age < REFEREE.RETIRE_FROM) return false;
  return mulberry32(seedFrom(`referee-retire:${saveId}:${ref.id}:${date.slice(0, 4)}`))() < REFEREE.RETIRE_CHANCE;
}

function drift(q: number, age: number): number {
  if (age <= 38) return q + 2;
  if (age <= 45) return q;
  return q - 2;
}

/**
 * Season renewal of one country (its season rollover): retirements, quality by age, refill with generated, a
 * generated referee with quality ≥ 80 gets the FIFA badge. Other countries are untouched.
 */
export function renewCountryPool(pool: RefereePool, args: {
  country: string; date: string; saveId: string; matchesPerRound: number; book?: StaffNameBook;
}): { pool: RefereePool; retired: string[] } {
  const retired: string[] = [];
  const staying: Referee[] = [];
  for (const r of pool.referees) {
    if (r.country !== args.country) continue;
    if (retires(r, args.date, args.saveId)) { retired.push(r.id); continue; }
    const quality = clampQ(drift(r.quality, ageOn(r.birthDate, args.date)));
    staying.push({ ...r, quality, fifa: r.fifa || (!!r.generated && quality >= REFEREE.GENERATED_FIFA_QUALITY) });
  }
  const usedIds = new Set(pool.referees.map((r) => r.id));
  const filled = fillCountry(staying, { ...args, usedIds });
  const others = pool.referees.filter((r) => r.country !== args.country);
  return { pool: { referees: [...others, ...filled], renewed: { ...pool.renewed, [args.country]: args.date } }, retired };
}
