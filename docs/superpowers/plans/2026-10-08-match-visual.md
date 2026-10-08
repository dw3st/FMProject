# Visual da partida e estádio (Etapa 38) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a partida ao vivo ganha árbitro e bandeirinhas que seguem o lance, técnicos à beira do campo com gestos, animações curtas (chute de longe, cabeçada, defesa) e um estádio em volta do campo com a torcida proporcional ao público; o público do clube do jogador sobe em clássicos e mata-matas.

**Architecture:** tudo visual é desenho puro em `src/GraficsEngine` (módulos puros testados: `pitchMetrics`, `crowd`, `officials`, `coaches`, `playerAnims`; o `PixiPitch` só desenha). Nada no `GameState`, no motor, no quickSim nem no `/lab`. A importância do jogo é um multiplicador novo e isolado (`src/Domain/facilities/matchImportance.ts`) que entra na demanda por **um** campo opcional de `DemandInput`; o servidor calcula clássico/mata-mata (`src/backend/matchImportance.ts`) e o `match-setup` entrega público e técnicos à tela ao vivo.

**Tech Stack:** Bun + TypeScript, React 19 + Tailwind, Pixi.js v8.

Spec: `docs/superpowers/specs/2026-10-08-match-visual-design.md`. Regras que valem em toda tarefa:
- Imports sempre `@/`; nada de PowerShell `Set-Content`; `core.autocrlf=true` — conferir `git diff --stat` (nenhum arquivo convertido inteiro). `src/GameInterface/changelog/changelog.ts` é **CRLF**: editar só com a ferramenta Edit e conferir que continua 100% CRLF (`file …` diz "with CRLF line terminators" e `grep -c $'\r$'` = número de linhas). Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca commitar `src/Data` nem saves; protótipo, sem migração.
- Worktree `C:/Projects/FMProject-matchvisual`, branch `feat/match-visual` (com `src/Data` e `bun install`).
- **Merge com a Etapa 34 (instalações vivas, 4.11), em paralelo:** em `src/Domain/facilities/facilities.ts` mexer só no que a Tarefa 5 descreve (um campo em `DemandInput`, um fator em `demandOf`, um campo em `HomeGameToday` e o repasse em `facilitiesMatchday`). Toda regra nova vai em arquivos novos. Nada em `facilityConfig.ts`.
- Antes de cada commit: `bunx tsc --noEmit -p .` limpo e os testes da tarefa passando.

---

### Task 1: Medidor de desenho no `/test` e medição "antes"

**Files:** Modify `src/GraficsEngine/PixiPitch.tsx`, `src/GameInterface/TestScreen.tsx`.

- [ ] **Step 1:** `PixiPitch` ganha a prop `perfRef?: MutableRefObject<{ fps: number; drawMs: number } | null>`. No `app.ticker.add`, medir `performance.now()` no começo e no fim do callback; a cada 30 quadros gravar `{ fps: app.ticker.FPS, drawMs: média dos 30 }` em `perfRef.current`. Sem `perfRef`, nenhum custo além de um `if`.
- [ ] **Step 2:** `TestScreen` passa um `perfRef` e mostra, ao lado do botão de velocidade, "FPS 60 · 1,8 ms" (lido por `setInterval` de 1 s, `tabular-nums`, `text-sm`).
- [ ] **Step 3: Medir "antes"** — `bun run dev` (de `C:\Projects\FMProject-matchvisual`, ver `dev-login.md` sobre a caixa do caminho), `/test`, cenário `11v11-classic`, velocidade 1, 60 s de jogo, Chrome; anotar FPS e ms/quadro médios (três leituras) num rascunho para a Tarefa 13.
- [ ] **Step 4:** `bunx tsc --noEmit -p .`; commit `test(partida): medidor de FPS e tempo de desenho no /test`.

---

### Task 2: Métricas do campo com estádio (puro)

**Files:** Create `src/GraficsEngine/pitchMetrics.ts`, `src/GraficsEngine/pitchMetrics.test.ts`; Modify `src/GraficsEngine/pitchStyle.ts` (constantes `STADIUM`), `src/GraficsEngine/PixiPitch.tsx` (importar `buildMetrics`/`PitchMetrics`/`PITCH_SPEC` do módulo novo; comportamento igual, sempre `{ stadium: false }` por enquanto).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

describe("pitch metrics", () => {
  test("without stadium: same numbers as before (1100x700)", () => {
    const m = buildMetrics(1100, 700, { stadium: false });
    // valores de referência copiados do buildMetrics antigo antes de mover (preencher no Step 3)
    expect(m.stand).toBeNull();
    expect(m.marginX).toBe(m.goalNetDepth + Math.round((1100 - (m.width + 2 * m.goalNetDepth)) / 2));
  });
  test("with stadium the pitch shrinks by PITCH_SHRINK and the stand fills all four sides", () => {
    const plain = buildMetrics(1100, 700, { stadium: false });
    const m = buildMetrics(1100, 700, { stadium: true });
    expect(m.scale).toBeCloseTo(plain.scale * STADIUM.PITCH_SHRINK, 6);
    const s = m.stand!;
    expect(s.outer).toEqual({ x: 0, y: 0, w: 1100, h: 700 });
    for (const side of ["top", "bottom", "left", "right"] as const) expect(s.thickness[side]).toBeGreaterThan(4);
    // the inner rect holds the pitch + run-off and stays inside the canvas
    expect(s.inner.x).toBeLessThan(m.marginX - m.goalNetDepth);
    expect(s.inner.y).toBeLessThan(m.marginY);
    expect(s.inner.y + s.inner.h).toBeGreaterThan(m.marginY + m.height);
    expect(s.inner.x + s.inner.w).toBeLessThanOrEqual(1100);
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/GraficsEngine/pitchMetrics.test.ts` → FAIL.
- [ ] **Step 3: Implementação.** Mover `PITCH_SPEC`, `PitchMetrics` e `buildMetrics` de `PixiPitch.tsx` para `pitchMetrics.ts` (antes de mudar, rodar o `buildMetrics` antigo para 1100×700 e 900×520 e colar os números no primeiro teste como `toEqual` do objeto inteiro). Em `pitchStyle.ts`:

```ts
/** Stadium band around the pitch (spec 2026-10-08-match-visual-design.md). */
export const STADIUM = {
  PITCH_SHRINK: 0.9,
  /** Run-off between the touchline and the stand (officials, technical areas). */
  RUNOFF_YDS: 1.5,
  /** Behind the goals: past the net. */
  END_RUNOFF_YDS: 1,
  SEAT_PX: 5, MAX_SEATS: 6000, CONCRETE_EVERY: 4,
  AWAY_SHARE: 0.12, DEFAULT_FILL: 0.65,
  STAND_COLOR: 0x1f2a36, CONCRETE: 0x2c3946, ROOF_EDGE: 0x445566,
  GOAL_PULSE_S: 0.6,
} as const;
```

`buildMetrics(canvasW, canvasH, opts: { stadium: boolean })`: igual ao de hoje com `scale × (stadium ? PITCH_SHRINK : 1)`; com estádio, `stand = { outer, inner, thickness }`, `inner` = campo + `RUNOFF_YDS × scale` em cima/baixo e rede + `END_RUNOFF_YDS × scale` nos fundos; `thickness` = distância do `inner` à borda do canvas por lado.
- [ ] **Step 4:** testes + `bunx tsc --noEmit -p .`; commit `refactor(partida): métricas do campo em módulo puro, com faixa do estádio`.

---

### Task 3: Torcida (puro)

**Files:** Create `src/GraficsEngine/crowd.ts`, `src/GraficsEngine/crowd.test.ts`.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { crowdSeats, standSeatGrid } from "@/GraficsEngine/crowd";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

const stand = buildMetrics(1100, 700, { stadium: true }).stand!;
const base = { stand, fill: 0.5, homeColor: 0xc8102e, awayColor: 0x1d428a, homeSide: "left" as const, neutral: false, seed: "fix_1" };
const occupied = (s: ReturnType<typeof crowdSeats>) => s.length;

describe("crowd", () => {
  test("occupancy follows fill (±2%)", () => {
    const total = standSeatGrid(stand).length;
    for (const fill of [0, 0.25, 0.5, 0.65, 1]) {
      expect(Math.abs(occupied(crowdSeats({ ...base, fill })) / total - fill)).toBeLessThanOrEqual(0.02);
    }
  });
  test("never more than MAX_SEATS cells", () => {
    expect(standSeatGrid(buildMetrics(2400, 1500, { stadium: true }).stand!).length).toBeLessThanOrEqual(STADIUM.MAX_SEATS);
  });
  test("deterministic by seed, different seeds differ", () => {
    expect(crowdSeats(base)).toEqual(crowdSeats(base));
    expect(crowdSeats(base)).not.toEqual(crowdSeats({ ...base, seed: "fix_2" }));
  });
  test("away block in the right end stand, ~AWAY_SHARE of the fans", () => {
    const seats = crowdSeats(base);
    const away = seats.filter((s) => s.team === "away");
    expect(away.length / seats.length).toBeGreaterThan(STADIUM.AWAY_SHARE - 0.03);
    expect(away.length / seats.length).toBeLessThan(STADIUM.AWAY_SHARE + 0.03);
    expect(away.every((s) => s.x > stand.inner.x + stand.inner.w)).toBe(true);
    const flipped = crowdSeats({ ...base, homeSide: "right" }).filter((s) => s.team === "away");
    expect(flipped.every((s) => s.x < stand.inner.x)).toBe(true);
  });
  test("neutral venue: halves split by the drawn halfway line", () => {
    const seats = crowdSeats({ ...base, neutral: true });
    const mid = stand.outer.x + stand.outer.w / 2;
    expect(seats.filter((s) => s.x < mid).every((s) => s.team === "home")).toBe(true);
    expect(seats.filter((s) => s.x >= mid).every((s) => s.team === "away")).toBe(true);
  });
  test("lower rows fill first", () => {
    const seats = crowdSeats({ ...base, fill: 0.3 }).filter((s) => s.side === "top");
    const low = seats.filter((s) => s.rowFrac < 0.5).length, high = seats.length - low;
    expect(low).toBeGreaterThan(high);
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementação.**
  - `standSeatGrid(stand)` → células `{ x, y, side, row, col, rowFrac }` (`rowFrac` 0 = fileira junto ao campo); célula de `SEAT_PX`, aumentada (passo 1 px) até o total ≤ `MAX_SEATS`; a cada `CONCRETE_EVERY` fileiras uma fileira vazia (concreto, não entra na grade).
  - `crowdSeats(input)` → `{ x, y, side, rowFrac, team: "home" | "away", color }` só dos ocupados. Ocupado se `unitHash(\`${seed}:${side}:${row}:${col}\`) < limiar`, `limiar = k × fill × (1,25 − 0,5 × rowFrac)` com `k` achado por bisseção (até 20 passos) para a fração ocupada bater `fill`; `fill` limitado a 0..1. Use o hash determinístico que já existe (`seedFrom` de `@/Domain/rng`, normalizado a 0..1).
  - Setor visitante: no fundo oposto ao `homeSide`, um bloco contíguo começando no canto de cima até somar `AWAY_SHARE` dos ocupados (com `neutral` a regra é a metade desenhada).
  - Cor: cor do clube com brilho ±12% por hash; 1 em 6 `0xd9dde3`/`0x8a929c`; cor de contraste baixo com `STAND_COLOR` (`contrastRatio < 1,6`, de `playerFaces.ts`) é clareada 35%.
- [ ] **Step 4:** testes + tsc; commit `feat(partida): torcida em pontos proporcional ao público (lógica)`.

---

### Task 4: Árbitro, bandeirinhas, técnicos e animações (puro)

**Files:** Create `src/GraficsEngine/officials.ts`, `officials.test.ts`, `coaches.ts`, `coaches.test.ts`, `playerAnims.ts`, `playerAnims.test.ts`.

- [ ] **Step 1: Testes**

```ts
// officials.test.ts
import { describe, expect, test } from "bun:test";
import { refereeTarget, stepToward, assistantTarget, OFFICIALS } from "@/GraficsEngine/officials";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { createMatchState } from "@/GameEngine/Domain/gameState"; // or the TestCases builder used by other engine tests

describe("referee", () => {
  test("stays at least MIN_BALL_DIST from the ball and inside the pitch", () => {
    for (const ball of [{ x: 2, y: 2 }, { x: 57.5, y: 37 }, { x: 113, y: 72 }]) {
      for (const dir of [1, -1] as const) {
        const t = refereeTarget({ ball, attackDir: dir, players: [] });
        expect(Math.hypot(t.x - ball.x, t.y - ball.y)).toBeGreaterThanOrEqual(OFFICIALS.MIN_BALL_DIST - 1e-6);
        expect(t.x).toBeGreaterThanOrEqual(OFFICIALS.EDGE); expect(t.x).toBeLessThanOrEqual(PITCH_LENGTH - OFFICIALS.EDGE);
        expect(t.y).toBeGreaterThanOrEqual(OFFICIALS.EDGE); expect(t.y).toBeLessThanOrEqual(PITCH_WIDTH - OFFICIALS.EDGE);
      }
    }
  });
  test("steps at most REF_SPEED × dt and snaps above SNAP_DIST", () => {
    const p = stepToward({ x: 50, y: 37 }, { x: 60, y: 37 }, 0.1, OFFICIALS.REF_SPEED);
    expect(Math.hypot(p.x - 50, p.y - 37)).toBeLessThanOrEqual(OFFICIALS.REF_SPEED * 0.1 + 1e-9);
    expect(stepToward({ x: 0, y: 0 }, { x: 80, y: 0 }, 0.016, OFFICIALS.REF_SPEED)).toEqual({ x: 80, y: 0 });
  });
  test("does not stand on a player", () => {
    const t0 = refereeTarget({ ball: { x: 57.5, y: 37 }, attackDir: 1, players: [] });
    const t = refereeTarget({ ball: { x: 57.5, y: 37 }, attackDir: 1, players: [t0] });
    expect(Math.hypot(t.x - t0.x, t.y - t0.y)).toBeGreaterThanOrEqual(1.5);
  });
});

describe("assistants", () => {
  test("each covers its half and stays off the pitch", () => {
    const s = /* a full match state from createMatchState (players at kickoff) */ makeState();
    const top = assistantTarget(s, "top"), bottom = assistantTarget(s, "bottom");
    expect(top.x).toBeGreaterThanOrEqual(PITCH_LENGTH / 2); expect(top.y).toBeLessThan(0);
    expect(bottom.x).toBeLessThanOrEqual(PITCH_LENGTH / 2); expect(bottom.y).toBeGreaterThan(PITCH_WIDTH);
  });
});
```

(`makeState()` = o mesmo construtor de estado usado em `src/GameEngine/Domain/*.engine.test.ts`; copie o padrão de um deles.)

```ts
// playerAnims.test.ts
import { describe, expect, test } from "bun:test";
import { addAnim, animOffset, liveAnims, ANIM_DURATION, isLongShot } from "@/GraficsEngine/playerAnims";

describe("player animations", () => {
  test("offsets start and end at rest", () => {
    for (const kind of ["longShot", "header", "save"] as const) {
      const a = addAnim([], { playerId: 1, kind, dir: { x: 1, y: 0 }, side: 1 }, 0)[0]!;
      expect(animOffset(a, 0)).toEqual({ dx: 0, dy: 0, liftYds: 0, scale: 1, rotation: 0 });
      const end = animOffset(a, ANIM_DURATION[kind]);
      expect(Math.abs(end.dx) + Math.abs(end.dy) + end.liftYds + Math.abs(end.rotation)).toBeLessThan(1e-9);
      expect(end.scale).toBeCloseTo(1, 9);
    }
  });
  test("header lifts, save rotates towards the dive side", () => {
    const [h] = addAnim([], { playerId: 1, kind: "header", dir: { x: 1, y: 0 }, side: 1 }, 0);
    expect(animOffset(h!, ANIM_DURATION.header / 2).liftYds).toBeGreaterThan(1);
    const [s] = addAnim([], { playerId: 2, kind: "save", dir: { x: 0, y: 1 }, side: -1 }, 0);
    expect(animOffset(s!, ANIM_DURATION.save / 2).rotation).toBeLessThan(0);
  });
  test("a new animation of the same player replaces the old one; expired ones drop", () => {
    let list = addAnim([], { playerId: 1, kind: "header", dir: { x: 1, y: 0 }, side: 1 }, 0);
    list = addAnim(list, { playerId: 1, kind: "longShot", dir: { x: 1, y: 0 }, side: 1 }, 0.1);
    expect(list).toHaveLength(1);
    expect(liveAnims(list, 10)).toHaveLength(0);
  });
  test("long shot threshold", () => {
    expect(isLongShot({ x: 90, y: 37 }, 115)).toBe(true);   // 25 yd
    expect(isLongShot({ x: 100, y: 37 }, 115)).toBe(false); // 15 yd
  });
});
```

```ts
// coaches.test.ts
import { describe, expect, test } from "bun:test";
import { coachSlots, coachGesture, GESTURE_DURATION } from "@/GraficsEngine/coaches";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";

describe("coaches", () => {
  test("left coach at 40%, right at 60%, in the bottom run-off", () => {
    const m = buildMetrics(1100, 700, { stadium: true });
    const s = coachSlots(m);
    expect(s.left.x).toBeCloseTo(m.marginX + 0.4 * m.width, 0);
    expect(s.right.x).toBeCloseTo(m.marginX + 0.6 * m.width, 0);
    expect(s.left.y).toBeGreaterThan(m.marginY + m.height);
    expect(s.left.y).toBeLessThan(m.stand!.inner.y + m.stand!.inner.h);
  });
  test("gestures are at rest at both ends", () => {
    for (const kind of ["attack", "defend", "balanced", "celebrate"] as const) {
      expect(coachGesture(kind, 0)).toEqual({ armL: 0, armR: 0, jumpPx: 0 });
      expect(coachGesture(kind, GESTURE_DURATION)).toEqual({ armL: 0, armR: 0, jumpPx: 0 });
    }
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementação** (constantes no topo de cada módulo, ver a spec §3–§5):
  - `officials.ts`: `OFFICIALS = { MIN_BALL_DIST: 6, EDGE: 2, DIAG_X: 8, DIAG_Y: 10, PLAYER_CLEAR: 1.5, REF_SPEED: 8, AR_SPEED: 9, SMOOTH_TAU: 0.6, SNAP_DIST: 30, AR_Y_TOP: -1, AR_Y_BOTTOM: 75, CARD_HOLD_S: 1.5 }`; `refereeTarget({ ball, attackDir, players, freeze? })`; `stepToward(pos, target, dtGameSeconds, maxSpeed)` (suavização exponencial limitada pela velocidade; pula acima de `SNAP_DIST`); `assistantTarget(state, "top" | "bottom")` usa `computeOffsideLine` (`@/GameEngine/Domain/Offside`) com o time cujo `attackDir` aponta para aquela metade e a bola, limitado à metade; `assistantForLineX(lineX)` → `"top"` se ≥ 57,5.
  - `playerAnims.ts`: `ANIM_DURATION = { longShot: 0.45, header: 0.5, save: 0.6 }`, `LONG_SHOT_YDS = 20`, `addAnim`, `liveAnims`, `animOffset` (curvas `sin(π·p)`; `longShot` recua até −0,4 jd e avança até +0,6 jd em `dir`, escala até 1,15; `header` lift até 1,5 jd; `save` desloca até 1,5 jd em `dir` e gira até `side × 70°`), `isLongShot(pos, goalX)` (distância ao centro do gol em y 37).
  - `coaches.ts`: `GESTURE_DURATION = 1.2`, `coachSlots(m)` (px; y = `marginY + height + RUNOFF_YDS × scale × 0,55`, também sem estádio: aí y fica sobre a margem do canvas que existir, mínimo 6 px da borda), `coachGesture(kind, t)` → ângulos dos braços (rad) e pulo em px, todos zero em 0 e em `GESTURE_DURATION`.
- [ ] **Step 4:** testes + tsc; commit `feat(partida): árbitro, bandeirinhas, técnicos e animações (lógica)`.

---

### Task 5: Importância do jogo na demanda (puro)

**Files:** Create `src/Domain/facilities/matchImportance.ts`, `matchImportance.test.ts`; Modify `src/Domain/facilities/facilities.ts` (só o descrito), `src/Domain/facilities/facilities.test.ts`.

- [ ] **Step 1: Testes**

```ts
// matchImportance.test.ts
import { describe, expect, test } from "bun:test";
import { matchImportanceMult, MATCH_IMPORTANCE } from "@/Domain/facilities/matchImportance";

describe("match importance", () => {
  test("ordinary league game = 1", () => {
    expect(matchImportanceMult({ derby: false, competition: "league", knockout: false })).toBe(1);
  });
  test("factors", () => {
    expect(matchImportanceMult({ derby: true, competition: "league", knockout: false })).toBe(MATCH_IMPORTANCE.DERBY);
    expect(matchImportanceMult({ derby: false, competition: "cup", knockout: true })).toBe(MATCH_IMPORTANCE.CUP_KNOCKOUT);
    expect(matchImportanceMult({ derby: false, competition: "continental", knockout: true })).toBe(MATCH_IMPORTANCE.CONTINENTAL_KNOCKOUT);
    expect(matchImportanceMult({ derby: false, competition: "continental", knockout: false })).toBe(1);
  });
  test("combined, capped", () => {
    expect(matchImportanceMult({ derby: true, competition: "continental", knockout: true })).toBe(MATCH_IMPORTANCE.MAX);
    expect(matchImportanceMult({ derby: true, competition: "cup", knockout: true })).toBe(MATCH_IMPORTANCE.MAX); // 1,38 → 1,3
  });
});
```

E em `facilities.test.ts`, dentro de `describe("stadium")`:

```ts
test("importance multiplies the demand; absent = unchanged; attendance never above capacity", () => {
  const f = initialFacilities(squadWith(40_000, 200_000), 1);
  const input = { followers: 200_000, tier: 1, fans: 60 };
  expect(demandOf(f, { ...input, importance: 1 })).toBe(demandOf(f, input));
  expect(demandOf(f, { ...input, importance: 1.2 })).toBeCloseTo(demandOf(f, input) * 1.2, 6);
  const a = attendanceOf(f, { ...input, fans: 100, importance: 1.3 });
  expect(a.attendance).toBeLessThanOrEqual(a.capacity);
});
```
(use o construtor de squad que o arquivo de teste já usa; ajuste o nome.)

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementação.** `matchImportance.ts` com `MATCH_IMPORTANCE = { DERBY: 1.2, CUP_KNOCKOUT: 1.15, CONTINENTAL_KNOCKOUT: 1.25, MAX: 1.3 }` e `matchImportanceMult` (produto, `Math.min(MAX, …)`; `knockout` só conta em copa e continental). Em `facilities.ts`, **só**:
  - `DemandInput`: `/** Big-match multiplier (derby, cup/continental knockout: matchImportance.ts); absent = 1. */ importance?: number;`
  - `demandOf`: `const importance = input.importance ?? 1;` e `× importance` no produto do `return`.
  - `HomeGameToday`: `importance?: number;`
  - `facilitiesMatchday`: `attendanceOf(cur, { ...input, date, ...(g.importance !== undefined ? { importance: g.importance } : {}) })`.
- [ ] **Step 4:** `bun test src/Domain/facilities` + tsc; commit `feat(instalações): clássico e mata-mata aumentam a demanda do clube do jogador`.

---

### Task 6: Importância no servidor (avanço do dia e instalações)

**Files:** Create `src/backend/matchImportance.ts`, `src/backend/matchImportance.test.ts`; Modify `src/backend/advanceDay.ts` (linha que empilha `playerHomeFixturesToday`), `src/backend/facilityRoutes.ts`, `src/backend/facilities.routes.test.ts`, `src/GameInterface/Facilities/facilitiesApi.ts`, `src/GameInterface/Facilities/FacilitiesView.tsx`.

- [ ] **Step 1: Testes.** `matchImportance.test.ts` com um save de teste (padrão de `facilities.routes.test.ts`: criar save, ler clubes): (a) jogo de liga contra clube de cidade diferente e não líder → `mult 1`, `derby false`; (b) mesma cidade (grave `venue.city` igual nos dois squads pelo `saveSquad`) → `1,2`; (c) adversário líder da tabela com jogos (grave `standings`) → `derby true`; (d) fixture de copa com `knockout: true` → `1,15`; (e) a cidade compara sem acento/caixa (`"São Paulo"` × `"sao paulo"`). Em `facilities.routes.test.ts`: `GET /facilities` traz `importanceByFixture` com uma chave por jogo em casa ainda não jogado da temporada, valores ≥ 1.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementação.**

```ts
// src/backend/matchImportance.ts
/** Big-match multiplier of a home game of the human club (spec 2026-10-08-match-visual §6). */
export async function homeMatchImportance(
  service: SaveService, saveId: string, fixture: Fixture, clubId: string,
  ctx: { leagueSlug: string; standings?: StandingRow[] | null; squadOf?: (id: string) => Promise<Squad | null> },
): Promise<{ derby: boolean; mult: number }>
```
  Lê o próprio clube e o adversário (`ctx.squadOf` ou `service.getSquadById`), a tabela da liga só se `fixture.competition === ctx.leagueSlug` (lida uma vez por chamada se não veio em `ctx`), `isDerby` (`@/Domain/boardFans/boardFans`) com a mesma regra de `boardWorld.ts` (líder = `table[0]`, `mp > 0`, diferente do próprio clube), e `matchImportanceMult` com `competition` por `isCupSlug`/`isContinentalSlug`.
  - `advanceDay.ts`: o objeto empilhado em `playerHomeFixturesToday` ganha `importance` (calculado na hora de empilhar, antes dos jogos; a tabela do dia já está carregada nesse ponto ou é lida uma vez, cache local da função). O tipo do array ganha `importance?: number`; `facilitiesMatchday` recebe os jogos como já recebe.
  - `facilityRoutes.ts` (`facilitiesView`): `importanceByFixture` para os jogos em casa não jogados da temporada atual (fixtures do calendário do jogador: liga, copa e continental, como `GET /api/saves/:id` monta), com cache de squads por requisição.
  - `facilitiesApi.ts`: tipo novo; `FacilitiesView.buildSeasonGames` passa `importance: data.importanceByFixture?.[fx.id]` ao `attendanceOf`.
- [ ] **Step 4:** `bun test src/backend/matchImportance.test.ts src/backend/facilities.routes.test.ts src/Domain/facilities` + tsc; commit `feat(instalações): importância do jogo na bilheteria e no gráfico de público`.

---

### Task 7: `match-setup` com público e técnicos; prévia

**Files:** Modify `src/backend/routes.ts` (`/api/match-setup`), `src/GameInterface/MatchPreviewScreen.tsx`; Create `src/backend/matchSetup.crowd.test.ts`; helper `countryOfClub` extraído de `managerRoutes.ts` para `src/backend/managerWorld.ts` (ou arquivo próprio) e reaproveitado.

- [ ] **Step 1: Teste** (`matchSetup.crowd.test.ts`, mesmo padrão de chamada de rota de `continentalWorld.test.ts`): save com o jogador em casa no dia → `crowd.known`, `attendance ≤ capacity`, igual a `attendanceOf` com a importância; jogo fora → `attendance = round(capacidade do mandante × 0,65)`, `importance 1`; fixture neutra → `known false`; clássico (cidades iguais) em casa → `importance 1,2`; `managers.mine.id === "player"`, `managers.opponent.id` = o técnico do clube adversário em `managers.json`.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementação** (spec §7): no ramo com `saveIdParam`, depois de achar `matchFixture`, montar `crowd` (casa: `squad.facilities` + `attendanceOf` com `followers`, `tier` = `leagueTierOf`, `fans` = `meta.board?.fans` (`stadiumFillRate` de `@/Domain/boardFans/boardFans` quando não há instalações), fração da temporada, `date`, `importance` de `homeMatchImportance`; sem instalações: capacidade × `stadiumFillRate(fans)`; fora: regra da IA; neutro: `known: false`) e `managers` (ler `managers.json` uma vez com `saveService.getManagers(saveId)`). Somar ao `Response.json`.
  - Prévia: o `expectedCrowd` passa a vir de `matchSetup.crowd` (quando `known` e jogo em casa); remover o `useFacilities` só se nada mais na tela o usa.
- [ ] **Step 4:** testes + tsc + `bun run ui:audit` (prévia limpa); commit `feat(partida): público e técnicos no match-setup; prévia usa o mesmo público`.

---

### Task 8: Estádio no `PixiPitch`

**Files:** Modify `src/GraficsEngine/PixiPitch.tsx`, `src/GraficsEngine/pitchStyle.ts` (se faltar constante).

- [ ] **Step 1:** prop `stadium?: { fill: number; homeTeam: TeamId; neutral: boolean; seed: string } | null`. `buildMetrics(canvasWidth, canvasHeight, { stadium: !!stadium })` na montagem (mudar o estádio liga/desliga remonta: incluir `stadium ? 1 : 0` na `key` do `PixiPitch` nas telas). Fundo do canvas: `PITCH_COLOR` continua; com estádio, pintar `stand.outer − stand.inner` com `STAND_COLOR` e o recuo com a grama escura.
- [ ] **Step 2:** desenhar arquibancada + pontos (`crowdSeats`, raio `SEAT_PX × 0,38`) num `Graphics`, assar com `app.renderer.generateTexture({ target: g, resolution: app.renderer.resolution })`, `Sprite` no fundo do `stage` (antes das listras), destruir o `Graphics`. `homeSide`: lado desenhado do mandante = `homeTeam` desenhado à esquerda? (`mirror` × `homeTeam`: o time A é desenhado à esquerda quando `!mirror`). Cores: `fillA`/`fillB` pelo `homeTeam`.
- [ ] **Step 3:** redesenhar a textura só quando `stadium.fill`, `homeTeam`, `neutral` ou as cores mudam (`useEffect` que chama uma função `redrawCrowdRef.current?.()` criada no setup; destruir a textura antiga).
- [ ] **Step 4:** gol do mandante (`goalScored` com `e.team === homeTeam`): pulso de alpha no sprite (`GOAL_PULSE_S`) no relógio dos efeitos; com a aba oculta não enfileira (mesma checagem de `pushEffect`).
- [ ] **Step 5:** olhar na tela (`/test` ainda sem toggle: passe a prop temporariamente) 1100×700 e 900×520; se a arquibancada lateral ficar com menos de ~3 fileiras, aplicar o ponto aberto 1 da spec (`PITCH_SHRINK = 0,88`) e registrar a decisão na spec. tsc; commit `feat(partida): estádio com torcida em volta do campo`.

---

### Task 9: Árbitro, bandeirinhas e técnicos no `PixiPitch`

**Files:** Modify `src/GraficsEngine/PixiPitch.tsx`, `src/GraficsEngine/effectsRender.ts` (cartão do árbitro e bandeira, se ficar melhor ali).

- [ ] **Step 1:** props `officials?: boolean`, `coaches?: Partial<Record<TeamId, { faceUrl?: string; color: string }>>`, `coachCue?: { team: TeamId; kind: "attack" | "defend" | "balanced"; seq: number } | null`.
- [ ] **Step 2:** árbitro (`Container`: sombra, disco preto 0,75 × `markerR`, borda clara) e dois bandeirinhas (0,6 ×, bandeira) no `world`; a cada quadro, com `dtGame = ticker.deltaMS/1000 × gameSpeed` (0 na pausa), `stepToward` ao `refereeTarget`/`assistantTarget`; posição via `toPixel` (espelho incluso). Sem `officials`, nada é criado.
- [ ] **Step 3:** sinais: `offsideCalled` → bandeira erguida 2 s no bandeirinha de `assistantForLineX`; `foul` → guardar o ponto; `card` → árbitro com alvo travado no último `foul` por `CARD_HOLD_S` e cartão (retângulo amarelo/vermelho) acima dele por 2 s. Com a aba oculta não enfileira; ao voltar (`document.visibilitychange` → visível) o `stepToward` pula (distância > `SNAP_DIST`) ou anda normalmente.
- [ ] **Step 4:** técnicos em `coachSlots(m)`; time desenhado à esquerda = A se `!mirror`, senão B. Rosto: `loadFaceCanvas(faceUrl, size)` + textura no mesmo mapa `faceTextures` (destruído no unmount); sem URL ou falha, círculo na cor do clube. Corpo: retângulo arredondado escuro com gola na cor. Gestos: `coachCue.seq` muda → gesto do time; `goalScored` → `celebrate` do time que marcou; braços = duas linhas de 3 px com o ângulo de `coachGesture`.
- [ ] **Step 5:** tsc; commit `feat(partida): árbitro, bandeirinhas e técnicos à beira do campo`.

---

### Task 10: Animações de jogadores no `PixiPitch`

**Files:** Modify `src/GraficsEngine/PixiPitch.tsx`.

- [ ] **Step 1:** lista `anims` no relógio dos efeitos; gatilhos: `shot` (posição do chutador no estado; `isLongShot` contra o gol que ele ataca, `dir` = chutador → centro do gol) → `longShot`; `header` → `header`; `shotResolved` com `inPosts && !isGoal` → `save` no goleiro do time que defende (`dir` = (0, sinal(toY − y do goleiro)), `side` = mesmo sinal); `penaltyResolved` com `!scored && keeperId` → `save` com lado por `seedFrom(minuto:takerId)`. Mesma regra de aba oculta.
- [ ] **Step 2:** no desenho dos marcadores, depois da interpolação: `marker.x/y += toPixel(dx, dy)` relativo (atenção ao espelho: `dx` em jardas do motor é invertido no desenho quando `mirror`), `marker.y −= liftYds × scale × BALL.LIFT_PX_PER_YD`, `marker.scale`, `marker.rotation`; sombra encolhe com o lift como a da bola; "linhas de força" do chute longo em `effectsGfx`.
- [ ] **Step 3:** tsc; olhar no `/test` (cenários de chute, `cross-to-box`, `direct-free-kick`); commit `feat(partida): animações de chute de longe, cabeçada e defesa`.

---

### Task 11: Partida ao vivo

**Files:** Modify `src/GameInterface/MatchScreen.tsx`.

- [ ] **Step 1:** guardar `crowd` e `managers` do `match-setup`; `stadium = { fill: crowd.known ? attendance / capacity : STADIUM.DEFAULT_FILL, homeTeam: (o time do motor que é o mandante da fixture: A se o jogador é mandante, B se visitante; neutro: A), neutral: !!fixture.neutral, seed: fixture.id }`.
- [ ] **Step 2:** `coaches = { A: { faceUrl: managerFaceUrl(managers.mine, cores do clube), color }, B: managers.opponent ? { faceUrl: managerFaceUrl(managers.opponent, cores), color } : { color } }`; `officials` ligado.
- [ ] **Step 3:** `handleMentalityChange` incrementa `coachCue = { team: "A", kind: next === "attacking" ? "attack" : next === "defensive" ? "defend" : "balanced", seq }`. A retomada da partida (snapshot) não precisa guardar nada novo.
- [ ] **Step 4:** a `key` do `PixiPitch` não muda com o público (só com o tamanho). tsc; `bun run ui:audit`; jogar uma partida em casa e uma fora (o mandante à esquerda, setor visitante à direita); commit `feat(partida): estádio, árbitros e técnicos na partida ao vivo`.

---

### Task 12: Medição do efeito na bilheteria (obrigatória)

**Files:** Create `scripts/match-importance-measure.ts`.

- [ ] **Step 1:** script (spec §6, "Medição"): lê `src/Data/squads` das ligas `premier_league`, `brazil_serie_a`, `of_championship`; para cada clube, `initialFacilities` (tier pela pirâmide), jogos em casa = um por adversário da liga (clássico se `isDerby` por cidade), +1 contra o líder (clássico), +1,5 de copa em mata-mata (peso 1,5 no somatório); `fans 60`, seguidores do squad, fase neutra; soma `facilitiesGate` com e sem `importance`. Imprime por liga: clubes com clássico por cidade, variação da bilheteria da temporada (mediana, p90, máx.).
- [ ] **Step 2:** rodar `bun scripts/match-importance-measure.ts`; colar a tabela no fim da spec (seção "Medição — resultado") e guardar para a Tarefa 14. Se a mediana passar de +6%, parar e registrar como ponto aberto (não ajustar sozinho).
- [ ] **Step 3:** commit `chore(instalações): medição do público em jogos importantes`.

---

### Task 13: `/test`: toggles, público e medição "depois"

**Files:** Modify `src/GameInterface/TestScreen.tsx`.

- [ ] **Step 1:** toggles "Estádio" e "Árbitros" (desligados por padrão; `Chip` de `ui/`) e, com o estádio, `OptionChips` de público (0/25/50/75/100%, padrão 65 → mostrar "Padrão") e um `Chip` "Campo neutro". Passar `stadium = { fill, homeTeam: "A", neutral, seed: "test" }`, `officials`, `coaches = { A: { color: teamAColor }, B: { color: teamBColor } }` (sem rosto). `key` do `PixiPitch` inclui o estado do estádio.
- [ ] **Step 2: Medir "depois"** igual à Tarefa 1 (estádio e árbitros ligados, público 100%, o pior caso). Aceite: ms/quadro médio sobe no máximo 1 ms e o FPS fica em 60. Se não passar: medir com só o estádio e só os árbitros para achar o culpado, corrigir (a torcida tem de ser um único sprite) e medir de novo.
- [ ] **Step 3:** tsc; commit `test(partida): estádio, árbitros e público no /test`.

---

### Task 14: Regras, changelog, versão, roadmap, verificação final

**Files:** Modify `.claude/rules/graphics-engine.md`, `.claude/rules/match-flow.md`, `.claude/rules/game/facilities.md`, `src/GameInterface/changelog/changelog.ts` (CRLF), `package.json`, `docs/ROADMAP.md`, a spec (resultados).

- [ ] **Step 1:** `graphics-engine.md`: arquivos novos (`pitchMetrics`, `crowd`, `officials`, `coaches`, `playerAnims`), a faixa do estádio (campo ×0,9), a torcida assada numa textura, árbitro/bandeirinhas/técnicos/animações só no desenho, medidor do `/test` e as medições antes/depois. `match-flow.md`: seção "Stadium, officials and coaches (Etapa 38, 4.12)" com `match-setup.crowd`/`managers`, o mandante à esquerda e o setor visitante à direita, o gesto da mentalidade. `facilities.md`: "Jogos importantes" (fatores, só o clube do jogador, onde é calculado, `importanceByFixture`, a tabela da medição).
- [ ] **Step 2:** changelog (ferramenta Edit, conferir CRLF depois): entrada nova no topo

```ts
  {
    version: "4.12",
    date: "<data do merge>",
    items: [
      { pt: "A partida ganhou árbitro e bandeirinhas, os técnicos à beira do campo e animações de chute de longe, cabeçada e defesa", en: "Matches now show the referee and assistants, both managers on the touchline and animations for long shots, headers and saves" },
      { pt: "Estádio em volta do campo, com a torcida dos dois times proporcional ao público do jogo", en: "A stadium around the pitch, with both sets of fans filling it in proportion to the crowd" },
      { pt: "Clássicos e mata-matas de copa e continental atraem mais público no seu estádio", en: "Derbies and cup or continental knockout ties draw bigger crowds to your stadium" },
    ],
  },
```
  e tirar de `upcoming` o item "Partida com árbitros, técnicos à beira do campo e estádio com torcida" (pôr a próxima etapa do ROADMAP no lugar, se faltar). Se a 4.10/4.11 já estiverem no `main`, a entrada vai acima delas (rebase antes). `package.json` `"version": "4.12"`.
- [ ] **Step 3:** ROADMAP: etapa 38 ✅ (4.12) com as decisões: faixa fina em volta do campo (campo ×0,9 ou o valor final), torcida proporcional ao público; público ×1,20 clássico / ×1,15 copa / ×1,25 continental (teto ×1,30), só o clube do jogador; o efeito medido na bilheteria.
- [ ] **Step 4: Verificação:** `bunx tsc --noEmit -p .`; `bun test` (inteiro; se faltar memória, um arquivo grande por vez — `rerun-tests-after-oom`); `bun run ui:audit` (0 duras, 0 leves nos arquivos tocados); `bun scripts/season-rollover-smoke.ts` (seção "Instalações": público ≤ capacidade; um jogo em casa registrado como clássico/mata-mata com demanda maior que um comum próximo — adicionar essa checagem ao smoke nesta tarefa). Partida ao vivo em casa e fora, conferindo o espelho.
- [ ] **Step 5:** commit `docs: etapa 38 (visual da partida e estádio), 4.12`.

---

## Auto-revisão

- Cobertura da spec: §1 → T2/T8; §2 → T3/T8; §3 → T4/T9; §4 → T4/T9/T11; §5 → T4/T10; §6 → T5/T6/T12; §7 → T7/T11; §8 → T8–T10; §9 → T1/T13; §10 → testes de cada tarefa + T14; pontos abertos → T8 (encolhimento), T6 (líder nas previsões), T9 (técnico sem registro).
- Nada toca motor, quickSim, `/lab`, `Statistics.ts` (sem efeito de partida — `CLAUDE.md` exige `/lab` só para mecânica observável do motor).
- Merge com a Etapa 34: em `facilities.ts` só 4 linhas pontuais (T5); regras novas em `matchImportance.ts` (domínio e backend).
