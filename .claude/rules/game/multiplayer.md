# Multiplayer — parte 1: assentos

Spec: `docs/superpowers/specs/2026-10-14-multiplayer-design.md` (visão geral e §2). Plano:
`docs/superpowers/plans/2026-10-14-multiplayer-seats.md`. Etapa 43 (#106). Sem versão nova: nada visível mudou.

## Regra

- Um save é um **mundo** com N técnicos humanos (**assentos**). O solo é um mundo com um assento (`mode: "solo"`).
  `addSeat` (`src/backend/seats.ts`: testes, scripts e `POST /api/worlds/join`) acrescenta assentos (`mode: "multi"`). Convites e a tela
  do mundo: seção "Parte 2: liga de amigos"; mundo público: "Parte 5b".
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
    `POST /transfers`, `/loans` e `/pre-contracts` dão 404 `notFound` (`isOtherSeatClub`). Entre dois técnicos humanos
    as propostas vão por `/seat-offers` (parte 4).
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
- Jogo entre dois assentos: a prévia é a normal e oferece simular a partida (o avanço do dia joga no motor completo
  com as duas táticas); só a partida ao vivo (`match-setup?live=1`) dá 409 `seatOpponent` (parte 4).
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
  vivo é só contra a IA (humano × humano é simulado). Na prévia, o técnico adversário é o do outro assento
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
- **Nome da liga (4.34.1):** toda tela mostra a liga como "Liga de <apelido do dono>" (`world.leagueOf`), nunca o
  nome do save (o clube do dono): painel Amigos, título da janela de chat e dos avisos, `/world`, entrada pelo código.
  O servidor manda só o apelido (`worldOwnerName`, `worldLifecycle.ts`: apelido do dono, senão o nome do técnico dele)
  em `WorldView.owner`, `WorldRoomView.owner` e `WorldByCode.owner`; o convite e o `world_invite` não levam nome.
  Duas ligas do mesmo dono no painel Amigos e no chat ganham o clube do próprio técnico ao lado ("Liga de Emy ·
  Arsenal", `worldRoomLabel`, `WorldRoomView.myClub`, 4.34.2).
- **Clubes de outros técnicos (4.34.2):** o selo com o apelido (`World/HumanBadge.tsx`, `useHumanClubs`) aparece na
  Classificação e nos Jogos de Ligas, na tabela do Painel e no cabeçalho do elenco do clube.
- **Barra superior:** o controle "Pronto até…" fica numa faixa fixa de 184px (`TopNavigation`); cada estado cabe nela
  (textos cortados com o completo no `title`, "Avançando" curto `world.advance.runningShort`, sem "não estou pronto"
  num dia de jogo sem decisão), para a largura das abas não mudar enquanto o mundo anda (report de tester).
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

- Ligas → Classificação: o clube do assento destacado e um selo com o apelido nos clubes dos outros membros
  (`useHumanClubs` → `humanClubsOf`, de `GET /api/worlds/:saveId`).
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
- **Erro num dia:** o texto vai só para o `logError("world", …)`; `advance.running = false` e `advance.error` (e o
  `world_progress.error`) guardam o código fixo `dayFailed` (`DAY_FAILED`), com `errorAt/errorTries`. O relógio tenta de
  novo depois de 5, 15, 60 e 60 min (`ERROR_RETRY_MINUTES`, `errorRetryAt`/`errorRetryDue`), no máximo
  `MAX_ERROR_RETRIES` 5 seguidas (`errorGaveUp`); depois só um kick (ação de um técnico, ou `POST …/advance/retry`, que
  zera `errorTries` sob `withSaveLock` e dá kick) tenta. Sucesso limpa o erro.
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
| `src/Domain/groupAdvance/groupAdvance.ts` (+ teste) | Puro: `resolveReadyUntil`, `computeGroupTarget`, `memberStatus`, `deadlineAt`/`deadlinePassed`, `assistantPatches`, `seatStops`, `trimPendingSummary`, `errorRetryAt`/`errorRetryDue`/`errorGaveUp` |
| `src/Domain/groupAdvance/pendingSummary.ts` (+ teste) | `aggregatePendingDays`: os dias pendentes num resumo só |
| `src/Domain/inbox/worldAdvanceMessage.ts` | Mensagens `world` / `auto_advanced` e `live_refused` |
| `src/backend/groupAdvance.ts` | Executor, relógio, retomada, `groupAdvanceView` |
| `src/backend/groupAdvanceRoutes.ts` | Rotas |
| `src/backend/playedMatchValidation.ts` | Validação da gravação ao vivo |
| `src/backend/dal/*` | `liveRecording.json` (apagado quando o dia roda), `pendingSummary.json` do assento |
| `src/GameInterface/World/*` | `GroupAdvanceProvider`, `ReadyControl` (`readyBranch`), `GroupAdvanceBand`, `groupAdvanceApi`, `groupAdvanceText`, `groupAdvanceErrors` |
| `scripts/group-advance-measure.ts` | Medição e o fluxo de 3 assentos (Premier, La Liga, Brasileirão A) de ponta a ponta |

### Rotas (`requireSeat`; solo → 409 `notMulti`, lobby → 409 `lobby`)

| Rota | Faz |
|---|---|
| `POST /api/worlds/:saveId/ready { until }` | Marca (ou `null` desmarca) e dá kick |
| `POST …/match-decision { date, fixtureId, mode: "simulate" \| "undo" }` | Decide o jogo do dia; `undo` (4.35.3) desfaz um "Simular" do dia que ainda não rodou (sai o "Pronto até" D+1 que ele pôs; 409 `noDecision` sem nada a desfazer). A barra mostra "Jogo será simulado" com o botão de desfazer, e o Simular explica no `title` |
| `POST …/live-recording { date, fixtureId, recording }` | Grava a partida ao vivo (409 `dayClosed`, 400 `notYourMatch`/`noWinner`/`invalidRecording`, 409 `seatOpponent`) |
| `GET …/live-recording` | Resultado provisório (404 sem gravação do dia), com o árbitro da escala do dia (`officialsFor`) |
| `GET …/advance` | Estado do grupo (data, alvo, quem falta, prazo, status por membro) e o erro do executor: `error` (código), `errorTries`, `nextRetryAt`, `gaveUp` |
| `POST …/advance/retry` | "Tentar de novo", só depois de o relógio desistir: zera `errorTries` e dá kick (409 `noError` sem erro, 409 `notGaveUp` enquanto o relógio ainda tenta) |
| `GET/DELETE …/summary` | Resumo pendente do assento: `{ days, aggregate }` (`aggregate` = os dias num resumo só, `PendingSummaryAggregate`; os logs lidos em lotes de 6) |

Evento de socket: `world_progress`.

### Telas

- Barra superior: **Pronto até…** (amanhã, meu próximo jogo, uma data) no lugar do Continuar; marcado, "Pronto até 12/03 ·
  esperando 2" com desmarcar; no dia de jogo **Jogar** (prévia → partida) e **Simular**; durante o avanço "Avançando…
  14/03 de 20/03". `GroupAdvanceBand` no Painel e em `/world` (data, alvo, quem falta, prazo restante, status por membro:
  pronto, jogo a decidir, atrasado, sem clube). Depois de um avanço, o Painel mostra **um** resumo para todos os dias que
  rodaram (`DaySummaryModal` com `range`: os jogos do clube com resultados e lesões, as transferências do clube, o
  treino e a folga de todos os dias somados por jogador ("5 dias de treino", "1 dia de folga"; os efeitos ficam em
  `PendingDay.club`, porque o log gravado do dia não os guarda), as conquistas somadas, o convite de coletiva e, quando o "Pronto até" voltou por causa delas, as paradas: propostas novas,
  demissão, fim da temporada), depois o fim de temporada; a demissão leva a `/fired`.
- Erro do executor (`GroupAdvanceBand`): o texto do código (`world.advance.errors.dayFailed`) com a hora da próxima
  tentativa; esgotadas as 5, "A liga parou de tentar" e o botão **Tentar de novo** (`POST …/advance/retry`). Gravação do
  jogo ao vivo que falha fica em `sessionStorage`, e o "Tentar de novo" dela só funciona na mesma aba.
- A partida ao vivo grava para o grupo; o resultado (`/match-result?pending=1`) mostra o resultado provisório (a prévia
  não). i18n `world.advance.*`.

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
- **Prazo × partida ao vivo:** se o prazo vence enquanto ele joga, o assistente simula o jogo e o dia roda; a gravação
  enviada depois recebe 409 `dayClosed`, e a partida e o reenvio vão para o resultado oficial (`/match-result?date=D`, o
  jogo simulado), sem erro. A partida jogada se perde.
- Com o executor rodando, as escritas dos membros (pronto, decisão, gravação, retry) esperam o dia em curso no
  `withSaveLock` (até ~14 s num dia com rodada no motor completo).
- O resumo agregado lista os jogos e as transferências do clube atual do assento (uma troca de clube no meio esconde os do
  clube antigo); o jogo da seleção não entra.
- Depois do teto de 450 dias, sem prazo, só um novo kick continua.

## Parte 4: humano × humano

Spec: `docs/superpowers/specs/2026-10-16-multiplayer-h2h-design.md`. Plano: `docs/superpowers/plans/2026-10-16-multiplayer-h2h.md`.
Versão **4.26**. Vale em qualquer mundo com 2+ assentos; a partida ao vivo entre dois técnicos fica de fora.

### Regra

- **Jogo entre dois assentos:** `POST /api/match-setup` devolve a prévia normal com `seatOpponent: true`. O adversário é
  lido como um clube da IA (formação e XI automático dele, nunca a tática salva do outro técnico) e o `opponentSquad` vem
  sem os dados privados do outro assento (`publicSeatSquad`, `src/Domain/seats/publicSquad.ts`: sem moral, conversas e
  promessas, comissão, instalações, atributos do técnico, familiaridade, inscrições, saldo, nem `morale`/`moraleLog`/
  `squadStatus` dos jogadores). Com `?live=1` segue
  409 `seatOpponent` (com `matchDay`). A prévia mostra o botão **Simular**; o avanço do dia joga a partida no motor
  completo com a tática de cada assento. O jogo entra no log do dia dos dois.
- **Propostas entre técnicos:** um assento propõe a outro um jogador de elenco do clube dele. `SeatOffer`
  (`src/types/seatOfferTypes.ts`): `kind` `transfer` ou `loan`, partes (vendedor e comprador), `terms`, `turn`,
  `counters`, `expires`, `history`. Ficam em `saves/{id}/seatOffers.json`, do mundo.
- **Transferência:** taxa, cláusula de venda futura (0/10/20/30%) e o contrato do jogador (`wage`, `years`) fixados na
  proposta e validados por `evaluateContractOffer` (400 com a recusa e o `demand`). **Empréstimo:** taxa (pode ser 0),
  `wageShare` e data de volta (fim da temporada do comprador, nunca além do contrato). `wageShare` nas rotas é inteiro 0..100.
- **Janela:** só com a janela do comprador aberta (409 `windowClosed`); a proposta vence no fecho dela. O vendedor pode
  estar fechado.
- **Negociação:** o comprador propõe; o vendedor aceita, recusa ou contrapropõe (taxa, cláusula ou `wageShare`); o
  comprador aceita a contraproposta, contrapropõe de volta ou **Retira** (ele não tem "Recusar"). No máximo
  `MAX_COUNTERS` (3) contrapropostas somando os dois lados (409 `noRounds`); fora da vez, 403 `notYourTurn`. Uma
  contraproposta sem `sellOnPct` mantém a cláusula que estava na mesa. Validade
  `VALID_DAYS` (5) a partir da proposta ou da contraproposta. No máximo `MAX_OPEN_SENT` (10) abertas por comprador
  (409 `tooManyOffers`) e uma por jogador e tipo (409 `alreadyOffered`).
- **Aceite:** reconfere tudo dentro do `withSaveLock`: jogador ainda lá e sem empréstimo (400 `onLoan`), elenco do
  comprador abaixo de `HUMAN_MAX_SQUAD` (409 `squadFull`), mínimos do vendedor (409 `squadDepth`) e o contrato
  (409 `contractRefused { reason }`: a recusa do jogador no aceite, como um muito ambicioso). `squadFull` e `squadDepth`
  no aceite só recusam o aceite: a proposta fica (como no vencimento diário); as demais falhas a derrubam. A transferência move a
  taxa nos dois extratos, o histórico e a cláusula; o empréstimo grava o `loan` nos mercados dos **dois** assentos e
  volta na data.
- **Fechamento:** a proposta cai (`closed`) quando o jogador sai do clube ou vira emprestado, ou quando um dos assentos
  sai do clube ou do mundo (`closeOffersForPlayer`, `closeOffersOfSeat`, chamados por `releaseHumanClub`, `removeSeat` e
  pelas vendas). Vencimento diário (`expireSeatOffers`, no avanço do dia): por data ou janela fechada; elenco cheio e
  mínimos só bloqueiam o aceite, a proposta fica.
- `removeSeat` também tira do mercado do outro assento os empréstimos encerrados com o assento removido (senão ele
  continuaria pagando a parte do salário até a data antiga).
- **Caixa:** categoria `transfer`, `kind` `seat_offer` (tópico `actions`, nunca descartado), uma mensagem por evento
  (`offer`, `counter`, `accept`, `reject`, `withdraw`, `expired`, `closed`) para o outro lado e, em `expired` e
  `closed`, para os dois. Push `seat_offer { saveId }` pelo socket recarrega as telas; quem grava por um
  `BufferingSaveDAL` (aceite, troca de clube, saída do mundo, avanço do dia) junta os avisos (`SeatNudges`) e só avisa
  depois do `flush` (`nudgeSeats`; o dia pelo `seatOfferNudges` da resposta, em `runBufferedDay`). No avanço do dia, o
  `closed` de uma demissão ou de um fim de contrato (`releaseHumanClub` com `sink`) entra nas mensagens adiadas, depois
  do `clearInbox`.
- Lobby: as rotas de escrita respondem 409 `lobby` (`worldLobbyGuard`).

### Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/seatOfferTypes.ts` | `SeatOffer`, `SeatOfferTerms`, `SeatOfferView`, ações |
| `src/Domain/seatOffers/seatOfferConfig.ts`, `seatOffers.ts` (+ teste) | Constantes (`SEAT_OFFERS`), criação, vez e contrapropostas, visão por assento |
| `src/backend/seatOfferWorld.ts` | E/S: `checkOfferWorld`, `completeSeatTransfer`, `completeSeatLoan`, `closeOffersForPlayer`, `closeOffersOfSeat`, `expireSeatOffers`, mensagens |
| `src/backend/seatOfferRoutes.ts` | Rotas |
| `src/backend/dal/*`, `SaveService.ts` | `getSeatOffers` / `writeSeatOffers` (bufferizados) |
| `src/backend/routes.ts` (`match-setup`), `advanceDay.ts`, `seats.ts`, `jobWorld.ts`, `negotiationWorld.ts` | Prévia, vencimento diário, fechamentos, empréstimo nos dois mercados |
| `src/GameInterface/Negotiation/SeatOfferCard.tsx`, `seatOfferApi.ts`, `seatOfferErrors.ts` | Cartão da proposta, API e textos de erro |
| `src/GameInterface/Components/PlayerOfferModal.tsx`, `InboxScreen.tsx`, `Negotiation/NegotiationOverview.tsx`, `MatchPreviewScreen.tsx` | Telas |

### Rotas (`requireSeat`; escrita com `withSaveLock`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/seat-offers` | `{ offers, seatClubs }`: propostas em que o assento é parte (`side`, `myTurn`, `otherManager`) e os clubes, com técnico, dos outros assentos |
| `POST /api/saves/:id/seat-offers { kind, playerId, fromSquadId, fee, sellOnPct?, wage?, years?, wageShare? }` | Propõe. 404 `notFound` (clube que não é de outro assento, jogador ausente); 409 `noClub` / `windowClosed` / `alreadyOffered` / `tooManyOffers` / `squadFull` / `squadDepth`; 400 `invalidTerms` / `onLoan` / recusa de contrato (com `demand`) |
| `POST /api/saves/:id/seat-offers/:offerId { action: "accept" \| "reject" \| "counter" \| "withdraw", fee?, sellOnPct?, wageShare? }` | Responde. 404 `notFound`; 403 `notYourTurn`; 409 `offerClosed` / `noRounds` / `contractRefused { reason }` |

### Telas

- **Prévia** do jogo contra outro técnico: a normal, com **Simular** (ou voltar ao painel).
- **Negociação** (`PlayerOfferModal`): jogador de clube de outro assento abre o fluxo de proposta entre técnicos
  (taxa, cláusula, contrato; empréstimo com `wageShare`), sem as rodadas da IA. Num mundo em grupo nada é enviado até a
  lista de propostas carregar (falhando, erro e "Tentar de novo", nunca o fluxo da IA). Uma proposta aceita, recusada ou
  retirada pelo cartão no modal ou nas negociações deixa a mensagem de resultado na tela.
- **Caixa de entrada:** `SeatOfferCard` (vendedor: Aceitar, Contrapropor, Recusar; comprador: Aceitar a contraproposta,
  Contrapropor, Retirar). **Transferências → negociações** (`NegotiationOverview`): as propostas abertas com o mesmo
  cartão. i18n `seatOffers.*` (en, pt-BR).

### Testes

```
bun test src/Domain/seatOffers src/backend/dal/seatOffers.dal.test.ts src/backend/seatOffers.routes.test.ts \
  src/backend/seatOffers.day.test.ts src/backend/seatOffers.loans.test.ts src/backend/seats.review.test.ts \
  src/i18n/seatOffers.keys.test.ts src/GameInterface/Social
```

### Limitações (parte 4)

- Sem partida ao vivo entre dois técnicos: sempre simulada, no motor completo.
- Só jogadores de elenco: base, livres e pré-contrato entre técnicos não existem.
- Sem rival da IA nem disputa na proposta entre técnicos; a preferência do jogador (`preferenceScore`) não entra, só a
  recusa de contrato no aceite.
- Elenco cheio e mínimos do vendedor aparecem só no aceite, não ao propor.

## Parte 5a: classificação dos técnicos

Spec: `docs/superpowers/specs/2026-10-16-multiplayer-standings-design.md`. Plano: `docs/superpowers/plans/2026-10-16-multiplayer-standings.md`.
Versão **4.27**. A parte 5 foi dividida: esta é a classificação dos técnicos de uma liga de amigos; o mundo público é a 5b.

### Regra

- Vale em mundos `mode: "multi"` com `world` (liga de amigos); no solo nada aparece e nada é gravado (`standingsOn`).
- Cada assento soma pontos por **passagem** (um clube numa temporada). A passagem fecha na virada do país do clube, numa
  troca de clube, numa demissão ou no fim do contrato. Total = soma das passagens fechadas; a aberta aparece como
  **parcial**, calculado na hora com a posição de hoje.
- Pontos (constantes em `STANDINGS`, `src/Domain/multiplayer/standingsConfig.ts`):

| Componente | Pontos |
|---|---|
| Meta da diretoria cumprida (posição ≤ `target`) | +10, mais +1 por posição acima da meta (até +10) |
| Meta falhada | −1 por posição abaixo (até −10) |
| Título da liga (na virada) | +15 |
| Acesso / rebaixamento (na virada) | +8 / −8 |
| Copa nacional | campeão +8, finalista +3 |
| Continental (só a maior fase) | campeão +15, finalista +6, semifinal +3, passou dos grupos +1 |
| Melhor técnico da liga / do mundo | +4 / +8 |
| Seleção: título de torneio / meta da federação cumprida | +6 / +2 |
| Demissão | −5 |

- Copa e continental pontuam **no dia do evento**, pela maior fase da passagem (`withExtra`: copa e continental guardam o
  maior, os demais somam); o perdedor da final da copa leva o de finalista. Prêmios e seleção também entram no dia, na
  passagem aberta (desempregado não pontua).
- **Fechamento no meio da temporada** (troca, demissão, fim de contrato): a parte da meta vale metade (arredondada para
  zero, item `half`); títulos e fases contam inteiros; demissão soma −5. Sem jogos na liga a parte da meta vale 0.
- **Demissão ou fim de contrato no próprio dia da virada:** a passagem aberta pela virada desse dia
  (`DaySeat.standingOpenedByRollover`) é descartada; a demissão põe o −5 na linha `rollover` do dia, o fim de contrato
  deixa a linha intacta. Uma passagem aberta antes (inclusive hoje, por troca de clube ou entrada) fecha normalmente,
  com o motivo e a meta pela metade.
- **Começo do mundo:** depois do kit, todas as passagens reabrem na data do mundo (`/start`).
- **Posição** na tabela é compartilhada em empate de total (`rankOf`: 1 + quantos têm total maior; a mesma na tabela, no
  Painel e na mensagem `season_closed`); a ordem é total, parcial, nome.
- Idempotente: o id da linha é `seatId:clubId:season:closedOn`; um dia refeito não grava de novo. Na virada, uma
  passagem aberta hoje cuja temporada não é a que fecha (a da temporada nova, gravada por uma tentativa anterior do mesmo
  dia) não é fechada: continua a passagem aberta.

### Dados

- `saves/{id}/seatSeasons.json` (do mundo, bufferizado): `SeatSeasonRow[]` (`src/types/standingsTypes.ts`: clube, liga,
  temporada, `reason`, posição, meta, `items`, `total`).
- `SeatState.standing?: SeatStanding` — a passagem aberta (começo, clube, temporada, `target`, `extras`). O resto do
  parcial vem da tabela na hora. Sem migração.

### Onde grava

| Onde | O que |
|---|---|
| `addSeat` (`seats.ts`) e `acceptJobOffer` (`jobWorld.ts`) | Abrem a passagem; a troca fecha a antiga antes (`club_change`) |
| `advanceDay.ts` (`standingExtra`) | Copa, continental, melhor técnico e seleção entram em `extras` do dia |
| `advanceDay.ts`, virada do país | Fecha (`rollover`) com título/acesso/rebaixamento e abre a seguinte |
| `advanceDay.ts`, demissão / fim de contrato | Fecha com `sacked` / `contract` |
| `standingsWorld.ts` | E/S: `newPassage`, `closeSeatPassage`, `appendSeatSeasons`, `positionOf`, `standingsView` |

Mensagem `world` / `season_closed` (pontos, posição) para **todos** os assentos na virada, depois do `clearInbox`; não
duplica num dia refeito. O socket `world_members` recarrega as telas.

### Rota

`GET /api/worlds/:saveId/standings` (qualquer membro; solo 409 `notMulti`): `{ entries, rows }`, uma entrada por técnico
(`partial`, `closedTotal`, `total`, `seasons`) ordenada, e as linhas fechadas dos membros atuais, mais novas primeiro
(as de quem saiu ficam no arquivo, fora da resposta).

### Telas

- `/world` → aba **Classificação** (`World/StandingsTable.tsx`): #, rosto, técnico, apelido, clube, "Temporada atual"
  (parcial), "Fechadas" e "Total"; a linha do próprio técnico destacada; abrir mostra cada temporada com os itens.
  Com a aba aberta, recarrega com `world_members` e quando um avanço em grupo para (`world_progress` com
  `running: false`).
- Painel: linha "Liga de amigos: Nº de N" no `ClubCard`, link para a aba. Caixa: `season_closed`.
- i18n `world.standings.*` (en, pt-BR); a mensagem usa plural (`preview_one/_other`, `body_one/_other`, `count` = pontos).

### Testes

```
bun test src/Domain/multiplayer src/backend/dal/seatSeasons.dal.test.ts src/backend/standings.world.test.ts \
  src/backend/standings.advanceDay.test.ts src/backend/standings.routes.test.ts src/i18n/standings.keys.test.ts
```

### Limitações (parte 5a)

- Começa do zero em cada mundo; sem troféu para o campeão da liga de amigos.
- A meta é a da diretoria: meta fácil pontua mais pela posição relativa, por desenho.
- Só liga de amigos; o mundo público é a 5b.
- **Continental de liga de ano civil:** a campanha continental atravessa a virada de uma liga de ano civil (Libertadores,
  Europa com ligas que viram em dezembro); ela se divide entre as duas passagens e só a maior fase de cada passagem conta.
- **Dia refeito com flush parcial** (fase 1 do `flush` não atômica): se o assento foi gravado com a passagem nova mas
  `seatSeasons.json` não, a linha da temporada fechada se perde; os pontos que o dia refeito somar (copa, continental,
  prêmios) vão para a passagem nova; a mensagem `season_closed` não sai de novo; e um prêmio mundial (janeiro) já
  creditado ao registro do técnico não volta a pontuar na passagem.

## Parte 6: rivais

Spec: `docs/superpowers/specs/2026-10-19-multiplayer-rivals-design.md`. Plano: `docs/superpowers/plans/2026-10-19-multiplayer-rivals.md`.
Versão **4.34**. Vale em mundos `mode: "multi"` com `world`; o solo não muda. Sem efeito de partida (`/test`, `/lab`: nada).

### Regra

- **Resultados do dia:** em cada dia que o executor roda (`stepWorld`, dentro do lock), `recordDayResults` grava no
  serviço bufferizado do próprio dia, antes do `flush` (`runBufferedDay(..., beforeFlush)`, 4.34.3): o feed entra junto
  com o dia ou nada entra (uma falha ali falha o dia, que roda de novo; o feed é idempotente pelo id).
  `recordDayResults` (`src/backend/rivals/rivalsWorld.ts`) monta os jogos dos clubes humanos a partir de
  `outcome.payload.events` (`buildSeatResults`, `src/Domain/rivals/results.ts`) e grava em `saves/{id}/rivalsFeed.json`
  (`SeatResult[]`, mais novos primeiro, até `RIVALS.FEED_MAX` 300, id `<data>:<competição>:<fixtureId>:<seatId>`, um id
  repetido não duplica). Um jogo entre dois assentos vira dois resultados. Todo membro recebe
  `world_results { saveId, results }`.
- **Situações** (`resultSituations`): `win`/`draw`/`loss` sempre; `big_win`/`big_loss` (saldo ≥ 3), `home_loss`,
  `away_win`, `comeback_win`, `blown_lead`, `late_equalizer` / `late_winner` (88' ou depois, pelos minutos dos gols),
  `shootout_win`/`shootout_loss` (empate decidido nos pênaltis).
- **Placar ao vivo:** o `MatchScreen` de um mundo em grupo manda `live_score { saveId, fixtureId, phase, minute, score:
  { for, against }, scorer?, side? }` (`start`, `goal`, `disallowed`, `red` (4.35.3, com `side` e o expulso em `scorer`), `half`, `minute`, `end`; nada em jogo de seleção; desde a 4.34.1 um
  `minute` a cada `RIVALS.LIVE_MINUTE_STEP` (5) minutos de jogo, conferido a cada segundo: precisa adiantar o minuto,
  não muda o placar, volta o status a `live` depois do intervalo e não conta no limite de 40 eventos) por um socket próprio
  (`useLiveRivals`). O servidor (`src/backend/rivals/liveScores.ts`, em memória) aceita só de um membro, para o jogo não
  jogado do clube do assento na data do mundo; um gol soma, um gol anulado pelo VAR (`disallowed`, 4.34.3, do evento
  `goalDisallowed`) tira exatamente um de um lado e apaga o último gol, o resto não muda o placar; o minuto não volta,
  0..130, até 40 eventos por jogo, 30 frames por minuto por socket; o autor só fica se for nome de um dos dois elencos.
  Frame recusado: silêncio. Repasse `friend_live { saveId, seatId, live, goal? }` aos outros membros; `end` fica 10 min,
  15 min sem evento = interrompido, 30 min = some (varredura de 30 s junto da presença); o dia rodado tira os jogos
  daquele dia (`clearLiveForDay`). Provisório: o oficial é o resultado do dia.
- **Resenha:** `POST /api/worlds/:saveId/taunts { target: { result } | { live: seatId }, kind, id }` (membro; 409
  `lobby` / `notMulti` / `noNickname`, 404 alvo inexistente, 400 `self` / `invalidTaunt` / `invalidBody`, 429
  `rateLimited` com o limite do chat). 4 reações (`applause`, `fire`, `laugh`, `sorry`) e frases do catálogo
  (`src/Domain/rivals/taunts.ts`, 4 por situação e por gol ao vivo, `rivals.taunts.<id>`); a frase tem que ser de uma
  situação do alvo. Vira mensagem da sala `world:<saveId>` com `chat_messages.meta = { taunt }` (ids e o placar real)
  e um `body` em inglês; nenhum texto livre.

### Rotas (`src/backend/rivals/rivalsRoutes.ts`, membro; solo 409 `notMulti`)

| Rota | Faz |
|---|---|
| `GET /api/worlds/:saveId/rivals` | `{ rows: RivalRow[] }`: apelido, rosto, clube, posição na liga, forma (5 do feed), último resultado, próximo jogo, posição e pontos na liga de amigos, placar ao vivo |
| `GET /api/worlds/:saveId/results?seat=&offset=&limit=` | Feed paginado (limite 1..50, 400 fora) |
| `GET /api/worlds/:saveId/live` | `{ live: LiveScoreView[] }` |
| `POST /api/worlds/:saveId/taunts` | Resenha (acima) |

### Telas

- `/world`: abas **Rivais** (`RivalsTable`, clicar abre os resultados do amigo) e **Resultados** (`ResultsFeed`, por
  dia, filtro por amigo, ações de resenha); `?tab=rivals|results`.
- Painel: cartão **Rivais** (`RivalsCard`) com 2+ técnicos.
- Avisos no canto (`ChatPopups`): resultado de amigo ("Fabio · Vasco 0–3 Bahia", borda primária / neutra / destrutiva)
  e gol ao vivo, com as ações; 8 s, no máximo 3.
- **Últimos lances (4.35.3):** `LiveScoreView.moments` guarda os últimos `RIVALS.LIVE_MOMENTS_MAX` (12) lances (gol com autor, gol anulado, expulsão, intervalo, fim); clicar no amigo na faixa abre o popup `LiveMoments` (placar + lances, mais novos primeiro) com a resenha embaixo.
- Partida ao vivo: faixa `LiveRivalsStrip` acima do campo (selo Ao vivo vermelho pulsando, 4.35.3); os avisos (`ChatPopups`) vão para o ponto `MATCH_POPUPS_ID` logo abaixo dela, centralizados sobre o topo do campo, em vez do canto; gol do amigo destaca 4 s com o autor; clique abre as ações
  sem pausar.
- Chat: `TauntLine` (escudo 20px, placar, ícone ou frase em itálico no idioma de quem lê). i18n `rivals.*`.

### Testes

```
bun test src/Domain/rivals src/backend/rivals src/backend/dal/rivalsFeed.dal.test.ts src/backend/groupAdvance.rivals.test.ts \
  src/backend/social src/backend/db.social.test.ts src/GameInterface/Social src/GameInterface/World src/i18n/rivals.keys.test.ts
```

### Limitações (parte 6)

- Placar ao vivo depende do navegador de quem joga: aba fechada vira "interrompido" até o dia rodar. Recarregar a
  página manda um `start` (ou `half` no intervalo) com o minuto e o placar atuais (4.34.2), que reconstrói o jogo no
  servidor mesmo se ele já o tinha descartado.
- O placar ao vivo é do cliente (só validado por coerência).
- Estado ao vivo em memória (um processo só).

## Parte 5b: mundo público

Spec: `docs/superpowers/specs/2026-10-26-multiplayer-public-world-design.md`. Plano:
`docs/superpowers/plans/2026-10-26-multiplayer-public-world.md`. Versão **4.35**. É o mesmo mundo `multi` com
`world.kind === "public"`: sem dono, sem convite, ritmo por relógio.

### Regra

- **Criação:** o servidor, na subida (`ensurePublicWorld`, chamado por `startWorldClock`): um mundo por versão do jogo
  (`world.edition = { version, startedOn }`), sem clube humano, já `running` (kit pré-simulado). Uma edição de outra versão é
  apagada e fica no **hall da fama** (`public_editions`, top 10 atualizado a cada passo). O mundo zera a cada deploy.
- **Entrar:** qualquer usuário com apelido, num clube livre das 10 ligas principais (`PUBLIC_WORLD.LEAGUES`), até 40
  assentos, um por usuário. Todo assento é `member`; as rotas de dono (`invite-code`, `settings`, `invites`, `start`,
  `members/:id/remove`, `owner`) e o convite respondem 409 `publicWorld`. Sair vale para todos, inclusive o último (o mundo
  continua com zero assentos).
- **Ritmo:** quatro horários por dia, de Brasília (`PUBLIC_WORLD.SLOTS`: 09:00, 13:00, 18:00, 22:00, fixo UTC−3). Um horário
  vencido e mais novo que `advance.lastSlot` dá **um** passo (vários perdidos = um). O passo (`publicStepTarget`) joga o dia
  parado e segue até o próximo dia com jogo de algum assento (sem assento: a próxima rodada das 10 ligas); jogo sem decisão
  é simulado pelo assistente. Prazo e paradas não seguram o mundo.
- **Passo antecipado (4.35.3):** entre os horários, o mesmo passo começa na hora quando todo assento **ativo** (abriu o
  mundo nas últimas `ACTIVE_HOURS` 24 h: `lastSeenAt` ou a memória do processo) com clube está pronto até o alvo do passo
  (`earlyStepDue`: a regra da liga de amigos, "Pronto até" ≥ alvo e o jogo de hoje decidido), há pelo menos um assento
  assim e o último passo começou há `EARLY_STEP_GAP_MIN` (20) minutos ou mais (`advance.lastStepAt`, gravado por todo
  passo). Os horários não mudam (não marcam `lastSlot`). Checado no relógio (60 s) e nas rotas de pronto / decisão
  (`scheduleKick` → `publicSlotTick`). A tela usa o "Pronto até" normal; o próximo horário fica no `title` e na faixa;
  "esperando" lista os ativos que não estão prontos.
- **Inatividade:** `lastSeenAt` (no máximo uma escrita por hora) vem do `hello` do socket e das rotas do assento. Aos 5 dias
  sem abrir, aviso na caixa (`inactive_warning`, uma vez); aos 7, `removeSeat` (clube volta à IA) e `world_removed`.
- **Social:** a sala `world:<saveId>` do público só aceita resenha (texto livre: 403 `publicRoom`). DM, presença, rivais,
  placar ao vivo e classificação como na liga de amigos.

### Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/multiplayer/publicWorldConfig.ts`, `publicWorld.ts` (+ teste) | `PUBLIC_WORLD`; `dueSlot`, `publicStepTarget`, `inactivityAction` |
| `src/backend/worlds/publicWorld.ts` | `ensurePublicWorld`, `publicSlotTick`, `updateHall`, `flushSeen`, `inactivityPass` |
| `src/backend/worlds/publicStore.ts`, `publicSeen.ts` | `public_editions` (hall da fama), "visto por último" |
| `src/backend/groupAdvance.ts`, `advanceDay.ts` | O executor segue o alvo do passo; o dia roda sem assento |
| `src/backend/worlds/worldRoutes.ts` | Rotas públicas; rotas de dono recusam o público |
| `src/GameInterface/World/*` (`HallOfFame`, `publicTime`, `WorldScreen`, `GroupAdvanceBand`, `ReadyControl`), `NewGameWizard.tsx`, `StartScreen.tsx` | Telas |
| `scripts/public-world-measure.ts` | Medição |

### Rotas

| Rota | Faz |
|---|---|
| `GET /api/worlds/public` | `{ saveId, members, max, joined, takenClubs, nextSlotAt, edition }` |
| `POST /api/worlds/public/join { clubId, manager, sackingEnabled }` | 201; 409 `noNickname` / `clubTaken` / `full` / `alreadyMember`, 400 `invalidClub` |
| `GET /api/worlds/public/hall` | Edições anteriores (versão, período, top 10) |

### Telas

- Novo jogo: opção "Mundo público" (o assistente no modo entrar, só as 10 ligas e os clubes livres); tela inicial: card
  "Mundo público · N/40" (entrar ou continuar).
- `/world` no público: membros sem botões de dono, "Próximo passo às 18:00" no lugar do prazo, classificação, rivais,
  resultados e a aba **Hall da fama**; sem convite nem "Começar"; no dia de jogo só Jogar / Simular.

### Medição (`bun scripts/public-world-measure.ts`, 2026-10-26)

10 assentos (um clube de cada liga), 6 passos em horários seguidos (13:30, 18:30, 22:30, 09:30, 13:30, 18:30), Windows,
mundo inteiro; RSS na largada 350 MB.

| Passo | Tempo | Dias | Memória (RSS) |
|---|---|---|---|
| 1 | 25,6 s | 1 | 413 MB |
| 2 | 31,2 s | 5 | 506 MB |
| 3 | 8,6 s | 1 | 434 MB |
| 4 | 24,0 s | 1 | 546 MB |
| 5 | 31,4 s | 5 | 713 MB |
| 6 | 8,9 s | 1 | 549 MB |

Um dia com jogo de assento no motor completo custa ~25 s com 10 ligas; um dia sem rodada ~1,5–2 s (os passos de 5 dias
somam ~31 s). A memória oscila entre 410 e 710 MB, sem crescer de passo a passo.

### Testes

```
bun test src/Domain/multiplayer src/backend/publicWorld.create.test.ts src/backend/publicWorld.days.test.ts \
  src/backend/publicWorld.clock.test.ts src/backend/publicWorld.inactivity.test.ts src/backend/worlds \
  src/backend/social/publicRoom.test.ts src/GameInterface/World src/i18n/publicWorld.keys.test.ts
```

### Limitações (parte 5b)

- Um processo só por servidor (relógio, sockets, locks em memória).
- Quem dorme ou trabalha perde a decisão de alguns jogos (o assistente simula).
- O mundo zera a cada deploy; só o hall da fama sobrevive.
- O horário é o de Brasília para todos.
- A lista de clubes do novo jogo usa os dados iniciais das 10 ligas: um clube rebaixado no mundo ainda aparece (e a entrada recusa com `invalidClub`), e um promovido a uma delas não aparece.
- O passo não tem dia na tela: "09:00" pode ser amanhã.
