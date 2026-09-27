import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay, runBufferedDay } from "@/backend/advanceDay";
import { applyBroadcasting } from "@/backend/FinancialService";
import { applyRandomStartKit } from "@/backend/startKits";
import { gateRevenue } from "@/Domain/finance/gate";

/**
 * Integration coverage for the "every money move goes through the ledger" plan (Task 4). See
 * design spec §2 and `.claude/rules/game/finances.md`.
 */
describe("finance ledger — new save", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("createSave + applyBroadcasting: ledger has one broadcasting entry, budget == sum(ledger)", async () => {
    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 0,
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    const squad = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    expect(squad?.finances?.budget).toBeGreaterThan(0);

    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveId, leagueMeta!.year);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.kind).toBe("broadcasting");
    expect(ledger[0]!.amount).toBe(squad!.finances!.budget);

    const sum = ledger.reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(squad!.finances!.budget);
  });
});

describe("finance ledger — weekly tick", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("advancing to a Monday posts 3 weekly entries (commercial, wages, operational); budget == sum(ledger)", async () => {
    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 0,
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    // Advance day by day (via the same buffered pipeline the live route uses) until currentDate
    // lands on a Monday, then run that day too.
    for (let i = 0; i < 14; i++) {
      const cur = await saveService.getMeta(saveId);
      const dow = new Date(cur!.currentDate + "T12:00:00").getDay();
      if (dow === 1) break;
      const outcome = await runBufferedDay(saveId);
      expect(outcome.ok).toBe(true);
    }
    const beforeMonday = await saveService.getMeta(saveId);
    const mondayDate = beforeMonday!.currentDate;
    expect(new Date(mondayDate + "T12:00:00").getDay()).toBe(1);

    const outcome = await runBufferedDay(saveId);
    expect(outcome.ok).toBe(true);

    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveId, leagueMeta!.year);
    const mondayWeeklyKinds = ledger
      .filter((e) => e.date === mondayDate && (e.kind === "commercial" || e.kind === "wages" || e.kind === "operational"))
      .map((e) => e.kind);
    expect(mondayWeeklyKinds.sort()).toEqual(["commercial", "operational", "wages"]);

    const squad = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    const sum = ledger.reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(squad!.finances!.budget);
  }, 300_000);
});

describe("finance ledger — continental home gate", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("a home continental group fixture posts a gate entry at 2x the league ticket price", async () => {
    // Find a Premier League club that both qualifies for UCL/UEL AND has a HOME fixture in the
    // group stage (any of the 6 rounds), like advanceUntil.continental.test.ts's probe pattern.
    const probeMeta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Probe", clubColors: ["#000000", "#ffffff"], budget: 0,
    });
    let homeClub = "";
    let contSlug: "ucl" | "uel" = "ucl";
    let matchDate = "";
    try {
      const index = await saveService.getSquadIndex(probeMeta.id);
      const plClubs = new Set(index.inLeague("premier_league").map((t) => t.squadId));
      for (const slug of ["ucl", "uel"] as const) {
        const lm = await saveService.getLeagueMeta(probeMeta.id, slug);
        const group = lm!.continental!.stages.find((s) => s.name === "group")!;
        const candidates = lm!.continental!.groups.flatMap((g) => g.clubs);
        const qualified = candidates.filter((id) => plClubs.has(id));
        for (const club of qualified) {
          for (let i = 0; i < group.rounds.length && !homeClub; i++) {
            const round = await saveService.getRound(probeMeta.id, slug, group.rounds[i]!);
            const fx = round?.fixtures.find((f) => f.home === club);
            if (fx) {
              homeClub = club;
              contSlug = slug;
              matchDate = group.dates[i]!;
              break;
            }
          }
          if (homeClub) break;
        }
        if (homeClub) break;
      }
      expect(homeClub).toBeTruthy();
    } finally {
      await saveService.deleteSave(probeMeta.id);
    }

    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: homeClub, clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 0,
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    await saveService.updateMeta(saveId, { currentDate: matchDate });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);

    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveId, leagueMeta!.year);
    const gateEntry = ledger.find((e) => e.date === matchDate && e.kind === "gate" && e.ref?.competition === contSlug);
    expect(gateEntry).toBeTruthy();

    const squad = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    const capacity = squad!.venue!.capacity;
    expect(gateEntry!.amount).toBe(gateRevenue(capacity, "continental"));
    // Rounding happens once, on the doubled price — not "round league gate, then double" (that
    // can differ by a euro from rounding twice). Same shape, off by at most a rounding unit.
    expect(Math.abs(gateEntry!.amount - gateRevenue(capacity, "league") * 2)).toBeLessThanOrEqual(1);
  }, 300_000);
});

describe("finance ledger — start kit reconciliation", () => {
  let saveIdNoKit = "";
  let saveIdKit = "";
  afterAll(async () => {
    if (saveIdNoKit) await saveService.deleteSave(saveIdNoKit);
    if (saveIdKit) await saveService.deleteSave(saveIdKit);
  });

  test("no-kit path (European career, no catch-up needed): sum(ledger) == budget after /presimulate", async () => {
    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 0,
    });
    saveIdNoKit = meta.id;
    meta = await applyBroadcasting(saveIdNoKit, meta, meta.leagueSlug, meta.clubId);

    const result = await applyRandomStartKit(saveIdNoKit);
    expect(result.applied).toBe(false);

    const squad = await saveService.getSquad(saveIdNoKit, meta.leagueSlug, meta.clubId);
    const leagueMeta = await saveService.getLeagueMeta(saveIdNoKit, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveIdNoKit, leagueMeta!.year);
    const sum = ledger.reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(squad!.finances!.budget);
  }, 300_000); // createSave now also computes every squad's wage factor (#12 curve + club factor) — see SaveService.createSave

  test("kit path (Brazilian career, catch-up needed): the kit's own finances are overwritten, but the player's budget stays sum(ledger)", async () => {
    let meta = await saveService.createSave({
      leagueSlug: "brazil_serie_a", leagueName: "Brasileirão",
      clubId: "118", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 0,
    });
    saveIdKit = meta.id;
    meta = await applyBroadcasting(saveIdKit, meta, meta.leagueSlug, meta.clubId);

    const preKitSquad = await saveService.getSquad(saveIdKit, meta.leagueSlug, meta.clubId);
    const preKitBudget = preKitSquad!.finances!.budget;

    const result = await applyRandomStartKit(saveIdKit);
    expect(result.applied).toBe(true);

    // The club may have moved leagues inside the kit world (a genuinely simulated season) — look
    // it up by id, not by the original leagueSlug.
    const index = await saveService.getSquadIndex(saveIdKit);
    const entry = index.byId(meta.clubId);
    expect(entry).toBeTruthy();
    const postKitSquad = await saveService.getSquad(saveIdKit, entry!.leagueSlug, entry!.stem);

    expect(postKitSquad?.finances?.budget).toBe(preKitBudget);

    const leagueMeta = await saveService.getLeagueMeta(saveIdKit, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveIdKit, leagueMeta!.year);
    const sum = ledger.reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(postKitSquad!.finances!.budget);
  }, 300_000);
});
