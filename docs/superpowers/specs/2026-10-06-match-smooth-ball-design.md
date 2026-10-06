# Partida ao vivo mais suave e bola nova (4.4.1)

Pedido do usuário depois da 4.4: o campo dá trancos ("flickers") no 2× e no 4×, e a bola nova é feia. Bola escolhida
no mockup `.superpowers/brainstorm/88313-1791327579/content/ball.html`: **B — Moderna**.

## Diagnóstico

- `PixiPitch` avança a simulação em passos fixos de `SIM_STEP` (1/60 s de jogo) dentro do ticker: 1 passo por quadro
  no 1×, 2 no 2×, 4 no 4× (`advanceSim`, com `carry`). O desenho mostra a posição do **último passo**. Quando o número
  de passos de um quadro varia (3/5 em vez de 4) ou um quadro atrasa e o seguinte roda o dobro, os jogadores dão um
  tranco proporcional à velocidade.
- Medido no `/test` (Chrome, 1700 px): 56–57 quadros por segundo; ~6% dos quadros acima de 20 ms, inclusive no 1×.
  Nenhuma tarefa longa (> 50 ms). `tickState` custa p50 0,44 ms, p90 1,3 ms, p99 3 ms.
- A cada passo o `PixiPitch` emite `stateChanged`; `MatchScreen` (e `TestScreen`) faz `setGameState` a cada quadro e
  devolve `matchStateSync`: a tela inteira é refeita no React ~60 vezes por segundo.

## Decisões

1. **Interpolação no desenho.** `advanceSim` passa a devolver também o estado anterior ao último passo
   (`prevState`). O `PixiPitch` desenha jogadores e bola em `lerp(prev, atual, alpha)`, `alpha = carry / SIM_STEP`
   (0..1). Sem suavizar quando o deslocamento de um passo passa de um limite (`TELEPORT_YDS`, ex.: saída de bola,
   bola parada, troca de lado, substituição) ou quando o estado foi trocado de fora (comandos do `/test`,
   `matchStateSync` adotado) e moveu algo: aí usa o atual. Só desenho: motor, sorteios e estatísticas não mudam.
   Marcadores, nomes, brilho da posse, barrinhas de fôlego e selo de cartão seguem as posições desenhadas; a bola, a
   altura, a sombra e o rastro seguem a bola desenhada. Os efeitos de chute, gol, falta, cartão e impedimento usam as
   coordenadas do evento do motor (diferença de no máximo um passo). As sobreposições de debug do `/test` ficam no
   estado atual do motor, sem interpolar: mostram dados calculados nesse estado (alvos, linhas, marcação, células) e
   ancorá-las nos marcadores misturaria dois instantes (diferença de no máximo um passo, ~0,15 jarda num jogador).
   `TELEPORT_YDS` = 4: o maior deslocamento real num passo é o de um chute de longe (~1,75 jarda a 35 jardas, ~2,25 a
   45); passes ficam em ~0,75 e corridas em ~0,15, e os reposicionamentos são de dezenas de jardas.
2. **React a ~10 Hz.** `MatchScreen` e `TestScreen` atualizam o estado React no máximo a cada `UI_STATE_INTERVAL_MS`
   (100 ms), com atualização final garantida (trailing), e na hora em mudança de fase, placar ou pausa. O ref do estado
   continua atualizado a cada quadro. Tudo que hoje acumula por quadro (ex.: posse no `MatchScreen`) tem de continuar
   correto.
3. **Bola B — Moderna.** Esfera branca com sombreado radial, duas costuras curvas azuis, uma vermelha e duas cinza
   finas; brilho fixo no alto à esquerda; contorno fino. As costuras giram conforme a bola anda (ângulo = distância
   percorrida no desenho / raio), o brilho e o sombreado não giram. Sombra no chão e altura como na 4.4.
   Constantes em `pitchStyle.ts`.

## Verificação

- Testes: `advanceSim` devolve `prevState` certo (0, 1 e vários passos; parada por gol/fase); a interpolação (função
  pura) respeita `alpha` e o limite de teleporte; o throttle (função pura) libera a primeira, segura as seguintes e
  entrega a última.
- Navegador: `/test` e `/match` em 1×, 2× e 4× sem trancos visíveis; quadros por segundo medidos antes e depois.
- Changelog 4.4.1 (`fixes`), `package.json`.
