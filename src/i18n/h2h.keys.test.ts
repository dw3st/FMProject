import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const keys = [
  "pausesLeft", "pausedBy", "resume", "opponentAway", "waiting",
  "closed.simulated", "closed.left", "closed.lost", "closed.failed",
].map((k) => `h2h.${k}`);

describe("h2h i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    test(`${name} has every key`, () => {
      for (const k of keys) expect(typeof get(lang, k), `${name} ${k}`).toBe("string");
    });
    test(`${name} has no emoji in the h2h texts`, () => {
      expect(JSON.stringify(get(lang, "h2h"))).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  }
});
