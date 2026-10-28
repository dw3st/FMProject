import type { AchievementsData } from "@/GameInterface/Achievements/achievementsApi";
import { clubCardAchievements, type ClubCardAchievements } from "@/GameInterface/Dashboard/HomeCards";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { WeekCard } from "@/GameInterface/Dashboard/WeekCalendar";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { GroupAdvanceBand } from "@/GameInterface/World/GroupAdvanceBand";
import { worldApi } from "@/GameInterface/World/worldApi";
import { rivalsApi } from "@/GameInterface/World/rivalsApi";
import { useHumanClubs } from "@/GameInterface/World/useHumanClubs";
import { useSocial } from "@/GameInterface/Social/useSocial";
import type { RivalRow } from "@/types/rivalsTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { fetchNews, topNews } from "@/GameInterface/News/newsApi";
import type { NewsItem } from "@/types/newsTypes";
import { teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";
import { competitionName } from "@/Domain/world/labels";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { inboxPreview, inboxSubject } from "@/GameInterface/InboxScreen";
import { trendOf } from "@/Domain/boardFans/boardFans";
import { useTransferWindows } from "@/GameInterface/Transfers/transferWindow";
import type { ClubVenue, LeagueData, Squad, StandingRow } from "@/types/playerTypes";
import type { LeagueSeasonMeta } from "@/types/calendarTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import {
  attentionItems,
  currentRound,
  lastResults,
  latestWeekMoney,
  nextFixture,
  seasonHighlights,
  standingsWindow,
} from "@/GameInterface/Dashboard/dashboardData";
import {
  AttentionCard,
  ClubCard,
  HighlightsCard,
  InboxCard,
  LeagueMiniTable,
  NewsCard,
  NextMatchCard,
  RivalsCard,
  WeekFinancesCard,
  WorksCard,
  recentlyCompleted,
  formatDay,
  type MatchSide,
} from "@/GameInterface/Dashboard/HomeCards";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import { seatManagerId } from "@/Domain/seats/seats";
import { rankOf } from "@/Domain/multiplayer/standings";

interface LedgerApiResponse {
  entries: LedgerEntry[];
  balance: number;
}

function colorsOf(squadId: string, leagues: LeagueData[], standings: StandingRow[]): [string, string] {
  const row = standings.find((s) => s.squadId === squadId);
  if (row) return row.colors;
  for (const league of leagues) {
    const team = league.standings.find((s) => s.squadId === squadId);
    if (team) return team.colors;
  }
  return ["#555", "#888"];
}

export function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const {
    session, squad, save, fixtures, restDays, loading: saveLoading, currentDate, toggleDayType,
    inboxMessages, unreadInboxCount,
  } = useGameSave();
  const windowsData = useTransferWindows();
  const humanClubs = useHumanClubs(session?.saveId, !!session?.groupAdvance);

  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [ledger, setLedger] = useState<LedgerApiResponse | null>(null);
  const [stageMeta, setStageMeta] = useState<LeagueSeasonMeta | null>(null);
  const [managerRank, setManagerRank] = useState<number | null>(null);
  const [achievements, setAchievements] = useState<ClubCardAchievements | null>(null);
  const [opponentHome, setOpponentHome] = useState<{ id: string; venue: ClubVenue | null; country: string | null } | null>(null);

  useEffect(() => {
    if (!saveLoading && !session) {
      window.location.href = "/new-game";
    }
  }, [saveLoading, session]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  const saveId = session?.saveId;
  const leagueSlug = session?.leagueSlug;
  const stars = useStarPlayers(saveId, currentDate);

  useEffect(() => {
    if (!saveId || !leagueSlug) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/leagues/${leagueSlug}/standings`)
      .then((r) => (r.ok ? (r.json() as Promise<StandingRow[]>) : []))
      .catch(() => [])
      .then((rows) => { if (!cancelled) setStandings(Array.isArray(rows) ? rows : []); });
    return () => { cancelled = true; };
  }, [saveId, leagueSlug, currentDate]);

  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/ledger`)
      .then((r) => (r.ok ? (r.json() as Promise<LedgerApiResponse>) : null))
      .catch(() => null)
      .then((d) => { if (!cancelled) setLedger(d); });
    return () => { cancelled = true; };
  }, [saveId, currentDate]);

  // Reputation and pending job offers (`.claude/rules/game/jobs.md`).
  const [jobs, setJobs] = useState<{ reputation: number; offers: unknown[] } | null>(null);
  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/jobs`)
      .then((r) => (r.ok ? (r.json() as Promise<{ reputation: number; offers: unknown[] }>) : null))
      .catch(() => null)
      .then((d) => { if (!cancelled) setJobs(d); });
    return () => { cancelled = true; };
  }, [saveId, currentDate]);

  // Manager ranking line (`.claude/rules/game/managers.md`): the player's world rank.
  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/managers?scope=world&limit=1`)
      .then((r) => (r.ok ? (r.json() as Promise<{ playerRank: number | null }>) : null))
      .catch(() => null)
      .then((d) => { if (!cancelled) setManagerRank(d?.playerRank ?? null); });
    return () => { cancelled = true; };
  }, [saveId, currentDate]);

  // Friends' league standings line (multiplayer part 5a): the seat's place among the league's managers.
  const [friendsRank, setFriendsRank] = useState<{ rank: number; of: number } | null>(null);
  const groupAdvance = !!session?.groupAdvance;
  const mySeatId = session?.seatId ?? null;
  useEffect(() => {
    if (!saveId || !groupAdvance || !mySeatId) { setFriendsRank(null); return; }
    let cancelled = false;
    void worldApi.standings(saveId).then((r) => {
      if (cancelled) return;
      if (!r.ok || r.data.entries.length < 2) { setFriendsRank(null); return; }
      const me = r.data.entries.find((e) => e.seatId === mySeatId);
      setFriendsRank(me ? { rank: rankOf(r.data.entries, mySeatId), of: r.data.entries.length } : null);
    });
    return () => { cancelled = true; };
  }, [saveId, groupAdvance, mySeatId, currentDate]);

  // Rivals card (multiplayer part 6): only in a friends' league; reloads with results and live scores.
  const social = useSocial();
  const [rivals, setRivals] = useState<RivalRow[] | null>(null);
  useEffect(() => {
    if (!saveId || !groupAdvance) { setRivals(null); return; }
    let cancelled = false;
    void rivalsApi.rivals(saveId).then((r) => { if (!cancelled) setRivals(r.ok ? r.data.rows : null); });
    return () => { cancelled = true; };
  }, [saveId, groupAdvance, currentDate, social.rivalsVersion]);

  // World news (`.claude/rules/game/press.md` → "Notícias"): the big ones of the last days first.
  const [news, setNews] = useState<NewsItem[] | null>(null);
  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    fetchNews(saveId, { scope: "all", limit: 20 })
      .then((page) => { if (!cancelled) setNews(topNews(page.items, 5)); })
      .catch(() => { if (!cancelled) setNews([]); });
    return () => { cancelled = true; };
  }, [saveId, currentDate]);

  // Achievements (`.claude/rules/game/achievements.md`): frame, title and badges of the manager, the count.
  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/achievements`)
      .then((r) => (r.ok ? (r.json() as Promise<AchievementsData>) : null))
      .catch(() => null)
      .then((d) => { if (!cancelled) setAchievements(d ? clubCardAchievements(d) : null); });
    return () => { cancelled = true; };
  }, [saveId, currentDate]);

  const mySquadId = squad?.id ?? session?.clubId ?? "";
  const next = useMemo(() => nextFixture(fixtures, mySquadId, currentDate), [fixtures, mySquadId, currentDate]);

  // Away game: the home ground (stadium, country for the weather) is the opponent's.
  const awayOpponentId = next && !next.neutral && next.away === mySquadId ? next.home : null;
  useEffect(() => {
    if (!saveId || !leagueSlug || !awayOpponentId) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/squad/${leagueSlug}/${encodeURIComponent(awayOpponentId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Squad>) : null))
      .catch(() => null)
      .then((s) => {
        if (!cancelled) setOpponentHome({ id: awayOpponentId, venue: s?.venue ?? null, country: s?.country ?? null });
      });
    return () => { cancelled = true; };
  }, [saveId, leagueSlug, awayOpponentId]);

  // Cup / continental tie: the stage name ("Quarter-finals") comes from the competition's meta.
  const nextCompetition = next?.competition ?? null;
  useEffect(() => {
    setStageMeta(null);
    if (!saveId || !nextCompetition) return;
    const path = isCupSlug(nextCompetition)
      ? `cups/${nextCompetition}`
      : isContinentalSlug(nextCompetition)
        ? `continental/${nextCompetition}`
        : null;
    if (!path) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/${path}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ meta: LeagueSeasonMeta }>) : null))
      .catch(() => null)
      .then((d) => { if (!cancelled) setStageMeta(d?.meta ?? null); });
    return () => { cancelled = true; };
  }, [saveId, nextCompetition]);

  if (saveLoading || !session) {
    return null;
  }

  const clubColors = session.clubColors;
  const standingRows = standings ?? [];
  // His national team's game (Etapa 41b): his side is the nation (crest from the colours).
  const myClub: MatchSide = { id: mySquadId, name: session.clubName, colors: [clubColors[0] ?? "#555", clubColors[1] ?? "#888"] };
  const me: MatchSide = next?.nationalTeam
    ? { id: next.nationalTeam, name: teamDisplayNameFromLeagues(next.nationalTeam, leagues), colors: ["#555555", "#888888"] }
    : myClub;
  const opponentId = next ? (next.home === mySquadId ? next.away : next.home) : null;
  const opponent: MatchSide | null = opponentId
    ? { id: opponentId, name: teamDisplayNameFromLeagues(opponentId, leagues), colors: colorsOf(opponentId, leagues, standingRows) }
    : null;

  let competitionLabel = "";
  if (next) {
    const name = competitionName(next.competition, leagues, i18n.language);
    let stage: string | undefined;
    if (isCupSlug(next.competition)) {
      const s = stageMeta?.cup?.stages.find((st) => st.round === next.round)?.name;
      stage = s ? t(`cups.stage.${s}`) : undefined;
    } else if (isContinentalSlug(next.competition)) {
      const s = stageMeta?.continental?.stages.find((st) => st.rounds.includes(next.round))?.name;
      const group = stageMeta?.continental?.groups.find((g) => g.clubs.includes(mySquadId))?.name;
      const leg = next.leg === 1 ? t("continental.leg1") : next.leg === 2 ? t("continental.leg2") : undefined;
      stage = s === "group"
        ? t("continental.groupRound", { group: group ?? "?", round: next.round })
        : s ? [t(`continental.stage.${s}`), leg].filter(Boolean).join(" · ") : undefined;
    } else {
      stage = `${t("common.round")} ${next.round}`;
    }
    competitionLabel = stage ? `${name} · ${stage}` : name;
  }

  // Home ground of the next match: ours, the opponent's, or none on a neutral ground (a final).
  const homeGround = !next || next.neutral
    ? null
    : next.home === mySquadId
      ? { venue: squad?.venue ?? null, country: squad?.country ?? null }
      : opponentHome?.id === next.home
        ? { venue: opponentHome.venue, country: opponentHome.country }
        : null;

  const round = currentRound(fixtures, mySquadId, session.leagueSlug, currentDate);
  const dateLabel = currentDate ? formatDay(currentDate, i18n.language, "long") : "";
  const subtitle = [dateLabel, round != null ? `${t("common.round")} ${round}` : null].filter(Boolean).join(" · ");

  const players = squad?.players ?? [];
  const inbox = inboxMessages ?? [];
  const attention = attentionItems({
    players, today: currentDate, seasonEnd: save?.season?.end ?? null, inbox, morale: squad?.moraleClub,
    window: windowsData?.player ?? null,
    renewalPending: !!save?.managerRenewal && save.managerRenewal.expires >= currentDate,
  });
  const highlights = seasonHighlights(players);
  // Unread first, then the newest read ones (the inbox is newest first).
  const recentMessages = [...inbox.filter((m) => !m.read), ...inbox.filter((m) => m.read)].slice(0, 3);
  const week = latestWeekMoney(ledger?.entries ?? []);

  const squadHref = `/squad/${encodeURIComponent(session.leagueSlug)}/${encodeURIComponent(session.clubId)}`;
  const playerHref = (playerId: string) => `${squadHref.replace("/squad/", "/player/")}/${encodeURIComponent(playerId)}`;

  const balance = ledger?.balance ?? session.budget ?? null;
  const boardState = save?.board ?? null;

  return (
    <ScreenContainer>
      <ScreenTitle subtitle={subtitle || undefined} accent={t("screenTitles.dashboard.accent")}>
        {t("screenTitles.dashboard.main")}
      </ScreenTitle>

      <GroupAdvanceBand />

      {rivals && rivals.length >= 2 && <RivalsCard rows={rivals} />}

      <ClubCard
        club={myClub}
        leagueName={competitionName(session.leagueSlug, leagues, i18n.language) || session.leagueName}
        managerName={session.manager?.name ?? null}
        managerRank={managerRank}
        friendsRank={friendsRank}
        publicWorld={!!session?.publicWorld}
        achievements={achievements}
        managerFace={session.manager ? { id: session.seatId ? seatManagerId(session.seatId) : "", face: session.manager.face, nationality: managerFaceCountry(session.manager.nationalityIso) } : null}
        reputation={jobs?.reputation ?? null}
        pendingOffers={jobs?.offers.length ?? 0}
        contract={save?.managerContract ?? null}
        board={boardState?.board ?? 60}
        fans={boardState?.fans ?? 60}
        boardTrend={boardState ? trendOf(boardState.history, currentDate, "board") : null}
        fansTrend={boardState ? trendOf(boardState.history, currentDate, "fans") : null}
        objective={boardState?.objective ?? null}
        ultimatum={boardState?.ultimatum ?? null}
        budget={balance}
        squadSize={players.length}
        squadHref={squadHref}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <NextMatchCard
          fixture={next?.nationalTeam
            ? { ...next, home: next.home === mySquadId ? next.nationalTeam : next.home, away: next.away === mySquadId ? next.nationalTeam : next.away }
            : next}
          me={me}
          opponent={opponent}
          competitionLabel={competitionLabel}
          today={currentDate}
          form={lastResults(fixtures, mySquadId)}
          stadium={homeGround?.venue ?? null}
          homeCountry={homeGround?.country ?? null}
        />
        <LeagueMiniTable
          title={competitionName(session.leagueSlug, leagues, i18n.language) || session.leagueName}
          rows={standingsWindow(standingRows, mySquadId)}
          myId={mySquadId}
          loading={standings === null}
          humanClubs={humanClubs}
        />
      </div>

      <WeekCard
        fixtures={fixtures}
        youthFixtures={save?.season?.youthCalendar}
        restDays={restDays}
        mySquadId={mySquadId}
        currentDate={currentDate}
        leagues={leagues}
        onToggleDayType={toggleDayType}
      />

      {squad?.facilities && currentDate
        && (squad.facilities.projects.length > 0 || recentlyCompleted(squad.facilities, currentDate).length > 0) && (
        <WorksCard facilities={squad.facilities} today={currentDate} />
      )}

      <AttentionCard
        items={attention}
        playerHref={playerHref}
        squadHref={squadHref}
        youthHref={`${squadHref}?tab=youth`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <HighlightsCard
          mode={highlights.mode}
          items={highlights.items}
          clubColors={clubColors}
          playerHref={playerHref}
          statsHref="/stats?tab=team"
          stars={stars}
        />
        <InboxCard messages={recentMessages} unread={unreadInboxCount} subjectOf={(m) => inboxSubject(m, t)} previewOf={(m) => inboxPreview(m, t)} />
      </div>

      <NewsCard items={news} leagues={leagues} />

      <WeekFinancesCard week={week} balance={balance} />
    </ScreenContainer>
  );
}
