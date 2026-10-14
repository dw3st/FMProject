# Etapa 43 — Multiplayer (#106)

Decisões do usuário (2026-10-14): **liga de amigos agora, mundo público depois**; o dia avança quando **todos estão
prontos, com prazo** para os atrasados; **partida ao vivo só contra a IA** (humano × humano simulado no servidor);
estado do técnico em **assentos com arquivos próprios** dentro do mesmo save; entrega em 5 partes, cada uma com spec e
plano próprios. Este documento é a visão geral das 5 partes e o detalhe da **parte 1 (fundação)**.

## 1. Visão geral

| Parte | O que entrega | Visível ao jogador |
|---|---|---|
| 1. Fundação de assentos | O save passa a ter N técnicos humanos (assentos); o solo é um save com 1 assento | Não (refactor) |
| 2. Mundo compartilhado | Criar uma liga de amigos, convidar por link/código, cada um escolhe um clube; o dono tira/troca jogadores | Sim |
| 3. Avanço em grupo | Cada técnico marca "pronto até" (amanhã / meu próximo jogo / uma data); o mundo avança enquanto todos estão prontos; prazo (definido pelo dono) avança sem os atrasados, com o assistente decidindo por eles; partida ao vivo contra a IA antes de marcar pronto | Sim |
| 4. Humano × humano | Partida entre humanos simulada no motor completo pelo servidor, com resumo para os dois; mercado entre humanos (propostas na inbox, aceitar/recusar/contrapropor) | Sim |
| 5. Competição | Classificação dos técnicos humanos do mundo; depois, o mundo público (avanço só por prazo, mais assentos) | Sim |

Regras do modo que valem para todas as partes:
- Um técnico humano por clube; um usuário tem no máximo um assento por mundo.
- A IA nunca age sobre um clube humano (mercado, livres, demissão de técnico, convocações de base).
- Cada assento só age sobre o próprio clube; o que é do mundo (data, ligas, calendário, notícias) é comum.
- Sem migração de save (protótipo; os saves são apagados a cada versão).

## 2. Parte 1 — Fundação de assentos

### 2.1 Dados

O save continua um mundo só. A meta fica só com o que é do mundo, mais:

```ts
SaveMeta.mode: "solo" | "multi";
SaveMeta.seats: string[];          // ids dos assentos, na ordem de criação
```

Cada assento mora em `saves/{id}/seats/{seatId}/`:

| Arquivo | Conteúdo (o que hoje é do humano) |
|---|---|
| `seat.json` (`SeatState`) | `clubId`, `clubName`, `clubColors`, `leagueSlug`, `leagueName`, `manager`, `formation`, `tactical_style`, `min_energy_to_train`, `training_intensity`, `style_focus`, `followedLeagues`, `restDays`, `rotationOverride`, `matchMarking`, `youthCallUps`, `youthCallUpsSkipped`, `board`, `press`, `managerBan`, `sackingEnabled`, `unemployed`, `jobOffers`, `jobsMidSeason`, `careerStart`, `managerContract`, `managerEarnings`, `managerRenewal`, `managerContractNotices`, `inboxPrefs`, `responsibilities`, `directorDecisions` |
| `tactics.json` | a tática do assento |
| `achievements.json` | conquistas e atributos do técnico |
| `scouting.json` | missões, conhecimento, lista de observação, relatórios, prospectos |
| `inbox.json` | a caixa de entrada do assento |
| `ledger/{temporada}.json` | o extrato do clube do assento |
| `market.json` (`SeatMarketState`) | `playerSellList`, `playerLoanList`, `pendingBids`, `talks`, `sellOnHeld`, `rivalBids`, `preContracts`, `lostTargets`, `loans` do clube do assento |

O resto do save fica como está e é do mundo: `market.json` com `shuffledTeamIds`, `rotationIndex` e `profiles`;
squads (os campos só do clube humano — `staff`, `facilities`, `styleFamiliarity`, `managerAttributes`, `youth`,
`moraleClub`, moral dos jogadores — continuam no squad: pertencem ao clube e existem em todo clube humano); ligas,
copas, continentais, base; dias; notícias; árbitros; histórico; prêmios; livres; aposentados; pool da comissão.

Mudanças em arquivos do mundo:
- `managers.json`: o técnico humano deixa de ter o id fixo `player`; passa a `seat:<seatId>`, com `seatId` no
  registro no lugar de `isPlayer`. Tudo que procura o técnico do jogador procura pelo `seatId`.
- `national/state.json`: `human` e `offers` viram `Record<seatId, …>`; a seleção treinada por um humano tem
  `managerId = "seat:<seatId>"`.
- `retired.json`: `rebornOffer` guarda o `seatId` do clube de origem.
- `transfers.json`: deixa de ser zerado na virada do país do humano; a tela filtra pela temporada. `direction` sai
  do arquivo e é calculado na resposta pelo clube do assento.
- `activeLeagues[].restDays` sai da meta: os dias de folga escolhidos são do assento e valem só para o clube dele.
  Os clubes da IA passam a folgar pela própria agenda (véspera e dia seguinte de cada jogo oficial do clube), não
  pela do humano.
- `news`: `humanClubId`/`humanLeague` da coleta viram os conjuntos dos assentos.

Usuários: tabela nova `save_members(save_id, user_id, seat_id, role)` com `role` `owner` | `member`, chave
`(save_id, user_id)`; substitui `saves(save_id, user_id)`. O solo cria uma linha `owner`. `listUserSaveIds` lê
`save_members`. O limite de 5 saves por usuário conta só os mundos em que ele é `owner`.

### 2.2 Código

- **`SeatContext`** (`src/types/seatTypes.ts`): `{ seatId, seat: SeatState }`, com `clubId` e a liga.
  `SaveService.getSeat(saveId, seatId)`, `listSeats(saveId)`, `updateSeat(saveId, seatId, patch)`; DAL com os
  arquivos do assento (FileSystem e Buffering, fase 1 do flush).
- **Clubes humanos:** `humanClubIds(saveId): Set<string>` (dos assentos). `clubLookup` passa a perguntar "é clube de
  algum assento" e "qual assento".
- **Rotas:** `requireSaveOwner` vira `requireSeat(req, saveId) → { userId, seatId, role } | Response` (404 quando o
  usuário não é membro). Toda rota "do técnico" age sobre o assento da requisição. As rotas do mundo (notícias,
  prêmios, histórico, ligas, árbitros) aceitam qualquer membro. `GET /api/saves/:id` devolve a meta do mundo
  mesclada com o assento de quem pede (`metaForSeat`), no mesmo formato de hoje, mais `seatId`. `PUT` não aceita
  mais `currentDate`; as preferências do PUT vão para o assento.
- **Avanço do dia:** `advanceOneDay` carrega os assentos e `humanClubIds`. Todo passo que hoje usa um
  `playerSquadId` vira:
  - **exclusão**: a IA exclui o conjunto de clubes humanos (mercado, livres, demissões, convocações, rivais);
  - **laço por assento**: diretoria, imprensa, moral, diretor, comissão, contratos, propostas de emprego,
    renovação do técnico, demissão, salário, extrato, instalações, olheiros, base, inscrição, seleção do técnico,
    conquistas, mensagens adiadas;
  - **partida do dia**: `playedMatchOverride` vira `Record<seatId, PlayedMatchRecording>`; o modo de simulação usa o
    conjunto das ligas dos assentos e as ligas seguidas por qualquer assento;
  - **virada**: o país de cada assento dispara a limpeza da caixa e as mensagens de temporada **daquele** assento.
- **`advance-until`**: para no próximo jogo do assento que pediu (no solo, o de hoje). O avanço em grupo é a parte 3.
- **Frontend:** a sessão ganha `seatId`; o resto lê a meta mesclada como hoje. `toggleDayType` grava no assento.
- **Criação:** `createSave` cria o mundo e o primeiro assento (`mode: "solo"`); um helper de teste
  `addSeat(saveId, { userId, clubId, manager })` cria assentos extras (a tela de convite é a parte 2).

### 2.3 Fora da parte 1

Convites e tela de mundo (parte 2), "pronto"/prazo (parte 3), humano × humano (parte 4), classificação (parte 5).
No `mode: "multi"` da parte 1 os assentos existem e o avanço do dia funciona para todos, mas só por teste/script.

### 2.4 Testes e medição

- A suíte inteira verde com o solo (1 assento): nada visível muda.
- Testes com **dois assentos no mesmo save** (`addSeat`):
  - cada clube humano recebe diretoria, imprensa, salário do técnico, caixa de entrada e extrato próprios;
  - a IA nunca compra, contrata, demite nem convoca nos dois clubes humanos;
  - ação de um assento não toca o outro (tática, coletiva, lista de venda, preferências);
  - rotas: um membro recebe 404 ao agir como outro assento; rotas do mundo respondem a qualquer membro;
  - virada do país de A limpa só a caixa de A.
- Folga da IA pela própria agenda: medir o efeito no fôlego/lesões do mundo (`fitness`/`injury` scripts) e anotar.
- Custo do dia com 2 assentos em ligas diferentes (`bench-advance-day`): anotar (pesa no mundo público).
- Smoke de temporada com 2 assentos (`--seats 2`), rodado só quando o usuário pedir.

### 2.5 Execução (fatias, suíte verde em cada uma)

1. Tipos e DAL do assento; `save_members`.
2. `SaveService` e `createSave` com 1 assento; `metaForSeat`.
3. Rotas pelo assento (`requireSeat`).
4. Avanço do dia: exclusão + laço por assento + mapa de partidas + virada por assento; folga da IA.
5. `managers.json`, `market.json`, `national/state.json`, `retired.json`, `transfers.json` com assentos.
6. Frontend com `seatId`.
7. Testes de 2 assentos, medições, regra `.claude/rules/game/multiplayer.md`.

### 2.6 Limitações conhecidas

- Mais assentos em ligas diferentes = mais ligas no motor completo por dia (o dia fica mais lento); medido na fatia 7.
- `withSaveLock` é local ao processo: um servidor só por mundo (vale para a liga de amigos; o público vai precisar
  rever isso).
