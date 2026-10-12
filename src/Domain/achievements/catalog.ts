import type { AchievementCategory, ManagerAttribute, SecretId, TrackId } from "@/types/achievementTypes";

/**
 * The achievement catalog (`docs/superpowers/specs/2026-10-11-achievements-design.md` §2). `rank` tracks
 * unlock when the value is at or below the threshold (best ranking); `goldRule` tracks unlock the gold by
 * a special rule (the value only drives bronze and silver).
 */
export interface TrackDef {
  category: AchievementCategory;
  attribute: ManagerAttribute;
  thresholds: [number, number, number];
  kind?: "rank";
  goldRule?: "world_manager" | "invincible";
}

export const TRACKS: Record<TrackId, TrackDef> = {
  league_titles:      { category: "titles", attribute: "tactics", thresholds: [1, 3, 6] },
  cup_titles:         { category: "titles", attribute: "tactics", thresholds: [1, 3, 5] },
  continental_titles: { category: "titles", attribute: "tactics", thresholds: [1, 2, 3] },
  promotions:         { category: "titles", attribute: "tactics", thresholds: [1, 2, 4] },
  wins:               { category: "wins", attribute: "motivation", thresholds: [50, 200, 500] },
  win_streak:         { category: "wins", attribute: "motivation", thresholds: [5, 8, 12] },
  unbeaten_run:       { category: "wins", attribute: "motivation", thresholds: [10, 20, 30] },
  thrashings:         { category: "wins", attribute: "motivation", thresholds: [5, 20, 50] },
  comebacks:          { category: "matches", attribute: "motivation", thresholds: [1, 5, 15] },
  ten_men_wins:       { category: "matches", attribute: "motivation", thresholds: [1, 3, 8] },
  shootout_wins:      { category: "matches", attribute: "motivation", thresholds: [1, 3, 6] },
  derby_wins:         { category: "matches", attribute: "motivation", thresholds: [1, 5, 15] },
  national_wins:      { category: "matches", attribute: "motivation", thresholds: [5, 20, 50] },
  youth_promoted:     { category: "youth", attribute: "youth", thresholds: [3, 10, 25] },
  young_award:        { category: "youth", attribute: "youth", thresholds: [1, 2, 4] },
  sales_profit:       { category: "market", attribute: "negotiation", thresholds: [5_000_000, 30_000_000, 100_000_000] },
  big_signing:        { category: "market", attribute: "negotiation", thresholds: [5_000_000, 25_000_000, 60_000_000] },
  free_starter:       { category: "market", attribute: "negotiation", thresholds: [1, 3, 6] },
  balance:            { category: "finances", attribute: "negotiation", thresholds: [10_000_000, 50_000_000, 150_000_000] },
  stadium:            { category: "finances", attribute: "negotiation", thresholds: [2_000, 8_000, 20_000] },
  facilities:         { category: "finances", attribute: "negotiation", thresholds: [2, 8, 20] },
  seasons:            { category: "career", attribute: "discipline", thresholds: [3, 10, 20] },
  clubs:              { category: "career", attribute: "discipline", thresholds: [2, 4, 6] },
  ranking:            { category: "career", attribute: "discipline", thresholds: [100, 20, 1], kind: "rank" },
  manager_awards:     { category: "career", attribute: "discipline", thresholds: [1, 3, 1], goldRule: "world_manager" },
  top_scorer:         { category: "squad", attribute: "tactics", thresholds: [1, 3, 5] },
  league_unbeaten:    { category: "squad", attribute: "tactics", thresholds: [10, 19, 1], goldRule: "invincible" },
};

export const SECRETS: Record<SecretId, { attribute: ManagerAttribute }> = {
  fortress:          { attribute: "tactics" },
  cheapest_champion: { attribute: "negotiation" },
  keeper_goal:       { attribute: "motivation" },
  sacked_early:      { attribute: "discipline" },
  double:            { attribute: "tactics" },
  treble:            { attribute: "tactics" },
  great_escape:      { attribute: "motivation" },
  nine_men:          { attribute: "motivation" },
  seven_up:          { attribute: "motivation" },
  bounce_back:       { attribute: "tactics" },
  last_gasp:         { attribute: "motivation" },
  humbled:           { attribute: "discipline" },
  perfect_month:     { attribute: "motivation" },
  one_club:          { attribute: "discipline" },
  wall:              { attribute: "tactics" },
  world_champion:    { attribute: "tactics" },
  against_homeland:  { attribute: "motivation" },
};

export const TIERS = ["bronze", "silver", "gold"] as const;
