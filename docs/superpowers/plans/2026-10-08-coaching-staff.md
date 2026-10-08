# Comissão técnica completa (Etapa 31a) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o clube do jogador ganha uma comissão técnica completa (auxiliar, preparadores físico e de goleiros, treinadores de área, médico, analista, olheiros, jardineiro) com estrelas derivadas de atributos, limites por tier, contratos de 1–3 anos com multa e renovação, e um mercado de ~300 livres buscado na aba Comissão de Transferências; o desenvolvimento passa a 7 áreas de treino (o goleiro ganha a sua) com multiplicador por área.

**Architecture:** lógica pura em `src/Domain/staff/` (estrelas, efeitos, áreas, salário, geração, lista de livres, contratos) e `src/Domain/development/dpWeights.ts`; `PlayerDevelopment.ts` ganha 7 categorias e o multiplicador de área só no crescimento. O avanço do dia, os efeitos (partida, treino, base, lesão, familiaridade) e as rotas leem tudo por `staffEffectsOf` / `areaMultsOf`. `staffPool.json` por save no DAL. A IA nunca grava comissão: estrelas implícitas pelo tier, convertidas para as notas de hoje nos efeitos que já existiam (mundo idêntico neles).

**Tech Stack:** Bun + TypeScript, React 19 + Tailwind.

Spec: `docs/superpowers/specs/2026-10-08-coaching-staff-design.md`. Regras que valem em toda tarefa:
- Imports sempre `@/`; nada de PowerShell `Set-Content`; `core.autocrlf=true` — arquivos em CRLF no disco e LF no índice; conferir `git diff --stat` (nenhum arquivo convertido inteiro). `src/GameInterface/changelog/changelog.ts` é CRLF: editar preservando. Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca commitar `src/Data` nem saves; protótipo, sem migração.
- Worktree `C:/Projects/FMProject-staff`, branch `feat/coaching-staff` (já criada, com `src/Data` e `bun install`).
- `roles.json`: editar **`src/example_data/roles.json`** (versionado) e copiar byte a byte para `src/Data/roles.json` (os importadores recusam cópias diferentes).
- Antes de cada commit: `bunx tsc --noEmit -p .` limpo e os testes da tarefa passando.

---

### Task 1: Tipos e constantes da comissão

**Files:** Modify `src/Domain/staff/staffTypes.ts`, `src/Domain/staff/staffConfig.ts`; Create `src/Domain/staff/staffTypes.test.ts`. Modify `src/GameEngine/PlayerDevelopment.ts` (só exportar `DP_CATEGORIES`/`DPCategory`, sem mudar comportamento ainda).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { COACH_AREAS, ROLE_SPECIALTY, STAFF_ROLES, TRAINING_AREAS, isStaffRole } from "@/Domain/staff/staffTypes";
import { STAFF } from "@/Domain/staff/staffConfig";

describe("staff types", () => {
  test("nine roles, seven training areas, five coach areas", () => {
    expect(STAFF_ROLES).toEqual(["assistant", "fitness", "goalkeeping", "coach", "medic", "analyst", "scout", "fieldScout", "groundskeeper"]);
    expect([...TRAINING_AREAS].sort()).toEqual(["defending", "goalkeeping", "passing", "physical", "setPieces", "shooting", "technical"]);
    expect(COACH_AREAS).toEqual(["defending", "shooting", "technical", "passing", "setPieces"]);
    expect(isStaffRole("coach")).toBe(true);
    expect(isStaffRole("nope")).toBe(false);
  });
  test("every non-coach role has a specialty", () => {
    for (const r of STAFF_ROLES) if (r !== "coach") expect(ROLE_SPECIALTY[r]).toBeDefined();
  });
  test("limits by tier and wage shares", () => {
    expect(STAFF.LIMITS.coach).toEqual({ LOW: 3, MEDIUM: 3, HIGH: 4, ELITE: 5 });
    expect(STAFF.LIMITS.fieldScout).toBe(4);
    for (const r of STAFF_ROLES) expect(STAFF.WAGE_ROLE_SHARE[r]).toBeGreaterThan(0);
    expect(STAFF.POOL.BY_ROLE).toBeDefined();
    expect(Object.values(STAFF.POOL.BY_ROLE).reduce((a, b) => a + b, 0)).toBe(STAFF.POOL.SIZE);
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/staff/staffTypes.test.ts` → FAIL.

- [ ] **Step 3: Implementação**

`PlayerDevelopment.ts` (topo, sem tocar no resto ainda):

```ts
/** Training areas = DP categories (`.claude/rules/game/staff.md`). */
export const DP_CATEGORIES = ["goalkeeping", "defending", "shooting", "technical", "passing", "physical", "setPieces"] as const;
export type DPCategory = (typeof DP_CATEGORIES)[number];
```
(o `type DPCategory` local antigo sai; `CATEGORY_STATS` ganha as chaves novas só na Task 4 — até lá declare `CATEGORY_STATS: Partial<Record<DPCategory, ...>>` se o compilador exigir.)

`staffTypes.ts` (substitui o arquivo):

```ts
import { DP_CATEGORIES, type DPCategory } from "@/GameEngine/PlayerDevelopment";

export const STAFF_ROLES = ["assistant", "fitness", "goalkeeping", "coach", "medic", "analyst", "scout", "fieldScout", "groundskeeper"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Training areas: one per DP category. */
export const TRAINING_AREAS = DP_CATEGORIES;
export type TrainingArea = DPCategory;
/** The five field areas led by area coaches (Goleiros and Físico have their own coach). */
export const COACH_AREAS = ["defending", "shooting", "technical", "passing", "setPieces"] as const satisfies readonly TrainingArea[];
export type CoachArea = (typeof COACH_AREAS)[number];

export const SPECIALTIES = [...DP_CATEGORIES, "general", "medical", "analysis", "scouting", "pitch"] as const;
export type Specialty = (typeof SPECIALTIES)[number];

/** Specialty of every role but `coach` (who has knowledge in the five coach areas). */
export const ROLE_SPECIALTY: Record<Exclude<StaffRole, "coach">, Specialty> = {
  assistant: "general", fitness: "physical", goalkeeping: "goalkeeping", medic: "medical",
  analyst: "analysis", scout: "scouting", fieldScout: "scouting", groundskeeper: "pitch",
};

/** 1..20 each; the stars are derived from them (no effect of their own). */
export interface StaffAttributes {
  determination: number;
  discipline: number;
  adaptability: number;
  playerReading: number;
  knowledge: Partial<Record<Specialty, number>>;
}

export interface StaffContract {
  /** Last day (ISO): the end of a league season. */
  until: string;
  /** Weekly wage (€), frozen at signing. */
  wage: number;
  signed: string;
  /** Renewal step (`staffContracts.ts`): decided once per contract. */
  decision?: "renew" | "leave" | "warned";
}

export interface StaffMember {
  id: string;
  name: string;
  nationality: string;
  role: StaffRole;
  age: number;
  attributes: StaffAttributes;
  /** Absent while in the free pool. */
  contract?: StaffContract;
  /** In the pool since (ISO). */
  since?: string;
}

/** The human club's staff (`Squad.staff`); AI clubs never store it. */
export interface StaffRecord {
  members: StaffMember[];
  /** Coach areas the user assigned by hand (area -> member id); the rest is automatic. */
  areaAssignments?: Partial<Record<CoachArea, string>>;
}

export function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);
}
export function isCoachArea(v: unknown): v is CoachArea {
  return typeof v === "string" && (COACH_AREAS as readonly string[]).includes(v);
}
```

`staffConfig.ts`: manter as constantes de nota de hoje (`MIN_RATING`, `NEUTRAL_RATING`, `MAX_RATING`, `VACANT_RATING`, `ASSISTANT_DEV`, `FITNESS_RECOVERY`, `FITNESS_INJURY`, `SCOUT_UNCERTAINTY_MULT`, `SCOUT_GAIN_MULT`, `RANGE_THRESHOLD`, `IMPLIED_RATING`, `WAGE_BASE/SLOPE/SHARE`); remover `MARKET_SIZE` e `START_SPREAD`; acrescentar:

```ts
  /** Stars 1..5, 3 neutral; displayed and stored to the half. */
  MIN_STARS: 1, NEUTRAL_STARS: 3, MAX_STARS: 5,
  /** Stars of a vacant non-area role (= the old vacant rating 3). */
  VACANT_STARS: 2,
  /** AI clubs: the old implied ratings 4/5/6/7 converted (`ratingFromStars` inverse). */
  IMPLIED_STARS: { LOW: 2.5, MEDIUM: 3, HIGH: 3.4, ELITE: 3.8 },
  /** Star curves `[1★, 3★, 5★]`. */
  AREA_MULT: [0.7, 1, 1.25],
  /** An area nobody leads still develops, at this pace. */
  AREA_VACANT_MULT: 0.4,
  MEDIC_DURATION: [1.2, 1, 0.8],
  ANALYST_FAMILIARITY: [0.8, 1, 1.25],
  /** Weights of the 1..20 attributes in an area's score (sum 1). */
  STAR_WEIGHTS: { knowledge: 0.5, playerReading: 0.2, determination: 0.15, discipline: 0.1, adaptability: 0.05 },
  ATTR_MIN: 1, ATTR_MAX: 20,
  /** Per-role limit by the club's natural tier. */
  LIMITS: { coach: { LOW: 3, MEDIUM: 3, HIGH: 4, ELITE: 5 }, fieldScout: 4, other: 1 },
  /** Share of the staff wage curve per role (spec, Ponto aberto 2; tuned by scripts/staff-bill.ts). */
  WAGE_ROLE_SHARE: { assistant: 1, scout: 1, fieldScout: 1, fitness: 0.7, goalkeeping: 0.4, coach: 0.4, medic: 0.4, analyst: 0.3, groundskeeper: 0.1 },
  /** Starting staff: implied stars of the tier ± this (halves). */
  START_SPREAD_STARS: 0.5,
  CONTRACT: { MIN_YEARS: 1, MAX_YEARS: 3, RENEW_WINDOW_DAYS: 60, DIRECTOR_YEARS: 2, DIRECTOR_MAX_AGE: 66, DIRECTOR_STAR_MARGIN: 0.5, SEVERANCE_SHARE: 0.5 },
  POOL: {
    SIZE: 300,
    BY_ROLE: { coach: 90, assistant: 30, fitness: 30, goalkeeping: 30, medic: 25, analyst: 25, scout: 20, fieldScout: 35, groundskeeper: 15 },
    /** [stars low, stars high, share] — sampled per member. */
    STAR_BANDS: [[1, 2, 0.3], [2.5, 3, 0.4], [3.5, 4, 0.22], [4.5, 5, 0.08]],
    RETIRE_AGE: 68,
    REFRESH_SHARE: 1 / 3,
  },
```
Tipar `LIMITS`/`WAGE_ROLE_SHARE`/`BY_ROLE` com `satisfies Record<StaffRole, number>` onde couber (importar o tipo de `staffTypes`).

- [ ] **Step 4: Rodar** — `bun test src/Domain/staff/staffTypes.test.ts` → PASS. **Sem commit ainda:** o resto do código ainda lê o formato antigo de `StaffRecord`; as tarefas 1–3 fecham num único commit no fim da Task 3, já compilando.

---

### Task 2: Estrelas, efeitos e áreas (puro)

**Files:** Modify `src/Domain/staff/staff.ts`; rewrite `src/Domain/staff/staff.test.ts` (manter os testes do borrão do olheiro — `obscurePlayer`, `obscureForViewer` — que não mudam).

- [ ] **Step 1: Teste** (acrescentar a `staff.test.ts`)

```ts
import { describe, expect, test } from "bun:test";
import {
  areaMultsOf, effectiveRating, effectiveStars, makeProfessional, memberStars, ratingFromStars,
  resolveAreaAssignments, staffEffectsOf, starsFromScore,
} from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import type { StaffMember, StaffRecord } from "@/Domain/staff/staffTypes";
import type { Squad } from "@/types/playerTypes";

const fin = (income: number) => ({ broadcasting: income, commercial: 0, total: income, followers: 0, budget: 0 });
const aiSquad = (income: number) => ({ id: "x", players: [], finances: fin(income) }) as unknown as Squad;
const human = (staff: StaffRecord) => ({ id: "h", players: [], finances: fin(20e6), staff }) as unknown as Squad;
const pro = (key: string, role: StaffMember["role"], stars: number) => makeProfessional(key, role, stars);

describe("stars", () => {
  test("rating conversion keeps the old curve points", () => {
    expect(ratingFromStars(1)).toBe(1);
    expect(ratingFromStars(3)).toBe(5);
    expect(ratingFromStars(5)).toBe(10);
    expect(ratingFromStars(2.5)).toBe(4);
    expect(ratingFromStars(3.8)).toBeCloseTo(7, 9);
  });
  test("score 10.5 is 3 stars, extremes clamp", () => {
    expect(starsFromScore(10.5)).toBe(3);
    expect(starsFromScore(1)).toBe(1);
    expect(starsFromScore(20)).toBe(5);
  });
  test("a generated professional lands within half a star of the target", () => {
    for (const s of [1, 2, 3, 4, 5]) expect(Math.abs(memberStars(pro(`k${s}`, "medic", s)) - s)).toBeLessThanOrEqual(0.5);
  });
});

describe("effects", () => {
  test("AI: implied stars reproduce today's ratings exactly", () => {
    // LOW 4, MEDIUM 5, HIGH 6, ELITE 7 (staff.md) — income thresholds 15M/80M/200M.
    expect(effectiveRating(aiSquad(1e6), "assistant")).toBe(4);
    expect(effectiveRating(aiSquad(20e6), "fitness")).toBe(5);
    expect(effectiveRating(aiSquad(100e6), "scout")).toBeCloseTo(6, 9);
    expect(effectiveRating(aiSquad(300e6), "assistant")).toBeCloseTo(7, 9);
  });
  test("3 stars everywhere is neutral", () => {
    const fx = staffEffectsOf(aiSquad(20e6));
    expect(fx.devMult).toBe(1);
    expect(fx.recoveryMult).toBe(1);
    expect(fx.injuryMult).toBe(1);
    expect(fx.injuryDurationMult).toBe(1);
    expect(fx.familiarityMult).toBe(1);
    for (const v of Object.values(areaMultsOf(aiSquad(20e6)))) expect(v).toBe(1);
  });
  test("vacant area = 0.4; vacant role = 2 stars", () => {
    const sq = human({ members: [] });
    for (const v of Object.values(areaMultsOf(sq))) expect(v).toBe(STAFF.AREA_VACANT_MULT);
    expect(effectiveStars(sq, "medic")).toBe(STAFF.VACANT_STARS);
    expect(staffEffectsOf(sq).injuryDurationMult).toBeCloseTo(1.1, 9);
  });
  test("1 and 5 stars on an area", () => {
    const one = human({ members: [pro("gk1", "goalkeeping", 1)] });
    const five = human({ members: [pro("gk5", "goalkeeping", 5)] });
    expect(areaMultsOf(one).goalkeeping).toBeLessThan(0.8); // 1★ ± half a star of generation
    expect(areaMultsOf(five).goalkeeping).toBeGreaterThan(1.15);
  });
  test("hand-built squads without finances are neutral", () => {
    const sq = { id: "lab", players: [] } as unknown as Squad;
    expect(staffEffectsOf(sq).devMult).toBe(1);
  });
});

describe("area assignments", () => {
  test("auto: each area to the best coach with room, at most 2 each", () => {
    const a = pro("ca", "coach", 4), b = pro("cb", "coach", 2), c = pro("cc", "coach", 3);
    const res = resolveAreaAssignments({ members: [a, b, c] });
    const count = new Map<string, number>();
    for (const m of Object.values(res)) count.set(m!.id, (count.get(m!.id) ?? 0) + 1);
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(2);
    expect(Object.keys(res).length).toBe(5);
  });
  test("manual choice wins while valid; a coach gone frees it", () => {
    const a = pro("ca", "coach", 4), b = pro("cb", "coach", 2), c = pro("cc", "coach", 3);
    const res = resolveAreaAssignments({ members: [a, b, c], areaAssignments: { setPieces: b.id } });
    expect(res.setPieces!.id).toBe(b.id);
    const gone = resolveAreaAssignments({ members: [a, c], areaAssignments: { setPieces: b.id } });
    expect(gone.setPieces?.id).not.toBe(b.id);
  });
  test("two coaches leave one area vacant", () => {
    const res = resolveAreaAssignments({ members: [pro("x", "coach", 3), pro("y", "coach", 3)] });
    expect(Object.keys(res).length).toBe(4);
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/staff/staff.test.ts` → FAIL.

- [ ] **Step 3: Implementação** (`staff.ts`; `curve` antigo fica para as notas, e ganha um irmão por estrelas)

```ts
const roundHalf = (x: number) => Math.round(x * 2) / 2;

/** Stars -> the old 1..10 rating (1★ 1, 3★ 5, 5★ 10): today's effects keep their curves. */
export function ratingFromStars(stars: number): number {
  const s = clamp(stars, STAFF.MIN_STARS, STAFF.MAX_STARS);
  return s <= 3 ? 1 + 2 * (s - 1) : 5 + 2.5 * (s - 3);
}

function starCurve(stars: number, [at1, at3, at5]: readonly [number, number, number]): number {
  const s = clamp(stars, STAFF.MIN_STARS, STAFF.MAX_STARS);
  return s <= 3 ? at1 + (at3 - at1) * (s - 1) / 2 : at3 + (at5 - at3) * (s - 3) / 2;
}

/** 1..20 score of a specialty: knowledge dominates, the four general attributes complete it. */
export function areaScore(m: StaffMember, specialty: Specialty): number {
  const w = STAFF.STAR_WEIGHTS, a = m.attributes;
  return w.knowledge * (a.knowledge[specialty] ?? STAFF.ATTR_MIN) + w.playerReading * a.playerReading
    + w.determination * a.determination + w.discipline * a.discipline + w.adaptability * a.adaptability;
}
export function starsFromScore(score: number): number {
  return clamp(roundHalf(1 + (4 * (score - 1)) / 19), STAFF.MIN_STARS, STAFF.MAX_STARS);
}
export const starsIn = (m: StaffMember, s: Specialty) => starsFromScore(areaScore(m, s));
/** Headline stars: the role's specialty; an area coach's best area. */
export function memberStars(m: StaffMember): number {
  if (m.role === "coach") return Math.max(...COACH_AREAS.map((a) => starsIn(m, a)));
  return starsIn(m, ROLE_SPECIALTY[m.role]);
}

export const membersOf = (squad: Squad, role: StaffRole) => (squad.staff?.members ?? []).filter((m) => m.role === role);
/** Best member of a single-holder role (in practice the only one). */
export const headOf = (squad: Squad, role: StaffRole) =>
  membersOf(squad, role).sort((a, b) => memberStars(b) - memberStars(a))[0];

export function impliedStars(squad: Squad): number {
  // Hand-built squads (/lab, /test, unit tests) have no finances: neutral.
  if (!squad.finances) return STAFF.NEUTRAL_STARS;
  return STAFF.IMPLIED_STARS[financialTierOf(squad)];
}

/** Stars that count for a non-area role: hired head, vacant (2★) when the club manages staff, else implied. */
export function effectiveStars(squad: Squad, role: StaffRole): number {
  if (!squad.staff) return impliedStars(squad);
  const h = headOf(squad, role);
  return h ? memberStars(h) : STAFF.VACANT_STARS;
}
/** Compat for code that reads the 1..10 rating (scouting, youth intake). */
export const effectiveRating = (squad: Squad, role: StaffRole) => ratingFromStars(effectiveStars(squad, role));

/** Coach areas -> member: valid manual choices first, then each free area to the best coach with room. */
export function resolveAreaAssignments(staff: StaffRecord): Partial<Record<CoachArea, StaffMember>> {
  const coaches = staff.members.filter((m) => m.role === "coach");
  const byId = new Map(coaches.map((c) => [c.id, c]));
  const load = new Map<string, number>();
  const out: Partial<Record<CoachArea, StaffMember>> = {};
  for (const area of COACH_AREAS) {
    const id = staff.areaAssignments?.[area];
    const c = id ? byId.get(id) : undefined;
    if (c && (load.get(c.id) ?? 0) < 2) { out[area] = c; load.set(c.id, (load.get(c.id) ?? 0) + 1); }
  }
  // Free areas, best available star first (ties by area order, then member id).
  const free = COACH_AREAS.filter((a) => !out[a]);
  while (free.length > 0) {
    let best: { area: CoachArea; c: StaffMember; s: number } | null = null;
    for (const area of free) for (const c of coaches) {
      if ((load.get(c.id) ?? 0) >= 2) continue;
      const s = starsIn(c, area);
      if (!best || s > best.s || (s === best.s && c.id < best.c.id)) best = { area, c, s };
    }
    if (!best) break;
    out[best.area] = best.c;
    load.set(best.c.id, (load.get(best.c.id) ?? 0) + 1);
    free.splice(free.indexOf(best.area), 1);
  }
  return out;
}

/** Stars of every training area; null = nobody leads it (human club only). */
export function areaStars(squad: Squad): Record<DPCategory, number | null> {
  if (!squad.staff) {
    const s = impliedStars(squad);
    return Object.fromEntries(DP_CATEGORIES.map((c) => [c, s])) as Record<DPCategory, number>;
  }
  const res = resolveAreaAssignments(squad.staff);
  const fit = headOf(squad, "fitness"), gk = headOf(squad, "goalkeeping");
  const out = {} as Record<DPCategory, number | null>;
  out.physical = fit ? starsIn(fit, "physical") : null;
  out.goalkeeping = gk ? starsIn(gk, "goalkeeping") : null;
  for (const a of COACH_AREAS) out[a] = res[a] ? starsIn(res[a]!, a) : null;
  return out;
}

/** Multiplier on the growth DP of each category (never on the age decay). */
export function areaMultsOf(squad: Squad): Record<DPCategory, number> {
  const st = areaStars(squad);
  return Object.fromEntries(DP_CATEGORIES.map((c) => [c, st[c] === null ? STAFF.AREA_VACANT_MULT : starCurve(st[c]!, STAFF.AREA_MULT)])) as Record<DPCategory, number>;
}

export interface StaffEffects {
  devMult: number;
  recoveryMult: number;
  injuryMult: number;
  /** Medic: multiplier on the days out of a new injury. */
  injuryDurationMult: number;
  /** Analyst: multiplier on the style-familiarity gain (replaces the assistant there). */
  familiarityMult: number;
  scoutUncertaintyMult: number;
  scoutGainMult: number;
}

export function staffEffectsOf(squad: Squad): StaffEffects {
  // The fitness coach's stars (Físico); vacant = 2★ = the old vacant rating 3.
  const fitness = effectiveRating(squad, "fitness");
  return {
    devMult: developmentMultiplier(effectiveRating(squad, "assistant")),
    recoveryMult: recoveryMultiplier(fitness),
    injuryMult: injuryMultiplier(fitness),
    injuryDurationMult: starCurve(effectiveStars(squad, "medic"), STAFF.MEDIC_DURATION),
    familiarityMult: starCurve(effectiveStars(squad, "analyst"), STAFF.ANALYST_FAMILIARITY),
    scoutUncertaintyMult: scoutUncertaintyMultOf(effectiveRating(squad, "scout")),
    scoutGainMult: scoutGainMultOf(effectiveRating(squad, "scout")),
  };
}
```
Exporte também `starCurve` (a Task 6 usa). Imports novos em `staff.ts`: `DP_CATEGORIES`/`DPCategory` de `@/GameEngine/PlayerDevelopment`; `COACH_AREAS`, `ROLE_SPECIALTY`, `STAFF_ROLES` e os tipos de `@/Domain/staff/staffTypes`; `contractEndFor` de `@/Domain/contracts/contracts` (Task 3). A geração acerta a meia estrela, não o valor exato — por isso os testes de 1★/5★ usam limites, não igualdade.

`makeProfessional` (geração determinística, sem contrato) — no mesmo arquivo:

```ts
/** Deterministic professional of about `targetStars` (attributes 1..20 around the matching score). */
export function makeProfessional(key: string, role: StaffRole, targetStars: number): StaffMember {
  const rng = mulberry32(seedFrom(`staff:${key}`));
  const nationality = STAFF_NATIONALITIES[Math.floor(rng() * STAFF_NATIONALITIES.length)]!;
  const pool = STAFF_NAME_POOLS[nationality]!;
  const name = `${pool.first[Math.floor(rng() * pool.first.length)]!} ${pool.last[Math.floor(rng() * pool.last.length)]!}`;
  const level = 1 + (19 * (clamp(targetStars, 1, 5) - 1)) / 4; // score of the target
  const attr = (x: number) => clamp(Math.round(x), STAFF.ATTR_MIN, STAFF.ATTR_MAX);
  const noise = () => (rng() - 0.5) * 6;
  const general = { determination: attr(level + noise()), discipline: attr(level + noise()),
    adaptability: attr(level + noise()), playerReading: attr(level + noise()) };
  const w = STAFF.STAR_WEIGHTS;
  const rest = w.playerReading * general.playerReading + w.determination * general.determination
    + w.discipline * general.discipline + w.adaptability * general.adaptability;
  const knowledgeFor = (target: number) => attr((target - rest) / w.knowledge);
  const knowledge: StaffAttributes["knowledge"] = {};
  if (role === "coach") {
    const best = COACH_AREAS[Math.floor(rng() * COACH_AREAS.length)]!;
    for (const a of COACH_AREAS) knowledge[a] = knowledgeFor(a === best ? level : level - 1 - rng() * 4);
  } else {
    knowledge[ROLE_SPECIALTY[role]] = knowledgeFor(level);
  }
  return { id: `staff_${seedFrom(key).toString(36)}`, name, nationality, role,
    age: 32 + Math.floor(rng() * 30), attributes: { ...general, knowledge } };
}
```

- [ ] **Step 4: Rodar** — `bun test src/Domain/staff/staff.test.ts` → PASS.

---

### Task 3: Salário, contrato e comissão inicial (puro)

**Files:** Modify `src/Domain/staff/staff.ts`, `src/Domain/staff/staff.test.ts`.

- [ ] **Step 1: Teste**

```ts
describe("wages and starting staff", () => {
  test("wage frozen at signing: the bill sums the contracts", () => {
    const m = signContract(makeProfessional("w", "assistant", 3), { date: "2027-02-05", seasonEnd: "2027-12-06", years: 2, clubFactor: 1 });
    expect(m.contract!.until).toBe("2028-12-06");
    expect(m.contract!.wage).toBe(staffWageFor("assistant", 3, 1));
    expect(squadStaffWages({ members: [m] })).toBe(m.contract!.wage);
    expect(staffWageFor("groundskeeper", 3, 1)).toBeLessThan(staffWageFor("assistant", 3, 1));
  });
  test("initial staff: one per role, coaches up to the tier limit, no field scouts, deterministic", () => {
    const sq = { id: "c", players: [], finances: fin(20e6) } as unknown as Squad; // MEDIUM
    const a = initialStaff("save1", sq, { date: "2027-02-05", seasonEnd: "2027-12-06" });
    const b = initialStaff("save1", sq, { date: "2027-02-05", seasonEnd: "2027-12-06" });
    expect(a).toEqual(b);
    const count = (r: string) => a.members.filter((m) => m.role === r).length;
    expect(count("coach")).toBe(3);
    expect(count("fieldScout")).toBe(0);
    for (const r of ["assistant", "fitness", "goalkeeping", "medic", "analyst", "scout", "groundskeeper"]) expect(count(r)).toBe(1);
    for (const m of a.members) {
      expect(Math.abs(memberStars(m) - 3)).toBeLessThanOrEqual(1);
      expect(m.contract).toBeDefined();
    }
  });
  test("role limit by natural tier", () => {
    expect(roleLimit({ finances: fin(1e6) } as unknown as Squad, "coach")).toBe(3);
    expect(roleLimit({ finances: fin(300e6) } as unknown as Squad, "coach")).toBe(5);
    expect(roleLimit({ finances: fin(1e6) } as unknown as Squad, "fieldScout")).toBe(4);
    expect(roleLimit({ finances: fin(1e6) } as unknown as Squad, "medic")).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

```ts
/** Weekly wage of a professional of `stars` in `role`: today's staff curve × the role's share. */
export function staffWageFor(role: StaffRole, stars: number, clubFactor: number): number {
  return Math.round(staffWeeklyWage(ratingFromStars(stars), clubFactor) * STAFF.WAGE_ROLE_SHARE[role]);
}
/** Monday ledger line: the contracts' frozen wages. */
export function squadStaffWages(staff: StaffRecord | undefined): number {
  return (staff?.members ?? []).reduce((s, m) => s + (m.contract?.wage ?? 0), 0);
}
export function signContract(m: StaffMember, a: { date: string; seasonEnd: string; years: number; clubFactor: number }): StaffMember {
  const { since: _s, ...rest } = m;
  return { ...rest, contract: { until: contractEndFor(a.date, a.seasonEnd, a.years), wage: staffWageFor(m.role, memberStars(m), a.clubFactor), signed: a.date } };
}
export function roleLimit(squad: Squad, role: StaffRole): number {
  if (role === "coach") return STAFF.LIMITS.coach[financialTierOf(squad)];
  if (role === "fieldScout") return STAFF.LIMITS.fieldScout;
  return STAFF.LIMITS.other;
}
/** The human club's starting staff: every role (coaches to the limit, no field scouts), stars = implied ± half. */
export function initialStaff(key: string, squad: Squad, at: { date: string; seasonEnd: string }): StaffRecord {
  const implied = impliedStars(squad);
  const factor = wageFactorOf(squad);
  const members: StaffMember[] = [];
  for (const role of STAFF_ROLES) {
    if (role === "fieldScout") continue;
    for (let i = 0; i < roleLimit(squad, role); i++) {
      const rng = mulberry32(seedFrom(`staff-start:${key}:${role}:${i}`));
      const delta = (Math.floor(rng() * 3) - 1) * STAFF.START_SPREAD_STARS;
      const years = 1 + Math.floor(rng() * 3);
      const m = makeProfessional(`${key}:start:${role}:${i}`, role, implied + delta);
      members.push(signContract(m, { ...at, years, clubFactor: factor }));
    }
  }
  return { members };
}
```
Remover `makeStaffMember`, `staffMarket`, `fieldScoutMarket`, `weekStartOf` só se não houver mais usos (procure com `grep -rn "weekStartOf" src`; `weekStartOf` é usado fora? Se sim, mova para `@/Domain/dates`). `withFitnessCoach(squad, stars)` passa a receber **estrelas**:

```ts
export function withFitnessCoach(squad: Squad, stars: number | undefined): Squad {
  if (stars === undefined) return squad;
  return { ...squad, staff: { members: [makeProfessional(`lab:${squad.id}:${stars}`, "fitness", stars)] } };
}
```
(o lab não tem finanças, então as outras funções vagas não importam: `/lab` só usa recuperação e lesão.) Atenção: com `staff` presente e só o físico, `staffEffectsOf` dá auxiliar vago (2★) — `devMult` não é usado na partida do lab; ok.

- [ ] **Step 4: Rodar** — `bun test src/Domain/staff` → PASS. Ainda não compila o resto (consumidores): seguir para a Task 4 e fechar o commit das tarefas 1–3 na Task 9? **Não**: para manter commits verdes, nesta tarefa ajuste os consumidores mínimos com o novo formato (compilar): `staffRoutes.ts`, `scoutingRoutes.ts`, `scoutingWorld.ts`, `financial.ts`, `FinancesScreen.tsx`, `SaveService.ts`, `jobWorld.ts`, `StaffScreen.tsx`, `lab/VariantEditor.tsx` — trocando `squad.staff?.[role]` por `headOf(squad, role)`, `squad.staff?.scouts` por `membersOf(squad, "fieldScout")`, `s.rating` por `ratingFromStars(memberStars(s))`, `squadStaffWages(staff, factor)` por `squadStaffWages(staff)`, `initialStaff(id, squad)` por `initialStaff(id, squad, { date: meta.startDate, seasonEnd })` (o `seasonEnd` da liga do clube; em `createSave` vem do calendário da liga já montado; em `takeOverClub` já existe `seasonEnd`). As rotas de mercado antigas respondem 410 provisoriamente (substituídas na Task 9). Commit:

```
git add -A src/Domain/staff src/GameEngine/PlayerDevelopment.ts src/backend src/Domain/advanceDay/financial.ts src/GameInterface src/lab
git commit -m "feat(comissão): tipos, estrelas, efeitos e contratos da comissão técnica

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Sete áreas de DP e pesos por posição natural

**Files:** Modify `src/GameEngine/PlayerDevelopment.ts`, `src/example_data/roles.json` (+ cópia em `src/Data/roles.json`); Create `src/Domain/development/dpWeights.ts`, `src/Domain/development/dpWeights.test.ts`, `src/GameEngine/PlayerDevelopment.areas.test.ts`.

- [ ] **Step 1: Teste**

`dpWeights.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import rolesData from "@/Data/roles.json";
import { DP_CATEGORIES } from "@/GameEngine/PlayerDevelopment";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import type { RosterPlayer } from "@/types/playerTypes";

describe("dpWeights", () => {
  test("every role has the 7 categories and sums to 1", () => {
    for (const [role, v] of Object.entries(rolesData as Record<string, { dpWeights: Record<string, number> }>)) {
      expect(Object.keys(v.dpWeights).sort()).toEqual([...DP_CATEGORIES].sort());
      expect(Object.values(v.dpWeights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      if (role === "GK") expect(v.dpWeights.goalkeeping).toBeGreaterThan(0.4);
      else expect(v.dpWeights.goalkeeping).toBe(0);
    }
  });
  test("weights follow the natural position, not the line in positions[0]", () => {
    const st = { id: "s", positions: ["Forward"], stats: { passing: 4, vision: 4, finishing: 8, dribbling: 6, speed: 6, acceleration: 6,
      tackling: 2, pressing: 3, stamina: 5, heading: 6, strength: 6, reflex: 1, jump: 3 } } as unknown as RosterPlayer;
    expect(dpWeightsFor(st)).toEqual((rolesData as any).ST.dpWeights);
    const gk = { id: "g", positions: ["GK"], stats: { ...st.stats, reflex: 7, jump: 6, passing: 4 } } as unknown as RosterPlayer;
    expect(dpWeightsFor(gk).goalkeeping).toBeGreaterThan(0.4);
  });
});
```
(se o atacante de teste não sair ST pela regra do pé/atributos, ajuste os atributos até `preferredRole` dar ST — confira com `preferredRole(st)` no próprio teste.)

`PlayerDevelopment.areas.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { applyDevelopment, applyTrainingDevelopment, DEFAULT_DP_WEIGHTS, type RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import rolesData from "@/Data/roles.json";
import type { RosterPlayer } from "@/types/playerTypes";

const GK_W = (rolesData as any).GK.dpWeights as RoleDPWeights;
const base = (age: number, positions = ["CM"]) => ({ id: "p", name: "p", age, positions,
  stats: { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5, pressing: 5,
    stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5 } }) as unknown as RosterPlayer;
const run = (p: RosterPlayer, w: RoleDPWeights, mults?: Record<string, number>) => {
  for (let i = 0; i < 38; i++) {
    p = applyDevelopment(p, 7.2, w, 1, 1, mults).updatedPlayer;
    p = applyTrainingDevelopment(p, "normal", w, 1, mults).updatedPlayer;
  }
  return p;
};
const sum = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0);

describe("training areas", () => {
  test("goalkeeper reflex and jump now develop", () => {
    const p = run(base(19, ["GK"]), GK_W);
    expect(p.stats.reflex).toBeGreaterThan(5);
    expect(p.stats.jump).toBeGreaterThan(5);
  });
  test("strength and stamina develop through Físico", () => {
    const p = run(base(19), DEFAULT_DP_WEIGHTS);
    expect(p.stats.strength).toBeGreaterThan(5);
    expect(p.stats.stamina).toBeGreaterThan(5);
  });
  test("all multipliers at 1 = no multipliers", () => {
    const ones = Object.fromEntries(Object.keys(DEFAULT_DP_WEIGHTS).map((k) => [k, 1]));
    expect(run(base(20), DEFAULT_DP_WEIGHTS, ones).stats).toEqual(run(base(20), DEFAULT_DP_WEIGHTS).stats);
  });
  test("a vacant area (0.4) grows less, a 1.25 area more", () => {
    const g0 = sum(run(base(19), DEFAULT_DP_WEIGHTS)) - sum(base(19));
    const vac = Object.fromEntries(Object.keys(DEFAULT_DP_WEIGHTS).map((k) => [k, 0.4]));
    const top = Object.fromEntries(Object.keys(DEFAULT_DP_WEIGHTS).map((k) => [k, 1.25]));
    const gv = sum(run(base(19), DEFAULT_DP_WEIGHTS, vac)) - sum(base(19));
    const gt = sum(run(base(19), DEFAULT_DP_WEIGHTS, top)) - sum(base(19));
    expect(gv / g0).toBeGreaterThan(0.3);
    expect(gv / g0).toBeLessThan(0.5);
    expect(gt / g0).toBeGreaterThan(1.15);
  });
  test("the area multiplier never touches the age decay", () => {
    const vac = Object.fromEntries(Object.keys(DEFAULT_DP_WEIGHTS).map((k) => [k, 0.4]));
    const a = run(base(34), DEFAULT_DP_WEIGHTS, vac), b = run(base(34), DEFAULT_DP_WEIGHTS);
    expect(sum(a)).toBeCloseTo(sum(b), 6); // 34: no growth, only decay
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/development src/GameEngine/PlayerDevelopment.areas.test.ts` → FAIL.

- [ ] **Step 3: Implementação**

`PlayerDevelopment.ts`:
```ts
const CATEGORY_STATS: Record<DPCategory, (keyof PlayerStatsRecord)[]> = {
  goalkeeping: ["reflex", "jump", "pressing"],
  defending:   ["tackling", "pressing"],
  shooting:    ["finishing"],
  technical:   ["dribbling"],
  passing:     ["passing", "vision"],
  physical:    ["speed", "acceleration", "strength", "stamina"],
  setPieces:   ["heading"],
};
export type RoleDPWeights = Record<DPCategory, number>;
/** Growth multiplier per training area (`staff.areaMultsOf`); absent = 1. */
export type AreaMults = Partial<Record<DPCategory, number>>;

export const DEFAULT_DP_WEIGHTS: RoleDPWeights = {
  goalkeeping: 0, shooting: 0.07, setPieces: 0.03, passing: 0.3, defending: 0.2, technical: 0.25, physical: 0.15,
};
```
`applyDevelopment(player, matchRating, weights, dpMult = 1, decayMult = 1, areaMults: AreaMults = {})`:
```ts
  const growth = BASE_DP * performanceMultiplier(matchRating) * dpMult * ageGrowthMultiplier(player.age) * GROWTH_DP_SCALE;
  const decay  = ageDecayPerMatch(player.age) * decayDpScale(player.age) * decayMult;
  return distributeAndResolve(player, growth, decay, weights, areaMults);
```
`applyTrainingDevelopment(player, intensity, weights, dpMult = 1, areaMults: AreaMults = {})`: `distributeAndResolve(player, netDP, 0, weights, areaMults)` (o `dpGained` continua `netDP`).
`distributeAndResolve(player, growth, decay, weights, areaMults)`: no laço, `const categoryDP = (growth * (areaMults[category] ?? 1) - decay) * weight;` (o resto igual). Comentário no topo: "Implements … 7 training areas (`staff.md`)".

`src/Domain/development/dpWeights.ts`:
```ts
import rolesData from "@/Data/roles.json";
import { DEFAULT_DP_WEIGHTS, type RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import type { RosterPlayer } from "@/types/playerTypes";

const ROLES = rolesData as Record<string, { dpWeights?: RoleDPWeights }>;
/** DP weights of the player's natural detailed role (positions[0] is only the line in the world data). */
export function dpWeightsFor(player: RosterPlayer): RoleDPWeights {
  return ROLES[preferredRole(player)]?.dpWeights ?? DEFAULT_DP_WEIGHTS;
}
```

`roles.json`: trocar o `dpWeights` de cada papel pela tabela da spec (seção 1), mantendo a ordem de chaves `goalkeeping, shooting, setPieces, passing, defending, technical, physical`. Depois `cp src/example_data/roles.json src/Data/roles.json`.

- [ ] **Step 4: Rodar** — os dois testes → PASS; `bun test src/GameEngine` (os testes de desenvolvimento existentes podem precisar de ajuste onde conferiam heading em `shooting` ou as 5 chaves — ajuste as expectativas, não o código).

- [ ] **Step 5: Commit** — `feat(desenvolvimento): sete áreas de treino e pesos pela posição natural`.

---

### Task 5: Efeitos no avanço do dia (partida, treino, base, lesão, familiaridade)

**Files:** Modify `src/Domain/advanceDay/matches.ts`, `src/Domain/advanceDay/dailyTraining.ts`, `src/Domain/youth/youth.ts`, `src/Domain/injury/injury.ts`; tests em `src/Domain/advanceDay/matches.test.ts`, `dailyTraining.test.ts`, `src/Domain/injury/injury.test.ts`, `src/Domain/youth/youth.test.ts`.

- [ ] **Step 1: Testes**

`injury.test.ts`:
```ts
test("medic multiplies the days out, same rng draws", () => {
  const seq = () => { let i = 0; const v = [0.5]; return () => v[i++ % v.length]!; };
  const base = injuryDurationDays("medium", seq());
  expect(injuryDurationDays("medium", seq(), 1)).toBe(base);
  expect(injuryDurationDays("medium", seq(), 0.8)).toBe(Math.max(1, Math.round(base * 0.8)));
  expect(returnDate("2027-03-01", "light", seq(), 1.2)).toBe(addDays("2027-03-01", Math.max(1, Math.round(injuryDurationDays("light", seq()) * 1.2))));
});
```
`dailyTraining.test.ts`: (a) um clube humano com `staff: { members: [] }` treina e a DP de um jogador de 19 anos é ~0,4 da de um clube com `staff` de 3★ em tudo (`initialStaff` de um clube MEDIUM); (b) o foco de familiaridade ganha `GAIN × familiarityMult × intensidade × (1 − v/100)`: com analista 5★ o ganho é ×1,25 o de 3★, e o auxiliar não muda mais esse ganho. `matches.test.ts`: um titular lesionado num clube com médico 5★ volta antes (com o mesmo `rng` fixo) que num clube com médico 1★. `youth.test.ts`: `developYouthSeason(p, devMult, areaMults)` com todas as áreas 0,4 cresce menos que com 1.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

- `injury.ts`: `injuryDurationDays(severity, rng = Math.random, mult = 1)` → `const d = min + Math.floor(rng() * (max - min + 1)); return mult === 1 ? d : Math.max(1, Math.round(d * mult));` e `returnDate(date, severity, rng = Math.random, durationMult = 1)` repassa.
- `matches.ts`: em `applyDevelopmentToSquad`, `const fx = staffEffectsOf(squad); const areas = areaMultsOf(squad);` e `applyDevelopment(p, rating, dpWeightsFor(p), fx.devMult * …, professionalismDecayMult(p), areas)` (some o `rolesData[positions[0]]`); na lesão `injuryReturnDate(matchDate, inj.severity, rng, staffEffectsOf(squad).injuryDurationMult)` — o `squad` certo é o do jogador lesionado (o bloco já é por lado).
- `dailyTraining.ts`: `const areas = areaMultsOf(squad);` `applyTrainingDevelopment(p, policy.intensity, dpWeightsFor(p), devMult * ground.devMult * …, areas)`; lesão de treino `injuryReturnDate(date, severity, rng, staffFx.injuryDurationMult)`; familiaridade `trainFamiliarity(..., staffFx.familiarityMult * FAMILIARITY.INTENSITY_GAIN[policy.intensity])`.
- `youth.ts`: `developYouthSeason(player, dpMult, areaMults: AreaMults = {})` com `dpWeightsFor(player)` e `applyTrainingDevelopment(p, "normal", weights, academyDpMult, areaMults)`; `processYouthRollover` passa `areaMultsOf(squad)` no ramo humano (a IA não desenvolve a base).
- `src/Domain/familiarity/familiarity.ts`: renomear o parâmetro `devMult` de `trainFamiliarity` para `gainMult` (o comentário cita o analista).

- [ ] **Step 4: Rodar** — `bun test src/Domain/advanceDay src/Domain/injury src/Domain/youth src/Domain/familiarity src/lab` → PASS.

- [ ] **Step 5: Commit** — `feat(comissão): áreas, médico e analista no avanço do dia`.

---

### Task 6: Medição do ritmo (obrigatória)

**Files:** Modify `scripts/development-pace.ts`; Modify `.claude/rules/game/development.md` (tabela).

- [ ] **Step 1:** Antes de mexer no script, rode-o no commit base (`git stash` não serve — use `git worktree add ../FMProject-base main` só para ler o PlayerDevelopment antigo, ou `--module <cópia do PlayerDevelopment.ts do main>`): grave as linhas "realista" e "base" de hoje.
- [ ] **Step 2:** No script: pesos por `rolesData[role].dpWeights` (já é assim); perfil **goleiro** (`role: "GK"`, reflex 5, jump 5, pressing 5, passing 4, o resto 3); coluna **overall** (`Player.computeOverallAvg` antes/depois, ao lado da média dos 13); flag `--areas <1|2|3|4|5|vaga>` que monta `AreaMults` com a curva de `STAFF.AREA_MULT`/`AREA_VACANT_MULT` (importe `starCurve` exportado de `staff.ts` ou recalcule) e passa a `applyDevelopment`/`applyTrainingDevelopment`. Sem flag = 3★.
- [ ] **Step 3:** Rodar `bun scripts/development-pace.ts`, `--areas vaga`, `--areas 1`, `--areas 5`. Aceite (spec §9): média 3★ a ±10% de 0,385 / 0,308 / 0,256 / 0,051 / −0,121 / −0,382; vaga ≈ 40% do crescimento (idades 18–24) e o mesmo declínio (31, 33); 5★ ≈ ×1,25; goleiro com reflex/jump subindo, overall entre 0,6× e 1,4× do perfil de linha aos 18/21/24 e caindo aos 31/33. Se a média 3★ sair dos ±10%, **não** mexa nos multiplicadores de área: ajuste os `dpWeights` (Task 4) e registre o porquê.
- [ ] **Step 4:** Registrar as tabelas (antes × depois, vaga/1★/3★/5★, overall GK × linha) em `development.md`, seção nova "Áreas de treino (4.7)". Commit `chore(desenvolvimento): medição do ritmo com as áreas de treino`.

---

### Task 7: Lista de livres (puro + DAL)

**Files:** Create `src/Domain/staff/staffPool.ts`, `src/Domain/staff/staffPool.test.ts`; Modify `src/backend/dal/ISaveDAL.ts`, `FileSystemDAL.ts`, `BufferingSaveDAL.ts`, `src/backend/SaveService.ts`.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { generatePool, refreshPool, returnToPool, searchPool, takeFromPool } from "@/Domain/staff/staffPool";
import { STAFF } from "@/Domain/staff/staffConfig";
import { memberStars } from "@/Domain/staff/staff";

describe("staff pool", () => {
  const pool = generatePool("save1", "2027", "2027-02-05");
  test("300, deterministic, by role, no contracts", () => {
    expect(pool.members.length).toBe(STAFF.POOL.SIZE);
    expect(generatePool("save1", "2027", "2027-02-05")).toEqual(pool);
    expect(pool.members.filter((m) => m.role === "coach").length).toBe(90);
    expect(pool.members.every((m) => !m.contract)).toBe(true);
    expect(new Set(pool.members.map((m) => m.id)).size).toBe(300);
  });
  test("star bands: some 4.5+, most 2.5-3", () => {
    const top = pool.members.filter((m) => memberStars(m) >= 4.5).length;
    expect(top).toBeGreaterThan(5);
    expect(top).toBeLessThan(60);
  });
  test("search filters, sorts and pages; asking wage at the club factor", () => {
    const r = searchPool(pool, { role: "medic", minStars: 3, sort: "stars", limit: 5 }, 1);
    expect(r.items.length).toBeLessThanOrEqual(5);
    expect(r.items.every((m) => m.role === "medic" && m.stars >= 3)).toBe(true);
    for (let i = 1; i < r.items.length; i++) expect(r.items[i - 1]!.stars).toBeGreaterThanOrEqual(r.items[i]!.stars);
    const cheap = searchPool(pool, { maxWage: 1000 }, 1);
    expect(cheap.items.every((m) => m.askingWage <= 1000)).toBe(true);
  });
  test("take and return", () => {
    const id = pool.members[0]!.id;
    const t = takeFromPool(pool, id)!;
    expect(t.pool.members.length).toBe(299);
    const back = returnToPool(t.pool, { ...t.member, contract: { until: "x", wage: 1, signed: "y" } }, "2027-06-01");
    expect(back.members.find((m) => m.id === id)!.contract).toBeUndefined();
    expect(back.members.find((m) => m.id === id)!.since).toBe("2027-06-01");
  });
  test("refresh: retires 68+, swaps a third, back to 300, everyone a year older", () => {
    const next = refreshPool(pool, "save1", "2028", "2028-01-10");
    expect(next.members.length).toBe(300);
    expect(next.members.every((m) => m.age < STAFF.POOL.RETIRE_AGE)).toBe(true);
    const kept = next.members.filter((m) => pool.members.some((o) => o.id === m.id)).length;
    expect(kept).toBeLessThanOrEqual(200);
    expect(refreshPool(next, "save1", "2028", "2028-01-10")).toEqual(next); // same season: no-op
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação** (`staffPool.ts`):
  - `export interface StaffPool { season: string; members: StaffMember[] }`.
  - `sampleStars(rng)`: escolhe a faixa por `STAR_BANDS` (parcela acumulada) e uma meia-estrela dentro dela.
  - `generatePool(saveId, season, date)`: para cada função de `BY_ROLE`, `n` membros `makeProfessional(\`${saveId}:pool:${season}:${role}:${i}\`, role, sampleStars(rng))` com `since: date`; `rng = mulberry32(seedFrom(\`staff-pool:${saveId}:${season}\`))`.
  - `refreshPool(pool, saveId, season, date)`: se `pool.season === season`, devolve `pool`; senão todos `age + 1`, saem os `age >= RETIRE_AGE`, depois `floor(REFRESH_SHARE × restantes)` dos de `since` mais antigo (empate id), e completa cada função até `BY_ROLE` com `generatePool`-like de chave `${saveId}:pool:${season}:${role}:r${i}` (ids novos não colidem com os da lista). Devolve `{ season, members }`.
  - `takeFromPool(pool, id)` / `returnToPool(pool, member, date)` (tira `contract`, põe `since`, substitui se o id já existir).
  - `searchPool(pool, q, clubFactor)`: `items` = membros + `stars: memberStars(m)` + `askingWage: staffWageFor(m.role, stars, clubFactor)`; filtros `role`, `minStars`, `maxWage`; `sort` `stars` (desc, padrão) / `wage` (asc) / `age` (asc), empate id; `offset` 0, `limit` 1..100 (padrão 50). Devolve `{ total, items }`.
  - DAL: `readStaffPool(saveId): Promise<StaffPool | null>` / `writeStaffPool(saveId, pool)` em `saves/{id}/staffPool.json` (mesmo molde de `readFreeAgents`/`writeFreeAgents`; no `BufferingSaveDAL` chave `staffPool:<save>`, fase 1 do flush). `SaveService.getStaffPool(saveId, date)` (lê; se ausente, gera com a temporada `date.slice(0, 4)` e grava) e `writeStaffPool`.

- [ ] **Step 4: Rodar** — `bun test src/Domain/staff src/backend/dal` → PASS. Commit `feat(comissão): lista de profissionais livres por save`.

---

### Task 8: Contratos da comissão (puro)

**Files:** Create `src/Domain/staff/staffContracts.ts`, `src/Domain/staff/staffContracts.test.ts`.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { makeProfessional, signContract } from "@/Domain/staff/staff";
import { renewedContract, severanceOf, staffContractDay } from "@/Domain/staff/staffContracts";

const signed = (key: string, stars: number, until: string, age?: number) => {
  const m = signContract(makeProfessional(key, "medic", stars), { date: "2027-02-05", seasonEnd: until, years: 1, clubFactor: 1 });
  return age === undefined ? m : { ...m, age };
};

describe("staff contracts", () => {
  test("severance = half of the remaining weeks (rounded up)", () => {
    const m = signed("a", 3, "2027-12-06");
    expect(severanceOf(m, "2027-11-29")).toBe(Math.round(0.5 * m.contract!.wage * 1));
    expect(severanceOf(m, "2027-12-07")).toBe(0);
  });
  test("director renews a good one on Monday 60 days out, 2 years, never lower wage", () => {
    const m = signed("b", 3.5, "2027-12-06", 50);
    const r = staffContractDay({ staff: { members: [m] }, date: "2027-10-11", monday: true, seasonEnd: "2027-12-06",
      directorHandles: true, impliedStars: 3, clubFactor: 1.2 });
    const got = r.staff.members[0]!;
    expect(got.contract!.until).toBe("2029-12-06");
    expect(got.contract!.wage).toBeGreaterThanOrEqual(m.contract!.wage);
    expect(r.news[0]!.kind).toBe("staff_renewed");
  });
  test("director lets a weak or old one go; he leaves the day after", () => {
    const weak = signed("c", 1.5, "2027-12-06");
    const d1 = staffContractDay({ staff: { members: [weak] }, date: "2027-10-11", monday: true, seasonEnd: "2027-12-06",
      directorHandles: true, impliedStars: 3, clubFactor: 1 });
    expect(d1.staff.members[0]!.contract!.decision).toBe("leave");
    expect(d1.news[0]!.kind).toBe("staff_leaving");
    const d2 = staffContractDay({ staff: d1.staff, date: "2027-12-07", monday: false, seasonEnd: "2027-12-06",
      directorHandles: true, impliedStars: 3, clubFactor: 1 });
    expect(d2.staff.members.length).toBe(0);
    expect(d2.left.map((x) => x.id)).toEqual([weak.id]);
    expect(d2.news[0]!.kind).toBe("staff_left");
  });
  test("manager in charge: one warning, no renewal", () => {
    const m = signed("d", 4, "2027-12-06");
    const a = staffContractDay({ staff: { members: [m] }, date: "2027-10-11", monday: true, seasonEnd: "2027-12-06",
      directorHandles: false, impliedStars: 3, clubFactor: 1 });
    expect(a.news[0]!.kind).toBe("staff_expiring");
    const b = staffContractDay({ staff: a.staff, date: "2027-10-18", monday: true, seasonEnd: "2027-12-06",
      directorHandles: false, impliedStars: 3, clubFactor: 1 });
    expect(b.news.length).toBe(0);
  });
  test("renewal by hand: years from the current end, at most 3 seasons left", () => {
    const m = signed("e", 3, "2027-12-06");
    expect(renewedContract(m, { date: "2027-06-01", seasonEnd: "2027-12-06", years: 2, clubFactor: 1 })!.until).toBe("2029-12-06");
    expect(renewedContract(m, { date: "2027-06-01", seasonEnd: "2027-12-06", years: 3, clubFactor: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

```ts
import { addYearsIso } from "@/Domain/contracts/contracts";
import { daysBetween } from "@/Domain/dates";
import { memberStars, staffWageFor } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import type { StaffContract, StaffMember, StaffRecord } from "@/Domain/staff/staffTypes";

const C = STAFF.CONTRACT;

export function remainingWeeks(m: StaffMember, date: string): number {
  if (!m.contract) return 0;
  const days = daysBetween(date, m.contract.until);
  return days <= 0 ? 0 : Math.ceil(days / 7);
}
/** Firing: half of what is left on the contract. */
export function severanceOf(m: StaffMember, date: string): number {
  return Math.round(C.SEVERANCE_SHARE * (m.contract?.wage ?? 0) * remainingWeeks(m, date));
}
/** `years` more from the current end, the total at most MAX_YEARS seasons from this season's end; null = too long. */
export function renewedContract(m: StaffMember, a: { date: string; seasonEnd: string; years: number; clubFactor: number }): StaffContract | null {
  if (!m.contract || a.years < C.MIN_YEARS || a.years > C.MAX_YEARS) return null;
  const until = addYearsIso(m.contract.until, a.years);
  const base = a.date > a.seasonEnd ? addYearsIso(a.seasonEnd, 1) : a.seasonEnd;
  if (until > addYearsIso(base, C.MAX_YEARS - 1)) return null;
  const wage = Math.max(m.contract.wage, staffWageFor(m.role, memberStars(m), a.clubFactor));
  return { until, wage, signed: a.date };
}
export function directorRenews(m: StaffMember, impliedStars: number): boolean {
  return memberStars(m) >= impliedStars - C.DIRECTOR_STAR_MARGIN && m.age < C.DIRECTOR_MAX_AGE;
}

export interface StaffContractNews {
  kind: "staff_expiring" | "staff_renewed" | "staff_leaving" | "staff_left";
  member: { id: string; name: string; role: StaffMember["role"] };
  until?: string;
}

/**
 * One day of the human club's staff contracts: whoever is past the end leaves (any day); on Monday,
 * contracts within RENEW_WINDOW_DAYS get one decision (director renews or lets go; the manager gets a warning).
 */
export function staffContractDay(a: {
  staff: StaffRecord; date: string; monday: boolean; seasonEnd: string;
  directorHandles: boolean; impliedStars: number; clubFactor: number;
}): { staff: StaffRecord; left: StaffMember[]; news: StaffContractNews[] } {
  const news: StaffContractNews[] = [];
  const left: StaffMember[] = [];
  const kept: StaffMember[] = [];
  const tag = (m: StaffMember) => ({ id: m.id, name: m.name, role: m.role });
  for (const m of a.staff.members) {
    const c = m.contract;
    if (c && a.date > c.until) { left.push(m); news.push({ kind: "staff_left", member: tag(m) }); continue; }
    if (!c || !a.monday || c.decision || daysBetween(a.date, c.until) > C.RENEW_WINDOW_DAYS) { kept.push(m); continue; }
    if (!a.directorHandles) {
      kept.push({ ...m, contract: { ...c, decision: "warned" } });
      news.push({ kind: "staff_expiring", member: tag(m), until: c.until });
    } else if (directorRenews(m, a.impliedStars)) {
      const next = renewedContract(m, { date: a.date, seasonEnd: a.seasonEnd, years: C.DIRECTOR_YEARS, clubFactor: a.clubFactor });
      if (next) { kept.push({ ...m, contract: next }); news.push({ kind: "staff_renewed", member: tag(m), until: next.until }); }
      else { kept.push({ ...m, contract: { ...c, decision: "leave" } }); news.push({ kind: "staff_leaving", member: tag(m), until: c.until }); }
    } else {
      kept.push({ ...m, contract: { ...c, decision: "leave" } });
      news.push({ kind: "staff_leaving", member: tag(m), until: c.until });
    }
  }
  const ids = new Set(kept.map((m) => m.id));
  const areaAssignments = a.staff.areaAssignments
    ? Object.fromEntries(Object.entries(a.staff.areaAssignments).filter(([, id]) => ids.has(id!)))
    : undefined;
  return { staff: { members: kept, ...(areaAssignments ? { areaAssignments } : {}) }, left, news };
}
```
Confira o caso do teste "renova por 2 anos" (`until` 2027-12-06 + 2 = 2029-12-06 ≤ base 2027-12-06 + 2 → ok) e "3 anos" (2030 > 2029 → null).

- [ ] **Step 4: Rodar** → PASS. Commit `feat(comissão): contratos, multa e renovação`.

---

### Task 9: Rotas da comissão

**Files:** Rewrite `src/backend/staffRoutes.ts`; Create `src/backend/staff.routes.test.ts` (substitui o teste de rotas de staff existente, se houver — `grep -rln "staff/market" src`); Modify `src/backend/scoutingRoutes.ts` (remover as rotas de mercado/contratação de olheiro de campo; o `fire` de olheiro cai no geral), `src/index.ts` (se as rotas de olheiro forem registradas à parte), `src/Domain/finance/ledgerText.ts`.

Rotas (todas `requireSaveOwner`; escrita com `withSaveLock`; desempregado → 409 `noClub`):

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/staff` | `{ members: (StaffMember & { stars, starsByArea })[], areas: { area, stars, mult, memberId? }[], limits: Record<StaffRole, { used, max }>, effects, weeklyTotal }` |
| `GET /api/saves/:id/staff/pool?role=&minStars=&maxWage=&sort=&offset=&limit=` | `searchPool` no fator do clube; 400 em parâmetro inválido |
| `POST /api/saves/:id/staff/hire { memberId, years }` | 400 `invalidYears`; 404 `notInPool`; 409 `roleFull` (`roleLimit`); assina (`signContract` com `seasonEnd` da liga do clube), tira da lista, grava squad + lista |
| `POST /api/saves/:id/staff/fire { memberId }` | 404 `notYourStaff`; multa via `recordMoney(..., { kind: "staff", amount: -multa, label: "Staff severance", ref: { stage: "severance" } })` só se > 0; volta à lista; olheiro de campo: cancela a missão dele (mesma função que a rota antiga de olheiro usava) |
| `POST /api/saves/:id/staff/renew { memberId, years }` | 400 `tooManyYears` (`renewedContract` null) |
| `PUT /api/saves/:id/staff/areas { [area]: memberId \| null }` | 400 área desconhecida, membro que não é treinador, mais de 2 áreas por treinador; grava `areaAssignments` |

- [ ] **Step 1: Teste** (`staff.routes.test.ts`, mesmo molde de `src/backend/facilities.routes.test.ts`: cria save de teste, chama as rotas): dono do save (403); `GET /staff` com a comissão inicial (10 membros num MEDIUM, limites); `GET /pool?role=coach&minStars=3` só treinadores ≥ 3★; contratar um 4º treinador num MEDIUM → 409 `roleFull`; demitir um treinador → 200, linha `staff` `severance` negativa no extrato, soma do extrato = saldo, o treinador está na lista; contratar outro da lista com `years: 2` → contrato até 2 temporadas, salário = `staffWageFor`; `years: 4` → 400; `PUT /areas` com `{ setPieces: <id> }` → `GET /staff` mostra o escolhido; 3 áreas para o mesmo → 400; `renew` de 3 anos num contrato de 3 → 400 `tooManyYears`.
- [ ] **Step 2: Rodar** → FAIL. **Step 3:** implementar (a linha de extrato usa a temporada do extrato como as outras rotas que chamam `recordMoney`, ex. `facilityRoutes.ts`). `ledgerText.ts`: `case "staff": return { key: ref?.stage === "severance" ? "staffSeverance" : "staff" }` (respeitar o formato atual da função).
- [ ] **Step 4: Rodar** — `bun test src/backend/staff.routes.test.ts src/backend/scouting.routes.test.ts src/Domain/finance` → PASS. Commit `feat(comissão): rotas de lista, contratação, demissão, renovação e áreas`.

---

### Task 10: Avanço do dia, carreira nova, troca de clube

**Files:** Modify `src/backend/advanceDay.ts`, `src/Domain/advanceDay/financial.ts`, `src/backend/SaveService.ts`, `src/backend/jobWorld.ts`, `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxEvents.ts`; Create `src/backend/staff.advanceDay.test.ts`.

- [ ] **Step 1: Teste** (`staff.advanceDay.test.ts`): save de teste; força um membro com `until` = hoje + 30 numa segunda e o diretor responsável → depois do dia, renovado e mensagem `contract`/`staff_renewed`; com `responsibilities: { contracts: "manager" }` → `staff_expiring` uma vez; membro com `until` < hoje → saiu, está em `staffPool.json`, mensagem `staff_left`; a linha `staff` da segunda = soma dos contratos; avançar até a virada do país do jogador → `staffPool.json` com a temporada nova e 300 membros.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementação**
  - `inboxTypes.ts`: `ContractInboxMessage.kind` ganha `"staff_expiring" | "staff_renewed" | "staff_leaving" | "staff_left"` e `staff?: { id: string; name: string; role: StaffRole }[]` (os `players` ficam `[]`). Tópico `contracts` já cobre a categoria (`inboxTopics.ts` sem mudança). `buildStaffContractMessage(news[], date)` em `inboxEvents.ts` (uma mensagem por kind no dia, fallback em inglês).
  - `advanceDay.ts`: logo depois de `applyDirectorDay` (clube humano empregado), `staffContractDay({ staff, date: currentDate, monday, seasonEnd: <fim da liga do clube>, directorHandles: directorHandlesContracts(meta.responsibilities), impliedStars: impliedStars(squad), clubFactor: wageFactorOf(squad) })`; grava o squad se mudou; `left` volta à lista (`returnToPool`); mensagens em `deferredContractMessages`-like (depois do `clearInbox`). Na virada do país do clube do jogador: `refreshPool(pool, saveId, String(novoAno), currentDate)`.
  - `financial.ts`: `squadStaffWages(playerSquad.staff)` (sem fator).
  - `SaveService.createSave`: `initialStaff(id, squad, { date: meta.startDate ?? <data inicial>, seasonEnd })` e `writeStaffPool(id, generatePool(id, <ano da liga>, startDate))`.
  - `jobWorld.takeOverClub`: `initialStaff(key, squad, { date: args.date, seasonEnd })`; `releaseHumanClub` já remove `staff` (a comissão fica no clube, não vai à lista) — só confira e deixe um comentário.
- [ ] **Step 4: Rodar** — `bun test src/backend/staff.advanceDay.test.ts src/backend/jobs.test.ts src/backend/responsibilities.routes.test.ts src/Domain/advanceDay` → PASS. Commit `feat(comissão): contratos no avanço do dia e lista renovada na virada`.

---

### Task 11: Olheiros sobre a comissão nova

**Files:** Modify `src/backend/scoutingRoutes.ts`, `src/backend/scoutingWorld.ts`, `src/GameInterface/Scouting/*` (painel de olheiros de campo), tests `src/backend/scouting.routes.test.ts`.

- [ ] Chefe = `headOf(squad, "scout")`, nota `effectiveRating(squad, "scout")` (idêntica à de hoje para a mesma nota); olheiros de campo = `membersOf(squad, "fieldScout")` com nota `ratingFromStars(memberStars(s))` no ganho da missão (`scoutingWorld.ts` linha do `Map(... s.rating)`).
- [ ] O painel de olheiros de campo perde "Contratar" e ganha o botão "Buscar olheiros" → `/transfers?tab=staff&role=fieldScout`; "Dispensar" chama `POST /staff/fire`.
- [ ] `bun test src/backend/scouting.routes.test.ts src/Domain/scouting src/Domain/staff` → PASS (testes que contratavam olheiro pelo mercado passam a pegar da lista). Commit `refactor(olheiros): olheiros de campo vêm da lista da comissão`.

---

### Task 12: Tela Equipe técnica

**Files:** Rewrite `src/GameInterface/StaffScreen.tsx`; Create `src/GameInterface/Staff/StaffStars.tsx`, `Staff/StaffCard.tsx`, `Staff/StaffDetailModal.tsx`, `Staff/TrainingAreasPanel.tsx`, `Staff/staffApi.ts`; Modify `src/GameInterface/Icons.tsx` (`star-half` → `StarHalf` do lucide), `src/i18n/locales/en.json`, `pt-BR.json`.

- [ ] Título "SUA **COMISSÃO**" / "COACHING **STAFF**" (`screenTitles.staff.*`), `SegmentedTabs` Comissão | Responsabilidades (a aba de Responsabilidades fica como está).
- [ ] Cartões por grupo (spec §7) com `StaffStars`, idade, contrato ("até 12/2028 · €12.300/sem"), efeito em uma linha ("Área Físico ×1,06 · recuperação ×1,02"); função vaga = cartão tracejado "Vago" + "Buscar".
- [ ] `TrainingAreasPanel`: tabela `TABLE_STYLE` com as 7 áreas (rótulos `staff.area.*`: Goleiros, Defesa, Ataque, Técnica, Tática, Físico, Bola parada), responsável, estrelas, multiplicador (`text-primary`; vaga `text-destructive` "×0,4 vaga"); nas 5 áreas de campo um `SelectCombobox` com os treinadores (`PUT /staff/areas`), "Automático" volta ao automático (`null`).
- [ ] `StaffDetailModal`: 5 atributos em barras `StatBar` 1–20 (rótulos `staff.attr.*`), estrelas por área (treinador), contrato; Renovar com `OptionChips` 1/2/3 anos (desabilita os que dão 400 pelo cálculo do cliente: mesmo `renewedContract`); Demitir com `ConfirmDialog` mostrando a multa (`severanceOf`).
- [ ] Rodapé: "Folha semanal: €X" e botão "Buscar profissionais" → `/transfers?tab=staff`.
- [ ] `bun run ui:audit --hard` limpo e sem leves nos arquivos novos; `bun test src/GameInterface`. Commit `feat(comissão): tela da equipe técnica com áreas de treino`.

---

### Task 13: Aba Comissão em Transferências

**Files:** Modify `src/GameInterface/TransfersScreen.tsx`; Create `src/GameInterface/Transfers/StaffPoolTab.tsx`, `Transfers/HireStaffModal.tsx`; i18n.

- [ ] Nova aba `{ key: "staff", label: t("transfers.staffTab") }` ("Comissão"), aberta por `?tab=staff` (e `&role=`).
- [ ] Filtros: `OptionChips` de função (Todas + 9), `OptionChips` de estrelas mínimas (Qualquer, 2★, 3★, 4★, 4,5★), campo de salário máximo (rótulo acima), ordenação (`SegmentedTabs compact`: Estrelas / Salário / Idade). Busca `GET /staff/pool` com "Carregar mais".
- [ ] Tabela `TABLE_STYLE`: nome (abre o `StaffDetailModal` em modo lista), função, idade, estrelas, "forte em" (área de mais estrelas, treinador), salário pedido (coluna em destaque). "Contratar" → `HireStaffModal`: anos 1/2/3, salário congelado, uso do limite ("Treinadores 3/3" → botão desligado com o motivo), erro traduzido (`roleFull`, `noClub`).
- [ ] `bun run ui:audit --hard`; commit `feat(comissão): busca de profissionais na aba Comissão de Transferências`.

---

### Task 14: Finanças, `/lab`, `/test`

**Files:** Modify `src/GameInterface/FinancesScreen.tsx` (projeção `squadStaffWages(squad.staff)`; texto `staffSeverance`), `src/lab/types.ts` (`staffRating` → `fitnessCoachStars?: number`), `src/lab/balanceWorker.ts`, `src/lab/components/VariantEditor.tsx` (slider 0 = tier, 1–5 passo 0,5, rótulo `3.5★`), `src/GameInterface/EnergyPanel.tsx` (sem mudança de lógica; conferir), `src/GameInterface/TestScreen.tsx` (tipo `dpWeights` já é `Record<string, number>`; conferir que o painel lista as 7 chaves).

- [ ] `bun test src/lab src/GameInterface`; abrir `/lab` e `/test` no servidor de lab (`bun run lab` ou o script do `package.json`) e conferir o slider e o painel. Commit `chore(comissão): finanças, lab e test com a comissão nova`.

---

### Task 15: Custo da comissão (medição)

**Files:** Create `scripts/staff-bill.ts`.

- [ ] Para cada clube do mundo (`src/Data/squads`): folha de hoje (3 profissionais na nota implícita, `staffWeeklyWage` × 3) e a nova (`squadStaffWages(initialStaff(...))`), por tier: mediana de folha/receita (`wageRevenueBasisOf`) e razão nova/hoje.
- [ ] Aceite (spec §4, Ponto aberto 2): mediana da folha nova ≤ 4% da receita anual e razão nova/hoje ≤ 1,8 em todo tier. Se não fechar, ajuste **só** `STAFF.WAGE_ROLE_SHARE` e anote o resultado em `staff.md`. Commit `chore(comissão): medição da folha da comissão`.

---

### Task 16: Smoke, regras, changelog, versão

**Files:** Modify `scripts/season-rollover-smoke.ts`, `.claude/rules/game/staff.md`, `development.md`, `scouting.md` (olheiros de campo pela lista), `injuries.md` (médico), `style-training.md` (analista), `responsibilities.md` (o diretor também renova a comissão), `docs/ROADMAP.md` (31a ✅), `src/GameInterface/changelog/changelog.ts` (CRLF), `package.json`.

- [ ] **Smoke**, seção "Equipe técnica" (substitui a atual; spec §10): no começo, o smoke (diretor responsável, padrão) força um membro com `until` dentro da temporada; demite um treinador pela rota no primeiro mês e contrata outro da lista. Confere no fim: todas as funções preenchidas e treinadores ≤ limite; nenhum contrato com `until` < data final; o membro forçado foi renovado (`staff_renewed`) ou avisado; linha `staff` `severance` < 0 e o demitido em `staffPool.json`; extrato = saldo (já existe); nenhum clube da IA com `staff`; o goleiro titular do clube do jogador com `reflex` ou `jump` diferente do início; linha `staff` de cada segunda = soma dos contratos naquele dia (ler o squad antes do dia, como as outras seções).
- [ ] Rodar `bun scripts/season-rollover-smoke.ts` (~15 min, sozinho na máquina) e `bun test` completo.
- [ ] Regras: `staff.md` reescrita (funções, estrelas, curvas, áreas, limites, contratos, lista, rotas, telas, `/lab` `/test`, medições); `development.md` seção "Áreas de treino (4.7)" com `CATEGORY_STATS`, `dpWeightsFor`, tabela de pesos e as medições da Task 6.
- [ ] Changelog: entrada **4.7** (data do dia) com itens pt/en ("Comissão técnica completa: preparador de goleiros, treinadores de área, médico, analista e jardineiro, com estrelas, atributos e contratos", "Sete áreas de treino: o goleiro passa a evoluir reflexo e impulsão; força e fôlego também evoluem", "Busque profissionais livres na aba Comissão de Transferências"); em `upcoming`, trocar o item da comissão por "Rostos da equipe técnica e avatar do seu técnico" / "Staff faces and your manager avatar". `package.json` `"version": "4.7"`. `bun test src/GameInterface/changelog`.
- [ ] `git diff --stat` (nenhum arquivo convertido inteiro). Commit `chore: 4.7 — comissão técnica completa (31a)`.
