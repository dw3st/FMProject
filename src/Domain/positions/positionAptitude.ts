import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import { weightedScore } from "@/Domain/playerRating";
import { getMainRole, type MainRole } from "@/GameInterface/positionHelpers";
import { APT_RATIO, POSITION_PENALTY, TRAINING_RATIO, type Aptitude } from "@/Domain/positions/positionConfig";

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

export function isDetailedRole(role: string): role is DetailedRole {
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
  // Outside the player's own line: at most `training`.
  if (!LINE_ROLES[line].includes(role) && apt === "apt") apt = "training";
  return apt;
}

/** Aptitude of the player for each detailed role. Pure and deterministic. */
export function positionAptitudes(player: RosterPlayer): Record<DetailedRole, Aptitude> {
  const line = lineOf(player);
  const nat = naturalOf(player.stats, line, player.preferredFoot);
  const out = {} as Record<DetailedRole, Aptitude>;
  for (const r of DETAILED_ROLES) out[r] = classify(player.stats, line, player.preferredFoot, nat, r);
  return out;
}

/** The player's natural detailed role. */
export function preferredRole(player: RosterPlayer): DetailedRole {
  return naturalOf(player.stats, lineOf(player), player.preferredFoot).role;
}

/** Aptitude for one role (cheaper than the full map). Unknown role codes count as natural. */
export function aptitudeFor(player: RosterPlayer, role: string): Aptitude {
  if (!isDetailedRole(role)) return "natural";
  const line = lineOf(player);
  const nat = naturalOf(player.stats, line, player.preferredFoot);
  return classify(player.stats, line, player.preferredFoot, nat, role);
}

/** Multiplier on the player's attributes when fielded as `role`. */
export function positionFactor(player: RosterPlayer, role: string): number {
  return POSITION_PENALTY[aptitudeFor(player, role)];
}

/** Value of a player in a slot: the role's weighted score times the aptitude penalty. */
export function slotValue(player: RosterPlayer, role: string): number {
  return weightedScore(player.stats, role) * positionFactor(player, role);
}

/** Scales every attribute (a 0-10 record) by `factor`. */
export function scaleStats(stats: PlayerStatsRecord, factor: number): PlayerStatsRecord {
  if (factor === 1) return stats;
  const out: Record<string, number> = { ...(stats as unknown as Record<string, number>) };
  for (const k of Object.keys(out)) out[k] = out[k]! * factor;
  return out as unknown as PlayerStatsRecord;
}
