# Formações (17 prontas) e escolha de formação da IA

Etapa 18 do `docs/ROADMAP.md` (#59); equilíbrio entre elas na Etapa 19 (#63, 3.4). Formação livre (zonas, `custom`): `.claude/rules/tatics.md` →
"Formação livre e eixos". Posições e aptidão: `.claude/rules/game/positions.md`.

## Regra

- 17 formações prontas, uma por arquivo em `src/example_data/formations/{id}.json` (runtime:
  `src/Data/formations`), no formato de sempre: `id`, `attacking` e `defending` com 11 vagas
  `{ role, x, y }` em jardas (referência do time A), mesmas posições de `roles.json`. Nenhuma usa
  `yRange` próprio: os limites vêm do papel (`movement-bounds.md`).
- Todas são escolhíveis pelo jogador (tela de Formação, troca na partida ao vivo, `/test`, `/lab`).
  A lista é `FORMATION_IDS` (`src/Domain/matchFormations.ts`, registro com os 17 JSONs);
  `SUPPORTED_FORMATIONS` (`SetPieceLayouts.ts`) só marca as 3 com bolas paradas feitas à mão
  (4-3-3, 4-4-2, 3-5-2). As outras 14 usam `generateSetPieces` (layouts gerados das próprias vagas,
  o mesmo caminho da formação livre) — antes as 7 antigas sem layout manual apareciam como
  "em breve"; agora todas valem.
- **Clubes da IA escolhem a formação** (`src/Domain/formation/aiFormation.ts`), uma por temporada,
  em vez do 4-3-3 fixo. O clube do jogador continua usando `TacticsSave.formation`.

## As 7 novas

| Formação | Vagas (ataque → defesa) | Observação |
|---|---|---|
| 4-4-1-1 | LB CB CB RB · LM CM CM RM · CAM (x 84 no ataque, 48 na defesa) · ST | Segundo atacante mais alto que o CAM do 4-2-3-1 |
| 4-3-2-1 | LB CB CB RB · CM CDM CM · CAM CAM (84, y 26/48) · ST | "Árvore de Natal" |
| 3-4-2-1 | CB×3 (y 22/37/52) · LWB CM CM RWB · CAM CAM (86, y 24/50) · ST | |
| 3-4-1-2 | CB×3 (y 22/37/52) · LWB CM CM RWB · CAM (80) · ST ST | |
| 5-4-1 | LWB CB×3 (y 22/37/52) RWB · LM CM CM RM · ST | Ala ataca a 48 jardas |
| 5-2-3 | LWB CB×3 (y 22/37/52) RWB · CDM CDM · LW ST RW | Dois volantes (o 3-4-3 tem dois CM) |
| 4-1-2-1-2 | LB CB CB RB · CDM · CM CM (66, y 22/52) · CAM (80) · ST ST | Losango estreito (o 4-3-1-2 tem três CM em linha) |

**Ajuste de vagas (só posição):** as quatro novas com linha de três começaram com os zagueiros em
y 18/37/56 (como 3-5-2/3-4-3/5-3-2). O jogo espelho delas fazia ~10% mais gols que com os zagueiros
em 22/37/52 (3-4-2-1 3,40 → 2,98 gols/jogo; 5-4-1 3,15 → 2,71), então ficaram em 22/37/52. Avançar
alas/meias (ala 48, CAM 82) não mudou nada. Na Etapa 19 as linhas de três antigas (3-5-2, 3-4-3, 5-3-2) também foram para 22/37/52.

## Equilíbrio entre formações (Etapa 19, versão 3.4, #63)

Spec: `docs/superpowers/specs/2026-10-03-formation-balance-design.md`. Meta: toda formação dentro de
±8 p.p. de vantagem (V% − D%) contra a média das outras, com elencos iguais; 4-3-3 no meio da faixa;
gols/chutes do motor no mundo ±5%; espelho de cada formação ±15% da média.

### Medição: matriz de formações (`scripts/formation-matrix.ts`, `/lab` → `/matrix`)

Cada formação contra um conjunto de referência (4-3-3, 4-4-2, 4-2-3-1, 3-5-2) e contra si mesma
(`--mirror`), o MESMO clube dos dois lados (cada jogo pega o próximo clube da `premier_league`, mandos
alternados), motor completo, XI automático, estilo equilibrado, fôlego dos dados. Vantagem = média,
sobre os adversários distintos, de V% − D% (cada par conta para as duas formações dele;
`summarizeMatrix`). O motor não tem semente: `--json` grava os pares brutos e `--sum a.json,b.json`
soma rodadas. Erro padrão da vantagem de uma formação: ~±4 p.p. com 400 jogos, ~±2,4 com 1200.
`--detail` imprime o diagnóstico por formação (coletor `playMatrixMatch`,
`src/lab/formationMatrix.ts`, via o gancho `onTick` de `simulateMatch`): posse, entradas no terço
final pelo meio × pelas pontas, cruzamentos, bolas em profundidade, chutes e gols por zona (área
central / área lateral / fora) e por como a bola chegou (profundidade / cruzamento / passe /
condução), roubadas por terço, jogadores atrás da bola (total e no corredor central) com o adversário
de posse e no chute dele.

O runner é compartilhado (`src/lab/formationMatrixPool.ts` + `formationMatrixWorker.ts`; a agregação
pura em `formationMatrixSummary.ts`): a página `/matrix` do lab (`FormationMatrixView`,
`formationMatrixRun.ts`, rotas `GET/POST /api/lab/matrix` e `GET /api/lab/matrix/:id`) roda a mesma
matriz em até 4 workers, mostra o progresso e grava em `debug/balance/lab/matrix/`.

### Mecanismo encontrado

1. **Quase todo gol sai de condução no corredor central da área.** ~95% dos chutes são da área entre
   y 22 e 52; chutes da área lateral ~0, de fora ~0,2 por time; cruzamentos (7–8 por time) viram
   ~0,06 gol. Quem tem mais jogadores no meio do ataque chega mais ao meio (4-1-2-1-2 / 4-2-2-2 /
   5-3-2: 4,4–5,0 entradas centrais por jogo; 4-3-3 / 4-2-3-1 / 4-5-1: ~2,5) e chuta mais (4,1 × 2,8).
   As vagas de ponta (LW/RW em y 8/66) eram atacantes perdidos: o deslocamento sem bola puxava o
   ponta de volta para a vaga junto à linha lateral (no 4-3-3 os pontas ficam ~5 minutos de jogo com
   a bola na ponta do terço final, conduzindo e driblando, quase sem chute).
2. **O bloco defensivo não se deslocava.** O deslocamento lateral do bloco para o lado da bola era só
   ~12% da distância da bola (`BLOCK_SHIFT_WEIGHT × 0,15`), então cada formação defendia onde as
   vagas estavam desenhadas: as fechadas (losango, 4-3-2-1: volante em x 28 + meias por dentro)
   sofriam ~2,8 chutes; as abertas (linha de três em y 18/37/56, pontas em x 50 na lateral) ~3,7–4,0.
3. Por isso o 4-3-3 (um atacante central, pontas na lateral) chutava menos que todas e o 3-4-3
   (pontas abertos + linha de três aberta + dois volantes separados) sofria mais que todas.

### Alavancas (globais do motor ou geometria de vaga; nenhum bônus por id de formação)

| Alavanca | Antes | Depois | Onde |
|---|---|---|---|
| Deslocamento lateral do bloco para o lado da bola (`BLOCK_SHIFT_SCALE`) | 0,15 | **0,45** | `DefensivePositioning.ts` → `computeDefensiveShapeAnchor` (com a bola na outra ponta o ponta fecha ~20 jardas) |
| Convergência na área (`ATTACK_CONFIG.BOX_CONVERGENCE`) | — | **0,6** | `attackingAnchor` (`AttackingPositioning.ts`): vagas de ataque com x ≥ 70 fecham para y 37 em até 60% conforme a bola avança de x 70 a 100; vale para o posicionamento, a âncora da corrida sem bola e o `hold_space` |
| Largura da equipe no ataque (`getTeamAttackWidth`) | sem efeito | ×0,75 / ×1 / ×1,2 | mesmo `attackingAnchor` — `normal` é a vaga como desenhada (`tactical-config.md`) |
| Zagueiros da linha de três (3-5-2, 3-4-3, 5-3-2) | y 18/37/56 | **22/37/52** | igual às linhas de três novas da Etapa 18 |
| Dupla de volantes do 3-4-3 | y 24/50 | **28/46** | nada entre os dois (no 4-3-3 e no 3-5-2 há um terceiro meia no meio) |
| Pontas do 3-4-3 sem a bola | x 50, y 8/66 | **x 40, y 10/64** | o 3-4-3 defende em 5-4-1; o 5-2-3 é a forma com os três da frente parados |

Testado e descartado: compactação para o centro (`COMPACTNESS_SCALE` 0,12 → 0,25) — equilibra um pouco,
mas tira 10–17% dos gols de todos os jogos; corrida sem bola atraída para o gol (termo na nota da
célula de `make_run`) — ajuda mais quem já tem dois atacantes; compactação vertical (meio-campo
descendo para a linha de defesa perto da área, usando o `VERTICAL_COMPACTNESS` que existe na config
sem uso) — sem efeito mensurável; convergência 0,75 — sem ganho sobre 0,6 dentro do ruído.

### Antes × depois (motor, `premier_league`)

Antes: 100 jogos por par. Depois: rodadas somadas, 300 jogos por par (3-4-3: 200, com as vagas finais),
1200 jogos por formação (as de referência ~4700).

| Formação | vantagem antes | depois | chutes pró / contra antes | depois | espelho antes (gols, × média) | depois |
|---|---|---|---|---|---|---|
| 4-3-2-1 | +19,0 | **+11,2** | 3,68 / 2,86 | 2,99 / 2,60 | 2,45 (0,89) | 2,29 (0,97) |
| 4-1-2-1-2 | +25,5 | **+9,8** | 4,14 / 2,83 | 3,46 / 2,66 | 2,79 (1,02) | 2,33 (0,99) |
| 4-2-2-2 | +13,8 | **+5,7** | 3,87 / 3,33 | 3,31 / 2,76 | 2,90 (1,06) | 2,32 (0,98) |
| 4-3-1-2 | +8,5 | **+4,9** | 3,80 / 3,23 | 3,30 / 2,89 | 2,72 (0,99) | 2,42 (1,03) |
| 4-1-4-1 | −3,5 | **+3,4** | 3,12 / 3,30 | 2,77 / 2,82 | 2,36 (0,86) | 2,22 (0,94) |
| 4-2-3-1 | −0,1 | **+2,1** | 3,24 / 3,23 | 2,82 / 2,83 | 2,45 (0,89) | 2,19 (0,93) |
| 5-2-3 | −0,5 | **+1,6** | 3,23 / 3,42 | 2,83 / 2,91 | 2,64 (0,96) | 2,55 (1,08) |
| 3-4-1-2 | +10,3 | **+0,0** | 3,87 / 3,35 | 3,19 / 2,95 | 3,04 (1,11) | 2,62 (1,11) |
| 3-5-2 | −10,2 | **−0,9** | 3,53 / 3,73 | 3,00 / 2,98 | 3,04 (1,11) | 2,49 (1,06) |
| 4-4-2 | +2,0 | **−1,1** | 3,59 / 3,43 | 3,03 / 2,98 | 2,91 (1,06) | 2,43 (1,03) |
| 4-5-1 | −4,0 | **−1,6** | 2,99 / 3,17 | 2,76 / 2,96 | 2,17 (0,79) | 2,26 (0,96) |
| 3-4-2-1 | +7,3 | **−1,7** | 3,31 / 3,26 | 2,76 / 2,95 | 3,08 (1,12) | 2,52 (1,07) |
| 5-3-2 | +3,3 | **−1,9** | 3,76 / 3,49 | 3,06 / 2,97 | 3,34 (1,22) | 2,46 (1,04) |
| 4-3-3 | −8,8 | **−3,9** | 2,82 / 3,34 | 2,61 / 2,93 | 2,36 (0,86) | 2,04 (0,86) |
| 5-4-1 | +4,8 | **−4,5** | 3,18 / 3,29 | 2,65 / 2,93 | 2,76 (1,01) | 2,29 (0,97) |
| 3-4-3 | −14,0 | **−5,5** | 2,89 / 3,95 | 2,63 / 2,92 | 3,03 (1,10) | 2,33 (0,99) |
| 4-4-1-1 | −2,3 | **−5,8** | 3,08 / 3,26 | 2,58 / 2,92 | 2,61 (0,95) | 2,32 (0,98) |
| média do espelho | | | | | 2,74 | 2,36 |

Amplitude da vantagem: **39,5 → 17,0 p.p.**; fora de ±8: 8 formações → 2 (4-3-2-1 +11,2 e 4-1-2-1-2
+9,8, as duas com volante em x 28 e meias por dentro — ver "Limitações"). O 4-3-3 sai de −8,8 para
−3,9, dentro da faixa (média das 17: +0,7). Espelho: todas dentro de ±15% da média (antes o 5-3-2
fazia 1,22× e o 4-5-1 0,79×); o 4-3-3 continua o mais fechado (0,86×).

### Volume do mundo (`bun scripts/ai-formation-goals.ts --engine 800`, fôlego 88)

"main" = todo clube no 4-3-3; "IA" = cada clube na formação que escolhe (já sem a penalidade de
volume). O jogo de verdade é o modo IA.

| Liga | modo | gols antes | gols depois | Δ | chutes antes | chutes depois | Δ |
|---|---|---|---|---|---|---|---|
| premier_league | motor IA | 2,560 | 2,483 | −3,0% | 6,00 | 5,89 | −1,8% |
| of_championship | motor IA | 1,881 | 1,777 | −5,5% | 5,36 | 5,18 | −3,4% |
| **as duas somadas** | motor IA | 4,441 | 4,260 | **−4,1%** | 11,36 | 11,07 | **−2,6%** |
| premier_league | motor main | 2,462 | 2,319 | −5,8% | 5,95 | 5,42 | −8,9% |
| of_championship | motor main | 1,810 | 1,657 | −8,5% | 5,01 | 4,64 | −7,4% |

"Depois" do modo IA = 1200 jogos por liga (uma rodada de 400 e uma de 800); main = 800. Ruído por modo
~±2,5–3%. O mundo com todos no 4-3-3 perde ~7% (o bloco que desliza defende melhor), mas o mundo real
(formações variadas, agora liberadas) fica dentro de ±5%.

**quickSim:** calibrado contra o motor no 4-3-3 dos dois lados; `BASE_GOALS` 0,84 → 0,78 (−7%, o
mesmo fator do motor no modo main). Depois: main PL 2,531 (motor 2,319, +9%; antes +10,6%),
Championship 1,583 (motor 1,657, −4,5%; antes −6%); IA PL 2,638 (+8%), Championship 1,693 (−4%).

## Equilíbrio contra o 4-3-3 na Etapa 18 (histórico, antes da Etapa 19) (`scripts/formation-vs-433.ts`)

Motor completo, `premier_league`, o MESMO clube dos dois lados (cada jogo pega o próximo clube da
liga, mandos alternados), XI automático de cada formação (`autoLineupForFormation`), estilo
equilibrado, fôlego dos dados (75). O motor não tem semente: rodadas somadas com `--sum`.
Vantagem = V% − D% da formação testada (0 = igual ao 4-3-3; erro padrão ~±3 p.p. em 800 jogos,
±4 em 400).

| Formação | jogos | V % | E % | D % | vantagem | gols pró | gols contra |
|---|---|---|---|---|---|---|---|
| **4-3-2-1** | 800 | 48,8 | 25,0 | 26,3 | +22,5 | 1,49 | 1,01 |
| **4-1-2-1-2** | 800 | 46,9 | 26,5 | 26,6 | +20,3 | 1,43 | 1,04 |
| 4-2-2-2 | 800 | 45,9 | 26,4 | 27,8 | +18,1 | 1,55 | 1,15 |
| 4-3-1-2 | 400 | 44,3 | 27,3 | 28,5 | +15,8 | 1,45 | 1,05 |
| 4-4-2 | 400 | 44,5 | 24,0 | 31,5 | +13,0 | 1,42 | 1,16 |
| 4-2-3-1 | 400 | 40,5 | 28,3 | 31,3 | +9,3 | 1,26 | 1,11 |
| 4-1-4-1 | 400 | 39,0 | 30,3 | 30,8 | +8,3 | 1,24 | 1,07 |
| **4-4-1-1** | 800 | 42,3 | 23,1 | 34,6 | +7,6 | 1,39 | 1,25 |
| **5-4-1** | 800 | 40,6 | 25,9 | 33,5 | +7,1 | 1,34 | 1,17 |
| 5-3-2 | 400 | 40,3 | 25,8 | 34,0 | +6,3 | 1,37 | 1,29 |
| **3-4-1-2** | 800 | 39,6 | 25,9 | 34,5 | +5,1 | 1,34 | 1,26 |
| **3-4-2-1** | 800 | 38,6 | 27,3 | 34,1 | +4,5 | 1,27 | 1,15 |
| **5-2-3** | 800 | 37,0 | 27,0 | 36,0 | +1,0 | 1,24 | 1,26 |
| 4-5-1 | 400 | 36,5 | 25,8 | 37,8 | −1,3 | 1,23 | 1,24 |
| 3-5-2 | 400 | 37,0 | 23,5 | 39,5 | −2,5 | 1,34 | 1,32 |
| 3-4-3 | 400 | 31,8 | 28,3 | 40,0 | −8,3 | 1,18 | 1,45 |

Em negrito as novas (as de linha de três já com os zagueiros em 22/37/52). As 10 antigas iam de
−8,3 (3-4-3) a +18,1 (4-2-2-2); as novas de +1,0 a +22,5. O 4-3-3 era a mais fraca contra quase todas
— corrigido na Etapa 19 (seção acima).

### Volume de gols do jogo espelho (`--mirror`)

Cada formação contra ela mesma, 400 jogos (mesmas condições): o 4-3-3 é a que menos faz gols.

| Formação | gols/jogo | × 4-3-3 |
|---|---|---|
| 4-3-3 | 2,35 | 1,00 |
| 4-5-1 / 4-2-3-1 / 4-1-4-1 | 2,37 / 2,41 / 2,44 | 1,01 / 1,03 / 1,04 |
| 4-3-2-1 / 4-4-1-1 | 2,53 / 2,57 | 1,08 / 1,09 |
| 4-1-2-1-2 / 5-2-3 / 4-2-2-2 / 5-4-1 | 2,63 / 2,68 / 2,71 / 2,71 | 1,12 / 1,14 / 1,15 / 1,15 |
| 4-4-2 / 4-3-1-2 / 3-4-1-2 | 2,83 / 2,84 / 2,91 | 1,20 / 1,21 / 1,24 |
| 3-4-3 / 3-4-2-1 | 2,99 / 2,98 | 1,27 |
| 3-5-2 / 5-3-2 | 3,15 / 3,16 | 1,34 |

Linha de três e dois atacantes chutavam bem mais (3,6–4,1 chutes por time contra 2,8 do 4-3-3). A
Etapa 18 controlava isso na escolha da IA (penalidade de volume de gols); a Etapa 19 corrigiu o motor
e tirou a penalidade.

## Escolha de formação da IA (`src/Domain/formation/aiFormation.ts`, puro, com teste)

```
para cada uma das 17 formações:
  XI = autoFillLineup(vagas, elenco inteiro)        // sem data: lesão e fôlego não mudam a escolha
  inelegível se o XI não fecha 11 ou tem algum titular "unsuitable" na vaga
  fit   = média de slotValue(titular, papel da vaga)
  score = fit − BASELINE[f] + PRIOR[f]
          + STYLE_BONUS (se f combina com o estilo) + jitter(clube, temporada, f) ∈ [0, JITTER)
escolhida = maior score entre as elegíveis (nenhuma elegível → 4-3-3)
```

Constantes em `src/Domain/formation/aiFormationConfig.ts` (`AI_FORMATION`):

| Constante | Valor | Papel |
|---|---|---|
| `BASELINE` | média mundial do `fit` por formação (3,78–3,83) | Tira o viés de escala dos papéis (os da linha de três pontuam ~0,03 a mais): uma formação vence porque o ELENCO combina com ela mais que a média |
| `PRIOR` | 4-3-3 / 4-2-3-1 0,03 · 4-4-2 0,02 · 4-1-4-1 / 3-5-2 / 3-4-2-1 0,015 · 4-4-1-1 0,01 · … | Formações comuns vencem os empates |
| `STYLE_BONUS` | 0,02 | `STYLE_FORMATIONS` por estilo (contra-ataque: 5-4-1, 4-5-1, 5-3-2, 4-4-1-1; pressão: 4-3-3, 4-2-3-1, 3-4-3, 4-1-2-1-2; posse: 4-3-3, 4-1-4-1, 4-2-3-1, 3-4-2-1, 4-3-2-1; jogo direto: 4-4-2, 4-4-1-1, 3-5-2, 4-2-2-2). Hoje toda IA joga `balanced` (sem bônus) |
| `JITTER` | 0,03 | Identidade do clube na temporada (`seedFrom(clube:temporada:formação)`) |
| `DEFENSIVE` / `UNDERDOG_GAP` / `UNDERDOG_MARGIN` | 5-4-1, 4-5-1, 5-3-2, 4-1-4-1 / 0,6 / 0,06 | Forma defensiva do azarão (abaixo) |

Unidades: `slotValue` médio do XI (~3,8 no mundo); o desvio do `fit` relativo entre formações de um
mesmo elenco é ~0,04.

**Penalidade de volume de gols removida (Etapa 19, 3.4):** até a 3.3 o score descontava
`OPENNESS 0,3 × (GOAL_VOLUME[f] − 1)` (volume do espelho de cada formação), porque linha de três e dois
atacantes faziam até +34% de gols no motor. Com o motor equilibrado (espelhos dentro de ±15%) a
penalidade saiu, junto com `GOAL_VOLUME` e `OPENNESS`.

- **Por temporada:** `Squad.aiFormation = { id, season, roster, level, defensive? }`
  (`AiFormationRecord`, `playerTypes.ts`), gravado no squad pelo `advanceDay` depois de cada jogo
  (`computeMatchSimulationLineups` devolve `aiFormations`). `aiFormationRecord` reaproveita o
  registro enquanto a temporada (`aiSeasonKey`: ano de início; liga de ano cruzado vira em julho, de
  ano civil em janeiro) e o elenco (`rosterSignature`, hash dos ids) forem os mesmos; senão escolhe
  de novo (virada, contratação, venda, jovem promovido). Sem migração: squad sem registro escolhe no
  primeiro jogo (~7–17 ms por clube, uma vez por temporada).
- **Azarão:** `matchdayAiFormation(registro, nívelDoAdversário)` — se o `level` do adversário (o
  `fit` da formação dele; para o clube do jogador, o melhor `fit` do elenco) passa o do clube em
  `UNDERDOG_GAP`, joga a forma defensiva guardada em `defensive` (a melhor de `DEFENSIVE` com score
  até `UNDERDOG_MARGIN` abaixo da escolhida; ausente se a escolhida já é defensiva).
- **Onde entra:** `computeMatchSimulationLineups` (liga, copa, continental, motor e quickSim — os
  papéis do quickSim saem da formação), `aiMatchFormation` em `POST /api/match-setup` (`oppFormation`
  da partida ao vivo e da prévia). `clubLevel` (continental, peso de técnicos) continua no 4-3-3 de
  propósito: é uma nota de força estável, não a escalação do dia.

### Distribuição no mundo (início 2026/27, `bun scripts/ai-formation-world.ts`)

Desde a 3.4, sem a penalidade de volume de gols (Etapa 18, com a penalidade, entre parênteses):

| Formação | clubes | % |
|---|---|---|
| 4-4-1-1 | 192 | 15,1 (16,3) |
| 4-2-3-1 | 166 | 13,0 (19,1) |
| 3-4-2-1 | 150 | 11,8 (1,3) |
| 4-3-3 | 149 | 11,7 (33,9) |
| 3-4-3 | 129 | 10,1 (0,2) |
| 4-3-2-1 | 100 | 7,9 (10,7) |
| 5-2-3 | 94 | 7,4 (6,8) |
| 4-4-2 | 76 | 6,0 (1,3) |
| 3-5-2 | 68 | 5,3 (0) |
| 5-4-1 | 42 | 3,3 (5,4) |
| 4-1-4-1 | 35 | 2,7 (1,8) |
| 4-2-2-2 | 22 | 1,7 (0,2) |
| 5-3-2 | 13 | 1,0 (0) |
| 3-4-1-2 / 4-5-1 | 12 / 12 | 0,9 / 0,9 (0,5 / 1,5) |
| 4-1-2-1-2 | 9 | 0,7 (1,0) |
| 4-3-1-2 | 4 | 0,3 (0) |

935 clubes têm forma defensiva; o azarão a usa em 5,5% dos lados de jogo de liga. Premier League:
6 5-2-3, 3 3-5-2, 2 4-1-4-1, 2 4-2-3-1, 2 4-3-3, e um de 3-4-3, 4-1-2-1-2, 4-2-2-2, 4-4-1-1 e 4-4-2.
Gols e chutes do mundo com essa distribuição: seção "Volume do mundo" acima (−4,1% gols, −2,6% chutes
no motor, as duas ligas somadas).

### Gols e chutes do mundo na Etapa 18 (histórico, com a penalidade)

Todo clube da IA no 4-3-3 ("main") × cada um na própria formação ("IA"), mesmos confrontos, fôlego
88. Motor 1600 jogos por modo: Premier 2,559 → 2,561 gols (+0,1%), Championship 1,867 → 1,851
(−0,9%); quickSim +1,3% / +4,2%. A medição de partida da Etapa 19 (800 jogos por modo, mesmo motor)
deu main 2,462 / 1,810 e IA 2,560 / 1,881 — a diferença entre as duas é o ruído do motor.

## Scripts

| Script | Faz |
|---|---|
| `scripts/formation-matrix.ts` | Matriz de formações (Etapa 19): cada formação × referências (`--refs`) e `--mirror`, clube igual dos dois lados, `--detail` com o diagnóstico, `--json`/`--sum` para somar rodadas, `--workers` (máx. 3–4 por memória). Mesmo runner da página `/matrix` do lab |
| `scripts/formation-vs-433.ts` | Cada formação × 4-3-3 (ou `--vs`, ou `--mirror`), clubes reais, workers em paralelo; `--json`/`--sum` para somar rodadas |
| `scripts/ai-formation-world.ts` | Distribuição da escolha da IA no mundo (ou `--league`) e troca do azarão |
| `scripts/ai-formation-goals.ts` | Gols/chutes por jogo, main × IA, quickSim e motor (`--modes main,ai`, `--quick 0` para só o motor) |
| `scripts/width-measure.ts` | Gols/chutes/cruzamentos e afastamento lateral com os dois times em `narrow`/`normal`/`wide` |

Ao mudar uma formação ou o motor: rode a matriz (`formation-matrix.ts --mirror`, somando rodadas até
~1200 jogos por formação) e depois `ai-formation-goals.ts` para conferir os ±5% do mundo; se o modo
main mudar, ajuste o `BASE_GOALS` do quickSim pelo mesmo fator. `BASELINE` só muda se os papéis das
vagas mudarem (as posições não entram no `fit`).

## Testes

```
bun test src/Domain/formation src/GameEngine/Domain/SetPieceLayouts.custom.test.ts \
  src/GameEngine/Domain/AttackingPositioning.test.ts src/GameEngine/Domain/DefensiveShape.test.ts \
  src/lab/formationMatrix.test.ts
```

`aiFormation.test.ts`: chave de temporada, determinismo, elenco forte atrás → cinco defensores,
três atacantes bons → três atacantes, dois centroavantes bons e pontas fracos → dois atacantes, meio
forte → cinco meias, bônus de estilo, forma defensiva só para escolha não defensiva, elencos reais da
Premier nunca com titular `unsuitable`, reaproveitamento/recálculo do registro, troca do azarão.
`SetPieceLayouts.custom.test.ts`: todos os layouts de bola parada das 17 posicionam o time inteiro.
`zones.test.ts`: as 17 viram formação livre válida. `AttackingPositioning.test.ts`: largura `normal`
mantém a vaga, `narrow`/`wide` fecham/abrem, convergência só no terço final e só para vagas de frente
(os dois sentidos de ataque). `DefensiveShape.test.ts`: o ponta do lado contrário fecha com a bola na
outra ponta. `formationMatrix.test.ts`: agregação da matriz (par contado para as duas formações,
espelho à parte) e divisão em tarefas.

## Limitações conhecidas

- **4-3-2-1 (+11,2) e 4-1-2-1-2 (+9,8) ainda acima da faixa de ±8** (erro padrão ~±2,4 com 1200
  jogos). As duas defendem com volante em x 28 e meias por dentro (sofrem 2,6–2,7 chutes contra ~2,9
  das outras). No futebol a fraqueza delas são as pontas, mas neste motor o jogo pelas pontas ainda
  rende pouco (cruzamentos ~0,06 gol por time; quase todo gol sai de condução pelo meio). Tornar o
  cruzamento/jogo de ponta mais produtivo é o próximo passo natural (mexe na calibração aérea).
- **O 4-3-3 continua a formação de menor volume** (espelho 0,86× a média, no limite dos ±15%) e um
  pouco abaixo da média em vantagem (−3,9 com média +0,7): um atacante só no meio.
- **O mundo todo no 4-3-3 perde ~7% de gols** (o bloco defende melhor); o mundo como jogado (formações
  variadas) perde ~4%. O quickSim foi reajustado pelo modo main (`BASE_GOALS` 0,78).
- **quickSim × motor por formação:** o quickSim foi calibrado só com 4-3-3 dos dois lados e não
  reproduz o volume do motor por formação; no agregado do mundo a diferença IA × main fica em +4–7%.
- **`/test` não mostra a escolha da IA** (as 17 estão nos seletores); o `/lab` tem a matriz
  (`/matrix`) com clubes reais, mas os cenários com elencos sintéticos não dizem nada sobre a escolha.
- O estilo da IA é sempre `balanced` hoje; `STYLE_FORMATIONS` só pesa quando um clube da IA tiver
  estilo próprio.
