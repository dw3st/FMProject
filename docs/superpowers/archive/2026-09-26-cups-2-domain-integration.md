# Copas — Plano 2: domínio das copas e integração com o save

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada país ganha uma copa nacional de mata-mata que é gerada com a carreira, jogada pelo avanço
do dia (motor/quickSim com prorrogação e pênaltis do Plano 1), sorteada fase a fase, arquivada e
regenerada na virada do país, e guardada nos start kits.

**Architecture:** a copa mora em `saves/{id}/leagues/cup_<país>/` com os mesmos arquivos de uma liga
(`meta.json`, `rounds/{n}.json`, `date-index.json`, sem `standings.json`), então o avanço do dia já
encontra os jogos dela pelo `date-index`. A copa **não** entra em `meta.activeLeagues` (as regras de
fim de temporada e virada continuam só para ligas). Toda a lógica de copa é pura, em
`src/Domain/cups/`; `src/backend/cupWorld.ts` faz a E/S.

**Tech Stack:** Bun, TypeScript, `bun:test`.

Spec: `docs/superpowers/specs/2026-09-26-national-cups-design.md` (seções 1 e 3). Plano 1 (motor de
mata-mata) já está na branch. Branch: `feat/national-cups`. Regras: imports com `@/`; commits terminam
com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca mate todos os processos `bun`;
não apague arquivos que você não criou; `git add` só com caminhos explícitos.

**Desvio consciente da spec (seção 3):** a spec pedia a copa inteira do país do jogador no motor
completo. Com ~40 jogos na primeira fase da FA Cup isso daria ~30 s num único avanço de dia. Aqui:
jogo de copa roda no motor completo **só quando um dos dois clubes é da liga do jogador** (ou é o
próprio jogador); o resto usa o quickSim.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/types/calendarTypes.ts` | `CupStage`, `CupMetaData`, `LeagueSeasonMeta.kind/cup`, `Fixture.knockout/neutral/decider` |
| `src/types/dayLogTypes.ts` | `MatchEvent.decider` |
| `src/Domain/cups/cupIds.ts` (+ teste) | `cupSlugOf`, `isCupSlug`, `seedFrom` |
| `src/Domain/cups/cupStructure.ts` (+ teste) | `planStages(n)` → fases, preliminar, nomes |
| `src/Domain/cups/cupDates.ts` (+ teste) | `scheduleStageDates` (quartas-feiras, sem choque com a liga) |
| `src/Domain/cups/cupDraw.ts` (+ teste) | `drawTies` (pares, mando do nível mais baixo, final neutra) |
| `src/Domain/cups/generateCup.ts` (+ teste) | `generateCup` → meta + rodadas + date-index |
| `src/Domain/cups/cupProgress.ts` (+ teste) | `fixtureWinner`, `stageComplete`, `drawNextStage`, `cupChampion` |
| `src/Domain/cups/cupRollover.ts` (+ teste) | `countriesToRegenerate`, `buildCupArchive` |
| `src/Domain/advanceDay/quickSim.ts`, `matches.ts` (+ teste) | `neutral`, `knockout` vindos da fixture; `decider` no evento |
| `src/backend/cupWorld.ts` | E/S: clubes por país, gerar/gravar copa, avançar fases |
| `src/backend/SaveService.ts` | `createSave` gera as copas; `listCompetitionSlugs` |
| `src/backend/advanceDay.ts` | jogos de copa, sorteio da fase seguinte, campeão, virada |
| `src/backend/startKits.ts` | kits guardam as copas |
| `scripts/season-rollover-smoke.ts` | checagens de copa |
| `.claude/rules/game/cups.md` | **novo** — documentação |

---

### Task 1: tipos

**Files:**
- Modify: `src/types/calendarTypes.ts`
- Modify: `src/types/dayLogTypes.ts` (interface `MatchEvent`)

- [ ] **Step 1: Tipos de calendário**

Em `src/types/calendarTypes.ts`, no `Fixture`, depois de `result: ...;`:

```ts
  /** Knockout fixture (cup): a draw after 90' goes to extra time and penalties. */
  knockout?:   true;
  /** Neutral venue (cup final): no home advantage. */
  neutral?:    true;
  /** Knockout only: extra-time goals / shootout. Absent when decided in 90'. */
  decider?:    MatchDecider;
```

Acima de `export interface LeagueSeasonMeta`, adicione:

```ts
/** Stage keys, by number of entrants: preliminary, r128 … r16, qf, sf, final. */
export type CupStageName = "preliminary" | "r128" | "r64" | "r32" | "r16" | "qf" | "sf" | "final";

/** One knockout stage of a national cup. `round` is the RoundFixtures file number. */
export interface CupStage {
  round:    number;
  name:     CupStageName;
  date:     string;
  /** Clubs in this stage once drawn (empty before the draw). */
  entrants: string[];
  drawn:    boolean;
}

export interface CupMetaData {
  /** leagueData `country`. */
  country:    string;
  stages:     CupStage[];
  /** Clubs that skip the preliminary stage and enter at stage 2 (empty when there is none). */
  byes:       string[];
  /** Club tier (1 = top) at generation time — decides who hosts. */
  tiers:      Record<string, number>;
  championId: string | null;
}
```

Em `LeagueSeasonMeta`, depois de `restDays?: string[];`:

```ts
  /** "cup" for a national cup; absent for a league. */
  kind?:        "cup";
  cup?:         CupMetaData;
```

- [ ] **Step 2: Evento da partida**

Em `src/types/dayLogTypes.ts`, na interface `MatchEvent`, depois de `durationMs: number;`:

```ts
  /** Knockout only: extra-time goals and shootout (home/away). Absent when decided in 90'. */
  decider?: import("@/types/calendarTypes").MatchDecider;
```

- [ ] **Step 3: Checar e commitar**

Run: `bunx tsc --noEmit -p .` → sem erros.

```bash
git add src/types/calendarTypes.ts src/types/dayLogTypes.ts
git commit -m "feat(cups): cup meta, stage and knockout fixture types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: identificadores e semente

**Files:**
- Create: `src/Domain/cups/cupIds.ts`, `src/Domain/cups/cupIds.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { cupSlugOf, isCupSlug, seedFrom } from "@/Domain/cups/cupIds";

describe("cupIds", () => {
  test("slug from country name", () => {
    expect(cupSlugOf("England")).toBe("cup_england");
    expect(cupSlugOf("Côte d'Ivoire")).toBe("cup_cote_d_ivoire");
    expect(cupSlugOf("Saudi Arabia")).toBe("cup_saudi_arabia");
  });
  test("isCupSlug", () => {
    expect(isCupSlug("cup_england")).toBe(true);
    expect(isCupSlug("premier_league")).toBe(false);
  });
  test("seedFrom is deterministic and spreads", () => {
    expect(seedFrom("a:2026:England:1")).toBe(seedFrom("a:2026:England:1"));
    expect(seedFrom("a:2026:England:1")).not.toBe(seedFrom("a:2026:England:2"));
    expect(Number.isInteger(seedFrom("x"))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/cups/cupIds.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
/** Cup identity helpers. One national cup per leagueData `country`. */

/** `cup_` + country name lower-cased, accents stripped, non-alphanumerics → `_`. */
export function cupSlugOf(country: string): string {
  const base = country
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `cup_${base}`;
}

export function isCupSlug(slug: string): boolean {
  return slug.startsWith("cup_");
}

/** 32-bit FNV-1a hash of a key — seed for mulberry32 (deterministic draws). */
export function seedFrom(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
```

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit**

```bash
git add src/Domain/cups/cupIds.ts src/Domain/cups/cupIds.test.ts
git commit -m "feat(cups): cup slug and seed helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: estrutura de fases

**Files:**
- Create: `src/Domain/cups/cupStructure.ts`, `src/Domain/cups/cupStructure.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { planStages, stageNameFor } from "@/Domain/cups/cupStructure";

describe("planStages", () => {
  test("power of two: no preliminary", () => {
    expect(planStages(16)).toEqual({ preliminaryClubs: 0, stageNames: ["r16", "qf", "sf", "final"] });
    expect(planStages(2)).toEqual({ preliminaryClubs: 0, stageNames: ["final"] });
  });
  test("44 clubs: 24 play a preliminary, 20 byes, then r32", () => {
    expect(planStages(44)).toEqual({
      preliminaryClubs: 24,
      stageNames: ["preliminary", "r32", "r16", "qf", "sf", "final"],
    });
  });
  test("3 clubs: 2 play the preliminary, winner meets the bye in the final", () => {
    expect(planStages(3)).toEqual({ preliminaryClubs: 2, stageNames: ["preliminary", "final"] });
  });
  test("fewer than 2 clubs: no cup", () => {
    expect(planStages(1)).toBeNull();
    expect(planStages(0)).toBeNull();
  });
  test("stage names by entrants", () => {
    expect(stageNameFor(2)).toBe("final");
    expect(stageNameFor(4)).toBe("sf");
    expect(stageNameFor(8)).toBe("qf");
    expect(stageNameFor(128)).toBe("r128");
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { CupStageName } from "@/types/calendarTypes";

/** Stage key for a stage with `entrants` clubs (a power of two ≥ 2). */
export function stageNameFor(entrants: number): Exclude<CupStageName, "preliminary"> {
  if (entrants <= 2) return "final";
  if (entrants <= 4) return "sf";
  if (entrants <= 8) return "qf";
  if (entrants <= 16) return "r16";
  if (entrants <= 32) return "r32";
  if (entrants <= 64) return "r64";
  return "r128";
}

export interface StagePlan {
  /** Clubs (the lowest-tier ones) that play the preliminary stage; 0 = none. */
  preliminaryClubs: number;
  stageNames: CupStageName[];
}

/**
 * Knockout stages for `n` clubs. F = ceil(log2 n) stages. When n is not a power of two, stage 1 is a
 * preliminary with 2 × (n − 2^(F−1)) clubs; its winners plus the byes make 2^(F−1) for stage 2.
 */
export function planStages(n: number): StagePlan | null {
  if (n < 2) return null;
  const f = Math.ceil(Math.log2(n));
  const full = 2 ** f;
  const names: CupStageName[] = [];
  if (full === n) {
    for (let e = n; e >= 2; e /= 2) names.push(stageNameFor(e));
    return { preliminaryClubs: 0, stageNames: names };
  }
  const half = 2 ** (f - 1);
  names.push("preliminary");
  for (let e = half; e >= 2; e /= 2) names.push(stageNameFor(e));
  return { preliminaryClubs: 2 * (n - half), stageNames: names };
}
```

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** (`feat(cups): knockout stage structure`).

---

### Task 4: datas das fases

**Files:**
- Create: `src/Domain/cups/cupDates.ts`, `src/Domain/cups/cupDates.test.ts`

Regras: as `F` datas ficam em `[start, end − 7 dias]`; o alvo da fase `i` (0-based) é
`start + round(span × (i+1)/F)`; vai para a quarta-feira mais próxima (a partir do alvo, procurando
0, +1, −1, +2, −2, +3, −3 dias); uma data é inválida se ela ou o dia anterior está em `busy`, se sai
da janela, ou se fica a menos de 3 dias da fase anterior; se nenhuma quarta-feira servir, aceita
qualquer dia livre na mesma busca; se nada servir, usa o alvo mesmo (ainda estritamente depois da
anterior).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { scheduleStageDates } from "@/Domain/cups/cupDates";

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

describe("scheduleStageDates", () => {
  test("F dates, strictly increasing, inside the window, final ≥ 7 days before end", () => {
    const dates = scheduleStageDates("2026-08-15", "2027-05-20", 6, new Set());
    expect(dates).toHaveLength(6);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! > dates[i - 1]!).toBe(true);
    expect(dates[0]! >= "2026-08-15").toBe(true);
    expect(dates[5]! <= "2027-05-13").toBe(true);
    for (const d of dates) expect(dow(d)).toBe(3); // Wednesday
  });

  test("avoids busy days and the day after a busy day", () => {
    const free = scheduleStageDates("2026-08-15", "2027-05-20", 4, new Set());
    const busy = new Set(free);                                    // block every chosen Wednesday
    for (const d of free) busy.add(new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
    const dates = scheduleStageDates("2026-08-15", "2027-05-20", 4, busy);
    for (const d of dates) {
      expect(busy.has(d)).toBe(false);
      const prev = new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      expect(busy.has(prev)).toBe(false);
    }
  });

  test("calendar-year window", () => {
    const dates = scheduleStageDates("2027-02-05", "2027-11-30", 3, new Set());
    expect(dates[0]! >= "2027-02-05").toBe(true);
    expect(dates[2]! <= "2027-11-23").toBe(true);
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const WEDNESDAY = 3;
const FINAL_BEFORE_END_DAYS = 7;
const MIN_GAP_DAYS = 3;
const OFFSETS = [0, 1, -1, 2, -2, 3, -3];

/**
 * Dates for `stages` cup stages inside [start, end − 7d]: spread evenly, snapped to a Wednesday
 * with no league game that day or the day before (`busy` = dates any club of the country plays
 * a league game).
 */
export function scheduleStageDates(start: string, end: string, stages: number, busy: Set<string>): string[] {
  const lo = toMs(start);
  const hi = toMs(end) - FINAL_BEFORE_END_DAYS * DAY;
  const span = Math.max(0, hi - lo);
  const out: string[] = [];
  let prev = -Infinity;

  const ok = (ms: number, wantWednesday: boolean) =>
    ms >= lo && ms <= hi && ms >= prev + MIN_GAP_DAYS * DAY &&
    (!wantWednesday || new Date(ms).getUTCDay() === WEDNESDAY) &&
    !busy.has(toIso(ms)) && !busy.has(toIso(ms - DAY));

  for (let i = 0; i < stages; i++) {
    const target = lo + Math.round((span * (i + 1)) / stages / DAY) * DAY;
    // Nearest Wednesday to the target, then search around it.
    const toWed = ((WEDNESDAY - new Date(target).getUTCDay() + 7) % 7);
    const wed = target + (toWed <= 3 ? toWed : toWed - 7) * DAY;
    let pick: number | null = null;
    for (const o of OFFSETS) if (pick === null && ok(wed + o * 7 * DAY, true)) pick = wed + o * 7 * DAY;
    for (const o of OFFSETS) if (pick === null && ok(target + o * DAY, false)) pick = target + o * DAY;
    if (pick === null) pick = Math.max(target, prev + DAY);
    out.push(toIso(pick));
    prev = pick;
  }
  return out;
}
```

(O primeiro laço procura quartas-feiras vizinhas — semanas antes/depois; o segundo, qualquer dia livre
perto do alvo.)

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** (`feat(cups): stage date scheduling`).

---

### Task 5: sorteio de uma fase

**Files:**
- Create: `src/Domain/cups/cupDraw.ts`, `src/Domain/cups/cupDraw.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { drawTies } from "@/Domain/cups/cupDraw";
import { mulberry32 } from "@/Domain/rng";

const clubs = (n: number, tier = (i: number) => 1 + (i % 3)) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, tier: tier(i) }));

describe("drawTies", () => {
  test("pairs everyone exactly once", () => {
    const ties = drawTies(clubs(16), mulberry32(1), false);
    expect(ties).toHaveLength(8);
    const ids = ties.flatMap((t) => [t.home, t.away]).sort();
    expect(ids).toEqual(clubs(16).map((c) => c.id).sort());
  });
  test("the lower-tier club hosts", () => {
    const ties = drawTies(clubs(32), mulberry32(2), false);
    const tier = new Map(clubs(32).map((c) => [c.id, c.tier]));
    for (const t of ties) expect(tier.get(t.home)!).toBeGreaterThanOrEqual(tier.get(t.away)!);
  });
  test("deterministic for the same rng seed", () => {
    expect(drawTies(clubs(8), mulberry32(9), false)).toEqual(drawTies(clubs(8), mulberry32(9), false));
  });
  test("neutral final flag", () => {
    const [t] = drawTies(clubs(2), mulberry32(3), true);
    expect(t!.neutral).toBe(true);
  });
  test("odd count throws", () => {
    expect(() => drawTies(clubs(3), mulberry32(1), false)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
export interface CupEntrant { id: string; tier: number }
export interface CupTie { home: string; away: string; neutral?: true }

/**
 * Random pairing (Fisher–Yates with the given rng). The club of the LOWER level (higher tier
 * number) hosts; same level → coin flip. `neutral` marks every tie as neutral (the final).
 */
export function drawTies(entrants: CupEntrant[], rng: () => number, neutral: boolean): CupTie[] {
  if (entrants.length % 2 !== 0) throw new Error(`drawTies: odd number of entrants (${entrants.length})`);
  const pool = [...entrants].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const ties: CupTie[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    const a = pool[i]!, b = pool[i + 1]!;
    const aHosts = a.tier > b.tier || (a.tier === b.tier && rng() < 0.5);
    const [home, away] = aHosts ? [a, b] : [b, a];
    ties.push(neutral ? { home: home.id, away: away.id, neutral: true } : { home: home.id, away: away.id });
  }
  return ties;
}
```

(O `sort` inicial por id garante determinismo independentemente da ordem de entrada.)

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** (`feat(cups): tie draw with lower-tier home rule`).

---

### Task 6: gerar a copa

**Files:**
- Create: `src/Domain/cups/generateCup.ts`, `src/Domain/cups/generateCup.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { generateCup } from "@/Domain/cups/generateCup";

const clubs = Array.from({ length: 44 }, (_, i) => ({ id: `c${i}`, tier: i < 20 ? 1 : 2 }));
const args = {
  country: "England", year: 2026, clubs,
  window: { start: "2026-08-15", end: "2027-05-20" },
  busyDates: new Set<string>(), seedKey: "save1:2026:England",
};

describe("generateCup", () => {
  test("meta, stages, first round and date index", () => {
    const r = generateCup(args)!;
    expect(r.meta.leagueSlug).toBe("cup_england");
    expect(r.meta.kind).toBe("cup");
    expect(r.meta.totalRounds).toBe(6);
    const cup = r.meta.cup!;
    expect(cup.stages.map((s) => s.name)).toEqual(["preliminary", "r32", "r16", "qf", "sf", "final"]);
    expect(cup.stages[0]!.drawn).toBe(true);
    expect(cup.stages.slice(1).every((s) => !s.drawn)).toBe(true);
    expect(cup.byes).toHaveLength(20);
    // byes are the top-tier clubs; the preliminary is the 24 lowest
    expect(cup.byes.every((id) => cup.tiers[id] === 1)).toBe(true);
    expect(cup.stages[0]!.entrants).toHaveLength(24);
    // one round file per stage, only the first filled
    expect(r.rounds).toHaveLength(6);
    expect(r.rounds[0]!.fixtures).toHaveLength(12);
    expect(r.rounds.slice(1).every((rd) => rd.fixtures.length === 0)).toBe(true);
    for (const f of r.rounds[0]!.fixtures) {
      expect(f.competition).toBe("cup_england");
      expect(f.knockout).toBe(true);
      expect(f.date).toBe(cup.stages[0]!.date);
    }
    // date index maps every stage date to its round
    cup.stages.forEach((s) => expect(r.dateIndex[s.date]).toEqual([s.round]));
    expect(r.meta.start).toBe(cup.stages[0]!.date);
    expect(r.meta.end).toBe(cup.stages[5]!.date);
  });

  test("deterministic from the seed key", () => {
    expect(generateCup(args)).toEqual(generateCup(args));
    expect(generateCup({ ...args, seedKey: "other" })!.rounds[0]).not.toEqual(generateCup(args)!.rounds[0]);
  });

  test("fewer than 2 clubs → null", () => {
    expect(generateCup({ ...args, clubs: clubs.slice(0, 1) })).toBeNull();
  });

  test("16 clubs: no preliminary, no byes, final is neutral when drawn", () => {
    const r = generateCup({ ...args, clubs: clubs.slice(0, 16) })!;
    expect(r.meta.cup!.byes).toEqual([]);
    expect(r.rounds[0]!.fixtures).toHaveLength(8);
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { CupMetaData, CupStage, Fixture, LeagueCalendarResult, RoundFixtures } from "@/types/calendarTypes";
import { cupSlugOf, seedFrom } from "@/Domain/cups/cupIds";
import { planStages } from "@/Domain/cups/cupStructure";
import { scheduleStageDates } from "@/Domain/cups/cupDates";
import { drawTies, type CupEntrant } from "@/Domain/cups/cupDraw";
import { mulberry32 } from "@/Domain/rng";

export interface GenerateCupArgs {
  country: string;
  year: number;
  clubs: CupEntrant[];
  /** The country's league season window. */
  window: { start: string; end: string };
  /** Dates any club of the country plays a league game. */
  busyDates: Set<string>;
  /** Deterministic seed base, e.g. `${saveId}:${year}:${country}`. */
  seedKey: string;
}

/** Fixtures of a drawn stage. */
export function stageFixtures(slug: string, year: number, stage: CupStage, ties: ReturnType<typeof drawTies>): Fixture[] {
  return ties.map((t, i) => ({
    id: `${slug}_${year}_r${stage.round}_${i + 1}`,
    date: stage.date,
    competition: slug,
    round: stage.round,
    home: t.home,
    away: t.away,
    played: false,
    result: null,
    knockout: true,
    ...(t.neutral ? { neutral: true as const } : {}),
  }));
}

/** New national cup for one country and season: all stages dated, stage 1 drawn. */
export function generateCup(a: GenerateCupArgs): LeagueCalendarResult | null {
  const plan = planStages(a.clubs.length);
  if (!plan) return null;
  const slug = cupSlugOf(a.country);
  const tiers = Object.fromEntries(a.clubs.map((c) => [c.id, c.tier]));

  // Lowest level first (higher tier number), then id — deterministic.
  const byLevel = [...a.clubs].sort((x, y) => y.tier - x.tier || x.id.localeCompare(y.id, undefined, { numeric: true }));
  const firstEntrants = plan.preliminaryClubs > 0 ? byLevel.slice(0, plan.preliminaryClubs) : byLevel;
  const byes = plan.preliminaryClubs > 0 ? byLevel.slice(plan.preliminaryClubs).map((c) => c.id) : [];

  const dates = scheduleStageDates(a.window.start, a.window.end, plan.stageNames.length, a.busyDates);
  const stages: CupStage[] = plan.stageNames.map((name, i) => ({
    round: i + 1, name, date: dates[i]!, entrants: [], drawn: false,
  }));

  const first = stages[0]!;
  const ties = drawTies(firstEntrants, mulberry32(seedFrom(`${a.seedKey}:1`)), first.name === "final");
  stages[0] = { ...first, entrants: firstEntrants.map((c) => c.id), drawn: true };

  const rounds: RoundFixtures[] = stages.map((s, i) => ({
    leagueSlug: slug,
    round: s.round,
    fixtures: i === 0 ? stageFixtures(slug, a.year, stages[0]!, ties) : [],
  }));
  const dateIndex = Object.fromEntries(stages.map((s) => [s.date, [s.round]]));
  const cup: CupMetaData = { country: a.country, stages, byes, tiers, championId: null };

  return {
    meta: {
      leagueSlug: slug, year: a.year,
      start: stages[0]!.date, end: stages[stages.length - 1]!.date,
      totalRounds: stages.length, kind: "cup", cup,
    },
    rounds,
    dateIndex,
  };
}
```

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** (`feat(cups): generate a national cup season`).

---

### Task 7: andamento da copa (vencedor, fase seguinte, campeão)

**Files:**
- Create: `src/Domain/cups/cupProgress.ts`, `src/Domain/cups/cupProgress.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { generateCup } from "@/Domain/cups/generateCup";
import { cupChampion, drawNextStage, fixtureWinner, stageComplete } from "@/Domain/cups/cupProgress";
import type { Fixture, LeagueCalendarResult } from "@/types/calendarTypes";

const clubs = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, tier: i < 2 ? 1 : 2 }));
const base = () => generateCup({
  country: "Testland", year: 2026, clubs,
  window: { start: "2026-08-15", end: "2027-05-20" }, busyDates: new Set(), seedKey: "k",
})!;

const playAll = (fx: Fixture[]): Fixture[] =>
  fx.map((f) => ({ ...f, played: true, result: { home: 1, away: 0 } }));

describe("fixtureWinner", () => {
  const f: Fixture = { id: "x", date: "d", competition: "cup_t", round: 1, home: "h", away: "a", played: true, result: { home: 1, away: 1 }, knockout: true };
  test("score", () => expect(fixtureWinner({ ...f, result: { home: 0, away: 2 } })).toBe("a"));
  test("penalties decide a level score", () =>
    expect(fixtureWinner({ ...f, decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 3, away: 4 } } })).toBe("a"));
  test("unplayed → null", () => expect(fixtureWinner({ ...f, played: false, result: null })).toBeNull());
});

describe("cup progress", () => {
  test("6 clubs: preliminary (4) → sf (2 winners + 2 byes) → final (neutral) → champion", () => {
    let cup: LeagueCalendarResult = base();
    expect(cup.meta.cup!.stages.map((s) => s.name)).toEqual(["preliminary", "sf", "final"]);
    let fixtures = playAll(cup.rounds[0]!.fixtures);
    expect(stageComplete(fixtures)).toBe(true);

    const sf = drawNextStage(cup.meta, 1, fixtures, "k")!;
    expect(sf.round.fixtures).toHaveLength(2);
    expect(sf.meta.cup!.stages[1]!.drawn).toBe(true);
    expect(sf.meta.cup!.stages[1]!.entrants).toHaveLength(4);
    for (const bye of cup.meta.cup!.byes) expect(sf.meta.cup!.stages[1]!.entrants).toContain(bye);

    fixtures = playAll(sf.round.fixtures);
    const fin = drawNextStage(sf.meta, 2, fixtures, "k")!;
    expect(fin.round.fixtures).toHaveLength(1);
    expect(fin.round.fixtures[0]!.neutral).toBe(true);

    const finalPlayed = playAll(fin.round.fixtures);
    expect(drawNextStage(fin.meta, 3, finalPlayed, "k")).toBeNull();
    expect(cupChampion(fin.meta, finalPlayed)).toBe(finalPlayed[0]!.home);
  });

  test("incomplete stage → no draw", () => {
    const cup = base();
    expect(stageComplete(cup.rounds[0]!.fixtures)).toBe(false);
    expect(drawNextStage(cup.meta, 1, cup.rounds[0]!.fixtures, "k")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { Fixture, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import { seedFrom } from "@/Domain/cups/cupIds";
import { drawTies } from "@/Domain/cups/cupDraw";
import { stageFixtures } from "@/Domain/cups/generateCup";
import { mulberry32 } from "@/Domain/rng";

/** Winner of a played knockout fixture (score, then penalties); null when unplayed/undecided. */
export function fixtureWinner(f: Fixture): string | null {
  if (!f.played || !f.result) return null;
  if (f.result.home !== f.result.away) return f.result.home > f.result.away ? f.home : f.away;
  const p = f.decider?.penalties;
  if (p && p.home !== p.away) return p.home > p.away ? f.home : f.away;
  return null;
}

/** Every fixture of the stage is played and has a winner. */
export function stageComplete(fixtures: Fixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((f) => fixtureWinner(f) !== null);
}

/**
 * Draw the stage after `round` once `fixtures` (that round) are complete. Returns the updated meta
 * and the new round, or null when the stage isn't complete, it was the final, or the next stage is
 * already drawn.
 */
export function drawNextStage(
  meta: LeagueSeasonMeta,
  round: number,
  fixtures: Fixture[],
  seedKey: string,
): { meta: LeagueSeasonMeta; round: RoundFixtures } | null {
  const cup = meta.cup;
  if (!cup || !stageComplete(fixtures)) return null;
  const next = cup.stages.find((s) => s.round === round + 1);
  if (!next || next.drawn) return null;

  const winners = fixtures.map((f) => fixtureWinner(f)!);
  const entrantIds = round === 1 ? [...winners, ...cup.byes] : winners;
  const entrants = entrantIds.map((id) => ({ id, tier: cup.tiers[id] ?? 99 }));
  const ties = drawTies(entrants, mulberry32(seedFrom(`${seedKey}:${next.round}`)), next.name === "final");

  const drawnStage = { ...next, entrants: entrantIds, drawn: true };
  const stages = cup.stages.map((s) => (s.round === next.round ? drawnStage : s));
  return {
    meta: { ...meta, cup: { ...cup, stages } },
    round: { leagueSlug: meta.leagueSlug, round: next.round, fixtures: stageFixtures(meta.leagueSlug, meta.year, drawnStage, ties) },
  };
}

/** Champion once the final (last stage) is played; else null. */
export function cupChampion(meta: LeagueSeasonMeta, finalFixtures: Fixture[]): string | null {
  const last = meta.cup?.stages[meta.cup.stages.length - 1];
  if (!last || finalFixtures.length !== 1 || finalFixtures[0]!.round !== last.round) return null;
  return fixtureWinner(finalFixtures[0]!);
}
```

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** (`feat(cups): stage winners, next-stage draw and champion`).

---

### Task 8: virada — quais copas regenerar e arquivo

**Files:**
- Create: `src/Domain/cups/cupRollover.ts`, `src/Domain/cups/cupRollover.test.ts`

Regra: a copa de um país é regenerada quando **todas** as ligas daquele país já estão num ano maior
que o ano da copa (a última liga do país virou). O ano da nova copa é o menor ano entre as ligas do
país; a janela vai do menor `start` ao maior `end` delas.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { buildCupArchive, countriesToRegenerate } from "@/Domain/cups/cupRollover";

const leagues = [
  { leagueSlug: "pl", country: "England", year: 2027, start: "2027-08-15", end: "2028-05-20" },
  { leagueSlug: "ch", country: "England", year: 2027, start: "2027-08-10", end: "2028-05-25" },
  { leagueSlug: "sa", country: "Italy", year: 2027, start: "2027-08-20", end: "2028-05-30" },
  { leagueSlug: "sb", country: "Italy", year: 2026, start: "2026-08-20", end: "2027-06-01" },
];

describe("countriesToRegenerate", () => {
  test("only countries whose every league moved past the cup year", () => {
    const out = countriesToRegenerate(leagues, { England: 2026, Italy: 2026, Spain: 2026 });
    expect(out).toEqual([{ country: "England", year: 2027, window: { start: "2027-08-10", end: "2028-05-25" } }]);
  });
  test("a country with no cup yet is ignored", () => {
    expect(countriesToRegenerate(leagues, {})).toEqual([]);
  });
});

describe("buildCupArchive", () => {
  test("title for the champion", () => {
    const a = buildCupArchive(
      { leagueSlug: "cup_england", year: 2026, start: "s", end: "e", totalRounds: 6, kind: "cup",
        cup: { country: "England", stages: [], byes: [], tiers: {}, championId: "33" } },
      (id) => ({ name: `Club ${id}`, coachId: null, coachName: "" }),
    );
    expect(a.leagueSlug).toBe("cup_england");
    expect(a.titles).toEqual([{ competition: "cup_england", clubId: "33", clubName: "Club 33", coachId: null, coachName: "" }]);
    expect(a.standings).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { LeagueSeasonMeta, SeasonArchive } from "@/types/calendarTypes";

export interface CountryLeagueState { leagueSlug: string; country: string; year: number; start: string; end: string }

export interface CupToRegenerate { country: string; year: number; window: { start: string; end: string } }

/**
 * Countries whose cup must be regenerated: the country has a cup (`cupYear`) and every league of the
 * country is already in a later season. The new cup takes the earliest year and the widest window.
 */
export function countriesToRegenerate(
  leagues: CountryLeagueState[],
  cupYear: Record<string, number>,
): CupToRegenerate[] {
  const byCountry = new Map<string, CountryLeagueState[]>();
  for (const l of leagues) byCountry.set(l.country, [...(byCountry.get(l.country) ?? []), l]);
  const out: CupToRegenerate[] = [];
  for (const [country, ls] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
    const year = cupYear[country];
    if (year === undefined || !ls.every((l) => l.year > year)) continue;
    out.push({
      country,
      year: Math.min(...ls.map((l) => l.year)),
      window: {
        start: ls.map((l) => l.start).sort()[0]!,
        end: ls.map((l) => l.end).sort().at(-1)!,
      },
    });
  }
  return out;
}

/** Season archive of a finished cup (no table; one title for the champion). */
export function buildCupArchive(
  meta: LeagueSeasonMeta,
  clubInfo: (squadId: string) => { name: string; coachId: number | null; coachName: string },
): SeasonArchive {
  const champ = meta.cup?.championId ?? null;
  return {
    leagueSlug: meta.leagueSlug,
    year: meta.year,
    start: meta.start,
    end: meta.end,
    standings: [],
    titles: champ ? [{ competition: meta.leagueSlug, clubId: champ, ...clubInfo(champ) }] : [],
    playerLogs: {},
  };
}
```

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** (`feat(cups): cup regeneration rule and season archive`).

---

### Task 9: partidas de copa (mata-mata e campo neutro)

**Files:**
- Modify: `src/Domain/advanceDay/quickSim.ts` (`QuickSimInput`, chamadas de `expectedGoals`)
- Modify: `src/Domain/advanceDay/matches.ts` (`buildMatchEvent`, `buildQuickMatchEvent`, `buildMatchEventFromRecording`)
- Test: `src/Domain/advanceDay/matches.quick.test.ts` (acrescentar)

- [ ] **Step 1: Teste**

Leia o topo de `src/Domain/advanceDay/matches.quick.test.ts` para reaproveitar os helpers de squad
dele e acrescente:

```ts
describe("cup fixtures", () => {
  test("knockout fixture never ends level and carries the decider on the event", () => {
    // use two identical squads built with the file's existing helper (same level → many draws)
    for (let seed = 1; seed <= 200; seed++) {
      const fixture = { ...FIXTURE, knockout: true as const };
      const { event } = buildQuickMatchEvent(fixture, HOME, AWAY, SIM, mulberry32(seed));
      const pens = event.decider?.penalties;
      const level = event.score.home === event.score.away;
      expect(level ? !!pens && pens.home !== pens.away : true).toBe(true);
    }
  });

  test("neutral fixture removes home advantage", () => {
    const n = 2000;
    let homeGoals = 0, awayGoals = 0;
    for (let seed = 1; seed <= n; seed++) {
      const { event } = buildQuickMatchEvent({ ...FIXTURE, neutral: true as const }, HOME, HOME_CLONE, SIM, mulberry32(seed));
      homeGoals += event.score.home; awayGoals += event.score.away;
    }
    expect(Math.abs(homeGoals - awayGoals) / n).toBeLessThan(0.08);
  });
});
```

Adapte `FIXTURE`, `HOME`, `AWAY`, `SIM` aos nomes que o arquivo já usa. `HOME_CLONE` = cópia do `HOME`
com outro `id` e ids de jogadores prefixados (para os dois lados terem a mesma força).

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar**

1. `quickSim.ts`: em `QuickSimInput`, depois de `knockout?: boolean;`:
   `  /** Neutral venue: no home advantage for either side. */`
   `  neutral?: boolean;`
   Em `quickSimMatch`, troque `expectedGoals(home, away, true)` por
   `expectedGoals(home, away, !input.neutral)`.
2. `matches.ts`:
   - `buildMatchEvent`: passe as opções do motor:

```ts
  const result = simulateMatch(
    homeSquad, awaySquad, sim.homeFormation, sim.awayFormation, sim.homeLineup, sim.awayLineup,
    { knockout: fixture.knockout === true },
  );
```

     e no `event`, depois de `durationMs: result.durationMs,`:

```ts
    ...(result.decider
      ? {
          decider: {
            extraTime: { home: result.decider.extraTime.A, away: result.decider.extraTime.B },
            ...(result.decider.penalties
              ? { penalties: { home: result.decider.penalties.A, away: result.decider.penalties.B } }
              : {}),
          },
        }
      : {}),
```

   - `buildQuickMatchEvent`: no objeto passado a `quickSimMatch`, acrescente
     `knockout: fixture.knockout === true, neutral: fixture.neutral === true,`.
   - `buildMatchEventFromRecording`: depois de `durationMs: recording.durationMs,` acrescente
     `...(recording.decider ? { decider: recording.decider } : {}),`.

(O motor completo não tem vantagem de mando, então `neutral` só afeta o quickSim.)

- [ ] **Step 4: Rodar** — `bun test src/Domain/advanceDay` → PASS (antigos inclusive).

- [ ] **Step 5: Commit** (`feat(cups): knockout and neutral-venue fixtures in match building`).

---

### Task 10: E/S das copas (`cupWorld.ts`)

**Files:**
- Create: `src/backend/cupWorld.ts`
- Modify: `src/backend/SaveService.ts` (novo método `listCompetitionSlugs`)
- Modify: `src/backend/advanceDay.ts` (exportar o tipo e ampliar `LeagueDataEntry` com `country`)

- [ ] **Step 1: `listCompetitionSlugs`**

Em `SaveService`, perto de `getActiveRoundsForDate`:

```ts
  /** Every competition folder under leagues/ (leagues and cups). */
  listCompetitionSlugs(saveId: string): Promise<string[]> {
    return this.dal.listActiveLeaguesSlugs(saveId);
  }
```

- [ ] **Step 2: `LeagueDataEntry.country`**

Em `advanceDay.ts`, troque o tipo local por um exportado com `country`:

```ts
export type LeagueDataEntry = {
  slug: string;
  name?: string;
  country?: string;
  standings: LeagueTeam[];
};
```

- [ ] **Step 3: `cupWorld.ts`**

```ts
/**
 * National cups — save I/O. Pure logic lives in src/Domain/cups/.
 * A cup lives in leagues/cup_<country>/ like a league (meta, rounds, date-index; no standings)
 * and is NOT part of meta.activeLeagues.
 */
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { LeagueCalendarResult, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { Pyramids } from "@/types/pyramidTypes";
import type { LeagueDataEntry } from "@/backend/advanceDay";
import { pyramidByLeague, tierOfLeague } from "@/Domain/season/countryRollover";
import { cupSlugOf, isCupSlug } from "@/Domain/cups/cupIds";
import { generateCup } from "@/Domain/cups/generateCup";
import { cupChampion, drawNextStage } from "@/Domain/cups/cupProgress";
import type { CupEntrant } from "@/Domain/cups/cupDraw";

/** leagueSlug → country, from the leagueData catalog. */
export function countryByLeague(catalog: LeagueDataEntry[]): Map<string, string> {
  return new Map(catalog.filter((l) => l.country).map((l) => [l.slug, l.country!]));
}

/** Clubs of a country (membership from the save's squad index) with their tier (1 when unknown). */
export function countryClubs(
  country: string,
  index: SquadIndex,
  countryOf: Map<string, string>,
  pyramids: Pyramids,
): CupEntrant[] {
  const pyr = pyramidByLeague(pyramids);
  const out: CupEntrant[] = [];
  for (const league of index.leagues()) {
    if (isCupSlug(league) || countryOf.get(league) !== country) continue;
    const p = pyr.get(league);
    const tier = (p && tierOfLeague(p, league)) ?? 1;
    for (const t of index.inLeague(league)) out.push({ id: t.squadId, tier });
  }
  return out;
}

/** Dates on which any given league has a round. */
export async function leagueBusyDates(service: SaveService, saveId: string, leagues: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const slug of leagues) {
    const idx = await service.getDateIndex(saveId, slug);
    for (const d of Object.keys(idx ?? {})) out.add(d);
  }
  return out;
}

/** Write a generated cup (meta, every round file, date index). */
export async function writeCup(service: SaveService, saveId: string, cup: LeagueCalendarResult): Promise<void> {
  await service.writeLeagueMeta(saveId, cup.meta);
  for (const r of cup.rounds) await service.writeRound(saveId, cup.meta.leagueSlug, r.round, r);
  await service.writeDateIndex(saveId, cup.meta.leagueSlug, cup.dateIndex);
}

/** Generate and write one country's cup for a season. Returns the meta, or null (< 2 clubs). */
export async function createCountryCup(args: {
  service: SaveService;
  saveId: string;
  country: string;
  year: number;
  window: { start: string; end: string };
  index: SquadIndex;
  countryOf: Map<string, string>;
  pyramids: Pyramids;
}): Promise<LeagueSeasonMeta | null> {
  const clubs = countryClubs(args.country, args.index, args.countryOf, args.pyramids);
  const leagues = [...args.countryOf].filter(([, c]) => c === args.country).map(([s]) => s);
  const cup = generateCup({
    country: args.country,
    year: args.year,
    clubs,
    window: args.window,
    busyDates: await leagueBusyDates(args.service, args.saveId, leagues),
    seedKey: `${args.saveId}:${args.year}:${args.country}`,
  });
  if (!cup) return null;
  await writeCup(args.service, args.saveId, cup);
  return cup.meta;
}

/**
 * After a day's cup fixtures are written: draw the next stage of every cup whose stage `round`
 * just completed, and record the champion after the final. Returns what changed.
 */
export async function advanceCupStages(
  service: SaveService,
  saveId: string,
  playedRounds: Map<string, number[]>,
): Promise<Array<{ slug: string; drawnRound?: number; championId?: string }>> {
  const changes: Array<{ slug: string; drawnRound?: number; championId?: string }> = [];
  for (const [slug, rounds] of playedRounds) {
    if (!isCupSlug(slug)) continue;
    let meta = await service.getLeagueMeta(saveId, slug);
    if (!meta?.cup) continue;
    for (const round of rounds) {
      const fixtures = (await service.getRound(saveId, slug, round))?.fixtures ?? [];
      const next = drawNextStage(meta, round, fixtures, `${saveId}:${meta.year}:${meta.cup!.country}`);
      if (next) {
        meta = next.meta;
        await service.writeRound(saveId, slug, next.round.round, next.round);
        await service.writeLeagueMeta(saveId, meta);
        changes.push({ slug, drawnRound: next.round.round });
        continue;
      }
      const champ = cupChampion(meta, fixtures);
      if (champ && meta.cup!.championId !== champ) {
        meta = { ...meta, cup: { ...meta.cup!, championId: champ } };
        await service.writeLeagueMeta(saveId, meta);
        changes.push({ slug, championId: champ });
      }
    }
  }
  return changes;
}

export { cupSlugOf };
```

(Confira que `pyramidByLeague`/`tierOfLeague` são exportados de `countryRollover.ts` — são.)

- [ ] **Step 4: Checar** — `bunx tsc --noEmit -p .` → sem erros. Se houver import circular
  `advanceDay.ts` ↔ `cupWorld.ts` só de tipo, está OK (`import type`).

- [ ] **Step 5: Commit** (`feat(cups): save I/O for national cups`).

---

### Task 11: `createSave` gera as copas

**Files:**
- Modify: `src/backend/SaveService.ts` (`createSave`, depois de copiar os squads para o save)

- [ ] **Step 1: Gerar**

No fim de `createSave`, **depois** do laço que copia todos os squads para o save (o índice de squads
precisa existir) e antes do `return meta`, adicione:

```ts
    // National cups: one per country, over the country's league window (membership = squad folders).
    try {
      const { getLeagueData, getPyramids } = await import("@/backend/advanceDay");
      const { countryByLeague, createCountryCup } = await import("@/backend/cupWorld");
      const catalog = await getLeagueData();
      const countryOf = countryByLeague(catalog);
      const index = await this.getSquadIndex(id);
      const pyramids = await getPyramids();
      const countries = [...new Set(countryOf.values())].sort();
      for (const country of countries) {
        const ls = activeLeagues.filter((l) => countryOf.get(l.leagueSlug) === country);
        if (ls.length === 0) continue;
        await createCountryCup({
          service: this, saveId: id, country,
          year: Math.min(...ls.map((l) => l.year)),
          window: { start: ls.map((l) => l.start).sort()[0]!, end: ls.map((l) => l.end).sort().at(-1)! },
          index, countryOf, pyramids,
        });
      }
    } catch (e) {
      console.error("Failed to generate national cups:", e);
    }
```

(Import dinâmico para não criar ciclo estático `SaveService` → `advanceDay` → `SaveService`. Se o
`return` de `createSave` estiver antes do laço de cópia, coloque este bloco imediatamente antes do
`return`, depois da cópia.)

- [ ] **Step 2: Teste de integração**

Crie `src/backend/cupWorld.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";

describe("createSave generates national cups", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("England cup exists with a drawn first stage", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], budget: 1,
    });
    saveId = meta.id;
    const cup = await saveService.getLeagueMeta(saveId, "cup_england");
    expect(cup?.kind).toBe("cup");
    expect(cup!.cup!.stages[0]!.drawn).toBe(true);
    const r1 = await saveService.getRound(saveId, "cup_england", 1);
    expect(r1!.fixtures.length).toBeGreaterThan(0);
    // cups are not league states
    expect((meta.activeLeagues ?? []).some((l) => l.leagueSlug.startsWith("cup_"))).toBe(false);
  }, 120_000);
});
```

(O `RUNTIME_DATA_DIR` do teste é um diretório temporário — ver `scripts/testPreload.ts` — então o save
de teste não toca `src/Data/saves`. Se `createSave` exigir mais campos, leia a assinatura e
complete.)

- [ ] **Step 3: Rodar** — `bun test src/backend/cupWorld.test.ts` → PASS.

- [ ] **Step 4: Commit** (`feat(cups): new careers get a national cup per country`).

---

### Task 12: avanço do dia joga, sorteia, coroa e regenera as copas

**Files:**
- Modify: `src/backend/advanceDay.ts`

- [ ] **Step 1: Gravação do jogador em qualquer competição**

Troque a condição `useRecording`:

```ts
          const userPlaysThis = fixture.home === playerSquadId || fixture.away === playerSquadId;
          const useRecording =
            playedMatchOverride !== null &&
            playedMatchOverride.fixtureId === fixture.id &&
            userPlaysThis;
```

- [ ] **Step 2: Modo de simulação da copa**

Troque `const mode = userPlays ? "full" : resolveSimMode(leagueSlug, meta);` por:

```ts
            const mode = userPlays
              ? "full"
              : isCupSlug(leagueSlug)
                ? (playerLeagueClubs.has(fixture.home) || playerLeagueClubs.has(fixture.away) ? "full" : "fast")
                : resolveSimMode(leagueSlug, meta);
```

e, antes do laço de jogos (depois de `const playerSquadId ...`):

```ts
    // Cup ties run in the full engine only when a club of the player's league is involved.
    const playerLeagueClubs = new Set(index.inLeague(meta.leagueSlug).map((t) => t.squadId));
```

- [ ] **Step 3: `decider` na fixture**

Nos dois lugares que marcam a fixture como jogada
(`updatedFixtures[idx] = { ...updatedFixtures[idx]!, played: true, result: r.event.score }`), troque por:

```ts
            if (idx !== -1) updatedFixtures[idx] = {
              ...updatedFixtures[idx]!, played: true, result: r.event.score,
              ...(r.event.decider ? { decider: r.event.decider } : {}),
            };
```

- [ ] **Step 4: Copas não têm tabela; sorteio e campeão**

No bloco "Write updated round files + recompute standings per league", dentro do laço por liga, logo
depois de gravar as rodadas, pule a classificação para copas:

```ts
      if (isCupSlug(leagueSlug)) continue;
```

Logo **depois** desse laço, adicione:

```ts
    // ── National cups: draw the next stage / crown the champion ──────────────
    const cupPlayed = new Map<string, number[]>();
    for (const [slug, rounds] of roundUpdates) if (isCupSlug(slug)) cupPlayed.set(slug, [...rounds.keys()]);
    const cupChanges = await advanceCupStages(saveService, saveId, cupPlayed);
```

(`cupChanges` será usado pelo Plano 3 para as mensagens de inbox; por enquanto só é calculado — deixe
um `void cupChanges;` se o lint reclamar.)

- [ ] **Step 5: Regenerar na virada**

Depois do laço `for (const unit of due.units) { ... }` (antes de `if (seasonEnded)`), adicione:

```ts
    // ── National cups: a country's cup is archived and regenerated once all its leagues rolled ──
    if (due.units.length > 0) {
      const catalog = await getLeagueData();
      const countryOf = countryByLeague(catalog);
      const cupYear: Record<string, number> = {};
      const oldCups = new Map<string, LeagueSeasonMeta>();
      for (const slug of await saveService.listCompetitionSlugs(saveId)) {
        if (!isCupSlug(slug)) continue;
        const cm = await saveService.getLeagueMeta(saveId, slug);
        if (cm?.cup) { cupYear[cm.cup.country] = cm.year; oldCups.set(cm.cup.country, cm); }
      }
      const states = updatedActiveLeagues
        .filter((l) => countryOf.has(l.leagueSlug))
        .map((l) => ({ leagueSlug: l.leagueSlug, country: countryOf.get(l.leagueSlug)!, year: l.year, start: l.start, end: l.end }));
      const pyramids = await getPyramids();
      for (const c of countriesToRegenerate(states, cupYear)) {
        const old = oldCups.get(c.country)!;
        const nameOf = (id: string) => {
          const e = index.byId(id);
          return { name: e?.name ?? id, coachId: null, coachName: "" };
        };
        await saveService.writeLeagueSeasonArchive(saveId, buildCupArchive(old, nameOf));
        await createCountryCup({
          service: saveService, saveId, country: c.country, year: c.year, window: c.window,
          index, countryOf, pyramids,
        });
      }
    }
```

Imports no topo de `advanceDay.ts`:

```ts
import { isCupSlug } from "@/Domain/cups/cupIds";
import { countriesToRegenerate, buildCupArchive } from "@/Domain/cups/cupRollover";
import { advanceCupStages, countryByLeague, createCountryCup } from "@/backend/cupWorld";
```

(Confira o campo de nome em `SquadIndexEntry` — se não for `name`, use o que existir; e que
`LeagueSeasonMeta` está importado.)

- [ ] **Step 6: Teste — um dia de copa**

Em `src/backend/cupWorld.test.ts`, acrescente um teste que:
1. cria um save (como no Task 11);
2. lê `cup_england`, pega a data da fase 1 (`meta.cup.stages[0].date`);
3. força `meta.currentDate` para essa data (`saveService.updateMeta(saveId, { currentDate: date })`);
4. chama `advanceOneDay(saveService, saveId)` (import de `@/backend/advanceDay`);
5. confere: todas as fixtures da rodada 1 estão `played`, nenhuma empatada sem `decider.penalties`
   desigual, e a fase 2 foi sorteada (`stages[1].drawn === true` e a rodada 2 tem
   `stages[1].entrants.length / 2` fixtures).

Timeout 300 s (o dia simula várias ligas). Se a data da fase 1 coincidir com rodada da liga do jogador,
tudo bem — o teste só olha a copa.

- [ ] **Step 7: Rodar** — `bun test src/backend/cupWorld.test.ts` e `bunx tsc --noEmit -p .` → PASS.

- [ ] **Step 8: Commit** (`feat(cups): advance day plays, draws, crowns and regenerates cups`).

---

### Task 13: start kits guardam as copas

**Files:**
- Modify: `src/backend/startKits.ts` (`buildKitWorld`)

- [ ] **Step 1: Incluir as pastas de copa**

Em `buildKitWorld`, troque a linha `const leagueSlugs = ...` por:

```ts
  // Leagues from activeLeagues + every cup folder (cups are not league states).
  const cupSlugs = (await saveService.listCompetitionSlugs(saveId)).filter((s) => isCupSlug(s));
  const leagueSlugs = [...(meta?.activeLeagues ?? []).map((l) => l.leagueSlug), ...cupSlugs];
```

e importe `isCupSlug` de `@/Domain/cups/cupIds`. `applyKit` já grava meta/rodadas/date-index e pula
`standings` nulos, então não muda.

- [ ] **Step 2: Checar** — `bunx tsc --noEmit -p .`.

- [ ] **Step 3: Commit** (`feat(cups): start kits include national cups`).

---

### Task 14: smoke da temporada, kits e documentação

**Files:**
- Modify: `scripts/season-rollover-smoke.ts`
- Create: `.claude/rules/game/cups.md`
- Regenerar: `src/example_data/startKits/*`

- [ ] **Step 1: Checagens no smoke**

Leia `scripts/season-rollover-smoke.ts` (ele usa uma função de checagem que imprime `PASS`/`FAIL`) e
acrescente, no fim da temporada (antes do resumo), no mesmo estilo:

1. toda copa (`listCompetitionSlugs` com `cup_`) tem `meta.cup` e, se a copa já é da temporada nova
   (ano > o ano inicial), o arquivo da anterior (`readSeasonArchive`/arquivo da liga `cup_*`) tem 1
   título;
2. nenhuma fixture de copa com `date < currentDate` está `played: false`;
3. nenhum clube tem duas fixtures (liga + copa) na mesma data — junte todas as fixtures de todas as
   competições (`getAllFixturesForLeague` para cada slug) e conte por `(date, clube)`;
4. na Inglaterra, a copa da temporada encerrada teve campeão (`championId` na meta antes da virada —
   guarde durante o laço de dias, ou leia do arquivo).

- [ ] **Step 2: Rodar o smoke** (~15 min):
  `bun scripts/season-rollover-smoke.ts > smoke.log 2>&1; tail -60 smoke.log` → todas as linhas `PASS`.

- [ ] **Step 3: Regenerar os start kits** (~4 min), porque o mundo do save agora tem copas:

```bash
cp src/example_data/roles.json src/Data/roles.json
bun run kits:generate 5
rm -f src/example_data/startKits/* && cp src/Data/startKits/* src/example_data/startKits/
```

  Confira que um kit tem copas: `bun -e "const z=Bun.gunzipSync(new Uint8Array(await Bun.file('src/Data/startKits/kit-1.json.gz').arrayBuffer()));const w=JSON.parse(new TextDecoder().decode(z));console.log(w.leagues.filter(l=>l.slug.startsWith('cup_')).length)"`
  → número > 0.

- [ ] **Step 4: Documentação** — `.claude/rules/game/cups.md` (português, no estilo de
  `.claude/rules/game/membership.md`): onde a copa mora, tipos (`CupMetaData`, `CupStage`,
  `Fixture.knockout/neutral/decider`), regras de geração (fases, preliminar, byes, datas, mando,
  semente), andamento (sorteio no fim do dia da fase, campeão), virada (`countriesToRegenerate`,
  arquivo), modo de simulação (motor só com clube da liga do jogador), start kits, smoke, e o que fica
  para o Plano 3 (UI, próximo jogo, inbox, `seasonLog` por competição).

- [ ] **Step 5: Verificação final** — `bunx tsc --noEmit -p .` e `bun test` → tudo passa.

- [ ] **Step 6: Commits**

```bash
git add scripts/season-rollover-smoke.ts .claude/rules/game/cups.md
git commit -m "test(cups): season smoke checks for national cups; docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add src/example_data/startKits
git commit -m "data: regenerate start kits with national cups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Fica para o Plano 3

Tela `/cups/:country`; `useAdvanceDay`/`advance-until`/`match-setup`/prévia enxergando o jogo de
copa do jogador (e a partida ao vivo com `knockout`/`neutral`); `competitionName` com os nomes das
copas; inbox `cup` (sorteio, eliminação, título — usando `cupChanges`); `seasonLog` por competição;
i18n.
