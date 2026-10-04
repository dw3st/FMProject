import type { RosterPlayer } from "@/types/playerTypes";
import { overallAvg } from "@/Domain/playerRating";
import { getMainRole } from "@/Domain/roles";
import { aptitudeFor, DETAILED_ROLES, preferredRole, slotValue } from "@/Domain/positions/positionAptitude";

/**
 * Lineup that ignores position fit: inside each line (GK/DEF/MID/FWD) the best players by overall
 * fill that line's slots in slot order. Used by `/lab` (`Variant.outOfPosition`) to measure what the
 * fit-aware selectors are worth.
 */
export function lineOrderLineup(slotRoles: string[], players: RosterPlayer[]): string[] {
  const byLine = new Map<string, RosterPlayer[]>();
  for (const p of players) {
    const line = getMainRole(p.positions[0] ?? "CM");
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line)!.push(p);
  }
  for (const list of byLine.values()) list.sort((a, b) => overallAvg(b) - overallAvg(a) || a.id.localeCompare(b.id));
  const next = new Map<string, number>();
  const used = new Set<string>();
  return slotRoles.map((role) => {
    const line = getMainRole(role);
    const list = byLine.get(line) ?? [];
    let i = next.get(line) ?? 0;
    while (i < list.length && used.has(list[i]!.id)) i++;
    const pick = list[i];
    next.set(line, i + 1);
    if (!pick) return "";
    used.add(pick.id);
    return pick.id;
  });
}

/** Starters whose aptitude for their slot is `training` or `unsuitable`. */
export function poorFitStarters(players: RosterPlayer[], lineup: string[], slotRoles: string[]): number {
  const byId = new Map(players.map((p) => [p.id, p]));
  let n = 0;
  lineup.forEach((id, i) => {
    const p = byId.get(id);
    if (!p) return;
    const apt = aptitudeFor(p, slotRoles[i] ?? "");
    if (apt === "training" || apt === "unsuitable") n++;
  });
  return n;
}

/**
 * Starters who are `unsuitable` for their slot although an unused teammate of the slot's line
 * (not unsuitable there, not injured on `date`) was available. The season smoke asserts this is 0
 * for every AI lineup.
 */
export function unsuitableWithAlternative(
  players: RosterPlayer[],
  lineup: string[],
  slotRoles: string[],
  date?: string,
): number {
  const byId = new Map(players.map((p) => [p.id, p]));
  const used = new Set(lineup.filter(Boolean));
  let n = 0;
  lineup.forEach((id, i) => {
    const p = byId.get(id);
    const role = slotRoles[i];
    if (!p || !role || aptitudeFor(p, role) !== "unsuitable") return;
    const line = getMainRole(role);
    const alt = players.some(
      (q) =>
        !used.has(q.id) &&
        getMainRole(q.positions[0] ?? "CM") === line &&
        aptitudeFor(q, role) !== "unsuitable" &&
        !(date && q.injury && date < q.injury.returnDate),
    );
    if (alt) n++;
  });
  return n;
}

/**
 * Bench/reserves order for the Formation screen (#47): GK, DEF, MID, FWD (the line of the natural
 * position), then the detailed role order inside the line (CB, LB, RB, LWB, RWB / CDM, CM, CAM, LM,
 * RM / LW, RW, ST), then the value at that natural position, highest first. Pure; returns a copy.
 */
export function sortBenchByPosition(players: RosterPlayer[]): RosterPlayer[] {
  const keyed = players.map((p) => {
    const role = preferredRole(p);
    return { p, order: DETAILED_ROLES.indexOf(role), value: slotValue(p, role) };
  });
  keyed.sort((a, b) => a.order - b.order || b.value - a.value || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0));
  return keyed.map((k) => k.p);
}
