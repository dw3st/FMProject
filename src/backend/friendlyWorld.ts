import { nextClubOfficialDate } from "@/backend/advanceUntil";
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { addDays } from "@/Domain/dates";
import { friendlyDue, friendlyPool, pickOpponent } from "@/Domain/friendlies/friendlies";
import { FRIENDLY } from "@/Domain/friendlies/friendlyConfig";
import { formationForSimId, formationForTactics } from "@/Domain/matchFormations";
import { countryBlockedDays } from "@/Domain/national/fifaCalendar";
import { friendliesByDirector, type Responsibilities } from "@/Domain/responsibilities/director";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { applyYouthMatch, type YouthInjuryApplied } from "@/Domain/youthComps/youthMatch";
import type { FriendlyPlayer } from "@/types/inboxTypes";
import type { PlayerStatsRecord, Squad } from "@/types/playerTypes";
import type { TacticsSave } from "@/types/tacticsTypes";

/** I/O of the director's friendlies (`.claude/rules/game/responsibilities.md` → "Amistosos"). */

export interface FriendlySeat {
  seatId: string;
  clubId: string;
  leagueSlug: string;
  responsibilities: Responsibilities | undefined;
  tactics: TacticsSave | null | undefined;
}

export interface FriendlyResult {
  seatId: string;
  squad: Squad;
  opponentId: string;
  opponentName: string;
  goalsFor: number;
  goalsAgainst: number;
  clubName: string;
  players: FriendlyPlayer[];
  participants: string[];
  injuries: YouthInjuryApplied[];
  healed: { squadId: string; playerId: string; playerName: string }[];
}

export async function playFriendlyDay(args: {
  service: SaveService;
  saveId: string;
  date: string;
  index: SquadIndex;
  seats: FriendlySeat[];
  humanClubs: ReadonlySet<string>;
  teamsPlayingToday: ReadonlySet<string>;
  countryOfLeague: (slug: string) => Promise<string | null | undefined>;
  squadOf: (id: string) => Promise<Squad | null>;
}): Promise<FriendlyResult[]> {
  const { service, saveId, date, index, seats, humanClubs, teamsPlayingToday, countryOfLeague, squadOf } = args;
  const out: FriendlyResult[] = [];
  for (const seat of seats) {
    if (!friendliesByDirector(seat.responsibilities)) continue;
    const country = await countryOfLeague(seat.leagueSlug);
    const due = friendlyDue({
      date,
      playsToday: teamsPlayingToday.has(seat.clubId),
      blocked: countryBlockedDays(country, date, date).has(date),
      nextOfficial: await nextClubOfficialDate(service, saveId, seat.leagueSlug, seat.clubId, addDays(date, 1)),
    });
    if (!due) continue;

    const squad = await squadOf(seat.clubId);
    if (!squad) continue;
    const pool = friendlyPool(squad.players, date, seat.tactics?.lineup ?? []);
    if (!pool) continue;
    const rng = mulberry32(seedFrom(`friendly:${saveId}:${seat.clubId}:${date}`));
    const opponentId = pickOpponent(index.inLeague(seat.leagueSlug).map((t) => t.squadId), seat.clubId, humanClubs, rng());
    const opponent = opponentId ? await squadOf(opponentId) : null;
    if (!opponent) continue;

    const formation = formationForTactics(seat.tactics);
    const opponentFormation = formationForSimId("4-3-3");
    const { recording } = quickSimMatch({
      fixtureId: `friendly_${date}_${seat.clubId}`,
      home: { ...squad, players: pool },
      away: opponent,
      homeLineup: autoLineupForFormation({ ...squad, players: pool }, formation, date),
      awayLineup: autoLineupForFormation(opponent, opponentFormation, date),
      homeRoles: slotRoles(formation),
      awayRoles: slotRoles(opponentFormation),
      pitchCondition: FRIENDLY.PITCH,
    }, rng);

    // Every substitution used: reserves of the pool, drawn, come on for the second half.
    const onPitch = new Set(Object.keys(recording.playerStats));
    const subs = pool.filter((p) => !onPitch.has(p.id))
      .map((p) => ({ p, k: rng() })).sort((a, b) => a.k - b.k).slice(0, FRIENDLY.SUBS).map((x) => x.p);
    const subIds = new Set(subs.map((p) => p.id));
    for (const p of subs) {
      recording.playerStats[p.id] = { goals: 0, assists: 0 } as (typeof recording.playerStats)[string];
      recording.playerRatings[p.id] = FRIENDLY.SUB_RATING;
      recording.playerEnergy[p.id] = Math.max(0, (p.seasonLog?.fitness ?? 100) - FRIENDLY.SUB_ENERGY_COST);
    }

    const applied = applyYouthMatch(squad, recording, { date, rng, trackMorale: false, friendly: { subs: subIds } });
    const before = new Map(squad.players.map((p) => [p.id, p]));
    const players: FriendlyPlayer[] = applied.squad.players.flatMap((p) => {
      const ps = recording.playerStats[p.id];
      const old = before.get(p.id);
      if (!ps || !old) return [];
      const was = old.stats as PlayerStatsRecord & Record<string, number>;
      const now = p.stats as PlayerStatsRecord & Record<string, number>;
      const changes = Object.keys(now).flatMap((attribute) =>
        now[attribute] !== was[attribute] ? [{ attribute, from: was[attribute] ?? 0, to: now[attribute] ?? 0 }] : []);
      return [{
        playerId: p.id, name: p.name, goals: ps.goals, rating: recording.playerRatings[p.id] ?? 6,
        fitness: Math.round(p.seasonLog?.fitness ?? 0), ...(subIds.has(p.id) ? { sub: true as const } : {}), changes,
      }];
    });
    out.push({
      seatId: seat.seatId,
      squad: applied.squad,
      opponentId: opponent.id,
      opponentName: opponent.name,
      goalsFor: recording.score.home,
      goalsAgainst: recording.score.away,
      clubName: squad.name,
      players,
      participants: applied.participants,
      injuries: applied.injuriesApplied,
      healed: applied.healedPlayerIds.map((id) => ({
        squadId: squad.id, playerId: id, playerName: squad.players.find((p) => p.id === id)?.name ?? id,
      })),
    });
  }
  return out;
}
