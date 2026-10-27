import { expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const KEYS = [
  "newGame.mode.public", "newGame.mode.publicDetail",
  "startScreen.publicWorld", "startScreen.publicNext", "startScreen.publicJoin", "startScreen.publicFull",
  "world.public.name", "world.public.title", "world.public.nextStep", "world.public.nextStepLabel", "world.public.hint",
  "world.hall.tab", "world.hall.title", "world.hall.hint", "world.hall.empty", "world.hall.noScores", "world.hall.version",
  "world.hall.period", "world.hall.current", "world.hall.nickname", "world.hall.club", "world.hall.points",
  "world.hall.noNickname", "world.errors.publicWorld", "world.errors.noNickname", "social.publicRoom",
  "social.errors.publicRoom", "screenTitles.publicWorld.main", "screenTitles.publicWorld.accent",
  "world.inbox.inactive_warning.subject", "world.inbox.inactive_warning.body",
];
const get = (o: Record<string, unknown>, k: string) => k.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], o);

test.each(KEYS)("%s exists in en and pt-BR", (k) => {
  expect(typeof get(en, k)).toBe("string");
  expect(typeof get(pt, k)).toBe("string");
});
