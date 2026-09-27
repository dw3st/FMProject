import type { CupStageName, ContinentalSlug } from "@/types/calendarTypes";

/**
 * Prize money tables (`.claude/rules/AI-clubs/finance.md`,
 * `docs/superpowers/specs/2026-09-27-prizes-and-finances-design.md` §3). Pure config only —
 * nothing here reads or writes the save.
 */

/** League merit (paid at rollover, position 1..n): merit share + champion bonus, both of TV. */
export const LEAGUE_PRIZE = { MERIT_SHARE: 0.2, CHAMPION_SHARE: 0.05 } as const;

/** Cup: fraction of the country's tier-1 mean broadcasting paid for WINNING a stage. */
export const CUP_STAGE_SHARE: Record<CupStageName, number> = {
  preliminary: 0.003,
  r128: 0.003,
  r64: 0.003,
  r32: 0.005,
  r16: 0.008,
  qf: 0.011,
  sf: 0.015,
  final: 0.04, // winning the final (champion)
};
export const CUP_RUNNER_UP_SHARE = 0.02;

export const CONTINENTAL_PRIZE: Record<
  ContinentalSlug,
  {
    participation: number;
    groupWin: number;
    groupDraw: number;
    r16: number;
    qf: number;
    sf: number;
    final: number;
    title: number;
  }
> = {
  ucl: { participation: 15e6, groupWin: 2.8e6, groupDraw: 0.9e6, r16: 9e6, qf: 10e6, sf: 12e6, final: 15e6, title: 4e6 },
  uel: { participation: 4e6, groupWin: 0.6e6, groupDraw: 0.2e6, r16: 1.2e6, qf: 1.8e6, sf: 2.8e6, final: 4.5e6, title: 4e6 },
  lib: { participation: 3e6, groupWin: 0.3e6, groupDraw: 0.1e6, r16: 1.2e6, qf: 1.7e6, sf: 2.3e6, final: 5e6, title: 17e6 },
  sud: { participation: 1e6, groupWin: 0.1e6, groupDraw: 0.05e6, r16: 0.5e6, qf: 0.6e6, sf: 0.8e6, final: 1.5e6, title: 5e6 },
};

/** Share of any prize (league/cup/continental) an AI club puts into its seasonal transfer budget. */
export const AI_PRIZE_SHARE = 0.5;
