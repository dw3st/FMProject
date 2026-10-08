import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { INBOX_TOPICS } from "@/Domain/inbox/inboxTopics";
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
