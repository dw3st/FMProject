import type { MatchFacts } from "@/Domain/achievements/matchFacts";
import { ACHIEVEMENTS } from "@/Domain/achievements/achievementsConfig";
import {
  addCampaign, applyCampaignRecord, applyNewTitles, applyRollover, ensureClub, newlyUnlocked, recordMatch, rollMonth, sackedEarly, trackValues,
  unlockReachedTiers, unlockSecret, type AchievementSnapshot, type ClubArrival, type RolloverFacts,
} from "@/Domain/achievements/progress";
import type { AchievementKey, AchievementsState } from "@/types/achievementTypes";
import type { DayTransfer } from "@/types/dayLogTypes";

export interface AchievementDayInput {
  date: string;
  /** The human club at the start of the day (null: unemployed). */
  squadId: string | null;
  /** What the club has today: kept as the baseline of the finance tracks on the first day it is seen. */
  arrival: ClubArrival;
  /** Today's official matches of the club, in order. */
  matches: MatchFacts[];
  /** Today's moves of the world (`StoredDayLog.transfers`). */
  transfers: DayTransfer[];
  snapshot: AchievementSnapshot;
  /** Season awards of the club's players not counted yet ("<league>:<season>:<kind>"). */
  awards: { key: string; kind: "young_player" | "top_scorer" }[];
  rollover?: RolloverFacts;
  /** Today's games of the national team he coaches (Etapa 41b): won, and against the team of his own nationality. */
  national?: { won: boolean; homeland: boolean }[];
  /** Continental stages the club played for the first time today (semi-final, final), keyed by competition and season. */
  continentalStages?: { key: string; stage: "sf" | "final" }[];
  /** Sacked today (or the contract ended with a sacking). */
  sacked?: { hiredOn?: string };
}

/**
 * One day of achievements: idempotent by `lastDay` (a retried day adds nothing). Returns the state and
 * the keys unlocked today.
 */
export function applyAchievementDay(
  state: AchievementsState, input: AchievementDayInput,
): { state: AchievementsState; unlocked: AchievementKey[] } {
  if (state.lastDay && state.lastDay >= input.date) return { state, unlocked: [] };
  const { date, squadId } = input;
  let s = rollMonth(state, date);
  if (squadId) s = ensureClub(s, squadId, input.arrival);

  // Moves first: a player signed today can start today.
  if (squadId) {
    const paid = { ...s.paid };
    const free = { ...s.freeSignings };
    const c = { ...s.counters };
    for (const t of input.transfers) {
      if (t.to === squadId && (t.kind === "transfer" || t.kind === "pre_contract")) {
        paid[t.playerId] = t.fee;
        c.biggestSigning = Math.max(c.biggestSigning, t.fee);
      } else if (t.to === squadId && t.kind === "free") {
        free[t.playerId] ??= 0;
      } else if (t.from === squadId && t.kind === "transfer" && t.fee > 0) {
        const profit = t.fee - (paid[t.playerId] ?? 0);
        if (profit > 0) c.salesProfit += profit;
        delete paid[t.playerId];
        delete free[t.playerId];
      }
    }
    s = { ...s, paid, freeSignings: free, counters: c };
  }

  for (const m of input.matches) {
    s = recordMatch(s, m, date);
    const free = { ...s.freeSignings };
    for (const id of m.starters) if (free[id] !== undefined) free[id]++;
    s = { ...s, freeSignings: free };
  }

  for (const g of input.national ?? []) {
    if (!g.won) continue;
    s = { ...s, counters: { ...s.counters, nationalWins: (s.counters.nationalWins ?? 0) + 1 } };
    if (g.homeland) s = unlockSecret(s, "against_homeland", date);
  }

  const seen = new Set(s.awardsSeen);
  const fresh = input.awards.filter((a) => !seen.has(a.key));
  if (fresh.length > 0) {
    s = {
      ...s,
      awardsSeen: [...s.awardsSeen, ...fresh.map((a) => a.key)],
      counters: {
        ...s.counters,
        youngAwards: s.counters.youngAwards + fresh.filter((a) => a.kind === "young_player").length,
        topScorers: s.counters.topScorers + fresh.filter((a) => a.kind === "top_scorer").length,
      },
    };
  }

  const rank = input.snapshot.rank;
  if (rank !== null && rank > 0 && (s.counters.bestRank === null || rank < s.counters.bestRank)) {
    s = { ...s, counters: { ...s.counters, bestRank: rank } };
  }

  s = applyNewTitles(s, input.snapshot.manager, date);
  // Campaign points (shop): titles and manager awards of his record, continental stages, the board's objective.
  s = applyCampaignRecord(s, input.snapshot.manager);
  for (const c of input.continentalStages ?? []) s = addCampaign(s, c.key, ACHIEVEMENTS.CAMPAIGN.CONTINENTAL_STAGE[c.stage]);
  if (input.rollover?.objectiveMet) s = addCampaign(s, `objective:${input.rollover.squadId}:${date}`, ACHIEVEMENTS.CAMPAIGN.OBJECTIVE);
  if (input.rollover) s = applyRollover(s, input.rollover, date);
  if (input.sacked && sackedEarly(input.sacked.hiredOn, date)) s = unlockSecret(s, "sacked_early", date);
  s = unlockReachedTiers(s, trackValues(s, input.snapshot), date, input.snapshot);
  s = { ...s, lastDay: date };
  return { state: s, unlocked: newlyUnlocked(state, s) };
}
