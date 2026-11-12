/**
 * The end-of-season report of the manager's club: the table line, the cups, the money and the market of the
 * season that has just closed, from what the save already keeps (club history row, the seat's ledger, the
 * players' career rows, the home attendances). Pure; `seasonSummaryWorld.ts` reads the inputs.
 */
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isCupSlug } from "@/Domain/cups/cupIds";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { ClubSeasonRow } from "@/types/clubHistoryTypes";
import type { AttendanceRow } from "@/types/facilityTypes";
import type { PlayerArrival, PlayerHistoryRow } from "@/types/playerTypes";
import type {
  SeasonDeal, SeasonHighlight, SeasonRun, SeasonRunStage, SeasonSummary, SeatLastSeason,
} from "@/types/seasonSummaryTypes";

export const SEASON_SUMMARY = {
  /** A player needs this share of the club's league games (and at least MIN_APPS) for the best average rating. */
  RATING_APPS_SHARE: 0.3,
  RATING_MIN_APPS: 5,
} as const;

/** Cup stages in playing order: winning one means the club reached the next. */
const CUP_ORDER: SeasonRunStage[] = ["preliminary", "r128", "r64", "r32", "r16", "qf", "sf", "final"];
/** Continental stages reached, lowest first. */
const CONTINENTAL_ORDER: SeasonRunStage[] = ["group", "r16", "qf", "sf", "final"];

export interface SummaryPlayer {
  id: string;
  name: string;
  nationality?: string;
  history?: PlayerHistoryRow[];
  arrival?: PlayerArrival;
}

export interface SeasonSummaryInput {
  year: number;
  /** Season label of the closed league season. */
  season: string;
  club: { id: string; name: string; colors?: [string, string] };
  league: string;
  /** The club's history row of that season; null when the club has none (a season without games). */
  row: ClubSeasonRow | null;
  /** Clubs in the league that season. */
  teams: number;
  /** The seat's ledger of that season. */
  entries: LedgerEntry[];
  /** The club's squad (and academy) now. */
  players: SummaryPlayer[];
  attendance: AttendanceRow[];
  /** Last day of the league season ("YYYY-MM-DD"); "" when unknown. */
  seasonEnd: string;
  last?: SeatLastSeason;
}

/** The ledger entries of the club the manager ended the season at (a season with a club change starts at the arrival). */
export function entriesAtClub(entries: LedgerEntry[]): LedgerEntry[] {
  const lastArrival = entries.findLastIndex((e) => e.kind === "club_change" && e.ref?.stage === "arrive");
  return (lastArrival >= 0 ? entries.slice(lastArrival) : entries).filter((e) => e.kind !== "club_change");
}

/** How far the club went in the national cup, read from the stage prizes it was paid. */
export function cupRun(entries: LedgerEntry[], titles: string[]): SeasonRun | undefined {
  const won = titles.find((t) => t.startsWith("cup:"));
  if (won) return { competition: won.slice(4), stage: "champion" };
  const prizes = entries.filter((e) => e.kind === "prize" && e.ref?.competition && isCupSlug(e.ref.competition));
  if (prizes.length === 0) return undefined;
  const competition = prizes[0]!.ref!.competition!;
  const stages = prizes.map((e) => e.ref?.stage ?? "");
  if (stages.includes("final")) return { competition, stage: "champion" };
  if (stages.includes("runner_up")) return { competition, stage: "runner_up" };
  const best = Math.max(...stages.map((s) => CUP_ORDER.indexOf(s as SeasonRunStage)));
  if (best < 0) return undefined;
  return { competition, stage: CUP_ORDER[Math.min(best + 1, CUP_ORDER.length - 1)]! };
}

/** How far the club went in its continental competition, read from the prizes it was paid. */
export function continentalRun(entries: LedgerEntry[], titles: string[]): SeasonRun | undefined {
  const won = titles.find((t) => t.startsWith("continental:"));
  if (won) return { competition: won.slice(12), stage: "champion" };
  const prizes = entries.filter((e) => e.kind === "prize" && e.ref?.competition && isContinentalSlug(e.ref.competition));
  if (prizes.length === 0) return undefined;
  const competition = prizes[0]!.ref!.competition!;
  const stages = prizes.map((e) => e.ref?.stage ?? "");
  if (stages.includes("title")) return { competition, stage: "champion" };
  const best = Math.max(0, ...stages.map((s) => CONTINENTAL_ORDER.indexOf(s as SeasonRunStage)));
  const stage = CONTINENTAL_ORDER[best]!;
  return { competition, stage: stage === "final" ? "runner_up" : stage };
}

function moneyOf(entries: LedgerEntry[]): SeasonSummary["money"] {
  const real = entries.filter((e) => e.kind !== "loan_in");
  const income = real.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const expenses = -real.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0);
  const of = (kind: LedgerEntry["kind"]) => entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
  return { income, expenses, net: income - expenses, prizes: of("prize"), gate: of("gate"), wages: -of("wages") };
}

function dealOf(e: LedgerEntry | undefined): SeasonDeal | undefined {
  return e?.ref?.playerName ? { name: e.ref.playerName, fee: Math.abs(e.amount) } : undefined;
}

function marketOf(input: SeasonSummaryInput, entries: LedgerEntry[]): SeasonSummary["market"] {
  const buys = entries.filter((e) => e.kind === "transfer_out" && !e.ref?.stage);
  const sales = entries.filter((e) => e.kind === "transfer_in" && !e.ref?.stage);
  const sellOnPaid = entries.filter((e) => e.kind === "transfer_out" && e.ref?.stage === "sell_on");
  const spent = -entries.filter((e) => e.kind === "transfer_out" && e.ref?.stage !== "sell_on").reduce((s, e) => s + e.amount, 0);
  const received = entries.filter((e) => e.kind === "transfer_in").reduce((s, e) => s + e.amount, 0)
    + sellOnPaid.reduce((s, e) => s + e.amount, 0);

  // Everyone who joined: the fee signings of the ledger, plus who is at the club now and arrived in the season
  // without a fee (free agents, pre-contracts). A youngster promoted from the academy is not a signing.
  const from = entries[0]?.date ?? "";
  const names = new Map(input.players.map((p) => [p.name, p.id]));
  const joined = new Set<string>();
  buys.forEach((e, i) => joined.add(e.ref?.playerId ?? (e.ref?.playerName ? names.get(e.ref.playerName) : undefined) ?? `buy:${i}`));
  for (const p of input.players) {
    const a = p.arrival;
    if (!a || a.kind === "academy" || a.squadId !== input.club.id) continue;
    if (from && a.on >= from && (!input.seasonEnd || a.on <= input.seasonEnd)) joined.add(p.id);
  }
  const biggest = (list: LedgerEntry[]) => [...list].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
  return {
    signings: joined.size,
    spent,
    sales: sales.length,
    received,
    biggestBuy: dealOf(biggest(buys)),
    biggestSale: dealOf(biggest(sales)),
  };
}

interface Totals { id: string; name: string; nationality?: string; apps: number; goals: number; assists: number; rating: number | null }

function totalsOf(input: SeasonSummaryInput): Totals[] {
  const out: Totals[] = [];
  for (const p of input.players) {
    const rows = (p.history ?? []).filter((r) => r.season === input.season && r.squadId === input.club.id);
    if (rows.length === 0) continue;
    const apps = rows.reduce((s, r) => s + r.apps, 0);
    const rated = rows.filter((r) => r.avgRating !== null && r.apps > 0);
    const ratedApps = rated.reduce((s, r) => s + r.apps, 0);
    out.push({
      id: p.id, name: p.name, nationality: p.nationality, apps,
      goals: rows.reduce((s, r) => s + r.goals, 0),
      assists: rows.reduce((s, r) => s + r.assists, 0),
      rating: ratedApps > 0 ? rated.reduce((s, r) => s + r.avgRating! * r.apps, 0) / ratedApps : null,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function highlightsOf(input: SeasonSummaryInput): SeasonHighlight[] {
  const totals = totalsOf(input);
  const best = (value: (t: Totals) => number | null): Totals | undefined => {
    let top: Totals | undefined;
    for (const t of totals) {
      const v = value(t);
      if (v === null || v <= 0) continue;
      if (!top || v > value(top)!) top = t;
    }
    return top;
  };
  const out: SeasonHighlight[] = [];
  const push = (kind: SeasonHighlight["kind"], t: Totals | undefined, value: number | null | undefined) => {
    if (t && value) out.push({ kind, playerId: t.id, name: t.name, nationality: t.nationality, value });
  };

  // The club's record of the season counts who left mid-season too: it wins over the squad of today.
  const scorer = best((t) => t.goals);
  const record = input.row?.topScorer;
  if (record && record.goals > (scorer?.goals ?? 0)) {
    const known = input.players.find((p) => p.id === record.playerId);
    out.push({ kind: "scorer", playerId: record.playerId, name: record.name, nationality: known?.nationality, value: record.goals });
  } else push("scorer", scorer, scorer?.goals);

  const assists = best((t) => t.assists);
  push("assists", assists, assists?.assists);
  const minApps = Math.max(SEASON_SUMMARY.RATING_MIN_APPS, Math.ceil((input.row?.played ?? 0) * SEASON_SUMMARY.RATING_APPS_SHARE));
  const rating = best((t) => (t.apps >= minApps ? t.rating : null));
  push("rating", rating, rating?.rating ? Math.round(rating.rating * 100) / 100 : null);
  const apps = best((t) => t.apps);
  push("apps", apps, apps?.apps);
  return out;
}

function crowdOf(input: SeasonSummaryInput, from: string): SeasonSummary["crowd"] {
  const games = input.attendance.filter((a) => from !== "" && a.date >= from && (!input.seasonEnd || a.date <= input.seasonEnd));
  if (games.length === 0) return undefined;
  const total = games.reduce((s, a) => s + a.attendance, 0);
  return { average: Math.round(total / games.length), games: games.length, best: Math.round(Math.max(...games.map((a) => a.attendance))) };
}

export function buildSeasonSummary(input: SeasonSummaryInput): SeasonSummary {
  const entries = entriesAtClub(input.entries);
  const row = input.row;
  const titles = (row?.titles ?? []).filter((t) => !t.startsWith("promotion:"));
  const last = input.last && input.last.year === input.year && input.last.clubId === input.club.id ? input.last : undefined;
  return {
    year: input.year,
    season: input.season,
    clubId: input.club.id,
    clubName: input.club.name,
    clubColors: input.club.colors,
    league: row?.league ?? input.league,
    table: row
      ? {
          position: row.position, teams: input.teams, played: row.played, won: row.won, drawn: row.drawn, lost: row.lost,
          gf: row.gf, ga: row.ga, points: row.points,
        }
      : null,
    objective: last ? { target: last.target, met: last.met } : undefined,
    titles,
    move: row?.move,
    cup: cupRun(entries, titles),
    continental: continentalRun(entries, titles),
    crowd: crowdOf(input, entries[0]?.date ?? ""),
    money: moneyOf(entries),
    market: marketOf(input, entries),
    highlights: highlightsOf(input),
  };
}
