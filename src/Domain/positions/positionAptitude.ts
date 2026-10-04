import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import { weightedScore } from "@/Domain/playerRating";
import { getMainRole, type MainRole } from "@/GameInterface/positionHelpers";
import { APT_RATIO, NEIGHBOUR_APT_RATIO, POSITION_PENALTY, TRAINING_RATIO, type Aptitude } from "@/Domain/positions/positionConfig";

export type { Aptitude } from "@/Domain/positions/positionConfig";

export const DETAILED_ROLES = [
  "GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
] as const;
export type DetailedRole = (typeof DETAILED_ROLES)[number];

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

function naturalOf(stats: PlayerStatsRecord, line: MainRole, foot: string | undefined): Natural {
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
  sig: number;
  line: MainRole;
  foot: string | undefined;
  natural: DetailedRole;
  scores: Record<DetailedRole, number>;
  aptitudes: Record<DetailedRole, Aptitude>;
}

/** Cheap fingerprint so an in-place edit of the stats record invalidates the memo. */
function statsSignature(stats: PlayerStatsRecord): number {
  let sig = 0;
  let i = 1;
  for (const v of Object.values(stats as unknown as Record<string, number>)) sig += v * i++;
  return sig;
}

// Pure memo: everything below is a function of (stats, line, foot); keyed by the stats object.
const PROFILES = new WeakMap<object, Profile>();

function profileOf(player: RosterPlayer): Profile {
  const line = lineOf(player);
  const foot = player.preferredFoot;
  const sig = statsSignature(player.stats);
  const hit = PROFILES.get(player.stats);
  if (hit && hit.sig === sig && hit.line === line && hit.foot === foot) return hit;
  const nat = naturalOf(player.stats, line, foot);
  const scores = {} as Record<DetailedRole, number>;
  const aptitudes = {} as Record<DetailedRole, Aptitude>;
  for (const r of DETAILED_ROLES) {
    scores[r] = weightedScore(player.stats, r);
    aptitudes[r] = classify(player.stats, line, foot, nat, r);
  }
  const profile: Profile = { sig, line, foot, natural: nat.role, scores, aptitudes };
  PROFILES.set(player.stats, profile);
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
