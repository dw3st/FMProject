import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { trainingGroundEffectsOf } from "@/Domain/facilities/facilities";
import { applyMatchFitness, decayLoad, recoverDay } from "@/Domain/fitness/fitness";
import { clearHealed, mergeInjury, returnDate as injuryReturnDate, withInjuryCounted } from "@/Domain/injury/injury";
import { personalDpMult } from "@/Domain/personality/personality";
import { staffEffectsOf } from "@/Domain/staff/staff";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { applyDevelopment } from "@/GameEngine/PlayerDevelopment";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { Rng } from "@/Domain/advanceDay/quickSim";
import type { NationalCareer } from "@/types/nationalTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/** Post-match and camp days of the real players of a national team (`national-teams.md` → "Efeitos"), pure. */

const DEFAULT_STAMINA = 7;

export interface NationalMatchApplied {
  player: RosterPlayer;
  injury?: { severity: "light" | "medium" | "severe"; returnDate: string };
  healed: boolean;
  played: boolean;
}

/** Empty career for a nation. */
export function emptyCareer(nation: string): NationalCareer {
  return { nation, caps: 0, goals: 0, assists: 0, titles: [] };
}

/**
 * One national game for a real player of `club` (his club's staff and physio set the injury length): the
 * national season log (outside the totals), fitness and load of a 90/120-minute match, an injury from the match,
 * the national career, and the match DP (growth only, no club staff). A player absent from the recording gets a
 * camp day instead (`nationalCampDay`).
 */
export function applyNationalMatch(
  p0: RosterPlayer,
  club: Squad | null,
  recording: PlayedMatchRecording,
  opts: { date: string; rng: Rng; nation: string; minutes: number },
): NationalMatchApplied {
  const ps = recording.playerStats[p0.id];
  if (!ps) return { player: nationalCampDay(p0, club, opts.date), healed: false, played: false };
  const healed = !!p0.injury && !clearHealed(p0, opts.date).injury;
  const pl = ensureSeasonLog(clearHealed(p0, opts.date));
  const rating = recording.playerRatings[p0.id] ?? 6;
  const log = { ...pl.seasonLog! };
  const nl = log.national ?? { appearances: 0, goals: 0, assists: 0, ratingSum: 0 };
  log.national = {
    appearances: nl.appearances + 1,
    goals: nl.goals + ps.goals,
    assists: nl.assists + ps.assists,
    ratingSum: +(nl.ratingSum + rating).toFixed(2),
  };
  const staff = club ? staffEffectsOf(club) : null;
  const ground = club ? trainingGroundEffectsOf(club) : null;
  const fit = applyMatchFitness(
    log,
    { age: pl.age, stamina: pl.stats.stamina ?? DEFAULT_STAMINA, recoveryMult: (staff?.recoveryMult ?? 1) * (ground?.recoveryMult ?? 1) },
    { endEnergy: recording.playerEnergy[p0.id], minutes: opts.minutes },
  );
  log.fitness = fit.fitness;
  log.load = fit.load;
  const prev = pl.national?.nation === opts.nation ? pl.national : emptyCareer(opts.nation);
  let out: RosterPlayer = {
    ...pl, seasonLog: log,
    national: { ...prev, caps: prev.caps + 1, goals: prev.goals + ps.goals, assists: prev.assists + ps.assists },
  };
  let injury: NationalMatchApplied["injury"];
  const inj = (recording.injuries ?? []).find((i) => i.playerId === p0.id);
  if (inj) {
    const rd = injuryReturnDate(opts.date, inj.severity, opts.rng, (staff?.injuryDurationMult ?? 1) * (ground?.injuryDurationMult ?? 1));
    injury = { severity: inj.severity, returnDate: rd };
    out = { ...out, seasonLog: withInjuryCounted(log, opts.date, pl.injury, rd), injury: mergeInjury(pl.injury, injury) };
  }
  // Growth only: the age decline is charged by the club's own matches.
  out = applyDevelopment(out, rating, dpWeightsFor(out), personalDpMult(out), 0, {}).updatedPlayer;
  return { player: out, injury, healed, played: true };
}

/** A day in the national camp without a game: rest-day recovery and load decay (no club training). */
export function nationalCampDay(p0: RosterPlayer, club: Squad | null, date: string): RosterPlayer {
  const pl = ensureSeasonLog(clearHealed(p0, date));
  const log = pl.seasonLog!;
  const recoveryMult = club ? staffEffectsOf(club).recoveryMult * trainingGroundEffectsOf(club).recoveryMult : 1;
  const load = log.load ?? 0;
  return {
    ...pl,
    seasonLog: {
      ...log,
      fitness: +recoverDay(log.fitness, { age: pl.age, load, stamina: pl.stats.stamina ?? DEFAULT_STAMINA, recoveryMult }).toFixed(1),
      load: +decayLoad(load).toFixed(2),
    },
  };
}

/** Adds a won title / tournament award to the career (once). */
export function withNationalTitle(p: RosterPlayer, nation: string, title: string): RosterPlayer {
  const c = p.national?.nation === nation ? p.national : emptyCareer(nation);
  if (c.titles.includes(title)) return p;
  return { ...p, national: { ...c, titles: [...c.titles, title] } };
}

export function withNationalAward(p: RosterPlayer, nation: string, award: string): RosterPlayer {
  const c = p.national?.nation === nation ? p.national : emptyCareer(nation);
  if (c.awards?.includes(award)) return p;
  return { ...p, national: { ...c, awards: [...(c.awards ?? []), award] } };
}

/** Adds one game to a competition's leaders (real and generated players). */
export function updateNationalLeaders(
  leaders: Record<string, import("@/types/nationalTypes").NationalLeader>,
  recording: PlayedMatchRecording,
  info: (playerId: string) => { name: string; nation: string; squadId: string; line: "GK" | "DEF" | "MID" | "FWD"; generated?: boolean },
): Record<string, import("@/types/nationalTypes").NationalLeader> {
  const out = { ...leaders };
  for (const [id, ps] of Object.entries(recording.playerStats)) {
    const i = info(id);
    const prev = out[id] ?? {
      name: i.name, nation: i.nation, squadId: i.squadId, line: i.line, apps: 0, goals: 0, assists: 0, ratingSum: 0,
      ...(i.generated ? { generated: true as const } : {}),
    };
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
