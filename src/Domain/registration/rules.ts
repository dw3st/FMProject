import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { FormationSlot } from "@/types/formationSlots";
import type { RegCounts, RegistrationRule, RegViolationKind } from "@/types/registrationTypes";
import {
  LINE_MINIMUMS, MIN_REGISTERED, REGISTRATION_RULES, RULE_BY_CONTINENT, RULE_BY_CONTINENTAL, RULE_BY_COUNTRY,
} from "@/Domain/registration/registrationConfig";
import { isForeign, isFormed, isFree, type FormedCtx } from "@/Domain/registration/formed";
import { computeOverallAvg } from "@/Domain/playerRating";
import { getMainRole } from "@/Domain/roles";
import { seedFrom } from "@/Domain/rng";
import { fitnessAdjustedValue } from "@/Domain/lineupHelpers";

/**
 * Registration rules applied to a squad (`.claude/rules/game/registration.md`): rule lookup, the automatic list,
 * validation, counters and the per-match foreign limit. Pure.
 */
export interface RegCtx extends FormedCtx {
  /** Country of the club's league. */
  country: string;
  squadId: string;
}

export interface RegViolation {
  kind: RegViolationKind;
}

/**
 * Rule of a competition: continental → the club's country (a league and its national cup follow the country's rule,
 * the whole pyramid) → continent of the country → Europe. `clubLeague` is kept for a future per-league rule.
 */
export function ruleFor(competition: string, _clubLeague: string, country: string, continent: string | undefined): RegistrationRule {
  const cont = RULE_BY_CONTINENTAL[competition];
  if (cont) return REGISTRATION_RULES[cont]!;
  const byCountry = RULE_BY_COUNTRY[country];
  if (byCountry) return REGISTRATION_RULES[byCountry]!;
  const byContinent = continent ? RULE_BY_CONTINENT[continent] : undefined;
  return REGISTRATION_RULES[byContinent ?? "europe"]!;
}

const overallOf = (p: RosterPlayer) => p.overallAvg ?? computeOverallAvg(p);

interface PlayerInfo {
  p: RosterPlayer;
  free: boolean;
  formed: boolean;
  foreign: boolean;
}

function infoOf(p: RosterPlayer, rule: RegistrationRule, ctx: RegCtx): PlayerInfo {
  return {
    p,
    free: isFree(p, rule, ctx.country, ctx.squadId, ctx),
    formed: isFormed(p, rule, ctx.country, ctx.squadId, ctx),
    foreign: isForeign(p, rule, ctx.country),
  };
}

/** Best first, id ascending on ties (deterministic). */
function byQuality(a: RosterPlayer, b: RosterPlayer): number {
  return overallOf(b) - overallOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

interface Tally {
  counted: number;
  nonFormed: number;
  foreign: number;
}

function tallyOf(infos: PlayerInfo[]): Tally {
  const t: Tally = { counted: 0, nonFormed: 0, foreign: 0 };
  for (const i of infos) add(t, i);
  return t;
}

function add(t: Tally, i: PlayerInfo) {
  if (i.foreign) t.foreign++;
  if (!i.free) {
    t.counted++;
    if (!i.formed) t.nonFormed++;
  }
}

/** Why `i` cannot join a list with tally `t`, or null when it fits. */
function blockOf(t: Tally, i: PlayerInfo, rule: RegistrationRule): RegViolationKind | null {
  if (i.foreign && rule.maxForeign != null && t.foreign >= rule.maxForeign) return "foreign";
  if (i.free) return null;
  if (rule.maxList != null && t.counted >= rule.maxList) return "listFull";
  if (!i.formed && rule.maxList != null && rule.minFormed && t.nonFormed >= rule.maxList - rule.minFormed) return "formed";
  return null;
}

/**
 * The automatic list: line minimums first (the best of each line), then the best that fit; a lack of formed players
 * reduces the list by itself. Below MIN_REGISTERED the best left are added ignoring the limits (`exception`).
 */
export function autoRegister(players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx): { ids: string[]; exception: boolean } {
  const infos = [...players].sort(byQuality).map((p) => infoOf(p, rule, ctx));
  const chosen = new Set<string>();
  const t: Tally = { counted: 0, nonFormed: 0, foreign: 0 };
  const take = (i: PlayerInfo) => {
    chosen.add(i.p.id);
    add(t, i);
  };
  for (const [line, min] of Object.entries(LINE_MINIMUMS)) {
    let n = 0;
    for (const i of infos) {
      if (n >= min) break;
      if (getMainRole(i.p.positions[0] ?? "CM") !== line) continue;
      if (blockOf(t, i, rule)) continue;
      take(i);
      n++;
    }
  }
  for (const i of infos) if (!chosen.has(i.p.id) && !blockOf(t, i, rule)) take(i);
  let exception = false;
  for (const i of infos) {
    if (chosen.size >= MIN_REGISTERED) break;
    if (chosen.has(i.p.id)) continue;
    take(i);
    exception = true;
  }
  return { ids: infos.filter((i) => chosen.has(i.p.id)).map((i) => i.p.id), exception };
}

function infosOf(ids: string[], players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx): PlayerInfo[] {
  const set = new Set(ids);
  return players.filter((p) => set.has(p.id)).map((p) => infoOf(p, rule, ctx));
}

/** Rule violations of a list (players no longer in the squad are ignored). `exception` lists pass up to 18. */
export function validateList(
  ids: string[], players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx, exception?: boolean,
): RegViolation[] {
  const infos = infosOf(ids, players, rule, ctx);
  if (exception && infos.length <= MIN_REGISTERED) return [];
  const t = tallyOf(infos);
  const out: RegViolation[] = [];
  if (rule.maxList != null && t.counted > rule.maxList) out.push({ kind: "listFull" });
  if (rule.maxForeign != null && t.foreign > rule.maxForeign) out.push({ kind: "foreign" });
  if (rule.maxList != null && rule.minFormed && t.nonFormed > rule.maxList - rule.minFormed) out.push({ kind: "formed" });
  return out;
}

/** Whether `player` can be added to the list. */
export function canAdd(
  ids: string[], player: RosterPlayer, players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx,
): { ok: true } | { ok: false; reason: RegViolationKind } {
  const t = tallyOf(infosOf(ids.filter((id) => id !== player.id), players, rule, ctx));
  const reason = blockOf(t, infoOf(player, rule, ctx), rule);
  return reason ? { ok: false, reason } : { ok: true };
}

/** Counters of a list for the screen. */
export function countsOf(ids: string[], players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx): RegCounts {
  const infos = infosOf(ids, players, rule, ctx);
  const t = tallyOf(infos);
  const formed = infos.filter((i) => !i.free && i.formed).length;
  const minFormed = rule.maxList != null ? rule.minFormed ?? 0 : 0;
  return {
    counted: t.counted,
    max: rule.maxList,
    foreign: t.foreign,
    maxForeign: rule.maxForeign ?? null,
    formed,
    minFormed,
    lostSlots: Math.max(0, minFormed - formed),
    free: infos.filter((i) => i.free).length,
  };
}

/**
 * Registered players of a squad for a competition: the list's ids still in the squad plus the free players.
 * null = no list (or a list of another season when `season` is given).
 */
export function registeredSet(
  squad: Squad, competition: string, rule: RegistrationRule, ctx: RegCtx, season?: string,
): Set<string> | null {
  const list = squad.registrations?.[competition];
  if (!list || (season != null && list.season !== season)) return null;
  const listed = new Set(list.ids);
  const out = new Set<string>();
  for (const p of squad.players) if (listed.has(p.id) || isFree(p, rule, ctx.country, ctx.squadId, ctx)) out.add(p.id);
  return out;
}

/** Signature of the squad ids (the AI rebuilds its lists when it changes). */
export function rosterSig(players: RosterPlayer[]): string {
  return seedFrom(players.map((p) => p.id).sort().join("|")).toString(36);
}

/**
 * Per-match foreign limit (`maxForeignMatchday`): the AI picks from all domestic players and only the best foreign
 * ones that fit, so its XI and bench are within the limit.
 */
export function limitForeignPool(players: RosterPlayer[], rule: RegistrationRule, country: string): RosterPlayer[] {
  const max = rule.maxForeignMatchday;
  if (max == null) return players;
  const foreign = players.filter((p) => isForeign(p, rule, country));
  if (foreign.length <= max) return players;
  const keep = new Set([...foreign].sort(byQuality).slice(0, max).map((p) => p.id));
  return players.filter((p) => !isForeign(p, rule, country) || keep.has(p.id));
}

/**
 * Per-match foreign limit for a chosen XI (human club): extra foreigners of the XI (the worst) leave for the best
 * domestic bench player of the line (`foreignLimit`), and the bench keeps only the foreigners that still fit, best
 * first. Within the limit the lineup comes back unchanged (same array).
 */
export function matchdayPool(
  slots: FormationSlot[], lineup: string[], players: RosterPlayer[], rule: RegistrationRule, country: string,
): { lineup: string[]; bench: RosterPlayer[]; replaced: { out: string; in: string; reason: "foreignLimit" }[] } {
  const max = rule.maxForeignMatchday;
  const inXI = new Set(lineup.filter(Boolean));
  const benchAll = players.filter((p) => !inXI.has(p.id));
  const foreignOf = (p: RosterPlayer) => isForeign(p, rule, country);
  if (max == null || players.filter(foreignOf).length <= max) return { lineup, bench: benchAll, replaced: [] };

  const byId = new Map(players.map((p) => [p.id, p]));
  const result = [...lineup];
  const replaced: { out: string; in: string; reason: "foreignLimit" }[] = [];
  const xiForeign = lineup
    .map((id, i) => ({ id, i, p: byId.get(id) }))
    .filter((x): x is { id: string; i: number; p: RosterPlayer } => !!x.p && foreignOf(x.p))
    .sort((a, b) => fitnessAdjustedValue(a.p, slots[a.i]?.role ?? "CM") - fitnessAdjustedValue(b.p, slots[b.i]?.role ?? "CM"));
  let excess = xiForeign.length - max;
  const used = new Set(inXI);
  for (const x of xiForeign) {
    if (excess <= 0) break;
    const role = slots[x.i]?.role ?? "CM";
    const main = getMainRole(role);
    const domestic = players.filter((p) => !used.has(p.id) && !foreignOf(p));
    const sameLine = domestic.filter((p) => p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === main);
    const pool = sameLine.length > 0 ? sameLine : domestic;
    const best = [...pool].sort((a, b) => fitnessAdjustedValue(b, role) - fitnessAdjustedValue(a, role))[0];
    if (!best) break;
    result[x.i] = best.id;
    used.delete(x.id);
    used.add(best.id);
    replaced.push({ out: x.id, in: best.id, reason: "foreignLimit" });
    excess--;
  }
  const xiSet = new Set(result.filter(Boolean));
  const xiForeignLeft = result.filter((id) => id && byId.get(id) && foreignOf(byId.get(id)!)).length;
  const room = Math.max(0, max - xiForeignLeft);
  const rest = players.filter((p) => !xiSet.has(p.id));
  const benchForeign = new Set(rest.filter(foreignOf).sort(byQuality).slice(0, room).map((p) => p.id));
  return { lineup: result, bench: rest.filter((p) => !foreignOf(p) || benchForeign.has(p.id)), replaced };
}
