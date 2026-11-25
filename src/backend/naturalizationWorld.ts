import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { NationCandidate } from "@/Domain/national/nationalSquad";
import { pickCallUp } from "@/Domain/national/nationalSquad";
import { NATION_CONFED, normalizeNation } from "@/Domain/registration/nations";
import {
  asksNaturalization, canAskNaturalization, naturalizationChance, naturalizationDay, startNaturalization,
  type NaturalizationCtx,
} from "@/Domain/naturalization/naturalization";
import { NATURALIZATION as N } from "@/Domain/naturalization/naturalizationConfig";
import { afterNaturalizationAnswer } from "@/Domain/morale/morale";
import { addDays } from "@/Domain/dates";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { NaturalizationAsk } from "@/types/seatTypes";

/**
 * Naturalization (`.claude/rules/game/naturalization.md`), the I/O around the pure rules: the requests at the
 * country's rollover, the manager's answer, and the processes ending on their day.
 */

/** An inbox line for the seat of the player's club (built after the day's inbox clear). */
export interface NaturalizationNews {
  kind: "naturalization" | "naturalized";
  playerId: string;
  playerName: string;
  country: string;
  expires?: string;
}

/** The national team pool of the day, read once (every squad of the world). */
export type PoolOf = () => Promise<Map<string, NationCandidate[]>>;

function inCallUp(pool: Map<string, NationCandidate[]>, nation: string | null, p: RosterPlayer, squadId: string, add: boolean): boolean {
  if (!nation || !NATION_CONFED[nation]) return false;
  const cands = (pool.get(nation) ?? []).filter((c) => c.player.id !== p.id);
  if (add || (pool.get(nation) ?? []).some((c) => c.player.id === p.id)) cands.push({ player: p, squadId });
  return pickCallUp(cands).some((c) => c.player.id === p.id);
}

export interface RolloverNaturalization {
  /** Squads with a process started (AI clubs). */
  squads: Squad[];
  /** Requests of human clubs, by seat. */
  asks: Map<string, NaturalizationAsk[]>;
  news: Map<string, NaturalizationNews[]>;
}

/**
 * The country's rollover: every foreign player of its clubs (squad and academy) who meets a path draws his interest
 * once. An AI club lets him go ahead; a human club gets the request (answer within 30 days).
 */
export async function naturalizationRollover(args: {
  squads: Squad[];
  country: string;
  date: string;
  year: number;
  ctx: NaturalizationCtx;
  seatIdByClub: Map<string, string>;
  pool: PoolOf;
}): Promise<RolloverNaturalization> {
  const { squads, country, date, year, ctx, seatIdByClub } = args;
  const out: RolloverNaturalization = { squads: [], asks: new Map(), news: new Map() };
  if (!country) return out;
  const newNation = normalizeNation(country) ?? country;
  for (const squad of squads) {
    const seatId = seatIdByClub.get(squad.id);
    let changed = false;
    const visit = async (p: RosterPlayer): Promise<RosterPlayer> => {
      if (!canAskNaturalization(p, country, ctx)) return p;
      const pool = await args.pool();
      const newPlace = inCallUp(pool, newNation, p, squad.id, true);
      const originPlace = inCallUp(pool, normalizeNation(p.nationality), p, squad.id, false);
      if (!asksNaturalization(p.id, year, naturalizationChance(p, newPlace, originPlace))) return p;
      if (seatId) {
        const expires = addDays(date, N.ASK_DAYS);
        (out.asks.get(seatId) ?? out.asks.set(seatId, []).get(seatId)!).push({ playerId: p.id, playerName: p.name, country, expires });
        (out.news.get(seatId) ?? out.news.set(seatId, []).get(seatId)!)
          .push({ kind: "naturalization", playerId: p.id, playerName: p.name, country, expires });
        return p;
      }
      changed = true;
      return startNaturalization(p, country, date, year);
    };
    const players: RosterPlayer[] = [];
    for (const p of squad.players) players.push(await visit(p));
    const youth: RosterPlayer[] = [];
    for (const p of squad.youth ?? []) youth.push(await visit(p));
    if (changed) out.squads.push({ ...squad, players, ...(squad.youth ? { youth } : {}) });
  }
  return out;
}

/** One squad on a day: processes ending (second nationality) or falling (he left the country). */
export function squadNaturalizationDay(squad: Squad, date: string, clubCountry: string): { squad: Squad; done: RosterPlayer[] } {
  if (!squad.players.some((p) => p.naturalization) && !(squad.youth ?? []).some((p) => p.naturalization)) return { squad, done: [] };
  const done: RosterPlayer[] = [];
  let changed = false;
  const step = (p: RosterPlayer) => {
    const r = naturalizationDay(p, date, clubCountry);
    if (r.outcome === "none") return p;
    changed = true;
    if (r.outcome === "done") done.push(r.player);
    return r.player;
  };
  const players = squad.players.map(step);
  const youth = squad.youth?.map(step);
  if (!changed) return { squad, done };
  return { squad: { ...squad, players, ...(youth ? { youth } : {}) }, done };
}

/**
 * The manager's answer (or its absence by `expires`). Support: the process starts, morale +3. No support: morale −4,
 * no new request this season. The squad back (null when the player is gone).
 */
export function answerAsk(squad: Squad, ask: NaturalizationAsk, support: boolean, date: string): Squad | null {
  const year = parseInt(ask.expires.slice(0, 4), 10);
  const apply = (p: RosterPlayer): RosterPlayer => {
    const moved = afterNaturalizationAnswer(p, support, N.SUPPORT_MORALE, N.REFUSE_MORALE);
    return support ? startNaturalization(moved, ask.country, date, year) : moved;
  };
  if (squad.players.some((p) => p.id === ask.playerId)) {
    return { ...squad, players: squad.players.map((p) => (p.id === ask.playerId ? apply(p) : p)) };
  }
  if ((squad.youth ?? []).some((p) => p.id === ask.playerId)) {
    return { ...squad, youth: squad.youth!.map((p) => (p.id === ask.playerId ? apply(p) : p)) };
  }
  return null;
}

/** Asks past their day are supported (the manager did not answer). The asks still open back. */
export async function expireAsks(args: {
  service: SaveService;
  saveId: string;
  clubId: string;
  asks: NaturalizationAsk[];
  date: string;
}): Promise<NaturalizationAsk[]> {
  const due = args.asks.filter((a) => a.expires <= args.date);
  if (due.length === 0) return args.asks;
  let squad = await args.service.getSquadById(args.saveId, args.clubId);
  if (squad) {
    for (const a of due) squad = answerAsk(squad, a, true, args.date) ?? squad;
    await args.service.saveSquadById(args.saveId, squad);
  }
  return args.asks.filter((a) => a.expires > args.date);
}

/** Country of a club by the index and the league catalog ("" unknown). */
export function clubCountryOf(index: SquadIndex, countryOfLeague: (slug: string) => string | undefined) {
  return (squadId: string): string => countryOfLeague(index.byId(squadId)?.leagueSlug ?? "") ?? "";
}
