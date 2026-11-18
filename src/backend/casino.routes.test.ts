/** The manager's casino (`.claude/rules/game/casino.md`): the routes, the wallet and the crash round. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { setCasinoClock } from "@/backend/casinoRoutes";
import { apiRoutes } from "@/backend/routes";
import { saveService } from "@/backend/SaveService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { secondsTo } from "@/Domain/casino/crash";

describe("casino", () => {
  let saveId = "";
  let seatId = "";
  let token = "";
  let now = 1_000_000;
  const call = async (path: string, method: string, body?: unknown) => {
    const handler = apiRoutes[`/api/saves/:saveId/casino${path}` as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
    const res = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/casino${path}`, {
        method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { params: { saveId } },
    ));
    return { status: res.status, data: await res.json() as any };
  };

  beforeAll(async () => {
    setCasinoClock(() => now);
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("casino@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
    seatId = (await saveService.listSeats(saveId))[0]!.seatId;
    await saveService.updateSeat(saveId, seatId, { managerEarnings: 1_000_000 });
  }, 270_000);
  afterAll(async () => {
    setCasinoClock(null);
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("the view never carries the salt; limits from the wallet", async () => {
    const r = await call("", "GET");
    expect(r.status).toBe(200);
    expect(r.data.wallet).toBe(1_000_000);
    expect(r.data.limits.maxStake).toBe(20_000);
    expect(r.data.limits.lossCap).toBe(100_000);
    expect(JSON.stringify(r.data)).not.toContain("salt");
  });

  test("slot spins move casinoNet and the wallet; refuses a bad stake and machine", async () => {
    expect((await call("/slot", "POST", { machine: "roulette", stake: 1_000 })).data.error).toBe("invalidMachine");
    expect((await call("/slot", "POST", { machine: "classic", stake: 50_000 })).data.error).toBe("stakeTooHigh");
    expect((await call("/slot", "POST", { machine: "classic", stake: 1_000, spins: 11 })).status).toBe(400);
    const r = await call("/slot", "POST", { machine: "stadium", stake: 1_000, spins: 10 });
    expect(r.status).toBe(200);
    expect(r.data.results).toHaveLength(10);
    const won = r.data.results.reduce((s: number, x: { payout: number }) => s + x.payout, 0);
    const seat = await saveService.getSeatMeta(saveId, seatId);
    expect(seat!.casinoNet).toBe(won - 10_000);
    expect(seat!.managerEarnings).toBe(1_000_000);
    expect(r.data.view.wallet).toBe(1_000_000 + won - 10_000);
    expect(r.data.view.limits.rounds).toBe(10);
  });

  test("a crash round: secret point, cash-out by server time, one round at a time", async () => {
    const bet = await call("/crash/bet", "POST", { stake: 10_000 });
    expect(bet.status).toBe(200);
    expect(JSON.stringify(bet.data)).not.toContain("\"crash\"");
    expect((await call("/crash/bet", "POST", { stake: 10_000 })).data.error).toBe("roundOpen");
    const crash = (await saveService.getCasino(saveId, seatId))!.open!.crash;
    const target = crash > 1.2 ? 1.1 : null;
    if (target) now += Math.ceil(secondsTo(target) * 1000) + 5;
    else now += Math.ceil(secondsTo(crash) * 1000) + 5;
    const out = await call("/crash/cashout", "POST", { roundId: bet.data.roundId });
    expect(out.status).toBe(200);
    expect(out.data.crash).toBe(crash);
    if (target) {
      expect(out.data.won).toBe(true);
      expect(out.data.multiplier).toBeLessThan(crash);
      expect(out.data.payout).toBe(Math.floor(10_000 * out.data.multiplier));
    } else expect(out.data.crashed).toBe(true);
    expect((await call("/crash/cashout", "POST", { roundId: "nope" })).data.error).toBe("noRound");
  });

  test("an unclaimed round is settled when its time is over, paying only the auto cash-out", async () => {
    const bet = await call("/crash/bet", "POST", { stake: 5_000, autoCashOut: 1.01 });
    const crash = (await saveService.getCasino(saveId, seatId))!.open!.crash;
    now += Math.ceil(secondsTo(crash) * 1000) + 10;
    const view = await call("", "GET");
    expect(view.data.open).toBeNull();
    const last = view.data.history[0];
    expect(last.id).toBe(bet.data.roundId);
    expect(last.payout).toBe(crash > 1.01 ? Math.floor(5_000 * 1.01) : 0);
  });
});
