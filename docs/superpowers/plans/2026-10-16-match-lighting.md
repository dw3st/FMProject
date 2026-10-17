# Luz e sombra da partida — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A partida ao vivo desenha a luz do horário e do clima do jogo (sol e sombras, fim de tarde, noite com refletores, nublado, chuva e neve com partículas), acompanhando o relógio do jogo.

**Architecture:** Regras puras: `matchConditions` ganha `sunset`; `src/Domain/matchday/stadiumSun.ts` dá o lado do sol de cada estádio; `src/GraficsEngine/matchLighting.ts` transforma `{ hora do jogo, pôr do sol, clima, lado do sol }` numa descrição da luz (véus, sombra da arquibancada, sombras dos jogadores, refletores); `src/GraficsEngine/weatherParticles.ts` dá as partículas. O `PixiPitch` ganha a prop `lighting` e desenha uma camada de luz (redesenhada a cada minuto de jogo), as sombras dos marcadores e as partículas. O `match-setup` devolve `conditions` e `sunSide`.

**Tech Stack:** Bun + TypeScript, React 19, Pixi v8. Spec: `docs/superpowers/specs/2026-10-16-match-lighting-design.md`.

**Regras do projeto:** imports sempre `@/…`; só desenho (nada no `GameState`, motor, quickSim, `/lab`); `bunx tsc --noEmit` tem um erro antigo em `DecisionTree.ts:750` (ignorar); UI segue `.claude/rules/ui-standard.md` (o `/test` é tela de debug).

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/matchday/matchConditions.ts` (+ teste) | `MatchConditions.sunset` |
| `src/Domain/matchday/stadiumSun.ts` (+ teste) | **novo**: `stadiumSunSide(id)` |
| `src/GraficsEngine/pitchStyle.ts` | `LIGHTING` |
| `src/GraficsEngine/matchLighting.ts` (+ teste) | **novo**: `matchClockMinutes`, `matchLighting` |
| `src/GraficsEngine/weatherParticles.ts` (+ teste) | **novo**: `weatherParticles`, `particleAt` |
| `src/backend/routes.ts` | `match-setup` → `conditions`, `sunSide` |
| `src/GraficsEngine/PixiPitch.tsx` | prop `lighting`, camada de luz, sombras, partículas |
| `src/GameInterface/MatchScreen.tsx` | passa `lighting` |
| `src/GameInterface/TestScreen.tsx` | botões Hora e Clima |
| `.claude/rules/graphics-engine.md`, `match-flow.md` | regras |
| `src/GameInterface/changelog/changelog.ts`, `package.json` | 4.29 |

---

### Task 1: `sunset` nas condições e o lado do sol do estádio

**Files:**
- Modify: `src/Domain/matchday/matchConditions.ts`
- Create: `src/Domain/matchday/stadiumSun.ts`
- Test: `src/Domain/matchday/matchConditions.test.ts` (acrescentar; criar se não existir), `src/Domain/matchday/stadiumSun.test.ts`

- [ ] **Step 1: Testes que falham.** Em `matchConditions.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SUNSET, matchConditions } from "@/Domain/matchday/matchConditions";

describe("matchConditions sunset", () => {
  test("sunset is the season's (north summer, south winter), and night follows it", () => {
    const july = matchConditions({ date: "2027-07-10", home: "a", away: "b" }, "England");
    expect(july.sunset).toBe(SUNSET.summer);
    expect(july.night).toBe(july.kickoff >= july.sunset);
    const julySouth = matchConditions({ date: "2027-07-10", home: "a", away: "b" }, "Brazil");
    expect(julySouth.sunset).toBe(SUNSET.winter);
    expect(matchConditions({ date: "2027-07-10", home: "a", away: "b" }, "Kenya").sunset).toBe(SUNSET.tropical);
  });
});
```

`stadiumSun.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { stadiumSunSide } from "@/Domain/matchday/stadiumSun";

describe("stadiumSunSide", () => {
  test("deterministic, both sides used, lean in -1..1", () => {
    expect(stadiumSunSide("33")).toEqual(stadiumSunSide("33"));
    const all = Array.from({ length: 200 }, (_, i) => stadiumSunSide(`c${i}`));
    expect(new Set(all.map((s) => s.side))).toEqual(new Set(["top", "bottom"]));
    for (const s of all) { expect(s.lean).toBeGreaterThanOrEqual(-1); expect(s.lean).toBeLessThanOrEqual(1); }
  });
});
```

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/Domain/matchday`. Expected: FAIL.

- [ ] **Step 3: Implementação.** Em `matchConditions.ts`: `MatchConditions` ganha

```ts
  /** Local sunset "HH:MM" of that day (`SUNSET` by season or climate); `night` = kickoff ≥ sunset. */
  sunset: string;
```

e o `return` vira `return { kickoff, weather: night ? (NIGHT_WEATHER[drawn] ?? drawn) : drawn, night, sunset: SUNSET[key] };` (nenhum sorteio a mais). Atualize o comentário do topo ("Cosmetic match-day details…") para dizer que a partida ao vivo também usa (luz do campo).

`src/Domain/matchday/stadiumSun.ts`:

```ts
import { mulberry32, seedFrom } from "@/Domain/rng";

/**
 * Where the sun sets over a stadium (spec 2026-10-16-match-lighting): which touchline (engine yards: "top" = y 0,
 * "bottom" = y 74) and a lean toward one end (−1 = the x 0 end, +1 = the x 115 end). Drawn from the club id:
 * the same stadium always has the same orientation. Drawing only.
 */
export interface StadiumSun {
  side: "top" | "bottom";
  lean: number;
}

export function stadiumSunSide(id: string): StadiumSun {
  const rng = mulberry32(seedFrom(`sun:${id}`));
  const side = rng() < 0.5 ? "top" : "bottom";
  const lean = Math.round((rng() * 2 - 1) * 100) / 100;
  return { side, lean };
}
```

- [ ] **Step 4: Rode e veja passar.** Run: `bun test src/Domain/matchday` e `bunx tsc --noEmit 2>&1 | grep -v DecisionTree.ts | head` (se algum consumidor monta `MatchConditions` à mão, acrescente `sunset`). Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/matchday
git commit -m "feat(lighting): pôr do sol nas condições da partida e lado do sol do estádio"
```

---

### Task 2: Hora do jogo e descrição da luz (puro)

**Files:**
- Modify: `src/GraficsEngine/pitchStyle.ts`
- Create: `src/GraficsEngine/matchLighting.ts`
- Test: `src/GraficsEngine/matchLighting.test.ts`

- [ ] **Step 1: Constantes.** Em `pitchStyle.ts`:

```ts
/**
 * Match light by the time of day and the weather (spec 2026-10-16-match-lighting). Minutes are relative to sunset.
 * Shadow sizes in marker radii; stand shadow depth as a fraction of the pitch width.
 */
export const LIGHTING = {
  GOLDEN_FROM: -90, DUSK_FROM: -30, NIGHT_FROM: 30,
  WARM: { COLOR: 0xffb347, MAX: 0.1 },
  NIGHT: { COLOR: 0x061a33, MAX: 0.38, VIGNETTE: 0.45, FLOOD: 0.22 },
  STAND: { MIN_DEPTH: 0.08, MAX_DEPTH: 0.5, ALPHA: 0.3, LEAN: 0.3 },
  SUN_SHADOW: { ALPHA: 0.35, LEN: 1.8, LEN_GOLDEN: 3.4, WIDTH: 0.6 },
  FLOOD_SHADOW: { ALPHA: 0.2, LEN: 1.4, WIDTH: 0.5 },
  /** Share of the sun's shadows kept by each weather; the rest is a grey veil. */
  SUN_BY_WEATHER: { sunny: 1, clear: 1, hot: 1, wind: 1, cold: 0.5, partlyCloudy: 0.5, cloudy: 0, rain: 0, snow: 0 },
  VEIL: { COLOR: 0x6a7a80, BY_WEATHER: { partlyCloudy: 0.05, cloudy: 0.14, rain: 0.2, snow: 0.12, cold: 0.06 } },
} as const;
```

- [ ] **Step 2: Testes que falham.** `src/GraficsEngine/matchLighting.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { matchClockMinutes, matchLighting, minutesOf } from "@/GraficsEngine/matchLighting";

const sun = { side: "top" as const, lean: 0 };

describe("matchClockMinutes", () => {
  const base = { extraTimeFirst: 120, extraTimeSecond: 180, etStoppageFirst: 60 };
  test("halves, break and extra time", () => {
    const k = minutesOf("17:30");
    expect(matchClockMinutes({ ...base, matchPhase: "preMatch", matchTime: 0 }, k)).toBe(k);
    expect(matchClockMinutes({ ...base, matchPhase: "firstHalf", matchTime: 600 }, k)).toBe(k + 10);
    expect(matchClockMinutes({ ...base, matchPhase: "halfTime", matchTime: 0 }, k)).toBe(k + 47);
    expect(matchClockMinutes({ ...base, matchPhase: "secondHalf", matchTime: 0 }, k)).toBe(k + 62);
    expect(matchClockMinutes({ ...base, matchPhase: "secondHalf", matchTime: 2700 }, k)).toBe(k + 107);
    expect(matchClockMinutes({ ...base, matchPhase: "extraTimeFirst", matchTime: 0 }, k)).toBe(k + 107 + 3 + 5);
    expect(matchClockMinutes({ ...base, matchPhase: "extraTimeSecond", matchTime: 0 }, k)).toBe(k + 107 + 3 + 5 + 16);
  });
});

describe("matchLighting", () => {
  const at = (clock: number, weather = "sunny" as const) => matchLighting({ clock, sunset: minutesOf("19:00"), weather, sun });
  const S = minutesOf("19:00");

  test("day: no darkness, short stand shadow, one sun shadow", () => {
    const l = at(S - 180);
    expect(l.dark.alpha).toBe(0);
    expect(l.flood).toBe(0);
    expect(l.stand.depth).toBeCloseTo(0.08, 5);
    expect(l.shadows).toHaveLength(1);
  });

  test("golden hour grows the stand shadow and the warm tint; continuous across the bands", () => {
    expect(at(S - 30).stand.depth).toBeCloseTo(0.5, 5);
    expect(at(S - 30).warm.alpha).toBeGreaterThan(at(S - 90).warm.alpha);
    for (const edge of [S - 90, S - 30, S + 30]) {
      const a = at(edge - 0.01), b = at(edge + 0.01);
      expect(Math.abs(a.dark.alpha - b.dark.alpha)).toBeLessThan(0.01);
      expect(Math.abs(a.stand.alpha - b.stand.alpha)).toBeLessThan(0.01);
    }
  });

  test("night: dark, floodlights on, four flood shadows, no sun", () => {
    const l = at(S + 60);
    expect(l.dark.alpha).toBeCloseTo(0.38, 5);
    expect(l.flood).toBe(1);
    expect(l.stand.alpha).toBe(0);
    expect(l.shadows).toHaveLength(4);
  });

  test("clouds take the sun's shadows away and add a veil", () => {
    const l = at(S - 180, "cloudy");
    expect(l.shadows).toHaveLength(0);
    expect(l.stand.alpha).toBe(0);
    expect(l.veil.alpha).toBeGreaterThan(0);
  });

  test("sun on the top touchline: shadows point down (+y), the stand shadow is the top one", () => {
    const l = at(S - 180);
    expect(l.stand.side).toBe("top");
    expect(l.shadows[0]!.dy).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Rode e veja falhar.** Run: `bun test src/GraficsEngine/matchLighting.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implementação.** `src/GraficsEngine/matchLighting.ts`:

```ts
import { LIGHTING as L } from "@/GraficsEngine/pitchStyle";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";
import type { StadiumSun } from "@/Domain/matchday/stadiumSun";
import type { MatchPhase } from "@/GameEngine/types";

/**
 * Light of the live match (spec 2026-10-16-match-lighting): the time of the match from the kickoff and the match
 * clock, and what that time and the weather look like. Pure; drawing only.
 */

/** "HH:MM" → minutes since midnight. */
export const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const HALF = 45;
const BREAK = 15;
const ET_BREAK = 5;
const ET_HALF = 15;

export interface ClockState {
  matchPhase: MatchPhase;
  matchTime: number;
  extraTimeFirst: number;
  extraTimeSecond: number;
  etStoppageFirst?: number;
}

/** Local time (minutes since midnight) of the match: kickoff + played time + breaks + stoppage. */
export function matchClockMinutes(s: ClockState, kickoff: number): number {
  const t = s.matchTime / 60;
  const ef = s.extraTimeFirst / 60;
  const es = s.extraTimeSecond / 60;
  const etf = (s.etStoppageFirst ?? 0) / 60;
  const secondStart = HALF + ef + BREAK;
  const regEnd = secondStart + HALF + es;
  switch (s.matchPhase) {
    case "preMatch": return kickoff;
    case "firstHalf": return kickoff + t;
    case "halfTime": return kickoff + HALF + ef;
    case "secondHalf": return kickoff + secondStart + t;
    case "extraTimeBreak": return kickoff + regEnd;
    case "extraTimeFirst": return kickoff + regEnd + ET_BREAK + t;
    case "extraTimeSecond": return kickoff + regEnd + ET_BREAK + ET_HALF + etf + t;
    default: return kickoff + regEnd + ET_BREAK + 2 * ET_HALF + etf;
  }
}

/** One player shadow, relative to the marker centre, in marker radii (rotation in radians). */
export interface ShadowSpec { dx: number; dy: number; rx: number; ry: number; rotation: number; alpha: number }

export interface Lighting {
  warm: { color: number; alpha: number };
  dark: { color: number; alpha: number };
  veil: { color: number; alpha: number };
  /** 0..1: floodlights on (night glow in the corners, vignette). */
  flood: number;
  vignette: number;
  /** Stand shadow from the sun's touchline: depth = fraction of the pitch width (74 yd). */
  stand: { side: "top" | "bottom"; depth: number; lean: number; alpha: number };
  /** Extra shadows of every player (the small contact shadow under the marker stays as it is). */
  shadows: ShadowSpec[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function matchLighting(input: { clock: number; sunset: number; weather: MatchWeather; sun: StadiumSun }): Lighting {
  const mins = input.clock - input.sunset;
  const golden = clamp01((mins - L.GOLDEN_FROM) / (L.DUSK_FROM - L.GOLDEN_FROM));
  const sunUp = clamp01((L.NIGHT_FROM - mins) / (L.NIGHT_FROM - L.DUSK_FROM));
  const flood = clamp01((mins - L.DUSK_FROM) / (L.NIGHT_FROM - L.DUSK_FROM));
  const sunShare = (L.SUN_BY_WEATHER as Record<string, number>)[input.weather] ?? 1;
  const sun = sunUp * sunShare;
  const veilAlpha = (L.VEIL.BY_WEATHER as Record<string, number>)[input.weather] ?? 0;

  const dir = input.sun.side === "top" ? 1 : -1; // shadows point away from the sun
  const shadows: ShadowSpec[] = [];
  if (sun > 0.01) {
    const len = L.SUN_SHADOW.LEN + (L.SUN_SHADOW.LEN_GOLDEN - L.SUN_SHADOW.LEN) * golden;
    const angle = Math.atan2(dir, -input.sun.lean * 0.6);
    shadows.push({
      dx: Math.cos(angle) * len * 0.5, dy: Math.sin(angle) * len * 0.5,
      rx: len * 0.5 + 0.5, ry: L.SUN_SHADOW.WIDTH, rotation: angle, alpha: L.SUN_SHADOW.ALPHA * sun,
    });
  }
  if (flood > 0.01) {
    for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const angle = Math.atan2(ay, ax);
      shadows.push({
        dx: Math.cos(angle) * L.FLOOD_SHADOW.LEN * 0.5, dy: Math.sin(angle) * L.FLOOD_SHADOW.LEN * 0.5,
        rx: L.FLOOD_SHADOW.LEN * 0.5 + 0.4, ry: L.FLOOD_SHADOW.WIDTH, rotation: angle, alpha: L.FLOOD_SHADOW.ALPHA * flood,
      });
    }
  }
  return {
    warm: { color: L.WARM.COLOR, alpha: L.WARM.MAX * golden * sun },
    dark: { color: L.NIGHT.COLOR, alpha: L.NIGHT.MAX * flood },
    veil: { color: L.VEIL.COLOR, alpha: veilAlpha },
    flood,
    vignette: L.NIGHT.VIGNETTE * flood,
    stand: {
      side: input.sun.side,
      depth: L.STAND.MIN_DEPTH + (L.STAND.MAX_DEPTH - L.STAND.MIN_DEPTH) * golden,
      lean: input.sun.lean * L.STAND.LEAN,
      alpha: L.STAND.ALPHA * sun,
    },
    shadows,
  };
}
```

Atenção: no teste "day", `dark.alpha` é exatamente 0 e `flood` 0 (clock 3h antes); no "night", `stand.alpha` é exatamente 0 porque `sunUp = 0`. O teste de clima "cloudy" espera 0 sombras (sem sol e sem refletores de dia).

- [ ] **Step 5: Rode e veja passar.** Run: `bun test src/GraficsEngine/matchLighting.test.ts`. Expected: PASS. Confira `MatchPhase` exportado de `@/GameEngine/types` (`grep -n "export type MatchPhase" src/GameEngine/types.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/GraficsEngine/pitchStyle.ts src/GraficsEngine/matchLighting.ts src/GraficsEngine/matchLighting.test.ts
git commit -m "feat(lighting): hora do jogo e descrição da luz pelo horário e clima"
```

---

### Task 3: Partículas de chuva e neve (puro)

**Files:**
- Create: `src/GraficsEngine/weatherParticles.ts`
- Test: `src/GraficsEngine/weatherParticles.test.ts`

- [ ] **Step 1: Teste que falha.**

```ts
import { describe, expect, test } from "bun:test";
import { particleAt, weatherParticles } from "@/GraficsEngine/weatherParticles";

describe("weatherParticles", () => {
  test("rain 150, snow 100, wind rain leans more, none otherwise; deterministic", () => {
    expect(weatherParticles("rain", "s")).toHaveLength(150);
    expect(weatherParticles("snow", "s")).toHaveLength(100);
    expect(weatherParticles("sunny", "s")).toHaveLength(0);
    expect(weatherParticles("rain", "s")).toEqual(weatherParticles("rain", "s"));
  });

  test("particleAt stays inside 0..1 and moves with time", () => {
    const p = weatherParticles("rain", "s")[0]!;
    for (const t of [0, 0.4, 3.7, 120]) {
      const q = particleAt(p, t);
      expect(q.x).toBeGreaterThanOrEqual(0); expect(q.x).toBeLessThan(1);
      expect(q.y).toBeGreaterThanOrEqual(0); expect(q.y).toBeLessThan(1);
    }
    expect(particleAt(p, 0.1)).not.toEqual(particleAt(p, 0));
  });
});
```

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/GraficsEngine/weatherParticles.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementação.**

```ts
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";

/**
 * Rain drops and snow flakes over the live pitch (spec 2026-10-16-match-lighting). Positions in canvas fractions
 * (0..1), speeds in fractions per second, wrapped around. Pure and seeded; the renderer moves them on the effects
 * clock (frozen while paused and with the tab hidden).
 */
export interface Particle {
  kind: "drop" | "flake";
  x0: number; y0: number;
  vx: number; vy: number;
  /** Drop: streak length (fraction of the height). Flake: radius in px. */
  size: number;
  /** Flake sway phase. */
  phase: number;
}

const wrap = (v: number) => ((v % 1) + 1) % 1;

export function weatherParticles(weather: MatchWeather | "wind_rain", seed: string): Particle[] {
  const rng = mulberry32(seedFrom(`particles:${seed}:${weather}`));
  if (weather === "rain" || weather === "wind_rain") {
    const lean = weather === "wind_rain" ? 0.6 : 0.25;
    return Array.from({ length: 150 }, () => ({
      kind: "drop" as const, x0: rng(), y0: rng(), vx: lean * (1.4 + rng() * 0.4), vy: 1.4 + rng() * 0.4,
      size: 0.02 + rng() * 0.015, phase: 0,
    }));
  }
  if (weather === "snow") {
    return Array.from({ length: 100 }, () => ({
      kind: "flake" as const, x0: rng(), y0: rng(), vx: 0.01, vy: 0.06 + rng() * 0.05,
      size: 1.2 + rng() * 1.6, phase: rng() * Math.PI * 2,
    }));
  }
  return [];
}

export function particleAt(p: Particle, t: number): { x: number; y: number } {
  const sway = p.kind === "flake" ? Math.sin(t * 1.3 + p.phase) * 0.01 : 0;
  return { x: wrap(p.x0 + p.vx * t + sway), y: wrap(p.y0 + p.vy * t) };
}
```

Chuva com vento: a tela passa `"wind_rain"` quando o clima é `wind` **e** chove? O sorteio de clima é um só (`rain` ou `wind`), então use `"rain"` para chuva; `"wind_rain"` fica para o `/test` (botão "chuva com vento"). Mantenha o tipo como está.

- [ ] **Step 4: Rode e veja passar.** Run: `bun test src/GraficsEngine/weatherParticles.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/GraficsEngine/weatherParticles.ts src/GraficsEngine/weatherParticles.test.ts
git commit -m "feat(lighting): partículas de chuva e neve"
```

---

### Task 4: `match-setup` devolve as condições e o lado do sol

**Files:**
- Modify: `src/backend/routes.ts` (`POST /api/match-setup`, perto do bloco do gramado ~linha 612 e da resposta ~651)
- Test: o teste de rota do match-setup que já existe (`grep -rln "match-setup" src/backend/*.test.ts | head`), acrescentar um caso

- [ ] **Step 1: Teste que falha.** No arquivo de teste do match-setup que já monta um save e chama a rota num dia com jogo, acrescente (usando a mesma montagem e a mesma resposta `data`):

```ts
expect(data.conditions).toMatchObject({ kickoff: expect.stringMatching(/^\d\d:\d\d$/), sunset: expect.stringMatching(/^\d\d:\d\d$/) });
expect(["top", "bottom"]).toContain(data.sunSide.side);
```

Se nenhum teste chama a rota com fixture, crie o caso seguindo `src/backend/facilities.routes.test.ts` (que chama rotas com o dono do save) e avance até um dia com jogo do clube como os testes de `match-setup` de outras features (`grep -rn "match-setup" src/backend/*.test.ts`).

- [ ] **Step 2: Rode e veja falhar.** Expected: FAIL (`conditions` indefinido).

- [ ] **Step 3: Implementação.** Logo depois do bloco do gramado (`pitch = matchPitch(...)`):

```ts
    // Kickoff, weather and sunset (cosmetic, `matchConditions`) and where the sun sets over the home stadium:
    // the live pitch draws the light of that time (spec 2026-10-16-match-lighting).
    let conditions: { kickoff: string; weather: MatchWeather; sunset: string } | null = null;
    let sunSide: StadiumSun | null = null;
    if (matchFixture && opponentSquad) {
      const homeSquad = matchFixture.home === myInternalId ? mySquad : opponentSquad;
      const c = matchConditions(matchFixture, matchFixture.neutral ? null : homeSquad.country ?? null);
      conditions = { kickoff: c.kickoff, weather: c.weather, sunset: c.sunset };
      sunSide = stadiumSunSide(matchFixture.neutral ? matchFixture.id : homeSquad.id);
    }
```

e na resposta `conditions, sunSide,`. Importe `matchConditions`, `type MatchWeather` de `@/Domain/matchday/matchConditions` e `stadiumSunSide`, `type StadiumSun` de `@/Domain/matchday/stadiumSun`. Confira o campo de país do squad (`grep -n "country" src/types/playerTypes.ts | head -3`; a prévia usa `homeGround.country`). No ramo do jogo da seleção (`nationalMatchSetup`, ~linha 435), não mexa: sem `conditions` ali, a partida fica sem luz nova.

- [ ] **Step 4: Rode e veja passar.** Run o arquivo de teste da rota. Expected: PASS. `bunx tsc --noEmit 2>&1 | grep -v DecisionTree.ts | head` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/backend/routes.ts src/backend/*.test.ts
git commit -m "feat(lighting): match-setup devolve horário, clima, pôr do sol e lado do sol"
```

---

### Task 5: Desenho no `PixiPitch`

**Files:**
- Modify: `src/GraficsEngine/PixiPitch.tsx`

- [ ] **Step 1: Prop.** Na interface de props, depois de `pitch?`:

```ts
  /**
   * Light of the match (spec 2026-10-16-match-lighting): kickoff and sunset ("HH:MM"), weather, where the sun sets
   * over the stadium, and the seed of the particles. `clockOverride` (minutes since midnight) fixes the time (/test).
   * Absent: no new light, as before.
   */
  lighting?: {
    kickoff: string; sunset: string; weather: MatchWeather | "wind_rain"; sun: StadiumSun; seed: string;
    clockOverride?: number;
  } | null;
```

Desestruture `lighting = null`, `const lightingRef = useRef(lighting)` e `useEffect(() => { lightingRef.current = lighting; lightRedrawKeyRef.current = ""; }, [lighting?.kickoff, lighting?.sunset, lighting?.weather, lighting?.sun.side, lighting?.sun.lean, lighting?.seed, lighting?.clockOverride]);` com `const lightRedrawKeyRef = useRef("")`.

- [ ] **Step 2: Camada de luz.** No efeito de montagem, logo depois de `app.stage.addChild(pitchGraphics);` (as linhas, Task 10 da 4.28):

```ts
      // Match light (time of day, weather): above the pitch, its lines and the stand, below the players.
      // Redrawn only when the match clock moves a minute (or the light inputs change), never per frame.
      const lightGraphics = new Graphics();
      lightGraphics.eventMode = 'none';
      app.stage.addChild(lightGraphics);
      let currentLight: Lighting | null = null;
      const updateLight = () => {
        const li = lightingRef.current;
        if (!li) {
          if (currentLight) { lightGraphics.clear(); currentLight = null; refreshShadows(null); }
          return;
        }
        const clock = li.clockOverride ?? matchClockMinutes(stateRef.current, minutesOf(li.kickoff));
        const key = `${Math.floor(clock)}|${mirrorRef.current}|${lightRedrawKeyRef.current}`;
        if (key === lastLightKey) return;
        lastLightKey = key;
        lightRedrawKeyRef.current = lightRedrawKeyRef.current || "set";
        const weather = li.weather === "wind_rain" ? "rain" : li.weather;
        currentLight = matchLighting({ clock, sunset: minutesOf(li.sunset), weather, sun: li.sun });
        drawLight(lightGraphics, m, currentLight, toPixel, canvasWidth, canvasHeight);
        refreshShadows(currentLight);
      };
      let lastLightKey = "";
```

Notas para o implementador:
- `toPixel` é a função que já converte jardas em px com o espelho (procure `const toPixel` no arquivo); passe a mesma.
- `canvasWidth`/`canvasHeight`: os nomes das dimensões do canvas no efeito de montagem (os mesmos usados em `buildMetrics(canvasWidth, canvasHeight, …)`).
- `lightRedrawKeyRef` só serve para forçar o redesenho quando as entradas mudam: no `useEffect` da prop ele vira `""`, o que muda a chave. Simplifique se preferir (por exemplo um contador `lightGenRef` incrementado no efeito e incluído na chave).

`drawLight` (função do módulo, fora do componente):

```ts
/** The light layer: stand shadow, warm and grey veils, night darkness, vignette and floodlight glow. */
function drawLight(
  g: Graphics, m: PitchMetrics, l: Lighting,
  toPx: (x: number, y: number) => { px: number; py: number }, w: number, h: number,
) {
  g.clear();
  // Stand shadow: from the sun's touchline, across the pitch (engine yards → px, mirror included).
  if (l.stand.alpha > 0.005) {
    const d = l.stand.depth * PITCH_WIDTH;
    const y0 = l.stand.side === "top" ? 0 : PITCH_WIDTH;
    const s = l.stand.side === "top" ? 1 : -1;
    const pts = [
      toPx(-3, y0 - s * 3), toPx(PITCH_LENGTH + 3, y0 - s * 3),
      toPx(PITCH_LENGTH + 3, y0 + s * d * (1 + l.stand.lean)), toPx(-3, y0 + s * d * (1 - l.stand.lean)),
    ];
    g.poly(pts.flatMap((p) => [p.px, p.py])).fill({ color: 0x000000, alpha: l.stand.alpha });
  }
  if (l.warm.alpha > 0.005) g.rect(0, 0, w, h).fill({ color: l.warm.color, alpha: l.warm.alpha });
  if (l.veil.alpha > 0.005) g.rect(0, 0, w, h).fill({ color: l.veil.color, alpha: l.veil.alpha });
  if (l.dark.alpha > 0.005) g.rect(0, 0, w, h).fill({ color: l.dark.color, alpha: l.dark.alpha });
  // Vignette: darker bands toward the canvas edges.
  if (l.vignette > 0.005) {
    const steps = 6;
    const band = Math.min(w, h) * 0.08;
    for (let i = 0; i < steps; i++) {
      const inset = i * band;
      g.rect(inset, inset, w - 2 * inset, h - 2 * inset)
        .stroke({ width: band, color: 0x000000, alpha: (l.vignette / steps) * (1 - i / steps), alignment: 1 });
    }
  }
  // Floodlight glow in the four corners.
  if (l.flood > 0.005) {
    const r = Math.max(w, h) * 0.45;
    for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
      for (let i = 1; i <= 5; i++) g.circle(cx, cy, (r * i) / 5).fill({ color: 0xffffff, alpha: (LIGHTING.NIGHT.FLOOD * l.flood) / 5 });
    }
  }
}
```

Confira a assinatura de `toPixel` no arquivo (pode devolver `{ x, y }` em vez de `{ px, py }`; ajuste). Confira se `Graphics.stroke` aceita `alignment` na versão do Pixi instalada; se não aceitar, desenhe a vinheta como 4 retângulos por passo (cima, baixo, esquerda, direita).

- [ ] **Step 3: Sombras dos jogadores.** Em `addPlayerSprite`, dê um nome à sombra extra: crie, além da `shadow` atual, um `Graphics` `lightShadow` (label `"lightShadow"`) adicionado **antes** da `shadow` (`marker.addChild(lightShadow, shadow, disc, ring, cardBadge)`). Uma função do componente:

```ts
      /** Redraw every marker's light shadows (the sun's one, or four under the floodlights). */
      const refreshShadows = (l: Lighting | null) => {
        for (const marker of playerGraphics.values()) {
          const ls = marker.getChildByLabel?.("lightShadow") as Graphics | null;
          if (!ls) continue;
          drawLightShadows(ls, l, markerR);
        }
      };
```

```ts
/** Light shadows of one marker: ellipses relative to its centre (marker radii → px). */
function drawLightShadows(g: Graphics, l: Lighting | null, r: number) {
  g.clear();
  if (!l) return;
  for (const s of l.shadows) {
    const e = new Graphics().ellipse(0, 0, s.rx * r, s.ry * r).fill({ color: 0x000000, alpha: s.alpha });
    e.rotation = s.rotation;
    e.position.set(s.dx * r, s.dy * r);
    g.addChild(e);
  }
}
```

(Para não acumular filhos, `drawLightShadows` deve destruir os filhos antigos: `for (const c of g.removeChildren()) c.destroy();` antes do laço, no lugar de `g.clear()` se usar filhos.) Os marcadores criados depois (substituição) recebem as sombras atuais: no fim de `addPlayerSprite`, chame `drawLightShadows(lightShadow, currentLight, markerR)` — para isso `currentLight` precisa estar declarado antes de `addPlayerSprite` ser usado; mova a declaração `let currentLight` para o topo do efeito. Confira o nome do mapa dos marcadores (`playerGraphics`) e como o arquivo busca filhos por rótulo (`cardBadge.label = "card"` já existe: procure como ele é lido e use o mesmo jeito).

Com o espelho: as sombras são relativas ao marcador em px e a direção vem da descrição em jardas; quando `mirror` está ligado, inverta `dx`, `dy` e some π à rotação (`mirrorRef.current`) — faça isso dentro de `drawLightShadows` recebendo `mirror: boolean`.

- [ ] **Step 4: Partículas.** Logo depois da camada de luz, um `Graphics` `particleGraphics` adicionado ao **topo** do palco no fim da montagem (depois dos jogadores, antes das camadas de debug que precisam ficar por cima, se houver). No `drawFrame`, depois de avançar o relógio de efeitos (`effectNow`):

```ts
        const li = lightingRef.current;
        if (li && (li.weather === "rain" || li.weather === "snow" || li.weather === "wind_rain")) {
          if (particleSeedKey !== `${li.weather}|${li.seed}`) {
            particles = weatherParticles(li.weather, li.seed);
            particleSeedKey = `${li.weather}|${li.seed}`;
          }
          particleGraphics.clear();
          for (const p of particles) {
            const q = particleAt(p, effectNow);
            if (p.kind === "drop") {
              const x = q.x * canvasWidth, y = q.y * canvasHeight;
              const len = p.size * canvasHeight;
              particleGraphics.moveTo(x, y).lineTo(x - (p.vx / p.vy) * len, y - len)
                .stroke({ width: 1, color: 0xcfe3ef, alpha: 0.35 });
            } else {
              particleGraphics.circle(q.x * canvasWidth, q.y * canvasHeight, p.size).fill({ color: 0xffffff, alpha: 0.8 });
            }
          }
        } else if (particles.length > 0) {
          particles = [];
          particleSeedKey = "";
          particleGraphics.clear();
        }
        updateLight();
```

Declare `let particles: Particle[] = []; let particleSeedKey = "";` no efeito. O `effectNow` já para com o jogo pausado e com a aba escondida (o `drawFrame` nem roda com a aba escondida). Garanta que `updateLight()` é chamado também uma vez logo depois da montagem.

- [ ] **Step 5: Verificação.** Run: `bun test src/GraficsEngine` e `bunx tsc --noEmit 2>&1 | grep -v DecisionTree.ts | head`. Expected: PASS, limpo. Sem a prop `lighting` nada muda (sem camada, sem sombras extras, sem partículas).

- [ ] **Step 6: Commit**

```bash
git add src/GraficsEngine/PixiPitch.tsx
git commit -m "feat(lighting): PixiPitch desenha a luz, as sombras e a chuva/neve"
```

---

### Task 6: Partida ao vivo e `/test`

**Files:**
- Modify: `src/GameInterface/MatchScreen.tsx` (estado `touchline` ~linha 209 e 550; `<PixiPitch>`)
- Modify: `src/GameInterface/TestScreen.tsx`

- [ ] **Step 1: Partida ao vivo.** O tipo do `touchline` ganha `conditions: { kickoff: string; weather: MatchWeather; sunset: string } | null; sunSide: StadiumSun | null`, preenchidos no `setTouchline` com `data.conditions ?? null` e `data.sunSide ?? null` (e o tipo da resposta do `match-setup` ganha os dois campos). No `<PixiPitch>`:

```tsx
lighting={touchline?.conditions && touchline.sunSide && matchFixture
  ? { ...touchline.conditions, sun: touchline.sunSide, seed: matchFixture.id }
  : null}
```

(use um `useMemo` com dependências `touchline?.conditions`, `touchline?.sunSide`, `matchFixture?.id`, para o objeto não mudar a cada render).

- [ ] **Step 2: `/test`.** Estados `const [lightTime, setLightTime] = useState<"off" | "13:30" | "17:30" | "20:45" | "match">("off")` e `const [lightWeather, setLightWeather] = useState<MatchWeather | "wind_rain">("sunny")`. Duas fileiras de botões no estilo dos botões de debug vizinhos (perto de Turf/Mowing): Hora (Off · 13:30 · 17:30 · 20:45 · Pelo jogo) e Clima (sunny · cloudy · rain · wind_rain · snow). No `<PixiPitch>`:

```tsx
lighting={lightTime === "off" ? null : {
  kickoff: lightTime === "match" ? "17:30" : lightTime, sunset: "19:00", weather: lightWeather,
  sun: { side: "top", lean: 0.3 }, seed: "test",
  ...(lightTime === "match" ? {} : { clockOverride: minutesOf(lightTime) }),
}}
```

(memoizado). "Pelo jogo" começa às 17:30 com o pôr do sol às 19:00: no segundo tempo do `/test` dá para ver a luz cair e os refletores acenderem.

- [ ] **Step 3: Verificação.** `bunx tsc --noEmit 2>&1 | grep -v DecisionTree.ts | head`, `bun run ui:audit`, `bun test src/GameInterface`. Expected: limpo, 0 achados, PASS.

- [ ] **Step 4: Commit**

```bash
git add src/GameInterface/MatchScreen.tsx src/GameInterface/TestScreen.tsx
git commit -m "feat(lighting): luz na partida ao vivo e botões de hora e clima no /test"
```

---

### Task 7: Regras, changelog e verificação

**Files:**
- Modify: `.claude/rules/graphics-engine.md`, `.claude/rules/match-flow.md`, `src/GameInterface/changelog/changelog.ts`, `package.json`

- [ ] **Step 1: Regras.** Em `graphics-engine.md`, seção "Luz e sombra (4.29)": `matchLighting.ts` (hora do jogo, faixas dia / fim de tarde / crepúsculo / noite relativas ao pôr do sol, clima), `weatherParticles.ts`, a prop `lighting` (camada redesenhada a cada minuto de jogo, sombras dos marcadores, partículas no relógio de efeitos), `stadiumSunSide`, o `/test` (Hora, Clima) e o FPS medido (Step 3). Em `match-flow.md`, uma linha: o `match-setup` devolve `conditions` e `sunSide`, só desenho.

- [ ] **Step 2: Changelog.** Entrada 4.29 (data do dia), itens (pt/en): "A luz da partida segue o horário: sol e sombras à tarde, fim de tarde alaranjado e refletores à noite." / "The match light follows the time of day: sun and shadows in the afternoon, a golden late afternoon and floodlights at night."; "Chuva e neve caem sobre o campo, e o tempo nublado deixa a luz cinzenta." / "Rain and snow fall over the pitch, and cloudy weather greys the light.". `package.json` `"version": "4.29"` (mesmo formato do campo atual).

- [ ] **Step 3: Verificação.** Testes um bloco por vez: `bun test src/Domain`, `bun test src/GameEngine`, `bun test src/GraficsEngine src/GameInterface src/i18n src/lab`, e os arquivos de `src/backend` um por um (em lote dá falta de memória). `bunx tsc --noEmit` (só o erro antigo), `bun run ui:audit --hard` (0). No `/test` (servidor do lab a partir do worktree): Hora 20:45 + Clima rain com Estádio ligado, anote o FPS contra Hora Off (meta: queda ≤ 5 FPS) e registre na regra.

- [ ] **Step 4: Commit**

```bash
git add .claude/rules src/GameInterface/changelog/changelog.ts package.json
git commit -m "docs(lighting): regras e changelog 4.29"
```
