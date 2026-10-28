# Pênaltis em 2D (bater e defender)

Pedido do usuário (2026-10-28), no estilo de um jogo de pênalti em 2D: o técnico bate e defende os pênaltis do
próprio time, ou deixa automático. Decisões aprovadas: disputa e pênalti no jogo; mira + força ao bater e escolha do
canto ao defender; peso equilibrado entre os atributos e a habilidade do técnico; a escolha antes da partida.

## 1. Quando

- Só na partida ao vivo sozinho (`MatchScreen` sem `h2h`), em toda cobrança com o time do usuário de um dos lados:
  a disputa do mata-mata e o pênalti durante o jogo (a favor e contra).
- **Prévia da partida:** `OptionChips` "Pênaltis: Bater eu mesmo / Automático", lembrado por navegador
  (`localStorage` `fm.match.penaltyMode`, leitura e escrita em try/catch; sem armazenamento = Automático). A partida
  inteira segue a escolha feita na prévia.
- Automático = o comportamento de hoje (sorteio na hora, `penaltyChance`).
- Jogos simulados, quickSim, `/lab` e a partida ao vivo entre dois técnicos: sempre automático, nada muda.

## 2. Tela (`GameInterface/Penalty/PenaltyScreen.tsx`, Pixi não; SVG + CSS)

- Visão de trás do cobrador: o gol (trave, rede), o goleiro (rosto e camisa) e o cobrador; placar da disputa
  (bolinhas por cobrança) no topo.
- **Batendo:** 1º clique no gol = a mira; a barra de força sobe e desce (ciclo `POWER_CYCLE_S`); o 2º clique solta.
  Força acima da faixa verde: o chute sobe (por cima se passar do teto). Abaixo: fraco (o goleiro alcança mais).
- **Defendendo:** o cobrador ajeita a bola; o usuário clica numa das 6 áreas (alto/baixo × esquerda/meio/direita)
  antes de `DIVE_WINDOW_S`; sem clique, fica no meio.
- Animação curta (bola até o ponto, goleiro pulando) e o resultado: "Gol", "Defendeu", "Fora", "Na trave".
  Teclado: espaço solta a força; setas + Enter escolhem a área (acessível).

## 3. Resultado (puro, `Domain/penalty/penaltyKick.ts`)

- Ponto final do chute = mira + desvio gaussiano com σ = `AIM_SPREAD × (1,2 − finalização)`, e a altura sobe com a
  força acima da faixa verde. Fora das traves ou acima do travessão: fora; na linha da trave (±0,15 m): na trave.
- Goleiro: escolhe uma das 6 áreas (a IA sorteia pesando os cantos baixos; o usuário clica). Área errada: gol.
  Área certa: defende com chance `SAVE_BASE × reflexo/salto × (1 − proximidade do ângulo × CORNER_PROTECT) ×
  (1 + fraqueza × WEAK_BONUS)`.
- IA batendo contra o usuário: mira sorteada por área (cantos mais comuns), força normal.
- Calibração: um batedor médio que mira razoável (sorteio de "jogador típico" no script) converte ~75%, como o
  `penaltyChance` de hoje; o script `scripts/penalty-2d-measure.ts` mede 10 000 cobranças por perfil.

## 4. Motor

- `GameState.penaltyInteractive?: TeamId` (o time do usuário; ausente = automático).
- Disputa: com `penaltyInteractive`, `startPenalties` não sorteia tudo de uma vez; cada cobrança vira
  `shootout.pending = { team, takerId, keeperId }` e a partida pausa (`presentationCountdown` parado) até
  `applyShootoutKick(state, outcome)` vindo da tela. Ordem dos cobradores, fim antecipado e morte súbita: as regras de
  `resolvePenaltyShootout` (extraídas para uso cobrança a cobrança).
- Pênalti no jogo: com `penaltyInteractive` e o time do usuário envolvido, `resolveInMatchPenalty` espera
  `setPiece.pendingKick` ser resolvido pela tela (mesmos eventos: `shot`, `penaltyResolved`, `goalScored`).
- Eventos e estatísticas: os de hoje (`penaltyKick`, `penaltyResolved`, `shootoutEnd`); nada novo em `Statistics.ts`.

## 5. `/test`, `/lab`

- `/test`: chip "Penalties: Me / Auto" (time A) e cenário `shootout-2d`; o log `foul` mostra mira, força, desvio e a
  área do goleiro.
- `/lab`: nada (sempre automático).

## 6. Testes

- Puro: desvio pela finalização, por cima com força alta, área errada = gol, calibração ~75% ± 3 p.p.
- Motor: disputa interativa pausa e retoma, fim antecipado, morte súbita; pênalti no jogo espera a jogada.
- Tela: abre e fecha, teclado.

## Limitações

- Partida entre dois amigos ao vivo continua automática (fica para depois).
- A disputa interativa não tem "paradinha" nem cavadinha.
