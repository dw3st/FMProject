# Cassino do técnico

Pedido do usuário (report de tester: uma aba para o técnico gastar o dinheiro dele, várias máquinas, as apostas de futebol ficam). Aba **Cassino** em "Seu técnico" (`/achievements?tab=casino`), depois de Apostas. Sem efeito de partida: nada em `/test` nem `/lab`.

## Regra

- Só o técnico humano, com a carteira dele: `managerWallet(ganhos, gastos, betNet, apostas abertas, casinoNet)`. Nunca toca o clube nem `managerEarnings` (não conta em Pé-de-meia). `SeatState.casinoNet` = recebido − apostado; `casinoBiggestWin` = o maior pagamento de uma jogada.
- **Limites** (`CASINO`, `src/Domain/casino/casinoConfig.ts`): aposta de €1.000 a 2% da carteira; perda líquida no dia de jogo até 10% da carteira do primeiro jogo do dia; 100 giros ou voos por dia; giro automático até 10 (para no primeiro limite).
- **Sorteio no servidor:** `mulberry32(seedFrom(salt:nonce))`, com um sal secreto por assento e o contador de sorteios. Ficam em `seats/{seatId}/casino.json` (`CasinoState`), nunca enviado ao cliente (a rota monta a `CasinoView`).
- Uma rodada de avião aberta por vez; a aposta sai da carteira na hora.

## Jogos

| Jogo | Regra | Retorno |
|---|---|---|
| Máquina clássica (`classicSlot.ts`) | 3 rolos de 20 (7×1, BAR×2, sino×3, limão×5, cereja×4, vazio×5), a linha do meio. Trinca: 7 ×500, BAR ×200, sino ×60, cereja ×20, limão ×14; cereja nos rolos 1 e 2 ×3 | 93,975% (exato, 20³ combinações) |
| Máquina Estádio (`stadiumSlot.ts`) | 5 × 3, 10 linhas fixas, 3+ iguais a partir do primeiro rolo; o escudo é coringa e tem prêmio próprio. Rolos de 32 (escudo 1, taça 2, luva 3, chuteira 4, apito 5, cartões 7, bola 10). Prêmio × a aposta da linha (aposta / 10) | 95,33% (exato: cada linha é a soma ponderada das 7⁵ combinações); 1M de giros: 95,18%, acerto 45,6% |
| Avião (`crash.ts`) | Ponto de queda = max(1, ⌊100 × 0,95 / (1 − U)⌋ / 100), até 1000×, sorteado na aposta e secreto até o fim. Multiplicador m(t) = e^(0,06 t), t em segundos do relógio do servidor. Retirar paga ⌊aposta × m⌋ se m < ponto de queda; a retirada automática limita m. Rodada sem retirada: só a automática paga, resolvida na próxima leitura | 95% (1M de rodadas: retirada em 1,5× 94,3%, 2× 94,7%, 5× 94,8%, 10× 94,6%) |

`bun scripts/casino-rtp.ts [giros]` refaz a medição (semente fixa).

## Rotas (`src/backend/casinoRoutes.ts`; `requireSeat`, `withSaveLock`; as POST na guarda de lobby)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/casino` | `CasinoView`: carteira, `casinoNet`, limites usados, últimas jogadas, últimos pontos de queda, rodada aberta (sem o ponto), relógio do servidor |
| `POST …/casino/slot { machine, stake, spins? }` | `{ results, stopped, view }`; 400 `invalidMachine` / `invalidStake` / `stakeTooHigh`, 409 `noMoney` / `dailyLossCap` / `roundsCap` |
| `POST …/casino/crash/bet { stake, autoCashOut? }` | `{ roundId, startedAt, view }`; 400 `invalidAuto`, 409 `roundOpen` e os de limite |
| `POST …/casino/crash/cashout { roundId }` | `{ won, crashed, multiplier, payout, crash, view }`; o ponto de queda só sai aqui ou no histórico; 409 `noRound` |

## Tela

`Achievements/Casino/`: números do topo (carteira, resultado, perda e rodadas de hoje), três cartões de jogo, máquinas com rolos em CSS que param no resultado do servidor (linha vencedora destacada, tabela de prêmios, giro automático 1/5/10), avião em SVG medido em pixels da caixa (curva, multiplicador grande, retirar, retirada automática, últimos voos). Símbolos desenhados em SVG (`CasinoSymbols.tsx`), sem emoji. Com movimento reduzido, os rolos param sem girar. O cliente pergunta a rodada a cada 600 ms para saber quando o avião caiu. i18n `casino.*`.

## Testes

`bun test src/Domain/casino/casino.test.ts src/backend/casino.routes.test.ts`.

## Limitações

- Sem conquistas do cassino (só o `casinoBiggestWin` guardado).
- O avião aparece até ~0,6 s depois de cair (a pergunta da tela); o servidor paga pelo relógio dele.
- Gravar o assento e o `casino.json` não é atômico.

## Símbolos pintados (12.x)

Report do usuário ("faz no comfy pra ficar pro"). Com o visual novo, os símbolos das duas máquinas e o avião são imagens pintadas (`casino/sym-<nome>-1.webp` em `src/example_data/assets`, `GAME_ART_FILES`; 256 px, o avião 512 px de largura): layout vetorial em PIL refinado no FLUX.2 klein img2img (`data_process/assets/casino/build_casino_symbols.py`, folha de conferência `contact_sheet.py`), recortado pelo fundo liso ligado à borda e pelo contorno do layout. O "vazio" da clássica continua o ponto em SVG; sem o visual novo, os SVGs de antes (`CasinoSymbols.tsx`). Imagem trocada = nome novo (`CASINO_ART_VERSION`, cache `immutable`).

## Salão de jogos (12.42)

Report de tester f7f6f7c8. A aba virou **Salão de jogos** (en "Games hall"; `casino.*` no i18n, URL `?tab=casino` igual) com quatro jogos novos, mesmos limites (aposta, perda do dia, rodadas) e o mesmo sorteio no servidor. Arte pintada no FLUX (`data_process/assets/casino/build_games_hall.py`): pista oval, mesa de feltro, os 8 carros (`casino/race-track-1`, `table-felt-1`, `car-<n>-1.webp`, `GAME_ART_FILES`); sem o visual novo, SVG.

| Jogo | Regra | Retorno |
|---|---|---|
| Corrida (`race.ts`) | 8 carros com força sorteada por páreo, cotações de vencedor e pódio = probabilidade real × `RACE.RTP`; três voltas animadas (`raceTrack.ts`, 9 s; parada com movimento reduzido) | vencedor 91,7%, pódio 91,1% |
| Blackjack (`blackjack.ts`) | 6 baralhos, banca para no 17, blackjack 3 para 2, dobrar nas duas primeiras cartas, separar um par uma vez; mão aberta em `CasinoState.blackjack` (409 `handOpen`) | 99,4% com a estratégia básica |
| Bingo (`bingo.ts`) | 75 números, até 4 cartelas, 30 bolas; cada cartela paga o melhor padrão (linha 3,1×, duas linhas 15×, quatro cantos 11×, X 400×, cheia 10 000×) | 93,2% |
| Pôquer (`poker.ts`, `pokerEval.ts`) | Texas Hold'em sem limite contra 3 bots (cauteloso, equilibrado, agressivo); a entrada (25/50/100% do que resta da perda do dia, mínimo €10 mil) sai da carteira ao sentar e a pilha volta ao sair; blinds fixos pela entrada (`bigBlindOf`), bot quebrado volta com a entrada cheia | jogo de habilidade (bots sem vantagem da casa) |

Rotas (`casinoGamesRoutes.ts`, `casinoPokerRoutes.ts`; `requireSeat`, `withSaveLock`, guarda de lobby): `POST …/casino/race`, `…/blackjack/deal`, `…/blackjack/action`, `…/bingo`, `…/poker/sit`, `…/poker/action`, `…/poker/leave`. `bun scripts/casino-rtp.ts` mede todos. Testes: `bun test src/Domain/casino src/backend/casinoGames.routes.test.ts`.
