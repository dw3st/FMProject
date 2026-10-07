import type { DetailedRole, RosterPlayer } from "@/types/playerTypes";
import { DETAILED_ROLES, aptitudeFor, preferredRole, slotValue } from "@/Domain/positions/positionAptitude";
import { isInjured } from "@/Domain/injury/injury";
import { isSuspended } from "@/Domain/discipline/discipline";
import { daysBetween } from "@/Domain/dates";

/**
 * Squad depth per detailed position (#86, aba "Profundidade" do Elenco).
 *
 * Who fills each of the 14 positions: the players NATURAL there (`preferredRole`) and the ones who
 * ADAPT (aptitude `apt`), each sorted by their value in that position (`slotValue`, 0–10).
 *
 * The verdict (enough / at the limit / short) is per GROUP of positions that do the same job, so a
 * 4-3-3 left-back is not "short" just because the squad's left-backs are listed as wing-backs:
 *
 * | Group          | Positions       |
 * |----------------|-----------------|
 * | Goalkeepers    | GK              |
 * | Centre-backs   | CB              |
 * | Left flank (D) | LB, LWB         |
 * | Right flank (D)| RB, RWB         |
 * | Central mid    | CDM, CM, CAM    |
 * | Left wide      | LM, LW          |
 * | Right wide     | RM, RW          |
 * | Strikers       | ST              |
 *
 * Supply of a group: each player counts once — 1 if natural in a position of the group, otherwise
 * `ADAPTED_WEIGHT` (0.5) if he adapts to one; players injured for more than `LONG_INJURY_DAYS` count 0
 * (short injuries and bans still count: they are back soon).
 *
 * Target of a group = slots the club's formation uses there + one backup per slot, at most two
 * backups (`slots + min(slots, 2)`): GK 2, CB 4 with two centre-backs (5 with three), full-back 2,
 * central midfield 5 with three, winger 2, ST 2 with one striker (4 with two).
 *   - `ok` (green): supply ≥ target — every starter has cover.
 *   - `thin` (yellow): supply ≥ slots — the starters are there, the cover is not.
 *   - `short` (red): supply < slots — the formation cannot even be filled.
 *   - `unused`: the formation uses no position of the group (neutral).
 */

export type DepthGroup = "gk" | "cb" | "leftBack" | "rightBack" | "centralMid" | "leftWide" | "rightWide" | "st";
export type DepthStatus = "ok" | "thin" | "short" | "unused";

export const DEPTH_GROUP_OF: Record<DetailedRole, DepthGroup> = {
  GK: "gk",
  CB: "cb",
  LB: "leftBack", LWB: "leftBack",
  RB: "rightBack", RWB: "rightBack",
  CDM: "centralMid", CM: "centralMid", CAM: "centralMid",
  LM: "leftWide", LW: "leftWide",
  RM: "rightWide", RW: "rightWide",
  ST: "st",
};

export const DEPTH = {
  /** An adapted player counts this much toward a group's supply. */
  ADAPTED_WEIGHT: 0.5,
  /** Injured with more days than this left: does not count. */
  LONG_INJURY_DAYS: 28,
  /** Backups wanted per slot, capped. */
  MAX_BACKUPS: 2,
} as const;

export type Unavailable = "injured" | "suspended";

export interface DepthPlayer {
  id: string;
  name: string;
  age: number;
  /** Value in this position, 0–10 (`slotValue`: weighted score × aptitude penalty). */
  value: number;
  natural: boolean;
  unavailable?: Unavailable;
  /** Days until back (injury only). */
  daysOut?: number;
  /** Injured beyond `LONG_INJURY_DAYS`: left out of the supply. */
  longInjury: boolean;
}

export interface DepthCell {
  role: DetailedRole;
  group: DepthGroup;
  /** Naturals first, then adapted; each sorted by value (desc). */
  players: DepthPlayer[];
  naturals: number;
  adapted: number;
  /** Status of the cell's group. */
  status: DepthStatus;
  /** The club's formation fields this position. */
  inFormation: boolean;
  /** Not in the formation and nobody natural or adapted: the screen leaves it out. */
  hidden: boolean;
}

export interface GroupDepth {
  group: DepthGroup;
  slots: number;
  target: number;
  supply: number;
  status: DepthStatus;
}

export interface SquadDepth {
  cells: Record<DetailedRole, DepthCell>;
  groups: Record<DepthGroup, GroupDepth>;
}

const GROUPS: readonly DepthGroup[] = ["gk", "cb", "leftBack", "rightBack", "centralMid", "leftWide", "rightWide", "st"];

function isDetailed(role: string): role is DetailedRole {
  return (DETAILED_ROLES as readonly string[]).includes(role);
}

/** Target for a group given how many slots the formation uses there. */
export function depthTarget(slots: number): number {
  return slots + Math.min(slots, DEPTH.MAX_BACKUPS);
}

/** Verdict from supply, slots and target. */
export function depthStatus(supply: number, slots: number): DepthStatus {
  if (slots === 0) return "unused";
  if (supply >= depthTarget(slots)) return "ok";
  if (supply >= slots) return "thin";
  return "short";
}

function availability(player: RosterPlayer, date: string): Pick<DepthPlayer, "unavailable" | "daysOut" | "longInjury"> {
  if (isInjured(player, date)) {
    const daysOut = Math.max(0, daysBetween(date, player.injury!.returnDate));
    return { unavailable: "injured", daysOut, longInjury: daysOut > DEPTH.LONG_INJURY_DAYS };
  }
  if (isSuspended(player)) return { unavailable: "suspended", longInjury: false };
  return { longInjury: false };
}

/**
 * Depth of a squad for a formation (`formationRoles`: the detailed role of each slot). Pure.
 * `players` is the senior squad (borrowed players included; the club's players out on loan are not
 * in it).
 */
export function squadDepth(players: readonly RosterPlayer[], date: string, formationRoles: readonly string[]): SquadDepth {
  const slotsByGroup = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<DepthGroup, number>;
  const formationSet = new Set<DetailedRole>();
  for (const r of formationRoles) {
    if (!isDetailed(r)) continue;
    formationSet.add(r);
    slotsByGroup[DEPTH_GROUP_OF[r]]++;
  }

  const lists = Object.fromEntries(DETAILED_ROLES.map((r) => [r, [] as DepthPlayer[]])) as Record<DetailedRole, DepthPlayer[]>;
  const supply = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<DepthGroup, number>;

  for (const p of players) {
    const natural = preferredRole(p);
    const avail = availability(p, date);
    const weightIn = new Map<DepthGroup, number>();
    for (const role of DETAILED_ROLES) {
      const isNatural = role === natural;
      if (!isNatural && aptitudeFor(p, role) !== "apt") continue;
      lists[role].push({ id: p.id, name: p.name, age: p.age, value: slotValue(p, role), natural: isNatural, ...avail });
      const g = DEPTH_GROUP_OF[role];
      const w = isNatural ? 1 : DEPTH.ADAPTED_WEIGHT;
      weightIn.set(g, Math.max(weightIn.get(g) ?? 0, w));
    }
    if (avail.longInjury) continue;
    for (const [g, w] of weightIn) supply[g] += w;
  }

  const groups = Object.fromEntries(GROUPS.map((g) => {
    const slots = slotsByGroup[g];
    return [g, { group: g, slots, target: depthTarget(slots), supply: supply[g], status: depthStatus(supply[g], slots) }];
  })) as Record<DepthGroup, GroupDepth>;

  const cells = Object.fromEntries(DETAILED_ROLES.map((role) => {
    const list = lists[role].sort((a, b) => (a.natural === b.natural ? b.value - a.value : a.natural ? -1 : 1));
    const naturals = list.filter((x) => x.natural).length;
    const inFormation = formationSet.has(role);
    const cell: DepthCell = {
      role,
      group: DEPTH_GROUP_OF[role],
      players: list,
      naturals,
      adapted: list.length - naturals,
      status: groups[DEPTH_GROUP_OF[role]].status,
      inFormation,
      hidden: !inFormation && list.length === 0,
    };
    return [role, cell];
  })) as Record<DetailedRole, DepthCell>;

  return { cells, groups };
}
