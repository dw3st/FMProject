import { afterAll, describe, expect, test } from "bun:test";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { advanceOneDay } from "@/backend/advanceDay";
import { OWN_CLUB_KEYS } from "@/Domain/ownClub/ownClub";

/** The president of a founded club has no board: nobody warns, praises, gives an ultimatum or sacks him. */
describe("own club: president in the day pipeline", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  }, 120_000);

  const call = (saveId: string, method: string, token: string, body?: unknown) => {
    const handler = apiRoutes["/api/saves/:saveId/found-club" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/found-club`, {
        method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: { saveId } },
    ));
  };

  test("board at the floor, sacking on: never sacked, no board warning", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], sackingEnabled: true,
    });
    created.push(meta.id);
    const saveId = meta.id;
    const { user, session } = devAutoLogin("own-club-day@test.local");
    const seatId = await ownSolo(saveId, user.id);
    const ach = await saveService.getAchievements(saveId, seatId);
    await saveService.writeAchievements(saveId, {
      ...ach, unlocked: Object.fromEntries(OWN_CLUB_KEYS.map((k) => [k, meta.currentDate!])),
    }, seatId);
    const view = await (await call(saveId, "GET", session.token)).json() as {
      countries: { country: string; leagues: { clubs: { id: string }[] }[] }[];
    };
    const target = view.countries.find((c) => c.country === "England")!.leagues[0]!.clubs[0]!.id;
    const res = await call(saveId, "POST", session.token, {
      squadId: target, name: "Westlab FC", shortName: "wlb", colors: ["#112233", "#ffeedd"],
    });
    expect(res.status).toBe(200);

    const seat = (await saveService.getSeatMeta(saveId, seatId))!;
    await saveService.updateSeat(saveId, seatId, { board: { ...seat.board!, board: 0 } });
    for (let i = 0; i < 3; i++) {
      const out = await advanceOneDay(saveService, saveId);
      expect(out.ok).toBe(true);
    }
    const after = (await saveService.getSeatMeta(saveId, seatId))!;
    expect(after.clubId).toBe(target);
    expect(after.unemployed).toBeUndefined();
    const inbox = await saveService.getInbox(saveId, seatId);
    expect(inbox.some((m) => m.category === "board"
      && ["warning", "ultimatum", "sacked"].includes((m as { kind: string }).kind))).toBe(false);
  }, 300_000);
});
