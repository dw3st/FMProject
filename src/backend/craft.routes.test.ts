import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { MATERIALS } from "@/Domain/craft/craftConfig";
import { deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { addSeat } from "@/backend/seats";
import { callApi, createMultiWorld } from "@/backend/worlds/worldTestUtils";
import type { Squad } from "@/types/playerTypes";

async function editHuman(saveId: string, clubId: string, fn: (s: Squad) => Squad) {
  const entry = (await saveService.getSquadIndex(saveId)).byId(clubId)!;
  const sq = (await saveService.getSquad(saveId, entry.leagueSlug, entry.stem))!;
  await saveService.saveSquad(saveId, entry.leagueSlug, entry.stem, fn(sq));
}

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

describe("craft routes: good supplier share, done jobs, recycle limits, lobby, seats", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) { deleteSaveMembers(id); await saveService.deleteSave(id).catch(() => {}); }
  }, 120_000);

  test("goodShare, cancel of a done job, recycle at level 1 and on a busy item, a second seat", async () => {
    const a = devAutoLogin("craft-a@test.local");
    const b = devAutoLogin("craft-b@test.local");
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    const saveId = meta.id;
    created.push(saveId);
    await ownSolo(saveId, a.user.id);
    const p = { saveId };
    const post = (route: string, token: string, body?: unknown, params: Record<string, string> = {}) =>
      callApi("POST", `/api/saves/:saveId/craft${route}`, token, { params: { ...p, ...params }, body });

    // Good steel in the stock next to the initial standard one.
    expect((await post("/buy", a.session.token, { items: [{ material: "steel", supplier: "good", qty: 9 }] })).status).toBe(200);
    // goodShare 0: standard first; 1: good first; absent: good first (bought on purpose).
    const zero = await post("/queue", a.session.token, { component: "beam", qty: 1, goodShare: 0 });
    expect(zero.status).toBe(200);
    expect(zero.json.queue[0].goodShare).toBe(0);
    const one = await post("/queue", a.session.token, { component: "beam", qty: 1, goodShare: 1 });
    expect(one.json.queue[1].goodShare).toBeCloseTo(3 / 4);
    expect(one.json.stock.materials.steel.good).toBe(6);
    const auto = await post("/queue", a.session.token, { component: "beam", qty: 1 });
    expect(auto.json.queue[2].goodShare).toBeCloseTo(3 / 4);
    expect(auto.json.stock.materials.steel.good).toBe(3);
    for (const bad of [-0.1, 1.5, "half"]) {
      expect((await post("/queue", a.session.token, { component: "beam", qty: 1, goodShare: bad })).status).toBe(400);
    }

    // A job finished on its day cannot be cancelled any more.
    const date = (await saveService.getMeta(saveId))!.currentDate!;
    await editHuman(saveId, "33", (sq) => ({
      ...sq, facilities: { ...sq.facilities!, craft: { ...sq.facilities!.craft!, queue: sq.facilities!.craft!.queue.map((j, i) => (i === 0 ? { ...j, startedOn: date, doneOn: date } : j)) } },
    }));
    const doneId = zero.json.queue[0].id as string;
    expect(await post(`/queue/:jobId`, a.session.token, { action: "cancel" }, { jobId: doneId })).toMatchObject({ status: 409, json: { error: "done" } });

    // Recycle: level 1 → 400 minLevel; an item with a works running → 409 busy.
    await editHuman(saveId, "33", (sq) => ({
      ...sq, facilities: {
        ...sq.facilities!,
        items: { ...sq.facilities!.items, gym: { ...sq.facilities!.items.gym, level: 1 } },
        projects: [{ id: "fac_t", kind: "repair", item: "pool", to: 100, start: date, end: "2099-01-01", cost: 0, boardShare: 0, instalments: 0, paid: 0, craft: true }],
      },
    }));
    expect(await post("/recycle", a.session.token, { item: "gym" })).toMatchObject({ status: 400, json: { error: "minLevel" } });
    expect(await post("/recycle", a.session.token, { item: "pool" })).toMatchObject({ status: 409, json: { error: "busy" } });

    // A second seat sees and changes only its own club's stock.
    const seatB = (await addSeat(saveId, {
      userId: b.user.id, clubId: "40", manager: { name: "Técnico B", nationalityIso: "br", backgroundId: "former-player" },
    })).seatId;
    expect(seatB).toBeTruthy();
    const aStock = (await saveService.getSquadById(saveId, "33"))!.facilities!.craft!.stock;
    const bView = await callApi("GET", "/api/saves/:saveId/craft", b.session.token, { params: p });
    expect(bView.status).toBe(200);
    expect(bView.json.queue).toEqual([]);
    expect(bView.json.stock.materials.steel.good).toBe(0);
    expect((await post("/buy", b.session.token, { items: [{ material: "steel", supplier: "good", qty: 4 }] })).status).toBe(200);
    expect(await post(`/queue/:jobId`, b.session.token, { action: "cancel" }, { jobId: one.json.queue[1].id })).toMatchObject({ status: 404 });
    expect((await saveService.getSquadById(saveId, "33"))!.facilities!.craft!.stock).toEqual(aStock);
    expect((await saveService.getSquadById(saveId, "40"))!.facilities!.craft!.stock.materials.steel.good).toBe(4);
  }, 300_000);

  test("a world in the lobby cannot buy", async () => {
    const owner = devAutoLogin("craft-lobby@test.local");
    const saveId = (await createMultiWorld(owner.session.token)).json.id as string;
    created.push(saveId);
    const r = await callApi("POST", "/api/saves/:saveId/craft/buy", owner.session.token, {
      params: { saveId }, body: { items: [{ material: "steel", supplier: "good", qty: 1 }] },
    });
    expect(r).toMatchObject({ status: 409, json: { error: "lobby" } });
  }, 300_000);
});
