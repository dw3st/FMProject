import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import {
  ClubCell, NameCell, NumberCell, RankCell, StatsCell, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { Flag } from "@/GameInterface/Components/Flag";
import { Icon } from "@/GameInterface/Icons";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { playerHref } from "@/GameInterface/Scouting/scoutingApi";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { nationalCompetitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { GroupRow } from "@/Domain/continental/groupTable";
import type { NationalOverview, NationalRankRow } from "@/backend/nationalRoutes";
import type { Fixture } from "@/types/calendarTypes";
import type { NationalStage, NationalTournamentAwards } from "@/types/nationalTypes";

type Tab = "ranking" | "competitions" | "team";
const CONFEDS = ["all", "UEFA", "CONMEBOL", "CONCACAF", "CAF", "AFC", "OFC"] as const;
type ConfedFilter = (typeof CONFEDS)[number];

interface CompDetail {
  slug: string; kind: string; tournament: string | null; year: number; status: string; championId: string | null;
  teams: string[]; groups: { name: string; rows: GroupRow[] }[]; stages: NationalStage[];
  fixtures: (Fixture & { stage: string })[]; names: Record<string, string>;
  scorers: { id: string; name: string; nation: string; squadId: string; goals: number; apps: number; generated?: boolean }[];
  qualified: string[] | null; slots: number | null; awards: NationalTournamentAwards | null;
}

interface TeamDetail {
  id: string; nation: string; confed: string; elo: number; rank: number; games: number;
  manager: { id: string; name: string; interim: boolean } | null;
  callUp: {
    from: string; until: string; active: boolean; competition: string | null;
    players: { id: string; name: string; generated: boolean; squadId: string; clubName: string | null; league: string | null; role: string | null; overall: number | null; caps: number | null; goals: number | null }[];
  } | null;
  recent: Fixture[]; upcoming: Fixture[]; names: Record<string, string>; titles: string[];
}

function NationFlag({ nation }: { nation: string }) {
  const code = nationalityFlagCode(nation);
  return code ? <Flag code={code} /> : <span className="inline-block w-5" />;
}

function useNationName() {
  const { t, i18n } = useTranslation();
  return (nation: string) => nationalityDisplayName(nation, i18n.language, t);
}

/** "Seleções" screen (`.claude/rules/game/national-teams.md` → "Telas"). */
/** The "Seleções" tab of the Leagues screen (`/leagues?tab=national`; `/national` redirects there). */
export function NationalTab() {
  const { t, i18n } = useTranslation();
  const { session, currentDate } = useGameSave();
  const [tab, setTab] = useState<Tab>("ranking");
  const [data, setData] = useState<NationalOverview | null>(null);
  const [error, setError] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [compSlug, setCompSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.saveId) return;
    let cancelled = false;
    setError(false);
    fetch(`/api/saves/${session.saveId}/national`)
      .then((r) => (r.ok ? (r.json() as Promise<NationalOverview>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [session?.saveId, currentDate]);

  const openTeam = (id: string) => { setTeamId(id); setTab("team"); };
  const nextLabel = data?.next
    ? data.next.kind === "tournament" && data.next.slug
      ? t(data.next.current ? "national.currentTournament" : "national.nextTournament", {
        name: nationalCompetitionName(data.next.slug, i18n.language), date: formatDay(data.next.start, i18n.language),
        to: formatDay(data.next.end, i18n.language),
      })
      : t(data.next.current ? "national.currentWindow" : "national.nextWindow", {
        from: formatDay(data.next.start, i18n.language), to: formatDay(data.next.end, i18n.language),
      })
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      {nextLabel && <p className="text-sm text-muted-foreground">{nextLabel}</p>}
      <SegmentedTabs
        compact
        tabs={[
          { key: "ranking" as const, label: t("national.tabs.ranking") },
          { key: "competitions" as const, label: t("national.tabs.competitions") },
          { key: "team" as const, label: t("national.tabs.team") },
        ]}
        active={tab}
        onChange={setTab}
      />
      {error ? (
        <p className="text-sm text-muted-foreground">{t("national.none")}</p>
      ) : !data || !session?.saveId ? (
        <p className="text-sm text-muted-foreground">{t("national.loading")}</p>
      ) : tab === "ranking" ? (
        <RankingView rows={data.ranking} homeTeam={data.homeTeam} onOpen={openTeam} />
      ) : tab === "competitions" ? (
        <CompetitionsView saveId={session.saveId} overview={data} slug={compSlug} onSlug={setCompSlug} onOpen={openTeam} refreshKey={currentDate ?? ""} />
      ) : (
        <TeamView saveId={session.saveId} overview={data} teamId={teamId ?? data.homeTeam ?? data.ranking[0]?.id ?? ""} onTeam={setTeamId} refreshKey={currentDate ?? ""} />
      )}
    </div>
  );
}

function RankingView({ rows, homeTeam, onOpen }: { rows: NationalRankRow[]; homeTeam: string | null; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const nationName = useNationName();
  const [confed, setConfed] = useState<ConfedFilter>("all");
  const shown = confed === "all" ? rows : rows.filter((r) => r.confed === confed);
  return (
    <div className="flex flex-col gap-4">
      <OptionChips
        aria-label={t("national.confed")}
        options={CONFEDS.map((c) => ({ key: c, label: c === "all" ? t("national.world") : c }))}
        value={confed}
        onChange={setConfed}
      />
      <StatsTable
        className="max-w-4xl"
        head={<>
          <StatsHead align="center">#</StatsHead>
          <StatsHead />
          <StatsHead>{t("national.nation")}</StatsHead>
          <StatsHead>{t("national.confed")}</StatsHead>
          <StatsHead>{t("national.coach")}</StatsHead>
          <StatsHead align="center">{t("national.games")}</StatsHead>
          <StatsHead align="center">{t("national.points")}</StatsHead>
        </>}
      >
        {shown.map((r) => {
          const move = r.prevRank ? r.prevRank - r.rank : 0;
          return (
            <StatsRow key={r.id} highlight={r.id === homeTeam} onActivate={() => onOpen(r.id)}>
              <RankCell rank={r.rank} />
              <StatsCell className="w-8">
                {move > 0 ? <Icon name="trend-up" size={16} className="text-primary" />
                  : move < 0 ? <Icon name="trend-down" size={16} className="text-destructive" />
                  : <Icon name="minus" size={16} className="text-muted-foreground" />}
              </StatsCell>
              <NameCell highlight={r.id === homeTeam}>
                <NationFlag nation={r.nation} />
                <span className="truncate">{nationName(r.nation)}</span>
              </NameCell>
              <ClubCell>{r.confed}</ClubCell>
              <ClubCell>{r.managerName ?? "-"}</ClubCell>
              <NumberCell>{r.games}</NumberCell>
              <NumberCell strong>{r.elo}</NumberCell>
            </StatsRow>
          );
        })}
      </StatsTable>
    </div>
  );
}

function compOrder(a: { status: string; year: number; slug: string }, b: { status: string; year: number; slug: string }) {
  const live = (s: string) => (s === "finished" ? 1 : 0);
  return live(a.status) - live(b.status) || b.year - a.year || a.slug.localeCompare(b.slug);
}

function CompetitionsView({ saveId, overview, slug, onSlug, onOpen, refreshKey }: {
  saveId: string; overview: NationalOverview; slug: string | null; onSlug: (s: string) => void; onOpen: (id: string) => void; refreshKey: string;
}) {
  const { t, i18n } = useTranslation();
  const nationName = useNationName();
  const comps = useMemo(() => overview.competitions.filter((c) => c.kind !== "friendlies").sort(compOrder), [overview]);
  const active = slug ?? comps[0]?.slug ?? null;
  const [detail, setDetail] = useState<CompDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setDetail(null);
    setFailed(false);
    fetch(`/api/saves/${saveId}/national/competitions/${active}`)
      .then((r) => (r.ok ? (r.json() as Promise<CompDetail>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [saveId, active, refreshKey]);

  if (!active) return <p className="text-sm text-muted-foreground">{t("national.noCompetitions")}</p>;
  const name = (id: string) => nationName(detail?.names[id] ?? id);
  const qualified = new Set(detail?.qualified ?? []);
  const koStages = (detail?.stages ?? []).filter((s) => s.name !== "group");

  return (
    <div className="flex flex-col gap-6">
      <SelectCombobox
        label={t("national.competition")}
        labelId="national-competition"
        value={active}
        onChange={onSlug}
        options={comps.map((c) => ({ value: c.slug, label: nationalCompetitionName(c.slug, i18n.language) ?? c.slug }))}
        emptyMessage={t("national.noMatch")}
        className="w-full max-w-sm"
      />
      {failed ? <p className="text-sm text-muted-foreground">{t("national.loadFailed")}</p>
        : !detail ? <p className="text-sm text-muted-foreground">{t("national.loading")}</p> : (
        <>
          {detail.championId && (
            <div className="flex items-center gap-3 rounded-md border border-chart-4/50 bg-chart-4/10 px-4 py-3">
              <Icon name="trophy" size={18} className="text-chart-4" />
              <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("national.champion")}</span>
              <NationFlag nation={detail.names[detail.championId] ?? ""} />
              <span className="font-semibold">{name(detail.championId)}</span>
            </div>
          )}
          {detail.groups.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle>{t("national.groups")}</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {detail.groups.map((g) => (
                  <StatsTable
                    key={g.name}
                    head={<>
                      <StatsHead>{t("national.group", { name: g.name })}</StatsHead>
                      <StatsHead align="center">{t("national.played")}</StatsHead>
                      <StatsHead align="center">{t("national.gd")}</StatsHead>
                      <StatsHead align="center">{t("national.pts")}</StatsHead>
                    </>}
                  >
                    {g.rows.map((r, i) => (
                      <StatsRow key={r.squadId} highlight={r.squadId === overview.homeTeam} onActivate={() => onOpen(r.squadId)}>
                        <NameCell highlight={r.squadId === overview.homeTeam}>
                          <span className="text-muted-foreground tabular-nums w-4">{i + 1}</span>
                          <NationFlag nation={detail.names[r.squadId] ?? ""} />
                          <span className="truncate">{name(r.squadId)}</span>
                          {qualified.has(r.squadId) && <Icon name="check" size={16} className="text-primary shrink-0" />}
                        </NameCell>
                        <NumberCell>{r.mp}</NumberCell>
                        <NumberCell>{r.gd > 0 ? `+${r.gd}` : r.gd}</NumberCell>
                        <NumberCell strong>{r.pts}</NumberCell>
                      </StatsRow>
                    ))}
                  </StatsTable>
                ))}
              </div>
            </section>
          )}
          {koStages.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle>{t("national.knockout")}</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {koStages.map((st) => {
                  const fx = detail.fixtures.filter((f) => f.stage === st.name);
                  return (
                    <div key={st.name} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                        {t(`national.stage.${st.name}`)} · {formatDay(st.dates[0]!, i18n.language)}
                      </span>
                      {!st.drawn ? <span className="text-sm text-muted-foreground">{t("national.notDrawn")}</span>
                        : fx.map((f) => <FixtureLine key={f.id} f={f} name={name} names={detail.names} />)}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {detail.scorers.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle>{t("national.scorers")}</SectionTitle>
              <StatsTable
                className="max-w-2xl"
                head={<>
                  <StatsHead align="center">#</StatsHead>
                  <StatsHead>{t("national.player")}</StatsHead>
                  <StatsHead>{t("national.nation")}</StatsHead>
                  <StatsHead align="center">{t("national.games")}</StatsHead>
                  <StatsHead align="center">{t("national.goals")}</StatsHead>
                </>}
              >
                {detail.scorers.map((s, i) => (
                  <StatsRow key={s.id}>
                    <RankCell rank={i + 1} />
                    <NameCell href={s.generated || !s.squadId ? undefined : playerHref(s.id, s.squadId)}>
                      <span className="truncate">{s.name}</span>
                    </NameCell>
                    <ClubCell>{nationName(s.nation)}</ClubCell>
                    <NumberCell>{s.apps}</NumberCell>
                    <NumberCell strong>{s.goals}</NumberCell>
                  </StatsRow>
                ))}
              </StatsTable>
            </section>
          )}
          {detail.awards && <AwardsBlock awards={detail.awards} />}
          {detail.kind !== "tournament" && (
            <section className="flex flex-col gap-3">
              <SectionTitle>{t("national.results")}</SectionTitle>
              <div className="flex flex-col gap-1 max-w-2xl">
                {detail.fixtures.filter((f) => f.played).slice(-20).reverse().map((f) => <FixtureLine key={f.id} f={f} name={name} names={detail.names} withDate />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FixtureLine({ f, name, names, withDate }: { f: Fixture; name: (id: string) => string; names: Record<string, string>; withDate?: boolean }) {
  const { t, i18n } = useTranslation();
  const r = f.result;
  const pens = f.decider?.penalties;
  return (
    <div className="flex items-center gap-2 text-sm tabular-nums">
      {withDate && <span className="text-muted-foreground w-16 shrink-0">{formatDay(f.date, i18n.language)}</span>}
      <NationFlag nation={names[f.home] ?? ""} />
      <span className="truncate">{name(f.home)}</span>
      <span className="font-display font-bold">{r ? `${r.home}–${r.away}` : t("national.vs")}</span>
      <span className="truncate">{name(f.away)}</span>
      <NationFlag nation={names[f.away] ?? ""} />
      {pens && <span className="text-muted-foreground">{t("national.pens", { home: pens.home, away: pens.away })}</span>}
    </div>
  );
}

function AwardsBlock({ awards }: { awards: NationalTournamentAwards }) {
  const { t } = useTranslation();
  const nationName = useNationName();
  const cards = [
    { key: "bestPlayer", p: awards.bestPlayer, value: awards.bestPlayer?.value.toFixed(2) },
    { key: "topScorer", p: awards.topScorer, value: awards.topScorer ? t("national.goalsCount", { count: awards.topScorer.value }) : undefined },
    { key: "bestGoalkeeper", p: awards.bestGoalkeeper, value: awards.bestGoalkeeper?.value.toFixed(2) },
  ].filter((c) => c.p);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("national.awards")}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.key} className="rounded-md border border-border bg-card p-3 flex flex-col gap-1">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t(`national.award.${c.key}`)}</span>
            <a href={playerHref(c.p!.playerId, c.p!.squadId)} className="font-semibold text-foreground no-underline hover:underline">{c.p!.name}</a>
            <span className="text-sm text-muted-foreground">{nationName(c.p!.nation)} · <span className="tabular-nums">{c.value}</span></span>
          </div>
        ))}
      </div>
      {awards.team.length > 0 && (
        <p className="text-sm text-muted-foreground m-0">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px]">{t("national.award.team")}: </span>
          {awards.team.map((p) => p.name).join(", ")}
        </p>
      )}
    </section>
  );
}

function TeamView({ saveId, overview, teamId, onTeam, refreshKey }: {
  saveId: string; overview: NationalOverview; teamId: string; onTeam: (id: string) => void; refreshKey: string;
}) {
  const { t, i18n } = useTranslation();
  const nationName = useNationName();
  const [d, setD] = useState<TeamDetail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setD(null);
    setFailed(false);
    fetch(`/api/saves/${saveId}/national/teams/${teamId}`)
      .then((r) => (r.ok ? (r.json() as Promise<TeamDetail>) : Promise.reject(new Error(String(r.status)))))
      .then((x) => { if (!cancelled) setD(x); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [saveId, teamId, refreshKey]);

  const options = useMemo(
    () => [...overview.ranking].sort((a, b) => nationName(a.nation).localeCompare(nationName(b.nation))).map((r) => ({ value: r.id, label: nationName(r.nation) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overview, i18n.language],
  );
  const name = (id: string) => nationName(d?.names[id] ?? id);

  return (
    <div className="flex flex-col gap-6">
      <SelectCombobox label={t("national.nation")} labelId="national-team" value={teamId} onChange={onTeam} options={options} emptyMessage={t("national.noMatch")} className="w-full max-w-sm" />
      {failed ? <p className="text-sm text-muted-foreground">{t("national.loadFailed")}</p>
        : !d ? <p className="text-sm text-muted-foreground">{t("national.loading")}</p> : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="inline-flex items-center gap-2 font-display font-black uppercase text-xl">
              <NationFlag nation={d.nation} /> {nationName(d.nation)}
            </span>
            <span className="text-sm text-muted-foreground">{t("national.rankLine", { rank: d.rank, points: d.elo, confed: d.confed })}</span>
            <span className="text-sm text-muted-foreground">{t("national.coachLine", { name: d.manager?.name ?? "-" })}{d.manager?.interim ? ` · ${t("national.interim")}` : ""}</span>
            {d.titles.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Icon name="trophy" size={16} className="text-chart-4" />
                {d.titles.map((s) => nationalCompetitionName(s, i18n.language)).join(", ")}
              </span>
            )}
          </div>
          <section className="flex flex-col gap-3">
            <SectionTitle>{d.callUp?.active ? t("national.squadNow") : t("national.squadLast")}</SectionTitle>
            {d.callUp && (
              <p className="text-sm text-muted-foreground m-0">
                {t("national.callUpDates", { from: formatDay(d.callUp.from, i18n.language), to: formatDay(d.callUp.until, i18n.language) })}
              </p>
            )}
            {!d.callUp ? <p className="text-sm text-muted-foreground">{t("national.noCallUp")}</p> : (
              <StatsTable
                className="max-w-4xl"
                head={<>
                  <StatsHead>{t("national.pos")}</StatsHead>
                  <StatsHead>{t("national.player")}</StatsHead>
                  <StatsHead>{t("national.club")}</StatsHead>
                  <StatsHead align="center">{t("national.rating")}</StatsHead>
                  <StatsHead align="center">{t("national.caps")}</StatsHead>
                  <StatsHead align="center">{t("national.goals")}</StatsHead>
                </>}
              >
                {d.callUp.players.map((p) => (
                  <StatsRow key={p.id}>
                    <StatsCell className={`font-display font-bold ${p.role ? getDetailedPositionColor(p.role) : "text-muted-foreground"}`}>
                      {p.role ? t(`roles.detailedAbbr.${p.role}`, { defaultValue: p.role }) : "-"}
                    </StatsCell>
                    <NameCell href={p.generated ? undefined : playerHref(p.id, p.squadId, p.league ?? undefined)}>
                      <span className="truncate">{p.name}</span>
                      {p.generated && <span className="text-sm font-normal text-muted-foreground" title={t("national.localHint")}>{t("national.local")}</span>}
                    </NameCell>
                    <ClubCell>{p.clubName ?? "-"}</ClubCell>
                    <NumberCell>{p.overall !== null ? Math.round(p.overall * 10) : "-"}</NumberCell>
                    <NumberCell>{p.caps ?? "-"}</NumberCell>
                    <NumberCell strong>{p.goals ?? "-"}</NumberCell>
                  </StatsRow>
                ))}
              </StatsTable>
            )}
          </section>
          <div className="grid gap-6 md:grid-cols-2">
            <section className="flex flex-col gap-2">
              <SectionTitle>{t("national.upcoming")}</SectionTitle>
              {d.upcoming.length === 0 ? <p className="text-sm text-muted-foreground m-0">-</p>
                : d.upcoming.map((f) => <FixtureLine key={f.id} f={f} name={name} names={d.names} withDate />)}
            </section>
            <section className="flex flex-col gap-2">
              <SectionTitle>{t("national.recent")}</SectionTitle>
              {d.recent.length === 0 ? <p className="text-sm text-muted-foreground m-0">-</p>
                : d.recent.map((f) => <FixtureLine key={f.id} f={f} name={name} names={d.names} withDate />)}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
