import { getMainRole, type MainRole } from "@/Domain/roles";

/** Line order of a squad list: goalkeepers, defenders, midfielders, forwards. */
const LINE_ORDER: Record<MainRole, number> = { GK: 0, Defender: 1, Midfielder: 2, Forward: 3 };

/** Detailed order inside each line (left to right where it matters). */
const DETAILED_ORDER = [
  "GK",
  "CB", "LB", "RB", "LWB", "RWB",
  "CDM", "DM", "CM", "CAM", "AM", "LM", "RM",
  "LW", "RW", "ST", "CF",
] as const;
const DETAILED_INDEX = new Map<string, number>(DETAILED_ORDER.map((r, i) => [r, i]));

export interface PositionSortable {
  /** Stored position (`positions[0]`): a main role ("Defender") or a detailed code ("CB"). */
  pos: string;
  /** Detailed position the list shows (the player's natural role), when known. */
  natural?: string;
  name: string;
}

function lineOf(p: PositionSortable): number {
  const main = p.pos in LINE_ORDER || DETAILED_INDEX.has(p.pos) ? getMainRole(p.pos) : p.natural ? getMainRole(p.natural) : null;
  return main ? LINE_ORDER[main] : 99;
}

function detailOf(p: PositionSortable): number {
  const role = p.natural ?? p.pos;
  return DETAILED_INDEX.get(role) ?? 99;
}

/**
 * Squad-list position order (#71): line first (GK, DEF, MID, FWD), then the detailed position the
 * list shows (CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, ST), then name. `desc` reverses
 * the position order; names stay alphabetical inside a position.
 */
export function compareSquadPositions(a: PositionSortable, b: PositionSortable, dir: "asc" | "desc" = "asc"): number {
  const sign = dir === "asc" ? 1 : -1;
  const line = lineOf(a) - lineOf(b);
  if (line !== 0) return line * sign;
  const detail = detailOf(a) - detailOf(b);
  if (detail !== 0) return detail * sign;
  return a.name.localeCompare(b.name);
}
