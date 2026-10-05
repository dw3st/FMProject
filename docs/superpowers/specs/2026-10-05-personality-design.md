# Etapa 26 — Personalidade dos jogadores — Design

Data: 2026-10-05. Status: **proposta** (decisões abertas no fim). Versão **4.2**.
Depende de: moral (Etapa 23, `morale.md`), contratos (Etapa 7), negociação (Etapa 21), disciplina (Etapa 12),
base e renascido (Etapas 11/11b), staff/olheiro (Etapa 10). Medição no molde de `style-training.md` e `morale.md`.

## Regra geral

- Quatro traços, escala interna **1..20** (inteiros): **ambição**, **lealdade**, **profissionalismo**, **temperamento**
  (20 = cabeça quente). Ver decisão D1 sobre um 5º traço.
- **Derivados, não gravados:** `personalityOf(player)` calcula os traços de forma determinística a partir do id
  (`seedFrom("personality:<id>:<traço>")`). Nada muda no mundo importado, nos kits nem nos saves — **sem migração**,
  e o mesmo jogador tem a mesma personalidade em qualquer carreira. Jovens da base (`generateIntake`, ids novos) já
  saem com personalidade pelo próprio id; o **renascido** herda a do original (`reborn.fromId`).
- `RosterPlayer.personality?: Personality` opcional só como **override** (testes, futuros dados curados de craques);
  o jogo nunca o grava.
- **Traço neutro = 10,5** (média da distribuição). Todo efeito é linear em `t = (v − 10,5) / 9,5` ∈ [−1, 1] e é **0 em
  t = 0**; a distribuição é simétrica, então a média mundial de cada multiplicador é 1 — a calibração do mundo
  (evolução, faltas, cartões) não se desloca por construção, e a medição confere.
- Visível como **faixa em texto** (5 faixas), nunca o número (decisão D2). O próprio clube vê exato; os demais passam
  pela incerteza do olheiro (§6).
- **IA:** sem moral (como na Etapa 23); a personalidade age nela só por **regras** (evolução, disciplina, renovação,
  mercado) — nada é gravado nem simulado por clube.

## 1. Geração (`src/Domain/personality/personality.ts`)

```
bruto(traço) = (u1 + u2 + u3) / 3          // 3 hashes uniformes → distribuição em sino
v = 1 + round(bruto × 19)                  // 1..20, média 10,5, ~68% entre 7 e 14
lealdade = round(0,75 × v_lealdade + 0,25 × (21 − v_ambição))   // leve anticorrelação ambição × lealdade
```

Sem correlação com idade, posição ou nota (decisão D4). Faixas: 1–4 **muito baixo**, 5–8 **baixo**, 9–12 **médio**,
13–16 **alto**, 17–20 **muito alto**. Rótulos por traço (i18n), ex. temperamento: "Muito calmo … Cabeça quente";
profissionalismo: "Desleixado … Exemplar". Um **resumo** de uma palavra para a ficha e o cartão (ex. "Profissional",
"Ambicioso", "Ídolo leal", "Pavio curto", "Equilibrado") a partir do traço mais distante de 10,5.

## 2. Dados e módulos

| Arquivo | Papel |
|---|---|
| `src/types/personalityTypes.ts` | `Personality { ambition, loyalty, professionalism, temperament }`, `PersonalityTrait`, `TraitBand` |
| `src/Domain/personality/personalityConfig.ts` | Todas as constantes (`PERSONALITY`): pesos de cada efeito, faixas, ruído do olheiro |
| `src/Domain/personality/personality.ts` (+ teste) | `personalityOf`, `traitT`, `traitBand`, `summaryTrait`, `obscurePersonality`, multiplicadores puros (`professionalismDpMult`, `temperamentFoulMult`, `temperamentCardMult`, `moraleVolatility`, `ambitionDemandMult`, `loyaltyRenewalMult`, `refusesSmallerClub`, `sellPush`) |
| `src/GameEngine/Configs/PersonalityMatchConfig.ts` | Override de temperamento por time (`/test`, `/lab`), como `MoraleConfig.ts` |

Ninguém fora de `personality.ts` lê os traços crus: os consumidores chamam os multiplicadores.

## 3. Efeitos

### 3.1 Evolução (todo o mundo) — profissionalismo

- `professionalismDpMult = 1 + 0,08 × t` (×0,92 … ×1,08), multiplicando a DP de **partida** (`matches.ts`), de
  **treino** (`dailyTraining.ts`) e da **base** (`developYouthSeason`), ao lado de staff, CT, renascido e moral.
- Declínio por idade (`ageDecay` do `PlayerDevelopment`) × `1 − 0,10 × t`: o exemplar segura um pouco mais a forma
  depois dos 30 (decisão D3: incluir ou não).
- No clube do jogador, profissional (t ≥ 0,4) **não perde DP por moral baixa** (o `moraleDpMult` < 1 vira 1); o
  bônus de muito feliz continua.
- Tamanho escolhido para ficar menor que o CT (±5–10%) e o staff (−10..+15%): ao longo de 4 temporadas, um jovem
  exemplar × desleixado deve abrir **~0,2–0,4 de overall** (alvo de medição, §8).

### 3.2 Disciplina (motor e quickSim) — temperamento

- **Motor** (`Fouls.ts`): `FoulContext.temperament` (t do infrator) → `foulChance × (1 + 0,35 × t)`;
  `CardContext.temperament` → amarelo × `(1 + 0,20 × t)`, vermelho direto × `(1 + 0,40 × t)`. Fora isso nada muda
  (base, ângulo, agressividade da tática). `GamePlayer.temperament` (t) é preenchido na montagem do titular e do
  banco (`gameState.ts`), lido pelo override de time quando houver.
- **quickSim** (`rollDiscipline`): peso de quem comete a falta × `(1 + 0,35 × t)`; `YELLOW_PER_FOUL` e
  `DIRECT_RED_PER_FOUL` do infrator sorteado × os mesmos fatores do motor. O número de faltas por lado continua
  Poisson(`FOULS_PER_SIDE`), mas multiplicado pela média dos fatores do XI (normalizada pela média mundial, ver
  abaixo) para o time de cabeças quentes fazer mais faltas também no quickSim.
- **Volume do mundo:** a média de `t` é 0, mas o cartão é condicionado a quem faz falta (cabeça quente faz mais e
  leva mais cartão por falta), o que puxa amarelos para cima ~1–2%. Se a medição sair de **±5%** (faltas, amarelos,
  vermelhos, motor e quickSim), um fator de normalização `TEMPERAMENT_CARD_NORM` em `FoulConfig`/`QuickSimConfig`
  divide o termo pela média medida — nunca mexendo nas bases calibradas.
- Sem nova estatística em `Statistics.ts` (faltas e cartões já existem).

### 3.3 Moral (só o clube do jogador; IA sem moral, como hoje)

Em `moraleDay`/`answerTalk`, com `t` de cada traço:

| Traço | Efeito |
|---|---|
| Temperamento | Volatilidade: todo delta de evento × `1 + 0,25 × t` (resultado, minutos, promessas, listado, conversa). A deriva semanal não muda |
| Ambição | Déficit de minutos × `1 + 0,3 × t`; pedido de transferência abaixo de `25 + 8 × t`; `wants_move` dispara com moral < `60 + 10 × t`, e proposta de clube mais forte só dispara com ambição ≥ 13 (hoje dispara sempre) |
| Lealdade | Listado sem pedir × `1 + 0,5 × t` (o leal sente mais); promessa quebrada × `1 − 0,3 × t` (perdoa mais); leal (≥ 15) nunca pede transferência por moral, só por promessa quebrada; `wants_move` exige moral < 40 |
| Profissionalismo | Ver 3.1 (ignora a perda de DP por moral baixa) e "cobrar" funciona com contente **ou** profissional (≥ 13) (+1 em vez de −3) |

### 3.4 Contratos e negociação

- **Pedido de salário** (`contractDemand`, humano e IA): × `ambitionDemandMult = 1 + 0,08 × t` (o ambicioso pede até
  8% a mais, o acomodado 8% a menos) × `loyaltyRenewalMult` **só na renovação no próprio clube**:
  `1 − 0,10 × max(0, t_lealdade) × min(1, temporadas no clube / 4)` (temporadas pelo `history`).
- **Desconto de compatriota** (decisão D5, recomendação: incluir): contratação (compra ou livre) por clube do país da
  nacionalidade dele: × `1 − 0,05 × max(0, t_lealdade)`.
- **Ambição × clube menor** (`refusesSmallerClub`): na compra pelo humano e na contratação de livre, compara o
  **tier natural** (LOW..ELITE pela receita, o mesmo de `transferBudgetTierOf`) do clube comprador com o atual
  (livre: o último clube no `history`). Cada degrau abaixo soma `+10% × max(0, t)` ao pedido; com ambição ≥ 17 e
  2+ degraus abaixo, recusa (`400 { error: "smallerClub" }`, traduzido). Vale também para a IA comprando
  (`findCandidates` pula o candidato que recusaria), o que segura craques ambiciosos longe de clubes pequenos.
- **Vendedor IA** (`saleDecisionScore`, regra): `+ 0,10 × t_ambição` quando o comprador tem tier maior (o jogador
  força a saída), `− 0,10 × max(0, t_lealdade)` sempre (o leal "não quer sair"). Vale para IA × IA e para as ofertas
  do humano (contraproposta já usa o mesmo score).
- **IA renovando** (`aiShouldRenew`): o pedido já sai ajustado por ambição/lealdade; nada além disso. O leal custa
  menos na folha, o ambicioso mais — efeito pequeno na distribuição de contratação (medir, §8).

## 4. Motor: `/test` e `/lab` (o efeito toca a partida)

- **`/test`:** seletor "Temperamento" por time (Elenco = cada um com o seu, ou 1/5/10/15/20 para o time todo, via
  `PersonalityMatchConfig`); `EnergyPanel` mostra temperamento médio do time e o multiplicador de falta; o log de
  debug `foul`/`card` ganha `tempMult` no `meta`; cenário `hothead` (`TestCases.ts`): time A em 20 com `high_press`
  contra B em 1, para ver faltas/cartões. O painel QuickSim recebe o override.
- **`/lab`:** `Variant.temperament?: number` (slider 1..20, ausente = o próprio de cada jogador) → override no motor e
  no quickSim; rótulo `· tmp N`; `TeamRawStats.temperament` → `balanceWorker` → `PerMatchView`/`VariantSummary`
  (`avgTemperament`) → linha "Temperament" no `PairDetail`, ao lado das linhas de faltas e cartões já existentes.
- `Statistics.ts`: nada novo (faltas/cartões já alimentam `StatsPanel` e `simulateMatch`).

## 5. Telas (`ui-standard.md`)

- **Ficha do jogador** (`PlayerScreen`): bloco "Personalidade" (título de seção) com as 4 linhas: rótulo
  (`font-display` 13px) + faixa em texto `text-sm` + barra de 5 segmentos (trilho `bg-border`, preenchido
  `bg-primary`); o resumo em uma palavra ao lado do nome. De outro clube: faixa com `~` e "olheiro: incerto" quando o
  ruído ≥ 0,5; traço desconhecido como "?" (§6).
- **Elenco:** sem coluna nova (tabela já densa); o resumo aparece no tooltip do nome e o filtro "Só insatisfeitos" fica.
- **Olheiro:** chip de filtro "Profissionais" e "Calmos" (decisão D6, opcional), filtrando pela faixa **vista**.
- **Renovação/contratação** (`ContractTermsFields`): linha explicando o pedido ("Leal ao clube: −7%", "Ambicioso: quer
  um clube maior, +10%"); recusa `smallerClub` traduzida.
- **Conversa** (`TalkModal`): uma linha de dica pela personalidade ("Pavio curto: reage forte a uma recusa").
- i18n `personality.*` (traços, faixas, resumos, dicas), `contracts.refusal.smallerClub` — en e pt-BR. `bun run
  ui:audit` limpo.

## 6. Olheiro

`obscurePersonality(p, scoutNoise, saveId)`: cada traço + `round(scoutNoise × 4 × signedNoise(save:jogador:traço))`,
limitado a 1..20 (ruído do olheiro 0 … 1,5 → até ±6 pontos, mesma semente das notas). Com `scoutNoise ≥ 1`,
temperamento e profissionalismo aparecem como "?" (não dá para saber de longe). Aplicado só nas respostas de tela
(`scout-search`, `GET /squad/...?scouted=1`), nunca no motor nem no avanço do dia — mesma regra do `obscurePlayer`.
Os pedidos de salário/recusas da negociação usam o valor real (o jogador sabe quem é; a tela só explica com a faixa vista).

## 7. Rotas

Nenhuma rota nova: `personality` (faixas, já obscurecidas quando é de fora) entra na resposta do elenco/jogador e da
busca do olheiro; `GET .../players/:id/demand` passa a devolver as partes do pedido (`ambition`, `loyalty`,
`compatriot`, `smallerClub`, `refuses`).

## 8. Medições (critério de pronto)

| # | O quê | Como | Alvo |
|---|---|---|---|
| M1 | Faltas, amarelos, vermelhos do mundo | `bun scripts/fouls-calibrate.ts` antes × depois (PL + Championship, 1200+ jogos somados) e `quicksim-spread.ts extras` nas 26 ligas | cada um **±5%** do antes, motor e quickSim |
| M2 | Efeito do temperamento | novo `scripts/personality-measure.ts discipline`: time todo em 20 × 1 (override, mesmo clube dos dois lados, 800 jogos) | faltas do lado 20 ~1,5–2× as do lado 1; cartões idem; gols/chutes ±3% (o tiro livre a mais não deve virar enxurrada de gols) |
| M3 | Evolução do mundo | `personality-measure.ts dev`: `contracts-sim`-like de 3 temporadas com e sem o fator | média de overall por faixa etária ±0,05 do sem; exemplar × desleixado (≤ 21 anos) +0,2–0,4 em 4 temporadas |
| M4 | Mercado e contratos da IA | `bun scripts/contracts-sim.ts 3` antes × depois | transferências por temporada ±10%; estados `open` ≥ 90% por tier (como hoje); elenco médio ±0,5 |
| M5 | Moral do humano | smoke | pedidos de conversa por temporada na mesma ordem de grandeza (0,5–2× do antes) |

Se M1 falhar: normalizador (§3.2). Se M3 deslocar a média: ajustar só o peso, nunca as curvas de DP.

## 9. Testes e smoke

```
bun test src/Domain/personality src/GameEngine/Domain/Fouls.test.ts src/GameEngine/Domain/Fouls.engine.test.ts \
  src/Domain/advanceDay/quickSim.test.ts src/Domain/morale src/Domain/contracts src/Domain/transfer src/Domain/negotiation
```

- Puros: determinismo e distribuição (média 10,5 ± 0,2 em 20 000 ids, todo valor em 1..20), renascido = original,
  override, faixas, multiplicadores = 1 em 10,5, `obscurePersonality` (0 = exato, determinístico, limitado).
- Motor: falta/cartão com `temperament` em −1/0/+1 (rng injetado); t = 0 devolve exatamente o resultado de hoje.
- quickSim: mesmo `rng`, XI todo neutro → mesmos cartões de antes.
- Moral: volatilidade, limiar de pedido de transferência por ambição/lealdade, `wants_move`.
- Contratos: desconto de lealdade por tempo de clube, compatriota, recusa `smallerClub` (rota de compra e de livre).
- `scripts/season-rollover-smoke.ts`, seção "Personalidade": todo jogador do mundo tem personalidade em 1..20;
  renascido aceito = a do original; disciplina dentro da faixa já existente; pelo menos uma recusa ou pedido ajustado
  por personalidade registrado (via chamada de `demand`); moral segue em 0..100.

Regra nova `.claude/rules/game/personality.md`, changelog **4.2** (+ `upcoming`), `package.json`, ROADMAP etapa 26.

## 10. Limitações

- Personalidade fixa a carreira inteira (não amadurece com a idade; o cabeça quente de 19 anos continua aos 33).
- Sem expulsão por conduta violenta fora do lance (só o fator nas faltas/cartões existentes); sem liderança/capitão.
- "Cidade natal" não existe nos dados: lealdade usa tempo de clube e país da nacionalidade.
- A IA não tem moral: o ambicioso de um clube da IA não "pede para sair", só pressiona a venda no score.
- Faixa vista do olheiro pode estar errada (é a regra), e as recusas de negociação usam o valor real.

## Decisões abertas (recomendação em negrito)

- **D1 — Quantos traços:** **4** (ambição, lealdade, profissionalismo, temperamento); alternativa: 5º "pressão"
  (rendimento em clássico/mata-mata, mexe no motor e exige outra rodada de medição) — deixar para depois.
- **D2 — Visibilidade:** **faixas em texto (5), número escondido**; alternativa: número 1..20 como no FM.
- **D3 — Profissionalismo no declínio após os 30:** **sim, ±10%** (pequeno, dentro da medição M3).
- **D4 — Gerar por hash do id, sem correlação com idade/posição:** **sim** (zero migração, determinístico); alternativa:
  gravar no importador com dados curados de craques (Rodri exemplar, etc.) — fica possível pelo `personality?` override.
- **D5 — Desconto de compatriota na contratação:** **sim, até −5%**.
- **D6 — Filtros de personalidade no Olheiro:** **não nesta etapa** (só a ficha); abrir se os testers pedirem.
- **D7 — Recusa de clube menor também para a IA comprar:** **sim** (mantém craques ambiciosos em clubes grandes), condicionado
  a M4.
