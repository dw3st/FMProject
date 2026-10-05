import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LeagueData } from "@/types/playerTypes";
import type { ClubHistoryResponse, ClubRecordBroken, ClubRecordKind, ClubTopPlayer } from "@/types/clubHistoryTypes";
import { competitionName } from "@/Domain/world/labels";
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
              <span className="text-muted-foreground">
                {data.venue.city ? ` · ${data.venue.city}` : ""}
                {data.venue.capacity > 0 ? ` · ${t("clubHistory.capacity", { count: data.venue.capacity })}` : ""}
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
