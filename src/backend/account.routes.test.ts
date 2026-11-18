import { afterAll, describe, expect, test } from "bun:test";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { befriend, setNickname } from "@/backend/social/socialStore";
import { syncSaveCareers } from "@/backend/account/accountWorld";
import { deleteWorld } from "@/backend/worlds/worldLifecycle";
import type { AccountProfileView } from "@/types/accountTypes";

function call(path: string, token: string, init: RequestInit = {}) {
  const key = path.split("?")[0]!;
  const route = apiRoutes[key as keyof typeof apiRoutes] as Record<string, (r: Request) => Promise<Response>>;
  const method = init.method ?? "GET";
  return route[method]!(new Request(`http://localhost${path}`, { ...init, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" } }));
}

describe("account profile", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId).catch(() => {});
  });

  test("snapshots a career, keeps it after the save is deleted, friends only, badges", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const me = devAutoLogin("account-me@test.local");
    const friend = devAutoLogin("account-friend@test.local");
    const stranger = devAutoLogin("account-stranger@test.local");
    setNickname(me.user.id, "accme", Date.now());
    setNickname(friend.user.id, "accfriend", Date.now());
    setNickname(stranger.user.id, "accstranger", Date.now());
    befriend(me.user.id, friend.user.id, Date.now());
    const seatId = await ownSolo(saveId, me.user.id);

    // A league title and 50 seasons on the human record.
    const managers = await saveService.getManagers(saveId);
    await saveService.writeManagers(saveId, managers.map((m) => m.seatId === seatId
      ? { ...m, seasons: 50, titles: [{ season: "2026-27", kind: "league" as const, competition: "premier_league", squadId: "33", points: 100 }] }
      : m));

    // First open backfills the save.
    const first = (await (await call("/api/account/profile", me.session.token)).json()) as AccountProfileView;
    expect(first.mine).toBe(true);
    expect(first.nickname).toBe("accme");
    expect(first.summary.titles.league).toBe(1);
    expect(first.careers).toHaveLength(1);
    expect(first.careers[0]!.deleted).toBe(false);
    expect(first.face?.managerId).toBe(`seat:${seatId}`);

    // A repeated sync never doubles anything.
    await syncSaveCareers(saveId);
    await syncSaveCareers(saveId);
    const again = (await (await call("/api/account/profile", me.session.token)).json()) as AccountProfileView;
    expect(again.summary.titles.league).toBe(1);
    expect(again.careers).toHaveLength(1);

    // Badges: only gold tracks.
    expect((await call("/api/account/badges", me.session.token, { method: "PUT", body: JSON.stringify({ badges: ["wins"] }) })).status).toBe(400);
    const ok = await call("/api/account/badges", me.session.token, { method: "PUT", body: JSON.stringify({ badges: ["seasons"] }) });
    expect(ok.status).toBe(200);

    // Friends see it, strangers do not.
    const seen = (await (await call("/api/account/profile?nickname=accme", friend.session.token)).json()) as AccountProfileView;
    expect(seen.mine).toBe(false);
    expect(seen.badges).toEqual(["seasons"]);
    expect((await call("/api/account/profile?nickname=accme", stranger.session.token)).status).toBe(404);

    // The save goes; the career stays, marked.
    await deleteWorld(saveId, me.user.id);
    saveId = "";
    const after = (await (await call("/api/account/profile", me.session.token)).json()) as AccountProfileView;
    expect(after.careers).toHaveLength(1);
    expect(after.careers[0]!.deleted).toBe(true);
    expect(after.summary.titles.league).toBe(1);
  }, 120_000);
});
