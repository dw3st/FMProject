/**
 * Bun Worker running one live match between two managers (multiplayer part 7). One worker per match isolates
 * the engine globals (gameBus, tactic configs, Statistics, PlayerRating). All the logic is in `h2hMatch.ts`;
 * this file only wires messages and the real-time loop (`H2H.TICK_MS`).
 *
 * In : `WorkerIn` (init, cmd, pause, resume, auto, speed, penalty).
 * Out: `WorkerOut` (frame, state, event, done). The worker stops its loop after `done`.
 */
import { createH2HMatch, type H2HMatch } from "@/backend/h2h/h2hMatch";
import { H2H } from "@/Domain/h2h/h2hConfig";
import type { WorkerIn, WorkerOut } from "@/types/h2hTypes";

declare const self: Worker;

let match: H2HMatch | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let last = 0;
let pendingSpeed: number | null = null;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function post(messages: WorkerOut[]): void {
  for (const m of messages) postMessage(m);
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  match?.dispose();
}

function loop(): void {
  if (!match) return;
  const t = now();
  const elapsed = Math.min(5000, Math.max(0, t - last));
  last = t;
  post(match.tick(elapsed));
  if (match.done) stop();
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === "init") {
    if (match) return;
    match = createH2HMatch(msg.input);
    if (pendingSpeed !== null) match.setSpeed(pendingSpeed);
    last = now();
    timer = setInterval(loop, H2H.TICK_MS);
    return;
  }
  if (msg.type === "speed") {
    if (match) match.setSpeed(msg.factor);
    else pendingSpeed = msg.factor;
    return;
  }
  if (!match || match.done) return;
  switch (msg.type) {
    case "cmd": post(match.command(msg.side, msg.cmd)); break;
    case "pause": post(match.setPaused(true)); break;
    case "resume": post(match.setPaused(false)); break;
    case "penalty": post(match.penalty(msg.outcome)); break;
    case "auto": post(match.setAuto(msg.side, msg.on)); break;
  }
};
