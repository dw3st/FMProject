# A IA estuda a tática do técnico

Spec: `docs/superpowers/specs/2026-11-13-ai-tactic-study-design.md` (aprovado pelo usuário em 2026-11-13). Só IA × clube
humano. Visual: `.claude/rules/ui-standard.md`. Entrosamento: `style-training.md`; marcação individual:
`player-instructions.md`; estilos entre si: `game-engine/tactical-config.md`.

## Regra

- A IA jogava sempre no Equilibrado e nunca reagia: repetir o mesmo plano só rendia (entrosamento). Agora um clube da IA
  **lê** o plano com que o técnico humano começou os últimos jogos e, quando o plano se repete, vem preparado.
- Só clube da IA contra clube humano, na partida simulada e na ao vivo. Nunca: IA × IA, humano × humano (ninguém vê a
  leitura do outro), seleção, base, amistosos, quickSim.
- Determinístico: nenhum sorteio novo. Sem registro, a partida é idêntica à de antes (teste).
- Nenhum bônus de atributo: a IA responde só com o estilo e com uma marcação individual.
- Sem migração: `SeatState.tacticLog` ausente = nada lido.

## Registro (`SeatState.tacticLog`)

- `TacticLogEntry { date, fixtureId, formation, style, axes }` (`src/types/studyTypes.ts`): `formation` = id da formação
  (`"custom"` para a livre), `axes` = os quatro eixos efetivos (`effectiveAxes(style, axesOverride)`).
- Gravado no avanço do dia (`advanceDay.ts`, laço dos jogos) para cada jogo oficial do clube do assento (liga, copa,
  continental), simulado ou ao vivo, também entre dois assentos: vale a tática salva no início do dia (`ds.tactics`);
  trocas ao vivo não contam. Uma vez por `date` + `fixtureId` (`appendTacticLog`), só os últimos `STUDY.GAMES` (5).
- A IA lê o registro de **antes** do jogo do dia (`ds.meta.tacticLog`); o jogo do dia entra depois.
- Zera na troca de clube (`acceptJobOffer`), no pedido de demissão (`resignFromClub`) e na demissão / fim de contrato
  (`job.ended` no avanço do dia).

## Leitura (`src/Domain/study/study.ts`, constantes em `studyConfig.ts`)

```
plano esperado = moda da formação, moda do estilo, moda dos quatro eixos juntos (empate: o mais recente)
nota do jogo   = max(0, 1 − 0,5 [formação diferente] − 0,5 [estilo diferente] − 0,25 [eixos diferentes])
leitura bruta  = soma das notas / 5                      (jogo que falta conta 0)
leitura        = clamp(bruta × estudo do clube × analista, 0, 1)
```

| Fator | Valores |
|---|---|
| Estudo do clube (tier financeiro da IA, `financialTierOf`) | LOW 0,8 · MEDIUM 0,9 · HIGH 1 · ELITE 1,1 (elenco sem finanças: 1) |
| Analista de desempenho do clube humano (`effectiveStars`, `starCurve`) | 1★ 1,15 · 3★ 1 · 5★ 0,8 (vago = 2★ = 1,075) |
| Nível | `none` abaixo de 0,6 · `medium` de 0,6 a 0,85 · `high` a partir de 0,85 |

Com menos de 3 jogos no registro a leitura nunca chega a 0,6 (2 jogos × 1,1 × 1,15 = 0,51). Cinco jogos iguais contra um
clube HIGH: `high` com analista de 3★, `medium` com um de 5★.

## O que a IA faz (`aiStudyPlan`)

- **`medium` e `high`: plano de jogo.** O estilo sai de `STUDY.COUNTER[estilo esperado]`, jogado com a familiaridade da
  regra da IA (`aiFamiliarity(estilo)`: 85 no estilo que joga):

  | Estilo esperado | A IA joga |
  |---|---|
  | Equilibrado | Equilibrado (sem troca) |
  | Posse | Equilibrado (sem troca) |
  | Pressão alta | Contra-ataque |
  | Contra-ataque | Posse |
  | Jogo direto | Posse |

- **`high`: também marcação individual** (`pickMarkerSlot`, `pickMarkTarget`): a vaga CDM/CM de maior desarme do XI da
  IA (sem meia central, o zagueiro de maior desarme) marca o melhor atacante do XI do técnico (maior `slotValue` entre as
  vagas de linha de ataque; sem atacante, o melhor jogador de linha). É o `manMarks` do motor (`player-instructions.md`).
- A formação da IA não muda (a da temporada, com a forma defensiva do azarão).

## Onde entra

| Arquivo | Papel |
|---|---|
| `src/types/studyTypes.ts` | `TacticLogEntry`, `StudyLevel`, `StudyPlan`, `MatchStudy`, `MatchSetupStudy` |
| `src/Domain/study/studyConfig.ts` | Constantes (`STUDY`) |
| `src/Domain/study/study.ts` (+ teste) | Registro, plano esperado, leitura, níveis, tabela, marcador e alvo, `aiStudyPlan`, `predictability`, `matchSetupStudy` |
| `src/Domain/advanceDay/matchSimulationLineups.ts` | `studyPlanFor` (a função única), `studiedAiTactics`, `matchStudyOf`; `computeMatchSimulationLineups(..., tacticLog)` devolve `study`; `HumanMatchSide.tacticLog` |
| `src/backend/advanceDay.ts` | Grava o registro, passa o do início do dia à partida, põe `MatchEvent.study` (simulada e gravação ao vivo) |
| `src/backend/matchSetup.ts` | `study` (`MatchSetupStudy`) na resposta, só contra a IA |
| `src/Domain/match/liveMatchSetup.ts`, `src/GameInterface/MatchScreen.tsx` | Partida ao vivo: estilo e familiaridade do plano no time B, marcação (`LiveSideInput.study` + `marks`) |
| `src/GameEngine/types.ts`, `gameState.ts`, `SimulateMatch.ts`, `EventBus.ts`, `Statistics.ts` | `GameState.study`, `TeamTactics.study`, `emitStudyPlans`, evento `studyPlan`, contador de time `studyPlans` |
| `src/backend/jobWorld.ts` | Zera o registro na troca de clube e no pedido de demissão |
| `scripts/study-measure.ts` | Medição |

`MatchEvent.study = { side, level, style, marked? }` é o lado da IA. Na partida ao vivo o servidor recalcula o plano no
avanço do dia com o mesmo registro que o `match-setup` usou.

## Telas

- **Prévia** (contra a IA, `medium` ou `high`): "<clube> estudou seu time: espera <formação> em <estilo> (leitura
  média|alta)." Com analista de 4★ ou mais (`STUDY.ANALYST_HINT_STARS`), a segunda linha: "Seu analista: devem jogar em
  <estilo>" e, no nível alto, "e marcar <jogador> de perto".
- **Formação**: "Leitura dos adversários: baixa | média | alta" (`predictability`: a leitura bruta × o analista, sem o
  tier), com a ajuda "Repetir formação, estilo e instruções da equipe por vários jogos deixa o time previsível."
- **Resultado**: "<clube> veio preparado: <estilo>." quando `MatchEvent.study` existe.
- i18n `study.*`, `stats.studyPlans` (en, pt-BR).

## `/test`, `/lab`

- `/test`: cenário `studied-plan` (time A em pressão alta; time B com o estilo da tabela e a marcação no melhor atacante do
  A; o cenário escolhe os estilos dos dois seletores, `TestScenario.styles`); cabeçalho do `EnergyPanel` com
  "study: <nível> · <estilo>"; linha "Plano de jogo" no `StatsPanel`; log `instruction` no pontapé inicial.
- `/lab`: `Variant.studied` ("medium" | "high"): a OUTRA variante joga o plano contra esta (estilo da tabela com a
  familiaridade da IA e, em `high`, a marcação por vaga); só no motor completo; rótulo `· studied`;
  `TeamRawStats.preparedAgainst` (do `studyPlans` do adversário) → `preparedShare` → linha "Prepared against" no `PairDetail`.
- `Statistics.ts`: `studyPlan { team, level, style }` no pontapé inicial (`emitStudyPlans`: `matchStart` ao vivo, depois
  do `initStats` no `simulateMatch`), contador de time `studyPlans`.

## Medição (`bun scripts/study-measure.ts`, 2026-11-13)

Motor completo, pares de clubes da liga (mandos alternados), semente por jogo, a mesma nos três braços. Lado humano:
estilo X com entrosamento 100, 4-3-3, XI automático. Lado IA: a formação dela (`aiMatchFormation`), XI automático, fôlego
88 nos dois. Braço A = Equilibrado a 85 (antes), B = plano `high` (estilo da tabela + marcação), C = plano `medium` (só o
estilo). Um braço igual a outro (sem troca de estilo) é copiado, não simulado. V − D do técnico humano (pontos de
vitória = a metade):

| Premier League (300 jogos por estilo; pressão alta 600) | A | B alto | C médio | B − A | C − A |
|---|---|---|---|---|---|
| Equilibrado (IA: Equilibrado) | −2,0 | −1,3 | −2,0 | +0,7 | 0 |
| Posse (IA: Equilibrado) | +15,0 | +10,0 | +15,0 | −5,0 | 0 |
| Pressão alta (IA: Contra-ataque) | −6,8 | −5,5 | −11,5 | +1,3 | −4,7 |
| Contra-ataque (IA: Posse) | −3,0 | −16,3 | −19,7 | −13,3 | −16,7 |
| Jogo direto (IA: Posse) | −2,0 | −11,3 | −11,3 | −9,3 | −9,3 |
| Média dos estilos | | | | **−5,1** | **−6,1** |

| Championship (150 jogos por estilo) | A | B alto | C médio | B − A | C − A |
|---|---|---|---|---|---|
| Equilibrado (IA: Equilibrado) | −4,7 | +0,7 | −4,7 | +5,3 | 0 |
| Posse (IA: Equilibrado) | +14,0 | +15,3 | +14,0 | +1,3 | 0 |
| Pressão alta (IA: Contra-ataque) | +1,3 | −16,7 | −7,3 | −18,0 | −8,7 |
| Contra-ataque (IA: Posse) | −8,7 | −26,7 | −20,7 | −18,0 | −12,0 |
| Jogo direto (IA: Posse) | +4,7 | −12,7 | −12,7 | −17,3 | −17,3 |
| Média dos estilos | | | | **−9,3** | **−7,6** |

- **Custo de repetir o plano:** as duas ligas somadas (peso pelos jogos), B − A = −6,0 de V − D na média dos estilos,
  ou seja **3,0 pontos de vitória** (meta 2 a 4); C − A = −6,5 (3,3 pontos). Limiares e multiplicadores não mudaram.
- **Tabela `COUNTER`:** as três trocas deixam a IA melhor que no Equilibrado na soma (C − A: pressão alta → contra-ataque
  −5,5 em 750 jogos; contra-ataque → posse −15,1 e jogo direto → posse −12,0 em 450). Nenhuma entrada mudou.
- **Marcação:** na média não muda o resultado (B − C: +2,2 / −2,9 / +2,9 / +0,2 / 0 por estilo, média +0,5). O nível
  alto vale pelo plano de estilo; a marcação tira um jogador do técnico do jogo, não pontos.
- **Ruído:** o motor carrega estado entre partidas e os braços divergem no primeiro lance, então a mesma semente quase
  não reduz a variância: uma célula de 300 jogos varia cerca de ±7 de V − D (as duas rodadas de 300 da pressão alta na
  Premier deram C − A −17,0 e +7,7). Só as médias valem.
- Gols por jogo na Premier A / B / C: 2,19 / 2,09 / 2,12 (primeira rodada); Championship 1,78 / 1,88 / 1,78.
- **IA × IA:** idêntico por construção (`computeMatchSimulationLineups` devolve o mesmo objeto com ou sem registro: teste).
  O volume do mundo não muda: só os jogos contra um clube humano previsível.

```
bun scripts/study-measure.ts premier_league 300 --part 0/3 --out a.json     # até 3 processos em paralelo
bun scripts/study-measure.ts --sum a.json,b.json,c.json
bun scripts/study-measure.ts premier_league 300 --styles high_press --salt s2   # outras sementes da mesma célula
bun scripts/study-measure.ts premier_league 300 --counter high_press=possession # testar outra tabela
```

## Testes

```
bun test src/Domain/study src/Domain/advanceDay/matchSimulationLineups.test.ts src/backend/study.advanceDay.test.ts \
  src/i18n/study.keys.test.ts src/lab
```

- `study.test.ts`: registro (uma vez, cinco), moda e desempate, notas, menos de 3 jogos, tier, analista, níveis, tabela,
  marcador e alvo, plano por nível, dica do analista.
- `matchSimulationLineups.test.ts`: IA × IA inalterado (com ou sem registro), humano × IA com leitura alta ganha estilo e
  `manMarks`, dois assentos sem plano.
- `study.advanceDay.test.ts`: `match-setup` devolve `study` contra a IA e nunca contra outro assento; depois do dia o
  registro tem o jogo uma vez e fica em 5, o log do dia tem `study` só no jogo do clube humano, e o pedido de demissão zera.

## Limitações

- Formação e eixos só contam na leitura: a IA responde só ao estilo e com a marcação.
- Trocas ao vivo (tática, mentalidade, formação) não entram no registro, e a IA não muda o plano durante a partida.
- O técnico que joga Equilibrado ou Posse não sofre troca de estilo: no nível alto só a marcação.
- Na partida ao vivo o marcador é escolhido no servidor pelo XI provável da IA; a vaga marca quem estiver nela.
- A leitura não distingue competição: um time alternativo na copa entra no mesmo registro.
- O `/lab` escolhe marcador e alvo pelo XI automático das variantes (o motor do lab escala por conta própria).
