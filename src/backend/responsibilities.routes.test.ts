import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { INBOX_TOPICS } from "@/Domain/inbox/inboxTopics";
import { advanceOneDay } from "@/backend/advanceDay";
import { addDays } from "@/Domain/dates";
import { overallAvg } from "@/Domain/playerRating";
import type { InboxMessage } from "@/types/inboxTypes";

const base = (id: string) => ({
  id, date: "2027-02-05", createdAt: "2027-02-05T00:00:00.000Z", read: false, subject: "s", preview: "p",
});

describe("inbox prefs routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("owner-only, defaults, PUT validation, filter on appendInbox", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("resp-route@test.local");
    const other = devAutoLogin("resp-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const call = (method: string, token: string, body?: unknown) => {
      const handler = apiRoutes["/api/saves/:saveId/inbox-prefs"] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/inbox-prefs`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
    };

    // Not the owner: indistinguishable from a missing save.
    expect((await call("GET", other.session.token)).status).toBe(404);
    expect((await call("PUT", other.session.token, { injuries: false })).status).toBe(404);

    // Defaults.
    const start = await (await call("GET", session.token)).json() as any;
    expect(start.prefs).toEqual({});
    expect(start.topics.map((t: any) => t.topic)).toEqual([...INBOX_TOPICS]);
    const byTopic = Object.fromEntries(start.topics.map((t: any) => [t.topic, t]));
    expect(byTopic.actions).toEqual({ topic: "actions", enabled: true, locked: true });
    expect(byTopic.manager_news.enabled).toBe(false);
    expect(byTopic.scouting_reports.enabled).toBe(false);
    expect(byTopic.injuries.enabled).toBe(true);

    // Validation.
    expect((await call("PUT", session.token, { actions: false })).status).toBe(400);
    expect((await call("PUT", session.token, { nope: true })).status).toBe(400);
    expect((await call("PUT", session.token, { injuries: "off" })).status).toBe(400);
    expect((await call("PUT", session.token, [])).status).toBe(400);

    // PUT writes.
    const put = await call("PUT", session.token, { injuries: false, manager_news: true });
    expect(put.status).toBe(200);
    const after = await put.json() as any;
    expect(after.prefs).toEqual({ injuries: false, manager_news: true });
    expect((await saveService.getMeta(saveId))!.inboxPrefs).toEqual({ injuries: false, manager_news: true });

    // The filter applies in appendInbox, with the meta written after the service instance was created.
    await saveService.clearInbox(saveId);
    await saveService.appendInbox(saveId, {
      ...base("inj"), category: "injury", kind: "injured", playerId: "p", playerName: "P",
    } as unknown as InboxMessage);
    await saveService.appendInbox(saveId, {
      ...base("bid"), category: "transfer", kind: "bid", playerId: "p", playerName: "P", clubName: "C",
    } as unknown as InboxMessage);
    await saveService.appendInbox(saveId, {
      ...base("mgr"), category: "manager_news", items: [],
    } as unknown as InboxMessage);
    const ids = (await saveService.getInbox(saveId)).map((m) => m.id).sort();
    expect(ids).toEqual(["bid", "mgr"]);
  }, 60_000);
});

/**
 * The director in the day pipeline: on a Monday he renews a starter whose contract is ending, lets
 * an old one go, answers the contract talks himself (no request in the inbox) and sends one summary;
 * no 90-day warning. With the manager in charge everything is as before.
 */
describe("responsibilities: the director's contracts", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  });

  const isMonday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() === 1;

  /** A fresh save with the two best players' contracts ending in 60 days (the second one 34 years old). */
  const setup = async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const day0 = meta.currentDate!;
    const squad = (await saveService.getSquadById(meta.id, meta.clubId))!;
    const [a, b] = [...squad.players].sort((x, y) => overallAvg(y) - overallAvg(x));
    const until = addDays(day0, 60);
    await saveService.saveSquadById(meta.id, {
      ...squad,
      players: squad.players.map((p) =>
        p.id === a!.id ? { ...p, age: 27, morale: 65, contract: { ...p.contract!, until } }
        : p.id === b!.id ? { ...p, age: 34, morale: 65, contract: { ...p.contract!, until } }
        : p),
    });
    // Today is exactly 90 days before the league's end: the warning day.
    const active = meta.activeLeagues!.map((l) => (l.leagueSlug === "premier_league" ? { ...l, end: addDays(day0, 90) } : l));
    await saveService.updateMeta(meta.id, { activeLeagues: active });
    return { meta, a: a!, b: b!, day0, until, originalEnd: meta.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!.end };
  };

  /** Advances day by day until a Monday was played; restores the league end after the first day. */
  const runThroughMonday = async (saveId: string, originalEnd: string) => {
    for (let i = 0; i < 8; i++) {
      const m = (await saveService.getMeta(saveId))!;
      const monday = isMonday(m.currentDate!);
      const out = await advanceOneDay(saveService, saveId);
      expect(out.ok).toBe(true);
      if (i === 0) {
        const after = (await saveService.getMeta(saveId))!;
        await saveService.updateMeta(saveId, {
          activeLeagues: after.activeLeagues!.map((l) => (l.leagueSlug === "premier_league" ? { ...l, end: originalEnd } : l)),
        });
      }
      if (monday) return;
    }
    throw new Error("no Monday reached");
  };

  const callResp = (saveId: string, method: string, token: string, body?: unknown) => {
    const handler = apiRoutes["/api/saves/:saveId/responsibilities"] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/responsibilities`, {
        method,
        headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      { params: { saveId } },
    ));
  };

  test("director (default): renews, lets go, answers the talks, one summary, no warning", async () => {
    const { meta, a, b, until, originalEnd } = await setup();
    await runThroughMonday(meta.id, originalEnd);

    const squad = (await saveService.getSquadById(meta.id, meta.clubId))!;
    const A = squad.players.find((p) => p.id === a.id)!;
    const B = squad.players.find((p) => p.id === b.id)!;
    expect(A.contract!.until > until).toBe(true);
    expect(B.contract!.until).toBe(until);
    // The director answered B's contract talk with a refusal: no open request.
    expect((squad.moraleClub?.talks ?? []).some((t) => t.reason === "contract")).toBe(false);
    expect(B.morale!).toBeLessThan(60);

    const after = (await saveService.getMeta(meta.id))!;
    expect(after.directorDecisions?.[a.id]?.renew).toBe(true);
    expect(after.directorDecisions?.[b.id]?.renew).toBe(false);

    const inbox = await saveService.getInbox(meta.id);
    const summaries = inbox.filter((m) => m.category === "contract" && m.kind === "director_summary");
    expect(summaries).toHaveLength(1);
    const s0 = summaries[0]!;
    if (s0.category === "contract") {
      expect(s0.renewed!.map((p) => p.id)).toContain(a.id);
      expect(s0.leaving!.map((p) => p.id)).toContain(b.id);
    }
    expect(inbox.some((m) => m.category === "contract" && m.kind === "expiring")).toBe(false);
    expect(inbox.some((m) => m.category === "player" && m.kind === "talk" && m.reason === "contract")).toBe(false);
  }, 300_000);

  test("manager in charge: nothing renewed alone, the warning and the contract talks come back", async () => {
    const { meta, a, until, originalEnd } = await setup();
    const { user, session } = devAutoLogin("resp-director@test.local");
    const other = devAutoLogin("resp-director-other@test.local");
    recordSaveOwnership(meta.id, user.id);
    expect((await callResp(meta.id, "GET", other.session.token)).status).toBe(404);
    expect(await (await callResp(meta.id, "GET", session.token)).json()).toEqual({ contracts: "director" });
    expect((await callResp(meta.id, "PUT", session.token, { contracts: "board" })).status).toBe(400);
    expect((await callResp(meta.id, "PUT", session.token, { contracts: "manager", x: 1 })).status).toBe(400);
    const put = await callResp(meta.id, "PUT", session.token, { contracts: "manager" });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ contracts: "manager" });

    await runThroughMonday(meta.id, originalEnd);
    const squad = (await saveService.getSquadById(meta.id, meta.clubId))!;
    expect(squad.players.find((p) => p.id === a.id)!.contract!.until).toBe(until);
    expect((await saveService.getMeta(meta.id))!.directorDecisions).toBeUndefined();
    const inbox = await saveService.getInbox(meta.id);
    expect(inbox.some((m) => m.category === "contract" && m.kind === "expiring")).toBe(true);
    expect(inbox.some((m) => m.category === "contract" && m.kind === "director_summary")).toBe(false);
    expect((squad.moraleClub?.talks ?? []).some((t) => t.reason === "contract")).toBe(true);
    expect(inbox.some((m) => m.category === "player" && m.kind === "talk" && m.reason === "contract")).toBe(true);
  }, 300_000);
});
