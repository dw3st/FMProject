# Multiplayer parte 7 (partida ao vivo entre dois técnicos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dois técnicos humanos jogam a partida entre os clubes deles ao vivo, ao mesmo tempo, cada um mexendo no próprio time, com o servidor rodando a partida.

**Architecture:** o servidor roda cada partida num Bun `Worker` próprio (isola os globais do motor) em tempo real e manda frames, estado e lances aos dois navegadores pelo socket `/api/ws`. Os navegadores desenham (PixiPitch em modo remoto) e mandam comandos. A montagem do estado inicial sai do `MatchScreen` para uma função pura compartilhada.

**Tech Stack:** Bun + TS, Bun Worker, WebSocket (`src/backend/social/realtime.ts`), React 19, Pixi.js. Spec: `docs/superpowers/specs/2026-10-27-multiplayer-h2h-live-design.md`. Regras: `.claude/rules/game/multiplayer.md`, `.claude/rules/match-flow.md`, `.claude/rules/graphics-engine.md`, `.claude/rules/social.md`, `.claude/rules/ui-standard.md`.

Convenções do repo: imports sempre `@/…`; textos em `src/i18n/locales/{en,pt-BR}.json` (curtos, sem emoji); testes com `bun test <paths>`; nunca a suíte inteira por tarefa; commits por pathspec com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; sem migração de save.

---

## File structure

| Arquivo | Papel |
|---|---|
| `src/backend/matchSetup.ts` (novo) | `matchSetupFor(saveId, seatId, { live })`: o corpo do `POST /api/match-setup` extraído; a rota vira um invólucro |
| `src/Domain/match/liveMatchSetup.ts` (novo) | `buildLiveMatchState(input)`: monta o `GameState` inicial (o que hoje está no `MatchScreen`), um lado por time |
| `src/types/h2hTypes.ts` (novo) | Tipos: sala, comandos, mensagens worker ↔ principal, eventos de socket |
| `src/Domain/h2h/h2hConfig.ts`, `h2hRules.ts` (novos) | Constantes (`H2H`) e regras puras: sala, pausas, validação de comandos |
| `src/backend/h2h/h2hWorker.ts` (novo) | Worker: roda a partida em tempo real, aplica comandos, emite frames/estado/lances/fim |
| `src/backend/h2h/h2hRooms.ts` (novo) | Salas em memória, sockets, convites, pausas, auxiliar, gravação, rivais |
| `src/backend/social/realtime.ts`, `src/types/socialTypes.ts` | Eventos `h2h_*` |
| `src/backend/routes.ts` | `match-setup?live=1` aceita o jogo contra outro assento (devolve `h2h: true`) |
| `src/backend/groupAdvance.ts`, `groupAdvanceRoutes.ts` | Simular / assistente fecham a sala; resumo do assento |
| `src/GraficsEngine/PixiPitch.tsx` | Prop `remote` (não simula; desenha o estado recebido, interpola entre frames) |
| `src/GameInterface/MatchScreen.tsx` | `mySide`, modo H2H (estado do servidor, comandos pelo socket) |
| `src/GameInterface/H2H/*` (novos) | `useH2HSocket`, `MatchRoomScreen`, `PauseBar`, `H2HInvitePopup` |
| `src/pages/match-room/` (novo) | Página `/match-room` |
| `scripts/h2h-measure.ts` (novo) | Medições |

---

### Task 1: extrair `matchSetupFor`

**Files:** Create `src/backend/matchSetup.ts`; Modify `src/backend/routes.ts` (rota `/api/match-setup`, ~linhas 395–680); Test `src/backend/matchSetup.test.ts`.

- [ ] **Step 1:** Ler a rota inteira. Mover o corpo depois de `requireSeat`/carregar a `SeatMeta` para:

```ts
export type MatchSetupResult = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; body: Record<string, unknown> };
/** The match-setup of one seat for today's game (`POST /api/match-setup`). `live`: the live match (vs another seat: allowed only with `h2h`). */
export async function matchSetupFor(save: SeatMeta, opts: { live: boolean; h2h?: boolean }): Promise<MatchSetupResult>
```
A rota passa a: autenticar, achar a `SeatMeta` (como hoje, inclusive o caminho legado), chamar `matchSetupFor(save, { live })` e devolver `Response.json(r.body, { status: r.ok ? 200 : r.status })`. Nenhuma mudança de resposta.

- [ ] **Step 2:** Teste: criar um save solo (veja `src/backend/testing/seatFixtures.ts` → `ownSolo`) e conferir que `matchSetupFor(meta, { live: true })` devolve `fixture`, `myLineup`, `myFormation`, `oppFormation` iguais ao que a rota devolve (chamar a rota de `routes.ts` com um `Request` montado como nos testes de rota existentes, ex. `src/backend/groupAdvance.routes.test.ts`).
- [ ] **Step 3:** `bun test src/backend/matchSetup.test.ts src/backend/seats.review.test.ts src/backend/groupAdvance.live.test.ts` — PASS. `bunx tsc --noEmit -p .` limpo.
- [ ] **Step 4:** Commit `refactor(match): matchSetupFor extracted from the match-setup route`.

### Task 2: extrair `buildLiveMatchState`

**Files:** Create `src/Domain/match/liveMatchSetup.ts`, `src/Domain/match/liveMatchSetup.test.ts`; Modify `src/GameInterface/MatchScreen.tsx` (montagem em ~linhas 420–540).

- [ ] **Step 1:** Definir a entrada por lado e a função. Ela recebe os dados que hoje o `MatchScreen` lê de `data` (resposta do match-setup) e faz exatamente o que ele faz hoje para montar o estado novo (sem o caminho de retomada `snap`):

```ts
export interface LiveSideInput {
  squad: Squad | null;               // null = sem elenco próprio (adversário de teste)
  players: RosterPlayer[];           // já filtrados (indisponíveis, inscrição)
  formation: FormationShape;         // a forma pronta ou livre já resolvida
  lineup: string[];                  // XI salvo (humano) ou automático (IA)
  tactics: { style: TacticalStyle; mentality: Mentality; axesOverride?: Partial<TacticalAxes>; familiarity: FamiliarityLevels };
  human: boolean;                    // instruções, marcação, cobradores, troca manual de lesionado
  slotInstructions?: (SlotInstruction | null)[];
  marks?: { slot: number; targetRosterId: string }[];
  setPieceTakers?: TacticsSave["setPieceTakers"];
  managerBanned?: boolean;
  managerDiscipline?: number;
  morale: "own" | "neutral";
}
export interface LiveMatchInput {
  A: LiveSideInput; B: LiveSideInput;
  fixture: Fixture;                  // knockout, aggregate (já do ponto de vista A/B)
  aggregate?: { A: number; B: number };
  pitch?: { condition: number; turf?: TurfType };
  weather?: EngineWeather;
  referee?: EngineReferee;
}
/** Applies the per-team engine configs (tactics, morale overrides) and returns the fresh GameState. Side effects on the engine globals: call it where those globals belong to this match (the client page or the H2H worker). */
export function buildLiveMatchState(input: LiveMatchInput): GameState
```
Implementação: o mesmo código do `MatchScreen` (applyTeamTacticsConfig/AttackConfig por lado, `setTeamMoraleOverride`, `createMatchState(A.players, A.formation, B.players, B.formation, A.lineup, B.lineup, injuryMults)`, knockout, weather, referee, `manualInjurySubs`/`autoSubs` e `setPieceTakers`/`managerDiscipline` para cada lado humano, depois `applyTeamInstructions` + `setManMarksBySlot` para cada lado humano). Para o lado B humano use as mesmas chaves com `B`.

- [ ] **Step 2:** Teste de equivalência: montar o input de um jogo solo (elencos de `src/Data/squads/premier_league`, formações `4-3-3`), semear `Math.random` (`mulberry32` de `@/Domain/rng`) e comparar `buildLiveMatchState` contra a montagem antiga copiada no teste (posições, ids, `autoSubs`, `manualInjurySubs`, instruções). Outro teste: com `B.human = true`, `manualInjurySubs.B` e as instruções de B aplicadas.
- [ ] **Step 3:** `MatchScreen` passa a chamar `buildLiveMatchState` (lado A = usuário quando a partida não é H2H, como hoje). Rodar `bun test src/Domain/match src/GameInterface` — PASS.
- [ ] **Step 4:** Commit `refactor(match): buildLiveMatchState shared by the live match and the server`.

### Task 3: tipos e regras puras da sala

**Files:** Create `src/types/h2hTypes.ts`, `src/Domain/h2h/h2hConfig.ts`, `src/Domain/h2h/h2hRules.ts`, `src/Domain/h2h/h2hRules.test.ts`.

- [ ] **Step 1:** Tipos:

```ts
export type H2HSide = "A" | "B";               // A = mandante
export type H2HSeatStatus = "away" | "in" | "ready";
export interface H2HRoomView {
  saveId: string; fixtureId: string; date: string;
  phase: "lobby" | "live" | "done" | "closed";
  sides: Record<H2HSide, { seatId: string; nickname: string | null; clubId: string; clubName: string; status: H2HSeatStatus; pausesLeft: number; connected: boolean }>;
  pause: { by: H2HSide; until: number } | null;
}
export type H2HCommand =
  | { kind: "sub"; outId: number; inId: number }
  | { kind: "swap"; aId: number; bId: number }
  | { kind: "mentality"; mentality: Mentality }
  | { kind: "tactics"; style: TacticalStyle; axesOverride?: Partial<TacticalAxes> }
  | { kind: "formation"; formation: string }
  | { kind: "instruction"; slot: number; instruction: SlotInstruction | null }
  | { kind: "marks"; marks: { markerSlot: number; targetId: number }[] };
export type WorkerIn =
  | { type: "init"; input: LiveMatchInputWire }   // serializável (sem funções)
  | { type: "cmd"; side: H2HSide; cmd: H2HCommand }
  | { type: "pause" } | { type: "resume" }
  | { type: "auto"; side: H2HSide; on: boolean }
  | { type: "speed"; factor: number };            // testes
export type WorkerOut =
  | { type: "frame"; t: number; ball: [number, number]; players: [number, number, number][]; minute: number; phase: MatchPhase; score: { A: number; B: number } }
  | { type: "state"; state: GameState }
  | { type: "event"; name: string; payload: unknown }
  | { type: "done"; state: GameState; stats: unknown };
```
- [ ] **Step 2:** `H2H` config: `PAUSES: 3`, `PAUSE_SECONDS: 30`, `TICK_MS: 50`, `FRAME_MS: 100`, `STATE_MS: 1000`, `CMD_WINDOW_MS: 10_000`, `CMD_MAX: 20`, `MAX_FRAME_BYTES: 8192`.
- [ ] **Step 3:** Regras puras com teste para cada uma:
  - `joinRoom(room, side)`, `setReady(room, side)`, `leaveRoom(room, side)` → `{ room, start: boolean }` (`start` quando os dois `ready` e `phase === "lobby"`); sair na fase lobby volta para `away`.
  - `canPause(room, side, now)`: `phase === "live"`, sem pausa ativa, `pausesLeft > 0`. `startPause` desconta e define `until = now + 30 s`. `canResume(room, side, now)`: só quem pausou, antes de `until`. `pauseExpired(room, now)`.
  - `parseH2HCommand(raw)`: valida forma e limites (ids inteiros, `mentality`/`style` conhecidos via os arrays existentes, `formation` em `FORMATION_IDS`, `slot` 0–10); `null` se inválido.
- [ ] **Step 4:** `bun test src/Domain/h2h` — PASS. Commit `feat(h2h): room, pause and command rules`.

### Task 4: worker da partida

**Files:** Create `src/backend/h2h/h2hWorker.ts`, `src/backend/h2h/h2hWorker.test.ts`.

- [ ] **Step 1:** No `init`: `buildLiveMatchState(input)`, `initRatings`, `resetStatistics` (as funções que o `MatchScreen` chama ao começar), assinar no `gameBus` os lances que a tela usa (`goalScored`, `goalDisallowed`, `card`, `foul`, `freeKickAwarded`, `penaltyAwarded`, `penaltyResolved`, `offsideCalled`, `injury`, `injuryNeedsSub`, `substitution`, `varReview`, `halfTime`, `extraTimeStart`, `penaltyKick`, `shootoutEnd`, `matchEnd`, `positionsSwapped`) e repassar como `event`.
- [ ] **Step 2:** Laço: `setInterval(TICK_MS)`; se não pausado, `advanceSim(state, elapsedReal × speed, carry)` (veja `src/GameEngine/Domain/advanceSim.ts`). A cada `FRAME_MS` manda `frame`; a cada `STATE_MS` e logo depois de qualquer evento, `state` (sem campos de debug). No `matchEnd` (fase `matchEnd`), manda `done` com o estado e `getPlayerStats/getTeamStats/getGoalLog/getPlayerRating` necessários ao `buildPlayedMatchRecording`, e para.
- [ ] **Step 3:** Comandos: `sub` → `queueSubstitution` (a mesma do painel), `swap` → `swapPlayerPositions`, `mentality`/`tactics` → `applyTeamTacticsConfig`/`applyTeamAttackConfig` no lado, `formation` → a troca de formação usada pelo `SubstitutionPanel`, `instruction` → `applyPlayerInstruction`, `marks` → `setManMarks`; `auto` → `state.autoSubs[side]`. Ler o `SubstitutionPanel`/`MatchScreen` para chamar as mesmas funções.
- [ ] **Step 4:** Teste: worker com `speed 600` roda uma partida entre dois elencos da Premier até `done` em menos de ~20 s, com placar coerente com os gols dos `event`; um comando `mentality` aplicado no lado B muda o config de B dentro do worker (expor `debugSnapshot` só para o teste via mensagem `{type:"probe"}` opcional).
- [ ] **Step 5:** Commit `feat(h2h): server worker running the live match`.

### Task 5: salas, socket e gravação

**Files:** Create `src/backend/h2h/h2hRooms.ts`, `src/backend/h2h/h2hRooms.test.ts`; Modify `src/types/socialTypes.ts`, `src/backend/social/realtime.ts`, `src/backend/routes.ts`, `src/backend/groupAdvanceRoutes.ts`, `src/backend/groupAdvance.ts`, `src/Domain/inbox/worldAdvanceMessage.ts`.

- [ ] **Step 1:** Eventos do socket (`ClientEvent`): `h2h_join {saveId,fixtureId}`, `h2h_ready`, `h2h_cmd {cmd}`, `h2h_pause`, `h2h_resume`, `h2h_leave`. `ServerEvent`: `h2h_room {room}`, `h2h_invite {saveId,fixtureId,from}`, `h2h_frame`, `h2h_state`, `h2h_event`, `h2h_closed {reason}`, `h2h_done {saveId,fixtureId}`. Parse estrito no `realtime.ts` (como `live_score`), limite de comandos por socket (`H2H.CMD_MAX` por `CMD_WINDOW_MS`).
- [ ] **Step 2:** `h2hRooms`: chave `saveId:fixtureId`. `join` confere (com `matchSetupFor(..., { live: true, h2h: true })`) que o assento tem hoje um jogo contra outro assento, cria a sala se preciso, avisa o outro (`h2h_invite` + mensagem `world`/`h2h_invite` na caixa, uma vez por sala) e manda `h2h_room` aos dois. Quando os dois `ready`: monta o `LiveMatchInput` com `matchSetupFor` de cada assento (A = mandante; inverte agregado), cria o worker (`new Worker(new URL("./h2hWorker.ts", import.meta.url))`), grava `world.h2hLive = [...]` na meta (marcador para reinício).
- [ ] **Step 3:** Repasse: `frame/state/event` do worker → os sockets dos dois técnicos da sala. Sockets por usuário já existem no `realtime.ts`; adicionar `sendToUser(userId, event)` se não houver.
- [ ] **Step 4:** Pausas (`h2hRules`), auxiliar (socket do técnico fecha → `auto on`; `h2h_join` de volta → `auto off` e `state` completo), rivais (a cada gol/fim, `friend_live` para os outros membros em nome dos dois assentos, via a função de `src/backend/rivals/liveScores.ts`; ignorar `live_score` dos navegadores dessa partida).
- [ ] **Step 5:** `done`: `buildPlayedMatchRecording` (mover para `src/Domain/advanceDay/` se necessário, sem import de `GameInterface`), `writeLiveRecording` no assento mandante com `matchDecision: live` nos dois assentos; o dia usa a gravação do mandante para o jogo entre assentos (conferir `liveRecordingsFor` e `runBufferedDay` em `groupAdvance.ts`/`advanceDay.ts`: o jogo entre assentos precisa aceitar a gravação; ajustar para usar a gravação do mandante e não simular). `h2h_done` aos dois; tirar do `world.h2hLive`; `scheduleKick`.
- [ ] **Step 6:** Fechar a sala: `match-decision simulate` de qualquer um dos dois assentos (rota) e o assistente do prazo (`applyAssistant`) chamam `closeRoom(saveId, fixtureId, "simulated")`, que põe `simulate` nos dois e manda `h2h_closed`. Reinício: `resumeWorlds` lê `world.h2hLive`, apaga e manda `h2h_lost` na caixa dos dois.
- [ ] **Step 7:** `match-setup?live=1` contra outro assento devolve 200 com `h2h: true` (sem 409) quando chamado pela página da partida H2H; a prévia continua igual.
- [ ] **Step 8:** Testes (`h2hRooms.test.ts`, mundo com dois assentos como em `src/backend/seats.twoSeats.test.ts`, worker com `speed` alto): entrar/avisar, começar com os dois prontos, simular fecha para os dois, comando de outro lado recusado, pausa (3, 30 s, só quem pausou retoma), queda liga o auxiliar e volta desliga, `done` grava e o dia joga com a gravação (placar igual).
- [ ] **Step 9:** Commit `feat(h2h): rooms, socket events and the recorded result`.

### Task 6: PixiPitch remoto

**Files:** Modify `src/GraficsEngine/PixiPitch.tsx`, `src/GraficsEngine/renderInterp.ts`; Test `src/GraficsEngine/remoteInterp.test.ts`.

- [ ] **Step 1:** Prop `remote?: { onFrame(cb): unsubscribe }` (ou um ref com o último par de frames). Com `remote`, o pump não chama `advanceSim`; o estado vem do `matchStateSync`, e as posições desenhadas são `lerp(prevFrame, lastFrame, (now − lastFrameAt) / FRAME_MS)` limitado a 1.
- [ ] **Step 2:** Teste puro da interpolação remota (função nova `remoteAlpha(now, lastAt, step)` e lerp de posições por id).
- [ ] **Step 3:** `/test` não muda. Commit `feat(h2h): pitch draws a server-run match`.

### Task 7: MatchScreen em modo H2H

**Files:** Create `src/GameInterface/H2H/useH2HSocket.ts`, `src/GameInterface/H2H/PauseBar.tsx`; Modify `src/GameInterface/MatchScreen.tsx`, `src/GameInterface/SubstitutionPanel.tsx`, `src/GameInterface/Components/LiveTacticsPanel.tsx`.

- [ ] **Step 1:** `useH2HSocket(saveId, fixtureId)`: abre `/api/ws`, `hello` + `h2h_join`, guarda sala, último `state`, frames; reemite `h2h_event` no `gameBus` local (`gameBus.emit(name, payload)`); `send(cmd)`, `pause()`, `resume()`, `ready()`, `leave()`.
- [ ] **Step 2:** `MatchScreen`: `?h2h=1` → `mySide` da sala; sem montagem local nem `advanceSim`; `PixiPitch remote`; `gameState` = último `state`. Trocar todo "time A = meu" por `mySide` (lista do time, `FriendsButton`, painel de substituição e tática, mentalidade, avisos de lesão manual, `awayView`). Sem botões de velocidade; botão `Pausar · N`; `PauseBar` ("Fabio pausou · 0:24", `Retomar`); selo do adversário fora.
- [ ] **Step 3:** Painéis mandam comando em vez de alterar o estado local quando H2H.
- [ ] **Step 4:** Fim: ao `h2h_done`, ir para `/match-result?pending=1`.
- [ ] **Step 5:** `bun test src/GameInterface` PASS; abrir `/match` solo e conferir que nada mudou. Commit `feat(h2h): live match screen in head-to-head mode`.

### Task 8: sala, prévia, convite e barra

**Files:** Create `src/pages/match-room/index.html`, `src/pages/match-room/entry.tsx`, `src/GameInterface/H2H/MatchRoomScreen.tsx`, `src/GameInterface/H2H/H2HInvitePopup.tsx`; Modify `src/index.ts` (página), `src/GameInterface/MatchPreviewScreen.tsx`, `src/GameInterface/World/ReadyControl.tsx`, `src/GameInterface/Social/ChatPopups.tsx` ou `useSocial` (aviso), `src/GameInterface/InboxScreen.tsx`.

- [ ] **Step 1:** Sala "SALA DO **JOGO**" (`ScreenTitle`), escudos, técnicos e estados, atalhos Formação/Táticas, `Começar`, `Simular`, linha de estado. Ao começar, ir para `/match?h2h=1`.
- [ ] **Step 2:** Prévia contra outro assento: `Jogar ao vivo` (vai para `/match-room`) e `Simular`; outro na sala → "Fabio está te esperando" e `Entrar`.
- [ ] **Step 3:** `h2h_invite` vira aviso no canto (com `Entrar`) e a barra mostra `Entrar no jogo` no dia do jogo.
- [ ] **Step 4:** Mensagem `world`/`h2h_invite` e `h2h_lost` na caixa.
- [ ] **Step 5:** `bun run ui:audit --hard` limpo; commit `feat(h2h): match room, invite and preview`.

### Task 9: textos, docs, changelog

- [ ] Textos en/pt-BR (`h2h.*`) — catálogo mostrado ao usuário antes de publicar.
- [ ] `.claude/rules/game/multiplayer.md`: seção "Parte 7: humano × humano ao vivo"; ajustar a parte 4 (o 409 `seatOpponent` some para o jogo do clube). `match-flow.md`, `graphics-engine.md` (remote), `social.md` (eventos).
- [ ] Changelog 4.36 + `package.json`, `upcoming` atualizado; `docs/ROADMAP.md`.

### Task 10: medições e verificação

- [ ] `scripts/h2h-measure.ts`: 1 e 3 partidas simultâneas (CPU, RSS), bytes/s por cliente; 200 partidas pelo worker com `speed` alto contra `simulateMatch` com os mesmos times (gols por jogo).
- [ ] Ponta a ponta no navegador com dois usuários (`localhost` e `127.0.0.1`, `dev-login?as=2`): sala, começar, pausas, substituição de cada lado, queda (fechar a aba) e volta, fim e resultado igual nos dois.
- [ ] Suíte completa (uma vez), merge, deploy.
