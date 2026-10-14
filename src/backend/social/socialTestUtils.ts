// Test helpers for the social store, routes and socket. Never imported by production code.
import { randomUUID } from "node:crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { setNickname } from "@/backend/social/socialStore";

export interface TestUser {
  id: string;
  email: string;
  token: string;
  nickname: string | null;
}

/** A nickname nobody has in this test run (13 characters, no reserved word). */
export function uniqueNick(prefix = "u"): string {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** A fresh user with a session; with `nickname`, the nickname is set (and its cooldown starts now). */
export function makeUser(nickname?: string): TestUser {
  const email = `${randomUUID()}@test.local`;
  const { user, session } = devAutoLogin(email);
  let nick: string | null = null;
  if (nickname !== undefined) {
    const r = setNickname(user.id, nickname, Date.now());
    if (!r.ok) throw new Error(`could not set nickname ${nickname}: ${r.error}`);
    nick = r.nickname;
  }
  return { id: user.id, email, token: session.token, nickname: nick };
}
