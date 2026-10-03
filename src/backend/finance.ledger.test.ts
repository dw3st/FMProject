import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay, runBufferedDay } from "@/backend/advanceDay";
import { applyBroadcasting, executeTransferFee } from "@/backend/FinancialService";
import { applyRandomStartKit } from "@/backend/startKits";
import { gateRevenue } from "@/Domain/finance/gate";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";

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
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
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
  }, 60_000);
});

describe("finance ledger — weekly tick", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("advancing to a Monday posts 3 weekly entries (commercial, wages, operational); budget == sum(ledger)", async () => {
    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
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
      clubId: "33", clubName: "Probe", clubColors: ["#000000", "#ffffff"],
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
      clubId: homeClub, clubName: "Test", clubColors: ["#000000", "#ffffff"],
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
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
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
      clubId: "118", clubName: "Test", clubColors: ["#000000", "#ffffff"],
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
    // Style familiarity (human club only) is set by createSave and survives the kit, like the staff.
    expect(preKitSquad!.styleFamiliarity?.balanced).toBe(70);
    expect(postKitSquad?.styleFamiliarity).toEqual(preKitSquad!.styleFamiliarity);

    const leagueMeta = await saveService.getLeagueMeta(saveIdKit, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveIdKit, leagueMeta!.year);
    const sum = ledger.reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(postKitSquad!.finances!.budget);
  }, 300_000);
});

describe("finance ledger — client budget is never trusted (M1)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("POST /api/saves with a nonzero client budget still starts at broadcasting only", async () => {
    const { session } = devAutoLogin(`m1-client-budget-${Date.now()}@test.local`);
    const handler = apiRoutes["/api/saves"];
    const req = new Request("http://localhost/api/saves", {
      method: "POST",
      headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        leagueSlug: "premier_league", leagueName: "Premier League",
        clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
        budget: 999_999_999, // must be ignored — see .claude/rules/game/finances.md
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(201);
    const meta = (await res.json()) as { id: string; leagueSlug: string; clubId: string };
    saveId = meta.id;

    const squad = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    expect(squad?.finances?.budget).not.toBe(999_999_999);
    expect(squad?.finances?.budget).toBe(squad?.finances?.broadcasting);

    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
    const ledger = await saveService.getLedger(saveId, leagueMeta!.year);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.kind).toBe("broadcasting");
    const sum = ledger.reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(squad!.finances!.budget);
  }, 60_000);
});

describe("finance ledger — rollover broadcasting (L4)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("the new season's broadcasting credit lands in the year+1 ledger file; budget == sum across both seasons", async () => {
    // Iceland: a calendar-year league with no pyramid (season-rollover-smoke.ts and
    // continentalWorld.rollover.test.ts both use it to force a standalone rollover without
    // waiting out a real season or dragging in a whole country's pyramid).
    let meta = await saveService.createSave({
      leagueSlug: "of_icelandic_urvalsdeild", leagueName: "Úrvalsdeild",
      clubId: "of_is_breidablik", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    const stateBefore = meta.activeLeagues!.find((l) => l.leagueSlug === meta.leagueSlug)!;
    const oldYear = stateBefore.year;
    const broadcastingFee = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!.finances!.broadcasting;

    // Jump straight to the season's last day — the next advanceOneDay call rolls the (standalone,
    // pyramid-less) league over.
    await saveService.updateMeta(saveId, { currentDate: stateBefore.end });
    const outcome = await advanceOneDay(saveService, saveId);
    expect(outcome.ok).toBe(true);

    const metaAfter = await saveService.getMeta(saveId);
    const stateAfter = metaAfter!.activeLeagues!.find((l) => l.leagueSlug === meta.leagueSlug)!;
    expect(stateAfter.year).toBe(oldYear + 1);

    const oldLedger = await saveService.getLedger(saveId, oldYear);
    const newLedger = await saveService.getLedger(saveId, oldYear + 1);
    const newBroadcastingEntries = newLedger.filter((e) => e.kind === "broadcasting");
    expect(newBroadcastingEntries).toHaveLength(1);
    expect(newBroadcastingEntries[0]!.amount).toBe(broadcastingFee);
    // The OLD season's file only ever has the one broadcasting entry from createSave's
    // applyBroadcasting — the rollover credit lands in the NEW season's file, never duplicated here.
    expect(oldLedger.filter((e) => e.kind === "broadcasting")).toHaveLength(1);

    const squad = await saveService.getSquad(saveId, metaAfter!.leagueSlug, metaAfter!.clubId);
    const sum = [...oldLedger, ...newLedger].reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(squad!.finances!.budget);
  }, 60_000);
});

describe("finance ledger — negative balance fires once (L4)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("crossing to negative posts one inbox message; staying negative posts no more", async () => {
    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    // Force a guaranteed-negative weekly net: zero commercial income, but weekly wages are always
    // > 0 (the wage curve has a floor per player — src/Domain/finance/wageConfig.ts), so the very
    // first Monday tick must push the budget down. Small starting budget so it actually crosses.
    const squad = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    await saveService.saveSquad(saveId, meta.leagueSlug, meta.clubId, {
      ...squad!,
      finances: { ...squad!.finances!, budget: 1, commercial: 0 },
    });

    const negativeBalanceMsgs = async () => {
      const inbox = await saveService.getInbox(saveId);
      return inbox.filter((m) => m.category === "season" && m.kind === "negative_balance");
    };

    // Advance to the first Monday, then run it.
    for (let i = 0; i < 14; i++) {
      const cur = await saveService.getMeta(saveId);
      const dow = new Date(cur!.currentDate + "T12:00:00").getDay();
      if (dow === 1) break;
      expect((await runBufferedDay(saveId)).ok).toBe(true);
    }
    expect((await runBufferedDay(saveId)).ok).toBe(true);

    const squadAfterCrossing = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    expect(squadAfterCrossing!.finances!.budget).toBeLessThan(0);
    expect(await negativeBalanceMsgs()).toHaveLength(1);

    // Advance 7 more days to the next Monday: budget goes further negative, but it never crossed
    // back up to zero in between, so no second message.
    for (let i = 0; i < 7; i++) {
      expect((await runBufferedDay(saveId)).ok).toBe(true);
    }
    const squadAfterStayingNegative = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    expect(squadAfterStayingNegative!.finances!.budget).toBeLessThan(squadAfterCrossing!.finances!.budget);
    expect(await negativeBalanceMsgs()).toHaveLength(1);
  }, 300_000);
});

describe("finance ledger — transfer entries (L4)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("buying posts a negative transfer_out entry; selling posts a positive transfer_in entry, both in the current season's ledger", async () => {
    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    meta = await applyBroadcasting(saveId, meta, meta.leagueSlug, meta.clubId);

    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
    const season = leagueMeta!.year;

    // Buy: the player's club is the buyer, club "34" (a real AI club in the same league) sells.
    const buyFee = 5_000_000;
    const playerSquad = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!;
    const aiSquad = (await saveService.getSquad(saveId, "premier_league", "34"))!;
    await executeTransferFee(
      saveId, meta,
      { squad: playerSquad, leagueSlug: meta.leagueSlug, clubSlug: meta.clubId, isPlayerClub: true },
      { squad: aiSquad, leagueSlug: "premier_league", clubSlug: "34", isPlayerClub: false },
      buyFee,
    );

    // Sell: the same AI club now buys FROM the player's club (re-read: the previous transfer
    // already moved both squads' budgets on disk).
    const sellFee = 8_000_000;
    const aiSquadAfter = (await saveService.getSquad(saveId, "premier_league", "34"))!;
    const playerSquadAfterBuy = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!;
    await executeTransferFee(
      saveId, meta,
      { squad: aiSquadAfter, leagueSlug: "premier_league", clubSlug: "34", isPlayerClub: false },
      { squad: playerSquadAfterBuy, leagueSlug: meta.leagueSlug, clubSlug: meta.clubId, isPlayerClub: true },
      sellFee,
    );

    const ledger = await saveService.getLedger(saveId, season);
    const transferOut = ledger.find((e) => e.kind === "transfer_out");
    const transferIn = ledger.find((e) => e.kind === "transfer_in");
    expect(transferOut?.amount).toBe(-buyFee);
    expect(transferIn?.amount).toBe(sellFee);

    const squad = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    const sum = ledger.reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(squad!.finances!.budget);
  }, 60_000);
});
