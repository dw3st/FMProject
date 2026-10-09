import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type {
  RegistrationCompKind, RegistrationList, RegistrationNotice, RegistrationRule, RegistrationStatus,
} from "@/types/registrationTypes";
import { autoRegister, canAdd, countsOf, rosterSig, type RegCtx } from "@/Domain/registration/rules";
import { isFree } from "@/Domain/registration/formed";
import { CLOSING_NOTICE_DAYS } from "@/Domain/registration/registrationConfig";
import { daysBetween } from "@/Domain/dates";

/**
 * Registration lists of one club (`.claude/rules/game/registration.md` → Inscrição automática): the first list,
 * the AI refresh and the human club's daily step. Pure: the caller reads and writes the squad.
 */
export interface CompInfo {
  slug: string;
  kind: RegistrationCompKind;
  /** Season label of the competition the list is valid for. */
  season: string;
  rule: RegistrationRule;
  ctx: RegCtx;
  status: RegistrationStatus;
}

export const isStale = (list: RegistrationList | undefined, season: string): boolean => !list || list.season !== season;

export function withList(squad: Squad, slug: string, list: RegistrationList): Squad {
  return { ...squad, registrations: { ...(squad.registrations ?? {}), [slug]: list } };
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Players of the squad not on the list and not free (they cannot play this competition). */
export function outsiders(players: RosterPlayer[], ids: string[], info: CompInfo): RosterPlayer[] {
  const set = new Set(ids);
  return players.filter((p) => !set.has(p.id) && !isFree(p, info.rule, info.ctx.country, info.ctx.squadId, info.ctx));
}

/** The automatic list, keeping the human club's bookkeeping (`manual` off). */
function autoList(squad: Squad, info: CompInfo, date: string, keep?: Pick<RegistrationList, "notified">): RegistrationList {
  const r = autoRegister(squad.players, info.rule, info.ctx);
  return {
    season: info.season,
    ids: r.ids,
    updatedOn: date,
    sig: rosterSig(squad.players),
    ...(keep?.notified && keep.notified.length > 0 ? { notified: keep.notified } : {}),
    ...(r.exception ? { exception: true as const } : {}),
  };
}

/**
 * First list (absent, or of another season): built by the rule even with the deadline closed. Every player left out
 * at that moment counts as already told (no "did not fit" flood on day one).
 */
export function ensureList(squad: Squad, info: CompInfo, date: string): { squad: Squad; changed: boolean; notices: RegistrationNotice[] } {
  const list = squad.registrations?.[info.slug];
  if (!isStale(list, info.season)) return { squad, changed: false, notices: [] };
  const fresh = autoList(squad, info, date);
  const out = outsiders(squad.players, fresh.ids, info).map((p) => p.id);
  const next: RegistrationList = { ...fresh, ...(out.length > 0 ? { notified: out } : {}) };
  const notices: RegistrationNotice[] = [{ kind: "auto_list", competition: info.slug, season: info.season }];
  if (fresh.exception) notices.push({ kind: "exception", competition: info.slug, season: info.season });
  return { squad: withList(squad, info.slug, next), changed: true, notices };
}

/**
 * AI, deadline open: the whole list is rebuilt (the best) when the squad changed or the list is absent/stale. With
 * the deadline closed nothing moves (an absent list is built at match time, `ensureList`).
 */
export function aiRefresh(squad: Squad, info: CompInfo, date: string): { squad: Squad; changed: boolean } {
  if (!info.status.open) return { squad, changed: false };
  const list = squad.registrations?.[info.slug];
  if (isStale(list, info.season)) {
    const r = ensureList(squad, info, date);
    const l = r.squad.registrations![info.slug]!;
    const { notified: _n, ...clean } = l;
    return { squad: withList(squad, info.slug, clean), changed: true };
  }
  const sig = rosterSig(squad.players);
  if (list!.sig === sig) return { squad, changed: false };
  return { squad: withList(squad, info.slug, autoList(squad, info, date)), changed: true };
}

/**
 * The human club's morning step for one competition. Deadline open: without `manual` the list is rebuilt like the
 * AI's; with `manual` arrivals that fit are added (never those removed by hand). Whoever stays out is told once
 * (`not_fit`, or `waiting` with the deadline closed). Three days before the deadline closes: `closing`.
 */
export function humanDay(squad: Squad, info: CompInfo, date: string): { squad: Squad; changed: boolean; notices: RegistrationNotice[] } {
  const first = ensureList(squad, info, date);
  if (first.changed) return first;
  const list = squad.registrations![info.slug]!;
  const roster = new Set(squad.players.map((p) => p.id));
  const notified = new Set((list.notified ?? []).filter((id) => roster.has(id)));
  const out = new Set((list.out ?? []).filter((id) => roster.has(id)));
  const waiting = new Set((list.waiting ?? []).filter((id) => roster.has(id)));
  const notices: RegistrationNotice[] = [];
  let next: RegistrationList = list;

  if (info.status.open) {
    if (!list.manual) {
      const rebuilt = autoList(squad, info, date);
      if (!sameIds(rebuilt.ids, list.ids) || rebuilt.sig !== list.sig || !!rebuilt.exception !== !!list.exception) {
        next = { ...rebuilt };
      }
    } else {
      let ids = list.ids.filter((id) => roster.has(id));
      // Only arrivals: new players and those told to wait; a player left out earlier stays out.
      for (const p of outsiders(squad.players, ids, info)) {
        if (out.has(p.id) || (notified.has(p.id) && !waiting.has(p.id))) continue;
        if (canAdd(ids, p, squad.players, info.rule, info.ctx).ok) ids = [...ids, p.id];
      }
      if (!sameIds(ids, list.ids)) next = { ...list, ids, updatedOn: date, sig: rosterSig(squad.players) };
    }
    const left = outsiders(squad.players, next.ids, info)
      .filter((p) => (!notified.has(p.id) || waiting.has(p.id)) && !out.has(p.id));
    if (left.length > 0) {
      notices.push({ kind: "not_fit", competition: info.slug, season: info.season, playerIds: left.map((p) => p.id) });
      for (const p of left) notified.add(p.id);
    }
    waiting.clear();
    if (info.status.until && daysBetween(date, info.status.until) === CLOSING_NOTICE_DAYS) {
      notices.push({
        kind: "closing", competition: info.slug, season: info.season, until: info.status.until,
        counts: countsOf(next.ids, squad.players, info.rule, info.ctx),
      });
    }
  } else {
    const left = outsiders(squad.players, list.ids, info).filter((p) => !notified.has(p.id) && !out.has(p.id));
    if (left.length > 0) {
      notices.push({
        kind: "waiting", competition: info.slug, season: info.season, playerIds: left.map((p) => p.id),
        ...(info.status.opensOn ? { opensOn: info.status.opensOn } : {}),
      });
      for (const p of left) {
        notified.add(p.id);
        waiting.add(p.id);
      }
    }
  }

  const notifiedArr = [...notified];
  const outArr = [...out];
  const waitingArr = [...waiting];
  const bookkeepingChanged =
    !sameIds(notifiedArr, list.notified ?? []) || !sameIds(outArr, list.out ?? []) || !sameIds(waitingArr, list.waiting ?? []);
  if (next === list && !bookkeepingChanged) return { squad, changed: false, notices };
  const { notified: _n, out: _o, waiting: _w, ...base } = next;
  const final: RegistrationList = {
    ...base,
    ...(list.manual ? { manual: true as const } : {}),
    ...(notifiedArr.length > 0 ? { notified: notifiedArr } : {}),
    ...(outArr.length > 0 && list.manual ? { out: outArr } : {}),
    ...(waitingArr.length > 0 ? { waiting: waitingArr } : {}),
  };
  return { squad: withList(squad, info.slug, final), changed: true, notices };
}

/** A hand-edited list (route): `manual` on, the players taken off go to `out`, re-added ones leave it. */
export function manualList(squad: Squad, info: CompInfo, ids: string[], date: string): RegistrationList {
  const prev = squad.registrations?.[info.slug];
  const unique = [...new Set(ids)];
  const keep = new Set(unique);
  // Free players are always registered (the screen never sends them): leaving them out is not a removal.
  const freeIds = new Set(
    squad.players.filter((p) => isFree(p, info.rule, info.ctx.country, info.ctx.squadId, info.ctx)).map((p) => p.id),
  );
  const removed = (prev?.ids ?? []).filter((id) => !keep.has(id) && !freeIds.has(id));
  const out = [...new Set([...(prev?.out ?? []).filter((id) => !keep.has(id)), ...removed])];
  const roster = new Set(squad.players.map((p) => p.id));
  const notified = [...new Set([...(prev?.notified ?? []), ...outsiders(squad.players, unique, info).map((p) => p.id)])]
    .filter((id) => roster.has(id));
  const waiting = (prev?.waiting ?? []).filter((id) => roster.has(id) && !keep.has(id));
  return {
    season: info.season,
    ids: unique,
    updatedOn: date,
    sig: rosterSig(squad.players),
    manual: true,
    ...(waiting.length > 0 ? { waiting } : {}),
    ...(out.length > 0 ? { out } : {}),
    ...(notified.length > 0 ? { notified } : {}),
  };
}

/** Back to the automatic list (route "Automático"). */
export function automaticList(squad: Squad, info: CompInfo, date: string): RegistrationList {
  const fresh = autoList(squad, info, date);
  const notified = outsiders(squad.players, fresh.ids, info).map((p) => p.id);
  return { ...fresh, ...(notified.length > 0 ? { notified } : {}) };
}
