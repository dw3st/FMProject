# Instalações do clube: estádio, CT e base

Spec: `docs/superpowers/specs/2026-10-04-facilities-design.md`. Etapa 24 do `docs/ROADMAP.md`, versão **3.9**.
Visual: `.claude/rules/ui-standard.md`. Diretoria: `board-fans.md`. Extrato: `finances.md`. Staff: `staff.md`.

## Regra

- Só o **clube do jogador** grava instalações (`Squad.facilities`, `ClubFacilities` em `src/types/facilityTypes.ts`).
  A IA usa o **nível implícito do tier** (LOW 2, MEDIUM 3, HIGH 3, ELITE 4, centrado no neutro 3) para o CT, como o
  staff, e continua com a bilheteria antiga (capacidade × 0,65). Sem migração (protótipo).
- **Efeito no mundo (estimado pelas parcelas de tier do mundo inicial, LOW 24% / MEDIUM 53% / HIGH 19% / ELITE 3%):**
  nível médio do CT ~2,8; recuperação diária média × 0,998, lesão de treino × 1,003, DP de treino × 0,996 (LOW
  × 0,985 / 1,025 / 0,975; ELITE × 1,04 / 0,925 / 1,05). A base da IA é sempre neutra (o tier já está no
  `YOUTH.TIER_BONUS`): as safras da IA não mudam.
- As instalações são **do clube**: criadas no `createSave` e no `takeOverClub` (`initialFacilities`: setores pela
  capacidade, conforto 1, CT e base no nível implícito do tier, ou seja, neutros para um clube MEDIUM), apagadas no `releaseHumanClub` (o estádio construído
  fica em `venue.capacity`, obras em andamento são abandonadas). O start kit não as carrega (`stripHumanOnly`) e
  `applyRandomStartKit` as restaura.
- Aba **Clube** na barra superior (`/club`, #120, desde a 4.11; antes ficava em Finanças → Instalações); cartão
  **Obras** no Painel. Desde a 4.11 os níveis de conforto, CT e base são derivados dos dez itens (seção "Instalações
  vivas" no fim).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/facilities/facilityConfig.ts` | Constantes (`FACILITIES`) |
| `src/Domain/facilities/facilities.ts` (+ teste) | Puro: setores, capacidade efetiva, demanda, público, conforto, custos/prazos, manutenção, decisão da diretoria, obras e parcelas (`advanceFacilities`), dia de jogo (`facilitiesMatchday`), efeitos do CT e da base |
| `src/Domain/facilities/facilityMessages.ts` | Inbox `facilities` (`approved`, `refused`, `completed`, `attendance_record`) |
| `src/backend/facilityWorld.ts` | E/S: tier da liga, custo por lugar (peso do país do ranking de técnicos × tier), `withInitialFacilities` |
| `src/backend/facilityRoutes.ts` | `GET /api/saves/:id/facilities`, `POST /api/saves/:id/facilities/request` |
| `src/backend/advanceDay.ts` | Bloco financeiro: obras do dia, público dos jogos em casa, bilheteria pelo público, parcelas, mensagens adiadas |
| `src/Domain/advanceDay/financial.ts` | `PlayerHomeFixtureToday.attendance/priceMult`; manutenção na segunda (`facilities_upkeep`) |
| `src/Domain/advanceDay/dailyTraining.ts`, `dailyRest.ts`, `matches.ts` | Efeitos do CT na recuperação, lesão de treino, DP do treino e (condição, clube do jogador) DP de partida |
| `src/Domain/youth/youth.ts` | Efeitos da base na safra |
| `src/GameInterface/Facilities/FacilitiesView.tsx`, `facilitiesApi.ts`, `FacilityItemsPanel.tsx` | Tela Clube (`ClubScreen.tsx`, `/club`) |
| `src/Domain/facilities/facilityItems.ts`, `pitch.ts` (+ testes) | Itens, condição, desgaste, efeitos; gramado da IA e de cada jogo |
| `src/GameInterface/Dashboard/HomeCards.tsx` (`WorksCard`) | Cartão Obras |
| `src/GameInterface/MatchPreviewScreen.tsx` | Público esperado / capacidade (jogo em casa) |

## Estádio

- 4 setores (Norte, Sul 18% cada; Leste, Oeste 32% — laterais maiores); a soma é `venue.capacity`.
- **Ampliar:** +1.000 a +10.000 lugares (múltiplos de 1.000), um setor por vez. Custo por lugar =
  `clamp(1.500 + 4.500 × peso do país × fator do tier, 1.500, 6.000)` (peso do país = `countryWeight` do ranking de
  técnicos, cache `meta.managerWeights` ou calculado e guardado em memória; fator do tier 1 / 0,75 / 0,55 / 0,4).
  Prazo 8 + 22 × (lugares − 1.000)/9.000 semanas (8..30). Durante a obra o setor conta metade. Na conclusão,
  `venue.capacity` = soma dos setores. A receita estimada (`clubAnnualRevenue`, base do custo operacional e do fator
  de salário) conta no máximo os lugares que a demanda enche: min(capacidade, capacidade âncora × (seguidores /
  seguidores âncora)^0,7); lugares novos vazios não sobem a receita (teste).
- **Conforto 1–5:** ingresso × (1 + 0,06 × (nível − 1)). Obra: €100/160/240/350 por lugar para os níveis 2..5, 8..20 semanas.

## Demanda e público

```
demanda = capacidade âncora × ocupação da torcida (stadiumFillRate) × (seguidores / seguidores âncora)^0,7
        × tier da liga (1 / 0,6 / 0,4 / 0,3, relativo ao tier âncora) × fase da temporada
público = min(capacidade efetiva, demanda)
bilheteria = round(público × preço × conforto)        (público sem arredondar; 0 em campo neutro)
fase = 1,04 (primeiros 10% da janela da liga) · 0,98 (meio) · 1,06 (últimos 20%)   — média ≈ 1,002
```

**Calibração preservada por construção:** a âncora é o estádio, os seguidores e o tier no momento em que as
instalações são criadas. Com as instalações padrão (capacidade âncora, conforto 1) e fase neutra, o público é
`capacidade × ocupação` e a bilheteria é exatamente `gateRevenue(capacidade, tipo, neutro, ocupação)` (teste
`default facilities sell exactly the old gate`). A única diferença num jogo é a fase (−2% a +6%, média +0,2% na
temporada). A IA não muda. Ampliar acima da demanda não rende: o gráfico mostra a ocupação para o jogador decidir;
a demanda cresce com os seguidores (sucesso), cai com o rebaixamento.

Cada jogo em casa grava uma linha em `facilities.attendance` (data, competição, adversário, público, capacidade,
demanda; últimas 80) e o recorde (`facilities.record`). Recorde batido (havendo um anterior) → inbox.

## CT e base (níveis 1–5, nível 3 neutro)

| Nível | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| CT: recuperação diária | ×0,97 | ×0,985 | ×1 | ×1,04 | ×1,08 |
| CT: lesão no treino | ×1,05 | ×1,025 | ×1 | ×0,925 | ×0,85 |
| CT: DP do treino | ×0,95 | ×0,975 | ×1 | ×1,05 | ×1,10 |
| Base: nível da safra | −0,30 | −0,15 | 0 | +0,15 | +0,30 |
| Base: tamanho da safra | 3–5 | 3–5 | 3–5 | 3–5 | 3–6 |
| Base: chance de promessa | 3% | 4% | 5% | 7% | 9% |

- O CT multiplica os efeitos do staff (`staffEffectsOf`) na recuperação (descanso, dia de treino e quem não jogou no
  dia de jogo), na lesão de treino pesado e na DP do treino. **Nunca dentro da partida:** o motor, o quickSim, o fôlego de quem
  jogou e a familiaridade de estilo não mudam. A DP de partida só muda pela **condição** dos itens do CT do clube do
  jogador (abaixo de 40%, ver "Efeitos abaixo de 40%"); o nível do CT não mexe nela.
- A base entra em `generateIntake` **relativa ao nível implícito do tier** (`academyEffectsOf`: efeito do nível
  3 + nível − implícito): a IA fica sempre no neutro (o tier já conta no `TIER_BONUS`) e o clube do jogador ganha
  ou perde só pelos níveis que construiu acima ou abaixo do implícito do seu tier.
- Obras: custo = receita anual × 3/6/12/20% (CT, níveis 2..5) ou × 2/4,5/9/15% (base); 12..40 semanas.
- **Manutenção semanal** (`facilities_upkeep`, segunda): receita anual × (0,4% por nível do CT + 0,3% por nível da
  base **acima do nível implícito do tier**) / 52. Com os níveis iniciais é 0: o custo operacional (25% da receita)
  já cobre as instalações da classe do clube.

## Diretoria e dinheiro

- O jogador pede (`POST .../facilities/request` com `{ kind: "stand", stand, seats }` ou
  `{ kind: "comfort" | "training" | "academy" }`, sempre o próximo nível). Uma obra por tipo ao mesmo tempo
  (409 `busy`); nível 5 → 400 `maxLevel`; corpo inválido → 400; desempregado → 409 `noClub`; dono do save; trava do save.
- `boardDecision`: saldo negativo → `negative_balance`; diretoria < 50 → `board_low`; 50–69 e custo > 10% da receita
  anual → `too_big`; ≥ 85 a diretoria paga 25% (85) a 50% (100); a parte do clube tem de caber no saldo **menos o
  que falta pagar das obras em andamento** (`committedSpend`) → `no_money`.
  A tela mostra a previsão com a mesma função.
- **Parcelas mensais:** n = ⌈dias da obra / 30⌉; a parcela k vence em início + 30k dias (a primeira no próprio dia da
  aprovação, cobrada pelo avanço desse dia), todas pagas até o fim. Cada parcela: `facilities` (−custo/n) e
  `board_funding` (+parte da diretoria/n). As partes somam exatamente o custo e a parte da diretoria. A invariante do
  extrato (soma = saldo) continua, pois tudo passa por `recordMoney`.
- Inbox: `approved` na hora (rota); a recusa só aparece na tela (sem mensagem, o pedido acabou de ser feito);
  `completed` e `attendance_record` adiados para depois do `clearInbox`.

## Telas

- **Clube** (`/club`; `/finances?tab=facilities` redireciona): KPIs (capacidade, público médio da
  temporada, recorde, ingresso); estádio em SVG visto de cima, setores coloridos pela ocupação média (só exibição:
  a média da temporada repartida com leve preferência pelo setor Oeste) com rótulos em HTML (lugares, %); clicar num
  setor abre o painel de ampliação (+1K … +10K, custo, prazo, nova capacidade, previsão da diretoria, "Pedir à
  diretoria"); conforto; gráfico do público por jogo em casa (barras: jogados cheios, estimados tracejados) contra a
  capacidade (linha) e a demanda (tracejada), com tooltip; cartões do CT e da base (5 marcas, efeito atual e do
  próximo nível, custo, prazo); obras com barra de progresso e entrega; manutenção semanal.
- **Visão geral:** a projeção de bilheteria usa o mesmo público; filtros e linhas do extrato com os tipos novos.
- **Painel:** cartão Obras só com obra em andamento ou concluída nos últimos 7 dias.
- **Prévia da partida:** público esperado / capacidade nos jogos em casa (fora de campo neutro; a rota só é
  chamada para jogo em casa). As previsões (prévia, gráfico, projeção de bilheteria) usam a capacidade no dia do
  jogo (`DemandInput.date`): o setor conta pela metade só até o fim da obra e, depois, com os lugares novos.

## `/test`, `/lab`

Sem efeito dentro da partida (o CT age só no treino e na recuperação entre jogos; a base, na virada): nada a exibir.
O `/lab` (congestão) não aplica o CT: os elencos sintéticos não têm clube.

## Testes e smoke

```
bun test src/Domain/facilities src/backend/facilities.routes.test.ts src/Domain/youth \
  src/Domain/advanceDay/dailyTraining.test.ts src/Domain/advanceDay/matches.test.ts src/Domain/finance
```

`facilities.routes.test.ts`: dono do save, validação, recusa sem dinheiro, aprovação com a diretoria pagando 50%,
`busy`, parcela e verba no extrato com a soma = saldo, conclusão (capacidade nova, parcelas = custo, inbox),
demissão → clube da IA sem instalações e 409 `noClub`.

`scripts/season-rollover-smoke.ts`, seção "Instalações": a diretoria (forçada a 90 no pedido) aprova +1.000 lugares
no setor Leste; a obra termina na corrida; `venue.capacity` +1.000; os jogos depois usam a capacidade nova; público
nunca acima da capacidade; parcelas = custo e verba = parte da diretoria; bilheteria da liga = público × preço;
nenhum clube da IA grava instalações. A checagem de bilheteria da seção "Diretoria" e a do saldo na virada passaram
a considerar o público e as parcelas do dia.

## Limitações

- A ocupação por setor no desenho é ilustrativa (o público não é simulado por setor).
- A demanda não distingue adversário nem competição (só a fase da temporada); um clássico lota como um jogo comum.
- O custo por lugar usa o peso do país do ranking de técnicos; sem cache na meta ele é calculado na primeira consulta
  (lê os elencos de nível 1 do país e das 5 grandes) e guardado em memória por processo, por país e temporada.
- A familiaridade de estilo e a evolução da base fora de jogo (`developYouthSeason`) usam só o auxiliar, não o CT.

## Instalações vivas (Etapa 34, 4.11)

Spec: `docs/superpowers/specs/2026-10-08-living-facilities-design.md`. Plano: `docs/superpowers/plans/2026-10-08-living-facilities.md`.

### Itens

`ClubFacilities.items: Record<FacilityItemId, FacilityItem>` (`{ level 1..10, wear ≥ 0, condemned?, alert? }`), só o
clube do jogador. Os níveis 1–5 de conforto, CT e base são **derivados**: `groupLevel` = média dos níveis dos itens do
grupo / 2 (contínuo; item interditado conta nível 1), `comfortLevel` = nível dos assentos / 2; as tabelas 1..5 são
lidas por interpolação (`lerpLevel`). Saves sem `items`: recriados pelo `initialFacilities` na primeira leitura da rota.

| Item | Grupo | Vida (temporadas, nível 5) | Desgaste (tempo / jogos em casa / treinos) | Jardineiro |
|---|---|---|---|---|
| `stadiumPitch` Gramado do estádio | estádio | 1 | 0,40 / 0,60 / 0 | sim |
| `seats` Arquibancadas e assentos | estádio | 4 | 0,60 / 0,40 / 0 | — |
| `stadiumStructure` Estrutura e iluminação | estádio | 5 | 1 / 0 / 0 | — |
| `trainingPitches` Campos de treino | CT | 1 | 0,40 / 0 / 0,60 | sim |
| `gym` Academia | CT | 2 | 0,30 / 0 / 0,70 | — |
| `pool` Piscina | CT | 4 | 0,60 / 0 / 0,40 | — |
| `physio` Fisioterapia | CT | 3 | 0,70 / 0 / 0,30 | — |
| `canteen` Refeitório | CT | 5 | 1 / 0 / 0 | — |
| `academyPitches` Campos da base | base | 1,5 | 1 / 0 / 0 | metade |
| `academyLodging` Alojamento da base | base | 4 | 1 / 0 / 0 | — |

```
condição = 100 × (1 − min(1, wear)²)          (interditado: 0)      40% ⇔ wear 0,775 · 15% ⇔ wear 0,922
Δwear/dia = [tempo/365 + jogos × jogos em casa hoje/25 + treinos × sessão/200] / (vida × (0,75 + 0,05 × nível))
            × jardineiro (só gramados)          sessão = leve 0,7 · normal 1 · pesado 1,3 (0 em jogo, folga, sem clube)
```

Criação: CT e base no nível 2 × implícito do tier (MEDIUM 6 de 10), gramado e estrutura idem, assentos em 2; desgaste
inicial determinístico (`fac:<clube>:<item>`): gramados 0,05–0,25, demais 0,05–0,45 — nada abaixo de 40%, então a
largada é a de antes.

### Efeitos abaixo de 40% (`itemEffects`, `FACILITIES.WEAR`)

`penalty = clamp((40 − cond)/40, 0, 1)`; cada efeito `1 + (máximo − 1) × penalty`.

| Item | Efeito | Em 0% | Onde |
|---|---|---|---|
| Gramado do estádio | Lesões dos dois times nos jogos em casa | ×1,6 | `matchInjuryMults` (motor), `staffMult` (quickSim) |
| Assentos | Demanda; preço | ×0,90; ×0,95 | `demandOf`, `comfortPriceMult` |
| Estrutura | Demanda | ×0,95 | `demandOf` |
| Campos de treino | Lesão no treino pesado; chance nova no normal/leve (até 0,5%); DP do treino | ×1,6; `HEAVY × 0,5 × penalty`; ×0,95 | `trainingGroundEffectsOf` |
| Academia / refeitório | DP do treino | ×0,93 / ×0,97 | idem |
| Campos de treino + academia + refeitório (média da condição) | DP de partida, só crescimento (nunca o declínio por idade) | ×0,82 (`CT_MATCH_DEV_MIN`) | `matchDevMult` → `finalizeSquadsAfterMatch` |
| Piscina | Recuperação diária | ×0,97 | idem |
| Fisioterapia | Recuperação; dias fora de toda lesão nova (com o médico) | ×0,97; ×1,25 | idem; `injuryDurationMult` (nível: ×(1 − 0,03 × (nível − 2 × implícito)), 0,85..1,15) |
| Campos da base / alojamento | Nível da safra; promessa | −0,15 cada; ×0,8 | `academyEffectsOf` |

Abaixo de **15%** o item fica `condemned` (condição 0, nível 1 no grupo) até a **reconstrução**; não aceita reforma.
Mensagens `worn` (cruzou 40%) e `condemned` (15%), uma por cruzamento (`alert`), adiadas para depois do `clearInbox`.

### Gramado de todo jogo (`src/Domain/facilities/pitch.ts`)

`matchPitchCondition(mandante, fixture, janela, data)`: campo neutro 90; mandante humano com itens → condição do
`stadiumPitch`; IA → `START[tier] − DROP[tier] × fração da janela da liga do mandante` (START 70/80/88/94, DROP
40/44/40/30 por LOW/MEDIUM/HIGH/ELITE; nada gravado, renova na temporada nova). Calculado no `advanceDay` antes de
cada partida (motor e quickSim), gravado em `MatchEvent.pitchCondition`, e devolvido pelo `/api/match-setup`
(`pitchCondition`, prévia "Gramado: N%"). Fator `pitchInjuryMult` × staff nas lesões dos dois times.

### Jardineiro

Fator dos gramados = curva das estrelas do melhor (1★ ×1,3, 3★ ×1, 5★ ×0,75) × 0,9 por jardineiro a mais; sem
jardineiro ×1,6; campos da base com metade do desvio. Limite LOW 1 · MEDIUM 1 · HIGH 2 · ELITE 2 (`staff.md`).

### Reforma, reconstrução, melhoria (`POST .../facilities/request`)

| Pedido | Corpo | Regra |
|---|---|---|
| Reforma | `{ kind: "repair", item, to }` | `to` múltiplo de 5, acima da condição, ≤ 100; item não interditado |
| Reconstrução | `{ kind: "rebuild", item }` | só abaixo de 15% ou interditado; volta a 100% no mesmo nível |
| Melhoria | `{ kind: "upgrade", item }` | +1 nível (≤ 10), 100% na entrega |
| Obras de grupo | `comfort` / `training` / `academy` | próximo nível do grupo; cada item do grupo vai a `max(nível, 2 × novo)` e 100% |

`valor = receita × VALUE_SHARE[item] × nível / 6`; reforma = valor × Δcondição/100 × 0,6; reconstrução = valor;
melhoria = valor(nível + 1) × 0,6. **Reforma pequena** (≤ 2% da receita anual, `SMALL_REPAIR_SHARE` — decisão do
usuário: quase toda reforma é pequena) é paga na hora (`payRepairNow` + `recordMoney`, uma linha `facilities` com
`ref.facility = "repair"`, num `BufferingSaveDAL` da requisição), sem diretoria; `no_money` se o saldo menos o
comprometido não cobre. Reforma grande, reconstrução e melhoria passam pelo `boardDecision` com parcelas mensais.
Um projeto por item (`itemBusy`; obra de grupo ocupa o grupo, 409 `busy`); 400 `invalidRequest` (pedido impossível
para o item) ou `maxLevel` (melhoria no nível 10). Entrega: condição no alvo, `condemned`/`alert` saem, inbox
`repaired` (melhoria: `upgraded`). Extrato: `facilityRepair/Rebuild/Upgrade` e `boardFundingItem` com o item.
`GET .../facilities` traz `items` (nível, condição, efeitos, obra, cotações de reforma +25/+50/100%, reconstrução e
melhoria, cada uma com `forecast`: pago pelo clube ou a previsão da diretoria).

### Contratação

`facilitiesAppeal` = condição média do CT (≤ 21 anos: média de CT e base); só o clube do jogador (IA = 100).
Numa contratação (não na renovação) o pedido ganha `facilities = 1 + 0,10 × clamp((50 − appeal)/50, 0, 1)`
(`demandBreakdown`, linha "Instalações ruins: +N%"); recusa `poorFacilities` com ambição ≥ 17 e CT < 25% (compra,
livre, pré-contrato → 400); `preferenceScore` desconta até 0,10 (`preferredClub` pode responder `facilities`).
A rota `demand` devolve `facilities` (e `refusesPoorFacilities` quando o olheiro vê a ambição).

### Telas (#120)

Aba **Clube** na barra superior (`/club`, `ClubScreen` → `FacilitiesView`), depois de Elenco: as instalações saíram de
Finanças (que fica só com o dinheiro; `/finances?tab=facilities` redireciona para `/club`). Seção nova **Instalações
em detalhe** (`FacilityItemsPanel`): três tabelas (Estádio, CT, Base), por item "N de 10", barra de condição (primária
≥ 40, âmbar 15–39, vermelha < 15/"Interditado"), efeito atual abaixo de 40%, obra em andamento, botões Reformar
(até +25/+50/100%), Reconstruir e Melhorar com painel de custo, prazo e "Pago pelo clube" ou a previsão da diretoria.
Painel: Obras mostra as reformas (link para `/club`), Atenção lista itens desgastados/interditados da última semana.
Prévia: "Gramado: N%" (vermelho abaixo de 40). Desempregado: `/club` vira a tela "Sem clube".

### `/test`, `/lab`

`/test`: seletor **Pitch** (100/90/60/40/20/0, padrão 90) para o jogo todo, `EnergyPanel` com `pitch N% · injury ×`,
QuickSim com a condição, cenário `bad-pitch` (10%), `debugLog('injury')` com `injuryMult`. `/lab`:
`Variant.pitchCondition` (slider; a da variante A vale para o jogo), rótulo `· pitch N%`, linha "Pitch" no `PairDetail`.

### Medições (2026-10-08)

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

### Testes

```
bun test src/Domain/facilities src/backend/facilities.routes.test.ts src/backend/facilities.advanceDay.test.ts \
  src/Domain/contracts src/Domain/negotiation src/Domain/finance/ledgerText.test.ts src/GameInterface/Dashboard
```

Smoke (`season-rollover-smoke.ts`, "Instalações"): condição em 0..100 e sem subir fora de entregas; gramado forçado a
45% → `worn`; reforma pequena pela rota (linha `repair` = custo, sem verba da diretoria) → `repaired` a ~100%; clubes
da IA de liga virada começam a temporada nova num gramado melhor; rota `demand` com o CT a 20% → `facilities > 1`.
