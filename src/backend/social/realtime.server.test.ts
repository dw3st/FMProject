import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { resetPresence } from "@/backend/presence";
import { withJsonErrors } from "@/backend/routeErrors";
import { handleSocialUpgrade, resetRealtime, setClubNameResolver, socialWebSocket } from "@/backend/social/realtime";
import { resetSocialRateLimit, socialRoutes } from "@/backend/social/socialRoutes";
import { befriend } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import type { ServerEvent } from "@/types/socialTypes";

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    routes: withJsonErrors(socialRoutes),
    fetch(req, srv) {
      if (new URL(req.url).pathname === "/api/ws") return handleSocialUpgrade(req, srv);
      return new Response("Not Found", { status: 404 });
    },
    websocket: socialWebSocket,
  });
});

afterAll(() => {
  server.stop(true);
});

beforeEach(() => {
  resetRealtime();
  resetPresence();
  resetSocialRateLimit();
});

interface Client {
  ws: WebSocket;
  events: ServerEvent[];
}

function connect(token: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const events: ServerEvent[] = [];
    // Bun's WebSocket takes request headers as a second-argument option.
    const ws = new WebSocket(`ws://localhost:${server.port}/api/ws`, {
      headers: { cookie: `fs_session=${token}` },
    } as unknown as string[]);
    ws.onmessage = (e) => events.push(JSON.parse(String(e.data)) as ServerEvent);
    ws.onopen = () => resolve({ ws, events });
    ws.onerror = (e) => reject(e);
  });
}

async function waitFor(events: ServerEvent[], pred: (e: ServerEvent) => boolean, ms = 2000): Promise<ServerEvent> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const hit = events.find(pred);
    if (hit) return hit;
    await Bun.sleep(10);
  }
  throw new Error("timed out waiting for a socket event");
}

const base = () => `http://localhost:${server.port}`;

test("the socket needs a session (checked before the upgrade)", async () => {
  const res = await fetch(`${base()}/api/ws`);
  expect(res.status).toBe(401);
});

test("a message sent over HTTP reaches the friend's socket", async () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  befriend(a.id, b.id, Date.now());
  const cb = await connect(b.token);
  const res = await fetch(`${base()}/api/social/rooms/${encodeURIComponent(`dm:${b.nickname}`)}/messages`, {
    method: "POST",
    headers: { cookie: `fs_session=${a.token}`, "content-type": "application/json" },
    body: JSON.stringify({ body: "jogo às 20h?" }),
  });
  expect(res.status).toBe(200);
  const got = await waitFor(cb.events, (e) => e.type === "message");
  expect(got).toMatchObject({ type: "message", room: `dm:${a.nickname}`, message: { from: a.nickname, body: "jogo às 20h?", mine: false } });
  cb.ws.close();
});

test("hello with an own save shows the friend as playing with the club", async () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  befriend(a.id, b.id, Date.now());
  const saveId = randomUUID();
  recordSaveOwnership(saveId, a.id);
  setClubNameResolver(async () => "Fluminense");
  const cb = await connect(b.token);
  const ca = await connect(a.token);
  ca.ws.send(JSON.stringify({ type: "hello", saveId }));
  const got = await waitFor(cb.events, (e) => e.type === "presence" && e.status === "playing");
  expect(got).toEqual({ type: "presence", nickname: a.nickname!, status: "playing", club: "Fluminense" });
  await waitFor(ca.events, (e) => e.type === "pong");
  ca.ws.close();
  cb.ws.close();
});

test("a blocked user receives nothing from the one who blocked", async () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  befriend(a.id, b.id, Date.now());
  await fetch(`${base()}/api/social/blocks`, {
    method: "POST",
    headers: { cookie: `fs_session=${a.token}`, "content-type": "application/json" },
    body: JSON.stringify({ nickname: b.nickname }),
  });
  const cb = await connect(b.token);
  const ca = await connect(a.token);
  ca.ws.send(JSON.stringify({ type: "ping" }));
  const res = await fetch(`${base()}/api/social/rooms/${encodeURIComponent(`dm:${b.nickname}`)}/messages`, {
    method: "POST",
    headers: { cookie: `fs_session=${a.token}`, "content-type": "application/json" },
    body: JSON.stringify({ body: "oi" }),
  });
  expect(res.status).toBe(403);
  await Bun.sleep(300);
  expect(cb.events.filter((e) => e.type === "message" || e.type === "presence")).toEqual([]);
  ca.ws.close();
  cb.ws.close();
});

test("the app's API routes include the social routes", async () => {
  const { apiRoutes } = await import("@/backend/routes");
  for (const path of Object.keys(socialRoutes)) expect(Object.keys(apiRoutes)).toContain(path);
});
