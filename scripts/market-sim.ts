#!/usr/bin/env bun
/**
 * Headless multi-season check of the living market (Etapa 25, `.claude/rules/game/transfer-windows.md`,
 * `docs/superpowers/specs/2026-10-05-living-market-design.md` §9). Mould of `contracts-sim.ts`: loads the
 * world from `src/Data/squads`, runs N seasons of the real daily AI market (`dailyMarketTick`, with the
 * transfer windows of every country unless `--no-windows`) and free-agent hiring, plus the AI managers:
 * league tables are synthetic (strength-based results on each league's real calendar), sackings follow
 * `weeklySackChance` / `rolloverSackChance`, vacancies hire through `chooseHire`.
 *
 * Usage: bun scripts/market-sim.ts [seasons=3] [--no-windows] [--no-market] [--seed N]
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";
import {
  aiClubFinance, applyAITransferSale, applyAITransferSpend, financialTierOf,
} from "@/Domain/aiFinance/aiClubFinance";
import { FINANCIAL_TIERS } from "@/Domain/aiFinance/aiFinanceConfig";
import { withContracts } from "@/Domain/contracts/contracts";
import { addDays, daysBetween } from "@/Domain/dates";
import { processContractExpiries } from "@/Domain/contracts/expiry";
import { freeAgentTick, refillSquad } from "@/Domain/contracts/freeAgents";
import {
  carryForwardWageFactor, clubAnnualRevenue, clubWageFactor, pullWageFactorToTarget, squadCurveBill,
} from "@/Domain/finance/wages";
import { dailyMarketTick, initMarketState } from "@/Domain/transfer/marketRotation";
import { mulberry32 } from "@/Domain/rng";
import { windowStatus, isDeadlineRush, type SeasonDates } from "@/Domain/market/windows";
import { LEAGUE_SCHEDULE_CONFIGS, leagueSeasonEnd, leagueSeasonStart } from "@/Domain/season/leagueScheduleConfig";
import { clubLevel } from "@/backend/continentalWorld";
import { objectiveFor } from "@/Domain/boardFans/boardFans";
import { buildInitialManagers } from "@/Domain/managers/managers";
import {
  aiManagerReputation, chooseHire, clubsSackedSince, finishPercentile, hireManager, managerInvariantBreaks,
  retireStale, rolloverSackChance, sackManager, vacancyHireOn, weeklySackChance, formPpg, type HireCandidate,
} from "@/Domain/managers/aiManagers";
import { clubPrestiges } from "@/Domain/jobs/jobs";
import { managerWeeklyWage } from "@/Domain/managers/managerContract";
import { liveRivals, rivalCandidates, rivalFloor, rollRival } from "@/Domain/negotiation/rivals";
import { playerOverallRating } from "@/Domain/transfer/transferNeeds";
import { Player } from "@/Domain/Player";
import type { FinancialTier, FreeAgent, LeagueZone, Squad } from "@/types/playerTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { RivalBid } from "@/types/transferMarketTypes";
import type { Pyramids } from "@/types/pyramidTypes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA = join(ROOT, "src", "Data");
const SQUADS_DIR = join(DATA, "squads");
const args = process.argv.slice(2);
const seasons = Number(args[0] && !args[0].startsWith("--") ? args[0] : 3);
const WINDOWS_ON = !args.includes("--no-windows");
/** Managers only (fast calibration of sackings / hirings / the free pool). */
const MARKET_ON = !args.includes("--no-market");
const seedArg = args.indexOf("--seed");
const SEED = seedArg >= 0 ? Number(args[seedArg + 1]) : 12345;
const START_YEAR = 2026;

const catalog = JSON.parse(readFileSync(join(DATA, "leagueData.json"), "utf8")) as { slug: string; country?: string; zones?: LeagueZone[] }[];
const pyramids = JSON.parse(readFileSync(join(DATA, "pyramids.json"), "utf8")) as Pyramids;
const countries = JSON.parse(readFileSync(join(DATA, "countries.json"), "utf8")) as Record<string, { continent?: string }>;
const countryOf = new Map(catalog.map((l) => [l.slug, l.country ?? ""] as const));
const zonesOf = new Map(catalog.map((l) => [l.slug, l.zones ?? []] as const));
const tierOfLeague = new Map<string, number>();
for (const p of Object.values(pyramids)) for (const lv of p.levels) for (const g of lv.groups) tierOfLeague.set(g.leagueSlug, lv.tier);
const topLeague = (country: string): string | null => {
  const p = pyramids[country];
  if (p?.levels.length) return p.levels.find((l) => l.tier === Math.min(...p.levels.map((x) => x.tier)))?.groups[0]?.leagueSlug ?? null;
  return catalog.find((l) => l.country === country)?.slug ?? null;
};
const scheduleOf = (slug: string) => LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === slug)
  ?? { slug, seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, matchDays: [6], baseWeekOffset: 0 };
const seasonOf = (slug: string, year: number): SeasonDates => {
  const cfg = scheduleOf(slug);
  return { start: leagueSeasonStart(cfg, year), end: leagueSeasonEnd(cfg, year) };
};

// ── World ─────────────────────────────────────────────────────────────────────
let squads: Squad[] = [];
for (const league of readdirSync(SQUADS_DIR)) {
  const files = readdirSync(join(SQUADS_DIR, league)).filter((f) => f.endsWith(".json"));
  const homeGames = Math.max(0, files.length - 1);
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(SQUADS_DIR, league, f), "utf8")) as Squad;
    const squad: Squad = { ...raw, leagueSlug: league };
    const basis = clubAnnualRevenue(squad, homeGames);
    squad.wageFactor = clubWageFactor(basis, squadCurveBill(squad.players));
    squad.wageRevenueBasis = basis;
    squads.push(withContracts(squad, `${START_YEAR + 1}-05-31`));
  }
}
const leagueClubs = new Map<string, string[]>();
for (const s of squads) leagueClubs.set(s.leagueSlug!, [...(leagueClubs.get(s.leagueSlug!) ?? []), s.id]);
console.log(`${squads.length} clubs, ${leagueClubs.size} leagues, ${seasons} seasons, windows=${WINDOWS_ON}, seed=${SEED}`);

const rng = mulberry32(SEED);
let market = initMarketState(squads, rng);
let pool: FreeAgent[] = [];

// Windows per country, cached per day.
const winCache = new Map<string, ReturnType<typeof windowStatus>>();
let winDate = "";
const statusOfLeague = (slug: string, date: string) => {
  if (winDate !== date) { winCache.clear(); winDate = date; }
  const country = countryOf.get(slug) ?? "";
  const key = country || slug;
  let st = winCache.get(key);
  if (!st) {
    const top = (country && topLeague(country)) || slug;
    st = windowStatus(seasonOf(top, parseInt(date.slice(0, 4), 10) - 1), date);
    winCache.set(key, st);
  }
  return st;
};

// ── Leagues (synthetic tables) ───────────────────────────────────────────────
interface Row { id: string; pts: number; mp: number; form: ("W" | "D" | "L")[] }
interface LeagueSeason { slug: string; dates: string[]; next: number; rows: Map<string, Row>; start: string; end: string; done: boolean }
let level = new Map<string, number>();
const recomputeLevels = () => {
  level = new Map(squads.map((s) => {
    let v = 3;
    try { v = clubLevel(s); } catch { /* no full XI */ }
    return [s.id, v] as const;
  }));
};
const leagueSeasons = new Map<string, LeagueSeason>();
const startLeagueSeason = (slug: string, year: number) => {
  const clubs = leagueClubs.get(slug) ?? [];
  const { start, end } = seasonOf(slug, year);
  const rounds = Math.max(1, 2 * (clubs.length - 1));
  const span = daysBetween(start, end);
  const dates = Array.from({ length: rounds }, (_, i) => addDays(start, Math.round((span * i) / Math.max(1, rounds - 1))));
  leagueSeasons.set(slug, {
    slug, dates, next: 0, start, end, done: false,
    rows: new Map(clubs.map((id) => [id, { id, pts: 0, mp: 0, form: [] }])),
  });
};
const table = (ls: LeagueSeason) => [...ls.rows.values()].sort((a, b) => b.pts - a.pts || (level.get(b.id) ?? 0) - (level.get(a.id) ?? 0));
const playRound = (ls: LeagueSeason) => {
  const ids = [...ls.rows.keys()];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
  for (let i = 0; i + 1 < ids.length; i += 2) {
    const a = ls.rows.get(ids[i]!)!;
    const b = ls.rows.get(ids[i + 1]!)!;
    const d = (level.get(a.id) ?? 3) - (level.get(b.id) ?? 3);
    const pA = 0.36 + 0.28 * Math.tanh(d / 0.6);
    const pB = 0.36 - 0.28 * Math.tanh(d / 0.6);
    const r = rng();
    const res: ["W" | "D" | "L", "W" | "D" | "L"] = r < pA ? ["W", "L"] : r < 1 - pB ? ["D", "D"] : ["L", "W"];
    for (const [row, x] of [[a, res[0]], [b, res[1]]] as const) {
      row.mp++;
      row.pts += x === "W" ? 3 : x === "D" ? 1 : 0;
      row.form = [...row.form, x].slice(-5);
    }
  }
};

// ── Managers ──────────────────────────────────────────────────────────────────
let managers: ManagerRecord[] = buildInitialManagers(squads, null, `${START_YEAR}-06-01`);
const vacancies = new Map<string, { since: string; hireOn: string }>();
const squadById = () => new Map(squads.map((s) => [s.id, s] as const));
const targets = new Map<string, number>();
const computeTargets = (slug: string) => {
  const clubs = (leagueClubs.get(slug) ?? []).map((id) => ({ squadId: id, level: level.get(id) ?? 3, tier: financialTierOf(squadById().get(id)!) }));
  for (const c of clubs) targets.set(c.squadId, objectiveFor({ squadId: c.squadId, clubs, zones: zonesOf.get(slug) ?? [], leagueSlug: slug, season: "" }).target);
};
let changes: { squadId: string; date: string; kind: "sack" | "rollover" }[] = [];
const hires: { kind: string }[] = [];
const sack = (squadId: string, date: string, kind: "sack" | "rollover") => {
  const sq = squadById().get(squadId);
  managers = sackManager(managers, { squadId, clubName: sq?.name ?? squadId, date });
  vacancies.set(squadId, { since: date, hireOn: vacancyHireOn(date, rng) });
  changes.push({ squadId, date, kind });
};
let prestige = new Map<string, number>();
const continentOf = (squadId: string) => countries[countryOf.get(squadById().get(squadId)?.leagueSlug ?? "") ?? ""]?.continent ?? null;
const hireDue = (date: string) => {
  let poached = false;
  for (const [squadId, v] of [...vacancies]) {
    if (v.hireOn > date) continue;
    const year = parseInt(date.slice(0, 4), 10);
    const sqLeague = squadById().get(squadId)?.leagueSlug ?? "";
    const country = countryOf.get(sqLeague) ?? null;
    const cand = (m: ManagerRecord): HireCandidate => {
      const lg = m.squadId ? squadById().get(m.squadId)?.leagueSlug ?? "" : "";
      const lastClub = m.clubs?.at(-1)?.squadId ?? "";
      const homeLeague = lg || squadById().get(lastClub)?.leagueSlug || "";
      return {
        managerId: m.id, reputation: aiManagerReputation(managers, m, year),
        country: countryOf.get(homeLeague) ?? null, continent: countries[countryOf.get(homeLeague) ?? ""]?.continent ?? null,
        ...(m.freeSince ? { freeDays: daysBetween(m.freeSince, date) } : {}),
        ...(m.squadId ? { clubPrestige: prestige.get(m.squadId) ?? 0.5 } : {}),
      };
    };
    const interim = managers.find((m) => m.squadId === squadId && m.interim);
    const row = leagueSeasons.get(sqLeague)?.rows.get(squadId);
    const pick = chooseHire({
      prestige: prestige.get(squadId) ?? 0.5, country, continent: continentOf(squadId),
      free: managers.filter((m) => !m.isPlayer && !m.squadId && !m.retired).map(cand),
      employed: managers.filter((m) => !m.isPlayer && m.squadId && !m.interim && m.squadId !== squadId).map(cand),
      interim: interim ? { ...cand(interim), interimPpg: row && row.mp > 0 ? row.pts / row.mp : 0 } : null,
      allowPoach: !poached, rng,
    });
    vacancies.delete(squadId);
    if (!pick) continue;
    hires.push({ kind: pick.kind });
    const h = hireManager(managers, { squadId, managerId: pick.managerId, date });
    managers = h.managers;
    if (h.vacated) {
      poached = true;
      const sq = squadById().get(h.vacated);
      managers = sackManager(managers, { squadId: h.vacated, clubName: sq?.name ?? h.vacated, date, left: "moved" });
      vacancies.set(h.vacated, { since: date, hireOn: vacancyHireOn(date, rng) });
      changes.push({ squadId: h.vacated, date, kind: "sack" });
    }
  }
};

// ── Metrics ───────────────────────────────────────────────────────────────────
type Counts = Record<FinancialTier, { open: number; tight: number; frozen: number }>;
const empty = (): Counts => Object.fromEntries(FINANCIAL_TIERS.map((t) => [t, { open: 0, tight: 0, frozen: 0 }])) as Counts;
const sample = (into: Counts) => { for (const s of squads) { const f = aiClubFinance(s); into[f.tier][f.hiring]++; } };
const report = (label: string, c: Counts) => {
  console.log(`  ${label}`);
  for (const t of FINANCIAL_TIERS) {
    const { open, tight, frozen } = c[t];
    const n = open + tight + frozen || 1;
    const pct = (v: number) => `${((100 * v) / n).toFixed(1).padStart(5)}%`;
    console.log(`    ${t.padEnd(6)} open ${pct(open)}  tight ${pct(tight)}  frozen ${pct(frozen)}`);
  }
};

recomputeLevels();
prestige = clubPrestiges(squads.map((s) => ({ squadId: s.id, level: level.get(s.id) ?? 3, tier: financialTierOf(s) })));
for (const slug of leagueClubs.keys()) computeTargets(slug);
const total = empty();
let rivalTalks = 0, rivalWith = 0, rivalLost = 0;
const tierOne = new Set([...leagueClubs.keys()].filter((l) => (tierOfLeague.get(l) ?? 1) === 1).flatMap((l) => leagueClubs.get(l) ?? []));

for (let season = 0; season < seasons; season++) {
  const year = START_YEAR + season;
  for (const slug of leagueClubs.keys()) {
    const cfg = scheduleOf(slug);
    // Cross-year leagues start this year; calendar-year leagues start next February.
    startLeagueSeason(slug, cfg.crossYear ? year : year + 1);
  }
  changes = [];
  const seasonCounts = empty();
  let signings = 0, outside = 0, pre = 0, mid = 0, freeSigned = 0;
  let date = `${year}-06-01`;
  const end = `${year + 1}-05-31`;
  let day = 0;
  while (date < end) {
    const byId = new Map(squads.map((s, i) => [s.id, i] as const));
    const isMonday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
    const { updatedMarket, completedTransfers } = !MARKET_ON ? { updatedMarket: market, completedTransfers: [] } : dailyMarketTick(market, squads, date, rng, WINDOWS_ON ? {
      windows: {
        isOpen: (sq) => statusOfLeague(sq.leagueSlug ?? "", date).open,
        closesOn: (sq) => statusOfLeague(sq.leagueSlug ?? "", date).until,
        rush: (sq) => isDeadlineRush(statusOfLeague(sq.leagueSlug ?? "", date), date),
      },
    } : undefined);
    market = updatedMarket;
    for (const tx of completedTransfers) {
      const st = statusOfLeague(tx.buyerSquad.leagueSlug ?? "", date);
      if (!st.open) outside++;
      else if (st.current?.kind === "pre") pre++;
      else mid++;
      squads[byId.get(tx.buyerSquad.id)!] = applyAITransferSpend(tx.updatedBuyer, tx.fee);
      squads[byId.get(tx.sellerSquad.id)!] = applyAITransferSale(tx.updatedSeller, tx.fee);
      signings++;
    }
    const fa = MARKET_ON ? freeAgentTick({ squads, pool, date, rng, seasonEndOf: () => end }) : { signedIds: new Set<string>(), squads };
    if (fa.signedIds.size > 0) {
      squads = fa.squads;
      pool = pool.filter((f) => !fa.signedIds.has(f.player.id));
      freeSigned += fa.signedIds.size;
    }

    // Rival probe (once a week, open windows): a mock human club bids for 10 random AI players.
    if (isMonday && WINDOWS_ON && MARKET_ON) {
      const sqMap = squadById();
      for (let k = 0; k < 10; k++) {
        const seller = squads[Math.floor(rng() * squads.length)]!;
        if (!statusOfLeague(seller.leagueSlug ?? "", date).open) continue;
        const player = seller.players[Math.floor(rng() * seller.players.length)];
        if (!player || player.loan) continue;
        rivalTalks++;
        let rivals: RivalBid[] = [];
        // A conversation lives ~3 days: one roll per day.
        for (let d = 0; d < 3; d++) {
          const dDate = addDays(date, d);
          const cands = rivalCandidates({
            player, sellerId: seller.id, humanId: "", profiles: market.profiles, squadOf: (id) => sqMap.get(id),
            windowOpen: (sq) => statusOfLeague(sq.leagueSlug ?? "", dDate).open,
          });
          const r = rollRival({ player, seller, candidates: cands, existing: rivals, date: dDate, rng });
          if (r) rivals = [...rivals, r];
        }
        if (rivals.length > 0) rivalWith++;
        // The mock human pays up to 1,1 × the value: lost when the floor is above it.
        const floor = rivalFloor(liveRivals(rivals, player.id, date));
        if (floor > new Player(playerOverallRating(player), player.age).price * 1.1) rivalLost++;
      }
    }

    // Leagues: today's rounds, Monday sacking review, end of season.
    const sackedThisSeason = isMonday ? clubsSackedSince(managers, `${year}-06-01`) : new Set<string>();
    for (const ls of leagueSeasons.values()) {
      while (ls.next < ls.dates.length && ls.dates[ls.next]! <= date) { playRound(ls); ls.next++; }
      if (isMonday && !ls.done && ls.next > 0) {
        const t = table(ls);
        t.forEach((row, i) => {
          const m = managers.find((x) => x.squadId === row.id);
          if (!m || vacancies.has(row.id)) return;
          const sq = squadById().get(row.id);
          const p = weeklySackChance({
            position: i + 1, target: targets.get(row.id) ?? Math.ceil(t.length / 2), size: t.length,
            form: formPpg(row.form), tier: sq ? financialTierOf(sq) : "MEDIUM",
            ...(m.hiredOn ? { daysInCharge: daysBetween(m.hiredOn, date) } : {}),
            progress: ls.next / ls.dates.length, roundsLeft: ls.dates.length - ls.next,
            sackedThisSeason: sackedThisSeason.has(row.id), ...(m.interim ? { interim: true } : {}),
          });
          if (p > 0 && rng() < p) sack(row.id, date, "sack");
        });
      }
      if (!ls.done && ls.next >= ls.dates.length && date >= ls.end) {
        ls.done = true;
        const t = table(ls);
        const rel = (zonesOf.get(ls.slug) ?? []).find((z) => z.id === "rel")?.fromEnd ?? 0;
        t.forEach((row, i) => {
          const m = managers.find((x) => x.squadId === row.id);
          if (m) {
            managers = managers.map((x) => x.id === m.id ? { ...x, lastFinish: finishPercentile(i + 1, t.length), seasons: x.seasons + 1 } : x);
            const p = rolloverSackChance({
              position: i + 1, target: targets.get(row.id) ?? Math.ceil(t.length / 2), size: t.length,
              relegated: rel > 0 && i >= t.length - rel, champion: i === 0, ...(m.interim ? { interim: true } : {}),
            });
            if (p > 0 && !vacancies.has(row.id) && rng() < p) sack(row.id, date, "rollover");
          }
        });
      }
    }
    hireDue(date);
    if (day % 30 === 0) { sample(seasonCounts); sample(total); }
    date = addDays(date, 1);
    day++;
  }

  // Season end (as contracts-sim): ages, factor pull, expiries, refill, fresh budgets.
  squads = squads.map((s) => {
    let next: Squad = { ...s, players: s.players.map((p) => ({ ...p, age: p.age + 1 })).filter((p) => p.age <= 38) };
    if (typeof next.wageFactor === "number" && typeof next.wageRevenueBasis === "number") {
      const carried = carryForwardWageFactor(next.wageFactor, next.wageRevenueBasis, next.wageRevenueBasis);
      next = { ...next, wageFactor: pullWageFactorToTarget(carried, clubWageFactor(next.wageRevenueBasis, squadCurveBill(next.players))) };
    }
    const res = processContractExpiries({ squad: next, date: end, nextSeasonEnd: `${year + 2}-05-31`, isHuman: false });
    pool.push(...res.released.map((p) => ({ player: { ...p, squadId: "", contract: undefined }, since: end })));
    const { aiTransferBudget: _drop, ...fresh } = res.squad;
    void _drop;
    return fresh as Squad;
  });
  squads = squads.map((s) => {
    const r = refillSquad({ squad: s, pool, nextSeasonEnd: `${year + 2}-05-31`, isHuman: false, tagPrefix: `s${year}` });
    if (r.signed.length > 0) { const ids = new Set(r.signed.map((p) => p.id)); pool = pool.filter((f) => !ids.has(f.player.id)); }
    return r.squad;
  });
  pool = pool.filter((f) => f.since > `${year}-01-01`);
  managers = retireStale(managers, end);
  recomputeLevels();
  prestige = clubPrestiges(squads.map((s) => ({ squadId: s.id, level: level.get(s.id) ?? 3, tier: financialTierOf(s) })));
  for (const slug of leagueClubs.keys()) computeTargets(slug);

  const changed = new Set(changes.map((c) => c.squadId));
  const t1 = [...changed].filter((id) => tierOne.has(id)).length;
  const t2 = changed.size - t1;
  const avgSquad = squads.reduce((n, s) => n + s.players.length, 0) / squads.length;
  const freePool = managers.filter((m) => !m.isPlayer && !m.squadId && !m.retired).length;
  const breaks = managerInvariantBreaks(managers, squads.map((s) => s.id));
  console.log(`\nseason ${year}/${String(year + 1).slice(2)}: ${signings} AI×AI fee transfers (pre ${pre}, mid ${mid}, outside the buyer's window ${outside}; ` +
    `pre ${(100 * pre / Math.max(1, pre + mid)).toFixed(0)}% / mid ${(100 * mid / Math.max(1, pre + mid)).toFixed(0)}%), ${freeSigned} free signings, avg squad ${avgSquad.toFixed(1)}`);
  console.log(`  manager changes: tier 1 ${t1}/${tierOne.size} (${(100 * t1 / tierOne.size).toFixed(1)}%), tier 2+ ${t2}/${squads.length - tierOne.size} (${(100 * t2 / (squads.length - tierOne.size)).toFixed(1)}%); ` +
    `in-season ${changes.filter((c) => c.kind === "sack").length}, rollover ${changes.filter((c) => c.kind === "rollover").length}; ` +
    `free pool ${freePool} (${(freePool / squads.length).toFixed(3)} × clubs); invariant breaks ${breaks.missing.length + breaks.doubled.length}`);
  report("hiring state, sampled monthly", seasonCounts);
}

// Tenure: closed spells of AI managers, in seasons.
const spells = managers.flatMap((m) => (m.isPlayer ? [] : (m.clubs ?? []).filter((c) => c.to && !m.interim).map((c) => daysBetween(c.from, c.to!) / 365)));
const open = managers.filter((m) => !m.isPlayer && m.squadId && !m.interim).map((m) => daysBetween(m.clubs?.at(-1)?.from ?? `${START_YEAR}-06-01`, `${START_YEAR + seasons}-05-31`) / 365);
const all = [...spells, ...open].sort((a, b) => a - b);
console.log("\nall seasons:");
report("hiring state, sampled monthly", total);
console.log(`  median AI manager tenure (closed + running spells): ${(all[Math.floor(all.length / 2)] ?? 0).toFixed(2)} seasons (${spells.length} closed spells)`);
console.log(`  hires: ${["free", "poach", "interim"].map((k) => `${k} ${hires.filter((h) => h.kind === k).length}`).join(", ")}`);
const wageShare = (squads.reduce((s, sq) => s + (managerWeeklyWage(sq.wageRevenueBasis ?? 0, 40) * 52) / Math.max(1, sq.wageRevenueBasis ?? 1), 0) / squads.length);
console.log(`  manager wage / revenue at reputation 40: ${(100 * wageShare).toFixed(2)}%`);
if (WINDOWS_ON) console.log(`  rival probe: ${rivalTalks} talks, rival in ${(100 * rivalWith / Math.max(1, rivalTalks)).toFixed(1)}%, floor above 1,1 × value in ${(100 * rivalLost / Math.max(1, rivalTalks)).toFixed(1)}%`);
