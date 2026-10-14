import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { buildConference } from "@/Domain/press/questions";
import { addDays } from "@/Domain/dates";
import type { PressConference } from "@/types/pressTypes";

/** Press routes (Etapa 42, `.claude/rules/game/press.md`). */
describe("press routes", () => {
  let saveId = "";
  let today = "";
  let token = "";
  let otherToken = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    today = meta.currentDate!;
    const { user, session } = devAutoLogin("press-route@test.local");
    token = session.token;
    otherToken = devAutoLogin("press-other@test.local").session.token;
    recordSaveOwnership(saveId, user.id);
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  const getPress = (auth: string) => {
    const handler = apiRoutes["/api/saves/:saveId/press" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/press`, { headers: { cookie: `fs_session=${auth}` } }),
      { params: { saveId } },
    ));
  };
  const postPress = (pressId: string, auth: string, body: unknown) => {
    const handler = apiRoutes["/api/saves/:saveId/press/:pressId" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/press/${pressId}`, {
        method: "POST",
        headers: { cookie: `fs_session=${auth}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: { saveId, pressId } },
    ));
  };

  const setPending = async (id: string, expires = today): Promise<PressConference> => {
    const pending = buildConference({
      id, trigger: "derby", kind: "pre", date: today, expires,
      params: { opponent: "Rival" }, seed: id,
    });
    await saveService.updateMeta(saveId, { press: { pending, winless: 0, promises: [], history: [] } });
    return pending;
  };
  const provocative = (c: PressConference) =>
    c.questions.map((q) => ({
      questionId: q.id,
      answerId: (q.answers.find((a) => a.tone === "provocative") ?? q.answers[0]!).id,
    }));

  test("GET: someone else is refused; the owner without a pending gets null", async () => {
    await saveService.updateMeta(saveId, { press: undefined });
    const denied = await getPress(otherToken);
    expect([401, 403, 404]).toContain(denied.status);
    const ok = await getPress(token);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ pending: null, history: [] });
  });

  test("GET with a pending conference never carries the tone", async () => {
    await setPending("press-g");
    const text = await (await getPress(token)).text();
    expect(text).not.toContain("tone");
    expect(JSON.parse(text).pending.id).toBe("press-g");
  });

  test("POST with valid answers applies them, clears pending and stores a quote", async () => {
    const c = await setPending("press-p");
    const res = await postPress("press-p", token, { answers: provocative(c) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const meta = await saveService.getMeta(saveId);
    expect(meta!.press!.pending).toBeUndefined();
    expect(Array.isArray(meta!.press!.history[0]!.answers)).toBe(true);
    const month = await saveService.getNewsMonth(saveId, today.slice(0, 7));
    expect(month.some((n) => n.kind === "press_quote")).toBe(true);
  });

  test("POST again with the same id is 409 pressClosed", async () => {
    const c = await setPending("press-r");
    expect((await postPress("press-r", token, { answers: provocative(c) })).status).toBe(200);
    const again = await postPress("press-r", token, { answers: provocative(c) });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("pressClosed");
  });

  test("POST with a missing question, an unknown answer or a repeated question is 400 invalidAnswers", async () => {
    const c = await setPending("press-v");
    const missing = await postPress("press-v", token, { answers: provocative(c).slice(1) });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("invalidAnswers");
    const unknown = provocative(c);
    unknown[0] = { ...unknown[0]!, answerId: "nope" };
    expect((await postPress("press-v", token, { answers: unknown })).status).toBe(400);
    const dup = [provocative(c)[0]!, provocative(c)[0]!];
    expect((await postPress("press-v", token, { answers: dup })).status).toBe(400);
    expect((await postPress("press-v", token, { nope: 1 })).status).toBe(400);
    expect((await saveService.getMeta(saveId))!.press!.pending?.id).toBe("press-v");
  });

  test("POST after the deadline is 409; on the deadline day it is still answerable", async () => {
    const c = await setPending("press-d", addDays(today, -1));
    const late = await postPress("press-d", token, { answers: provocative(c) });
    expect(late.status).toBe(409);
    expect((await late.json()).error).toBe("pressClosed");
    const c2 = await setPending("press-e", today);
    expect((await postPress("press-e", token, { answers: provocative(c2) })).status).toBe(200);
  });
});
