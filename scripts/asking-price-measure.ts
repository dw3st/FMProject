#!/usr/bin/env bun
/**
 * Asking price on the human's sell list (#88, `.claude/rules/game/negotiation.md`): how many AI
 * bids a listed player draws in 60 days of open window at 100%, 80% and 120% of his value.
 * Loads the world from `src/Data/squads` (wage factor and contracts as `createSave` sets them), takes
 * a Premier League club as the human one and lists one ordinary player of each line (rating near
 * the squad average). Every day 10 random AI clubs refresh their needs (as `dailyMarketTick`) and
 * `generateBidsForHuman` runs; mode `ignore` leaves the bids pending until they expire, mode
 * `refuse` answers every bid the same day (pending stays empty). Averaged over seeds.
 *
 * Usage: [ASKING_OVERRIDES=json] bun scripts/asking-price-measure.ts [seeds=30] [days=60]
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";
import { withContracts } from "@/Domain/contracts/contracts";
import { addDays } from "@/Domain/dates";
import { clubAnnualRevenue, clubWageFactor, squadCurveBill } from "@/Domain/finance/wages";
import { generateTransferNeeds, playerOverallRating, teamAvgRating } from "@/Domain/transfer/transferNeeds";
import { generateBidsForHuman } from "@/Domain/negotiation/bids";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { mulberry32 } from "@/Domain/rng";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { getMainRole } from "@/Domain/roles";
import type { Squad } from "@/types/playerTypes";
import type { MarketBid, SquadMarketProfile } from "@/types/transferMarketTypes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SQUADS_DIR = join(ROOT, "src", "Data", "squads");
const SEEDS = Number(process.argv[2] ?? 30);
const DAYS = Number(process.argv[3] ?? 60);
const START = "2027-06-10";
// ASKING_OVERRIDES='{"BAND_MAX_EXTRA":0}' tries other constants in memory.
if (process.env.ASKING_OVERRIDES) Object.assign(NEGOTIATION.ASKING, JSON.parse(process.env.ASKING_OVERRIDES));

const squads: Squad[] = [];
for (const league of readdirSync(SQUADS_DIR)) {
  const files = readdirSync(join(SQUADS_DIR, league)).filter((f) => f.endsWith(".json"));
  const homeGames = Math.max(0, files.length - 1);
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(SQUADS_DIR, league, f), "utf8")) as Squad;
    const squad: Squad = { ...raw, leagueSlug: league };
    const basis = clubAnnualRevenue(squad, homeGames);
    squad.wageFactor = clubWageFactor(basis, squadCurveBill(squad.players));
    squad.wageRevenueBasis = basis;
    squads.push(withContracts(squad, "2028-05-31"));
  }
}
const human = squads.find((s) => s.leagueSlug === "premier_league" && s.name.includes("Brighton"))
  ?? squads.find((s) => s.leagueSlug === "premier_league")!;
const ai = squads.filter((s) => s.id !== human.id);
const byId = new Map(ai.map((s) => [s.id, s] as const));
const avg = teamAvgRating(human);
const targets = (["Defender", "Midfielder", "Forward"] as const).map((line) =>
  human.players
    .filter((p) => !p.loan && getMainRole(p.positions[0] ?? "") === line)
    .sort((a, b) => Math.abs(playerOverallRating(a) - avg) - Math.abs(playerOverallRating(b) - avg))[0]!);

console.log(`${squads.length} clubs; human ${human.name} (avg ${avg.toFixed(2)}); ${SEEDS} seeds × ${DAYS} days`);

function run(playerId: string, ratio: number, seed: number, mode: "ignore" | "refuse") {
  const rng = mulberry32(seed);
  const profiles: Record<string, SquadMarketProfile> = {};
  for (const s of ai) profiles[s.id] = generateTransferNeeds(s, START, rng);
  const player = human.players.find((p) => p.id === playerId)!;
  const value = playerMarketValue(player);
  const askingPrice = ratio === 1 ? undefined : Math.round(value * ratio);
  let pending: MarketBid[] = [];
  let n = 0;
  let feeSum = 0;
  let firstDay = -1;
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(START, d);
    for (let k = 0; k < 10; k++) {
      const s = ai[Math.floor(rng() * ai.length)]!;
      profiles[s.id] = generateTransferNeeds(s, date, rng);
    }
    pending = pending.filter((b) => b.expires >= date);
    let seq = 0;
    const bids = generateBidsForHuman({
      date, rng, humanSquad: human, squads: byId, profiles,
      sellList: [{ playerId, priority: 1, ...(askingPrice !== undefined ? { askingPrice } : {}) }],
      loanList: [], pending, seasonEndOf: () => "2028-05-31", newId: () => `${date}-${++seq}`,
    }).filter((b) => b.kind === "transfer" && b.playerId === playerId);
    for (const b of bids) { n++; feeSum += b.fee / value; if (firstDay < 0) firstDay = d; }
    if (mode === "ignore") pending = [...pending, ...bids];
  }
  return { n, feeSum, firstDay };
}

for (const mode of ["ignore", "refuse"] as const) {
  console.log(`\nmode ${mode} (bids ${mode === "ignore" ? "left pending until they expire" : "refused the same day"})`);
  console.log("player                          r     bids/60d  fee/value  first bid (day)");
  for (const p of targets) {
    for (const ratio of [1, 0.8, 1.2]) {
      let n = 0, fee = 0, first = 0, firstN = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = run(p.id, ratio, seed * 7919, mode);
        n += r.n; fee += r.feeSum;
        if (r.firstDay >= 0) { first += r.firstDay; firstN++; }
      }
      const label = `${p.name} (${p.positions[0]}, ${playerOverallRating(p).toFixed(2)})`.slice(0, 30).padEnd(30);
      console.log(`${label}  ${ratio.toFixed(1)}   ${(n / SEEDS).toFixed(2).padStart(7)}   ${(n ? fee / n : 0).toFixed(3).padStart(8)}   ${(firstN ? first / firstN : NaN).toFixed(1).padStart(6)}`);
    }
  }
}
