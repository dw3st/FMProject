import { RETIREMENT as R } from "@/Domain/retirement/retirementConfig";
import { renewalContract } from "@/Domain/contracts/contracts";
import { roleOf } from "@/Domain/contracts/freeAgents";
import { seedFrom } from "@/Domain/cups/cupIds";
import { overallAvg, weightedScore } from "@/Domain/playerRating";
import { lineAverage } from "@/Domain/youth/youth";
import { YOUTH } from "@/Domain/youth/youthConfig";
import type { MainRole } from "@/GameInterface/positionHelpers";
import type {
  FreeAgent, PlayerStatsRecord, RetiredPlayer, RosterPlayer, Squad,
} from "@/types/playerTypes";

/** Pure retirement + reborn model (`.claude/rules/game/retirement.md`). No I/O. */

const STAT_KEYS: (keyof PlayerStatsRecord)[] = [
  "passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling",
  "pressing", "stamina", "heading", "strength", "reflex", "jump",
];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const unit = (key: string) => seedFrom(key) / 4294967296;

/** Retirement chance at `age` for a player at level percentile `pctl` (0 worst .. 1 best of his line). */
export function retireChance(age: number, pctl: number): number {
  if (age >= R.FORCED_AGE) return 1;
  if (age < R.MIN_AGE) return 0;
  const base = R.BASE_BY_AGE[Math.min(age, 39)] ?? 0;
  return clamp(base * (R.LEVEL_BASE - R.LEVEL_SLOPE * clamp(pctl, 0, 1)), 0, 1);
}

/** Deterministic draw: does this player retire this year? */
export function retires(saveId: string, playerId: string, year: number, age: number, pctl: number): boolean {
  const chance = retireChance(age, pctl);
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return unit(`${saveId}:${playerId}:${year}:retire`) < chance;
}

export interface WorldLevels {
  /** Ascending overall values per main role. */
  byRole: Record<MainRole, number[]>;
  /** Ids of the best `WORLD_CLASS_TOP` players of the world. */
  top: Set<string>;
}

export function buildWorldLevels(squads: Squad[]): WorldLevels {
  const byRole: Record<MainRole, number[]> = { GK: [], Defender: [], Midfielder: [], Forward: [] };
  const all: { id: string; v: number }[] = [];
  for (const s of squads) {
    for (const p of s.players) {
      const v = overallAvg(p);
      byRole[roleOf(p)].push(v);
      all.push({ id: p.id, v });
    }
  }
  for (const r of Object.keys(byRole) as MainRole[]) byRole[r].sort((a, b) => a - b);
  all.sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  return { byRole, top: new Set(all.slice(0, R.WORLD_CLASS_TOP).map((x) => x.id)) };
}

/** Fraction of the line (world) strictly below `value`: 0 = worst, ~1 = best. */
export function levelPercentile(sortedAsc: number[], value: number): number {
  if (sortedAsc.length === 0) return 0.5;
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid]! < value) lo = mid + 1; else hi = mid;
  }
  return lo / sortedAsc.length;
}

export function toRetiredRecord(
  p: RosterPlayer, date: string, squadId: string, wasWorldClass: boolean,
  log?: { appearances: number; goals: number },
): RetiredPlayer {
  return {
    id: p.id, name: p.name, nationality: p.nationality ?? null, positions: p.positions,
    preferredFoot: p.preferredFoot, profile: p.profile, retiredOn: date, squadId, age: p.age,
    wasWorldClass, statsAtRetirement: p.stats,
    appearances: log?.appearances ?? p.seasonLog?.appearances ?? 0,
    goals: log?.goals ?? p.seasonLog?.goals ?? 0,
  };
}

export interface RetirementResult {
  squads: Squad[];
  freeAgents: FreeAgent[];
  retired: RetiredPlayer[];
  /** Retirees of the human club (inbox + reborn offers). */
  humanRetired: RetiredPlayer[];
}

/**
 * Applies the rollover retirement draw to the given squads and the free-agent pool. `levels` is the
 * world distribution (before anyone retires). A squad nobody left keeps the same reference.
 */
export function processRetirements(args: {
  saveId: string;
  year: number;
  date: string;
  squads: Squad[];
  freeAgents: FreeAgent[];
  levels: WorldLevels;
  humanSquadId: string | null;
  /** Draw the free-agent pool too. The caller does this at most once per world year. Default true. */
  processFreeAgents?: boolean;
  /** Last season logs by player id (the squad logs were already reset by the transition). */
  logs?: Record<string, { appearances: number; goals: number }>;
}): RetirementResult {
  const { saveId, year, date, freeAgents, levels, humanSquadId, logs } = args;
  const records: RetiredPlayer[] = [];
  const humanRetired: RetiredPlayer[] = [];
  const squads = args.squads.map((sq) => {
    const leaving = sq.players.filter((p) =>
      p.age >= R.MIN_AGE && retires(saveId, p.id, year, p.age, levelPercentile(levels.byRole[roleOf(p)], overallAvg(p))));
    if (leaving.length === 0) return sq;
    const isHuman = sq.id === humanSquadId;
    for (const p of leaving) {
      const worldClass = isHuman && levels.top.has(p.id);
      const rec: RetiredPlayer = {
        ...toRetiredRecord(p, date, sq.id, worldClass, logs?.[p.id]),
        ...(worldClass ? { rebornOffer: "pending" as const } : {}),
      };
      records.push(rec);
      if (isHuman) humanRetired.push(rec);
    }
    const gone = new Set(leaving.map((p) => p.id));
    return { ...sq, players: sq.players.filter((p) => !gone.has(p.id)) };
  });

  const keptFree: FreeAgent[] = [];
  for (const f of args.processFreeAgents === false ? [] : freeAgents) {
    const p = f.player;
    const age = p.age + R.FREE_AGENT_AGE_BONUS;
    if (age >= R.MIN_AGE
      && retires(saveId, p.id, year, age, levelPercentile(levels.byRole[roleOf(p)], overallAvg(p)))) {
      records.push({ ...toRetiredRecord(p, date, p.squadId, false), freeAgent: true });
    } else keptFree.push(f);
  }
  return { squads, freeAgents: args.processFreeAgents === false ? freeAgents : keptFree, retired: records, humanRetired };
}

/** Expires every pending reborn offer (the offer lives until the next country rollover). */
export function expireOffers(retired: RetiredPlayer[]): RetiredPlayer[] {
  return retired.map((r) => (r.rebornOffer === "pending" ? { ...r, rebornOffer: "expired" as const } : r));
}

/**
 * The reborn academy player: new id, same identity and attribute shape, 17 years old, level =
 * the club line average - 0.8. A single attribute shift preserves the relative shape.
 */
export function generateReborn(args: {
  retired: RetiredPlayer;
  squad: Squad;
  year: number;
  nextSeasonEnd: string;
}): RosterPlayer {
  const { retired, squad, year, nextSeasonEnd } = args;
  const specific = retired.positions[0] ?? "CM";
  const probe: RosterPlayer = {
    id: "probe", name: "", age: R.REBORN_AGE, squadId: squad.id, preferredFoot: retired.preferredFoot,
    positions: retired.positions, stats: retired.statsAtRetirement, profile: retired.profile,
  };
  const role = roleOf(probe);
  const target = clamp(lineAverage(squad, role) - R.REBORN_LEVEL_OFFSET, R.REBORN_LEVEL_MIN, R.REBORN_LEVEL_MAX);
  const id = `reborn_${retired.id}_${year}`;
  const shifted = (shift: number): PlayerStatsRecord => {
    const out = {} as Record<string, number>;
    for (const k of STAT_KEYS) out[k] = clamp(retired.statsAtRetirement[k] + shift, 0, 10);
    return out as unknown as PlayerStatsRecord;
  };
  let lo = -10;
  let hi = 10;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (weightedScore(shifted(mid), specific) < target) lo = mid; else hi = mid;
  }
  const best = shifted((lo + hi) / 2);
  const stats = {} as Record<string, number>;
  for (const k of STAT_KEYS) stats[k] = clamp(Math.floor(best[k] + unit(`${id}:r:${k}`)), 0, 10);
  const player: RosterPlayer = {
    id, name: retired.name, age: R.REBORN_AGE, squadId: squad.id, preferredFoot: retired.preferredFoot,
    positions: retired.positions, stats: stats as unknown as PlayerStatsRecord, profile: retired.profile,
    nationality: retired.nationality,
    reborn: { fromId: retired.id },
  };
  return { ...player, contract: renewalContract(player, squad, nextSeasonEnd, YOUTH.CONTRACT_YEARS) };
}
