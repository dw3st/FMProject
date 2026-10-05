import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { LeagueDataEntry } from "@/backend/advanceDay";
import type { Pyramids } from "@/types/pyramidTypes";
import type { CountryWeight, ManagerRecord, ManagerTitle } from "@/types/managerTypes";
import { clubLevel, topLeagueOf } from "@/backend/continentalWorld";
import { MANAGERS } from "@/Domain/managers/managerConfig";
import { addSeason, awardTitle, countryWeight } from "@/Domain/managers/managers";
import { logError } from "@/Logger";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { clubPrestiges } from "@/Domain/jobs/jobs";
import { objectiveFor } from "@/Domain/boardFans/boardFans";
import { seasonLabel } from "@/Domain/history/history";
import { daysBetween } from "@/Domain/dates";
import { mulberry32, seedFrom } from "@/Domain/rng";
import {
  aiManagerReputation, chooseHire, clubsSackedSince, finishPercentile, formPpg, hireManager, retireStale,
  rolloverSackChance, sackManager, vacancyHireOn, weeklySackChance, type HireCandidate,
} from "@/Domain/managers/aiManagers";
import { AI_MANAGERS } from "@/Domain/managers/aiManagersConfig";
import type { LeagueSeasonState } from "@/types/calendarTypes";
import type { Squad, StandingRow } from "@/types/playerTypes";
import type { ManagerNewsInboxMessage } from "@/types/inboxTypes";

/**
 * Manager-ranking I/O for one advance-day (`.claude/rules/game/managers.md`): the ranking file is
 * read once on first use, titles/seasons are applied in memory and `flush` writes it back (into the
 * day's buffered DAL). Country weights are computed once per country per season and cached in the
 * save meta (`meta.managerWeights`, written by the caller from `weights()` when `weightsChanged()`).
 */
export function createManagerTracker(args: {
  service: SaveService;
  saveId: string;
  getIndex: () => SquadIndex;
  catalog: () => Promise<LeagueDataEntry[]>;
  pyramids: () => Promise<Pyramids>;
  /** Weights already computed this save (`meta.managerWeights`). */
  weights?: Record<string, CountryWeight>;
}) {
  const { service, saveId } = args;
  let managers: ManagerRecord[] | null = null;
  let changed = false;
  const levels = new Map<string, number | null>();
  let big5: number | null | undefined;
  let weights: Record<string, CountryWeight> = args.weights ?? {};
  let weightsChanged = false;

  const load = async (): Promise<ManagerRecord[]> => (managers ??= await service.getManagers(saveId));

  /** Average `clubLevel` of the country's tier-1 clubs, null when it has none. */
  const countryLevel = async (country: string): Promise<number | null> => {
    if (levels.has(country)) return levels.get(country)!;
    const top = topLeagueOf(country, await args.catalog(), await args.pyramids());
    const lv: number[] = [];
    for (const t of top ? args.getIndex().inLeague(top) : []) {
      const squad = await service.getSquadById(saveId, t.squadId);
      if (!squad) continue;
      try { lv.push(clubLevel(squad)); } catch { /* squad without a full XI: skipped */ }
    }
    const v = lv.length > 0 ? lv.reduce((a, b) => a + b, 0) / lv.length : null;
    levels.set(country, v);
    return v;
  };

  return {
    countryOfLeague: async (slug: string): Promise<string | null> =>
      (await args.catalog()).find((l) => l.slug === slug)?.country ?? null,

    /**
     * Tier-1 level of the country ÷ the big-5 average, clamped (`countryWeight`). Computed once per
     * country per season label, then served from the cache.
     */
    async weightOf(country: string | null, season: string): Promise<number> {
      if (!country) return MANAGERS.WEIGHT_MIN;
      const cached = weights[country];
      if (cached && cached.season === season) return cached.weight;
      if (big5 === undefined) {
        const vs: number[] = [];
        for (const c of MANAGERS.BIG5) {
          const v = await countryLevel(c);
          if (v !== null) vs.push(v);
        }
        big5 = vs.length > 0 ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      }
      const weight = countryWeight((await countryLevel(country)) ?? 0, big5 ?? 0);
      weights = { ...weights, [country]: { season, weight } };
      weightsChanged = true;
      return weight;
    },

    weights: () => weights,
    weightsChanged: () => weightsChanged,

    async credit(title: ManagerTitle): Promise<void> {
      const cur = await load();
      const next = awardTitle(cur, title);
      if (next !== cur) { managers = next; changed = true; }
      else if (!cur.some((m) => m.squadId === title.squadId)) {
        logError("managers", `save ${saveId}: no manager for club ${title.squadId}`, { title });
      }
    },

    async countSeason(squadId: string, season: string): Promise<void> {
      const cur = await load();
      const next = addSeason(cur, squadId, season);
      if (next !== cur) { managers = next; changed = true; }
    },

    /** Today's ranking (titles credited so far included). */
    list: (): Promise<ManagerRecord[]> => load(),

    /** Applies a change to the whole file (the human manager changing club, `.claude/rules/game/jobs.md`). */
    async apply(fn: (m: ManagerRecord[]) => ManagerRecord[]): Promise<void> {
      const cur = await load();
      const next = fn(cur);
      if (next !== cur) { managers = next; changed = true; }
    },

    async flush(): Promise<void> {
      if (changed && managers) await service.writeManagers(saveId, managers);
    },
  };
}

// ── AI managers: Monday review, rollover sackings, vacancies and hirings (Etapa 25) ─────────────

/** Prestige of every club (world strength percentile + tier), cached per save per month (it reads the whole world). */
const prestigeCache = new Map<string, { key: string; map: Map<string, number> }>();

export async function worldPrestige(
  service: SaveService, saveId: string, date: string, index: SquadIndex,
): Promise<Map<string, number>> {
  const key = date.slice(0, 7);
  const hit = prestigeCache.get(saveId);
  if (hit && hit.key === key) return hit.map;
  const input: { squadId: string; level: number; tier: ReturnType<typeof financialTierOf> }[] = [];
  for (const squad of await service.getAllSquads(saveId)) {
    if (!index.byId(squad.id)) continue;
    let level = 0;
    try { level = clubLevel(squad); } catch { /* no full XI: bottom */ }
    input.push({ squadId: squad.id, level, tier: financialTierOf(squad) });
  }
  const map = clubPrestiges(input);
  prestigeCache.set(saveId, { key, map });
  return map;
}

export type ManagerNewsItem = ManagerNewsInboxMessage["items"][number];

/**
 * The day's AI-manager desk (`.claude/rules/game/managers.md` → "Técnicos da IA"): it works on the
 * day's manager tracker (one write) and on a copy of `meta.managerVacancies` (the caller writes it
 * back with the meta patch when `vacanciesChanged()`).
 */
export function createAiManagerDesk(args: {
  service: SaveService;
  saveId: string;
  date: string;
  tracker: ReturnType<typeof createManagerTracker>;
  getIndex: () => SquadIndex;
  catalog: () => Promise<LeagueDataEntry[]>;
  countries: () => Promise<Record<string, { continent?: string }>>;
  vacancies?: Record<string, { since: string; hireOn: string }>;
  /** The human club (never reviewed, never vacant). */
  humanClubId: string | null;
  /** The player's league: its sackings/hirings become inbox news. */
  playerLeague: string | null;
}) {
  const { service, saveId, date, tracker } = args;
  let vacancies = { ...(args.vacancies ?? {}) };
  let changed = false;
  const news: ManagerNewsItem[] = [];
  const nameOf = (squadId: string) => args.getIndex().byId(squadId)?.name ?? squadId;
  const inPlayerLeague = (squadId: string) => !!args.playerLeague && args.getIndex().byId(squadId)?.leagueSlug === args.playerLeague;
  const rngFor = (squadId: string, tag: string) => mulberry32(seedFrom(`${saveId}:${squadId}:${date}:${tag}`));

  /** Objective targets of a league's clubs for `season`, cached on their managers. */
  const targetsOf = async (slug: string, season: string): Promise<Map<string, number>> => {
    const ms = await tracker.list();
    const teams = args.getIndex().inLeague(slug);
    const out = new Map<string, number>();
    let missing = false;
    for (const t of teams) {
      const m = ms.find((x) => x.squadId === t.squadId && !x.isPlayer);
      if (m?.target?.season === season) out.set(t.squadId, m.target.target);
      else missing = true;
    }
    if (!missing) return out;
    const squads = (await Promise.all(teams.map((t) => service.getSquadById(saveId, t.squadId)))).filter((s): s is Squad => !!s);
    const clubs = squads.map((s) => {
      let level = 0;
      try { level = clubLevel(s); } catch { /* bottom */ }
      return { squadId: s.id, level, tier: financialTierOf(s) };
    });
    const zones = (await args.catalog()).find((l) => l.slug === slug)?.zones ?? [];
    for (const c of clubs) out.set(c.squadId, objectiveFor({ squadId: c.squadId, clubs, zones, leagueSlug: slug, season }).target);
    await tracker.apply((list) => list.map((m) => (m.squadId && out.has(m.squadId) && !m.isPlayer ? { ...m, target: { season, target: out.get(m.squadId)! } } : m)));
    return out;
  };

  const openVacancy = (squadId: string, since = date) => {
    vacancies = { ...vacancies, [squadId]: { since, hireOn: vacancyHireOn(since, rngFor(squadId, "vacancy")) } };
    changed = true;
  };

  const sack = async (squadId: string, left: "sacked" | "moved" = "sacked") => {
    const before = (await tracker.list()).find((m) => !m.isPlayer && m.squadId === squadId);
    await tracker.apply((ms) => sackManager(ms, { squadId, clubName: nameOf(squadId), date, left }));
    openVacancy(squadId);
    if (before && inPlayerLeague(squadId)) news.push({ kind: "sacked", squadId, clubName: nameOf(squadId), managerName: before.name });
  };

  return {
    vacancies: () => vacancies,
    vacanciesChanged: () => changed,
    news: () => news,
    openVacancy,
    /** A vacancy that no longer applies (the human took the club). */
    closeVacancy(squadId: string) {
      if (vacancies[squadId]) {
        const rest = { ...vacancies };
        delete rest[squadId];
        vacancies = rest;
        changed = true;
      }
    },

    /** Monday: every AI club of a league past MIN_PROGRESS may sack its manager. */
    async mondayReview(activeLeagues: LeagueSeasonState[]): Promise<void> {
      const ms = await tracker.list();
      const sackedSet = new Set<string>();
      for (const state of activeLeagues) {
        if (state.totalRounds <= 0 || date < state.start || date > state.end) continue;
        const table = (await service.getLeagueStandings(saveId, state.leagueSlug)) ?? [];
        if (table.length === 0) continue;
        const played = Math.max(...table.map((r) => r.mp));
        const progress = played / state.totalRounds;
        if (progress < AI_MANAGERS.sack.MIN_PROGRESS) continue;
        const season = seasonLabel(state.year, state.start, state.end);
        const targets = await targetsOf(state.leagueSlug, season);
        const already = clubsSackedSince(ms, state.start);
        for (let i = 0; i < table.length; i++) {
          const row = table[i]!;
          if (row.squadId === args.humanClubId || vacancies[row.squadId] || sackedSet.has(row.squadId)) continue;
          const m = ms.find((x) => x.squadId === row.squadId);
          if (!m || m.isPlayer) continue;
          const input = {
            position: i + 1, target: targets.get(row.squadId) ?? Math.ceil(table.length / 2), size: table.length,
            form: formPpg(row.form),
            ...(m.hiredOn ? { daysInCharge: daysBetween(m.hiredOn, date) } : {}),
            progress, roundsLeft: state.totalRounds - row.mp,
            sackedThisSeason: already.has(row.squadId), ...(m.interim ? { interim: true } : {}),
          };
          // The tier (patience) needs the squad: read only for a club at risk.
          if (weeklySackChance({ ...input, tier: "MEDIUM" }) <= 0) continue;
          const squad = await service.getSquadById(saveId, row.squadId);
          const p = weeklySackChance({ ...input, tier: squad ? financialTierOf(squad) : "MEDIUM" });
          if (p > 0 && rngFor(row.squadId, "sack")() < p) {
            sackedSet.add(row.squadId);
            await sack(row.squadId);
          }
        }
      }
    },

    /** Country rollover of one league: last finish of every manager, sackings from the final table. */
    async rollover(slug: string, table: StandingRow[], season: string, tierChanges: Record<string, { from: number; to: number }>): Promise<void> {
      if (table.length === 0) return;
      const targets = await targetsOf(slug, season);
      const finish = new Map(table.map((r, i) => [r.squadId, finishPercentile(i + 1, table.length)] as const));
      await tracker.apply((ms) => ms.map((m) => (m.squadId && finish.has(m.squadId) ? { ...m, lastFinish: finish.get(m.squadId)! } : m)));
      const ms = await tracker.list();
      for (let i = 0; i < table.length; i++) {
        const row = table[i]!;
        if (row.squadId === args.humanClubId || vacancies[row.squadId] || row.mp === 0) continue;
        const m = ms.find((x) => x.squadId === row.squadId);
        if (!m || m.isPlayer) continue;
        const tc = tierChanges[row.squadId];
        const p = rolloverSackChance({
          position: i + 1, target: targets.get(row.squadId) ?? Math.ceil(table.length / 2), size: table.length,
          relegated: !!tc && tc.to > tc.from, promoted: !!tc && tc.to < tc.from, champion: i === 0,
          ...(m.interim ? { interim: true } : {}),
        });
        if (p > 0 && rngFor(row.squadId, "rollover")() < p) await sack(row.squadId);
      }
    },

    /** Vacancies due today hire (a free manager, sometimes a poached one, or the interim). */
    async hireDue(activeLeagues: LeagueSeasonState[]): Promise<void> {
      const due = Object.entries(vacancies).filter(([, v]) => v.hireOn <= date).map(([id]) => id).sort();
      if (due.length === 0) return;
      const index = args.getIndex();
      const prestige = await worldPrestige(service, saveId, date, index);
      const catalog = await args.catalog();
      const countries = await args.countries();
      const countryOfLeague = new Map(catalog.map((l) => [l.slug, l.country ?? null] as const));
      const year = parseInt(date.slice(0, 4), 10);
      let poached = false;
      for (const squadId of due) {
        const rest = { ...vacancies };
        delete rest[squadId];
        vacancies = rest;
        changed = true;
        if (squadId === args.humanClubId || !index.byId(squadId)) continue;
        const ms = await tracker.list();
        const homeOf = (club: string) => {
          const country = countryOfLeague.get(index.byId(club)?.leagueSlug ?? "") ?? null;
          return { country, continent: country ? countries[country]?.continent ?? null : null };
        };
        const cand = (m: ManagerRecord): HireCandidate => ({
          managerId: m.id, reputation: aiManagerReputation(ms, m, year), ...homeOf(m.squadId || m.clubs?.at(-1)?.squadId || ""),
          ...(m.freeSince ? { freeDays: daysBetween(m.freeSince, date) } : {}),
          ...(m.squadId ? { clubPrestige: prestige.get(m.squadId) ?? 0.5 } : {}),
        });
        const interim = ms.find((m) => m.squadId === squadId && m.interim);
        let interimPpg = 0;
        if (interim) {
          const league = index.byId(squadId)?.leagueSlug;
          const state = activeLeagues.find((l) => l.leagueSlug === league);
          const row = state ? ((await service.getLeagueStandings(saveId, state.leagueSlug)) ?? []).find((r) => r.squadId === squadId) : undefined;
          interimPpg = formPpg(row?.form) ?? 0;
        }
        const pick = chooseHire({
          prestige: prestige.get(squadId) ?? 0.5, ...homeOf(squadId),
          free: ms.filter((m) => !m.isPlayer && !m.squadId && !m.retired).map(cand),
          employed: ms.filter((m) => !m.isPlayer && !!m.squadId && !m.interim && m.squadId !== squadId && m.squadId !== args.humanClubId).map(cand),
          interim: interim ? { ...cand(interim), interimPpg } : null,
          allowPoach: !poached,
          rng: rngFor(squadId, "hire"),
        });
        if (!pick) continue;
        const hiredName = ms.find((m) => m.id === pick.managerId)?.name ?? "";
        let vacated: string | null = null;
        await tracker.apply((list) => {
          const h = hireManager(list, { squadId, managerId: pick.managerId, date });
          vacated = h.vacated;
          return h.managers;
        });
        if (inPlayerLeague(squadId)) news.push({ kind: "hired", squadId, clubName: nameOf(squadId), managerName: hiredName, ...(pick.kind === "interim" ? { interim: true } : {}) });
        if (vacated) {
          poached = true;
          const v: string = vacated;
          await tracker.apply((list) => sackManager(list, { squadId: v, clubName: nameOf(v), date, left: "moved" }));
          openVacancy(v);
          if (inPlayerLeague(v)) news.push({ kind: "sacked", squadId: v, clubName: nameOf(v), managerName: hiredName });
        }
      }
    },

    /** Long-free managers retire. */
    async retire(): Promise<void> {
      await tracker.apply((ms) => retireStale(ms, date));
    },
  };
}
