# Continentais — Plano 2: domínio e integração com o save

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Champions League, Europa League, Libertadores e Sul-Americana existem em todo save: vagas
por zona/coeficiente, sorteio de grupos, datas, fase de grupos + mata-mata em ida e volta (agregado
do Plano 1), campeão, virada por continente e start kits.

**Architecture:** mesmo molde das copas (`src/Domain/cups/`, `src/backend/cupWorld.ts`): cada
competição mora em `saves/{id}/leagues/{ucl|uel|lib|sud}/` com `meta.kind = "continental"`, fora
de `activeLeagues`; lógica pura em `src/Domain/continental/`; E/S em
`src/backend/continentalWorld.ts`; o avanço do dia joga pelo `date-index`.

**Tech Stack:** Bun, TypeScript, `bun:test`.

Spec: `docs/superpowers/specs/2026-09-26-continental-competitions-design.md` (seções 1 e 2). Plano 1
(agregado + #2) já na branch `feat/continental`. Regras: imports `@/`; commits com
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca mate todos os processos `bun`;
`git add` só com caminhos explícitos; nunca commite `src/Data`.

**Ajuste consciente da spec (datas):** "≥ 3 dias entre jogos do mesmo clube" tornaria impossível a
terça depois do domingo de liga. A regra implementada: uma data continental é inválida se **algum
clube participante** joga (liga ou copa) no **dia anterior, no mesmo dia ou no dia seguinte** — ou
seja, sempre ≥ 2 dias entre jogos de um clube, como no futebol real.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/types/calendarTypes.ts` | `ContinentalMetaData`, `LeagueSeasonMeta.kind` aceita `"continental"` |
| `src/Domain/continental/competitions.ts` (+ teste) | catálogo das 4 competições, `isContinentalSlug`, `isKnockoutCompetitionSlug` |
| `src/Domain/continental/slots.ts` (+ teste) | vagas por país |
| `src/Domain/continental/qualify.ts` (+ teste) | quem pega as vagas |
| `src/Domain/continental/groupDraw.ts` (+ teste) | sorteio de grupos com potes e regra de país |
| `src/Domain/continental/groupTable.ts` (+ teste) | tabela do grupo com confronto direto |
| `src/Domain/continental/continentalDates.ts` (+ teste) | 13 datas por competição |
| `src/Domain/continental/generateContinental.ts` (+ teste) | meta + rodadas dos grupos + date-index |
| `src/Domain/continental/knockout.ts` (+ teste) | cruzamento das oitavas, sorteio livre, fixtures de ida/volta, vencedor do confronto |
| `src/Domain/continental/continentalProgress.ts` (+ teste) | avanço: agregado na volta, próxima fase, campeão |
| `src/backend/continentalWorld.ts` (+ teste) | E/S: coeficientes, ranking, geração, avanço |
| `src/backend/SaveService.ts` | `createSave` gera as continentais |
| `src/backend/advanceDay.ts` | joga/avança/regenera as continentais |
| `src/backend/startKits.ts` | kits guardam as continentais |
| `scripts/season-rollover-smoke.ts` | checagens |
| `.claude/rules/game/continental.md` | **novo** — documentação |

---

### Task 1: tipos e catálogo

**Files:** `src/types/calendarTypes.ts`; Create `src/Domain/continental/competitions.ts` + teste.

- [ ] **Step 1: Tipos** — em `calendarTypes.ts`:

```ts
export type ContinentalSlug = "ucl" | "uel" | "lib" | "sud";
export type ContinentalStageName = "group" | "r16" | "qf" | "sf" | "final";

export interface ContinentalStage {
  name:   ContinentalStageName;
  /** RoundFixtures file numbers of this stage (group: 6, r16/qf/sf: 2 (leg 1, leg 2), final: 1). */
  rounds: number[];
  dates:  string[];
  drawn:  boolean;
}

export interface ContinentalMetaData {
  competition: ContinentalSlug;
  continent:   "Europe" | "South America";
  /** A–H, 4 clubs each, pot order (pot 1 first). */
  groups:      { name: string; clubs: string[] }[];
  stages:      ContinentalStage[];
  /** Club → leagueData country, for draw restrictions and display. */
  countryOf:   Record<string, string>;
  /** Club strength (quickSim teamLevel) at generation — pots and "stronger side". */
  level:       Record<string, number>;
  championId:  string | null;
}
```

  Em `LeagueSeasonMeta`: `kind?: "cup" | "continental";` e `continental?: ContinentalMetaData;`.

- [ ] **Step 2: Catálogo** — `src/Domain/continental/competitions.ts`:

```ts
import type { ContinentalSlug } from "@/types/calendarTypes";

export interface ContinentalCompetition {
  slug: ContinentalSlug;
  continent: "Europe" | "South America";
  /** The first-tier competition of the continent (true) or the second (false). */
  primary: boolean;
  /** 0=Sun … 6=Sat. */
  weekday: number;
  /** Zone id in leagueData that grants a place. */
  zoneIds: string[];
}

export const CONTINENTAL: Record<ContinentalSlug, ContinentalCompetition> = {
  ucl: { slug: "ucl", continent: "Europe", primary: true, weekday: 2, zoneIds: ["ucl"] },
  uel: { slug: "uel", continent: "Europe", primary: false, weekday: 4, zoneIds: ["uel", "uecl"] },
  lib: { slug: "lib", continent: "South America", primary: true, weekday: 3, zoneIds: ["lib"] },
  sud: { slug: "sud", continent: "South America", primary: false, weekday: 4, zoneIds: ["sud"] },
};

export const CONTINENTAL_SLUGS = Object.keys(CONTINENTAL) as ContinentalSlug[];

export function isContinentalSlug(slug: string): slug is ContinentalSlug {
  return slug in CONTINENTAL;
}

/** Competitions of a continent, primary first. */
export function competitionsOf(continent: "Europe" | "South America"): ContinentalCompetition[] {
  return CONTINENTAL_SLUGS.map((s) => CONTINENTAL[s]).filter((c) => c.continent === continent)
    .sort((a, b) => Number(b.primary) - Number(a.primary));
}
```

  Teste: `isContinentalSlug("ucl")` true, `("cup_england")` false; `competitionsOf("Europe")` →
  `["ucl","uel"]`.

- [ ] **Step 3:** `bunx tsc --noEmit -p .`, `bun test src/Domain/continental`; commit
  (`feat(continental): types and competition catalogue`).

---

### Task 2: vagas por país

**Files:** Create `src/Domain/continental/slots.ts` + teste.

Regras (spec §1): 32 vagas por competição. Países com zona recebem as vagas das zonas; os demais são
ordenados pelo coeficiente (desc, desempate pelo nome) e recebem vagas pela regra de cada continente;
um país nunca recebe mais vagas do que clubes disponíveis (clubes da liga de nível 1).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { allocateSlots, type CountrySlotInput } from "@/Domain/continental/slots";

const europe: CountrySlotInput[] = [
  { country: "England", coefficient: 5.2, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
  { country: "Germany", coefficient: 5.1, clubs: 18, zoneSlots: { primary: 4, secondary: 2 } },
  { country: "Spain", coefficient: 5.1, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
  { country: "Italy", coefficient: 5.0, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
  { country: "France", coefficient: 4.9, clubs: 18, zoneSlots: { primary: 3, secondary: 2 } },
  ...Array.from({ length: 28 }, (_, i) => ({ country: `C${String(i).padStart(2, "0")}`, coefficient: 4.5 - i * 0.05, clubs: 12 })),
];

describe("allocateSlots — Europe", () => {
  const s = allocateSlots("Europe", europe);
  test("32 per competition", () => {
    const sum = (k: "primary" | "secondary") => Object.values(s).reduce((n, v) => n + v[k], 0);
    expect(sum("primary")).toBe(32);
    expect(sum("secondary")).toBe(32);
  });
  test("zones respected; 13 best others get one primary each", () => {
    expect(s.England).toEqual({ primary: 4, secondary: 2 });
    expect(s.France).toEqual({ primary: 3, secondary: 2 });
    expect(s.C00!.primary).toBe(1);
    expect(s.C12!.primary).toBe(1);
    expect(s.C13!.primary).toBe(0);
  });
  test("every non-zone country gets a secondary place before anyone gets a second one", () => {
    const others = Object.entries(s).filter(([c]) => c.startsWith("C"));
    expect(others.every(([, v]) => v.secondary >= 0)).toBe(true);
    expect(others.filter(([, v]) => v.secondary === 0).length === 0 || others.every(([, v]) => v.secondary <= 1)).toBe(true);
  });
});

describe("allocateSlots — South America", () => {
  const sa: CountrySlotInput[] = [
    { country: "Brazil", coefficient: 4.6, clubs: 20, zoneSlots: { primary: 6, secondary: 6 } },
    { country: "Argentina", coefficient: 4.4, clubs: 28 },
    ...["Colombia", "Uruguay", "Chile", "Paraguay", "Peru", "Venezuela"].map((c, i) => ({ country: c, coefficient: 4 - i * 0.1, clubs: 16 })),
  ];
  const s = allocateSlots("South America", sa);
  test("Brazil 6, Argentina 6, others 4,4,3,3,3,3", () => {
    expect(s.Brazil).toEqual({ primary: 6, secondary: 6 });
    expect(s.Argentina).toEqual({ primary: 6, secondary: 6 });
    expect([s.Colombia, s.Uruguay, s.Chile, s.Paraguay, s.Peru, s.Venezuela].map((v) => v!.primary)).toEqual([4, 4, 3, 3, 3, 3]);
    expect([s.Colombia, s.Uruguay, s.Chile, s.Paraguay, s.Peru, s.Venezuela].map((v) => v!.secondary)).toEqual([4, 4, 3, 3, 3, 3]);
  });
  test("a country with too few clubs passes its places on", () => {
    const tiny = allocateSlots("South America", sa.map((c) => (c.country === "Venezuela" ? { ...c, clubs: 2 } : c)));
    expect(tiny.Venezuela!.primary + tiny.Venezuela!.secondary).toBeLessThanOrEqual(2);
    expect(Object.values(tiny).reduce((n, v) => n + v.primary, 0)).toBe(32);
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar**

```ts
export interface CountrySlotInput {
  country: string;
  /** Mean club level of the country's top league. */
  coefficient: number;
  /** Clubs available in the country's top league. */
  clubs: number;
  /** Fixed places from leagueData zones (the big leagues / Brazil). */
  zoneSlots?: { primary: number; secondary: number };
}

export type SlotTable = Record<string, { primary: number; secondary: number }>;

const PER_COMPETITION = 32;
const SA_OTHERS_PATTERN = [4, 4, 3, 3, 3, 3];
const ARGENTINA_SA = 6;

/**
 * Places per country for the continent's two competitions (32 each). Zone countries keep their
 * zone places; the rest go by coefficient (desc, then name). A country never gets more places
 * (primary + secondary) than clubs in its top league; leftovers go to the next country in order.
 */
export function allocateSlots(continent: "Europe" | "South America", countries: CountrySlotInput[]): SlotTable {
  const out: SlotTable = {};
  for (const c of countries) out[c.country] = { primary: c.zoneSlots?.primary ?? 0, secondary: c.zoneSlots?.secondary ?? 0 };
  const others = countries.filter((c) => !c.zoneSlots)
    .sort((a, b) => b.coefficient - a.coefficient || a.country.localeCompare(b.country));
  const room = (c: CountrySlotInput) => c.clubs - out[c.country]!.primary - out[c.country]!.secondary;
  const used = (k: "primary" | "secondary") => Object.values(out).reduce((n, v) => n + v[k], 0);

  const give = (k: "primary" | "secondary", c: CountrySlotInput, n: number) => {
    const g = Math.max(0, Math.min(n, room(c), PER_COMPETITION - used(k)));
    out[c.country]![k] += g;
  };
  /** Fill `k` to 32 walking `order` round-robin, one place at a time, respecting room. */
  const fill = (k: "primary" | "secondary", order: CountrySlotInput[]) => {
    for (let guard = 0; used(k) < PER_COMPETITION && guard < 1000; guard++) {
      const before = used(k);
      for (const c of order) { if (used(k) >= PER_COMPETITION) break; give(k, c, 1); }
      if (used(k) === before) break; // nobody has room
    }
  };

  if (continent === "Europe") {
    // Primary: one place to each of the best others until 32.
    for (const c of others) { if (used("primary") >= PER_COMPETITION) break; give("primary", c, 1); }
    fill("primary", others);
    // Secondary: one each (by coefficient) to countries without a primary first, then to those with one.
    const noPrimary = others.filter((c) => out[c.country]!.primary === 0);
    const withPrimary = others.filter((c) => out[c.country]!.primary > 0);
    for (const c of [...withPrimary, ...noPrimary]) { if (used("secondary") >= PER_COMPETITION) break; give("secondary", c, 1); }
    fill("secondary", others);
  } else {
    const arg = others.find((c) => c.country === "Argentina");
    const rest = others.filter((c) => c !== arg);
    for (const k of ["primary", "secondary"] as const) {
      if (arg) give(k, arg, ARGENTINA_SA);
      rest.forEach((c, i) => give(k, c, SA_OTHERS_PATTERN[i] ?? 0));
      fill(k, arg ? [arg, ...rest] : rest);
    }
  }
  return out;
}
```

  (Europa: o teste "every non-zone country gets a secondary…" confere que ninguém tem 2ª vaga
  secundária enquanto outro país sem zona tem 0. Ajuste a asserção se a sua leitura da regra for
  mais precisa — a regra da spec: 1 para quem teve primária, depois 1 para os demais pela ordem, e a
  2ª só depois de todos terem 1.)

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** (`feat(continental): places per country`).

---

### Task 3: quem pega as vagas

**Files:** Create `src/Domain/continental/qualify.ts` + teste.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { pickQualifiers } from "@/Domain/continental/qualify";

describe("pickQualifiers", () => {
  test("primary first by ranking, then secondary; no club twice", () => {
    const q = pickQualifiers(
      { England: { primary: 2, secondary: 1 }, Wales: { primary: 0, secondary: 1 } },
      { England: ["a", "b", "c", "d"], Wales: ["w1"] },
    );
    expect(q.primary).toEqual(["a", "b"]);
    expect(q.secondary).toEqual(["c", "w1"]);
  });
  test("short ranking just yields fewer clubs", () => {
    const q = pickQualifiers({ X: { primary: 2, secondary: 2 } }, { X: ["x1", "x2", "x3"] });
    expect(q.primary).toEqual(["x1", "x2"]);
    expect(q.secondary).toEqual(["x3"]);
  });
});
```

- [ ] **Step 2–4: Implementar e passar**

```ts
import type { SlotTable } from "@/Domain/continental/slots";

/** Clubs for the primary and secondary competitions: each country's ranking, primary places first. */
export function pickQualifiers(
  slots: SlotTable,
  rankingByCountry: Record<string, string[]>,
): { primary: string[]; secondary: string[] } {
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const country of Object.keys(slots).sort()) {
    const ranking = rankingByCountry[country] ?? [];
    const { primary: p, secondary: s } = slots[country]!;
    primary.push(...ranking.slice(0, p));
    secondary.push(...ranking.slice(p, p + s));
  }
  return { primary, secondary };
}
```

- [ ] **Step 5: Commit** (`feat(continental): qualifiers from country rankings`).

---

### Task 4: sorteio dos grupos

**Files:** Create `src/Domain/continental/groupDraw.ts` + teste.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { drawGroups } from "@/Domain/continental/groupDraw";
import { mulberry32 } from "@/Domain/rng";

const clubs = Array.from({ length: 32 }, (_, i) => ({
  id: `c${i}`, country: ["England", "Spain", "Italy", "Germany", "France", "Portugal", "Netherlands", "Turkey"][i % 8]!, level: 6 - i * 0.05,
}));

describe("drawGroups", () => {
  const groups = drawGroups(clubs, mulberry32(1));
  test("8 groups of 4, every club once", () => {
    expect(groups).toHaveLength(8);
    expect(groups.every((g) => g.clubs.length === 4)).toBe(true);
    expect(new Set(groups.flatMap((g) => g.clubs)).size).toBe(32);
  });
  test("one club per pot per group (pot = rank by level / 8)", () => {
    const rank = new Map([...clubs].sort((a, b) => b.level - a.level).map((c, i) => [c.id, Math.floor(i / 8)]));
    for (const g of groups) expect(g.clubs.map((id) => rank.get(id)).sort()).toEqual([0, 1, 2, 3]);
  });
  test("no two clubs of the same country in a group", () => {
    const country = new Map(clubs.map((c) => [c.id, c.country]));
    for (const g of groups) expect(new Set(g.clubs.map((id) => country.get(id))).size).toBe(4);
  });
  test("deterministic", () => expect(drawGroups(clubs, mulberry32(7))).toEqual(drawGroups(clubs, mulberry32(7))));
  test("fewer than 32 clubs throws", () => expect(() => drawGroups(clubs.slice(0, 31), mulberry32(1))).toThrow());
});
```

- [ ] **Step 2–4: Implementar e passar**

```ts
export interface DrawClub { id: string; country: string; level: number }
export interface DrawnGroup { name: string; clubs: string[] }

const GROUP_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * 32 clubs → 8 groups of 4. Pots by level (desc, then id). Each group takes one club per pot and no
 * two clubs of the same country. Pot by pot, clubs are shuffled and placed by backtracking so the
 * country rule never dead-ends; if it can't be satisfied at all, the rule is dropped for that pot.
 */
export function drawGroups(clubs: DrawClub[], rng: () => number): DrawnGroup[] {
  if (clubs.length !== 32) throw new Error(`drawGroups: need 32 clubs, got ${clubs.length}`);
  const sorted = [...clubs].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const pots = [0, 1, 2, 3].map((p) => sorted.slice(p * 8, p * 8 + 8));
  const groups: DrawClub[][] = GROUP_NAMES.map(() => []);

  const shuffle = <T>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
    return a;
  };

  for (const pot of pots) {
    const order = shuffle(pot);
    const place = (i: number, strict: boolean): boolean => {
      if (i === order.length) return true;
      const club = order[i]!;
      for (let g = 0; g < 8; g++) {
        const grp = groups[g]!;
        if (grp.length !== pots.indexOf(pot)) continue; // one per pot
        if (strict && grp.some((c) => c.country === club.country)) continue;
        grp.push(club);
        if (place(i + 1, strict)) return true;
        grp.pop();
      }
      return false;
    };
    if (!place(0, true)) place(0, false);
  }
  return groups.map((g, i) => ({ name: GROUP_NAMES[i]!, clubs: g.map((c) => c.id) }));
}
```

- [ ] **Step 5: Commit** (`feat(continental): group draw with pots and country rule`).

---

### Task 5: tabela do grupo

**Files:** Create `src/Domain/continental/groupTable.ts` + teste.

- [ ] **Step 1: Teste** — 4 clubes, fixtures jogadas; confere pontos/saldo e o desempate por confronto
  direto (dois clubes com mesmos pontos, saldo e gols pró: vence quem ganhou o jogo entre eles):

```ts
import { describe, expect, test } from "bun:test";
import { groupTable } from "@/Domain/continental/groupTable";
import type { Fixture } from "@/types/calendarTypes";

const f = (home: string, away: string, h: number, a: number): Fixture => ({
  id: `${home}-${away}`, date: "2026-09-15", competition: "ucl", round: 1, home, away, played: true, result: { home: h, away: a },
});

describe("groupTable", () => {
  test("points, goal difference, head-to-head", () => {
    const fx = [f("a", "b", 1, 0), f("b", "a", 1, 1), f("c", "d", 0, 0), f("d", "c", 0, 0),
                f("a", "c", 0, 1), f("c", "a", 0, 0), f("b", "d", 2, 0), f("d", "b", 0, 1),
                f("a", "d", 2, 1), f("d", "a", 0, 1), f("b", "c", 1, 0), f("c", "b", 1, 0)];
    const t = groupTable(["a", "b", "c", "d"], fx);
    expect(t.map((r) => r.squadId)).toEqual(["a", "b", "c", "d"]);
    expect(t[0]!.pts).toBe(11);
  });
  test("unplayed fixtures are ignored", () => {
    const t = groupTable(["a", "b"], [{ ...f("a", "b", 3, 0), played: false, result: null }]);
    expect(t.every((r) => r.pts === 0)).toBe(true);
  });
});
```

  (Recalcule os pontos do primeiro teste antes de rodar e ajuste a expectativa se errei a conta — a
  ordem esperada precisa refletir as regras.)

- [ ] **Step 2–4: Implementar e passar**

```ts
import type { Fixture } from "@/types/calendarTypes";

export interface GroupRow { squadId: string; mp: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number }

function tally(clubs: string[], fixtures: Fixture[]): Map<string, GroupRow> {
  const rows = new Map(clubs.map((id) => [id, { squadId: id, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }]));
  for (const fx of fixtures) {
    if (!fx.played || !fx.result) continue;
    const h = rows.get(fx.home), a = rows.get(fx.away);
    if (!h || !a) continue;
    const { home: hg, away: ag } = fx.result;
    h.mp++; a.mp++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) { h.w++; a.l++; h.pts += 3; } else if (hg < ag) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga;
  return rows;
}

/** Group standings: points, goal difference, goals for, then head-to-head (points, gd) among the tied, then id. */
export function groupTable(clubs: string[], fixtures: Fixture[]): GroupRow[] {
  const rows = [...tally(clubs, fixtures).values()];
  const key = (r: GroupRow) => `${r.pts}|${r.gd}|${r.gf}`;
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  const out: GroupRow[] = [];
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j < rows.length && key(rows[j]!) === key(rows[i]!)) j++;
    const tied = rows.slice(i, j);
    if (tied.length > 1) {
      const ids = tied.map((r) => r.squadId);
      const h2h = tally(ids, fixtures.filter((f) => ids.includes(f.home) && ids.includes(f.away)));
      tied.sort((a, b) => {
        const x = h2h.get(a.squadId)!, y = h2h.get(b.squadId)!;
        return y.pts - x.pts || y.gd - x.gd || a.squadId.localeCompare(b.squadId, undefined, { numeric: true });
      });
    }
    out.push(...tied);
    i = j;
  }
  return out;
}
```

- [ ] **Step 5: Commit** (`feat(continental): group standings with head-to-head`).

---

### Task 6: datas

**Files:** Create `src/Domain/continental/continentalDates.ts` + teste.

13 datas: 6 de grupos + oitavas (2) + quartas (2) + semi (2) + final (1).
- **Europa**, temporada que começa em `Y` (as ligas europeias): grupos em `[Y-09-15, Y-12-15]`;
  mata-mata em `[(Y+1)-02-10, end − 7 dias]` (`end` = maior fim das ligas europeias de nível 1).
- **América do Sul**, temporada `Y`: grupos em `[Y-03-01, Y-05-31]`; mata-mata em
  `[Y-07-15, end − 7 dias]`.
- Em cada janela, as datas se espalham por igual e vão para o `weekday` da competição mais próximo;
  uma data é inválida se cair em `busy` (dia anterior, mesmo dia ou dia seguinte a um jogo de um
  participante) ou a menos de 6 dias da data continental anterior; procura semanas vizinhas (±3) e,
  se nada servir, aceita o alvo mesmo; nunca sai da janela nem volta no tempo (mesmo esquema do
  `scheduleStageDates` das copas, com a mesma proteção de janela curta).

- [ ] **Step 1: Teste** — para Europa `Y = 2026`, `end = 2027-05-24`, `weekday = 2`, `busy` vazio:
  13 datas, crescentes, as 6 primeiras dentro de set–dez 2026, as 7 últimas entre 2027-02-10 e
  2027-05-17, todas terça; com `busy` contendo toda terça de setembro, nenhuma data de setembro é
  terça ocupada; para América do Sul `Y = 2027`, `end = 2027-12-05`: grupos em mar–mai, mata-mata
  jul–nov.
- [ ] **Step 2–4: Implementar** `continentalDates(continent, seasonYear, end, weekday, busy: Set<string>): string[]`
  reaproveitando a lógica de `src/Domain/cups/cupDates.ts` — extraia de lá um helper comum
  `spreadOnWeekday(lo, hi, count, weekday, busy, minGapDays)` em `src/Domain/calendar/spreadDates.ts`
  e faça `scheduleStageDates` usá-lo (os testes das copas precisam continuar passando **sem
  mudança**).
- [ ] **Step 5: Commit** (`feat(continental): stage dates; shared weekday spreader`).

---

### Task 7: gerar a competição

**Files:** Create `src/Domain/continental/generateContinental.ts` + teste.

- [ ] **Step 1: Teste** — com 32 clubes de 8 países (como no Task 4), `generateContinental({ slug:
  "ucl", year: 2026, clubs, dates: 13 datas, seedKey })`:
  - `meta.kind === "continental"`, `totalRounds === 13`, 8 grupos, `stages` =
    group(rounds 1–6), r16(7–8), qf(9–10), sf(11–12), final(13); só `group` com `drawn: true`;
  - rodadas 1–6: 16 jogos cada; cada par de um grupo se enfrenta duas vezes (uma em cada casa);
    ninguém joga duas vezes na mesma rodada;
  - rodadas 7–13 existem com `fixtures: []`;
  - `dateIndex[datas[i]] = [i + 1]`;
  - determinístico pelo `seedKey`.
- [ ] **Step 2–4: Implementar**
  - grupos via `drawGroups` (rng `mulberry32(seedFrom(`${seedKey}:groups`))`, `seedFrom` de
    `@/Domain/cups/cupIds`);
  - calendário do grupo (4 clubes `[p1, p2, p3, p4]` na ordem de pote), rodadas:
    `1: p1-p4, p2-p3; 2: p3-p1, p4-p2; 3: p1-p2, p3-p4; 4: p4-p1, p3-p2; 5: p1-p3, p2-p4; 6: p2-p1, p4-p3`
    (cada par joga 1 vez em cada casa);
  - ids `${slug}_${year}_r${round}_${n}`; `competition: slug`;
  - `meta.continental = { competition, continent, groups, stages, countryOf, level, championId: null }`;
    `start` = 1ª data, `end` = última.
- [ ] **Step 5: Commit** (`feat(continental): generate a season (group stage drawn)`).

---

### Task 8: mata-mata

**Files:** Create `src/Domain/continental/knockout.ts` + teste.

- [ ] **Step 1: Teste**
  - `drawRoundOf16(winners, runnersUp, groupOf, countryOf, rng)`: 8 pares; cada par 1º × 2º; nunca
    mesmo grupo nem mesmo país (com backtracking; se impossível, relaxa país); determinístico;
  - `drawFree(ids, rng)`: pares aleatórios;
  - `twoLegFixtures(slug, year, stage, ties, dates)`: para cada par `{ first, second }` (o `second`
    faz a volta em casa): ida `home = first` em `dates[0]`, volta `home = second` em `dates[1]`,
    mesmo `tieId`, `leg` 1/2, volta com `knockout: true`; final (1 data) jogo único `knockout` +
    `neutral`;
  - `tieWinner(leg1, leg2)`: agregado; empatado → `leg2.decider.penalties`; null se incompleto.
- [ ] **Step 2–4: Implementar** (funções puras; nas oitavas o `second` é o 1º colocado — ele faz a
  volta em casa; nas quartas/semi, `second` sorteado).
- [ ] **Step 5: Commit** (`feat(continental): knockout draws, two-legged fixtures, tie winner`).

---

### Task 9: andamento

**Files:** Create `src/Domain/continental/continentalProgress.ts` + teste.

`advanceContinental(meta, roundsById: Map<number, Fixture[]>, playedRound: number, seedKey)` →
`{ meta, writes: RoundFixtures[], championId? } | null`:
1. rodada 6 completa (todos os grupos) → tabela de cada grupo (`groupTable`), 1º e 2º → sorteia
   oitavas (`drawRoundOf16`) → fixtures das rodadas 7 e 8 (`twoLegFixtures`).
2. rodada de ida (7, 9, 11) completa → grava na volta o `aggregate` de cada confronto (gols da ida
   do ponto de vista da volta: `aggregate.home` = gols que o mandante da volta fez na ida).
3. rodada de volta (8, 10, 12) completa → vencedores (`tieWinner`) → sorteia a próxima fase
   (`drawFree`; a semi gera a final em 13 com jogo único neutro).
4. rodada 13 completa → campeão.
Nada a fazer → `null`.

- [ ] **Step 1: Teste** — simula uma competição inteira com resultados aleatórios determinísticos
  (preenchendo `played`/`result`, e `decider.penalties` quando o agregado empata) e confere: 16
  classificados, 8 confrontos nas oitavas sem mesmo grupo, agregado gravado nas voltas, 1 campeão.
- [ ] **Step 2–4: Implementar e passar.**
- [ ] **Step 5: Commit** (`feat(continental): stage progression and champion`).

---

### Task 10: E/S (`continentalWorld.ts`) e `createSave`

**Files:** Create `src/backend/continentalWorld.ts` (+ teste de integração); Modify
`src/backend/SaveService.ts` (`createSave`, depois do bloco das copas).

- [ ] **Step 1: `continentalWorld.ts`**
  - `clubLevel(squad)`: `teamLevel(teamStrength(xi, roles))` com `autoLineupDefaultFormation` e
    `slotRoles(formationForSimId(DEFAULT_SIM_FORMATION_ID))` (XI na ordem dos slots).
  - `topLeagueOf(country, catalog, pyramids)`: a liga de nível 1 do país (pirâmide; sem pirâmide, a
    única liga do país no catálogo).
  - `rankingOf(service, saveId, league, prevYear, index)`: tabela final do arquivo
    `readLeagueSeasonArchive(saveId, league, prevYear)` se existir; senão os clubes da liga por
    `clubLevel` desc.
  - `createContinentalSeason({ service, saveId, continent, year, index, catalog, pyramids })`:
    coeficientes (média do `clubLevel` da liga de nível 1), `zoneSlots` a partir das zonas do
    `leagueData` da liga de nível 1 (conta posições `from..to` das zonas `ucl`/`uel`+`uecl`/`lib`/`sud`),
    `allocateSlots`, `pickQualifiers`, `busy` (datas ±1 dia de todas as fixtures de liga e copa dos
    participantes — `getAllFixturesForLeague` nas ligas e copas envolvidas — **mais a data de toda
    fase de copa ainda não sorteada** (`meta.cup.stages[].date`, ±1 dia) das copas dos países dos
    participantes, porque só a fase 1 da copa tem fixtures na geração), `continentalDates`,
    `generateContinental` para as duas competições do continente (weekdays diferentes; um clube nunca
    está nas duas), grava com o mesmo esquema do `writeCup`.
  - `seasonYear`/`end` do continente: **Europa** usa só as ligas europeias de nível 1 que cruzam o ano
    (`season` "YYYY-YY"; as de ano civil — Suécia, Noruega, Finlândia… — ficam de fora da janela e do
    ano); **América do Sul** usa as ligas de nível 1 sul-americanas. `continentalDates` ainda limita o
    mata-mata a (Y+1)-05-31 (Europa) e Y-11-30 (América do Sul).
  - Depois de `pickQualifiers`, se alguma competição não tiver exatamente 32 clubes, lance erro (cai
    no try/catch por continente).
  - `advanceContinentalStages(service, saveId, playedRounds)`: para cada competição continental com
    rodadas jogadas hoje, lê meta e rodadas e aplica `advanceContinental`, gravando o resultado;
    devolve as mudanças (para a inbox do Plano 3).
- [ ] **Step 2: `createSave`** — depois das copas: `createContinentalSeason` para "Europe" (ano = ano
  das ligas europeias) e "South America" (ano = ano das ligas sul-americanas), cada um com try/catch
  próprio (logando o continente).
- [ ] **Step 3: Teste de integração** (`src/backend/continentalWorld.test.ts`): cria um save; as 4
  competições existem com 32 clubes, grupos sorteados, rodadas 1–6 com 16 jogos; nenhum clube em
  duas continentais; nenhum jogo continental em dia (±1) de liga/copa de um participante.
- [ ] **Step 4:** `bunx tsc --noEmit -p .` e o teste; commit
  (`feat(continental): save I/O; new careers get continental competitions`).

---

### Task 11: avanço do dia e virada

**Files:** Modify `src/backend/advanceDay.ts`.

- [ ] **Step 1:** onde o código trata `isCupSlug` (sem tabela, modo de simulação, jogo pulado com
  `logError`), trate também `isContinentalSlug` da mesma forma (helper local
  `isKnockoutComp = (s) => isCupSlug(s) || isContinentalSlug(s)` para "sem tabela" e "modo de
  simulação"; o modo "full" continua só com clube da liga do jogador).
- [ ] **Step 1b: volta sem agregado** — antes de simular uma fixture com `leg === 2` sem `aggregate`,
  calcule-o da ida jogada (`withAggregate`) e registre `logError("continental", …)`: o passo da ida
  pode ter falhado, e sem agregado o motor decidiria prorrogação/pênaltis com o total errado.
- [ ] **Step 2:** depois de `advanceCupStages`, chame `advanceContinentalStages` com as rodadas
  continentais jogadas hoje (`continentalChanges`, guardado para o Plano 3).
- [ ] **Step 3: Virada por continente** — no bloco de regeneração das copas (roda com
  `due.units.length > 0 || due.resync.length > 0`): para cada continente, se todas as ligas de nível
  1 **que definem a temporada do continente** (Europa: só as que cruzam o ano; América do Sul: todas)
  têm `year` > `meta.year` da competição primária do continente, arquive
  as duas competições (`writeLeagueSeasonArchive` com título do campeão — reaproveite
  `buildCupArchive`, que já monta arquivo sem tabela) e chame `createContinentalSeason` com o ano
  novo. Faça num helper puro `continentsToRegenerate(states, compYear)` em
  `src/Domain/continental/continentalProgress.ts` (+ teste), no mesmo molde de
  `countriesToRegenerate`.
- [ ] **Step 4: Teste** em `continentalWorld.test.ts`: força `currentDate` para a data da rodada 1 da
  Champions, `advanceOneDay`, e confere as 16 fixtures jogadas.
- [ ] **Step 5:** `bun test src/backend` e `bunx tsc --noEmit -p .`; commit
  (`feat(continental): advance day plays, progresses and regenerates continentals`).

---

### Task 12: start kits, smoke, documentação

- [ ] **Step 1:** `startKits.ts` `buildKitWorld`: inclui os slugs `isContinentalSlug` junto com as copas.
- [ ] **Step 2:** `scripts/season-rollover-smoke.ts`: seção "Continentais" — as 4 existem com 32 clubes;
  nenhum clube em duas; nenhum clube com dois jogos na mesma data entre todas as competições (a
  checagem que já existe cobre, se incluir os slugs continentais); nenhum jogo continental no passado
  sem jogar; a Champions 2026 tem campeão e a de 2027 foi gerada na virada europeia com arquivo de 1
  título.
- [ ] **Step 3:** rode o smoke (~15 min) → tudo PASS.
- [ ] **Step 4:** regenere os start kits (`cp src/example_data/roles.json src/Data/roles.json`,
  `bun run kits:generate 5`, copie para `src/example_data/startKits/`), e confira no kit-1 que as
  rodadas de grupo da Champions/Europa League antes de 2027-02-05 estão todas jogadas.
- [ ] **Step 5:** `.claude/rules/game/continental.md` (português, estilo de `cups.md`): o que foi
  construído, com as regras de vagas, datas (ajuste ±1 dia), sorteios, agregado, virada, kits, smoke
  e o que fica para o Plano 3.
- [ ] **Step 6:** `bunx tsc --noEmit -p .` e `bun test`; commits
  (`feat(continental): kits, smoke checks, docs` e `data: regenerate start kits with continentals`).
