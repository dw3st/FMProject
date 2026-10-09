import { addDays } from "@/Domain/dates";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { trainingGroundEffectsOf } from "@/Domain/facilities/facilities";
import { applyMatchFitness } from "@/Domain/fitness/fitness";
import { clearHealed, mergeInjury, returnDate as injuryReturnDate, withInjuryCounted } from "@/Domain/injury/injury";
import { moraleDpMult } from "@/Domain/morale/morale";
import { personalDpMult } from "@/Domain/personality/personality";
import { rebornDpMult } from "@/Domain/retirement/rebornMult";
import { areaMultsOf, staffEffectsOf } from "@/Domain/staff/staff";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { applyDevelopment } from "@/GameEngine/PlayerDevelopment";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { Rng } from "@/Domain/advanceDay/quickSim";
import type { Fixture } from "@/types/calendarTypes";
import type { MatchInjury } from "@/types/dayLogTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { YouthLeader, YouthMatchLog } from "@/types/youthCompTypes";

/** Pure post-match of a youth-competition game (`.claude/rules/game/youth-competitions.md` → "Pós-jogo"). */

const DEFAULT_STAMINA = 7;
const YOUTH_MATCH_MINUTES = 90;

export interface YouthInjuryApplied extends MatchInjury {
  squadId: string;
  returnDate: string;
}

export interface YouthMatchApplied {
  squad: Squad;
  /** Real players of this squad who played (squad and academy). */
  participants: string[];
  injuriesApplied: YouthInjuryApplied[];
  /** Players whose injury cleared today (`clearHealed`), for the "returned" inbox message. */
  healedPlayerIds: string[];
}

/** The youth-game growth factor by age: `DP_MULT` up to 21, `DP_MULT_OVERAGE` for the over-age reserves. */
export function youthCompDpMult(age: number): number {
  return age > YOUTH_COMP.MAX_AGE.u21 ? YOUTH_COMP.DP_MULT_OVERAGE : YOUTH_COMP.DP_MULT;
}

/** DP multiplier of a youth game: the same factors as a club match × `DP_MULT` (× `DP_MULT_OVERAGE` above 21). */
export function youthDpMult(squad: Squad, p: RosterPlayer): number {
  const { devMult } = staffEffectsOf(squad);
  const { matchDevMult } = trainingGroundEffectsOf(squad);
  return devMult * matchDevMult * rebornDpMult(p) * personalDpMult(p, moraleDpMult(p)) * youthCompDpMult(p.age);
}

/**
 * Applies one youth game to the real players of `squad` who appear in `recording.playerStats`
 * (players or academy): `seasonLog.youthCup` (outside the season totals), fitness and load of a
 * 90-minute match, DP × `DP_MULT` (growth only: the age decline is not charged again), injuries. Cards
 * are ignored and bans are not served. Who did not play is untouched (he trains or rests that day).
 */
export function applyYouthMatch(
  squad: Squad,
  recording: PlayedMatchRecording,
  opts: { date: string; rng: Rng; trackMorale: boolean },
): YouthMatchApplied {
  const { date, rng, trackMorale } = opts;
  const staffFx = staffEffectsOf(squad);
  const ground = trainingGroundEffectsOf(squad);
  const recoveryMult = staffFx.recoveryMult * ground.recoveryMult;
  const areas = areaMultsOf(squad);
  const injuryBy = new Map((recording.injuries ?? []).map((i) => [i.playerId, i]));
  const participants: string[] = [];
  const injuriesApplied: YouthInjuryApplied[] = [];
  const healedPlayerIds: string[] = [];

  const apply = (p0: RosterPlayer, isSquadPlayer: boolean): RosterPlayer => {
    const ps = recording.playerStats[p0.id];
    if (!ps) return p0;
    participants.push(p0.id);
    if (p0.injury && !clearHealed(p0, date).injury) healedPlayerIds.push(p0.id);
    const pl = ensureSeasonLog(clearHealed(p0, date));
    const rating = recording.playerRatings[p0.id] ?? 6;
    const log = { ...pl.seasonLog! };
    const yc = log.youthCup ?? { appearances: 0, goals: 0, assists: 0, ratingSum: 0 };
    log.youthCup = {
      appearances: yc.appearances + 1,
      goals: yc.goals + ps.goals,
      assists: yc.assists + ps.assists,
      ratingSum: +(yc.ratingSum + rating).toFixed(2),
    };
    const fit = applyMatchFitness(
      log,
      { age: pl.age, stamina: pl.stats.stamina ?? DEFAULT_STAMINA, recoveryMult },
      { endEnergy: recording.playerEnergy[p0.id], minutes: YOUTH_MATCH_MINUTES },
    );
    log.fitness = fit.fitness;
    log.load = fit.load;

    let out: RosterPlayer = { ...pl, seasonLog: log };
    const inj = injuryBy.get(p0.id);
    if (inj) {
      const rd = injuryReturnDate(date, inj.severity, rng, staffFx.injuryDurationMult * ground.injuryDurationMult);
      injuriesApplied.push({ ...inj, squadId: squad.id, returnDate: rd });
      out = { ...out, seasonLog: withInjuryCounted(log, date, pl.injury, rd), injury: mergeInjury(pl.injury, { severity: inj.severity, returnDate: rd }) };
    }
    if (trackMorale && isSquadPlayer) {
      const ml = out.moraleLog ?? { minutes: [], trend: [] };
      out = {
        ...out,
        moraleLog: { ...ml, youthMinutes: [...(ml.youthMinutes ?? []), YOUTH_MATCH_MINUTES].slice(-YOUTH_COMP.MORALE_WINDOW) },
      };
    }
    // Growth only: decayMult 0 (the age decline is charged by the club's own matches, not again here).
    return applyDevelopment(out, rating, dpWeightsFor(out), youthDpMult(squad, out), 0, areas).updatedPlayer;
  };

  const next: Squad = {
    ...squad,
    players: squad.players.map((p) => apply(p, true)),
    ...(squad.youth ? { youth: squad.youth.map((p) => apply(p, false)) } : {}),
  };
  return { squad: next, participants, injuriesApplied, healedPlayerIds };
}

export interface YouthPlayerInfo {
  name: string;
  squadId: string;
  generated?: true;
}

/** Adds one game to the competition's leaders (real and generated players). */
export function updateLeaders(
  leaders: Record<string, YouthLeader>,
  recording: PlayedMatchRecording,
  info: (playerId: string) => YouthPlayerInfo,
): Record<string, YouthLeader> {
  const out = { ...leaders };
  for (const [id, ps] of Object.entries(recording.playerStats)) {
    const i = info(id);
    const prev = out[id] ?? { name: i.name, squadId: i.squadId, apps: 0, goals: 0, assists: 0, ratingSum: 0, ...(i.generated ? { generated: true as const } : {}) };
    out[id] = {
      ...prev,
      squadId: i.squadId,
      apps: prev.apps + 1,
      goals: prev.goals + ps.goals,
      assists: prev.assists + ps.assists,
      ratingSum: +(prev.ratingSum + (recording.playerRatings[id] ?? 6)).toFixed(2),
    };
  }
  return out;
}

/** The day-log entry of one youth game: scorers, best rating and the real players of each side. */
export function youthMatchLog(
  fixture: Fixture,
  recording: PlayedMatchRecording,
  info: (playerId: string) => YouthPlayerInfo,
  players: { home: string[]; away: string[] },
  generatedIds: ReadonlySet<string>,
): YouthMatchLog {
  const scorers = Object.entries(recording.playerStats)
    .filter(([, ps]) => ps.goals > 0)
    .map(([id, ps]) => {
      const i = info(id);
      return { playerId: id, name: i.name, squadId: i.squadId, goals: ps.goals, ...(i.generated ? { generated: true as const } : {}) };
    })
    .sort((a, b) => b.goals - a.goals || (a.playerId < b.playerId ? -1 : 1));
  let best: YouthMatchLog["best"] = null;
  for (const [id, rating] of Object.entries(recording.playerRatings)) {
    if (!best || rating > best.rating) {
      const i = info(id);
      best = { playerId: id, name: i.name, squadId: i.squadId, rating, ...(i.generated ? { generated: true as const } : {}) };
    }
  }
  return {
    competition: fixture.competition,
    fixtureId: fixture.id,
    home: fixture.home,
    away: fixture.away,
    score: { ...recording.score },
    scorers,
    best,
    players: {
      home: players.home.filter((id) => !generatedIds.has(id)),
      away: players.away.filter((id) => !generatedIds.has(id)),
    },
    ...(fixture.postponedFrom ? { postponedFrom: fixture.postponedFrom } : {}),
  };
}

/**
 * New date of a youth game whose club plays for the first team today: the next day (up to
 * `MAX_POSTPONE_DAYS`, never after `end`) when neither club has a first-team game nor another game of
 * the same competition. `null` = cancel.
 */
export function postponeDate(args: {
  date: string;
  end: string;
  busy: (club: string, date: string) => boolean;
  home: string;
  away: string;
  sameCompDates: ReadonlyMap<string, ReadonlySet<string>>;
}): string | null {
  const { date, end, busy, home, away, sameCompDates } = args;
  for (let k = 1; k <= YOUTH_COMP.MAX_POSTPONE_DAYS; k++) {
    const d = addDays(date, k);
    if (d > end) return null;
    if (busy(home, d) || busy(away, d)) continue;
    if (sameCompDates.get(home)?.has(d) || sameCompDates.get(away)?.has(d)) continue;
    return d;
  }
  return null;
}
