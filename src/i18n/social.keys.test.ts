import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import type { SocialErrorCode } from "@/types/socialTypes";

const ERRORS: Record<SocialErrorCode, true> = {
  invalidNickname: true, nicknameTaken: true, tooSoon: true, noNickname: true, invalidQuery: true, notFound: true,
  alreadyFriends: true, limit: true, invalidBody: true, noAccess: true, rateLimited: true, tooLarge: true, unauthorized: true,
  network: true,
};

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const keys = [
  "button", "buttonShort", "unreadBadge", "panelTitle", "close", "loading", "yourCode", "copy", "copied",
  "changeNickname", "changeableOn", "tabs.friends", "tabs.requests", "tabs.add", "groups.playing", "groups.online",
  "groups.offline", "groups.worlds", "status.playing", "status.online", "status.offline", "noFriends", "actions",
  "unfriend", "block", "confirmUnfriend", "confirmBlock", "requests.incoming", "requests.outgoing", "requests.none",
  "requests.accept", "requests.decline", "requests.cancel", "add.searchLabel", "add.searchHint", "add.noResults",
  "add.add", "add.sent", "add.friend", "add.accept", "add.codeLabel", "add.sendCode", "add.requested",
  "add.befriended", "add.blocked", "add.noBlocked", "add.unblock", "nickname.title", "nickname.hint",
  "nickname.label", "nickname.save", "nickname.cancel", "chat.minimize", "chat.close", "chat.loadMore", "chat.empty",
  "chat.placeholder", "chat.send", "chat.counter", "chat.typing", "chat.readOnly", "chat.unavailable", "chat.world",
  "chat.minimizedTab",
  ...Object.keys(ERRORS).map((e) => `errors.${e}`),
].map((k) => `social.${k}`);

describe("social i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    for (const k of keys) test(`${name} ${k}`, () => expect(typeof get(lang, k)).toBe("string"));
  }
});
