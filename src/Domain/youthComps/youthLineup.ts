import { isUnavailable } from "@/Domain/discipline/discipline";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { clamp } from "@/Domain/math";
import { MAIN_ROLE_TO_SPECIFICS } from "@/Domain/playerRating";
import { preferredRole, slotValue } from "@/Domain/positions/positionAptitude";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { academyGauss, academyUnit, lineAverage, makeAcademyPlayer } from "@/Domain/youth/youth";
import { YOUTH } from "@/Domain/youth/youthConfig";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";
import type { YouthCompAge } from "@/types/youthCompTypes";

/** Pure youth-competition lineup (`.claude/rules/game/youth-competitions.md` → "Escalação"). */

const LINE_KEY: Record<MainRole, keyof typeof YOUTH_COMP.LINES> = {
  GK: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD",
};
const LINES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];

export interface YouthFillerKey {
  saveId: string;
  slug: string;
  year: number;
}

export interface YouthLineupInput {
  age: YouthCompAge;
  /** `players` + `youth` (the academy only exists at the human club). */
  squad: Squad;
  /** First-team starters: never in the youth XI unless called up. */
  firstTeamXI: ReadonlySet<string>;
  /** Human club call-ups (empty for the AI). */
  callUps: readonly string[];
  /** Real players who already played a youth game today. */
  playedToday: ReadonlySet<string>;
  date: string;
  filler: YouthFillerKey;
  nationality: string | null;
}

export interface YouthLineup {
  /** 11 ids in the slot order of the 4-3-3. */
  lineup: string[];
  /** The 11 players of the match (real and generated). */
  matchPlayers: RosterPlayer[];
  generatedIds: Set<string>;
  /** Call-ups who did not play (unavailable, over age, played today or line full). */
  skippedCallUps: string[];
}

const lineOf = (p: RosterPlayer): MainRole => getMainRole(preferredRole(p));
const fitnessOf = (p: RosterPlayer): number => p.seasonLog?.fitness ?? emptySeasonLog().fitness;
const appsOf = (p: RosterPlayer): number => p.seasonLog?.appearances ?? 0;

/** Over-age reserve "without minutes": at most `NO_MINUTES_SHARE` of the most used player's games (all, at 0). */
export function noMinutes(p: RosterPlayer, maxApps: number): boolean {
  if (maxApps <= 0) return true;
  return appsOf(p) <= YOUTH_COMP.NO_MINUTES_SHARE * maxApps;
}

/**
 * The first `n` generated youngsters of one line: a stable "class" per club, competition and season
 * (seed `${saveId}:${squadId}:${slug}:${year}:${line}:${i}`), never written to the squad.
 */
export function youthFillers(
  key: YouthFillerKey,
  squad: Squad,
  age: YouthCompAge,
  line: MainRole,
  n: number,
  nationality: string | null,
): RosterPlayer[] {
  const lk = LINE_KEY[line];
  const tier = YOUTH.TIER_BONUS[financialTierOf(squad)];
  const avg = lineAverage(squad, line);
  const specifics = MAIN_ROLE_TO_SPECIFICS[line];
  const out: RosterPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const seed = `${key.saveId}:${squad.id}:${key.slug}:${key.year}:${lk}`;
    const level = clamp(
      avg - YOUTH.LEVEL_OFFSET + tier + YOUTH.LEVEL_SIGMA * academyGauss(`${seed}:lvl:${i}`),
      YOUTH.LEVEL_MIN, YOUTH.LEVEL_MAX,
    );
    const specific = specifics[Math.floor(academyUnit(`${seed}:pos:${i}`) * specifics.length)]!;
    out.push(makeAcademyPlayer({
      id: `ygen_${squad.id}_${key.slug}_${key.year}_${lk}_${i}`,
      seed, i, squad, specific, level,
      ageRange: YOUTH_COMP.FILLER_AGE[age],
      nationality,
    }));
  }
  return out;
}

/** Group order: fewer appearances, then higher rating in the natural position, then id. */
function sortGroup(ps: RosterPlayer[]): RosterPlayer[] {
  return [...ps].sort(
    (a, b) => appsOf(a) - appsOf(b) || slotValue(b, preferredRole(b)) - slotValue(a, preferredRole(a)) || (a.id < b.id ? -1 : 1),
  );
}

/**
 * The youth XI of one club (spec §4): call-ups first, then the age groups by priority, each player
 * taking one slot of his own line (GK 1, DEF 4, MID 3, FWD 3); missing slots get generated youngsters.
 */
export function pickYouthLineup(input: YouthLineupInput): YouthLineup {
  const { age, squad, firstTeamXI, callUps, playedToday, date } = input;
  const maxAge = YOUTH_COMP.MAX_AGE[age];
  const players = squad.players;
  const youth = squad.youth ?? [];
  const byId = new Map([...players, ...youth].map((p) => [p.id, p]));

  const alwaysOut = (p: RosterPlayer) => isUnavailable(p, date) || playedToday.has(p.id);
  const fit = (p: RosterPlayer) => fitnessOf(p) >= YOUTH_COMP.MIN_FITNESS;
  const free = (p: RosterPlayer) => !alwaysOut(p) && fit(p) && !firstTeamXI.has(p.id);

  const callUpSet = new Set(callUps);
  const called = sortGroup(
    callUps
      .map((id) => byId.get(id))
      .filter((p): p is RosterPlayer => !!p && !alwaysOut(p) && (age === "u21" || p.age <= 19)),
  );
  const notCalled = (p: RosterPlayer) => !callUpSet.has(p.id);
  const maxApps = Math.max(0, ...players.map(appsOf));

  const groups: { list: RosterPlayer[]; overage?: true }[] = [{ list: called }];
  if (age === "u19") {
    groups.push({ list: sortGroup(youth.filter((p) => notCalled(p) && p.age <= maxAge && free(p))) });
    groups.push({ list: sortGroup(players.filter((p) => notCalled(p) && p.age <= maxAge && free(p))) });
  } else {
    groups.push({ list: sortGroup(players.filter((p) => notCalled(p) && p.age <= maxAge && free(p))) });
    groups.push({ list: sortGroup(youth.filter((p) => notCalled(p) && p.age >= 20 && p.age <= maxAge && free(p))) });
    groups.push({ list: sortGroup(youth.filter((p) => notCalled(p) && p.age <= 19 && free(p))) });
    groups.push({
      list: sortGroup(players.filter((p) => notCalled(p) && p.age > maxAge && free(p) && noMinutes(p, maxApps))),
      overage: true,
    });
  }

  const need: Record<MainRole, number> = {
    GK: YOUTH_COMP.LINES.GK, Defender: YOUTH_COMP.LINES.DEF, Midfielder: YOUTH_COMP.LINES.MID, Forward: YOUTH_COMP.LINES.FWD,
  };
  const chosen: RosterPlayer[] = [];
  const taken = new Set<string>();
  let overage = 0;
  for (const g of groups) {
    for (const p of g.list) {
      if (taken.has(p.id)) continue;
      const line = lineOf(p);
      if (need[line] <= 0) continue;
      if (g.overage && overage >= YOUTH_COMP.OVERAGE_MAX) break;
      need[line]--;
      taken.add(p.id);
      chosen.push(p);
      if (g.overage) overage++;
    }
  }

  const generatedIds = new Set<string>();
  for (const line of LINES) {
    if (need[line] <= 0) continue;
    for (const f of youthFillers(input.filler, squad, age, line, need[line], input.nationality)) {
      generatedIds.add(f.id);
      chosen.push(f);
    }
    need[line] = 0;
  }

  const lineup = autoLineupForFormation({ ...squad, players: chosen }, formationForSimId("4-3-3"));
  return {
    lineup,
    matchPlayers: chosen,
    generatedIds,
    skippedCallUps: callUps.filter((id) => !taken.has(id)),
  };
}
