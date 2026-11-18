// Asked weekly wage of the free staff pool for the poorest clubs of the world (staff.md → "Profissionais baratos").
// bun scripts/staff-cheap-measure.ts [clubs=10]
import { Glob } from "bun";
import { staffWageFor } from "@/Domain/staff/staff";
import { STAFF_ROLES } from "@/Domain/staff/staffTypes";
import { wageFactorOf, wageRevenueBasisOf, squadWeeklyWages } from "@/Domain/finance/wages";
import { naturalFinancialTier } from "@/Domain/aiFinance/aiClubFinance";
import type { Squad } from "@/types/playerTypes";

const n = Number(process.argv[2] ?? 10);
const squads: Squad[] = [];
for await (const f of new Glob("src/Data/squads/**/*.json").scan(".")) squads.push(await Bun.file(f).json());
const rows = squads.map((s) => ({ s, rev: wageRevenueBasisOf(s), f: wageFactorOf(s) })).sort((a, b) => a.rev - b.rev);
const pick = rows.slice(0, n);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
console.log(`clubs ${rows.length}; LOW ${rows.filter((r) => naturalFinancialTier(r.s.finances) === "LOW").length}`);
for (const { s, rev, f } of pick) {
  const wk = rev / 52;
  console.log(`${s.name.padEnd(28)} rev/wk €${Math.round(wk)} factor ${f.toFixed(2)} budget €${Math.round(s.finances?.budget ?? 0)} players/wk €${Math.round(squadWeeklyWages(s.players, f))}`);
}
for (const stars of [0.5, 1, 1.5, 2, 3]) {
  const line = STAFF_ROLES.map((role) => {
    const w = median(pick.map(({ f }) => staffWageFor(role, stars, f)));
    const share = median(pick.map(({ f, rev }) => staffWageFor(role, stars, f) / (rev / 52)));
    return `${role} €${w} (${(share * 100).toFixed(1)}%)`;
  });
  console.log(`${stars}★: ${line.join(" · ")}`);
}

// Worst cases: the clubs where the staff wage is the biggest share of revenue (the factor is high for the revenue).
const low = rows.filter((r) => naturalFinancialTier(r.s.finances) === "LOW");
const share = (r: typeof rows[number], stars: number) => staffWageFor("assistant", stars, r.f) / (r.rev / 52);
const worst = [...low].sort((a, b) => share(b, 1) - share(a, 1)).slice(0, n);
console.log("\nLOW clubs, highest staff wage / revenue:");
for (const r of worst) {
  const full = STAFF_ROLES.reduce((s, role) => s + staffWageFor(role, 1, r.f), 0);
  const half = STAFF_ROLES.reduce((s, role) => s + staffWageFor(role, 0.5, r.f), 0);
  console.log(`${r.s.name.padEnd(28)} rev/wk €${Math.round(r.rev / 52)} factor ${r.f.toFixed(2)} | assistant 1★ €${staffWageFor("assistant", 1, r.f)} (${(share(r, 1) * 100).toFixed(1)}%) 2★ €${staffWageFor("assistant", 2, r.f)} 3★ €${staffWageFor("assistant", 3, r.f)} | one of each 1★ €${full} (${((full / (r.rev / 52)) * 100).toFixed(1)}%) 0.5★ €${half} (${((half / (r.rev / 52)) * 100).toFixed(1)}%)`);
}
const all = low.map((r) => share(r, 1));
console.log(`LOW median assistant 1★ share ${(median(all) * 100).toFixed(2)}%, max ${(Math.max(...all) * 100).toFixed(2)}%`);
