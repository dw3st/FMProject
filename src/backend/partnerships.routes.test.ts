import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { partnershipDay } from "@/backend/partnershipWorld";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { addDays } from "@/Domain/dates";
import type { SeatMeta } from "@/backend/SaveService";

type Params = Record<string, string>;

describe("club partnerships (report 648035a3)", () => {
  let meta: SeatMeta;
  let saveId = "";
  let token = "";
  const req = (path: string, method: string, body: unknown, params: Params) => Object.assign(
    new Request(`http://localhost${path}`, {
      method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params },
  ) as Request & { params: Params };
  const base = () => `/api/saves/${saveId}/partnerships`;

  beforeAll(async () => {
    meta = await saveService.createSave({
      leagueSlug: "of_championship", leagueName: "Championship", clubId: "39", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("partnerships@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
  }, 120_000);

  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("a parent club above signs, offers a young player on loan, and the offer can be taken", async () => {
    const get = await apiRoutes["/api/saves/:saveId/partnerships"](req(base(), "GET", undefined, { saveId }));
    expect(get.status).toBe(200);
    const view = await get.json() as { candidates: { parent: { clubId: string; division: number; refusal: string | null }[] } };
    const parentPick = view.candidates.parent.find((c) => c.refusal === null && c.division === 1)!;
    expect(parentPick).toBeDefined();
    // A club of the same division is refused as a parent.
    expect(view.candidates.parent.filter((c) => c.division === 2).every((c) => c.refusal !== null)).toBe(true);

    const sign = await apiRoutes["/api/saves/:saveId/partnerships"](req(base(), "POST", { kind: "parent", clubId: parentPick.clubId }, { saveId }));
    expect(sign.status).toBe(200);
    const again = await apiRoutes["/api/saves/:saveId/partnerships"](req(base(), "POST", { kind: "parent", clubId: parentPick.clubId }, { saveId }));
    expect(again.status).toBe(409);

    // No offer yet: answering is closed.
    const offerPath = `${base()}/parent/offer`;
    expect((await apiRoutes["/api/saves/:saveId/partnerships/parent/offer"](req(offerPath, "POST", { accept: true }, { saveId }))).status).toBe(409);

    // A Monday with the window open: the parent offers someone (or nobody fits); force an offer when nobody did.
    const seat = (await saveService.getSeatMeta(saveId, meta.seatId))!;
    let monday = seat.currentDate!;
    while (new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
    const day = await partnershipDay(saveService, saveId, {
      seatId: meta.seatId, meta: seat, date: monday, windowOpen: true, windowUntil: addDays(monday, 20), humans: new Set([seat.clubId]),
    });
    let partnerships = day.partnerships ?? seat.partnerships!;
    if (!partnerships.parent?.pending) {
      const parent = (await saveService.getSquadById(saveId, parentPick.clubId))!;
      const starters = new Set(autoLineupDefaultFormation(parent));
      const young = parent.players.find((p) => !starters.has(p.id) && !p.loan)!;
      partnerships = { ...partnerships, parent: { ...partnerships.parent!, pending: {
        id: "test-offer", playerId: young.id, playerName: young.name, wageShare: 0.5,
        until: addDays(seat.currentDate!, 200), expires: addDays(seat.currentDate!, 5),
      } } };
    } else {
      expect(day.news.some((n) => n.kind === "partnership_offer")).toBe(true);
      // Offers are dated on the Monday; keep it answerable today.
      partnerships = { ...partnerships, parent: { ...partnerships.parent, pending: { ...partnerships.parent.pending, expires: addDays(seat.currentDate!, 5) } } };
    }
    await saveService.updateSeat(saveId, meta.seatId, { partnerships });
    const playerId = partnerships.parent!.pending!.playerId;

    const taken = await apiRoutes["/api/saves/:saveId/partnerships/parent/offer"](req(offerPath, "POST", { accept: true }, { saveId }));
    expect(taken.status).toBe(200);
    const human = (await saveService.getSquadById(saveId, seat.clubId))!;
    const arrived = human.players.find((p) => p.id === playerId);
    expect(arrived?.loan?.fromClubId).toBe(parentPick.clubId);
    expect((await saveService.getSeatMeta(saveId, meta.seatId))!.partnerships?.parent?.pending).toBeUndefined();

    const end = await apiRoutes["/api/saves/:saveId/partnerships/:kind"](req(`${base()}/parent`, "DELETE", undefined, { saveId, kind: "parent" }));
    expect(end.status).toBe(200);
    expect((await apiRoutes["/api/saves/:saveId/partnerships/:kind"](req(`${base()}/parent`, "DELETE", undefined, { saveId, kind: "parent" }))).status).toBe(409);
    // The loan goes on after the partnership ends.
    expect((await saveService.getSquadById(saveId, seat.clubId))!.players.some((p) => p.id === playerId)).toBe(true);
  }, 120_000);
});
