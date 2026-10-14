import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { PRESS } from "@/Domain/press/pressConfig";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);
const keys = [
  ...PRESS.PRIORITY.map((t) => `press.q.match.${t}`),
  "press.q.squad.good", "press.q.squad.bad", "press.q.player.star", "press.q.player.scorer", "press.q.player.culprit", "press.q.job",
  ...Object.keys(PRESS.TONE).map((t) => `press.a.${t}`),
];
describe("press i18n", () => {
  for (const lang of [en, pt]) for (const k of keys) for (const v of ["0", "1"])
    test(`${k}.${v}`, () => expect(typeof get(lang, `${k}.${v}`)).toBe("string"));
  for (const lang of [en, pt]) for (const t of PRESS.PRIORITY)
    test(`press.trigger.${t}`, () => expect(typeof get(lang, `press.trigger.${t}`)).toBe("string"));
});
