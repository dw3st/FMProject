import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import type { LeagueData, LeagueTeam, LeagueZone, LeagueZoneColor, StandingRow } from "@/types/playerTypes";
import type { ContinentalSlug, Fixture } from "@/types/calendarTypes";
import type { DayLog, MatchEvent } from "@/types/dayLogTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { clubSlugFromSquadId } from "@/backend/squadIdResolve";
import { computeStandings } from "@/Domain/season";
import { countryDisplayName, leagueLabel, competitionName } from "@/Domain/world/labels";
import { resolveSimMode, MAX_FOLLOWED_LEAGUES } from "@/Domain/advanceDay/simMode";
import { updateFollowedLeagues } from "@/GameInterface/gameSession";
import { Icon } from "@/GameInterface/Icons";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { ClubFinancesTable } from "@/GameInterface/Components/ClubFinancesTable";
import type { ClubFinanceRow } from "@/Domain/aiFinance/financeRows";
import { CupBracket, type CupBracketData } from "@/GameInterface/Components/CupBracket";
import { ContinentalView, type ContinentalData } from "@/GameInterface/Components/ContinentalView";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { CONTINENTAL_SLUGS, isContinentalSlug } from "@/Domain/continental/competitions";
import countriesRaw from "@/Data/countries.json";

const countries: CountryEntry[] = Object.values(countriesRaw as Record<string, CountryEntry>);
const COUNTRY_BY_NAME = new Map(countries.map((c) => [c.name, c]));

const resultColors: Record<string, string> = {
  W: "bg-chart-2 text-white",
  D: "bg-zinc-600 text-white",
  L: "bg-destructive text-white",
};

const ZONE_BORDER: Record<LeagueZoneColor, string> = {
  blue: "border-l-blue-500",
  orange: "border-l-orange-500",
  cyan: "border-l-cyan-500",
  green: "border-l-green-500",
  red: "border-l-red-500",
  purple: "border-l-purple-500",
};

const ZONE_DOT: Record<LeagueZoneColor, string> = {
  blue: "bg-chart-3",
  orange: "bg-chart-4",
  cyan: "bg-chart-3",
  green: "bg-chart-2",
  red: "bg-destructive",
  purple: "bg-primary",
};

function getZone(rank: number, total: number, zones: LeagueZone[]): LeagueZone | null {
  for (const z of zones) {
    if (z.fromEnd != null) {
      if (rank > total - z.fromEnd) return z;
    } else if (z.from != null) {
      const to = z.to ?? z.from;
      if (rank >= z.from && rank <= to) return z;
    }
  }
  return null;
}

function StandingsTable({
  standings,
  zones,
  onClickSquad,
}: {
  standings: StandingRow[];
  zones: LeagueZone[];
  onClickSquad: (row: StandingRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={TABLE_STYLE.shell}>
      <div className={`grid grid-cols-[40px_1fr_50px_40px_40px_40px_40px_40px_50px_60px_120px] gap-2 px-4 py-3 ${TABLE_STYLE.head}`}>
        <div className="text-center">{t("leagues.rank")}</div>
        <div>{t("leagues.club")}</div>
        <div className="text-center">{t("leagues.matches")}</div>
        <div className="text-center">{t("leagues.won")}</div>
        <div className="text-center">{t("leagues.drawn")}</div>
        <div className="text-center">{t("leagues.lost")}</div>
        <div className="text-center">{t("leagues.goalsFor")}</div>
        <div className="text-center">{t("leagues.goalsAgainst")}</div>
        <div className="text-center">{t("leagues.goalDifference")}</div>
        <div className="text-center font-display">{t("leagues.points")}</div>
        <div className="text-center">{t("leagues.lastFive")}</div>
      </div>

      <div className={TABLE_STYLE.body}>
        {standings.map((row, idx) => {
          const rank = idx + 1;
          const zone = getZone(rank, standings.length, zones);

          return (
            <div
              key={row.squadId}
              onClick={() => onClickSquad(row)}
              className={`grid grid-cols-[40px_1fr_50px_40px_40px_40px_40px_40px_50px_60px_120px] gap-2 px-4 py-2.5 ${TABLE_STYLE.row} ${TABLE_STYLE.rowClickable} border-l-4 ${
                zone ? ZONE_BORDER[zone.color] : "border-l-transparent"
              }`}
            >
              <div className={TABLE_STYLE.rank}>{rank}</div>

              <div className="flex items-center gap-3">
                <ClubLogo
                  logoUrl={squadLogoUrl(row.squadId)}
                  primaryColor={row.colors[0]}
                  secondaryColor={row.colors[1]}
                  className={TABLE_STYLE.crest}
                  imgClassName="w-full h-full object-contain"
                />
                <span className={TABLE_STYLE.name}>{row.name}</span>
              </div>

              <div className="text-center text-muted-foreground">{row.mp}</div>
              <div className="text-center text-muted-foreground">{row.w}</div>
              <div className="text-center text-muted-foreground">{row.d}</div>
              <div className="text-center text-muted-foreground">{row.l}</div>
              <div className="text-center text-muted-foreground">{row.gf}</div>
              <div className="text-center text-muted-foreground">{row.ga}</div>
              <div className={`text-center font-semibold ${row.gd >= 0 ? "text-primary" : "text-destructive"}`}>
                {row.gd > 0 ? `+${row.gd}` : row.gd}
              </div>
              <div className={TABLE_STYLE.key}>
                {row.pts}
              </div>
              <div className="flex items-center justify-center gap-1">
                {row.form.map((result, i) => (
                  <span
                    key={i}
                    className={`w-5 h-5 rounded text-sm font-bold flex items-center justify-center ${resultColors[result]}`}
                  >
                    {result}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FixturesPanel({
  fixtures,
  activeLeagueSlug,
  standings,
  currentDate,
  onClickFixture,
}: {
  fixtures: Fixture[];
  activeLeagueSlug: string;
  standings: StandingRow[];
  currentDate: string;
  onClickFixture: (fixture: Fixture) => void;
}) {
  const { t } = useTranslation();
  const leagueFixtures = fixtures.filter(f => f.competition === activeLeagueSlug);
  const maxRound = leagueFixtures.reduce((m, f) => Math.max(m, f.round), 0);

  // Default to the round that contains currentDate, or the first unplayed round
  const initialRound = (() => {
    if (!currentDate || leagueFixtures.length === 0) return 1;
    const played = leagueFixtures.filter(f => f.date <= currentDate);
    return played.length > 0 ? played[played.length - 1]!.round : 1;
  })();

  const [round, setRound] = useState(initialRound);

  const roundFixtures = leagueFixtures
    .filter(f => f.round === round)
    .sort((a, b) => a.date.localeCompare(b.date));

  const teamName = (squadId: string) =>
    standings.find(s => s.squadId === squadId)?.name ??
    squadId.split("_").slice(-1)[0]!.replace(/\b\w/g, c => c.toUpperCase());

  const teamColors = (squadId: string) =>
    standings.find(s => s.squadId === squadId)?.colors ?? ["#555", "#888"] as [string, string];

  if (leagueFixtures.length === 0) {
    return (
      <p className="text-muted-foreground text-sm p-4">
        {t("leagues.noFixtureData")}
      </p>
    );
  }

  const roundDate = roundFixtures[0]?.date
    ? new Date(roundFixtures[0].date + "T12:00:00").toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";

  return (
    <div className="space-y-4">
      {/* Round navigator */}
      <div className="flex items-center justify-between card-arcade rounded-md px-4 py-3">
        <button
          onClick={() => setRound(r => Math.max(1, r - 1))}
          disabled={round <= 1}
          className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-30 cursor-pointer bg-transparent border-0"
        >
          <Icon name="chevron-left" className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="text-center">
          <p className="text-sm font-bold font-display uppercase tracking-[0.08em] text-foreground">
            {t("leagues.matchday", { round })}
          </p>
          {roundDate && (
            <p className="text-sm text-muted-foreground mt-0.5">{roundDate}</p>
          )}
        </div>

        <button
          onClick={() => setRound(r => Math.min(maxRound, r + 1))}
          disabled={round >= maxRound}
          className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-30 cursor-pointer bg-transparent border-0"
        >
          <Icon name="chevron-right" className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Match list */}
      <div className="card-arcade rounded-md overflow-hidden divide-y divide-border/50">
        {roundFixtures.map((f, i) => {
          const isPlayed = f.played && !!f.result;
          return (
            <div
              key={i}
              onClick={() => isPlayed && onClickFixture(f)}
              className={`grid grid-cols-[1fr_80px_1fr] items-center px-4 py-3 transition-colors ${
                isPlayed
                  ? "hover:bg-secondary/30 cursor-pointer"
                  : "opacity-60"
              }`}
            >
              {/* Home */}
              <div className="flex items-center gap-3 justify-end">
                <span className="font-semibold text-foreground text-sm">{teamName(f.home)}</span>
                <ClubLogo
                  logoUrl={squadLogoUrl(f.home)}
                  primaryColor={teamColors(f.home)[0]}
                  secondaryColor={teamColors(f.home)[1]}
                  className="w-8 h-8 rounded-full shrink-0"
                  imgClassName="w-full h-full object-contain"
                />
              </div>

              {/* Score / vs */}
              <div className="text-center">
                {isPlayed ? (
                  <span className="font-black font-display text-foreground">
                    {f.result!.home} – {f.result!.away}
                  </span>
                ) : (
                  <span className="text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] font-display">{t("leagues.vs")}</span>
                )}
              </div>

              {/* Away */}
              <div className="flex items-center gap-3">
                <ClubLogo
                  logoUrl={squadLogoUrl(f.away)}
                  primaryColor={teamColors(f.away)[0]}
                  secondaryColor={teamColors(f.away)[1]}
                  className="w-8 h-8 rounded-full shrink-0"
                  imgClassName="w-full h-full object-contain"
                />
                <span className="font-semibold text-foreground text-sm">{teamName(f.away)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBar({ homeVal, awayVal, label }: { homeVal: number; awayVal: number; label: string }) {
  const total = homeVal + awayVal || 1;
  const homePct = (homeVal / total) * 100;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm font-black tabular-nums text-foreground">{homeVal}</span>
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden max-w-[120px]">
          <div className="h-full bg-primary rounded-full ml-auto" style={{ width: `${homePct}%` }} />
        </div>
      </div>
      <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground w-28 text-center shrink-0 font-display">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden max-w-[120px]">
          <div className="h-full bg-chart-2 rounded-full" style={{ width: `${100 - homePct}%` }} />
        </div>
        <span className="text-sm font-black tabular-nums text-foreground">{awayVal}</span>
      </div>
    </div>
  );
}

function MatchStatsModal({
  event,
  standings,
  allTeams,
  onClose,
}: {
  event: MatchEvent;
  standings: StandingRow[];
  allTeams: Map<string, { name: string; colors: [string, string] }>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const lookup = (squadId: string) =>
    standings.find(s => s.squadId === squadId) ?? allTeams.get(squadId);

  const teamName = (squadId: string) =>
    lookup(squadId)?.name ??
    squadId.split("_").slice(-1)[0]!.replace(/\b\w/g, c => c.toUpperCase());
  const teamColors = (squadId: string) =>
    lookup(squadId)?.colors ?? ["#555", "#888"] as [string, string];
  const homeName = teamName(event.home);
  const awayName = teamName(event.away);

  type PlayerRow = { id: string; name: string; rating: number; goals: number; assists: number; shots: number; passesCompleted: number; passesAttempted: number; tackles: number; interceptions: number; team: "home" | "away" };

  const playerRows: PlayerRow[] = Object.entries(event.playerStats).map(([id, ps]) => ({
    id,
    name: event.playerNames?.[id] ?? id,
    rating: event.playerRatings?.[id] ?? 0,
    goals: ps.goals,
    assists: ps.assists,
    shots: ps.shots,
    passesCompleted: ps.passesCompleted,
    passesAttempted: ps.passesAttempted,
    tackles: ps.tackles,
    interceptions: ps.interceptions,
    team: event.playerTeams?.[id] ?? "home",
  })).sort((a, b) => b.rating - a.rating);

  const homePlayers = playerRows.filter(p => p.team === "home");
  const awayPlayers = playerRows.filter(p => p.team === "away");

  const passAcc = (c: number, a: number) => a > 0 ? `${Math.round((c / a) * 100)}%` : "—";

  function PlayerTable({ players, side }: { players: PlayerRow[]; side: "home" | "away" }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">
              <th className={`py-2 font-bold ${side === "away" ? "text-right pr-3" : "text-left pl-3"}`}>{t("leagues.playerTable.player")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.rating")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.goals")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.assists")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.shots")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.passAccuracy")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.tackles")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.interceptions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {players.map(p => (
              <tr key={p.id} className="hover:bg-muted/10">
                <td className={`py-1.5 font-semibold text-foreground ${side === "away" ? "text-right pr-3" : "pl-3"}`}>{p.name}</td>
                <td className="px-2 text-center">
                  {p.rating > 0 ? (
                    <span className={`tabular-nums inline-flex items-center gap-0.5 font-black ${ratingTextClass10(p.rating)}`}>
                      <Icon name="star" className="w-2.5 h-2.5 fill-current" />{p.rating.toFixed(1)}
                    </span>
                  ) : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="px-2 text-center font-bold text-foreground">{p.goals > 0 ? p.goals : "—"}</td>
                <td className="px-2 text-center font-bold text-chart-2">{p.assists > 0 ? p.assists : "—"}</td>
                <td className="px-2 text-center text-muted-foreground">{p.shots}</td>
                <td className="px-2 text-center text-muted-foreground">{passAcc(p.passesCompleted, p.passesAttempted)}</td>
                <td className="px-2 text-center text-muted-foreground">{p.tackles}</td>
                <td className="px-2 text-center text-muted-foreground">{p.interceptions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Modal open onClose={onClose} size="xl">
        {/* Header */}
        <div className="sticky top-0 z-10 card-arcade border-b border-border rounded-t-2xl px-6 py-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer bg-transparent border-0"
          >
            <Icon name="close" className="w-4 h-4 text-muted-foreground" />
          </button>
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-3 text-center font-display">
            {t("leagues.matchday", { round: event.round })}
          </p>
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-3 flex-1 justify-end">
              <span className="font-black text-lg text-foreground">{homeName}</span>
              <ClubLogo
                logoUrl={squadLogoUrl(event.home)}
                primaryColor={teamColors(event.home)[0]}
                secondaryColor={teamColors(event.home)[1]}
                className="w-8 h-8 rounded-full shrink-0"
                imgClassName="w-full h-full object-contain"
              />
            </div>
            <div className="text-center px-4">
              <span className="font-black text-3xl font-display text-foreground tracking-[0.08em]">
                {event.score.home} – {event.score.away}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-1 justify-start">
              <ClubLogo
                logoUrl={squadLogoUrl(event.away)}
                primaryColor={teamColors(event.away)[0]}
                secondaryColor={teamColors(event.away)[1]}
                className="w-8 h-8 rounded-full shrink-0"
                imgClassName="w-full h-full object-contain"
              />
              <span className="font-black text-lg text-foreground">{awayName}</span>
            </div>
          </div>
          {event.scorers.length > 0 && (
            <p className="text-center text-sm text-muted-foreground mt-2">
              {event.scorers.map(s => `${s.playerName}${s.goals > 1 ? ` ×${s.goals}` : ""}`).join(" · ")}
            </p>
          )}
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Team stats */}
          <div className="space-y-2">
            <StatBar homeVal={event.teamStats.home.shots}           awayVal={event.teamStats.away.shots}           label={t("common.shots")} />
            <StatBar homeVal={event.teamStats.home.passesCompleted} awayVal={event.teamStats.away.passesCompleted} label={t("common.passes")} />
            <StatBar homeVal={event.teamStats.home.tackles}         awayVal={event.teamStats.away.tackles}         label={t("common.tackles")} />
            <StatBar homeVal={event.teamStats.home.interceptions}   awayVal={event.teamStats.away.interceptions}   label={t("common.interceptions")} />
          </div>

          {/* Player stats */}
          {event.compact ? (
            <p className="text-sm text-muted-foreground m-0">{t("leagues.quickSimNoDetail")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-2 pl-3 font-display">{homeName}</p>
                <PlayerTable players={homePlayers} side="home" />
              </div>
              <div>
                <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-2 pl-3 font-display">{awayName}</p>
                <PlayerTable players={awayPlayers} side="away" />
              </div>
            </div>
          )}

          {/* Substitutions */}
          {event.substitutions && event.substitutions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Icon name="arrow-right-left" className="w-3 h-3 text-muted-foreground" />
                <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground m-0 font-display">{t("leagues.substitutions")}</p>
              </div>
              <div className="space-y-1">
                {event.substitutions
                  .slice()
                  .sort((a, b) => a.matchMinute - b.matchMinute)
                  .map((sub, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-sm font-black tabular-nums text-muted-foreground w-6 shrink-0">
                        {sub.matchMinute}&apos;
                      </span>
                      <span className="text-[13px] font-bold uppercase tracking-[0.08em] font-display text-muted-foreground shrink-0 w-14 truncate">
                        {sub.team === "home" ? homeName : awayName}
                      </span>
                      <span className="text-destructive font-medium truncate flex-1">{sub.playerOutName}</span>
                      <Icon name="arrow-right-left" className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                      <span className="text-chart-2 font-medium truncate flex-1 text-right">{sub.playerInName}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
}

export function LeagueTableScreen({ leagueSlug }: { leagueSlug?: string }) {
  const { t, i18n } = useTranslation();
  const { session, currentDate, mergeSession, fixtures } = useGameSave();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [activeSlug, setActiveSlug] = useState(
    leagueSlug ?? session?.leagueSlug ?? "premier_league",
  );
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"table" | "fixtures" | "finances" | "cup" | "continental">("table");
  // Club finances of the selected league — fetched only while the Finances tab is open.
  const [financeRows, setFinanceRows] = useState<ClubFinanceRow[] | null>(null);
  // National cup bracket of the selected league's country — fetched only while the Cup tab is open.
  const [cupData, setCupData] = useState<CupBracketData | null>(null);
  // True once the cup fetch has come back 404 (this country has no national cup this season).
  const [cupMissing, setCupMissing] = useState(false);
  // True once the cup fetch has failed outright (network error) — distinct from a 404, so the
  // panel shows a real error instead of looking stuck on "Loading…" forever.
  const [cupError, setCupError] = useState(false);
  // Which of the 4 continental competitions is selected inside the Continental tab.
  const [continentalSlug, setContinentalSlug] = useState<ContinentalSlug | null>(null);
  const [continentalSlugTouched, setContinentalSlugTouched] = useState(false);
  // Continental groups + bracket data — fetched only while the Continental tab is open.
  const [continentalData, setContinentalData] = useState<ContinentalData | null>(null);
  // True once the continental fetch has come back 404 (no competition running this season).
  const [continentalMissing, setContinentalMissing] = useState(false);
  // True once the continental fetch has failed outright (network error) — same reasoning as
  // `cupError` above.
  const [continentalError, setContinentalError] = useState(false);
  const [matchEvent, setMatchEvent] = useState<MatchEvent | null>(null);
  const [liveStandings, setLiveStandings] = useState<StandingRow[] | null>(null);
  // True while the save's standings are in flight — the catalog fallback would show the
  // wrong clubs for a league whose membership changed in this save.
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [leagueFixtures, setLeagueFixtures] = useState<Fixture[]>([]);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((data: LeagueData[]) => {
        setLeagues(data);
        if (leagueSlug && data.some((l) => l.slug === leagueSlug)) {
          setActiveSlug(leagueSlug);
        } else if (
          !leagueSlug &&
          session?.leagueSlug &&
          data.some((l) => l.slug === session.leagueSlug)
        ) {
          setActiveSlug(session.leagueSlug);
        }
        setLoading(false);
      });
  }, [leagueSlug, session?.leagueSlug]);

  // Fetch live standings from the backend (new multi-league format)
  useEffect(() => {
    if (!session?.saveId || !activeSlug) return;
    let cancelled = false;
    setLiveStandings(null);
    setStandingsLoading(true);
    fetch(`/api/saves/${session.saveId}/leagues/${activeSlug}/standings`)
      .then((r) => (r.ok ? (r.json() as Promise<StandingRow[]>) : null))
      .catch(() => null)
      .then((rows) => {
        if (cancelled) return;
        setLiveStandings(rows ?? null);
        setStandingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.saveId, activeSlug]);

  // Fetch fixtures for the selected league
  useEffect(() => {
    if (!session?.saveId || !activeSlug) return;
    setLeagueFixtures([]);
    fetch(`/api/saves/${session.saveId}/leagues/${activeSlug}/fixtures`)
      .then((r) => (r.ok ? (r.json() as Promise<Fixture[]>) : null))
      .then((data) => setLeagueFixtures(data ?? []));
  }, [session?.saveId, activeSlug]);

  useEffect(() => {
    if (tab !== "finances" || !session?.saveId || !activeSlug) return;
    let cancelled = false;
    setFinanceRows(null);
    fetch(`/api/saves/${session.saveId}/leagues/${activeSlug}/ai-finances`)
      .then((r) => (r.ok ? (r.json() as Promise<ClubFinanceRow[]>) : []))
      .catch(() => [] as ClubFinanceRow[])
      .then((rows) => {
        if (!cancelled) setFinanceRows(rows);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, session?.saveId, activeSlug, currentDate]);

  const active = leagues.find((l) => l.slug === activeSlug);
  const cupSlug = active?.country ? cupSlugOf(active.country) : null;

  // Fetch the national cup bracket for the selected league's country — reset whenever the
  // league (and therefore the cup) changes. A country without a cup this season (cupSlug
  // null, or a 404 from the route) must not leave a stale bracket or an infinite "Loading…".
  useEffect(() => {
    if (!cupSlug) {
      setCupData(null);
      setCupMissing(false);
      setCupError(false);
      if (tab === "cup") setTab("table");
      return;
    }
    if (tab !== "cup" || !session?.saveId) return;
    let cancelled = false;
    setCupData(null);
    setCupMissing(false);
    setCupError(false);
    fetch(`/api/saves/${session.saveId}/cups/${cupSlug}`)
      .then((r) => {
        if (!r.ok) {
          if (!cancelled) setCupMissing(true);
          return null;
        }
        return r.json() as Promise<CupBracketData>;
      })
      .catch(() => {
        if (!cancelled) setCupError(true);
        return null;
      })
      .then((data) => {
        if (!cancelled) setCupData(data);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, session?.saveId, cupSlug]);

  // Default continental competition: the one the player's club is actually playing this season
  // (from the player calendar), else the continent of the currently selected league.
  const activeContinent = active?.country ? COUNTRY_BY_NAME.get(active.country)?.continent : undefined;
  const defaultContinentalSlug: ContinentalSlug = (() => {
    const own = fixtures.find((f) => isContinentalSlug(f.competition));
    if (own) return own.competition as ContinentalSlug;
    if (activeContinent === "South America") return "lib";
    return "ucl";
  })();

  // A league switch clears the user's manual pick so the default re-applies for the new context.
  useEffect(() => {
    setContinentalSlugTouched(false);
  }, [activeSlug]);

  useEffect(() => {
    if (!continentalSlugTouched) setContinentalSlug(defaultContinentalSlug);
  }, [defaultContinentalSlug, continentalSlugTouched]);

  // Fetch the continental groups + bracket — reset whenever the selected competition changes.
  // Only fetched while the Continental tab is open (same pattern as the Cup tab).
  useEffect(() => {
    if (tab !== "continental" || !session?.saveId || !continentalSlug) return;
    let cancelled = false;
    setContinentalData(null);
    setContinentalMissing(false);
    setContinentalError(false);
    fetch(`/api/saves/${session.saveId}/continental/${continentalSlug}`)
      .then((r) => {
        if (!r.ok) {
          if (!cancelled) setContinentalMissing(true);
          return null;
        }
        return r.json() as Promise<ContinentalData>;
      })
      .catch(() => {
        if (!cancelled) setContinentalError(true);
        return null;
      })
      .then((data) => {
        if (!cancelled) setContinentalData(data);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, session?.saveId, continentalSlug]);

  const hasFixtures = leagueFixtures.length > 0;
  // Prefer live standings from backend; fall back to client-side computation only once the
  // request has finished without data (old saves / no save), never while it is loading.
  const standings = liveStandings
    ?? (standingsLoading || !active ? [] : computeStandings(active.standings, leagueFixtures, activeSlug));

  // Cross-league squadId lookup so the match modal can resolve teams from any league
  const allTeams = new Map<string, { name: string; colors: [string, string] }>();
  for (const lg of leagues) {
    for (const t of lg.standings) {
      allTeams.set(t.squadId, { name: t.name, colors: t.colors });
    }
  }

  // Country-qualified labels ("Premier League · Armênia") so the combobox search also matches by country.
  const leagueOptions = leagues.map((l) => {
    const country = COUNTRY_BY_NAME.get(l.country);
    const countryName = country ? countryDisplayName(country, i18n.language, t) : l.country;
    return { value: l.slug, label: leagueLabel(l, countryName) };
  });

  // Filter out the user's own league defensively — it should never occupy a follow slot, even if
  // a stale session (e.g. from before followedLeagues synced from the server) carries it.
  const followedLeagues = (session?.followedLeagues ?? []).filter((slug) => slug !== session?.leagueSlug);
  const isOwnLeague = !!session && activeSlug === session.leagueSlug;
  const isFollowed = followedLeagues.includes(activeSlug);
  const atFollowLimit = !isFollowed && followedLeagues.length >= MAX_FOLLOWED_LEAGUES;
  const followDisabled = isOwnLeague || atFollowLimit || followBusy || !session;
  const followTooltip = isOwnLeague
    ? t("leagues.followOwnLeague")
    : atFollowLimit
      ? t("leagues.followLimit")
      : isFollowed
        ? t("leagues.unfollowLeague")
        : t("leagues.followLeague");

  const simMode = session
    ? resolveSimMode(activeSlug, { leagueSlug: session.leagueSlug, followedLeagues })
    : "full";

  const handleToggleFollow = async () => {
    if (!session || followDisabled) return;
    const previous = followedLeagues;
    const next = isFollowed
      ? previous.filter((s) => s !== activeSlug)
      : [...previous, activeSlug];
    mergeSession({ followedLeagues: next });
    setFollowBusy(true);
    try {
      const saved = await updateFollowedLeagues(session.saveId, next);
      mergeSession({ followedLeagues: saved });
    } catch {
      mergeSession({ followedLeagues: previous });
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground text-sm p-6">{t("leagues.loadingLeagues")}</p>;
  }

  const handleClickFixture = (fixture: Fixture) => {
    if (!session) return;
    fetch(`/api/saves/${session.saveId}/days/${fixture.date}`)
      .then(r => r.ok ? r.json() as Promise<DayLog> : null)
      .then(log => {
        if (!log) return;
        const ev = log.events.find(
          e =>
            e.kind === "match" &&
            e.fixtureId === fixture.id &&
            e.competition === fixture.competition,
        ) as MatchEvent | undefined;
        if (ev) setMatchEvent(ev);
      });
  };

  const handleClickSquad = (row: Pick<StandingRow, "squadId" | "slug">) => {
    const clubPart =
      row.slug ??
      clubSlugFromSquadId(row.squadId, activeSlug);
    window.location.href = `/squad/${activeSlug}/${clubPart}`;
  };

  return (
    <>
    <ScreenContainer>
        <PageHeadline
          backHref="/dashboard"
          accent={t("screenTitles.leagues.accent")}
          trailing={
            active ? (
              <div className="text-sm text-muted-foreground font-semibold">{t("common.season")} {active.season}</div>
            ) : undefined
          }
        >
          {t("screenTitles.leagues.main")}
        </PageHeadline>

        {leagues.length > 0 && (
          <div className="flex items-end gap-2">
            <SelectCombobox
              label={t("leagues.selectLeague")}
              labelId="league-table-league"
              value={activeSlug}
              onChange={setActiveSlug}
              options={leagueOptions}
              leadingIcon={<Icon name="trophy" className="w-4 h-4 text-primary shrink-0" aria-hidden />}
              placeholder={t("leagues.searchLeaguesPlaceholder")}
              className="w-full max-w-sm"
            />
            <button
              type="button"
              onClick={() => void handleToggleFollow()}
              disabled={followDisabled}
              title={followTooltip}
              aria-label={followTooltip}
              aria-pressed={isFollowed}
              className="shrink-0 p-2 rounded-lg border border-border bg-secondary/10 hover:bg-secondary/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon
                name={isFollowed ? "star-filled" : "star"}
                size={18}
                className={isFollowed ? "text-chart-4" : "text-muted-foreground"}
              />
            </button>
            {simMode === "fast" && (
              <span
                title={t("leagues.simulatedBadgeTooltip")}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-chart-4/40 bg-chart-4/10 px-2.5 py-1.5 text-sm font-bold text-chart-4"
              >
                {t("leagues.simulatedBadge")}
              </span>
            )}
          </div>
        )}

        {active && (
          <>
            <SegmentedTabs
              tabs={[
                { key: "table" as const, label: t("leagues.table") },
                { key: "fixtures" as const, label: t("leagues.fixtures"), disabled: !hasFixtures },
                { key: "finances" as const, label: t("leagues.finances.tab"), disabled: !session },
                ...(cupSlug
                  ? [{ key: "cup" as const, label: competitionName(cupSlug, leagues, i18n.language), disabled: !session }]
                  : []),
                { key: "continental" as const, label: t("continental.tab"), disabled: !session },
              ]}
              active={tab}
              onChange={setTab}
            />

            {tab === "table" ? (
              <>
                {standingsLoading ? (
                  <p className="text-muted-foreground text-sm p-6">{t("leagues.loadingStandings")}</p>
                ) : (
                  <StandingsTable
                    standings={standings}
                    zones={active?.zones ?? []}
                    onClickSquad={handleClickSquad}
                  />
                )}

                {(active?.zones?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
                    {active!.zones!.map(z => (
                      <div key={z.id} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${ZONE_DOT[z.color]}`} />
                        <span>{t(`leagues.zones.${z.id}`, { defaultValue: z.label })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : tab === "finances" ? (
              financeRows === null ? (
                <p className="text-muted-foreground text-sm p-6">{t("leagues.finances.loading")}</p>
              ) : (
                <div className="space-y-3">
                  <ClubFinancesTable
                    rows={financeRows}
                    onClickSquad={handleClickSquad}
                  />
                  <p className="text-sm text-muted-foreground m-0">{t("leagues.finances.note")}</p>
                </div>
              )
            ) : tab === "cup" ? (
              cupError ? (
                <p className="text-destructive text-sm p-6">{t("warnings.errors.loadFailed")}</p>
              ) : cupMissing ? (
                <p className="text-muted-foreground text-sm p-6">{t("cups.none")}</p>
              ) : cupData ? (
                <CupBracket data={cupData} myClubId={session?.clubId ?? ""} />
              ) : (
                <p className="text-muted-foreground text-sm p-6">{t("cups.loading")}</p>
              )
            ) : tab === "continental" ? (
              <div className="space-y-4">
                <SegmentedTabs
                  wrap
                  compact
                  tabs={CONTINENTAL_SLUGS.map((slug) => ({ key: slug, label: competitionName(slug, leagues, i18n.language) }))}
                  active={continentalSlug}
                  onChange={(slug) => {
                    setContinentalSlug(slug);
                    setContinentalSlugTouched(true);
                  }}
                />

                {continentalError ? (
                  <p className="text-destructive text-sm p-6">{t("warnings.errors.loadFailed")}</p>
                ) : continentalMissing ? (
                  <p className="text-muted-foreground text-sm p-6">{t("continental.none")}</p>
                ) : continentalData ? (
                  <ContinentalView data={continentalData} myClubId={session?.clubId ?? ""} />
                ) : (
                  <p className="text-muted-foreground text-sm p-6">{t("cups.loading")}</p>
                )}
              </div>
            ) : (
              <FixturesPanel
                fixtures={leagueFixtures}
                activeLeagueSlug={activeSlug}
                standings={standings}
                currentDate={currentDate}
                onClickFixture={handleClickFixture}
              />
            )}
          </>
        )}
    </ScreenContainer>

      {matchEvent && (
        <MatchStatsModal
          event={matchEvent}
          standings={standings}
          allTeams={allTeams}
          onClose={() => setMatchEvent(null)}
        />
      )}
    </>
  );
}
