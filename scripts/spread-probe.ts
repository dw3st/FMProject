/**
 * Drawn-overlap probe: how often the match figures cover each other on screen, for a set of `markerSpread` settings.
 * Runs full-engine matches and applies the drawing spread to the engine positions of every live tick (no easing).
 * A pair "covers" when the drawn centres are closer than `COVER` marker radii; a tick is "ugly" with 3+ covering pairs.
 *
 *   bun scripts/spread-probe.ts [matches=30] [league=premier_league]
 */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { isLivePhase } from "@/GameEngine/Domain/gameState";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { mulberry32 } from "@/Domain/rng";
import { spreadOffsets } from "@/GraficsEngine/markerSpread";
import type { GameState } from "@/GameEngine/types";

const R_YD = 2.2;          // marker radius in yards (`playerMarkerRadius`: scale × 2.2 px)
const COVER = 1.3;         // centres closer than this many radii: one figure hides a good part of the other
const matches = Number(process.argv[2] ?? 30);
const league = process.argv[3] ?? "premier_league";

const OPTIONS: { name: string; min: number; max: number; it: number }[] = [
  { name: "off", min: 0, max: 0, it: 0 },
  { name: "today 2.1/1/3", min: 2.1, max: 1, it: 3 },
  { name: "2.1/1.5/6", min: 2.1, max: 1.5, it: 6 },
  { name: "2.1/2/8", min: 2.1, max: 2, it: 8 },
  { name: "2.1/3/10", min: 2.1, max: 3, it: 10 },
  { name: "1.8/2/8", min: 1.8, max: 2, it: 8 },
  { name: "1.8/3/10", min: 1.8, max: 3, it: 10 },
];
const acc = OPTIONS.map(() => ({ pairs: 0, ugly: 0, shift: 0, shifted: 0, maxShift: 0, far: 0 }));
let ticks = 0;

function sample(s: GameState): void {
  if (!isLivePhase(s.matchPhase) || s.varReview) return;
  ticks++;
  const fixed = new Set<number>(s.setPiece?.wallIds ?? []);
  for (const p of s.players) if (p.role === "GK") fixed.add(p.id);
  if (!s.pass && !s.shot && !s.looseBall) fixed.add(s.ballHolderId);
  if (s.pass?.toId != null) fixed.add(s.pass.toId);
  const pts = s.players.map((p) => ({ id: p.id, x: p.x, y: p.y }));
  OPTIONS.forEach((o, k) => {
    const offs = o.max > 0 ? spreadOffsets(pts, R_YD * o.min, R_YD * o.max, fixed, o.it) : new Map();
    const drawn = pts.map((p) => { const d = offs.get(p.id); return d ? { x: p.x + d.x, y: p.y + d.y } : p; });
    let pairs = 0;
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
      if (Math.hypot(drawn[i]!.x - drawn[j]!.x, drawn[i]!.y - drawn[j]!.y) < COVER * R_YD) pairs++;
    }
    const a = acc[k]!;
    a.pairs += pairs;
    if (pairs >= 3) a.ugly++;
    for (const d of offs.values()) {
      const l = Math.hypot(d.x, d.y);
      a.shift += l; a.shifted++; a.maxShift = Math.max(a.maxShift, l);
      if (l > 3) a.far++;
    }
  });
}

const squads = loadLeagueAt88(league);
for (let m = 0; m < matches; m++) {
  const { home, away, date } = pairAt(squads, m);
  const fH = aiMatchFormation(home, away, date).formation;
  const fA = aiMatchFormation(away, home, date).formation;
  const real = Math.random;
  Math.random = mulberry32(9100 + m);
  try {
    simulateMatch(home, away, fH, fA,
      autoLineupForFormationWithFitness(home, fH, date), autoLineupForFormationWithFitness(away, fA, date),
      { tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, onTick: sample });
  } finally { Math.random = real; }
}

console.log(`${matches} matches, ${ticks} live ticks (set-piece countdowns included); marker radius ${R_YD} yd; cover = centres < ${COVER} radii`);
console.log("setting (minDist/maxShift/iterations, in radii) | covering pairs per tick | ticks with 3+ covering pairs | s per match | mean shift yd | player-ticks moved > 3 yd | largest shift");
OPTIONS.forEach((o, k) => {
  const a = acc[k]!;
  console.log(`${o.name.padEnd(16)} | ${(a.pairs / ticks).toFixed(3)} | ${(100 * a.ugly / ticks).toFixed(1)}% | ${(a.ugly * 0.2 / matches).toFixed(1)} | ${(a.shift / Math.max(1, a.shifted)).toFixed(2)} | ${(100 * a.far / (ticks * 20)).toFixed(2)}% | ${a.maxShift.toFixed(1)}`);
});
