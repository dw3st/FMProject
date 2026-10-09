/**
 * Head coaches of the world (`.claude/rules/data/espn-import.md` → "Técnicos"): the current coach from Wikidata
 * (`data_process/wikidata/coaches.json`, made by `scripts/fetchWikidataCoaches.ts`) and the manual corrections
 * (`data_process/curated/coachCorrections.json`), which win. A club in neither file keeps the coach it has.
 *
 * Pure module — no filesystem. `scripts/applyCoaches.ts` reads and writes the world.
 */
import { unitHash } from "@/../scripts/openfootball/ids";

/** Ages are taken on the first day of the world's season (2026/27), like the players' ages. */
export const COACH_AGE_ON = "2026-07-01";

export interface WikidataCoach { name: string; nationality?: string; birthDate?: string; wikidataQid: string }
export interface CoachCorrection { name: string; nationality?: string; age?: number }
export interface Coach { id: number; name: string; nationality?: string; age?: number }

const ENTITY = /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkText(file: string, id: string, field: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`${file}[${id}].${field}: expected a non-empty string`);
  if (v.trim() !== v) throw new Error(`${file}[${id}].${field}: leading/trailing spaces`);
  if (ENTITY.test(v)) throw new Error(`${file}[${id}].${field}: HTML entity in ${JSON.stringify(v)}`);
  return v;
}

function entries(file: string, raw: unknown): [string, Record<string, unknown>][] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${file}: expected an object keyed by squad id`);
  return Object.entries(raw as Record<string, unknown>).map(([id, v]) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${file}[${id}]: expected an object`);
    return [id, v as Record<string, unknown>];
  });
}

function checkFields(file: string, id: string, v: Record<string, unknown>, allowed: readonly string[]): void {
  for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new Error(`${file}[${id}]: unknown field "${k}"`);
}

export function parseWikidataCoaches(raw: unknown): Record<string, WikidataCoach> {
  const file = "wikidata/coaches";
  const out: Record<string, WikidataCoach> = {};
  for (const [id, v] of entries(file, raw)) {
    checkFields(file, id, v, ["name", "nationality", "birthDate", "wikidataQid"]);
    const c: WikidataCoach = { name: checkText(file, id, "name", v.name), wikidataQid: checkText(file, id, "wikidataQid", v.wikidataQid) };
    if (!/^Q\d+$/.test(c.wikidataQid)) throw new Error(`${file}[${id}].wikidataQid: not a QID`);
    if (v.nationality !== undefined) c.nationality = checkText(file, id, "nationality", v.nationality);
    if (v.birthDate !== undefined) {
      const b = checkText(file, id, "birthDate", v.birthDate);
      if (!DATE.test(b)) throw new Error(`${file}[${id}].birthDate: expected YYYY-MM-DD`);
      c.birthDate = b;
    }
    out[id] = c;
  }
  return out;
}

export function parseCoachCorrections(raw: unknown): Record<string, CoachCorrection> {
  const file = "coachCorrections";
  const out: Record<string, CoachCorrection> = {};
  for (const [id, v] of entries(file, raw)) {
    checkFields(file, id, v, ["name", "nationality", "age"]);
    const c: CoachCorrection = { name: checkText(file, id, "name", v.name) };
    if (v.nationality !== undefined) c.nationality = checkText(file, id, "nationality", v.nationality);
    if (v.age !== undefined) {
      if (typeof v.age !== "number" || !Number.isInteger(v.age) || v.age < 18 || v.age > 90) throw new Error(`${file}[${id}].age: expected an integer 18..90`);
      c.age = v.age;
    }
    out[id] = c;
  }
  return out;
}

/** Age in whole years on `on` (both YYYY-MM-DD). */
export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [y, m, d] = on.split("-").map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Stable id from the club and the coach's name (same coach at the same club = same id, run after run). */
export const coachId = (squadId: string, name: string) => Math.floor(unitHash(`coach:${squadId}:${name}`) * 1e9);

/**
 * The coach record for a club: the correction when there is one (taken whole, nothing merged from Wikidata, which
 * may be another person), else Wikidata; `null` = keep the squad's coach. Only `id`, `name`, `nationality`, `age`.
 */
export function coachFor(squadId: string, wd: WikidataCoach | undefined, fix: CoachCorrection | undefined): Coach | null {
  if (fix) {
    return { id: coachId(squadId, fix.name), name: fix.name, ...(fix.nationality ? { nationality: fix.nationality } : {}), ...(fix.age !== undefined ? { age: fix.age } : {}) };
  }
  if (wd) {
    return {
      id: coachId(squadId, wd.name), name: wd.name,
      ...(wd.nationality ? { nationality: wd.nationality } : {}),
      ...(wd.birthDate ? { age: ageOn(wd.birthDate, COACH_AGE_ON) } : {}),
    };
  }
  return null;
}

/** Replaces the whole `coach` (no stale fields kept). Never mutates the input. */
export function applyCoach<T extends { coach?: unknown }>(squad: T, coach: Coach): { squad: T; changed: boolean } {
  if (JSON.stringify(squad.coach) === JSON.stringify(coach)) return { squad, changed: false };
  return { squad: { ...squad, coach }, changed: true };
}

/** Finds the file of each squad id; throws when an id is missing from the world or appears twice. */
export function locateCoachSquads(squads: ReadonlyMap<string, { id: string }>, ids: readonly string[], file: string): Map<string, string> {
  const wanted = new Set(ids);
  const found = new Map<string, string[]>();
  for (const [path, squad] of squads) if (wanted.has(squad.id)) found.set(squad.id, [...(found.get(squad.id) ?? []), path]);
  const out = new Map<string, string>();
  for (const id of ids) {
    const files = found.get(id) ?? [];
    if (files.length === 0) throw new Error(`${file}: squad ${id} is not in the world`);
    if (files.length > 1) throw new Error(`${file}: squad ${id} appears in ${files.length} files: ${files.join(", ")}`);
    out.set(id, files[0]!);
  }
  return out;
}
