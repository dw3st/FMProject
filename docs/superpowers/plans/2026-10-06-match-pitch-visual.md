# Visual do campo na partida ao vivo (4.4) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o campo da partida ao vivo com gramado listrado, sombras, bola de verdade que sobe nas bolas altas,
indicadores por jogador (posse, cartão, fôlego) e cinco efeitos curtos no gramado.

**Architecture:** Tudo no `GraficsEngine`. Lógica pura e testável em módulos pequenos (`pitchStyle.ts` constantes,
`markerInfo.ts`, `ballHeight.ts`, `pitchEffects.ts`); o desenho Pixi dos efeitos em `effectsRender.ts`; o
`PixiPitch.tsx` só monta as camadas, assina eventos do `gameBus` e chama os módulos a cada quadro. Única mudança no
motor: o passe guarda `offsideLineX` e o evento `offsideCalled` passa `lineX`.

**Tech Stack:** Bun + TypeScript, Pixi.js v8 (`Graphics`, `Container`, `Text`), `bun:test`.

Spec: `docs/superpowers/specs/2026-10-06-match-pitch-visual-design.md`. Regras: `.claude/rules/graphics-engine.md`,
`.claude/rules/frontend.md` (imports sempre `@/`), `.claude/rules/changelog.md`.

## Mapa de arquivos

| Arquivo | Novo? | Responsabilidade |
|---|---|---|
| `src/GraficsEngine/pitchStyle.ts` | novo | Todas as constantes visuais |
| `src/GraficsEngine/markerInfo.ts` (+ teste) | novo | `fatigueColor`, `fatigueFill`, `bookedPlayerIds` |
| `src/GraficsEngine/ballHeight.ts` (+ teste) | novo | `arcHeight`, `ballHeight` |
| `src/GraficsEngine/pitchEffects.ts` (+ teste) | novo | Fila de efeitos, relógio, rastro da bola |
| `src/GraficsEngine/effectsRender.ts` | novo | Desenho Pixi dos efeitos e do rastro |
| `src/GraficsEngine/PixiPitch.tsx` | muda | Gramado, marcadores, bola, efeitos |
| `src/GameEngine/types.ts`, `Infrastructure/EventBus.ts`, `Domain/gameState.ts` | muda | `offsideLineX` / `lineX` |
| `src/GameEngine/Domain/OffsideLine.engine.test.ts` | novo | Teste do `lineX` |
| `src/GameInterface/MatchScreen.tsx`, `src/i18n/locales/{en,pt-BR}.json` | muda | Textos dos efeitos |
| `src/GameInterface/changelog/changelog.ts`, `package.json` | muda | 4.4 |
| `.claude/rules/graphics-engine.md`, spec | muda | Documentação |

Trabalhar numa branch: `git switch -c feat/match-pitch-visual` (a partir de `main`).

---

### Task 1: Constantes e informações do marcador

**Files:**
- Create: `src/GraficsEngine/pitchStyle.ts`
- Create: `src/GraficsEngine/markerInfo.ts`
- Test: `src/GraficsEngine/markerInfo.test.ts`

- [ ] **Step 1: Criar as constantes**

`src/GraficsEngine/pitchStyle.ts`:

```ts
/**
 * Visual constants of the live-match pitch (spec 2026-10-06-match-pitch-visual-design.md).
 * Distances in "marker radii" are multiplied by the marker radius (px); heights are in yards.
 */
import { PITCH_COLOR } from "@/GraficsEngine/playerFaces";

/** Mowing stripes across the 115-yard length; DARK is the old flat pitch colour. */
export const PITCH_STRIPES = { COUNT: 15, DARK: PITCH_COLOR, LIGHT: 0x10773a } as const;

/** Ground shadow under each marker (offsets/size in marker radii). */
export const MARKER_SHADOW = { DX: 0.25, DY: 0.35, SCALE_Y: 0.8, ALPHA: 0.3 } as const;

/** Soft glow on the ground under the ball holder (radii in marker radii). */
export const HOLDER_GLOW = { RX: 1.7, RY: 1.4, ALPHA: 0.18 } as const;

/** Card badge in the marker's top-right corner (size/position in marker radii). */
export const CARD_BADGE = { X: 0.45, Y: -1.15, W: 0.42, H: 0.58, YELLOW: 0xffd400 } as const;

/** Stamina bar under each marker: width in marker radii, height/gap in px, colours by band. */
export const FATIGUE_BAR = {
  W: 2.1, H: 4, GAP: 4, TRACK_ALPHA: 0.45,
  OK: 0x5ad16b, MID: 0xf2c94c, LOW: 0xff8a3d,
  OK_FROM: 60, MID_FROM: 40,
} as const;

/** Ball drawing: radius px, ground shadow, how a raised ball is drawn per yard of height. */
export const BALL = {
  RADIUS: 6, PATCH: 0x222222,
  SHADOW_ALPHA: 0.35, SHADOW_MIN_ALPHA: 0.1,
  LIFT_PX_PER_YD: 0.6, GROW_PER_YD: 0.06, SHADOW_SHRINK_PER_YD: 0.04, SHADOW_MIN_SCALE: 0.5,
} as const;

/** Peak height (yards) of each kind of ball in the air. */
export const BALL_HEIGHT = { CROSS: 6, LONG_BALL: 8, CLEARANCE: 5, SHOT: 1.5, HEADER: 0.5 } as const;

/** Seconds (real time) each pitch effect stays; the last FADE_SHARE of it fades out. */
export const EFFECT_DURATION = { shot: 1.5, goal: 1.5, foul: 1.5, card: 2, offside: 2 } as const;
export const EFFECT_FADE_SHARE = 0.3;

/** Ball trail: passes at least MIN_PASS_YDS long, points kept SECONDS, line width px, max alpha. */
export const TRAIL = { MIN_PASS_YDS: 20, SECONDS: 0.4, WIDTH: 4, ALPHA: 0.6 } as const;

/** Effect colours. */
export const EFFECT_COLOR = { HIGHLIGHT: 0xffd34d, WHITE: 0xffffff, RED_CARD: 0xe53935 } as const;
```

- [ ] **Step 2: Escrever o teste que falha**

`src/GraficsEngine/markerInfo.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { bookedPlayerIds, fatigueColor, fatigueFill } from "@/GraficsEngine/markerInfo";
import { FATIGUE_BAR } from "@/GraficsEngine/pitchStyle";
import type { CardRecord } from "@/GameEngine/types";

const card = (playerId: number, c: "yellow" | "red"): CardRecord => ({
  team: "A", playerId, playerName: "x", playerRosterId: "r", card: c, secondYellow: false, minute: 10,
});

describe("fatigueColor", () => {
  test("bands and limits", () => {
    expect(fatigueColor(100)).toBe(FATIGUE_BAR.OK);
    expect(fatigueColor(60)).toBe(FATIGUE_BAR.OK);
    expect(fatigueColor(59.9)).toBe(FATIGUE_BAR.MID);
    expect(fatigueColor(40)).toBe(FATIGUE_BAR.MID);
    expect(fatigueColor(39.9)).toBe(FATIGUE_BAR.LOW);
    expect(fatigueColor(0)).toBe(FATIGUE_BAR.LOW);
  });
});

describe("fatigueFill", () => {
  test("energy / 100, limited to 0..1", () => {
    expect(fatigueFill(75)).toBeCloseTo(0.75);
    expect(fatigueFill(130)).toBe(1);
    expect(fatigueFill(-5)).toBe(0);
  });
});

describe("bookedPlayerIds", () => {
  test("players with a yellow and no red", () => {
    const ids = bookedPlayerIds([card(1, "yellow"), card(2, "yellow"), card(2, "red"), card(3, "red")]);
    expect([...ids]).toEqual([1]);
  });
  test("empty list", () => {
    expect(bookedPlayerIds([]).size).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test src/GraficsEngine/markerInfo.test.ts`
Expected: FAIL (`Cannot find module '@/GraficsEngine/markerInfo'`).

- [ ] **Step 4: Implementar**

`src/GraficsEngine/markerInfo.ts`:

```ts
/** Per-player information drawn on the pitch markers (stamina bar, card badge). */
import { clamp } from "@/Domain/math";
import { FATIGUE_BAR } from "@/GraficsEngine/pitchStyle";
import type { CardRecord } from "@/GameEngine/types";

/** Stamina bar colour: green from 60, yellow from 40, orange below. */
export function fatigueColor(energy: number): number {
  if (energy >= FATIGUE_BAR.OK_FROM) return FATIGUE_BAR.OK;
  if (energy >= FATIGUE_BAR.MID_FROM) return FATIGUE_BAR.MID;
  return FATIGUE_BAR.LOW;
}

/** Filled share of the stamina bar (energy is 0..100). */
export function fatigueFill(energy: number): number {
  return clamp(energy / 100, 0, 1);
}

/** Players currently on a yellow (a red removes them from the pitch, so they never need a badge). */
export function bookedPlayerIds(cards: readonly CardRecord[]): Set<number> {
  const yellow = new Set<number>();
  const red = new Set<number>();
  for (const c of cards) (c.card === "red" ? red : yellow).add(c.playerId);
  for (const id of red) yellow.delete(id);
  return yellow;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test src/GraficsEngine/markerInfo.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add src/GraficsEngine/pitchStyle.ts src/GraficsEngine/markerInfo.ts src/GraficsEngine/markerInfo.test.ts
git commit -m "feat(pitch): constantes visuais e informacoes do marcador"
```

---

### Task 2: Altura da bola

**Files:**
- Create: `src/GraficsEngine/ballHeight.ts`
- Test: `src/GraficsEngine/ballHeight.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/GraficsEngine/ballHeight.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { arcHeight, ballHeight } from "@/GraficsEngine/ballHeight";
import { BALL_HEIGHT } from "@/GraficsEngine/pitchStyle";
import type { PassKind, PassState, ShotState } from "@/GameEngine/types";

const pass = (kind: PassKind, t: number): PassState => ({
  fromId: 1, toId: kind === "regular" ? 2 : null, toX: 80, toY: 37, kind, t,
  distance: 30, receiverOffside: false, intendedRunnerId: null,
});
const shot = (t: number, header = false): ShotState => ({
  shooterId: 1, fromX: 100, fromY: 37, toX: 115, toY: 37, t, xg: 0.3, ...(header ? { header: true } : {}),
});

describe("arcHeight", () => {
  test("zero at the ends, peak at the middle", () => {
    expect(arcHeight(6, 0)).toBe(0);
    expect(arcHeight(6, 1)).toBe(0);
    expect(arcHeight(6, 0.5)).toBeCloseTo(6);
    expect(arcHeight(6, 0.25)).toBeCloseTo(4.5);
  });
  test("t outside 0..1 is clamped", () => {
    expect(arcHeight(6, -1)).toBe(0);
    expect(arcHeight(6, 2)).toBe(0);
  });
});

describe("ballHeight", () => {
  test("ground passes and no ball in flight stay at 0", () => {
    expect(ballHeight({ pass: null, shot: null })).toBe(0);
    expect(ballHeight({ pass: pass("regular", 0.5), shot: null })).toBe(0);
    expect(ballHeight({ pass: pass("through", 0.5), shot: null })).toBe(0);
  });
  test("high balls peak at their kind's height", () => {
    expect(ballHeight({ pass: pass("cross", 0.5), shot: null })).toBeCloseTo(BALL_HEIGHT.CROSS);
    expect(ballHeight({ pass: pass("long_ball", 0.5), shot: null })).toBeCloseTo(BALL_HEIGHT.LONG_BALL);
    expect(ballHeight({ pass: pass("clearance", 0.5), shot: null })).toBeCloseTo(BALL_HEIGHT.CLEARANCE);
  });
  test("shots and headers", () => {
    expect(ballHeight({ pass: null, shot: shot(0.5) })).toBeCloseTo(BALL_HEIGHT.SHOT);
    expect(ballHeight({ pass: null, shot: shot(0.5, true) })).toBeCloseTo(BALL_HEIGHT.HEADER);
  });
  test("a shot wins over a stale pass", () => {
    expect(ballHeight({ pass: pass("cross", 0.5), shot: shot(0.5) })).toBeCloseTo(BALL_HEIGHT.SHOT);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GraficsEngine/ballHeight.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/GraficsEngine/ballHeight.ts`:

```ts
/** Illustrative height of the ball (yards) for drawing a raised ball and its ground shadow. */
import { clamp } from "@/Domain/math";
import { BALL_HEIGHT } from "@/GraficsEngine/pitchStyle";
import type { GameState } from "@/GameEngine/types";

/** Parabola with `peak` at t = 0.5 and 0 at both ends. */
export function arcHeight(peak: number, t: number): number {
  const c = clamp(t, 0, 1);
  return 4 * peak * c * (1 - c);
}

/** Height of the ball right now: high passes and shots arc, everything else is on the ground. */
export function ballHeight(state: Pick<GameState, "pass" | "shot">): number {
  if (state.shot) return arcHeight(state.shot.header ? BALL_HEIGHT.HEADER : BALL_HEIGHT.SHOT, state.shot.t);
  const p = state.pass;
  if (!p) return 0;
  if (p.kind === "cross") return arcHeight(BALL_HEIGHT.CROSS, p.t);
  if (p.kind === "long_ball") return arcHeight(BALL_HEIGHT.LONG_BALL, p.t);
  if (p.kind === "clearance") return arcHeight(BALL_HEIGHT.CLEARANCE, p.t);
  return 0;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/GraficsEngine/ballHeight.test.ts`
Expected: PASS. Se o `tsc`/teste reclamar de campo obrigatório faltando em `PassState`/`ShotState` nos objetos de
teste, completar com os campos que o tipo exige (ver `src/GameEngine/types.ts`, `interface PassState` linha ~429 e
`interface ShotState` linha ~518) sem mudar a lógica.

- [ ] **Step 5: Commit**

```bash
git add src/GraficsEngine/ballHeight.ts src/GraficsEngine/ballHeight.test.ts
git commit -m "feat(pitch): altura ilustrativa da bola"
```

---

### Task 3: Fila de efeitos, relógio e rastro

**Files:**
- Create: `src/GraficsEngine/pitchEffects.ts`
- Test: `src/GraficsEngine/pitchEffects.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/GraficsEngine/pitchEffects.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  addEffect, advanceEffectClock, effectAlpha, effectProgress, liveEffects,
  liveTrail, pushTrail, shouldTrail,
} from "@/GraficsEngine/pitchEffects";
import { EFFECT_DURATION, TRAIL } from "@/GraficsEngine/pitchStyle";
import type { PassKind, PassState, ShotState } from "@/GameEngine/types";

describe("effect clock", () => {
  test("advances only while not paused, in real seconds", () => {
    expect(advanceEffectClock(1, 0.5, false)).toBeCloseTo(1.5);
    expect(advanceEffectClock(1, 0.5, true)).toBe(1);
  });
});

describe("effect queue", () => {
  test("added with its kind's duration and expires after it", () => {
    const list = addEffect([], { kind: "foul", x: 50, y: 30 }, 10);
    expect(list).toHaveLength(1);
    expect(list[0]!.duration).toBe(EFFECT_DURATION.foul);
    expect(list[0]!.startedAt).toBe(10);
    expect(liveEffects(list, 10 + EFFECT_DURATION.foul - 0.01)).toHaveLength(1);
    expect(liveEffects(list, 10 + EFFECT_DURATION.foul)).toHaveLength(0);
  });
  test("full alpha until the fade, then down to 0", () => {
    const [e] = addEffect([], { kind: "card", x: 1, y: 1, card: "yellow", name: "A" }, 0);
    expect(effectAlpha(e!, 0)).toBe(1);
    expect(effectAlpha(e!, EFFECT_DURATION.card * 0.7)).toBeCloseTo(1);
    expect(effectAlpha(e!, EFFECT_DURATION.card * 0.85)).toBeCloseTo(0.5);
    expect(effectAlpha(e!, EFFECT_DURATION.card)).toBe(0);
  });
  test("progress 0..1", () => {
    const [e] = addEffect([], { kind: "offside", lineX: 80, x: 85, y: 30 }, 2);
    expect(effectProgress(e!, 2)).toBe(0);
    expect(effectProgress(e!, 2 + EFFECT_DURATION.offside / 2)).toBeCloseTo(0.5);
    expect(effectProgress(e!, 100)).toBe(1);
  });
});

const pass = (kind: PassKind, distance: number): PassState => ({
  fromId: 1, toId: kind === "regular" ? 2 : null, toX: 80, toY: 37, kind, t: 0.5,
  distance, receiverOffside: false, intendedRunnerId: null,
});
const shot: ShotState = { shooterId: 1, fromX: 100, fromY: 37, toX: 115, toY: 37, t: 0.5, xg: 0.3 };

describe("ball trail", () => {
  test("only shots, high balls and long passes leave a trail", () => {
    expect(shouldTrail({ pass: null, shot: null })).toBe(false);
    expect(shouldTrail({ pass: null, shot })).toBe(true);
    expect(shouldTrail({ pass: pass("cross", 10), shot: null })).toBe(true);
    expect(shouldTrail({ pass: pass("regular", TRAIL.MIN_PASS_YDS), shot: null })).toBe(true);
    expect(shouldTrail({ pass: pass("regular", TRAIL.MIN_PASS_YDS - 1), shot: null })).toBe(false);
  });
  test("points are added while flying and dropped after TRAIL.SECONDS", () => {
    let pts = pushTrail([], { x: 1, y: 1 }, 0);
    pts = pushTrail(pts, { x: 2, y: 2 }, 0.1);
    pts = pushTrail(pts, null, 0.2);
    expect(pts).toHaveLength(2);
    expect(liveTrail(pts, TRAIL.SECONDS + 0.05)).toHaveLength(1);
    expect(liveTrail(pts, TRAIL.SECONDS + 0.2)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GraficsEngine/pitchEffects.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/GraficsEngine/pitchEffects.ts`:

```ts
/**
 * Short effects drawn on the pitch (shot, goal, foul, card, offside) and the ball trail. Pure:
 * times are seconds of a real-time clock that stops while the match is paused, so effects stay
 * readable at any game speed. Positions are yards.
 */
import { clamp } from "@/Domain/math";
import { EFFECT_DURATION, EFFECT_FADE_SHARE, TRAIL } from "@/GraficsEngine/pitchStyle";
import type { GameState } from "@/GameEngine/types";
import { isAerialKind } from "@/GameEngine/types";

export type PitchEffectData =
  | { kind: "shot"; fromX: number; fromY: number; toX: number; toY: number; result: "save" | "wide" }
  | { kind: "goal"; goalX: number; goalY: number; color: number }
  | { kind: "foul"; x: number; y: number }
  | { kind: "card"; x: number; y: number; card: "yellow" | "red"; name: string }
  | { kind: "offside"; lineX: number | null; x: number; y: number };

export type PitchEffect = PitchEffectData & { startedAt: number; duration: number };

/** Real-time clock for the effects: frozen while paused. */
export function advanceEffectClock(now: number, dtSeconds: number, paused: boolean): number {
  return paused ? now : now + dtSeconds;
}

export function addEffect(list: readonly PitchEffect[], data: PitchEffectData, now: number): PitchEffect[] {
  return [...list, { ...data, startedAt: now, duration: EFFECT_DURATION[data.kind] }];
}

export function liveEffects(list: readonly PitchEffect[], now: number): PitchEffect[] {
  return list.filter((e) => now - e.startedAt < e.duration);
}

export function effectProgress(e: PitchEffect, now: number): number {
  return clamp((now - e.startedAt) / e.duration, 0, 1);
}

/** 1 until the last EFFECT_FADE_SHARE of the duration, then linearly down to 0. */
export function effectAlpha(e: PitchEffect, now: number): number {
  const p = effectProgress(e, now);
  const fadeStart = 1 - EFFECT_FADE_SHARE;
  return p <= fadeStart ? 1 : clamp((1 - p) / EFFECT_FADE_SHARE, 0, 1);
}

export interface TrailPoint { x: number; y: number; at: number }

/** Shots, high balls and passes of at least TRAIL.MIN_PASS_YDS leave a trail. */
export function shouldTrail(state: Pick<GameState, "pass" | "shot">): boolean {
  if (state.shot) return true;
  const p = state.pass;
  if (!p) return false;
  return isAerialKind(p.kind) || p.distance >= TRAIL.MIN_PASS_YDS;
}

/** Appends the ball position while it trails (`null` = not trailing now). */
export function pushTrail(points: readonly TrailPoint[], pos: { x: number; y: number } | null, now: number): TrailPoint[] {
  return pos ? [...points, { x: pos.x, y: pos.y, at: now }] : [...points];
}

export function liveTrail(points: readonly TrailPoint[], now: number): TrailPoint[] {
  return points.filter((p) => now - p.at < TRAIL.SECONDS);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/GraficsEngine/pitchEffects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/GraficsEngine/pitchEffects.ts src/GraficsEngine/pitchEffects.test.ts
git commit -m "feat(pitch): fila de efeitos e rastro da bola"
```

---

### Task 4: Linha de impedimento no evento (motor)

**Files:**
- Modify: `src/GameEngine/types.ts` (`interface PassState` ~linha 429, `interface LooseBallState` ~linha 500)
- Modify: `src/GameEngine/Infrastructure/EventBus.ts:134`
- Modify: `src/GameEngine/Domain/gameState.ts` (sites listados abaixo)
- Test: `src/GameEngine/Domain/OffsideLine.engine.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/GameEngine/Domain/OffsideLine.engine.test.ts` (mesmo molde de `Aerial.engine.test.ts`):

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState, PassState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

describe("offsideCalled carries the offside line", () => {
  test("a regular pass flagged offside at kick time reports the line snapshotted on the pass", () => {
    const f = formation433Json as Formation;
    let s: GameState = {
      ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f),
      matchPhase: "firstHalf", presentationCountdown: 0, setPiece: null,
    };
    const passer = s.players.find(p => p.team === "A" && p.role === "CM")!;
    const receiver = s.players.find(p => p.team === "A" && p.role === "ST")!;
    const pass: PassState = {
      fromId: passer.id, toId: receiver.id, toX: receiver.x, toY: receiver.y, kind: "regular", t: 0.99,
      distance: 20, receiverOffside: true, intendedRunnerId: null, offsideLineX: 83.5,
    };
    s = { ...s, ballHolderId: passer.id, pass };
    const events: GameEvents["offsideCalled"][] = [];
    const off = gameBus.on("offsideCalled", e => events.push(e));
    for (let i = 0; i < 10 && events.length === 0; i++) s = tickState(s, 0.2);
    off();
    expect(events).toHaveLength(1);
    expect(events[0]!.lineX).toBe(83.5);
  });
});
```

Se `tickState` tiver outra assinatura, conferir a usada em `Aerial.engine.test.ts` e usar a mesma.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/GameEngine/Domain/OffsideLine.engine.test.ts`
Expected: FAIL (erro de tipo em `offsideLineX`, ou `lineX` indefinido).

- [ ] **Step 3: Adicionar os campos**

Em `src/GameEngine/types.ts`, em `interface PassState` logo depois de `receiverOffside: boolean;`:

```ts
  /**
   * Offside line (x, yards) of the defending side when the pass was played — drawn by the pitch
   * when offside is called. Absent when offside doesn't apply (set pieces, offside disabled).
   */
  offsideLineX?: number;
```

E o mesmo campo em `interface LooseBallState`, logo depois do `receiverOffside: boolean;` dela (com o mesmo
comentário, trocando "pass" por "ball that became loose").

Em `src/GameEngine/Infrastructure/EventBus.ts:134`:

```ts
  offsideCalled: { team: TeamId; receiverId: number; lineX?: number };
```

- [ ] **Step 4: Gravar a linha onde o impedimento é fotografado**

Em `src/GameEngine/Domain/gameState.ts`, perto de `offsideIdsAt` (~linha 2542), adicionar:

```ts
/** Offside line (x) for a ball played by `holder` right now; undefined when offside doesn't apply. */
function offsideLineAt(holder: GamePlayer, players: GamePlayer[]): number | undefined {
  if (!OFFSIDE_CONFIG.ENABLED) return undefined;
  return computeOffsideLine(holder.attackDir, players, holder.team, holder.x) ?? undefined;
}
```

Depois, em cada criação de `PassState` que calcula impedimento, acrescentar `offsideLineX` calculado com o mesmo
passador e os mesmos jogadores usados no cálculo de `receiverOffside` / `aerialOffsideIds`:

1. `startPass` (~linha 1826, onde está `const receiverOffside = checkReceiverOffside(holder, to, state.players);`):
   no objeto `pass` que essa função devolve, junto de `receiverOffside`, acrescentar
   `offsideLineX: offsideLineAt(holder, state.players),`.
2. Bola em profundidade (~linha 2054, `receiverOffside:  runnerOffside,`): acrescentar
   `offsideLineX:     offsideLineAt(holder, state.players),` (a variável do passador nessa função é `holder`; se
   o nome for outro, usar o mesmo passado para calcular `runnerOffside`).
3. Bola alta (~linha 2678, `aerialOffsideIds: offsideIdsAt(holder, state.players),`): acrescentar
   `offsideLineX: offsideLineAt(holder, state.players),`.
4. Ajeitada de cabeça (~linha 2929, `receiverOffside: checkReceiverOffside(w, mate, s.players),`): acrescentar
   `offsideLineX: offsideLineAt(w, s.players),`.

Os passes de bola parada com `receiverOffside: false` sem cálculo (~linhas 988 e 2578) ficam sem o campo.

Nas criações de `LooseBallState` que copiam o impedimento de um passe, copiar também a linha:

5. Bola alta que cai solta (~linhas 2846 e 2876, que copiam `pass.aerialOffsideIds`): acrescentar
   `offsideLineX: pass.offsideLineX,`.
6. Bola em profundidade que vira bola solta (~linha 3947, `receiverOffside: activePass.receiverOffside,`):
   acrescentar `offsideLineX: activePass.offsideLineX,`.

- [ ] **Step 5: Passar a linha nos três eventos**

1. ~linha 2443 (bola solta): `gameBus.emit('offsideCalled', { team: winner.team, receiverId: winner.id, lineX: lb.offsideLineX });`
2. `aerialOffsideFreeKick` (~linha 2596): acrescentar o parâmetro `lineX?: number` no fim da assinatura e emitir
   `gameBus.emit('offsideCalled', { team: offender.team, receiverId: offender.id, lineX });`. Nas duas chamadas
   (~linhas 2795 e 2898) passar a linha da bola alta em voo: `pass.offsideLineX` (usar a variável do passe ativo
   naquele trecho; é a mesma de onde sai `aerialOffsideIds`).
3. ~linha 3961 (passe normal): `gameBus.emit('offsideCalled', { team: receiver.team, receiverId: receiver.id, lineX: activePass.offsideLineX });`

- [ ] **Step 6: Rodar o teste novo e os do motor**

Run: `bun test src/GameEngine/Domain/OffsideLine.engine.test.ts src/GameEngine/Domain/Aerial.engine.test.ts src/GameEngine/Domain/Fouls.engine.test.ts`
Expected: PASS.

Run: `bunx tsc --noEmit -p .`
Expected: sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add src/GameEngine/types.ts src/GameEngine/Infrastructure/EventBus.ts src/GameEngine/Domain/gameState.ts src/GameEngine/Domain/OffsideLine.engine.test.ts
git commit -m "feat(engine): offsideCalled informa a linha de impedimento do passe"
```

---

### Task 5: Gramado listrado e marcadores (sombra, posse, cartão, fôlego)

**Files:**
- Modify: `src/GraficsEngine/PixiPitch.tsx`

- [ ] **Step 1: Imports**

No topo de `PixiPitch.tsx`, depois do import de `playerFaces`:

```ts
import { CARD_BADGE, FATIGUE_BAR, HOLDER_GLOW, MARKER_SHADOW, PITCH_STRIPES } from "@/GraficsEngine/pitchStyle";
import { bookedPlayerIds, fatigueColor, fatigueFill } from "@/GraficsEngine/markerInfo";
```

- [ ] **Step 2: Faixas do gramado**

Logo antes de `function drawPitch(`:

```ts
/** Mowing stripes inside the pitch rectangle; the background (margins) stays the dark colour. */
function drawStripes(g: Graphics, m: PitchMetrics) {
  const w = m.width / PITCH_STRIPES.COUNT;
  for (let i = 1; i < PITCH_STRIPES.COUNT; i += 2) {
    g.rect(m.marginX + i * w, m.marginY, w, m.height).fill(PITCH_STRIPES.LIGHT);
  }
}
```

No setup, antes de `const pitchGraphics = new Graphics();`:

```ts
      // Mowing stripes (static, drawn once — the pitch remounts on resize)
      const stripesGraphics = new Graphics();
      drawStripes(stripesGraphics, m);
      app.stage.addChild(stripesGraphics);
```

- [ ] **Step 3: Sombra e selo de cartão em cada marcador**

Em `addPlayerSprite`, trocar a montagem do marcador por:

```ts
        const shadow = new Graphics()
          .ellipse(markerR * MARKER_SHADOW.DX, markerR * MARKER_SHADOW.DY, markerR, markerR * MARKER_SHADOW.SCALE_Y)
          .fill({ color: 0x000000, alpha: MARKER_SHADOW.ALPHA });
        const disc = new Graphics().circle(0, 0, markerR).fill(color);
        const ring = new Graphics()
          .circle(0, 0, markerR - MARKER_RING_W / 2 + 0.5).stroke({ width: MARKER_RING_W, color })
          .circle(0, 0, markerR + 0.5).stroke(player.team === "A" ? outlineA : outlineB);
        const cardBadge = new Graphics()
          .roundRect(markerR * CARD_BADGE.X, markerR * CARD_BADGE.Y, markerR * CARD_BADGE.W, markerR * CARD_BADGE.H, 2)
          .fill(CARD_BADGE.YELLOW)
          .stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        cardBadge.label = "card";
        cardBadge.visible = false;
        marker.addChild(shadow, disc, ring, cardBadge);
```

Em `setMarkerFace`, o rosto entra acima do disco: trocar `marker.addChildAt(face, 1);` por
`marker.addChildAt(face, 2); // above shadow + disc, below the ring`.

- [ ] **Step 4: Camadas por quadro (brilho da posse e barras de fôlego)**

Logo depois de `const world = new Container(); ... app.stage.addChild(world);`:

```ts
      // Ground glow under the ball holder and the stamina bars (redrawn every frame)
      const holderGlowGfx = new Graphics();
      holderGlowGfx.zIndex = -1;
      world.addChild(holderGlowGfx);
      const fatigueGfx = new Graphics();
      fatigueGfx.zIndex = 5; // with the names, under the ball
      world.addChild(fatigueGfx);
```

(`markerR` é definido mais abaixo; as camadas só usam `markerR` dentro do ticker, então não há problema de ordem.)

No ticker, trocar o laço `for (const player of stateRef.current.players) { ... }` que posiciona marcadores por:

```ts
        const booked = bookedPlayerIds(stateRef.current.cards ?? []);
        holderGlowGfx.clear();
        fatigueGfx.clear();
        const barW = markerR * FATIGUE_BAR.W;
        for (const player of stateRef.current.players) {
          const g     = playerGraphics.get(player.id);
          const label = playerLabels.get(player.id);
          if (!g) continue;
          const { px, py } = toPixel(player.x, player.y);
          g.x = px;
          g.y = py;
          const badge = g.getChildByLabel("card");
          if (badge) badge.visible = booked.has(player.id);
          if (label) {
            if (label.text !== player.name) label.text = player.name;
            label.x = px;
            label.y = py - (markerR + 3);
          }
          if (player.id === stateRef.current.ballHolderId) {
            holderGlowGfx
              .ellipse(px, py + markerR * 0.2, markerR * HOLDER_GLOW.RX, markerR * HOLDER_GLOW.RY)
              .fill({ color: 0xffffff, alpha: HOLDER_GLOW.ALPHA });
          }
          const barX = px - barW / 2;
          const barY = py + markerR + FATIGUE_BAR.GAP;
          fatigueGfx
            .roundRect(barX, barY, barW, FATIGUE_BAR.H, 2)
            .fill({ color: 0x000000, alpha: FATIGUE_BAR.TRACK_ALPHA });
          const fill = fatigueFill(player.energy);
          if (fill > 0) {
            fatigueGfx.roundRect(barX, barY, barW * fill, FATIGUE_BAR.H, 2).fill(fatigueColor(player.energy));
          }
        }
```

Conferir que `GamePlayer` tem `energy` (`src/GameEngine/types.ts`); se `cards` for obrigatório em `GameState`, tirar o
`?? []`.

- [ ] **Step 5: Tipos e testes do GraficsEngine**

Run: `bunx tsc --noEmit -p .` e `bun test src/GraficsEngine`
Expected: sem erros; testes passam.

- [ ] **Step 6: Commit**

```bash
git add src/GraficsEngine/PixiPitch.tsx
git commit -m "feat(pitch): gramado listrado, sombras, brilho da posse, cartao e folego nos jogadores"
```

---

### Task 6: Bola desenhada, sombra e altura

**Files:**
- Modify: `src/GraficsEngine/PixiPitch.tsx`

- [ ] **Step 1: Imports**

```ts
import { BALL } from "@/GraficsEngine/pitchStyle";   // juntar ao import de pitchStyle já existente
import { ballHeight } from "@/GraficsEngine/ballHeight";
```

- [ ] **Step 2: Montar a bola e a sombra**

Trocar o bloco `// ── Ball ──` por:

```ts
      // ── Ball ──
      // Ground shadow (stays on the ground) + the ball, lifted by its illustrative height.
      const ballShadow = new Graphics()
        .ellipse(0, 0, BALL.RADIUS, BALL.RADIUS * 0.6)
        .fill({ color: 0x000000, alpha: 1 });
      ballShadow.zIndex = -1;
      world.addChild(ballShadow);

      const ball = new Container();
      const r = BALL.RADIUS;
      const patch: number[] = [];
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        patch.push(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      }
      ball.addChild(
        new Graphics()
          .circle(0, 0, r).fill(0xffffff)
          .poly(patch).fill(BALL.PATCH)
          .circle(0, 0, r).stroke({ width: 1, color: 0x000000, alpha: 0.35 }),
      );
      ball.zIndex = 10; // always render on top of player sprites
      world.addChild(ball);
```

- [ ] **Step 3: Posicionar por quadro**

Trocar o bloco `// Ball: game coords → pixels` por:

```ts
        // Ball: game coords → pixels; a raised ball is drawn higher and bigger, its shadow stays below.
        const ballPos = getBallPos(stateRef.current);
        const { px: bx, py: by } = toPixel(ballPos.x, ballPos.y);
        const h = ballHeight(stateRef.current);
        ball.x = bx;
        ball.y = by - h * m.scale * BALL.LIFT_PX_PER_YD;
        ball.scale.set(1 + h * BALL.GROW_PER_YD);
        ballShadow.x = bx + 1.5;
        ballShadow.y = by + 2;
        ballShadow.scale.set(Math.max(BALL.SHADOW_MIN_SCALE, 1 - h * BALL.SHADOW_SHRINK_PER_YD));
        ballShadow.alpha = Math.max(BALL.SHADOW_MIN_ALPHA, BALL.SHADOW_ALPHA * (1 - h / 12));
```

Se algum outro trecho de `PixiPitch.tsx` usar `ball` como `Graphics` (ex.: `ball.clear()`), procurar com
`grep -n "ball\." src/GraficsEngine/PixiPitch.tsx` e ajustar para o `Container`.

- [ ] **Step 4: Tipos e testes**

Run: `bunx tsc --noEmit -p .` e `bun test src/GraficsEngine`
Expected: sem erros; testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/GraficsEngine/PixiPitch.tsx
git commit -m "feat(pitch): bola de futebol com sombra e altura nas bolas altas"
```

---

### Task 7: Efeitos no gramado

**Files:**
- Create: `src/GraficsEngine/effectsRender.ts`
- Modify: `src/GraficsEngine/PixiPitch.tsx`
- Modify: `src/GameInterface/MatchScreen.tsx` (~linha 995, `<PixiPitch`)
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json` (bloco `"match"`)

- [ ] **Step 1: Desenho dos efeitos**

`src/GraficsEngine/effectsRender.ts`:

```ts
/** Pixi drawing of the pitch effects and the ball trail (state lives in pitchEffects.ts). */
import type { Graphics } from "pixi.js";
import { EFFECT_COLOR, TRAIL } from "@/GraficsEngine/pitchStyle";
import { effectAlpha, effectProgress, type PitchEffect, type TrailPoint } from "@/GraficsEngine/pitchEffects";
import { GOAL_Y_MIN, GOAL_Y_MAX, PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

export interface EffectCtx {
  toPixel: (x: number, y: number) => { px: number; py: number };
  scale: number;       // px per yard
  markerR: number;     // marker radius px
  netDepth: number;    // goal net depth px
}

function dashed(g: Graphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, width = 2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  for (let d = 0; d < len; d += 10) {
    const e = Math.min(len, d + 6);
    g.moveTo(x1 + ux * d, y1 + uy * d).lineTo(x1 + ux * e, y1 + uy * e);
  }
  g.stroke({ width, color, alpha });
}

export function drawTrail(g: Graphics, points: readonly TrailPoint[], now: number, ctx: EffectCtx) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const age = now - b.at;
    const alpha = TRAIL.ALPHA * Math.max(0, 1 - age / TRAIL.SECONDS) * (i / points.length);
    if (alpha <= 0) continue;
    const pa = ctx.toPixel(a.x, a.y), pb = ctx.toPixel(b.x, b.y);
    g.moveTo(pa.px, pa.py).lineTo(pb.px, pb.py).stroke({ width: TRAIL.WIDTH, color: 0xffffff, alpha, cap: "round" });
  }
}

export function drawEffect(g: Graphics, e: PitchEffect, now: number, ctx: EffectCtx) {
  const a = effectAlpha(e, now);
  const p = effectProgress(e, now);
  const R = ctx.markerR;
  switch (e.kind) {
    case "shot": {
      const from = ctx.toPixel(e.fromX, e.fromY), to = ctx.toPixel(e.toX, e.toY);
      dashed(g, from.px, from.py, to.px, to.py, EFFECT_COLOR.HIGHLIGHT, a);
      g.circle(to.px, to.py, R * 0.5 * (1 + p)).stroke({ width: 2, color: EFFECT_COLOR.HIGHLIGHT, alpha: a });
      g.circle(to.px, to.py, R * (1 + p)).stroke({ width: 2, color: EFFECT_COLOR.HIGHLIGHT, alpha: a * 0.6 });
      return;
    }
    case "goal": {
      const top = ctx.toPixel(e.goalX, GOAL_Y_MIN), bot = ctx.toPixel(e.goalX, GOAL_Y_MAX);
      const outward = e.goalX > PITCH_LENGTH / 2 ? 1 : -1; // right goal bulges right
      const bulge = ctx.netDepth * (1 + 0.8 * Math.sin(Math.PI * p)) * outward;
      g.moveTo(top.px, top.py).quadraticCurveTo(top.px + bulge * 1.6, (top.py + bot.py) / 2, bot.px, bot.py)
        .stroke({ width: 2, color: EFFECT_COLOR.WHITE, alpha: a });
      const mouth = ctx.toPixel(e.goalX, e.goalY);
      for (let i = 0; i < 12; i++) {
        const ang = Math.PI / 2 + (i / 11 - 0.5) * Math.PI * 0.9;      // fan towards the pitch
        const dist = (R * 2 + (i % 4) * R * 0.8) * p;
        const x = mouth.px - outward * Math.sin(ang) * dist;
        const y = mouth.py - Math.cos(ang) * dist * 1.2;
        g.circle(x, y, 2.5).fill({ color: i % 3 === 0 ? EFFECT_COLOR.WHITE : e.color, alpha: a });
      }
      return;
    }
    case "foul": {
      const { px, py } = ctx.toPixel(e.x, e.y);
      const s = R * 0.6;
      g.moveTo(px - s, py - s).lineTo(px + s, py + s).moveTo(px + s, py - s).lineTo(px - s, py + s)
        .stroke({ width: 3, color: EFFECT_COLOR.WHITE, alpha: a });
      return;
    }
    case "card": {
      const { px, py } = ctx.toPixel(e.x, e.y);
      const cx = px, cy = py - R * 1.8 - p * R;
      const w = R * 0.7, h = R;
      const ang = 0.35 * Math.sin(p * Math.PI * 2);
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
        .flatMap(([x, y]) => [cx + x! * cos - y! * sin, cy + x! * sin + y! * cos]);
      g.poly(corners).fill({ color: e.card === "red" ? EFFECT_COLOR.RED_CARD : 0xffd400, alpha: a })
        .stroke({ width: 1, color: 0x000000, alpha: 0.4 * a });
      return;
    }
    case "offside": {
      const { px, py } = ctx.toPixel(e.x, e.y);
      if (e.lineX !== null) {
        const t = ctx.toPixel(e.lineX, 0), b = ctx.toPixel(e.lineX, PITCH_WIDTH);
        dashed(g, t.px, t.py, b.px, b.py, EFFECT_COLOR.HIGHLIGHT, a);
      }
      g.circle(px, py, R * 1.4).stroke({ width: 2, color: EFFECT_COLOR.HIGHLIGHT, alpha: a });
      return;
    }
  }
}

/** Where an effect's text goes (px), or null when it has none. */
export function effectTextAnchor(e: PitchEffect, now: number, ctx: EffectCtx): { x: number; y: number } | null {
  const R = ctx.markerR;
  switch (e.kind) {
    case "shot": { const to = ctx.toPixel(e.toX, e.toY); return { x: to.px, y: to.py - R * 2.4 }; }
    case "card": { const { px, py } = ctx.toPixel(e.x, e.y); return { x: px, y: py - R * 3 - effectProgress(e, now) * R }; }
    case "offside": { const { px, py } = ctx.toPixel(e.x, e.y); return { x: px, y: py - R * 2.4 }; }
    default: return null;
  }
}
```

- [ ] **Step 2: Textos traduzidos (prop opcional)**

Em `PixiPitch.tsx`, na `interface Props`:

```ts
  /** Texts drawn by the pitch effects; English defaults (the live match passes translations). */
  effectLabels?: { save: string; wide: string; offside: string };
```

Desestruturar `effectLabels` junto das outras props e guardar num ref:
`const effectLabelsRef = useRef(effectLabels); useEffect(() => { effectLabelsRef.current = effectLabels; }, [effectLabels]);`
com o padrão `const labelsOf = () => effectLabelsRef.current ?? { save: "SAVE", wide: "WIDE", offside: "OFFSIDE" };`.

Em `src/i18n/locales/pt-BR.json`, dentro de `"match": {`, acrescentar:

```json
    "effects": { "save": "DEFESA", "wide": "PRA FORA", "offside": "IMPEDIMENTO" },
```

Em `src/i18n/locales/en.json`, no mesmo lugar:

```json
    "effects": { "save": "SAVE", "wide": "WIDE", "offside": "OFFSIDE" },
```

Em `MatchScreen.tsx`, no `<PixiPitch ...>`, acrescentar a prop (com `useMemo` para não recriar o objeto a cada render):

```tsx
                  effectLabels={effectLabels}
```

e, no corpo do componente junto dos outros `useMemo`:

```tsx
  const effectLabels = useMemo(
    () => ({ save: t("match.effects.save"), wide: t("match.effects.wide"), offside: t("match.effects.offside") }),
    [t],
  );
```

(importar `useMemo` de `react` se ainda não estiver importado).

- [ ] **Step 3: Estado e eventos no setup do PixiPitch**

Imports:

```ts
import {
  addEffect, advanceEffectClock, effectAlpha, liveEffects, liveTrail, pushTrail, shouldTrail,
  type PitchEffect, type TrailPoint,
} from "@/GraficsEngine/pitchEffects";
import { drawEffect, drawTrail, effectTextAnchor, type EffectCtx } from "@/GraficsEngine/effectsRender";
import type { ShotState } from "@/GameEngine/types";
```

Depois da criação da bola (Task 6), acrescentar:

```ts
      // ── Pitch effects (shot, goal, foul, card, offside) + ball trail ──
      const effectsGfx = new Graphics();
      effectsGfx.zIndex = 8; // above names, below the ball
      world.addChild(effectsGfx);
      const effectTexts = new Map<PitchEffect, Text>();
      const effectTextStyle = new TextStyle({
        fontSize: Math.round(markerR * 0.9),
        fontFamily: '"Barlow Condensed", sans-serif',
        fontWeight: '700',
        fill: 0xffffff,
        dropShadow: { color: 0x000000, blur: 3, distance: 0, alpha: 0.9 },
      });
      const effectCtx: EffectCtx = { toPixel, scale: m.scale, markerR, netDepth: m.goalNetDepth };
      let effectNow = 0;
      let effects: PitchEffect[] = [];
      let trail: TrailPoint[] = [];
      let lastShot: ShotState | null = null;

      const pushEffect = (data: Parameters<typeof addEffect>[1], text?: string) => {
        effects = addEffect(effects, data, effectNow);
        if (text) {
          const t = new Text({ text, style: effectTextStyle });
          t.anchor.set(0.5, 1);
          t.zIndex = 9;
          world.addChild(t);
          effectTexts.set(effects[effects.length - 1]!, t);
        }
      };
      const playerPos = (id: number) => stateRef.current.players.find((p) => p.id === id);

      const unsubShotFx = gameBus.on("shotResolved", (e) => {
        if (e.isGoal || !lastShot) return;
        const s = lastShot;
        const labels = labelsOf();
        pushEffect(
          { kind: "shot", fromX: s.fromX, fromY: s.fromY, toX: s.toX, toY: s.toY, result: e.inPosts ? "save" : "wide" },
          e.inPosts ? labels.save : labels.wide,
        );
      });
      const unsubGoalFx = gameBus.on("goalScored", (e) => {
        const dir = stateRef.current.players.find((p) => p.team === e.team)?.attackDir ?? 1;
        const goalX = lastShot ? lastShot.toX : dir === 1 ? PITCH_LENGTH : 0;
        const goalY = lastShot ? lastShot.toY : PITCH_WIDTH / 2;
        pushEffect({ kind: "goal", goalX, goalY, color: e.team === "A" ? fillA : fillB });
      });
      const unsubFoulFx = gameBus.on("foul", (e) => pushEffect({ kind: "foul", x: e.x, y: e.y }));
      const unsubCardFx = gameBus.on("card", (e) => {
        const p = playerPos(e.playerId);
        if (!p) return;
        pushEffect({ kind: "card", x: p.x, y: p.y, card: e.card, name: e.playerName }, e.playerName);
      });
      const unsubOffsideFx = gameBus.on("offsideCalled", (e) => {
        const p = playerPos(e.receiverId);
        if (!p) return;
        pushEffect({ kind: "offside", lineX: e.lineX ?? null, x: p.x, y: p.y }, labelsOf().offside);
      });
```

`labelsOf` é a função criada no Step 2 (fora do `useEffect`, lendo o ref). `fillA`/`fillB` já existem no setup.

- [ ] **Step 4: Atualizar e desenhar a cada quadro**

No ticker, logo depois do bloco da bola (Task 6):

```ts
        // ── Pitch effects + trail (real-time clock, frozen while paused) ──
        effectNow = advanceEffectClock(effectNow, app.ticker.deltaMS / 1000, pausedRef.current);
        const st = stateRef.current;
        if (st.shot) lastShot = st.shot;
        trail = liveTrail(pushTrail(trail, !pausedRef.current && shouldTrail(st) ? getBallPos(st) : null, effectNow), effectNow);
        effects = liveEffects(effects, effectNow);
        for (const [fx, txt] of effectTexts) {
          if (!effects.includes(fx)) { world.removeChild(txt); txt.destroy(); effectTexts.delete(fx); }
        }
        effectsGfx.clear();
        drawTrail(effectsGfx, trail, effectNow, effectCtx);
        for (const fx of effects) {
          drawEffect(effectsGfx, fx, effectNow, effectCtx);
          const txt = effectTexts.get(fx);
          const at = txt ? effectTextAnchor(fx, effectNow, effectCtx) : null;
          if (txt && at) { txt.x = at.x; txt.y = at.y; txt.alpha = effectAlpha(fx, effectNow); }
        }
```

- [ ] **Step 5: Limpeza**

No `return () => { ... }` do setup, junto dos outros `unsub*()`:

```ts
        unsubShotFx();
        unsubGoalFx();
        unsubFoulFx();
        unsubCardFx();
        unsubOffsideFx();
```

- [ ] **Step 6: Tipos, testes e auditoria**

Run: `bunx tsc --noEmit -p .`, `bun test src/GraficsEngine src/GameEngine/Domain/OffsideLine.engine.test.ts`, `bun run ui:audit --hard`
Expected: sem erros; testes passam; auditoria sem violações duras.

- [ ] **Step 7: Commit**

```bash
git add src/GraficsEngine/effectsRender.ts src/GraficsEngine/PixiPitch.tsx src/GameInterface/MatchScreen.tsx src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat(pitch): efeitos no gramado (rastro, chute, gol, falta, cartao, impedimento)"
```

---

### Task 8: Versão 4.4, documentação

**Files:**
- Modify: `src/GameInterface/changelog/changelog.ts`, `package.json`
- Modify: `.claude/rules/graphics-engine.md`
- Modify: `docs/superpowers/specs/2026-10-06-match-pitch-visual-design.md` (tabela de arquivos: `fatigue.ts` → `markerInfo.ts`, acrescentar `effectsRender.ts`)

- [ ] **Step 1: Changelog**

No início do array `changelog`:

```ts
  {
    version: "4.4",
    date: "2026-10-06",
    items: [
      { pt: "Campo da partida renovado: gramado listrado, sombras e bola de verdade que sobe nos cruzamentos", en: "Refreshed match pitch: striped grass, shadows and a real ball that rises on crosses" },
      { pt: "Cada jogador mostra o fôlego, o cartão amarelo e quem está com a bola", en: "Every player shows stamina, yellow cards and who has the ball" },
      { pt: "Lances marcados no gramado: chutes, defesas, gols, faltas, cartões e impedimentos", en: "Plays marked on the pitch: shots, saves, goals, fouls, cards and offsides" },
    ],
  },
```

`package.json`: `"version": "4.4",` (editar com a ferramenta de edição, nunca com PowerShell `Set-Content`; conferir
que o arquivo continua começando com `{`). `upcoming` não muda (esta não é uma etapa do roadmap).

- [ ] **Step 2: Regra do GraficsEngine**

Em `.claude/rules/graphics-engine.md`, na seção `## Files`, acrescentar:

```md
- `pitchStyle.ts` — every visual constant of the live pitch (stripes, shadows, stamina bar, ball, effects)
- `markerInfo.ts` — stamina bar colour/fill, booked players (card badge)
- `ballHeight.ts` — illustrative ball height for high balls and shots (raised ball + ground shadow)
- `pitchEffects.ts` — pure effect queue (shot, goal, foul, card, offside) and ball trail, on a real-time clock frozen while paused
- `effectsRender.ts` — Pixi drawing of the effects and the trail
```

E uma linha em "Responsibilities": `- Pitch effects listen to gameBus events (shotResolved, goalScored, foul, card, offsideCalled) inside PixiPitch; spec docs/superpowers/specs/2026-10-06-match-pitch-visual-design.md`.

- [ ] **Step 3: Testes do changelog**

Run: `bun test src/GameInterface/changelog`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/GameInterface/changelog/changelog.ts package.json .claude/rules/graphics-engine.md docs/superpowers/specs/2026-10-06-match-pitch-visual-design.md
git commit -m "chore(release): 4.4 visual do campo"
```

---

### Task 9: Verificação completa

- [ ] **Step 1: Suíte inteira** (em partes, cada comando < 590 s)

```bash
bun test $(ls -d src/*/ | grep -v backend) scripts
ls src/backend/*.test.ts src/backend/*/*.test.ts | split -n l/5 -d - /tmp/bk_   # e rodar cada parte com bun test
```

Expected: tudo passa.

- [ ] **Step 2: Navegador (servidor de desenvolvimento)**

```powershell
$env:DEV_AUTO_LOGIN="1"; $env:PORT="3456"; Start-Process bun -ArgumentList "run","dev" -WorkingDirectory "C:\Projects\FMProject"
```

Abrir `http://localhost:3456/api/auth/dev-login`, carregar/criar uma carreira, jogar uma partida em 1× e em 4×.
Conferir: faixas do gramado, sombras, brilho de quem tem a bola, barrinhas mudando de cor ao longo do jogo, selo de
amarelo, bola subindo em cruzamento/lançamento com a sombra embaixo, rastro, os cinco efeitos (com texto em
português), pausa congelando os efeitos, nada preso na tela, sem erros no console. Abrir `/test` (servidor do lab)
com e sem debug. Ao final, parar o servidor pelo PID do processo iniciado (nunca matar todos os `bun`).

- [ ] **Step 3: Corrigir o que aparecer e commitar**

```bash
git add -A src
git commit -m "fix(pitch): ajustes da verificacao visual"
```
