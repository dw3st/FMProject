/**
 * Pure data for the dashboard home cards (#56): next match, recent form, the league window around
 * the player's club, the attention list, season highlights and the week's money. No I/O, no React —
 * the screen fetches and renders, these functions only shape what it already has.
 */
import { moraleAttention } from "@/Domain/morale/morale";
import { daysBetween } from "@/Domain/dates";
import { WINDOWS } from "@/Domain/market/windowConfig";

/** "Window closes in N days" from this many days before the close. */
const WINDOW_ATTENTION_DAYS = WINDOWS.ATTENTION_DAYS;
/** Scouting news stays on the Attention card this many days. */
const SCOUTING_ATTENTION_DAYS = 7;
import type { ClubMoraleState, PlayerPromise, TalkReason } from "@/types/moraleTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { RosterPlayer, StandingRow } from "@/types/playerTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { ShortlistReason } from "@/types/scoutingTypes";
import { isoWeekStart, type LedgerEntry } from "@/Domain/finance/ledger";
import { isInjured } from "@/Domain/injury/injury";
import { isSuspended } from "@/Domain/discipline/discipline";
import { isExpired } from "@/Domain/contracts/contracts";
import { CONTRACT_CONFIG } from "@/Domain/contracts/contractConfig";
import { Player } from "@/Domain/Player";

/** Fitness under this is flagged on the dashboard (same threshold as the match preview warning). */
const LOW_FITNESS_THRESHOLD = 70;

export type FormResult = "W" | "D" | "L";

/** The club's next unplayed fixture on or after `today` (any competition in the calendar). */
export function nextFixture(fixtures: Fixture[], clubId: string, today: string): Fixture | null {
  if (!clubId || !today) return null;
  let best: Fixture | null = null;
  for (const f of fixtures) {
    if (f.played || f.date < today || (f.home !== clubId && f.away !== clubId)) continue;
    if (!best || f.date < best.date) best = f;
  }
  return best;
}

/** Result of one played fixture from the club's side (score after extra time; a shootout is a draw). */
function resultFor(f: Fixture, clubId: string): FormResult | null {
  if (!f.played || !f.result) return null;
  const mine = f.home === clubId ? f.result.home : f.result.away;
  const theirs = f.home === clubId ? f.result.away : f.result.home;
  return mine > theirs ? "W" : mine < theirs ? "L" : "D";
}

/** The club's last `n` results, oldest first (so the newest sits on the right). */
export function lastResults(fixtures: Fixture[], clubId: string, n = 5): FormResult[] {
  return fixtures
    .filter((f) => f.played && f.result && (f.home === clubId || f.away === clubId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-n)
    .map((f) => resultFor(f, clubId)!)
    .filter((r): r is FormResult => r !== null);
}

/** The league round shown in the header: the next league fixture's round, else the last played one. */
export function currentRound(fixtures: Fixture[], clubId: string, leagueSlug: string, today: string): number | null {
  const league = fixtures
    .filter((f) => f.competition === leagueSlug && (f.home === clubId || f.away === clubId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const next = league.find((f) => !f.played && f.date >= today);
  if (next) return next.round;
  const last = league.filter((f) => f.played).at(-1);
  return last ? last.round : null;
}

/**
 * `size` rows of the table around the club (the club as centred as the table edges allow), each
 * with its 1-based position.
 */
export function standingsWindow(
  rows: StandingRow[],
  clubId: string,
  size = 5,
): { rank: number; row: StandingRow }[] {
  if (rows.length === 0) return [];
  const idx = Math.max(0, rows.findIndex((r) => r.squadId === clubId));
  const n = Math.min(size, rows.length);
  const start = Math.min(Math.max(0, idx - Math.floor(n / 2)), rows.length - n);
  return rows.slice(start, start + n).map((row, i) => ({ rank: start + i + 1, row }));
}

export type AttentionItem =
  | { kind: "injured"; playerId: string; name: string; severity: "light" | "medium" | "severe"; returnDate: string }
  | { kind: "suspended"; playerId: string; name: string; matches: number }
  | { kind: "lowFitness"; playerId: string; name: string; fitness: number }
  | { kind: "lowFitnessGroup"; count: number; names: string[] }
  | { kind: "contract"; playerId: string; name: string; until: string }
  | { kind: "contractGroup"; count: number; names: string[] }
  | { kind: "youthIntake"; count: number }
  | { kind: "talk"; playerId: string; name: string; reason: TalkReason; club?: string }
  | { kind: "promiseDue"; playerId: string; name: string; promise: PlayerPromise }
  // Etapa 25: the transfer window of the club's country and the manager's contract.
  | { kind: "windowClosing"; days: number; until: string }
  | { kind: "windowOpen"; until: string }
  | { kind: "managerRenewal" }
  // Etapa 28 (`.claude/rules/game/scouting.md`): a gem found / a shortlist alert in the last 7 days.
  | { kind: "scoutGem"; name: string; club: string }
  | { kind: "shortlistAlert"; name: string; reason: ShortlistReason };

/** More than this many players of the same soft alert (fitness, contracts) collapse into one line. */
const ATTENTION_GROUP_AFTER = 3;

/**
 * What needs the manager's attention today, most urgent first: injuries, bans, tired players,
 * contracts ending this season (the rollover's grace window included) and an unread academy intake.
 */
export function attentionItems(input: {
  players: RosterPlayer[];
  today: string;
  /** Last day of the player's league season (`save.season.end`); contracts are skipped without it. */
  seasonEnd: string | null;
  inbox: InboxMessage[];
  /** Talk requests and promises of the human club (`.claude/rules/game/morale.md`). */
  morale?: ClubMoraleState;
  /** The club's transfer window (`.claude/rules/game/transfer-windows.md`). */
  window?: { open: boolean; until?: string } | null;
  /** The board's renewal offer is waiting for an answer. */
  renewalPending?: boolean;
}): AttentionItem[] {
  const { players, today, seasonEnd, inbox } = input;
  const items: AttentionItem[] = [];

  if (input.renewalPending) items.push({ kind: "managerRenewal" });
  if (input.window?.open && input.window.until) {
    const days = daysBetween(today, input.window.until);
    items.push(days <= WINDOW_ATTENTION_DAYS ? { kind: "windowClosing", days, until: input.window.until } : { kind: "windowOpen", until: input.window.until });
  }

  // Players asking to talk, then promises close to their deadline.
  if (input.morale) {
    const due = moraleAttention({ id: "", name: "", colors: ["", ""], money: 0, players, moraleClub: input.morale }, today);
    for (const x of due.talks) items.push({ kind: "talk", playerId: x.playerId, name: x.playerName, reason: x.reason, ...(x.clubName ? { club: x.clubName } : {}) });
    for (const p of due.promisesDue) items.push({ kind: "promiseDue", playerId: p.playerId, name: p.playerName, promise: p });
  }

  const injured = players
    .filter((p) => p.injury && isInjured(p, today))
    .sort((a, b) => (a.injury!.returnDate < b.injury!.returnDate ? -1 : 1));
  for (const p of injured) {
    items.push({ kind: "injured", playerId: p.id, name: p.name, severity: p.injury!.severity, returnDate: p.injury!.returnDate });
  }

  for (const p of players.filter((p) => isSuspended(p))) {
    items.push({ kind: "suspended", playerId: p.id, name: p.name, matches: p.suspension!.matches });
  }

  const unavailable = new Set([...injured.map((p) => p.id)]);
  const tired = players
    .filter((p) => !unavailable.has(p.id) && p.seasonLog && p.seasonLog.fitness < LOW_FITNESS_THRESHOLD)
    .sort((a, b) => a.seasonLog!.fitness - b.seasonLog!.fitness);
  if (tired.length > ATTENTION_GROUP_AFTER) {
    items.push({ kind: "lowFitnessGroup", count: tired.length, names: tired.map((p) => p.name) });
  } else {
    for (const p of tired) {
      items.push({ kind: "lowFitness", playerId: p.id, name: p.name, fitness: Math.round(p.seasonLog!.fitness) });
    }
  }

  if (seasonEnd) {
    const ending = players
      .filter((p) => isExpired(p.contract, seasonEnd, CONTRACT_CONFIG.ROLLOVER_GRACE_DAYS))
      .sort((a, b) => Player.overallAvg(b) - Player.overallAvg(a));
    if (ending.length > ATTENTION_GROUP_AFTER) {
      items.push({ kind: "contractGroup", count: ending.length, names: ending.map((p) => p.name) });
    } else {
      for (const p of ending) items.push({ kind: "contract", playerId: p.id, name: p.name, until: p.contract!.until });
    }
  }

  const intake = inbox.find((m) => !m.read && m.category === "youth" && m.kind === "intake");
  if (intake && intake.category === "youth") items.push({ kind: "youthIntake", count: intake.count ?? 0 });

  // Scouting news of the last week (gems, shortlist alerts), unread first.
  for (const m of inbox) {
    if (m.category !== "scouting" || daysBetween(m.date, today) > SCOUTING_ATTENTION_DAYS) continue;
    if (m.kind === "gem") items.push({ kind: "scoutGem", name: m.playerName ?? "", club: m.clubName ?? "" });
    else if (m.kind === "shortlist" && m.reason) items.push({ kind: "shortlistAlert", name: m.playerName ?? "", reason: m.reason });
  }

  return items;
}

export interface Highlight {
  player: RosterPlayer;
  appearances: number;
  goals: number;
  assists: number;
  /** Season average rating (0 before the player has played). */
  rating: number;
  overall: number;
}

/**
 * The season's standout players: by average rating among the regulars (at least 40% of the most
 * used player's appearances), goals and assists breaking ties. Before anyone has played, the best
 * players by overall.
 */
export function seasonHighlights(players: RosterPlayer[], n = 4): { mode: "season" | "overall"; items: Highlight[] } {
  const rows: Highlight[] = players.map((p) => ({
    player: p,
    appearances: p.seasonLog?.appearances ?? 0,
    goals: p.seasonLog?.goals ?? 0,
    assists: p.seasonLog?.assists ?? 0,
    rating: p.seasonLog?.avgRating ?? 0,
    overall: Player.overallAvg(p),
  }));
  const maxApps = Math.max(0, ...rows.map((r) => r.appearances));
  if (maxApps === 0) {
    return { mode: "overall", items: [...rows].sort((a, b) => b.overall - a.overall).slice(0, n) };
  }
  const minApps = Math.max(1, Math.ceil(maxApps * 0.4));
  const items = rows
    .filter((r) => r.appearances >= minApps)
    .sort((a, b) => b.rating - a.rating || b.goals - a.goals || b.assists - a.assists)
    .slice(0, n);
  return { mode: "season", items };
}

export interface WeekMoney {
  weekStart: string;
  income: number;
  expenses: number;
  net: number;
}

/**
 * Money of the most recent week with ledger entries (the current week once its Monday has been
 * booked): income, expenses (negative) and net. Null with an empty ledger.
 */
export function latestWeekMoney(entries: LedgerEntry[]): WeekMoney | null {
  if (entries.length === 0) return null;
  let latest = "";
  for (const e of entries) {
    const w = isoWeekStart(e.date);
    if (w > latest) latest = w;
  }
  let income = 0;
  let expenses = 0;
  for (const e of entries) {
    if (isoWeekStart(e.date) !== latest) continue;
    if (e.amount >= 0) income += e.amount;
    else expenses += e.amount;
  }
  return { weekStart: latest, income, expenses, net: income + expenses };
}
