import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService, type SaveMeta } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { applyDuePreContracts } from "@/backend/rivalWorld";
import { emptyMarket } from "@/backend/negotiationWorld";
import { contractDemand } from "@/Domain/contracts/contracts";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

type Params = Record<string, string>;

/**
 * Etapa 25 routes (`.claude/rules/game/transfer-windows.md`): fee buys, loans and AI bids need the
 * buyer's window open; free agents and pre-contracts do not; the manager's renewal.
 */
describe("transfer windows, pre-contracts and the manager contract (routes)", () => {
  let meta: SaveMeta;
  let saveId = "";
  let token = "";

  const req = (path: string, method: string, params: Params, body?: unknown) => Object.assign(
    new Request(`http://localhost${path}`, {
      method,
      headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    { params },
  ) as Request & { params: Params };
  const route = (key: string) => (apiRoutes as unknown as Record<string, (r: Request & { params: Params }) => Promise<Response>>)[key]!;
  const human = async () => (await saveService.getSquadById(saveId, meta.clubId))!;
  const aiClub = async (): Promise<Squad> =>
    (await saveService.getSquadsInLeague(saveId, meta.leagueSlug)).find((s) => s.id !== meta.clubId && s.players.length >= 20)!;
  const midfielder = (s: Squad): RosterPlayer => s.players.find((p) => !p.loan && (p.positions[0] === "CM" || p.positions[0] === "Midfielder"))!;

  beforeAll(async () => {
    process.env.FM_NO_RIVALS = "1";
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("windows-route@test.local");
    token = session.token;
    recordSaveOwnership(saveId, user.id);
    const sq = await human();
    await saveService.saveSquadById(saveId, { ...sq, players: sq.players.slice(0, 25), finances: { ...sq.finances!, budget: 2_000_000_000 } });
    // Mid-October: the summer window closed and the arrival grace is over.
    meta = await saveService.updateMeta(saveId, { currentDate: "2026-10-10" });
  }, 120_000);

  afterAll(async () => {
    delete process.env.FM_NO_RIVALS;
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("the windows route: the player's window closed, opening on 1 January", async () => {
    expect(meta.careerStart).toBe("2026-08-15");
    const res = await route("/api/saves/:saveId/transfer-windows")(req(`/api/saves/${saveId}/transfer-windows`, "GET", { saveId }));
    const body = (await res.json()) as { player: { open: boolean; opensOn?: string; country: string }; countries: { country: string }[] };
    expect(body.player).toMatchObject({ open: false, opensOn: "2027-01-01", country: "England" });
    expect(body.countries[0]!.country).toBe("England");
    expect(body.countries.length).toBeGreaterThan(10);
  });

  test("fee buy, loan and an AI bid are refused with the window closed; a free agent signs", async () => {
    const club = await aiClub();
    const target = midfielder(club);
    const buy = await route("/api/saves/:saveId/transfers")(req(`/api/saves/${saveId}/transfers`, "POST", { saveId },
      { playerId: target.id, fromSquadId: club.id, fee: 50_000_000 }));
    expect(buy.status).toBe(409);
    expect(await buy.json()).toMatchObject({ error: "windowClosed", opensOn: "2027-01-01" });

    const loan = await route("/api/saves/:saveId/loans")(req(`/api/saves/${saveId}/loans`, "POST", { saveId },
      { playerId: target.id, fromSquadId: club.id, wageShare: 100, fee: 0 }));
    expect(loan.status).toBe(409);

    const mine = (await human()).players[24]!;
    await saveService.saveMarket(saveId, {
      ...emptyMarket(),
      pendingBids: [{ id: "bid-x", kind: "transfer", playerId: mine.id, playerName: mine.name, clubId: club.id, clubName: club.name, date: "2026-10-10", expires: "2026-10-15", fee: 1_000_000, maxFee: 2_000_000 }],
    });
    const bid = await route("/api/saves/:saveId/bids/:bidId")(req(`/api/saves/${saveId}/bids/bid-x`, "POST", { saveId, bidId: "bid-x" }, { action: "accept" }));
    expect(bid.status).toBe(409);
    expect(await bid.json()).toMatchObject({ error: "windowClosed" });

    const donor = (await human()).players.find((p) => p.age <= 28)!;
    const free = { ...donor, id: "free_window_1", name: "Free Window", squadId: "", contract: undefined };
    await saveService.writeFreeAgents(saveId, [{ player: free, since: "2026-10-01" }]);
    const demand = contractDemand(free, await human(), "2026-10-10");
    const sign = await route("/api/saves/:saveId/free-agents/:playerId/sign")(req(`/api/saves/${saveId}/free-agents/free_window_1/sign`, "POST",
      { saveId, playerId: "free_window_1" }, { wage: demand, years: 2 }));
    expect(sign.status).toBe(200);
  }, 60_000);

  test("a pre-contract with a player whose contract ends: signed with the window closed, he joins at the rollover", async () => {
    const club = await aiClub();
    const target = { ...midfielder(club), contract: { until: "2027-03-31", wage: 10_000 } };
    await saveService.saveSquadById(saveId, { ...club, players: club.players.map((p) => (p.id === target.id ? target : p)) });
    const post = (body: unknown) => route("/api/saves/:saveId/pre-contracts")(req(`/api/saves/${saveId}/pre-contracts`, "POST", { saveId }, body));

    const tooLow = await post({ playerId: target.id, fromSquadId: club.id, wage: 1, years: 2 });
    expect(tooLow.status).toBe(400);
    const ok = await post({ playerId: target.id, fromSquadId: club.id, wage: 5_000_000, years: 2 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ accepted: true });
    expect((await saveService.getMarket(saveId))!.preContracts!.map((p) => p.playerId)).toEqual([target.id]);
    const again = await post({ playerId: target.id, fromSquadId: club.id, wage: 5_000_000, years: 2 });
    expect(again.status).toBe(400);

    // The origin club's country rolls: he leaves for free, before the AI renewals.
    const res = await applyDuePreContracts(saveService, saveId, (await saveService.getMeta(saveId))!, {
      unitIds: new Set([club.id]), date: "2027-05-20", humanClubId: meta.clubId,
    });
    expect(res.moves).toEqual([{ playerId: target.id, from: club.id, to: meta.clubId, fee: 0, kind: "pre_contract", date: "2027-05-20" }]);
    expect((await human()).players.find((p) => p.id === target.id)?.contract?.wage).toBe(5_000_000);
    expect((await saveService.getSquadById(saveId, club.id))!.players.some((p) => p.id === target.id)).toBe(false);
    expect((await saveService.getMarket(saveId))!.preContracts).toEqual([]);
  }, 60_000);

  test("the manager's contract: a renewal accepted once, then 409", async () => {
    const get = await route("/api/saves/:saveId/manager-contract")(req(`/api/saves/${saveId}/manager-contract`, "GET", { saveId }));
    const body = (await get.json()) as { contract: { wage: number; until: string }; earnings: number; revenueShare: number };
    expect(body.contract.wage).toBeGreaterThan(0);
    expect(body.revenueShare).toBeGreaterThan(0.014);
    expect(body.revenueShare).toBeLessThan(0.041);
    const until = body.contract.until;
    await saveService.updateMeta(saveId, { managerRenewal: { offeredOn: "2026-10-10", expires: "2027-08-01", wage: body.contract.wage + 1000, seasons: 2 } });
    const post = (accept: boolean) => route("/api/saves/:saveId/manager-contract")(req(`/api/saves/${saveId}/manager-contract`, "POST", { saveId }, { accept }));
    const ok = await post(true);
    expect(ok.status).toBe(200);
    const after = (await saveService.getMeta(saveId))!;
    expect(after.managerContract!.until > until).toBe(true);
    expect(after.managerContract!.wage).toBe(body.contract.wage + 1000);
    expect(after.managerRenewal).toBeUndefined();
    expect((await post(true)).status).toBe(409);
  }, 60_000);
});
