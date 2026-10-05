import type { Fixture } from "@/types/calendarTypes";
import type { PlayerHistoryRow, StandingRow } from "@/types/playerTypes";
import type {
  ClubHistory, ClubMatchRecord, ClubRecordBroken, ClubRecords, ClubScorer, ClubSeasonRow, ClubTransferRecord,
} from "@/types/clubHistoryTypes";

/** Pure club-history aggregation (`.claude/rules/game/club-history.md`). No I/O. */

export function emptyClubHistory(squadId: string): ClubHistory {
  return { squadId, seasons: [], scorers: {}, records: {} };
}

/** A played match from the club's point of view. */
export interface ClubMatch {
  date: string;
  competition: string;
  opponentId: string;
  opponentName: string;
  gf: number;
  ga: number;
}

/**
 * The club's played matches among `fixtures` (any competition), oldest first. Only the 90'+extra
 * time score counts (a shootout is not a win). Dates outside `[from, to]` are skipped when given.
 */
export function clubMatchesOf(
  fixtures: Fixture[], squadId: string, nameOf: (id: string) => string,
  window?: { from: string; to: string },
): ClubMatch[] {
  const out: ClubMatch[] = [];
  for (const f of fixtures) {
    if (!f.played || !f.result) continue;
    if (f.home !== squadId && f.away !== squadId) continue;
    if (window && (f.date < window.from || f.date > window.to)) continue;
    const home = f.home === squadId;
    // `result` is the final score (extra time included); a shootout is not counted.
    const h = f.result.home;
    const a = f.result.away;
    out.push({
      date: f.date, competition: f.competition,
      opponentId: home ? f.away : f.home, opponentName: nameOf(home ? f.away : f.home),
      gf: home ? h : a, ga: home ? a : h,
    });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** One player's season row at the club (the row written at the rollover). */
export interface ClubPlayerRow {
  playerId: string;
  name: string;
  row: Pick<PlayerHistoryRow, "goals" | "apps" | "assists">;
}

export interface ClubSeasonInput {
  season: string;
  league: string;
  tier: number;
  /** The club's line in the final table (null: no table). */
  standing: StandingRow | null;
  position: number | null;
  /** League/cup/continental titles of the season (and `promotion:<league>`). */
  titles: string[];
  move?: "promoted" | "relegated";
  manager?: string;
  /** Season rows of the players at the club at the rollover (partial rows of departures came earlier). */
  players: ClubPlayerRow[];
  /** Every played match of the club this season (league, cup, continental). */
  matches: ClubMatch[];
}

function addScorer(scorers: Record<string, ClubScorer>, id: string, name: string, r: ClubPlayerRow["row"]) {
  const cur = scorers[id];
  scorers[id] = {
    name,
    goals: (cur?.goals ?? 0) + r.goals,
    apps: (cur?.apps ?? 0) + r.apps,
    assists: (cur?.assists ?? 0) + r.assists,
  };
}

const margin = (m: { gf: number; ga: number }) => m.gf - m.ga;

/** Is `a` a bigger win than `b` (margin, then goals scored)? */
function biggerWin(a: { gf: number; ga: number }, b: { gf: number; ga: number }): boolean {
  return margin(a) > margin(b) || (margin(a) === margin(b) && a.gf > b.gf);
}

/** Is `a` a heavier loss than `b` (margin, then goals conceded)? */
function biggerLoss(a: { gf: number; ga: number }, b: { gf: number; ga: number }): boolean {
  return -margin(a) > -margin(b) || (margin(a) === margin(b) && a.ga > b.ga);
}

function matchRecord(m: ClubMatch, season: string): ClubMatchRecord {
  return {
    season, date: m.date, opponentId: m.opponentId, opponentName: m.opponentName,
    gf: m.gf, ga: m.ga, competition: m.competition,
  };
}

/** Longest unbeaten run among the league matches (oldest first), null without one. */
export function longestUnbeaten(matches: ClubMatch[]): { matches: number; from: string; to: string } | null {
  let best: { matches: number; from: string; to: string } | null = null;
  let run = 0;
  let from = "";
  for (const m of matches) {
    if (m.gf < m.ga) { run = 0; continue; }
    if (run === 0) from = m.date;
    run++;
    if (!best || run > best.matches) best = { matches: run, from, to: m.date };
  }
  return best;
}

/**
 * Adds a finished season to the club history: the season row (with its top scorer, counting the
 * mid-season departures of that season), the players' totals and the records. Idempotent: a season
 * already in the history (same label and league) is left as it is. `broken` lists the records that
 * beat an earlier value (the first value of a record is not "broken").
 */
export function applySeason(history: ClubHistory, input: ClubSeasonInput): { history: ClubHistory; broken: ClubRecordBroken[] } {
  if (history.seasons.some((s) => s.season === input.season && s.league === input.league)) {
    return { history, broken: [] };
  }
  const st = input.standing;

  // Season goals per player: rows at the rollover + departures of this season.
  const seasonTotals: Record<string, ClubScorer> = { ...(history.openPartials?.[input.season] ?? {}) };
  for (const p of input.players) addScorer(seasonTotals, p.playerId, p.name, p.row);
  let topScorer: ClubSeasonRow["topScorer"];
  for (const [playerId, s] of Object.entries(seasonTotals)) {
    if (s.goals <= 0) continue;
    if (!topScorer || s.goals > topScorer.goals) topScorer = { playerId, name: s.name, goals: s.goals };
  }

  const row: ClubSeasonRow = {
    season: input.season, league: input.league, tier: input.tier, position: input.position,
    played: st?.mp ?? 0, won: st?.w ?? 0, drawn: st?.d ?? 0, lost: st?.l ?? 0,
    gf: st?.gf ?? 0, ga: st?.ga ?? 0, points: st?.pts ?? 0,
    titles: [...input.titles],
    ...(input.move ? { move: input.move } : {}),
    ...(topScorer ? { topScorer } : {}),
    ...(input.manager ? { manager: input.manager } : {}),
  };

  const scorers = { ...history.scorers };
  for (const p of input.players) addScorer(scorers, p.playerId, p.name, p.row);
  let openPartials = history.openPartials;
  if (openPartials?.[input.season]) {
    const { [input.season]: _, ...rest } = openPartials;
    openPartials = Object.keys(rest).length > 0 ? rest : undefined;
  }

  const records: ClubRecords = { ...history.records };
  const broken: ClubRecordBroken[] = [];

  if (input.position !== null && (st?.mp ?? 0) > 0) {
    const cur = records.highestFinish;
    if (!cur || input.tier < cur.tier || (input.tier === cur.tier && input.position < cur.position)) {
      records.highestFinish = { season: input.season, league: input.league, tier: input.tier, position: input.position };
      if (cur) broken.push({ kind: "highestFinish", value: records.highestFinish });
    }
  }

  if (topScorer) {
    const cur = records.mostGoalsSeason;
    if (!cur || topScorer.goals > cur.goals) {
      records.mostGoalsSeason = { ...topScorer, season: input.season };
      if (cur) broken.push({ kind: "mostGoalsSeason", value: records.mostGoalsSeason });
    }
  }

  let win: ClubMatch | null = null;
  let loss: ClubMatch | null = null;
  for (const m of input.matches) {
    if (m.gf > m.ga && (!win || biggerWin(m, win))) win = m;
    if (m.gf < m.ga && (!loss || biggerLoss(m, loss))) loss = m;
  }
  if (win) {
    const cur = records.biggestWin;
    if (!cur || biggerWin(win, cur)) {
      records.biggestWin = matchRecord(win, input.season);
      if (cur) broken.push({ kind: "biggestWin", value: records.biggestWin });
    }
  }
  if (loss) {
    const cur = records.biggestLoss;
    if (!cur || biggerLoss(loss, cur)) {
      records.biggestLoss = matchRecord(loss, input.season);
      if (cur) broken.push({ kind: "biggestLoss", value: records.biggestLoss });
    }
  }

  const run = longestUnbeaten(input.matches.filter((m) => m.competition === input.league));
  if (run) {
    const cur = records.unbeaten;
    if (!cur || run.matches > cur.matches) {
      records.unbeaten = { ...run, season: input.season };
      if (cur) broken.push({ kind: "unbeaten", value: records.unbeaten });
    }
  }

  const next: ClubHistory = {
    ...history,
    seasons: [...history.seasons, row],
    scorers,
    records,
  };
  if (openPartials) next.openPartials = openPartials;
  else delete next.openPartials;
  return { history: next, broken };
}

/**
 * A fee transfer of the club: a signing (the club bought) or a sale (the club sold). A sale also
 * counts the player's partial row at the club (his stats there this season) into the club totals
 * and into the season's open partials, so the season top scorer still sees him at the rollover.
 */
export function applyTransfer(
  history: ClubHistory,
  t: { side: "signing" | "sale"; record: ClubTransferRecord; partial?: ClubPlayerRow & { season: string } },
): { history: ClubHistory; broken: ClubRecordBroken[] } {
  const records: ClubRecords = { ...history.records };
  const broken: ClubRecordBroken[] = [];
  if (t.record.fee > 0) {
    const key = t.side === "signing" ? "recordSigning" : "recordSale";
    const cur = records[key];
    if (!cur || t.record.fee > cur.fee) {
      records[key] = t.record;
      if (cur) broken.push({ kind: key, value: t.record });
    }
  }
  let next: ClubHistory = { ...history, records };
  if (t.side === "sale" && t.partial && t.partial.row.apps > 0) {
    const scorers = { ...history.scorers };
    addScorer(scorers, t.partial.playerId, t.partial.name, t.partial.row);
    const seasonMap = { ...(history.openPartials?.[t.partial.season] ?? {}) };
    addScorer(seasonMap, t.partial.playerId, t.partial.name, t.partial.row);
    next = { ...next, scorers, openPartials: { ...(history.openPartials ?? {}), [t.partial.season]: seasonMap } };
  }
  return { history: next, broken };
}

/** Title gallery: every title of the history grouped by competition, with the seasons won. */
export function titleGallery(seasons: ClubSeasonRow[]): { title: string; seasons: string[] }[] {
  const order = (t: string) => (t.startsWith("continental:") ? 0 : t.startsWith("league:") ? 1 : t.startsWith("cup:") ? 2 : 3);
  const map = new Map<string, string[]>();
  for (const s of seasons) {
    for (const t of s.titles) {
      const list = map.get(t) ?? [];
      if (!list.includes(s.season)) list.push(s.season);
      map.set(t, list);
    }
  }
  return [...map.entries()]
    .map(([title, list]) => ({ title, seasons: list }))
    .sort((a, b) => order(a.title) - order(b.title) || b.seasons.length - a.seasons.length || a.title.localeCompare(b.title));
}

/** Top `n` players of the club by goals (then apps) or by apps (then goals). */
export function topPlayers(
  scorers: Record<string, ClubScorer>, by: "goals" | "apps", n = 10,
): ({ playerId: string } & ClubScorer)[] {
  const other = by === "goals" ? "apps" : "goals";
  return Object.entries(scorers)
    .map(([playerId, s]) => ({ playerId, ...s }))
    .filter((s) => s[by] > 0)
    .sort((a, b) => b[by] - a[by] || b[other] - a[other] || a.name.localeCompare(b.name))
    .slice(0, n);
}
