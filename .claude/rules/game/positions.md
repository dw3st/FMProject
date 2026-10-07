# Posições detalhadas (aptidão por posição)

Spec: `docs/superpowers/specs/2026-10-01-positions-design.md`. Bloco C1 da Etapa 9, versão **2.0**
(#20 zagueiro × lateral na escalação, #30 cor por posição, #31 posições estilo FM).

## Regra

- Cada jogador tem uma posição **natural** (uma das 14 de `roles.json`) e uma **aptidão** para todas as
  outras. Nada é gravado no mundo: tudo é derivado dos atributos, do pé e de `positions[0]`.
- Jogar numa vaga com aptidão ruim multiplica os atributos do jogador por `POSITION_PENALTY`
  (natural 1,00 · apt 0,97 · training 0,90 · unsuitable 0,80).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/positions/positionConfig.ts` | `POSITION_PENALTY`, limiares `APT_RATIO` 0,95 / `TRAINING_RATIO` 0,88 |
| `src/Domain/positions/positionAptitude.ts` | `positionAptitudes`, `preferredRole`, `aptitudeFor`, `positionFactor`, `slotValue`, `scaleStats` |
| `src/Domain/positions/positionLineup.ts` | `lineOrderLineup` (`/lab`), `poorFitStarters`, `unsuitableWithAlternative` (smoke) |
| `src/GameEngine/Domain/gameState.ts` | `buildGamePlayerForSlot` e `performSubstitution` aplicam o fator |
| `src/Domain/advanceDay/quickSim.ts` | `xiPlayer` guarda `k`; `lineValue` e `linePace` multiplicam por ele |
| `src/Domain/lineupHelpers.ts` | `autoFillLineup`, `suggestRotation`, `replaceUnavailableStarters` usam `slotValue` |
| `src/GameInterface/positionHelpers.ts` | `getDetailedPositionColor` |
| `src/GameInterface/Components/PositionPitch.tsx` | campinho de aptidões na ficha do jogador |

## Aptidão

`score(r) = weightedScore(stats, r)` (a mesma conta do motor). Natural = maior pontuação entre as posições
da linha do jogador (`positions[0]` -> GK/DEF/MID/FWD), respeitando o pé: esquerdo nunca é natural em
LB/LWB/LM/LW da direita e vice-versa (pé esquerdo só natural à esquerda ou no centro). Para as demais:
`score >= 0,95 x natural` apt, `>= 0,88 x` training, senão unsuitable. Fora da linha: no máximo training.
Vizinhas da mesma linha (grupos CDM/CM/CAM, CM/LM/RM, LB/LWB, RB/RWB; `NEIGHBOUR_APT_RATIO` 0,85) são
no mínimo apt a partir de 0,85 x natural e nunca piores que training — o aviso laranja da Formação
(`training`/`unsuitable`) só marca desajuste real. CB x lateral continua desajuste (#20), assim como
ST x ponta. Medição (XI automático 4-3-3, 5 ligas, 1078 titulares): 38 marcados (3,5%) antes, 33 (3,1%) depois (só CB em lateral e ST em ponta restam).
GK só GK; ninguém de linha é apto a GK. Empate de pontuação: vence a primeira da lista da linha
(CB, LB, RB, LWB, RWB / CDM, CM, CAM, LM, RM / LW, RW, ST).

Consequência: um elenco de atributos uniformes (testes, `/lab` com "stat level") só tem a primeira
posição da linha como natural; as demais viram apt/training.

## Onde o fator entra

- **Motor:** `teamLineup(scaleStats(buffed, fator), papel)` ao montar o titular e ao entrar um reserva
  (`GamePlayer.fit` guarda os atributos e o registro de aptidões por posição, dado puro; `factorFromAptitudes` converte em fator). `strengthAttr`/`stamina` ficam sem escala.
- **quickSim:** a força do titular na vaga (`lineValue`) e o pace (`linePace`) vezes o fator. Papel de
  vaga desconhecido (ex. `positions[0]` = "Defender") conta como natural.
- **Seleção:** valor na vaga = `weightedScore(vaga) x fator`. Na primeira passada do `autoFillLineup` um
  `unsuitable` só entra se não sobrou ninguém da linha, e as vagas são preenchidas da mais escassa (menos
  candidatos natural/apt) para a menos. Aptidões e pontuações são memoizadas por objeto `stats` (WeakMap).
  Trocas da IA em jogo (`AiSubstitution`) e as telas Formação/Prévia usam o mesmo valor ajustado.

## Medição de gols (2026-10-01, `quicksim-calibrate.ts`, 150 pares x 2, `QS_QUICK_REPEATS=50`)

Com a penalidade ligada x desligada (`POSITION_PENALTY` todo em 1), escalações automáticas:

| Liga | quickSim on / off | motor on / off (ruído de amostra ~ +-4%) |
|---|---|---|
| premier_league | 2,58 / 2,65 (-2,6%) | 2,60 / 2,45 |
| of_championship | 1,67 / 1,69 (-1,2%) | 1,60 / 1,64 |

XI automático da IA no mundo atual: 0,64 titulares por time com aptidão training/unsuitable na vaga;
0 com `unsuitable` havendo alternativa na linha.

## Posição natural fixada (`naturalPosition`)

`RosterPlayer.naturalPosition` (dado curado, `data_process/curated/playerCorrections.json`, ver
`.claude/rules/data/espn-import.md` → "Correções manuais de jogadores") vence os atributos e a regra do pé:
é a natural, e as aptidões das demais posições são calculadas relativas à pontuação dela (mesmos limiares e
vizinhanças). O overall (`computeOverallAvg`) passa a ser a pontuação dessa posição, não o melhor da linha.
Fora da linha principal do jogador é ignorada (`fixedNaturalRole`, `playerRating.ts`).

## Telas

- Elenco: sigla natural traduzida (`roles.detailedAbbr.*`) com a cor de `getDetailedPositionColor`.
- Ficha: `PositionPitch` (verde forte natural, verde claro apt, amarelo training).
- Formação: ponto colorido por titular (aptidão na vaga) e aviso quando é training/unsuitable.
- `/test`: `x0.90` ao lado do jogador fora de posição. `/lab`: `Variant.outOfPosition` (checkbox "Positions")
  e a linha "Out of position" (`avgOutOfPosition`) no `PairDetail`. Smoke: seção "Posições".

## Testes

`bun test src/Domain/positions src/Domain/advanceDay/quickSim.test.ts src/Domain/lineupHelpers.test.ts`.
