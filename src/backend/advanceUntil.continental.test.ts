import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { nextPlayerFixtureDate, readAdvancePosition } from "@/backend/advanceUntil";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { playerCupSlug } from "@/backend/cupWorld";

describe("readAdvancePosition includes the player's continental competition", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("the player's next continental fixture is reported as the next match date", async () => {
    // Qualification is rank/level-based, not fixed per club — probe with a throwaway save first
    // to find a real Premier League continental qualifier, then create the actual test save owned
    // by that club (qualification is deterministic from static world data, so the same club
    // qualifies again in the second, real save).
    const probeMeta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Probe", clubColors: ["#000000", "#ffffff"],
    });
    let qualifiedClub: string;
    try {
      const index = await saveService.getSquadIndex(probeMeta.id);
      const plClubs = new Set(index.inLeague("premier_league").map((t) => t.squadId));
      const ucl = await saveService.getLeagueMeta(probeMeta.id, "ucl");
      const uel = await saveService.getLeagueMeta(probeMeta.id, "uel");
      const uclClubs = ucl!.continental!.groups.flatMap((g) => g.clubs);
      const uelClubs = uel!.continental!.groups.flatMap((g) => g.clubs);
      qualifiedClub = [...uclClubs, ...uelClubs].find((id) => plClubs.has(id))!;
      expect(qualifiedClub).toBeTruthy();
    } finally {
      await saveService.deleteSave(probeMeta.id);
    }

    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: qualifiedClub,
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const contSlug = await playerContinentalSlug(saveService, saveId, qualifiedClub);
    expect(contSlug).not.toBeNull();

    const contMeta = await saveService.getLeagueMeta(saveId, contSlug!);
    const group = contMeta!.continental!.stages.find((s) => s.name === "group")!;
    const round1Date = group.dates[0]!;

    // Without the continental competition in the list, this date is invisible to
    // nextPlayerFixtureDate — continental dates are scheduled to never clash same-day with the
    // player's league or cup, so the league/cup-only lookup must land on a different date.
    const cup = await playerCupSlug(meta.leagueSlug);
    const withoutContinental = await nextPlayerFixtureDate(
      saveService, saveId, cup ? [meta.leagueSlug, cup] : [meta.leagueSlug], qualifiedClub, round1Date,
    );
    expect(withoutContinental).not.toBe(round1Date);

    await saveService.updateMeta(saveId, { currentDate: round1Date });
    const pos = await readAdvancePosition(saveId);
    expect(pos.matchDate).toBe(round1Date);
    expect(pos.target).toBe(round1Date);
  }, 300_000);
});
