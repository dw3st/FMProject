# Salão de jogos: corrida, blackjack, bingo e pôquer

Report de tester f7f6f7c8. Aprovado pelo usuário em 2026-11-24 (escopo: só jogos de aposta nesta versão; arte toda no
ComfyUI). Base: o cassino de hoje (`.claude/rules/game/casino.md`).

## Escopo

- A aba Cassino de "Seu técnico" passa a se chamar **Salão de jogos** (`?tab=casino` continua valendo).
- Quatro jogos novos ao lado das duas máquinas e do avião: corrida de carros, blackjack, bingo, pôquer.
- Fica para depois: dama, xadrez, paciência, jogos de arcade (cobrinha; blocos caindo e labirinto com perseguidores
  como jogos nossos, nunca cópias de Tetris ou Pac-Man) e o truco em dupla com amigos.

## Regras comuns

- Carteira do técnico, `casinoNet`, sorteio no servidor (`mulberry32(seedFrom(salt:nonce))`), estado secreto em
  `seats/{seatId}/casino.json`. Limites de sempre: aposta de €1.000 a 2% da carteira, perda líquida do dia até 10%,
  100 rodadas por dia somando todos os jogos.
- Um jogo com mão aberta (blackjack, pôquer) guarda a mão em `CasinoState` como a rodada do avião; uma só mão aberta
  por jogo.

## Corrida de carros

- Páreo de 8 carros com nome inventado, número, cor e força sorteados (`race.ts`). A chance de vitória sai da força
  (Plackett-Luce); a de ficar nos 3 primeiros por simulação de 20 mil ordens com semente fixa do páreo.
- Cotação = 0,92 ÷ chance (vencedor) ou 0,92 ÷ chance dos 3 primeiros, arredondada para baixo a 0,05, mínimo 1,05.
- `GET` devolve o páreo da vez; `POST …/race/bet { car, kind: win | top3, stake }` sorteia a ordem, paga e cria o
  próximo páreo. A tela anima ~20 s de corrida vista de cima até essa ordem.

## Blackjack

- 6 baralhos embaralhados a cada mão; crupiê para em todo 17; blackjack paga 3:2; pedir, parar, dobrar (duas primeiras
  cartas) e dividir uma vez (sem refazer dividir; ás dividido recebe uma carta só); sem seguro.
- `POST …/blackjack/deal { stake }`, `POST …/blackjack/action { action }`. A carta escondida do crupiê só sai no fim.
- Retorno medido por simulação com a estratégia básica (`scripts/casino-rtp.ts`), meta ~99,5%.

## Bingo

- 75 bolas, cartela 5 × 5 com centro livre. Compra de 1 a 4 cartelas (cada uma ao preço da aposta); saem 30 bolas.
- Prêmio por cartela pela melhor figura: linha (linha, coluna ou diagonal), duas linhas, quatro cantos, X, cartela
  cheia. Tabela ajustada por simulação para retorno de ~92%.
- `POST …/bingo/play { stake, cards }` devolve cartelas, bolas e prêmios; a tela sorteia as bolas uma a uma.

## Pôquer (Texas Hold'em contra 3 bots)

- Entrada de 20 a 100 blinds grandes, até 5% da carteira; blind grande = entrada ÷ 50. Os bots compram de novo quando
  quebram. Cada mão conta como uma rodada; a entrada conta no limite de perda; sair devolve as fichas à carteira.
- Bots com estilos (cauteloso, equilibrado, agressivo): decidem pela força da mão (pré-flop por tabela; depois por
  Monte Carlo de 300 mãos contra os vivos) e pela relação pote/aposta, com blefe pelo estilo.
- Casa tira 3% de cada pote que o técnico ganha. Mão do bot só aparece no showdown.
- `POST …/poker/sit { buyIn }`, `POST …/poker/action { action, amount? }`, `POST …/poker/leave`.

## Arte (ComfyUI, FLUX.2 klein img2img sobre layout vetorial)

Carros vistos de cima (8 cores), pista, mesa de feltro, verso e frente das cartas (naipes e figuras próprias), bolas e
cartela do bingo. Antes das telas: 2 opções de mock da corrida e da mesa de cartas para o usuário escolher.

## Superfícies

- `CasinoGame` ganha `race | blackjack | bingo | poker`; histórico e `casinoBiggestWin` valem para todos.
- i18n `casino.*`; sem efeito de partida (nada em `/test` nem `/lab`).
- Testes de regra e de rota; retorno de cada jogo medido em `scripts/casino-rtp.ts`.
