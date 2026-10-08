/**
 * Coaching-staff bill (Etapa 31a, `.claude/rules/game/staff.md` → "Custo da comissão").
 *
 * For every club of `src/Data/squads/**`: the staff bill of before 4.7 (assistant, fitness coach and
 * chief scout at the tier's implied rating, `staffWeeklyWage` × 3) and the new one (`initialStaff`:
 * every role, coaches up to the tier's limit, `squadStaffWages`), against the club's annual revenue
 * (`wageRevenueBasisOf`). Prints, per financial tier, the median of bill / revenue (annual, 52 weeks)
 * and of new / old. Acceptance (spec §4): median new bill ≤ 4% of revenue and new / old ≤ 1.8 in every tier.
 *
 *   bun scripts/staff-bill.ts
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { wageFactorOf, wageRevenueBasisOf } from "@/Domain/finance/wages";
import { initialStaff, squadStaffWages, staffWeeklyWage } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import type { Squad } from "@/types/playerTypes";

const SQUADS_DIR = join(import.meta.dir, "..", "src", "Data", "squads");
const TIERS = ["LOW", "MEDIUM", "HIGH", "ELITE"] as const;

const median = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};

const rows: Record<string, { oldShare: number[]; newShare: number[]; ratio: number[]; members: number[] }> = {};
for (const t of TIERS) rows[t] = { oldShare: [], newShare: [], ratio: [], members: [] };

for (const league of readdirSync(SQUADS_DIR)) {
  let files: string[];
  try {
    files = readdirSync(join(SQUADS_DIR, league)).filter((f) => f.endsWith(".json"));
  } catch {
    continue;
  }
  for (const f of files) {
    const squad = JSON.parse(readFileSync(join(SQUADS_DIR, league, f), "utf8")) as Squad;
    const tier = financialTierOf(squad);
    const factor = wageFactorOf(squad);
    const revenue = wageRevenueBasisOf(squad);
    if (!(revenue > 0)) continue;
    const oldBill = 3 * staffWeeklyWage(STAFF.IMPLIED_RATING[tier], factor);
    const staff = initialStaff(`bill:${squad.id}`, squad, { date: "2026-08-01", seasonEnd: "2027-05-31" });
    const newBill = squadStaffWages(staff);
    const r = rows[tier]!;
    r.oldShare.push((oldBill * 52) / revenue);
    r.newShare.push((newBill * 52) / revenue);
    r.ratio.push(newBill / oldBill);
    r.members.push(staff.members.length);
  }
}

const f2 = (x: number) => (x * 100).toFixed(2) + "%";
console.log("tier    clubs  members  old/revenue  new/revenue (median)  new p90  new/old (median)");
const all = { newShare: [] as number[], ratio: [] as number[] };
let ok = true;
for (const t of TIERS) {
  const r = rows[t]!;
  if (r.newShare.length === 0) continue;
  all.newShare.push(...r.newShare);
  all.ratio.push(...r.ratio);
  const m = median(r.newShare);
  const q = median(r.ratio);
  if (m > 0.04 || q > 1.8) ok = false;
  console.log(
    `${t.padEnd(7)} ${String(r.newShare.length).padStart(5)}  ${median(r.members).toFixed(0).padStart(7)}  ${f2(median(r.oldShare)).padStart(11)}  ${f2(m).padStart(20)}  ${f2(pct(r.newShare, 0.9)).padStart(7)}  ${q.toFixed(2).padStart(16)}`,
  );
}
console.log(`world   ${String(all.newShare.length).padStart(5)}  ${"".padStart(7)}  ${"".padStart(11)}  ${f2(median(all.newShare)).padStart(20)}  ${f2(pct(all.newShare, 0.9)).padStart(7)}  ${median(all.ratio).toFixed(2).padStart(16)}`);
console.log(ok ? "OK: median new bill <= 4% of revenue and new/old <= 1.8 in every tier" : "FAIL: a tier is above 4% of revenue or 1.8x the old bill");
