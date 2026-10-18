# Clima que afeta a partida — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o clima de cada jogo (o mesmo que a prévia mostra) passa a afetar o motor e o quickSim de forma sutil, com uma linha de texto na prévia e no resultado.

**Architecture:** uma tabela de multiplicadores por clima (`WeatherConfig.ts`) lida em pontos que o motor já tem (domínio de bola alta, bola solta, erro de bola alta, goleiro, chute de longe, condução, fôlego, lesão); o quickSim recebe fatores medidos no motor. O clima efetivo (depois do teto do estádio) é calculado no backend pela mesma `matchConditions` + `matchSun` que a prévia e a luz usam, gravado no `MatchEvent` e passado à partida ao vivo pelo `match-setup`. Neutro/ausente = jogo idêntico ao de hoje.

**Tech Stack:** Bun, TypeScript, React 19, `bun test`.

Spec: `docs/superpowers/specs/2026-10-18-weather-effects-design.md`. Branch: `feat/weather-effects`.

**Desvio de arquivo em relação à spec:** a spec previa `src/Domain/matchday/matchWeatherEffect.ts` com `matchWeatherFor`. O teto real vem de `src/Data/stadiums.json`, lido só no backend (`realStadiumOf`); para não pôr E/S no Domain, a parte pura (`effectiveWeather`) fica em `src/Domain/matchday/matchWeatherEffect.ts` e a montagem com o estádio (`matchWeatherOf`) fica em `src/backend/stadiumData.ts`, ao lado de `matchSun`.

## Mapa de arquivos

| Arquivo | O quê |
|---|---|
| `src/GameEngine/Configs/WeatherConfig.ts` (novo) | `EngineWeather`, `WeatherEffect`, `WEATHER_EFFECTS`, `weatherEffectOf`, `LONG_SHOT_DISTANCE` |
| `src/GameEngine/Configs/WeatherConfig.test.ts` (novo) | neutro = 1, `wind_rain` = produto |
| `src/Domain/matchday/matchWeatherEffect.ts` (novo) | `effectiveWeather`, `WeatherOfMatch`, `weatherEffectKey` (chave i18n) |
| `src/Domain/matchday/matchWeatherEffect.test.ts` (novo) | |
| `src/backend/stadiumData.ts` | `matchWeatherOf(fixture, home)` |
| `src/backend/stadiumData.test.ts` (novo) | |
| `src/GameEngine/types.ts` | `GameState.weather?` |
| `src/GameEngine/Domain/gameState.ts` | os 8 pontos de leitura |
| `src/GameEngine/Infrastructure/ActionOutcomes.ts` | `resolveShot(..., longShotMult)`, `gkClaimChance(..., mult)` |
| `src/GameEngine/Domain/SimulateMatch.ts` | `options.weather` |
| `src/GameEngine/Domain/Weather.engine.test.ts` (novo) | |
| `src/GameEngine/Configs/QuickSimConfig.ts` | `WEATHER` (fatores) |
| `src/Domain/advanceDay/quickSim.ts` | `QuickSimInput.weather` |
| `src/Domain/advanceDay/quickSim.weather.test.ts` (novo) | |
| `src/types/dayLogTypes.ts` | `MatchEvent.weather?`, `weatherCovered?` |
| `src/Domain/advanceDay/matches.ts` | `weather` em `EngineMatchSim`, `buildQuickMatchEvent`, `buildMatchEventFromRecording` (via `withWeatherLog`) |
| `src/backend/advanceDay.ts` | calcula e passa o clima |
| `src/backend/weather.advanceDay.test.ts` (novo) | |
| `src/backend/routes.ts` | `match-setup` devolve `weatherEffect` |
| `src/GameInterface/MatchScreen.tsx` | `GameState.weather` |
| `src/GameInterface/MatchPreviewScreen.tsx`, `MatchResultScreen.tsx` | linha de texto |
| `src/i18n/locales/en.json`, `pt-BR.json` | `weatherEffect.*` |
| `src/GameEngine/Support/DebugLog.ts`, `src/GameInterface/DebugPanel.tsx` | categoria `weather` |
| `src/GameInterface/TestScreen.tsx`, `EnergyPanel.tsx`, `QuickSimPanel.tsx` | `/test` |
| `src/GameEngine/Support/TestCases.ts` | `rain-cross`, `heat-stamina` |
| `src/lab/types.ts`, `balanceWorker.ts`, `scenarioRunner.ts`, `labNames.ts`, `components/VariantEditor.tsx`, `components/PairDetail.tsx` | `/lab` |
| `scripts/weather-measure.ts` (novo) | medição |
| `scripts/season-rollover-smoke.ts` | seção "Clima" |
| `.claude/rules/game/weather.md` (novo) + ponteiros | regra |
| `src/GameInterface/changelog/changelog.ts`, `package.json` | 4.32 |

---

### Task 1: `WeatherConfig`

**Files:**
- Create: `src/GameEngine/Configs/WeatherConfig.ts`
- Test: `src/GameEngine/Configs/WeatherConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { NEUTRAL_WEATHER, weatherEffectOf, WEATHER_EFFECTS } from "@/GameEngine/Configs/WeatherConfig";

describe("weatherEffectOf", () => {
  test("absent and neutral weathers are all 1", () => {
    for (const w of [undefined, null, "sunny", "clear", "partlyCloudy", "cloudy"] as const) {
      expect(weatherEffectOf(w)).toEqual(NEUTRAL_WEATHER);
    }
    for (const v of Object.values(NEUTRAL_WEATHER)) expect(v).toBe(1);
  });
  test("each active weather has its signature", () => {
    expect(weatherEffectOf("rain").control).toBeLessThan(1);
    expect(weatherEffectOf("rain").looseDecel).toBeLessThan(1);
    expect(weatherEffectOf("rain").gkClaim).toBeLessThan(1);
    expect(weatherEffectOf("snow").looseDecel).toBeGreaterThan(1);
    expect(weatherEffectOf("snow").carrySpeed).toBeLessThan(1);
    expect(weatherEffectOf("wind").aerialError).toBeGreaterThan(1);
    expect(weatherEffectOf("wind").longShot).toBeLessThan(1);
    expect(weatherEffectOf("hot").drain).toBeGreaterThan(1);
    expect(weatherEffectOf("cold").injury).toBeGreaterThan(1);
  });
  test("wind_rain is the product of wind and rain", () => {
    const wr = weatherEffectOf("wind_rain");
    expect(wr.control).toBeCloseTo(weatherEffectOf("rain").control * weatherEffectOf("wind").control, 10);
    expect(wr.aerialError).toBeCloseTo(weatherEffectOf("rain").aerialError * weatherEffectOf("wind").aerialError, 10);
  });
  test("overrides patch the table in place", () => {
    const before = WEATHER_EFFECTS.hot!.drain;
    WEATHER_EFFECTS.hot!.drain = 1.5;
    expect(weatherEffectOf("hot").drain).toBe(1.5);
    WEATHER_EFFECTS.hot!.drain = before;
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/GameEngine/Configs/WeatherConfig.test.ts`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implement**

```ts
import type { MatchWeather } from "@/Domain/matchday/matchConditions";

/**
 * Weather of a match in the engine (`.claude/rules/game/weather.md`): the effective weather (after the stadium
 * roof). `wind_rain` exists only in `/test` (wind and rain together).
 */
export type EngineWeather = MatchWeather | "wind_rain";

/** Multipliers a weather applies on levers the engine already has. 1 = no change. */
export interface WeatherEffect {
  /** First-touch control of a high ball (`highBallControlChance`). */
  control: number;
  /** Loose-ball deceleration (`LOOSE_BALL_DECELERATION`): < 1 the ball skids further, > 1 it stops sooner. */
  looseDecel: number;
  /** Loose-ball initial speed (`LOOSE_BALL_INITIAL_SPEED`). */
  looseSpeed: number;
  /** Carry speed of the ball carrier. */
  carrySpeed: number;
  /** Landing error of crosses and long balls (σ). */
  aerialError: number;
  /** Keeper claim chance on a high ball (`gkClaimChance`). */
  gkClaim: number;
  /** Goal chance of a shot from beyond `LONG_SHOT_DISTANCE` yards. */
  longShot: number;
  /** Energy drain on the pitch (`consumeEnergy`). */
  drain: number;
  /** Injury risk per minute and per contact. */
  injury: number;
}

/** Distance (yards from the goal line) beyond which a shot is a long shot (outside the box). */
export const LONG_SHOT_DISTANCE = 18;

export const NEUTRAL_WEATHER: Readonly<WeatherEffect> = Object.freeze({
  control: 1, looseDecel: 1, looseSpeed: 1, carrySpeed: 1, aerialError: 1, gkClaim: 1, longShot: 1, drain: 1, injury: 1,
});

/**
 * Effects per weather (spec 2026-10-18 §2; tuned by `scripts/weather-measure.ts`). Mutable on purpose: the
 * measurement script patches it in process (`WEATHER_OVERRIDES`). Weathers not listed are neutral.
 */
export const WEATHER_EFFECTS: Partial<Record<MatchWeather, Partial<WeatherEffect>>> = {
  rain: { control: 0.92, looseDecel: 0.7, gkClaim: 0.9 },
  snow: { looseDecel: 1.4, looseSpeed: 0.8, carrySpeed: 0.95, control: 0.94 },
  wind: { aerialError: 1.3, longShot: 0.95 },
  hot: { drain: 1.08 },
  cold: { injury: 1.1 },
};

function effectOf(w: MatchWeather): WeatherEffect {
  return { ...NEUTRAL_WEATHER, ...WEATHER_EFFECTS[w] };
}

/** The multipliers of a weather; absent / neutral = all 1. */
export function weatherEffectOf(weather: EngineWeather | null | undefined): WeatherEffect {
  if (!weather) return { ...NEUTRAL_WEATHER };
  if (weather === "wind_rain") {
    const a = effectOf("wind");
    const b = effectOf("rain");
    const out = { ...NEUTRAL_WEATHER };
    for (const k of Object.keys(out) as (keyof WeatherEffect)[]) out[k] = a[k] * b[k];
    return out;
  }
  return effectOf(weather);
}

/** True when the weather changes nothing in the engine. */
export function isNeutralWeather(weather: EngineWeather | null | undefined): boolean {
  const e = weatherEffectOf(weather);
  return (Object.keys(e) as (keyof WeatherEffect)[]).every((k) => e[k] === 1);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun test src/GameEngine/Configs/WeatherConfig.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/GameEngine/Configs/WeatherConfig.ts src/GameEngine/Configs/WeatherConfig.test.ts
git commit -m "feat(weather): tabela de efeitos do clima no motor"
```

---

### Task 2: clima efetivo (teto) e `matchWeatherOf`

**Files:**
- Create: `src/Domain/matchday/matchWeatherEffect.ts`, `src/Domain/matchday/matchWeatherEffect.test.ts`
- Modify: `src/backend/stadiumData.ts`
- Test: `src/backend/stadiumData.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/Domain/matchday/matchWeatherEffect.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { effectiveWeather, weatherEffectKey } from "@/Domain/matchday/matchWeatherEffect";

describe("effectiveWeather", () => {
  test("a roof cancels rain, snow and wind, not heat or cold", () => {
    expect(effectiveWeather("rain", true)).toBe("cloudy");
    expect(effectiveWeather("snow", true)).toBe("cloudy");
    expect(effectiveWeather("wind", true)).toBe("cloudy");
    expect(effectiveWeather("hot", true)).toBe("hot");
    expect(effectiveWeather("cold", true)).toBe("cold");
  });
  test("open stadium keeps the weather", () => {
    expect(effectiveWeather("rain", false)).toBe("rain");
  });
});

describe("weatherEffectKey", () => {
  test("text key of the effective weather, covered note, or none", () => {
    expect(weatherEffectKey({ weather: "rain", covered: false, effective: "rain" })).toBe("weatherEffect.rain");
    expect(weatherEffectKey({ weather: "rain", covered: true, effective: "cloudy" })).toBe("weatherEffect.covered");
    expect(weatherEffectKey({ weather: "sunny", covered: true, effective: "sunny" })).toBeNull();
    expect(weatherEffectKey({ weather: "cloudy", covered: false, effective: "cloudy" })).toBeNull();
    expect(weatherEffectKey({ weather: "hot", covered: false, effective: "hot" })).toBe("weatherEffect.hot");
  });
});
```

`src/backend/stadiumData.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { matchWeatherOf } from "@/backend/stadiumData";
import { matchConditions } from "@/Domain/matchday/matchConditions";

const fixture = { id: "f1", date: "2027-01-10", home: "33", away: "34", competition: "premier_league" };
const home = { id: "33", country: "England", venue: { name: "Old Trafford", city: "Manchester" } };

describe("matchWeatherOf", () => {
  test("same weather as the preview (matchConditions)", () => {
    const w = matchWeatherOf(fixture, home);
    expect(w.weather).toBe(matchConditions(fixture, "England").weather);
  });
  test("deterministic", () => {
    expect(matchWeatherOf(fixture, home)).toEqual(matchWeatherOf(fixture, home));
  });
  test("neutral venue: no effect", () => {
    const w = matchWeatherOf({ ...fixture, neutral: true }, home);
    expect(w.effective).toBe("sunny");
    expect(w.covered).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test src/Domain/matchday/matchWeatherEffect.test.ts src/backend/stadiumData.test.ts`
Expected: FAIL (modules / export missing).

- [ ] **Step 3: Implement**

`src/Domain/matchday/matchWeatherEffect.ts`:

```ts
import type { MatchWeather } from "@/Domain/matchday/matchConditions";

/** Weather of one match: the drawn one, whether a roof covered it, and what the match plays with. */
export interface WeatherOfMatch {
  weather: MatchWeather;
  covered: boolean;
  effective: MatchWeather;
}

/** Weathers a roof keeps out (heat and cold still count). */
const ROOF_STOPS = new Set<MatchWeather>(["rain", "snow", "wind"]);

/** The weather the match plays with: under a roof rain, snow and wind become `cloudy` (neutral). */
export function effectiveWeather(weather: MatchWeather, covered: boolean): MatchWeather {
  return covered && ROOF_STOPS.has(weather) ? "cloudy" : weather;
}

/** Weathers with an effect on the match (`WeatherConfig.ts`). */
const ACTIVE = new Set<MatchWeather>(["rain", "snow", "wind", "hot", "cold"]);

/** i18n key of the one-line effect text (preview, result); null = nothing to say. */
export function weatherEffectKey(w: WeatherOfMatch): string | null {
  if (w.covered && ROOF_STOPS.has(w.weather)) return "weatherEffect.covered";
  return ACTIVE.has(w.effective) ? `weatherEffect.${w.effective}` : null;
}
```

Em `src/backend/stadiumData.ts`, acrescentar os imports e a função no fim do arquivo:

```ts
import { matchConditions } from "@/Domain/matchday/matchConditions";
import { effectiveWeather, type WeatherOfMatch } from "@/Domain/matchday/matchWeatherEffect";

/**
 * The weather a match is played with (`.claude/rules/game/weather.md`): `matchConditions` (the preview's), the roof
 * of the stadium the light draws (`matchSun`), and the effective weather. A neutral venue has no weather effect.
 */
export function matchWeatherOf(
  fixture: { id: string; date: string; home: string; away: string; competition?: string; neutral?: boolean },
  home: { id: string; country?: string | null; venue?: { name?: string; city?: string } | null },
): WeatherOfMatch {
  if (fixture.neutral) return { weather: "sunny", covered: false, effective: "sunny" };
  const c = matchConditions(fixture, home.country ?? null);
  const { sun } = matchSun(home, undefined, fixture.date, c.weather);
  return { weather: c.weather, covered: sun.covered, effective: effectiveWeather(c.weather, sun.covered) };
}
```

(`matchSun` já é deste arquivo; o `covered` dele é o mesmo que o desenho usa: teto real ou estádio sorteado como coberto.)

- [ ] **Step 4: Run them to verify they pass**

Run: `bun test src/Domain/matchday/matchWeatherEffect.test.ts src/backend/stadiumData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/matchday/matchWeatherEffect.ts src/Domain/matchday/matchWeatherEffect.test.ts src/backend/stadiumData.ts src/backend/stadiumData.test.ts
git commit -m "feat(weather): clima efetivo do jogo (teto do estádio)"
```

---

### Task 3: clima no motor

**Files:**
- Modify: `src/GameEngine/types.ts`, `src/GameEngine/Domain/gameState.ts`, `src/GameEngine/Infrastructure/ActionOutcomes.ts`, `src/GameEngine/Domain/SimulateMatch.ts`, `src/GameEngine/Support/DebugLog.ts`, `src/GameInterface/DebugPanel.tsx`
- Test: `src/GameEngine/Domain/Weather.engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { simulateMatch, DEFAULT_FORMATION } from "@/GameEngine/Domain/SimulateMatch";
import { mulberry32 } from "@/Domain/rng";
import { gkClaimChance, resolveShot } from "@/GameEngine/Infrastructure/ActionOutcomes";
import type { Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import teamRed from "@/Data/squads/test/team_red.json";
import teamBlue from "@/Data/squads/test/team_blue.json";

const fresh = (s: Squad): Squad => ({ ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) });
const A = fresh(teamRed as unknown as Squad);
const B = fresh(teamBlue as unknown as Squad);

function run(weather?: import("@/GameEngine/Configs/WeatherConfig").EngineWeather) {
  const orig = Math.random;
  Math.random = mulberry32(7);
  try {
    return simulateMatch(A, B, DEFAULT_FORMATION, DEFAULT_FORMATION, [], [], weather ? { weather } : {});
  } finally { Math.random = orig; }
}

describe("weather in the engine", () => {
  test("absent and neutral weather play the identical match", () => {
    const base = run();
    const sunny = run("sunny");
    const cloudy = run("cloudy");
    expect(sunny.score).toEqual(base.score);
    expect(cloudy.score).toEqual(base.score);
    expect(sunny.teamStats.A.shots).toBe(base.teamStats.A.shots);
    expect(sunny.teamStats.B.passesCompleted).toBe(base.teamStats.B.passesCompleted);
  });
  test("heat drains more energy", () => {
    const base = run();
    const hot = run("hot");
    expect(hot.teamStats.A.avgEndEnergy).toBeLessThan(base.teamStats.A.avgEndEnergy);
  });
  test("gkClaimChance and resolveShot take the weather multipliers", () => {
    const gk = { runtimeStats: { withoutBall: { gkPositioning: 0.6, gkReflex: 0.6 } } } as never;
    expect(gkClaimChance(gk, 1, 0.9)).toBeCloseTo(gkClaimChance(gk, 1) * 0.9, 10);
  });
});
```

(Se `src/Data/squads/test/team_red.json` não existir com esse nome, usar os mesmos elencos que `src/GameEngine/Support/TestCases.ts` importa como `teamRedPlayers`/`teamBluePlayers`; a forma do teste não muda.)

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/GameEngine/Domain/Weather.engine.test.ts`
Expected: FAIL (`weather` não é opção; `gkClaimChance` sem 3º argumento).

- [ ] **Step 3: Implement**

`src/GameEngine/types.ts`, no `GameState` (junto de `managerDiscipline`):

```ts
  /**
   * Effective weather of the match (`.claude/rules/game/weather.md`, `WeatherConfig.ts`): multipliers on high-ball
   * control, the loose ball, aerial error, keeper claims, long shots, carry speed, energy drain and injuries.
   * Absent / neutral = no change.
   */
  weather?: import('@/GameEngine/Configs/WeatherConfig').EngineWeather;
```

`src/GameEngine/Infrastructure/ActionOutcomes.ts`:

```ts
export function gkClaimChance(gk: GamePlayer, attackersNear: number, weatherMult = 1): number {
  const C = AERIAL_CONFIG;
  const { gkPositioning, gkReflex } = gk.runtimeStats.withoutBall;
  return clamp(
    (C.GK_CLAIM_BASE + gkPositioning * C.GK_CLAIM_POSITIONING + gkReflex * C.GK_CLAIM_REFLEX - attackersNear * C.GK_CLAIM_CROWD) * weatherMult,
    0, 1,
  );
}
```

e em `resolveShot`, novo 4º parâmetro (mesmo número de sorteios):

```ts
export function resolveShot(
  shooter: GamePlayer,
  gk: GamePlayer | null,
  shot: import('@/GameEngine/types').ShotState,
  longShotMult = 1,
): ShotResult {
  const inPosts = shot.toY >= GOAL_Y_MIN && shot.toY <= GOAL_Y_MAX;
  if (!inPosts) return { isGoal: false, goalChance: 0, inPosts };

  const shooterEffect = shot.header ? computeHeaderEffect(shooter) : computeShooterEffect(shooter);
  const gkEffect      = gk
    ? computeGKEffect(gk, Math.hypot(shooter.x - shot.toX, shooter.y - shot.toY), { x: shooter.x, y: shooter.y })
    : 1.0;
  // Weather (wind): shots from beyond LONG_SHOT_DISTANCE lose a little accuracy.
  const fromGoalLine = Math.abs(shot.toX - shot.fromX);
  const weather = !shot.header && fromGoalLine > LONG_SHOT_DISTANCE ? longShotMult : 1;
  const goalChance = clamp(shot.xg * shooterEffect * gkEffect * weather, 0, 1);
  return { isGoal: Math.random() < goalChance, goalChance, inPosts };
}
```

com `import { LONG_SHOT_DISTANCE } from '@/GameEngine/Configs/WeatherConfig';`. (O `toX` do chute é a linha do gol, então `|toX − fromX|` é a distância do chutador à linha.)

`src/GameEngine/Domain/gameState.ts` — `import { weatherEffectOf } from '@/GameEngine/Configs/WeatherConfig';` e:

1. `injuryFactorsOf` (linha ~570) ganha o multiplicador:

```ts
function injuryFactorsOf(p: GamePlayer, weatherMult = 1): InjuryFactors {
  return { energy: p.energy, load: p.injuryLoad, age: p.age, strength: p.strengthAttr, staffMult: (p.injuryMult ?? 1) * weatherMult };
}
```

   e nas duas chamadas (`rollInMatchInjuries` ~888, `rollContactInjuries` ~906): `injuryFactorsOf(player, weatherEffectOf(state.weather).injury)` (em `rollContactInjuries` o estado se chama `s`/`state`: use o parâmetro `state`).

2. `consumeEnergy` (~3777): o último argumento vira `(pl.drainMultiplier ?? 1) * tacticDrainMult(pl.team, action) * weatherEffectOf(s.weather).drain`.

3. Bola solta, `handleLooseBall(s, dt)` (~2746): `const newSpeed = Math.max(0, speed - cfg.LOOSE_BALL_DECELERATION * weatherEffectOf(s.weather).looseDecel * dt);`

4. Velocidade inicial da bola solta — nas três ocorrências de `THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED` (~3288 e ~3313 em `resolveAerialLanding`, ~4435 no pouso do through ball): `THROUGH_BALL_CONFIG.LOOSE_BALL_INITIAL_SPEED * weatherEffectOf(s.weather).looseSpeed` (use o nome do estado em escopo: `s` nas três).

5. Erro de bola alta, `startAerialBall` (~3082): `const sigma = (1 - holder.runtimeStats.withBall.passingSkill) * maxErr / 2 * weatherEffectOf(state.weather).aerialError;`

6. Domínio de bola alta (~3143):

```ts
function highBallControlChance(p: GamePlayer, weatherMult = 1): number {
  const C = AERIAL_CONFIG;
  return Math.max(0, Math.min(1, (C.CONTROL_BASE + C.CONTROL_TOUCH * p.runtimeStats.withBall.firstTouch) * weatherMult));
}
```

   e nas duas chamadas (~3387, ~3410): `highBallControlChance(w, weatherEffectOf(s.weather).control)` / `highBallControlChance(winner, weatherEffectOf(s.weather).control)`.

7. Goleiro (~3211): `const chance = gkClaimChance(gk, attackers.length, weatherEffectOf(s.weather).gkClaim);`

8. Chute (~3998): `resolveShot(shooter, defendingGK, s.shot, weatherEffectOf(s.weather).longShot)`.

9. Condução (~4261 e ~4285): multiplicar o passo por `weatherEffectOf(s.weather).carrySpeed`:
   `const step = (wb.carrySpeed + accelBurst) * recoveryMult * dt * weatherEffectOf(s.weather).carrySpeed;` e
   `const step = Math.min(attacker.runtimeStats.withBall.carrySpeed * recoveryMult * dt * weatherEffectOf(s.weather).carrySpeed, dist);`

Com clima ausente/neutro todo fator é exatamente 1 (multiplicar por 1 não muda um float), e nenhum `Math.random` novo é chamado.

`src/GameEngine/Domain/SimulateMatch.ts` — em `SimulateMatchOptions`:

```ts
  /** Effective weather of the match (`.claude/rules/game/weather.md`). Absent = neutral. */
  weather?: import('@/GameEngine/Configs/WeatherConfig').EngineWeather;
```

e no estado montado (junto de `...(options.referee ? …)`): `...(options.weather ? { weather: options.weather } : {}),`

Debug: em `src/GameEngine/Support/DebugLog.ts` acrescentar `| 'weather'       // weather of the match (`weather.md`)` ao `DebugCategory`; em `src/GameInterface/DebugPanel.tsx` acrescentar `weather: "text-sky-300",` ao `CATEGORY_CLASS`. Em `SimulateMatch.ts`, depois de montar o estado: `if (options.weather) debugLog('weather', \`Weather: ${options.weather}\`, { data: { ...weatherEffectOf(options.weather) } });` (imports de `debugLog` e `weatherEffectOf`).

- [ ] **Step 4: Run the tests**

Run: `bun test src/GameEngine/Domain/Weather.engine.test.ts src/GameEngine src/Domain/advanceDay`
Expected: PASS (nenhum teste antigo muda: tudo neutro sem clima).

- [ ] **Step 5: Commit**

```bash
git add src/GameEngine src/GameInterface/DebugPanel.tsx
git commit -m "feat(weather): clima nos pontos do motor (bola alta, bola solta, goleiro, chute de longe, condução, fôlego, lesão)"
```

---

### Task 4: clima no quickSim

**Files:**
- Modify: `src/GameEngine/Configs/QuickSimConfig.ts`, `src/Domain/advanceDay/quickSim.ts`
- Test: `src/Domain/advanceDay/quickSim.weather.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { mulberry32 } from "@/Domain/rng";
import { loadTestLeague } from "@/Domain/advanceDay/quickSim.testUtils";

describe("weather in the quickSim", () => {
  test("neutral weather draws the identical match", async () => {
    const [home, away] = await loadTestLeague("premier_league", 2);
    for (let i = 0; i < 50; i++) {
      const a = quickSimMatch({ fixtureId: `f${i}`, home, away }, mulberry32(i));
      const b = quickSimMatch({ fixtureId: `f${i}`, home, away, weather: "cloudy" }, mulberry32(i));
      expect(b.recording).toEqual(a.recording);
    }
  });
  test("heat leaves less energy, cold more injuries (paired)", async () => {
    const [home, away] = await loadTestLeague("premier_league", 2);
    let eBase = 0, eHot = 0, iBase = 0, iCold = 0;
    for (let i = 0; i < 400; i++) {
      const base = quickSimMatch({ fixtureId: `f${i}`, home, away }, mulberry32(i)).recording;
      const hot = quickSimMatch({ fixtureId: `f${i}`, home, away, weather: "hot" }, mulberry32(i)).recording;
      const cold = quickSimMatch({ fixtureId: `f${i}`, home, away, weather: "cold" }, mulberry32(i)).recording;
      eBase += Object.values(base.playerEnergy).reduce((s, v) => s + v, 0);
      eHot += Object.values(hot.playerEnergy).reduce((s, v) => s + v, 0);
      iBase += base.injuries.length;
      iCold += cold.injuries.length;
    }
    expect(eHot).toBeLessThan(eBase);
    expect(iCold).toBeGreaterThanOrEqual(iBase);
  });
});
```

Antes de rodar, confira em `src/Domain/advanceDay/quickSim.test.ts` como os testes existentes carregam dois elencos; se não houver um `quickSim.testUtils`, copie para o topo deste arquivo a mesma função de carga que aquele teste usa (ler `src/example_data/squads/premier_league/*.json`, os dois primeiros por ordem de nome) em vez de importar `loadTestLeague`. Os nomes dos campos do `recording` (`playerEnergy`, `injuries`) são os de `PlayedMatchRecording` — confira em `src/types/dayLogTypes.ts` e ajuste se diferirem.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/Domain/advanceDay/quickSim.weather.test.ts`
Expected: FAIL (`weather` não existe em `QuickSimInput` / sem efeito no calor).

- [ ] **Step 3: Implement**

`src/GameEngine/Configs/QuickSimConfig.ts`, dentro do objeto de config (perto de `ENERGY_DRAIN_BY_LINE`):

```ts
  /**
   * Weather of the match (`.claude/rules/game/weather.md`): factors measured on the full engine
   * (`scripts/weather-measure.ts`). xg multiplies both sides; the completions multiply the cross / long-ball
   * completion rates; energyDrain the drain of every player; injury both sides' injury risk. Absent = 1.
   */
  WEATHER: {
    rain:  { xg: 1, crossCompletion: 1, longBallCompletion: 1, energyDrain: 1, injury: 1 },
    snow:  { xg: 1, crossCompletion: 1, longBallCompletion: 1, energyDrain: 1, injury: 1 },
    wind:  { xg: 1, crossCompletion: 0.85, longBallCompletion: 0.9, energyDrain: 1, injury: 1 },
    hot:   { xg: 1, crossCompletion: 1, longBallCompletion: 1, energyDrain: 1.08, injury: 1 },
    cold:  { xg: 1, crossCompletion: 1, longBallCompletion: 1, energyDrain: 1, injury: 1.1 },
  } as Record<string, { xg: number; crossCompletion: number; longBallCompletion: number; energyDrain: number; injury: number }>,
```

(Valores iniciais; a Task 10 os troca pelos medidos.)

`src/Domain/advanceDay/quickSim.ts`:

- `QuickSimInput` ganha:

```ts
  /** Effective weather of the match (`.claude/rules/game/weather.md`): `QUICK_SIM_CONFIG.WEATHER`. Absent = none. */
  weather?: import("@/GameEngine/Configs/WeatherConfig").EngineWeather;
```

- Função local logo após os helpers de topo:

```ts
const NO_WEATHER = { xg: 1, crossCompletion: 1, longBallCompletion: 1, energyDrain: 1, injury: 1 };
/** QuickSim factors of a weather; `wind_rain` = product of wind and rain. */
function quickWeather(w: QuickSimInput["weather"]): typeof NO_WEATHER {
  if (!w) return NO_WEATHER;
  if (w === "wind_rain") {
    const a = C.WEATHER.wind ?? NO_WEATHER;
    const b = C.WEATHER.rain ?? NO_WEATHER;
    return { xg: a.xg * b.xg, crossCompletion: a.crossCompletion * b.crossCompletion,
      longBallCompletion: a.longBallCompletion * b.longBallCompletion, energyDrain: a.energyDrain * b.energyDrain, injury: a.injury * b.injury };
  }
  return C.WEATHER[w] ?? NO_WEATHER;
}
```

- Em `quickSimMatch`, logo depois de `const scale = input.goalScale ?? 1;`: `const wx = quickWeather(input.weather);` e `xgHome`/`xgAway` multiplicados por `wx.xg` (`expectedGoals(...) * scale * wx.xg`).
- Lesões (~883): o último argumento de cada `rollSideInjuries` vira `staffEffectsOf(input.home).injuryMult * pitchMult * wx.injury` (idem `away`).
- `rollAerial` ganha o parâmetro `wx: typeof NO_WEATHER` (último) e usa `binomial(out.crosses, C.CROSS_COMPLETION * wx.crossCompletion, rng)` e `binomial(out.longBalls, C.LONG_BALL_COMPLETION * wx.longBallCompletion, rng)`; as duas chamadas (~901-902) passam `wx`.
- Fôlego (~927): `const drain = C.ENERGY_DRAIN_BY_LINE[groupOf(x)] * (1.2 - 0.4 * (stat(p, "stamina") / 10)) * drainMultiplier(startLoad(p)) * extraTimeMult * wx.energyDrain;`

Com clima ausente ou neutro (`C.WEATHER[w]` indefinido → `NO_WEATHER`) todos os fatores são 1 e o número de sorteios não muda.

- [ ] **Step 4: Run the tests**

Run: `bun test src/Domain/advanceDay/quickSim.weather.test.ts src/Domain/advanceDay/quickSim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/GameEngine/Configs/QuickSimConfig.ts src/Domain/advanceDay/quickSim.ts src/Domain/advanceDay/quickSim.weather.test.ts
git commit -m "feat(weather): clima no quickSim"
```

---

### Task 5: clima no avanço do dia e no day log

**Files:**
- Modify: `src/types/dayLogTypes.ts`, `src/Domain/advanceDay/matches.ts`, `src/backend/advanceDay.ts`
- Test: `src/backend/weather.advanceDay.test.ts`

- [ ] **Step 1: Write the failing test**

Siga o molde de `src/backend/referees.advanceDay.test.ts` (cria um save numa liga e avança um dia com jogo). O teste:

```ts
import { describe, expect, test } from "bun:test";
// mesmos helpers de criação de save / avanço de dia usados em src/backend/referees.advanceDay.test.ts
import { matchWeatherOf } from "@/backend/stadiumData";

describe("weather in the day log", () => {
  test("every league match of the day logs the weather matchWeatherOf gives", async () => {
    // const { service, saveId, day } = await createSaveAndAdvanceToMatchday(...)  ← helper do teste de árbitros
    // const log = await service.getDayLog(saveId, day);
    // for (const ev of log.events.filter((e) => e.kind === "match")) {
    //   const home = await service.getSquadById(saveId, ev.home);
    //   const fixture = { id: ev.fixtureId, date: day, home: ev.home, away: ev.away, competition: ev.competition };
    //   const w = matchWeatherOf(fixture, home!);
    //   expect(ev.weather).toBe(w.weather);
    //   expect(ev.weatherCovered === true).toBe(w.covered && w.weather !== w.effective);
    // }
  });
});
```

Ao escrever, troque os comentários pelas chamadas reais dos helpers do teste de árbitros (o arquivo de referência mostra exatamente como criar o save, achar um dia com jogos e ler o log); a asserção é a do bloco acima, descomentada. Use `fixture.neutral` do jogo real se o log não o tiver: busque a fixture na rodada (`service.getRound`) como aquele teste faz.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/backend/weather.advanceDay.test.ts`
Expected: FAIL (`ev.weather` indefinido).

- [ ] **Step 3: Implement**

`src/types/dayLogTypes.ts`, em `MatchEvent` (junto de `pitchCondition`):

```ts
  /** Weather drawn for the match (`matchConditions`, `.claude/rules/game/weather.md`). Absent: none (youth, national). */
  weather?: import("@/Domain/matchday/matchConditions").MatchWeather;
  /** true when a roof kept that weather out (the match played neutral). */
  weatherCovered?: true;
```

`src/Domain/advanceDay/matches.ts`:

- `EngineMatchSim` ganha `weather?: WeatherOfMatch;` (import de `@/Domain/matchday/matchWeatherEffect`).
- `engineMatch`, nas opções do `simulateMatch`: `...(sim.weather ? { weather: sim.weather.effective } : {}),`
- `buildQuickMatchEvent`: o tipo de `sim` ganha `weather?: WeatherOfMatch;` e o input do `quickSimMatch` ganha `...(sim.weather ? { weather: sim.weather.effective } : {}),`
- Helper novo, exportado, ao lado de `withRefereeLog`:

```ts
/** The weather of the match goes to the day log (`weather.md`). */
export function withWeatherLog(event: MatchEvent, weather: WeatherOfMatch | undefined): MatchEvent {
  if (!weather) return event;
  return { ...event, weather: weather.weather, ...(weather.covered && weather.weather !== weather.effective ? { weatherCovered: true as const } : {}) };
}
```

- `buildMatchEvent`: `return { event: withWeatherLog(withPitch, sim.weather), ... }`.
- `buildQuickMatchEvent`: o `event:` do retorno vira `withWeatherLog(withRefereeLog(...), sim.weather)`.

`src/backend/advanceDay.ts`:

- `import { matchWeatherOf } from "@/backend/stadiumData";` e `import { withWeatherLog } from "@/Domain/advanceDay/matches";` (junte ao import existente de `matches`).
- No ramo simulado (~757): `const weather = matchWeatherOf(fixture, homeSquad);` e passe `{ ...sim, pitchCondition, turf, referee, weather }` para `buildMatchEvent` e `buildQuickMatchEvent`.
- No ramo da gravação ao vivo (~705, `buildMatchEventFromRecording`): depois de obter `r`, `r.event = withWeatherLog(r.event, matchWeatherOf(fixture, homeSquad));` (ou reconstrua o objeto se `r` for `const`: `const rw = { ...r, event: withWeatherLog(r.event, matchWeatherOf(fixture, homeSquad)) };` e use `rw` no resto do ramo).
- Jogos de base e de seleção não mudam (não passam por esses ramos).

- [ ] **Step 4: Run the tests**

Run: `bun test src/backend/weather.advanceDay.test.ts src/backend/referees.advanceDay.test.ts src/Domain/advanceDay`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/dayLogTypes.ts src/Domain/advanceDay/matches.ts src/backend/advanceDay.ts src/backend/weather.advanceDay.test.ts
git commit -m "feat(weather): o avanço do dia joga e grava o clima de cada jogo"
```

---

### Task 6: partida ao vivo (`match-setup` → `GameState.weather`)

**Files:**
- Modify: `src/backend/routes.ts`, `src/GameInterface/MatchScreen.tsx`

- [ ] **Step 1: Implement**

`src/backend/routes.ts`, no bloco das condições (~623): depois de calcular `c` e `ms`, com `homeSquad` em escopo:

```ts
      weatherEffect = matchWeatherOf(matchFixture, homeSquad);
```

declarando antes do bloco `let weatherEffect: WeatherOfMatch | null = null;` e devolvendo no `Response.json` ao lado de `conditions`: `weatherEffect,`. Imports: `matchWeatherOf` de `@/backend/stadiumData` (o arquivo já importa `matchSun` de lá) e `type WeatherOfMatch` de `@/Domain/matchday/matchWeatherEffect`.

`src/GameInterface/MatchScreen.tsx`:
- No tipo da resposta do setup (~385, onde está `conditions?`): `weatherEffect?: import("@/Domain/matchday/matchWeatherEffect").WeatherOfMatch | null;`
- No estado montado (~478, junto de `...(data.referee ? …)`): `...(data.weatherEffect ? { weather: data.weatherEffect.effective } : {}),`

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit -p .`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/backend/routes.ts src/GameInterface/MatchScreen.tsx
git commit -m "feat(weather): a partida ao vivo joga com o clima do jogo"
```

---

### Task 7: linha de texto na prévia e no resultado

**Files:**
- Modify: `src/GameInterface/MatchPreviewScreen.tsx`, `src/GameInterface/MatchResultScreen.tsx`, `src/i18n/locales/en.json`, `src/i18n/locales/pt-BR.json`
- Test: `src/i18n/weatherEffect.keys.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const KEYS = ["rain", "snow", "wind", "hot", "cold", "covered"];
describe("weatherEffect keys", () => {
  test("en and pt-BR have every text", () => {
    for (const k of KEYS) {
      expect((en as any).weatherEffect?.[k]).toBeTruthy();
      expect((pt as any).weatherEffect?.[k]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/i18n/weatherEffect.keys.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`en.json` (bloco de topo novo):

```json
"weatherEffect": {
  "rain": "Rain: slippery ball, harder to control",
  "snow": "Snow: heavy ball, slower game",
  "wind": "Wind: inaccurate high balls",
  "hot": "Heat: stamina drops faster",
  "cold": "Cold: higher risk of muscle injury",
  "covered": "Covered stadium: the weather does not affect the game"
}
```

`pt-BR.json`:

```json
"weatherEffect": {
  "rain": "Chuva: bola escorregadia, domínio mais difícil",
  "snow": "Neve: bola pesada, jogo mais lento",
  "wind": "Vento: bolas altas imprecisas",
  "hot": "Calor: o fôlego cai mais rápido",
  "cold": "Frio: mais risco de lesão muscular",
  "covered": "Estádio coberto: o clima não afeta o jogo"
}
```

`MatchPreviewScreen.tsx`: em `MatchSetupData` acrescentar `weatherEffect?: import("@/Domain/matchday/matchWeatherEffect").WeatherOfMatch | null;`. Logo depois da grade de `InfoCell`s (após a célula do horário, ~1186, fora da `div` da grade), com `import { weatherEffectKey } from "@/Domain/matchday/matchWeatherEffect";`:

```tsx
          {matchSetup?.weatherEffect && weatherEffectKey(matchSetup.weatherEffect) && (
            <p className="mt-3 text-sm text-muted-foreground">{t(weatherEffectKey(matchSetup.weatherEffect)!)}</p>
          )}
```

`MatchResultScreen.tsx`: depois da grade de `InfoCell`s (~826), lendo o log:

```tsx
          {matchEvent.weather && (() => {
            const key = weatherEffectKey({
              weather: matchEvent.weather,
              covered: matchEvent.weatherCovered === true,
              effective: matchEvent.weatherCovered ? "cloudy" : matchEvent.weather,
            });
            return key ? <p className="mt-3 text-sm text-muted-foreground">{t(key)}</p> : null;
          })()}
```

- [ ] **Step 4: Run tests and the UI audit**

Run: `bun test src/i18n/weatherEffect.keys.test.ts src/GameInterface && bun run ui:audit --hard`
Expected: PASS; 0 violações duras.

- [ ] **Step 5: Commit**

```bash
git add src/GameInterface/MatchPreviewScreen.tsx src/GameInterface/MatchResultScreen.tsx src/i18n src/i18n/weatherEffect.keys.test.ts
git commit -m "feat(weather): linha do efeito do clima na prévia e no resultado"
```

---

### Task 8: `/test`

**Files:**
- Modify: `src/GameInterface/TestScreen.tsx`, `src/GameInterface/EnergyPanel.tsx`, `src/GameInterface/QuickSimPanel.tsx`, `src/GameEngine/Support/TestCases.ts`

- [ ] **Step 1: Implement**

`TestScreen.tsx`:
- `LIGHT_WEATHER_OPTIONS` (~175) vira `const LIGHT_WEATHER_OPTIONS: ('off' | EngineWeather)[] = ['off', 'sunny', 'cloudy', 'rain', 'wind', 'wind_rain', 'snow', 'hot', 'cold'];` (import `type EngineWeather` de `@/GameEngine/Configs/WeatherConfig`).
- `lightWeather` (~479) vira `useState<'off' | EngineWeather>('off')`; na luz (~482) use `weather: lightWeather === 'off' ? 'sunny' : lightWeather`.
- Helper ao lado de `withTestReferee`:

```ts
/** The state with the /test weather (`weather.md`): 'off' keeps the scenario's own (none by default). */
function withTestWeather(state: GameState, w: 'off' | EngineWeather): GameState {
  if (w === 'off') return state;
  return { ...state, weather: w };
}
```

- Nas três montagens de estado (~723, ~743, ~764) envolver o resultado: `withTestWeather(withManagerDiscipline(...), lightWeather)`, e acrescentar `lightWeather` às dependências dos `useEffect`/`useCallback` que as contêm (como `refS` já está).
- O rótulo da linha do seletor (~1287) passa a "Weather (engine + light)".
- `QuickSimPanel` recebe `weather={lightWeather === 'off' ? undefined : lightWeather}`; em `QuickSimPanel.tsx` acrescente a prop `weather?: EngineWeather` e passe `...(weather ? { weather } : {})` ao `quickSimMatch` (~45).

`EnergyPanel.tsx`, no cabeçalho (depois da linha do `pitch`, ~90):

```tsx
          {gameState.weather && !isNeutralWeather(gameState.weather) && (
            <span className="ml-2 normal-case tabular-nums">
              · {gameState.weather} {Object.entries(weatherEffectOf(gameState.weather)).filter(([, v]) => v !== 1).map(([k, v]) => `${k} x${v.toFixed(2)}`).join(" · ")}
            </span>
          )}
```

(imports `isNeutralWeather`, `weatherEffectOf`).

`TestCases.ts`, dois cenários novos depois de `bad-pitch`:

```ts
  {
    id:          'rain-cross',
    name:        '11v11 — Rain',
    description: 'The match in the rain (`.claude/rules/game/weather.md`): high-ball control x0.92, the loose ball skids further (deceleration x0.7), keeper claims x0.9. Watch crosses and loose balls; the Energy panel header lists the active multipliers. The Weather selector overrides it.',
    createState() {
      const f433 = formation433Json as Formation;
      return { ...createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433), weather: 'rain' };
    },
  },
  {
    id:          'heat-stamina',
    name:        '11v11 — Heat',
    description: 'The match in the heat (`.claude/rules/game/weather.md`): energy drain x1.08 for both teams. Open the Energy panel and compare the fall of energy with 11v11 classic.',
    createState() {
      const f433 = formation433Json as Formation;
      return { ...createMatchState(freshRoster(teamRedPlayers), f433, freshRoster(teamBluePlayers), f433), weather: 'hot' };
    },
  },
```

- [ ] **Step 2: Typecheck and tests**

Run: `bunx tsc --noEmit -p . && bun test src/GameEngine/Support src/GameInterface`
Expected: sem erros; PASS.

- [ ] **Step 3: Commit**

```bash
git add src/GameInterface/TestScreen.tsx src/GameInterface/EnergyPanel.tsx src/GameInterface/QuickSimPanel.tsx src/GameEngine/Support/TestCases.ts
git commit -m "feat(weather): clima no /test (seletor, painel, cenários)"
```

---

### Task 9: `/lab`

**Files:**
- Modify: `src/lab/types.ts`, `src/lab/balanceWorker.ts`, `src/lab/scenarioRunner.ts`, `src/lab/labNames.ts`, `src/lab/components/VariantEditor.tsx`, `src/lab/components/PairDetail.tsx`
- Test: `src/lab/labNames.test.ts` (existente, se houver; senão `src/lab/weatherLabel.test.ts`)

Siga exatamente o caminho do `turf` (mesmo formato: string, variante A vale para o jogo):

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { generateVariantLabel } from "@/lab/labNames";

test("variant label shows the weather", () => {
  const label = generateVariantLabel({ formation: "4-3-3", style: "balanced", weather: "rain" } as never);
  expect(label).toContain("· rain");
});
```

(Confira em `src/lab/labNames.ts` o nome exato da função exportada que monta o rótulo e os campos mínimos de uma `Variant`; ajuste a chamada.)

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/lab/weatherLabel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `types.ts`: em `Variant` (ao lado de `turf?`): `/** Weather of the match (`weather.md`); variant A sets it. Absent = neutral. */ weather?: import("@/GameEngine/Configs/WeatherConfig").EngineWeather;`. Em `TeamRawStats` (ao lado de `turfInjuryMult`): `weatherActive: number;` (1 quando o jogo teve clima não neutro). Em `PerMatchView` e `VariantSummary` (ao lado de `avgTurfInjuryMult`): `weatherShare: number;`.
- `balanceWorker.ts`: `let matchWeather: EngineWeather | undefined;` ao lado de `matchTurf`; `matchWeather = variantA.weather;` (~475); no `simulateMatch` (~305) `...(matchWeather ? { weather: matchWeather } : {})`; no `quickSimMatch` (~367) idem; `teamA.weatherActive = teamB.weatherActive = isNeutralWeather(matchWeather) ? 0 : 1;` (~281); inicialização com `weatherActive: 0` e a soma `dst.weatherActive += src.weatherActive;` (~109, ~153).
- `scenarioRunner.ts`: inicialização `weatherActive: 0` (~240), soma (~287), `weatherShare: r2(t.weatherActive / matches)` (~191) e `weatherShare: r2(totals.weatherActive / games)` (~365).
- `labNames.ts`: depois de `withTurf`: `const withWeather = !v.weather ? withTurf : \`${withTurf} · ${v.weather}\`;` e o resto da cadeia parte de `withWeather` em vez de `withTurf`.
- `VariantEditor.tsx`: um `<select>` "Weather" igual ao de Turf, opções `none` + as 10 de `EngineWeather`, `patch({ weather: v === 'none' ? undefined : v })`, `title` explicando "Weather of the match (variant A sets it)".
- `PairDetail.tsx`: linha `{ stat: "Weather", key: "weatherShare" },` ao lado da de Turf.

- [ ] **Step 4: Run tests**

Run: `bun test src/lab`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lab
git commit -m "feat(weather): clima no /lab"
```

---

### Task 10: medição e calibração

**Files:**
- Create: `scripts/weather-measure.ts`
- Modify: `src/GameEngine/Configs/WeatherConfig.ts` (valores), `src/GameEngine/Configs/QuickSimConfig.ts` (`WEATHER`)

- [ ] **Step 1: Write the script**

Baseado em `scripts/var-measure.ts` (mesma carga de liga com fôlego 88, `--engine-seed`, `--out`/`--sum`). Modos:

```
engine <league> <n> --weather none|sunny|rain|snow|wind|hot|cold [--seed s] [--engine-seed s] [--out f]
    n jogos do motor (pares aleatórios da liga pela semente, formações da IA via
    computeMatchSimulationLineups/aiFormation como em scripts/ai-formation-goals.ts, ambos balanced, fôlego 88)
    com o clima forçado (`simulateMatch(..., { weather })`). Totais: gols, chutes, cruzamentos/certos,
    lançamentos/certos, bolas soltas ganhas, fôlego final médio (avgEndEnergy), lesões.
world <league> <n> [--engine-seed s]
    cada jogo com o clima de matchWeatherOf(fixture sintético com data aleatória da temporada, mandante) vs o mesmo
    jogo neutro, mesmo Math.random por par (mulberry32(seed+i) antes de cada jogo).
quick <league> <n>
    quickSim pareado por clima (mesma semente com e sem clima): gols, cruzamentos certos, lançamentos certos,
    energia final, lesões.
--sum a.json,b.json
WEATHER_OVERRIDES='{"rain":{"control":0.9}}' troca valores de WEATHER_EFFECTS em memória.
```

Para o par motor (clima × neutro com o mesmo `Math.random`), antes de cada jogo do par: `Math.random = mulberry32(base + i)`.

Imprime uma tabela por clima: valor e razão contra `none` para cada métrica.

- [ ] **Step 2: Medir o motor**

Run (em paralelo, no máximo 3 por vez, ~5 min cada):

```bash
for w in none rain snow wind hot cold; do bun scripts/weather-measure.ts engine premier_league 400 --weather $w --engine-seed 11 --out debug/weather/pl-$w.json; done
for w in none rain snow wind hot cold; do bun scripts/weather-measure.ts engine of_championship 400 --weather $w --engine-seed 11 --out debug/weather/ch-$w.json; done
```

Metas (spec §2): cada clima com gols dentro de ±8% do `none` e a assinatura visível (chuva: menos domínios de bola alta, isto é, cruzamentos/lançamentos certos menores e mais bolas soltas; neve: idem com bola mais lenta; vento: menos cruzamentos e lançamentos certos; calor: fôlego final menor; frio: mais lesões). Se um clima passar de ±8% em gols, aproxime de 1 o multiplicador dele que mais pesa (rode de novo com `WEATHER_OVERRIDES`) e grave o valor final em `WEATHER_EFFECTS`.

- [ ] **Step 3: Mundo**

Run: `bun scripts/weather-measure.ts world premier_league 1200 --engine-seed 21` e `... world of_championship 1200 --engine-seed 21`
Expected: gols dentro de ±3% e chutes dentro de ±5% do neutro. Se passar, suavize o clima que mais contribui (o mais frequente com maior desvio) e meça de novo.

- [ ] **Step 4: Fatores do quickSim**

Para cada clima, a partir das duas ligas somadas:
- `xg` = gols(clima) / gols(none) do motor;
- `crossCompletion` = (cruzamentos certos / cruzamentos)(clima) ÷ o mesmo de `none`; idem `longBallCompletion`;
- `energyDrain` = (88 − fôlego final)(clima) ÷ (88 − fôlego final)(none);
- `injury` = lesões(clima) / lesões(none) (fica no valor do motor só se o desvio passar do ruído; senão o valor de `WEATHER_EFFECTS.injury`).

Grave em `QUICK_SIM_CONFIG.WEATHER` e confira: `bun scripts/weather-measure.ts quick premier_league 4000` — as razões do quickSim batem com as do motor (±2 p.p.).

- [ ] **Step 5: Run the full tests**

Run: `bun test`
Expected: PASS (o teste do quickSim neutro continua idêntico; os de calor/frio continuam no sentido certo).

- [ ] **Step 6: Commit**

```bash
git add scripts/weather-measure.ts src/GameEngine/Configs/WeatherConfig.ts src/GameEngine/Configs/QuickSimConfig.ts
git commit -m "feat(weather): medição e calibração (motor e quickSim)"
```

Guarde as tabelas impressas (motor por clima, mundo, quickSim) para a Task 11.

---

### Task 11: smoke, regra, changelog e versão

**Files:**
- Modify: `scripts/season-rollover-smoke.ts`, `src/GameInterface/changelog/changelog.ts`, `package.json`
- Create: `.claude/rules/game/weather.md`
- Modify: `.claude/rules/non-player-games.md`, `.claude/rules/graphics-engine.md` (uma linha cada)

- [ ] **Step 1: Smoke**

Em `scripts/season-rollover-smoke.ts`, seção nova "Clima" no fim da corrida, no mesmo formato das outras seções (lista de falhas + resumo):
- todo `MatchEvent` de liga/copa/continental lido nos logs da corrida tem `weather` definido;
- nenhum jogo de base (`StoredDayLog.youthMatches`) tem `weather`;
- para uma amostra de 50 jogos, `ev.weather === matchConditions({ date, home, away, competition }, país do mandante).weather` (pule campo neutro);
- conte jogos por clima e imprima (informativo).

- [ ] **Step 2: Regra**

`.claude/rules/game/weather.md`: regra (clima efetivo, teto, campo neutro, neutro = idêntico), tabela final de `WEATHER_EFFECTS` e de `QUICK_SIM_CONFIG.WEATHER`, as tabelas medidas da Task 10, `/test`, `/lab`, testes (`bun test src/GameEngine/Configs/WeatherConfig.test.ts src/Domain/matchday src/backend/stadiumData.test.ts src/GameEngine/Domain/Weather.engine.test.ts src/Domain/advanceDay/quickSim.weather.test.ts src/backend/weather.advanceDay.test.ts src/i18n/weatherEffect.keys.test.ts src/lab`) e limitações (spec §8). Uma linha apontando para ela em `non-player-games.md` ("## Clima no quickSim (4.32)") e em `graphics-engine.md` (seção "Luz e sombra": "desde a 4.32 o clima também afeta a partida, ver `.claude/rules/game/weather.md`").

O cabeçalho do comentário de `src/Domain/matchday/matchConditions.ts` diz "None exists in the simulation … no effect on any match": troque por "The weather plays since 4.32 (`.claude/rules/game/weather.md`); kickoff and sunset stay cosmetic."

- [ ] **Step 3: Changelog e versão**

`changelog.ts`: entrada nova no topo

```ts
  {
    version: "4.32",
    date: "2026-10-18",
    items: [
      {
        pt: "O clima agora influencia as partidas: chuva deixa a bola escorregadia, neve pesa o jogo, vento atrapalha as bolas altas, o calor cansa mais e o frio aumenta o risco de lesão. A prévia avisa o efeito; estádios cobertos protegem da chuva, da neve e do vento.",
        en: "Weather now affects matches: rain makes the ball slippery, snow slows the game, wind spoils high balls, heat tires players faster and cold raises the injury risk. The preview tells you the effect; covered stadiums keep out rain, snow and wind.",
      },
    ],
  },
```

Tire de `upcoming` qualquer item sobre clima afetando o jogo, se houver. `package.json`: `"version": "4.32.0"` (edite com a ferramenta Edit, nunca com PowerShell `Set-Content`: BOM quebra a produção).

- [ ] **Step 4: Verificação final**

Run: `bun test && bunx tsc --noEmit -p . && bun run ui:audit --hard`
Expected: tudo PASS / sem erros.

Abra `/match` numa carreira real (dev server a partir de `C:\Projects\FMProject`, `DEV_AUTO_LOGIN=1`) e confira: a prévia mostra a linha do clima quando ativo; a partida roda; o resultado mostra a mesma linha.

- [ ] **Step 5: Commit**

```bash
git add scripts/season-rollover-smoke.ts .claude/rules src/Domain/matchday/matchConditions.ts src/GameInterface/changelog/changelog.ts package.json
git commit -m "feat(weather): smoke, regra, changelog 4.32"
```
