# Instalações vivas (Etapa 34)

Etapa 34 do `docs/ROADMAP.md`, versão **4.11**. Desenho aprovado em 2026-10-07/08. Regras atuais que esta etapa muda:
`.claude/rules/game/facilities.md` (instalações, obras, diretoria), `staff.md` (jardineiro sem efeito desde a 4.7),
`injuries.md` (risco de lesão), `contracts.md` / `personality.md` (pedido de salário, `demandBreakdown`, recusa
`smallerClub`), `transfer-windows.md` (`preferenceScore`), `finances.md` (extrato), `board-fans.md` (`boardDecision`).

## Decisões

| Tema | Decisão |
|---|---|
| Itens | 10 itens (estádio 3, CT 5, base 2), cada um com **nível 1–10** ("N de 10") e **condição 0–100%** |
| Vida útil | 1 a 5 temporadas por item, desgaste progressivo (lento no começo, acelera no fim); uso intenso desgasta mais |
| Limiares | Abaixo de **40%** o item pesa no jogo; abaixo de **15%** fica **interditado** até a reconstrução |
| Reforma | Parcial a qualquer momento; **pequena (≤ 2% da receita anual) paga direto do caixa**; **grande, reconstrução e melhoria passam pela diretoria** (`boardDecision`, parcelas, como as obras de hoje) |
| Jardineiro | Mantém os gramados (estádio, CT; base pela metade): estrelas e quantidade (limite por tier); sem jardineiro o gramado gasta 1,6× mais rápido |
| IA | **Sem custo, sem obra, sem dado gravado**: o gramado de cada clube da IA é uma função do tier e da fração da temporada (cai durante a temporada, renova sozinho na virada); vale para todo jogo no estádio dele (motor e quickSim), inclusive os do clube do jogador fora de casa |
| Contratação | Condição média ruim do CT (e da base, para ≤ 21) faz o jogador **pedir um pouco mais** (linha nova no `demandBreakdown`) e **pesa no `preferenceScore`**; **só recusa** com ambição ≥ 17 e CT abaixo de 25% |
| Níveis das obras | Os níveis 1–5 de hoje (conforto, CT, base) passam a ser **derivados** dos itens: `nível do grupo = média dos níveis dos itens / 2`; as obras de grupo de hoje continuam e sobem +2 cada item do grupo |
| Saves antigos | Sem migração (protótipo): um `facilities` sem `items` é recriado pelo `initialFacilities` na primeira leitura da rota (como já acontece com `facilities` ausente) |

## 1. Itens

`ClubFacilities.items: Record<FacilityItemId, FacilityItem>` (só o clube do jogador grava, como hoje).

```ts
type FacilityItemId =
  | "stadiumPitch" | "seats" | "stadiumStructure"                   // estádio
  | "trainingPitches" | "gym" | "pool" | "physio" | "canteen"       // CT
  | "academyPitches" | "academyLodging";                            // base
type FacilityGroup = "stadium" | "training" | "academy";

interface FacilityItem {
  level: number;        // 1..10
  wear: number;         // fração da vida útil consumida, ≥ 0 (condição derivada, nunca gravada)
  condemned?: true;     // interditado (passou de 15%) até a reconstrução
  alert?: 40 | 15;      // último aviso dado (rearma quando a condição volta acima)
}
```

| Item | `id` | Grupo | Vida (temporadas, no nível 5) | Desgaste (tempo / jogos em casa / treinos) | Jardineiro |
|---|---|---|---|---|---|
| Gramado do estádio | `stadiumPitch` | estádio | 1 | 0,40 / 0,60 / 0 | sim |
| Arquibancadas e assentos | `seats` | estádio | 4 | 0,60 / 0,40 / 0 | — |
| Estrutura e iluminação | `stadiumStructure` | estádio | 5 | 1 / 0 / 0 | — |
| Campos de treino | `trainingPitches` | CT | 1 | 0,40 / 0 / 0,60 | sim |
| Academia | `gym` | CT | 2 | 0,30 / 0 / 0,70 | — |
| Piscina | `pool` | CT | 4 | 0,60 / 0 / 0,40 | — |
| Fisioterapia | `physio` | CT | 3 | 0,70 / 0 / 0,30 | — |
| Refeitório | `canteen` | CT | 5 | 1 / 0 / 0 | — |
| Campos da base | `academyPitches` | base | 1,5 | 1 / 0 / 0 | metade do efeito |
| Alojamento e estrutura da base | `academyLodging` | base | 4 | 1 / 0 / 0 | — |

### Condição e desgaste

```
condição(wear) = 100 × (1 − min(1, wear)^P)            P = 2      (interditado: condição efetiva 0)
40%  ⇔ wear ≈ 0,775        15% ⇔ wear ≈ 0,922
```

Por dia, só para o clube do jogador (`wearDay`, no avanço do dia):

```
Δwear = [ tempo / 365 + jogos × jogosEmCasaHoje / HOME_GAMES_REF (25) + treinos × sessão / TRAINING_DAYS_REF (200) ]
        / (vida × lifeScale(nível)) × mult. do jardineiro (só gramados)
lifeScale(nível) = 0,75 + 0,05 × nível          (nível 5 = 1; 10 = 1,25; 1 = 0,8)
sessão = 0,7 leve · 1 normal · 1,3 pesado (0 em dia de jogo, de descanso, ou sem clube)
```

Uma temporada "típica" (25 jogos em casa, 200 dias de treino normal) consome exatamente `1 / (vida × lifeScale)` da
vida; mais jogos ou treino pesado gastam mais. Ex.: gramado do estádio nível 6 com jardineiro 3★ cai a 40% em ~0,82
temporada (por volta de abril numa liga europeia); sem jardineiro, em ~0,5 temporada.

### Níveis dos grupos

- `groupLevel(f, g)` = média dos níveis dos itens do grupo / 2 (contínuo; um item interditado conta nível 1).
  `comfortLevel(f) = seats.level / 2` (o conforto é o nível dos assentos).
- Os efeitos de nível de hoje (`TRAINING_*`, `ACADEMY_*`, `COMFORT_PRICE_STEP`, manutenção) leem o nível do grupo
  **interpolado** nas tabelas 1..5 (`lerpLevel`): com níveis inteiros dá exatamente o valor de hoje.
- **Criação** (`initialFacilities`): cada item do CT e da base no nível `2 × nível implícito do tier` (MEDIUM 6 de 10),
  o gramado e a estrutura do estádio idem, os assentos em 2 (conforto 1). Desgaste inicial determinístico por
  `seedFrom(fac:<clube>:<item>)`: gramados 0,05–0,25, demais 0,05–0,45 (condição 100%–80%): **nenhum item começa
  abaixo de 40%**, então o público, a bilheteria e os efeitos do CT/base da largada são idênticos aos de hoje
  (o teste `default facilities sell exactly the old gate` continua valendo).
- Os campos `comfort`, `training` e `academy` de `ClubFacilities` **saem**; todo leitor usa os helpers.

## 2. Efeitos abaixo de 40%

`penalty(cond) = clamp((40 − cond) / 40, 0, 1)` (0 a partir de 40%, 1 em 0% ou interditado). Cada efeito é
`1 + (máximo − 1) × penalty` (linear por partes). Constantes em `FACILITIES.WEAR`.

| Item | Efeito | No máximo (0%) | Onde entra |
|---|---|---|---|
| Gramado do estádio | Lesões dos dois times nos jogos em casa | × 1,6 | `InjuryFactors.staffMult` × fator do gramado (motor e quickSim) |
| Assentos | Demanda de público; preço (conforto) | × 0,90; × 0,95 | `demandOf`, `facilitiesGate` |
| Estrutura | Demanda de público | × 0,95 | `demandOf` |
| Campos de treino | Lesão no treino pesado; chance nova no treino normal/leve; DP do treino | × 1,6; `HEAVY × 0,5 × penalty`; × 0,95 | `trainingGroundEffectsOf` → `dailyTraining` |
| Academia | DP do treino | × 0,93 | idem |
| Refeitório | DP do treino | × 0,97 | idem |
| Piscina | Recuperação diária | × 0,97 | `trainingGroundEffectsOf.recoveryMult` (descanso, treino, dia de jogo) |
| Fisioterapia | Recuperação diária; duração das lesões do clube (ver "Decidido" 4) | × 0,97; × 1,25 | idem; `injuryDurationMult` → `matches.ts`, `dailyTraining.ts` |
| Campos da base | Nível da safra | − 0,15 | `academyEffectsOf.qualityBonus` |
| Alojamento | Nível da safra; chance de promessa | − 0,15; × 0,8 | idem |

CT com todos os itens em 20% (metade da penalidade): DP do treino × ~0,925, DP de partida × 0,91 (Decidido 5), lesão
de treino pesado × 1,3. Nunca dentro da partida, exceto o gramado do estádio (lesões).

### Interdição (< 15%)

Ao passar de 15% o item fica `condemned`: condição efetiva 0 (penalidade máxima), conta nível 1 no grupo, e **não
aceita reforma parcial**: só **reconstrução** (diretoria), que devolve a condição a 100% no mesmo nível. Um item
pode ser reconstruído a qualquer momento abaixo de 15%.

## 3. Gramado (estádio, CT, IA)

### Jardineiro

- Fator de desgaste dos gramados = `curva(estrelas do melhor) × 0,9^(quantos − 1)`; curva `[1★ 1,3, 3★ 1, 5★ 0,75]`;
  **sem jardineiro × 1,6**. Os campos da base usam metade do desvio (`1 + (fator − 1)/2`).
- Limite por tier (era 1 para todos): **LOW 1 · MEDIUM 1 · HIGH 2 · ELITE 2** (`STAFF.LIMITS.groundskeeper`).
- `staffEffectsOf(squad).pitchWearMult` (nova); a IA não usa (o gramado dela é fórmula). Cartão do jardineiro na
  Equipe técnica mostra "Desgaste do gramado ×N".

### Gramado da IA

```
aiPitchCondition(tier, fração) = START[tier] − DROP[tier] × fração          fração = parte da janela da liga do mandante
START = LOW 70 · MEDIUM 80 · HIGH 88 · ELITE 94      DROP = LOW 40 · MEDIUM 44 · HIGH 40 · ELITE 30
fim da temporada: LOW 30 · MEDIUM 36 · HIGH 48 · ELITE 64
```

Nada gravado: na temporada nova a fração volta a 0 (renovado). `matchPitchCondition(home, fixture, janela, data)`:
campo neutro → 90; mandante humano com instalações → condição do `stadiumPitch`; senão a fórmula com
`financialTierOf(home)`. Abaixo de 40% só os LOW (do último quarto) e os MEDIUM (do último ~9%) pesam: o volume de
lesões do mundo sobe pouco (estimativa ≤ +2%; medido na Tarefa 13).

## 4. Reforma, reconstrução e melhoria

`FacilityRequest` ganha:

| Pedido | Corpo | Regra |
|---|---|---|
| Reforma | `{ kind: "repair", item, to }` | `to` múltiplo de 5, acima da condição atual, ≤ 100; item não interditado |
| Reconstrução | `{ kind: "rebuild", item }` | só abaixo de 15% ou interditado; volta a 100% no mesmo nível |
| Melhoria | `{ kind: "upgrade", item }` | +1 nível (≤ 10), condição 100% na entrega |
| Obras de grupo (hoje) | `comfort` / `training` / `academy` | próximo nível do grupo (`⌊nível⌋ + 1`, ≤ 5): na entrega cada item do grupo vai a `max(nível, 2 × novo)` e 100% |

```
valor(item, nível) = receita anual × VALUE_SHARE[item] × nível / 6
VALUE_SHARE: gramado do estádio 0,6% · assentos 3% · estrutura 2,5% · campos de treino 0,8% · academia 0,8%
             · piscina 0,6% · fisioterapia 0,6% · refeitório 0,5% · campos da base 0,6% · alojamento 1%
reforma      = valor × (to − condição) / 100 × 0,6         semanas = max(1, ⌈REPAIR_WEEKS[item] × (to − cond)/100⌉)
reconstrução = valor                                        semanas = REBUILD_WEEKS[item]
melhoria     = valor(nível + 1) × 0,6                       semanas = ⌈REBUILD_WEEKS[item] × 0,6⌉
```

`REPAIR_WEEKS`: gramados 2, academia/piscina/fisioterapia/refeitório 3, assentos/estrutura/alojamento 4.
`REBUILD_WEEKS`: gramados 4, academia 6, piscina/fisioterapia/refeitório 8, assentos 12, estrutura 16, alojamento 10.

**Quem paga:**
- **Reforma pequena** (custo ≤ 2% da receita anual, `SMALL_REPAIR_SHARE`): paga na hora, **uma linha** `facilities`
  (`ref: { facility: "repair", item }`), sem diretoria; recusa `no_money` se o saldo menos o comprometido
  (`committedSpend`) não cobre. A tela mostra "Pago pelo clube".
- **Reforma grande, reconstrução e melhoria:** `boardDecision` (mesmas regras) e parcelas mensais `facilities` /
  `board_funding` (o mecanismo de hoje). A tela mostra a previsão da diretoria.
- Um projeto por item; uma obra de grupo ocupa todos os itens do grupo (409 `busy`). O item continua gastando
  durante a obra; na entrega a condição vai ao alvo (`wear` = `wearFor(to)`), `condemned` e `alert` saem.
- Manutenção semanal (`facilities_upkeep`): mesma fórmula de hoje, com o nível do grupo derivado (fracionário).

## 5. Contratação

`facilitiesAppeal(squad, player)` (0..100): média da condição efetiva dos itens do CT; para jogador ≤ 21, média de
CT e base. Só existe para o clube do jogador (a IA não tem `facilities`: nenhum efeito, mundo idêntico).

- **Pedido** (`demandBreakdown`, só numa contratação — não na renovação): parte nova `facilities =
  1 + 0,10 × clamp((50 − appeal)/50, 0, 1)` (até +10% com tudo em 0). Linha na negociação "Instalações ruins: +N%".
- **Recusa** `poorFacilities`: ambição ≥ 17 (`PERSONALITY`) e CT abaixo de 25% (o mesmo caminho do `smallerClub`:
  compra, livre, pré-contrato → 400; a IA nunca recebe a recusa porque não tem instalações).
- **Preferência** (`preferenceScore`): `− 0,10 × clamp((50 − appeal)/50, 0, 1)` no clube do jogador (o rival da IA
  fica sem desconto). `preferredClub` pode responder o motivo `facilities`.

## 6. Inbox

`FacilityInboxMessage.kind` ganha `worn` (caiu abaixo de 40%), `condemned` (abaixo de 15%, interditado) e `repaired`
(reforma, reconstrução ou melhoria concluída), com `item` e `condition`. Uma mensagem por cruzamento (`alert`), adiada
para depois do `clearInbox` como as demais de instalações. O `approved` de hoje também vale para pedidos da
diretoria de item.

## 7. Telas

- **Finanças → Instalações → "Instalações em detalhe"** (seção nova abaixo dos cartões do CT e da base): três blocos
  (Estádio, Centro de treinamento, Base), uma linha por item: nome, "N de 10" (`LevelMarks` de 10), barra de
  condição (verde ≥ 40, âmbar 15–39, vermelho < 15 / "Interditado"), efeito atual em uma linha quando abaixo de
  40%, obra em andamento (barra de progresso) e botões **Reformar** (escolha 25 / 50 / até 100%), **Reconstruir**
  (abaixo de 15%) e **Melhorar** (+1 nível). O botão abre um painel com custo, prazo, "Pago pelo clube" ou a
  previsão da diretoria (`boardDecision`, mesma função), e "Confirmar". Visual: `ui-standard.md` (tabela padrão,
  rótulos, `tabular-nums`).
- **Painel**: o cartão Obras mostra as reformas; o cartão Atenção lista itens abaixo de 40% (dos últimos 7 dias).
- **Prévia da partida**: "Gramado: N%" (do estádio do jogo; vermelho abaixo de 40).
- **Equipe técnica**: efeito do jardineiro (`pitchWearMult`).
- **Negociação**: linha "Instalações ruins: +N%" e a recusa `poorFacilities` traduzida.

## 8. `/test`, `/lab`

- `/test`: seletor **Pitch** (100/60/40/20/0, padrão 90) no painel de táticas; vale para o jogo inteiro (os dois
  lados); o `EnergyPanel` mostra `pitch ×N`; cenário `bad-pitch` (gramado 10%); o painel QuickSim recebe a condição.
- `/lab`: `Variant.pitchCondition` (slider 0–100; ausente = 90; a da variante A, mandante, vale para o jogo) →
  `simulateMatch(..., { pitchCondition })` e `quickSimMatch({ pitchCondition })`; rótulo `· pitch N%`; linha
  "Pitch" no `PairDetail` (`TeamRawStats.pitchCondition` → `avgPitchCondition`); a linha "Injuries" já existe.
- `Statistics.ts`: nada novo (lesões já existem). O `debugLog('injury')` passa a incluir o fator do gramado.

## 9. Medição (Tarefa 13)

| Medição | Como | Meta |
|---|---|---|
| M1 volume do mundo com o gramado da IA | `scripts/injury-calibrate.ts --pitch ai` (motor PL + Championship, fração da temporada sorteada) e quickSim nas 26 ligas | dentro de 0,15–0,5 por partida; variação ≤ +3% sobre o sem gramado |
| M2 gramado 20% × 90% | motor 400 jogos cada (mesmo clube dos dois lados), quickSim 20 000 pareados | ~× 1,3 lesões por partida |
| M3 CT 20% × 90% | `scripts/development-pace.ts --ct 20` (temporadas do caso realista) | Δ da média dos atributos de um jovem em 3 temporadas ~−5% a −8% |
| M4 linha do tempo do desgaste | `scripts/facilities-wear.ts` (temporada simulada, jardineiro 0/3★/5★) | gramado do estádio a 40% em ~0,8 temporada com 3★, ~0,5 sem; estrutura não passa de 40% em 3 temporadas |
| M5 contratação | `scripts/facilities-wear.ts --demand` | pedido +5% com CT 25%, recusa só ambição ≥ 17 |

Os números medidos substituem as estimativas nesta seção e em `facilities.md`.

### Medido (2026-10-08)

**M1/M2 — lesões pelo gramado** (`bun scripts/injury-calibrate.ts 300 --pitch none,ai,20,90 --quicksim`; motor
Premier + Championship, 600 jogos por modo, fôlego 88, mesmos pares e mesmo `Math.random` por jogo — o motor carrega
estado entre partidas, então o pareamento não é exato: o modo 90 = sem gramado deu ×1,021 só de ruído; quickSim 26
ligas × 3000 jogos, pareado e exato):

| Modo | Motor (lesões/jogo) | × sem gramado | quickSim | × sem gramado |
|---|---|---|---|---|
| sem gramado (antes) | 0,240 | 1 | 0,256 | 1 |
| IA (tier × fração sorteada; média 64%, 9,3% dos jogos abaixo de 40%) | 0,245 | 1,021 | 0,257 | 1,005 |
| 20% | 0,333 | 1,389 | 0,332 | 1,298 |
| 90% | 0,245 | 1,021 (ruído) | 0,256 | 1,000 |

Metas: volume do mundo na faixa 0,15–0,5 e ≤ +3% sobre o sem gramado (✓: +0,5% exato no quickSim; o +2,1% do motor é
ruído, igual ao do modo 90); gramado 20% × 90% ~×1,3 (✓: quickSim ×1,30; motor ×1,36 sobre o 90, ruído de ±13% com
~150–200 lesões). `AI_PITCH` não mudou.

**M3 — CT ruim na evolução** (`bun scripts/development-pace.ts --ct 20 [--sessions 200]`, caso realista de 3
temporadas; com o CT a 20%: DP do treino ×0,927 e, desde a decisão de 2026-10-08, DP de partida ×0,910
(`CT_MATCH_DEV_MIN` 0,82 em 0%); a 0%: ×0,857 e ×0,82).

| Δ média 13 (linha / goleiro), CT 90% → 20% | 18 anos | 21 | 24 |
|---|---|---|---|
| 38 treinos/temporada | 0,390 → 0,367 (−5,9%) / 0,731 → 0,677 (−7,4%) | 0,313 → 0,279 (−10,9%) / 0,538 → 0,523 (−2,8%) | 0,251 → 0,238 (−5,2%) / 0,438 → 0,408 (−6,8%) |
| 200 treinos/temporada | 0,559 → 0,526 (−5,9%) / 1,038 → 0,977 (−5,9%) | 0,390 → 0,367 (−5,9%) / 0,754 → 0,677 (−10,2%) | 0,326 → 0,297 (−8,9%) / 0,608 → 0,592 (−2,6%) |

Média das 12 células: **−6,5%** (meta −5% a −8% ✓; antes, só com a DP do treino, −2,2%: de 0% a −7,2% por célula).
O passo de 0,1 e a virada que zera o progresso deixam cada célula em degraus (uma célula anda 0,0077 por passo de um
atributo, 1–3% do Δ), por isso a calibração é pela média, como em `development.md`: 0,86 dava −5,5%, 0,84 −6,0%, 0,82
−6,5%, 0,80 −7,9% (com a linha de 21 anos saltando para −17%). Com o CT a 40% ou mais nada muda (teste).

**M4 — linha do tempo do desgaste** (`bun scripts/facilities-wear.ts`, nível 6 novo, 278 dias de temporada com 25
jogos em casa e 199 treinos normais, 87 dias de entressafra): gramado do estádio a 40% em **0,43 temporada (19/01)**
sem jardineiro, **0,71 (30/04)** com 3★, 1,09 (set. da temporada seguinte) com 5★ — meta ~0,5 / ~0,8 (✓, 3★ em fim de
abril); campos de treino iguais ao gramado; estrutura a 96% / 85% / 67% no fim de cada uma das 3 temporadas (nunca
abaixo de 40% ✓); academia a 40% em 1,52 temporada, fisioterapia em 2,41, assentos/piscina/refeitório/alojamento acima
de 40% nas 3 temporadas.

**M5 — contratação** (`bun scripts/facilities-wear.ts --demand`): pedido ×1,00 com o CT a 100% e 50%, ×1,05 a 25%,
×1,10 a 0%; recusa só com ambição ≥ 17 e CT abaixo de 25% (ambição 16 aceita sempre) ✓.

## 10. Smoke (`scripts/season-rollover-smoke.ts`, seção "Instalações")

Além do que já confere: condição de todo item em 0..100 todo dia e caindo ao longo da temporada (fora reformas);
no dia N o gramado do estádio é forçado a 45% e cai abaixo de 40% → mensagem `worn`; reforma pequena pela rota
(`to: 100`) → uma linha `facilities` `repair` igual ao orçamento, paga no dia, sem `board_funding`; concluída →
`repaired` e condição 100; um clube da IA de liga virada tem o gramado do último dia da temporada antiga < o do
primeiro dia da nova; lesões na faixa 0,15–0,5 (já existe); a rota `demand` de um jogador de fora com o CT forçado a
20% traz `facilities > 1`; nenhum clube da IA grava instalações.

## Decidido (2026-10-08)

Os pontos abertos da primeira versão, decididos pelo usuário:

1. **Treino normal e lesões — aprovado.** Gramado do CT ruim cria uma chance pequena de lesão no treino normal/leve,
   proporcional à penalidade dos campos (`HEAVY_TRAINING_CHANCE × WEAR.NORMAL_TRAINING_INJURY_SHARE (0,5) ×
   penalty`, máx. 0,5% por sessão).
2. **Reforma pequena sem saldo — aprovado.** A reforma pequena (paga do caixa, sem diretoria) é recusada com
   `no_money` se o saldo menos o comprometido (`committedSpend`) não cobre; o saldo nunca fica negativo por ela.
3. **Renovações — aprovado.** Instalações ruins aumentam o pedido de salário só nas contratações; a renovação do
   próprio jogador não tem a linha de instalações.
4. **Fisioterapia — muda também a duração das lesões.** Além da recuperação diária (× 0,97 em 0%), a fisioterapia
   multiplica os dias fora de toda lesão nova do clube do jogador (partida e treino), junto com o médico
   (`injuries.md`): `trainingGroundEffectsOf(squad).injuryDurationMult = nível × condição`, com
   - condição: `effectAt(WEAR.PHYSIO_DURATION_MAX (1,25), condição)` (1 a partir de 40%, × 1,25 em 0% ou interditada);
   - nível: `clamp(1 − 0,03 × (nível − 2 × nível implícito do tier), 0,85, 1,15)` (neutro no nível inicial; nível
     10 num clube MEDIUM × 0,88).
   Neutro no nível e na condição iniciais. Aplicado onde a `returnDate` é calculada para o clube do jogador
   (`finalizeSquadsAfterMatch` em `matches.ts`, `buildTrainingEvent` em `dailyTraining.ts`): `injuryReturnDate(...,
   medic × physio)`. A IA não muda (sem instalações: × 1).
5. **CT ruim pesa também na DP de partida (preparação pior).** Com a DP só do treino a M3 ficava em −2% (meta −5% a
   −8%). `trainingGroundEffectsOf(squad).matchDevMult = effectAt(WEAR.CT_MATCH_DEV_MIN (0,82), média da condição de
   campos de treino, academia e refeitório)`: 1 a partir de 40%, nas condições iniciais e para a IA (sem
   instalações); × 0,91 a 20%, × 0,82 em 0%. Multiplica a DP de partida em `finalizeSquadsAfterMatch` junto do
   auxiliar, renascido, profissionalismo e moral; só o crescimento (o declínio por idade não muda, como as áreas da
   4.7). Medido na M3 (§9): −6,5% na média.
