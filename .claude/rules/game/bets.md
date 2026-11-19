# Apostas do técnico

Spec: `docs/superpowers/specs/2026-11-10-manager-bets-design.md`. Plano: `docs/superpowers/plans/2026-11-10-manager-bets.md`.
Versão **8.9**. Ideia de report de tester. Visual: `.claude/rules/ui-standard.md`. Sem efeito de partida: nada em `/test` nem `/lab`.

## Regra

- Só o técnico humano, com o dinheiro dele. Nunca toca o clube nem `managerEarnings`, então o lucro não conta em Pé-de-meia.
- **Carteira** = `managerWallet(ganhos, gastos em bens, betNet, abertas)`, nunca abaixo de 0. Bens e apostas usam a mesma carteira.
- **Jogos:** os próximos 7 dias de qualquer liga, copa nacional ou continental do mundo. A lista abre em "Minhas competições" (a liga do técnico e a copa e a continental do clube dele); o seletor da aba troca (`?competition=`, desde a 8.9.2). Seleção e base ficam fora. Fecha na véspera (`date > currentDate`). Jogos de outros técnicos valem.
- **Mercados:** resultado em 90 minutos, placar exato em 90 minutos, marcar gol (vale prorrogação, não vale disputa de pênaltis). Uma aposta por mercado e por jogo.
- **Próprio clube:** só a favor dele.
- **Valor:** de €1.000 a 10% da carteira, no máximo 40 abertas.
- **Cotações:** Poisson sobre `expectedGoals` do quickSim, 4-3-3 automático, margem de 8%, entre 1,05 e 100. O servidor recalcula ao apostar: 409 `oddsChanged` quando a cotação mudou.
- **Resolução:** no avanço do dia, depois dos jogos, por `settleSeatBets`. Jogo não jogado 30 dias depois da data: aposta devolvida.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/betTypes.ts` | Tipos |
| `src/Domain/bets/betsConfig.ts` | Constantes (`BETS`) |
| `src/Domain/bets/odds.ts` (+ teste) | Grade de placares, cotações, partilha de artilheiros |
| `src/Domain/bets/bets.ts` (+ teste) | Limites, validação (`checkBet`), resolução (`settleBets`) |
| `src/backend/betsWorld.ts` | E/S: jogos abertos, visão, `settleSeatBets` |
| `src/backend/betRoutes.ts` | Rota |
| `src/Domain/inbox/betsMessage.ts` | Inbox `bets` / `settled` |
| `src/Domain/bets/gameList.ts` (+ teste) | Filtro (busca sem acento, dias, competições) e grupos por competição e dia |
| `src/Domain/bets/betStats.ts` (+ teste) | Meu desempenho: totais, linha do lucro, faixas de cotação, mercados |
| `src/GameInterface/Achievements/BetsTab.tsx`, `BetGameList.tsx`, `BetSlip.tsx`, `BetDashboard.tsx`, `BetProfitChart.tsx`, `BetsInboxBody.tsx`, `betText.ts` | Tela |

Dados: `seats/{seatId}/bets.json` (`open`, `settled`, as últimas 500 resolvidas) e `SeatState.betNet`, `betExact`, `betLongshot`.

## Rota (`requireSeat`; escrita com `withSaveLock`; guarda de lobby)

`GET /api/saves/:id/bets` devolve `BetsView` (`?summary=1`: só carteira e totais, sem cotações). Com `?competition=<slug>` traz os jogos daquela competição (400 `invalidCompetition` fora das pastas do mundo ou de base). `POST { competition, fixtureId, pick, stake, odds }`: 400 `invalidPick` / `invalidStake`, 409 `closed` / `alreadyBet` / `noMoney` / `tooManyBets` / `ownClubAgainst` / `oddsChanged`.

## Telas

Aba **Apostas** em `/achievements`, depois de Patrimônio: três números, jogos por dia à esquerda, mercados do jogo escolhido à direita, valor com − e + e os botões Mín e Máx (8.9.4), retorno possível. Abaixo, Abertas e Histórico. Inbox: categoria `bets`, tópico próprio, ligado por padrão, gravada depois do `clearInbox` da virada.

## Conquistas

108 no total: `bets_profit` (€100 mil, €1M, €5M de lucro, Negociação), `bets_exact` (1, 5, 15 placares exatos, Tática) e a secreta `bet_longshot` (ganhar com cotação de 8 ou mais, Motivação).

## Testes

`bun test src/Domain/bets src/backend/bets.routes.test.ts src/Domain/managers/assets.test.ts`.

## Limitações

- A cotação usa o 4-3-3 automático, não a formação nem a escalação do dia.
- Sem aposta combinada, sem encerrar antes e sem aposta durante o jogo.
- O jogador que muda de clube continua valendo: a aposta de gol olha só o id dele.

## Apostas dos amigos (8.9.7)

Pedido do usuário, opção A do mock com os itens do feed. Num mundo em grupo, todo membro vê as apostas dos outros: clicar numa linha de Rivais abre o painel (`World/FriendBetsPanel.tsx`) com as abertas (aposta, jogo, valor, cotação) e as 10 últimas resolvidas, e a coluna Apostas mostra quantas estão abertas (`RivalRow.bets`). As ganhas e perdidas da liga também entram no feed de Resultados no dia em que foram resolvidas (`World/FriendBetItem.tsx`), as devolvidas não. Rotas de membro: `GET /api/worlds/:saveId/friend-bets?seat=` e `GET …/feed-bets[?seat=]` (as 30 mais recentes). Cada resolvida aceita as reações e as frases dos grupos `bet_won` e `bet_lost` (3 cada) pela rota de provocação, alvo `{ bet: "<seatId>:<betId>" }`; no chat a linha mostra a aposta, o jogo e o dinheiro (`TauntMeta.bet`).

## Lista estilo casa de apostas e Meu desempenho (12.23)

Reports de tester ("confuso pra achar os jogos", "dashboard com green e red e quanto ganhou em cada odd").

- **Rota:** `GET /bets?scope=all` traz os jogos dos próximos 7 dias de todas as competições (fora as de base), só com o 1X2 (`liteGame`; `more` = quantas cotações de placar e artilheiro faltam), mais `today` e `mine` (a liga, a copa e a continental do técnico). As cotações ficam num cache em memória por save, dia, clube e versão de dados (`allBetQuotes`). `GET /bets?competition=X&fixture=Y` traz um jogo com todas as cotações (400 `invalidFixture` sem `competition`). Cada jogo leva `kickoff` (`matchConditions`). Resposta acima de 16 KB vai em gzip quando o navegador aceita. Medido: 208 a 338 jogos, ~0,5 s sem cache, 75 a 117 KB (10 a 16 KB em gzip). O `POST` e as regras não mudaram.
- **Jogos:** busca de time (sem acento; procura em todas as competições), dias (Amanhã, Próximos 3 dias, 7 dias: hoje já fechou), Minhas competições / Todas / uma competição (abre em Minhas; sem jogo delas na semana, Todas). Por competição e dia, linha com horário, os dois escudos e os botões 1, X e 2; "+N mercados" abre placar exato e quem marca. Um clique numa cotação preenche o cupom.
- **Cupom** (ao lado, fixo na rolagem): jogo, aposta, cotação, valor com − e +, Mín e Máx, retorno possível em euros inteiros, Apostar. Cotação mudada fica no cupom para confirmar de novo.
- **Abertas** e **Meu desempenho** (abas): apostado, retorno, lucro, ROI, acerto, greens e reds; lucro acumulado por data do jogo (linha com cruz e dica); tabelas por faixa de cotação (1,01–1,5, 1,5–2, 2–3, 3–5, 5–10, 10+) e por mercado; histórico com filtros (Green, Red, Devolvidas; mercado). Green = `star-green` (a cor da carteira), red = `destructive`. As devolvidas só contam à parte.
