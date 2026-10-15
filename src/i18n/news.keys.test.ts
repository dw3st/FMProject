import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { PRESS } from "@/Domain/press/pressConfig";
import { NEWS } from "@/Domain/news/buildDayNews";
import type { NewsKind } from "@/types/newsTypes";

const KINDS: Record<NewsKind, true> = {
  thrashing: true, upset: true, champion: true, promoted: true, relegated: true, new_leader: true,
  big_transfer: true, manager_sacked: true, manager_hired: true, award: true,
  star_injury: true, star_retired: true, national: true, club_record: true,
  press_quote: true, press_absent: true, press_promise_kept: true, press_promise_broken: true, world_member: true,
};

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const keys = [
  ...Object.keys(KINDS).flatMap((k) =>
    Array.from({ length: NEWS.VARIANTS }, (_, v) => [`news.${k}.${v}.title`, `news.${k}.${v}.text`]).flat()),
  ...PRESS.QUOTE_TONES.map((tone) => `news.pressQuote.${tone}`),
  "news.pressQuote.other", "news.big_transfer_free.title", "news.big_transfer_free.text",
  "news.world_member_left.title", "news.world_member_left.text",
  "news.awardKind.league_best", "news.awardKind.world_player", "news.awardKind.world_manager",
  "news.nationalKind.champion", "news.nationalKind.favourite_out",
  ...["biggestWin", "biggestLoss", "mostGoalsSeason", "recordSigning", "recordSale", "highestFinish", "unbeaten"]
    .map((r) => `news.recordKind.${r}`),
  "news.filters.all", "news.filters.club", "news.filters.league", "news.filters.followed", "news.filters.competition",
  "news.filters.allCompetitions", "news.empty", "news.more", "news.error", "news.freeAgent",
  "screenTitles.news.main", "screenTitles.news.accent", "dashboard.home.news", "dashboard.home.newsAll",
];

describe("news i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) for (const k of keys)
    test(`${name} ${k}`, () => expect(typeof get(lang, k)).toBe("string"));
});
