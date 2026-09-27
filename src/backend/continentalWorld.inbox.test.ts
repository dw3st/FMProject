import { describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import type { ContinentalInboxMessage } from "@/types/inboxTypes";

describe("createSave emits continental qualification news", () => {
  test("a qualifying Premier League club gets a qualified + group inbox message", async () => {
    // Qualification is rank/level-based, not fixed per club — probe with a throwaway save first
    // to find a real Premier League continental qualifier, then create the actual test save owned
    // by that club (qualification is deterministic from static world data, so the same club
    // qualifies again in the second, real save). Mirrors advanceUntil.continental.test.ts.
    const probeMeta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Probe", clubColors: ["#000000", "#ffffff"], budget: 1,
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
      budget: 1,
    });
    const saveId = meta.id;
    try {
      const contSlug = await playerContinentalSlug(saveService, saveId, qualifiedClub);
      expect(contSlug).not.toBeNull();

      const inbox = await saveService.getInbox(saveId);
      const continentalMsgs = inbox.filter(
        (m): m is ContinentalInboxMessage => m.category === "continental" && m.competition === contSlug,
      );

      const qualified = continentalMsgs.find((m) => m.kind === "qualified");
      expect(qualified).toBeTruthy();
      expect(qualified!.stage).toBe("group");

      const group = continentalMsgs.find((m) => m.kind === "group");
      expect(group).toBeTruthy();
      expect(typeof group!.group).toBe("string");
      expect(group!.opponentNames?.length).toBe(3);
    } finally {
      await saveService.deleteSave(saveId);
    }
  }, 120_000);
});
