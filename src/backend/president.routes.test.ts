import { afterAll, describe, expect, test } from "bun:test";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { OWN_CLUB_KEYS } from "@/Domain/ownClub/ownClub";

/** The president of a founded club: ticket price, deposit and own wage. */
describe("own club: president routes", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  }, 120_000);

  const call = (path: string, saveId: string, method: string, token: string, body?: unknown) => {
    const handler = apiRoutes[`/api/saves/:saveId/${path}` as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/${path}`, {
        method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: { saveId } },
    ));
  };

  test("price, deposit and wage", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const saveId = meta.id;
    const { user, session } = devAutoLogin("president@test.local");
    const seatId = await ownSolo(saveId, user.id);
    const token = session.token;

    // Not the president of the club he runs.
    expect((await call("ticket-price", saveId, "PUT", token, { mult: 1.5 })).status).toBe(409);
    expect(await (await call("president", saveId, "GET", token)).json()).toEqual({ president: false });

    const ach = await saveService.getAchievements(saveId, seatId);
    await saveService.writeAchievements(saveId, {
      ...ach, unlocked: Object.fromEntries(OWN_CLUB_KEYS.map((k) => [k, meta.currentDate!])),
    }, seatId);
    const view = await (await call("found-club", saveId, "GET", token)).json() as {
      countries: { country: string; leagues: { clubs: { id: string }[] }[] }[];
    };
    const target = view.countries.find((c) => c.country === "England")!.leagues[0]!.clubs[0]!.id;
    const founded = await call("found-club", saveId, "POST", token, {
      squadId: target, name: "Westlab FC", shortName: "wlb", colors: ["#112233", "#ffeedd"],
    });
    expect(founded.status).toBe(200);

    // Ticket price.
    expect((await call("ticket-price", saveId, "PUT", token, { mult: 2.5 })).status).toBe(400);
    expect((await call("ticket-price", saveId, "PUT", token, { mult: 1.25 })).status).toBe(400);
    const cheap = await call("ticket-price", saveId, "PUT", token, { mult: 0.5 });
    expect(cheap.status).toBe(200);
    const pricey = await call("ticket-price", saveId, "PUT", token, { mult: 2 });
    expect(pricey.status).toBe(200);
    const pj = await pricey.json() as { mult: number; projection: { attendance: number } | null };
    const cj = await cheap.json() as { projection: { attendance: number } | null };
    expect(pj.mult).toBe(2);
    expect((await saveService.getSquadById(saveId, target))!.ticketPriceMult).toBe(2);
    if (pj.projection && cj.projection) expect(pj.projection.attendance).toBeLessThanOrEqual(cj.projection.attendance);

    // Deposit.
    await saveService.updateSeat(saveId, seatId, { managerEarnings: 50_000, managerSpent: 0 });
    expect((await call("club-deposit", saveId, "POST", token, { amount: 500 })).status).toBe(400);
    expect((await call("club-deposit", saveId, "POST", token, { amount: 10_000_000 })).status).toBe(409);
    const before = (await saveService.getSquadById(saveId, target))!.finances!.budget;
    const dep = await call("club-deposit", saveId, "POST", token, { amount: 20_000 });
    expect(dep.status).toBe(200);
    const after = (await saveService.getSquadById(saveId, target))!;
    expect(after.finances!.budget).toBe(before + 20_000);
    expect((await saveService.getSeat(saveId, seatId))!.managerSpent).toBe(20_000);
    const ledger = (await saveService.getLedger(saveId, (await saveService.getSeatMeta(saveId, seatId))!.currentDate ? await seasonOf(saveId, seatId) : 0, seatId)) ?? [];
    expect(ledger.some((e) => e.kind === "club_change" && e.ref?.stage === "deposit" && e.amount === 20_000)).toBe(true);
    expect(ledger.reduce((s, e) => s + e.amount, 0)).toBe(after.finances!.budget);

    // Wage.
    const info = await (await call("president", saveId, "GET", token)).json() as { president: boolean; wageCap: number };
    expect(info.president).toBe(true);
    expect((await call("manager-wage", saveId, "PUT", token, { wage: info.wageCap + 1 })).status).toBe(400);
    expect((await call("manager-wage", saveId, "PUT", token, { wage: 1.5 })).status).toBe(400);
    expect((await call("manager-wage", saveId, "PUT", token, { wage: 0 })).status).toBe(200);
    expect((await saveService.getSeatMeta(saveId, seatId))!.managerContract?.wage).toBe(0);
  }, 300_000);
});

async function seasonOf(saveId: string, seatId: string): Promise<number> {
  const m = (await saveService.getSeatMeta(saveId, seatId))!;
  const { ledgerSeason } = await import("@/backend/staffRoutes");
  return ledgerSeason(saveService, saveId, m.leagueSlug, m.currentDate ?? "");
}
