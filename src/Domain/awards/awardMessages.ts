import type { AwardsInboxMessage } from "@/types/inboxTypes";
import type { LeagueSeasonAwards, WorldAwards } from "@/types/awardTypes";

/**
 * Inbox `awards` (`.claude/rules/game/awards.md`). Subject and preview are the English fallback;
 * the screen translates. Stable ids: a retried day never adds a second copy.
 */
export function buildAwardsMessage(
  m:
    | { kind: "league"; date: string; awards: LeagueSeasonAwards; leagueName: string; myClubId?: string }
    | { kind: "world"; date: string; world: WorldAwards },
): AwardsInboxMessage {
  const base = { date: m.date, createdAt: m.date, read: false, category: "awards" as const };
  if (m.kind === "league") {
    const a = m.awards;
    const best = a.bestPlayer ? `Player of the season: ${a.bestPlayer.name}` : "";
    return {
      ...base,
      id: `awards-league-${a.league}-${a.season}`,
      subject: `${m.leagueName} awards ${a.season}`,
      preview: best.slice(0, 120),
      kind: "league",
      awards: a,
      leagueName: m.leagueName,
      ...(m.myClubId ? { myClubId: m.myClubId } : {}),
    };
  }
  const w = m.world;
  const p = w.player[0];
  const mg = w.manager[0];
  return {
    ...base,
    id: `awards-world-${w.year}`,
    subject: `World awards ${w.year}`,
    preview: [p ? `Player: ${p.name}` : "", mg ? `Manager: ${mg.name}` : ""].filter(Boolean).join(" · ").slice(0, 120),
    kind: "world",
    world: w,
  };
}
