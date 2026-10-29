# Treino da base

Pedido do usuário (2026-10-28): a base não tem treino que se veja nem que se escolha. Escopo aprovado: completo
(intensidade, foco do grupo, foco por jogador, posição de treino, evolução recente na tabela).

## Hoje

`developYouthSeason` aplica 240 sessões "normal" de uma vez na virada do país do clube do jogador
(`YOUTH.SESSIONS_PER_SEASON`, dividido por `GROWTH_DP_SCALE` porque o progresso da base nunca é zerado). No resto do
ano a base só recupera fôlego (`restAcademy`) e evolui nos jogos de base.

## Regra nova (só o clube do jogador; a IA não tem base)

- **Treino diário:** em todo dia de treino do clube (`buildTrainingEvent`), cada jovem da base que não jogou base no dia,
  não está lesionado e tem fôlego ≥ 40 treina uma sessão (`trainAcademy`). Folga e dia de jogo do clube: recupera como
  hoje (`restAcademy`).
- **Ritmo igual ao de hoje no padrão:** DP da sessão = sessão "normal" × `SESSION_MULT` (240 / `SESSIONS_PER_YEAR` 200)
  / `GROWTH_DP_SCALE` × intensidade × `PACE_CORRECTION` 1,08 × os fatores de hoje (auxiliar, áreas, renascido, profissionalismo,
  atributo Base do técnico). A virada deixa de aplicar as 240 sessões para o clube do jogador (só a idade).
- **Intensidade** (`YouthTrainingPlan.intensity`): leve × 0,7 de DP e fôlego −1; normal × 1 e −3; pesado × 1,3, −6 e a
  chance de lesão do treino pesado do time principal (`trainingInjuryChance("heavy")`).
- **Foco** (do grupo, `focus`; por jogador, `players[id].focus`, que vence): equilibrado ou uma área (goleiros, defesa,
  ataque, técnica, tática, físico, bola parada = as 7 categorias de DP). A categoria escolhida tem o peso × 1,8 e os
  pesos são renormalizados para somar 1: o total de DP não muda, só para onde vai. Um foco cujo peso de base é 0 na
  posição (goleiros num atacante) recebe 0,25 antes da renormalização.
- **Posição de treino** (`players[id].position`, uma das 14): os pesos de DP vêm dessa posição (`roles.json`) em vez da
  natural. A aptidão já é derivada dos atributos, então ela muda sozinha com o tempo.
- **Evolução recente:** toda segunda o overall de cada jovem vai para `RosterPlayer.youthTrend` (últimas 5 segundas); a
  tabela mostra a diferença para 4 semanas atrás.

## Dados e rotas

- `Squad.youthTraining?: { intensity, focus, players?: Record<id, { focus?, position? }> }`; ausente = normal,
  equilibrado. Some no `releaseHumanClub` (como `youth`) e nos kits (`stripHumanOnly`).
- `GET /api/saves/:id/youth` passa a trazer `training` e, por jovem, `trend` (diferença de overall em 4 semanas ou null).
- `PUT /api/saves/:id/youth/training { intensity, focus, players }` (dono, `withSaveLock`; livre no lobby, como a tática): valida
  enums, ids da base e posições; jogadores que saíram da base são descartados; 400 `invalidTraining`, 409 `noClub`.

## Tela (Elenco → Base)

Bloco "Treino da base" acima da tabela: intensidade (`OptionChips` Leve / Normal / Pesado) e foco do grupo
(`OptionChips`), uma linha do efeito. Na tabela, colunas "Foco" e "Posição de treino" (seletores compactos, "Grupo" /
"Natural" como padrão) e "4 sem." (`+0,4`, verde/vermelho).

## Medição

`bun scripts/youth-training-pace.ts`: um jovem de 16 anos por um ano de 200 sessões normais deve terminar a ±5% do
`developYouthSeason` de hoje; leve / pesado ~× 0,7 / × 1,3; foco técnica concentra a evolução em drible.

## Limitações

- Sem treino individual de intensidade por jogador.
- A posição de treino não muda a posição natural cadastrada (só os atributos).

## Time principal (pedido do usuário no mesmo dia)

O foco e a posição de treino por jogador também valem para o elenco principal (`Squad.playerTraining`), na tela
Desenvolvimento. Só no treino; a DP de partida não muda.
