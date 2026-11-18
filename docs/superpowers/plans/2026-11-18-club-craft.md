# Craft nas instalações do clube (fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As obras da aba Clube passam a ser montadas com componentes fabricados na oficina a partir de materiais comprados na loja; a diretoria deixa de aprovar obra e passa a mandar materiais todo mês.

**Architecture:** Lógica pura em `src/Domain/craft/` (estoque, receitas, loja, oficina, verba, reciclagem), estado em `ClubFacilities.craft` (só o clube humano). Rotas novas em `src/backend/craftRoutes.ts`; a rota de obra existente (`facilities/request`) troca a diretoria pelo consumo do estoque. O avanço do dia roda a verba e a fila no bloco de instalações que já existe. Telas em `src/GameInterface/Craft/` montadas como abas da tela Clube.

**Tech Stack:** Bun, TypeScript, React 19, Tailwind v4, i18next. Testes com `bun test` (um arquivo por vez), typecheck com `bun run typecheck`.

Spec: `docs/superpowers/specs/2026-11-18-club-craft-design.md`. Worktree: `C:\Projects\FMProject-reports` (branch atual). Arquivos são CRLF: editar com a ferramenta Edit ou com python normalizando `\n`. i18n: editar com python `json` + `OrderedDict`, `ensure_ascii=False`, `indent=2`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; só arquivos específicos no `git add`.

## Decisões tomadas no plano (ajustes ao spec, anotar no spec na Task 15)

1. **Preço relativo à receita.** O preço de um material é `receita anual × share` (share por material, `CRAFT.MATERIAL_SHARE`), com o ruído da semana. Assim uma obra pede ~10–40 componentes num clube pequeno e num grande; um preço fixo em euros daria milhares de componentes no Real Madrid e 1 no Quênia.
2. **Lote.** O tempo da tabela de componentes é por lote de `CRAFT.LOT` (5) unidades: um pedido de `qty` unidades ocupa uma bancada por `ceil(dias × qty / 5 × velocidade)` dias.
3. **Oficina fora dos itens.** O nível fica em `craft.workshop` (1..5), sem desgaste: não entra em `FacilityItemId` (evita mexer em ~20 `Record<FacilityItemId,…>`). Melhorar a oficina consome os componentes e sobe na hora.
4. **Qualidade Excelente só no desgaste nesta fase** (×0,70; Boa ×0,85). O +2% no efeito do item fica para a fase 2: os efeitos dos itens só existem como penalidade abaixo de 40% (`itemEffects`), não há onde somar um bônus sem mexer em todos os consumidores.
5. **Materiais reservados ao entrar na fila** (saem do estoque); cancelar devolve tudo de quem não começou e metade de quem começou.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `src/types/craftTypes.ts` (novo) | `MaterialId`, `ComponentId`, `Supplier`, `CraftQuality`, `CraftStock`, `CraftJob`, `ClubCraft`, visões |
| `src/Domain/craft/craftConfig.ts` (novo) | Todas as constantes (`CRAFT`) |
| `src/Domain/craft/stock.ts` (novo, + teste) | Estoque vazio, somar, tirar, conferir, média de qualidade |
| `src/Domain/craft/recipes.ts` (novo, + teste) | Valor dos componentes, mistura por obra, receita de uma cotação, falta |
| `src/Domain/craft/shop.ts` (novo, + teste) | Preço da semana, desconto, total de um pedido |
| `src/Domain/craft/workshop.ts` (novo, + teste) | Bancadas, dias do lote, enfileirar, mover, cancelar, avançar o dia, sorteio de qualidade |
| `src/Domain/craft/allowance.ts` (novo, + teste) | Verba mensal e estoque inicial em materiais |
| `src/Domain/craft/recycle.ts` (novo, + teste) | Desmontar um nível, sobra da reconstrução |
| `src/types/facilityTypes.ts` | `FacilityItem.quality`, `FacilityProject.craft/components/quality`, `ClubFacilities.craft` |
| `src/Domain/facilities/facilities.ts` | `applyCompletion` grava a qualidade; `startCraftProject` |
| `src/Domain/facilities/facilityItems.ts` | `wearDay` multiplica pela qualidade |
| `src/types/staffTypes.ts`, `src/Domain/staff/*` | Função `foreman` |
| `src/types/inboxTypes.ts`, `src/Domain/facilities/facilityMessages.ts` | `craft_allowance`, `craft_done`, `built` |
| `src/Domain/finance/ledger.ts` | `ref.facility` aceita `"materials"` |
| `src/backend/craftWorld.ts` (novo) | `ensureCraft`, `craftDay` (verba + fila no avanço do dia) |
| `src/backend/craftRoutes.ts` (novo, + teste) | Rotas da oficina, loja, estoque |
| `src/backend/facilityRoutes.ts` | Receitas nas cotações, montar com estoque, cancelar |
| `src/backend/advanceDay.ts` | Chama `craftDay` no bloco de instalações |
| `src/backend/worlds/worldLobbyGuard.ts`, `src/backend/routes.ts` | Registrar as rotas novas |
| `src/GameInterface/Craft/*` (novo) | `craftApi.ts`, `ClubTabs.tsx`, `WorkshopView.tsx`, `StockView.tsx`, `ShopView.tsx`, `RecipeLine.tsx`, `craftText.ts` |
| `src/GameInterface/ClubScreen.tsx`, `Facilities/*` | Abas; receita e Montar no lugar da previsão da diretoria |
| `src/i18n/locales/{en,pt-BR}.json` | `craft.*`, `staff.roles.foreman`, `inbox.facilities.*` |
| `.claude/rules/game/facilities.md`, `staff.md`, `docs/…/specs/…craft…` | Regras |

---

### Task 1: Tipos e constantes

**Files:**
- Create: `src/types/craftTypes.ts`
- Create: `src/Domain/craft/craftConfig.ts`

- [ ] **Step 1: Escrever os tipos**

```ts
// src/types/craftTypes.ts
/** Craft of the club's facilities (`docs/superpowers/specs/2026-11-18-club-craft-design.md`). Human club only. */
export type MaterialId = "concrete" | "steel" | "wood" | "grass" | "fabric" | "electronics";
export type ComponentId = "beam" | "slab" | "turfPanel" | "seat" | "floodlight" | "gymKit" | "medKit" | "furniture";
export type Supplier = "standard" | "good";
export type CraftQuality = "common" | "good" | "excellent";

export type ComponentCounts = Partial<Record<ComponentId, number>>;
export type MaterialCounts = Partial<Record<MaterialId, number>>;

export interface CraftStock {
  materials: Record<MaterialId, Record<Supplier, number>>;
  components: Record<ComponentId, Record<CraftQuality, number>>;
}

/** One order on the workshop queue: `qty` units of a component, materials already taken from the stock. */
export interface CraftJob {
  id: string;
  component: ComponentId;
  qty: number;
  /** Share (0..1) of the materials that came from the good supplier. */
  goodShare: number;
  /** Bench days the order takes (fixed when it is queued). */
  days: number;
  startedOn?: string;
  doneOn?: string;
}

export interface ClubCraft {
  /** Workshop level 1..5. */
  workshop: number;
  stock: CraftStock;
  queue: CraftJob[];
  nextId: number;
  /** "YYYY-MM" of the last monthly allowance (idempotent day). */
  allowanceMonth?: string;
}
```

- [ ] **Step 2: Escrever as constantes**

```ts
// src/Domain/craft/craftConfig.ts
import type { ComponentId, CraftQuality, MaterialId, MaterialCounts } from "@/types/craftTypes";
import type { FacilityItemId } from "@/types/facilityTypes";

export const MATERIALS: readonly MaterialId[] = ["concrete", "steel", "wood", "grass", "fabric", "electronics"];
export const COMPONENTS: readonly ComponentId[] = ["beam", "slab", "turfPanel", "seat", "floodlight", "gymKit", "medKit", "furniture"];
export const QUALITIES: readonly CraftQuality[] = ["common", "good", "excellent"];

export const CRAFT = {
  /** Price of one unit of a material = annual revenue × share (decision 1 of the plan). */
  MATERIAL_SHARE: {
    concrete: 0.00003, steel: 0.00008, wood: 0.00003, grass: 0.00006, fabric: 0.00003, electronics: 0.0001,
  } as Record<MaterialId, number>,
  /** Weekly price noise: base × (1 + NOISE × u), u in [−1, 1]. */
  PRICE_NOISE: 0.1,
  GOOD_SUPPLIER_MULT: 1.15,
  /** Shop discount with the board at or above `DISCOUNT_BOARD`. */
  DISCOUNT: 0.1,
  DISCOUNT_BOARD: 70,
  RECIPES: {
    beam: { materials: { steel: 3, concrete: 1 }, days: 2, minLevel: 1 },
    slab: { materials: { concrete: 4 }, days: 2, minLevel: 1 },
    turfPanel: { materials: { grass: 3 }, days: 1, minLevel: 1 },
    seat: { materials: { wood: 2, fabric: 1 }, days: 1, minLevel: 1 },
    floodlight: { materials: { steel: 2, electronics: 2 }, days: 3, minLevel: 2 },
    gymKit: { materials: { steel: 2, electronics: 1 }, days: 2, minLevel: 3 },
    medKit: { materials: { fabric: 1, electronics: 2 }, days: 2, minLevel: 3 },
    furniture: { materials: { wood: 3 }, days: 1, minLevel: 1 },
  } as Record<ComponentId, { materials: MaterialCounts; days: number; minLevel: number }>,
  /** Days in the table are per lot of this many units (decision 2). */
  LOT: 5,
  MAX_QUEUE: 10,
  MAX_LEVEL: 5,
  /** Bench days × (1 − SPEED_STEP × (level − 1)). */
  SPEED_STEP: 0.1,
  /** Mixes of each works (relative quantities). */
  STAND_MIX: { slab: 3, beam: 2, seat: 4 } as Partial<Record<ComponentId, number>>,
  WORKSHOP_MIX: { beam: 2, slab: 1, furniture: 1 } as Partial<Record<ComponentId, number>>,
  ITEM_MIX: {
    stadiumPitch: { turfPanel: 1 },
    seats: { seat: 3, furniture: 1 },
    stadiumStructure: { beam: 2, floodlight: 2 },
    trainingPitches: { turfPanel: 1 },
    gym: { gymKit: 2, beam: 1 },
    pool: { slab: 2, beam: 1 },
    physio: { medKit: 2, furniture: 1 },
    canteen: { furniture: 2, slab: 1 },
    academyPitches: { turfPanel: 1 },
    academyLodging: { furniture: 2, slab: 1 },
  } as Record<FacilityItemId, Partial<Record<ComponentId, number>>>,
  /** Workshop upgrade cost as a share of the annual revenue, by the level reached (2..5). */
  WORKSHOP_COST: [0, 0, 0.004, 0.008, 0.014, 0.022],
  /** Quality draw: excellent = EXC_BASE + score, good = GOOD, the rest common. */
  QUALITY: { EXC_BASE: 0.1, GOOD: 0.35, FOREMAN: 0.1, LEVEL: 0.05, SUPPLIER: 0.15 },
  /** Works quality from the mean of its components (common 0, good 1, excellent 2). */
  QUALITY_EXCELLENT_FROM: 1.5,
  QUALITY_GOOD_FROM: 0.75,
  QUALITY_WEAR: { common: 1, good: 0.85, excellent: 0.7 } as Record<CraftQuality, number>,
  /** Foreman's bench speed: [1★, 3★, 5★] (`starCurve`); vacant = 2★. */
  FOREMAN_SPEED: [1.15, 1, 0.85] as [number, number, number],
  /** Monthly board allowance: share of the annual revenue by the board meter. */
  ALLOWANCE: { NONE_BELOW: 35, LOW_AT: 50, LOW: 0.01, HIGH_AT: 85, HIGH: 0.03 },
  /** Stock given to a club the first time it gets the craft (old saves, new careers, a new club). */
  INITIAL_STOCK_SHARE: 0.02,
  /** Cancelling a started order or a running works gives back this share. */
  CANCEL_RETURN: 0.5,
  RECYCLE_RETURN: 0.4,
  REBUILD_RETURN: 0.25,
} as const;
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/types/craftTypes.ts src/Domain/craft/craftConfig.ts
git commit -m "feat(craft): types and constants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Estoque

**Files:**
- Create: `src/Domain/craft/stock.ts`
- Test: `src/Domain/craft/stock.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { addComponents, addMaterials, emptyStock, hasComponents, missingComponents, takeComponents, takeMaterials, worksQuality } from "@/Domain/craft/stock";

describe("craft stock", () => {
  test("materials: add, take standard first, refuse when short", () => {
    let s = addMaterials(emptyStock(), "standard", { steel: 3 });
    s = addMaterials(s, "good", { steel: 2 });
    const r = takeMaterials(s, { steel: 4 });
    expect(r).not.toBeNull();
    expect(r!.stock.materials.steel).toEqual({ standard: 0, good: 1 });
    expect(r!.goodShare).toBeCloseTo(1 / 4);
    expect(takeMaterials(s, { steel: 6 })).toBeNull();
  });
  test("components: best quality taken first, missing counts, works quality", () => {
    let s = addComponents(emptyStock(), "beam", { excellent: 1, common: 2 });
    expect(hasComponents(s, { beam: 3 })).toBe(true);
    expect(missingComponents(s, { beam: 5, slab: 1 })).toEqual({ beam: 2, slab: 1 });
    const r = takeComponents(s, { beam: 2 })!;
    expect(r.taken).toEqual({ excellent: 1, good: 0, common: 1 });
    expect(r.stock.components.beam).toEqual({ common: 1, good: 0, excellent: 0 });
    expect(worksQuality({ excellent: 3, good: 0, common: 0 })).toBe("excellent");
    expect(worksQuality({ excellent: 0, good: 1, common: 1 })).toBe("common");
    expect(worksQuality({ excellent: 1, good: 0, common: 1 })).toBe("good");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/craft/stock.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// src/Domain/craft/stock.ts
import { COMPONENTS, CRAFT, MATERIALS } from "@/Domain/craft/craftConfig";
import type { ComponentCounts, ComponentId, CraftQuality, CraftStock, MaterialCounts, Supplier } from "@/types/craftTypes";

export function emptyStock(): CraftStock {
  return {
    materials: Object.fromEntries(MATERIALS.map((m) => [m, { standard: 0, good: 0 }])) as CraftStock["materials"],
    components: Object.fromEntries(COMPONENTS.map((c) => [c, { common: 0, good: 0, excellent: 0 }])) as CraftStock["components"],
  };
}

export function addMaterials(s: CraftStock, supplier: Supplier, add: MaterialCounts): CraftStock {
  const materials = { ...s.materials };
  for (const [m, n] of Object.entries(add) as [keyof MaterialCounts, number][]) {
    if (!n) continue;
    materials[m] = { ...materials[m], [supplier]: materials[m][supplier] + n };
  }
  return { ...s, materials };
}

/** Takes the materials (standard first); null when short. `goodShare` = good units / all units taken. */
export function takeMaterials(s: CraftStock, need: MaterialCounts): { stock: CraftStock; goodShare: number } | null {
  const materials = { ...s.materials };
  let good = 0;
  let all = 0;
  for (const [m, n] of Object.entries(need) as [keyof MaterialCounts, number][]) {
    if (!n) continue;
    const have = materials[m];
    if (have.standard + have.good < n) return null;
    const fromStd = Math.min(have.standard, n);
    materials[m] = { standard: have.standard - fromStd, good: have.good - (n - fromStd) };
    good += n - fromStd;
    all += n;
  }
  return { stock: { ...s, materials }, goodShare: all > 0 ? good / all : 0 };
}

export function addComponents(s: CraftStock, id: ComponentId, add: Partial<Record<CraftQuality, number>>): CraftStock {
  const cur = s.components[id];
  return {
    ...s,
    components: {
      ...s.components,
      [id]: { common: cur.common + (add.common ?? 0), good: cur.good + (add.good ?? 0), excellent: cur.excellent + (add.excellent ?? 0) },
    },
  };
}

export const componentTotal = (s: CraftStock, id: ComponentId): number => {
  const c = s.components[id];
  return c.common + c.good + c.excellent;
};

export function missingComponents(s: CraftStock, need: ComponentCounts): ComponentCounts {
  const out: ComponentCounts = {};
  for (const [id, n] of Object.entries(need) as [ComponentId, number][]) {
    const short = n - componentTotal(s, id);
    if (short > 0) out[id] = short;
  }
  return out;
}

export const hasComponents = (s: CraftStock, need: ComponentCounts): boolean =>
  Object.keys(missingComponents(s, need)).length === 0;

/** Takes the components, best quality first; null when short. `taken` sums the qualities used. */
export function takeComponents(s: CraftStock, need: ComponentCounts): { stock: CraftStock; taken: Record<CraftQuality, number> } | null {
  if (!hasComponents(s, need)) return null;
  const components = { ...s.components };
  const taken = { common: 0, good: 0, excellent: 0 };
  for (const [id, n] of Object.entries(need) as [ComponentId, number][]) {
    let left = n;
    const c = { ...components[id] };
    for (const q of ["excellent", "good", "common"] as const) {
      const use = Math.min(c[q], left);
      c[q] -= use;
      taken[q] += use;
      left -= use;
    }
    components[id] = c;
  }
  return { stock: { ...s, components }, taken };
}

export function worksQuality(taken: Record<CraftQuality, number>): CraftQuality {
  const n = taken.common + taken.good + taken.excellent;
  if (n === 0) return "common";
  const mean = (taken.good + 2 * taken.excellent) / n;
  return mean >= CRAFT.QUALITY_EXCELLENT_FROM ? "excellent" : mean >= CRAFT.QUALITY_GOOD_FROM ? "good" : "common";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/craft/stock.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/craft/stock.ts src/Domain/craft/stock.test.ts
git commit -m "feat(craft): stock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Loja (preço da semana)

**Files:**
- Create: `src/Domain/craft/shop.ts`
- Test: `src/Domain/craft/shop.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { mondayOf, orderTotal, unitPrice, weekPrice } from "@/Domain/craft/shop";

describe("craft shop", () => {
  test("weekly price stays within the noise and is stable for the week", () => {
    const base = 1_000_000 * CRAFT.MATERIAL_SHARE.steel;
    const a = weekPrice("s1", "steel", "2027-03-03", 1_000_000);
    expect(a).toBe(weekPrice("s1", "steel", "2027-03-07", 1_000_000));
    expect(a).toBeGreaterThanOrEqual(base * 0.9 - 1);
    expect(a).toBeLessThanOrEqual(base * 1.1 + 1);
    expect(mondayOf("2027-03-07")).toBe("2027-03-01");
  });
  test("good supplier and board discount", () => {
    const p = weekPrice("s1", "wood", "2027-03-03", 10_000_000);
    expect(unitPrice(p, "good", 50)).toBe(Math.round(p * 1.15));
    expect(unitPrice(p, "standard", 70)).toBe(Math.round(p * 0.9));
    expect(orderTotal([{ material: "wood", supplier: "standard", qty: 3 }], "s1", "2027-03-03", 10_000_000, 50)).toBe(3 * Math.round(p));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/craft/shop.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/Domain/craft/shop.ts
import { CRAFT } from "@/Domain/craft/craftConfig";
import { addDays } from "@/Domain/dates";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { MaterialId, Supplier } from "@/types/craftTypes";

/** The Monday on or before `date` (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((d + 6) % 7));
}

/** Price of one unit this week (before supplier and discount). */
export function weekPrice(saveId: string, material: MaterialId, date: string, revenue: number): number {
  const u = mulberry32(seedFrom(`craft:${saveId}:${material}:${mondayOf(date)}`))() * 2 - 1;
  return Math.max(1, Math.round(Math.max(0, revenue) * CRAFT.MATERIAL_SHARE[material] * (1 + CRAFT.PRICE_NOISE * u)));
}

export function unitPrice(week: number, supplier: Supplier, board: number): number {
  const s = supplier === "good" ? CRAFT.GOOD_SUPPLIER_MULT : 1;
  const d = board >= CRAFT.DISCOUNT_BOARD ? 1 - CRAFT.DISCOUNT : 1;
  return Math.round(week * s * d);
}

export interface OrderLine { material: MaterialId; supplier: Supplier; qty: number }

export function orderTotal(lines: OrderLine[], saveId: string, date: string, revenue: number, board: number): number {
  return lines.reduce((sum, l) => sum + l.qty * unitPrice(weekPrice(saveId, l.material, date, revenue), l.supplier, board), 0);
}
```

(Se `addDays` não estiver em `@/Domain/dates`, conferir com `grep -n "export function addDays" src/Domain/dates.ts` e usar o nome exportado.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/craft/shop.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/craft/shop.ts src/Domain/craft/shop.test.ts
git commit -m "feat(craft): weekly shop prices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Receitas das obras

**Files:**
- Create: `src/Domain/craft/recipes.ts`
- Test: `src/Domain/craft/recipes.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { componentValue, mixFor, recipeFor, recipeValue } from "@/Domain/craft/recipes";

const R = 100_000_000;
describe("craft recipes", () => {
  test("component value is the sum of its materials at the base price", () => {
    // beam = 3 steel + 1 concrete
    expect(componentValue("beam", R)).toBe(Math.round(R * (3 * 0.00008 + 0.00003)));
  });
  test("mix by works", () => {
    expect(mixFor({ kind: "repair", item: "gym" })).toEqual({ gymKit: 2, beam: 1 });
    expect(mixFor({ kind: "stand" })).toEqual({ slab: 3, beam: 2, seat: 4 });
    expect(mixFor({ kind: "comfort" })).toEqual({ seat: 3, furniture: 1 });
    const training = mixFor({ kind: "training" });
    expect(training.turfPanel).toBe(1);
    expect(training.medKit).toBe(2);
  });
  test("recipe value is close to the cost and never empty", () => {
    const cost = 600_000;
    const r = recipeFor({ kind: "repair", item: "gym" }, cost, R);
    expect(r.gymKit).toBeGreaterThan(0);
    expect(Math.abs(recipeValue(r, R) - cost) / cost).toBeLessThan(0.2);
    const tiny = recipeFor({ kind: "repair", item: "gym" }, 1, R);
    expect(tiny).toEqual({ gymKit: 1, beam: 1 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/craft/recipes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/Domain/craft/recipes.ts
import { CRAFT } from "@/Domain/craft/craftConfig";
import { itemsOfGroup } from "@/Domain/facilities/facilityItems";
import type { ComponentCounts, ComponentId, MaterialId } from "@/types/craftTypes";
import type { FacilityItemId, FacilityKind } from "@/types/facilityTypes";

/** Value of one component at the base prices (EUR). */
export function componentValue(id: ComponentId, revenue: number): number {
  const mats = CRAFT.RECIPES[id].materials;
  let v = 0;
  for (const [m, n] of Object.entries(mats) as [MaterialId, number][]) v += n * Math.max(0, revenue) * CRAFT.MATERIAL_SHARE[m];
  return Math.round(v);
}

export function recipeValue(r: ComponentCounts, revenue: number): number {
  return (Object.entries(r) as [ComponentId, number][]).reduce((s, [id, n]) => s + n * componentValue(id, revenue), 0);
}

function sumMix(...mixes: ComponentCounts[]): ComponentCounts {
  const out: ComponentCounts = {};
  for (const m of mixes) for (const [id, n] of Object.entries(m) as [ComponentId, number][]) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** Relative mix of a works (spec §2). */
export function mixFor(w: { kind: FacilityKind | "workshop"; item?: FacilityItemId }): ComponentCounts {
  if (w.kind === "stand") return { ...CRAFT.STAND_MIX };
  if (w.kind === "workshop") return { ...CRAFT.WORKSHOP_MIX };
  if (w.kind === "comfort") return { ...CRAFT.ITEM_MIX.seats };
  if (w.kind === "turf") return { ...CRAFT.ITEM_MIX.stadiumPitch };
  if (w.kind === "training" || w.kind === "academy") return sumMix(...itemsOfGroup(w.kind).map((id) => CRAFT.ITEM_MIX[id]));
  return w.item ? { ...CRAFT.ITEM_MIX[w.item] } : {};
}

/** Components a works of `cost` EUR asks: the mix scaled to the cost, at least one of each. */
export function recipeFor(w: { kind: FacilityKind | "workshop"; item?: FacilityItemId }, cost: number, revenue: number): ComponentCounts {
  const mix = mixFor(w);
  const unit = recipeValue(mix, revenue);
  const units = unit > 0 ? Math.max(1, Math.round(cost / unit)) : 1;
  const out: ComponentCounts = {};
  for (const [id, n] of Object.entries(mix) as [ComponentId, number][]) out[id] = Math.max(1, Math.round(n * units));
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/craft/recipes.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/craft/recipes.ts src/Domain/craft/recipes.test.ts
git commit -m "feat(craft): works recipes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Oficina (fila, bancadas, qualidade)

**Files:**
- Create: `src/Domain/craft/workshop.ts`
- Test: `src/Domain/craft/workshop.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { addMaterials, emptyStock } from "@/Domain/craft/stock";
import { advanceQueue, benchCount, cancelJob, enqueue, jobDays, moveJob, newCraft, rollQuality } from "@/Domain/craft/workshop";

const ctx = { saveId: "s1", foremanStars: 3, foremanSpeed: 1 };
function withSteel(n: number) {
  const c = newCraft();
  return { ...c, stock: addMaterials(addMaterials(c.stock, "standard", { steel: n * 3 }), "standard", { concrete: n }) };
}

describe("workshop", () => {
  test("benches and lot days", () => {
    expect(benchCount(1)).toBe(2);
    expect(benchCount(5)).toBe(6);
    expect(jobDays("beam", 5, 1, 1)).toBe(2);
    expect(jobDays("beam", 5, 5, 1)).toBe(2); // 2 × 0.6 = 1.2 → 2
    expect(jobDays("beam", 10, 1, 1)).toBe(4);
  });
  test("enqueue takes materials; refuses short or locked", () => {
    const c = withSteel(5);
    expect(enqueue(c, { component: "beam", qty: 6 }, ctx)).toEqual({ error: "missingMaterials" });
    expect(enqueue(c, { component: "gymKit", qty: 1 }, ctx)).toEqual({ error: "locked" });
    const r = enqueue(c, { component: "beam", qty: 5 }, ctx);
    if ("error" in r) throw new Error(r.error);
    expect(r.craft.stock.materials.steel.standard).toBe(0);
    expect(r.craft.queue).toHaveLength(1);
  });
  test("a day starts jobs on free benches and finishes them", () => {
    let c = withSteel(5);
    const r = enqueue(c, { component: "beam", qty: 5 }, ctx);
    if ("error" in r) throw new Error(r.error);
    c = r.craft;
    const d1 = advanceQueue(c, "2027-03-01", ctx);
    expect(d1.craft.queue[0]!.startedOn).toBe("2027-03-01");
    expect(d1.craft.queue[0]!.doneOn).toBe("2027-03-03");
    const d3 = advanceQueue(d1.craft, "2027-03-03", ctx);
    expect(d3.craft.queue).toHaveLength(0);
    expect(d3.done.beam).toBe(5);
    const c3 = d3.craft.stock.components.beam;
    expect(c3.common + c3.good + c3.excellent).toBe(5);
  });
  test("cancel and move", () => {
    let c = withSteel(10);
    for (const qty of [5, 5]) { const r = enqueue(c, { component: "beam", qty }, ctx); if ("error" in r) throw new Error(); c = r.craft; }
    const [a, b] = c.queue;
    const moved = moveJob(c, b!.id, "up")!;
    expect(moved.queue[0]!.id).toBe(b!.id);
    const cancelled = cancelJob(c, a!.id)!;
    expect(cancelled.queue).toHaveLength(1);
    expect(cancelled.stock.materials.steel.standard).toBe(15);
  });
  test("quality draw is deterministic and gets better with the foreman", () => {
    const q1 = rollQuality(`s1:j1`, 0, { foremanStars: 3, level: 1 });
    expect(q1).toEqual(rollQuality(`s1:j1`, 0, { foremanStars: 3, level: 1 }));
    let exc3 = 0, exc5 = 0;
    for (let i = 0; i < 400; i++) {
      if (rollQuality(`k${i}`, 0, { foremanStars: 3, level: 1 }) === "excellent") exc3++;
      if (rollQuality(`k${i}`, 1, { foremanStars: 5, level: 5 }) === "excellent") exc5++;
    }
    expect(exc5).toBeGreaterThan(exc3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/craft/workshop.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/Domain/craft/workshop.ts
import { CRAFT, QUALITIES } from "@/Domain/craft/craftConfig";
import { addComponents, addMaterials, emptyStock, takeMaterials } from "@/Domain/craft/stock";
import { addDays } from "@/Domain/dates";
import { clamp } from "@/Domain/math";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { ClubCraft, ComponentCounts, ComponentId, CraftJob, CraftQuality, MaterialCounts, MaterialId } from "@/types/craftTypes";

export interface WorkshopCtx { saveId: string; foremanStars: number; foremanSpeed: number }

export const newCraft = (): ClubCraft => ({ workshop: 1, stock: emptyStock(), queue: [], nextId: 1 });
export const benchCount = (level: number): number => 1 + clamp(level, 1, CRAFT.MAX_LEVEL);

export function jobDays(component: ComponentId, qty: number, level: number, foremanSpeed: number): number {
  const speed = (1 - CRAFT.SPEED_STEP * (clamp(level, 1, CRAFT.MAX_LEVEL) - 1)) * foremanSpeed;
  return Math.max(1, Math.ceil((CRAFT.RECIPES[component].days * qty / CRAFT.LOT) * speed));
}

export function materialsFor(component: ComponentId, qty: number): MaterialCounts {
  const out: MaterialCounts = {};
  for (const [m, n] of Object.entries(CRAFT.RECIPES[component].materials) as [MaterialId, number][]) out[m] = n * qty;
  return out;
}

export type EnqueueError = "locked" | "invalidQty" | "queueFull" | "missingMaterials";

export function enqueue(c: ClubCraft, req: { component: ComponentId; qty: number }, ctx: WorkshopCtx): { craft: ClubCraft } | { error: EnqueueError } {
  if (!Number.isInteger(req.qty) || req.qty < 1 || req.qty > 500) return { error: "invalidQty" };
  if (CRAFT.RECIPES[req.component].minLevel > c.workshop) return { error: "locked" };
  if (c.queue.length >= CRAFT.MAX_QUEUE) return { error: "queueFull" };
  const taken = takeMaterials(c.stock, materialsFor(req.component, req.qty));
  if (!taken) return { error: "missingMaterials" };
  const job: CraftJob = {
    id: `job_${c.nextId}`, component: req.component, qty: req.qty, goodShare: taken.goodShare,
    days: jobDays(req.component, req.qty, c.workshop, ctx.foremanSpeed),
  };
  return { craft: { ...c, stock: taken.stock, queue: [...c.queue, job], nextId: c.nextId + 1 } };
}

export function moveJob(c: ClubCraft, id: string, dir: "up" | "down"): ClubCraft | null {
  const i = c.queue.findIndex((j) => j.id === id);
  const k = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || k < 0 || k >= c.queue.length || c.queue[i]!.startedOn || c.queue[k]!.startedOn) return null;
  const queue = [...c.queue];
  [queue[i], queue[k]] = [queue[k]!, queue[i]!];
  return { ...c, queue };
}

/** Cancels an order: all the materials back before it started, half after. */
export function cancelJob(c: ClubCraft, id: string): ClubCraft | null {
  const job = c.queue.find((j) => j.id === id);
  if (!job) return null;
  const share = job.startedOn ? CRAFT.CANCEL_RETURN : 1;
  const back: MaterialCounts = {};
  for (const [m, n] of Object.entries(materialsFor(job.component, job.qty)) as [MaterialId, number][]) back[m] = Math.floor(n * share);
  const good = Math.round(job.goodShare * 1000) / 1000;
  let stock = c.stock;
  const goodPart: MaterialCounts = {};
  const stdPart: MaterialCounts = {};
  for (const [m, n] of Object.entries(back) as [MaterialId, number][]) {
    goodPart[m] = Math.round(n * good);
    stdPart[m] = n - goodPart[m]!;
  }
  stock = addMaterials(addMaterials(stock, "standard", stdPart), "good", goodPart);
  return { ...c, stock, queue: c.queue.filter((j) => j.id !== id) };
}

export function rollQuality(key: string, goodShare: number, q: { foremanStars: number; level: number }): CraftQuality {
  const Q = CRAFT.QUALITY;
  const score = Q.FOREMAN * (q.foremanStars - 3) + Q.LEVEL * (q.level - 1) + Q.SUPPLIER * goodShare;
  const exc = clamp(Q.EXC_BASE + score, 0, 1);
  const good = clamp(Q.GOOD, 0, 1 - exc);
  const u = mulberry32(seedFrom(key))();
  return u < exc ? "excellent" : u < exc + good ? "good" : "common";
}

/** One day: finished orders go to the stock (each unit with its own quality), then free benches start the next ones. */
export function advanceQueue(c: ClubCraft, date: string, ctx: WorkshopCtx): { craft: ClubCraft; done: ComponentCounts } {
  let stock = c.stock;
  const done: ComponentCounts = {};
  const left: CraftJob[] = [];
  for (const job of c.queue) {
    if (job.doneOn && job.doneOn <= date) {
      const q = { common: 0, good: 0, excellent: 0 };
      for (let u = 0; u < job.qty; u++) q[rollQuality(`craft:${ctx.saveId}:${job.id}:${u}`, job.goodShare, { foremanStars: ctx.foremanStars, level: c.workshop })]++;
      stock = addComponents(stock, job.component, q);
      done[job.component] = (done[job.component] ?? 0) + job.qty;
    } else left.push(job);
  }
  let busy = left.filter((j) => j.startedOn).length;
  const queue = left.map((j) => {
    if (j.startedOn || busy >= benchCount(c.workshop)) return j;
    busy++;
    return { ...j, startedOn: date, doneOn: addDays(date, j.days) };
  });
  const changed = queue.some((j, i) => j !== left[i]) || queue.length !== c.queue.length;
  return { craft: changed ? { ...c, stock, queue } : c, done };
}

void QUALITIES;
```

(Se `clamp` estiver em outro caminho, `grep -rn "export function clamp\|export const clamp" src/Domain/math.ts`. Apague a linha `void QUALITIES;` e o import de `QUALITIES` se o typecheck reclamar de import não usado.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/craft/workshop.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/craft/workshop.ts src/Domain/craft/workshop.test.ts
git commit -m "feat(craft): workshop queue and quality

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verba mensal, estoque inicial e reciclagem

**Files:**
- Create: `src/Domain/craft/allowance.ts`, `src/Domain/craft/recycle.ts`
- Test: `src/Domain/craft/allowance.test.ts`, `src/Domain/craft/recycle.test.ts`

- [ ] **Step 1: Testes**

```ts
// allowance.test.ts
import { describe, expect, test } from "bun:test";
import { allowanceShare, materialsWorth } from "@/Domain/craft/allowance";
import { CRAFT } from "@/Domain/craft/craftConfig";

describe("allowance", () => {
  test("share by board", () => {
    expect(allowanceShare(30)).toBe(0);
    expect(allowanceShare(50)).toBeCloseTo(0.01);
    expect(allowanceShare(85)).toBeCloseTo(0.03);
    expect(allowanceShare(99)).toBeCloseTo(0.03);
    expect(allowanceShare(67.5)).toBeCloseTo(0.02);
    expect(allowanceShare(40)).toBeCloseTo(0.01);
  });
  test("a value split in equal parts of the six materials", () => {
    const m = materialsWorth(60_000, 100_000_000);
    expect(m.steel).toBe(Math.floor(10_000 / (100_000_000 * CRAFT.MATERIAL_SHARE.steel)));
    expect(Object.keys(m)).toHaveLength(6);
  });
});
```

```ts
// recycle.test.ts
import { describe, expect, test } from "bun:test";
import { shareOf } from "@/Domain/craft/recycle";

describe("recycle", () => {
  test("share of a recipe, rounded down, at least zero", () => {
    expect(shareOf({ beam: 10, slab: 3 }, 0.4)).toEqual({ beam: 4, slab: 1 });
    expect(shareOf({ beam: 1 }, 0.25)).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/craft/allowance.test.ts` e depois `bun test src/Domain/craft/recycle.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/Domain/craft/allowance.ts
import { CRAFT, MATERIALS } from "@/Domain/craft/craftConfig";
import type { MaterialCounts } from "@/types/craftTypes";

/** Share of the annual revenue the board sends as materials each month (spec §7). Between 35 and 50: the low share. */
export function allowanceShare(board: number): number {
  const A = CRAFT.ALLOWANCE;
  if (board < A.NONE_BELOW) return 0;
  if (board <= A.LOW_AT) return A.LOW;
  if (board >= A.HIGH_AT) return A.HIGH;
  return A.LOW + (A.HIGH - A.LOW) * (board - A.LOW_AT) / (A.HIGH_AT - A.LOW_AT);
}

/** Equal value of each of the six materials, at the base price, for `value` EUR. */
export function materialsWorth(value: number, revenue: number): MaterialCounts {
  const part = Math.max(0, value) / MATERIALS.length;
  const out: MaterialCounts = {};
  for (const m of MATERIALS) {
    const unit = Math.max(1, revenue * CRAFT.MATERIAL_SHARE[m]);
    out[m] = Math.floor(part / unit);
  }
  return out;
}
```

```ts
// src/Domain/craft/recycle.ts
import type { ComponentCounts, ComponentId } from "@/types/craftTypes";

/** `share` of each component of a recipe, rounded down; zeros left out. */
export function shareOf(recipe: ComponentCounts, share: number): ComponentCounts {
  const out: ComponentCounts = {};
  for (const [id, n] of Object.entries(recipe) as [ComponentId, number][]) {
    const k = Math.floor(n * share);
    if (k > 0) out[id] = k;
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar** (os dois arquivos, um por vez)

- [ ] **Step 5: Commit**

```bash
git add src/Domain/craft/allowance.ts src/Domain/craft/allowance.test.ts src/Domain/craft/recycle.ts src/Domain/craft/recycle.test.ts
git commit -m "feat(craft): board allowance and recycling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Qualidade nas instalações (tipos, desgaste, entrega)

**Files:**
- Modify: `src/types/facilityTypes.ts` (`FacilityItem`, `FacilityProject`, `ClubFacilities`)
- Modify: `src/Domain/facilities/facilityItems.ts:120-130` (`wearDay`)
- Modify: `src/Domain/facilities/facilities.ts` (`applyCompletion`, novo `startCraftProject`)
- Test: `src/Domain/facilities/craftQuality.test.ts`

- [ ] **Step 1: Tipos.** Em `FacilityItem` acrescentar:

```ts
  /** Quality of the last works (craft); absent = common. Good wears ×0,85, excellent ×0,70. */
  quality?: "good" | "excellent";
```

Em `FacilityProject` acrescentar:

```ts
  /** Built from components (craft): no instalments, no board. */
  craft?: true;
  /** Components the works took (cancel gives half back). */
  components?: import("@/types/craftTypes").ComponentCounts;
  /** Quality the item gets on delivery. */
  quality?: import("@/types/craftTypes").CraftQuality;
```

Em `ClubFacilities` acrescentar:

```ts
  /** Craft (`docs/superpowers/specs/2026-11-18-club-craft-design.md`); absent until the first read sets it up. */
  craft?: import("@/types/craftTypes").ClubCraft;
```

(Se o projeto proibir `import()` em tipo, use `import type { … } from "@/types/craftTypes";` no topo do arquivo.)

- [ ] **Step 2: Teste**

```ts
// src/Domain/facilities/craftQuality.test.ts
import { describe, expect, test } from "bun:test";
import { wearDay } from "@/Domain/facilities/facilityItems";
import { applyCompletion } from "@/Domain/facilities/facilities";
import type { FacilityItems } from "@/types/facilityTypes";

const items = (q?: "good" | "excellent"): FacilityItems => ({
  stadiumPitch: { level: 6, wear: 0.1 }, seats: { level: 6, wear: 0.1, ...(q ? { quality: q } : {}) },
  stadiumStructure: { level: 6, wear: 0.1 }, trainingPitches: { level: 6, wear: 0.1 }, gym: { level: 6, wear: 0.1 },
  pool: { level: 6, wear: 0.1 }, physio: { level: 6, wear: 0.1 }, canteen: { level: 6, wear: 0.1 },
  academyPitches: { level: 6, wear: 0.1 }, academyLodging: { level: 6, wear: 0.1 },
} as FacilityItems);

describe("craft quality on items", () => {
  test("excellent seats wear 30% slower", () => {
    const d = { homeGames: 1, session: null, pitchWearMult: 1 } as const;
    const base = wearDay(items(), d).items.seats.wear - 0.1;
    const exc = wearDay(items("excellent"), d).items.seats.wear - 0.1;
    expect(exc).toBeCloseTo(base * 0.7, 10);
  });
  test("a craft works writes its quality; a works without quality clears it", () => {
    const p = { id: "x", kind: "repair", item: "seats", to: 100, start: "2027-01-01", end: "2027-01-02", cost: 0, boardShare: 0, instalments: 0, paid: 0, craft: true, quality: "good" } as const;
    expect(applyCompletion(items(), p).seats.quality).toBe("good");
    const { quality: _q, craft: _c, ...plain } = p;
    expect(applyCompletion(items("excellent"), plain).seats.quality).toBeUndefined();
  });
});
```

(Se o tipo `FacilityItems` não existir com esse nome, use `ClubFacilities["items"]`.)

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test src/Domain/facilities/craftQuality.test.ts`
Expected: FAIL (o desgaste ainda não olha a qualidade).

- [ ] **Step 4: Implementar.** Em `wearDay`, trocar a linha do `dw`:

```ts
    const quality = CRAFT.QUALITY_WEAR[it.quality ?? "common"];
    const dw = itemWearToday(id, it.level, d) * turf * quality;
```

com `import { CRAFT } from "@/Domain/craft/craftConfig";` no topo. Em `applyCompletion`, no ramo `if (p.item)`, gravar a qualidade do projeto (e limpar a antiga):

```ts
    return {
      ...items,
      [p.item]: {
        level, wear: wearFor(p.kind === "repair" ? p.to ?? 100 : 100),
        ...(turf ? { turf } : {}),
        ...(p.quality && p.quality !== "common" ? { quality: p.quality } : {}),
      },
    };
```

e no laço das obras de grupo:

```ts
  for (const id of ids) {
    out[id] = {
      level: Math.min(F.ITEM_MAX_LEVEL, Math.max(out[id].level, 2 * p.level)), wear: 0,
      ...(out[id].turf ? { turf: out[id].turf } : {}),
      ...(p.quality && p.quality !== "common" ? { quality: p.quality } : {}),
    };
  }
```

Um setor da arquibancada (`kind: "stand"`) não passa por `applyCompletion`: no ramo `stand` de `advanceFacilities`, depois de somar os lugares, gravar a qualidade nos assentos:

```ts
        if (p.quality && p.quality !== "common") items = { ...items, seats: { ...items.seats, quality: p.quality } };
```

Acrescentar em `facilities.ts`, logo depois de `startProject`:

```ts
/** A works built from components: no instalments and no board; delivers like the others. */
export function startCraftProject(
  f: ClubFacilities, quote: ProjectQuote,
  args: { id: string; date: string; components: import("@/types/craftTypes").ComponentCounts; quality: import("@/types/craftTypes").CraftQuality },
): ClubFacilities {
  const started = startProject(f, quote, { id: args.id, date: args.date, boardShare: 0 });
  const projects = started.projects.map((p) => (p.id === args.id
    ? { ...p, instalments: 0, paid: 0, craft: true as const, components: args.components, quality: args.quality }
    : p));
  return { ...started, projects };
}
```

Conferir que `advanceFacilities` não lança parcelas para `instalments: 0` (o `while (p.paid < p.instalments …)` não roda): nada a mudar.

- [ ] **Step 5: Rodar e ver passar**, depois `bun test src/Domain/facilities/facilities.test.ts` (regressão) e `bun run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/types/facilityTypes.ts src/Domain/facilities/facilityItems.ts src/Domain/facilities/facilities.ts src/Domain/facilities/craftQuality.test.ts
git commit -m "feat(craft): works quality on facility items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Mestre de obras na comissão

**Files:**
- Modify: `src/types/staffTypes.ts:7-8,16`, `src/Domain/staff/staffTypes.ts:8,30`, `src/Domain/staff/staffConfig.ts` (LIMITS, WAGE_ROLE_SHARE, POOL counts), `src/Domain/staff/staff.ts` (`foremanSpeedOf`, `StaffEffects`), `src/GameInterface/StaffScreen.tsx:97-106`, `src/GameInterface/Staff/staffApi.ts:56`, i18n
- Test: `src/Domain/staff/foreman.test.ts`

Siga o caminho de `groundskeeper`/`youthCoach`: `grep -rn "youthCoach" src --include=*.ts --include=*.tsx | grep -v test` lista todo lugar que enumera as funções; cada um ganha `foreman`.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { foremanSpeedOf, foremanStarsOf } from "@/Domain/staff/staff";
import type { Squad } from "@/types/playerTypes";

describe("foreman", () => {
  test("no staff (AI): neutral; vacant: 2 stars", () => {
    expect(foremanSpeedOf({} as Squad)).toBe(1);
    const vacant = { staff: { members: [] } } as unknown as Squad;
    expect(foremanStarsOf(vacant)).toBe(2);
    expect(foremanSpeedOf(vacant)).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar**
  - `StaffRole` ganha `| "foreman"`; `Specialty` ganha `| "construction"`; `STAFF_ROLES` ganha `"foreman"` no fim; o mapa de especialidade `foreman: "construction"`.
  - `staffConfig.ts`: `LIMITS.foreman: { LOW: 1, MEDIUM: 1, HIGH: 1, ELITE: 1 }` (no formato do `groundskeeper`), `WAGE_ROLE_SHARE.foreman: 0.036`, pool `foreman: 15`.
  - `staff.ts`:

```ts
/** The foreman's stars (vacant = 2★; no staff stored = the AI = neutral 3★). */
export function foremanStarsOf(squad: Squad): number {
  if (!squad.staff) return 3;
  return effectiveStars(squad, "foreman");
}

/** Bench speed of the workshop (× days): `CRAFT.FOREMAN_SPEED` by the foreman's stars. */
export function foremanSpeedOf(squad: Squad): number {
  if (!squad.staff) return 1;
  return starCurve(foremanStarsOf(squad), CRAFT.FOREMAN_SPEED);
}
```

  com `import { CRAFT } from "@/Domain/craft/craftConfig";`. Conferir que `effectiveStars` devolve 2 para função vaga (como as outras funções); se não, devolver 2 quando `membersOf(squad, "foreman").length === 0`.
  - `StaffScreen.tsx`: nos dois `switch`/ternários de efeito, `case "foreman": return t("staff.effects.foreman", { value: pct(speed) })`, com `speed` vindo da rota `GET /staff` (acrescentar `foremanSpeed: foremanSpeedOf(squad)` em `effects` no `staffView` de `staffRoutes.ts`).
  - `staffApi.ts`: o grupo `structure` passa a `["groundskeeper", "foreman"]`.
  - `initialStaff` (staff.ts:339): o mestre entra na comissão inicial como as outras funções de vaga única (nada a fazer se o laço percorre `STAFF_ROLES` com `roleLimit`; conferir).
  - i18n (en / pt-BR): `staff.roles.foreman` "Foreman" / "Mestre de obras"; `staff.effects.foreman` "Workshop bench time {{value}}" / "Tempo na oficina {{value}}".

- [ ] **Step 4: Rodar** `bun test src/Domain/staff/foreman.test.ts`, depois `bun test src/Domain/staff/staff.test.ts`, `bun test src/i18n` e `bun run typecheck`. Os testes do `staffPool` podem contar 300 profissionais: se falharem pela contagem nova, ajustar o total esperado (o `POOL` soma `foreman: 15`).

- [ ] **Step 5: Commit**

```bash
git add src/types/staffTypes.ts src/Domain/staff src/GameInterface/StaffScreen.tsx src/GameInterface/Staff/staffApi.ts src/backend/staffRoutes.ts src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat(craft): foreman in the coaching staff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Mensagens e extrato

**Files:**
- Modify: `src/types/inboxTypes.ts:383-405`, `src/Domain/facilities/facilityMessages.ts`, `src/Domain/finance/ledger.ts` (`ref.facility`), `src/Domain/finance/ledgerText.ts`
- Test: `src/Domain/facilities/facilityMessages.test.ts` (criar se não existir)

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { buildFacilityMessage } from "@/Domain/facilities/facilityMessages";

describe("craft messages", () => {
  test("allowance, done and built have a subject", () => {
    expect(buildFacilityMessage({ date: "2027-03-01", kind: "craft_allowance", cost: 120_000 }).subject).toContain("materials");
    expect(buildFacilityMessage({ date: "2027-03-01", kind: "craft_done", components: { beam: 5 } }).preview).toContain("5");
    expect(buildFacilityMessage({ date: "2027-03-01", kind: "built", item: "gym", quality: "excellent" }).subject).toContain("Gym");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar**
  - `FacilityInboxMessage.kind` ganha `| "craft_allowance" | "craft_done" | "built"`; campos `components?: ComponentCounts; quality?: CraftQuality`.
  - `buildFacilityMessage` aceita `components?` e `quality?`; assuntos (fallback em inglês; a tela traduz):

```ts
    : args.kind === "craft_allowance" ? "The board sent materials"
    : args.kind === "craft_done" ? "Workshop: components ready"
    : args.kind === "built" ? `Works started: ${what}`
```

  e prévias:

```ts
    : args.kind === "craft_allowance" ? `Materials worth ${formatEurosText(args.cost ?? 0)}`
    : args.kind === "craft_done" ? Object.entries(args.components ?? {}).map(([c, n]) => `${n} ${c}`).join(", ")
    : args.kind === "built" ? `Quality: ${args.quality ?? "common"}`
```

  (inserir antes do último `:` das duas cadeias; o ITEM_NAME de "gym" já é "Gym").
  - `ledger.ts`: o tipo de `ref.facility` aceita `"materials"` (se for `FacilityKind`, trocar por `FacilityKind | "materials"`).
  - `ledgerText.ts`: `ref.facility === "materials"` → chave `craftMaterials` (`financesScreen.ledgerText.craftMaterials`: "Materials for the workshop" / "Materiais da oficina").
  - Tela da caixa de entrada: `grep -n "turf_changed" src/GameInterface -r` acha onde os `kind` de `facilities` viram texto; acrescentar os três com `inbox.facilities.craft_allowance|craft_done|built` (i18n en/pt-BR, abaixo).

- [ ] **Step 4: Rodar o teste, `bun test src/Domain/finance/ledgerText.test.ts`, `bun run typecheck`.**

- [ ] **Step 5: Commit**

```bash
git add src/types/inboxTypes.ts src/Domain/facilities/facilityMessages.ts src/Domain/facilities/facilityMessages.test.ts src/Domain/finance/ledger.ts src/Domain/finance/ledgerText.ts src/GameInterface src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat(craft): inbox messages and ledger line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Mundo do craft (criar e o dia)

**Files:**
- Create: `src/backend/craftWorld.ts`
- Modify: `src/backend/facilityRoutes.ts:44-60` (`loadHuman` chama `ensureCraft`), `src/backend/advanceDay.ts:2152` (bloco das instalações), `src/backend/jobWorld.ts` (`takeOverClub`) e `src/backend/SaveService.ts` (`createSave`) se criarem as instalações
- Test: `src/backend/craft.advanceDay.test.ts`

- [ ] **Step 1: Implementar o módulo**

```ts
// src/backend/craftWorld.ts
import { allowanceShare, materialsWorth } from "@/Domain/craft/allowance";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { addMaterials } from "@/Domain/craft/stock";
import { advanceQueue, newCraft } from "@/Domain/craft/workshop";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { foremanSpeedOf, foremanStarsOf } from "@/Domain/staff/staff";
import type { ClubCraft, ComponentCounts } from "@/types/craftTypes";
import type { ClubFacilities } from "@/types/facilityTypes";
import type { Squad } from "@/types/playerTypes";

/** The facilities with a craft state: a new one (workshop 1 and a stock worth `INITIAL_STOCK_SHARE` of the revenue). */
export function ensureCraft(f: ClubFacilities, squad: Squad): ClubFacilities {
  if (f.craft) return f;
  const revenue = wageRevenueBasisOf(squad);
  const c = newCraft();
  const stock = addMaterials(c.stock, "standard", materialsWorth(revenue * CRAFT.INITIAL_STOCK_SHARE, revenue));
  return { ...f, craft: { ...c, stock } };
}

export interface CraftDayResult {
  craft: ClubCraft;
  allowance: number;
  done: ComponentCounts;
}

/** One day of the human club's workshop: the 1st of the month brings the board's materials, then the queue works. */
export function craftDay(craft: ClubCraft, squad: Squad, args: { saveId: string; date: string; board: number }): CraftDayResult {
  let c = craft;
  let allowance = 0;
  const month = args.date.slice(0, 7);
  if (args.date.endsWith("-01") && c.allowanceMonth !== month) {
    const revenue = wageRevenueBasisOf(squad);
    allowance = Math.round(revenue * allowanceShare(args.board));
    c = { ...c, allowanceMonth: month, ...(allowance > 0 ? { stock: addMaterials(c.stock, "standard", materialsWorth(allowance, revenue)) } : {}) };
  }
  const q = advanceQueue(c, args.date, { saveId: args.saveId, foremanStars: foremanStarsOf(squad), foremanSpeed: foremanSpeedOf(squad) });
  return { craft: q.craft, allowance, done: q.done };
}
```

- [ ] **Step 2: Ligar.**
  - `loadHuman` (`facilityRoutes.ts`): depois do `withInitialFacilities`, `if (!squad.facilities!.craft) squad = { ...squad, facilities: ensureCraft(squad.facilities!, squad) };` (não grava sozinho: a primeira rota de escrita grava; o avanço do dia também cria, abaixo).
  - `advanceDay.ts`, no bloco `if (playerSquad?.facilities?.items)`, antes de `const day = advanceFacilities(…)`:

```ts
        const withCraft = ensureCraft(playerSquad.facilities, playerSquad);
        const cd = craftDay(withCraft.craft!, playerSquad, { saveId, date: currentDate, board: ds.board?.board ?? BOARD_FANS.START });
        if (cd.allowance > 0) ds.deferred.facility.push({ date: currentDate, kind: "craft_allowance", cost: cd.allowance });
        if (Object.keys(cd.done).length > 0) ds.deferred.facility.push({ date: currentDate, kind: "craft_done", components: cd.done });
        const facilitiesToday = { ...withCraft, craft: cd.craft, items: worn.items };
```

  e trocar `advanceFacilities({ ...playerSquad.facilities, items: worn.items }, currentDate)` por `advanceFacilities(facilitiesToday, currentDate)`. Conferir que `next !== playerSquad.facilities` passa a gravar (o objeto mudou). Imports `ensureCraft`, `craftDay` de `@/backend/craftWorld`, `BOARD_FANS` se ainda não estiver importado.
  - Quem já tem `ds.deferred.facility` com tipo do `buildFacilityMessage`: os campos novos (`components`) já passam (Task 9).
  - No dia de jogo das obras entregues: uma obra `craft` entregue continua mandando `repaired`/`completed` (nada muda).

- [ ] **Step 3: Teste do avanço do dia**

Copie o esqueleto de `src/backend/facilities.advanceDay.test.ts` (criação do save, assento, `runBufferedDay`/avanço de um dia como lá) e escreva:

```ts
test("the 1st of the month brings the board's materials and the queue finishes on its day", async () => {
  // Save criado como em facilities.advanceDay.test.ts, data posta em 2027-02-28, diretoria 85.
  // Coloca no clube: craft = newCraft() com 15 aço e 5 concreto, e uma ordem de 5 vigas na fila (enqueue).
  // Avança 1 dia (2027-03-01): stock de materiais cresceu (verba) e a ordem começou (startedOn 2027-03-01).
  // Avança até 2027-03-03: a fila está vazia e o estoque tem 5 vigas; a caixa tem craft_allowance e craft_done.
});
```

com o código real do teste vizinho (mesmos helpers). O teste precisa conferir: `facilities.craft.allowanceMonth === "2027-03"`, materiais > os de antes, 5 vigas no estoque, e as duas mensagens na caixa do assento.

- [ ] **Step 4: Rodar** `bun test src/backend/craft.advanceDay.test.ts`, `bun test src/backend/facilities.advanceDay.test.ts` (regressão), `bun run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/backend/craftWorld.ts src/backend/facilityRoutes.ts src/backend/advanceDay.ts src/backend/craft.advanceDay.test.ts
git commit -m "feat(craft): workshop day and board allowance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Rotas da oficina, loja e estoque

**Files:**
- Create: `src/backend/craftRoutes.ts`
- Modify: `src/backend/routes.ts:124` (`...craftRoutes`), `src/backend/worlds/worldLobbyGuard.ts:28`
- Test: `src/backend/craft.routes.test.ts`

- [ ] **Step 1: Implementar as rotas**

```ts
// src/backend/craftRoutes.ts
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { saveService } from "@/backend/SaveService";
import { recordMoney } from "@/backend/FinancialService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { SaveService } from "@/backend/SaveService";
import { ensureCraft } from "@/backend/craftWorld";
import { withInitialFacilities } from "@/backend/facilityWorld";
import { COMPONENTS, CRAFT, MATERIALS } from "@/Domain/craft/craftConfig";
import { recipeFor } from "@/Domain/craft/recipes";
import { shareOf } from "@/Domain/craft/recycle";
import { orderTotal, unitPrice, weekPrice, type OrderLine } from "@/Domain/craft/shop";
import { addComponents, addMaterials, takeComponents } from "@/Domain/craft/stock";
import { benchCount, cancelJob, enqueue, moveJob } from "@/Domain/craft/workshop";
import { addDays, daysBetween } from "@/Domain/dates";
import { itemValue, withFacilities } from "@/Domain/facilities/facilities";
import { isFacilityItemId } from "@/Domain/facilities/facilityItems";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { foremanSpeedOf, foremanStarsOf } from "@/Domain/staff/staff";
import { BOARD_FANS } from "@/Domain/boardFans/boardFansConfig";
import { allowanceShare } from "@/Domain/craft/allowance";
import { logError } from "@/Logger";
import type { ComponentId, MaterialId, Supplier } from "@/types/craftTypes";
import type { Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

interface Club { squad: Squad; ref: { leagueSlug: string; clubSlug: string }; date: string; board: number; leagueSlug: string }

async function loadClub(saveId: string, seatId: string): Promise<Club | Response> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const entry = (await saveService.getSquadIndex(saveId)).byId(meta.clubId);
  if (!entry) return Response.json({ error: "squad not found" }, { status: 404 });
  let squad = await saveService.getSquad(saveId, entry.leagueSlug, entry.stem);
  if (!squad) return Response.json({ error: "squad not found" }, { status: 404 });
  if (!squad.facilities?.items) squad = await withInitialFacilities(squad, entry.leagueSlug);
  squad = { ...squad, facilities: ensureCraft(squad.facilities!, squad) };
  return {
    squad, ref: { leagueSlug: entry.leagueSlug, clubSlug: entry.stem },
    date: meta.currentDate ?? new Date().toISOString().slice(0, 10),
    board: meta.board?.board ?? BOARD_FANS.START, leagueSlug: meta.leagueSlug,
  };
}

function view(saveId: string, c: Club) {
  const craft = c.squad.facilities!.craft!;
  const revenue = wageRevenueBasisOf(c.squad);
  const lastWeek = addDays(c.date, -7);
  return {
    date: c.date,
    workshop: craft.workshop, benches: benchCount(craft.workshop), maxQueue: CRAFT.MAX_QUEUE,
    foremanStars: foremanStarsOf(c.squad), foremanSpeed: foremanSpeedOf(c.squad),
    stock: craft.stock,
    queue: craft.queue.map((j) => ({ ...j, daysLeft: j.doneOn ? Math.max(0, daysBetween(c.date, j.doneOn)) : null })),
    shop: MATERIALS.map((m) => {
      const week = weekPrice(saveId, m, c.date, revenue);
      const prev = weekPrice(saveId, m, lastWeek, revenue);
      return { material: m, standard: unitPrice(week, "standard", c.board), good: unitPrice(week, "good", c.board), previous: unitPrice(prev, "standard", c.board) };
    }),
    discount: c.board >= CRAFT.DISCOUNT_BOARD,
    allowance: Math.round(revenue * allowanceShare(c.board)),
    balance: c.squad.finances?.budget ?? 0,
    recipes: COMPONENTS.map((id) => ({ component: id, ...CRAFT.RECIPES[id], locked: CRAFT.RECIPES[id].minLevel > craft.workshop })),
    upgrade: craft.workshop < CRAFT.MAX_LEVEL
      ? { level: craft.workshop + 1, recipe: recipeFor({ kind: "workshop" }, revenue * CRAFT.WORKSHOP_COST[craft.workshop + 1]!, revenue) }
      : null,
  };
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try { const b = await req.json(); return b && typeof b === "object" ? (b as Record<string, unknown>) : null; } catch { return null; }
}

async function save(saveId: string, c: Club, squad: Squad) {
  await saveService.saveSquad(saveId, c.ref.leagueSlug, c.ref.clubSlug, squad);
  return { ...c, squad };
}

function route(method: "GET" | "POST", fn: (req: Req, saveId: string, seatId: string) => Promise<Response>) {
  return async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== method) return Response.json({ error: "method not allowed" }, { status: 405 });
    return fn(req, saveId, auth.seatId);
  };
}

const isMaterial = (v: unknown): v is MaterialId => typeof v === "string" && (MATERIALS as readonly string[]).includes(v);
const isComponent = (v: unknown): v is ComponentId => typeof v === "string" && (COMPONENTS as readonly string[]).includes(v);

export const craftRoutes = {
  "/api/saves/:saveId/craft": route("GET", async (_req, saveId, seatId) => {
    const c = await loadClub(saveId, seatId);
    return c instanceof Response ? c : Response.json(view(saveId, c));
  }),

  "/api/saves/:saveId/craft/buy": route("POST", async (req, saveId, seatId) => {
    const body = await readBody(req);
    const raw = Array.isArray(body?.items) ? body!.items : null;
    const lines: OrderLine[] = [];
    for (const l of raw ?? []) {
      const x = l as { material?: unknown; supplier?: unknown; qty?: unknown };
      if (!isMaterial(x.material) || (x.supplier !== "standard" && x.supplier !== "good") || !Number.isInteger(x.qty) || (x.qty as number) < 1 || (x.qty as number) > 10_000) {
        return Response.json({ error: "invalidOrder" }, { status: 400 });
      }
      lines.push({ material: x.material, supplier: x.supplier as Supplier, qty: x.qty as number });
    }
    if (lines.length === 0) return Response.json({ error: "invalidOrder" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const total = orderTotal(lines, saveId, c.date, wageRevenueBasisOf(c.squad), c.board);
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      try {
        let stock = c.squad.facilities!.craft!.stock;
        for (const l of lines) stock = addMaterials(stock, l.supplier, { [l.material]: l.qty });
        const squad = withFacilities(c.squad, { ...c.squad.facilities!, craft: { ...c.squad.facilities!.craft!, stock } });
        await service.saveSquad(saveId, c.ref.leagueSlug, c.ref.clubSlug, squad);
        const season = (await service.getLeagueMeta(saveId, c.leagueSlug))?.year ?? parseInt(c.date.slice(0, 4), 10);
        const paid = await recordMoney(service, saveId, season, c.ref, {
          date: c.date, kind: "facilities", amount: -total, label: "Workshop materials", ref: { facility: "materials" },
        }, seatId);
        await buffer.flush();
        return Response.json({ total, view: view(saveId, { ...c, squad: paid }) });
      } catch (err) {
        logError("craft", `save ${saveId}: failed to buy materials`, err);
        return Response.json({ error: "generic" }, { status: 500 });
      }
    });
  }),

  "/api/saves/:saveId/craft/queue": route("POST", async (req, saveId, seatId) => {
    const body = await readBody(req);
    if (!isComponent(body?.component)) return Response.json({ error: "invalidQty" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const r = enqueue(c.squad.facilities!.craft!, { component: body!.component as ComponentId, qty: body!.qty as number }, {
        saveId, foremanStars: foremanStarsOf(c.squad), foremanSpeed: foremanSpeedOf(c.squad),
      });
      if ("error" in r) return Response.json({ error: r.error }, { status: r.error === "locked" || r.error === "invalidQty" ? 400 : 409 });
      const next = await save(saveId, c, withFacilities(c.squad, { ...c.squad.facilities!, craft: r.craft }));
      return Response.json(view(saveId, next));
    });
  }),

  "/api/saves/:saveId/craft/queue/:jobId": route("POST", async (req, saveId, seatId) => {
    const body = await readBody(req);
    const action = body?.action;
    if (action !== "up" && action !== "down" && action !== "cancel") return Response.json({ error: "invalidAction" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const craft = c.squad.facilities!.craft!;
      const r = action === "cancel" ? cancelJob(craft, req.params.jobId!) : moveJob(craft, req.params.jobId!, action);
      if (!r) return Response.json({ error: "notFound" }, { status: 404 });
      const next = await save(saveId, c, withFacilities(c.squad, { ...c.squad.facilities!, craft: r }));
      return Response.json(view(saveId, next));
    });
  }),

  /** Workshop upgrade: takes the recipe from the stock and goes up a level at once. */
  "/api/saves/:saveId/craft/workshop": route("POST", async (_req, saveId, seatId) => {
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const v = view(saveId, c);
      if (!v.upgrade) return Response.json({ error: "maxLevel" }, { status: 400 });
      const craft = c.squad.facilities!.craft!;
      const taken = takeComponents(craft.stock, v.upgrade.recipe);
      if (!taken) return Response.json({ error: "missingComponents" }, { status: 409 });
      const next = await save(saveId, c, withFacilities(c.squad, { ...c.squad.facilities!, craft: { ...craft, stock: taken.stock, workshop: craft.workshop + 1 } }));
      return Response.json(view(saveId, next));
    });
  }),

  /** Takes an item down one level and gives back `RECYCLE_RETURN` of its upgrade recipe (common quality). */
  "/api/saves/:saveId/craft/recycle": route("POST", async (req, saveId, seatId) => {
    const body = await readBody(req);
    if (!isFacilityItemId(body?.item)) return Response.json({ error: "invalidRequest" }, { status: 400 });
    const item = body!.item;
    return withSaveLock(saveId, async () => {
      const c = await loadClub(saveId, seatId);
      if (c instanceof Response) return c;
      const f = c.squad.facilities!;
      const it = f.items[item];
      if (it.level <= 1) return Response.json({ error: "minLevel" }, { status: 400 });
      if (f.projects.some((p) => p.item === item)) return Response.json({ error: "busy" }, { status: 409 });
      const revenue = wageRevenueBasisOf(c.squad);
      const value = itemValue(revenue, item, it.level) * FACILITIES.REPAIR.COST_SHARE;
      const back = shareOf(recipeFor({ kind: "upgrade", item }, value, revenue), CRAFT.RECYCLE_RETURN);
      let stock = f.craft!.stock;
      for (const [id, n] of Object.entries(back) as [ComponentId, number][]) stock = addComponents(stock, id, { common: n });
      const items = { ...f.items, [item]: { ...it, level: it.level - 1 } };
      const next = await save(saveId, c, withFacilities(c.squad, { ...f, items, craft: { ...f.craft!, stock } }));
      return Response.json({ returned: back, view: view(saveId, next) });
    });
  }),
};
```

(Conferir os nomes `addDays`, `daysBetween` em `src/Domain/dates.ts`; `FACILITIES.REPAIR.COST_SHARE` existe — é o que a melhoria usa em `quoteItemProject`.)

- [ ] **Step 2: Registrar.** `routes.ts`: `import { craftRoutes } from "@/backend/craftRoutes";` e `...craftRoutes,` junto de `...facilityRoutes,`. `worldLobbyGuard.ts`: acrescentar depois de `facilities/request`:

```ts
  "/api/saves/:saveId/facilities/cancel",
  "/api/saves/:saveId/craft/buy",
  "/api/saves/:saveId/craft/queue",
  "/api/saves/:saveId/craft/queue/:jobId",
  "/api/saves/:saveId/craft/workshop",
  "/api/saves/:saveId/craft/recycle",
```

- [ ] **Step 3: Teste das rotas.** Copie o esqueleto de `src/backend/facilities.routes.test.ts` (save, assento, `call`) e cubra:
  1. `GET /craft` devolve `workshop: 1`, `benches: 2`, estoque com materiais (> 0: o estoque inicial).
  2. `POST /craft/buy { items: [{ material: "steel", supplier: "good", qty: 3 }] }` → 200, estoque `steel.good` +3, o extrato da temporada ganhou uma linha `facilities` negativa com `ref.facility === "materials"` e soma do extrato = saldo.
  3. `POST /craft/buy { items: [] }` → 400 `invalidOrder`.
  4. `POST /craft/queue { component: "gymKit", qty: 1 }` → 400 `locked`; `{ component: "beam", qty: 1 }` → 200 e a fila tem 1 ordem.
  5. `POST /craft/queue/:id { action: "cancel" }` → 200 e a fila fica vazia.
  6. `POST /craft/recycle { item: "gym" }` → 200, o nível do item baixou 1 e `returned` não está vazio.
  7. Desempregado (o teste de `jobs` mostra como): `GET /craft` → 409 `noClub`.

- [ ] **Step 4: Rodar** `bun test src/backend/craft.routes.test.ts`, `bun test src/backend/worlds/worldLobbyGuard.test.ts` se existir, `bun run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/backend/craftRoutes.ts src/backend/craft.routes.test.ts src/backend/routes.ts src/backend/worlds/worldLobbyGuard.ts
git commit -m "feat(craft): workshop, shop and stock routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Montar as obras com o estoque

**Files:**
- Modify: `src/backend/facilityRoutes.ts` (`forecast`, `itemsView`, `facilitiesView`, rota `facilities/request`, rota nova `facilities/cancel`)
- Modify: `src/backend/facilities.routes.test.ts` (os testes que esperam a diretoria)

- [ ] **Step 1: Trocar a previsão pela receita.** Substituir `Forecast`/`forecast` por:

```ts
interface Build {
  recipe: ComponentCounts;
  missing: ComponentCounts;
  canBuild: boolean;
}

function buildOf(quote: ProjectQuote, f: ClubFacilities, revenue: number): Build {
  const recipe = recipeFor({ kind: quote.kind, ...(quote.item ? { item: quote.item } : {}) }, quote.cost, revenue);
  const missing = missingComponents(f.craft!.stock, recipe);
  return { recipe, missing, canBuild: Object.keys(missing).length === 0 };
}
```

Em `itemsView`, `withForecast` vira `(q) => (q ? { ...q, build: buildOf(q, f, money.revenue) } : null)`; em `facilitiesView`, `turfQuotes` usa `build: buildOf(q, f, revenue)` e `quotes.comfort|training|academy` ganham `build` do mesmo jeito; na resposta acrescentar `stock: f.craft!.stock`. Tirar `MoneyContext`, `committed` e `boardDecision` do import se ficarem sem uso.

- [ ] **Step 2: A rota de obra monta.** Na rota `facilities/request`, trocar tudo depois de `if (!quote) { … }` por:

```ts
      const group = requestGroup(request);
      if (groupBusy(f, group)) return Response.json({ error: "busy", group }, { status: 409 });
      const b = buildOf(quote, f, revenue);
      if (!b.canBuild) return Response.json({ error: "missingComponents", missing: b.missing }, { status: 409 });
      const taken = takeComponents(f.craft!.stock, b.recipe)!;
      const quality = worksQuality(taken.taken);
      let stock = taken.stock;
      // A rebuild gives back a quarter of the recipe of the old item (common quality).
      if (quote.kind === "rebuild") {
        for (const [id, n] of Object.entries(shareOf(b.recipe, CRAFT.REBUILD_RETURN)) as [ComponentId, number][]) stock = addComponents(stock, id, { common: n });
      }
      const next = startCraftProject({ ...f, craft: { ...f.craft!, stock } }, quote, {
        id: `fac_${randomUUID()}`, date: h.date, components: b.recipe, quality,
      });
      const squad = withFacilities(h.squad, next);
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, squad);
      const project = next.projects.at(-1)!;
      await emitInboxMessage(saveId, buildFacilityMessage({
        date: h.date, kind: "built", facility: quote.kind, end: project.end, quality,
        ...(quote.item ? { item: quote.item } : {}), ...(quote.stand ? { stand: quote.stand, seats: quote.seats } : {}),
      }), saveService, auth.seatId);
      return Response.json({ built: true, quality, project, view: await facilitiesView({ ...h, squad }) });
```

O ramo `quote.small` (reforma paga na hora) sai: toda reforma vai pelos componentes. Imports: `recipeFor` (recipes), `missingComponents`, `takeComponents`, `addComponents`, `worksQuality` (stock), `shareOf` (recycle), `CRAFT`, `startCraftProject`, tipos `ComponentCounts`, `ComponentId`. Tirar `payRepairNow`, `inUnit`, `boardDecision` se ficarem sem uso.

- [ ] **Step 3: Cancelar uma obra em andamento.** Nova rota no mesmo objeto:

```ts
  /** `POST { projectId }`: stops a craft works and gives back half its components (common quality). */
  "/api/saves/:saveId/facilities/cancel": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const id = (body as { projectId?: unknown } | null)?.projectId;
    if (typeof id !== "string") return Response.json({ error: "invalidRequest" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const h = await loadHuman(saveId, auth.seatId);
      if (h instanceof Response) return h;
      const f = h.squad.facilities!;
      const p = f.projects.find((x) => x.id === id && x.craft);
      if (!p) return Response.json({ error: "notFound" }, { status: 404 });
      let stock = f.craft!.stock;
      for (const [cid, n] of Object.entries(shareOf(p.components ?? {}, CRAFT.CANCEL_RETURN)) as [ComponentId, number][]) stock = addComponents(stock, cid, { common: n });
      const squad = withFacilities(h.squad, { ...f, projects: f.projects.filter((x) => x.id !== id), craft: { ...f.craft!, stock } });
      await saveService.saveSquad(saveId, h.ref.leagueSlug, h.ref.clubSlug, squad);
      return Response.json({ view: await facilitiesView({ ...h, squad }) });
    });
  },
```

- [ ] **Step 4: Atualizar os testes antigos.** `src/backend/facilities.routes.test.ts`: os casos de diretoria (recusa sem dinheiro, aprovação com 50%, parcelas, verba da diretoria) deixam de valer. Trocar por:
  1. pedir uma reforma sem componentes → 409 `missingComponents` com `missing`;
  2. pôr no estoque os componentes da receita (ler `view.items[gym].quotes.repair["100"].build.recipe`, somar com `addComponents` direto no elenco salvo), pedir de novo → 200 `built`, o estoque perdeu a receita, a obra tem `craft: true`, nenhuma linha nova no extrato;
  3. avançar até o fim da obra (como o teste antigo de conclusão fazia): o item está a 100% e, se a receita era toda Excelente, `quality === "excellent"`;
  4. `busy` com a área ocupada continua 409;
  5. `facilities/cancel` devolve metade.
  Manter os testes de setor, demissão (`noClub`) e mowing que não dependem da diretoria.

- [ ] **Step 5: Rodar** `bun test src/backend/facilities.routes.test.ts`, `bun test src/backend/facilities.advanceDay.test.ts`, `bun run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/backend/facilityRoutes.ts src/backend/facilities.routes.test.ts
git commit -m "feat(craft): facility works built from the stock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Telas (abas do Clube, Oficina, Estoque, Loja)

**Files:**
- Create: `src/GameInterface/Craft/craftApi.ts`, `ClubTabs.tsx`, `WorkshopView.tsx`, `StockView.tsx`, `ShopView.tsx`, `RecipeLine.tsx`
- Modify: `src/GameInterface/ClubScreen.tsx`, `src/GameInterface/Facilities/FacilityItemsPanel.tsx:250-300`, `TurfCard.tsx:55-66`, `FacilitiesView.tsx` (os botões de obra de grupo e de setor)
- i18n `craft.*`

- [ ] **Step 1: API do cliente**

```ts
// src/GameInterface/Craft/craftApi.ts
import type { ComponentCounts, ComponentId, CraftJob, CraftStock, MaterialId, Supplier } from "@/types/craftTypes";

export interface CraftView {
  date: string;
  workshop: number; benches: number; maxQueue: number;
  foremanStars: number; foremanSpeed: number;
  stock: CraftStock;
  queue: (CraftJob & { daysLeft: number | null })[];
  shop: { material: MaterialId; standard: number; good: number; previous: number }[];
  discount: boolean; allowance: number; balance: number;
  recipes: { component: ComponentId; materials: Partial<Record<MaterialId, number>>; days: number; minLevel: number; locked: boolean }[];
  upgrade: { level: number; recipe: ComponentCounts } | null;
}

async function call<T>(url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: json as T } : { ok: false, error: (json as { error?: string }).error ?? "generic" };
  } catch {
    return { ok: false, error: "generic" };
  }
}

const base = (saveId: string) => `/api/saves/${encodeURIComponent(saveId)}/craft`;
export const fetchCraft = (saveId: string) => call<CraftView>(base(saveId));
export const buyMaterials = (saveId: string, items: { material: MaterialId; supplier: Supplier; qty: number }[]) =>
  call<{ total: number; view: CraftView }>(`${base(saveId)}/buy`, { items });
export const queueComponent = (saveId: string, component: ComponentId, qty: number) => call<CraftView>(`${base(saveId)}/queue`, { component, qty });
export const queueAction = (saveId: string, jobId: string, action: "up" | "down" | "cancel") =>
  call<CraftView>(`${base(saveId)}/queue/${encodeURIComponent(jobId)}`, { action });
export const upgradeWorkshop = (saveId: string) => call<CraftView>(`${base(saveId)}/workshop`, {});
export const recycleItem = (saveId: string, item: string) => call<{ returned: ComponentCounts; view: CraftView }>(`${base(saveId)}/recycle`, { item });
```

- [ ] **Step 2: Abas do Clube**

```tsx
// src/GameInterface/Craft/ClubTabs.tsx
import { useTranslation } from "react-i18next";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";

export type ClubTab = "facilities" | "workshop" | "stock" | "shop";
const TABS: ClubTab[] = ["facilities", "workshop", "stock", "shop"];

export function ClubTabs({ active, onChange }: { active: ClubTab; onChange: (t: ClubTab) => void }) {
  const { t } = useTranslation();
  return <SegmentedTabs aria-label={t("craft.tabs.label")} active={active} onChange={onChange}
    tabs={TABS.map((k) => ({ key: k, label: t(`craft.tabs.${k}`) }))} />;
}
```

Em `ClubScreen.tsx`: estado `tab` lido de `?tab=` (`useRoute()`), `<ClubTabs>` abaixo do `ClubSponsorsStrip`, e o conteúdo por aba: `facilities` = `FacilitiesView` de hoje, `workshop` = `<WorkshopView saveId=… />`, `stock` = `<StockView saveId=… />`, `shop` = `<ShopView saveId=… cart={cart} />`. Trocar de aba grava `?tab=` com `navigate(path, { replace: true })`. O carrinho vindo de "Comprar o que falta" (Step 6) é um estado do `ClubScreen` passado para a Loja.

- [ ] **Step 3: Linha da receita**

```tsx
// src/GameInterface/Craft/RecipeLine.tsx
import { useTranslation } from "react-i18next";
import type { ComponentCounts, ComponentId } from "@/types/craftTypes";

/** "4 vigas · 8 assentos (faltam 3)" — what a works takes and what the stock is short of. */
export function RecipeLine({ recipe, missing }: { recipe: ComponentCounts; missing: ComponentCounts }) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
      {(Object.entries(recipe) as [ComponentId, number][]).map(([id, n]) => (
        <li key={id} className={missing[id] ? "text-destructive" : "text-foreground"}>
          {t("craft.recipeItem", { count: n, name: t(`craft.component.${id}`) })}
          {missing[id] ? ` ${t("craft.missing", { count: missing[id] })}` : ""}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Instalações.** Em `FacilityItemsPanel.tsx` (bloco das cotações, linha ~258 onde lê `quote.forecast`), `TurfCard.tsx` (linhas 55–66) e nos botões de obra de grupo e de setor de `FacilitiesView.tsx` (`grep -n "forecast\|reason\." src/GameInterface/Facilities/FacilitiesView.tsx`):
  - no lugar do texto da previsão (aprovado, diretoria paga N%, motivo da recusa), `<RecipeLine recipe={q.build.recipe} missing={q.build.missing} />`;
  - o botão de pedir vira **Montar** (`craft.build`), ligado só com `q.build.canBuild`;
  - ao lado, quando falta algo: **Fabricar o que falta** (`craft.craftMissing`) chama `queueComponent` para cada componente faltante com a quantidade que falta (erro `missingMaterials` mostra `craft.errors.missingMaterials` e oferece o botão seguinte) e **Comprar os materiais que faltam** (`craft.buyMissing`) leva à aba Loja com o carrinho: para cada componente faltante, `materialsFor(id, falta)` somado (importar `materialsFor` de `@/Domain/craft/workshop`) menos os materiais do estoque;
  - o tipo da cotação no cliente troca `forecast` por `build: { recipe; missing; canBuild }` (procurar a interface com `grep -rn "forecast" src/GameInterface/Facilities/facilitiesApi.ts`);
  - selo de qualidade no cartão do item quando `item.quality` existe: `<span className="text-sm font-semibold text-primary">{t(`craft.quality.${quality}`)}</span>`;
  - obra em andamento com `craft: true`: botão **Cancelar obra** com confirmação (`craft.cancelWorks`, `craft.cancelConfirm`: "Metade dos componentes volta ao estoque"), chamando `POST /facilities/cancel`.

- [ ] **Step 5: Oficina, Estoque, Loja.** Componentes com `fetchCraft` no `useEffect` e o `view` devolvido por cada ação como novo estado; erros pela chave `craft.errors.<código>`.
  - **`WorkshopView`**: título de seção "OFICINA" com "Nível N de 5" e "N bancadas"; cartões das bancadas (as `benches` primeiras ordens com `startedOn`: componente, quantidade, barra `daysLeft / days`, dias restantes; bancada livre = cartão tracejado "Livre"); fila (`TABLE_STYLE`): componente, quantidade, dias, botões ↑ ↓ Cancelar (`queueAction`); bloco "Fabricar": `OptionChips` dos componentes destravados, quantidade com `StepperField` (1..100), materiais que vai gastar, botão Fabricar (`queueComponent`); receitas travadas listadas com "Oficina nível N"; bloco "Melhorar a oficina" com `RecipeLine` de `view.upgrade` e botão (`upgradeWorkshop`), escondido no nível 5; linha do mestre de obras ("Mestre de obras: N★ · tempo ×0,90").
  - **`StockView`**: duas tabelas (`TABLE_STYLE`): materiais (material, padrão, bom, valor no preço da semana) e componentes (componente, comum, bom, excelente); bloco "Reciclar": seletor do item (`FACILITY_ITEMS` com o nome `facilities.items.<id>`), texto "Baixa um nível e devolve 40% dos componentes" e botão com confirmação (`recycleItem`), mostrando o que voltou.
  - **`ShopView`**: tabela dos 6 materiais: nome, preço padrão, preço bom, seta contra a semana anterior (`standard > previous` ↑ em `text-destructive`, menor ↓ em `text-primary`), quantidade padrão e boa com `StepperField`; rodapé com total (soma das linhas), saldo, "Desconto da diretoria: 10%" quando `discount`, "Verba deste mês: €X" e botão Comprar (`buyMaterials`); recebe `cart` (`MaterialCounts`) e o põe nas quantidades padrão ao abrir.
  - Ícones: usar `Icon` existentes nesta tarefa (`hammer`, `package`, `store` — conferir em `Icons.tsx`; adicionar a `IconName` e ao `ICON_MAP` o que faltar, do `lucide-react`). Os ícones pintados dos materiais e componentes (spec §10) são a Task 14.

- [ ] **Step 6: i18n.** Script python (mesmo padrão do resto do projeto) acrescentando em en e pt-BR o bloco `craft`:

```json
{
  "tabs": { "label": "Club sections", "facilities": "Facilities", "workshop": "Workshop", "stock": "Stock", "shop": "Shop" },
  "material": { "concrete": "Concrete", "steel": "Steel", "wood": "Wood", "grass": "Turf rolls", "fabric": "Fabric", "electronics": "Electronics" },
  "component": { "beam": "Beams", "slab": "Slabs", "turfPanel": "Turf panels", "seat": "Seats", "floodlight": "Floodlights", "gymKit": "Gym machines", "medKit": "Medical kits", "furniture": "Furniture" },
  "quality": { "common": "Common", "good": "Good", "excellent": "Excellent" },
  "recipeItem": "{{count}} {{name}}",
  "missing_one": "({{count}} missing)", "missing_other": "({{count}} missing)",
  "build": "Build", "craftMissing": "Make what is missing", "buyMissing": "Buy the missing materials",
  "cancelWorks": "Cancel works", "cancelConfirm": "Half the components go back to the stock.",
  "workshopLevel": "Level {{level}} of 5", "benches": "{{count}} benches", "free": "Free", "queue": "Queue",
  "make": "Make", "lockedAt": "Workshop level {{level}}", "upgrade": "Upgrade the workshop", "foreman": "Foreman: {{stars}}★ · time {{value}}",
  "stockMaterials": "Materials", "stockComponents": "Components", "recycle": "Recycle", "recycleHint": "Takes the item down one level and gives back 40% of its components.",
  "shopTotal": "Total", "buy": "Buy", "discount": "Board discount: 10%", "allowance": "This month's board materials: {{value}}",
  "errors": { "locked": "The workshop is not at that level yet.", "invalidQty": "Invalid quantity.", "queueFull": "The queue is full (10 orders).", "missingMaterials": "Not enough materials in stock.", "missingComponents": "Not enough components in stock.", "invalidOrder": "Invalid order.", "maxLevel": "The workshop is at the top level.", "minLevel": "The item is at level 1.", "busy": "There is works on this item.", "noClub": "You have no club.", "generic": "Could not complete the action." }
}
```

e em pt-BR:

```json
{
  "tabs": { "label": "Seções do clube", "facilities": "Instalações", "workshop": "Oficina", "stock": "Estoque", "shop": "Loja" },
  "material": { "concrete": "Concreto", "steel": "Aço", "wood": "Madeira", "grass": "Rolos de grama", "fabric": "Tecido", "electronics": "Eletrônicos" },
  "component": { "beam": "Vigas", "slab": "Lajes", "turfPanel": "Placas de grama", "seat": "Assentos", "floodlight": "Refletores", "gymKit": "Aparelhos de academia", "medKit": "Kits médicos", "furniture": "Móveis" },
  "quality": { "common": "Comum", "good": "Boa", "excellent": "Excelente" },
  "recipeItem": "{{count}} {{name}}",
  "missing_one": "(falta {{count}})", "missing_other": "(faltam {{count}})",
  "build": "Montar", "craftMissing": "Fabricar o que falta", "buyMissing": "Comprar os materiais que faltam",
  "cancelWorks": "Cancelar obra", "cancelConfirm": "Metade dos componentes volta ao estoque.",
  "workshopLevel": "Nível {{level}} de 5", "benches": "{{count}} bancadas", "free": "Livre", "queue": "Fila",
  "make": "Fabricar", "lockedAt": "Oficina nível {{level}}", "upgrade": "Melhorar a oficina", "foreman": "Mestre de obras: {{stars}}★ · tempo {{value}}",
  "stockMaterials": "Materiais", "stockComponents": "Componentes", "recycle": "Reciclar", "recycleHint": "Baixa o item um nível e devolve 40% dos componentes.",
  "shopTotal": "Total", "buy": "Comprar", "discount": "Desconto da diretoria: 10%", "allowance": "Materiais da diretoria neste mês: {{value}}",
  "errors": { "locked": "A oficina ainda não tem esse nível.", "invalidQty": "Quantidade inválida.", "queueFull": "A fila está cheia (10 pedidos).", "missingMaterials": "Faltam materiais no estoque.", "missingComponents": "Faltam componentes no estoque.", "invalidOrder": "Pedido inválido.", "maxLevel": "A oficina está no nível máximo.", "minLevel": "O item está no nível 1.", "busy": "Já há obra neste item.", "noClub": "Você está sem clube.", "generic": "Não deu para concluir." }
}
```

  mais `inbox.facilities.craft_allowance` / `craft_done` / `built` (en: "The board sent materials", "Workshop: components ready", "Works started: {{item}}"; pt-BR: "A diretoria mandou materiais", "Oficina: componentes prontos", "Obra começou: {{item}}") e `financesScreen.ledgerText.craftMaterials`.

- [ ] **Step 7: Rodar** `bun test src/GameInterface/ui/uiAudit.test.ts` (0 duras), `bun test src/i18n`, `bun run typecheck`, e `bun run ui:audit` sem leves novas nos arquivos de `Craft/`.

- [ ] **Step 8: Conferir no navegador (servidor de teste)** e mandar print das quatro abas ao usuário antes de publicar (memória: render real antes de publicar mudança de tela). Receita do print: Chrome com `--remote-debugging-port=9222`, `bun run dev` com `DEV_AUTO_LOGIN=1` e `PORT=3100` em `C:\Projects\FMProject-reports`, script CDP de prints da sessão.

- [ ] **Step 9: Commit**

```bash
git add src/GameInterface/Craft src/GameInterface/ClubScreen.tsx src/GameInterface/Facilities src/GameInterface/Icons.tsx src/i18n/locales/en.json src/i18n/locales/pt-BR.json
git commit -m "feat(craft): club workshop, stock and shop screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Ícones pintados dos materiais e componentes

**Files:**
- Create: `data_process/assets/craft_icons/build_craft_icons.py` (sem commit, como os outros geradores de arte)
- Output: `src/example_data/assets/craft/<id>.webp` (14 arquivos, `GAME_ART_FILES`)
- Modify: `src/backend/staticAssets.ts` (lista `GAME_ART_FILES`), `src/GameInterface/Craft/*` (`<img>` com o visual novo)

- [ ] **Step 1:** Layout vetorial (PIL) de cada ícone, 256 px, fundo transparente: concreto (saco), aço (barras), madeira (tábuas), rolos de grama, tecido (rolo), eletrônicos (placa); viga, laje, placa de grama, assento, refletor, aparelho, kit médico, móvel. Um pedido por vez ao ComfyUI (FLUX.2 klein img2img, força 0,55), um de cada vez (memória: nunca dois FLUX juntos), recorte do fundo e `webp`.
- [ ] **Step 2:** Revisar os 14 e repintar os com defeito antes de seguir (memória: refazer falhas do FLUX).
- [ ] **Step 3:** `GAME_ART_FILES` ganha `craft/<id>.webp`; nas telas, com o visual novo (`newVisualOn`), o ícone pintado de 32 px ao lado do nome; sem ele, só o nome.
- [ ] **Step 4:** Mock das quatro abas com os ícones para o usuário (pasta no Desktop e abrir no Explorer). Esperar o ok.
- [ ] **Step 5: Commit** (só as imagens e o código):

```bash
git add src/example_data/assets/craft src/backend/staticAssets.ts src/GameInterface/Craft
git commit -m "feat(craft): painted icons for materials and components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Medição, smoke, regras e changelog

**Files:**
- Create: `scripts/craft-measure.ts`
- Modify: `scripts/season-rollover-smoke.ts` (seção "Instalações"), `.claude/rules/game/facilities.md`, `.claude/rules/game/staff.md`, `docs/superpowers/specs/2026-11-18-club-craft-design.md`, `src/Domain/changelog/changelogData.ts`, `package.json`

- [ ] **Step 1: Medição M1.**

```ts
// scripts/craft-measure.ts
// M1 (spec §13): value of each works' recipe at base prices × its money cost today, for the clubs of two leagues.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { initialFacilities, quoteProject } from "@/Domain/facilities/facilities";
import { FACILITY_ITEMS } from "@/Domain/facilities/facilityItems";
import { recipeFor, recipeValue } from "@/Domain/craft/recipes";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { FacilityRequest } from "@/types/facilityTypes";
import type { Squad } from "@/types/playerTypes";

const ratios: Record<string, number[]> = {};
for (const league of ["premier_league", "brazil_serie_a"]) {
  const dir = join("src/Data/squads", league);
  for (const file of readdirSync(dir)) {
    const squad = JSON.parse(readFileSync(join(dir, file), "utf8")) as Squad;
    const revenue = wageRevenueBasisOf(squad);
    const f = initialFacilities(squad, 1);
    const reqs: FacilityRequest[] = [
      { kind: "stand", stand: "east", seats: 3000 }, { kind: "comfort" }, { kind: "training" }, { kind: "academy" },
      ...FACILITY_ITEMS.flatMap((item) => [{ kind: "repair", item, to: 100 } as FacilityRequest, { kind: "upgrade", item } as FacilityRequest]),
    ];
    for (const req of reqs) {
      const q = quoteProject(f, req, { revenue, seatCost: 3000 });
      if (!q || q.cost <= 0) continue;
      const r = recipeFor({ kind: q.kind, ...(q.item ? { item: q.item } : {}) }, q.cost, revenue);
      (ratios[q.kind] ??= []).push(recipeValue(r, revenue) / q.cost);
    }
  }
}
for (const [kind, xs] of Object.entries(ratios)) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`${kind.padEnd(8)} n=${xs.length} recipe/cost mean ${mean.toFixed(3)} min ${Math.min(...xs).toFixed(2)} max ${Math.max(...xs).toFixed(2)}`);
}
```

Run: `bun scripts/craft-measure.ts`
Expected: média de cada tipo entre 0,95 e 1,05. Reformas pequenas (cost menor que uma mistura) puxam a média para cima: se `repair` passar de 1,05, registrar o número no spec como limitação (uma unidade de cada componente é o mínimo) em vez de mudar a regra.

- [ ] **Step 2: Smoke.** Em `scripts/season-rollover-smoke.ts`, seção "Instalações": a reforma pedida pela rota passa a: comprar pela rota `craft/buy` os materiais da receita (ler `build.recipe` da cotação, `materialsFor` de cada componente), enfileirar pela rota `craft/queue`, avançar os dias até a fila esvaziar, pedir a reforma (200 `built`) e conferir a entrega (`repaired`). A checagem antiga "parcelas = custo e verba = parte da diretoria" sai (obra de craft não tem parcela). Não rodar o smoke inteiro sem o usuário pedir (memória); rodar só se pedido.

- [ ] **Step 3: Regras.** `.claude/rules/game/facilities.md`: seção nova "Craft (fase 1)" com o resumo (materiais, componentes, receitas pelo custo, preço pela receita do clube, lote de 5, bancadas 2..6, qualidade e desgaste, verba mensal pela diretoria, desconto, reciclar, cancelar, rotas e telas, decisões 1–5 deste plano) e marcar que "Diretoria e dinheiro" / "Reforma paga na hora" valem só para as obras em andamento de antes. `.claude/rules/game/staff.md`: linha da função `foreman`. Spec: anotar as decisões 1–5 na seção correspondente (§3 preço pela receita, §4 lote e oficina sem desgaste, §6 Excelente só no desgaste nesta fase).

- [ ] **Step 4: Changelog.** Entrada `12.19` (feature = nova minor; conferir a última versão em `changelogData.ts` antes): item `tab: "club"`: pt "Oficina do clube: as obras agora são montadas com componentes que você fabrica com materiais comprados na loja. A diretoria manda materiais todo mês, e obras bem feitas gastam mais devagar." / en "Club workshop: works are now built with components you make from materials bought in the shop. The board sends materials every month, and well-made works wear more slowly." `package.json` `"version": "12.19"`. Tirar do `upcoming` o item do craft, se houver.

- [ ] **Step 5: Rodar** `bun test src/GameInterface/changelog`, `bun test src/Domain/craft/stock.test.ts` (e os outros do diretório, um por vez), `bun run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add scripts/craft-measure.ts scripts/season-rollover-smoke.ts .claude/rules/game/facilities.md .claude/rules/game/staff.md docs/superpowers/specs/2026-11-18-club-craft-design.md src/Domain/changelog/changelogData.ts package.json
git commit -m "docs(craft): rules, measurement, changelog 12.19

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7:** Resumo ao usuário com os prints e o M1; publicar só com o ok dele (checar partidas ao vivo antes, hora do changelog em São Paulo num commit à parte).

---

## Self-review

- Spec §1 materiais/componentes → Tasks 1, 5. §2 receitas, montar, cancelar, reciclar → Tasks 4, 6, 11, 12. §3 loja → Tasks 3, 11, 13. §4 oficina → Tasks 5, 11, 13. §5 mestre → Task 8. §6 qualidade → Tasks 5, 7, 12 (Excelente só desgaste: decisão 4). §7 diretoria → Tasks 6, 10, 12. §8 dados → Tasks 1, 7, 10. §9 rotas → Tasks 11, 12. §10 telas e caixa → Tasks 9, 13, 14. §11 dia → Task 10. §13 testes e M1 → Tasks 2–12, 15. Cartão Obras do Painel mostrando a fabricação: acrescentar no Step 5 da Task 13 — `WorksCard` (`Dashboard/HomeCards.tsx`) lê `GET /craft` e mostra "Oficina: N pedidos, o próximo pronto em X dias" quando a fila não está vazia.
- Tipos usados nas tasks seguintes: `ClubCraft`, `CraftJob`, `ComponentCounts`, `MaterialCounts`, `CraftQuality` (Task 1); `newCraft`, `enqueue`, `advanceQueue`, `cancelJob`, `moveJob`, `benchCount`, `materialsFor` (Task 5); `recipeFor`, `recipeValue`, `mixFor` (Task 4); `takeComponents`, `missingComponents`, `addComponents`, `addMaterials`, `worksQuality` (Task 2); `startCraftProject` (Task 7); `foremanStarsOf`, `foremanSpeedOf` (Task 8); `ensureCraft`, `craftDay` (Task 10). Nomes conferidos entre as tasks.
