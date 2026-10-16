import { describe, expect, test } from "bun:test";
import i18next from "i18next";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import type { PassageEnd, StandingItemKey } from "@/types/standingsTypes";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const ITEMS: StandingItemKey[] = [
  "objective_met", "above_target", "below_target", "league_title", "promoted", "relegated", "cup", "continental",
  "best_manager", "world_manager", "national_title", "national_objective", "half", "sacked",
];
const REASONS: PassageEnd[] = ["rollover", "club_change", "sacked", "contract"];

const keys = [
  ...[
    "tab", "tabLeague", "tabsLabel", "title", "hint", "current", "closed", "total", "partial", "currentSeason", "season",
    "position", "positionTarget", "empty", "noSeasons", "noItems", "dashboardLine",
    ...REASONS.map((r) => `reason.${r}`),
    ...ITEMS.map((i) => `items.${i}`),
  ].map((k) => `world.standings.${k}`),
  ...["subject", "preview_one", "preview_other", "body_one", "body_other", "open"].map((k) => `world.inbox.season_closed.${k}`),
];

describe("standings i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    test(`${name} has every key`, () => {
      for (const k of keys) expect(typeof get(lang, k), `${name} ${k}`).toBe("string");
    });
  }
  test("the season message agrees with the points (1 point, 3 points)", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: "pt-BR", resources: { en: { translation: en }, "pt-BR": { translation: pt } } });
    const vars = (points: number) => ({ points, count: points, rank: 2, of: 3 });
    expect(i18n.t("world.inbox.season_closed.preview", vars(1))).toBe("1 ponto · 2º de 3");
    expect(i18n.t("world.inbox.season_closed.preview", vars(3))).toBe("3 pontos · 2º de 3");
    await i18n.changeLanguage("en");
    expect(i18n.t("world.inbox.season_closed.preview", vars(1))).toBe("1 point · 2 of 3");
    expect(i18n.t("world.inbox.season_closed.preview", vars(3))).toBe("3 points · 2 of 3");
  });
});
