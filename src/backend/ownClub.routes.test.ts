import { afterAll, describe, expect, test } from "bun:test";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSeat } from "@/backend/seats";
import { clubsInRunningContinental, squadLevel } from "@/backend/ownClubWorld";
import { OWN_CLUB_KEYS } from "@/Domain/ownClub/ownClub";
import type { LeagueSeasonMeta } from "@/types/calendarTypes";

/** Founding the manager's own club (`.claude/rules/game/own-club.md`). */
describe("own club: founding route", () => {
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

  const identity = { name: "Westlab FC", shortName: "wlb", colors: ["#112233", "#ffeedd"] };

  test("unlock, rules, founding", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const saveId = meta.id;
    const { user, session } = devAutoLogin("own-club@test.local");
    const seatId = await ownSolo(saveId, user.id);
    const token = session.token;

    // a. Locked view with the lowest divisions.
    const view = await call(saveId, "GET", token);
    expect(view.status).toBe(200);
    const v = await view.json() as {
      unlocked: boolean; done: number; total: number;
      countries: { country: string; leagues: { slug: string; clubs: { id: string; name: string; blocked?: string }[] }[] }[];
    };
    expect(v).toMatchObject({ unlocked: false, done: 0, total: OWN_CLUB_KEYS.length });
    const england = v.countries.find((c) => c.country === "England")!;
    expect(england.leagues.map((l) => l.slug)).toEqual(["of_championship"]);
    const clubs = england.leagues[0]!.clubs;
    expect(clubs.length).toBeGreaterThan(10);
    expect(clubs.every((c) => !c.blocked)).toBe(true);
    expect(v.countries.some((c) => c.leagues.some((l) => l.slug === "premier_league"))).toBe(false);

    const target = clubs[0]!.id;
    const other = clubs[1]!.id;

    // b. No achievements yet.
    expect((await call(saveId, "POST", token, { squadId: target, ...identity })).status).toBe(409);

    const ach = await saveService.getAchievements(saveId, seatId);
    await saveService.writeAchievements(saveId, {
      ...ach, unlocked: Object.fromEntries(OWN_CLUB_KEYS.map((k) => [k, meta.currentDate!])),
    }, seatId);
    expect(await (await call(saveId, "GET", token)).json()).toMatchObject({ unlocked: true, done: OWN_CLUB_KEYS.length });

    // e/f. Wrong division, unknown club, identity, another seat's club.
    expect(await (await call(saveId, "POST", token, { squadId: "40", ...identity })).json()).toEqual({ error: "notLowest" });
    expect((await call(saveId, "POST", token, { squadId: "nope_club", ...identity })).status).toBe(404);
    const bad = await call(saveId, "POST", token, { squadId: target, ...identity, colors: ["#112233", "#112233"] });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalidIdentity" });
    const b = devAutoLogin("own-club-b@test.local");
    await addSeat(saveId, { userId: b.user.id, clubId: other, manager: { name: "Técnico B", nationalityIso: "br", backgroundId: "former-player" } });
    const taken = await call(saveId, "POST", token, { squadId: other, ...identity });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: "humanClub" });

    // c. Founding.
    const before = (await saveService.getSquadById(saveId, target))!;
    const oldIds = [...before.players, ...(before.youth ?? [])].map((p) => p.id);
    const row = (await saveService.getLeagueStandings(saveId, "of_championship"))!.find((r) => r.squadId === target)!;
    await saveService.writeClubHistory(saveId, { squadId: target, seasons: [], scorers: { x: { name: "x", goals: 3, apps: 3, assists: 0 } }, records: {} });
    const others = (await saveService.getSquadsInLeague(saveId, "of_championship")).filter((s) => s.id !== target);
    const worst = Math.min(...others.map(squadLevel));

    const res = await call(saveId, "POST", token, { squadId: target, ...identity });
    expect(res.status).toBe(200);
    const seat = (await saveService.getSeatMeta(saveId, seatId))!;
    expect(seat.clubId).toBe(target);
    expect(seat.clubName).toBe("Westlab FC");
    expect(seat.foundedClub).toEqual({ squadId: target, on: meta.currentDate! });
    expect(seat.managerContract?.until).toBeUndefined();
    expect(seat.board?.objective).toBeNull();
    expect(seat.unemployed).toBeUndefined();

    const squad = (await saveService.getSquadById(saveId, target))!;
    expect(squad.players).toHaveLength(22);
    expect(squad.players.map((p) => p.id).sort()).toEqual(Array.from({ length: 22 }, (_, i) => `founded_${seatId}_${target}_${i}`).sort());
    expect(squad.players.every((p) => p.contract && p.contract.wage > 0)).toBe(true);
    expect(squad.players.some((p) => oldIds.includes(p.id))).toBe(false);
    expect(squad.foundedBy?.seatId).toBe(seatId);
    expect(squad).toMatchObject({ name: "Westlab FC", shortName: "WLB", colors: ["#112233", "#ffeedd"] });
    expect(squad.youth ?? []).toEqual([]);
    expect(squadLevel(squad)).toBeLessThan(worst);

    expect((await saveService.getSquadIndex(saveId)).founded()).toContain(target);

    const free = new Set((await saveService.getFreeAgents(saveId)).map((f) => f.player.id));
    expect(oldIds.every((id) => free.has(id))).toBe(true);

    const after = (await saveService.getLeagueStandings(saveId, "of_championship"))!.find((r) => r.squadId === target)!;
    expect(after.name).toBe("Westlab FC");
    expect(after.pts).toBe(row.pts);
    expect(after.mp).toBe(row.mp);

    const history = await saveService.getClubHistory(saveId, target);
    expect(history?.seasons ?? []).toEqual([]);
    expect(Object.keys(history?.scorers ?? {})).toEqual([]);

    const inbox = await saveService.getInbox(saveId, seatId);
    const today = inbox.filter((m) => m.date === meta.currentDate);
    expect(today.some((m) => m.category === "job" && m.kind === "founded")).toBe(true);
    expect(today.some((m) => m.category === "job" && m.kind === "hired")).toBe(false);

    // The old club (Manchester United) went back to the AI.
    expect((await saveService.humanClubIds(saveId)).has("33")).toBe(false);

    // d. Only once.
    const again = await call(saveId, "POST", token, { squadId: clubs[2]!.id, ...identity });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "alreadyFounded" });

    // The founded club shows as blocked for everybody else.
    const viewAfter = await (await call(saveId, "GET", token)).json() as typeof v;
    const blockedClub = viewAfter.countries.flatMap((c) => c.leagues).flatMap((l) => l.clubs).find((c) => c.id === target)!;
    expect(blockedClub.blocked).toBe("founded");
  }, 300_000);

  test("clubs of a running continental competition are blocked", () => {
    const meta = (groups: string[][], championId: string | null, pots?: string[][]) => ({
      continental: { groups: groups.map((clubs, i) => ({ name: String(i), clubs })), championId, ...(pots ? { pots } : {}) },
    }) as unknown as LeagueSeasonMeta;
    const set = clubsInRunningContinental([meta([["a", "b"]], null), meta([["c"]], "c"), meta([], null, [["d"], ["e"]]), null]);
    expect([...set].sort()).toEqual(["a", "b", "d", "e"]);
  });
});
