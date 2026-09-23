import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import type { LeagueData, LeagueTeam, Squad } from "@/types/playerTypes";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import type { MatchResult } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { clubSlugFromSquadId, squadIdToClubSlugMap } from "@/backend/squadIdResolve";

function standingClubFileSlug(squadId: string, leagueSlug: string, leagues: LeagueData[]): string {
  const L = leagues.find((l) => l.slug === leagueSlug);
  const m = L ? squadIdToClubSlugMap(L.standings) : undefined;
  return clubSlugFromSquadId(squadId, leagueSlug, m);
}

async function fetchSquad(league: string, club: string): Promise<Squad> {
  const res = await fetch(`/api/debug/squad/${league}/${club}`);
  if (!res.ok) throw new Error(`Failed to load ${club}`);
  return res.json() as Promise<Squad>;
}

function TeamSelector({
  label,
  leagues,
  value,
  onChange,
}: {
  label: string;
  leagues: LeagueData[];
  value: { league: string; club: string } | null;
  onChange: (v: { league: string; club: string }) => void;
}) {
  const [selectedLeague, setSelectedLeague] = useState(
    value?.league ?? leagues[0]?.slug ?? ""
  );

  const clubs: LeagueTeam[] =
    leagues.find((l) => l.slug === selectedLeague)?.standings ?? [];

  function handleLeagueChange(slug: string) {
    setSelectedLeague(slug);
    const first = leagues.find((l) => l.slug === slug)?.standings[0];
    if (first) onChange({ league: slug, club: standingClubFileSlug(first.squadId, slug, leagues) });
  }

  function handleClubChange(squadId: string) {
    onChange({
      league: selectedLeague,
      club: standingClubFileSlug(squadId, selectedLeague, leagues),
    });
  }

  const selectedClub = clubs.find(
    (c) => standingClubFileSlug(c.squadId, selectedLeague, leagues) === value?.club
  );

  const inputClass =
    "w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all";

  return (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="text-xs font-bold text-muted-foreground tracking-widest uppercase mb-3">
        {label}
      </div>

      {selectedClub && (
        <div className="flex items-center gap-3 mb-4">
          <span
            className="w-8 h-8 rounded-full border border-border shrink-0"
            style={{
              background: `linear-gradient(135deg, ${selectedClub.colors[0]} 50%, ${selectedClub.colors[1]} 50%)`,
            }}
          />
          <span className="font-semibold text-foreground">{selectedClub.name}</span>
        </div>
      )}

      <div className="space-y-2">
        <select
          className={inputClass}
          value={selectedLeague}
          onChange={(e) => handleLeagueChange(e.target.value)}
        >
          {leagues.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </select>

        <select
          className={inputClass}
          value={
            value
              ? clubs.find(
                  (c) =>
                    standingClubFileSlug(c.squadId, selectedLeague, leagues) === value.club,
                )?.squadId ?? ""
              : ""
          }
          onChange={(e) => handleClubChange(e.target.value)}
        >
          {clubs.map((c) => (
            <option key={c.squadId} value={c.squadId}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  nameA,
  nameB,
}: {
  result: MatchResult;
  nameA: string;
  nameB: string;
}) {
  const { t } = useTranslation();
  const { score, teamStats, playerStats, playerRatings, players, durationMs } = result;

  const topRated = [...players]
    .sort((a, b) => (playerRatings[b.id] ?? 6) - (playerRatings[a.id] ?? 6))
    .slice(0, 5);

  const scorers = players
    .filter((p) => (playerStats.get(p.id)?.goals ?? 0) > 0)
    .sort(
      (a, b) =>
        (playerStats.get(b.id)?.goals ?? 0) - (playerStats.get(a.id)?.goals ?? 0)
    );

  return (
    <div className="space-y-4 w-full">
      <div className="card-arcade rounded-xl border-glow p-6 text-center">
        <div className="flex items-center justify-center gap-6">
          <div className="flex-1 text-right">
            <div className="text-sm font-semibold text-muted-foreground truncate">{nameA}</div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-5xl font-black text-foreground tabular-nums font-display">{score.A}</span>
            <span className="text-2xl text-muted-foreground/40">–</span>
            <span className="text-5xl font-black text-foreground tabular-nums font-display">{score.B}</span>
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-semibold text-muted-foreground truncate">{nameB}</div>
          </div>
        </div>
        <div className="mt-3 text-[10px] text-muted-foreground/40 tracking-widest uppercase">
          {t("common.ftMs")} · {durationMs.toFixed(1)} {t("common.milliseconds")}
        </div>
      </div>

      <div className="card-arcade rounded-xl overflow-hidden">
        <div className="px-3 py-1.5 border-b border-border text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
          {t("common.teamStats")}
        </div>
        <div className="p-3 space-y-2">
          {(
            [
              ["Shots", "shots"],
              ["Passes Completed", "passesCompleted"],
              ["Passes Attempted", "passesAttempted"],
              ["Tackles Won", "tackles"],
              ["Interceptions", "interceptions"],
            ] as const
          ).map(([label, key]) => {
            const a = teamStats.A[key] as number;
            const b = teamStats.B[key] as number;
            const total = a + b || 1;
            const pctA = (a / total) * 100;
            return (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="tabular-nums">{a}</span>
                  <span className="text-muted-foreground/50">{label}</span>
                  <span className="tabular-nums">{b}</span>
                </div>
                <div className="flex h-1 rounded-full overflow-hidden bg-muted/30">
                  <div className="bg-blue-400/70 transition-all" style={{ width: `${pctA}%` }} />
                  <div className="flex-1 bg-red-400/70" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 card-arcade rounded-xl overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            {t("common.topRatings")}
          </div>
          <div className="p-3 space-y-1.5">
            {topRated.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: p.team === "A" ? "#60a5fa" : "#f87171" }}
                />
                <span className="flex-1 text-[11px] text-foreground/70 truncate">{p.name}</span>
                <span className="text-[11px] font-bold text-primary tabular-nums">
                  {(playerRatings[p.id] ?? 6).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 card-arcade rounded-xl overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            {t("common.scorers")}
          </div>
          <div className="p-3 space-y-1.5">
            {scorers.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/50 italic m-0">{t("common.noGoalsScored")}</p>
            ) : (
              scorers.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: p.team === "A" ? "#60a5fa" : "#f87171" }}
                  />
                  <span className="flex-1 text-[11px] text-foreground/70 truncate">{p.name}</span>
                  <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                    ×{playerStats.get(p.id)?.goals ?? 0}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SimulationScreen() {
  const { t } = useTranslation();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [teamA, setTeamA] = useState<{ league: string; club: string } | null>(null);
  const [teamB, setTeamB] = useState<{ league: string; club: string } | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [resultNames, setResultNames] = useState<{ A: string; B: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((data: LeagueData[]) => {
        setLeagues(data);
        if (data.length > 0) {
          const first = data[0]!;
          const slug = first.slug;
          const clubs = first.standings;
          setTeamA({
            league: slug,
            club: standingClubFileSlug(clubs[0]!.squadId, slug, data),
          });
          setTeamB({
            league: slug,
            club: standingClubFileSlug(clubs[1]?.squadId ?? clubs[0]!.squadId, slug, data),
          });
        }
        setLoadingLeagues(false);
      })
      .catch(() => {
        setLoadingLeagues(false);
      });
  }, []);

  async function runSimulation() {
    if (!teamA || !teamB) return;
    setSimulating(true);
    setError(null);
    setResult(null);

    try {
      const [squadA, squadB] = await Promise.all([
        fetchSquad(teamA.league, teamA.club),
        fetchSquad(teamB.league, teamB.club),
      ]);

      const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
      const res = simulateMatch(
        squadA,
        squadB,
        formation,
        formation,
        autoLineupDefaultFormation(squadA),
        autoLineupDefaultFormation(squadB),
      );
      setResult(res);
      setResultNames({ A: squadA.name, B: squadB.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimulating(false);
    }
  }

  if (loadingLeagues) {
    return <p className="text-muted-foreground text-sm p-6">{t("common.loadingLeagues")}</p>;
  }

  return (
    <div className="w-full max-w-3xl space-y-6 p-6">
      <PageHeadline
        backHref="/"
        size="md"
        subtitle={
          <span className="text-xs text-muted-foreground block m-0">{t("common.headlessEngine")}</span>
        }
      >
        {t("common.simulation")} <span className="text-primary glow-text">{t("common.simulation")}</span>
      </PageHeadline>

      <div className="card-arcade rounded-xl border-glow p-5">
        <div className="flex gap-6 items-start">
          <TeamSelector label={t("common.teamA")} leagues={leagues} value={teamA} onChange={setTeamA} />
          <div className="pt-10 text-muted-foreground/30 text-2xl font-black shrink-0 font-display">vs</div>
          <TeamSelector label={t("common.teamB")} leagues={leagues} value={teamB} onChange={setTeamB} />
        </div>

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={runSimulation}
            disabled={simulating || !teamA || !teamB}
            className="px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm tracking-wide hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed glow-primary cursor-pointer border-0"
          >
            {simulating ? "Simulating..." : "Simulate Match"}
          </button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {result && resultNames && (
        <ResultPanel result={result} nameA={resultNames.A} nameB={resultNames.B} />
      )}
    </div>
  );
}
