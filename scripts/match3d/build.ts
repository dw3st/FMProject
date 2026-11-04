// 3D live match mock: records one full engine match and writes a self-contained HTML. See scripts/match3d/README.md.
// bun scripts/match3d/build.ts <out.html>
import { readFileSync, writeFileSync } from "node:fs";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { getBallPos, matchMinute } from "@/GameEngine/Domain/gameState";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { mulberry32 } from "@/Domain/rng";
import { ballHeight } from "@/GraficsEngine/ballHeight";
import { LED_ADS } from "@/GraficsEngine/ledAds";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

const out = process.argv[2];
if (!out) throw new Error("usage: bun scripts/match3d/build.ts <out.html>");
const template = "scripts/match3d/template.html";
const read = (id: number) => JSON.parse(readFileSync(`src/Data/squads/premier_league/${id}.json`, "utf8")) as Squad;
const A = read(33), B = read(49);
const f = formationForSimId("4-3-3");
const la = autoLineupForFormation(A, f, "2026-08-15"), lb = autoLineupForFormation(B, f, "2026-08-15");
const r1 = (n: number) => Math.round(n * 10) / 10;

type Meta = { id: number; team: string; role: string; num: number; name: string };
type Ev = { f: number; t: string; id: number; a?: number; x?: number; y?: number; ok?: boolean };
type Goal = { frame: number; minute: number; scorer: string; scorerId: number; assistId: number | null; team: string; toY: number; goalX: number; header: boolean };
const real = Math.random;
let best: { frames: unknown[]; meta: Meta[]; goals: Goal[]; events: Ev[]; score: string } | null = null;
for (let seed = 7; seed < 60 && !best; seed++) {
  const frames: unknown[] = [];
  const metas = new Map<number, Meta>();
  const nextNum = { A: 12, B: 12 } as Record<string, number>;
  const goals: Goal[] = [];
  const events: Ev[] = [];
  const ev = (t: string, id: number, more: Partial<Ev> = {}) => events.push({ f: frames.length, t, id, ...more });
  let lastGoalY = 37;
  const subs = [
    gameBus.on("shot", (e) => ev("shot", e.player)),
    gameBus.on("header", (e) => ev("header", e.player)),
    gameBus.on("passAttempted", (e) => ev(e.distance > 25 ? "kick" : "pass", e.player)),
    gameBus.on("passCompleted", (e) => ev("receive", e.toId)),
    gameBus.on("crossStarted", (e) => ev("kick", e.player)),
    gameBus.on("longBallStarted", (e) => ev("kick", e.player)),
    gameBus.on("throughBallStarted", (e) => ev("pass", e.player)),
    gameBus.on("tackle", (e) => ev("tackle", e.player, { ok: e.success })),
    gameBus.on("foul", (e) => { ev("tackle", e.offenderId, { ok: false }); ev("fall", e.fouledId); ev("foul", e.fouledId, { x: e.x, y: e.y }); }),
    gameBus.on("aerialDuel", (e) => { ev("header", e.winnerId); ev("header", e.loserId); }),
    gameBus.on("gkClaim", (e) => ev("claim", e.keeperId, { ok: e.claimed })),
    gameBus.on("cornerAwarded", (e) => ev("corner", e.takerId)),
    gameBus.on("shotResolved", (e) => {
      if (e.isGoal) lastGoalY = e.toY;
      ev(e.isGoal ? "goalShot" : "miss", e.player, { x: e.toX, y: e.toY });
    }),
    gameBus.on("goalScored", (e) => {
      goals.push({ frame: frames.length, minute: e.minute + 1, scorer: "", scorerId: e.scorerId, assistId: e.assistId ?? null, team: e.team, toY: lastGoalY, goalX: e.goalX, header: !!e.header });
    }),
  ];
  const onTick = (s: GameState) => {
    const live = s.matchPhase === "firstHalf" || s.matchPhase === "secondHalf";
    if (!live) return;
    const p: number[] = [];
    let i = 0;
    for (const pl of s.players) {
      if (!metas.has(pl.id)) {
        const started = metas.size < 22;
        metas.set(pl.id, { id: pl.id, team: pl.team, role: pl.role, num: started ? (i % 11) + 1 : nextNum[pl.team]!++, name: pl.name });
      }
      i++;
      p.push(pl.id, r1(pl.x), r1(pl.y));
    }
    const b = getBallPos(s);
    const sp = s.setPiece ? [s.setPiece.type, s.setPiece.takerId, s.setPiece.variant ?? ""] : null;
    frames.push({ p, b: [r1(b.x), r1(b.y), r1(ballHeight(s))], h: s.pass || s.shot || s.looseBall ? null : s.ballHolderId ?? null, s: [s.score.A, s.score.B], m: matchMinute(s) + 1, sp });
  };
  Math.random = mulberry32(seed);
  const res = simulateMatch(A, B, f, f, la, lb, { onTick });
  Math.random = real;
  for (const u of subs) if (typeof u === "function") (u as () => void)();
  const total = res.score.A + res.score.B;
  console.log("seed", seed, "score", res.score, "frames", frames.length, "goals seen", goals.length, "events", events.length);
  if (total >= 3 && res.score.A > 0 && res.score.B > 0 && goals.length === total) {
    best = {
      frames, meta: [...metas.values()], events, score: `${res.score.A}-${res.score.B}`,
      goals: goals.map((g) => ({ ...g, scorer: metas.get(g.scorerId)?.name ?? "" })),
    };
  }
}
if (!best) throw new Error("no match with both teams scoring");

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const data = {
  stepSeconds: 0.2,
  names: { A: A.name, B: B.name },
  colors: { A: A.colors?.[0] ?? "#DA291C", A2: A.colors?.[1] ?? "#FFE500", B: B.colors?.[0] ?? "#034694", B2: B.colors?.[1] ?? "#FFFFFF" },
  meta: best.meta, goals: best.goals, frames: best.frames, events: best.events,
  ads: LED_ADS.slice(0, 16).map((a) => ({ text: a.text.pt, bg: hex(a.bg), fg: hex(a.fg) })),
};
const dataUri = (p: string, mime: string) => `data:${mime};base64,${readFileSync(p).toString("base64")}`;
const audio = Object.fromEntries(["ball-strike", "crowd-bed", "goal-roar", "near-miss", "net", "whistle-short"].map((n) => [n, dataUri(`src/example_data/assets/audio/${n}.mp3`, "audio/mpeg")]));
const html = readFileSync(template, "utf8")
  .replace("/*DATA*/null", () => JSON.stringify(data))
  .replace("/*AUDIO*/null", () => JSON.stringify(audio))
  .replace("/*GRASS*/", () => dataUri("src/example_data/assets/pitch/grass-a.png", "image/png"));
writeFileSync(out, html);
const kinds: Record<string, number> = {};
for (const e of best.events) kinds[e.t] = (kinds[e.t] ?? 0) + 1;
console.log("score", best.score, "goals", best.goals.map((g) => `${g.minute}' ${g.scorer}`).join(", "), "frames", best.frames.length, "players", best.meta.length, "events", kinds, "MB", (html.length / 1e6).toFixed(2));
