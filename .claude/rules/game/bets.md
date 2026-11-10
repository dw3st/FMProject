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
| `src/GameInterface/Achievements/BetsTab.tsx`, `BetsInboxBody.tsx`, `betText.ts` | Tela |

Dados: `seats/{seatId}/bets.json` (`open`, `settled`) e `SeatState.betNet`, `betExact`, `betLongshot`.

## Rota (`requireSeat`; escrita com `withSaveLock`; guarda de lobby)

`GET /api/saves/:id/bets` devolve `BetsView` (`?summary=1`: só carteira e totais, sem cotações). Com `?competition=<slug>` traz os jogos daquela competição (400 `invalidCompetition` fora das pastas do mundo ou de base). `POST { competition, fixtureId, pick, stake, odds }`: 400 `invalidPick` / `invalidStake`, 409 `closed` / `alreadyBet` / `noMoney` / `tooManyBets` / `ownClubAgainst` / `oddsChanged`.

## Telas

Aba **Apostas** em `/achievements`, depois de Patrimônio: três números, jogos por dia à esquerda, mercados do jogo escolhido à direita, valor com − e +, retorno possível. Abaixo, Abertas e Histórico. Inbox: categoria `bets`, tópico próprio, ligado por padrão, gravada depois do `clearInbox` da virada.

## Conquistas

108 no total: `bets_profit` (€100 mil, €1M, €5M de lucro, Negociação), `bets_exact` (1, 5, 15 placares exatos, Tática) e a secreta `bet_longshot` (ganhar com cotação de 8 ou mais, Motivação).

## Testes

`bun test src/Domain/bets src/backend/bets.routes.test.ts src/Domain/managers/assets.test.ts`.

## Limitações

- A cotação usa o 4-3-3 automático, não a formação nem a escalação do dia.
- Sem aposta combinada, sem encerrar antes e sem aposta durante o jogo.
- O jogador que muda de clube continua valendo: a aposta de gol olha só o id dele.
