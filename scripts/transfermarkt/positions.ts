import type { DetailedRole } from "@/types/playerTypes";

const MAP: Record<string, DetailedRole> = {
  "goalkeeper": "GK", "centre-back": "CB", "left-back": "LB", "right-back": "RB",
  "defensive midfield": "CDM", "central midfield": "CM", "attacking midfield": "CAM",
  "left midfield": "LM", "right midfield": "RM", "left winger": "LW", "right winger": "RW",
  "centre-forward": "ST", "second striker": "ST",
};

/** Transfermarkt main position → our detailed position; null for a generic or unknown label. */
export function tmPosition(pos: string | null): DetailedRole | null {
  return pos ? MAP[pos.trim().toLowerCase()] ?? null : null;
}
