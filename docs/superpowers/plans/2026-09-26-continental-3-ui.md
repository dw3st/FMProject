# Continentais — Plano 3: o que o jogador vê

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o jogador enxerga e joga a continental do seu clube: o calendário e o avanço rápido incluem
os jogos continentais, a prévia mostra fase/ida/volta/placar da ida, a partida da volta decide pelo
agregado, a tela de ligas ganha a aba **Continental** (grupos + chaveamento), a inbox avisa
classificação/sorteios/eliminação/título e o `seasonLog` separa os números continentais.

**Architecture:** mesmo caminho das copas (Plano 3 das copas): o "calendário do jogador"
(`season.calendar` em `GET /api/saves/:id`) passa a incluir as fixtures continentais **do clube do
jogador**, então `useAdvanceDay`, `TopNavigation`, `ClubSidebar`, calendário semanal e
`MatchPreviewScreen` enxergam o jogo sem mudança estrutural. O backend ganha
`playerContinentalSlug(saveId, clubId)`; `match-setup` e `advance-until` aceitam a continental; uma
rota `GET /api/saves/:id/continental/:slug` devolve meta, fixtures, nomes e tabelas dos grupos.

**Tech Stack:** Bun, TypeScript, React 19, Tailwind, i18next, `bun:test`.

Spec: `docs/superpowers/specs/2026-09-26-continental-competitions-design.md` (seção 3). Planos 1 e 2
já estão na branch `feat/continental`. Regras: imports `@/`; Tailwind (sem `style={{}}` exceto cores
de time); ícones só via `src/GameInterface/Icons.tsx`; i18n em `en.json` e `pt-BR.json`; commits com
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca mate todos os processos `bun`;
`git add` só com caminhos explícitos.

---

## Mapa de arquivos

| Arquivo | O que muda |
|---|---|
| `src/Domain/world/labels.ts` (+ teste) | `competitionName` conhece `ucl`/`uel`/`lib`/`sud` |
| `src/backend/continentalWorld.ts` (+ teste) | `playerContinentalSlug(service, saveId, clubId)` |
| `src/backend/saves.ts` | `season.calendar` inclui as fixtures continentais do jogador |
| `src/backend/advanceUntil.ts` (+ teste) | próximo jogo do jogador em liga, copa **ou** continental |
| `src/backend/routes.ts` | `match-setup` aceita a continental; rota `GET /api/saves/:id/continental/:slug` |
| `src/GameInterface/MatchPreviewScreen.tsx` | fase, ida/volta, placar da ida |
| `src/GameInterface/FinancesScreen.tsx` | confere que a bilheteria projeta só jogos da liga |
| `src/GameInterface/Components/ContinentalView.tsx` | **novo** — grupos + chaveamento |
| `src/GameInterface/LeagueTableScreen.tsx` | aba **Continental** |
| `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxEvents.ts` (+ teste), `src/GameInterface/InboxScreen.tsx` | categoria `continental` |
| `src/backend/advanceDay.ts`, `src/backend/SaveService.ts` | mensagens continentais |
| `src/types/playerTypes.ts`, `src/Domain/advanceDay/matches.ts` (+ teste) | `seasonLog.continental` |
| `src/i18n/locales/en.json`, `pt-BR.json` | textos |
| `.claude/rules/game/continental.md`, `.claude/rules/ui-world.md` | documentação |

---

### Task 1: nomes

**Files:** `src/Domain/world/labels.ts`, `src/Domain/world/labels.test.ts`.

- [ ] **Step 1: Teste**

```ts
test("continental competitions have fixed names", () => {
  expect(competitionName("ucl", [], "en")).toBe("Champions League");
  expect(competitionName("uel", [], "pt-BR")).toBe("Europa League");
  expect(competitionName("lib", [], "pt-BR")).toBe("Copa Libertadores");
  expect(competitionName("sud", [], "en")).toBe("Copa Sudamericana");
  expect(competitionName("sud", [], "pt-BR")).toBe("Copa Sul-Americana");
});
```

- [ ] **Step 2: Implementar** — em `labels.ts`, antes do ramo das copas:

```ts
const CONTINENTAL_NAMES: Record<string, { en: string; pt: string }> = {
  ucl: { en: "Champions League", pt: "Champions League" },
  uel: { en: "Europa League", pt: "Europa League" },
  lib: { en: "Copa Libertadores", pt: "Copa Libertadores" },
  sud: { en: "Copa Sudamericana", pt: "Copa Sul-Americana" },
};
// in competitionName, after the leagueData hit:
const cont = CONTINENTAL_NAMES[slug];
if (cont) return lang.toLowerCase().startsWith("pt") ? cont.pt : cont.en;
```

- [ ] **Step 3:** `bun test src/Domain/world`; commit (`feat(ui): continental competition names`).

---

### Task 2: backend — calendário, avanço rápido, partida, rota

**Files:** `src/backend/continentalWorld.ts` (+ teste), `src/backend/saves.ts`,
`src/backend/advanceUntil.ts` (+ teste), `src/backend/routes.ts`.

- [x] **Step 1: `playerContinentalSlug`** — em `continentalWorld.ts`:

```ts
/** The continental competition the club plays this season (its group), or null. */
export async function playerContinentalSlug(
  service: SaveService, saveId: string, clubId: string,
): Promise<ContinentalSlug | null> {
  for (const slug of CONTINENTAL_SLUGS) {
    const meta = await service.getLeagueMeta(saveId, slug).catch(() => null);
    if (meta?.continental?.groups.some((g) => g.clubs.includes(clubId))) return slug;
  }
  return null;
}
```

  Teste em `continentalWorld.test.ts`: num save novo, um clube da Premier que se classificou devolve
  `"ucl"` ou `"uel"`; um clube da Championship devolve `null`.

- [x] **Step 2: calendário** — em `saves.ts`, onde as fixtures de copa entram no `fullCalendar`,
  acrescente as continentais do jogador da mesma forma (filtro `home === myId || away === myId`) e
  ordene por data como hoje.
- [x] **Step 3: avanço rápido** — em `advanceUntil.ts`, a lista de competições do jogador passa a ser
  `[meta.leagueSlug, cup, continental]` sem nulos. Teste: com o jogo continental do jogador como o
  próximo jogo, `nextPlayerFixtureDate` devolve a data dele.
- [x] **Step 4: `match-setup`** — em `routes.ts` (~linha 341), aceite também
  `f.competition === continentalSlug`.
- [x] **Step 5: rota** — `GET /api/saves/:saveId/continental/:slug` (ao lado da rota da copa,
  mesma checagem de dono do save): `slug` precisa passar `isContinentalSlug` (400 senão); sem meta →
  404. Resposta:

```ts
{
  meta,                        // LeagueSeasonMeta com .continental
  fixtures,                    // todas
  names: Record<string, string>,   // squadId → nome (como a rota da copa)
  groups: { name: string; rows: GroupRow[] }[], // groupTable() de cada grupo, rodadas 1–6
}
```

- [x] **Step 6:** `bunx tsc --noEmit -p .`, `bun test src/backend`; commit
  (`feat(continental): player calendar, advance-until, match setup and bracket route`).

---

### Task 3: prévia da partida

**Files:** `src/GameInterface/MatchPreviewScreen.tsx`, i18n.

- [ ] **Step 1:** se `isContinentalSlug(fixture.competition)`, busque
  `/api/saves/:id/continental/:slug` (como a prévia faz com a copa) e mostre no cabeçalho
  `<fase> • <competição>`: fase de grupos → `t("continental.groupRound", { group, round })`
  (o grupo do jogador em `meta.continental.groups`, a rodada = `fixture.round`); mata-mata →
  `t("continental.stage.<name>")` + `t("continental.leg1")`/`t("continental.leg2")`; final → "Final" +
  "campo neutro".
- [ ] **Step 2:** na volta, abaixo do cabeçalho: `t("continental.firstLeg", { home, away, score })` com
  o placar da ida (do `fixture.aggregate`, invertendo para os nomes certos: `aggregate.home` são gols
  do mandante da **volta**) e a nota `t("continental.aggregateNote")` ("Decide no agregado;
  prorrogação e pênaltis se empatar").
- [ ] **Step 3: i18n** (en / pt-BR):

```json
"continental": {
  "tab": "Continental" / "Continental",
  "groupRound": "Group {{group}} · matchday {{round}}" / "Grupo {{group}} · rodada {{round}}",
  "leg1": "1st leg" / "Ida",
  "leg2": "2nd leg" / "Volta",
  "firstLeg": "First leg: {{home}} {{score}} {{away}}" / "Ida: {{home}} {{score}} {{away}}",
  "aggregateNote": "Decided on aggregate; extra time and penalties if level" / "Decide no agregado; prorrogação e pênaltis se empatar",
  "aggregate": "agg. {{home}}–{{away}}" / "agr. {{home}}–{{away}}",
  "notDrawn": "Not drawn yet" / "Ainda não sorteado",
  "champion": "Champion" / "Campeão",
  "groups": "Groups" / "Grupos",
  "knockout": "Knockout" / "Mata-mata",
  "none": "Not played yet this season" / "Ainda não começou nesta temporada",
  "stage": { "group": "Group stage" / "Fase de grupos", "r16": "Round of 16" / "Oitavas de final",
             "qf": "Quarter-finals" / "Quartas de final", "sf": "Semi-finals" / "Semifinal", "final": "Final" / "Final" }
}
```

- [ ] **Step 4:** `bunx tsc --noEmit -p .`; commit (`feat(ui): continental match preview`).

---

### Task 4: aba Continental

**Files:** Create `src/GameInterface/Components/ContinentalView.tsx`; Modify
`src/GameInterface/LeagueTableScreen.tsx`.

- [ ] **Step 1: `ContinentalView`** — componente burro, props `{ data: ContinentalData; myClubId: string }`
  (tipo exportado igual à resposta da rota do Task 2):
  - campeão no topo (mesmo bloco âmbar do `CupBracket`), se houver;
  - **Grupos:** grade `grid sm:grid-cols-2 gap-3`, uma tabela por grupo (Pos, clube com `ClubLogo`,
    J, SG, Pts), 1º e 2º com marcador de classificação, linha do clube do jogador destacada
    (`bg-primary/10`);
  - **Mata-mata:** por fase (r16, qf, sf, final), uma linha por confronto agrupando ida e volta por
    `tieId`: `A 2–1 B · B 1–1 A · agr. 3–2` (+ `t("cups.aet")` / `t("cups.pens", …)` do `decider`
    da volta), vencedor em negrito; fase não sorteada → `t("continental.notDrawn")`; a final é uma
    linha só com "campo neutro".
- [ ] **Step 2: aba** — em `LeagueTableScreen.tsx` a aba `"continental"` aparece sempre depois de
  "Copa". Dentro da aba, um seletor de 4 botões (Champions, Europa League, Libertadores,
  Sul-Americana), começando na continental do clube do jogador se ele joga uma (pegue do
  `season.calendar` a primeira fixture com `isContinentalSlug(competition)`), senão na do continente
  da liga selecionada (Europa → `ucl`, América do Sul → `lib`, outro → `ucl`). Busca a rota do Task 2
  só com a aba aberta (mesmo padrão da aba Copa: reset ao trocar, 404 → `t("continental.none")`).
- [ ] **Step 3:** `bunx tsc --noEmit -p .`; commit (`feat(ui): Continental tab with groups and bracket`).

---

### Task 5: inbox

**Files:** `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxEvents.ts` (+ teste),
`src/GameInterface/InboxScreen.tsx`, `src/backend/advanceDay.ts`, `src/backend/SaveService.ts`,
`src/backend/continentalWorld.ts`, i18n.

- [ ] **Step 1: Tipo** — `InboxCategory` ganha `"continental"`:

```ts
export interface ContinentalInboxMessage extends BaseInboxMessage {
  category: "continental";
  kind: "qualified" | "group" | "draw" | "eliminated" | "champion";
  competition: ContinentalSlug;
  stage: ContinentalStageName;
  group?: string;              // qualified / group
  opponentName?: string;       // draw / eliminated
  firstLegDate?: string;       // draw
}
```

- [ ] **Step 2: builder + teste** — `buildContinentalMessage(args)` em `inboxEvents.ts`, no molde de
  `buildCupMessage` (título/corpo em inglês como fallback; a tela traduz). Teste: id único, categoria,
  campos preservados.
- [ ] **Step 3: emissão**
  - `createContinentalSeason` devolve, para cada competição criada, o grupo de cada clube; quem chama
    (`createSave` e a virada em `advanceDay`) emite `qualified` + `group` para o clube do jogador
    (grupo e adversários no corpo).
  - `advanceContinentalStages` já devolve as mudanças do dia (Plano 2, Task 10): para o clube do
    jogador emita `draw` (nova fase sorteada, com adversário e data da ida), `eliminated` (confronto
    perdido ou 3º/4º no grupo ao fim da rodada 6) e `champion`.
- [ ] **Step 4: tela** — `InboxScreen`: categoria com rótulo `inbox.categories.continental` e corpo
  `ContinentalBody` (textos `inbox.continental.*` em en/pt-BR, nome pelo `competitionName`).
- [ ] **Step 5:** testes de `src/Domain/inbox` e `bunx tsc --noEmit -p .`; commit
  (`feat(continental): inbox news for the player's club`).

---

### Task 6: `seasonLog.continental`

**Files:** `src/types/playerTypes.ts`, `src/Domain/advanceDay/matches.ts` (+ teste).

- [ ] **Step 1:** `seasonLog.continental?: { appearances: number; goals: number; assists: number }`
  (mesmo formato de `cup`); em `matches.ts`, onde `isCupSlug` acumula `log.cup`, acumule
  `log.continental` com `isContinentalSlug`.
- [ ] **Step 2: Teste** no mesmo arquivo de teste que cobre `log.cup`: um jogo `competition: "ucl"`
  soma em `continental` e no total, não em `cup`.
- [ ] **Step 3:** commit (`feat(continental): seasonLog.continental`).

---

### Task 7: documentação e verificação no navegador

- [ ] **Step 1:** `.claude/rules/game/continental.md` — seção "Interface" (calendário, prévia, aba,
  inbox, seasonLog); `.claude/rules/ui-world.md` — `competitionName` conhece as continentais.
- [ ] **Step 2:** `bunx tsc --noEmit -p .` e `bun test`.
- [ ] **Step 3: Navegador** (servidor local em modo produção, `PORT=3001`, dev login): carreira nova
  na Premier League com um clube classificado para a Champions; confira a inbox (classificação e
  grupo), a aba Continental (8 grupos, mata-mata "não sorteado"), avance até o jogo de grupo e jogue;
  confira a tabela do grupo depois. Uma volta de mata-mata só existe na temporada seguinte — cubra-a
  com o teste de integração do Plano 2 e com um save forçado (`currentDate` na data da volta) se der
  tempo.
- [ ] **Step 4:** commit (`docs(continental): UI`).
