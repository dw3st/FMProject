/**
 * Does a human club win more than the same squad run by the AI? (tester-report save analysis, 4.39)
 *
 * Plays a club's squad against every other club of its league folder, home and away, in the full engine with
 * fitness 88, in arms that switch on the human edges one at a time:
 *   ai       — the AI's formation for the squad, familiarity 75 (the AI rule), morale 65 (neutral)
 *   form     — the human formation, familiarity 75, morale 65
 *   fam      — the human formation and the club's stored familiarity, morale 65
 *   human    — the human formation, stored familiarity and the players' stored morale
 * Every arm plays the same fixtures with the same Math.random seed per fixture. Opponents: AI rule.
 *
 *   bun scripts/seat-edge-measure.ts <squads dir> <clubId> <formation> [repeats=3]
 */
import { readdirSync, readFileSync } from "node:fs";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiRecordFor, autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { aiFamiliarity } from "@/Domain/familiarity/familiarity";
import { mulberry32 } from "@/Domain/rng";
import type { Squad } from "@/types/playerTypes";

const [dir, clubId, humanFormation, repeatsArg] = process.argv.slice(2);
if (!dir || !clubId || !humanFormation) throw new Error("usage: <squads dir> <clubId> <formation> [repeats]");
const REPEATS = Number(repeatsArg ?? 3);
const DATE = "2027-12-04";

const squads: Squad[] = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
  const s = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...(p.seasonLog ?? {}), fitness: 88, load: 0 } as never })) };
});
const club = squads.find((s) => s.id === clubId)!;
const opponents = squads.filter((s) => s.id !== clubId);
const aiFam = aiFamiliarity("balanced");
const neutralMorale = (s: Squad): Squad => ({ ...s, players: s.players.map((p) => { const { morale: _m, ...rest } = p as never as Record<string, unknown>; return rest as never; }) });

type Arm = "ai" | "form" | "fam" | "human";
const ARMS: Arm[] = ["ai", "form", "fam", "human"];
const tot: Record<Arm, { w: number; d: number; l: number; gf: number; ga: number; n: number }> =
  Object.fromEntries(ARMS.map((a) => [a, { w: 0, d: 0, l: 0, gf: 0, ga: 0, n: 0 }])) as never;

const aiForm = formationForSimId(aiRecordFor(club, DATE).id);
const humForm = formationForSimId(humanFormation);
console.log(`${club.name}: AI formation ${aiRecordFor(club, DATE).id}, human ${humanFormation}, stored balanced familiarity ${club.styleFamiliarity?.balanced ?? "-"}`);

let fixture = 0;
for (let r = 0; r < REPEATS; r++) {
  for (const opp of opponents) {
    for (const home of [true, false]) {
      fixture++;
      const oppForm = formationForSimId(aiRecordFor(opp, DATE).id);
      const oppLineup = autoLineupForFormation(opp, oppForm);
      for (const arm of ARMS) {
        const form = arm === "ai" ? aiForm : humForm;
        const own = arm === "human" ? club : neutralMorale(club);
        const fam = arm === "fam" || arm === "human" ? { ...aiFam, ...(club.styleFamiliarity ?? {}) } : aiFam;
        const lineup = autoLineupForFormation(own, form);
        const seed = mulberry32(9000 + fixture);
        const orig = Math.random;
        Math.random = seed;
        try {
          const ownT = { style: "balanced" as const, familiarity: fam };
          const oppT = { style: "balanced" as const, familiarity: aiFam };
          const res = home
            ? simulateMatch(own, opp, form, oppForm, lineup, oppLineup, { tactics: { A: ownT, B: oppT } })
            : simulateMatch(opp, own, oppForm, form, oppLineup, lineup, { tactics: { A: oppT, B: ownT } });
          const gf = home ? res.score.A : res.score.B, ga = home ? res.score.B : res.score.A;
          const t = tot[arm];
          t.n++; t.gf += gf; t.ga += ga;
          if (gf > ga) t.w++; else if (gf === ga) t.d++; else t.l++;
        } finally { Math.random = orig; }
      }
    }
  }
}
for (const arm of ARMS) {
  const t = tot[arm];
  const ppg = (3 * t.w + t.d) / t.n;
  console.log(`${arm.padEnd(6)} n=${t.n}  W/D/L ${(100 * t.w / t.n).toFixed(1)}/${(100 * t.d / t.n).toFixed(1)}/${(100 * t.l / t.n).toFixed(1)}%  pts/game ${ppg.toFixed(2)}  goals ${(t.gf / t.n).toFixed(2)}–${(t.ga / t.n).toFixed(2)}`);
}
