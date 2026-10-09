import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { StandingRow } from "@/types/playerTypes";
import type { YouthLeader } from "@/types/youthCompTypes";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { CrestCell, NameCell, NumberCell, RankCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { Button } from "@/GameInterface/ui/Button";
import { Icon } from "@/GameInterface/Icons";

/** Response of `GET /api/saves/:id/youth-comps/:slug`. */
export interface YouthCompData {
  meta: LeagueSeasonMeta;
  fixtures: Fixture[];
  standings: StandingRow[];
  names: Record<string, string>;
  leaders: Record<string, YouthLeader>;
  /** League folder of each club (player links). */
  leagueOf: Record<string, string>;
}

const TOP = 10;

/** The round to open first: the last one with a game played, else the first. */
export function initialYouthRound(fixtures: Fixture[]): number {
  const played = fixtures.filter((f) => f.played && f.result).map((f) => f.round);
  return played.length > 0 ? Math.max(...played) : 1;
}

/** Top scorers (goals, then fewer games) and best average ratings (min. games), real and generated. */
export function youthLeaderboards(leaders: Record<string, YouthLeader>) {
  const rows = Object.entries(leaders).map(([id, l]) => ({ id, ...l, avg: l.apps > 0 ? l.ratingSum / l.apps : 0 }));
  const scorers = rows
    .filter((r) => r.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.apps - b.apps || a.name.localeCompare(b.name))
    .slice(0, TOP);
  const ratings = rows
    .filter((r) => r.apps >= YOUTH_COMP.LEADERS_MIN_APPS)
    .sort((a, b) => b.avg - a.avg || b.apps - a.apps || a.name.localeCompare(b.name))
    .slice(0, TOP);
  return { scorers, ratings };
}

function dateLabel(iso: string, lang: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(lang, { day: "2-digit", month: "short" });
}

/** Table, results by round and highlights of one youth competition (dumb: props in, render out). */
export function YouthCompView({ data, myClubId }: { data: YouthCompData; myClubId: string }) {
  const { t, i18n } = useTranslation();
  const youth = data.meta.youth!;
  const totalRounds = data.meta.totalRounds;
  const [round, setRound] = useState(() => initialYouthRound(data.fixtures));
  const name = (id: string) => data.names[id] ?? youth.teams[id]?.name ?? id;
  const roundFixtures = useMemo(
    () => data.fixtures.filter((f) => f.round === round).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [data.fixtures, round],
  );
  const { scorers, ratings } = useMemo(() => youthLeaderboards(data.leaders), [data.leaders]);
  const playerHref = (l: { generated?: true; squadId: string }, id: string) => {
    const league = data.leagueOf[l.squadId];
    return l.generated || !league
      ? undefined
      : `/player/${encodeURIComponent(league)}/${encodeURIComponent(l.squadId)}/${encodeURIComponent(id)}`;
  };

  return (
    <div className="space-y-6">
      {youth.championId && (
        <div className="rounded-lg border border-chart-4/40 bg-chart-4/10 px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t("youthComps.champion")}: </span>
          <span className="font-bold text-chart-4">{name(youth.championId)}</span>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("youthComps.table")}</h3>
        <StatsTable
          head={
            <>
              <StatsHead align="center">{t("leagues.rank")}</StatsHead>
              <StatsHead />
              <StatsHead>{t("leagues.club")}</StatsHead>
              <StatsHead align="center">{t("leagues.matches")}</StatsHead>
              <StatsHead align="center">{t("leagues.won")}</StatsHead>
              <StatsHead align="center">{t("leagues.drawn")}</StatsHead>
              <StatsHead align="center">{t("leagues.lost")}</StatsHead>
              <StatsHead align="center">{t("leagues.goalDifference")}</StatsHead>
              <StatsHead align="center">{t("leagues.points")}</StatsHead>
            </>
          }
        >
          {data.standings.map((row, i) => {
            const mine = row.squadId === myClubId;
            return (
              <StatsRow key={row.squadId} highlight={mine}>
                <RankCell rank={i + 1} />
                <CrestCell squadId={row.squadId} />
                <NameCell highlight={mine}>{name(row.squadId)}</NameCell>
                <NumberCell>{row.mp}</NumberCell>
                <NumberCell>{row.w}</NumberCell>
                <NumberCell>{row.d}</NumberCell>
                <NumberCell>{row.l}</NumberCell>
                <NumberCell>{row.gd > 0 ? `+${row.gd}` : row.gd}</NumberCell>
                <NumberCell strong>{row.pts}</NumberCell>
              </StatsRow>
            );
          })}
        </StatsTable>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("youthComps.results")}</h3>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="secondary"
              aria-label={t("youthComps.prevRound")}
              title={t("youthComps.prevRound")}
              disabled={round <= 1}
              onClick={() => setRound((r) => Math.max(1, r - 1))}
            >
              <Icon name="chevron-left" size={16} />
            </Button>
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground tabular-nums">
              {t("youthComps.round", { round, total: totalRounds })}
            </span>
            <Button
              variant="secondary"
              aria-label={t("youthComps.nextRound")}
              title={t("youthComps.nextRound")}
              disabled={round >= totalRounds}
              onClick={() => setRound((r) => Math.min(totalRounds, r + 1))}
            >
              <Icon name="chevron-right" size={16} />
            </Button>
          </div>
        </div>
        <ul className="m-0 p-0 list-none divide-y divide-border/50 border border-border rounded-md">
          {roundFixtures.map((f) => {
            const mine = f.home === myClubId || f.away === myClubId;
            return (
              <li key={f.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${mine ? "bg-primary/10" : ""}`}>
                <span className="w-16 shrink-0 text-muted-foreground tabular-nums">{dateLabel(f.date, i18n.language)}</span>
                <span className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right">
                  <span className="truncate font-semibold">{name(f.home)}</span>
                  <ClubLogo logoUrl={squadLogoUrl(f.home)} className="w-6 h-6 rounded-full shrink-0" imgClassName="w-full h-full object-contain" />
                </span>
                <span className="w-14 shrink-0 text-center font-display font-bold tabular-nums">
                  {f.cancelled ? "–" : f.played && f.result ? `${f.result.home}–${f.result.away}` : t("leagues.vs")}
                </span>
                <span className="flex-1 min-w-0 flex items-center gap-2">
                  <ClubLogo logoUrl={squadLogoUrl(f.away)} className="w-6 h-6 rounded-full shrink-0" imgClassName="w-full h-full object-contain" />
                  <span className="truncate font-semibold">{name(f.away)}</span>
                </span>
                {(f.cancelled || f.postponedFrom) && (
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {f.cancelled
                      ? t("youthComps.cancelled")
                      : t("youthComps.postponed", { date: dateLabel(f.postponedFrom!, i18n.language) })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("youthComps.highlights")}</h3>
        {scorers.length === 0 && ratings.length === 0 ? (
          <p className="text-sm text-muted-foreground m-0">{t("youthComps.noLeaders")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <StatsTable
              head={
                <>
                  <StatsHead align="center">{t("leagues.rank")}</StatsHead>
                  <StatsHead>{t("youthComps.topScorers")}</StatsHead>
                  <StatsHead />
                  <StatsHead align="center">{t("leagues.matches")}</StatsHead>
                  <StatsHead align="center">{t("youthComps.goals")}</StatsHead>
                </>
              }
            >
              {scorers.map((r, i) => (
                <StatsRow key={r.id} highlight={r.squadId === myClubId}>
                  <RankCell rank={i + 1} />
                  <NameCell href={playerHref(r, r.id)} highlight={r.squadId === myClubId}>{r.name}</NameCell>
                  <CrestCell squadId={r.squadId} />
                  <NumberCell>{r.apps}</NumberCell>
                  <NumberCell strong>{r.goals}</NumberCell>
                </StatsRow>
              ))}
            </StatsTable>
            <StatsTable
              head={
                <>
                  <StatsHead align="center">{t("leagues.rank")}</StatsHead>
                  <StatsHead title={t("youthComps.minApps", { n: YOUTH_COMP.LEADERS_MIN_APPS })}>{t("youthComps.topRatings")}</StatsHead>
                  <StatsHead />
                  <StatsHead align="center">{t("leagues.matches")}</StatsHead>
                  <StatsHead align="center">{t("youthComps.rating")}</StatsHead>
                </>
              }
            >
              {ratings.map((r, i) => (
                <StatsRow key={r.id} highlight={r.squadId === myClubId}>
                  <RankCell rank={i + 1} />
                  <NameCell href={playerHref(r, r.id)} highlight={r.squadId === myClubId}>{r.name}</NameCell>
                  <CrestCell squadId={r.squadId} />
                  <NumberCell>{r.apps}</NumberCell>
                  <NumberCell strong>{r.avg.toFixed(2)}</NumberCell>
                </StatsRow>
              ))}
            </StatsTable>
          </div>
        )}
        <p className="text-sm text-muted-foreground m-0">{t("youthComps.minApps", { n: YOUTH_COMP.LEADERS_MIN_APPS })}</p>
      </section>
    </div>
  );
}
