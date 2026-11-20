# Camada de lances (etapa 18 da reforma do motor)

O motor marca, numa partida, os trechos que são lance, para a etapa 19 mostrar só eles (modo B da partida ao vivo, como
o FM). Só observação: nada muda no jogo, nenhum sorteio novo. Flag `DECISION_FLAGS.HIGHLIGHTS` (ligada).

## Arquivos

| Arquivo | Papel |
|---|---|
| `Configs/HighlightConfig.ts` | Constantes (`HIGHLIGHT_CONFIG`): pré-rolagem, fim, junção, ataque, área |
| `Domain/Highlights.ts` (+ teste) | Classificador puro: `highlightEvent`, `highlightTick`, `highlightsOf`, `summarizeHighlights`, `nextHighlight`; estado em dado puro (`cloneHighlightState`) |
| `Domain/HighlightTracker.ts` | Ligação: eventos do `gameBus` → gatilhos; `simStep` → uma amostra por passo; um por processo, zerado no `initStats` |
| `Domain/gameState.ts` | `tickState` emite `simStep { state, dt, ball }` no fim de cada passo (a única mudança no motor) |
| `Domain/SimulateMatch.ts` | `MatchResult.highlights`, `liveSeconds` |
| `Domain/Statistics.ts` | `TeamStats` com `highlightsMain/Extended/Full`, `highlightSeconds*`, `highlightLiveSeconds`; o retrato da partida (`exportStatsState`) leva o estado da camada |
| `Support/HighlightSkip.ts` | `/test`: "próximo lance" (simula adiante e volta ao início da janela) |
| `GameInterface/HighlightTimeline.tsx` | Painel "Lances" do `/test` |
| `scripts/highlights-measure.ts` | Medição |

## Regra

- **Tempo:** segundos de simulação do jogo vivo (soma dos `dt` dos quatro períodos). É o tempo de exibição a 1× nos dois
  modos (relógio comprimido e `FULL_DURATION`).
- **Gatilhos e níveis** (os níveis se contêm: `full` mostra tudo):

| Nível | Gatilhos |
|---|---|
| `main` | gol, pênalti marcado, vermelho, gol anulado pelo VAR, chance clara (chute com xG ≥ `CLEAR_CHANCE` do `FmXg`) |
| `extended` | chute, grande defesa (defesa depois de chute com xG ≥ 0,15), revisão do VAR, lesão, amarelo, escanteio, falta perigosa |
| `full` | cruzamento com destino na área, ataque que fica 4 s no terço final ou 1 s na área (uma vez por posse), impedimento |

- **Início:** lance de jogo corrido começa na conquista da bola pelo time (−1 s), entre 3 e 10 s antes do gatilho; bola
  parada concedida 3 s antes (a falta, o corte); cartão, lesão e VAR 4 s antes.
- **Fim:** gol = 5 s depois; senão, passados 2 s do último gatilho, a primeira bola morta (+1 s) ou a perda da bola por
  2 s (+1 s depois da perda); no máximo 9 s depois do último gatilho; intervalo e fim de jogo fecham.
- **Junção:** um gatilho de nível igual ou mais importante dentro de uma janela aberta a estende (e sobe o nível e o
  tipo); um menos importante só entra na lista de gatilhos (não estica um gol). Um gatilho até 1,5 s depois de uma
  janela fechada de nível igual ou menos importante a reabre. Janelas nunca se sobrepõem.
- Determinístico: o mesmo jogo (semente) dá as mesmas janelas, ao vivo e no `simulateMatch`.

## `/test`, `/lab`

- `/test`: botão **Lances** (linha do tempo da partida com as janelas por nível, cursor no relógio, lista com os
  gatilhos, botão **Next lance** por nível); cenário `highlights-timeline`; categoria de debug `highlight` (cada janela
  que abre).
- `/lab`: `TeamRawStats.highlights*` → `avgHighlightsMain/Extended/Full` e `highlightShare*` (% do jogo, a parte do
  time) → linhas no `PairDetail`. `fm-targets.ts` imprime "lances" no fim.

## Medições

Ver `fm-numbers.md` → "Etapa 18". `bun scripts/highlights-measure.ts [partidas] [liga] [--seed] [--out]`
(`FULL_DURATION=1` para os 90 min de física).

## Limitações

- Sem calibração (etapa 21): o número de lances segue o volume do motor (com `FULL_DURATION` o motor ainda faz ~26 gols
  por jogo).
- O tempo dos eventos é o do fim do passo em que saíram (0,2 s).
- O anel de quadros para repetir fica para a etapa 19 (o `/test` usa um anel próprio só no "Next lance").
- Um lance sem time conhecido (VAR) conta metade para cada time no `/lab`.

## Highlights mode (stage 19)

The windows drive the live match's mode B: a Worker forecasts ahead and the page plays only the windows of the chosen
level, jumping over the rest. `HighlightTracker` registers its memory and exposes `openHighlight` / `closedHighlights`.
See `live-modes.md`.
