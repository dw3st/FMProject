# Prestígio do jogador (barras de status)

Pedido de tester, desenho aprovado pelo usuário. Versão **9.2**. Lógica pura em `src/Domain/standing/standing.ts` (`STANDING`, com teste).

## Regra

- `RosterPlayer.standing { fans, club, world }`, cada uma de 0 a 10, gravada **toda segunda** para todo jogador de elenco do mundo (`withStandings` no começo do mercado do dia, `advanceDay.ts`; só os elencos que mudaram são gravados). Ausente = neutro. A pré-simulação dos kits não grava (fica para a primeira segunda).
- **Torcida** (`fansBar`): nota média no clube (desta temporada com 5+ jogos, senão a última temporada lá; 5,8 = 0 a 7,2 = 5 pontos; sem jogos 2,5), (gols + 0,5 × assistências) por jogo no clube (0,5 = 2 pontos) e temporadas no clube (5 = 3 pontos). Os números vêm das linhas do histórico no clube mais a temporada em curso (`clubTotals`).
- **Clube** (`clubBar`): papel no elenco (escolhido, senão o sugerido de `suggestedStatuses`): peça-chave 7, titular 6, rotação 4, jovem 3, reserva 2; ídolo do clube (regra de `legendTier`) no mínimo 8, lenda 10.
- **Mundo** (`worldBar`): posição no ranking mundial por nota (top 10 = 10, 25 = 9, 50 = 8, 100 = 7, 250 = 6, 500 = 5, 1000 = 4, 2500 = 3, 5000 = 2, 10000 = 1), mais 1 por prêmio das duas últimas temporadas (até 3); melhor do mundo alguma vez = no mínimo 9.
- **Valor** (`standingValueMult`, dentro de `awardValueMult`, então todo valor de mercado usa): 1 + 0,05 × (torcida − 3)/5 + 0,05 × (clube − 4)/5 + 0,05 × mundo/10, limitado a ±15%. O motor não lê.

## Tela

Ficha do jogador: bloco "Prestígio" (`StandingPanel`) com as três barras e o efeito no valor; a explicação de cada uma no `title`. i18n `standing.*`.

## Medição (`bun scripts/standing-measure.ts [save]`)

Save local de 1273 elencos: cálculo do mundo inteiro em ~130 ms. Multiplicador médio 1,002; p5 0,98, mediana 1,00, p95 1,04, máximo 1,13. No começo do mundo ninguém tem histórico, então a torcida fica em 2–3 para quase todos e cresce com as temporadas.

## `/test`, `/lab`

Sem efeito de partida: nada a exibir.

## Testes

`bun test src/Domain/standing src/Domain/awards src/backend/standing.advanceDay.test.ts`.
