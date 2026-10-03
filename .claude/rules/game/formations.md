# Formações (17 prontas) e escolha de formação da IA

Etapa 18 do `docs/ROADMAP.md` (#59). Formação livre (zonas, `custom`): `.claude/rules/tatics.md` →
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
alas/meias (ala 48, CAM 82) não mudou nada. As 10 antigas não foram tocadas.

## Equilíbrio contra o 4-3-3 (`scripts/formation-vs-433.ts`)

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

Em negrito as novas (as de linha de três já com os zagueiros em 22/37/52). As 10 antigas vão de
−8,3 (3-4-3) a +18,1 (4-2-2-2); as novas ficam de +1,0 a +22,5, dentro da faixa das antigas com a
folga de ±8 p.p. combinada. O 4-3-3 é a formação mais fraca contra quase todas — isso já existia
antes da etapa e não foi mexido (seria constante global do motor).

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

Linha de três e dois atacantes chutam bem mais (3,6–4,1 chutes por time contra 2,8 do 4-3-3). É
isso que a escolha da IA precisa controlar (abaixo).

## Escolha de formação da IA (`src/Domain/formation/aiFormation.ts`, puro, com teste)

```
para cada uma das 17 formações:
  XI = autoFillLineup(vagas, elenco inteiro)        // sem data: lesão e fôlego não mudam a escolha
  inelegível se o XI não fecha 11 ou tem algum titular "unsuitable" na vaga
  fit   = média de slotValue(titular, papel da vaga)
  score = fit − BASELINE[f] + PRIOR[f] − OPENNESS × (GOAL_VOLUME[f] − 1)
          + STYLE_BONUS (se f combina com o estilo) + jitter(clube, temporada, f) ∈ [0, JITTER)
escolhida = maior score entre as elegíveis (nenhuma elegível → 4-3-3)
```

Constantes em `src/Domain/formation/aiFormationConfig.ts` (`AI_FORMATION`):

| Constante | Valor | Papel |
|---|---|---|
| `BASELINE` | média mundial do `fit` por formação (3,78–3,83) | Tira o viés de escala dos papéis (os da linha de três pontuam ~0,03 a mais): uma formação vence porque o ELENCO combina com ela mais que a média |
| `PRIOR` | 4-3-3 / 4-2-3-1 0,03 · 4-4-2 0,02 · 4-1-4-1 / 3-5-2 / 3-4-2-1 0,015 · 4-4-1-1 0,01 · … | Formações comuns vencem os empates |
| `GOAL_VOLUME` / `OPENNESS` | tabela do espelho acima / 0,3 | Formação aberta só quando o elenco claramente combina com ela — mantém os gols do mundo |
| `STYLE_BONUS` | 0,02 | `STYLE_FORMATIONS` por estilo (contra-ataque: 5-4-1, 4-5-1, 5-3-2, 4-4-1-1; pressão: 4-3-3, 4-2-3-1, 3-4-3, 4-1-2-1-2; posse: 4-3-3, 4-1-4-1, 4-2-3-1, 3-4-2-1, 4-3-2-1; jogo direto: 4-4-2, 4-4-1-1, 3-5-2, 4-2-2-2). Hoje toda IA joga `balanced` (sem bônus) |
| `JITTER` | 0,03 | Identidade do clube na temporada (`seedFrom(clube:temporada:formação)`) |
| `DEFENSIVE` / `UNDERDOG_GAP` / `UNDERDOG_MARGIN` | 5-4-1, 4-5-1, 5-3-2, 4-1-4-1 / 0,6 / 0,06 | Forma defensiva do azarão (abaixo) |

Unidades: `slotValue` médio do XI (~3,8 no mundo); o desvio do `fit` relativo entre formações de um
mesmo elenco é ~0,04.

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

| Formação | clubes | % |
|---|---|---|
| 4-3-3 | 432 | 33,9 |
| 4-2-3-1 | 243 | 19,1 |
| 4-4-1-1 | 208 | 16,3 |
| 4-3-2-1 | 136 | 10,7 |
| 5-2-3 | 86 | 6,8 |
| 5-4-1 | 69 | 5,4 |
| 4-1-4-1 | 23 | 1,8 |
| 4-5-1 | 19 | 1,5 |
| 4-4-2 | 17 | 1,3 |
| 3-4-2-1 | 16 | 1,3 |
| 4-1-2-1-2 | 13 | 1,0 |
| 3-4-1-2 | 7 | 0,5 |
| 3-4-3 / 4-2-2-2 | 2 / 2 | 0,2 / 0,2 |
| 3-5-2 / 4-3-1-2 / 5-3-2 | 0 | 0 |

953 clubes têm forma defensiva; o azarão a usa em 5,8% dos lados de jogo de liga (12,3% na
Championship). Premier League: 8 4-3-3, 8 4-2-3-1, 2 4-1-4-1, 1 4-1-2-1-2, 1 4-4-1-1.
Sem a penalidade de volume de gols (`OPENNESS` 0, e ainda com as novas de linha de três nos
zagueiros 18/37/56) a escolha espalhava bem mais (4-4-1-1 15%, 3-4-2-1 12%, 3-4-3 10%, 3-5-2 5%), mas
os gols do motor subiam **+15,8%** (Premier) e **+12,3%** (Championship): linha de três e dois atacantes são estruturalmente mais abertos neste motor. Por
isso as formações de dois atacantes e de linha de três (salvo 5-2-3/5-4-1, mais fechadas) são raras
na IA: só um elenco que combina muito com elas as escolhe.

### Gols e chutes do mundo (`bun scripts/ai-formation-goals.ts`)

Todo clube da IA no 4-3-3 ("main", como antes) × cada um na própria formação ("IA"), mesmos
confrontos, fôlego 88, estilo equilibrado. quickSim pareado (mesma semente), 20 000 jogos; motor
1600 jogos por modo (duas rodadas de 800 somadas).

| Liga | modo | gols main | gols IA | Δ gols | chutes main | chutes IA | Δ chutes |
|---|---|---|---|---|---|---|---|
| premier_league | quickSim | 2,723 | 2,757 | +1,3% | 7,02 | 7,06 | +0,5% |
| of_championship | quickSim | 1,702 | 1,774 | +4,2% | 5,10 | 5,26 | +3,1% |
| premier_league | motor | 2,559 | 2,561 | +0,1% | 5,97 | 5,97 | −0,1% |
| of_championship | motor | 1,867 | 1,851 | −0,9% | 5,12 | 5,27 | +2,9% |

Tudo dentro de ±5%. Ruído do motor por modo ~±2,5% (Premier) e ~±3% (Championship).

## Scripts

| Script | Faz |
|---|---|
| `scripts/formation-vs-433.ts` | Cada formação × 4-3-3 (ou `--vs`, ou `--mirror`), clubes reais, workers em paralelo; `--json`/`--sum` para somar rodadas |
| `scripts/ai-formation-world.ts` | Distribuição da escolha da IA no mundo (ou `--league`), troca do azarão e volume de gols esperado (aproximação pelos espelhos) |
| `scripts/ai-formation-goals.ts` | Gols/chutes por jogo, main × IA, quickSim e motor |

Ao mudar uma formação ou o motor: rode `--mirror` para atualizar `GOAL_VOLUME` e depois
`ai-formation-goals.ts` para conferir os ±5%. `BASELINE` só muda se os papéis das vagas mudarem
(as posições não entram no `fit`).

## Testes

```
bun test src/Domain/formation src/GameEngine/Domain/SetPieceLayouts.custom.test.ts
```

`aiFormation.test.ts`: chave de temporada, determinismo, elenco forte atrás → cinco defensores,
três atacantes bons → três atacantes, dois centroavantes bons e pontas fracos → dois atacantes, meio
forte → cinco meias, bônus de estilo, forma defensiva só para escolha não defensiva, elencos reais da
Premier nunca com titular `unsuitable`, reaproveitamento/recálculo do registro, troca do azarão.
`SetPieceLayouts.custom.test.ts`: todos os layouts de bola parada das 17 posicionam o time inteiro.
`zones.test.ts`: as 17 viram formação livre válida.

## Limitações conhecidas

- **O 4-3-3 perde para quase tudo** (tabela acima) e é a formação de menor volume de gols. É do
  motor, não desta etapa; mexer seria ajuste de constante global.
- **quickSim × motor por formação:** o quickSim foi calibrado só com 4-3-3 dos dois lados. Por
  formação ele não reproduz o volume do motor (ex.: 5-4-1 é fechada no quickSim e aberta no motor);
  no agregado do mundo a diferença fica em +1–4%.
- **`/test` e `/lab` não mostram a escolha da IA:** os dois escolhem a formação de cada lado à mão
  (as 17 estão nos seletores). Os elencos sintéticos do `/lab` não dizem nada sobre a escolha.
- O estilo da IA é sempre `balanced` hoje; `STYLE_FORMATIONS` só pesa quando um clube da IA tiver
  estilo próprio.
