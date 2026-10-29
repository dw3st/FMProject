import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { clearLiveForDay, pushServerLiveScore, resetLiveScores } from "@/backend/rivals/liveScores";
import { onSocketClose, onSocketOpen, type SocialSocket } from "@/backend/social/realtime";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { relayFromPlayer, resetWatchRooms, watchJoin, watchLeave, watcherCount } from "@/backend/watch/watchRooms";
import { WATCH } from "@/Domain/watch/watchConfig";
import type { ServerEvent } from "@/types/socialTypes";

const saveId = randomUUID();
const player = makeUser(uniqueNick());
const fan = makeUser(uniqueNick());
const fan2 = makeUser(uniqueNick());
addSaveMember(saveId, player.id, "p", "owner");
addSaveMember(saveId, fan.id, "f", "member");
addSaveMember(saveId, fan2.id, "g", "member");

function sock(userId: string): SocialSocket & { got: ServerEvent[] } {
  const got: ServerEvent[] = [];
  const ws = {
    data: { userId, session: "", saveId: null, clubName: null },
    send: (m: string) => { got.push(JSON.parse(m) as ServerEvent); },
    close: () => {},
    got,
  };
  onSocketOpen(ws);
  return ws;
}
const types = (s: { got: ServerEvent[] }) => s.got.map((e) => e.type);
const base = { seatId: "p", nickname: "pl", clubId: "c1", clubName: "Vasco", opponentId: "c2", opponentName: "Bahia", home: false, fixtureId: "f1", date: "2027-03-10" };
const goLive = () => pushServerLiveScore(base, new Set(), { saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }, () => {}, Date.now());
const frame = { t: 1, ball: [50, 30] as [number, number], players: [[1, 10, 10]] as [number, number, number][], minute: 3, phase: "firstHalf" as const, score: { A: 0, B: 0 } };

afterEach(() => { resetWatchRooms(); resetLiveScores(); });

describe("watching a friend's live match", () => {
  test("the first spectator turns the relay on; relays reach him; the last one leaving turns it off", async () => {
    goLive();
    const p = sock(player.id);
    const f = sock(fan.id);
    await watchJoin(f, saveId, "p");
    const info = f.got.find((e) => e.type === "watch_info") as Extract<ServerEvent, { type: "watch_info" }>;
    expect(info.info).toMatchObject({ kind: "solo", friendSide: "A", mirror: true, teams: { A: { id: "c1" }, B: { id: "c2" } } });
    expect(types(p)).toContain("watch_on");

    relayFromPlayer(p, saveId, "f1", { kind: "frame", ...frame });
    expect(types(f)).toContain("watch_frame");
    // Someone else's relay, another fixture: dropped.
    const before = f.got.length;
    relayFromPlayer(f, saveId, "f1", { kind: "frame", ...frame });
    relayFromPlayer(p, saveId, "f2", { kind: "frame", ...frame });
    expect(f.got.length).toBe(before);

    // A state is kept for who joins mid-match.
    relayFromPlayer(p, saveId, "f1", { kind: "state", state: { players: [], benchA: [], benchB: [] } as never, stats: { teams: {} as never, goals: [], ratings: [] } });
    const g = sock(fan2.id);
    await watchJoin(g, saveId, "p");
    expect(types(g)).toEqual(["watch_info", "watch_state"]);

    watchLeave(f);
    expect(types(p)).not.toContain("watch_off");
    onSocketClose(g);
    expect(types(p)).toContain("watch_off");
    expect(watcherCount(saveId, "p")).toBe(0);
    onSocketClose(p);
    onSocketClose(f);
  });

  test("refused: his own seat, a stranger, a seat without a live match; full past the limit", async () => {
    const p = sock(player.id);
    const stranger = sock(makeUser().id);
    const f = sock(fan.id);
    await watchJoin(f, saveId, "p");
    expect(f.got.at(-1)).toMatchObject({ type: "watch_closed", reason: "gone" });
    goLive();
    await watchJoin(p, saveId, "p");
    expect(p.got.at(-1)).toMatchObject({ type: "watch_closed", reason: "refused" });
    await watchJoin(stranger, saveId, "p");
    expect(stranger.got.at(-1)).toMatchObject({ type: "watch_closed", reason: "refused" });
    const many = Array.from({ length: WATCH.MAX_WATCHERS }, () => sock(fan.id));
    for (const s of many) await watchJoin(s, saveId, "p");
    expect(watcherCount(saveId, "p")).toBe(WATCH.MAX_WATCHERS);
    await watchJoin(f, saveId, "p");
    expect(f.got.at(-1)).toMatchObject({ type: "watch_closed", reason: "full" });
    for (const s of [p, stranger, f, ...many]) onSocketClose(s);
  });

  test("the day ran: the spectators are told the match is gone", async () => {
    goLive();
    const f = sock(fan.id);
    await watchJoin(f, saveId, "p");
    clearLiveForDay(saveId, "2027-03-10", () => {});
    expect(f.got.at(-1)).toMatchObject({ type: "watch_closed", reason: "gone" });
    expect(watcherCount(saveId, "p")).toBe(0);
    onSocketClose(f);
  });
});
