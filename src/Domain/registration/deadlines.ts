import type { RegistrationCompKind, RegistrationStatus } from "@/types/registrationTypes";
import type { WindowStatus } from "@/Domain/market/windows";
import { addDays } from "@/Domain/dates";

/** Stage dates of a continental competition (`meta.continental.stages`). */
export interface ContinentalGate {
  /** First group match date. */
  groupStart: string;
  /** Last group round date. */
  groupEnd: string;
  /** Round-of-16 first-leg date. */
  knockoutStart: string;
}

/**
 * Registration deadline (`.claude/rules/game/registration.md` → Prazo). League and cup: the transfer window of the
 * club's country. Continental: the window, and the next stage not started yet (before the first group match, or
 * between the end of the groups and the round-of-16 first leg); closed for good once the knockouts start.
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
