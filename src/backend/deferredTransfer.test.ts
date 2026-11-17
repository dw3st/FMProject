import { ownSolo, updateSolo } from "@/backend/testing/seatFixtures";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService, type SeatMeta } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { applyDueDeferredTransfers } from "@/backend/deferredTransferWorld";
import { contractDemand } from "@/Domain/contracts/contracts";
import { releaseClause } from "@/Domain/negotiation/releaseClause";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

type Params = Record<string, string>;

/** Fee transfers agreed with the buyer's window closed (tester report 0a35192c): fee now, player when it opens. */
describe("deferred transfers (route and day)", () => {
  let meta: SeatMeta;
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
  const aiClubs = async (): Promise<Squad[]> =>
    (await saveService.getSquadsInLeague(saveId, meta.leagueSlug)).filter((s) => s.id !== meta.clubId && s.players.length >= 22);
  const midfielder = (s: Squad): RosterPlayer =>
    s.players.find((p) => !p.loan && p.age < 30 && (p.positions[0] === "CM" || p.positions[0] === "Midfielder"))!;
  const wageFor = async (club: Squad, target: RosterPlayer) => contractDemand(target, await human(), "2026-10-10", { fromSquad: club }) * 2;
  const buy = async (club: Squad, target: RosterPlayer) =>
    route("/api/saves/:saveId/transfers")(req(`/api/saves/${saveId}/transfers`, "POST", { saveId },
      { playerId: target.id, fromSquadId: club.id, fee: releaseClause(target), payClause: true, wage: await wageFor(club, target), years: 2 }));
  const ledger = async () => saveService.getLedger(saveId, (await saveService.getLeagueMeta(saveId, meta.leagueSlug))!.year, meta.seatId);

  beforeAll(async () => {
    process.env.FM_NO_RIVALS = "1";
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("deferred-route@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
    const sq = await human();
    await saveService.saveSquadById(saveId, { ...sq, players: sq.players.slice(0, 25), finances: { ...sq.finances!, budget: 2_000_000_000 } });
    // Mid-October: the summer window closed and the arrival grace is over.
    meta = await updateSolo(saveId, { currentDate: "2026-10-10" });
  }, 120_000);

  afterAll(async () => {
    delete process.env.FM_NO_RIVALS;
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("agreed with the window closed: fee paid now, he stays, joins on the opening day", async () => {
    const club = (await aiClubs())[0]!;
    const target = midfielder(club);
    const wage = await wageFor(club, target);
    const fee = releaseClause(target);
    const before = (await human()).finances?.budget ?? 0;
    const res = await buy(club, target);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deferred?: { joinsOn: string }; record?: { status: string } };
    expect(body.deferred).toEqual({ joinsOn: "2027-01-01" });
    expect(body.record?.status).toBe("accepted");
    expect((await human()).finances?.budget).toBe(before - fee);
    expect((await ledger()).some((e) => e.kind === "transfer_out" && e.amount === -fee && e.ref?.playerId === target.id)).toBe(true);
    const seller = (await saveService.getSquadById(saveId, club.id))!;
    expect(seller.players.find((p) => p.id === target.id)?.deferredTo).toBe(meta.clubId);
    expect((await human()).players.some((p) => p.id === target.id)).toBe(false);
    expect((await saveService.getMarket(saveId, meta.seatId))!.deferredTransfers!.map((d) => d.playerId)).toEqual([target.id]);

    // The same player again, and a loan of him: he is already coming.
    const again = await buy(club, target);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "alreadyDeferred" });
    const loan = await route("/api/saves/:saveId/loans")(req(`/api/saves/${saveId}/loans`, "POST", { saveId },
      { playerId: target.id, fromSquadId: club.id, wageShare: 100, fee: 0 }));
    expect(loan.status).toBe(409);

    // The overview lists him.
    const ov = (await (await route("/api/saves/:saveId/negotiation")(req(`/api/saves/${saveId}/negotiation`, "GET", { saveId }))).json()) as {
      deferredTransfers: { playerId: string; joinsOn: string }[];
    };
    expect(ov.deferredTransfers.map((d) => [d.playerId, d.joinsOn])).toEqual([[target.id, "2027-01-01"]]);

    const seatMeta = (await saveService.getSeatMeta(saveId, meta.seatId))!;
    // Not due on the last day of December.
    expect((await applyDueDeferredTransfers(saveService, saveId, meta.seatId, seatMeta, "2026-12-31")).moves).toEqual([]);
    const budgetBefore = (await human()).finances?.budget ?? 0;
    const res2 = await applyDueDeferredTransfers(saveService, saveId, meta.seatId, seatMeta, "2027-01-01");
    expect(res2.moves).toEqual([{ playerId: target.id, from: club.id, to: meta.clubId, fee, kind: "transfer", date: "2027-01-01" }]);
    expect(res2.news.map((n) => n.kind)).toContain("deferred_joined");
    const arrived = (await human()).players.find((p) => p.id === target.id)!;
    expect(arrived.contract?.wage).toBe(wage);
    expect(arrived.deferredTo).toBeUndefined();
    expect(arrived.arrival).toMatchObject({ kind: "clause", fee, squadId: meta.clubId });
    expect((await saveService.getSquadById(saveId, club.id))!.players.some((p) => p.id === target.id)).toBe(false);
    // Nothing more is charged on arrival.
    expect((await human()).finances?.budget).toBe(budgetBefore);
    expect((await saveService.getMarket(saveId, meta.seatId))!.deferredTransfers).toEqual([]);
  }, 60_000);

  test("a player gone before the window opens: the deal falls through and the fee comes back", async () => {
    const club = (await aiClubs())[1]!;
    const target = midfielder(club);
    const fee = releaseClause(target);
    const before = (await human()).finances?.budget ?? 0;
    expect((await buy(club, target)).status).toBe(200);
    expect((await human()).finances?.budget).toBe(before - fee);
    // He is gone from his club (retired, say).
    const seller = (await saveService.getSquadById(saveId, club.id))!;
    await saveService.saveSquadById(saveId, { ...seller, players: seller.players.filter((p) => p.id !== target.id) });
    const seatMeta = (await saveService.getSeatMeta(saveId, meta.seatId))!;
    const res = await applyDueDeferredTransfers(saveService, saveId, meta.seatId, seatMeta, "2027-01-01");
    expect(res.moves).toEqual([]);
    expect(res.news.map((n) => n.kind)).toEqual(["deferred_cancelled"]);
    expect((await human()).finances?.budget).toBe(before);
    expect((await ledger()).some((e) => e.kind === "transfer_in" && e.amount === fee && e.ref?.stage === "deferred_refund")).toBe(true);
    expect((await saveService.getMarket(saveId, meta.seatId))!.deferredTransfers).toEqual([]);
  }, 60_000);
});
