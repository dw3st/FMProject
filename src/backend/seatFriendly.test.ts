import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { runningWorld } from "@/backend/testing/worldFixtures";
import { callApi } from "@/backend/worlds/worldTestUtils";
import { addSeat } from "@/backend/seats";
import { advanceOneDay } from "@/backend/advanceDay";

describe("friendly between two managers (9.5)", () => {
  let saveId = "";
  let seatB = "";
  let a: ReturnType<typeof devAutoLogin>;
  let b: ReturnType<typeof devAutoLogin>;

  beforeAll(async () => {
    a = devAutoLogin("sf-a@test.local");
    b = devAutoLogin("sf-b@test.local");
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    saveId = meta.id;
    await ownSolo(saveId, a.user.id);
    seatB = (await addSeat(saveId, {
      userId: b.user.id, clubId: "40",
      manager: { name: "Técnico B", nationalityIso: "br", backgroundId: "former-player" },
    })).seatId;
    await saveService.updateMeta(saveId, { world: runningWorld(a.user.id) });
  }, 300_000);

  afterAll(async () => {
    deleteSaveMembers(saveId);
    await saveService.deleteSave(saveId);
  });

  test("invite, accept in the inbox, played on the day", async () => {
    const post = (route: string, token: string, body: unknown, params: Record<string, string> = {}) =>
      callApi("POST", `/api/worlds/:saveId/${route}`, token, { params: { saveId, ...params }, body });
    expect((await post("friendlies", a.session.token, { seat: "nobody" })).status).toBe(404);
    const inv = await post("friendlies", a.session.token, { seat: seatB });
    expect(inv.status).toBe(200);
    const id = inv.json.friendly.id as string;
    const date = inv.json.friendly.date as string;
    expect((await post("friendlies", a.session.token, { seat: seatB })).status).toBe(409);
    // Only the invited manager accepts.
    expect((await post("friendlies/:friendlyId", a.session.token, { action: "accept" }, { friendlyId: id })).status).toBe(403);
    const inbox = await saveService.getInbox(saveId, seatB);
    expect(inbox.some((m) => m.category === "world" && m.kind === "friendly_invite")).toBe(true);
    expect((await post("friendlies/:friendlyId", b.session.token, { action: "accept" }, { friendlyId: id })).status).toBe(200);

    while ((await saveService.getMeta(saveId))!.currentDate! <= date) {
      const out = await advanceOneDay(saveService, saveId, {});
      expect(out.ok).toBe(true);
    }
    const played = (await saveService.getMeta(saveId))!.seatFriendlies!.find((f) => f.id === id)!;
    expect(played.status).toBe("played");
    expect(played.score).toBeDefined();
    const inboxB = await saveService.getInbox(saveId, seatB);
    expect(inboxB.some((m) => m.category === "friendly")).toBe(true);
  }, 600_000);
});
