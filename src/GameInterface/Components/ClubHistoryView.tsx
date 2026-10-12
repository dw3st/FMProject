import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LeagueData } from "@/types/playerTypes";
import type {
  ClubFacts, ClubHistoryResponse, ClubLegend, ClubRecordBroken, ClubRecordKind, ClubTopPlayer,
} from "@/types/clubHistoryTypes";
import { competitionName } from "@/Domain/world/labels";
import { CLUB_LEGENDS } from "@/Domain/clubHistory/clubHistory";
import { Panel } from "@/GameInterface/ui/Panel";
import { Icon } from "@/GameInterface/Icons";
import { NameCell, NumberCell, RankCell, StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { clubRecordTexts } from "@/GameInterface/clubRecordText";

const RECORD_ORDER: ClubRecordKind[] = [
  "biggestWin", "biggestLoss", "mostGoalsSeason", "highestFinish", "unbeaten", "recordSigning", "recordSale",
];

/**
 * Club history and records (`.claude/rules/game/club-history.md`): titles, seasons, top scorers and
 * appearances, records. Any club of the save; the data starts when the career began.
 */
export function ClubHistoryView({ saveId, squadId, leagueSlug }: { saveId: string; squadId: string; leagueSlug: string }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<ClubHistoryResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);

  useEffect(() => {
    setData(null);
    setFailed(false);
    let alive = true;
    fetch(`/api/saves/${encodeURIComponent(saveId)}/clubs/${encodeURIComponent(squadId)}/history`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d: ClubHistoryResponse) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [saveId, squadId]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: LeagueData[]) => setLeagues(Array.isArray(d) ? d : []))
      .catch(() => setLeagues([]));
  }, []);

  if (failed) return <p className="text-sm text-muted-foreground m-0">{t("clubHistory.loadFailed")}</p>;
  if (!data) return <p className="text-sm text-muted-foreground m-0">{t("clubHistory.loading")}</p>;

  const name = (slug: string) => competitionName(slug, leagues, i18n.language);
  const titleName = (title: string) => {
    const [kind, slug = ""] = title.split(":");
    return kind === "promotion" ? t("clubHistory.promotion", { league: name(slug) }) : name(slug);
  };
  const seasonsNewestFirst = [...data.seasons].reverse();
  const records = RECORD_ORDER
    .filter((k) => data.records[k])
    .map((k) => ({ kind: k, value: data.records[k] }) as ClubRecordBroken);

  return (
    <div className="flex flex-col gap-6 overflow-y-auto">
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        {data.venue && (
          <div>
            <Caption>{t("clubHistory.stadium")}</Caption>
            <p className="m-0 text-sm text-foreground">
              {data.venue.name}
              <span className="text-muted-foreground tabular-nums">
                {data.venue.city ? ` · ${data.venue.city}` : ""}
                {data.venue.capacity > 0 ? ` · ${t("clubHistory.capacity", { seats: data.venue.capacity.toLocaleString(i18n.language) })}` : ""}
              </span>
            </p>
          </div>
        )}
        {data.manager && (
          <div>
            <Caption>{t("clubHistory.manager")}</Caption>
            <p className="m-0 text-sm text-foreground">{data.manager}</p>
          </div>
        )}
        {data.pastManagers.length > 0 && (
          <div>
            <Caption>{t("clubHistory.pastManagers")}</Caption>
            <p className="m-0 text-sm text-foreground">{data.pastManagers.join(", ")}</p>
          </div>
        )}
      </div>
      {data.since && <p className="m-0 text-sm text-muted-foreground">{t("clubHistory.since", { season: data.since })}</p>}

      <Panel title={t("clubHistory.titles")}>
        {data.titles.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("clubHistory.noTitles")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.titles.map((g) => (
              <div key={g.title} className="flex items-start gap-3 rounded-md border border-border p-3">
                <Icon name={g.title.startsWith("promotion") ? "arrow-up-right" : "trophy"} size={20} className="text-chart-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="m-0 font-semibold text-foreground truncate">
                    {titleName(g.title)}
                    <span className="ml-2 font-display font-bold tabular-nums text-primary">×{g.seasons.length}</span>
                  </p>
                  <p className="m-0 text-sm text-muted-foreground tabular-nums">{g.seasons.join(", ")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <LegendsPanel legends={data.legends} squadId={data.squadId} leagueSlug={leagueSlug} />

      {data.facts.seasons > 0 && <FactsPanel facts={data.facts} leagueName={name} />}

      <Panel title={t("clubHistory.seasons")}>
        {seasonsNewestFirst.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("clubHistory.empty")}</p>
        ) : (
          <StatsTable
            head={
              <>
                <StatsHead>{t("clubHistory.col.season")}</StatsHead>
                <StatsHead>{t("clubHistory.col.league")}</StatsHead>
                <StatsHead align="center">{t("clubHistory.col.position")}</StatsHead>
                <StatsHead align="center">{t("clubHistory.col.played")}</StatsHead>
                <StatsHead align="center">{t("clubHistory.col.won")}</StatsHead>
                <StatsHead align="center">{t("clubHistory.col.drawn")}</StatsHead>
                <StatsHead align="center">{t("clubHistory.col.lost")}</StatsHead>
                <StatsHead align="center">{t("clubHistory.col.goals")}</StatsHead>
                <StatsHead align="center">{t("clubHistory.col.points")}</StatsHead>
                <StatsHead>{t("clubHistory.col.topScorer")}</StatsHead>
                <StatsHead>{t("clubHistory.col.titles")}</StatsHead>
              </>
            }
          >
            {seasonsNewestFirst.map((s) => (
              <StatsRow key={`${s.season}-${s.league}`}>
                <StatsCell className="tabular-nums whitespace-nowrap text-muted-foreground">{s.season}</StatsCell>
                <StatsCell className="font-semibold text-foreground max-w-[14rem] truncate">{name(s.league)}</StatsCell>
                <StatsCell align="center" className="whitespace-nowrap tabular-nums font-bold">
                  {s.position ?? "-"}
                  {s.move && (
                    <span className="ml-1 inline-flex align-middle" title={t(`clubHistory.${s.move}`)} aria-label={t(`clubHistory.${s.move}`)}>
                      <Icon
                        name={s.move === "promoted" ? "arrow-up-right" : "arrow-down-left"}
                        size={16}
                        className={s.move === "promoted" ? "text-primary" : "text-destructive"}
                      />
                    </span>
                  )}
                </StatsCell>
                <NumberCell>{s.played}</NumberCell>
                <NumberCell>{s.won}</NumberCell>
                <NumberCell>{s.drawn}</NumberCell>
                <NumberCell>{s.lost}</NumberCell>
                <NumberCell>{s.gf}:{s.ga}</NumberCell>
                <NumberCell strong>{s.points}</NumberCell>
                <StatsCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {s.topScorer ? <><span className="text-foreground">{s.topScorer.name}</span> <span className="tabular-nums">({s.topScorer.goals})</span></> : "-"}
                </StatsCell>
                <StatsCell className="text-sm text-muted-foreground">{s.titles.map(titleName).join(", ")}</StatsCell>
              </StatsRow>
            ))}
          </StatsTable>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopTable title={t("clubHistory.topScorers")} rows={data.topScorers} by="goals" squadId={data.squadId} leagueSlug={leagueSlug} />
        <TopTable title={t("clubHistory.topApps")} rows={data.topApps} by="apps" squadId={data.squadId} leagueSlug={leagueSlug} />
      </div>

      <Panel title={t("clubHistory.records")}>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("clubHistory.noRecords")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {records.map((r) => {
              const x = clubRecordTexts(r, t, name);
              return (
                <div key={r.kind} className="rounded-md border border-border p-4">
                  <Caption>{x.label}</Caption>
                  <p className="m-0 font-display font-bold tabular-nums text-3xl leading-none text-foreground">{x.value}</p>
                  <p className="m-0 mt-2 text-sm text-muted-foreground">{x.detail}</p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Label-style caption above a value (not tied to a form field). */
function Caption({ children }: { children: ReactNode }) {
  return <p className="m-0 mb-1 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{children}</p>;
}

function TopTable({ title, rows, by, squadId, leagueSlug }: {
  title: string; rows: ClubTopPlayer[]; by: "goals" | "apps"; squadId: string; leagueSlug: string;
}) {
  const { t } = useTranslation();
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("clubHistory.nobody")}</p>
      ) : (
        <StatsTable
          head={
            <>
              <StatsHead align="center">#</StatsHead>
              <StatsHead>{t("clubHistory.col.player")}</StatsHead>
              <StatsHead align="center">{t("clubHistory.col.goals")}</StatsHead>
              <StatsHead align="center">{t("clubHistory.col.apps")}</StatsHead>
              <StatsHead align="center">{t("clubHistory.col.assists")}</StatsHead>
            </>
          }
        >
          {rows.map((p, i) => (
            <StatsRow key={p.playerId} highlight={p.current}>
              <RankCell rank={i + 1} />
              <NameCell
                highlight={p.current}
                href={p.current ? `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(squadId)}/${encodeURIComponent(p.playerId)}` : undefined}
              >
                <span className="truncate">{p.name}</span>
                {p.retired && <span className="shrink-0 rounded border border-border px-2 py-0.5 text-sm font-normal text-muted-foreground">{t("clubHistory.retired")}</span>}
              </NameCell>
              <NumberCell strong={by === "goals"}>{p.goals}</NumberCell>
              <NumberCell strong={by === "apps"}>{p.apps}</NumberCell>
              <NumberCell>{p.assists}</NumberCell>
            </StatsRow>
          ))}
        </StatsTable>
      )}
    </Panel>
  );
}

/** Idols and legends of the club (#151): rule from the games, goals, titles and awards at it. */
function LegendsPanel({ legends, squadId, leagueSlug }: { legends: ClubLegend[]; squadId: string; leagueSlug: string }) {
  const { t } = useTranslation();
  const L = CLUB_LEGENDS;
  return (
    <Panel title={t("clubHistory.legends")}>
      <p className="m-0 mb-3 text-sm text-muted-foreground">
        {t("clubHistory.legendsAbout", {
          idolApps: L.IDOL_APPS, idolWith: L.IDOL_APPS_WITH, idolGoals: L.IDOL_GOALS, idolTitles: L.IDOL_TITLES,
          legendApps: L.LEGEND_APPS, legendWith: L.LEGEND_APPS_WITH, legendGoals: L.LEGEND_GOALS,
          legendTitles: L.LEGEND_TITLES, legendAwards: L.LEGEND_AWARDS,
        })}
      </p>
      {legends.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("clubHistory.noLegends")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {legends.map((p) => {
            const status = p.current ? "current" : p.retired ? "retired" : "left";
            const legend = p.tier === "legend";
            const href = p.current
              ? `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(squadId)}/${encodeURIComponent(p.playerId)}`
              : undefined;
            return (
              <div key={p.playerId}
                className={`flex items-start gap-3 rounded-md border p-3 ${legend ? "border-chart-4/60" : "border-border"}`}>
                <Icon name={legend ? "crown" : "star-filled"} size={20} className={`shrink-0 mt-0.5 ${legend ? "text-chart-4" : "text-primary"}`} />
                <div className="min-w-0 flex flex-col gap-0.5">
                  {href ? (
                    <a href={href} className="font-semibold text-foreground truncate hover:text-primary">{p.name}</a>
                  ) : (
                    <span className="font-semibold text-foreground truncate">{p.name}</span>
                  )}
                  <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${legend ? "text-chart-4" : "text-primary"}`}>
                    {t(`clubHistory.tier.${p.tier}`)} · {t(`clubHistory.status.${status}`)}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t("clubHistory.legendLine", { apps: p.apps, goals: p.goals, titles: p.titles ?? 0 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/** Facts and curiosities (#151), derived from the seasons and the players' totals at the club. */
function FactsPanel({ facts, leagueName }: { facts: ClubFacts; leagueName: (slug: string) => string }) {
  const { t } = useTranslation();
  const cards: { key: string; value: string; detail?: string }[] = [
    { key: "seasons", value: String(facts.seasons) },
    { key: "titles", value: String(facts.titles) },
    { key: "moves", value: `${facts.promotions} / ${facts.relegations}` },
    { key: "leagueGoals", value: String(facts.leagueGoals) },
  ];
  if (facts.bestSeason) {
    cards.push({
      key: "bestSeason", value: facts.bestSeason.position !== null ? t("clubHistory.factDetail.position", { position: facts.bestSeason.position }) : "-",
      detail: `${leagueName(facts.bestSeason.league)} · ${t("clubHistory.factDetail.points", { points: facts.bestSeason.points, season: facts.bestSeason.season })}`,
    });
  }
  if (facts.mostTeamGoals) {
    cards.push({
      key: "mostTeamGoals", value: String(facts.mostTeamGoals.goals),
      detail: t("clubHistory.factDetail.goals", { league: leagueName(facts.mostTeamGoals.league), season: facts.mostTeamGoals.season }),
    });
  }
  if (facts.topScorer) {
    cards.push({ key: "topScorer", value: String(facts.topScorer.goals), detail: t("clubHistory.factDetail.player", { name: facts.topScorer.name }) });
  }
  if (facts.mostApps) {
    cards.push({ key: "mostApps", value: String(facts.mostApps.apps), detail: t("clubHistory.factDetail.player", { name: facts.mostApps.name }) });
  }
  return (
    <Panel title={t("clubHistory.facts")}>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className="rounded-md border border-border p-4 min-w-0">
            <Caption>{t(`clubHistory.fact.${c.key}`)}</Caption>
            <p className="m-0 font-display font-bold tabular-nums text-3xl leading-none text-foreground">{c.value}</p>
            {c.detail && <p className="m-0 mt-2 text-sm text-muted-foreground truncate">{c.detail}</p>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
