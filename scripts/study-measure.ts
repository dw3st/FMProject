/**
 * What an AI club's game plan costs a human manager who repeats his plan (`.claude/rules/game/study.md`).
 * Full engine, pairs of clubs of the league (sides alternating), every match on its own seeded `Math.random`, the
 * same seed in every arm. Human side: style X at familiarity 100, 4-3-3, auto XI. AI side: its own formation
 * (`aiMatchFormation`) and auto XI, fitness 88 both sides.
 *   arm A = balanced at the AI's rule (today)
 *   arm B = the `high` plan: `STUDY.COUNTER[X]` at the AI's rule + man-marking of the human's best attacker
 *   arm C = the `medium` plan: the style only
 * An arm identical to another (no style swap) is copied, not simulated.
 *
 *   bun scripts/study-measure.ts [league=premier_league] [matches=300] [--part 0/3] [--out file.json] [--styles a,b]
 *     [--salt x] [--counter high_press=possession]
 *   bun scripts/study-measure.ts --sum a.json,b.json
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch, type TeamTactics } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { aiFamiliarity } from "@/Domain/familiarity/familiarity";
import { counterStyle, pickMarkTarget, pickMarkerSlot } from "@/Domain/study/study";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { DEFAULT_TACTICAL_STYLE, type TacticalStyle } from "@/types/tacticsTypes";

const STYLES: TacticalStyle[] = ["balanced", "possession", "high_press", "counter_attack", "direct_play"];
const ARMS = ["A", "B", "C"] as const;
type Arm = (typeof ARMS)[number];

interface Cell { matches: number; wins: number; draws: number; losses: number; gf: number; ga: number; sf: number; sa: number; marked: number }
interface Row { league: string; style: TacticalStyle; counter: TacticalStyle; arms: Record<Arm, Cell> }

const args = process.argv.slice(2);
const flag = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const emptyCell = (): Cell => ({ matches: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, sf: 0, sa: 0, marked: 0 });

/** Human win% − loss%. */
const edge = (c: Cell) => (c.matches ? ((c.wins - c.losses) / c.matches) * 100 : 0);

function print(rows: Row[]) {
  const leagues = [...new Set(rows.map((r) => r.league))];
  for (const league of leagues) {
    const mine = rows.filter((r) => r.league === league);
    console.log(`\n${league}: human win% - loss% (goals for-against per match)`);
    console.log("style".padEnd(16) + "AI plays".padEnd(16) + "A balanced".padStart(22) + "B high".padStart(22) + "C medium".padStart(22) + "B-A".padStart(8) + "C-A".padStart(8) + "n".padStart(6));
    const cellText = (c: Cell) => `${edge(c).toFixed(1)} (${(c.gf / Math.max(1, c.matches)).toFixed(2)}-${(c.ga / Math.max(1, c.matches)).toFixed(2)})`;
    let dB = 0, dC = 0;
    for (const r of mine) {
      const b = edge(r.arms.B) - edge(r.arms.A);
      const c = edge(r.arms.C) - edge(r.arms.A);
      dB += b; dC += c;
      console.log(r.style.padEnd(16) + r.counter.padEnd(16) + ARMS.map((a) => cellText(r.arms[a]).padStart(22)).join("")
        + b.toFixed(1).padStart(8) + c.toFixed(1).padStart(8) + String(r.arms.A.matches).padStart(6));
    }
    const n = mine[0]?.arms.A.matches ?? 0;
    console.log(`mean of the styles: B-A ${(dB / mine.length).toFixed(1)}  C-A ${(dC / mine.length).toFixed(1)} (win - loss; win points = half)`
      + `   paired standard error of one difference ~${(100 * Math.sqrt(1 / Math.max(1, n))).toFixed(1)}`);
    const shots = (a: Arm) => mine.reduce((s, r) => s + r.arms[a].sf + r.arms[a].sa, 0) / Math.max(1, mine.reduce((s, r) => s + r.arms[a].matches, 0));
    const goals = (a: Arm) => mine.reduce((s, r) => s + r.arms[a].gf + r.arms[a].ga, 0) / Math.max(1, mine.reduce((s, r) => s + r.arms[a].matches, 0));
    console.log(`goals per match A ${goals("A").toFixed(2)} B ${goals("B").toFixed(2)} C ${goals("C").toFixed(2)}   shots A ${shots("A").toFixed(2)} B ${shots("B").toFixed(2)} C ${shots("C").toFixed(2)}`
      + `   marked in B: ${(100 * mine.reduce((s, r) => s + r.arms.B.marked, 0) / Math.max(1, mine.reduce((s, r) => s + r.arms.B.matches, 0))).toFixed(0)}%`);
  }
}

const sum = flag("--sum");
if (sum) {
  const merged = new Map<string, Row>();
  for (const f of sum.split(",")) {
    for (const r of JSON.parse(readFileSync(f, "utf8")) as Row[]) {
      const key = `${r.league}|${r.style}`;
      const m = merged.get(key);
      if (!m) { merged.set(key, JSON.parse(JSON.stringify(r)) as Row); continue; }
      for (const a of ARMS) for (const k of Object.keys(m.arms[a]) as (keyof Cell)[]) m.arms[a][k] += r.arms[a][k];
    }
  }
  print([...merged.values()]);
  process.exit(0);
}

const pos = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const league = pos[0] ?? "premier_league";
const perStyle = Number(pos[1] ?? 300);
const [part, parts] = (flag("--part") ?? "0/1").split("/").map(Number) as [number, number];
const out = flag("--out");
const styles = (flag("--styles")?.split(",") as TacticalStyle[] | undefined) ?? STYLES;
/** `--counter high_press=possession,...` tries another table without editing the config. */
const override = new Map((flag("--counter") ?? "").split(",").filter(Boolean).map((p) => p.split("=") as [TacticalStyle, TacticalStyle]));
const counterOf = (s: TacticalStyle) => override.get(s) ?? counterStyle(s);
/** `--salt x`: another set of seeds (more matches of the same cells; sum the files). */
const salt = flag("--salt") ?? "";

const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
const squads = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const s = JSON.parse(readFileSync(dir + f, "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
});
const f433 = formationForSimId("4-3-3");
const DATE = "2026-09-01";
const realRandom = Math.random;
const rows: Row[] = [];
let k = -1;

for (const style of styles) {
  const counter = counterOf(style);
  const row: Row = { league, style, counter, arms: { A: emptyCell(), B: emptyCell(), C: emptyCell() } };
  rows.push(row);
  for (let m = 0; m < perStyle; m++) {
    k++;
    if (k % parts !== part) continue;
    const n = squads.length;
    const human = squads[m % n]!;
    const ai = squads[(m + 1 + (Math.floor(m / n) % (n - 1))) % n]!;
    const humanHome = m % 2 === 0;
    const aiFormation = aiMatchFormation(ai, human, DATE).formation;
    const humanLineup = autoLineupForFormation(human, f433);
    const aiLineup = autoLineupForFormation(ai, aiFormation);
    const humanTactics: TeamTactics = { style, familiarity: { [style]: 100 } };
    const slot = pickMarkerSlot({ roles: slotRoles(aiFormation), lineup: aiLineup, players: ai.players });
    const target = pickMarkTarget({ roles: slotRoles(f433), lineup: humanLineup, players: human.players });
    const marks = slot !== null && target ? [{ slot, targetRosterId: target.rosterId }] : undefined;
    const plan = (s: TacticalStyle, marked: boolean): TeamTactics => ({
      style: s, familiarity: aiFamiliarity(s), ...(marked && marks ? { manMarks: marks } : {}),
    });
    const armTactics: Record<Arm, TeamTactics> = {
      A: plan(DEFAULT_TACTICAL_STYLE, false),
      B: plan(counter, true),
      C: plan(counter, false),
    };
    const play = (aiTactics: TeamTactics) => {
      Math.random = mulberry32(seedFrom(`study:${league}:${style}:${m}${salt ? `:${salt}` : ""}`));
      const r = humanHome
        ? simulateMatch(human, ai, f433, aiFormation, humanLineup, aiLineup, { tactics: { A: humanTactics, B: aiTactics } })
        : simulateMatch(ai, human, aiFormation, f433, aiLineup, humanLineup, { tactics: { A: aiTactics, B: humanTactics } });
      Math.random = realRandom;
      const h = humanHome ? "A" : "B";
      const o = humanHome ? "B" : "A";
      return { gf: r.score[h], ga: r.score[o], sf: r.teamStats[h].shots, sa: r.teamStats[o].shots };
    };
    const a = play(armTactics.A);
    // No style swap: the medium plan is the balanced match itself.
    const c = counter === DEFAULT_TACTICAL_STYLE ? a : play(armTactics.C);
    const b = marks ? play(armTactics.B) : c;
    for (const [arm, r] of [["A", a], ["B", b], ["C", c]] as const) {
      const cell = row.arms[arm];
      cell.matches++;
      if (r.gf > r.ga) cell.wins++; else if (r.gf < r.ga) cell.losses++; else cell.draws++;
      cell.gf += r.gf; cell.ga += r.ga; cell.sf += r.sf; cell.sa += r.sa;
      if (arm === "B" && marks) cell.marked++;
    }
  }
}
if (out) writeFileSync(out, JSON.stringify(rows));
else print(rows);
