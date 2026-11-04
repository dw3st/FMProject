import { afterAll, describe, expect, test } from "bun:test";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { apiRoutes } from "@/backend/routes";
import { saveService } from "@/backend/SaveService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addDays } from "@/Domain/dates";

/** The manager negotiates his renewal: the board answers, costs confidence when he overreaches, and signs within its limits. */
describe("renewal negotiation route", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("counter, final offer, signing", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("renewal-negotiation@test.local");
    await ownSolo(saveId, user.id);
    const seatId = (await saveService.listSeats(saveId))[0]!.seatId;
    const seat = (await saveService.getSeatMeta(saveId, seatId))!;
    const date = seat.currentDate!;
    const wage = seat.managerContract!.wage;
    await saveService.updateSeat(saveId, seatId, {
      managerRenewal: { offeredOn: date, expires: addDays(date, 60), wage, seasons: 2 },
      board: { ...seat.board!, board: 60 },
    });

    const post = async (body: unknown) => {
      const handler = apiRoutes["/api/saves/:saveId/manager-contract" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
      const res = await handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/manager-contract`, {
          method: "POST", headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" }, body: JSON.stringify(body),
        }),
        { params: { saveId } },
      ));
      return { status: res.status, data: await res.json() as Record<string, any> };
    };

    expect((await post({ wage: "x", seasons: 2 })).status).toBe(400);
    // Far above the limit: the board answers with its maximum and loses confidence.
    const first = await post({ wage: wage * 10, seasons: 3 });
    expect(first.data.status).toBe("countered");
    expect(first.data.offer.wage).toBeLessThan(wage * 10);
    expect(first.data.offer.seasons).toBe(2);
    expect((await saveService.getSeat(saveId, seatId))!.board!.board).toBe(59);
    expect((await post({ wage: wage * 10, seasons: 3 })).data.status).toBe("countered");
    const third = await post({ wage: wage * 10, seasons: 3 });
    expect(third.status).toBe(409);
    expect(third.data.error).toBe("noRounds");

    // Within what is on the table: signed, the wage and the length change, the offer is gone.
    const until = seat.managerContract!.until;
    const signed = await post({ wage, seasons: 1 });
    expect(signed.data.status).toBe("renewed");
    const after = (await saveService.getSeatMeta(saveId, seatId))!;
    expect(after.managerContract!.wage).toBe(wage);
    expect(after.managerContract!.until > until).toBe(true);
    expect(after.managerRenewal).toBeUndefined();
    expect((await post({ wage, seasons: 1 })).status).toBe(409);
  }, 60_000);
});
