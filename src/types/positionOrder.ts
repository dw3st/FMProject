/**
 * Canonical order for positions when displaying squads, lineups, and formation slots.
 * Order: GK → Defenders → Midfielders → Forwards (by line, then left to right where relevant).
 * Unknown positions sort last by alphabetical pos.
 */

const ORDER: string[] = [
  // Main roles (players whose stored position is the broad group)
  "GK",
  "Defender",
  "Midfielder",
  "Forward",
  // Detailed roles (used in formation/match contexts)
  "LB",
  "LWB",
  "CB",
  "RB",
  "RWB",
  "CDM",
  "DM",
  "CM",
  "CAM",
  "AM",
  "LM",
  "RM",
  "LW",
  "RW",
  "ST",
  "CF",
];

const INDEX_BY_POS = new Map<string, number>(ORDER.map((pos, i) => [pos, i]));

/** Sort index for a position code (lower = earlier). Unknown positions return a large number so they sort last. */
export function getPositionSortIndex(pos: string): number {
  const idx = INDEX_BY_POS.get(pos);
  return idx !== undefined ? idx : 999;
}

/** Compare two position codes for sorting (by line: GK, defenders, midfield, attack). */
export function comparePositions(a: string, b: string): number {
  return getPositionSortIndex(a) - getPositionSortIndex(b);
}
