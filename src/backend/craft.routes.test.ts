import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { MATERIALS } from "@/Domain/craft/craftConfig";

/** Workshop, shop and stock routes (spec 2026-11-18-club-craft). */
describe("craft routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("view, buy, queue, cancel, recycle, noClub", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("craft-route@test.local");
    const other = devAutoLogin("craft-other@test.local");
    await ownSolo(saveId, user.id);

    const call = (path: string, method: string, token: string, body?: unknown, params: Record<string, string> = {}) => {
      const key = `/api/saves/:saveId/craft${path.replace(/\/job_\d+$/, "/:jobId")}`;
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/craft${path}`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId, ...params } },
      ));
    };

    expect((await call("", "GET", other.session.token)).status).toBe(404);

    // 1. The initial state: workshop 1, two benches, materials in the stock.
    const v0 = await (await call("", "GET", session.token)).json() as any;
    expect(v0.workshop).toBe(1);
    expect(v0.benches).toBe(2);
    const units = (stock: any) => MATERIALS.reduce((n, m) => n + stock.materials[m].standard + stock.materials[m].good, 0);
    expect(units(v0.stock)).toBeGreaterThan(0);
    expect(v0.shop).toHaveLength(MATERIALS.length);

    // 2. Buying: the stock grows, the ledger gets a negative `facilities` line and still sums to the balance.
    const bought = await call("/buy", "POST", session.token, { items: [{ material: "steel", supplier: "good", qty: 3 }] });
    expect(bought.status).toBe(200);
    const b = await bought.json() as any;
    expect(b.total).toBeGreaterThan(0);
    expect(b.view.stock.materials.steel.good).toBe(v0.stock.materials.steel.good + 3);
    const seasons = await saveService.listLedgerSeasons(saveId, meta.seatId);
    const ledger = (await Promise.all(seasons.map((s) => saveService.getLedger(saveId, s, meta.seatId)))).flat();
    const line = ledger.find((e) => e.kind === "facilities" && e.ref?.facility === "materials")!;
    expect(line.amount).toBe(-b.total);
    const squad = (await saveService.getSquadById(saveId, "33"))!;
    expect(ledger.reduce((s, e) => s + e.amount, 0)).toBe(squad.finances!.budget);
    expect(squad.facilities!.craft!.stock.materials.steel.good).toBe(b.view.stock.materials.steel.good);

    // 3. Invalid orders.
    expect((await call("/buy", "POST", session.token, { items: [] })).status).toBe(400);
    expect((await call("/buy", "POST", session.token, { items: [{ material: "gold", supplier: "good", qty: 1 }] })).status).toBe(400);
    expect((await call("/buy", "POST", session.token, { items: [{ material: "steel", supplier: "good", qty: 1.5 }] })).status).toBe(400);

    // 4. Queue: a locked recipe, an unknown component, then a beam.
    const locked = await call("/queue", "POST", session.token, { component: "gymKit", qty: 1 });
    expect(locked.status).toBe(400);
    expect(((await locked.json()) as any).error).toBe("locked");
    expect((await call("/queue", "POST", session.token, { component: "rocket", qty: 1 })).status).toBe(400);
    const queued = await call("/queue", "POST", session.token, { component: "beam", qty: 1 });
    expect(queued.status).toBe(200);
    const q = await queued.json() as any;
    expect(q.queue).toHaveLength(1);
    expect(q.stock.materials.steel.standard + q.stock.materials.steel.good).toBe(
      b.view.stock.materials.steel.standard + b.view.stock.materials.steel.good - 3,
    );

    // 5. Cancel before it starts: the queue empties and the materials come back.
    const jobId = q.queue[0].id as string;
    expect((await call(`/queue/${jobId}`, "POST", session.token, { action: "jump" }, { jobId })).status).toBe(400);
    expect((await call("/queue/job_999", "POST", session.token, { action: "cancel" }, { jobId: "job_999" })).status).toBe(404);
    const cancelled = await call(`/queue/${jobId}`, "POST", session.token, { action: "cancel" }, { jobId });
    expect(cancelled.status).toBe(200);
    const c = await cancelled.json() as any;
    expect(c.queue).toHaveLength(0);
    expect(c.stock.materials.steel.good).toBe(b.view.stock.materials.steel.good);

    // 6. Recycle: the gym goes down a level and gives components back.
    const gymBefore = squad.facilities!.items.gym.level;
    const rec = await call("/recycle", "POST", session.token, { item: "gym" });
    expect(rec.status).toBe(200);
    const r = await rec.json() as any;
    expect(Object.keys(r.returned).length).toBeGreaterThan(0);
    expect((await saveService.getSquadById(saveId, "33"))!.facilities!.items.gym.level).toBe(gymBefore - 1);
    expect((await call("/recycle", "POST", session.token, { item: "spaceship" })).status).toBe(400);

    // Workshop upgrade without the components.
    expect((await call("/workshop", "POST", session.token)).status).toBe(409);

    // 7. No club: 409 noClub.
    await saveService.updateSeat(saveId, meta.seatId, { clubId: "" });
    const none = await call("", "GET", session.token);
    expect(none.status).toBe(409);
    expect(((await none.json()) as any).error).toBe("noClub");
  }, 120_000);
});
