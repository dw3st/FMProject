import type { RosterPlayer } from "@/types/playerTypes";

import teamJson from "./players.json";

const team = teamJson as RosterPlayer[];

export function getTeam(): RosterPlayer[] {
  return team;
}

export function getPlayerById(id: string): RosterPlayer | undefined {
  return team.find((p) => p.id === id);
}
