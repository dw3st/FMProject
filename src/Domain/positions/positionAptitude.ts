import type { DetailedRole, PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import { fixedNaturalRole, weightedScore } from "@/Domain/playerRating";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { APT_RATIO, NEIGHBOUR_APT_RATIO, POSITION_PENALTY, TRAINING_RATIO, type Aptitude } from "@/Domain/positions/positionConfig";

export type { Aptitude } from "@/Domain/positions/positionConfig";

export const DETAILED_ROLES = [
  "GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
] as const satisfies readonly DetailedRole[];
export type { DetailedRole };

const LINE_ROLES: Record<MainRole, readonly DetailedRole[]> = {
  GK: ["GK"],
  Defender: ["CB", "LB", "RB", "LWB", "RWB"],
  Midfielder: ["CDM", "CM", "CAM", "LM", "RM"],
  Forward: ["LW", "RW", "ST"],
};

const LEFT: ReadonlySet<string> = new Set(["LB", "LWB", "LM", "LW"]);
const RIGHT: ReadonlySet<string> = new Set(["RB", "RWB", "RM", "RW"]);

function isDetailedRole(role: string): role is DetailedRole {
  return (DETAILED_ROLES as readonly string[]).includes(role);
}

function lineOf(player: Pick<RosterPlayer, "positions">): MainRole {
  return getMainRole(player.positions[0] ?? "CM");
}

/** A left foot is natural only on the left (or centre); a right foot only on the right (or centre). */
function sideAllows(foot: string | undefined, role: DetailedRole): boolean {
  if (foot === "left") return !RIGHT.has(role);
  if (foot === "right") return !LEFT.has(role);
  return true;
}

interface Natural { role: DetailedRole; score: number }

function naturalOf(
  stats: PlayerStatsRecord,
  line: MainRole,
  foot: string | undefined,
  fixed: DetailedRole | undefined,
): Natural {
  // A curated natural position wins over the attributes and over the foot rule.
  if (fixed) return { role: fixed, score: weightedScore(stats, fixed) };
  const roles = LINE_ROLES[line];
  let best: DetailedRole = roles[0]!;
  let bestScore = -1;
  for (const r of roles) {
    if (!sideAllows(foot, r)) continue;
    const s = weightedScore(stats, r);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return { role: best, score: bestScore };
}

/**
 * Same-line neighbours that play the same job: a natural role in a group is at least `apt` in any
 * other role of that group when its score is within `NEIGHBOUR_APT_RATIO`, and never worse than
 * `training`. Centre-back stays out (a CB at full-back is a real misfit, see #20).
 */
const NEIGHBOUR_GROUPS: readonly (readonly DetailedRole[])[] = [
  ["CDM", "CM", "CAM"],
  ["CM", "LM", "RM"],
  ["LB", "LWB"],
  ["RB", "RWB"],
];

function neighbours(a: DetailedRole, b: DetailedRole): boolean {
  return NEIGHBOUR_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

function classify(
  stats: PlayerStatsRecord,
  line: MainRole,
  foot: string | undefined,
  nat: Natural,
  role: DetailedRole,
): Aptitude {
  if (role === nat.role) return "natural";
  if (line === "GK" || role === "GK") return "unsuitable";
  const ratio = nat.score > 0 ? weightedScore(stats, role) / nat.score : 0;
  let apt: Aptitude = ratio >= APT_RATIO ? "apt" : ratio >= TRAINING_RATIO ? "training" : "unsuitable";
  if (neighbours(nat.role, role)) {
    if (ratio >= NEIGHBOUR_APT_RATIO) apt = "apt";
    else if (apt === "unsuitable") apt = "training";
  }
  // Outside the player's own line: at most `training`.
  if (!LINE_ROLES[line].includes(role) && apt === "apt") apt = "training";
  return apt;
}

interface Profile {
  line: MainRole;
  foot: string | undefined;
  fixed: DetailedRole | undefined;
  natural: DetailedRole;
  scores: Record<DetailedRole, number>;
  aptitudes: Record<DetailedRole, Aptitude>;
}

/** Cheap fingerprint so an in-place edit of the stats record invalidates the memo. */
function statsSignature(stats: PlayerStatsRecord): number {
  let sig = 0;
  let i = 1;
  const rec = stats as unknown as Record<string, number>;
  for (const k in rec) sig += rec[k]! * i++;
  return sig;
}

/**
 * Pure memo: a profile is a function of (stats, line, foot, fixed natural).
 * - By stats object (fast path): the entry keeps the raw player fields it was resolved from, so a hit
 *   skips re-deriving line and fixed natural; the signature catches an in-place edit of the stats.
 * - By player id, verified on content (attribute names and values in record order — the order the
 *   weighted scores sum in — plus line, foot and fixed natural): squads are re-read from the save every
 *   day, so the stats object is new each day; this lets an unchanged player reuse yesterday's profile
 *   (the kit pre-simulation profiles every player of the world every day).
 */
interface ObjectHit { sig: number; pos0: string | undefined; natPos: string | undefined; foot: string | undefined; profile: Profile }
const PROFILES = new WeakMap<object, ObjectHit>();
interface ContentHit { keys: string[]; vals: number[]; profile: Profile }
const PROFILES_BY_ID = new Map<string, ContentHit>();
/** The id memo is dropped when it grows past this (well above the world's players and generated youngsters). */
const ID_MEMO_MAX = 200_000;

function sameContent(hit: ContentHit, rec: Record<string, number>): boolean {
  let i = 0;
  for (const k in rec) {
    if (i >= hit.keys.length || hit.keys[i] !== k || hit.vals[i] !== rec[k]) return false;
    i++;
  }
  return i === hit.keys.length;
}

function profileOf(player: RosterPlayer): Profile {
  const foot = player.preferredFoot;
  const pos0 = player.positions[0];
  const natPos = player.naturalPosition;
  const sig = statsSignature(player.stats);
  const hit = PROFILES.get(player.stats);
  // Line and fixed natural are functions of `positions[0]` and `naturalPosition`: equal raw fields = same profile.
  if (hit && hit.sig === sig && hit.pos0 === pos0 && hit.natPos === natPos && hit.foot === foot) return hit.profile;
  const line = lineOf(player);
  const fixed = fixedNaturalRole(player);
  const rec = player.stats as unknown as Record<string, number>;
  const byId = PROFILES_BY_ID.get(player.id);
  if (byId && byId.profile.line === line && byId.profile.foot === foot && byId.profile.fixed === fixed && sameContent(byId, rec)) {
    PROFILES.set(player.stats, { sig, pos0, natPos, foot, profile: byId.profile });
    return byId.profile;
  }
  const nat = naturalOf(player.stats, line, foot, fixed);
  const scores = {} as Record<DetailedRole, number>;
  const aptitudes = {} as Record<DetailedRole, Aptitude>;
  for (const r of DETAILED_ROLES) {
    scores[r] = weightedScore(player.stats, r);
    aptitudes[r] = classify(player.stats, line, foot, nat, r);
  }
  const profile: Profile = { line, foot, fixed, natural: nat.role, scores, aptitudes };
  PROFILES.set(player.stats, { sig, pos0, natPos, foot, profile });
  const keys: string[] = [];
  const vals: number[] = [];
  for (const k in rec) { keys.push(k); vals.push(rec[k]!); }
  if (PROFILES_BY_ID.size >= ID_MEMO_MAX) PROFILES_BY_ID.clear();
  PROFILES_BY_ID.set(player.id, { keys, vals, profile });
  return profile;
}

/** Aptitude of the player for each detailed role. Pure and deterministic. */
export function positionAptitudes(player: RosterPlayer): Record<DetailedRole, Aptitude> {
  return { ...profileOf(player).aptitudes };
}

/** The player's natural detailed role. */
export function preferredRole(player: RosterPlayer): DetailedRole {
  return profileOf(player).natural;
}

/** Aptitude for one role. Unknown role codes count as natural. */
export function aptitudeFor(player: RosterPlayer, role: string): Aptitude {
  if (!isDetailedRole(role)) return "natural";
  return profileOf(player).aptitudes[role];
}

/** Multiplier for a role given a plain aptitude record (what `GamePlayer.fit` stores). */
export function factorFromAptitudes(
  aptitudes: Partial<Record<string, Aptitude>> | undefined,
  role: string,
): number {
  return POSITION_PENALTY[aptitudes?.[role] ?? "natural"];
}

/**
 * The natural role in a plain aptitude record (what `GamePlayer.fit` stores) — the same role as
 * `preferredRole` of the roster player. `fallback` when the record is missing or has no natural.
 */
export function naturalFromAptitudes(
  aptitudes: Partial<Record<string, Aptitude>> | undefined,
  fallback: string,
): string {
  for (const [role, apt] of Object.entries(aptitudes ?? {})) if (apt === "natural") return role;
  return fallback;
}

/** Multiplier on the player's attributes when fielded as `role`. */
export function positionFactor(player: RosterPlayer, role: string): number {
  return POSITION_PENALTY[aptitudeFor(player, role)];
}

/** Value of a player in a slot: the role's weighted score times the aptitude penalty. */
export function slotValue(player: RosterPlayer, role: string): number {
  if (!isDetailedRole(role)) return weightedScore(player.stats, role);
  const p = profileOf(player);
  return p.scores[role] * POSITION_PENALTY[p.aptitudes[role]];
}

/** Scales every attribute (a 0-10 record) by `factor`. */
export function scaleStats(stats: PlayerStatsRecord, factor: number): PlayerStatsRecord {
  if (factor === 1) return stats;
  const out: Record<string, number> = { ...(stats as unknown as Record<string, number>) };
  for (const k of Object.keys(out)) out[k] = out[k]! * factor;
  return out as unknown as PlayerStatsRecord;
}
