import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { ALL_TAUNT_IDS, REACTIONS } from "@/Domain/rivals/taunts";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const keys = [
  ...[
    "tabRivals", "tabResults", "rivalsTitle", "rivalsHint", "resultsTitle", "positionValue", "nextValue", "liveLine",
    "halfLine", "endedLine", "staleLine", "liveMinute", "goalPopup", "scorer", "pens", "filterLabel", "filterAll",
    "empty", "noRivals", "loadMore", "stripLabel", "actionsLabel", "phrases", "sent", "liveBadge",
    "col.rank", "col.position", "col.form", "col.last", "col.next", "col.live",
    "card.title", "card.link",
    ...REACTIONS.map((r) => `reactions.${r}`),
    ...ALL_TAUNT_IDS.map((id) => `taunts.${id}`),
  ].map((k) => `rivals.${k}`),
  ...["self", "invalidTaunt", "rateLimited"].map((k) => `world.errors.${k}`),
];

describe("rivals i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    test(`${name} has every key`, () => {
      for (const k of keys) expect(typeof get(lang, k), `${name} ${k}`).toBe("string");
    });
    test(`${name} has no emoji in the rivals texts`, () => {
      expect(JSON.stringify(get(lang, "rivals"))).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  }
});
