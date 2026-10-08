# Instalações vivas (Etapa 34) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** as instalações do clube do jogador viram 10 itens (estádio, CT, base) com nível "N de 10" e condição 0–100% que se desgasta (tempo, jogos em casa, treinos; gramados mantidos pelo jardineiro); abaixo de 40% pesam (lesões pelo gramado, evolução e recuperação pelo CT, safra pela base, público pelo estádio), abaixo de 15% ficam interditados até a reconstrução; reformas parciais a qualquer momento (pequenas pagas do caixa, grandes pela diretoria); o gramado dos clubes da IA cai durante a temporada e mexe nas lesões de todo jogo no estádio deles; instalações ruins encarecem e dificultam contratações.

**Architecture:** lógica pura em `src/Domain/facilities/` (`facilityItems.ts`: condição, desgaste, níveis derivados, efeitos; `pitch.ts`: gramado da IA e do jogo; `facilities.ts`: reformas e projetos por item, sobre o mecanismo de obras/parcelas de hoje). O fator do gramado entra nas lesões como multiplicador por time (`injuryMult` do motor, `staffMult` do quickSim). O avanço do dia muda em **dois pontos localizados**: o cálculo do gramado de cada partida (uma linha antes de `buildMatchEvent`/`buildQuickMatchEvent`) e o bloco de instalações do clube humano (desgaste do dia + avisos). Nada é gravado para a IA.

**Tech Stack:** Bun + TypeScript, React 19 + Tailwind.

Spec: `docs/superpowers/specs/2026-10-08-living-facilities-design.md`. Regras que valem em toda tarefa:
- Imports sempre `@/`; nada de PowerShell `Set-Content`; `core.autocrlf=true` — arquivos em CRLF no disco e LF no índice; conferir `git diff --stat` (nenhum arquivo convertido inteiro). `src/GameInterface/changelog/changelog.ts` é CRLF: editar com a ferramenta Edit e conferir que continua 100% CRLF (`grep -c $'\r$'` = número de linhas). Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca commitar `src/Data` nem saves; protótipo, sem migração.
- Worktree `C:/Projects/FMProject-facilities`, branch `feat/living-facilities` (já criada a partir da 4.7.1, com `src/Data` e `bun install`).
- **Merge:** outras branches em andamento mexem em `advanceDay.ts`, inbox, moral e mercado (4.8/4.9) e nos olheiros (4.10). Em `advanceDay.ts` toque só o import, a linha do gramado antes da simulação da partida (Tarefa 8) e o bloco "Facilities day" (Tarefa 8); nada de reformatar nem mover código vizinho.
- Antes de cada commit: `bunx tsc --noEmit -p .` limpo e os testes da tarefa passando. Telas: `bun run ui:audit` sem violações novas.

---

### Task 1: Tipos e constantes dos itens

**Files:** Modify `src/types/facilityTypes.ts`, `src/Domain/facilities/facilityConfig.ts`; Create `src/Domain/facilities/facilityItems.test.ts` (só o bloco de configuração nesta tarefa).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { FACILITY_ITEMS, ITEM_GROUP, itemsOfGroup } from "@/Domain/facilities/facilityItems";

describe("facility items config", () => {
  test("ten items in three groups", () => {
    expect(FACILITY_ITEMS).toHaveLength(10);
    expect(itemsOfGroup("stadium")).toEqual(["stadiumPitch", "seats", "stadiumStructure"]);
    expect(itemsOfGroup("training")).toEqual(["trainingPitches", "gym", "pool", "physio", "canteen"]);
    expect(itemsOfGroup("academy")).toEqual(["academyPitches", "academyLodging"]);
  });
  test("lives 1..5 seasons and wear shares sum to 1", () => {
    for (const id of FACILITY_ITEMS) {
      const it = F.ITEMS[id];
      expect(it.life).toBeGreaterThanOrEqual(1);
      expect(it.life).toBeLessThanOrEqual(5);
      expect(it.time + it.matches + it.training).toBeCloseTo(1, 9);
      expect(ITEM_GROUP[id]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/facilities/facilityItems.test.ts` → FAIL.

- [ ] **Step 3: Implementação**

`facilityTypes.ts`:

```ts
export type FacilityItemId =
  | "stadiumPitch" | "seats" | "stadiumStructure"
  | "trainingPitches" | "gym" | "pool" | "physio" | "canteen"
  | "academyPitches" | "academyLodging";
export type FacilityGroup = "stadium" | "training" | "academy";

export interface FacilityItem {
  /** 1..10 ("N de 10"). */
  level: number;
  /** Fraction of the useful life consumed (≥ 0); the condition is derived (`conditionOf`). */
  wear: number;
  /** Below 15%: unusable (condition counts 0, level 1) until rebuilt. */
  condemned?: true;
  /** Last threshold warned (40 or 15); cleared when the condition goes back above it. */
  alert?: 40 | 15;
}
```

- `FacilityKind` ganha `"repair" | "rebuild" | "upgrade"`; `FacilityProject` e `CompletedFacilityProject` ganham `item?: FacilityItemId` e `to?: number` (condição-alvo da reforma).
- `ClubFacilities`: **remover** `comfort`, `training`, `academy`; acrescentar `items: Record<FacilityItemId, FacilityItem>`.
- `FacilityRequest` ganha `| { kind: "repair"; item: FacilityItemId; to: number } | { kind: "rebuild" | "upgrade"; item: FacilityItemId }`.

`facilityConfig.ts` (acrescentar, sem mexer nas tabelas de hoje):

```ts
  /** Living facilities (`docs/superpowers/specs/2026-10-08-living-facilities-design.md`). */
  ITEM_MAX_LEVEL: 10,
  /** life = seasons at level 5; time/matches/training = shares of a typical season's wear. */
  ITEMS: {
    stadiumPitch:     { group: "stadium",  life: 1,   time: 0.4, matches: 0.6, training: 0,   pitch: 1,   valueShare: 0.006, repairWeeks: 2, rebuildWeeks: 4 },
    seats:            { group: "stadium",  life: 4,   time: 0.6, matches: 0.4, training: 0,   pitch: 0,   valueShare: 0.03,  repairWeeks: 4, rebuildWeeks: 12 },
    stadiumStructure: { group: "stadium",  life: 5,   time: 1,   matches: 0,   training: 0,   pitch: 0,   valueShare: 0.025, repairWeeks: 4, rebuildWeeks: 16 },
    trainingPitches:  { group: "training", life: 1,   time: 0.4, matches: 0,   training: 0.6, pitch: 1,   valueShare: 0.008, repairWeeks: 2, rebuildWeeks: 4 },
    gym:              { group: "training", life: 2,   time: 0.3, matches: 0,   training: 0.7, pitch: 0,   valueShare: 0.008, repairWeeks: 3, rebuildWeeks: 6 },
    pool:             { group: "training", life: 4,   time: 0.6, matches: 0,   training: 0.4, pitch: 0,   valueShare: 0.006, repairWeeks: 3, rebuildWeeks: 8 },
    physio:           { group: "training", life: 3,   time: 0.7, matches: 0,   training: 0.3, pitch: 0,   valueShare: 0.006, repairWeeks: 3, rebuildWeeks: 8 },
    canteen:          { group: "training", life: 5,   time: 1,   matches: 0,   training: 0,   pitch: 0,   valueShare: 0.005, repairWeeks: 3, rebuildWeeks: 8 },
    academyPitches:   { group: "academy",  life: 1.5, time: 1,   matches: 0,   training: 0,   pitch: 0.5, valueShare: 0.006, repairWeeks: 2, rebuildWeeks: 4 },
    academyLodging:   { group: "academy",  life: 4,   time: 1,   matches: 0,   training: 0,   pitch: 0,   valueShare: 0.01,  repairWeeks: 4, rebuildWeeks: 10 },
  },
  WEAR: {
    /** condition = 100 × (1 − wear^POWER). */
    POWER: 2,
    WARN_BELOW: 40,
    CONDEMN_BELOW: 15,
    HOME_GAMES_REF: 25,
    TRAINING_DAYS_REF: 200,
    SESSION: { light: 0.7, normal: 1, heavy: 1.3 },
    /** lifeScale(level) = BASE + STEP × level (level 5 = 1). */
    LIFE_BASE: 0.75, LIFE_STEP: 0.05,
    /** Starting wear by kind (deterministic per club and item). */
    START_PITCH: [0.05, 0.25], START_OTHER: [0.05, 0.45],
    /** Effects at condition 0 (linear from 40%). */
    PITCH_INJURY_MAX: 1.6,
    TRAINING_PITCH_DEV_MIN: 0.95, GYM_DEV_MIN: 0.93, CANTEEN_DEV_MIN: 0.97,
    POOL_RECOVERY_MIN: 0.97, PHYSIO_RECOVERY_MIN: 0.97,
    /** Normal/light sessions on a bad training pitch: HEAVY_TRAINING_CHANCE × this × penalty. */
    NORMAL_TRAINING_INJURY_SHARE: 0.5,
    SEATS_DEMAND_MIN: 0.9, SEATS_PRICE_MIN: 0.95, STRUCTURE_DEMAND_MIN: 0.95,
    ACADEMY_QUALITY_MAX_LOSS: 0.15, LODGING_PROMISE_MIN: 0.8,
  },
  REPAIR: {
    /** Repair cost = value × Δcondition/100 × this; upgrade = value(level + 1) × this. */
    COST_SHARE: 0.6,
    /** ≤ this share of annual revenue: paid from the balance, no board. */
    SMALL_REPAIR_SHARE: 0.02,
    STEP: 5,
    UPGRADE_WEEKS_SHARE: 0.6,
  },
  /** Groundskeeper wear multiplier on pitches (stars 1/3/5; nobody = NONE; ×EXTRA per extra one). */
  GROUNDSKEEPER: { CURVE: [1.3, 1, 0.75], NONE: 1.6, EXTRA: 0.9 },
  /** AI home pitch: START − DROP × fraction of the home club's league window. Neutral venue: NEUTRAL. */
  AI_PITCH: {
    START: { LOW: 70, MEDIUM: 80, HIGH: 88, ELITE: 94 },
    DROP: { LOW: 40, MEDIUM: 44, HIGH: 40, ELITE: 30 },
    NEUTRAL: 90,
  },
  /** Signings (`contracts.ts`, `rivals.ts`): appeal below THRESHOLD costs up to DEMAND/PREFERENCE; refusal below REFUSE_BELOW. */
  APPEAL: { THRESHOLD: 50, DEMAND_MAX: 0.1, PREFERENCE_MAX: 0.1, REFUSE_BELOW: 25, YOUTH_MAX_AGE: 21 },
```

Em `facilityItems.ts` (arquivo novo, só o cabeçalho nesta tarefa): `FACILITY_ITEMS` (na ordem da tabela), `ITEM_GROUP`, `itemsOfGroup(g)`.

- [ ] **Step 4: Rodar** o teste → PASS. `bunx tsc --noEmit -p .` vai falhar nos leitores de `comfort/training/academy`: **não** os conserte aqui; comente no commit que a Task 3 fecha. (Se preferir manter o build verde entre tarefas, faça as Tasks 1–3 num commit só.)
- [ ] **Step 5: Commit** — `feat(instalações): tipos e constantes dos itens (Etapa 34)`.

---

### Task 2: Condição, desgaste e níveis derivados (puro)

**Files:** Modify `src/Domain/facilities/facilityItems.ts`, `facilityItems.test.ts`.

- [ ] **Step 1: Testes** (acrescentar)
  - `conditionOf({ wear: 0 })` = 100; `wear 0.775` → ~40; `wear ≥ 1` → 0; `condemned` → 0.
  - `wearFor(40)` inverso de `conditionOf` (±0,01).
  - `lifeScale(5)` = 1, `lifeScale(10)` = 1,25, `lifeScale(1)` = 0,8.
  - `wearDay`: 365 dias sem jogo nem treino, item de tempo puro (`canteen`, vida 5, nível 5) soma 0,2; uma temporada típica (25 jogos em casa, 200 treinos normais, 365 dias) do `stadiumPitch` nível 5 com fator do jardineiro 1 soma 1,0 (±1e-9); treino pesado gasta 1,3× o normal; o fator do jardineiro só mexe nos gramados (`academyPitches` com metade do desvio).
  - `groupLevel` com todos os itens do CT em 6 = 3; com um interditado (nível 6) o grupo cai (`(6×4 + 1)/10` = 2,5); `comfortLevel` = `seats.level / 2`.
  - `lerpLevel([0.95, 0.975, 1, 1.05, 1.1], 3)` = 1; `(…, 3.5)` = 1,025; abaixo de 1 / acima de 5 travam.
  - `penalty(40)` = 0, `penalty(20)` = 0,5, `penalty(0)` = 1; `effectAt(min, cond)` linear.
  - `initialItems(squad)` determinístico por clube; nenhum item abaixo de 80%; níveis = 2 × implícito, assentos 2.
  - `crossings(prev, next)`: item que passa de 41 → 39 devolve `worn`; de 16 → 14 devolve `condemned` e marca `condemned`; não repete o aviso; volta acima de 40 limpa `alert`.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação** (`facilityItems.ts`)

```ts
const W = F.WEAR;

export function conditionOf(it: Pick<FacilityItem, "wear" | "condemned">): number {
  if (it.condemned) return 0;
  return 100 * (1 - Math.pow(clamp(it.wear, 0, 1), W.POWER));
}
export const wearFor = (condition: number) => Math.pow(1 - clamp(condition, 0, 100) / 100, 1 / W.POWER);
export const lifeScale = (level: number) => W.LIFE_BASE + W.LIFE_STEP * clamp(level, 1, F.ITEM_MAX_LEVEL);
export const penalty = (condition: number) => clamp((W.WARN_BELOW - condition) / W.WARN_BELOW, 0, 1);
/** Multiplier `1 → atZero` as the condition goes 40% → 0%. */
export const effectAt = (atZero: number, condition: number) => 1 + (atZero - 1) * penalty(condition);

export interface WearDayInput {
  homeGames: number;                                  // home games of the human club today
  session: "light" | "normal" | "heavy" | null;       // training today (null: match, rest, no club)
  pitchWearMult: number;                              // groundskeeper (`staffEffectsOf().pitchWearMult`)
}

export function itemWearToday(id: FacilityItemId, level: number, d: WearDayInput): number {
  const c = F.ITEMS[id];
  const session = d.session ? W.SESSION[d.session] : 0;
  const share = c.time / 365 + c.matches * d.homeGames / W.HOME_GAMES_REF + c.training * session / W.TRAINING_DAYS_REF;
  const keeper = c.pitch > 0 ? 1 + (d.pitchWearMult - 1) * c.pitch : 1;
  return (share / (c.life * lifeScale(level))) * keeper;
}
```

- `wearDay(items, d)` → `{ items, crossings: { item, kind: "worn" | "condemned", condition }[] }`: soma o desgaste, aplica `crossings` (marca `condemned` ao passar de 15%, `alert` 40/15) e devolve o mesmo objeto se nada mudou.
- `groupLevel(f, g)`: média de `condemned ? 1 : level` / 2; `comfortLevel(f)` = `effective(seats)/2`; `lerpLevel(arr, level)`.
- `initialItems(squad, impliedLevel)`: níveis `2 × implied` (assentos `2 × F.MIN_LEVEL`); desgaste em `[lo, hi]` com `mulberry32(seedFrom(`fac:${squad.id}:${id}`))`.

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** — `feat(instalações): condição, desgaste e níveis derivados dos itens`.

---

### Task 3: Efeitos das condições e leitores dos níveis

**Files:** Modify `src/Domain/facilities/facilities.ts`, `facilities.test.ts`, `src/backend/facilityRoutes.ts` (só `facilitiesView` lê os helpers), `src/backend/advanceDay.ts` (só a linha `comfortPriceMult(playerSquad.facilities.comfort)` → `comfortPriceMult(playerSquad.facilities)`), `src/GameInterface/Facilities/FacilitiesView.tsx` (lê `data.levels`), `src/GameInterface/Dashboard/*` se lerem os campos removidos.

- [ ] **Step 1: Testes** (`facilities.test.ts`)
  - `facilityLevels(squad)` com itens no implícito = os níveis de hoje (IA sem `facilities`: o implícito, igual a hoje).
  - `trainingGroundEffectsOf` com todos os itens ≥ 40% = `trainingEffectsAt(nível)` (idêntico a hoje); com campos de treino, academia e refeitório em 20%: `devMult` = efeito do nível × 0,975 × 0,965 × 0,985; `injuryMult` × 1,3; `recoveryMult` × piscina/fisio; `normalSessionInjury` = `HEAVY × 0,5 × 0,5`.
  - `academyEffectsOf` com campos e alojamento em 0%: `qualityBonus` − 0,3 e `promiseChance` × 0,8.
  - O teste existente `default facilities sell exactly the old gate` continua passando sem mudança (condições iniciais ≥ 80%); um teste novo: assentos em 0% → demanda × 0,9 × 0,95 (estrutura também em 0) e preço × 0,95.
  - `weeklyUpkeep` igual ao de hoje com níveis inteiros.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**
  - `facilityLevels(squad)`: com `facilities`, `{ training: groupLevel(f,"training"), academy: groupLevel(f,"academy") }`; sem, o implícito (como hoje).
  - `trainingEffectsAt(level)` e `academyEffectsAt(level)` passam a usar `lerpLevel` (nível fracionário).
  - `trainingGroundEffectsOf(squad)` = efeitos do nível × penalidades de condição (só com `facilities`): `devMult × effectAt(TRAINING_PITCH_DEV_MIN, campos) × effectAt(GYM_DEV_MIN, academia) × effectAt(CANTEEN_DEV_MIN, refeitório)`; `recoveryMult × effectAt(POOL…) × effectAt(PHYSIO…)`; `injuryMult × effectAt(PITCH_INJURY_MAX, campos)`; novo campo `normalSessionInjury = HEAVY_TRAINING_CHANCE × NORMAL_TRAINING_INJURY_SHARE × penalty(campos)` (0 para a IA).
  - `academyEffectsOf`: `qualityBonus − ACADEMY_QUALITY_MAX_LOSS × (penalty(campos) + penalty(alojamento))`, `promiseChance × effectAt(LODGING_PROMISE_MIN, alojamento)`.
  - `comfortPriceMult(f: ClubFacilities)` = `(1 + STEP × (comfortLevel(f) − 1)) × effectAt(SEATS_PRICE_MIN, assentos)` (assinatura muda para receber as instalações; atualizar os 3 leitores).
  - `demandOf`: `× effectAt(SEATS_DEMAND_MIN, assentos) × effectAt(STRUCTURE_DEMAND_MIN, estrutura)`.
  - `initialFacilities`: `items: initialItems(squad, impliedLevel(squad))` no lugar dos três campos.
  - `quoteProject` para `comfort/training/academy`: `current = ⌊nível do grupo⌋` (o resto igual).
  - `weeklyUpkeep`: usa `groupLevel`.
  - `facilitiesView` (rota): acrescenta `levels: { comfort, training, academy }`; os textos de efeito usam esses níveis.
  - `dailyTraining.ts` (uma linha): `trainingInjuryChance(policy.intensity, injuryMult)` vira `trainingInjuryChance(policy.intensity, injuryMult) + (policy.intensity === "heavy" ? 0 : ground.normalSessionInjury)`.

- [ ] **Step 4: Rodar** `bun test src/Domain/facilities src/Domain/advanceDay/dailyTraining.test.ts src/Domain/youth src/backend/facilities.routes.test.ts` → PASS; `bunx tsc --noEmit -p .` limpo (inclui os leitores da Task 1).
- [ ] **Step 5: Commit** — `feat(instalações): condição pesa no CT, na base e no público; níveis derivados dos itens`.

---

### Task 4: Reforma, reconstrução, melhoria e entrega dos projetos

**Files:** Modify `src/Domain/facilities/facilities.ts`, `facilities.test.ts`.

- [ ] **Step 1: Testes**
  - `itemValue(revenue, id, level)` = `revenue × valueShare × level / 6`.
  - `quoteProject(f, { kind: "repair", item: "stadiumPitch", to: 100 }, ctx)` com condição 30: custo = valor × 0,7 × 0,6, semanas `⌈2 × 0,7⌉ = 2`, `small: true` (≤ 2% da receita); `to` não múltiplo de 5, ≤ condição atual, > 100, ou item interditado → `null`.
  - `rebuild` só com condição < 15 ou interditado (senão `null`); custo = valor; semanas `rebuildWeeks`.
  - `upgrade` nível 10 → `null`; custo = valor(nível+1) × 0,6.
  - `itemBusy(f, item)`: verdadeiro com projeto do item ou obra do grupo; `groupBusy(f, "training")` verdadeiro com projeto de qualquer item do CT.
  - `advanceFacilities` entrega: `repair` → condição `to` (±0,5), `alert` e `condemned` limpos; `rebuild` → 100, mesmo nível; `upgrade` → nível+1, 100; obra de grupo `training` nível 4 → todo item do CT em `max(nível, 8)` e 100; `comfort` nível 2 → assentos em `max(nível, 4)`.
  - Reforma pequena (`payRepairNow`): devolve `{ facilities, entry }` com o projeto já `paid = instalments = 1` e a linha `facilities` `-custo`, `ref: { facility: "repair", item }`; nenhuma `board_funding`.
  - `committedSpend` ignora os projetos já pagos.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**
  - `ProjectQuote` ganha `item?`, `to?`, `small?: boolean`.
  - `quoteProject`: casos novos acima; `small = cost ≤ SMALL_REPAIR_SHARE × revenue` só para `repair`.
  - `startProject` copia `item`/`to`; `payRepairNow(f, quote, { id, date })` = `startProject` com `boardShare: 0`, `instalments: 1`, `paid: 1` + a linha de extrato (o projeto segue até `end` para a entrega e para o cartão Obras).
  - `advanceFacilities`: no ramo de entrega, `applyCompletion(items, p)`; o rótulo da parcela usa `p.item ?? p.kind` e `ref: { facility: p.kind, ...(p.item ? { item: p.item } : {}) }`.
  - `projectRunning(f, kind)` continua para `stand`/`comfort`/`training`/`academy`, agora verdadeiro também se algum item do grupo tem projeto; `itemBusy` para os pedidos de item.

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** — `feat(instalações): reforma, reconstrução e melhoria de item`.

---

### Task 5: Jardineiro

**Files:** Modify `src/Domain/staff/staffConfig.ts`, `src/Domain/staff/staff.ts`, `src/Domain/staff/staff.test.ts`, `src/GameInterface/StaffScreen.tsx` (linha do efeito), i18n (`staff.effect.groundskeeper`).

- [ ] **Step 1: Testes**
  - `roleLimit(squad, "groundskeeper")` LOW 1, MEDIUM 1, HIGH 2, ELITE 2 (`STAFF.LIMITS.groundskeeper`); os outros iguais.
  - `staffEffectsOf(squad).pitchWearMult`: sem jardineiro 1,6; um de 3★ 1; um de 5★ 0,75; um de 1★ 1,3; dois de 3★ 0,9; IA (sem `staff`) 1.
  - `initialStaff` continua com 1 jardineiro (só o limite muda).

- [ ] **Step 2–4:** implementar (`STAFF.LIMITS.groundskeeper` por tier; `roleLimit` lê; `pitchWearMult` com `starCurve(estrelas, F.GROUNDSKEEPER.CURVE) × EXTRA^(n−1)`, sem ninguém `NONE`, sem `staff` 1), cartão do jardineiro "Desgaste do gramado ×N" (en, pt-BR), rodar `bun test src/Domain/staff src/backend/staff.routes.test.ts src/GameInterface` → PASS.
- [ ] **Step 5: Commit** — `feat(comissão): jardineiro reduz o desgaste dos gramados; limite por tier`.

---

### Task 6: Gramado da IA e do jogo (puro)

**Files:** Create `src/Domain/facilities/pitch.ts`, `pitch.test.ts`.

- [ ] **Step 1: Testes**
  - `aiPitchCondition("LOW", 0)` = 70, `("LOW", 1)` = 30, `("ELITE", 0.5)` = 79; fração fora de 0..1 trava.
  - `pitchInjuryMult(90)` = 1, `(20)` = 1,3, `(0)` = 1,6.
  - `matchPitchCondition(home, fixture, window, date)`: `fixture.neutral` → 90; mandante com `facilities` → condição do `stadiumPitch` (interditado → 0); mandante da IA → fórmula com `financialTierOf(home)` e `seasonFraction(date, window.start, window.end)`; sem janela → fração 0,5.
  - Renovação: o mesmo clube da IA no último dia da janela (fração 1) tem gramado menor que no primeiro dia da janela seguinte (fração 0).

- [ ] **Step 2–4:** implementar e rodar → PASS.
- [ ] **Step 5: Commit** — `feat(instalações): gramado da IA pela divisão e pela temporada`.

---

### Task 7: Lesões pelo gramado no motor e no quickSim

**Files:** Modify `src/GameEngine/Domain/SimulateMatch.ts`, `src/Domain/advanceDay/quickSim.ts`, `src/Domain/advanceDay/matches.ts` (`buildMatchEvent`/`buildQuickMatchEvent` recebem `sim.pitchCondition?`), `src/GameEngine/Domain/gameState.ts` (só o `debugLog('injury')` com o fator, se o multiplicador por jogador for acessível); testes `src/Domain/advanceDay/quickSim.test.ts`, `src/GameEngine/Domain/Injury.engine.test.ts`.

- [ ] **Step 1: Testes**
  - quickSim: com o mesmo `rng`, `pitchCondition: 90` dá exatamente o mesmo `recording` de sem o campo (fator 1, nenhum sorteio a mais); com `pitchCondition: 0` em 4000 jogos pareados as lesões sobem ~60% (entre +40% e +80%).
  - `simulateMatch(..., { pitchCondition: 0 })` monta o estado com `injuryMult` = staff × 1,6 nos dois times (teste olhando o `createMatchState` via o gancho existente, ou a função pura `matchInjuryMults(squadA, squadB, options)` extraída).
  - `buildQuickMatchEvent(..., { ...sim, pitchCondition })` repassa ao quickSim.

- [ ] **Step 2–4: Implementação**
  - `SimulateMatchOptions.pitchCondition?: number`; o cálculo atual `A: options.injuryMult?.A ?? staffEffectsOf(squadA).injuryMult` passa a multiplicar por `pitchInjuryMult(options.pitchCondition ?? 90)` (o `injuryMult` explícito também é multiplicado).
  - `QuickSimInput.pitchCondition?: number`; as duas chamadas de `rollSideInjuries` multiplicam o `staffMult` pelo mesmo fator.
  - `buildMatchEvent`/`buildQuickMatchEvent`: `sim.pitchCondition?` → `options.pitchCondition` / `input.pitchCondition`.
  - Rodar `bun test src/Domain/advanceDay src/GameEngine/Domain/Injury.engine.test.ts src/GameEngine/Domain/SimulateMatch.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(lesões): gramado ruim aumenta o risco no motor e no quickSim`.

---

### Task 8: Avanço do dia (gramado de cada jogo, desgaste diário, avisos)

**Files:** Modify `src/backend/advanceDay.ts` (três pontos: import, gramado antes da simulação, bloco "Facilities day"), `src/Domain/facilities/facilityMessages.ts`, `src/types/inboxTypes.ts`; Create `src/backend/facilities.advanceDay.test.ts`.

- [ ] **Step 1: Testes** (`facilities.advanceDay.test.ts`, mesmo molde de `board.advanceDay.test.ts`: save pequeno, avançar dias com `runBufferedDay`)
  - Depois de 30 dias, a condição de todo item do clube do jogador caiu (nenhum subiu) e continua em 0..100.
  - Gramado do estádio forçado a 41% (gravando `wear` no elenco): no dia seguinte com jogo em casa a inbox tem `facilities` `worn` com `item: "stadiumPitch"`; forçado a 16% → `condemned` e o item fica `condemned`.
  - O jogo em casa do dia usa `pitchCondition` = condição do gramado (log do dia: o `MatchEvent` ganha `pitchCondition`, opcional, para o smoke e o resumo).
  - Clube da IA mandante: `pitchCondition` = `aiPitchCondition(tier, fração)`.
  - Sem clube (desempregado): nada desgasta, nenhuma mensagem.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**
  - Gramado: logo antes de `const r = mode === "full" ? buildMatchEvent(...)`, uma linha:
    `const pitchCondition = matchPitchCondition(homeSquad, fixture, activeLeagues.find((l) => l.leagueSlug === homeEntry.leagueSlug), currentDate);`
    e passar `{ ...sim, pitchCondition }`; gravar `pitchCondition` no `MatchEvent` (campo opcional em `dayLogTypes.ts`, preenchido em `buildMatchEventFromRecording`/no retorno dos dois `build*`).
  - Bloco "Facilities day": antes de `advanceFacilities`, `wearDay(playerSquad.facilities.items, { homeGames: playerHomeFixturesToday.filter((g) => !g.neutral).length, session, pitchWearMult: staffEffectsOf(playerSquad).pitchWearMult })`, com `session = isRestDay || teamsPlayingToday.has(playerSquadId) ? null : resolveTrainingPolicy(...).intensity` (a mesma chamada do laço de treino); cada `crossing` vira `facilityMessages.push({ date, kind: crossing.kind, item, condition })`; a entrega de `repair/rebuild/upgrade` empurra `kind: "repaired"` (o `completed` de hoje continua para as obras de grupo e arquibancada).
  - `buildFacilityMessage`: kinds `worn`/`condemned`/`repaired` com assunto/prévia em inglês (fallback); `FacilityInboxMessage` ganha `item?`, `condition?`.
- [ ] **Step 4: Rodar** `bun test src/backend/facilities.advanceDay.test.ts src/backend/board.advanceDay.test.ts src/backend/facilities.routes.test.ts src/Domain/facilities` → PASS.
- [ ] **Step 5: Commit** — `feat(instalações): desgaste diário, gramado em todo jogo e avisos na inbox`.

---

### Task 9: Rotas (pedidos de item, reforma paga do caixa, prévia)

**Files:** Modify `src/backend/facilityRoutes.ts`, `src/backend/routes.ts` (`/api/match-setup` devolve `pitchCondition`), `src/Domain/finance/ledgerText.ts` (`facilityRepair`, `facilityRebuild`, `facilityUpgrade` com o item); test `src/backend/facilities.routes.test.ts`.

- [ ] **Step 1: Testes**
  - `POST .../facilities/request { kind: "repair", item: "stadiumPitch", to: 100 }` com custo pequeno: 200 `{ approved: true, paidByClub: true }`, saldo cai exatamente o custo, uma linha `facilities` `ref.facility = "repair"`, nenhuma `board_funding`, soma do extrato = saldo; diretoria em 10 não importa.
  - Saldo insuficiente → `{ approved: false, reason: "no_money" }` sem gravar nada.
  - Reforma grande (assentos 0 → 100 num clube de receita alta) e `rebuild`/`upgrade` passam por `boardDecision` (diretoria 40 → `board_low`; 90 → aprovada com parcela e verba).
  - Corpo inválido (item desconhecido, `to` 103, `to` abaixo da condição, `rebuild` de item em 60%) → 400 `invalidRequest`; item ocupado → 409 `busy`; nível 10 → 400 `maxLevel`.
  - `GET .../facilities` traz `items` (por item: nível, condição, interditado, efeito atual, projeto, `quotes.repair[25|50|100]`, `rebuild`, `upgrade`, cada um com `small` e a previsão da diretoria) e `levels`.
  - `/api/match-setup` traz `pitchCondition` do jogo do dia.

- [ ] **Step 2–4: Implementação**
  - `parseFacilityRequest` aceita os três kinds novos (`isFacilityItemId`, `to` inteiro múltiplo de 5).
  - Reforma pequena: dentro do `withSaveLock`, num `BufferingSaveDAL` por requisição (como `staffRoutes.inUnit`): `payRepairNow` + `recordMoney(..., entry)` na temporada do extrato da liga, flush no fim; inbox `approved` não sai (a resposta já informa), a conclusão sai pelo avanço do dia.
  - Grande: o caminho de hoje (`boardDecision` → `startProject` → inbox `approved`).
  - `facilitiesView`: por item `{ id, group, level, condition, condemned, effect, project?, quotes }`, a previsão da diretoria por cotação (`boardDecision` puro, como a tela já faz para as obras).
  - Rodar `bun test src/backend/facilities.routes.test.ts src/backend/routes*.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(instalações): pedidos de reforma, reconstrução e melhoria; reforma pequena paga do caixa`.

---

### Task 10: Contratação (pedido, recusa e preferência)

**Files:** Modify `src/Domain/contracts/contracts.ts` (+ teste), `src/Domain/negotiation/rivals.ts` (+ teste), `src/Domain/negotiation/preContract.ts`, `src/backend/transfers.ts`, `src/backend/contractRoutes.ts` (`demand` devolve `facilities` e `refusesPoorFacilities`), `src/GameInterface/Contracts/ContractTermsFields.tsx`, i18n (`personality.demand.facilities`, `contracts.refusal.poorFacilities`, `negotiation.rival.reason.facilities`).

- [ ] **Step 1: Testes**
  - `facilitiesAppeal(squad, player)`: sem `facilities` → 100; CT todo em 20% → 20; jogador de 19 anos com CT 20 e base 80 → 50.
  - `demandBreakdown` de um jogador de fora para um clube com CT 25: `facilities` = 1,05, `demand` × 1,05; na renovação (`renewal: true` ou jogador do elenco) = 1; clube da IA = 1.
  - `evaluateContractOffer`: ambição ≥ 17 e CT 20 → `poorFacilities`; ambição 16 → aceita (só o pedido sobe); CT 30 → aceita.
  - `preferenceScore({ ..., facilitiesAppeal: 25 })` = o de hoje − 0,05; sem o campo = o de hoje; `preferredClub` pode devolver `reason: "facilities"`.
  - `renewalContract` (o que a IA paga) não muda.

- [ ] **Step 2–4: Implementação**
  - `personalityParts` ganha `facilities` (só quando `!own`, lido de `squad.facilities` via `facilitiesAppeal`) e `refusesFacilities`; `demand` multiplica; `ContractRefusal` ganha `"poorFacilities"`; `evaluateContractOffer` checa logo depois do `smallerClub`.
  - `PreferenceInput.facilitiesAppeal?: number`; `preferenceScore` desconta; `preferredClub` inclui o termo nos motivos.
  - Chamadores: `transfers.ts` (opção do clube do jogador), `preContract.ts` (`human`) passam `facilitiesAppeal(humanSquad, player)`.
  - Tela: linha "Instalações ruins: +N%" e a recusa; `known` da rota inclui `poorFacilities`.
  - Rodar `bun test src/Domain/contracts src/Domain/negotiation src/Domain/personality src/backend/contracts*.test.ts src/backend/negotiation.routes.test.ts src/backend/windows.routes.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(contratos): instalações ruins encarecem e dificultam contratações`.

---

### Task 11: Tela "Instalações em detalhe" e textos da inbox

**Files:** Create `src/GameInterface/Facilities/FacilityItemsPanel.tsx`, `FacilityRepairPanel.tsx`; Modify `FacilitiesView.tsx`, `facilitiesApi.ts`, `src/GameInterface/InboxScreen.tsx` (kinds novos), `src/GameInterface/MatchPreviewScreen.tsx` (linha "Gramado: N%"), `src/GameInterface/Dashboard/dashboardData.ts` + `HomeCards.tsx` (Atenção: itens abaixo de 40% nos últimos 7 dias), `src/i18n/locales/{en,pt-BR}.json` (`facilities.items.*`, `facilities.repair.*`, `facilities.inbox.worn|condemned|repaired`, `matchPreview.pitch`).

- [ ] **Step 1:** tipos do `facilitiesApi` para a resposta da Task 9.
- [ ] **Step 2:** `FacilityItemsPanel`: título de seção "INSTALAÇÕES EM DETALHE"; três blocos (rótulo do grupo), `TABLE_STYLE`: item, "N de 10" (`LevelMarks` com 10 marcas), barra de condição (`bg-border h-1.5`, preenchimento por faixa: `bg-primary` ≥ 40, `bg-chart-4` 15–39, `bg-destructive` < 15) + número `tabular-nums`, efeito atual em `text-sm text-muted-foreground` quando < 40, obra em andamento (barra de progresso + entrega), botões (`<Button>` secundário) Reformar / Reconstruir / Melhorar desligados com o motivo (`busy`, `maxLevel`, interditado).
- [ ] **Step 3:** `FacilityRepairPanel` (abre abaixo da linha, como o painel de ampliação de setor): `OptionChips` 25% / 50% / 100% (reforma), custo, prazo, "Pago pelo clube" ou a previsão da diretoria (reaproveitar `AskRow`), "Confirmar"; resultado com `OutcomeNotice`.
- [ ] **Step 4:** os cartões do CT e da base passam a mostrar o nível do grupo com uma casa ("3,5 de 5") e o efeito atual já com as penalidades; inbox, prévia e Atenção.
- [ ] **Step 5:** `bun run ui:audit` sem violações nos arquivos tocados; `bun test src/GameInterface` → PASS; conferir a tela no navegador (`/api/auth/dev-login`, Finanças → Instalações) com um item forçado abaixo de 40%.
- [ ] **Step 6: Commit** — `feat(ui): instalações em detalhe, reformas e avisos`.

---

### Task 12: `/test` e `/lab`

**Files:** Modify `src/GameInterface/TestScreen.tsx`, `src/GameInterface/EnergyPanel.tsx`, `src/GameEngine/Support/TestCases.ts` (cenário `bad-pitch`), painel QuickSim do `/test`, `src/lab/types.ts` (`Variant.pitchCondition`, `TeamRawStats.pitchCondition`, `VariantSummary.avgPitchCondition`), `src/lab/balanceWorker.ts`, `src/lab/scenarioRunner.ts`, `src/lab/components/VariantEditor.tsx`, `src/lab/labNames.ts` (rótulo `· pitch N%`), `src/lab/components/PairDetail.tsx` (linha "Pitch"); testes `src/lab/*.test.ts` existentes do rótulo.

- [ ] **Step 1:** `/test`: seletor "Pitch" (90 padrão; 100/60/40/20/0) que reconstrói o estado com `injuryMult` × `pitchInjuryMult` nos dois times (mesmo lugar onde `staffOfTestSquad(...).injuryMult` entra); `EnergyPanel` mostra `pitch ×N`; QuickSim recebe `pitchCondition`; cenário `bad-pitch` (gramado 10%).
- [ ] **Step 2:** `/lab`: `Variant.pitchCondition` (slider 0–100, ausente = 90) — a da variante A vale para o jogo (`simulateMatch(..., { pitchCondition })`, `quickSimMatch({ pitchCondition })`); agregação e linha "Pitch" no `PairDetail` (a linha "Injuries" já existe); rótulo só quando diferente de 90.
- [ ] **Step 3:** teste do rótulo (`· pitch 20%`) e da agregação; `bun test src/lab src/GameInterface` → PASS.
- [ ] **Step 4: Commit** — `feat(test,lab): condição do gramado nos cenários e nas variantes`.

---

### Task 13: Medições

**Files:** Create `scripts/facilities-wear.ts`; Modify `scripts/injury-calibrate.ts` (`--pitch <n|ai>`), `scripts/development-pace.ts` (`--ct <condição>`).

- [ ] **Step 1: M4 (desgaste):** `bun scripts/facilities-wear.ts` simula 3 temporadas de um clube (calendário real da Premier: jogos em casa e dias de treino de `leagueSchedules`/rodadas; treino normal) com jardineiro nenhum / 3★ / 5★ e imprime, por item, a condição no fim de cada mês e o dia em que cruza 40% e 15%. Meta: gramado do estádio a 40% em ~0,8 temporada com 3★ e ~0,5 sem; estrutura acima de 40% por 3 temporadas. `--demand`: pedido de um jogador médio com CT 100/50/25/0 e a recusa por ambição (M5).
- [ ] **Step 2: M1/M2 (lesões):** `injury-calibrate.ts --pitch ai` sorteia a fração da temporada por jogo e usa o tier do mandante; `--pitch 20` / `--pitch 90` fixos. Rodar: motor PL + Championship 150 jogos por liga em cada modo (sem, `ai`, 20, 90) e quickSim (`--quicksim`). Metas: `ai` dentro de 0,15–0,5 e ≤ +3% sobre o sem; 20 × 90 ≈ × 1,3.
- [ ] **Step 3: M3 (evolução):** `development-pace.ts --ct 20` × `--ct 90` (caso realista de 3 temporadas): Δ da média dos atributos por idade inicial. Meta: −5% a −8% no crescimento dos jovens.
- [ ] **Step 4:** gravar as tabelas medidas na seção 9 da spec e em `facilities.md` (Tarefa 15). Se M1 passar de +3%, reduzir `AI_PITCH.DROP` e medir de novo (registrar a mudança).
- [ ] **Step 5: Commit** — `chore(instalações): medições de desgaste, lesões pelo gramado e evolução`.

---

### Task 14: Smoke

**Files:** Modify `scripts/season-rollover-smoke.ts` (seção "Instalações").

- [ ] **Step 1:** registrar a condição de cada item do clube do jogador todo dia (já lê o elenco); checar 0..100 e queda entre reformas.
- [ ] **Step 2:** num dia fixo depois da primeira semana, gravar `wear` do gramado do estádio para 45%; seguir até cruzar 40% → exigir a mensagem `worn`; pedir pela rota `repair` `to: 100` → exigir `approved`/`paidByClub`, uma linha `facilities` `repair` = custo cotado, sem `board_funding` no dia; seguir até a entrega → `repaired` e condição ≥ 99.
- [ ] **Step 3:** um clube da IA de uma liga que virou: `matchPitchCondition` no último dia da temporada antiga < no primeiro jogo em casa da nova (pelo `pitchCondition` do log do dia).
- [ ] **Step 4:** forçar o CT do jogador a 20% e chamar a rota `demand` de um jogador de fora → `facilities > 1`; restaurar.
- [ ] **Step 5:** lesões na faixa (checagem existente), nenhum clube da IA com `facilities` (existente); a checagem de saldo do dia passa a somar as linhas `facilities` de reforma.
- [ ] **Step 6:** rodar `bun scripts/season-rollover-smoke.ts` (~15 min, sozinho na máquina) → todas as seções passam.
- [ ] **Step 7: Commit** — `test(smoke): instalações vivas na temporada inteira`.

---

### Task 15: Documentação, changelog e versão

**Files:** Modify `.claude/rules/game/facilities.md` (itens, desgaste, efeitos, reformas, gramado da IA, contratação, telas, `/test`/`/lab`, medições, testes), `.claude/rules/game/staff.md` (jardineiro: efeito e limite por tier), `.claude/rules/game/injuries.md` (fator do gramado no motor/quickSim, treino normal em gramado ruim), `.claude/rules/game/contracts.md` e `personality.md` (linha e recusa `poorFacilities`), `.claude/rules/game/transfer-windows.md` (`preferenceScore`), `.claude/rules/game/finances.md` (linha `facilities` de reforma paga na hora), `.claude/rules/non-player-games.md` (quickSim: `pitchCondition`), `docs/ROADMAP.md` (34 ✅, versão 4.11, as três decisões: reforma pequena do caixa / grande pela diretoria; IA com gramado por fórmula, sem custo; contratação com pedido, preferência e recusa só com ambição ≥ 17 e CT < 25%), `src/GameInterface/changelog/changelog.ts` (entrada **4.11** e tirar o item de instalações do `upcoming`; ferramenta Edit; conferir 100% CRLF), `package.json` (`"version": "4.11"`).

- [ ] **Step 1:** regras e ROADMAP.
- [ ] **Step 2:** changelog: entrada `{ version: "4.11", date: "<data>", items: [...] }` em texto de jogador (desgaste e reformas; gramado e jardineiro; lesões em gramado ruim, inclusive fora de casa; CT e base mal cuidados pesam; jogadores pedem mais para vir a clube com estrutura ruim), pt e en. Se outra branch (4.8–4.10) já tiver entrado na `main`, manter a ordem decrescente de versão. `bun test src/GameInterface/changelog` → PASS.
- [ ] **Step 3:** verificação final: `bunx tsc --noEmit -p .`, `bun test` completo, `bun run ui:audit` (0 duras, 0 leves novas).
- [ ] **Step 4: Commit** — `chore: 4.11 — instalações vivas (Etapa 34)`.
