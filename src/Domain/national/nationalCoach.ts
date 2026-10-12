import { addDays } from "@/Domain/dates";
import { clamp } from "@/Domain/math";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { rolloverSackChance } from "@/Domain/managers/aiManagers";
import { cleanRecord, closePassage, makeInterim, toFree } from "@/Domain/managers/managerRecords";
import { rankTeams } from "@/Domain/national/elo";
import { TOURNAMENTS, fifaWindows } from "@/Domain/national/fifaCalendar";
import { groupRows, tournamentPlacement } from "@/Domain/national/competitions";
import { NATIONAL_SQUAD, lineOf, missingByLine } from "@/Domain/national/nationalSquad";
import type { ManagerLeftReason, ManagerRecord } from "@/types/managerTypes";
import type { NationalCoachOffer, NationalCompetition } from "@/types/nationalTypes";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * The human manager at a national team (`.claude/rules/game/national-teams.md` → "Técnico do jogador", Etapa 41b),
 * pure: prestige, offers, objectives, the call-up check and the manager records.
 */

export const NATIONAL_COACH = {
  /** An offer needs prestige ≤ reputation/100 + BAND_ABOVE (the club band's ceiling, `JOBS.band.ABOVE`). */
  BAND_ABOVE: 0.1,
  /** The team of the manager's own nationality: this much higher ceiling. */
  OWN_NATION_BONUS: 0.15,
  /** Chance of an offer per vacancy inside the band (own nation: OWN_NATION_CHANCE). */
  OFFER_CHANCE: 0.35,
  OWN_NATION_CHANCE: 0.9,
  VALID_DAYS: 14,
  /** Inbox notice this many days before a call-up. */
  NOTICE_DAYS: 7,
  /** Weekly wage = WAGE_BASE + WAGE_PRESTIGE × prestige (EUR, `managerEarnings` only). */
  WAGE_BASE: 10_000,
  WAGE_PRESTIGE: 40_000,
  /** Goalkeepers a call-up needs (real + generated). */
  MIN_GK: 2,
} as const;

export interface EloTeam {
  id: string;
  nation: string;
  elo: number;
}

/** Elo percentile (1 = best) and world ranking position of a team. */
export function nationalPrestige(teams: EloTeam[], teamId: string): { prestige: number; rank: number } {
  const ranked = rankTeams(teams);
  const i = ranked.findIndex((t) => t.id === teamId);
  if (i < 0) return { prestige: 0, rank: 0 };
  return { prestige: ranked.length > 1 ? 1 - i / (ranked.length - 1) : 1, rank: i + 1 };
}

/** Chance that a vacancy offers its job to the human manager (0 outside his reputation band). */
export function offerChance(a: { reputation: number; prestige: number; ownNation: boolean }): number {
  const c = NATIONAL_COACH;
  const ceiling = a.reputation / 100 + c.BAND_ABOVE + (a.ownNation ? c.OWN_NATION_BONUS : 0);
  if (a.prestige > ceiling) return 0;
  return a.ownNation ? c.OWN_NATION_CHANCE : c.OFFER_CHANCE;
}

export function nationalWage(prestige: number): number {
  return Math.round(NATIONAL_COACH.WAGE_BASE + NATIONAL_COACH.WAGE_PRESTIGE * clamp(prestige, 0, 1));
}

/** The offer a vacancy makes on `date`, or null (draw seeded by save, team and date). */
export function rollNationalOffer(a: {
  saveId: string; teamId: string; nation: string; date: string; reputation: number; ownNation: boolean; teams: EloTeam[];
}): NationalCoachOffer | null {
  const { prestige, rank } = nationalPrestige(a.teams, a.teamId);
  const p = offerChance({ reputation: a.reputation, prestige, ownNation: a.ownNation });
  if (p <= 0 || mulberry32(seedFrom(`${a.saveId}:${a.teamId}:${a.date}:offer`))() >= p) return null;
  return {
    id: `natjob_${a.teamId}_${a.date}`, teamId: a.teamId, nation: a.nation, date: a.date,
    expires: addDays(a.date, NATIONAL_COACH.VALID_DAYS), prestige: Math.round(prestige * 1000) / 1000, rank,
    wage: nationalWage(prestige),
  };
}

// ── Objectives ────────────────────────────────────────────────────────────────

/** The stage a target placement asks for. */
export type NationalTargetStage = "champion" | "final" | "sf" | "qf" | "r16" | "r32" | "group";

export type NationalObjective =
  | { competition: string; kind: "qualifier"; group: string; target: number; groupSize: number; mustQualify: boolean }
  | { competition: string; kind: "tournament"; target: number; stage: NationalTargetStage };

/** Worst placement that meets the federation's goal for the team ranked `rank` (by Elo) in a tournament. */
export function tournamentTargetPlace(rank: number, knockout: number): number {
  const r = rank;
  return r <= 1 ? 1 : r <= 2 ? 2 : r <= 4 ? 3 : r <= 8 ? 5 : r <= 16 ? 9 : r <= 32 ? 17 : knockout + 1;
}

export function stageOfPlace(place: number, knockout: number): NationalTargetStage {
  if (place <= 1) return "champion";
  if (place <= 2) return "final";
  if (place <= 3) return "sf";
  if (place <= 5) return "qf";
  if (place <= 9) return "r16";
  if (place <= 17 && knockout >= 32) return "r32";
  return "group";
}

const eloRank = (teams: EloTeam[], ids: string[], id: string) => rankTeams(teams.filter((t) => ids.includes(t.id))).findIndex((t) => t.id === id) + 1;

/** The federation's goal in one competition (null for friendlies or when the team is not in it). */
export function nationalObjective(comp: NationalCompetition, teamId: string, teams: EloTeam[]): NationalObjective | null {
  if (!comp.teams.includes(teamId)) return null;
  if (comp.kind === "qualifier") {
    const g = comp.groups.find((x) => x.teams.includes(teamId));
    if (!g) return null;
    return {
      competition: comp.slug, kind: "qualifier", group: g.name, target: eloRank(teams, g.teams, teamId), groupSize: g.teams.length,
      mustQualify: eloRank(teams, comp.teams, teamId) <= (comp.slots ?? 0),
    };
  }
  if (comp.kind === "tournament" && comp.tournament) {
    const ko = TOURNAMENTS[comp.tournament].knockout;
    const target = tournamentTargetPlace(eloRank(teams, comp.teams, teamId), ko);
    return { competition: comp.slug, kind: "tournament", target, stage: stageOfPlace(target, ko) };
  }
  return null;
}

/** Final outcome of a qualifier group stage for a team (the input of `rolloverSackChance`). */
export function qualifierOutcome(comp: NationalCompetition, teamId: string, teams: EloTeam[], qualified: string[]) {
  const g = comp.groups.find((x) => x.teams.includes(teamId));
  const rows = g ? groupRows(comp, g) : [];
  const expected = eloRank(teams, comp.teams, teamId) <= (comp.slots ?? 0);
  return {
    position: rows.findIndex((r) => r.squadId === teamId) + 1,
    target: g ? eloRank(teams, g.teams, teamId) : 1,
    size: rows.length,
    relegated: expected && !qualified.includes(teamId),
  };
}

/** Final outcome of a tournament for an eliminated team. */
export function tournamentOutcome(comp: NationalCompetition, teamId: string, teams: EloTeam[]) {
  const ko = TOURNAMENTS[comp.tournament!].knockout;
  return {
    position: tournamentPlacement(comp, teamId),
    target: tournamentTargetPlace(eloRank(teams, comp.teams, teamId), ko),
    size: comp.teams.length,
  };
}

/** The human manager fails his objective badly (sacked): the AI rule's sackable outcome, without the draw. */
export function objectiveFailedBadly(o: { position: number; target: number; size: number; relegated?: boolean }): boolean {
  if (o.position === 1) return false;
  return rolloverSackChance({ ...o, champion: false }) > 0;
}

export function objectiveMet(o: { position: number; target: number; relegated?: boolean }): boolean {
  return !o.relegated && o.position > 0 && o.position <= o.target;
}

// ── Call-up ───────────────────────────────────────────────────────────────────

/**
 * The team's next call-up on or after `date`: the next FIFA window start, or a tournament's call-up when the team is
 * drawn in it (`tournaments`: the drawn tournaments with their call-up date and teams).
 */
export function nextCallUpDate(date: string, teamId: string, tournaments: { callUp: string; teams: string[] }[]): string | null {
  const y = Number(date.slice(0, 4));
  const dates = [y, y + 1].flatMap((yy) => fifaWindows(yy).map((w) => w.start)).filter((d) => d >= date);
  for (const t of tournaments) if (t.callUp >= date && t.teams.includes(teamId)) dates.push(t.callUp);
  return dates.sort()[0] ?? null;
}

export type CallUpCheck =
  | { ok: true; players: RosterPlayer[] }
  | { ok: false; reason: "notList" | "size" | "duplicate" | "notCandidate" | "goalkeepers" };

/**
 * The human manager's call-up: 1..23 unique real players, every one a candidate, and with the generated players that
 * complete the 23 (`missingByLine`) at least MIN_GK goalkeepers.
 */
export function checkCallUp(ids: unknown, candidates: Map<string, RosterPlayer>): CallUpCheck {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) return { ok: false, reason: "notList" };
  if (ids.length < 1 || ids.length > NATIONAL_SQUAD.SIZE) return { ok: false, reason: "size" };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "duplicate" };
  const players: RosterPlayer[] = [];
  for (const id of ids as string[]) {
    const p = candidates.get(id);
    if (!p) return { ok: false, reason: "notCandidate" };
    players.push(p);
  }
  const gk = players.filter((p) => lineOf(p) === "GK").length + missingByLine(players).GK;
  if (gk < NATIONAL_COACH.MIN_GK) return { ok: false, reason: "goalkeepers" };
  return { ok: true, players };
}

// ── Manager records ───────────────────────────────────────────────────────────

/** The human manager takes the national team: its coach leaves (an interim with nothing is dropped). */
export function takeNationalJob(managers: ManagerRecord[], a: { teamId: string; date: string }): ManagerRecord[] {
  const out: ManagerRecord[] = [];
  for (const m of managers) {
    if (m.isPlayer) {
      const national = closePassage(m.national, a.date, "moved");
      out.push(cleanRecord({ ...m, national: [...national, { squadId: a.teamId, from: a.date }] }));
    } else if (m.squadId === a.teamId) {
      if (!(m.interim && m.points === 0 && m.titles.length === 0)) out.push(toFree(m, a.date, m.interim ? "interim" : "moved"));
    } else {
      out.push(m);
    }
  }
  return out;
}

/** The human manager leaves the national team (sacked or resigned): his spell closes, an interim takes over. */
export function leaveNationalJob(
  managers: ManagerRecord[],
  a: { teamId: string; nation: string; date: string; left: ManagerLeftReason },
): { managers: ManagerRecord[]; interimId: string } {
  const out = managers.map((m) => (m.isPlayer ? cleanRecord({ ...m, national: closePassage(m.national, a.date, a.left) }) : m));
  const interim = makeInterim(a.teamId, a.nation, a.date, new Set(out.map((m) => m.id)));
  return { managers: [...out, interim], interimId: interim.id };
}

/** The team the human manager coaches now (his open national spell). */
export function currentNationalTeam(m: ManagerRecord | null | undefined): string | null {
  const open = [...(m?.national ?? [])].reverse().find((p) => !p.to);
  return open?.squadId ?? null;
}
