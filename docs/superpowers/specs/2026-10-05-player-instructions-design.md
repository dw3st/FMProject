# Etapa 27 — Instruções individuais — Design

Data: 2026-10-05. Status: em aprovação. Versão **4.2**. Regra do projeto: `/test`, `/lab`, `Statistics.ts`.
Base: `tatics.md`, `game-engine/tactical-config.md` ("What NOT to do"), `offball.md`, `defensive-position.md`,
`attack-position.md`, `movement-bounds.md`, `pass.md`, `carry.md`, `game/formations.md` (matriz).

## 1. Objetivo

Na tela de táticas, cada vaga ganha:

1. **Variante de função** (ex.: lateral apoia / fica / invertido; falso 9; ponta por dentro).
2. **Pressão individual**: menos / normal / mais.
3. **Marcação individual** de um adversário específico, por partida (prévia e ao vivo).

Tudo sobre **alavancas que o motor já tem**: o bloco `engine` de `roles.json` (`bounds`, `carryBias`,
`offBallBias`, `passBias`, `passTargetWeight`, `offBallIntentWeights`, `defensiveIntentWeights`) e a posição
base da vaga (a mesma geometria que a Etapa 19 usou). Nenhum campo novo de "viés": uma variante é um
**conjunto de valores alternativos para campos que já existem**. A única constante nova é de mecânica nova
(marcação individual), em `DefenseConfig`.

Só o clube do jogador usa. A IA joga no padrão (`AI-clubs/finance.md`: regras, não simulação).

## 2. Metas de equilíbrio

- **Nenhuma variante domina:** com o mesmo clube dos dois lados, a vantagem (V% − D%) de cada variante contra o
  padrão fica em **±5 p.p.** (erro padrão ~±2,4 p.p. com 1200 jogos).
- **Volume:** gols e chutes do espelho de cada variante (os dois times com ela) dentro de **±5%** do espelho
  padrão; um "pacote aleatório" (toda vaga com uma variante sorteada, dos dois lados) também em ±5%.
- **O mundo não muda por construção:** a IA não usa instruções e o padrão é a identidade (mesma tuning de hoje).
- **Cada variante tem efeito visível:** a métrica-assinatura dela (tabela da seção 3) anda pelo menos o mínimo
  indicado; senão a variante é cosmética e sai.

## 3. Catálogo de variantes

`src/GameEngine/Configs/RoleVariantConfig.ts` (`ROLE_VARIANTS`). Cada entrada: `roles` (papéis de vaga que a
aceitam), `engine: Partial<RoleEngineTuning>` (valores que **substituem** os do papel; `bounds` parcial),
`anchor?: { attack?: Offset; defend?: Offset }` com `Offset = { dx, dyIn }` (jardas; `dx` > 0 = para o gol
adversário, `dyIn` > 0 = para o centro, y 37; espelhados por lado e por time). Ausente = **Padrão** (valores
de hoje). Valores abaixo são o ponto de partida; a calibração (seção 9) pode movê-los.

| Variante | Papéis | Alterações (padrão → variante) | Assinatura (mín.) |
|---|---|---|---|
| `fb_overlap` Apoia | LB, RB | maxX 65→85; make_run .20→.45, hold .55→.35; carry .40→.60; offBallBias .15→.35; ataque dx +12 | x médio com a bola +6; cruzamentos do lateral +30% |
| `fb_hold` Fica | LB, RB | maxX 65→50; make_run .20→.05, hold .55→.80; carry .40→.20; ataque dx −6 | x médio com a bola −5 |
| `fb_inverted` Invertido | LB, RB | ataque dyIn +14; offer .45→.80, hold .55→.50, make_run .20→.10; passBias −.30→+.30; passTarget .40→.70 | \|y−37\| médio com a bola −8; passes +40% |
| `wb_attack` Ala ofensivo | LWB, RWB | maxX 90→100; make_run .30→.55; ataque dx +8 | x médio +5; cruzamentos +25% |
| `wb_defend` Ala defensivo | LWB, RWB | maxX 90→70; make_run .30→.10, hold .60→.80; ataque dx −8 | x médio −6 |
| `cb_stopper` Sai na marcação | CB | track_mark .5→.8, press .5→.7, step_into .5→.7, hold_shape .7→.5 | desarmes +20% |
| `cb_cover` Na sobra | CB | hold_shape .7→.9, press .5→.25; defesa dx −3 | distância à linha de defesa −2 |
| `cb_ball` Zagueiro com bola | CB | carry .15→.45; passBias −.30→0; maxX 50→60; offer .30→.45 | conduções +50% |
| `dm_anchor` Volante fixo | CDM | maxX 68→55; make_run .10→0, hold .65→.90, offer .70→.60; hold_shape .5→.75, press .7→.5 | x médio com a bola −5 |
| `dm_box` Volante que chega | CDM | maxX 68→80; make_run .10→.35; carry .30→.50; ataque dx +6 | chutes +50% |
| `cm_link` Meia de ligação | CM | offer 1.10→1.30, make_run .30→.15; passBias .8→1.0; carry .5→.35; ataque dx −4 | passes +20% |
| `cm_box` Chega na área | CM | make_run .30→.55, offer 1.10→.90; maxX 85→95; press .7→.8 | chutes +40% |
| `am_link` Meia armador | CAM | offer 1.0→1.2, make_run .55→.30; passBias .5→.8; ataque dx −4 | passes +20% |
| `am_shadow` Segundo atacante | CAM | make_run .55→.80, offer 1.0→.70; maxX 90→100; ataque dx +6 | chutes +40% |
| `wm_wide` Aberto | LM, RM | ataque dyIn −6; hold .55→.70 | \|y−37\| +4 |
| `wm_inside` Por dentro | LM, RM | ataque dyIn +10; offer .55→.75; passBias .4→.6 | \|y−37\| −6 |
| `w_wide` Ponta aberto | LW, RW | ataque dyIn −4; carry .9→1.0; hold .55→.70, make_run .65→.55 | cruzamentos +25% |
| `w_inside` Ponta por dentro | LW, RW | ataque dyIn +10; make_run .65→.80; passTarget .5→.6 | chutes do ponta +30% |
| `st_poacher` De área | ST | minX 40→55; offer .30→.15, make_run .80→.90, hold .40→.50; carry .6→.45; passBias 0→−.2; ataque dx +4 | chutes de dentro da área +15%, passes −30% |
| `st_false9` Falso 9 | ST | minX 40→30; offer .30→.90, make_run .80→.35; passBias 0→+.5; passTarget .5→.8; carry .6→.7; ataque dx −10 | x médio −8; passes +60% |
| `st_target` Pivô | ST | offer .30→.60, make_run .80→.30, hold .40→.70; passTarget .5→.75; passBias 0→+.3; carry .6→.3 | passes recebidos +30%, disputas aéreas +20% |

- Goleiro sem variantes nesta etapa.
- **Pressão individual** (`press`, toda vaga de linha): `less` = `press_holder` ×0,6 e `step_into_carry_lane` ×0,8;
  `more` = ×1,4 e ×1,15; `normal` = ×1. Mexe no mesmo peso que o estilo já escala; o custo de fôlego vem sozinho
  (mais ações `press`). Assinatura: pressões do jogador ±30%, fôlego final ∓.
- Os valores de `defensiveIntentWeights` acima são os de `roles.json` hoje (a tabela de
  `defensive-position.md` está desatualizada; corrigir na mesma branch).

## 4. Dados

```ts
// src/types/tacticsTypes.ts
type PressLevel = "less" | "normal" | "more";
interface SlotInstruction { variant?: RoleVariantId; press?: PressLevel }   // ausente = padrão
interface TacticsSave {
  // ...
  slotInstructions?: (SlotInstruction | null)[];   // índice = vaga (mesmo do lineup)
}

// SaveMeta (backend/SaveService.ts), mesmo molde de rotationOverride
matchMarking?: { date: string; marks: { slot: number; targetId: string }[] };   // máx. 2
```

- **Por vaga, não por jogador:** quem entra na vaga (escalação, substituição) herda a instrução. Trocar a
  formação passa por `sanitizeSlotInstructions(formation, instr)`: variante que o papel da nova vaga não aceita
  cai para o padrão (pressão fica).
- `PUT /api/saves/:id/tactics` valida com `parseSlotInstructions` (`src/Domain/tactics/slotInstructions.ts`):
  variante desconhecida ou incompatível com a vaga → 400; `null`/vazio = padrão.
- **Marcação é da partida**, não da tática (o adversário muda): `POST /api/saves/:id/match-marking
  { date, marks }` (dono do save, `withSaveLock`): data = `currentDate` com jogo do clube, vaga de linha,
  alvo no elenco do adversário do dia (não goleiro), no máximo 2, uma vaga e um alvo por par. O avanço do dia
  limpa (como `rotationOverride`). `POST /api/match-setup` devolve `matchMarking` e o XI provável do adversário.
- Sem migração (protótipo): ausente = padrão.

## 5. Motor

1. **Tuning por jogador.** `GamePlayer.engine: RoleEngineTuning` (resolvido na montagem) e
   `GamePlayer.instruction?: { variant?, press? }` (debug/snapshot). `resolveSlotTuning(role, instruction)`
   (puro, `RoleVariantConfig.ts`) = `roleEngine(role)` + `engine` da variante + escala da pressão. Padrão
   devolve **o mesmo objeto** de `roleEngine(role)` (identidade por construção).
2. **Leitores passam a usar o jogador**, não o papel: `engineOf(player)` (= `player.engine ??
   roleEngine(player.role)`, fallback para jogadores de teste e snapshots antigos) em `CarryLaneEval`,
   `DecisionTree` (passBias, carryBias), `PassLanes` (passTargetWeight do receptor), `OffBallMovement`
   (pesos de intenção e `offBallBias`), `DefensivePositioning` (pesos defensivos), `ActionOutcomes` (carryBias
   mínimo do drible). `bounds`/`yRange` saem do tuning resolvido em `buildGamePlayerForSlot`,
   `performSubstitution` e no rebuild de troca de formação.
3. **Âncora da vaga.** O `anchor` soma ao `resolveBasePosition` da vaga (posição de ataque e de defesa) antes de
   `attackingAnchor` e de `computeDefensiveShapeAnchor` — é o mesmo que mover a vaga no JSON da formação; os
   bounds Y são recentrados na vaga deslocada. Bolas paradas continuam pelos layouts (sem efeito de variante).
4. **Marcação individual.** `GameState.manMarks?: Partial<Record<TeamId, { markerId, targetId }[]>>` (ids do
   motor, resolvidos por vaga/rosterId; recalculados a cada substituição; par some se um dos dois saiu).
   - `assignMarkTargets` fixa os pares primeiro e roda o guloso só para o resto.
   - O marcador usa um tuning de marcação: `track_mark` .9, `hold_shape` .3, `press_holder` (do papel),
     bounds X +10 jardas para cada lado e Y em toda a largura (segue o alvo), e em `computeTrackMarkTarget` a
     ameaça tem piso `DefenseConfig.MAN_MARK_THREAT_FLOOR` (0,7) — marca colado mesmo com o alvo longe do gol.
   - Só na fase sem bola; com a bola o marcador volta ao comportamento da vaga.
5. **Ao vivo.** `applyPlayerInstruction(state, team, slot, instruction)` e `setManMarks(state, team, marks)`
   (puros, `gameState.ts`) reconstroem `engine`/`bounds`/âncora do jogador da vaga sem mexer em energia nem
   atributos; o efeito vale a partir do tick seguinte.
6. **Entradas.** `TeamTactics.slotInstructions` / `TeamTactics.manMarks` em `simulateMatch` (lado do jogador,
   via `computeMatchSimulationLineups`) e na partida ao vivo (`MatchScreen`, time A). A IA nunca define.
7. **Debug.** `debugLog('instruction', …)` ao aplicar/trocar e no par de marcação perdido;
   `defensiveScores`/`offBallScores` passam a carregar `variant`.

**Estatísticas (`Statistics.ts`).** Por jogador: `manMarked` (minutos marcado), e por time `markedTargetTouches`,
`markedTargetShots`, `markedTargetGoals` (receções, chutes e gols do alvo enquanto marcado — eventos já
existentes `passCompleted`/`shot`/`goalScored` com o alvo no par ativo). Variantes não geram evento novo: o
efeito aparece nas estatísticas por jogador que já existem.

## 6. quickSim

Nenhuma mudança. O clube do jogador sempre joga no motor completo (`non-player-games.md`), e a IA não usa
instruções; partidas IA × IA continuam exatamente iguais. Sem recalibração.

## 7. Telas (`ui-standard.md`)

- **Formação (`FormationScreen`):** clicar numa vaga abre o painel "Instruções" ao lado do campo: rótulo
  "FUNÇÃO" + `OptionChips` (Padrão + variantes do papel) com uma linha de descrição da escolhida; rótulo
  "PRESSÃO" + `OptionChips` (Menos / Normal / Mais). No campo, a vaga com variante mostra a sigla curta
  (`instructions.short.*`, ex. "INV", "F9") abaixo do nome; vaga com marcação mostra um ícone `target`.
  Grava junto do `PUT /tactics` existente.
- **Prévia (`MatchPreviewScreen`):** bloco "Marcação individual": até 2 linhas, cada uma com dois
  `SelectCombobox` com rótulo ("MARCADOR" do seu XI, "ALVO" do XI provável do adversário) e botão
  "Melhor jogador deles" (preenche o alvo de maior overall). Grava em `match-marking`.
- **Ao vivo (`SubstitutionPanel`):** terceira aba no `SegmentedTabs` (Substituições / Formação /
  **Instruções**): lista das 11 vagas com os mesmos chips (função e pressão) e a marcação (alvo só entre os
  adversários em campo). Mudanças ao vivo valem só para a partida (como a mentalidade).
- **i18n** (en, pt-BR): `instructions.title`, `instructions.role`, `instructions.press.{less,normal,more}`,
  `instructions.variant.<id>.{name,desc,short}`, `instructions.marking.{title,marker,target,best,none}`,
  `instructions.errors.*`. Nomes pt-BR: Apoia, Fica, Invertido, Ala ofensivo, Ala defensivo, Sai na marcação,
  Na sobra, Zagueiro com bola, Volante fixo, Volante que chega, Meia de ligação, Chega na área, Meia armador,
  Segundo atacante, Aberto, Por dentro, Ponta aberto, Ponta por dentro, De área, Falso 9, Pivô.
- `bun run ui:audit` limpo.

## 8. `/test` e `/lab`

- **`/test`:** seletor de variante e pressão por vaga e de marcação no painel de táticas de cada time;
  overlay **Instructions** (sigla da variante sob cada jogador, seta tracejada marcador → alvo, anel no alvo);
  o `DebugPanel` do jogador selecionado mostra o tuning resolvido (bounds, pesos de intenção, biases, âncora).
  Cenários `TestCases.ts`: `inverted-fullbacks`, `false-nine`, `man-mark-star`.
- **`/lab`:** `Variant.slotInstructions?` e `Variant.manMarks?: { slot; targetSlot }[]` (alvo pela vaga do
  adversário, porque o lab não tem ids fixos) no `VariantEditor`; rótulo `· instr N` / `· mark`.
  `TeamRawStats` → `balanceWorker` → `PerMatchView`/`VariantSummary`: `markedTargetShots`,
  `markedTargetGoals`, e **por vaga** (`slotStats`: passes, chutes, gols, cruzamentos, desarmes, pressões,
  x/|y−37| médios com a bola, fôlego final) → `PairDetail` com uma tabela "Por vaga".
- **MCP:** `summary` mostra `variant`/marcação; `score_off_ball`/`score_defensive_intent` usam `engineOf`.

## 9. Medição

Motor completo, `premier_league`, mesmo clube dos dois lados (rodando os clubes), mandos alternados, XI
automático, estilo equilibrado, fôlego 88. O motor não tem semente: rodadas somadas (`--json`/`--sum`).

1. **Matriz de instruções** (`scripts/instruction-matrix.ts`, sobre o runner de `formationMatrixPool`): cada
   variante aplicada às vagas simétricas do papel (os dois laterais, os dois pontas…) num lado, padrão no outro,
   1200 jogos por variante, na formação natural do papel (4-3-3: laterais, zagueiros, meias, pontas, ST;
   4-2-3-1: CDM, CAM; 3-5-2: alas; 4-4-2: LM/RM). Saída: vantagem, gols/chutes pró e contra e a assinatura
   (coletor `--detail` por vaga). `--mirror` para o volume. Também a página `/matrix` do lab ganha o modo
   "Instruções".
2. **Pressão:** `more`/`less` nas 10 vagas de linha, mesma matriz; meta ±5 p.p. e fôlego final coerente.
3. **Pacote aleatório:** 800 jogos com variante sorteada por vaga nos dois lados: gols/chutes ±5% do padrão.
4. **Marcação:** marcar o atacante de maior overall do adversário (1 e 2 marcadores), 800 jogos: chutes do alvo
   −20 a −35%, vantagem do time que marca dentro de +4 p.p. (não pode virar arma), gols contra fora do alvo
   sobem (o buraco deixado).
5. Variante que passa de ±5 p.p. é ajustada nos próprios valores; variante sem assinatura sai do catálogo.
   Tabelas antes/depois em `.claude/rules/game/player-instructions.md`.

## 10. Testes e smoke

```
bun test src/GameEngine/Configs/RoleVariantConfig.test.ts src/Domain/tactics \
  src/GameEngine/Domain/Instructions.engine.test.ts src/backend/instructions.routes.test.ts src/lab
```

- Puros: padrão = mesmo objeto de `roleEngine`; override só nos campos da variante; escala de pressão; âncora
  espelhada (time B, lado direito); `sanitizeSlotInstructions` ao trocar formação; `parseSlotInstructions`.
- `assignMarkTargets`: pares fixos respeitados, resto guloso, par descartado se alvo/marcador saiu.
- Motor: lateral invertido termina com |y−37| médio menor; marcador fica a ≤ 6 jardas do alvo em média na
  fase sem bola; troca ao vivo muda o tuning sem mexer na energia; substituição herda a instrução da vaga.
- Rotas: dono do save, 400 variante incompatível, `match-marking` (data errada, alvo fora do elenco, goleiro,
  >2), limpeza no dia seguinte.
- `scripts/season-rollover-smoke.ts`, seção "Instruções": o clube do jogador joga a temporada com laterais
  invertidos, falso 9 e um meia com pressão alta; em cada rodada marca o melhor jogador do adversário;
  confere que a tática sobrevive a uma troca de formação (sanitize), que `matchMarking` some no dia seguinte e
  que nenhum clube da IA grava instrução.

## 11. Limitações

- A variante não olha atributos: um falso 9 sem passe continua recuando (a escolha é do técnico).
- O marcador individual abre a forma; a IA não reage (não troca o marcado de posição nem manda outro).
- Marcação só a jogadores de linha e só a quem está em campo; sai o alvo, o par cai.
- Sem instruções de bola (chutar mais, driblar menos, cruzar cedo) nem para o goleiro nesta etapa.
- Bolas paradas ignoram as variantes (layouts fixos / `set-pieces-play.md`).
- A IA não usa nada disso, então o jogador pode explorar contra ela o que a IA não explora contra ele.

## 12. Decisões em aberto (com recomendação)

1. **Mudança ao vivo grava na tática?** Recomendo **não** (vale só para a partida, como a mentalidade); a tela
   de Formação é o lugar de salvar.
2. **Máximo de marcações:** recomendo **2** por partida.
3. **IA com instruções?** Recomendo **não** nesta etapa (padrão sempre). Depois: regra simples (azarão marca o
   artilheiro do jogador).
4. **Familiaridade/aprendizado por variante?** Recomendo **não**: o efeito é igual para qualquer elenco; a
   familiaridade continua só do estilo.
5. **Goleiro líbero** (bounds maxX 16→25)? Recomendo deixar para depois.
6. **Marcação automática** ("sempre o melhor atacante deles" salvo na tática)? Recomendo só o botão "Melhor
   jogador deles" por partida, sem regra persistente.
7. **Catálogo:** 21 variantes + pressão. Se a calibração custar demais, recomendo cortar primeiro `cb_cover`,
   `wm_wide` e `w_wide` (efeito menor), mantendo os nomes pedidos (lateral, volante, meia de ligação, ponta,
   centroavante, zagueiro com bola).

## Entregas

`.claude/rules/game/player-instructions.md` (novo), `tatics.md` (seção `slotInstructions`),
`defensive-position.md` (tabela de pesos corrigida), changelog 4.2 + `upcoming`, ROADMAP etapa 27.
