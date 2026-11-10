# Apostas do técnico

Ideia de report de tester, aprovada pelo usuário em 2026-11-10. Versão **8.9**. Tela: opção C do mock (um jogo aberto por vez).
Os técnicos que já compraram todo o patrimônio têm milhões parados na carteira; as apostas dão uso a esse dinheiro.

## Regra

- Cada técnico humano (assento) aposta com a carteira dele. Nada toca o clube, o extrato ou a IA. A partida não muda: a aposta só lê o resultado.
- **Jogos:** os dos próximos 7 dias da liga do técnico e das copas e continentais em que o clube dele está. Seleções e base ficam de fora.
- **Fecha na véspera:** só jogos com data depois de `currentDate`. Sem isso daria para jogar ao vivo e apostar antes de o dia rodar.
- **Tipos:** resultado em 90 minutos (casa, empate, fora), placar exato em 90 minutos e jogador a marcar (qualquer gol dele no jogo, prorrogação inclusive; pênaltis da disputa não contam).
- **Uma aposta por tipo em cada jogo:** ninguém cobre todos os placares.
- **Jogo do próprio clube, só a favor:** vitória dele, placar em que ele vence, jogador dele marcar. Vale no momento da aposta; a rota confere.
- **Jogos de outros técnicos humanos:** liberados, inclusive contra eles.
- **Valor:** de €1.000 até 10% da carteira, por aposta. No máximo 40 abertas.

## Carteira

`carteira = max(0, ganhos − gastos + betNet − abertas)`

- `managerEarnings` e `managerSpent` não mudam com apostas: a conquista Pé-de-meia não infla.
- `SeatState.betNet` (soma de retorno − valor das apostas resolvidas) começa ausente = 0. `abertas` é a soma dos valores das apostas abertas.
- `managerWallet(earned, spent, betNet?, open?)` continua sendo a única conta; a compra de patrimônio passa a usar a carteira com apostas.

## Cotações (`src/Domain/bets/odds.ts`, puro, com teste)

- Gols esperados dos dois lados por `expectedGoals` (`quickSim.ts`), com o XI automático 4-3-3 de cada clube (estável, como `clubLevel`) e o mando (`neutral` sem mando).
- Probabilidades por Poisson independente, placares de 0 a 7.
- Marcador: `1 − e^(−λ × parcela)`, com a parcela do jogador no XI pelo `ROLE_GOAL_WEIGHT` × finalização. Mostra os 6 mais prováveis por time.
- `cotação = 1 / (p × 1,08)`, entre 1,05 e 100, duas casas. Margem em `BETS.MARGIN`.
- Tela mostra os 8 placares mais prováveis (no jogo do próprio clube, os 8 em que ele vence).
- A cotação fica gravada na aposta. A rota recalcula e, se mudou, responde 409 `oddsChanged` com a nova.

## Dados

`saves/{id}/seats/{seatId}/bets.json` (bufferizado, como o extrato): `{ open: Bet[], settled: Bet[] }`, `settled` com as últimas 200.

```ts
type BetPick =
  | { market: "result"; side: "home" | "draw" | "away" }
  | { market: "score"; home: number; away: number }
  | { market: "scorer"; playerId: string; playerName: string };

interface Bet {
  id: string; placedOn: string; competition: string; fixtureId: string; date: string;
  home: string; away: string; homeName: string; awayName: string;
  pick: BetPick; stake: number; odds: number;
  status?: "won" | "lost" | "refunded"; settledOn?: string; payout?: number;
}
```

Sem migração: arquivo ausente = sem apostas.

## Liquidação (no avanço do dia)

Num passo depois dos jogos do dia (`dayEvents`), por assento, com `competition + fixtureId`:

- Placar de 90 minutos = `score − decider.extraTime`. Marcador pelo `MatchEvent.scorers`, que existe também nos jogos do quickSim.
- Ganhou: `payout = round(stake × odds)`, `betNet += payout − stake`. Perdeu: `betNet −= stake`.
- Jogo remarcado continua valendo (mesmo `fixtureId`). Jogo não encontrado jogado 30 dias depois da data da aposta: devolvida (`refunded`, `betNet` não muda).
- Idempotente: uma aposta resolvida sai de `open`, na mesma unidade bufferizada do dia.
- Mensagem `bets` / `settled` na caixa nos dias com aposta resolvida (ganhos, perdas e saldo do dia), depois do `clearInbox`. Tópico novo `bets`, ligado.

## Rotas (`src/backend/betRoutes.ts`, `requireSeat`; escrita com `withSaveLock`; 409 `lobby` na guarda de lobby)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/bets` | Carteira, abertas, histórico, jogos com cotações |
| `POST /api/saves/:id/bets { competition, fixtureId, pick, stake, odds }` | Aposta. 400 `invalidPick` / `invalidStake`; 403 `ownClubAgainst`; 409 `closed` (véspera), `alreadyBet`, `noMoney`, `tooManyBets`, `oddsChanged { odds }` |

## Conquistas

Trilhas `bets_profit` (lucro acumulado: €100 mil, €1M, €5M; Negociação) e `bets_exact` (placares exatos acertados: 1, 5, 15; Tática), e secreta `bet_longshot` (ganhar com cotação ≥ 8; Motivação). 101 → 108 conquistas. Contadores em `SeatState`: `betNet`, `betExact`, `betLongshot`.

## Tela

Aba **Apostas** em Conquistas, depois de Patrimônio (`Achievements/BetsTab.tsx`), como o mock C:

- Três números: carteira, em apostas abertas, lucro nas apostas.
- Coluna de jogos à esquerda, por dia. À direita o jogo escolhido: faixa pintada com os dois escudos (`bets/bets-hero.webp` em `GAME_ART_FILES`, só com o visual novo; sem ele, faixa lisa), colunas Resultado, Placar exato e Marca gol, em cartões de escolha com a cotação, e embaixo o valor (− e +), o limite, o retorno possível e Apostar.
- No jogo do próprio clube, as opções contra ele não aparecem.
- Abaixo, Abertas e Histórico (`TABLE_STYLE`). i18n `bets.*`.

## `/test`, `/lab`

Sem efeito de partida: nada a exibir.

## Testes

Puros: cotações (soma das probabilidades, margem, limites), validação da aposta (próprio clube, véspera, limite, uma por tipo), liquidação (90 minutos com prorrogação, marcador, devolução, idempotência), carteira. Rotas: dono, erros, `oddsChanged`, dois assentos separados. Avanço do dia: resolve na data, mensagem, Pé-de-meia não muda.

## Limitações

- As cotações vêm da fórmula do quickSim: o jogo no motor completo pode divergir alguns por cento.
- Um técnico pode perder de propósito para um amigo lucrar; o limite de 10% torna isso pouco vantajoso.
- Sem aposta múltipla e sem encerrar aposta antes do jogo.
