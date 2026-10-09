/**
 * Referee appointments of a day (spec `docs/superpowers/specs/2026-10-09-referees-design.md` §3). Pure and
 * deterministic: same pool, state and matches → same appointments; no `Math.random`.
 */
import { daysBetween } from "@/Domain/dates";
import { REFEREE } from "@/Domain/referees/refereeConfig";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { Referee, RefereeAssignment, RefereeState } from "@/types/refereeTypes";

/** Key of a fixture in the appointments (league fixture ids repeat across leagues). */
export const fixtureKey = (competition: string, fixtureId: string) => `${competition}:${fixtureId}`;

export type ImportanceInput =
  | { kind: "league"; tier: number; bothTopHalf: boolean; derby: boolean; lateSeason: boolean }
  | { kind: "cup"; stageIndex: number; stageCount: number; topTier: number }
  | { kind: "continental"; stageIndex: number };

/** How big a match is (spec §3.2): picks who gets the best referees. */
export function matchImportance(m: ImportanceInput): number {
  switch (m.kind) {
    case "league":
      return 100 - 25 * (m.tier - 1) + (m.bothTopHalf ? 15 : 0) + (m.derby ? 10 : 0) + (m.lateSeason ? 10 : 0);
    case "cup": {
      const fromFinal = Math.max(0, m.stageCount - 1 - m.stageIndex);
      return 60 + 8 * Math.max(0, 6 - fromFinal) - 20 * (m.topTier - 1);
    }
    case "continental":
      return 120 + 10 * m.stageIndex;
  }
}

export interface DayMatch {
  key: string;
  competition: string;
  home: string;
  away: string;
  importance: number;
  /** Country of the competition (league / cup); null for continental competitions. */
  country: string | null;
  /** Continental only: the continent of the competition and the countries of the two clubs. */
  continent?: string;
  clubCountries?: [string | null, string | null];
}

export interface AssignInput {
  saveId: string;
  date: string;
  matches: readonly DayMatch[];
  referees: readonly Referee[];
  state: Pick<RefereeState, "lastWorked" | "recentByClub">;
  continentOf: (country: string) => string | undefined;
}

interface Relax { rotation: boolean; rest: boolean }

/** Appointments of the day: continental first, then each country's matches by importance. */
export function assignDay(input: AssignInput): Record<string, RefereeAssignment> {
  const { saveId, date, state } = input;
  const out: Record<string, RefereeAssignment> = {};
  if (input.referees.length === 0) return out;
  const used = new Set<string>();
  const rested = (id: string) => {
    const last = state.lastWorked[id];
    return !last || daysBetween(last, date) >= REFEREE.REST_DAYS;
  };
  const noise = (key: string, id: string) =>
    (mulberry32(seedFrom(`ref-pick:${saveId}:${date}:${key}:${id}`))() - 0.5) * 2 * REFEREE.PICK_NOISE;
  const order = (a: Referee, b: Referee, key: string) =>
    b.quality + noise(key, b.id) - (a.quality + noise(key, a.id)) || a.id.localeCompare(b.id);

  const byCountry = new Map<string, Referee[]>();
  for (const r of input.referees) {
    const list = byCountry.get(r.country) ?? [];
    list.push(r);
    byCountry.set(r.country, list);
  }

  const pickReferee = (m: DayMatch, candidates: Referee[]): Referee | undefined => {
    const recentClub = new Set([...(state.recentByClub[m.home] ?? []), ...(state.recentByClub[m.away] ?? [])]);
    for (const relax of [{ rotation: false, rest: false }, { rotation: true, rest: false }, { rotation: true, rest: true }] as Relax[]) {
      const ok = candidates.filter((r) => !used.has(r.id) && (relax.rest || rested(r.id)) && (relax.rotation || !recentClub.has(r.id)));
      if (ok.length > 0) return ok.sort((a, b) => order(a, b, m.key))[0];
    }
    return undefined;
  };
  const pickAssistants = (m: DayMatch, country: string): [string, string] | null => {
    const pool = (byCountry.get(country) ?? []).filter((r) => r.role === "assistant");
    for (const rest of [false, true]) {
      const ok = pool.filter((r) => !used.has(r.id) && (rest || rested(r.id))).sort((a, b) => order(a, b, m.key));
      if (ok.length >= 2) return [ok[0]!.id, ok[1]!.id];
    }
    return null;
  };
  const appoint = (m: DayMatch, ref: Referee | undefined) => {
    if (!ref) return;
    used.add(ref.id);
    const assistants = pickAssistants(m, ref.country);
    if (!assistants) { used.delete(ref.id); return; }
    used.add(assistants[0]);
    used.add(assistants[1]);
    out[m.key] = { refereeId: ref.id, assistantIds: assistants };
  };
  const byImportance = (a: DayMatch, b: DayMatch) => b.importance - a.importance || a.key.localeCompare(b.key);

  // Continental: a referee of another country of the continent (FIFA or quality ≥ 75), relaxed when none.
  for (const m of input.matches.filter((x) => x.country === null).sort(byImportance)) {
    const clubCountries = new Set((m.clubCountries ?? []).filter((c): c is string => !!c));
    const continental = input.referees.filter((r) => r.role === "referee" && input.continentOf(r.country) === m.continent);
    const foreign = continental.filter((r) => !clubCountries.has(r.country));
    const elite = foreign.filter((r) => r.fifa || r.quality >= REFEREE.CONTINENTAL_MIN_QUALITY);
    appoint(m, pickReferee(m, elite) ?? pickReferee(m, foreign) ?? pickReferee(m, continental));
  }
  // Domestic: each country, best available referee to the biggest match.
  const domestic = input.matches.filter((x) => x.country !== null);
  for (const country of [...new Set(domestic.map((m) => m.country!))].sort()) {
    const refs = (byCountry.get(country) ?? []).filter((r) => r.role === "referee");
    for (const m of domestic.filter((x) => x.country === country).sort(byImportance)) appoint(m, pickReferee(m, refs));
  }
  return out;
}
