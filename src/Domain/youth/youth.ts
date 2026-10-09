import { RETIREMENT } from "@/Domain/retirement/retirementConfig";
import { rebornDpMult } from "@/Domain/retirement/rebornMult";
import { professionalismDpMult } from "@/Domain/personality/personality";
import { YOUTH as Y } from "@/Domain/youth/youthConfig";
import { aiClubFinance, financialTierOf, passesWageGate } from "@/Domain/aiFinance/aiClubFinance";
import { renewalContract } from "@/Domain/contracts/contracts";
import { MAX_SQUAD, MIN_BY_ROLE, roleOf } from "@/Domain/contracts/freeAgents";
import { roundAttr } from "@/Domain/attributes";
import { MAIN_ROLE_TO_SPECIFICS, overallAvg, weightedScore } from "@/Domain/playerRating";
import { areaMultsOf, effectiveRating, staffEffectsOf } from "@/Domain/staff/staff";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { academyEffectsOf } from "@/Domain/facilities/facilities";
import { applyTrainingDevelopment, GROWTH_DP_SCALE, type AreaMults } from "@/GameEngine/PlayerDevelopment";
import ROLES from "@/Data/roles.json";
import type { MainRole } from "@/Domain/roles";
import type { PlayerStatsRecord, RosterPlayer, Squad } from "@/types/playerTypes";
import { clamp } from "@/Domain/math";
import { seedFrom } from "@/Domain/rng";

/** Pure youth-academy model (`.claude/rules/game/youth.md`). No I/O. */

const STAT_KEYS: (keyof PlayerStatsRecord)[] = [
  "passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling",
  "pressing", "stamina", "heading", "strength", "reflex", "jump",
];

const unit = (key: string) => seedFrom(key) / 4294967296;
const gauss = (key: string) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-9, unit(`${key}:u`)))) * Math.cos(2 * Math.PI * unit(`${key}:v`));

const MAIN_ROLES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];

/** Mean rating of the club's players of one main role (whole squad mean when it has none). */
export function lineAverage(squad: Squad, role: MainRole): number {
  const line = squad.players.filter((p) => roleOf(p) === role);
  const pool = line.length > 0 ? line : squad.players;
  if (pool.length === 0) return 5;
  return pool.reduce((s, p) => s + overallAvg(p), 0) / pool.length;
}

/** Assistant coach rating (1..10) -> level bonus, linear, 0 at 5.5. */
function assistantLevelBonus(rating: number): number {
  return clamp((rating - 5.5) / 4.5, -1, 1) * Y.ASSISTANT_BONUS;
}

const STATS_CACHE_MAX = 20000;
const statsCache = new Map<string, PlayerStatsRecord>();

/**
 * Attribute vector for `target` overall in `specific` role, shaped by the role's weights. Pure, so it is
 * memoised (bounded): the youth-competition fillers ask for the same youngsters every round.
 */
export function statsFor(id: string, specific: string, target: number): PlayerStatsRecord {
  const key = `${id}|${specific}|${target}`;
  const hit = statsCache.get(key);
  if (hit) return { ...hit };
  const out = computeStatsFor(id, specific, target);
  if (statsCache.size >= STATS_CACHE_MAX) statsCache.delete(statsCache.keys().next().value!);
  statsCache.set(key, out);
  return { ...out };
}

function computeStatsFor(id: string, specific: string, target: number): PlayerStatsRecord {
  const weights = (ROLES as Record<string, { attrWeights?: Record<string, number> }>)[specific]?.attrWeights ?? {};
  const ws = STAT_KEYS.map((k) => weights[k] ?? 0);
  const wMax = Math.max(...ws, 0.001);
  const wMean = ws.reduce((a, b) => a + b, 0) / ws.length;
  const raw = STAT_KEYS.map((k, i) => 2 * ((ws[i]! - wMean) / wMax) + 0.45 * gauss(`${id}:n:${k}`));
  const continuous = (shift: number): PlayerStatsRecord => {
    const out = {} as Record<string, number>;
    STAT_KEYS.forEach((k, i) => { out[k] = clamp(shift + raw[i]!, 0, 10); });
    return out as unknown as PlayerStatsRecord;
  };
  let lo = -6;
  let hi = 14;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (weightedScore(continuous(mid), specific) < target) lo = mid; else hi = mid;
  }
  const best = continuous((lo + hi) / 2);
  const out = {} as Record<string, number>;
  for (const k of STAT_KEYS) {
    const v = roundAttr(best[k]);
    // An attribute the role does not use stays low (a striker has no goalkeeping).
    out[k] = (weights[k] ?? 0) > 0 ? v : Math.min(v, 2);
  }
  return out as unknown as PlayerStatsRecord;
}

function pickRoles(squad: Squad, count: number, key: string): MainRole[] {
  const counts: Record<MainRole, number> = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 };
  for (const p of squad.players) counts[roleOf(p)]++;
  for (const p of squad.youth ?? []) counts[roleOf(p)]++;
  const weight: Record<MainRole, number> = { GK: 1, Defender: 4, Midfielder: 4, Forward: 3 };
  const picked: MainRole[] = [];
  for (let i = 0; i < count; i++) {
    const deficits = MAIN_ROLES.filter((r) => counts[r] < MIN_BY_ROLE[r]);
    let role: MainRole;
    if (deficits.length > 0) {
      role = [...deficits].sort((a, b) => counts[a] / MIN_BY_ROLE[a] - counts[b] / MIN_BY_ROLE[b])[0]!;
    } else {
      const total = MAIN_ROLES.reduce((s, r) => s + weight[r], 0);
      let x = unit(`${key}:role:${i}`) * total;
      role = MAIN_ROLES.find((r) => (x -= weight[r]) < 0) ?? "Midfielder";
    }
    counts[role]++;
    picked.push(role);
  }
  return picked;
}

/**
 * A generated young player (no contract): name from the club's own squad, age in `ageRange`, foot and
 * attributes from the seed. Shared by the yearly intake and the youth-competition fillers
 * (`src/Domain/youthComps/youthLineup.ts`). Deterministic per `seed` + `i`.
 */
export function makeAcademyPlayer(args: {
  id: string;
  seed: string;
  i: number;
  squad: Squad;
  specific: string;
  level: number;
  ageRange: readonly [number, number];
  nationality: string | null;
  promise?: boolean;
}): RosterPlayer {
  const { id, seed, i, squad, specific, level, ageRange, nationality, promise } = args;
  const donor = squad.players[Math.floor(unit(`${seed}:donor:${i}`) * squad.players.length)];
  const parts = donor?.name.trim().split(" ") ?? ["Silva"];
  const initial = squad.players[Math.floor(unit(`${seed}:ini:${i}`) * squad.players.length)]?.name.trim()[0] ?? "J";
  return {
    id,
    name: `${initial}. ${parts[parts.length - 1]}`,
    age: ageRange[0] + Math.floor(unit(`${seed}:age:${i}`) * (ageRange[1] - ageRange[0] + 1)),
    squadId: squad.id,
    preferredFoot: unit(`${seed}:foot:${i}`) < 0.5 ? "left" : "right",
    positions: [specific],
    stats: statsFor(id, specific, level),
    profile: {
      summary: promise ? "Exceptional academy prospect." : "Young prospect from the academy.",
      archetype: promise ? "Wonderkid" : "Prospect",
    },
    nationality,
  };
}

/** Deterministic unit draw / standard normal from a key (shared with the youth-competition fillers). */
export const academyUnit = unit;
export const academyGauss = gauss;

/**
 * Deterministic intake size (3-5; 3-6 with a level-5 academy, `.claude/rules/game/facilities.md`)
 * for a club + year.
 */
export function intakeSize(saveId: string, squadId: string, year: number, max: number = Y.INTAKE_MAX): number {
  return Y.INTAKE_MIN + Math.floor(unit(`${saveId}:${squadId}:${year}:n`) * (max - Y.INTAKE_MIN + 1));
}

/**
 * The yearly academy intake of `squad`: 3-5 players of 16-17, level = own line average - 1.8
 * (+ tier, + assistant coach for the human club, +/- noise, rare +1.0 prospect), attributes shaped
 * by the role profile, 3-year contract. Deterministic per save + club + year.
 */
export function generateIntake(args: {
  saveId: string;
  squad: Squad;
  year: number;
  nextSeasonEnd: string;
  /** Human club only: assistant coach rating. */
  assistantRating?: number;
}): RosterPlayer[] {
  const { saveId, squad, year, nextSeasonEnd, assistantRating } = args;
  const seed = `${saveId}:${squad.id}:${year}`;
  // Academy (`.claude/rules/game/facilities.md`): stored level for the human club, the tier's for AI.
  const academy = academyEffectsOf(squad);
  const n = intakeSize(saveId, squad.id, year, academy.intakeMax);
  const roles = pickRoles(squad, n, seed);
  const tier = Y.TIER_BONUS[financialTierOf(squad)];
  const assistant = assistantRating === undefined ? 0 : assistantLevelBonus(assistantRating);
  const out: RosterPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const id = `youth_${squad.id}_${year}_${i}`;
    const role = roles[i]!;
    const specifics = MAIN_ROLE_TO_SPECIFICS[role];
    const specific = specifics[Math.floor(unit(`${seed}:pos:${i}`) * specifics.length)]!;
    const promise = unit(`${seed}:promise:${i}`) < academy.promiseChance;
    const level = clamp(
      lineAverage(squad, role) - Y.LEVEL_OFFSET + tier + assistant + academy.qualityBonus + Y.LEVEL_SIGMA * gauss(`${seed}:lvl:${i}`)
        + (promise ? Y.PROMISE_BONUS : 0),
      Y.LEVEL_MIN, Y.LEVEL_MAX,
    );
    const player = makeAcademyPlayer({
      id, seed, i, squad, specific, level, promise,
      ageRange: [Y.INTAKE_AGE_MIN, Y.INTAKE_AGE_MAX],
      nationality: squad.country ?? null,
    });
    out.push({ ...player, contract: renewalContract(player, squad, nextSeasonEnd, Y.CONTRACT_YEARS) });
  }
  return out;
}

export { potentialBand } from "@/Domain/youth/potential";

/**
 * One season of academy training (no matches): DP from training sessions, then age + 1. `areaMults` are the
 * club's training areas (`src/Domain/staff`, growth only); absent = neutral.
 */
export function developYouthSeason(player: RosterPlayer, dpMult: number, areaMults: AreaMults = {}): RosterPlayer {
  const weights = dpWeightsFor(player);
  let p: RosterPlayer = { ...player, overallAvg: undefined };
  // GROWTH_DP_SCALE slows the squad down to the old pace of whole-point steps, whose progress reset at every
  // rollover hid most of a season's growth. Academy progress is never reset, so it never had that dead zone:
  // dividing the scale back out keeps the academy at its old pace (.claude/rules/game/development.md, "Passo de 0,1").
  const academyDpMult = (dpMult * rebornDpMult(player) * professionalismDpMult(player)) / GROWTH_DP_SCALE;
  for (let i = 0; i < Y.SESSIONS_PER_SEASON; i++) {
    p = applyTrainingDevelopment(p, "normal", weights, academyDpMult, areaMults).updatedPlayer;
  }
  return { ...p, age: p.age + 1, overallAvg: undefined };
}

export interface YouthRolloverResult {
  squad: Squad;
  /** New intake (human: now in `squad.youth`; AI: before promotion/discard). */
  intake: RosterPlayer[];
  /** Human only: youth released for reaching the age limit. */
  autoReleased: RosterPlayer[];
  /** AI only: intake players promoted into the squad. */
  promoted: RosterPlayer[];
}

/**
 * Season-rollover step of the academy. Human club: ages and trains the existing academy, releases
 * who reached 19, adds the new intake to `squad.youth`. AI club: promotes the best 1-2 of the
 * intake straight into the squad (<= 30, wage cap permitting) and discards the rest.
 */
export function processYouthRollover(args: {
  saveId: string;
  squad: Squad;
  year: number;
  nextSeasonEnd: string;
  isHuman: boolean;
}): YouthRolloverResult {
  const { saveId, squad, year, nextSeasonEnd, isHuman } = args;
  if (isHuman) {
    const assistantRating = effectiveRating(squad, "assistant");
    const devMult = staffEffectsOf(squad).devMult;
    const areas = areaMultsOf(squad);
    const aged = (squad.youth ?? []).map((p) => developYouthSeason(p, devMult, areas));
    // Reborn players may stay until the end of their x1.3 window (REBORN_UNTIL_AGE).
    const leaves = (p: RosterPlayer) => p.age >= (p.reborn ? RETIREMENT.REBORN_UNTIL_AGE : Y.RELEASE_AGE);
    const autoReleased = aged.filter(leaves);
    const kept = aged.filter((p) => !leaves(p));
    const base = { ...squad, youth: kept };
    const intake = generateIntake({ saveId, squad: base, year, nextSeasonEnd, assistantRating });
    return { squad: { ...base, youth: [...kept, ...intake] }, intake, autoReleased, promoted: [] };
  }
  const intake = generateIntake({ saveId, squad, year, nextSeasonEnd });
  const room = MAX_SQUAD - squad.players.length;
  const want = squad.players.length >= Y.AI_PROMOTE_FULL_SQUAD_ONE ? 1 : Y.AI_PROMOTE_MAX;
  const ranked = [...intake].sort((a, b) => overallAvg(b) - overallAvg(a));
  const promoted: RosterPlayer[] = [];
  let current = squad;
  for (const p of ranked) {
    if (promoted.length >= Math.min(want, room)) break;
    const fin = aiClubFinance(current);
    if (!passesWageGate(fin, p.contract?.wage ?? 0, 0)) continue;
    promoted.push(p);
    current = { ...current, players: [...current.players, p] };
  }
  return { squad: current, intake, autoReleased: [], promoted };
}

/**
 * The human club becomes an AI club (`.claude/rules/game/jobs.md`): its academy follows the AI rule —
 * the best 1-2 are promoted into the squad (<= 30, wage cap permitting), the rest leave (free agents).
 */
export function academyToAi(squad: Squad): { squad: Squad; promoted: RosterPlayer[]; released: RosterPlayer[] } {
  const youth = squad.youth ?? [];
  const { youth: _, ...base } = squad;
  const room = MAX_SQUAD - base.players.length;
  const want = base.players.length >= Y.AI_PROMOTE_FULL_SQUAD_ONE ? 1 : Y.AI_PROMOTE_MAX;
  const ranked = [...youth].sort((a, b) => overallAvg(b) - overallAvg(a));
  const promoted: RosterPlayer[] = [];
  let current: Squad = base;
  for (const p of ranked) {
    if (promoted.length >= Math.min(want, room)) break;
    if (!passesWageGate(aiClubFinance(current), p.contract?.wage ?? 0, 0)) continue;
    promoted.push(p);
    current = { ...current, players: [...current.players, p] };
  }
  const kept = new Set(promoted.map((p) => p.id));
  return { squad: current, promoted, released: youth.filter((p) => !kept.has(p.id)) };
}
