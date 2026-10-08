import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { recordMoney } from "@/backend/FinancialService";
import { addDays } from "@/Domain/dates";
import { conditionOf, wearFor } from "@/Domain/facilities/facilityItems";
import { matchPitchCondition } from "@/Domain/facilities/pitch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { Squad } from "@/types/playerTypes";

/**
 * Facilities routes and the day pipeline (`.claude/rules/game/facilities.md`): owner only, the board
 * decides, instalments and the board's funding reach the ledger, finished works change the stadium,
 * and an unemployed manager gets 409 noClub (the old club keeps no facilities).
 */
describe("facilities routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("request, board decision, instalments, completion, noClub", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("facilities-route@test.local");
    const other = devAutoLogin("facilities-other@test.local");
    recordSaveOwnership(saveId, user.id);

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

    // Initial state: stands sum to the venue capacity, comfort 1.
    const start = await (await call("", "GET", session.token)).json() as any;
    const squad0 = (await saveService.getSquadById(saveId, "33"))!;
    expect(start.capacity).toBe(squad0.venue!.capacity);
    expect(start.facilities.stands).toHaveLength(4);
    expect(start.levels.comfort).toBe(1);
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

    // No money: refused, with an inbox message.
    const refused = await (await call("/request", "POST", session.token, { kind: "stand", stand: "east", seats: 2000 })).json() as any;
    expect(refused.approved).toBe(false);
    expect(refused.reason).toBe("no_money");

    // A happy board and money in the bank: approved with the board's funding.
    const ledgerSeason = (await saveService.getLeagueMeta(saveId, "premier_league"))!.year;
    await recordMoney(saveService, saveId, ledgerSeason, { leagueSlug: "premier_league", clubSlug: "33" },
      { date: meta.currentDate!, kind: "prize", amount: 500_000_000, label: "test money", ref: { stage: "board_bonus" } });
    await saveService.updateMeta(saveId, { board: { ...meta.board!, board: 100 } });
    const ok = await (await call("/request", "POST", session.token, { kind: "stand", stand: "east", seats: 2000 })).json() as any;
    expect(ok.approved).toBe(true);
    expect(ok.boardShare).toBe(0.5);
    expect(ok.view.effectiveCapacity).toBeLessThan(ok.view.capacity);
    // One project per facility.
    expect((await call("/request", "POST", session.token, { kind: "stand", stand: "west", seats: 1000 })).status).toBe(409);
    const inbox = await saveService.getInbox(saveId);
    // A refusal is answered on screen only.
    expect(inbox.some((m) => m.category === "facilities" && m.kind === "refused")).toBe(false);
    expect(inbox.some((m) => m.category === "facilities" && m.kind === "approved")).toBe(true);

    // The day pays the first instalment and the board's half of it.
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const ledger = await saveService.getLedger(saveId, ledgerSeason);
    const inst = ledger.filter((e) => e.kind === "facilities");
    const fund = ledger.filter((e) => e.kind === "board_funding");
    expect(inst).toHaveLength(1);
    expect(fund).toHaveLength(1);
    expect(Math.abs(fund[0]!.amount + inst[0]!.amount / 2)).toBeLessThan(2);
    const balanceSum = (await Promise.all((await saveService.listLedgerSeasons(saveId)).map((s) => saveService.getLedger(saveId, s))))
      .flat().reduce((s, e) => s + e.amount, 0);
    expect(Math.abs(balanceSum - (await saveService.getSquadById(saveId, "33"))!.finances!.budget)).toBeLessThan(1);

    // Bring the end forward: the next day finishes the works, pays what is left and grows the stadium.
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
    const paid = (await saveService.getLedger(saveId, ledgerSeason)).filter((e) => e.kind === "facilities")
      .reduce((s, e) => s - e.amount, 0);
    expect(paid).toBe(p.cost);
    expect((await saveService.getInbox(saveId)).some((m) => m.category === "facilities" && m.kind === "completed")).toBe(true);

    // Sacked: the club becomes AI without facilities, the routes answer 409 noClub.
    const m2 = (await saveService.getMeta(saveId))!;
    await saveService.updateMeta(saveId, { board: { ...m2.board!, board: 5 } });
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

  test("small repair paid now, big works by the board, validation, busy, view, match pitch", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("facilities-items@test.local");
    recordSaveOwnership(saveId, user.id);
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
      { date: meta.currentDate!, kind: "prize", amount, label: "test money", ref: { stage: "board_bonus" } });
    const ledgerSum = async () => (await Promise.all((await saveService.listLedgerSeasons(saveId)).map((x) => saveService.getLedger(saveId, x))))
      .flat().reduce((t, e) => t + e.amount, 0);

    // View: ten items with quotes and what would happen.
    const view = await (await call("", "GET")).json() as any;
    expect(view.items).toHaveLength(10);
    const pitchView = view.items.find((i: any) => i.id === "stadiumPitch");
    expect(pitchView.level).toBeGreaterThanOrEqual(1);
    expect(pitchView.quotes.repair["100"]?.small).toBe(true);
    expect(pitchView.quotes.repair["100"].forecast.paidByClub).toBe(true);
    expect(pitchView.quotes.rebuild).toBeNull();
    expect(pitchView.quotes.upgrade.forecast.paidByClub).toBe(false);
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

    // Small repair without money: refused, nothing written.
    const balance0 = (await human()).finances!.budget;
    await money(-balance0);
    const poor = await (await call("/request", "POST", { kind: "repair", item: "stadiumPitch", to: 100 })).json() as any;
    expect(poor).toMatchObject({ approved: false, reason: "no_money" });
    expect((await human()).facilities!.projects).toHaveLength(0);

    // With money and a board at 10: paid now in one line, no board funding.
    await money(100_000_000);
    await saveService.updateMeta(saveId, { board: { ...meta.board!, board: 10 } });
    const before = (await human()).finances!.budget;
    const quote = (await (await call("", "GET")).json() as any).items.find((i: any) => i.id === "stadiumPitch").quotes.repair["100"];
    const paid = await (await call("/request", "POST", { kind: "repair", item: "stadiumPitch", to: 100 })).json() as any;
    expect(paid).toMatchObject({ approved: true, paidByClub: true });
    expect((await human()).finances!.budget).toBe(before - quote.cost);
    const ledger = await saveService.getLedger(saveId, season);
    const lines = ledger.filter((e) => e.kind === "facilities");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.ref?.facility).toBe("repair");
    expect(lines[0]!.amount).toBe(-quote.cost);
    expect(ledger.some((e) => e.kind === "board_funding")).toBe(false);
    expect(Math.abs((await ledgerSum()) - (await human()).finances!.budget)).toBeLessThan(1);
    // Busy: one project per item.
    expect((await call("/request", "POST", { kind: "repair", item: "stadiumPitch", to: 100 })).status).toBe(409);
    expect((await call("/request", "POST", { kind: "upgrade", item: "stadiumPitch" })).status).toBe(409);

    // Big repair (seats at level 10, almost gone): the board decides.
    await setItems({ seats: { level: 10, wear: 0.99 }, gym: { level: 10, wear: 0.1 } });
    const revenue = wageRevenueBasisOf(await human());
    const bigView = (await (await call("", "GET")).json() as any).items.find((i: any) => i.id === "seats");
    expect(bigView.quotes.repair["100"].small).toBe(false);
    expect(bigView.quotes.repair["100"].cost).toBeGreaterThan(0.02 * revenue);
    await saveService.updateMeta(saveId, { board: { ...meta.board!, board: 40 } });
    const low = await (await call("/request", "POST", { kind: "repair", item: "seats", to: 100 })).json() as any;
    expect(low).toMatchObject({ approved: false, reason: "board_low" });
    await saveService.updateMeta(saveId, { board: { ...meta.board!, board: 90 } });
    await money(500_000_000);
    const big = await (await call("/request", "POST", { kind: "repair", item: "seats", to: 100 })).json() as any;
    expect(big.approved).toBe(true);
    expect(big.paidByClub).toBeUndefined();
    expect(big.boardShare).toBeGreaterThan(0);
    expect(big.project.item).toBe("seats");
    // A group work over a busy item: busy too (comfort = the seats).
    expect((await call("/request", "POST", { kind: "comfort" })).status).toBe(409);

    // Upgrade at level 10: maxLevel. Rebuild of a condemned item: through the board.
    const maxed = await call("/request", "POST", { kind: "upgrade", item: "gym" });
    expect(maxed.status).toBe(400);
    expect(((await maxed.json()) as any).error).toBe("maxLevel");
    await setItems({ trainingPitches: { level: 6, wear: 0.95, condemned: true, alert: 15 } });
    expect((await call("/request", "POST", { kind: "repair", item: "trainingPitches", to: 50 })).status).toBe(400);
    const rebuilt = await (await call("/request", "POST", { kind: "rebuild", item: "trainingPitches" })).json() as any;
    expect(rebuilt.approved).toBe(true);
    expect(rebuilt.project.kind).toBe("rebuild");
    const inbox = await saveService.getInbox(saveId);
    expect(inbox.some((m) => m.category === "facilities" && m.kind === "approved" && (m as any).item === "seats")).toBe(true);

    // Match setup: the pitch of the stadium the match is played in.
    let fixture: { date: string; home: string; away: string; neutral?: boolean } | null = null;
    for (let r = 1; r <= 38 && !fixture; r++) {
      const round = await saveService.getRound(saveId, "premier_league", r);
      const f = round?.fixtures.find((x) => !x.played && (x.home === "33" || x.away === "33"));
      if (f) fixture = f;
    }
    expect(fixture).not.toBeNull();
    await saveService.saveTactics(saveId, { tactical_style: "balanced", formation: "4-3-3", lineup: autoLineupDefaultFormation(await human()) });
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
