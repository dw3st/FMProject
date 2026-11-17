import { describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { emitContinentalSeasonStartNews } from "@/backend/advanceDay";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { applyRandomStartKit } from "@/backend/startKits";
import { continentalClubIds } from "@/Domain/continental/competitions";
import type { ContinentalInboxMessage } from "@/types/inboxTypes";

// `emitContinentalSeasonStartNews` is called from the `/api/saves/:id/presimulate` route, AFTER
// the start-kit decision (`applyRandomStartKit`) — never from `createSave` itself. A start kit
// overwrites createSave's freshly generated ucl/uel/lib/sud metas with a different, pre-simulated
// season (see .claude/rules/game/continental.md); reading the group straight out of createSave's
// own result would describe a group that no longer exists on disk by the time the wizard finishes.

describe("emitContinentalSeasonStartNews", () => {
  test("no start kit needed (career at world genesis): qualified + the league-phase draw, from what's on disk", async () => {
    // Qualification is rank/level-based, not fixed per club — probe with a throwaway save first
    // to find a real Premier League continental qualifier, then create the actual test save owned
    // by that club (deterministic from static world data — the same club qualifies again).
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
      const uclClubs = continentalClubIds(ucl!.continental!);
      const uelClubs = continentalClubIds(uel!.continental!);
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
    const saveId = meta.id;
    try {
      const kitResult = await applyRandomStartKit(saveId);
      expect(kitResult.applied).toBe(false);

      const contSlug = await playerContinentalSlug(saveService, saveId, qualifiedClub);
      expect(contSlug).not.toBeNull();

      await emitContinentalSeasonStartNews(saveId, meta.seatId, qualifiedClub, meta.currentDate!);

      const inbox = await saveService.getInbox(saveId, meta.seatId);
      const continentalMsgs = inbox.filter(
        (m): m is ContinentalInboxMessage => m.category === "continental" && m.competition === contSlug,
      );

      const qualified = continentalMsgs.find((m) => m.kind === "qualified");
      expect(qualified).toBeTruthy();
      expect(qualified!.stage).toBe("league");

      // League format (UCL/UEL since 12.13): kind "group" with stage "league", no group letter, the 8 opponents.
      const group = continentalMsgs.find((m) => m.kind === "group");
      expect(group).toBeTruthy();
      expect(group!.stage).toBe("league");
      expect(group!.group).toBeUndefined();
      expect(group!.opponentNames?.length).toBe(8);

      // No stale draw/eliminated news before the group stage is even decided.
      expect(continentalMsgs.find((m) => m.kind === "draw" || m.kind === "eliminated")).toBeUndefined();
    } finally {
      await saveService.deleteSave(saveId);
    }
  }, 120_000);

  test("a start kit whose r16 is already drawn sends qualified + draw/eliminated, never a stale group", async () => {
    // A Brazilian career always needs a start kit — its season starts after the European leagues'
    // genesis date (.claude/rules/data/openfootball-import.md "Regra de calendário"). By the kit's
    // cutoff date the EUROPEAN continental group stage has always finished with r16 already drawn
    // (South America's own Libertadores/Sudamericana season for that career hasn't even started
    // yet — see .claude/rules/game/continental.md), so this checks a Premier League club's status
    // (found in the post-kit ucl/uel world) rather than the save's own Brazilian club.
    // `emitContinentalSeasonStartNews` takes an explicit clubId and doesn't touch save meta, so
    // this is a faithful test of the function even though it isn't "the save's own club".
    const meta = await saveService.createSave({
      leagueSlug: "brazil_serie_a",
      leagueName: "Brasileirão",
      clubId: "1000",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    const saveId = meta.id;
    try {
      const kitResult = await applyRandomStartKit(saveId);
      expect(kitResult.applied).toBe(true);

      const index = await saveService.getSquadIndex(saveId);
      const plClubs = new Set(index.inLeague("premier_league").map((t) => t.squadId));
      const ucl = await saveService.getLeagueMeta(saveId, "ucl");
      const uel = await saveService.getLeagueMeta(saveId, "uel");
      const uclClubs = continentalClubIds(ucl!.continental!);
      const uelClubs = continentalClubIds(uel!.continental!);
      const qualifiedClub = [...uclClubs, ...uelClubs].find((id) => plClubs.has(id))!;
      expect(qualifiedClub).toBeTruthy();

      const contSlug = await playerContinentalSlug(saveService, saveId, qualifiedClub);
      expect(contSlug).not.toBeNull();
      const contMeta = await saveService.getLeagueMeta(saveId, contSlug!);
      const league = contMeta!.continental!.format === "league";
      expect(contMeta!.continental!.stages.find((s) => s.name === (league ? "playoff" : "r16"))!.drawn).toBe(true);

      await emitContinentalSeasonStartNews(saveId, meta.seatId, qualifiedClub, meta.currentDate!);

      const inbox = await saveService.getInbox(saveId, meta.seatId);
      const continentalMsgs = inbox.filter(
        (m): m is ContinentalInboxMessage => m.category === "continental" && m.competition === contSlug,
      );

      const qualified = continentalMsgs.find((m) => m.kind === "qualified");
      expect(qualified).toBeTruthy();

      // Never a stale "group" message once the kit's r16 is already drawn.
      expect(continentalMsgs.find((m) => m.kind === "group")).toBeUndefined();

      const drawOrEliminated = continentalMsgs.find((m) => m.kind === "draw" || m.kind === "eliminated" || m.kind === "top8");
      expect(drawOrEliminated).toBeTruthy();
      if (league) {
        // Kits generated in 12.13 or later: the play-off is drawn by the cutoff.
        if (drawOrEliminated!.kind === "draw") expect(drawOrEliminated!.stage).toBe("playoff");
        else expect(drawOrEliminated!.position).toBeGreaterThan(0);
      } else if (drawOrEliminated!.kind === "draw") {
        expect(drawOrEliminated!.stage).toBe("r16");
        expect(drawOrEliminated!.opponentName).toBeTruthy();
        expect(drawOrEliminated!.firstLegDate).toBeTruthy();
        expect(drawOrEliminated!.venue).toBeTruthy();
        expect(["home", "away", "neutral"]).toContain(drawOrEliminated!.venue!);
      } else {
        expect(drawOrEliminated!.stage).toBe("group");
        expect(drawOrEliminated!.opponentName).toBeUndefined();
      }
    } finally {
      await saveService.deleteSave(saveId);
    }
  }, 120_000);
});
