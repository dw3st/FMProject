import type { RegistrationCompKind, RegistrationStatus } from "@/types/registrationTypes";
import type { WindowStatus } from "@/Domain/market/windows";
import { addDays } from "@/Domain/dates";

/**
 * Stage dates of a continental competition (`meta.continental.stages`). In the league format (Champions League /
 * Europa League since 12.13) "group" is the league phase and the knockouts start with the play-off.
 */
export interface ContinentalGate {
  /** First group (or league-phase) match date. */
  groupStart: string;
  /** Last group (or league-phase) round date. */
  groupEnd: string;
  /** First leg of the first knockout stage: the round of 16, or the play-off in the league format. */
  knockoutStart: string;
}

/**
 * Registration deadline (`.claude/rules/game/registration.md` → Prazo). League and cup: the transfer window of the
 * club's country. Continental: the window, and the next stage not started yet (before the first group / league-phase
 * match, or between the end of the groups and the round-of-16 first leg — the league phase and the play-off in the
 * league format); closed for good once the knockouts start.
 */
export function registrationStatus(args: {
  kind: RegistrationCompKind;
  window: WindowStatus;
  date: string;
  continental?: ContinentalGate;
}): RegistrationStatus {
  const { window, date, continental: g } = args;
  if (args.kind !== "continental" || !g) {
    return window.open ? { open: true, until: window.until } : { open: false, opensOn: window.opensOn };
  }
  if (date >= g.knockoutStart) return { open: false, stageStarted: true };
  const before = date < g.groupStart ? g.groupStart : date > g.groupEnd ? g.knockoutStart : null;
  if (!before) {
    // Groups under way: reopens after the last group round, with the window, before the knockouts.
    const after = addDays(g.groupEnd, 1);
    const reopen = window.open ? after : window.opensOn && window.opensOn > g.groupEnd ? window.opensOn : undefined;
    return { open: false, stageStarted: true, opensOn: reopen && reopen < g.knockoutStart ? reopen : undefined };
  }
  const lastDay = addDays(before, -1);
  if (!window.open) {
    return { open: false, opensOn: window.opensOn && window.opensOn < before ? window.opensOn : undefined };
  }
  const until = window.until && window.until < lastDay ? window.until : lastDay;
  return { open: true, until };
}
