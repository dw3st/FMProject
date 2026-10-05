# Instruções individuais (variantes de função, pressão individual, marcação individual)

Spec: `docs/superpowers/specs/2026-10-05-player-instructions-design.md`. Etapa 27 do `docs/ROADMAP.md`, versão
**4.1**. Visual: `.claude/rules/ui-standard.md`. Pesos de papel: `roles.json` (`engine`), `game-engine/*`.

## Regra

- Cada vaga da tática do jogador tem uma **variante de função** (ex. lateral invertido, pivô) e uma **pressão
  individual** (menos / normal / mais). Por **vaga**, não por jogador: quem entra na vaga herda a instrução.
- **Marcação individual:** até 2 pares por partida (uma vaga de linha nossa marca um jogador de linha do adversário
  do dia), escolhidos na prévia ou ao vivo. Vale só na fase sem bola; com a bola o marcador joga a vaga.
- Tudo sobre **alavancas que o motor já tem**: uma variante é um conjunto de valores alternativos para campos do
  bloco `engine` de `roles.json` (`bounds`, `carryBias`, `offBallBias`, `passBias`, `passTargetWeight`,
  `offBallIntentWeights`, `defensiveIntentWeights`) e um deslocamento da âncora da vaga (a mesma geometria do JSON
  da formação). A pressão escala os dois pesos de pressão. As únicas constantes novas são as da marcação
  (`MAN_MARK_CONFIG`, mecânica nova).
- **Só o clube do jogador.** A IA joga sempre no padrão (regras, não simulação); o padrão é a identidade por
  construção (`resolveSlotTuning` devolve o mesmo objeto de `roleEngine(role)`), então o mundo não muda.
- Sem migração (protótipo): ausente = padrão.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/GameEngine/Configs/RoleVariantConfig.ts` (+ teste) | Catálogo `ROLE_VARIANTS`, `PRESS_LEVEL_MULT`, `resolveSlotTuning`, `effectiveInstruction`, `variantsForRole`, âncora (`instructionAnchor`, `applyAnchorOffset`) |
| `src/GameEngine/Domain/roleEngineData.ts` | `engineOf(player)` = `player.engine ?? roleEngine(role)` — todo leitor de tuning de papel passa por ele |
| `src/GameEngine/FormationSlots.ts` | `slotBasePosition` = vaga + âncora da variante (ataque e defesa) |
| `src/GameEngine/Domain/gameState.ts` | `applyPlayerInstruction`, `applyTeamInstructions`, `setManMarks`, `setManMarksBySlot`, `refreshManMarks`; troca de formação e substituição mantêm a instrução da vaga; marcador sem separação e com a arrancada da pressão |
| `src/GameEngine/Domain/DefensivePositioning.ts` | `defensiveWeightsOf`, `defensiveBoundsOf`, pares fixos em `assignMarkTargets`, posição colada em `computeTrackMarkTarget` |
| `src/GameEngine/Configs/DefenseConfig.ts` | `MAN_MARK_CONFIG` |
| `src/GameEngine/Domain/Statistics.ts` | `manMarked` (minutos marcado), `markedTargetTouches/Shots/Goals` (do jogador marcado, enquanto marcado) via o evento `manMarkTick` |
| `src/Domain/tactics/slotInstructions.ts` (+ teste) | `parseSlotInstructions`, `sanitizeSlotInstructions`, `parseMatchMarks` |
| `src/types/tacticsTypes.ts` | `RoleVariantId`, `PressLevel`, `SlotInstruction`, `TacticsSave.slotInstructions`, `MatchMarking` |
| `src/backend/saves.ts` | `PUT /tactics` (valida e saneia), `POST /api/saves/:id/match-marking` |
| `src/backend/routes.ts` | `match-setup` devolve `matchMarking`, `oppLineup` e as instruções saneadas |
| `src/Domain/advanceDay/matchSimulationLineups.ts` | `userInstructions` — instruções e marcação do lado do jogador na partida simulada |
| `src/backend/advanceDay.ts` | O avanço do dia limpa `meta.matchMarking` |
| `src/GameInterface/Components/SlotInstructionChips.tsx`, `ManMarkingPanel.tsx` | Chips de função/pressão; marcação (marcador, alvo, "Melhor jogador deles") |
| `src/GameInterface/FormationScreen.tsx`, `MatchPreviewScreen.tsx`, `SubstitutionPanel.tsx`, `MatchScreen.tsx` | Telas (abaixo) |
| `src/lab/instructionMatrix*.ts`, `scripts/instruction-matrix.ts`, `src/lab/slotStats.ts` | Medição (abaixo) |

## Catálogo (valores finais)

Ausente = Padrão (`roles.json`). "ataque dx/dyIn" = deslocamento da âncora de ataque (jardas; dx > 0 para o gol
adversário, dyIn > 0 para y 37, nunca além dela). Pesos de intenção: oferta/espaço/corrida (sem bola) e
forma/marcação/pressão/passo (defesa).

| Variante | Papéis | Valores (padrão → variante) | Assinatura medida |
|---|---|---|---|
| `fb_overlap` Apoia | LB, RB | maxX 65→85; corrida .20→.35, espaço .55→.45; carry .40→.60; offBallBias .15→.35; ataque dx +12 | x médio c/ bola, cruzamentos |
| `fb_hold` Fica | LB, RB | maxX 65→50; corrida .20→.05, espaço .55→.80; carry .40→.20; ataque dx −8 | x médio c/ bola |
| `fb_inverted` Invertido | LB, RB | ataque dyIn +14; oferta .45→.80, espaço .55→.50, corrida .20→.10; passBias −.30→+.50; passTarget .40→.70 | \|y−37\| c/ bola, passes |
| `wb_attack` Ala ofensivo | LWB, RWB | maxX 90→100; corrida .30→.55; ataque dx +12 | cruzamentos, x médio |
| `wb_defend` Ala defensivo | LWB, RWB | maxX 90→70; corrida .30→.10, espaço .60→.80; ataque dx −11 | x médio |
| `cb_stopper` Sai na marcação | CB | marcação .5→.85, pressão .5→.55, passo .5→.55, forma .7→.55 | distância à linha (mais alto) |
| `cb_cover` Na sobra | CB | forma .7→.8, pressão .5→.4; defesa dx −3 | pressões (menos) |
| `cb_ball` Zagueiro com bola | CB | carry .15→.35; passBias −.30→−.15; maxX 50→60; oferta .30→.45 | conduções |
| `dm_anchor` Volante fixo | CDM | maxX 68→60; corrida .10→0, espaço .65→.80, oferta .70→.70; forma .5→.75, pressão .7→.5; ataque dx −5 | x médio c/ bola |
| `dm_box` Volante que chega | CDM | maxX 68→80; corrida .10→.35; carry .30→.50; ataque dx +6 | x médio c/ bola |
| `cm_link` Meia de ligação | CM | oferta 1.10→1.50, corrida .30→.15; passBias .8→1.4; carry .5→.35; ataque dx −6 | passes |
| `cm_box` Chega na área | CM | corrida .30→.50, oferta 1.10→1.00; maxX 85→95; pressão .7→.75; ataque dx +3 | chutes |
| `am_link` Meia armador | CAM | oferta 1.0→1.2, corrida .55→.30; passBias .5→.8; ataque dx −4 | passes |
| `am_shadow` Segundo atacante | CAM | corrida .55→.80, oferta 1.0→.70; maxX 90→100; ataque dx +6 | chutes |
| `wm_inside` Por dentro | LM, RM | ataque dyIn +14; oferta .55→.75; passBias .4→.6 | \|y−37\| c/ bola |
| `w_inside` Ponta por dentro | LW, RW | ataque dyIn +9; corrida .65→.85; passTarget .5→.6 | chutes do ponta |
| `st_poacher` De área | ST | minX 40→55; oferta .30→.15, corrida .80→.90, espaço .40→.50; carry .6→.45; passBias 0→−.5; ataque dx +4 | chutes na área |
| `st_target` Pivô | ST | oferta .30→.55, corrida .80→.40, espaço .40→.80; passTarget .5→1.0; passBias 0→+.3; carry .6→.35; ataque dx +3 | passes recebidos |

**Pressão individual** (toda vaga de linha): menos = `press_holder` ×0,6 e `step_into_carry_lane` ×0,8; mais =
×1,4 e ×1,15.

**Cortadas na calibração** (decisão 7 do spec): `wm_wide` (Aberto) e `w_wide` (Ponta aberto) — vantagem −8 e
volume −18% (o meia aberto), e o ponta aberto cruzava *menos* (−18%), o contrário da assinatura; e `st_false9`
(Falso 9) — ver "Medição".

## Motor

- `GamePlayer.engine` (tuning resolvido) e `GamePlayer.instruction` (efetiva, saneada pelo papel da vaga) só
  existem com instrução; sem ela o jogador é idêntico ao de antes. `GameState.slotInstructions[time]` guarda a
  lista para a troca de formação; a substituição copia `engine`/`instruction`/`manMarkTargetId` da vaga.
- Leitores: `CarryLaneEval` (carryBias), `DecisionTree` (passBias, carryBias do drible), `PassLanes`
  (passTargetWeight do receptor), `OffBallMovement` (pesos e offBallBias), `DefensivePositioning` (pesos
  defensivos via `defensiveWeightsOf`), `gameState` (offBallBias do deslocamento).
- Âncora: `slotBasePosition` soma o deslocamento à vaga em `computeAttackingPosition`, no deslocamento sem bola e
  em `computeDefensiveShapeAnchor`; `basePosition` e os bounds Y são recentrados na vaga deslocada. Bolas
  paradas ignoram as variantes (layouts).
- **Marcação:** `GameState.manMarks[time] = { markerSlot, markerId, targetId }[]` (máx. 2) e
  `GamePlayer.manMarkTargetId` no marcador. `assignMarkTargets` fixa o par primeiro e roda o guloso para os
  demais **sem tirar o alvo do conjunto**: o zagueiro da zona ainda pega o alvo (cobertura dupla) e o buraco fica
  onde o guloso vê menos perigo. O marcador defende com `track_mark` .9 / `hold_shape` .3 (pressão da vaga),
  bounds X ±10 e Y no campo todo, ameaça com piso 0,7, e se posiciona a `TIGHT_DISTANCE` (1 jarda) do alvo,
  30% para o lado da bola e 70% para o próprio gol, lendo até 4 jardas da corrida do alvo; sem a separação de
  companheiros e com a arrancada da pressão enquanto marca. Um par cai se o alvo sai de campo; o marcador segue a
  vaga (substituto herda).
- Ao vivo: `applyPlayerInstruction` / `setManMarks` reconstroem tuning, âncora e bounds sem mexer em energia nem
  atributos; o efeito vale no tick seguinte. Debug: categoria `instruction`; `defensiveScores`/`offBallScores`
  levam `variant`.

## Dados e rotas

- `TacticsSave.slotInstructions?: (SlotInstruction | null)[]` (índice = vaga). `PUT /api/saves/:id/tactics`
  valida com `parseSlotInstructions` contra a formação que será salva (variante desconhecida, que não serve à
  vaga, pressão no goleiro → 400); uma troca de formação saneia a lista guardada (variante que o novo papel não
  aceita cai, a pressão fica).
- `SaveMeta.matchMarking?: { date, marks: { slot, targetId }[] }`. `POST /api/saves/:id/match-marking { date,
  marks }` (dono do save, `withSaveLock`): data = `currentDate` com jogo do clube, vaga de linha, alvo no elenco
  do adversário do dia e não goleiro, máximo 2, uma vaga e um alvo por par (400). O avanço do dia limpa; a troca
  de clube também. `POST /api/match-setup` devolve `matchMarking`, `oppLineup` (XI provável do adversário) e a
  lista saneada em `myTactics.slotInstructions`.
- Partida simulada do clube do jogador: `computeMatchSimulationLineups(..., matchMarking)` → `userInstructions`
  → `TeamTactics.slotInstructions` / `manMarks` (`targetRosterId`). Partida ao vivo: `MatchScreen` aplica as
  instruções e a marcação ao time A.

## Telas

- **Formação:** clicar numa vaga abre o painel "Instruções" abaixo do campo — "FUNÇÃO" (`OptionChips`: Padrão +
  variantes do papel, uma linha de descrição) e "PRESSÃO" (Menos / Normal / Mais); grava no `PUT /tactics`. No
  campo, a sigla da variante (`instructions.variant.<id>.short`) no canto do jogador e o ícone `target` na vaga que
  marca alguém na partida do dia.
- **Prévia:** bloco "Marcação individual" com até 2 linhas (MARCADOR do nosso XI, ALVO do XI provável deles,
  "Melhor jogador deles" = maior overall) gravado em `match-marking`.
- **Ao vivo:** aba "Instruções" no painel de substituições (vagas em chips, função e pressão da vaga escolhida,
  marcação com os adversários em campo). Só para a partida, nunca gravado (decisão 1).
- i18n `instructions.*`, `substitutionPanel.tabInstructions` (en, pt-BR).

## `/test`, `/lab`

- `/test`: painel "Team A/B Instructions" (variante e pressão por vaga, 2 pares de marcação por vaga do
  adversário, aplicados ao vivo por `testCommand`); overlay **Instructions** (tag da variante sob o jogador, linha
  tracejada marcador → alvo, anel no alvo); o `DebugPanel` do jogador selecionado mostra o tuning resolvido
  (bounds, biases, pesos, âncora, marcação). Cenários `inverted-fullbacks`, `target-man` (no lugar de
  `false-nine`, cortado) e `man-mark-star`.
- `/lab`: `Variant.slotInstructions` e `Variant.manMarks` (`{ slot, targetSlot }`) no `VariantEditor` (bloco
  "Instructions"); rótulo `· instr N` / `· mark`; `TeamRawStats.markedTargetShots/Goals`, `manMarkedMinutes` e
  `slotStats` (por vaga: passes, chutes, gols, cruzamentos, desarmes, ticks de pressão, x e \|y−37\| médios com a
  bola, fôlego final) → `PerMatchView`/`VariantSummary` → `PairDetail` ("Shots while marked" / "Goals while marked" e a tabela "Per
  slot"). `/matrix` ganhou o modo "Instructions" (`/api/lab/instr-matrix`).
- MCP: `summary` mostra `variant`/`press`/marcação; `score_off_ball`/`score_defensive_intent` usam `engineOf`.

## Medição (`bun scripts/instruction-matrix.ts`)

Motor completo, `premier_league`, o mesmo clube dos dois lados (rodando os clubes), mandos alternados, XI
automático, estilo equilibrado, fôlego 88. Lado X com a variante nas vagas simétricas do papel (os dois laterais,
os dois zagueiros, os dois meias…) na formação natural (4-3-3; CDM 4-2-3-1; alas 3-5-2; LM/RM 4-4-2), lado Y no
padrão. "Vantagem" = V% − D% de X. "Espelho" = os dois lados com a variante, comparado ao espelho padrão da mesma
formação. A assinatura compara as vagas de X com as mesmas vagas de Y nos mesmos jogos. O motor não tem semente:
rodadas somadas (`--json`/`--sum`); erro padrão da vantagem ~±2,5 p.p. com 1200 jogos, do volume do espelho
~±3,5% com 400.

### Espelho padrão (base)

| Formação | jogos | gols/jogo | chutes/jogo |
|---|---|---|---|
| 4-3-3 | 1200 | 2.24 | 5.39 |
| 4-2-3-1 | 1200 | 2.31 | 5.39 |
| 3-5-2 | 1200 | 2.46 | 6.22 |
| 4-4-2 | 1200 | 2.53 | 6.42 |

### Variantes e pressão: vantagem (V% − D%, contra o padrão) e assinatura

| Variante | formação | jogos | vantagem | gols X/Y | chutes X/Y | assinatura | espelho jogos | gols espelho (× base) | chutes espelho (× base) | ok |
|---|---|---|---|---|---|---|---|---|---|---|
| am_link | 4-3-3 | 1200 | **+2.4** | 1.10/1.06 | 2.69/2.57 | passes +26% (mín. +20%) | 400 | 2.26 (+1%) | 5.37 (-0%) | ✓ |
| am_shadow | 4-3-3 | 1200 | **-1.1** | 1.06/1.08 | 2.63/2.60 | chutes +270% (mín. +40%) | 400 | 2.19 (-2%) | 5.24 (-3%) | ✓ |
| cb_ball | 4-3-3 | 1200 | **+0.6** | 1.09/1.06 | 2.57/2.63 | conduções +68% (mín. +50%) | 400 | 2.25 (+0%) | 5.24 (-3%) | ✓ |
| cb_cover | 4-3-3 | 1200 | **-1.8** | 1.07/1.14 | 2.61/2.68 | pressões -58% (mín. -40%) | 400 | 2.22 (-1%) | 5.35 (-1%) | ✓ |
| cb_stopper | 4-3-3 | 1200 | **-3.2** | 1.14/1.20 | 2.70/2.91 | dist. à linha +2.2 (mín. +2.0) | 400 | 2.25 (+0%) | 5.47 (+2%) | ✓ |
| cm_box | 4-3-3 | 1200 | **-2.8** | 1.09/1.13 | 2.67/2.73 | chutes +67% (mín. +40%) | 400 | 2.21 (-1%) | 5.28 (-2%) | ✓ |
| cm_link | 4-3-3 | 1200 | **+2.4** | 1.11/1.08 | 2.70/2.60 | passes +26% (mín. +20%) | 400 | 2.23 (-0%) | 5.55 (+3%) | ✓ |
| dm_anchor | 4-2-3-1 | 1200 | **-2.7** | 1.04/1.08 | 2.46/2.52 | x médio c/ bola -5.4 (mín. -5.0) | 400 | 2.21 (-4%) | 5.06 (-6%) | vol  |
| dm_box | 4-2-3-1 | 1200 | **-4.4** | 1.07/1.15 | 2.61/2.73 | x médio c/ bola +3.7 (mín. +3.0) | 400 | 2.29 (-0%) | 5.39 (+0%) | ✓ |
| fb_hold | 4-3-3 | 1200 | **+4.3** | 1.14/1.08 | 2.67/2.66 | x médio c/ bola -5.6 (mín. -5.0) | 400 | 2.29 (+2%) | 5.32 (-1%) | ✓ |
| fb_inverted | 4-3-3 | 1200 | **+1.4** | 1.10/1.05 | 2.66/2.53 | |y−37| c/ bola -9.6 (mín. -8.0); passes +47% (mín. +40%) | 400 | 2.15 (-4%) | 4.89 (-9%) | vol  |
| fb_overlap | 4-3-3 | 1200 | **+4.5** | 1.16/1.11 | 2.70/2.66 | x médio c/ bola +5.8 (mín. +5.0); cruzamentos +63% (mín. +30%) | 400 | 2.26 (+1%) | 5.41 (+0%) | ✓ |
| press_less | 4-3-3 | 1200 | **+2.6** | 1.13/1.07 | 2.73/2.62 | pressões -83% (mín. -30%) | 400 | 2.17 (-3%) | 5.50 (+2%) | ✓ |
| press_more | 4-3-3 | 1200 | **-3.9** | 1.09/1.17 | 2.63/2.70 | pressões +90% (mín. +30%) | 400 | 2.21 (-1%) | 5.35 (-1%) | ✓ |
| st_poacher | 4-3-3 | 1200 | **+0.6** | 1.19/1.16 | 2.86/2.75 | chutes na área +15% (mín. +15%) ✗ | 400 | 2.34 (+5%) | 5.69 (+6%) | vol assin |
| st_target | 4-3-3 | 1200 | **+3.6** | 1.17/1.10 | 2.74/2.69 | passes recebidos +34% (mín. +30%) | 400 | 2.23 (-1%) | 5.28 (-2%) | ✓ |
| w_inside | 4-3-3 | 1200 | **+1.3** | 1.14/1.13 | 2.79/2.66 | chutes +16% (mín. +15%) | 400 | 2.38 (+6%) | 5.59 (+4%) | vol  |
| wb_attack | 3-5-2 | 1200 | **-3.2** | 1.19/1.28 | 3.02/3.24 | x médio c/ bola +3.7 (mín. +3.0); cruzamentos +71% (mín. +25%) | 400 | 2.43 (-1%) | 6.17 (-1%) | ✓ |
| wb_defend | 3-5-2 | 1200 | **-2.4** | 1.26/1.31 | 3.09/3.19 | x médio c/ bola -6.2 (mín. -5.0) | 400 | 2.47 (+0%) | 6.41 (+3%) | ✓ |
| wm_inside | 4-4-2 | 1200 | **+1.9** | 1.26/1.21 | 3.18/3.08 | |y−37| c/ bola -6.5 (mín. -6.0) | 400 | 2.40 (-5%) | 6.07 (-6%) | vol  |

#### Pressão: fôlego final e pressões das 10 vagas de linha

| Pressão | pressões X/Y (ticks) | fôlego final X/Y |
|---|---|---|
| press_less | 7.53/45.18 | 55.22/55.50 |
| press_more | 84.15/44.39 | 56.54/55.51 |

### Pacote aleatório (4-3-3 / 4-2-3-1 / 3-5-2 / 4-4-2, os dois lados)

| | jogos | gols/jogo | chutes/jogo |
|---|---|---|---|
| padrão | 800 | 2.37 | 5.91 |
| aleatório | 800 | 2.65 (+12%) | 6.44 (+9%) |

### Marcação individual (X marca os melhores atacantes de Y; controle = os mesmos jogadores de X, sem marcação)

| Marcação | jogos | vantagem de X | chutes do alvo marcado / controle | gols do alvo / controle | gols contra X fora do alvo / controle | min. marcado |
|---|---|---|---|---|---|---|
| mark_cb_1 | 800 | **+1.4** | 0.79 / 1.03 (-24%) | 0.37 / 0.51 | 0.74 / 0.62 (+20%) | 82.53 |
| mark_cb_2 | 800 | **-0.6** | 1.64 / 1.83 (-10%) | 0.73 / 0.79 | 0.49 / 0.36 (+38%) | 162.55 |
| mark_mid_1 | 800 | **-4.5** | 0.89 / 0.99 (-10%) | 0.45 / 0.47 | 0.66 / 0.57 (+16%) | 81.89 |
| mark_mid_2 | 800 | **-2.6** | 1.53 / 1.64 (-7%) | 0.70 / 0.71 | 0.41 / 0.32 (+26%) | 162.07 |

Rodadas somadas por variante na configuração final (`debug/instr/`, não versionado): as que não mudaram desde a
2ª rodada juntam a 2ª e a 3ª; as reajustadas usam só a rodada da configuração final. Espelho padrão: 1200 jogos
por formação.

**Leitura:**
- **Vantagem:** as 19 variantes e as duas pressões ficam dentro de ±5 p.p. (de −4,4 a +4,5).
- **Volume do espelho (±5%):** 15 de 21 dentro; fora por pouco (400 jogos, erro padrão ~±3,5% nos gols):
  `dm_anchor` −6% chutes, `fb_inverted` −9% chutes (gols −4%), `wm_inside` −6% chutes, `st_poacher` +6% chutes,
  `w_inside` +6% gols. Laterais invertidos e volantes fixos dos dois lados fecham o meio e o jogo fica mais
  travado; o atacante de área e o ponta por dentro abrem.
- **Pacote aleatório: +12% gols, +9% chutes** (meta ±5%): toda vaga com uma variante sorteada, nos dois lados ao
  mesmo tempo, solta o jogo (os pontas e meias abertos só têm a variante "por dentro", e metade das vagas centrais
  tira jogadores da linha). Não afeta o mundo (a IA não usa instruções) e um time real não sorteia as 10 vagas;
  limitação registrada.
- **Assinaturas** (X instruído contra as mesmas vagas do padrão, mesmos jogos): todas andam o mínimo, com quatro
  métricas trocadas ou mínimos baixados em relação ao spec (comentários em `SIGNATURES`,
  `scripts/instruction-matrix.ts`): `cb_stopper` linha +2,2 jardas (spec: desarmes +20% — com mais pressão ele
  perdia a vantagem); `cb_cover` pressões −58% (spec: −2 jardas da linha — a âncora mais funda só move ~1 jarda,
  a forma acompanha a bola); `dm_box` x +3,7 (spec: chutes +50% — um volante chuta ~0,03 vez por jogo);
  `st_target` só passes recebidos +34% (spec: também disputas aéreas +20% — o lançamento escolhe o receptor pelo
  cabeceio, não pelo `passTargetWeight`); `st_poacher` só chutes na área +15% (spec: também passes −30%); `w_inside`
  chutes +16% (spec +30%: a configuração com +27% ganhava +7 p.p.); `wb_attack`/`wb_defend` x +3,7/−6,2 com mínimos
  +3/−5 (spec +5/−6); `fb_overlap` x +5,8 (spec +6).
- **Pressão:** mais = +90% de ticks de pressão das 10 vagas de linha, menos = −83%; o fôlego final quase não muda
  (+1 com mais pressão — a pressão individual não passa pelo `PRESS_STAMINA_MULT` do estilo e o tick de pressão
  custa quase o mesmo que o deslocamento).
- **Marcação individual** (o marcador colado: 1 jarda do alvo, sem separação dos companheiros, com a arrancada da
  pressão): marcando o melhor atacante com um zagueiro, os chutes do alvo caem **24%** (gols −27%), vantagem +1,4,
  gols contra fora do alvo +20% (o buraco); com um meia, −10% e vantagem −4,5; com 2 marcadores, −7 a −10% e mais
  gols de outros (+26 a +38%). Distância média marcador–alvo na fase sem bola já organizada: ~4,7–5,4 jardas
  (teste: ≤ 6). Primeira versão (marcador a 2 jardas e alvo fora do guloso): os chutes do alvo *subiam* 14–48% —
  sem cobertura nas transições.
- **Cortadas:** `w_wide` (vantagem −8, cruzamentos −18%: o contrário da assinatura), `wm_wide` (vantagem −8,5,
  volume do espelho −18%) e `st_false9` (5 configurações, todas de −6 a −16 p.p.: o `passBias` faz o centroavante
  passar na área em vez de chutar, e sem ele a variante não tem assinatura — o atacante já fica preso na linha de
  impedimento, a âncora mais funda não move o x médio).


## Testes e smoke

```
bun test src/GameEngine/Configs/RoleVariantConfig.test.ts src/Domain/tactics \
  src/GameEngine/Domain/Instructions.engine.test.ts src/backend/instructions.routes.test.ts src/lab
```

`scripts/season-rollover-smoke.ts`, seção "Instruções": o clube do jogador joga a temporada com laterais
invertidos, pivô e um meia com pressão alta (gravados pela rota); a troca para o 3-5-2 saneia a lista; em toda
rodada do clube marca o melhor jogador de linha do adversário pela rota, e a marcação some no dia seguinte;
nenhum clube da IA joga ou grava instruções.

## Limitações

- A variante não olha atributos (a escolha é do técnico).
- O marcador abre a forma; a IA não reage (não troca o marcado de posição nem manda outro).
- Marcação só de jogadores de linha em campo; sai o alvo, o par cai. O marcador corre com a arrancada da pressão
  sem o custo de fôlego da pressão (a ação conta como deslocamento).
- Sem instruções de bola (chutar mais, cruzar cedo) nem para o goleiro.
- Bolas paradas ignoram as variantes.
- A IA não usa nada disso.
