/**
 * What new signings cost (`.claude/rules/game/settling.md`). Full engine, the same league, both sides
 * balanced, 4-3-3, fitness 88. Mode "edge": one side with `--newcomers` starters who have just arrived,
 * the other settled; each pair twice with the sides swapped. Mode `--both`: both sides with them, against
 * a run with `--newcomers 0`, for the goal volume. `--penalty` overrides the constant.
 *
 *   bun scripts/settling-measure.ts [league=premier_league] [matches=400] [--newcomers 5] [--penalty 0.015]
 *       [--both] [--seed 1] [--out f.json] [--sum a.json,b.json]
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { mulberry32 } from "@/Domain/rng";
import { SETTLING, withNewcomers } from "@/Domain/settling/settling";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

const argVal = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith("--") && !arr[i - 1]?.startsWith("--"));
const LEAGUE = positional[0] ?? "premier_league";
const N = Number(positional[1] ?? 400);
const NEW = Number(argVal("--newcomers") ?? 5);
const BOTH = process.argv.includes("--both");
const OUT = argVal("--out");
const SUM = argVal("--sum");
if (argVal("--penalty")) SETTLING.PENALTY = Number(argVal("--penalty"));

interface Totals { matches: number; w: number; d: number; l: number; gf: number; ga: number; sf: number; sa: number }
const empty = (): Totals => ({ matches: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, sf: 0, sa: 0 });

function report(t: Totals, label: string): void {
  const pct = (v: number) => ((100 * v) / Math.max(1, t.matches)).toFixed(1);
  const per = (v: number) => (v / Math.max(1, t.matches)).toFixed(3);
  console.log(`${label}: n=${t.matches}  newcomers side W/D/L ${pct(t.w)}/${pct(t.d)}/${pct(t.l)}%  (win − loss ${(+pct(t.w) - +pct(t.l)).toFixed(1)} p.p.)  goals ${per(t.gf)}–${per(t.ga)} (total ${((t.gf + t.ga) / t.matches).toFixed(3)})  shots ${per(t.sf)}–${per(t.sa)} (total ${((t.sf + t.sa) / t.matches).toFixed(2)})`);
}

if (SUM) {
  const all = await Promise.all(SUM.split(",").map((f) => Bun.file(f.trim()).json() as Promise<Totals>));
  const t = empty();
  for (const r of all) for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += r[k];
  report(t, `sum of ${all.length}`);
  process.exit(0);
}

const dir = fileURLToPath(new URL(`../src/example_data/squads/${LEAGUE}/`, import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
const squads = await Promise.all(files.map(async (f) => {
  const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
}));
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const rng = mulberry32(Number(argVal("--seed") ?? 1));
const t = empty();

function play(home: Squad, away: Squad, newHome: boolean): void {
  const lh = autoLineupDefaultFormation(home);
  const la = autoLineupDefaultFormation(away);
  // Starters at random, not the first slots: the keeper and the back line would weigh every time.
  const pick = (l: string[]) => [...l].sort(() => rng() - 0.5);
  const h = newHome || BOTH ? withNewcomers(home, pick(lh), NEW) : home;
  const a = !newHome || BOTH ? withNewcomers(away, pick(la), NEW) : away;
  const m = simulateMatch(h, a, formation, formation, lh, la, { tactics: { A: { style: "balanced" }, B: { style: "balanced" } } });
  const [gf, ga, sf, sa] = newHome
    ? [m.score.A, m.score.B, m.teamStats.A.shots, m.teamStats.B.shots]
    : [m.score.B, m.score.A, m.teamStats.B.shots, m.teamStats.A.shots];
  t.matches++; t.gf += gf; t.ga += ga; t.sf += sf; t.sa += sa;
  if (gf > ga) t.w++; else if (gf === ga) t.d++; else t.l++;
}

for (let i = 0; i < N / 2; i++) {
  const home = squads[Math.floor(rng() * squads.length)]!;
  let away = squads[Math.floor(rng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  play(home, away, true);
  play(home, away, false);
}
report(t, `${LEAGUE} newcomers ${NEW}${BOTH ? " both" : ""} penalty ${SETTLING.PENALTY}`);
if (OUT) await Bun.write(OUT, JSON.stringify(t));
