import type { MatchEvent } from "@/types/dayLogTypes";

/** What the achievements need from one official match of the human club. */
export interface MatchFacts {
  result: "W" | "D" | "L";
  gf: number;
  ga: number;
  home: boolean;
  league: boolean;
  /** Won the shootout (the result is then "W"). */
  shootoutWin: boolean;
  /** Most goals the club was behind at any moment (0 = never behind). */
  maxDeficit: number;
  ownReds: number;
  /** The goal that won it came after the 90th minute. */
  lastGasp: boolean;
  keeperGoal: boolean;
  derby: boolean;
  /** The club's starters (roster ids): on the pitch without coming off the bench. */
  starters: string[];
}

/**
 * Facts of `ev` from `side`'s point of view. Pens decide W/L (the board's rule). The goal list
 * (`MatchEvent.goals`, full engine) gives the deficit and the late winner; without it both are 0/false.
 */
export function matchFacts(
  ev: MatchEvent,
  side: "home" | "away",
  opts: { league: boolean; derby: boolean; isKeeper: (playerId: string) => boolean },
): MatchFacts {
  const other = side === "home" ? "away" : "home";
  const gf = ev.score[side];
  const ga = ev.score[other];
  const pens = ev.decider?.penalties;
  let result: MatchFacts["result"] = gf > ga ? "W" : gf < ga ? "L" : "D";
  let shootoutWin = false;
  if (result === "D" && pens) {
    result = pens[side] > pens[other] ? "W" : "L";
    shootoutWin = result === "W";
  }
  const goals = [...(ev.goals ?? [])].sort((a, b) => a.minute - b.minute);
  let us = 0;
  let them = 0;
  let maxDeficit = 0;
  let winnerMinute: number | null = null;
  for (const g of goals) {
    if (g.team === side) {
      us++;
      // The winner: our goal that took us one past their final tally.
      if (result === "W" && !shootoutWin && us === ga + 1) winnerMinute = g.minute;
    } else them++;
    maxDeficit = Math.max(maxDeficit, them - us);
  }
  const ownReds = (ev.cards ?? []).filter((c) => c.team === side && c.card === "red").length;
  const keeperGoal = (ev.goals ?? []).some((g) => g.team === side && opts.isKeeper(g.playerId))
    || ev.scorers.some((s) => s.team === side && s.goals > 0 && opts.isKeeper(s.playerId));
  const cameOn = new Set(ev.substitutions.filter((s) => s.team === side).map((s) => s.playerInId));
  // Who played: rated (or with stats); the live recording maps the whole roster in `playerTeams`.
  const played = new Set([...Object.keys(ev.playerRatings ?? {}), ...Object.keys(ev.playerStats ?? {})]);
  const starters = [...played].filter((id) => ev.playerTeams[id] === side && !cameOn.has(id));
  return {
    result, gf, ga, home: side === "home", league: opts.league, shootoutWin, maxDeficit, ownReds,
    lastGasp: winnerMinute !== null && winnerMinute > 90,
    keeperGoal, derby: opts.derby, starters,
  };
}
