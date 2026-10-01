#!/usr/bin/env bun
/**
 * Headless multi-season check of the AI wage economy with contracts (issue #23,
 * `docs/superpowers/specs/2026-09-30-contracts-design.md` §4). Loads the world from
 * `src/Data/squads`, gives every club the same wage factor/basis and contracts `createSave` would,
 * then runs N seasons of the real daily transfer market (`dailyMarketTick`) and, at every season
 * end, the rollover bits that matter for wages: players age a year, the wage factor is pulled back
 * to its target (`pullWageFactorToTarget`), expiring contracts are renewed or released
 * (`processContractExpiries`) and the transfer budget is re-granted. Prints, per financial tier,
 * the share of club-samples that are open / tight / frozen and the signings per season.
 *
 * Usage: bun scripts/contracts-sim.ts [seasons=3] [--no-pull]
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";
import { aiClubFinance, financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { FINANCIAL_TIERS } from "@/Domain/aiFinance/aiFinanceConfig";
import { withContracts, addDaysIso } from "@/Domain/contracts/contracts";
import { processContractExpiries } from "@/Domain/contracts/expiry";
import {
  carryForwardWageFactor, clubAnnualRevenue, clubWageFactor, pullWageFactorToTarget, squadCurveBill,
} from "@/Domain/finance/wages";
import { dailyMarketTick, initMarketState } from "@/Domain/transfer/marketRotation";
import { applyAITransferSale, applyAITransferSpend } from "@/Domain/aiFinance/aiClubFinance";
import { mulberry32 } from "@/Domain/rng";
import type { FinancialTier, Squad } from "@/types/playerTypes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SQUADS_DIR = join(ROOT, "src", "Data", "squads");
const seasons = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 3);
const PULL = !process.argv.includes("--no-pull");
const START_YEAR = 2026;

// ── Load the world the way createSave sets it up ──────────────────────────────
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
console.log(`${squads.length} clubs, ${squads.reduce((n, s) => n + s.players.length, 0)} players, ${seasons} seasons, pull=${PULL}`);

const rng = mulberry32(12345);
let market = initMarketState(squads, rng);

type Counts = Record<FinancialTier, { open: number; tight: number; frozen: number }>;
const empty = (): Counts => Object.fromEntries(
  FINANCIAL_TIERS.map((t) => [t, { open: 0, tight: 0, frozen: 0 }]),
) as Counts;

function sample(into: Counts): void {
  for (const s of squads) {
    const f = aiClubFinance(s);
    into[f.tier][f.hiring]++;
  }
}

function report(label: string, c: Counts): void {
  console.log(`  ${label}`);
  for (const t of FINANCIAL_TIERS) {
    const { open, tight, frozen } = c[t];
    const n = open + tight + frozen || 1;
    const pct = (v: number) => `${((100 * v) / n).toFixed(1).padStart(5)}%`;
    console.log(`    ${t.padEnd(6)} open ${pct(open)}  tight ${pct(tight)}  frozen ${pct(frozen)}  (n=${n})`);
  }
}

console.log("start of world:");
const startCounts = empty();
sample(startCounts);
report("hiring state", startCounts);

const total = empty();
for (let season = 0; season < seasons; season++) {
  const year = START_YEAR + season;
  const seasonCounts = empty();
  let signings = 0;
  const signingsByTier: Record<FinancialTier, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, ELITE: 0 };
  let date = `${year}-06-01`;
  const end = `${year + 1}-05-31`;
  let day = 0;
  while (date < end) {
    const byId = new Map(squads.map((s, i) => [s.id, i] as const));
    const { updatedMarket, completedTransfers } = dailyMarketTick(market, squads, date, rng);
    market = updatedMarket;
    for (const tx of completedTransfers) {
      const bi = byId.get(tx.buyerSquad.id)!;
      const si = byId.get(tx.sellerSquad.id)!;
      squads[bi] = applyAITransferSpend(tx.updatedBuyer, tx.fee);
      squads[si] = applyAITransferSale(tx.updatedSeller, tx.fee);
      signings++;
      signingsByTier[financialTierOf(tx.buyerSquad)]++;
    }
    if (day % 30 === 0) { sample(seasonCounts); sample(total); }
    date = addDaysIso(date, 1);
    day++;
  }

  // Season end: age, factor pull, contract expiry, fresh transfer budget.
  let released = 0;
  let renewed = 0;
  squads = squads.map((s) => {
    let next: Squad = { ...s, players: s.players.map((p) => ({ ...p, age: p.age + 1 })).filter((p) => p.age <= 38) };
    if (typeof next.wageFactor === "number" && typeof next.wageRevenueBasis === "number") {
      const carried = carryForwardWageFactor(next.wageFactor, next.wageRevenueBasis, next.wageRevenueBasis);
      const target = clubWageFactor(next.wageRevenueBasis, squadCurveBill(next.players));
      next = { ...next, wageFactor: PULL ? pullWageFactorToTarget(carried, target) : carried };
    }
    const res = processContractExpiries({ squad: next, date: end, nextSeasonEnd: `${year + 2}-05-31`, isHuman: false });
    released += res.released.length;
    renewed += res.renewed.length;
    const { aiTransferBudget: _drop, ...fresh } = res.squad;
    void _drop;
    return fresh as Squad;
  });

  const avgSquad = squads.reduce((n, s) => n + s.players.length, 0) / squads.length;
  console.log(`\nseason ${year}/${String(year + 1).slice(2)}: ${signings} signings (${FINANCIAL_TIERS.map((t) => `${t} ${signingsByTier[t]}`).join(", ")}), ` +
    `${renewed} renewed, ${released} released, avg squad ${avgSquad.toFixed(1)}`);
  report("hiring state, sampled monthly", seasonCounts);
}

console.log("\nall seasons:");
report("hiring state, sampled monthly", total);
