/** World news (`/news`, `.claude/rules/game/press.md` → "Notícias"): filters, the list by day, "Load more". */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { statsCompetitionOptions } from "@/GameInterface/statsCompetitionOptions";
import { ALL_COMPETITIONS } from "@/Domain/stats/rankings";
import { fetchNews, type NewsScopeFilter } from "@/GameInterface/News/newsApi";
import { NewsList } from "@/GameInterface/News/NewsList";
import type { NewsItem } from "@/types/newsTypes";
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import countriesRaw from "@/Data/countries.json";

const COUNTRY_BY_NAME = new Map(Object.values(countriesRaw as Record<string, CountryEntry>).map((c) => [c.name, c]));
const PAGE = 40;

export function NewsScreen() {
  const { t, i18n } = useTranslation();
  const { session, currentDate, loading: saveLoading } = useGameSave();
  const saveId = session?.saveId;

  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [scope, setScope] = useState<NewsScopeFilter>("all");
  const [competition, setCompetition] = useState<string>(ALL_COMPETITIONS);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!saveLoading && !session) window.location.href = "/new-game";
  }, [saveLoading, session]);

  useEffect(() => {
    void fetch("/api/leagues").then((r) => (r.ok ? r.json() : [])).then(setLeagues).catch(() => setLeagues([]));
  }, []);

  const options = useMemo(() => {
    if (leagues.length === 0) return [];
    const opts = statsCompetitionOptions(leagues, COUNTRY_BY_NAME, i18n.language, t);
    return opts.map((o) => (o.value === ALL_COMPETITIONS ? { ...o, label: t("news.filters.allCompetitions") } : o));
  }, [leagues, i18n.language, t]);

  const comp = competition === ALL_COMPETITIONS ? undefined : competition;

  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    setItems(null);
    setError(false);
    fetchNews(saveId, { scope, competition: comp, limit: PAGE })
      .then((page) => { if (!cancelled) { setItems(page.items); setNextBefore(page.nextBefore); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [saveId, scope, comp, currentDate]);

  const loadMore = () => {
    if (!saveId || !nextBefore) return;
    setLoadingMore(true);
    fetchNews(saveId, { scope, competition: comp, before: nextBefore, limit: PAGE })
      .then((page) => {
        setItems((prev) => {
          const seen = new Set((prev ?? []).map((n) => n.id));
          return [...(prev ?? []), ...page.items.filter((n) => !seen.has(n.id))];
        });
        setNextBefore(page.nextBefore);
      })
      .catch(() => setError(true))
      .finally(() => setLoadingMore(false));
  };

  return (
    <ScreenContainer>
      <ScreenTitle accent={t("screenTitles.news.accent")}>{t("screenTitles.news.main")}</ScreenTitle>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
            {t("news.filters.label")}
          </span>
          <OptionChips
            aria-label={t("news.filters.label")}
            value={scope}
            onChange={setScope}
            options={[
              { key: "all" as const, label: t("news.filters.all") },
              { key: "club" as const, label: t("news.filters.club") },
              { key: "league" as const, label: t("news.filters.league") },
              { key: "followed" as const, label: t("news.filters.followed") },
            ]}
          />
        </div>
        {options.length > 0 && (
          <SelectCombobox
            label={t("news.filters.competition")}
            labelId="news-competition"
            value={competition}
            onChange={setCompetition}
            options={options}
            placeholder={t("leagues.searchLeaguesPlaceholder")}
            className="w-full max-w-sm"
          />
        )}
      </div>

      {error ? (
        <p className="text-sm text-destructive">{t("news.error")}</p>
      ) : items === null ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("news.empty")}</p>
      ) : (
        <>
          <NewsList items={items} leagues={leagues} />
          {nextBefore && (
            <div>
              <Button variant="secondary" flush onClick={loadMore} disabled={loadingMore}>
                {t("news.more")}
              </Button>
            </div>
          )}
        </>
      )}
    </ScreenContainer>
  );
}
