import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordMoney } from "@/backend/FinancialService";
import { addDays } from "@/Domain/dates";
import { conditionOf, wearFor } from "@/Domain/facilities/facilityItems";
import { matchPitchCondition } from "@/Domain/facilities/pitch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { ensureCraft } from "@/backend/craftWorld";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { shareOf } from "@/Domain/craft/recycle";
import { addComponents, componentTotal } from "@/Domain/craft/stock";
import type { ComponentCounts, ComponentId, CraftQuality } from "@/types/craftTypes";
import type { Squad } from "@/types/playerTypes";

/** Puts `recipe` in the club's stock (quality `q`), creating the craft state when missing. */
async function stockUp(saveId: string, recipe: ComponentCounts, q: CraftQuality = "excellent") {
  const entry = (await saveService.getSquadIndex(saveId)).byId("33")!;
  const sq = (await saveService.getSquad(saveId, entry.leagueSlug, entry.stem))!;
  const f = ensureCraft(sq.facilities!, sq);
  let stock = f.craft!.stock;
  for (const [id, n] of Object.entries(recipe) as [ComponentId, number][]) stock = addComponents(stock, id, { [q]: n });
  await saveService.saveSquad(saveId, entry.leagueSlug, entry.stem, { ...sq, facilities: { ...f, craft: { ...f.craft!, stock } } });
}

const recipeTotal = (r: ComponentCounts) => Object.values(r).reduce((a: number, n) => a + (n ?? 0), 0);

/**
 * Facilities routes and the day pipeline (`.claude/rules/game/facilities.md`): owner only, works are
 * built from the workshop's stock (craft, no board and no money), finished works change the stadium,
 * and an unemployed manager gets 409 noClub (the old club keeps no facilities).
 */
describe("facilities routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("request built from the stock, completion with its quality, noClub", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("facilities-route@test.local");
    const other = devAutoLogin("facilities-other@test.local");
    await ownSolo(saveId, user.id);

    const call = (path: string, method: string, token: string, body?: unknown) => {
      const key = `/api/saves/:saveId/facilities${path}`;
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/facilities${path}`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
    };

    // Not the owner: indistinguishable from a missing save.
    expect((await call("", "GET", other.session.token)).status).toBe(404);

    // Initial state: stands sum to the venue capacity; items by the club's revenue (Man United: top
    // of the world, so every item starts high), comfort = seats level / 2.
    const start = await (await call("", "GET", session.token)).json() as any;
    const squad0 = (await saveService.getSquadById(saveId, "33"))!;
    expect(start.capacity).toBe(squad0.venue!.capacity);
    expect(start.facilities.stands).toHaveLength(4);
    expect(start.levels.comfort).toBe(start.facilities.items.seats.level / 2);
    for (const it of Object.values(start.facilities.items) as { level: number }[]) expect(it.level).toBeGreaterThanOrEqual(6);
    expect(start.facilities.startLevels.training).toBeGreaterThan(3);
    expect(Object.keys(start.facilities.items)).toHaveLength(10);
    expect(start.seatCost).toBeGreaterThanOrEqual(1500);
    expect(start.seatCost).toBeLessThanOrEqual(6000);
    // Big-match multiplier: one key per home league game not played yet (cup/continental too), all in 1..1,3.
    const leagueHome = (await saveService.getAllFixturesForLeague(saveId, "premier_league"))
      .filter((f) => f.home === "33" && !f.played && !f.neutral);
    const importance = start.importanceByFixture as Record<string, number>;
    expect(leagueHome.length).toBeGreaterThan(0);
    for (const f of leagueHome) expect(importance[f.id]).toBeGreaterThanOrEqual(1);
    expect(Object.values(importance).every((v) => v >= 1 && v <= 1.3)).toBe(true);

    // Validation.
    expect((await call("/request", "POST", session.token, { kind: "stand", stand: "east", seats: 1500 })).status).toBe(400);
    expect((await call("/request", "POST", session.token, { kind: "pool" })).status).toBe(400);

    // No components: 409 with what is missing (the stock starts with materials only), nothing written.
    const ledgerSeason = (await saveService.getLeagueMeta(saveId, "premier_league"))!.year;
    const ledgerLines = async () => (await saveService.getLedger(saveId, ledgerSeason, meta.seatId)).filter((e) => e.kind === "facilities" || e.kind === "board_funding");
    const linesBefore = (await ledgerLines()).length;
    const refused = await call("/request", "POST", session.token, { kind: "stand", stand: "east", seats: 2000 });
    expect(refused.status).toBe(409);
    const refusedBody = await refused.json() as any;
    expect(refusedBody.error).toBe("missingComponents");
    const recipe = refusedBody.missing as ComponentCounts;
    expect(recipeTotal(recipe)).toBeGreaterThan(0);
    expect((await saveService.getSquadById(saveId, "33"))!.facilities!.projects).toHaveLength(0);

    // The recipe in the stock (all excellent): built, the stock loses it, no money moves.
    await stockUp(saveId, recipe);
    const ok = await call("/request", "POST", session.token, { kind: "stand", stand: "east", seats: 2000 });
    expect(ok.status).toBe(200);
    const okBody = await ok.json() as any;
    expect(okBody).toMatchObject({ built: true, quality: "excellent" });
    expect(okBody.project.craft).toBe(true);
    expect(okBody.project.instalments).toBe(0);
    expect(okBody.view.effectiveCapacity).toBeLessThan(okBody.view.capacity);
    const stockAfter = (await saveService.getSquadById(saveId, "33"))!.facilities!.craft!.stock;
    for (const id of Object.keys(recipe) as ComponentId[]) expect(componentTotal(stockAfter, id)).toBe(0);
    // One project per facility.
    expect((await call("/request", "POST", session.token, { kind: "stand", stand: "west", seats: 1000 })).status).toBe(409);
    const inbox = await saveService.getInbox(saveId, meta.seatId);
    expect(inbox.some((m) => m.category === "facilities" && m.kind === "built")).toBe(true);
    expect(inbox.some((m) => m.category === "facilities" && m.kind === "approved")).toBe(false);

    // Bring the end forward: the next day finishes the works and grows the stadium, with excellent seats; no ledger line.
    const sq = (await saveService.getSquadById(saveId, "33"))!;
    const date = (await saveService.getMeta(saveId))!.currentDate!;
    const p = sq.facilities!.projects[0]!;
    const index = await saveService.getSquadIndex(saveId);
    const entry = index.byId("33")!;
    await saveService.saveSquad(saveId, entry.leagueSlug, entry.stem, {
      ...sq, facilities: { ...sq.facilities!, projects: [{ ...p, end: date, start: addDays(date, -30) }] },
    });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const after = (await saveService.getSquadById(saveId, "33"))!;
    expect(after.facilities!.projects).toHaveLength(0);
    expect(after.venue!.capacity).toBe(squad0.venue!.capacity + 2000);
    expect(after.facilities!.items.seats.quality).toBe("excellent");
    expect((await ledgerLines()).length).toBe(linesBefore);
    const balanceSum = (await Promise.all((await saveService.listLedgerSeasons(saveId, meta.seatId)).map((x) => saveService.getLedger(saveId, x, meta.seatId))))
      .flat().reduce((t, e) => t + e.amount, 0);
    expect(Math.abs(balanceSum - after.finances!.budget)).toBeLessThan(1);
    expect((await saveService.getInbox(saveId, meta.seatId)).some((m) => m.category === "facilities" && m.kind === "completed")).toBe(true);

    // Sacked: the club becomes AI without facilities, the routes answer 409 noClub.
    const m2 = (await saveService.getSeatMeta(saveId, meta.seatId))!;
    await saveService.updateSeat(saveId, meta.seatId, { board: { ...m2.board!, board: 5 } });
    const sacked = await advanceOneDay(saveService, saveId);
    expect(sacked.ok).toBe(true);
    expect((await saveService.getSquadById(saveId, "33"))!.facilities).toBeUndefined();
    expect((await call("", "GET", session.token)).status).toBe(409);
    expect((await call("/request", "POST", session.token, { kind: "training" })).status).toBe(409);
  }, 240_000);
});

describe("facility item requests", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("item works built from the stock, validation, busy, rebuild return, cancel, view, match pitch", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("facilities-items@test.local");
    await ownSolo(saveId, user.id);
    const call = async (path: string, method: string, body?: unknown) => {
      const key = `/api/saves/:saveId/facilities${path}`;
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/facilities${path}`, {
          method,
          headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
    };
    const human = async () => (await saveService.getSquadById(saveId, "33"))!;
    const entry = (await saveService.getSquadIndex(saveId)).byId("33")!;
    const setItems = async (patch: Partial<NonNullable<Squad["facilities"]>["items"]>) => {
      const sq = await human();
      await saveService.saveSquad(saveId, entry.leagueSlug, entry.stem,
        { ...sq, facilities: { ...sq.facilities!, items: { ...sq.facilities!.items, ...patch } } });
    };
    const season = (await saveService.getLeagueMeta(saveId, "premier_league"))!.year;
    const money = (amount: number) => recordMoney(saveService, saveId, season, { leagueSlug: entry.leagueSlug, clubSlug: entry.stem },
      { date: meta.currentDate!, kind: "prize", amount, label: "test money", ref: { stage: "board_bonus" } }, meta.seatId);
    const ledgerSum = async () => (await Promise.all((await saveService.listLedgerSeasons(saveId, meta.seatId)).map((x) => saveService.getLedger(saveId, x, meta.seatId))))
      .flat().reduce((t, e) => t + e.amount, 0);

    // View: ten items with quotes and the components each asks.
    const view = await (await call("", "GET")).json() as any;
    expect(view.items).toHaveLength(10);
    expect(view.stock).toBeDefined();
    const pitchView = view.items.find((i: any) => i.id === "stadiumPitch");
    expect(pitchView.level).toBeGreaterThanOrEqual(1);
    expect(recipeTotal(pitchView.quotes.repair["100"].build.recipe)).toBeGreaterThan(0);
    expect(pitchView.quotes.repair["100"].build.canBuild).toBe(false);
    expect(pitchView.quotes.repair["100"].forecast).toBeUndefined();
    expect(pitchView.quotes.rebuild).toBeNull();
    expect(pitchView.quotes.upgrade.build.recipe).toBeDefined();
    expect(view.quotes.training.build.recipe).toBeDefined();
    expect(view.levels.training).toBeGreaterThan(0);

    // Validation.
    for (const bad of [
      { kind: "repair", item: "moon", to: 100 }, { kind: "repair", item: "gym", to: 103 },
      { kind: "repair", item: "gym" }, { kind: "rebuild", item: "nope" },
    ]) expect((await call("/request", "POST", bad)).status).toBe(400);
    await setItems({ stadiumPitch: { level: 6, wear: wearFor(50) }, gym: { level: 6, wear: wearFor(60) } });
    const below = await call("/request", "POST", { kind: "repair", item: "stadiumPitch", to: 45 });
    expect(below.status).toBe(400);
    expect(((await below.json()) as any).error).toBe("invalidRequest");
    expect((await call("/request", "POST", { kind: "rebuild", item: "gym" })).status).toBe(400);

    const quoteOf = async (id: string, pick: (q: any) => any) => pick((await (await call("", "GET")).json() as any).items.find((i: any) => i.id === id).quotes);
    const ledgerLen = async () => (await saveService.getLedger(saveId, season, meta.seatId)).length;

    // Without components: 409 with what is missing, nothing written; even with money and a happy board.
    await money(100_000_000);
    await saveService.updateSeat(saveId, meta.seatId, { board: { ...meta.board!, board: 100 } });
    const missing = await call("/request", "POST", { kind: "repair", item: "stadiumPitch", to: 100 });
    expect(missing.status).toBe(409);
    const missingBody = await missing.json() as any;
    expect(missingBody.error).toBe("missingComponents");
    expect(recipeTotal(missingBody.missing)).toBeGreaterThan(0);
    expect((await human()).facilities!.projects).toHaveLength(0);

    // With the recipe in the stock (a board at 10 does not matter): built, no money moves.
    await saveService.updateSeat(saveId, meta.seatId, { board: { ...meta.board!, board: 10 } });
    const repair = await quoteOf("stadiumPitch", (q) => q.repair["100"]);
    await stockUp(saveId, repair.build.recipe, "common");
    const before = (await human()).finances!.budget;
    const linesBefore = await ledgerLen();
    const built = await call("/request", "POST", { kind: "repair", item: "stadiumPitch", to: 100 });
    expect(built.status).toBe(200);
    expect(await built.json()).toMatchObject({ built: true, quality: "common" });
    const afterBuild = await human();
    expect(afterBuild.finances!.budget).toBe(before);
    expect(await ledgerLen()).toBe(linesBefore);
    expect(afterBuild.facilities!.projects[0]).toMatchObject({ item: "stadiumPitch", craft: true, instalments: 0 });
    for (const id of Object.keys(repair.build.recipe) as ComponentId[]) expect(componentTotal(afterBuild.facilities!.craft!.stock, id)).toBe(0);
    expect(Math.abs((await ledgerSum()) - afterBuild.finances!.budget)).toBeLessThan(1);
    // Busy: one project per item.
    expect((await call("/request", "POST", { kind: "repair", item: "stadiumPitch", to: 100 })).status).toBe(409);
    expect((await call("/request", "POST", { kind: "upgrade", item: "stadiumPitch" })).status).toBe(409);
    // The stadium group is busy: another stadium works waits.
    await setItems({ stadiumStructure: { level: 6, wear: wearFor(60) } });
    const structure = await quoteOf("stadiumStructure", (q) => q.repair["100"]);
    await stockUp(saveId, structure.build.recipe);
    const structureBusy = await call("/request", "POST", { kind: "repair", item: "stadiumStructure", to: 100 });
    expect(structureBusy.status).toBe(409);
    expect(await structureBusy.json()).toMatchObject({ error: "busy", group: "stadium" });
    // A group work over a busy item: busy too (comfort = the seats, in the stadium group).
    expect((await call("/request", "POST", { kind: "comfort" })).status).toBe(409);

    // Upgrade at level 10: maxLevel. Rebuild of a condemned item: built, a quarter of the recipe back (common).
    await setItems({ gym: { level: 10, wear: 0.1 } });
    const maxed = await call("/request", "POST", { kind: "upgrade", item: "gym" });
    expect(maxed.status).toBe(400);
    expect(((await maxed.json()) as any).error).toBe("maxLevel");
    await setItems({ trainingPitches: { level: 6, wear: 0.95, condemned: true, alert: 15 } });
    expect((await call("/request", "POST", { kind: "repair", item: "trainingPitches", to: 50 })).status).toBe(400);
    const rebuild = await quoteOf("trainingPitches", (q) => q.rebuild);
    await stockUp(saveId, rebuild.build.recipe);
    const commonBefore = (await human()).facilities!.craft!.stock.components;
    const rebuilt = await (await call("/request", "POST", { kind: "rebuild", item: "trainingPitches" })).json() as any;
    expect(rebuilt.built).toBe(true);
    expect(rebuilt.project.kind).toBe("rebuild");
    const back = shareOf(rebuild.build.recipe, CRAFT.REBUILD_RETURN);
    const commonAfter = (await human()).facilities!.craft!.stock.components;
    for (const [id, n] of Object.entries(back) as [ComponentId, number][]) expect(commonAfter[id].common).toBe(commonBefore[id].common + n);

    // One works per group (#152): the stadium and the training ground are busy.
    const standBusy = await call("/request", "POST", { kind: "stand", stand: "east", seats: 1000 });
    expect(standBusy.status).toBe(409);
    expect(await standBusy.json()).toMatchObject({ error: "busy", group: "stadium" });
    const poolBusy = await call("/request", "POST", { kind: "upgrade", item: "pool" });
    expect(poolBusy.status).toBe(409);
    expect(await poolBusy.json()).toMatchObject({ error: "busy", group: "training" });
    // The third group is free: the academy works start; then all three are busy.
    const lodging = await quoteOf("academyLodging", (q) => q.upgrade);
    await stockUp(saveId, lodging.build.recipe);
    const acad = await (await call("/request", "POST", { kind: "upgrade", item: "academyLodging" })).json() as any;
    expect(acad.built).toBe(true);
    expect(acad.view.busyGroups).toEqual(["stadium", "training", "academy"]);
    expect((await call("/request", "POST", { kind: "upgrade", item: "academyPitches" })).status).toBe(409);
    expect((await human()).facilities!.projects).toHaveLength(3);
    const inbox = await saveService.getInbox(saveId, meta.seatId);
    expect(inbox.filter((m) => m.category === "facilities" && m.kind === "built")).toHaveLength(3);

    // Cancel: half the components back (common), the project gone; unknown id 404, bad body 400.
    expect((await call("/cancel", "POST", { projectId: 5 })).status).toBe(400);
    expect((await call("/cancel", "POST", { projectId: "fac_nope" })).status).toBe(404);
    const beforeCancel = (await human()).facilities!.craft!.stock.components;
    const cancelled = await call("/cancel", "POST", { projectId: acad.project.id });
    expect(cancelled.status).toBe(200);
    const half = shareOf(lodging.build.recipe, CRAFT.CANCEL_RETURN);
    expect((await cancelled.json() as any).returned).toEqual(half);
    const afterCancel = await human();
    expect(afterCancel.facilities!.projects).toHaveLength(2);
    for (const [id, n] of Object.entries(half) as [ComponentId, number][]) expect(afterCancel.facilities!.craft!.stock.components[id].common).toBe(beforeCancel[id].common + n);

    // Match setup: the pitch of the stadium the match is played in.
    let fixture: { date: string; home: string; away: string; neutral?: boolean } | null = null;
    for (let r = 1; r <= 38 && !fixture; r++) {
      const round = await saveService.getRound(saveId, "premier_league", r);
      const f = round?.fixtures.find((x) => !x.played && (x.home === "33" || x.away === "33"));
      if (f) fixture = f;
    }
    expect(fixture).not.toBeNull();
    await saveService.saveTactics(saveId, { tactical_style: "balanced", formation: "4-3-3", lineup: autoLineupDefaultFormation(await human()) }, meta.seatId);
    await saveService.updateMeta(saveId, { currentDate: fixture!.date });
    const ms = await apiRoutes["/api/match-setup"](new Request(`http://localhost/api/match-setup?saveId=${saveId}`, {
      headers: { cookie: `fs_session=${session.token}` },
    }));
    expect(ms.status).toBe(200);
    const setup = await ms.json() as { pitchCondition: number };
    const homeSquad = (await saveService.getSquadById(saveId, fixture!.home))!;
    const m3 = (await saveService.getMeta(saveId))!;
    const homeLeague = (await saveService.getSquadIndex(saveId)).byId(fixture!.home)!.leagueSlug;
    const window = (m3.activeLeagues ?? []).find((l) => l.leagueSlug === homeLeague);
    expect(setup.pitchCondition).toBeCloseTo(matchPitchCondition(homeSquad, fixture!, window, fixture!.date), 6);
    if (fixture!.home === "33") expect(setup.pitchCondition).toBeCloseTo(conditionOf(homeSquad.facilities!.items.stadiumPitch), 6);
  }, 240_000);
});

describe("turf and mowing requests", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("turf: quote in the view, request built from the stock, busy stadium, invalid grass; mowing PUT", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("facilities-turf@test.local");
    await ownSolo(saveId, user.id);
    const call = async (path: string, method: string, body?: unknown) => {
      const key = `/api/saves/:saveId/facilities${path}`;
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/facilities${path}`, {
          method,
          headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
    };
    const season = (await saveService.getLeagueMeta(saveId, "premier_league"))!.year;
    await recordMoney(saveService, saveId, season, { leagueSlug: "premier_league", clubSlug: "33" },
      { date: meta.currentDate!, kind: "prize", amount: 500_000_000, label: "test money", ref: { stage: "board_bonus" } }, meta.seatId);
    await saveService.updateSeat(saveId, meta.seatId, { board: { ...meta.board!, board: 100 } });

    const view = await (await call("", "GET")).json() as any;
    expect(view.turf).toBe("natural");
    expect(view.mowing).toBe("stripes");
    expect(view.turfQuotes.natural).toBeNull();
    expect(view.turfQuotes.hybrid).toMatchObject({ kind: "turf", turf: "hybrid" });
    const turfRecipe = view.turfQuotes.hybrid.build.recipe as ComponentCounts;
    expect(recipeTotal(turfRecipe)).toBeGreaterThan(0);
    expect((await call("/request", "POST", { kind: "turf", turf: "natural" })).status).toBe(400);
    expect((await call("/request", "POST", { kind: "turf", turf: "grass" })).status).toBe(400);
    expect((await call("/request", "POST", { kind: "turf", turf: "hybrid" })).status).toBe(409);
    await stockUp(saveId, turfRecipe);
    const ok = await (await call("/request", "POST", { kind: "turf", turf: "hybrid" })).json() as any;
    expect(ok.built).toBe(true);
    expect(ok.project).toMatchObject({ kind: "turf", turf: "hybrid", item: "stadiumPitch" });
    expect((await call("/request", "POST", { kind: "turf", turf: "synthetic" })).status).toBe(409);

    expect((await call("/mowing", "PUT", { mowing: "checker" })).status).toBe(200);
    expect(((await (await call("", "GET")).json()) as any).mowing).toBe("checker");
    expect((await call("/mowing", "PUT", { mowing: "zigzag" })).status).toBe(400);
  }, 240_000);
});
