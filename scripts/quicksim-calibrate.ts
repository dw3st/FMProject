// scripts/quicksim-calibrate.ts
/**
 * Compares quickSim with the full engine on real squads.
 * Usage: bun scripts/quicksim-calibrate.ts [league=premier_league] [pairs=40] [repeats=5]
 * Goal (spec): quickSim within ±10% of the engine on goals/match, home-win % and draw %,
 * and per-line mean rating within ±0.4 (DEF/MID/FWD) / ±0.6 (GK).
 *
 * Optional: QS_ENGINE_CACHE=<file.json> caches the (slow, ~1 s/match) engine side so
 * repeated tuning runs only re-run quickSim. The cache is only valid for the same
 * league/pairs/repeats — delete it after changing the engine or the arguments.
 * Optional: QS_QUICK_REPEATS=<k> runs quickSim k times per engine match.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { quickSimMatch, resolveRole, teamLevel, teamStrength } from "@/Domain/advanceDay/quickSim";
import { autoLineupDefaultFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { ROLE_GROUP, type LineGroup } from "@/GameEngine/Configs/QuickSimConfig";
import { RATING_WEIGHTS as W } from "@/GameEngine/Configs/PlayerRatingConfig";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { MatchPlayerStats } from "@/types/dayLogTypes";
import { mulberry32 } from "@/Domain/rng";

const league = process.argv[2] ?? "premier_league";
const PAIRS = Number(process.argv[3] ?? 40);
const REPEATS = Number(process.argv[4] ?? 5);
const CACHE = process.env.QS_ENGINE_CACHE;
/** quickSim runs per engine match (default 1). Raise while tuning to cut quickSim's own noise. */
const QUICK_REPEATS = Number(process.env.QS_QUICK_REPEATS ?? 1);
const dir = fileURLToPath(new URL(`../src/example_data/squads/${league}/`, import.meta.url));

const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
const squads: Squad[] = await Promise.all(
  files.map(async (f) => {
    const s = (await Bun.file(`${dir}${f}`).json()) as Squad;
    return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: emptySeasonLog() })) };
  }),
);

const GROUPS: LineGroup[] = ["GK", "DEF", "MID", "FWD"];
const STAT_KEYS = ["passesAttempted", "passesCompleted", "shots", "goals", "assists", "tackles", "interceptions"] as const;
type GroupStats = Record<(typeof STAT_KEYS)[number] | "tacklesFailed", number>;
type RatingAcc = { sum: Record<LineGroup, number>; n: Record<LineGroup, number>; high: number; total: number; skipped: number };
type Acc = {
  n: number; goals: number; home: number; draw: number; ms: number;
  /** Scoreline histogram "h-a" → count. */
  scores: Record<string, number>;
  all: RatingAcc; starters: RatingAcc;
  stats: Record<LineGroup, GroupStats>;
};
const perGroup = <T>(f: () => T) => ({ GK: f(), DEF: f(), MID: f(), FWD: f() }) as Record<LineGroup, T>;
const newRatingAcc = (): RatingAcc => ({ sum: perGroup(() => 0), n: perGroup(() => 0), high: 0, total: 0, skipped: 0 });
const newAcc = (): Acc => ({
  n: 0, goals: 0, home: 0, draw: 0, ms: 0, scores: {},
  all: newRatingAcc(), starters: newRatingAcc(),
  stats: perGroup(() => ({ passesAttempted: 0, passesCompleted: 0, shots: 0, goals: 0, assists: 0, tackles: 0, interceptions: 0, tacklesFailed: 0 })),
});

function add(acc: Acc, h: number, a: number, ms: number) {
  acc.n++;
  acc.goals += h + a;
  if (h > a) acc.home++;
  else if (h === a) acc.draw++;
  acc.ms += ms;
  const key = `${Math.min(h, 5)}-${Math.min(a, 5)}`;
  acc.scores[key] = (acc.scores[key] ?? 0) + 1;
}

function addRating(acc: RatingAcc, g: LineGroup | undefined, rating: number) {
  if (!g) { acc.skipped++; return; }
  acc.sum[g] += rating;
  acc.n[g]++;
  acc.total++;
  if (rating >= 8.5) acc.high++;
}

/** Failed tackles aren't in MatchPlayerStats — recover them from the rating residual. */
function impliedTacklesFailed(s: MatchPlayerStats, rating: number): number {
  const known = W.BASELINE + s.goals * W.GOAL + s.assists * W.ASSIST + s.shots * W.SHOT
    + s.passesCompleted * W.PASS_COMPLETED + s.passesFailed * W.PASS_FAILED
    + s.tackles * W.TACKLE_WON + s.interceptions * W.INTERCEPTION;
  return Math.max(0, (rating - known) / W.TACKLE_FAILED);
}

function addStats(acc: Acc, g: LineGroup | undefined, s: MatchPlayerStats | undefined, rating: number) {
  if (!g || !s) return;
  for (const k of STAT_KEYS) acc.stats[g][k] += s[k];
  acc.stats[g].tacklesFailed += impliedTacklesFailed(s, rating);
}

const pickRng = mulberry32(2026); // pair selection — independent of quickSim's draws
const qsRng = mulberry32(7);
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const roles = slotRoles(formation);
const cached: Acc | null = CACHE && (await Bun.file(CACHE).exists()) ? await Bun.file(CACHE).json() : null;
const full = cached ?? newAcc();
const quick = newAcc();
/** Mean over matches of the two XIs' overall level (mean of the 4 line strengths). */
let levelSum = 0;

for (let i = 0; i < PAIRS; i++) {
  const home = squads[Math.floor(pickRng() * squads.length)]!;
  let away = squads[Math.floor(pickRng() * squads.length)]!;
  if (away.id === home.id) away = squads[(squads.indexOf(home) + 1) % squads.length]!;
  const hl = autoLineupDefaultFormation(home);
  const al = autoLineupDefaultFormation(away);
  const rosterRole = new Map<string, string | undefined>();
  for (const p of [...home.players, ...away.players]) rosterRole.set(p.id, p.positions[0]);
  // quickSim side groups by the same slot role the engine plays (resolved as quickSim does).
  const quickRole = new Map<string, string>();
  for (const [squad, lineup] of [[home, hl], [away, al]] as const) {
    const byId = new Map(squad.players.map((p) => [p.id, p]));
    lineup.forEach((id, i) => {
      const p = byId.get(id);
      if (p && !quickRole.has(id)) quickRole.set(id, resolveRole(p, roles[i]));
    });
  }

  const level = (squad: Squad, lineup: string[]) => {
    const byId = new Map(squad.players.map((p) => [p.id, p]));
    const idx = lineup.map((id, i) => [byId.get(id), i] as const).filter(([p]) => p);
    return teamLevel(teamStrength(idx.map(([p]) => p!), idx.map(([, i]) => roles[i]!)));
  };
  levelSum += (level(home, hl) + level(away, al)) / 2;

  for (let r = 0; r < REPEATS; r++) {
    if (!cached) {
      const t = performance.now();
      const f = simulateMatch(home, away, formation, formation, hl, al);
      add(full, f.score.A, f.score.B, performance.now() - t);
      // Engine ids → slot role. A subbed-off player inherits the slot role of the player who
      // replaced him (following chains); otherwise falls back to his roster position.
      const roleById = new Map<number, string>(f.players.map((p) => [p.id, p.role]));
      for (const s of [...f.substitutions].reverse()) {
        if (!roleById.has(s.playerOutId)) {
          const inherited = roleById.get(s.playerInId) ?? rosterRole.get(s.playerOutRosterId);
          if (inherited) roleById.set(s.playerOutId, inherited);
        }
      }
      const subbedIn = new Set(f.substitutions.map((s) => s.playerInId));
      for (const [idStr, rating] of Object.entries(f.playerRatings)) {
        const id = Number(idStr);
        const role = roleById.get(id);
        const g = role ? ROLE_GROUP[role] : undefined;
        addRating(full.all, g, rating);
        if (!subbedIn.has(id)) addRating(full.starters, g, rating);
        addStats(full, g, f.playerStats.get(id), rating);
      }
    }
    for (let k = 0; k < QUICK_REPEATS; k++) {
      const t = performance.now();
      const q = quickSimMatch({ fixtureId: "c", home, away, homeLineup: hl, awayLineup: al, homeRoles: roles, awayRoles: roles }, qsRng);
      add(quick, q.recording.score.home, q.recording.score.away, performance.now() - t);
      for (const [id, rating] of Object.entries(q.recording.playerRatings)) {
        const role = quickRole.get(id);
        const g = role ? ROLE_GROUP[role] : undefined;
        addRating(quick.all, g, rating);
        addRating(quick.starters, g, rating);
        addStats(quick, g, q.recording.playerStats[id], rating);
      }
    }
  }
}
if (CACHE && !cached) await Bun.write(CACHE, JSON.stringify(full));

const fmt = (a: Acc) => ({
  "gols/jogo": +(a.goals / a.n).toFixed(2),
  "casa %": +((a.home / a.n) * 100).toFixed(1),
  "empate %": +((a.draw / a.n) * 100).toFixed(1),
  "fora %": +(((a.n - a.home - a.draw) / a.n) * 100).toFixed(1),
  "ms/jogo": +(a.ms / a.n).toFixed(2),
});
const lines = (r: RatingAcc) => ({
  ...Object.fromEntries(GROUPS.map((g) => [g, +(r.sum[g] / Math.max(1, r.n[g])).toFixed(2)])),
  "≥8.5 %": +((r.high / Math.max(1, r.total)) * 100).toFixed(1),
  "n notas": r.total,
  "sem papel": r.skipped,
});
const statRows = (label: string, a: Acc) => Object.fromEntries(GROUPS.map((g) => {
  const n = Math.max(1, a.all.n[g]);
  const st = a.stats[g];
  return [`${label} ${g}`, Object.fromEntries(
    (Object.keys(st) as (keyof GroupStats)[]).map((k) => [k, +(st[k] / n).toFixed(2)]),
  )];
}));

const F = fmt(full);
const Q = fmt(quick);
console.log(`${league} — ${PAIRS} pares × ${REPEATS}${cached ? " (motor do cache)" : ""} — nível médio ${(levelSum / PAIRS).toFixed(3)}`);
console.table({ motor: F, quickSim: Q });
const FL = lines(full.all) as Record<string, number>;
const QL = lines(quick.all) as Record<string, number>;
console.log("Nota média por linha — todos que jogaram (motor inclui reservas que entraram):");
console.table({ motor: FL, quickSim: QL });
console.log("Nota média por linha — só titulares (motor inclui quem saiu substituído):");
console.table({ motor: lines(full.starters), quickSim: lines(quick.starters) });
console.log("Eventos médios por jogador (tacklesFailed do motor inferido da nota):");
console.table({ ...statRows("motor", full), ...statRows("quick", quick) });
const scoreRow = (a: Acc) => {
  const pct = (k: string) => +(((a.scores[k] ?? 0) / a.n) * 100).toFixed(1);
  return { "0-0": pct("0-0"), "1-1": pct("1-1"), "2-2": pct("2-2"), "1-0": pct("1-0"), "0-1": pct("0-1"),
    "2-1": pct("2-1"), "1-2": pct("1-2"), "2-0": pct("2-0"), "0-2": pct("0-2") };
};
console.log("Placares (% dos jogos):");
console.table({ motor: scoreRow(full), quickSim: scoreRow(quick) });
const within = (q: number, f: number) => Math.abs(q - f) <= Math.abs(f) * 0.1;
console.log("dentro de ±10%:", {
  gols: within(Q["gols/jogo"], F["gols/jogo"]),
  casa: within(Q["casa %"], F["casa %"]),
  empate: within(Q["empate %"], F["empate %"]),
});
console.log("notas por linha (±0.4, GK ±0.6):", Object.fromEntries(
  GROUPS.map((g) => [g, Math.abs(QL[g]! - FL[g]!) <= (g === "GK" ? 0.6 : 0.4)]),
));
