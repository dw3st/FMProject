import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import type { WorldErrorCode } from "@/types/multiplayerTypes";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const ERRORS: Record<WorldErrorCode | "generic", true> = {
  notFound: true, full: true, alreadyMember: true, clubTaken: true, invalidManager: true, invalidClub: true,
  invalidBody: true, ownerOnly: true, transferFirst: true, alreadyStarted: true, notMulti: true, inviteLimit: true,
  noNickname: true, useLeave: true, notMember: true, tooLarge: true, generic: true, ownerLimit: true, lobby: true,
  self: true, invalidTaunt: true, rateLimited: true, publicWorld: true,
};

const keys = [
  "screenTitles.world.main", "screenTitles.world.accent", "nav.world", "inbox.categories.world",
  "newGame.mode.title", "newGame.mode.subtitle", "newGame.mode.solo", "newGame.mode.soloDetail", "newGame.mode.multi",
  "newGame.mode.multiDetail", "newGame.mode.next",
  "startScreen.withFriends", "startScreen.owner", "startScreen.member", "startScreen.lobby", "startScreen.leave",
  "startScreen.leaveConfirmTitle", "startScreen.leaveConfirmBody", "startScreen.deleteWorldBody_one",
  "startScreen.deleteWorldBody_other",
  "world.status.lobby", "world.status.running",
  "world.members.title", "world.members.count", "world.members.manager", "world.members.club", "world.members.role",
  "world.members.actions", "world.members.owner", "world.members.member", "world.members.unemployed",
  "world.members.transfer", "world.members.remove", "world.members.removeConfirmTitle", "world.members.removeConfirmBody",
  "world.members.removeConfirmBodyNoClub", "world.members.transferConfirmTitle", "world.members.transferConfirmBody",
  "world.invite.title", "world.invite.link", "world.invite.copy", "world.invite.copied", "world.invite.copyFailed",
  "world.invite.newCode", "world.invite.newCodeConfirmTitle", "world.invite.newCodeConfirmBody",
  "world.invite.friends", "world.invite.friendsTitle", "world.invite.send", "world.invite.sent", "world.invite.noFriends",
  "world.deadline.title", "world.deadline.hint", "world.deadline.hours_one", "world.deadline.hours_other",
  "world.deadline.none",
  "world.start.button", "world.start.waiting", "world.chat",
  "world.leave.button", "world.leave.transferFirst", "world.leave.confirmTitle", "world.leave.confirmBody",
  "world.leave.deleteBody",
  "world.join.title", "world.join.owner", "world.join.league", "world.join.choose", "world.join.open",
  "world.join.toStart", "world.join.humanClub", "world.join.joinWith", "world.join.clubSubtitle",
  "world.join.clubSubtitleNoLeague",
  "world.invites.title", "world.invites.from", "world.invites.accept", "world.invites.decline",
  ...["member_joined", "member_left", "member_removed"].flatMap((k) => [`world.inbox.${k}.subject`, `world.inbox.${k}.body`]),
  ...Object.keys(ERRORS).map((e) => `world.errors.${e}`),
];

describe("world i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const)
    for (const k of keys) test(`${name} ${k}`, () => expect(typeof get(lang, k)).toBe("string"));
});
