# Personalidade dos jogadores

Spec: `docs/superpowers/specs/2026-10-05-personality-design.md` (D1–D7 aprovadas com a recomendação). Etapa 26 do
`docs/ROADMAP.md`, versão **4.2**. Visual: `.claude/rules/ui-standard.md`.

## Regra

- Quatro traços, escala interna **1..20** (inteiros): **ambição**, **lealdade**, **profissionalismo**,
  **temperamento** (20 = cabeça quente). Sem 5º traço (D1).
- **Derivados, nunca gravados** (D4): `personalityOf(player)` (`src/Domain/personality/personality.ts`) gera os
  traços do id: cada traço = `1 + round(média de 3 sorteios × 19)` com `mulberry32(seedFrom("personality:<id>:<traço>"))`
  (sino, média 10,5); lealdade = `0,75 × sorteio + 0,25 × (21 − ambição)` arredondado com desempate determinístico sem viés no .5 (leve anticorrelação; média do mundo 10,5). Sem
  correlação com idade, posição ou nota. Nada muda no mundo, nos kits nem nos saves (sem migração); o mesmo jogador
  tem a mesma personalidade em qualquer carreira. Jovens da base (ids novos) já nascem com a sua; o **renascido**
  herda a do original (`reborn.fromId`). `RosterPlayer.personality` é só override (testes, dados curados futuros):
  o jogo nunca grava.
- Todo efeito é linear em `t = (v − 10,5) / 9,5` ∈ [−1, 1] e é exatamente neutro em t = 0. A distribuição é
  simétrica, então a média mundial de cada multiplicador é ~1.
- Visível como **faixa em texto** (5 faixas: 1–4 muito baixo, 5–8 baixo, 9–12 médio, 13–16 alto, 17–20 muito alto),
  nunca o número (D2). Resumo de uma palavra pelo traço mais distante de 10,5 (pelo menos 4,5; senão "Equilibrado").
- **IA:** sem moral; a personalidade age só por regras (evolução, disciplina, renovação, mercado). Nada simulado
  por clube.
- **Ninguém fora de `personality.ts` lê os traços crus:** os consumidores chamam os multiplicadores.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/personalityTypes.ts` | `Personality`, `PersonalityTrait`, `TraitBand`, `PersonalitySummary`, `PersonalityView` |
| `src/Domain/personality/personalityConfig.ts` | Todas as constantes (`PERSONALITY`) |
| `src/Domain/personality/personality.ts` (+ teste) | Geração, faixas, resumo, `obscurePersonality`, todos os multiplicadores |
| `src/GameEngine/Configs/PersonalityMatchConfig.ts` | Override de temperamento por time (`/test`, `/lab`), como `MoraleConfig.ts` |
| `src/GameEngine/Domain/Fouls.ts`, `gameState.ts` | `FoulContext.temperament` / `CardContext.temperament`; `GamePlayer.temperament` (t) na montagem do titular e do banco |
| `src/Domain/advanceDay/quickSim.ts` | `rollDiscipline`: peso de quem comete, número de faltas do lado, cartões; `homeTemperament`/`awayTemperament` |
| `src/GameEngine/PlayerDevelopment.ts` | `applyDevelopment(..., dpMult, decayMult)` |
| `src/Domain/advanceDay/matches.ts`, `dailyTraining.ts`, `src/Domain/youth/youth.ts` | DP × profissionalismo (base: só profissionalismo) |
| `src/Domain/morale/morale.ts` | Volatilidade, limiares (pedido de transferência, `wants_move`), listado, promessa quebrada, "cobrar" |
| `src/Domain/contracts/contracts.ts` | `demandBreakdown` / `contractDemand(..., ctx)` / `evaluateContractOffer(..., ctx)` (`smallerClub`); `renewalContract` (salário que a IA paga) |
| `src/Domain/transfer/transferAcceptance.ts` | `SaleContext.personalityPush` (vendedor IA com comprador conhecido) |
| `src/Domain/transfer/transferNeeds.ts` | `findCandidates` pula quem recusaria o clube comprador |
| `src/Domain/staff/staff.ts` | `obscurePlayer` grava `personalityView` (só nas respostas de tela) |
| `src/backend/contractRoutes.ts`, `transfers.ts`, `src/Domain/negotiation/*` | Contexto de origem (`fromSquad`) e o comprador nas respostas |
| `src/GameInterface/Components/PersonalityPanel.tsx` | Bloco "Personalidade" da ficha e o selo de resumo |
| `src/GameInterface/Contracts/ContractTermsFields.tsx` | `PersonalityDemandLines` (renovação, contratação, compra) |
| `scripts/personality-measure.ts` | Medições M1–M5 (abaixo) |

## Efeitos

### Evolução (todo o mundo): profissionalismo

- DP × `1 + 0,15 × t` (×0,85..×1,15; spec 0,08, ver Medições) na partida, no treino e na base, ao lado de staff, CT, renascido e moral
  (`personalDpMult`).
- Declínio por idade × `1 − 0,10 × t` (D3; `professionalismDecayMult`, 4º argumento de `applyDevelopment`).
- Clube do jogador: profissional (t ≥ 0,4, traço ≥ 15) não perde DP por moral baixa (`shieldedMoraleDpMult`); o
  bônus de muito feliz continua.

### Disciplina (motor e quickSim): temperamento

- Motor: falta × `1 + 0,45 × t` (spec 0,35; ver Medições); amarelo × `1 + 0,20 × t`, vermelho direto × `1 + 0,40 × t` (divididos por
  `FOUL_CONFIG.TEMPERAMENT_CARD_NORM` = 1,04 quando t ≠ 0). Debug `foul`/`card` com `tempMult`.
- quickSim: peso de quem comete × o mesmo fator; faltas do lado = Poisson(`FOULS_PER_SIDE` × média dos fatores do
  XI ÷ `TEMPERAMENT_FOUL_NORM`); cartões do infrator × os fatores do motor ÷ `TEMPERAMENT_CARD_NORM` (1,04; o de faltas em 1).
  Um XI neutro (t = 0) sorteia exatamente o de antes.

### Moral (só o clube do jogador)

| Traço | Efeito |
|---|---|
| Temperamento | Todo delta de evento × `1 + 0,25 × t` (`withEventDelta`: resultado, gols/nota, minutos, promessas, listado, conversa, recusa). A deriva semanal não muda |
| Ambição | Déficit de minutos × `1 + 0,3 × t`; pedido de transferência abaixo de `25 + 8 × t`; `wants_move` com moral < `60 + 10 × t`; proposta de clube mais forte só dispara com ambição ≥ 13 |
| Lealdade | Listado sem pedir × `1 + 0,5 × t`; promessa quebrada × `1 − 0,3 × t`; leal (≥ 15) nunca pede transferência por moral (só por promessa quebrada) e `wants_move` exige moral < 40 |
| Profissionalismo | Escudo da DP acima; "cobrar" funciona (+1) com contente **ou** profissional (≥ 13) |

### Contratos e mercado

- **Pedido** (`demandBreakdown`): base (curva × importância × jovem × moral) × ambição `1 + 0,08 × t` × lealdade
  (só renovação no próprio clube, inclusive de um cedido por empréstimo — `DemandContext.renewal`, igual na rota
  `renew` e no `demand`: `1 − 0,10 × max(0, t) × min(1, temporadas / 4)`; temporadas = temporadas no `history`
  naquele clube + a atual quando ela já começou para ele (algo no `seasonLog`: na virada, com o log zerado, a
  temporada recém-fechada conta uma vez só)) × compatriota (contratação por clube do país da nacionalidade, D5:
  `1 − 0,05 × max(0, t_lealdade)`) × clube menor (cada degrau de tier natural abaixo do clube de origem:
  `+0,10 × max(0, t_ambição)`).
- **Recusa** `smallerClub`: ambição ≥ 17 e o comprador 2+ tiers naturais (`naturalFinancialTier` pela receita)
  abaixo do clube atual (livre: o último clube no `history`). Compra (`POST /transfers`), livre (`/free-agents/:id/sign`)
  e pré-contrato devolvem 400 `smallerClub`. A IA (D7) também: `findCandidates`, os rivais (`rivalCandidates`) e as propostas da IA pelos jogadores do humano
  (`generateBidsForHuman`, `buildAiTransferBid`) pulam o comprador que ele recusaria.
- **Salário que a IA paga** (`renewalContract`, também o usado no portão de folha da compra da IA e das propostas: renovação da virada, livres, refil, compras da IA): a curva ×
  ambição × lealdade (renovação) ou × compatriota (contratação).
- **Vendedor IA** (`saleContext(..., { buyer })`): `+0,10 × t_ambição` quando o comprador tem tier natural maior,
  `−0,10 × max(0, t_lealdade)` sempre. Vale no mercado IA × IA, nas ofertas do humano (`respondToOffer` com
  `buyer`, inclusive a contraproposta) e na avaliação das rivais. Sem comprador (empréstimos, vendas do humano)
  não muda nada.
- `GET .../players/:id/demand`: `demand` (e o `refuses` da moral) sempre reais. Jogador próprio (inclusive cedido):
  `ambition`, `loyalty` exatos. De fora: `ambition`, `compatriot`, `smallerClub` e `refusesSmallerClub` calculados
  sobre a personalidade vista pelo olheiro (`obscurePersonality`), e omitidos quando a incerteza é ≥ 0,5 — a tela
  nunca revela o traço exato; a recusa no envio usa o valor real.

### Olheiro (D6: sem filtros nesta etapa)

`obscurePlayer` (respostas de tela: busca do olheiro, `GET /squad/...?scouted=1`) acrescenta `personalityView`:
cada traço + `round(ruído × 4 × sorteio(save:jogador:personality:traço))`, limitado a 1..20; com ruído ≥ 1
temperamento e profissionalismo viram "?"; `uncertain` com ruído ≥ 0,5 ("~" e "Olheiro: incerto"). Motor, avanço
do dia e negociação usam sempre o valor real.

## Telas

- Ficha: bloco "Personalidade" (4 linhas: rótulo, faixa em texto, barra de 5 segmentos) e o resumo ao lado do nome.
- Elenco: o resumo no tooltip do nome (sem coluna nova).
- Renovação, contratação de livre e compra: linhas do pedido ("Leal ao clube: −7%", "Quer um clube maior: +10%")
  e a recusa traduzida.
- Conversa (`TalkModal`): uma dica pelo resumo ("Pavio curto: reage forte a uma recusa").
- i18n `personality.*`, `contracts.refusal.smallerClub` (en, pt-BR).

## `/test`, `/lab`

- `/test`: seletor "Temperament" por time (Roster ou 1/5/10/15/20, via `PersonalityMatchConfig`); `EnergyPanel`
  com o temperamento médio e os multiplicadores de falta/amarelo; `tempMult` no log `foul`/`card`; cenário `hothead`
  (A em 20, B em 1, pelo próprio elenco); o painel QuickSim recebe o override.
- `/lab`: `Variant.temperament` (slider 0 = próprio, 1..20) → override no motor (`simulateMatch(..., { temperament })`)
  e no quickSim; rótulo `· tmp N`; `TeamRawStats.temperament` (média do XI) → `avgTemperament` → linha
  "Temperament" no `PairDetail`.
- `Statistics.ts`: nada novo (faltas e cartões já existem).

## Medições (`bun scripts/personality-measure.ts`)

Rodadas de 2026-10-05 (motor sem semente própria: `--engine-seed` troca o `Math.random`; pares com a mesma semente).

**M1 — volume do mundo** (cada um com a sua × todos em 10,5 = o motor de antes):

| | motor PL + Championship, 1200 jogos (600 + 600) | quickSim, 26 ligas × 1000, pareado |
|---|---|---|
| Faltas | 10,51 → 10,73 (+2,1%) | +0,1% |
| Amarelos | 2,42 → 2,32 (−4,1%) | −2,6% |
| Vermelhos | 0,077 → 0,081 (+5,6%, ~95 por braço: ruído ±14%) | +3,8% |
| Gols / chutes | +2,1% / +2,2% (ruído do motor) | 0 / 0 |

Sem normalizador os cartões subiam (quickSim: amarelos +1,3%, vermelhos **+13%**; o vermelho é quase todo segundo
amarelo, que cresce com o quadrado da concentração de faltas nos cabeças quentes). `TEMPERAMENT_CARD_NORM = 1,04`
(motor e quickSim) traz os dois para dentro de ±5%; `TEMPERAMENT_FOUL_NORM` ficou em 1.

**M2 — temperamento 20 × 1** (mesmo clube dos dois lados, `premier_league`, mando alternado):

| `FOUL_WEIGHT` | jogos | faltas 20 / 1 | amarelos 20 / 1 | vermelhos 20 / 1 | gols, chutes do jogo × 10,5 × 10,5 (2,225 / 5,425) |
|---|---|---|---|---|---|
| 0,35 (spec) | 800 | 1,44× | 2,1× | 6× | 2,26 (+1,6%) / 5,48 (+1%) |
| **0,45** | 400 | **1,82×** | 2,8× | 9× | 2,30 (+3,5%, ruído ±4%) / 5,44 (+0,3%) |

Com 0,35 as faltas ficavam abaixo do alvo (1,5–2×) porque a chance de falta tem teto (0,9); ficou **0,45**. O lado
calmo faz um pouco mais de gols (1,25 × 1,03): recebe os tiros livres.

**M3 — evolução** (`dev 1500`, 4 temporadas: 40 jogos com 60% de participação e nota ~N(6,6; 0,6), 120 sessões de
treino normais, envelhecimento; as funções reais de DP):

| `DP_WEIGHT` | média por faixa etária com × sem | jovem (≤ 21) exemplar 18 × desleixado 3 |
|---|---|---|
| 0,08 (spec) | ±0,003 | +0,13 |
| 0,12 | ±0,007 | +0,19 |
| **0,15** | ±0,003 | **+0,23** |

Ficou **0,15** (alvo 0,2–0,4; igual ao teto do staff, acima do CT).

**M4 — mercado da IA** (`bun scripts/contracts-sim.ts 3`, main 4.1 × esta branch): contratações 3244 → 3232
(−0,4%); `open` por tier LOW 93,9 → 93,8%, MEDIUM 96,0 → 96,3%, HIGH 96,8 → 97,1%, ELITE 98,3 → 95,7%; elenco médio
27,0 / 25,2 / 24,4 nos dois.

**M5 — moral** (o smoke não foi rodado nesta etapa; proxy `morale 30 40`: 30 clubes reais, 40 semanas, minutos pelo
papel sugerido): pedidos de conversa 10,6 → 10,1 por clube e temporada (0,95×), pedidos de transferência 2,1 → 1,9,
moral média 69,3 → 69,2.

```
bun scripts/personality-measure.ts world premier_league 600 [--neutral] --engine-seed 11 --out a.json
bun scripts/personality-measure.ts discipline premier_league 400 [--baseline] --engine-seed 21
bun scripts/personality-measure.ts quick 1000          # 26 ligas, pareado
bun scripts/personality-measure.ts dev 1500
bun scripts/personality-measure.ts morale 30 40
PERSONALITY_OVERRIDES='{"FOUL_WEIGHT":0.35}' bun scripts/personality-measure.ts discipline ...
```

## Testes e smoke

```
bun test src/Domain/personality src/GameEngine/Domain/Fouls.test.ts src/GameEngine/Domain/Fouls.engine.test.ts \
  src/Domain/advanceDay/quickSim.test.ts src/Domain/morale src/Domain/contracts src/Domain/transfer src/Domain/negotiation
```

`scripts/season-rollover-smoke.ts`, seção "Personalidade": todo jogador do mundo (elencos, base, livres) com traços
inteiros em 1..20; o renascido aceito tem a personalidade do original; disciplina nas faixas; pelo menos um pedido
da rota `demand` moldado pela personalidade; moral em 0..100.

## Limitações

- Personalidade fixa a carreira inteira (não amadurece).
- Sem expulsão por conduta violenta fora do lance; sem liderança/capitão.
- "Cidade natal" não existe: lealdade usa tempo de clube e país da nacionalidade.
- A IA não tem moral: o ambicioso de um clube da IA só pressiona a venda no score.
- A faixa vista do olheiro pode estar errada (é a regra); as recusas usam o valor real.
- Temporadas no clube contam pelo `history`: no começo da carreira ninguém tem desconto de lealdade além da
  temporada atual (1/4 do desconto).
