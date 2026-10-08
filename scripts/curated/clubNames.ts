/**
 * Manual club display names (`data_process/curated/clubNameCorrections.json`, see
 * `.claude/rules/data/espn-import.md` → "Nomes de clubes"): the native and imported squads carry
 * data spellings ("Sao Paulo", "Atletico-MG", "Chapecoense-sc"); this sets the name a player knows.
 * Applied at the end of the import chain, so the importers' name matching never sees it.
 *
 * Pure module — no filesystem. `scripts/applyClubNameCorrections.ts` reads and writes the world.
 */

export interface ClubNameCorrection {
  name: string;
  shortName?: string;
}

export type ClubNameCorrections = Record<string, ClubNameCorrection>;

const ENTITY = /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;

function checkName(id: string, field: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`clubNameCorrections[${id}].${field}: expected a non-empty string`);
  if (v.trim() !== v) throw new Error(`clubNameCorrections[${id}].${field}: leading/trailing spaces`);
  if (ENTITY.test(v)) throw new Error(`clubNameCorrections[${id}].${field}: HTML entity in ${JSON.stringify(v)}`);
  return v;
}

/** Validates the corrections file; throws on anything unexpected (curated data must be exact). */
export function parseClubNameCorrections(raw: unknown): ClubNameCorrections {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("clubNameCorrections: expected an object keyed by squad id");
  const out: ClubNameCorrections = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`clubNameCorrections[${id}]: expected an object`);
    const v = value as Record<string, unknown>;
    for (const k of Object.keys(v)) {
      if (k !== "name" && k !== "shortName") throw new Error(`clubNameCorrections[${id}]: unknown field "${k}"`);
    }
    const c: ClubNameCorrection = { name: checkName(id, "name", v.name) };
    if (v.shortName !== undefined) c.shortName = checkName(id, "shortName", v.shortName);
    out[id] = c;
  }
  return out;
}

/** Finds the file of each corrected squad id; throws when an id is missing or appears twice. */
export function locateSquads(
  squads: ReadonlyMap<string, { id: string }>,
  ids: readonly string[],
): Map<string, string> {
  const wanted = new Set(ids);
  const found = new Map<string, string[]>();
  for (const [file, squad] of squads) {
    if (wanted.has(squad.id)) found.set(squad.id, [...(found.get(squad.id) ?? []), file]);
  }
  const out = new Map<string, string>();
  for (const id of ids) {
    const files = found.get(id) ?? [];
    if (files.length === 0) throw new Error(`clubNameCorrections: squad ${id} is not in the world`);
    if (files.length > 1) throw new Error(`clubNameCorrections: squad ${id} appears in ${files.length} files: ${files.join(", ")}`);
    out.set(id, files[0]!);
  }
  return out;
}

export interface ClubNameResult<T> { squad: T; changed: boolean; before: string }

/** Sets the squad's name (and shortName, when the correction has one). Never mutates the input. */
export function applyClubName<T extends { name: string; shortName?: string }>(squad: T, c: ClubNameCorrection): ClubNameResult<T> {
  const nameDiffers = squad.name !== c.name;
  const shortDiffers = c.shortName !== undefined && squad.shortName !== c.shortName;
  if (!nameDiffers && !shortDiffers) return { squad, changed: false, before: squad.name };
  const next = { ...squad, name: c.name };
  if (c.shortName !== undefined) next.shortName = c.shortName;
  return { squad: next, changed: true, before: squad.name };
}

interface StandingsEntry { squadId: string; name: string; shortName?: string }

/**
 * Renames the corrected clubs in `leagueData.json`'s standings. A `shortName` is only written where
 * the entry already has one (the catalogue does not carry it today).
 */
export function applyStandingsNames<L extends { standings?: StandingsEntry[] }>(
  leagues: readonly L[],
  corrections: ClubNameCorrections,
): { leagues: L[]; changed: number } {
  let changed = 0;
  const out = leagues.map((league) => {
    if (!league.standings) return league;
    let touched = false;
    const standings = league.standings.map((e) => {
      const c = corrections[e.squadId];
      if (!c) return e;
      const next = { ...e, name: c.name };
      if (c.shortName !== undefined && e.shortName !== undefined) next.shortName = c.shortName;
      if (next.name === e.name && next.shortName === e.shortName) return e;
      changed++;
      touched = true;
      return next;
    });
    return touched ? { ...league, standings } : league;
  });
  return { leagues: out, changed };
}
