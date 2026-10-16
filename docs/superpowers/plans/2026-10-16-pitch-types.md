# Tipos de grama, padrão de corte e gramado desgastado — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tipo de grama (natural/híbrida/sintética) com efeito no desgaste, na lesão e no custo; padrão de corte visual; e o campo da partida desenhado conforme a condição do gramado do dia.

**Architecture:** Regras puras em `src/Domain/facilities/turf.ts` (tipo, multiplicadores, sorteio da IA) usadas pelo desgaste diário, pelas obras e por `matchPitch` (`pitch.ts`), que passa `{ condition, turf, mowing }` para a partida (motor, quickSim, ao vivo). O desenho sai de uma função pura em `src/GraficsEngine/pitchSurface.ts` (formas em jardas), consumida pelo `PixiPitch` (desenhado uma vez, como as listras de hoje) e por um SVG na prévia e na tela Clube.

**Tech Stack:** Bun + TypeScript, React 19, Pixi v8, Tailwind v4, i18next. Spec: `docs/superpowers/specs/2026-10-16-pitch-types-design.md`.

**Regras do projeto:** imports sempre `@/…`; sem migração de save; ícones só por `Icons.tsx`; UI segue `.claude/rules/ui-standard.md` (`bun run ui:audit` limpo); texto em en e pt-BR.

**Desvio consciente do spec:** o gramado é desenhado num `Graphics` estático (desenhado uma vez, refeito só quando o gramado muda), como as listras de hoje, em vez de `generateTexture`: geometria estática já não custa nada por quadro além do próprio desenho, e o bake da torcida existe porque ela tem milhares de formas.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `src/types/facilityTypes.ts` | `TurfType`, `MowingPattern`; `FacilityItem.turf?`, `ClubFacilities.mowing?`; `FacilityKind` + `"turf"`; `FacilityProject.turf?`; `FacilityRequest` turf |
| `src/Domain/facilities/facilityConfig.ts` | `FACILITIES.TURF` |
| `src/Domain/facilities/turf.ts` (+ teste) | **novo**: listas, guards, multiplicadores, `aiTurfOf`, `aiMowingOf`, `clubTurf`, `clubMowing`, `pitchInjury` |
| `src/Domain/facilities/facilityItems.ts` | `wearDay` × desgaste do tipo no `stadiumPitch` |
| `src/Domain/facilities/facilities.ts` | cotação, início e entrega da obra `turf`; `applyCompletion` preserva o tipo |
| `src/Domain/facilities/pitch.ts` (+ teste) | `matchPitch`, `aiPitchCondition(tier, fraction, turf)` |
| `src/Domain/advanceDay/matches.ts`, `quickSim.ts`, `src/GameEngine/Domain/SimulateMatch.ts` | `turf` na lesão |
| `src/backend/advanceDay.ts` | `matchPitch` nos jogos; entrega `turf_changed` + torcida |
| `src/backend/facilityRoutes.ts` | pedido `turf`, `PUT .../facilities/mowing`, view com `turf`/`mowing`/cotações |
| `src/backend/routes.ts` | `match-setup` → `pitch` |
| `src/types/inboxTypes.ts`, `src/Domain/facilities/facilityMessages.ts`, `src/GameInterface/InboxScreen.tsx` | `turf_changed` |
| `src/GraficsEngine/pitchSurface.ts` (+ teste) | **novo**: faixa visual, formas do corte e do desgaste, recorte |
| `src/GraficsEngine/pitchStyle.ts` | `PITCH_WEAR` |
| `src/GraficsEngine/PixiPitch.tsx` | prop `pitch`, desenho da superfície, linhas com alfa/tracejado |
| `src/GameInterface/Components/PitchSurfaceSvg.tsx` | **novo**: o mesmo desenho em SVG (prévia, tela Clube) |
| `src/GameInterface/Facilities/TurfCard.tsx` | **novo**: cartão "Gramado" |
| `src/GameInterface/Facilities/facilitiesApi.ts`, `FacilitiesView.tsx` | dados e o cartão |
| `src/GameInterface/MatchPreviewScreen.tsx`, `MatchScreen.tsx` | mini campo, linha "Grama híbrida · 62%", lesão e desenho ao vivo |
| `src/GameInterface/TestScreen.tsx` | chips Turf e Mowing |
| `src/lab/types.ts`, `balanceWorker.ts`, `scenarioRunner.ts`, `labNames.ts`, `components/VariantEditor.tsx`, `components/PairDetail.tsx` | `Variant.turf` |
| `src/i18n/locales/en.json`, `pt-BR.json` | textos |
| `scripts/injury-calibrate.ts`, `scripts/facilities-wear.ts` | medições |
| `.claude/rules/game/facilities.md`, `graphics-engine.md`, `injuries.md` | regras |
| `src/GameInterface/changelog/changelog.ts`, `package.json` | 4.28 |

---

### Task 1: Tipos e constantes

**Files:**
- Modify: `src/types/facilityTypes.ts`
- Modify: `src/Domain/facilities/facilityConfig.ts` (dentro do objeto `FACILITIES`, depois de `AI_PITCH`)

- [ ] **Step 1: Tipos.** Em `src/types/facilityTypes.ts`:

```ts
/** Grass of the stadium pitch (`docs/superpowers/specs/2026-10-16-pitch-types-design.md`). */
export type TurfType = "natural" | "hybrid" | "synthetic";
/** Mowing pattern of the stadium pitch: drawing only. */
export type MowingPattern = "stripes" | "checker" | "diagonal" | "circles";

/** What a project builds. One project per kind (per item for item projects) at a time. */
export type FacilityKind = "stand" | "comfort" | "training" | "academy" | "repair" | "rebuild" | "upgrade" | "turf";
```

Em `FacilityItem`, depois de `alert?`:

```ts
  /** Stadium pitch only: the grass; absent = natural. */
  turf?: TurfType;
```

Em `FacilityProject` e `CompletedFacilityProject`, depois de `to?`:

```ts
  /** Turf projects: the grass laid on completion. */
  turf?: TurfType;
```

Em `ClubFacilities`, depois de `record?`:

```ts
  /** Mowing pattern of the stadium pitch (drawing only); absent = stripes. */
  mowing?: MowingPattern;
```

Em `FacilityRequest`, acrescente o caso:

```ts
  | { kind: "turf"; turf: TurfType };
```

- [ ] **Step 2: Constantes.** Em `facilityConfig.ts`, depois de `AI_PITCH: {...},`:

```ts
  /**
   * Grass of the stadium pitch (spec 2026-10-16-pitch-types): daily wear of the stadium pitch × WEAR_MULT,
   * injury risk of both sides in a home game × INJURY_MULT, the turf works cost the pitch's rebuild value ×
   * COST_MULT; laying synthetic grass costs the fans SYNTHETIC_FANS. AI clubs: a fixed grass by id (AI_SHARE).
   */
  TURF: {
    WEAR_MULT: { natural: 1, hybrid: 0.6, synthetic: 0.25 },
    INJURY_MULT: { natural: 1, hybrid: 1, synthetic: 1.1 },
    COST_MULT: { natural: 1, hybrid: 1.5, synthetic: 1 },
    SYNTHETIC_FANS: -4,
    AI_SHARE: {
      LOW: { hybrid: 0, synthetic: 0.1 },
      MEDIUM: { hybrid: 0.15, synthetic: 0 },
      HIGH: { hybrid: 0.5, synthetic: 0 },
      ELITE: { hybrid: 0.5, synthetic: 0 },
    },
  },
```

- [ ] **Step 3: Tipos compilam.** Run: `bunx tsc --noEmit 2>&1 | grep -v DecisionTree.ts | head -20`. Expected: só erros de `Record<FacilityKind, …>` faltando `turf` (ex. `NAME` em `facilityMessages.ts`). Corrija cada um acrescentando a chave `turf` (em `facilityMessages.ts`: `turf: "grass change",`). Rode de novo até ficar só o erro antigo de `DecisionTree.ts:750`.

- [ ] **Step 4: Commit**

```bash
git add src/types/facilityTypes.ts src/Domain/facilities/facilityConfig.ts src/Domain/facilities/facilityMessages.ts
git commit -m "feat(turf): tipos de grama e padrão de corte (tipos e constantes)"
```

---

### Task 2: Regras puras do tipo de grama (`turf.ts`)

**Files:**
- Create: `src/Domain/facilities/turf.ts`
- Test: `src/Domain/facilities/turf.test.ts`

- [ ] **Step 1: Teste que falha.**

```ts
import { describe, expect, test } from "bun:test";
import {
  TURF_TYPES, MOWING_PATTERNS, aiMowingOf, aiTurfOf, clubMowing, clubTurf, isMowingPattern, isTurfType,
  pitchInjury, turfInjuryMult, turfWearMult,
} from "@/Domain/facilities/turf";
import { pitchInjuryMult } from "@/Domain/facilities/facilityItems";
import type { Squad } from "@/types/playerTypes";

describe("turf", () => {
  test("guards", () => {
    expect(TURF_TYPES).toEqual(["natural", "hybrid", "synthetic"]);
    expect(MOWING_PATTERNS).toEqual(["stripes", "checker", "diagonal", "circles"]);
    expect(isTurfType("hybrid")).toBe(true);
    expect(isTurfType("grass")).toBe(false);
    expect(isMowingPattern("circles")).toBe(true);
    expect(isMowingPattern(3)).toBe(false);
  });

  test("multipliers; absent = natural", () => {
    expect(turfWearMult(undefined)).toBe(1);
    expect(turfWearMult("hybrid")).toBe(0.6);
    expect(turfWearMult("synthetic")).toBe(0.25);
    expect(turfInjuryMult("synthetic")).toBe(1.1);
    expect(turfInjuryMult("natural")).toBe(1);
    expect(pitchInjury(90, undefined)).toBe(1);
    expect(pitchInjury(20, "synthetic")).toBeCloseTo(pitchInjuryMult(20) * 1.1, 10);
  });

  test("AI grass: deterministic, and the shares by tier", () => {
    expect(aiTurfOf("33", "HIGH")).toBe(aiTurfOf("33", "HIGH"));
    const ids = Array.from({ length: 4000 }, (_, i) => `club_${i}`);
    const share = (tier: "LOW" | "MEDIUM" | "HIGH" | "ELITE", t: string) =>
      ids.filter((id) => aiTurfOf(id, tier) === t).length / ids.length;
    expect(share("HIGH", "hybrid")).toBeGreaterThan(0.45);
    expect(share("HIGH", "hybrid")).toBeLessThan(0.55);
    expect(share("HIGH", "synthetic")).toBe(0);
    expect(share("LOW", "synthetic")).toBeGreaterThan(0.07);
    expect(share("LOW", "synthetic")).toBeLessThan(0.13);
    expect(share("LOW", "hybrid")).toBe(0);
    expect(share("MEDIUM", "hybrid")).toBeGreaterThan(0.12);
    expect(share("MEDIUM", "hybrid")).toBeLessThan(0.18);
  });

  test("AI mowing: deterministic, every pattern used", () => {
    expect(aiMowingOf("33")).toBe(aiMowingOf("33"));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => aiMowingOf(`c${i}`)));
    expect(seen.size).toBe(4);
  });

  test("club turf and mowing: the human club's items, else the AI rule", () => {
    const base = { id: "33", finances: { broadcasting: 300_000_000, commercial: 200_000_000 } } as unknown as Squad;
    expect(clubTurf(base)).toBe(aiTurfOf("33", "ELITE"));
    const human = {
      ...base,
      facilities: { items: { stadiumPitch: { level: 6, wear: 0, turf: "synthetic" } }, mowing: "checker" },
    } as unknown as Squad;
    expect(clubTurf(human)).toBe("synthetic");
    expect(clubMowing(human)).toBe("checker");
    const plain = { ...base, facilities: { items: { stadiumPitch: { level: 6, wear: 0 } } } } as unknown as Squad;
    expect(clubTurf(plain)).toBe("natural");
    expect(clubMowing(plain)).toBe("stripes");
  });
});
```

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/Domain/facilities/turf.test.ts`. Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implementação.** Antes, confira o nome da função de tier: `grep -n "export function financialTierOf" src/Domain/aiFinance/aiClubFinance.ts` (é a que `pitch.ts` já usa). Crie `src/Domain/facilities/turf.ts`:

```ts
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { pitchInjuryMult } from "@/Domain/facilities/facilityItems";
import { livingFacilities } from "@/Domain/facilities/facilities";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";
import type { FinancialTier, Squad } from "@/types/playerTypes";

/**
 * Grass and mowing pattern of a stadium pitch (spec 2026-10-16-pitch-types). The human club stores them on
 * its facilities (`items.stadiumPitch.turf`, `mowing`); AI clubs derive both from the club id, nothing stored.
 */

export const TURF_TYPES: readonly TurfType[] = ["natural", "hybrid", "synthetic"];
export const MOWING_PATTERNS: readonly MowingPattern[] = ["stripes", "checker", "diagonal", "circles"];

export const isTurfType = (v: unknown): v is TurfType => typeof v === "string" && (TURF_TYPES as readonly string[]).includes(v);
export const isMowingPattern = (v: unknown): v is MowingPattern =>
  typeof v === "string" && (MOWING_PATTERNS as readonly string[]).includes(v);

/** Daily wear of the stadium pitch × this (absent = natural). */
export const turfWearMult = (turf: TurfType | undefined): number => F.TURF.WEAR_MULT[turf ?? "natural"];
/** Injury risk of both sides in a home game × this (absent = natural). */
export const turfInjuryMult = (turf: TurfType | undefined): number => F.TURF.INJURY_MULT[turf ?? "natural"];

/** Injury multiplier of a match pitch: its condition (`pitchInjuryMult`) × its grass. 90 / natural = 1. */
export function pitchInjury(condition: number, turf: TurfType | undefined): number {
  return pitchInjuryMult(condition) * turfInjuryMult(turf);
}

/** The grass of an AI club: fixed by its id and tier (`TURF.AI_SHARE`). */
export function aiTurfOf(squadId: string, tier: FinancialTier): TurfType {
  const share = F.TURF.AI_SHARE[tier];
  const r = mulberry32(seedFrom(`turf:${squadId}`))();
  if (r < share.synthetic) return "synthetic";
  if (r < share.synthetic + share.hybrid) return "hybrid";
  return "natural";
}

/** The mowing pattern of an AI club: fixed by its id. */
export function aiMowingOf(squadId: string): MowingPattern {
  const r = mulberry32(seedFrom(`mowing:${squadId}`))();
  return MOWING_PATTERNS[Math.min(MOWING_PATTERNS.length - 1, Math.floor(r * MOWING_PATTERNS.length))]!;
}

/** Grass of a club's stadium: the human club's pitch item, else the AI rule. */
export function clubTurf(squad: Squad): TurfType {
  const f = livingFacilities(squad);
  if (f) return f.items.stadiumPitch.turf ?? "natural";
  return aiTurfOf(squad.id, financialTierOf(squad));
}

/** Mowing pattern of a club's stadium: the human club's choice, else the AI rule. */
export function clubMowing(squad: Squad): MowingPattern {
  const f = livingFacilities(squad);
  if (f) return f.mowing ?? "stripes";
  return aiMowingOf(squad.id);
}
```

Se `livingFacilities` exigir mais campos que o mock do teste (`items` presente basta: confira `src/Domain/facilities/facilities.ts:33`), ajuste o mock do teste, não a função. Se `@/Domain/rng` não exportar `mulberry32`/`seedFrom` com esses nomes, use os do `grep -n "export" src/Domain/rng.ts`.

- [ ] **Step 4: Rode e veja passar.** Run: `bun test src/Domain/facilities/turf.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/facilities/turf.ts src/Domain/facilities/turf.test.ts
git commit -m "feat(turf): regras puras do tipo de grama e do corte"
```

---

### Task 3: Desgaste do gramado pelo tipo

**Files:**
- Modify: `src/Domain/facilities/facilityItems.ts` (`wearDay`, ~linha 120)
- Test: `src/Domain/facilities/facilityItems.test.ts` (acrescentar)

- [ ] **Step 1: Teste que falha.** No fim de `facilityItems.test.ts` (importe `wearDay` se ainda não estiver importado):

```ts
describe("turf wear (spec 2026-10-16)", () => {
  test("the stadium pitch wears × the grass; other items do not change", () => {
    const base = initialItems("33", 3);
    const day = { homeGames: 1, session: "normal" as const, pitchWearMult: 1 };
    const natural = wearDay(base, day).items;
    const hybrid = wearDay({ ...base, stadiumPitch: { ...base.stadiumPitch, turf: "hybrid" } }, day).items;
    const dN = natural.stadiumPitch.wear - base.stadiumPitch.wear;
    const dH = hybrid.stadiumPitch.wear - base.stadiumPitch.wear;
    expect(dH).toBeCloseTo(dN * 0.6, 12);
    expect(hybrid.stadiumPitch.turf).toBe("hybrid");
    expect(hybrid.seats.wear).toBe(natural.seats.wear);
  });
});
```

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/Domain/facilities/facilityItems.test.ts -t "turf wear"`. Expected: FAIL (`dH` igual a `dN`).

- [ ] **Step 3: Implementação.** Em `facilityItems.ts`, importe `import { turfWearMult } from "@/Domain/facilities/turf";` — **atenção ao ciclo**: `turf.ts` importa `facilityItems.ts`. Para evitar, faça a conta direto com a constante, sem importar `turf.ts`:

```ts
/** One day of wear on every item, then the threshold crossings. The stadium pitch × its grass (`TURF.WEAR_MULT`). */
export function wearDay(items: FacilityItems, d: WearDayInput): { items: FacilityItems; crossings: FacilityCrossing[] } {
  const worn = { ...items };
  for (const id of FACILITY_ITEMS) {
    const it = items[id];
    if (!it) continue;
    const turf = id === "stadiumPitch" ? F.TURF.WEAR_MULT[it.turf ?? "natural"] : 1;
    const dw = itemWearToday(id, it.level, d) * turf;
    if (dw > 0) worn[id] = { ...it, wear: it.wear + dw };
  }
  return crossings(worn);
}
```

(`F` já é o `FACILITIES` importado no arquivo; confira o alias no topo.)

- [ ] **Step 4: Rode e veja passar.** Run: `bun test src/Domain/facilities/facilityItems.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/facilities/facilityItems.ts src/Domain/facilities/facilityItems.test.ts
git commit -m "feat(turf): desgaste do gramado do estádio pelo tipo de grama"
```

---

### Task 4: Obra "Trocar grama" (cotação, início, entrega)

**Files:**
- Modify: `src/Domain/facilities/facilities.ts` (`ProjectQuote`, `quoteItemProject`/`quoteProject`, `startProject`, `advanceFacilities` → `done`, `applyCompletion`)
- Test: `src/Domain/facilities/facilities.test.ts` (acrescentar)

- [ ] **Step 1: Teste que falha.** No fim de `facilities.test.ts` (use o construtor de `ClubFacilities` que o arquivo já usa nos testes de reforma; se não houver, monte `{ ...initialFacilities(squad, 3), }` como os testes vizinhos):

```ts
describe("turf works (spec 2026-10-16)", () => {
  const revenue = 100_000_000;
  const ctx = { revenue, seatCost: 3000 };
  const f0 = () => initialFacilities(testSquad(), 3);

  test("quote: the pitch's rebuild value × the grass, rebuild weeks; the current grass is not a quote", () => {
    const f = f0();
    const lv = f.items.stadiumPitch.level;
    const q = quoteProject(f, { kind: "turf", turf: "hybrid" }, ctx)!;
    expect(q).toMatchObject({ kind: "turf", item: "stadiumPitch", turf: "hybrid", to: 100 });
    expect(q.cost).toBe(Math.round(itemValue(revenue, "stadiumPitch", lv) * 1.5));
    expect(q.weeks).toBe(Math.ceil(FACILITIES.ITEMS.stadiumPitch.rebuildWeeks * worksSizeFactor(lv)));
    expect(quoteProject(f, { kind: "turf", turf: "natural" }, ctx)).toBeNull();
    expect(requestGroup({ kind: "turf", turf: "hybrid" })).toBe("stadium");
  });

  test("delivery: new grass at 100%, warnings gone; a later rebuild keeps the grass", () => {
    const worn = { ...f0() };
    worn.items = { ...worn.items, stadiumPitch: { ...worn.items.stadiumPitch, wear: 0.95, condemned: true, alert: 15 } };
    const q = quoteProject(worn, { kind: "turf", turf: "synthetic" }, ctx)!;
    const started = startProject(worn, q, { id: "p1", date: "2027-01-01", boardShare: 0 });
    expect(started.projects[0]!.turf).toBe("synthetic");
    const done = advanceFacilities(started, started.projects[0]!.end);
    expect(done.completed[0]!.turf).toBe("synthetic");
    expect(done.facilities.items.stadiumPitch).toEqual({ level: worn.items.stadiumPitch.level, wear: 0, turf: "synthetic" });
    expect(done.facilities.completed.at(-1)!.turf).toBe("synthetic");

    const pitch = { ...done.facilities.items.stadiumPitch, wear: 0.95, condemned: true as const };
    const again = applyCompletion({ ...done.facilities.items, stadiumPitch: pitch }, {
      id: "p2", kind: "rebuild", item: "stadiumPitch", to: 100, start: "2027-03-01", end: "2027-04-01",
      cost: 1, boardShare: 0, instalments: 1, paid: 1,
    });
    expect(again.stadiumPitch.turf).toBe("synthetic");
  });
});
```

`testSquad()`: use o helper de squad que o arquivo já tem; se não tiver, defina no topo do `describe`:

```ts
const testSquad = () => ({ id: "33", players: [], venue: { name: "S", capacity: 30000 }, finances: { broadcasting: 60_000_000, commercial: 40_000_000, followers: 1_000_000, budget: 0 } }) as unknown as Squad;
```

Importe `itemValue`, `worksSizeFactor`, `requestGroup`, `startProject`, `advanceFacilities`, `applyCompletion`, `quoteProject`, `initialFacilities` de `@/Domain/facilities/facilities` e `FACILITIES` de `@/Domain/facilities/facilityConfig`.

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/Domain/facilities/facilities.test.ts -t "turf works"`. Expected: FAIL.

- [ ] **Step 3: Implementação.** Em `facilities.ts`:

1. `ProjectQuote`: acrescente `turf?: TurfType;` (importe `TurfType` de `@/types/facilityTypes`).
2. Em `quoteProject`, antes do `if (req.kind === "repair" || …)`:

```ts
  if (req.kind === "turf") {
    const it = f.items.stadiumPitch;
    if (!isTurfType(req.turf) || (it.turf ?? "natural") === req.turf) return null;
    return {
      kind: "turf", item: "stadiumPitch", turf: req.turf, to: 100,
      cost: Math.round(itemValue(ctx.revenue, "stadiumPitch", it.level) * F.TURF.COST_MULT[req.turf]),
      weeks: Math.ceil(F.ITEMS.stadiumPitch.rebuildWeeks * worksSizeFactor(it.level)),
    };
  }
```

Importe `isTurfType` de `@/Domain/facilities/turf` — **ciclo**: `turf.ts` importa `facilities.ts` (`livingFacilities`). Para não criar ciclo, faça o guard inline: `if (!(req.turf in F.TURF.COST_MULT) || …)`.

3. `startProject`: acrescente `...(quote.turf ? { turf: quote.turf } : {}),` ao lado de `...(quote.to !== undefined …)`.
4. `advanceFacilities`, no `done`: acrescente `...(p.turf ? { turf: p.turf } : {}),`.
5. `applyCompletion`, ramo `if (p.item)`:

```ts
  if (p.item) {
    const it = items[p.item];
    const level = p.kind === "upgrade" ? Math.min(F.ITEM_MAX_LEVEL, p.level ?? it.level + 1) : it.level;
    // The grass stays with the pitch through repairs and rebuilds; a turf works lays the new one.
    const turf = p.kind === "turf" ? p.turf : it.turf;
    // Repair: the target condition; rebuild / upgrade / turf: 100%. Warnings and the condemnation go.
    return { ...items, [p.item]: { level, wear: wearFor(p.kind === "repair" ? p.to ?? 100 : 100), ...(turf ? { turf } : {}) } };
  }
```

Antes de mudar, confira que `wearFor(100)` devolve `0` (o teste espera `wear: 0`); se devolver outro valor, ajuste o `toEqual` do teste para `wearFor(100)`.

- [ ] **Step 4: Rode e veja passar.** Run: `bun test src/Domain/facilities`. Expected: PASS (inclusive os testes antigos).

- [ ] **Step 5: Commit**

```bash
git add src/Domain/facilities/facilities.ts src/Domain/facilities/facilities.test.ts
git commit -m "feat(turf): obra de troca de grama (cotação, início, entrega)"
```

---

### Task 5: Gramado da partida (`matchPitch`) e a IA

**Files:**
- Modify: `src/Domain/facilities/pitch.ts`
- Test: `src/Domain/facilities/pitch.test.ts` (criar se não existir; senão acrescentar)

- [ ] **Step 1: Teste que falha.**

```ts
import { describe, expect, test } from "bun:test";
import { aiPitchCondition, matchPitch, matchPitchCondition } from "@/Domain/facilities/pitch";
import { aiMowingOf, aiTurfOf } from "@/Domain/facilities/turf";
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import type { Squad } from "@/types/playerTypes";

const ai = { id: "33", finances: { broadcasting: 300_000_000, commercial: 200_000_000 } } as unknown as Squad;
const window = { start: "2026-08-15", end: "2027-05-20" };

describe("matchPitch", () => {
  test("neutral venue: 90, natural, stripes", () => {
    expect(matchPitch(ai, { neutral: true }, window, "2027-01-01")).toEqual({ condition: 90, turf: "natural", mowing: "stripes" });
  });

  test("AI home: its grass and mowing; the season drop × the grass wear", () => {
    const p = matchPitch(ai, {}, window, "2027-05-20");
    const turf = aiTurfOf("33", "ELITE");
    expect(p.turf).toBe(turf);
    expect(p.mowing).toBe(aiMowingOf("33"));
    expect(p.condition).toBeCloseTo(F.AI_PITCH.START.ELITE - F.AI_PITCH.DROP.ELITE * F.TURF.WEAR_MULT[turf], 10);
    expect(matchPitchCondition(ai, {}, window, "2027-05-20")).toBe(p.condition);
  });

  test("aiPitchCondition: natural is the old formula", () => {
    expect(aiPitchCondition("LOW", 1)).toBe(F.AI_PITCH.START.LOW - F.AI_PITCH.DROP.LOW);
    expect(aiPitchCondition("LOW", 1, "synthetic")).toBeCloseTo(F.AI_PITCH.START.LOW - F.AI_PITCH.DROP.LOW * 0.25, 10);
  });

  test("human home: the stadium pitch's condition, grass and mowing", () => {
    const human = {
      ...ai,
      facilities: { items: { stadiumPitch: { level: 6, wear: 0, turf: "hybrid" } }, mowing: "diagonal" },
    } as unknown as Squad;
    expect(matchPitch(human, {}, window, "2027-01-01")).toEqual({ condition: 100, turf: "hybrid", mowing: "diagonal" });
  });
});
```

Se o mock `human` não passar por `livingFacilities`/`conditionOf`, acrescente ao mock os campos que faltarem (ex. `stands: []`, `projects: []`), nunca relaxe a função.

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/Domain/facilities/pitch.test.ts`. Expected: FAIL (`matchPitch` não existe).

- [ ] **Step 3: Implementação.** Reescreva `src/Domain/facilities/pitch.ts`:

```ts
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { conditionOf } from "@/Domain/facilities/facilityItems";
import { livingFacilities, seasonFraction } from "@/Domain/facilities/facilities";
import { clubMowing, clubTurf } from "@/Domain/facilities/turf";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { clamp } from "@/Domain/math";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";
import type { FinancialTier, Squad } from "@/types/playerTypes";

/**
 * Match pitch (`docs/superpowers/specs/2026-10-08-living-facilities-design.md` §3,
 * `2026-10-16-pitch-types-design.md`). Nothing is stored for the AI: its home pitch falls through the
 * season by tier and grass, and is new again the next one.
 */

/** The pitch a match is played on: condition 0..100, grass, mowing pattern. */
export interface MatchPitch {
  condition: number;
  turf: TurfType;
  mowing: MowingPattern;
}

/** AI home pitch: START − DROP × grass wear × fraction of the home club's league window (clamped to 0..1). */
export function aiPitchCondition(tier: FinancialTier, fraction: number, turf: TurfType = "natural"): number {
  const f = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0.5;
  return F.AI_PITCH.START[tier] - F.AI_PITCH.DROP[tier] * F.TURF.WEAR_MULT[turf] * f;
}

export { pitchInjuryMult } from "@/Domain/facilities/facilityItems";

/**
 * The pitch of a fixture: neutral venue → `AI_PITCH.NEUTRAL`, natural, stripes; a home club with the
 * living facilities (the human club) → its stadium pitch; otherwise the AI formula with the home club's
 * tier, grass and the fraction of its league window (no window: the middle of the season).
 */
export function matchPitch(
  home: Squad,
  fixture: { neutral?: boolean },
  window: { start: string; end: string } | undefined | null,
  date: string,
): MatchPitch {
  if (fixture.neutral) return { condition: F.AI_PITCH.NEUTRAL, turf: "natural", mowing: "stripes" };
  const turf = clubTurf(home);
  const mowing = clubMowing(home);
  const f = livingFacilities(home);
  if (f) return { condition: conditionOf(f.items.stadiumPitch), turf, mowing };
  const fraction = window ? seasonFraction(date, window.start, window.end) : 0.5;
  return { condition: aiPitchCondition(financialTierOf(home), fraction, turf), turf, mowing };
}

/** Condition only (`matchPitch(...).condition`). */
export function matchPitchCondition(
  home: Squad,
  fixture: { neutral?: boolean },
  window: { start: string; end: string } | undefined | null,
  date: string,
): number {
  return matchPitch(home, fixture, window, date).condition;
}
```

- [ ] **Step 4: Rode e veja passar.** Run: `bun test src/Domain/facilities`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/facilities/pitch.ts src/Domain/facilities/pitch.test.ts
git commit -m "feat(turf): gramado da partida com tipo e corte; queda da IA pelo tipo"
```

---

### Task 6: Tipo de grama na lesão (motor e quickSim)

**Files:**
- Modify: `src/GameEngine/Domain/SimulateMatch.ts` (`SimulateMatchOptions` ~linha 95, `matchInjuryMults` ~linha 42)
- Modify: `src/Domain/advanceDay/quickSim.ts` (`QuickSimInput` ~linha 104, linha ~878)
- Modify: `src/Domain/advanceDay/matches.ts` (`EngineMatchSim` ~505, `engineMatch` ~540, `buildQuickMatchEvent` sim ~849 e ~867)
- Test: `src/Domain/advanceDay/quickSim.test.ts`, `src/GameEngine/Domain/SimulateMatch.test.ts` (acrescentar)

- [ ] **Step 1: Testes que falham.** Em `SimulateMatch.test.ts` (importe `matchInjuryMults` e use qualquer squad dos testes existentes como `squad`):

```ts
test("matchInjuryMults: synthetic grass × 1.1 on both sides; absent = before", () => {
  const plain = matchInjuryMults(squad, squad, { pitchCondition: 90 });
  const synth = matchInjuryMults(squad, squad, { pitchCondition: 90, turf: "synthetic" });
  expect(synth.A).toBeCloseTo(plain.A * 1.1, 10);
  expect(synth.B).toBeCloseTo(plain.B * 1.1, 10);
  expect(matchInjuryMults(squad, squad, {})).toEqual(matchInjuryMults(squad, squad, { turf: "natural" }));
});
```

Em `quickSim.test.ts`, um teste pareado no estilo dos testes de `pitchCondition` existentes (procure `pitchCondition` no arquivo e copie a montagem de `input` e o laço de sementes):

```ts
test("synthetic grass: more injuries over many seeds, natural = the same draws", () => {
  let natural = 0, synthetic = 0;
  for (let s = 1; s <= 3000; s++) {
    const a = quickSimMatch({ ...input, turf: "natural" }, mulberry32(s)).recording;
    const b = quickSimMatch(input, mulberry32(s)).recording;
    expect(a).toEqual(b);
    natural += b.injuries?.length ?? 0;
    synthetic += quickSimMatch({ ...input, turf: "synthetic" }, mulberry32(s)).recording.injuries?.length ?? 0;
  }
  expect(synthetic).toBeGreaterThan(natural);
});
```

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/GameEngine/Domain/SimulateMatch.test.ts src/Domain/advanceDay/quickSim.test.ts`. Expected: FAIL (erro de tipo/`turf` ignorado).

- [ ] **Step 3: Implementação.**

`SimulateMatch.ts`, em `SimulateMatchOptions` depois de `pitchCondition?`:

```ts
  /** Grass of the match pitch (`matchPitch`); synthetic × `TURF.INJURY_MULT` on both sides. Absent = natural. */
  turf?: TurfType;
```

e `matchInjuryMults`:

```ts
export function matchInjuryMults(
  squadA: Squad, squadB: Squad, options: Pick<SimulateMatchOptions, 'injuryMult' | 'pitchCondition' | 'turf'>,
): { A: number; B: number } {
  const pitch = pitchInjury(options.pitchCondition ?? 90, options.turf);
  return {
    A: (options.injuryMult?.A ?? staffEffectsOf(squadA).injuryMult) * pitch,
    B: (options.injuryMult?.B ?? staffEffectsOf(squadB).injuryMult) * pitch,
  };
}
```

(importe `pitchInjury` de `@/Domain/facilities/turf` e `TurfType` de `@/types/facilityTypes`; o import de `pitchInjuryMult` sai se ficar sem uso.)

`quickSim.ts`: em `QuickSimInput` depois de `pitchCondition?`: `turf?: TurfType;` (com o mesmo comentário), e na linha ~878:

```ts
  const pitchMult = pitchInjury(input.pitchCondition ?? 90, input.turf);
```

`matches.ts`: em `EngineMatchSim` e no tipo `sim` de `buildQuickMatchEvent`, depois de `pitchCondition?`:

```ts
  /** Grass of the pitch (`matchPitch`); absent = natural. */
  turf?: TurfType;
```

e nos dois spreads de opções (`engineMatch` e `quickSimMatch`), depois do de `pitchCondition`:

```ts
      ...(sim.turf ? { turf: sim.turf } : {}),
```

- [ ] **Step 4: Rode e veja passar.** Run: `bun test src/GameEngine/Domain/SimulateMatch.test.ts src/Domain/advanceDay`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/GameEngine/Domain/SimulateMatch.ts src/GameEngine/Domain/SimulateMatch.test.ts src/Domain/advanceDay/quickSim.ts src/Domain/advanceDay/quickSim.test.ts src/Domain/advanceDay/matches.ts
git commit -m "feat(turf): grama sintética aumenta o risco de lesão (motor e quickSim)"
```

---

### Task 7: Avanço do dia (jogos e entrega da obra) e a mensagem

**Files:**
- Modify: `src/types/inboxTypes.ts` (`FacilityInboxMessage`)
- Modify: `src/Domain/facilities/facilityMessages.ts`
- Modify: `src/backend/advanceDay.ts` (~linha 755 e o bloco de instalações ~1856)
- Test: `src/backend/facilities.advanceDay.test.ts` (acrescentar)

- [ ] **Step 1: Mensagem.** Em `inboxTypes.ts`, `FacilityInboxMessage.kind` ganha `| "turf_changed"` e o campo:

```ts
  /** turf_changed: the grass laid. */
  turf?: TurfType;
```

Em `facilityMessages.ts`, `buildFacilityMessage` aceita `turf?: TurfType` nos args, copia para a mensagem (`...(args.turf ? { turf: args.turf } : {})`, ao lado dos campos opcionais existentes) e tem os textos de fallback:

```ts
    : args.kind === "turf_changed" ? `New grass: ${args.turf ?? ""}`
```

(no `subject`) e

```ts
    : args.kind === "turf_changed" ? `The stadium pitch has ${args.turf ?? ""} grass, at 100%`
```

(no `preview`), seguindo a cadeia de ternários existente.

- [ ] **Step 2: Teste que falha.** Em `src/backend/facilities.advanceDay.test.ts`, copie a montagem de um teste existente que entrega uma reforma pelo avanço do dia (procure `"repaired"` no arquivo) e acrescente:

```ts
test("turf works: delivered by the day advance, grass on the pitch, message, fans −4 for synthetic", async () => {
  // …mesma montagem do teste de reforma: save, squad do jogador com facilities…
  const f = squad.facilities!;
  const project = {
    id: "turf1", kind: "turf" as const, item: "stadiumPitch" as const, turf: "synthetic" as const, to: 100,
    start: meta.currentDate!, end: meta.currentDate!, cost: 1000, boardShare: 0, instalments: 1, paid: 1,
  };
  await saveService.saveSquad(meta.id, ref.leagueSlug, ref.clubSlug, { ...squad, facilities: { ...f, projects: [project] } });
  const fansBefore = (await saveService.getSeat(meta.id, meta.seatId))!.board!.fans;
  expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
  const after = (await saveService.getSquad(meta.id, ref.leagueSlug, ref.clubSlug))!;
  expect(after.facilities!.items.stadiumPitch.turf).toBe("synthetic");
  const inbox = await saveService.getInbox(meta.id, meta.seatId);
  expect(inbox.some((m) => m.category === "facilities" && m.kind === "turf_changed" && m.turf === "synthetic")).toBe(true);
  const fansAfter = (await saveService.getSeat(meta.id, meta.seatId))!.board!.fans;
  expect(fansAfter).toBeLessThan(fansBefore);
}, 120_000);
```

(A torcida também muda pela deriva da semana; num dia que não é segunda e sem jogo, a queda só vem da grama. Se a data do save for segunda ou tiver jogo, avance antes um dia para sair dela, como os testes vizinhos fazem.)

- [ ] **Step 3: Rode e veja falhar.** Run: `bun test src/backend/facilities.advanceDay.test.ts -t "turf works"`. Expected: FAIL.

- [ ] **Step 4: Implementação em `advanceDay.ts`.**

Jogos (linha ~755):

```ts
            // Pitch of the home stadium (`src/Domain/facilities/pitch.ts`): condition, grass and mowing.
            const pitch = matchPitch(homeSquad, fixture, activeLeagues.find((l) => l.leagueSlug === homeEntry.leagueSlug), currentDate);
            const pitchCondition = pitch.condition;
            const turf = pitch.turf;
            const referee = await refereeOf(fixture);
            const r = mode === "full"
              ? buildMatchEvent(fixture, homeSquad, awaySquad, { ...sim, pitchCondition, turf, referee })
              : buildQuickMatchEvent(fixture, homeSquad, awaySquad, { ...sim, pitchCondition, turf, referee });
```

(troque o import `matchPitchCondition` por `matchPitch`; se `matchPitchCondition` tiver outro uso no arquivo, mantenha os dois imports.) Confira com `grep -n "buildQuickMatchEvent(\|buildMatchEvent(" src/backend/advanceDay.ts` se há outros chamadores com `pitchCondition` (jogos do clube do jogador gravados ao vivo não passam por aqui) e faça o mesmo neles.

Entrega (bloco `for (const p of day.completed)`, ~linha 1858), antes do `if (p.item)`:

```ts
          if (p.kind === "turf" && p.turf) {
            ds.deferred.facility.push({ date: currentDate, kind: "turf_changed", item: "stadiumPitch", turf: p.turf, condition: 100 });
            // Synthetic grass: the fans dislike it (spec 2026-10-16).
            if (p.turf === "synthetic" && ds.board) ds.board = applyPressEffect(ds.board, 0, FACILITIES.TURF.SYNTHETIC_FANS);
            continue;
          }
```

Importe `applyPressEffect` de `@/Domain/boardFans/boardFans` e `FACILITIES` de `@/Domain/facilities/facilityConfig` se ainda não estiverem. Confira o tipo de `ds.deferred.facility` (`grep -n "facility:" src/backend/daySeats.ts`): se for o tipo dos args de `buildFacilityMessage`, o campo `turf` já entra pelo Step 1; se for outro tipo, acrescente `turf?: TurfType` nele. Confira também que o `ds.board` alterado aqui é gravado no assento no fim do dia (o mesmo caminho de `ds.board = applyWeekly(...)`, linha ~1933).

- [ ] **Step 5: Rode e veja passar.** Run: `bun test src/backend/facilities.advanceDay.test.ts src/backend/facilities.routes.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/inboxTypes.ts src/Domain/facilities/facilityMessages.ts src/backend/advanceDay.ts src/backend/facilities.advanceDay.test.ts src/backend/daySeats.ts
git commit -m "feat(turf): partidas com o tipo de grama; entrega da troca de grama no avanço do dia"
```

---

### Task 8: Rotas (pedido de troca, padrão de corte, view, match-setup)

**Files:**
- Modify: `src/backend/facilityRoutes.ts`
- Modify: `src/backend/routes.ts` (match-setup ~linha 612)
- Test: `src/backend/facilities.routes.test.ts` (acrescentar)

- [ ] **Step 1: Testes que falham.** Em `facilities.routes.test.ts`, usando os helpers do arquivo (dono do save, `board` forçado a 90 como no teste de aprovação existente):

```ts
test("turf: quote in the view, approved request, busy stadium, same grass refused", async () => {
  const view = await (await get(`/api/saves/${saveId}/facilities`)).json();
  expect(view.turf).toBe("natural");
  expect(view.mowing).toBe("stripes");
  expect(view.turfQuotes.natural).toBeNull();
  expect(view.turfQuotes.hybrid).toMatchObject({ kind: "turf", turf: "hybrid", forecast: expect.any(Object) });
  expect((await post(`/api/saves/${saveId}/facilities/request`, { kind: "turf", turf: "natural" })).status).toBe(400);
  expect((await post(`/api/saves/${saveId}/facilities/request`, { kind: "turf", turf: "grass" })).status).toBe(400);
  const ok = await (await post(`/api/saves/${saveId}/facilities/request`, { kind: "turf", turf: "hybrid" })).json();
  expect(ok.approved).toBe(true);
  expect(ok.project).toMatchObject({ kind: "turf", turf: "hybrid", item: "stadiumPitch" });
  const busy = await post(`/api/saves/${saveId}/facilities/request`, { kind: "turf", turf: "synthetic" });
  expect(busy.status).toBe(409);
});

test("mowing: PUT changes the pattern, unknown value 400", async () => {
  expect((await put(`/api/saves/${saveId}/facilities/mowing`, { mowing: "checker" })).status).toBe(200);
  expect((await (await get(`/api/saves/${saveId}/facilities`)).json()).mowing).toBe("checker");
  expect((await put(`/api/saves/${saveId}/facilities/mowing`, { mowing: "zigzag" })).status).toBe(400);
});
```

Se o arquivo não tiver helpers `get`/`post`/`put`, siga o padrão que ele usa para chamar `facilityRoutes[...]` (requisição com cookie do dono) e crie `put` igual ao `post` com `method: "PUT"`.

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/backend/facilities.routes.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementação em `facilityRoutes.ts`.**

`parseFacilityRequest`, antes do `return null` final:

```ts
  if (b.kind === "turf") return isTurfType(b.turf) ? { kind: "turf", turf: b.turf } : null;
```

No `POST .../request`, a checagem de ocupado passa a tratar a troca como pedido de item:

```ts
      const itemRequest = request.kind === "repair" || request.kind === "rebuild" || request.kind === "upgrade" || request.kind === "turf";
      const busyItem = request.kind === "turf" ? "stadiumPitch" : itemRequest ? request.item : null;
      if (busyItem ? itemBusy(f, busyItem) : projectRunning(f, request.kind)) {
        return Response.json({ error: "busy" }, { status: 409 });
      }
```

(TypeScript: `request.item` só existe nos casos com item; o ternário acima evita ler `item` no caso `turf`.) No `!quote`: `const maxed = request.kind === "upgrade" || !itemRequest;` continua certo (turf conta como item → `invalidRequest`). No objeto `what`, acrescente `...(quote.turf ? { turf: quote.turf } : {}),`.

Em `facilitiesView`, no objeto devolvido:

```ts
    /** Grass and mowing of the stadium pitch (spec 2026-10-16-pitch-types). */
    turf: f.items.stadiumPitch.turf ?? "natural",
    mowing: f.mowing ?? "stripes",
    /** The turf works to each grass (null: the current one), with what would happen if requested now. */
    turfQuotes: Object.fromEntries(TURF_TYPES.map((t) => {
      const q = quoteProject(f, { kind: "turf", turf: t }, ctx);
      return [t, q ? { ...q, forecast: forecast(q, money) } : null];
    })),
```

onde `money` é o mesmo objeto passado a `itemsView` (extraia-o para uma `const money = { board: …, balance: …, revenue, committed: committedSpend(f) }` antes do `return` e use nos dois lugares). Confira a assinatura de `forecast` (linha ~101): use exatamente os campos que ela pede.

Nova rota no objeto `facilityRoutes`:

```ts
  /** `PUT { mowing }`: the stadium pitch's mowing pattern (drawing only; free, any time). */
  "/api/saves/:saveId/facilities/mowing": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const mowing = (body as { mowing?: unknown } | null)?.mowing;
    if (!isMowingPattern(mowing)) return Response.json({ error: "invalidRequest" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await loadHuman(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const squad = withFacilities(h.squad, { ...h.squad.facilities!, mowing });
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, squad);
      return Response.json({ mowing, view: await facilitiesView({ ...h, squad }) });
    });
  },
```

Importe `TURF_TYPES`, `isTurfType`, `isMowingPattern` de `@/Domain/facilities/turf`. Confira se a rota nova precisa ser registrada fora do objeto (ex. `src/index.ts` espalha `...facilityRoutes`: `grep -n "facilityRoutes" src/index.ts src/backend/*.ts`) e se o guarda de lobby (`worldLobbyGuard`, `src/backend/worlds/worldLobbyGuard.ts`) deve bloqueá-la: a troca de grama é obra → entra na lista de rotas bloqueadas como as outras de `facilities/request`; o corte é preferência visual → livre.

- [ ] **Step 4: match-setup.** Em `routes.ts` (~linha 612), troque o bloco por:

```ts
    // Pitch of the stadium the match is played in (`src/Domain/facilities/pitch.ts`): condition, grass, mowing.
    let pitch: MatchPitch | null = null;
    if (matchFixture && opponentSquad && matchDate) {
      const homeSquad = matchFixture.home === myInternalId ? mySquad : opponentSquad;
      const homeLeague = (await saveService.getSquadIndex(save.id)).byId(homeSquad.id)?.leagueSlug;
      const window = (save.activeLeagues ?? []).find((l) => l.leagueSlug === homeLeague);
      pitch = matchPitch(homeSquad, matchFixture, window, matchDate);
    }
    const pitchCondition = pitch?.condition ?? null;
```

e na resposta acrescente `pitch,` ao lado de `pitchCondition`. Importe `matchPitch` e `type MatchPitch` de `@/Domain/facilities/pitch`. Confira com `grep -n "pitchCondition" src/backend/routes.ts` que nenhum outro uso precisa mudar.

- [ ] **Step 5: Rode e veja passar.** Run: `bun test src/backend/facilities.routes.test.ts src/backend/worlds`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/backend/facilityRoutes.ts src/backend/routes.ts src/backend/facilities.routes.test.ts src/backend/worlds/worldLobbyGuard.ts src/index.ts
git commit -m "feat(turf): rotas da troca de grama e do padrão de corte; gramado no match-setup"
```

---

### Task 9: Desenho do gramado — função pura

**Files:**
- Create: `src/GraficsEngine/pitchSurface.ts`
- Modify: `src/GraficsEngine/pitchStyle.ts`
- Test: `src/GraficsEngine/pitchSurface.test.ts`

- [ ] **Step 1: Cores.** Em `pitchStyle.ts`, depois de `PITCH_STRIPES`:

```ts
/**
 * Worn-pitch drawing (spec 2026-10-16-pitch-types §3): base colours by band, patches, the synthetic grass.
 * PITCH_COLOR (the canvas background) stays the pristine base.
 */
export const PITCH_WEAR = {
  BASE_FADED: 0x16652f, BASE_WORN: 0x2c6330, BASE_ROTTEN: 0x4a5a2a,
  LIGHT_FADED: 0x197238,
  YELLOW: 0x7f7a3a, DIRT: 0x7e6236, DIRT_DARK: 0x6b4f2a, MUD: 0x5c4124, MUD_DARK: 0x4e3a20, PUDDLE: 0x7a948a,
  SYNTH_BASE: 0x158a44, SYNTH_LIGHT: 0x1c9a50,
} as const;
```

- [ ] **Step 2: Teste que falha.** `src/GraficsEngine/pitchSurface.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { clipToPitch, pitchSurface, pitchVisualBand, type SurfaceShape } from "@/GraficsEngine/pitchSurface";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

const inside = (s: SurfaceShape) => {
  if (s.kind === "rect") return s.x >= 0 && s.y >= 0 && s.x + s.w <= PITCH_LENGTH + 1e-9 && s.y + s.h <= PITCH_WIDTH + 1e-9;
  if (s.kind === "poly") {
    for (let i = 0; i < s.points.length; i += 2) {
      if (s.points[i]! < -1e-9 || s.points[i]! > PITCH_LENGTH + 1e-9) return false;
      if (s.points[i + 1]! < -1e-9 || s.points[i + 1]! > PITCH_WIDTH + 1e-9) return false;
    }
    return true;
  }
  return true; // rings are clipped by the renderer
};

describe("pitchSurface", () => {
  test("bands", () => {
    expect(pitchVisualBand(100)).toBe("pristine");
    expect(pitchVisualBand(70)).toBe("pristine");
    expect(pitchVisualBand(69.9)).toBe("faded");
    expect(pitchVisualBand(40)).toBe("faded");
    expect(pitchVisualBand(39)).toBe("worn");
    expect(pitchVisualBand(15)).toBe("worn");
    expect(pitchVisualBand(14)).toBe("rotten");
  });

  test("pristine stripes = the old drawing (8 light bands of 15), crisp lines", () => {
    const s = pitchSurface({ condition: 95, turf: "natural", mowing: "stripes", seed: "f1" });
    expect(s.shapes.filter((x) => x.kind === "rect")).toHaveLength(7);
    expect(s.lineAlpha).toBe(0.9);
    expect(s.dashedLines).toBe(false);
  });

  test("every pattern draws; mowing fades out at 40; no patches above 70", () => {
    for (const mowing of ["stripes", "checker", "diagonal", "circles"] as const) {
      const pristine = pitchSurface({ condition: 90, turf: "natural", mowing, seed: "f1" });
      expect(pristine.shapes.length).toBeGreaterThan(0);
      expect(pristine.shapes.every((x) => x.layer === "mowing")).toBe(true);
      const worn = pitchSurface({ condition: 30, turf: "natural", mowing, seed: "f1" });
      expect(worn.shapes.some((x) => x.layer === "mowing")).toBe(false);
    }
  });

  test("worn and rotten: patches inside the pitch, deterministic by seed, rotten has puddles and dashed lines", () => {
    const a = pitchSurface({ condition: 25, turf: "natural", mowing: "stripes", seed: "fx" });
    const b = pitchSurface({ condition: 25, turf: "natural", mowing: "stripes", seed: "fx" });
    expect(a).toEqual(b);
    expect(a.shapes.filter((x) => x.layer === "wear").length).toBeGreaterThanOrEqual(5);
    expect(a.shapes.every(inside)).toBe(true);
    const r = pitchSurface({ condition: 5, turf: "natural", mowing: "stripes", seed: "fx" });
    expect(r.shapes.some((x) => x.kind === "poly" && x.color === 0x7a948a)).toBe(true);
    expect(r.dashedLines).toBe(true);
    expect(r.lineAlpha).toBeLessThan(0.6);
  });

  test("synthetic: never patches, its own base", () => {
    const s = pitchSurface({ condition: 5, turf: "synthetic", mowing: "stripes", seed: "fx" });
    expect(s.shapes.some((x) => x.layer === "wear")).toBe(false);
    expect(s.base).toBe(0x158a44);
    expect(s.dashedLines).toBe(false);
  });

  test("clipToPitch keeps a polygon inside", () => {
    const out = clipToPitch([-10, -10, 50, -10, 50, 30, -10, 30]);
    expect(out).toEqual([0, 0, 50, 0, 50, 30, 0, 30]);
  });
});
```

Confira o nome das constantes do tamanho do campo: `grep -n "export const" src/GameEngine/Domain/pitch.ts` (o campo é 115 × 74). Se os nomes forem outros, troque nos dois arquivos.

- [ ] **Step 3: Rode e veja falhar.** Run: `bun test src/GraficsEngine/pitchSurface.test.ts`. Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementação.** `src/GraficsEngine/pitchSurface.ts`:

```ts
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { PITCH_COLOR } from "@/GraficsEngine/playerFaces";
import { PITCH_STRIPES, PITCH_WEAR } from "@/GraficsEngine/pitchStyle";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";

/**
 * The match pitch surface (spec 2026-10-16-pitch-types §3): mowing pattern and wear by the condition of the
 * day, as shapes in engine yards (x 0..115 from the left goal line, y 0..74 from the top touchline). Pure:
 * `PixiPitch` and the SVG previews draw the same shapes. Rings are clipped to the pitch by the renderer.
 */

export type PitchVisualBand = "pristine" | "faded" | "worn" | "rotten";
export type SurfaceShape =
  | { kind: "rect"; layer: "mowing" | "wear"; x: number; y: number; w: number; h: number; color: number; alpha: number }
  | { kind: "poly"; layer: "mowing" | "wear"; points: number[]; color: number; alpha: number }
  | { kind: "ring"; layer: "mowing"; cx: number; cy: number; r: number; width: number; color: number; alpha: number };

export interface PitchSurface {
  /** Fill of the pitch rectangle. */
  base: number;
  shapes: SurfaceShape[];
  /** Alpha of the white lines. */
  lineAlpha: number;
  /** Rotten pitch: straight lines drawn dashed (failing). */
  dashedLines: boolean;
}

export interface PitchSurfaceInput {
  condition: number;
  turf: TurfType;
  mowing: MowingPattern;
  /** Same seed, same patches (the fixture id). */
  seed: string;
}

const L = PITCH_LENGTH;
const W = PITCH_WIDTH;
const CY = W / 2;

export function pitchVisualBand(condition: number): PitchVisualBand {
  if (condition >= 70) return "pristine";
  if (condition >= 40) return "faded";
  if (condition >= 15) return "worn";
  return "rotten";
}

/** Sutherland–Hodgman clip of a polygon (x,y pairs) to the pitch rectangle. */
export function clipToPitch(points: number[]): number[] {
  type P = [number, number];
  let poly: P[] = [];
  for (let i = 0; i < points.length; i += 2) poly.push([points[i]!, points[i + 1]!]);
  const edges: { inside: (p: P) => boolean; cut: (a: P, b: P) => P }[] = [
    { inside: (p) => p[0] >= 0, cut: (a, b) => [0, a[1] + (b[1] - a[1]) * (0 - a[0]) / (b[0] - a[0])] },
    { inside: (p) => p[0] <= L, cut: (a, b) => [L, a[1] + (b[1] - a[1]) * (L - a[0]) / (b[0] - a[0])] },
    { inside: (p) => p[1] >= 0, cut: (a, b) => [a[0] + (b[0] - a[0]) * (0 - a[1]) / (b[1] - a[1]), 0] },
    { inside: (p) => p[1] <= W, cut: (a, b) => [a[0] + (b[0] - a[0]) * (W - a[1]) / (b[1] - a[1]), W] },
  ];
  for (const e of edges) {
    const out: P[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i]!;
      const prev = poly[(i + poly.length - 1) % poly.length]!;
      if (e.inside(cur)) {
        if (!e.inside(prev)) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (e.inside(prev)) {
        out.push(e.cut(prev, cur));
      }
    }
    poly = out;
    if (poly.length === 0) break;
  }
  return poly.flatMap((p) => [p[0], p[1]]);
}

/** Irregular patch elongated along x (goal to goal): a smoothly jittered ellipse, clipped to the pitch. */
function blob(rng: () => number, cx: number, cy: number, rx: number, ry: number): number[] {
  const n = 22;
  const phases = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.16 * Math.sin(2 * a + phases[0]!) + 0.1 * Math.sin(3 * a + phases[1]!) + 0.07 * Math.sin(5 * a + phases[2]!);
    pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  return clipToPitch(pts);
}

function mowingShapes(mowing: MowingPattern, color: number, alpha: number): SurfaceShape[] {
  const out: SurfaceShape[] = [];
  if (mowing === "stripes") {
    const w = L / PITCH_STRIPES.COUNT;
    for (let i = 1; i < PITCH_STRIPES.COUNT; i += 2) out.push({ kind: "rect", layer: "mowing", x: i * w, y: 0, w, h: W, color, alpha });
  } else if (mowing === "checker") {
    const cols = PITCH_STRIPES.COUNT;
    const rows = 10;
    const w = L / cols;
    const h = W / rows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      if ((c + r) % 2 === 1) out.push({ kind: "rect", layer: "mowing", x: c * w, y: r * h, w, h, color, alpha });
    }
  } else if (mowing === "diagonal") {
    const band = 7;
    const slope = Math.tan((35 * Math.PI) / 180);
    const shift = W / slope;
    for (let x0 = -shift; x0 < L; x0 += band * 2) {
      const pts = clipToPitch([x0, W, x0 + band, W, x0 + band + shift, 0, x0 + shift, 0]);
      if (pts.length >= 6) out.push({ kind: "poly", layer: "mowing", points: pts, color, alpha });
    }
  } else {
    for (let r = 9; r < 80; r += 14) out.push({ kind: "ring", layer: "mowing", cx: L / 2, cy: CY, r, width: 7, color, alpha });
  }
  return out;
}

export function pitchSurface(input: PitchSurfaceInput): PitchSurface {
  const band = pitchVisualBand(input.condition);
  const synthetic = input.turf === "synthetic";
  if (synthetic) {
    const alpha = band === "pristine" ? 1 : Math.max(0.35, (input.condition - 0) / 70);
    return { base: PITCH_WEAR.SYNTH_BASE, shapes: mowingShapes(input.mowing, PITCH_WEAR.SYNTH_LIGHT, alpha), lineAlpha: 0.9, dashedLines: false };
  }
  if (band === "pristine") {
    return { base: PITCH_COLOR, shapes: mowingShapes(input.mowing, PITCH_STRIPES.LIGHT, 1), lineAlpha: 0.9, dashedLines: false };
  }
  const rng = mulberry32(seedFrom(`pitch:${input.seed}`));
  const shapes: SurfaceShape[] = [];
  const poly = (points: number[], color: number, alpha: number) => {
    if (points.length >= 6) shapes.push({ kind: "poly", layer: "wear", points, color, alpha });
  };
  if (band === "faded") {
    const t = (input.condition - 40) / 30; // 1 at 70, 0 at 40
    shapes.push(...mowingShapes(input.mowing, PITCH_WEAR.LIGHT_FADED, 0.7 * t));
    const a = 0.45 * (1 - t) + 0.1;
    poly(blob(rng, 6, CY, 9, 11), PITCH_WEAR.YELLOW, a);
    poly(blob(rng, L - 6, CY, 9, 11), PITCH_WEAR.YELLOW, a);
    poly(blob(rng, L / 2, CY, 11, 8), PITCH_WEAR.YELLOW, a);
    return { base: PITCH_WEAR.BASE_FADED, shapes, lineAlpha: 0.85, dashedLines: false };
  }
  if (band === "worn") {
    const k = 0.85 + 0.15 * ((40 - input.condition) / 25); // 0.85 at 40 → 1 at 15
    poly(blob(rng, L / 2, CY, 42 * k, 6 * k), PITCH_WEAR.YELLOW, 0.4);
    poly(blob(rng, 5, CY, 10 * k, 13 * k), PITCH_WEAR.DIRT, 0.85);
    poly(blob(rng, L - 5, CY, 10 * k, 13 * k), PITCH_WEAR.DIRT, 0.85);
    poly(blob(rng, L / 2, CY, 13 * k, 9 * k), PITCH_WEAR.DIRT, 0.75);
    for (let i = 0; i < 4; i++) poly(blob(rng, 15 + rng() * (L - 30), 6 + rng() * (W - 12), 3, 2), PITCH_WEAR.DIRT_DARK, 0.7);
    return { base: PITCH_WEAR.BASE_WORN, shapes, lineAlpha: 0.65, dashedLines: false };
  }
  poly(blob(rng, L / 2, CY, 50, 11), PITCH_WEAR.DIRT, 0.7);
  poly(blob(rng, 5, CY, 15, 20), PITCH_WEAR.MUD, 1);
  poly(blob(rng, L - 5, CY, 15, 20), PITCH_WEAR.MUD, 1);
  poly(blob(rng, L / 2, CY, 16, 12), PITCH_WEAR.MUD, 0.9);
  for (let i = 0; i < 6; i++) poly(blob(rng, 12 + rng() * (L - 24), 5 + rng() * (W - 10), 4, 2.5), PITCH_WEAR.MUD_DARK, 1);
  for (let i = 0; i < 2; i++) poly(blob(rng, 10 + rng() * (L - 20), 8 + rng() * (W - 16), 4, 1.6), PITCH_WEAR.PUDDLE, 0.55);
  return { base: PITCH_WEAR.BASE_ROTTEN, shapes, lineAlpha: 0.45, dashedLines: true };
}
```

Atenção ao teste "pristine stripes": com `PITCH_STRIPES.COUNT = 15` e `i = 1, 3, …, 13` saem **7** retângulos (é o que o `drawStripes` de hoje desenha). O teste já espera 7.

- [ ] **Step 5: Rode e veja passar.** Run: `bun test src/GraficsEngine/pitchSurface.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/GraficsEngine/pitchSurface.ts src/GraficsEngine/pitchSurface.test.ts src/GraficsEngine/pitchStyle.ts
git commit -m "feat(turf): superfície do campo (corte e desgaste) como formas puras"
```

---

### Task 10: Desenho no `PixiPitch`

**Files:**
- Modify: `src/GraficsEngine/PixiPitch.tsx` (props ~linha 290; `drawStripes`/`drawPitch` ~146; montagem ~572)

- [ ] **Step 1: Prop.** Na interface de props, depois de `stadium?`:

```ts
  /**
   * The match pitch (spec 2026-10-16-pitch-types): condition, grass, mowing and the seed of the patches.
   * Absent: crisp stripes, as before. Changes redraw the surface (never per frame).
   */
  pitch?: { condition: number; turf: TurfType; mowing: MowingPattern; seed: string } | null;
```

Desestruture `pitch = null`, crie `const pitchRef = useRef(pitch);` e um `redrawSurfaceRef = useRef<(() => void) | null>(null)`, e o efeito:

```ts
  useEffect(() => {
    pitchRef.current = pitch;
    redrawSurfaceRef.current?.();
  }, [pitch?.condition, pitch?.turf, pitch?.mowing, pitch?.seed, mirror]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: Desenho.** Troque `drawStripes` por:

```ts
/** The pitch surface (`pitchSurface.ts`) inside the pitch rectangle; the margins stay the dark colour. */
function drawSurface(g: Graphics, rings: Graphics, m: PitchMetrics, s: PitchSurface, mirror: boolean) {
  const px = (x: number) => m.marginX + mirrorX(x, mirror) * m.scale;
  const py = (y: number) => m.marginY + mirrorY(y, mirror) * m.scale;
  g.rect(m.marginX, m.marginY, m.width, m.height).fill(s.base);
  for (const sh of s.shapes) {
    if (sh.kind === "rect") {
      const x1 = px(sh.x), x2 = px(sh.x + sh.w), y1 = py(sh.y), y2 = py(sh.y + sh.h);
      g.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)).fill({ color: sh.color, alpha: sh.alpha });
    } else if (sh.kind === "poly") {
      const pts: number[] = [];
      for (let i = 0; i < sh.points.length; i += 2) pts.push(px(sh.points[i]!), py(sh.points[i + 1]!));
      g.poly(pts).fill({ color: sh.color, alpha: sh.alpha });
    } else {
      rings.circle(px(sh.cx), py(sh.cy), sh.r * m.scale).stroke({ width: sh.width * m.scale, color: sh.color, alpha: sh.alpha });
    }
  }
}
```

Confira a assinatura de `mirrorX`/`mirrorY` em `src/GraficsEngine/pitchMirror.ts` (a do clique, linha ~1293, usa `mirrorX(x, mirrorRef.current)` em jardas): use igual.

`drawPitch(g, m)` ganha `line: { alpha: number; dashed: boolean }`: `LINE.alpha = line.alpha`; com `dashed`, as linhas retas (contorno, linha do meio, áreas) passam por um helper:

```ts
/** A straight line drawn as dashes (failing paint on a rotten pitch). */
function dashedLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, style: { width: number; color: number; alpha: number }) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const dash = 14, gap = 5;
  for (let d = 0; d < len; d += dash + gap) {
    const a = d / len, b = Math.min(1, (d + dash) / len);
    g.moveTo(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a).lineTo(x1 + (x2 - x1) * b, y1 + (y2 - y1) * b).stroke(style);
  }
}
```

Implemente um `seg(x1, y1, x2, y2)` local em `drawPitch` que chama `dashedLine` ou `moveTo/lineTo/stroke` e um `box(x, y, w, h)` que desenha os 4 lados com `seg`; troque os `g.rect(...).stroke(LINE)` das linhas e o `moveTo(midX…)` por eles. Círculo central, marcas do pênalti, arcos e redes ficam como estão (só com o alfa novo).

- [ ] **Step 3: Montagem.** Troque o bloco das listras (linha ~572):

```ts
      // Pitch surface: mowing pattern and wear (static; redrawn only when the pitch changes)
      const surfaceGraphics = new Graphics();
      const ringsGraphics = new Graphics();
      const ringsMask = new Graphics().rect(m.marginX, m.marginY, m.width, m.height).fill(0xffffff);
      ringsGraphics.mask = ringsMask;
      app.stage.addChild(surfaceGraphics, ringsGraphics, ringsMask);
      const pitchGraphics = new Graphics();
      const drawSurfaceNow = () => {
        const p = pitchRef.current;
        const s = pitchSurface(p ?? { condition: 100, turf: "natural", mowing: "stripes", seed: "" });
        surfaceGraphics.clear();
        ringsGraphics.clear();
        drawSurface(surfaceGraphics, ringsGraphics, m, s, mirrorRef.current);
        pitchGraphics.clear();
        drawPitch(pitchGraphics, m, { alpha: s.lineAlpha, dashed: s.dashedLines });
      };
      drawSurfaceNow();
      redrawSurfaceRef.current = drawSurfaceNow;
      app.stage.addChild(pitchGraphics);
```

e remova a criação antiga de `pitchGraphics` + `drawPitch(pitchGraphics, m)` logo abaixo. No cleanup do efeito de montagem, zere `redrawSurfaceRef.current = null` junto do `redrawCrowdRef` (procure onde ele é zerado).

Importe `pitchSurface`, `type PitchSurface` de `@/GraficsEngine/pitchSurface` e os tipos `TurfType`, `MowingPattern`. `PITCH_STRIPES` sai do import se ficar sem uso.

- [ ] **Step 4: Testes do GraficsEngine.** Run: `bun test src/GraficsEngine`. Expected: PASS. Run: `bunx tsc --noEmit 2>&1 | grep -v DecisionTree.ts | head`. Expected: vazio.

- [ ] **Step 5: Commit**

```bash
git add src/GraficsEngine/PixiPitch.tsx
git commit -m "feat(turf): PixiPitch desenha o corte e o desgaste do gramado"
```

---

### Task 11: Partida ao vivo, prévia e `/test`

**Files:**
- Create: `src/GameInterface/Components/PitchSurfaceSvg.tsx`
- Modify: `src/GameInterface/MatchScreen.tsx` (injuryMult ~459, linha do estádio ~1190, `<PixiPitch>`)
- Modify: `src/GameInterface/MatchPreviewScreen.tsx` (~602, ~1028, ~1167)
- Modify: `src/GameInterface/TestScreen.tsx` (~145, ~1204, `<PixiPitch>`)
- Modify: `src/i18n/locales/en.json`, `pt-BR.json`

- [ ] **Step 1: i18n.** Em `facilities` (en / pt-BR):

```json
"turf": {
  "title": "Pitch" / "Gramado",
  "type": { "natural": "Natural grass" / "Grama natural", "hybrid": "Hybrid grass" / "Grama híbrida", "synthetic": "Synthetic grass" / "Grama sintética" },
  "about": { "natural": "Wears at the normal pace." / "Desgasta no ritmo normal.", "hybrid": "Wears 40% slower." / "Desgasta 40% mais devagar.", "synthetic": "Barely wears; 10% more injuries in home games; the fans dislike it." / "Quase não desgasta; 10% mais lesões nos jogos em casa; a torcida não gosta." },
  "change": "Change grass" / "Trocar grama",
  "current": "Current" / "Atual",
  "condition": "Condition {{pct}}%" / "Condição {{pct}}%"
},
"mowing": {
  "label": "Mowing pattern" / "Padrão de corte",
  "stripes": "Stripes" / "Listras", "checker": "Checker" / "Xadrez", "diagonal": "Diagonal" / "Diagonal", "circles": "Circles" / "Círculos"
}
```

Em `facilities.kind`: `"turf": "grass change"` / `"troca de grama"`. Em `facilities.inbox.subject`: `"turf_changed": "New grass laid"` / `"Grama nova instalada"`; em `facilities.inbox`: `"turf_changed": "The stadium pitch now has {{turf}}, at 100%."` / `"O gramado do estádio agora tem {{turf}}, a 100%."`. Em `match.stadium`: `"pitch": "{{turf}} · {{pct}}%"`. Escreva cada língua no seu arquivo (o "/" acima separa en / pt-BR).

Em `InboxScreen.tsx` (~linha 522, `vars`): acrescente `turf: message.turf ? t(\`facilities.turf.type.${message.turf}\`).toLowerCase() : ""`.

- [ ] **Step 2: SVG da superfície.** `src/GameInterface/Components/PitchSurfaceSvg.tsx`:

```tsx
import { useId, useMemo } from "react";
import { pitchSurface } from "@/GraficsEngine/pitchSurface";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Small drawing of a pitch surface (same shapes as the live pitch): match preview and Club screen. */
export function PitchSurfaceSvg({ condition, turf, mowing, seed, className }: {
  condition: number; turf: TurfType; mowing: MowingPattern; seed: string; className?: string;
}) {
  const clip = useId();
  const s = useMemo(() => pitchSurface({ condition, turf, mowing, seed }), [condition, turf, mowing, seed]);
  const L = PITCH_LENGTH, W = PITCH_WIDTH;
  const line = { fill: "none", stroke: "#ffffff", strokeOpacity: s.lineAlpha, strokeWidth: 0.6, ...(s.dashedLines ? { strokeDasharray: "4 1.5" } : {}) };
  return (
    <svg viewBox={`0 0 ${L} ${W}`} className={className} aria-hidden="true">
      <defs><clipPath id={clip}><rect width={L} height={W} /></clipPath></defs>
      <rect width={L} height={W} fill={hex(s.base)} />
      <g clipPath={`url(#${clip})`}>
        {s.shapes.map((sh, i) => sh.kind === "rect"
          ? <rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} fill={hex(sh.color)} fillOpacity={sh.alpha} />
          : sh.kind === "poly"
            ? <polygon key={i} points={sh.points.join(" ")} fill={hex(sh.color)} fillOpacity={sh.alpha} />
            : <circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill="none" stroke={hex(sh.color)} strokeOpacity={sh.alpha} strokeWidth={sh.width} />)}
      </g>
      <rect x={0.5} y={0.5} width={L - 1} height={W - 1} {...line} />
      <line x1={L / 2} y1={0} x2={L / 2} y2={W} {...line} />
      <circle cx={L / 2} cy={W / 2} r={10} {...line} />
      <rect x={0.5} y={W / 2 - 22} width={18} height={44} {...line} />
      <rect x={L - 18.5} y={W / 2 - 22} width={18} height={44} {...line} />
    </svg>
  );
}
```

- [ ] **Step 3: Partida ao vivo.** Em `MatchScreen.tsx`:
  - O tipo da resposta de `match-setup` (procure onde `referee`/`crowd` são tipados) ganha `pitch?: { condition: number; turf: TurfType; mowing: MowingPattern } | null`.
  - Lesão (~459): multiplique os dois lados por `pitchInjury(data.pitch?.condition ?? 90, data.pitch?.turf)` — hoje a partida ao vivo não aplica o gramado; assim fica igual à simulada:

```ts
            {
              A: staffEffectsOf(data.mySquad).injuryMult * pitchMult,
              ...(data.opponentSquad ? { B: staffEffectsOf(data.opponentSquad).injuryMult * pitchMult } : {}),
            },
```

    com `const pitchMult = pitchInjury(data.pitch?.condition ?? 90, data.pitch?.turf);` logo antes.
  - `<PixiPitch ... pitch={data.pitch && matchFixture ? { ...data.pitch, seed: matchFixture.id } : null}>` (use a variável que já guarda o fixture e o resultado do setup naquele escopo; o `pitch` não entra no `key`).
  - Linha do estádio (~1190): acrescente ao `filter(Boolean).join(" · ")` (fora do caso de campo neutro também, já que a condição vale lá):

```ts
  const pitchInfo = setupPitch
    ? t("match.stadium.pitch", { turf: t(`facilities.turf.type.${setupPitch.turf}`), pct: Math.round(setupPitch.condition) })
    : null;
```

    e renderize a parte da condição em vermelho abaixo de 40: separe em `<span>` — procure onde `stadiumLine` é renderizado e, em vez de juntar `pitchInfo` à string, renderize `{pitchInfo && <span className={setupPitch.condition < FACILITIES.WEAR.WARN_BELOW ? "text-destructive" : undefined}> · {pitchInfo}</span>}` logo depois de `{stadiumLine}`. `setupPitch` = o `pitch` do match-setup guardado no estado da tela (guarde-o junto de `venueName` quando a resposta chega).

- [ ] **Step 4: Prévia.** Em `MatchPreviewScreen.tsx`: o tipo (~602) ganha `pitch?: { condition: number; turf: TurfType; mowing: MowingPattern } | null`; no bloco do gramado (~1167), ao lado do valor "Gramado: N%", mostre o tipo (`t("facilities.turf.type.<turf>")`) e o mini campo:

```tsx
{matchSetup?.pitch && fixture && (
  <PitchSurfaceSvg condition={matchSetup.pitch.condition} turf={matchSetup.pitch.turf} mowing={matchSetup.pitch.mowing}
    seed={fixture.id} className="w-28 h-auto rounded border border-border" />
)}
```

Leia o componente do bloco (o `InfoItem`/equivalente na linha ~1168) e encaixe o SVG e o texto dentro dele sem quebrar a grade `INFO_COLS`.

- [ ] **Step 5: `/test`.** Em `TestScreen.tsx`: estados `const [turf, setTurf] = useState<TurfType>("natural")` e `const [mowing, setMowing] = useState<MowingPattern>("stripes")`; ao lado do seletor "Pitch" (~1204), duas fileiras de botões no mesmo estilo dos botões de debug vizinhos (Turf: natural/hybrid/synthetic; Mowing: stripes/checker/diagonal/circles); o rótulo vira `Pitch ({pitch}% · {turf} · injury x{pitchInjury(pitch, turf).toFixed(2)})`; a linha ~145 usa `pitchInjury(pitch, turf)`; o `<PixiPitch>` recebe `pitch={{ condition: pitch, turf, mowing, seed: "test" }}`; o `QuickSimPanel` recebe `turf` (acrescente a prop opcional `turf?: TurfType` em `QuickSimPanel.tsx` e passe para `runOnce` → `quickSimMatch({ ..., turf })`). Onde o `/test` monta o `simulateMatch`/`createMatchState` com o multiplicador do gramado, use o mesmo `pitchInjury(pitch, turf)`.

- [ ] **Step 6: Verificação.** Run: `bunx tsc --noEmit 2>&1 | grep -v DecisionTree.ts | head`, `bun run ui:audit`, `bun test src/GameInterface src/i18n`. Expected: tsc limpo, auditoria 0 achados, testes PASS.

- [ ] **Step 7: Commit**

```bash
git add src/GameInterface src/i18n src/types
git commit -m "feat(turf): gramado na partida ao vivo, na prévia e no /test"
```

---

### Task 12: Tela Clube — cartão "Gramado"

**Files:**
- Create: `src/GameInterface/Facilities/TurfCard.tsx`
- Modify: `src/GameInterface/Facilities/facilitiesApi.ts`, `FacilitiesView.tsx`

- [ ] **Step 1: API.** Em `FacilitiesViewData`:

```ts
  /** Grass and mowing of the stadium pitch (spec 2026-10-16-pitch-types). */
  turf: TurfType;
  mowing: MowingPattern;
  /** The turf works to each grass (null: the current one). */
  turfQuotes: Record<TurfType, ItemQuote | null>;
```

E no hook `useFacilities`, uma função `setMowing`:

```ts
  const setMowing = useCallback(async (mowing: MowingPattern): Promise<boolean> => {
    if (!saveId) return false;
    try {
      const r = await fetch(`/api/saves/${saveId}/facilities/mowing`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mowing }),
      });
      if (!r.ok) return false;
      const body = await r.json() as { view?: FacilitiesViewData };
      if (body.view) setData(body.view);
      return true;
    } catch { return false; }
  }, [saveId]);

  return { data, error, request, setMowing };
```

- [ ] **Step 2: Cartão.** `src/GameInterface/Facilities/TurfCard.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { PitchSurfaceSvg } from "@/GameInterface/Components/PitchSurfaceSvg";
import { MOWING_PATTERNS, TURF_TYPES } from "@/Domain/facilities/turf";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { formatFee } from "@/Domain/money";
import type { FacilitiesViewData } from "@/GameInterface/Facilities/facilitiesApi";
import type { FacilityRequest, MowingPattern } from "@/types/facilityTypes";

/** Club screen: the stadium pitch's grass and mowing, and the turf works (spec 2026-10-16-pitch-types §4). */
export function TurfCard({ data, pending, onAsk, onMowing }: {
  data: FacilitiesViewData;
  pending: boolean;
  onAsk: (req: FacilityRequest) => void;
  onMowing: (m: MowingPattern) => void;
}) {
  const { t } = useTranslation();
  const pitch = data.items.find((i) => i.id === "stadiumPitch");
  const condition = Math.round(pitch?.condition ?? 100);
  const stadiumBusy = (data.busyGroups ?? []).includes("stadium");
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.turf.title")}</h3>
        <span className={`text-sm tabular-nums ${condition < FACILITIES.WEAR.WARN_BELOW ? "text-destructive" : "text-muted-foreground"}`}>
          {t(`facilities.turf.type.${data.turf}`)} · {t("facilities.turf.condition", { pct: condition })}
        </span>
      </div>
      <div className="flex flex-col sm:flex-row gap-4">
        <PitchSurfaceSvg condition={condition} turf={data.turf} mowing={data.mowing} seed="club" className="w-full sm:w-56 h-auto rounded border border-border" />
        <div className="flex flex-col gap-3 min-w-0">
          <p className="text-sm text-muted-foreground m-0">{t(`facilities.turf.about.${data.turf}`)}</p>
          <div className="flex flex-col gap-1">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("facilities.mowing.label")}</span>
            <OptionChips
              options={MOWING_PATTERNS.map((m) => ({ value: m, label: t(`facilities.mowing.${m}`) }))}
              value={data.mowing}
              onChange={(m) => onMowing(m as MowingPattern)}
            />
          </div>
        </div>
      </div>
      <div className="border-t border-border pt-4 flex flex-col gap-3">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("facilities.turf.change")}</span>
        {TURF_TYPES.filter((tp) => tp !== data.turf).map((tp) => {
          const q = data.turfQuotes[tp];
          return (
            <div key={tp} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{t(`facilities.turf.type.${tp}`)}</div>
                <div className="text-sm text-muted-foreground">{t(`facilities.turf.about.${tp}`)}</div>
                {q && <div className="text-sm tabular-nums text-muted-foreground">{formatFee(q.cost)} · {q.weeks} {t("facilities.weeksShort")}</div>}
              </div>
              <Button disabled={!q || pending || stadiumBusy || !q.forecast.approved} onClick={() => onAsk({ kind: "turf", turf: tp })}>
                {t("facilities.turf.change")}
              </Button>
            </div>
          );
        })}
        {stadiumBusy && <p className="text-sm text-muted-foreground m-0">{t("facilities.busyGroup", { group: t("facilities.items.group.stadium") })}</p>}
      </div>
    </section>
  );
}
```

Antes de finalizar, confira os nomes reais: `grep -n "export function OptionChips" -A8 src/GameInterface/ui/OptionChips.tsx` (props `options`/`value`/`onChange`), `grep -n "export function formatFee\|formatFee" src/Domain/money.ts src/GameInterface -r | head -3`, e as chaves de texto já existentes para "semanas" e "área ocupada" (`grep -n "weeks\|busy" src/i18n/locales/pt-BR.json | grep -i facilit | head`). Use as chaves que existem; se faltar alguma, crie em en e pt-BR. Mostre também o motivo da recusa da diretoria quando `!q.forecast.approved`, com a mesma chave que o `FacilityItemsPanel` usa para isso (`grep -n "forecast" src/GameInterface/Facilities/FacilityItemsPanel.tsx`).

- [ ] **Step 3: Encaixe.** Em `FacilitiesView.tsx`: `const { data, error, request, setMowing } = useFacilities(...)`; logo depois do bloco "Stadium + expansion panel" (antes de `<AttendanceChart`):

```tsx
      <TurfCard data={data} pending={pending} onAsk={(req) => void ask(req)} onMowing={(m) => void setMowing(m)} />
```

O `OutcomeNotice` já mostra aprovação/recusa pelo `kind`; confira que ele tem texto para `kind: "turf"` (usa `facilities.kind.<kind>`, criado no Task 11).

- [ ] **Step 4: Verificação.** Run: `bunx tsc --noEmit 2>&1 | grep -v DecisionTree.ts | head`, `bun run ui:audit`, `bun test src/GameInterface`. Expected: limpo, 0 achados, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/GameInterface/Facilities src/GameInterface/Components/PitchSurfaceSvg.tsx src/i18n
git commit -m "feat(turf): cartão Gramado na tela Clube"
```

---

### Task 13: `/lab`

**Files:**
- Modify: `src/lab/types.ts` (`Variant`, `TeamRawStats`, `VariantSummary`), `src/lab/balanceWorker.ts`, `src/lab/scenarioRunner.ts`, `src/lab/labNames.ts`, `src/lab/components/VariantEditor.tsx`, `src/lab/components/PairDetail.tsx`
- Test: `src/lab/familiarityLabel.test.ts` (acrescentar)

- [ ] **Step 1: Teste do rótulo que falha.** Em `familiarityLabel.test.ts`:

```ts
test("turf in the label (non-natural only)", () => {
  expect(variantAutoLabel(v({ turf: "natural" }))).toBe("4-3-3 · Possession");
  expect(variantAutoLabel(v({ turf: "synthetic" }))).toBe("4-3-3 · Possession · turf synthetic");
});
```

- [ ] **Step 2: Rode e veja falhar.** Run: `bun test src/lab/familiarityLabel.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementação.** Siga exatamente o caminho de `pitchCondition` em cada arquivo (`grep -n "pitchCondition\|matchPitch" src/lab -r`):
  - `Variant.turf?: TurfType` (da variante A vale para o jogo, como `pitchCondition`): no `balanceWorker.ts`, ao lado de `matchPitch = variantA.pitchCondition`, `matchTurf = variantA.turf`; nos dois spreads de opções (motor e quickSim) `...(matchTurf ? { turf: matchTurf } : {})`.
  - `TeamRawStats.turfInjuryMult: number` (inicializado 0 nos dois objetos zerados, somado em `dst.turfInjuryMult += src.turfInjuryMult`), preenchido com `turfInjuryMult(matchTurf)` para os dois times ao lado de `teamA.pitchCondition = …`.
  - `scenarioRunner.ts`: `avgTurfInjuryMult: r2(t.turfInjuryMult / matches)` no `VariantSummary`/`PerMatchView` ao lado de `avgPitchCondition`.
  - `labNames.ts`: depois do termo do gramado, `const withTurf = !v.turf || v.turf === "natural" ? withPitch : \`${withPitch} · turf ${v.turf}\`` (use o nome da variável que já existe na cadeia; o retorno passa a ser `withTurf`).
  - `VariantEditor.tsx`: um seletor Turf (natural/hybrid/synthetic) ao lado do slider Pitch, no mesmo estilo dele.
  - `PairDetail.tsx`: linha "Turf injury ×" com `avgTurfInjuryMult`, ao lado da linha "Pitch".

- [ ] **Step 4: Rode e veja passar.** Run: `bun test src/lab`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lab
git commit -m "feat(turf): tipo de grama nas variantes do /lab"
```

---

### Task 14: Medições

**Files:**
- Modify: `scripts/injury-calibrate.ts` (`pitchOf` ~linha 142 e os dois chamadores)
- Modify: `scripts/facilities-wear.ts`

- [ ] **Step 1: Modo `aiturf`.** Em `injury-calibrate.ts`, `pitchOf` passa a devolver `{ condition?: number; turf?: TurfType }`:

```ts
function pitchOf(mode: string, home: Squad, fraction: number): { condition?: number; turf?: TurfType } {
  if (mode === "none") return {};
  if (mode === "ai") return { condition: aiPitchCondition(financialTierOf(home), fraction) };
  if (mode === "aiturf") {
    const turf = aiTurfOf(home.id, financialTierOf(home));
    return { condition: aiPitchCondition(financialTierOf(home), fraction, turf), turf };
  }
  return { condition: Number(mode) };
}
```

Nos dois chamadores troque `pitch === undefined ? {} : { pitchCondition: pitch }` por `{ ...(p.condition !== undefined ? { pitchCondition: p.condition } : {}), ...(p.turf ? { turf: p.turf } : {}) }` (com `const p = pitchOf(...)`), e onde o script soma `pitch` para a média use `p.condition ?? 90`.

- [ ] **Step 2: Medir.** Run: `bun scripts/injury-calibrate.ts 300 --pitch ai,aiturf --quicksim`. Expected: quickSim (pareado, exato) `aiturf` ≤ +3% sobre `ai`. Anote os números (motor e quickSim) para a regra. Se passar de +3%, pare e reporte ao usuário (não mexa em constantes sem combinar).

- [ ] **Step 3: Desgaste por tipo.** Em `scripts/facilities-wear.ts`, aceite `--turf natural,hybrid,synthetic` (padrão: `natural`): para cada tipo, rode a mesma linha do tempo do gramado do estádio com `items.stadiumPitch.turf = <tipo>` e imprima a data em que chega a 40%. Run: `bun scripts/facilities-wear.ts --turf natural,hybrid,synthetic`. Expected: natural igual ao de antes (0,71 temporada com 3★), híbrida ~1,2, sintética > 2 temporadas. Anote.

- [ ] **Step 4: Commit**

```bash
git add scripts/injury-calibrate.ts scripts/facilities-wear.ts
git commit -m "chore(turf): medições de lesão e desgaste por tipo de grama"
```

---

### Task 15: Regras, changelog e verificação final

**Files:**
- Modify: `.claude/rules/game/facilities.md`, `.claude/rules/graphics-engine.md`, `.claude/rules/game/injuries.md`
- Modify: `src/GameInterface/changelog/changelog.ts`, `package.json`

- [ ] **Step 1: Regras.** Em `facilities.md`, nova seção "Tipos de grama e padrão de corte (4.28)" com: tabela dos tipos (desgaste, lesão, custo, torcida), a regra da IA (`AI_SHARE`), a obra `turf` (rota, custo, prazo, vaga do estádio, entrega, mensagem `turf_changed`), o `PUT .../facilities/mowing`, o cartão Gramado e as medições do Task 14. Em `graphics-engine.md`, uma linha para `pitchSurface.ts` (faixas, formas em jardas, desenhado uma vez e refeito só quando o gramado muda) e a prop `pitch` do `PixiPitch`. Em `injuries.md`, na seção "Gramado e fisioterapia": a grama sintética × 1,1 nos jogos em casa (motor, quickSim e partida ao vivo, que antes não aplicava o gramado).

- [ ] **Step 2: Changelog.** Nova entrada no topo de `changelog.ts`, versão `4.28`, data `2026-10-16` (ou a do dia do merge), itens (pt/en):
  - "Tipos de grama: natural, híbrida ou sintética, trocados como obra na tela Clube." / "Grass types: natural, hybrid or synthetic, changed as a works in the Club screen."
  - "Escolha o padrão de corte do gramado: listras, xadrez, diagonal ou círculos." / "Pick the pitch mowing pattern: stripes, checker, diagonal or circles."
  - "O gramado da partida mostra o desgaste: de nítido a terra e lama." / "The match pitch shows its wear: from crisp to dirt and mud."
  - "Tipo e condição do gramado na partida ao vivo e na prévia." / "Grass type and condition in the live match and the preview."
  
  `fixes`: "A linha de um save com amigos na tela inicial não vaza mais por baixo do botão Continuar." / "A friends' save row on the start screen no longer runs under the Continue button."
  
  Atualize `upcoming` (tire o que saiu, se estiver lá). `package.json` `"version": "4.28.0"` (siga o formato atual do campo).

- [ ] **Step 3: Verificação completa.** Run, em partes (memória): `bun test src/Domain`, `bun test src/GameEngine`, `bun test src/GraficsEngine src/GameInterface src/i18n src/lab`, `bun test src/backend`. Expected: tudo PASS. `bunx tsc --noEmit` (só o erro antigo de `DecisionTree.ts:750`), `bun run ui:audit --hard` (0).

- [ ] **Step 4: Navegador.** `DEV_AUTO_LOGIN=1` e o servidor a partir de `C:\Projects\FMProject` (`.claude/rules/dev-login.md`); confira no `/test` os quatro padrões e as quatro faixas (Pitch 100/60/30/5) e a grama sintética; numa carreira, o cartão Gramado em `/club` (trocar o corte, pedir a troca de grama), a prévia e a linha "Grama … · N%" na partida ao vivo.

- [ ] **Step 5: Commit**

```bash
git add .claude/rules src/GameInterface/changelog/changelog.ts package.json
git commit -m "docs(turf): regras, changelog 4.28"
```
