import { describe, expect, test } from "bun:test";
import { buildQuickMatchEvent } from "@/Domain/advanceDay/matches";
import { mulberry32 } from "@/Domain/rng";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"];

function makeSquad(id: string): Squad {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `${id}-p${i}`, name: `${id}${i}`, age: 25, squadId: id, preferredFoot: "right",
    positions: [role],
    stats: {
      passing: 4, vision: 4, finishing: 4, dribbling: 4, speed: 4, acceleration: 4,
      tackling: 4, pressing: 4, stamina: 4, heading: 4, strength: 4, reflex: 4, jump: 4,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players };
}

describe("buildQuickMatchEvent", () => {
  test("gera evento compacto e atualiza seasonLog dos escalados", () => {
    const home = makeSquad("h");
    const away = makeSquad("a");
    const fixture = { id: "fx1", competition: "la_liga", round: 1, home: "h", away: "a" } as Fixture;
    const sim = { homeLineup: home.players.map((p) => p.id), awayLineup: away.players.map((p) => p.id) };

    const r = buildQuickMatchEvent(fixture, home, away, sim, mulberry32(11));

    expect(r.event.compact).toBe(true);
    expect(r.event.playerStats).toEqual({});
    expect(r.event.playerRatings).toEqual({});
    expect(r.event.developmentChanges).toEqual([]);
    expect(r.event.fixtureId).toBe("fx1");
    const scorerGoals = r.event.scorers.reduce((acc, s) => acc + s.goals, 0);
    expect(scorerGoals).toBe(r.event.score.home + r.event.score.away);
    for (const p of r.updatedHome.players) expect(p.seasonLog!.appearances).toBe(1);
  });
});
