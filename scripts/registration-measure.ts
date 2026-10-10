#!/usr/bin/env bun
/**
 * Registration rules on the world (`.claude/rules/game/registration.md` → Medição): for every club, the automatic
 * list of its league's rule with the real code, and separately the UEFA and CONMEBOL rules as if every club played
 * them. Per rule: clubs, squad, list (free included), lists reduced by the lack of formed players, clubs under the
 * 18 floor (exception), foreign players left out per club, and how many of the club's 11 best stay out.
 *
 * `--market` also runs `market-sim.ts 1 --registration` (AI fee signings left out after their window closes).
 *
 * Usage: bun scripts/registration-measure.ts [--market]
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "node:url";
import { autoRegister, countsOf, ruleFor, type RegCtx } from "@/Domain/registration/rules";
import { REGISTRATION_RULES } from "@/Domain/registration/registrationConfig";
import { isForeign } from "@/Domain/registration/formed";
import { computeOverallAvg } from "@/Domain/playerRating";
import type { RegistrationRule } from "@/types/registrationTypes";
import type { Squad } from "@/types/playerTypes";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA = join(ROOT, "src", "Data");
const catalog = JSON.parse(readFileSync(join(DATA, "leagueData.json"), "utf8")) as { slug: string; country?: string }[];
const countries = JSON.parse(readFileSync(join(DATA, "countries.json"), "utf8")) as Record<string, { continent?: string }>;
const countryOf = new Map(catalog.map((l) => [l.slug, l.country ?? ""] as const));

const squads: Squad[] = [];
for (const league of readdirSync(join(DATA, "squads"))) {
  for (const f of readdirSync(join(DATA, "squads", league)).filter((x) => x.endsWith(".json"))) {
    squads.push({ ...(JSON.parse(readFileSync(join(DATA, "squads", league, f), "utf8")) as Squad), leagueSlug: league });
  }
}

interface Acc { clubs: number; squad: number; list: number; reduced: number; exception: number; foreignOut: number; topOut: number }
const acc = new Map<string, Acc>();
const add = (key: string, squad: Squad, rule: RegistrationRule) => {
  const country = countryOf.get(squad.leagueSlug ?? "") ?? "";
  const ctx: RegCtx = { seasonStartYear: 2026, countryOfLeague: (l) => countryOf.get(l) ?? "", country, squadId: squad.id };
  const r = autoRegister(squad.players, rule, ctx);
  const ids = new Set(r.ids);
  const c = countsOf(r.ids, squad.players, rule, ctx);
  const top = [...squad.players].sort((a, b) => (b.overallAvg ?? computeOverallAvg(b)) - (a.overallAvg ?? computeOverallAvg(a))).slice(0, 11);
  const a = acc.get(key) ?? { clubs: 0, squad: 0, list: 0, reduced: 0, exception: 0, foreignOut: 0, topOut: 0 };
  a.clubs++;
  a.squad += squad.players.length;
  a.list += ids.size;
  if (c.lostSlots > 0 && rule.maxList != null && c.counted < rule.maxList) a.reduced++;
  if (r.exception) a.exception++;
  a.foreignOut += squad.players.filter((p) => !ids.has(p.id) && isForeign(p, rule, country, { squadId: squad.id, ctx })).length;
  a.topOut += top.filter((p) => !ids.has(p.id)).length;
  acc.set(key, a);
};

for (const s of squads) {
  const country = countryOf.get(s.leagueSlug ?? "") ?? "";
  const rule = ruleFor(s.leagueSlug ?? "", s.leagueSlug ?? "", country, countries[country]?.continent);
  add(rule.id, s, rule);
  add("uefa (all clubs)", s, REGISTRATION_RULES.uefa!);
  add("conmebol (all clubs)", s, REGISTRATION_RULES.conmebol!);
}

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
console.log("| Rule | Clubs | Squad | List | Reduced (formed) | < 18 (floor) | Foreign out / club | Top-11 out / club |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [key, a] of [...acc.entries()].sort((x, y) => y[1].clubs - x[1].clubs)) {
  console.log(`| ${key} | ${a.clubs} | ${f1(a.squad / a.clubs)} | ${f1(a.list / a.clubs)} | ${a.reduced} | ${a.exception} | ${f2(a.foreignOut / a.clubs)} | ${f2(a.topOut / a.clubs)} |`);
}

if (process.argv.includes("--market")) {
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts", "market-sim.ts"), "1", "--registration"], { cwd: ROOT, stdout: "pipe", stderr: "inherit" });
  const out = p.stdout.toString();
  const lines = out.split("\n");
  const i = lines.findIndex((l) => l.includes("registration:"));
  console.log(i >= 0 ? lines.slice(i, i + 6).join("\n") : out);
}
