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
