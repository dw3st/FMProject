# A IA estuda a tática do técnico (12.3)

Aprovado pelo usuário em 2026-11-13 (proposta de 2026-11-09). Só IA × clube humano; entre dois técnicos humanos nada
muda e ninguém vê a leitura do outro.

## Problema

A IA joga sempre no Equilibrado e nunca reage. Repetir o mesmo plano todo jogo só rende (entrosamento), nunca custa.

## Regra

### Registro

- `SeatState.tacticLog?: TacticLogEntry[]` (opcional, sem migração): o plano com que o técnico **começou** cada um dos
  últimos `STUDY.GAMES` (5) jogos oficiais do clube (liga, copa, continental; nunca seleção, base, amistoso):
  `{ date, formation, style, axes }`, com `formation` = id da formação (`"custom"` para a livre) e `axes` = os quatro
  eixos efetivos (`effectiveAxes(style, axesOverride)`).
- Gravado no avanço do dia para cada jogo oficial do clube do assento jogado no dia (simulado ou ao vivo: vale a
  tática salva no início do dia; trocas ao vivo não contam). Idempotente por `date` + id do jogo. Zera na troca de
  clube e na demissão.

### Leitura (pura, `src/Domain/study/study.ts`, constantes em `studyConfig.ts`)

- Plano esperado = a moda de `formation`, a moda de `style` e a moda de `axes` (os quatro juntos) nos jogos do
  registro; empate: o mais recente.
- Nota de cada jogo = `max(0, 1 − 0,5 × [formação diferente] − 0,5 × [estilo diferente] − 0,25 × [eixos diferentes])`.
- `leitura bruta = soma das notas / 5` (jogo que falta conta 0: com menos de 3 jogos nunca chega ao limiar).
- `leitura = clamp(bruta × estudo do clube × analista, 0, 1)`:
  - estudo do clube pelo tier financeiro da IA: LOW 0,8 · MEDIUM 0,9 · HIGH 1 · ELITE 1,1;
  - analista de desempenho do clube humano (`staffEffectsOf`, curva de estrelas): 1★ 1,15 · 3★ 1 · 5★ 0,8; vago = 2★.
- Nível: `none` abaixo de 0,6 · `medium` de 0,6 a 0,85 · `high` a partir de 0,85.
- Determinístico: nenhum sorteio novo.

### O que a IA faz

- `medium` e `high`: **plano de jogo**. O estilo da IA sai de `STUDY.COUNTER[estilo esperado]`:
  pressão alta → contra-ataque; contra-ataque → posse; jogo direto → posse; equilibrado e posse → equilibrado (sem troca).
  A IA joga o plano com a familiaridade da regra dela (`aiFamiliarity(estilo do plano)`: 85 no estilo que joga).
  Tabela tirada da matriz de estilos medida (8.8.33) e conferida pela medição abaixo: uma troca que não rende sai.
- `high`: também **marcação individual**: um meia central da IA (a vaga CDM/CM de maior desarme do XI; sem meia
  central, o zagueiro de maior desarme) marca o melhor atacante do XI do técnico (maior nota entre as vagas de linha
  de ataque; sem atacante, o melhor jogador de linha). Mesmo mecanismo de `manMarks` do motor.
- A formação da IA não muda (a da temporada, com a forma defensiva do azarão).
- Nenhum bônus de atributo.

### Onde vale

- Partida simulada (`computeMatchSimulationLineups`, caminho humano × IA) e partida ao vivo (`match-setup` devolve o
  plano da IA; o `MatchScreen` aplica ao time B). O mesmo cálculo nos dois (uma função só).
- Nunca: IA × IA, humano × humano (`computeSeatedMatchLineups`), seleção, base, quickSim, amistosos.

## Telas

- **Prévia** (jogo contra a IA, nível `medium` ou `high`): uma linha de aviso
  "O <clube> estudou seu time: espera <formação> em <estilo> (leitura média|alta)."
  Com analista de 4★ ou mais, uma segunda linha com o que o adversário deve fazer:
  "Seu analista: devem jogar em <estilo>" e, no nível alto, "e marcar <jogador> de perto".
- **Formação**: uma linha no painel de tática: "Leitura dos adversários: baixa | média | alta" (a leitura bruta × o
  analista, sem o tier), com o texto de ajuda "Repetir formação, estilo e instruções da equipe por vários jogos deixa
  o time previsível."
- **Resultado / log do dia:** `MatchEvent.study?: { side: "home"|"away"; level; style; marked?: string }` (o lado da IA).
  A tela de resultado mostra "O <clube> veio preparado: <estilo>" quando houve.
- i18n `study.*` (en, pt-BR). Sem emoji.

## `/test`, `/lab`, estatística

- `/test`: cenário `studied-plan` (time B com o plano contra o estilo do time A e a marcação no atacante do A);
  cabeçalho do `EnergyPanel` com "study: <nível> · <estilo>".
- `/lab`: `Variant.studied?: "medium" | "high"` (a outra variante joga o plano contra esta); rótulo `· studied`;
  `TeamRawStats.preparedAgainst` (jogos em que o adversário veio com plano) → `preparedShare` → linha no `PairDetail`.
- `Statistics.ts`: evento `studyPlan { team, level, style }` emitido no início da partida pelo lado que tem plano
  (via `TeamTactics.study`), contador de time `studyPlans`.

## Medição (`scripts/study-measure.ts`)

Motor completo, Premier League e Championship, pares de clubes da liga (mandos alternados), semente por jogo, o mesmo
`Math.random` nos dois braços. Lado humano: estilo X com entrosamento 100, formação 4-3-3. Lado IA: formação da IA,
braço A = Equilibrado 85 (hoje), braço B = plano de nível `high`, braço C = plano `medium` (sem marcação).
Para cada um dos 5 estilos do humano: vitória − derrota do humano em A, B e C.

Metas:
- repetir o plano (nível `high`) custa ao técnico de 2 a 4 pontos de vitória (4 a 8 de V − D) na média dos estilos;
- nenhuma troca de estilo da tabela `COUNTER` deixa a IA pior que no Equilibrado (se deixar, vira "sem troca");
- IA × IA: idêntico (teste com a mesma semente).

Fora da meta: ajustar os limiares e os multiplicadores, nunca criar bônus de atributo.

## Testes

- `src/Domain/study/study.test.ts`: moda e desempate, notas, menos de 3 jogos, tier, analista, níveis, tabela, escolha
  do marcador e do alvo.
- `matchSimulationLineups.test.ts`: IA × IA inalterado; humano × IA com leitura alta ganha estilo e `manMarks`.
- Avanço do dia: o registro entra uma vez por jogo, fica em 5, zera na troca de clube.
- Rota `match-setup`: devolve `study` contra a IA e nunca contra outro assento.

## Limitações

- Os eixos e a formação só contam na leitura; a IA responde só ao estilo e com a marcação.
- Trocas ao vivo não entram no registro.
- A IA não muda o plano durante a partida.
