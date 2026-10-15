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
- Avanço rápido (`advance-until`) com mais de um assento: 409 `multiSeat` (o avanço em grupo é a parte 3); o avanço
  de um dia continua.
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
- Sem "pronto"/prazo em ação, humano × humano ao vivo nem classificação (partes 3–5).
- O smoke de temporada não tem modo de dois assentos.
- A cláusula paga a outro assento entra no extrato dele sem mensagem na caixa (a mensagem `sell_on` só vai para o
  assento que fez a operação).
- Um jogo entre dois assentos não tem prévia (o `match-setup` recusa): só "simular partida" ou voltar ao painel.
- Avanço rápido desligado com dois ou mais assentos até a parte 3.

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
- **Prazo:** `deadlineHours` 12 / 24 / 48 / `null`, padrão 24; só gravado e mostrado (quem o usa é a parte 3).
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
