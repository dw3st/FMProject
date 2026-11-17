import { describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { continentalClubStatus } from "@/backend/continentalWorld";
import { applyRandomStartKit } from "@/backend/startKits";
import { inContinental } from "@/Domain/continental/competitions";

describe("continentalClubStatus", () => {
  test("no start kit needed (career starts at world genesis): league phase, the 8 opponents", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Probe", clubColors: ["#000000", "#ffffff"],
    });
    try {
      const kitResult = await applyRandomStartKit(meta.id);
      expect(kitResult.applied).toBe(false);

      const index = await saveService.getSquadIndex(meta.id);
      const plClubs = index.inLeague("premier_league").map((t) => t.squadId);
      const ucl = await saveService.getLeagueMeta(meta.id, "ucl");
      const uel = await saveService.getLeagueMeta(meta.id, "uel");
      const continentalClub = plClubs.find(
        (id) => inContinental(ucl!.continental!, id) || inContinental(uel!.continental!, id),
      );
      expect(continentalClub).toBeTruthy();

      const status = await continentalClubStatus(saveService, meta.id, continentalClub!);
      expect(status).not.toBeNull();
      expect(status!.status.kind).toBe("league");
      if (status!.status.kind === "league") {
        expect(status!.status.opponentIds.length).toBe(8);
        expect(new Set(status!.status.opponentIds).size).toBe(8);
      }
    } finally {
      await saveService.deleteSave(meta.id);
    }
  }, 30_000);

  // Kits generated before 12.13 carry the group format (r16 drawn by the cutoff), newer ones the league format (play-off
  // drawn by the cutoff): either way the status reads what is on disk, never a stale draw.
  test("a start kit reports where the club really stands, never a stale group or league-phase draw", async () => {
    // A Brazilian career always needs a start kit (its season begins after the European leagues'
    // genesis date) — see .claude/rules/data/openfootball-import.md "Regra de calendário".
    const meta = await saveService.createSave({
      leagueSlug: "brazil_serie_a", leagueName: "Brasileirão",
      clubId: "1000", clubName: "Probe", clubColors: ["#000000", "#ffffff"],
    });
    try {
      const kitResult = await applyRandomStartKit(meta.id);
      expect(kitResult.applied).toBe(true);

      const index = await saveService.getSquadIndex(meta.id);
      const plClubs = index.inLeague("premier_league").map((t) => t.squadId);
      const ucl = await saveService.getLeagueMeta(meta.id, "ucl");
      const uel = await saveService.getLeagueMeta(meta.id, "uel");
      const league = ucl!.continental!.format === "league";
      expect(ucl!.continental!.stages.find((s) => s.name === (league ? "playoff" : "r16"))!.drawn).toBe(true);

      const continentalClubs = plClubs.filter(
        (id) => inContinental(ucl!.continental!, id) || inContinental(uel!.continental!, id),
      );
      expect(continentalClubs.length).toBeGreaterThan(0);

      const kinds = new Set<string>();
      for (const clubId of continentalClubs) {
        const status = await continentalClubStatus(saveService, meta.id, clubId);
        expect(status).not.toBeNull();
        // Never a stale "group" / "league" once the next stage is drawn.
        expect(status!.status.kind).not.toBe("group");
        expect(status!.status.kind).not.toBe("league");
        kinds.add(status!.status.kind);
        if (status!.status.kind === "drawn") {
          if (!league) expect(status!.status.stage).toBe("r16");
          expect(status!.status.opponentId).toBeTruthy();
          expect(status!.status.firstLegDate).toBeTruthy();
          expect(["home", "away", "neutral"]).toContain(status!.status.venue);
        }
      }
      // With 32+32 clubs across 2 competitions, expect a mix in practice (not asserted as a hard
      // requirement — just documents what the real world data produces).
      expect(kinds.size).toBeGreaterThan(0);
    } finally {
      await saveService.deleteSave(meta.id);
    }
  }, 30_000);
});
