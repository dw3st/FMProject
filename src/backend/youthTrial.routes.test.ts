import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addDays } from "@/Domain/dates";
import { overallAvg } from "@/Domain/playerRating";
import { runTrialDay } from "@/backend/youthTrialWorld";

describe("youth trial routes", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("schedule (paid), limits, cancel, the trial day, blurred results, sign into the academy", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("trial-route@test.local");
    const seatId = await ownSolo(saveId, user.id);
    const call = (key: string, path: string, method: string, body?: unknown, params: Record<string, string> = {}) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost${path}`, {
          method, headers: { cookie: `fs_session=${session.token}`, "Content-Type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId, ...params } },
      ));
    };
    const base = "/api/saves/:saveId/youth/trials";
    const path = `/api/saves/${saveId}/youth/trials`;
    const today = meta.currentDate!;

    const view0 = await (await call(base, path, "GET")).json() as any;
    expect(view0.left).toBe(2);
    expect(view0.costs.large).toBeGreaterThan(view0.costs.small);

    expect((await call(base, path, "POST", { age: 16, size: "small", date: addDays(today, 3) })).status).toBe(400);
    expect((await call(base, path, "POST", { age: 14, size: "small", date: addDays(today, 20) })).status).toBe(400);

    const ok = await call(base, path, "POST", { age: 16, size: "small", date: addDays(today, 14) });
    expect(ok.status).toBe(200);
    const v1 = await ok.json() as any;
    expect(v1.scheduled.date).toBe(addDays(today, 14));
    expect(v1.left).toBe(1);
    expect((await call(base, path, "POST", { age: 16, size: "small", date: addDays(today, 20) })).status).toBe(409);

    const ref = (await saveService.resolveSquadId(saveId, meta.clubId))!;
    const leagueYear = (await saveService.getLeagueMeta(saveId, ref.leagueSlug))!.year;
    const ledger = await saveService.getLedger(saveId, leagueYear, seatId);
    expect(ledger.some((e) => e.kind === "scouting" && e.ref?.stage === "trial" && e.amount === -v1.scheduled.cost)).toBe(true);

    // Cancel, then schedule the second (last) of the season.
    expect((await call(`${base}/:trialId`, `${path}/nope`, "DELETE", undefined, { trialId: "nope" })).status).toBe(404);
    const cancelled = await (await call(`${base}/:trialId`, `${path}/${v1.scheduled.id}`, "DELETE", undefined, { trialId: v1.scheduled.id })).json() as any;
    expect(cancelled.scheduled).toBeNull();
    expect(cancelled.left).toBe(1);
    const v2 = await (await call(base, path, "POST", { age: 17, size: "medium", date: addDays(today, 15) })).json() as any;
    expect(v2.left).toBe(0);

    // The trial day: results appear (what the day advance calls).
    const seat = (await saveService.getSeatMeta(saveId, seatId))!;
    const squad = (await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug))!;
    const day = runTrialDay({ saveId, seatId, date: v2.scheduled.date, state: seat.youthTrials, squad })!;
    expect(day.ran!.count).toBe(v2.counts.medium);
    await saveService.updateSeat(saveId, seatId, { youthTrials: day.state });

    const v3 = await (await call(base, path, "GET")).json() as any;
    expect(v3.results.players).toHaveLength(day.ran!.count);
    const real = day.state.results!.players;
    const exact = v3.results.players.filter((r: any) => {
      const p = real.find((x) => x.id === r.player.id)!;
      return JSON.stringify(r.player.stats) === JSON.stringify(p.stats);
    });
    expect(exact.length).toBe(0);
    for (const r of v3.results.players) {
      expect(r.player.age).toBe(17);
      expect(r.overall[0]).toBeLessThanOrEqual(r.overall[1]);
      expect(overallAvg(real.find((x) => x.id === r.player.id)!)).toBeGreaterThan(0);
    }

    const pick = real.slice(0, 2).map((p) => p.id);
    expect((await call(`${base}/sign`, `${path}/sign`, "POST", { ids: ["nope"] })).status).toBe(400);
    const signed = await (await call(`${base}/sign`, `${path}/sign`, "POST", { ids: pick })).json() as any;
    expect(signed.signed).toEqual(pick);
    const after = (await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug))!;
    const joined = after.youth!.filter((p) => pick.includes(p.id));
    expect(joined).toHaveLength(2);
    expect(joined[0]!.trialOf?.seatId).toBe(seatId);
    expect(joined[0]!.contract).toBeDefined();
    expect(signed.view.results.players).toHaveLength(real.length - 2);
  }, 60_000);
});
