# Multiplayer — parte 1: assentos

Spec: `docs/superpowers/specs/2026-10-14-multiplayer-design.md` (visão geral e §2). Plano:
`docs/superpowers/plans/2026-10-14-multiplayer-seats.md`. Etapa 43 (#106). Sem versão nova: nada visível mudou.

## Regra

- Um save é um **mundo** com N técnicos humanos (**assentos**). O solo é um mundo com um assento (`mode: "solo"`).
  `addSeat` (`src/backend/seats.ts`: testes, scripts e `POST /api/worlds/join`) acrescenta assentos (`mode: "multi"`). Convites e a tela
  do mundo: seção "Parte 2: liga de amigos".
- Um técnico humano por clube. Um usuário tem no máximo um assento por mundo (`save_members`). Aceitar a proposta de
  um clube que já tem assento dá 409 `offerClosed`; quando um assento assume um clube (`takeOverClub`: troca de
  emprego ou `addSeat`), as propostas desse clube saem dos outros assentos.
- A IA nunca age sobre um clube humano: não compra, não vende, não contrata livres, não demite o técnico, não abre
  vaga e não convoca para a base (as convocações são do assento). Nenhum clube humano oferece emprego.
  - O perfil da IA (necessidades, lista de venda) do clube que ganha um assento sai do mercado do mundo
    (`takeOverClub`); as propostas da IA pelos jogadores de um assento (`humanBidsTick`, `humanClubIds`) e os rivais
    (`rollRivalFor`) nunca vêm de um clube humano. Uma proposta pendente cujo comprador virou humano dá 409
    `offerClosed` no aceite; um rival desse clube (comprador ou vendedor) é descartado no prazo
    (`resolveRivalDeadlines`).
  - Um assento não compra, não pede emprestado nem faz pré-contrato com jogador de outro assento pela regra da IA:
    `POST /transfers`, `/loans` e `/pre-contracts` dão 404 `notFound` (`isOtherSeatClub`). Humano × humano é a
    parte 4.
- Cada assento só age sobre o próprio clube. Data, ligas, calendário, notícias, árbitros, histórico, prêmios,
  livres, aposentados e a lista de livres da comissão são do mundo.
- Dinheiro entre assentos: uma cláusula de venda futura que outro assento tem é paga no extrato dele
  (`paySellOnReceiver` → `seatOfClub` → `recordMoney`) e sai do `sellOnHeld` dele.
- Únicos no mundo: o prospecto de uma missão de jovens leva o assento na semente e no id
  (`prospect_<assento>_<hash>_<i>`, só em `mode: "multi"`; o solo sorteia como antes). A lenda da loja de conquistas
  só volta uma vez: o aposentado fica com `legendBy` em `retired.json` (não é oferecido nem vendido de novo, e a
  oferta de renascido pendente dele fecha); o sorteio das três lendas leva o assento na semente num mundo `multi`.
- Só o dono: apagar o mundo, `/presimulate` (dentro de `withSaveLock`, uma vez por mundo: `SaveMeta.presimulated`;
  a segunda chamada é um no-op 200 com `applied: false`) e `/import-squads` (403 para um membro).
- Finanças da liga (`ai-finances`): todo clube humano mostra só popularidade e folha (`isHumanClub`; o do próprio
  assento continua `isPlayerClub`), com o rótulo "Técnico humano".
- Jogo entre dois assentos: `match-setup` dá 409 `seatOpponent` (sem partida ao vivo); a prévia oferece simular a
  partida (o avanço do dia joga no motor completo com as duas táticas) ou voltar ao painel.
- Avanço manual (`/advance-day`, `/advance-until`) num mundo em grupo: 409 `groupAdvance` (só o executor avança, parte 3);
  num mundo multi sem `world` (testes), o avanço rápido dá 409 `multiSeat`.
- Sem migração: saves de antes da parte 1 não têm membros e somem da lista.

## Dados

| Onde | O quê |
|---|---|
| `saves/{id}.json` (`SaveMeta`) | Mundo: `mode`, `seats`, data, ligas ativas, títulos pendentes, pesos e vagas de técnicos, ano da aposentadoria dos livres |
| `saves/{id}/seats/{seatId}/seat.json` (`SeatState`) | O que era do jogador na meta: clube, liga, técnico, folgas, diretoria, imprensa, suspensão, emprego, contrato, preferências da caixa, responsabilidades, decisões do diretor, convocações da base |
| `seats/{seatId}/tactics.json`, `achievements.json`, `scouting.json`, `inbox.json`, `ledger/{temporada}.json`, `market.json` | Tática, conquistas, olheiros, caixa, extrato e a parte humana do mercado (`SeatMarketState`) |
| `saves/{id}/market.json` | Rotação e perfis da IA (`WorldMarketState`) |
| `managers.json` | Técnico humano `seat:<seatId>`, com `seatId` |
| `national/state.json` | `human` e `offers` por assento; seleção de um humano com `managerId = "seat:<seatId>"` |
| `retired.json` | `rebornSeatId` na oferta de renascido |
| `transfers.json` | Do mundo, podado na virada; `direction` só na resposta |
| SQLite `save_members(save_id, user_id, seat_id, role)` | `owner` / `member`; o limite de 5 saves conta só os de dono |

`SeatMeta = SaveMeta & SeatState & { seatId }` (`metaForSeat`, `src/Domain/seats/seats.ts`) é a visão de um assento,
com o formato da meta de antes. `splitSeatPatch` separa um patch em mundo e assento.

## Código

- `requireSeat(req, saveId)` → `{ userId, email, seatId, role }` ou 404. Toda rota do técnico age sobre `seatId`; as
  do mundo aceitam qualquer membro. Só o dono apaga o mundo (403).
- `SaveService`: `getMeta` (mundo), `getSeat`, `getSeatMeta`, `updateSeat`, `listSeats`, `humanClubIds`,
  `seatOfClub`, `insertSeat`. Os arquivos do técnico pedem o `seatId` (último parâmetro).
- Avanço do dia (`advanceOneDay`): `loadDaySeats` (`src/backend/daySeats.ts`) dá um `DaySeat` por assento; a IA
  exclui `humanClubSet`. Diretoria, imprensa, moral, diretor, comissão, contratos, emprego, contrato do técnico,
  finanças, instalações, olheiros, base, inscrição, seleção, conquistas e mensagens rodam por assento.
- As gravações ao vivo chegam como `Record<seatId, PlayedMatchRecording>`. A resposta é `payload` (mundo) +
  `seats[seatId]` (`payloadForSeat`). A virada do país de um assento limpa só a caixa dele.
- Dois assentos que se enfrentam: motor completo com a tática de cada um (`computeSeatedMatchLineups`). A partida ao
  vivo é só contra a IA (humano × humano ao vivo é a parte 4). Na prévia, o técnico adversário é o do outro assento
  (`matchManagers`).
- Folga: cada assento folga nos seus `restDays` (véspera e dia seguinte dos jogos do clube, editáveis). Um clube da
  IA folga na véspera e no dia seguinte dos próprios jogos oficiais (`aiRestingClubs`, `src/Domain/advanceDay/aiRest.ts`).
- Frontend: a sessão guarda o `seatId` (`gameSession.ts`, `sessionFromSaveJson`). O rosto do técnico usa o id do
  ranking (`seat:<seatId>`); a URL troca `:` por `_` (`faceIdOf`) para passar no `FACE_ID_RE`.

## Medições

| Medição | Antes (main) | Depois |
|---|---|---|
| Fôlego médio dos jogadores da IA (Premier, 28 dias) | 82,07 | 82,15 |
| Lesões por partida | 0,267 | 0,272 |

Custo do dia (`bun scripts/bench-advance-day.ts --buffered --days 14 [--seats 2]`, 2026-08-15 a 08-28):

| Assentos | Média por dia | Dia de rodada no motor completo | Demais dias |
|---|---|---|---|
| 1 (Premier) | 3,16 s | 12,2 s (2 dias) | 1,66 s |
| 2 (Premier + La Liga) | 5,11 s | 13,6 s (4 dias) | 1,70 s |

Cada liga com assento põe a rodada dela no motor completo (~10 s a mais por rodada). Fora das rodadas o custo quase
não muda (+3%, dentro do ruído).

## Testes

```
bun test src/Domain/seats src/Domain/market/seatMarket.test.ts src/backend/dal/seats.dal.test.ts src/backend/auth \
  src/backend/seats.saveService.test.ts src/backend/saves.seat.routes.test.ts src/backend/worldRoutes.member.test.ts \
  src/backend/daySeats.test.ts src/backend/seats.addSeat.test.ts src/backend/seats.twoSeats.test.ts \
  src/backend/national.seats.test.ts src/backend/marketWindow.seats.test.ts src/Domain/advanceDay/aiRest.test.ts \
  src/GameInterface/gameSession.seat.test.ts src/backend/seats.review.test.ts src/Domain/achievements/shop.test.ts \
  src/Domain/aiFinance/financeRows.test.ts
```

`seats.twoSeats.test.ts`: três assentos (dois na Premier, um na La Liga), 8 dias. Diretoria, imprensa, salário,
caixa e extrato próprios; a IA não negocia, não demite nem convoca nos clubes humanos; ações de um assento não
tocam os outros; 404 agindo sobre o clube de outro assento; rotas do mundo para todos os membros; a virada do país
de um assento limpa só a caixa dele.

`seats.review.test.ts`: dois assentos na Premier. Compra / empréstimo / pré-contrato de jogador do outro assento
(404), perfil da IA fora do mercado, proposta e rival em nome de um clube humano, proposta de emprego de clube com
assento (409) e limpeza das propostas dos outros, cláusula paga no extrato do outro assento, lenda única,
`/presimulate` só do dono e uma vez, `ai-finances`, `import-squads`, `match-setup` (409 `seatOpponent`) e
`advance-until` (409 `multiSeat`). Puros: `negotiation.test.ts` (propostas sem clube humano), `missions.test.ts`
(prospectos por assento), `shop.test.ts` (lendas), `financeRows.test.ts`.

## Limitações

- Mais assentos em ligas diferentes = mais ligas no motor completo por dia (ver medições).
- `withSaveLock` é local ao processo: um servidor só por mundo.
- Ids de mensagem podem se repetir entre assentos (ex. a lista da Champions de dois clubes humanos): cada caixa é um
  arquivo, então não colidem.
- Sem humano × humano ao vivo nem classificação (partes 4–5).
- O smoke de temporada não tem modo de dois assentos.
- A cláusula paga a outro assento entra no extrato dele sem mensagem na caixa (a mensagem `sell_on` só vai para o
  assento que fez a operação).
- Um jogo entre dois assentos não tem prévia (o `match-setup` recusa): só "simular partida" ou voltar ao painel.

## Parte 2: liga de amigos

Spec: `docs/superpowers/specs/2026-10-15-multiplayer-world-design.md`. Plano:
`docs/superpowers/plans/2026-10-15-multiplayer-world.md`. Sai junto com a parte 3 (avanço em grupo).

### Regra

- A liga nasce no novo jogo ("Com amigos", `POST /api/saves` com `mode: "multi"`, `createWorldState`): o mundo do dono em
  `lobby`, sem `/presimulate`. `SaveMeta.world = { phase, inviteCode, deadlineHours, createdBy }` (`WorldState`,
  `src/types/multiplayerTypes.ts`); o solo não tem `world`.
- **`lobby`:** o dia não avança (`advance-day` e `advance-until` 409 `lobby`; `/presimulate` 409 `useWorldStart`); toda
  tela do jogo redireciona para `/world` (`worldRedirect`, com caminhos livres `/join/*`, `/new-game`, `/start`, `/login` e `/world`). Guarda de lobby (`worldLobbyGuard`, `src/backend/worlds/worldLobbyGuard.ts`, aplicada por `withLobbyGuard` em `routes.ts` depois da checagem de assento): as rotas que gravam o jogo (compras, propostas, empréstimos, pré-contratos, livres, renovações, listas de venda e empréstimo, comissão, obras, missões e prospectos, base, loja de conquistas, conversas com jogadores: a promessa de saída mexe na lista de venda) respondem 409 `lobby` também por chamada direta; táticas, preferências e responsabilidades seguem livres. **`running`:**
  depois de "Começar" (`POST /api/worlds/:saveId/start`: dono, uma vez; `presimulateWorld` + evento `world_started`).
  Entrar continua possível depois.
- Até 8 técnicos (`WORLD.MAX_MEMBERS`, conferido dentro do lock do `addSeat` por `maxSeats`). O limite de 5 saves conta
  só os mundos de que o usuário é dono; passar a posse a quem já é dono de 5 dá 409 `ownerLimit` (`WORLD.MAX_OWNED`, mesmo contador).
- **Convite:** link `/join/<código>` (10 caracteres base32 sem 0/1/I/O, tabela `world_codes`; trocar o código derruba
  o link antigo) e convite pela lista de amigos (`world_invites`, só amigos do dono, até 20 pendentes
  `WORLD.MAX_PENDING_INVITES`, evento `world_invite`, bloco "Convites para ligas" do painel de Amigos). Convites cujo
  mundo sumiu ou que já viraram membro são filtrados na leitura. O login volta para a página pedida (`?next=`,
  `safeNextPath` em `authRedirect.ts`).
- **Entrar** (`POST /api/worlds/join`): o assistente do novo jogo no modo "entrar" (clubes humanos desabilitados),
  `addSeat` como membro com `guard` (código ainda válido, reconferido dentro do lock) e `onLocked` (anúncio dentro do
  lock). Erros: 404 código, 409 `full` / `alreadyMember` / `clubTaken`, 400 técnico ou clube (`SeatError`).
- **Prazo:** `deadlineHours` 12 / 24 / 48 / `null`, padrão 24; usado pelo avanço em grupo (parte 3).
- **Sair / tirar** (`removeSeat`, `src/backend/seats.ts`, também com `guard` e `onLocked`): empréstimos do assento
  devolvidos, ofertas de seleção dele apagadas e as vagas reabertas, seleção que ele treina fica com interino
  (`left_world`), o clube volta à IA como numa demissão (`releaseHumanClub`, interino e vaga), o técnico fica no
  ranking como livre (aparece no escopo "Livres"), a pasta do assento e a linha de `save_members` somem. O removido
  recebe `world_removed`. `SeatError("ownerOrLast")` para o dono ou o último assento.
- **Posse:** `POST /api/worlds/:saveId/owner` troca os papéis. O dono só sai depois de passar a posse (409
  `transferFirst`); sozinho, sair apaga o mundo (`deleteWorld`, os outros recebem `world_deleted`).
- Entrada e saída viram mensagem na caixa dos outros assentos (categoria `world`, tópico `competitions`) e notícia
  `world_member` (importância 3); as telas recarregam com `world_members`. Um anúncio que falha só é registrado
  (`logError`), nunca desfaz a operação.
- Todas as rotas de gestão reconferem o dono dentro do lock do mundo e recusam corpo acima de 8 KB (413).

### Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/multiplayerTypes.ts` | `WorldState`, `WorldView`, `WorldMemberView`, `WorldDeadline`, convites |
| `src/Domain/multiplayer/*` | `worldConfig` (`WORLD`), `worldCode`, `seatManager` (`parseSeatManager`: valida o técnico do join), `worldMessages` (caixa e notícia), `worldPublic` (`publicWorldMeta`: tira `createdBy` de toda resposta de save) |
| `src/backend/worlds/worldStore.ts` | SQLite: `world_codes`, `world_invites` |
| `src/backend/worlds/worldLifecycle.ts` | `createWorldState`, `worldView`, `deleteWorld`, anúncios de entrada e saída |
| `src/backend/worlds/worldNotify.ts` | Eventos `world_*` pelo socket |
| `src/backend/worlds/worldRoutes.ts` | Rotas |
| `src/backend/seats.ts` | `addSeat` (`guard`, `onLocked`, `maxSeats`), `removeSeat`, `SeatError` |
| `src/GameInterface/World/*` | `WorldScreen`, `JoinScreen`, `InviteFriendsModal`, `worldApi`, `worldNav` |
| `src/GameInterface/StartScreen.tsx`, `NewGameWizard.tsx`, `authRedirect.ts` | Lista de saves, passo Sozinho / Com amigos e modo entrar, volta do login |

### Rotas (`src/backend/worlds/worldRoutes.ts`)

| Rota | Quem | Faz |
|---|---|---|
| `GET /api/worlds/by-code/:code` | logado | `{ saveId, name, leagueSlug, leagueName, owner, members, max, phase, takenClubs }`; 404, 409 `full` / `alreadyMember` (com `saveId`) |
| `POST /api/worlds/join { code, clubId, manager, sackingEnabled }` | logado | entra; 201 `{ saveId, seatId, phase }` |
| `GET /api/worlds/invites` · `DELETE /api/worlds/invites/:saveId` | logado | convites recebidos; recusar |
| `GET /api/worlds/:saveId` | membro | `WorldView` (membros, código, prazo, papel) |
| `POST /api/worlds/:saveId/invite-code` | dono | código novo |
| `PUT /api/worlds/:saveId/settings { deadlineHours }` | dono | 12 / 24 / 48 / `null` |
| `POST /api/worlds/:saveId/invites { nickname }` | dono | convite a um amigo (404 se não é amigo) |
| `POST /api/worlds/:saveId/start` | dono | começa (409 `alreadyStarted`); se `presimulateWorld` falha: `logError("world")`, 500 `generic`, fase continua `lobby` (uma falha no meio pode deixar o kit aplicado) |
| `POST /api/worlds/:saveId/members/:seatId/remove` | dono | tira (400 `useLeave` para si) |
| `POST /api/worlds/:saveId/leave` | membro | sai; o dono: 409 `transferFirst`, ou apaga sozinho |
| `POST /api/worlds/:saveId/owner { seatId }` | dono | passa a posse (409 `ownerLimit`) |

Eventos de socket (`ServerEvent`, `src/types/socialTypes.ts`): `world_invite`, `world_started`, `world_removed`,
`world_deleted`, `world_members`.

### Telas

- Novo jogo: passo "Sozinho / Com amigos". `/join/:code`: card da liga e o assistente no modo entrar. i18n `world.*`.
- `/world` ("SUA **LIGA**"): membros (rosto, técnico, apelido, clube, papel; o dono passa a posse e tira), convite
  (link, copiar, trocar código, convidar amigos), prazo (`OptionChips`), Começar / "Esperando o dono começar", "Chat da
  liga" (`world:<saveId>`), "Sair da liga". Ícone de liga na barra superior só no multi.
- `/start`: "Com amigos · N/8", papel, "Na sala de espera"; o membro tem "Sair da liga" no lugar de excluir.

### Testes

```
bun test src/Domain/multiplayer src/backend/worlds src/backend/seats.addSeat.test.ts src/backend/seats.removeSeat.test.ts \
  src/backend/seats.review.test.ts src/backend/saves.seat.routes.test.ts src/backend/dal/seats.dal.test.ts \
  src/backend/auth src/backend/db.world.test.ts src/GameInterface src/i18n
```

### Limitações (parte 2)

- O técnico que saiu fica no ranking com `seatId`, mas fora do mercado de técnicos da IA (nunca é contratado, não se
  aposenta); um usuário que volta ganha outro registro.
- O assistente de entrada lista clubes e perfis pelos dados estáticos, não pela composição atual do mundo.
- Convites pela lista só para amigos do dono; ficam só no SQLite (o código continua valendo sem eles).
- Sem reserva de assento nem troca de clube de um membro (sair e entrar de novo).
- `removeSeat` encerra na hora todos os empréstimos do assento (cedidos e recebidos), sem notícia de mundo para essas voltas.
- Notícias e mensagens de entrada e saída são escritas na rota, com a data do mundo, não no avanço do dia.
- Um processo de servidor só (sockets, locks e presença em memória).

## Parte 3: avanço em grupo

Spec: `docs/superpowers/specs/2026-10-15-multiplayer-group-advance-design.md`. Plano:
`docs/superpowers/plans/2026-10-15-multiplayer-group-advance.md`. Vale com `mode: "multi"` e `world` (parte 2); só anda
em `world.phase === "running"`. O solo não muda.

### Regra

- **Pronto até:** `SeatState.readyUntil` = a data em que o mundo pode parar sem o assento (o `currentDate` alvo). "Amanhã" =
  um dia; "meu próximo jogo" = o dia do jogo (a véspera é o último dia rodado; acima de `MAX_READY_DAYS` 400 vale amanhã);
  data antes de amanhã → 400. `null` = não está pronto.
- **Alvo** (`computeGroupTarget`, `src/Domain/groupAdvance/groupAdvance.ts`): `min(readyUntil)` de todos os assentos, e um
  jogo oficial do assento (clube ou seleção) sem `matchDecision` para o mundo **no** dia do jogo. Sem clube: só a data.
  Decidir o jogo (`live`/`simulate`) conta como pronto até o dia seguinte.
- **Paradas do dia** (`seatStops`): demissão, proposta de emprego ou de seleção, fim da temporada do país do assento; o
  `readyUntil` dele volta a `null`. Técnico desempregado nunca para por jogo (o jogo da seleção dele é simulado).
- **Prazo e assistente:** toda parada grava `world.advance.waitingSince`. Passadas `deadlineHours` (12/24/48; `null` =
  espera todos), o assistente leva cada atrasado ao menor `readyUntil` dos outros (ou amanhã), simula o primeiro jogo dele
  no trecho (`simulate`; jogo de seleção sem fixture vira `simulate` com `fixtureId ""`) e manda a mensagem `world` /
  `auto_advanced`. O prazo recomeça na próxima parada.
- **Executor** (`src/backend/groupAdvance.ts`): `kickWorld` roda em segundo plano, um por mundo (um segundo chamado só pede
  nova olhada no fim); um dia por vez com `runBufferedDay` dentro de `withSaveLock`, relendo o alvo a cada dia, até
  `MAX_DAYS_PER_RUN` 450 (depois do teto, sem prazo, só um novo kick continua). Gravações ao vivo do dia entram como
  `recordings[seatId]`; uma gravação ausente, ou recusada pelo dia (400), vira `simulate` e o assento recebe `world` /
  `live_refused`; com várias recusadas no mesmo dia todas viram simulação (o dia não diz qual). Depois de cada dia: limpa
  decisões e gravações usadas, guarda a parte do assento em `pendingSummary.json` e manda
  `world_progress { saveId, date, target, running, waitingFor (apelidos), error? }` aos membros. O resumo pendente
  (`trimPendingSummary`, até `PENDING_SUMMARY_MAX` 120 dias) nunca descarta um dia com parada.
- **Erro num dia:** `logError("world", …)`, `advance.running = false`, `error/errorAt/errorTries` no `advance`. O relógio
  tenta de novo depois de 5, 15, 60 e 60 min (`ERROR_RETRY_MINUTES`, `errorRetryDue`), no máximo `MAX_ERROR_RETRIES` 5
  seguidas; depois só um kick (ação de um técnico) tenta. Sucesso limpa o erro.
- **Relógio e retomada:** `startWorldClock()` (subida, `src/index.ts`) libera um `advance.running` preso (`resumeWorlds`),
  dá kick nos mundos `running` e, a cada `CLOCK_MS` 60 s (`worldClockTick`), nos de prazo vencido ou erro com nova tentativa.
- **Calendário dos assentos:** `seatMatchDates` (`src/backend/advanceUntil.ts`) lista os jogos não jogados do assento (clube e
  seleção) até o maior `readyUntil`. `match-setup` devolve `matchDay { date, fixtureId }`, também no 409 `seatOpponent` e
  no jogo de seleção. `src/backend/playedMatchValidation.ts` (`validatePlayedMatch`, `knockoutRecordingDecided`) valida a
  gravação ao vivo (forma, mata-mata sem vencedor).
- `POST /api/advance-day` e `/advance-until` → 409 `groupAdvance`; num mundo multi sem `world` (testes), o avanço rápido
  segue 409 `multiSeat`.

### Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/groupAdvanceTypes.ts` | `MatchDecision`, `PendingDay`, `MemberAdvanceStatus`, resposta de `GET …/advance` |
| `src/Domain/groupAdvance/groupAdvanceConfig.ts` | Constantes (`GROUP_ADVANCE`) |
| `src/Domain/groupAdvance/groupAdvance.ts` (+ teste) | Puro: `resolveReadyUntil`, `computeGroupTarget`, `memberStatus`, `deadlineAt`/`deadlinePassed`, `assistantPatches`, `seatStops`, `trimPendingSummary`, `errorRetryDue` |
| `src/Domain/inbox/worldAdvanceMessage.ts` | Mensagens `world` / `auto_advanced` e `live_refused` |
| `src/backend/groupAdvance.ts` | Executor, relógio, retomada, `groupAdvanceView` |
| `src/backend/groupAdvanceRoutes.ts` | Rotas |
| `src/backend/playedMatchValidation.ts` | Validação da gravação ao vivo |
| `src/backend/dal/*` | `liveRecording.json` (apagado quando o dia roda), `pendingSummary.json` do assento |
| `src/GameInterface/World/*` | `GroupAdvanceProvider`, `ReadyControl` (`readyBranch`), `GroupAdvanceBand`, `groupAdvanceApi`, `groupAdvanceText`, `groupAdvanceErrors` |
| `scripts/group-advance-measure.ts` | Medição |

### Rotas (`requireSeat`; solo → 409 `notMulti`, lobby → 409 `lobby`)

| Rota | Faz |
|---|---|
| `POST /api/worlds/:saveId/ready { until }` | Marca (ou `null` desmarca) e dá kick |
| `POST …/match-decision { date, fixtureId, mode: "simulate" }` | Decide o jogo do dia |
| `POST …/live-recording { date, fixtureId, recording }` | Grava a partida ao vivo (409 `dayClosed`, 400 `notYourMatch`/`noWinner`/`invalidRecording`, 409 `seatOpponent`) |
| `GET …/live-recording` | Resultado provisório (404 sem gravação do dia) |
| `GET …/advance` | Estado do grupo (data, alvo, quem falta, prazo, erro, status por membro) |
| `GET/DELETE …/summary` | Resumo pendente do assento |

Evento de socket: `world_progress`.

### Telas

- Barra superior: **Pronto até…** (amanhã, meu próximo jogo, uma data) no lugar do Continuar; marcado, "Pronto até 12/03 ·
  esperando 2" com desmarcar; no dia de jogo **Jogar** (prévia → partida) e **Simular**; durante o avanço "Avançando…
  14/03 de 20/03". `GroupAdvanceBand` no Painel e em `/world` (data, alvo, quem falta, prazo restante, status por membro:
  pronto, jogo a decidir, atrasado, sem clube). Depois de um avanço, o Painel mostra o resumo, o fim de temporada e a
  demissão.
- Erro do executor: texto com a próxima tentativa; esgotadas as 5, botão **Tentar de novo** (novo kick). Gravação do jogo
  ao vivo que falha fica em `sessionStorage`, e o "Tentar de novo" dela só funciona na mesma aba.
- A partida ao vivo grava para o grupo; prévia e resultado mostram o resultado provisório (`/match-result?pending=1`).
  i18n `world.advance.*`.

### Medição (`bun scripts/group-advance-measure.ts 21`, 2026-10-15)

| Assentos | Ligas | Dias | Paradas | Tempo total | Por dia | Por parada |
|---|---|---|---|---|---|---|
| 3 | Premier, La Liga, Brasileirão A | 29 | 6 | 123,1 s | 4,24 s | ~20,5 s |

Um dia com rodada de uma liga com assento roda no motor completo (~12–14 s); um dia sem rodada custa ~1,5–2 s.

### Testes

```
bun test src/Domain/groupAdvance src/Domain/inbox/worldAdvanceMessage.test.ts src/backend/playedMatchValidation.test.ts \
  src/backend/groupAdvance.test.ts src/backend/groupAdvance.routes.test.ts src/backend/groupAdvance.live.test.ts \
  src/backend/dal/seats.dal.test.ts src/GameInterface/World src/i18n/groupAdvance.keys.test.ts
```

### Limitações (parte 3)

- Um processo de servidor só: executor e relógio ficam em memória (a subida retoma os mundos `running`).
- O resultado oficial do jogo ao vivo só aparece no mundo quando o executor roda aquele dia.
- Várias gravações recusadas no mesmo dia viram todas simulação.
- O "Tentar de novo" da gravação só vale na mesma aba (`sessionStorage`).
- Técnico desempregado: o jogo da seleção dele é simulado e não para o mundo; o jogo da seleção ao vivo não tem resultado
  provisório (só o do clube).
- Sem pausa da liga pelo dono (o "sem prazo" já espera todos).
- Depois do teto de 450 dias, sem prazo, só um novo kick continua.
