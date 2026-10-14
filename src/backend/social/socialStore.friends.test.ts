import { describe, expect, test } from "bun:test";
import { SOCIAL } from "@/Domain/social/socialConfig";
import {
  acceptRequest,
  areFriends,
  befriend,
  blockUser,
  cancelRequest,
  declineRequest,
  friendIds,
  hasRequest,
  listBlocked,
  listFriends,
  listIncoming,
  listOutgoing,
  relationOf,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockUser,
} from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";

const NOW = 1_800_000_000_000;

describe("requests", () => {
  test("a request shows on both sides; a crossed request becomes a friendship", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("requested");
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("requested");
    expect(listOutgoing(a.id)).toEqual([{ id: b.id, nickname: b.nickname!, at: NOW }]);
    expect(listIncoming(b.id)).toEqual([{ id: a.id, nickname: a.nickname!, at: NOW }]);
    expect(relationOf(a.id, b.id)).toBe("pending_out");
    expect(relationOf(b.id, a.id)).toBe("pending_in");
    expect(sendFriendRequest(b.id, a.id, NOW + 1)).toBe("befriended");
    expect(areFriends(a.id, b.id)).toBe(true);
    expect(hasRequest(a.id, b.id) || hasRequest(b.id, a.id)).toBe(false);
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("alreadyFriends");
    expect(listFriends(a.id)).toEqual([{ id: b.id, nickname: b.nickname!, since: NOW + 1 }]);
    expect(friendIds(b.id)).toEqual([a.id]);
  });

  test("accept, decline and cancel", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    sendFriendRequest(a.id, b.id, NOW);
    sendFriendRequest(c.id, b.id, NOW);
    expect(acceptRequest(b.id, a.id, NOW)).toBe("accepted");
    expect(acceptRequest(b.id, a.id, NOW)).toBe("notFound");
    expect(declineRequest(b.id, c.id)).toBe(true);
    expect(declineRequest(b.id, c.id)).toBe(false);
    sendFriendRequest(c.id, b.id, NOW);
    expect(cancelRequest(c.id, b.id)).toBe(true);
    expect(listIncoming(b.id)).toEqual([]);
    expect(removeFriend(a.id, b.id)).toBe(true);
    expect(removeFriend(a.id, b.id)).toBe(false);
  });

  test("a request to oneself is notFound", () => {
    const a = makeUser(uniqueNick());
    expect(sendFriendRequest(a.id, a.id, NOW)).toBe("notFound");
  });

  test("at most 50 pending requests sent", () => {
    const a = makeUser(uniqueNick());
    for (let i = 0; i < SOCIAL.MAX_PENDING_OUT; i++) {
      expect(sendFriendRequest(a.id, makeUser(uniqueNick()).id, NOW)).toBe("requested");
    }
    expect(sendFriendRequest(a.id, makeUser(uniqueNick()).id, NOW)).toBe("limit");
  });

  test("at most 200 friends, on both sides of a crossed request", () => {
    const a = makeUser(uniqueNick());
    for (let i = 0; i < SOCIAL.MAX_FRIENDS; i++) expect(befriend(a.id, makeUser(uniqueNick()).id, NOW)).toBe(true);
    const b = makeUser(uniqueNick());
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("limit");
    sendFriendRequest(b.id, a.id, NOW);
    expect(acceptRequest(a.id, b.id, NOW)).toBe("limit");
  });
});

describe("blocks", () => {
  test("undo the friendship and the requests, hide from search both ways, refuse new requests", () => {
    const base = uniqueNick("k");
    const a = makeUser(`${base}a`);
    const b = makeUser(`${base}b`);
    befriend(a.id, b.id, NOW);
    sendFriendRequest(a.id, makeUser(uniqueNick()).id, NOW);
    blockUser(a.id, b.id, NOW);
    expect(areFriends(a.id, b.id)).toBe(false);
    expect(searchUsers(a.id, base).map((r) => r.nickname)).not.toContain(b.nickname);
    expect(searchUsers(b.id, base).map((r) => r.nickname)).not.toContain(a.nickname);
    expect(sendFriendRequest(b.id, a.id, NOW)).toBe("notFound");
    expect(sendFriendRequest(a.id, b.id, NOW)).toBe("notFound");
    expect(listBlocked(a.id)).toEqual([{ id: b.id, nickname: b.nickname! }]);
  });

  test("a block cancels pending requests between the two; unblocking does not restore the friendship", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    sendFriendRequest(b.id, a.id, NOW);
    blockUser(a.id, b.id, NOW);
    expect(hasRequest(b.id, a.id)).toBe(false);
    expect(unblockUser(a.id, b.id)).toBe(true);
    expect(unblockUser(a.id, b.id)).toBe(false);
    expect(areFriends(a.id, b.id)).toBe(false);
    expect(relationOf(a.id, b.id)).toBe("none");
  });
});
