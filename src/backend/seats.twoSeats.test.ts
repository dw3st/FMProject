import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService, type SeatMeta } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { getLeagueData, getPyramids, runBufferedDay } from "@/backend/advanceDay";
import { seatManagerId } from "@/Domain/seats/seats";
import { addDays } from "@/Domain/dates";
import type { SeatContext } from "@/types/seatTypes";
import type { InboxMessage } from "@/types/inboxTypes";

type Login = ReturnType<typeof devAutoLogin>;

const call = (key: string, path: string, method: string, token: string, params: Record<string, string>, body?: unknown) => {
  const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
  return handler(Object.assign(
    new Request(`http://localhost${path}`, {
      method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params },
  ));
};

const marker = (id: string): InboxMessage =>
  ({ id, category: "season", kind: "followers", read: false, createdAt: "2027-01-01T00:00:00Z", date: "2027-01-01", subject: id } as unknown as InboxMessage);

/**
 * Two (three) seats in one world (spec §2.4, `.claude/rules/game/multiplayer.md`): seat A on Manchester United
 * (createSave), seat B on a La Liga club and seat D on another Premier League club — two seats in the same league.
 */
describe("two seats in one world (spec §2.4)", () => {
  let meta: SeatMeta;      // seat A: Premier League, club 33 (createSave)
  let seatB: SeatContext;  // seat B: first club of La Liga (addSeat)
  let seatD: SeatContext;  // seat D: another Premier League club (addSeat)
  let a: Login;
  let b: Login;
  let d: Login;
  let stranger: Login;
  const DAYS = 8;

  const seats = () => [
    { seatId: meta.seatId, clubId: meta.clubId, league: "premier_league" },
    { seatId: seatB.seatId, clubId: seatB.seat.clubId!, league: "la_liga" },
    { seatId: seatD.seatId, clubId: seatD.seat.clubId!, league: "premier_league" },
  ];

  beforeAll(async () => {
    a = devAutoLogin("two-seats-a@test.local");
    b = devAutoLogin("two-seats-b@test.local");
    d = devAutoLogin("two-seats-d@test.local");
    stranger = devAutoLogin("two-seats-x@test.local");
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    await ownSolo(meta.id, a.user.id);
    const index = await saveService.getSquadIndex(meta.id);
    seatB = await addSeat(meta.id, {
      userId: b.user.id, clubId: index.inLeague("la_liga")[0]!.squadId,
      manager: { name: "Técnico B", nationalityIso: "es", backgroundId: "former-player" },
    });
    seatD = await addSeat(meta.id, {
      userId: d.user.id, clubId: index.inLeague("premier_league").find((e) => e.squadId !== meta.clubId)!.squadId,
      manager: { name: "Técnico D", nationalityIso: "gb", backgroundId: "former-player" },
    });
    for (let i = 0; i < DAYS; i++) {
      const out = await runBufferedDay(meta.id);
      if (!out.ok) throw new Error(`day ${i}: ${out.error}`);
    }
  }, 900_000);

  afterAll(async () => { await saveService.deleteSave(meta.id); }, 120_000);

  test("each human club gets its own board, press, manager wage, inbox and ledger", async () => {
    for (const s of seats()) {
      const seat = (await saveService.getSeat(meta.id, s.seatId))!;
      expect(seat.board?.objective?.leagueSlug).toBe(s.league);
      expect(seat.press).toBeDefined();
      expect(seat.managerContract?.squadId).toBe(s.clubId);
      // a Monday fell inside the 8 days: the manager was paid
      expect(seat.managerEarnings ?? 0).toBeGreaterThan(0);
      let sum = 0;
      let wageLines = 0;
      for (const season of await saveService.listLedgerSeasons(meta.id, s.seatId)) {
        for (const e of await saveService.getLedger(meta.id, season, s.seatId)) {
          sum += e.amount;
          if (e.kind === "manager") wageLines++;
        }
      }
      expect(wageLines).toBeGreaterThan(0);
      const squad = (await saveService.getSquadById(meta.id, s.clubId))!;
      expect(Math.round(sum)).toBe(Math.round(squad.finances?.budget ?? 0));
      expect((await saveService.getInbox(meta.id, s.seatId)).length).toBeGreaterThan(0);
    }
    // the inboxes are apart (message ids can repeat across seats: a message about each one's own club, e.g. the
    // Champions League list of two clubs in it, has the same id in two separate files)
    await saveService.appendInbox(meta.id, marker("only-a"), meta.seatId);
    expect((await saveService.getInbox(meta.id, meta.seatId)).some((m) => m.id === "only-a")).toBe(true);
    for (const s of seats().slice(1)) {
      expect((await saveService.getInbox(meta.id, s.seatId)).some((m) => m.id === "only-a")).toBe(false);
    }
  });

  test("the AI never buys from, sells to, hires for or sacks at a human club", async () => {
    const humans = new Set(seats().map((s) => s.clubId));
    let date = meta.currentDate!;
    for (let i = 0; i < DAYS; i++) {
      const log = await saveService.getDayLog(meta.id, date);
      for (const m of log?.transfers ?? []) {
        expect(humans.has(m.from)).toBe(false);
        expect(humans.has(m.to)).toBe(false);
      }
      date = addDays(date, 1);
    }
    const managers = await saveService.getManagers(meta.id);
    for (const s of seats()) {
      expect(managers.filter((m) => m.squadId === s.clubId).map((m) => m.id)).toEqual([seatManagerId(s.seatId)]);
    }
    const world = (await saveService.getMeta(meta.id))!;
    for (const id of humans) expect(world.managerVacancies?.[id]).toBeUndefined();
    for (const s of seats()) {
      // a human club carries none of the AI's budget fields
      const squad = (await saveService.getSquadById(meta.id, s.clubId))!;
      expect(squad.financialTier).toBeUndefined();
      expect(squad.aiTransferBudget).toBeUndefined();
      // youth call-ups of a human club are its seat's only: nobody set any, none appeared
      expect((await saveService.getSeat(meta.id, s.seatId))?.youthCallUps).toBeUndefined();
    }
  });

  test("one seat's actions never touch the other (tactics, press, sell list, preferences, rest days, youth call-ups)", async () => {
    const others = [seatB.seatId, seatD.seatId];
    const before = await Promise.all(others.map(async (seatId) => ({
      tactics: await saveService.getTactics(meta.id, seatId),
      seat: await saveService.getSeat(meta.id, seatId),
      market: await saveService.getMarket(meta.id, seatId),
    })));
    const p = { saveId: meta.id };
    const id = meta.id;
    // tactics
    expect((await call("/api/saves/:id/tactics", `/api/saves/${id}/tactics`, "PUT", a.session.token, { id }, { formation: "4-4-2", tactical_style: "possession" })).status).toBe(200);
    // inbox preferences
    expect((await call("/api/saves/:saveId/inbox-prefs", `/api/saves/${id}/inbox-prefs`, "PUT", a.session.token, p, { manager_news: true })).status).toBe(200);
    // sell list: one of A's players
    const playerA = (await saveService.getSquadById(id, meta.clubId))!.players[5]!.id;
    expect((await call("/api/saves/:saveId/sell-list", `/api/saves/${id}/sell-list`, "POST", a.session.token, p, { playerId: playerA })).status).toBe(200);
    // rest day
    const day = addDays((await saveService.getMeta(id))!.currentDate!, 3);
    expect((await call("/api/saves/:saveId/day-type/:date", `/api/saves/${id}/day-type/${day}`, "PATCH", a.session.token, { saveId: id, date: day }, { type: "rest" })).status).toBe(200);
    // press conference, when A has one open
    const seatA = (await saveService.getSeat(id, meta.seatId))!;
    const pending = seatA.press?.pending;
    if (pending && pending.expires >= (await saveService.getMeta(id))!.currentDate!) {
      const answers = pending.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]!.id }));
      expect((await call("/api/saves/:saveId/press/:pressId", `/api/saves/${id}/press/${pending.id}`, "POST", a.session.token, { saveId: id, pressId: pending.id }, { answers })).status).toBe(200);
    }
    // youth call-up of a B player by A: not A's player
    const playerB = (await saveService.getSquadById(id, seatB.seat.clubId!))!.players[0]!.id;
    expect((await call("/api/saves/:saveId/youth-callups", `/api/saves/${id}/youth-callups`, "PUT", a.session.token, p, { u21: [{ id: playerB, duration: "next" }] })).status).toBe(400);

    for (let i = 0; i < others.length; i++) {
      expect(await saveService.getTactics(id, others[i]!)).toEqual(before[i]!.tactics);
      expect(await saveService.getSeat(id, others[i]!)).toEqual(before[i]!.seat);
      expect(await saveService.getMarket(id, others[i]!)).toEqual(before[i]!.market);
    }
    expect((await saveService.getMarket(id, meta.seatId))?.playerSellList.some((c) => c.playerId === playerA)).toBe(true);
    expect((await saveService.getSeat(id, meta.seatId))?.restDays).toContain(day);
  });

  test("routes: a member acting on the other seat's club gets 404; world routes answer every member; a stranger gets 404", async () => {
    const id = meta.id;
    const playerB = (await saveService.getSquadById(id, seatB.seat.clubId!))!.players[0]!.id;
    const squadStatus = (who: Login) => call("/api/saves/:saveId/players/:playerId/squad-status", `/api/saves/${id}/players/${playerB}/squad-status`, "PUT",
      who.session.token, { saveId: id, playerId: playerB }, { status: "key" });
    expect((await squadStatus(a)).status).toBe(404);
    expect((await squadStatus(d)).status).toBe(404);
    expect((await squadStatus(b)).status).toBe(200);

    for (const who of [a, b, d]) {
      expect((await call("/api/saves/:saveId/news", `/api/saves/${id}/news`, "GET", who.session.token, { saveId: id })).status).toBe(200);
    }
    const meB = await (await call("/api/saves/:id", `/api/saves/${id}`, "GET", b.session.token, { id })).json();
    expect(meB.seatId).toBe(seatB.seatId);
    expect(meB.clubId).toBe(seatB.seat.clubId);
    const meD = await (await call("/api/saves/:id", `/api/saves/${id}`, "GET", d.session.token, { id })).json();
    expect(meD.seatId).toBe(seatD.seatId);
    expect(meD.leagueSlug).toBe("premier_league");
    expect((await call("/api/saves/:saveId/inbox", `/api/saves/${id}/inbox`, "GET", stranger.session.token, { saveId: id })).status).toBe(404);
  });

  test("the rollover of one seat's country clears only that seat's inbox", async () => {
    const id = meta.id;
    const world = (await saveService.getMeta(id))!;
    const catalog = await getLeagueData();
    const pyramids = await getPyramids();
    const index = await saveService.getSquadIndex(id);
    // a league of a country without a pyramid rolls alone (`membership.md`)
    const lone = (world.activeLeagues ?? []).find((l) => {
      const country = catalog.find((c) => c.slug === l.leagueSlug)?.country;
      return !!country && !pyramids[country] && index.inLeague(l.leagueSlug).length >= 2;
    })!;
    expect(lone).toBeDefined();
    const c = devAutoLogin("two-seats-c@test.local");
    const seatC = await addSeat(id, {
      userId: c.user.id, clubId: index.inLeague(lone.leagueSlug)[0]!.squadId,
      manager: { name: "Técnico C", nationalityIso: "br", backgroundId: "former-player" },
    });
    await saveService.appendInbox(id, marker("keep-a"), meta.seatId);
    await saveService.appendInbox(id, marker("wipe-c"), seatC.seatId);
    // the lone league ends today: tomorrow's advance rolls its country over
    await saveService.updateMeta(id, {
      activeLeagues: world.activeLeagues!.map((l) => (l.leagueSlug === lone.leagueSlug ? { ...l, end: world.currentDate! } : l)),
    });
    const out = await runBufferedDay(id);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.seats[seatC.seatId]?.seasonEnded).toBe(true);
    expect(out.seats[meta.seatId]?.seasonEnded).toBeUndefined();
    expect((await saveService.getInbox(id, meta.seatId)).some((m) => m.id === "keep-a")).toBe(true);
    expect((await saveService.getInbox(id, seatC.seatId)).some((m) => m.id === "wipe-c")).toBe(false);
    expect((await saveService.getSeat(id, seatC.seatId))?.restDays?.length).toBeGreaterThan(0);
  }, 300_000);
});
