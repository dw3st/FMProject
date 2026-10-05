import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { contractDemand } from "@/Domain/contracts/contracts";

/** Etapa 23 (`.claude/rules/game/morale.md`): morale routes and the day advance. */
describe("morale routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("owner-only, talks, promises, squad status, renewal and sell-list hooks, day advance, noClub", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("morale-route@test.local");
    const other = devAutoLogin("morale-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const call = (key: string, url: string, method: string, token: string, params: Record<string, string>, body?: unknown) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost${url}`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
        { params },
      ));
    };
    const getMorale = (token = session.token) =>
      call("/api/saves/:saveId/morale", `/api/saves/${saveId}/morale`, "GET", token, { saveId });
    const talk = (playerId: string, body: unknown) =>
      call("/api/saves/:saveId/talks/:playerId", `/api/saves/${saveId}/talks/${playerId}`, "POST", session.token, { saveId, playerId }, body);
    const human = async () => (await saveService.getSquadById(saveId, "33"))!;

    // createSave starts the human club at 65 with nothing open.
    const start = await human();
    expect(start.moraleClub).toEqual({ talks: [], promises: [] });
    expect(start.players.every((p) => p.morale === MORALE.NEUTRAL)).toBe(true);

    expect((await getMorale(other.session.token)).status).toBe(404);
    const view = await (await getMorale()).json() as any;
    expect(view.players).toHaveLength(start.players.length);
    expect(view.players.filter((p: any) => p.status === "key")).toHaveLength(MORALE.KEY_COUNT);

    // Free talk: praise once a month; a promise needs a talk.
    const pid = start.players[5]!.id;
    const praise = await (await talk(pid, { answer: "praise" })).json() as any;
    expect(praise.change).toBe(MORALE.PRAISE);
    expect((await (await talk(pid, { answer: "demand" })).json() as any).noEffect).toBe(true);
    expect((await talk(pid, { answer: "promise_minutes", minutes: 3 })).status).toBe(400);
    expect((await talk("nobody", { answer: "praise" })).status).toBe(404);

    // Squad status.
    const statusCall = (playerId: string, body: unknown) =>
      call("/api/saves/:saveId/players/:playerId/squad-status", `/api/saves/${saveId}/players/${playerId}/squad-status`, "PUT", session.token, { saveId, playerId }, body);
    expect((await statusCall(pid, { status: "boss" })).status).toBe(400);
    expect(await (await statusCall(pid, { status: "key" })).json()).toEqual({ status: "key", manual: true });
    expect((await human()).players.find((p) => p.id === pid)!.squadStatus).toBe("key");
    expect((await (await statusCall(pid, { status: null })).json() as any).manual).toBe(false);

    // An open wants_move talk answered with a sale promise lists him as requested.
    const mover = start.players[8]!;
    const s1 = await human();
    await saveService.saveSquadById(saveId, {
      ...s1, moraleClub: { talks: [{ id: "t1", playerId: mover.id, playerName: mover.name, reason: "wants_move", date: meta.currentDate!, expires: "2099-01-01" }], promises: [] },
    });
    const sale = await (await talk(mover.id, { answer: "promise_sale", days: 45 })).json() as any;
    expect(sale.promise.kind).toBe("sale");
    expect((await saveService.getMarket(saveId))!.playerSellList.find((c) => c.playerId === mover.id)?.requested).toBe(true);

    // Listing an unasked player costs −8.
    const listed = start.players[10]!;
    const before = (await human()).players.find((p) => p.id === listed.id)!.morale!;
    const sell = await call("/api/saves/:saveId/sell-list", `/api/saves/${saveId}/sell-list`, "POST", session.token, { saveId }, { playerId: listed.id });
    expect(sell.status).toBe(200);
    expect((await human()).players.find((p) => p.id === listed.id)!.morale).toBe(before + MORALE.LISTED_UNASKED);

    // A furious player refuses to renew, unless a renewal promise is open; then it is kept.
    const angry = start.players.find((p) => p.age <= 27 && p.id !== pid && p.id !== mover.id && p.id !== listed.id)!;
    const s2 = await human();
    await saveService.saveSquadById(saveId, { ...s2, players: s2.players.map((p) => (p.id === angry.id ? { ...p, morale: 10 } : p)) });
    const renew = (wage: number) =>
      call("/api/saves/:saveId/players/:playerId/renew", `/api/saves/${saveId}/players/${angry.id}/renew`, "POST", session.token, { saveId, playerId: angry.id }, { wage, years: 1 });
    const demand = contractDemand({ ...angry, morale: 10 }, await human(), meta.currentDate!);
    expect((await (await renew(demand)).json() as any).error).toBe("unhappy");
    const s3 = await human();
    await saveService.saveSquadById(saveId, {
      ...s3, moraleClub: { ...s3.moraleClub!, talks: [...s3.moraleClub!.talks, { id: "t2", playerId: angry.id, playerName: angry.name, reason: "contract", date: meta.currentDate!, expires: "2099-01-01" }] },
    });
    const promised = await (await talk(angry.id, { answer: "promise_renewal" })).json() as any;
    expect(promised.openRenewal).toBe(true);
    expect((await renew(demand)).status).toBe(200);
    const afterRenew = await human();
    expect(afterRenew.moraleClub!.promises.some((p) => p.playerId === angry.id)).toBe(false);
    expect(afterRenew.players.find((p) => p.id === angry.id)!.morale)
      .toBe(10 + MORALE.PROMISE_MADE + MORALE.RENEWAL_ACCEPTED + MORALE.PROMISE_KEPT);

    // The day advance keeps morale in 0..100 with a trend.
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const day = await human();
    expect(day.players.every((p) => p.morale! >= 0 && p.morale! <= 100 && (p.moraleLog?.trend.length ?? 0) >= 1)).toBe(true);

    // Without a club: 409.
    await saveService.updateMeta(saveId, { clubId: "" });
    expect((await getMorale()).status).toBe(409);
  }, 120_000);
});
