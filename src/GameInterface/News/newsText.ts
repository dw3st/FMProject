/**
 * Text of a world news item (`news.<kind>.<variant>.{title,text}`, `.claude/rules/game/press.md` → "Notícias"):
 * the stored params with competition / league slugs turned into names, the fee formatted and the award,
 * national-team, record and press-quote keys translated. Pure.
 */
import type { NewsItem } from "@/types/newsTypes";
import type { LeagueData } from "@/types/playerTypes";
import { newsVariant } from "@/Domain/news/buildDayNews";
import { competitionName, nationalCompetitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { formatFee } from "@/Domain/money";
import { PRESS } from "@/Domain/press/pressConfig";

export type NewsT = (key: string, opts?: Record<string, unknown>) => string;

function compName(slug: string, leagues: LeagueData[], lang: string): string {
  if (!slug) return "";
  return nationalCompetitionName(slug, lang) ?? competitionName(slug, leagues, lang);
}

/** Interpolation values of an item, ready for the `news.<kind>` strings. */
export function newsParams(item: NewsItem, t: NewsT, leagues: LeagueData[], lang: string): Record<string, string> {
  const raw = item.params;
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) p[k] = String(v);
  if (typeof raw.competition === "string") p.competition = compName(raw.competition, leagues, lang);
  if (typeof raw.league === "string") p.league = compName(raw.league, leagues, lang);
  if (typeof raw.fee === "number") p.fee = formatFee(raw.fee);
  if (item.kind === "big_transfer" && !raw.from) p.from = t("news.freeAgent");
  if (item.kind === "award") p.award = t(`news.awardKind.${raw.kind}`, { league: p.league ?? "" });
  if (item.kind === "national") {
    p.team = nationalityDisplayName(String(raw.team ?? ""), lang, (k, o) => t(k, o));
    p.event = t(`news.nationalKind.${raw.kind}`, { competition: p.competition ?? "" });
  }
  if (item.kind === "club_record") p.record = t(`news.recordKind.${raw.record}`);
  if (item.kind === "press_quote") {
    const tone = String(raw.key ?? "");
    const key = (PRESS.QUOTE_TONES as readonly string[]).includes(tone) ? tone : "other";
    p.quote = t(`news.pressQuote.${key}`, { manager: p.manager ?? "", player: p.player ?? "", club: p.club ?? "" });
  }
  return p;
}

function newsKey(item: NewsItem): string {
  if (item.kind === "big_transfer" && !item.params.from) return "news.big_transfer_free";
  return `news.${item.kind}.${newsVariant(item.id)}`;
}

/** Headline of the item. */
export function newsHeadline(item: NewsItem, t: NewsT, leagues: LeagueData[], lang: string): string {
  return t(`${newsKey(item)}.title`, newsParams(item, t, leagues, lang));
}

/** One-line body of the item. */
export function newsLine(item: NewsItem, t: NewsT, leagues: LeagueData[], lang: string): string {
  return t(`${newsKey(item)}.text`, newsParams(item, t, leagues, lang));
}
