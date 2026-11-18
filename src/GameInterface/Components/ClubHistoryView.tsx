import { useEffect, useMemo, useState } from "react";
import { useTableSort } from "@/GameInterface/ui/tableSort";
import { useTranslation } from "react-i18next";
import type { LeagueData } from "@/types/playerTypes";
import type {
  ClubHistoryResponse, ClubLegend, ClubRecordBroken, ClubRecordKind, ClubSeasonRow, ClubTopPlayer,
} from "@/types/clubHistoryTypes";
import { competitionName } from "@/Domain/world/labels";
import { CLUB_LEGENDS } from "@/Domain/clubHistory/clubHistory";
import { newVisualOn } from "@/Domain/art/paintedFaces";
import { stadiumArtFile } from "@/Domain/facilities/stadiumArt";
import { Icon } from "@/GameInterface/Icons";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { PlayerFace, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { LegendLaurel } from "@/GameInterface/Components/LegendLaurel";
import { ProfileHero } from "@/GameInterface/Components/ProfileHero";
import { InfoCard, StatStrip, type StatTone } from "@/GameInterface/Components/StatStrip";
import { TrophyShelf, trophyKindOf } from "@/GameInterface/Components/TrophyShelf";
import { NameCell, NumberCell, RankCell, StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { clubRecordTexts } from "@/GameInterface/clubRecordText";

const RECORD_ORDER: ClubRecordKind[] = [
  "biggestWin", "biggestLoss", "unbeaten", "recordSigning", "recordSale", "mostGoalsSeason", "highestFinish",
];
/** Records shown even before they exist (dimmed), so an empty history still has its cards. */
const RECORD_PLACEHOLDERS: ClubRecordKind[] = ["biggestWin", "biggestLoss", "unbeaten", "recordSigning"];
const RECORD_TONE: Partial<Record<ClubRecordKind, StatTone>> = { biggestWin: "good", biggestLoss: "bad" };

const playerHref = (leagueSlug: string, squadId: string, playerId: string) =>
  `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(squadId)}/${encodeURIComponent(playerId)}`;

const isTrophy = (title: string) => !title.startsWith("promotion:");

/**
 * Club history and records (`.claude/rules/game/club-history.md`, layout 12.19 "Galeria"): the banner with the
 * stadium, the headline numbers, the trophy room, idols and legends, seasons, top players and records. Any club of
 * the save; the data starts when the career began, and every block has its own empty look.
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
  const f = data.facts;
  const best = data.records.highestFinish;
  const venue = data.venue
    ? [data.venue.name, data.venue.city, data.venue.capacity > 0 ? t("clubHistory.capacity", { seats: data.venue.capacity.toLocaleString(i18n.language) }) : null]
      .filter(Boolean).join(" · ")
    : null;

  return (
    <div className="flex flex-col gap-6 overflow-y-auto pb-2">
      <div className="flex flex-col">
        <ProfileHero
          attached
          art={stadiumArtFile(data.stadiumLevel)}
          visual={(
            <ClubLogo
              logoUrl={squadLogoUrl(data.squadId)} primaryColor={data.colors[0]} secondaryColor={data.colors[1]}
              className="w-24 h-24 phone:w-16 phone:h-16" imgClassName="w-full h-full object-contain"
            />
          )}
          eyebrow={data.since ? t("clubHistory.since", { season: data.since }) : undefined}
          title={data.name}
          lines={[
            venue,
            data.manager ? <>{t("clubHistory.managerLine")} <span className="font-semibold text-foreground">{data.manager}</span></> : null,
            data.pastManagers.length > 0 ? <span className="block truncate">{t("clubHistory.pastManagersLine", { names: data.pastManagers.join(", ") })}</span> : null,
          ]}
        />
        <StatStrip
          attached
          items={[
            { key: "seasons", label: t("clubHistory.strip.seasons"), value: f.seasons },
            { key: "titles", label: t("clubHistory.strip.titles"), value: f.titles, tone: f.titles > 0 ? "gold" : undefined },
            {
              key: "promotions", label: t("clubHistory.strip.promotions"), value: f.promotions, tone: f.promotions > 0 ? "good" : undefined,
              detail: f.relegations > 0 ? t("clubHistory.relegationsCount", { count: f.relegations }) : undefined,
            },
            {
              key: "best", label: t("clubHistory.strip.bestFinish"),
              value: best ? t("clubHistory.factDetail.position", { position: best.position }) : "-",
              detail: best ? name(best.league) : undefined,
            },
            { key: "goals", label: t("clubHistory.strip.leagueGoals"), value: f.leagueGoals },
            { key: "idols", label: t("clubHistory.strip.idols"), value: data.legends.length, tone: data.legends.length > 0 ? "gold" : undefined },
          ]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <section className="flex flex-col gap-3 min-w-0">
          <SectionTitle>{t("clubHistory.trophyRoom")}</SectionTitle>
          {data.trophies.length === 0 ? (
            <p className="text-sm text-muted-foreground m-0">{t("clubHistory.noTitles")}</p>
          ) : (
            <TrophyShelf items={data.trophies.map((x) => ({ key: x.title, kind: trophyKindOf(x.title), count: x.count, label: titleName(x.title) }))} />
          )}
          <Promotions titles={data.titles} label={titleName} />
        </section>
        <LegendsBlock data={data} leagueSlug={leagueSlug} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2 items-start">
        <SeasonsBlock seasons={data.seasons} leagueName={name} titleName={titleName} />
        <TopPlayersBlock data={data} leagueSlug={leagueSlug} />
      </div>

      <RecordsBlock data={data} leagueName={name} />
    </div>
  );
}

/** Promotions are not trophies: one line under the shelf. */
function Promotions({ titles, label }: { titles: ClubHistoryResponse["titles"]; label: (title: string) => string }) {
  const promos = titles.filter((g) => !isTrophy(g.title));
  if (promos.length === 0) return null;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1">
      {promos.map((g) => (
        <li key={g.title} className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
          <Icon name="trend-up" size={16} className="text-star-green shrink-0" />
          <span className="text-foreground">{label(g.title)}</span> {g.seasons.join(", ")}
        </li>
      ))}
    </ul>
  );
}

/** Idols and legends (#151) as rows, then the player of the squad closest to becoming one. */
function LegendsBlock({ data, leagueSlug }: { data: ClubHistoryResponse; leagueSlug: string }) {
  const { t } = useTranslation();
  const L = CLUB_LEGENDS;
  const art = newVisualOn();
  const next = data.nextIdol;
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <SectionTitle>{t("clubHistory.legends")}</SectionTitle>
      <div className="rounded-md border border-border bg-card divide-y divide-border/60 overflow-hidden">
        {data.legends.map((p) => <LegendRow key={p.playerId} p={p} squadId={data.squadId} leagueSlug={leagueSlug} art={art} />)}
        <div className="flex items-center gap-4 px-4 py-3.5">
          <span className="w-16 h-16 shrink-0 rounded-full border-2 border-border bg-secondary/40 flex items-center justify-center font-display font-bold text-2xl text-muted-foreground" aria-hidden>?</span>
          {next ? (
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <p className="m-0 text-sm text-muted-foreground">
                {t("clubHistory.nextIdol")}{" "}
                <a href={playerHref(leagueSlug, data.squadId, next.playerId)} className="font-semibold text-foreground no-underline hover:text-primary">{next.name}</a>
                <span className="tabular-nums"> · {t("clubHistory.nextIdolGames", { apps: next.apps, target: next.target })}</span>
              </p>
              <span className="block h-1.5 rounded bg-border overflow-hidden max-w-64" aria-hidden>
                <span className="block h-full bg-primary" style={{ width: `${Math.min(100, Math.round((next.apps / next.target) * 100))}%` }} />
              </span>
            </div>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">{data.legends.length === 0 ? t("clubHistory.noLegendsYet") : t("clubHistory.noNextIdol")}</p>
          )}
        </div>
      </div>
      <p className="m-0 text-sm text-muted-foreground">
        {t("clubHistory.legendsAbout", {
          idolApps: L.IDOL_APPS, idolWith: L.IDOL_APPS_WITH, idolGoals: L.IDOL_GOALS, idolTitles: L.IDOL_TITLES, idolAwards: L.IDOL_AWARDS,
          legendApps: L.LEGEND_APPS, legendWith: L.LEGEND_APPS_WITH, legendGoals: L.LEGEND_GOALS,
          legendTitles: L.LEGEND_TITLES, legendAwards: L.LEGEND_AWARDS,
        })}
      </p>
    </section>
  );
}

function LegendRow({ p, squadId, leagueSlug, art }: { p: ClubLegend; squadId: string; leagueSlug: string; art: boolean }) {
  const { t } = useTranslation();
  const status = p.current ? "current" : p.retired ? "retired" : "left";
  const legend = p.tier === "legend";
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <PlayerFace playerId={p.playerId} size={64} fallback={playerInitials(p.name)} ringClassName={legend ? "border-2 border-star-gold" : "border-2 border-primary"} />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="flex items-center gap-2 min-w-0">
          {p.current
            ? <a href={playerHref(leagueSlug, squadId, p.playerId)} className="font-semibold text-foreground truncate no-underline hover:text-primary">{p.name}</a>
            : <span className="font-semibold text-foreground truncate">{p.name}</span>}
          <span className={`inline-flex items-center gap-1 shrink-0 text-sm font-semibold ${legend ? "text-star-gold" : "text-primary"}`}>
            <Icon name={legend ? "crown" : "star-filled"} size={16} />{t(`clubHistory.tier.${p.tier}`)}
          </span>
        </span>
        <span className="text-sm text-muted-foreground tabular-nums truncate">
          {t("clubHistory.legendLine", { apps: p.apps, goals: p.goals, titles: p.titles ?? 0 })} · {t(`clubHistory.status.${status}`)}
        </span>
      </div>
      {art && <LegendLaurel size={48} className={legend ? "" : "opacity-50"} />}
    </div>
  );
}

function SeasonsBlock({ seasons, leagueName, titleName }: {
  seasons: ClubSeasonRow[]; leagueName: (slug: string) => string; titleName: (title: string) => string;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => [...seasons].reverse(), [seasons]);
  const { sorted, head } = useTableSort(rows, {
    season: (s) => s.season, league: (s) => leagueName(s.league),
    position: (s) => (s.position === null || s.position === undefined ? null : -s.position),
    record: (s) => s.won, points: (s) => s.points, topScorer: (s) => s.topScorer?.goals ?? null,
    titles: (s) => s.titles.filter(isTrophy).length || null,
  });
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <SectionTitle>{t("clubHistory.seasons")}</SectionTitle>
      {rows.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-5 py-6 flex items-center gap-4">
          <Icon name="calendar" size={28} className="text-muted-foreground shrink-0" />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-display font-bold uppercase text-base leading-none text-foreground">{t("clubHistory.firstSeason")}</span>
            <span className="text-sm text-muted-foreground">{t("clubHistory.firstSeasonHint")}</span>
          </div>
        </div>
      ) : (
        <StatsTable
          head={
            <>
              <StatsHead sort={head("season")}>{t("clubHistory.col.season")}</StatsHead>
              <StatsHead sort={head("league")}>{t("clubHistory.col.league")}</StatsHead>
              <StatsHead align="center" sort={head("position")}>{t("clubHistory.col.position")}</StatsHead>
              <StatsHead align="center" sort={head("record")} title={t("clubHistory.col.recordHint")}>{t("clubHistory.col.record")}</StatsHead>
              <StatsHead align="center" sort={head("points")}>{t("clubHistory.col.points")}</StatsHead>
              <StatsHead sort={head("topScorer")}>{t("clubHistory.col.topScorer")}</StatsHead>
              <StatsHead sort={head("titles")}>{t("clubHistory.col.titles")}</StatsHead>
            </>
          }
        >
          {sorted.map((s) => {
            const won = s.titles.filter(isTrophy);
            return (
              <StatsRow key={`${s.season}-${s.league}`}>
                <StatsCell className="tabular-nums whitespace-nowrap text-muted-foreground">{s.season}</StatsCell>
                <StatsCell className="font-semibold text-foreground max-w-[12rem] truncate">{leagueName(s.league)}</StatsCell>
                <StatsCell align="center" className="whitespace-nowrap">
                  <span className={`inline-flex min-w-9 h-7 px-1.5 items-center justify-center rounded font-display font-bold tabular-nums ${
                    s.position === 1 ? "bg-star-gold/20 text-star-gold" : "bg-secondary text-foreground"}`}>
                    {s.position !== null ? t("clubHistory.factDetail.position", { position: s.position }) : "-"}
                  </span>
                  {s.move && (
                    <span className="ml-1 inline-flex align-middle" title={t(`clubHistory.${s.move}`)} aria-label={t(`clubHistory.${s.move}`)}>
                      <Icon name={s.move === "promoted" ? "trend-up" : "trend-down"} size={16} className={s.move === "promoted" ? "text-star-green" : "text-destructive"} />
                    </span>
                  )}
                </StatsCell>
                <NumberCell>{s.won}-{s.drawn}-{s.lost}</NumberCell>
                <NumberCell strong>{s.points}</NumberCell>
                <StatsCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {s.topScorer ? <><span className="text-foreground">{s.topScorer.name}</span> <span className="tabular-nums">· {s.topScorer.goals}</span></> : "-"}
                </StatsCell>
                <StatsCell className="whitespace-nowrap">
                  {won.length === 0 ? <span className="text-muted-foreground">-</span> : (
                    <span className="inline-flex items-center gap-1" title={won.map(titleName).join(", ")}>
                      {won.map((x) => <Icon key={x} name="trophy" size={18} className={trophyKindOf(x) === "continental" ? "text-chart-2" : "text-star-gold"} />)}
                    </span>
                  )}
                </StatsCell>
              </StatsRow>
            );
          })}
        </StatsTable>
      )}
    </section>
  );
}

/** Top scorers and appearances in one table (the union of both top 10s), by goals first; the headers sort. */
function TopPlayersBlock({ data, leagueSlug }: { data: ClubHistoryResponse; leagueSlug: string }) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const seen = new Map<string, ClubTopPlayer>();
    for (const p of [...data.topScorers, ...data.topApps]) if (!seen.has(p.playerId)) seen.set(p.playerId, p);
    return [...seen.values()];
  }, [data]);
  const { sorted, head } = useTableSort(rows, {
    player: (p) => p.name, goals: (p) => p.goals, apps: (p) => p.apps, assists: (p) => p.assists,
  }, { key: "goals", dir: "desc" });
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <SectionTitle>{t("clubHistory.topPlayers")}</SectionTitle>
      {rows.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-5 py-6 flex items-center gap-4">
          <Icon name="users" size={28} className="text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">{t("clubHistory.noPlayersYet")}</span>
        </div>
      ) : (
        <StatsTable
          head={
            <>
              <StatsHead align="center">#</StatsHead>
              <StatsHead sort={head("player")}>{t("clubHistory.col.player")}</StatsHead>
              <StatsHead align="center" sort={head("goals")}>{t("clubHistory.col.goals")}</StatsHead>
              <StatsHead align="center" sort={head("apps")}>{t("clubHistory.col.apps")}</StatsHead>
              <StatsHead align="center" sort={head("assists")}>{t("clubHistory.col.assists")}</StatsHead>
            </>
          }
        >
          {sorted.map((p, i) => (
            <StatsRow key={p.playerId} highlight={p.current}>
              <RankCell rank={i + 1} />
              <NameCell highlight={p.current} href={p.current ? playerHref(leagueSlug, data.squadId, p.playerId) : undefined}>
                <span className="truncate">{p.name}</span>
                {p.retired && <span className="shrink-0 text-sm font-normal text-muted-foreground">· {t("clubHistory.retired")}</span>}
              </NameCell>
              <NumberCell strong>{p.goals}</NumberCell>
              <NumberCell>{p.apps}</NumberCell>
              <NumberCell>{p.assists}</NumberCell>
            </StatsRow>
          ))}
        </StatsTable>
      )}
    </section>
  );
}

/** Records as cards; the main ones are shown dimmed before they exist. */
function RecordsBlock({ data, leagueName }: { data: ClubHistoryResponse; leagueName: (slug: string) => string }) {
  const { t } = useTranslation();
  const kinds = RECORD_ORDER.filter((k) => data.records[k] || RECORD_PLACEHOLDERS.includes(k));
  const most = data.facts.mostTeamGoals;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("clubHistory.records")}</SectionTitle>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kinds.map((k) => {
          const value = data.records[k];
          if (!value) return <InfoCard key={k} dim label={t(`clubHistory.record.${k}`)} value="-" detail={t("clubHistory.notSet")} />;
          const x = clubRecordTexts({ kind: k, value } as ClubRecordBroken, t, leagueName);
          const shown = k === "unbeaten" ? t("clubHistory.gamesCount", { count: data.records.unbeaten!.matches }) : x.value;
          return <InfoCard key={k} label={x.label} value={shown} detail={x.detail} tone={RECORD_TONE[k]} />;
        })}
        {most && (
          <InfoCard
            label={t("clubHistory.fact.mostTeamGoals")} value={most.goals}
            detail={t("clubHistory.factDetail.goals", { league: leagueName(most.league), season: most.season })}
          />
        )}
      </div>
    </section>
  );
}
