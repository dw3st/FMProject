/**
 * Face pilot: players in labelling priority order.
 * 1. world top 300 by overall (any league); 2. auto XI (4-3-3) of every club of the pilot leagues;
 * 3. the other players of the 40 strongest pilot clubs (average XI overall).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Player } from "@/Domain/Player";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { LEAGUES } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export interface PriorityPlayer {
  id: string; name: string; fullName?: string; age: number; nationality?: string;
  league: string; clubId: string; clubName: string;
}

export function priorityPlayers(): PriorityPlayer[] {
  const all: { p: PriorityPlayer; ovr: number }[] = [];
  const byId = new Map<string, PriorityPlayer>();
  const clubs: { players: PriorityPlayer[]; xi: string[]; level: number }[] = [];
  const squadsDir = join(ROOT, "src/example_data/squads");
  for (const league of readdirSync(squadsDir)) for (const f of readdirSync(join(squadsDir, league))) {
    const sq = JSON.parse(readFileSync(join(squadsDir, league, f), "utf8"));
    const ps: PriorityPlayer[] = [];
    const ovr = new Map<string, number>();
    for (const r of sq.players) {
      const p: PriorityPlayer = { id: r.id, name: r.name, fullName: r.fullName, age: r.age, nationality: r.nationality, league, clubId: String(sq.id), clubName: sq.name };
      ovr.set(r.id, Player.computeOverallAvg(r));
      all.push({ p, ovr: ovr.get(r.id)! });
      byId.set(r.id, p);
      ps.push(p);
    }
    if (LEAGUES.includes(league)) {
      const xi = autoLineupDefaultFormation(sq).filter(Boolean);
      const level = xi.reduce((s, id) => s + (ovr.get(id) ?? 0), 0) / Math.max(1, xi.length);
      clubs.push({ players: ps, xi, level });
    }
  }
  const order: PriorityPlayer[] = [];
  const seen = new Set<string>();
  const push = (id: string) => { const p = byId.get(id); if (p && !seen.has(id)) { seen.add(id); order.push(p); } };
  all.sort((a, b) => b.ovr - a.ovr).slice(0, 300).forEach((x) => push(x.p.id));
  for (const c of clubs) c.xi.forEach(push);
  for (const c of [...clubs].sort((a, b) => b.level - a.level).slice(0, 40)) c.players.forEach((p) => push(p.id));
  return order;
}

/** First column of a label/skip file (comments and blank lines ignored). */
export function idsInFile(file: string): string[] {
  try {
    return readFileSync(file, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.split(/\s+/)[0]!);
  } catch {
    return [];
  }
}
