# Finanças do clube (salários, extrato, bilheteria, premiação)

Spec: `docs/superpowers/specs/2026-09-27-prizes-and-finances-design.md`. Plano:
`docs/superpowers/plans/2026-09-27-prizes-and-finances.md`. Ver também
`.claude/rules/AI-clubs/finance.md` (orçamento e mercado da IA, que consome a mesma curva de
salário e as mesmas verbas de prêmio).

## Regra

- Uma curva de salário só de FORMATO (`nota → salário`), corrigida por um FATOR por clube que
  encosta a folha real em 60% da receita daquele clube, carregado adiante entre temporadas em vez
  de recalculado do zero.
- Todo crédito e débito do clube do jogador passa por um **extrato** (`ledger`) — nunca uma
  gravação direta de `finances.budget`. O saldo soma exatamente o extrato.
- Bilheteria (jogo em casa) rende em qualquer competição — liga, copa nacional, continental (2×) —
  não só na liga.
- Premiação por posição de liga (na virada), por fase vencida de copa nacional (no dia) e por
  evento continental (participação, resultado de grupo, fase, título — no dia). Metade de todo
  prêmio de um clube da IA entra na verba de transferências da temporada.
- O saldo do jogador **pode ficar negativo** — só um aviso, sem punição nesta etapa.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/Domain/finance/wageConfig.ts` | Constantes da curva de salário (`SCALE`/`GROWTH`/`FLOOR`) + do fator de clube (`TARGET_SHARE`/`MIN_FACTOR`/`MAX_FACTOR`), calibradas pelo script |
| `src/Domain/finance/wages.ts` (+ teste) | `weeklyWage`, `clubWageFactor`, `carryForwardWageFactor`, `playerWeeklyWage`, `squadWeeklyWages`, `clubAnnualRevenue`, `wageFactorOf`/`wageRevenueBasisOf` |
| `scripts/wage-calibrate.ts` | Calibra a curva + fator no mundo inteiro; imprime folha/receita por liga e o estado de contratação da IA |
| `src/Domain/finance/ledger.ts` (+ teste) | `LedgerEntry`, `applyMoney` (pura), `totalsByKind`, `weeklyNet` |
| `src/Domain/finance/gate.ts` (+ teste) | `gateRevenue(capacidade, "league"\|"cup"\|"continental", neutral?)` |
| `src/Domain/finance/prizeConfig.ts` / `prizes.ts` (+ teste) | Tabelas e cálculo puro de prêmios (liga, copa, continental, teto da IA) |
| `src/Domain/advanceDay/financial.ts` (+ teste) | `computeAdvanceDayMoney` (lançamentos do dia), `weeklyOperationalCost` |
| `src/backend/dal/*` (`ISaveDAL`/`FileSystemDAL`/`BufferingSaveDAL`) | `readLedger`/`appendLedger`/`writeLedger`/`listLedgerSeasons` |
| `src/backend/SaveService.ts` | Expõe `getLedger`/`appendLedger`/`listLedgerSeasons`; grava `wageFactor`/`wageRevenueBasis` em `createSave` |
| `src/backend/FinancialService.ts` | `recordMoney` (ponto único de gravação: squad + extrato), `applyBroadcasting`, `executeTransferFee`/`transferFeeSquads` |
| `src/backend/advanceDay.ts` | Lançamentos do dia (segunda-feira + bilheteria), prêmios de copa/continental (`awardClubPrize`) e de liga (na virada), aviso de saldo negativo |
| `src/backend/routes.ts` | `GET /api/saves/:saveId/ledger?season=` |
| `src/GameInterface/FinancesScreen.tsx` | Tela a partir do extrato |
| `src/GameInterface/InboxScreen.tsx` | Mostra o valor do prêmio nas mensagens de temporada/copa/continental e o aviso de saldo negativo |
| `scripts/season-rollover-smoke.ts` | Seção "Finanças" (ver abaixo) |

## 1. Salários

> **Desde a Etapa 7 (contratos, 1.7)** a folha de um clube é a soma de `contract.wage` de cada jogador
> (`squadWeeklyWages`), um salário FIXO gravado quando o contrato nasce (criação da carreira, contratação,
> renovação). A curva + fator abaixo só calcula esse valor na hora de criar/renovar um contrato. Ver
> `.claude/rules/game/contracts.md`. A linha semanal `wages` do extrato é a soma dos contratos do elenco
> naquela segunda-feira (checada no smoke).

### Curva + fator de clube

Uma curva baseada só na nota do jogador não fecha: dentro de um único nível de pirâmide (ex.
"1ª divisão") a RECEITA dos clubes varia por ordens de grandeza muito mais do que a NOTA dos
jogadores — o nível 1 sozinho junta a Premier League com a primeira divisão do Quênia. Por isso o
desenho separa duas coisas:

- `weeklyWage(nota)` (`wages.ts`) — lei de potência `SCALE × nota^GROWTH`, com piso `FLOOR`. Define
  só a FORMA (quanto um jogador de nota 7 custa a mais que um de nota 6), calibrada para que o
  degrau 6→7 seja um aumento plausível (~2×, escolha de design) e para que a curva sozinha já sirva
  quase sem correção nas 5 grandes ligas europeias.
- `clubWageFactor(receita, folhaDaCurva)` — multiplicador por clube que corrige a folha real para
  exatamente 60% (`TARGET_SHARE`) da receita DAQUELE clube, limitado a `[MIN_FACTOR, MAX_FACTOR] =
  [0,08×, 4×]`. O piso começou em `0,25×`: 93 dos 137 clubes de nível 3+ batiam nele e a mediana do
  nível ficava em 0,80 (pior que sem correção nenhuma). Com `0,08×` a mediana volta a 0,60 (p90
  0,67), só 21 clubes ainda no piso — os que a receita genuinamente não sustenta.
- **Fator carregado adiante** (`carryForwardWageFactor(fatorAntigo, receitaAntiga, receitaNova) =
  clamp(fatorAntigo × receitaNova / receitaAntiga, MIN, MAX)`), não recalculado do zero a cada
  virada — senão a folha voltaria a exatamente 60% da receita todo ano, ignorando como o clube
  realmente gastou. `Squad.wageFactor` + `Squad.wageRevenueBasis` (a receita usada da última vez)
  são gravados juntos: na criação da carreira (`createSave`, todo clube) e em toda virada
  (`advanceDay.ts`, depois de `applyTierFinanceChange`, antes de gravar o squad). Ausentes →
  `wageFactorOf`/`wageRevenueBasisOf` calculam na hora a partir do squad atual, sem histórico.
- `estimateWeeklyWage`, `Player.salaryLabel` e o `FinancesScreen` usam todos `playerWeeklyWage`
  (curva × fator do clube) — uma única fonte, nunca uma cópia local da fórmula.

### Calibração (`scripts/wage-calibrate.ts`, rodada 2026-09-27, 1273 clubes / 83 ligas)

Busca em grade o degrau 6→7 (2,0–2,5×) e a forma (potência × exponencial), minimizando a fração de
clubes saturados no fator, com `SCALE` resolvido pela mediana das 5 grandes a cada combinação.
Vencedor: **potência, degrau 2,00×** (`clamped 2,5%` contra `3,7%` da exponencial no degrau 2,5×).

```
SCALE = 54,0721   GROWTH = 4,4966   FLOOR = €639
TARGET_SHARE = 0,60   MIN_FACTOR = 0,08   MAX_FACTOR = 4
```

Folha/receita pós-fator, por nível:

| Nível | n | mediana | p10 | p90 | no piso | no teto |
|---|---|---|---|---|---|---|
| 1 (topo) | 918 | 0,60 | 0,60 | 0,60 | 0 | 4 |
| 2 | 218 | 0,60 | 0,60 | 0,60 | 0 | 0 |
| 3+ | 137 | 0,60 | 0,60 | 0,67 | 21 | 7 |

Exemplos de salário semanal (clube representativo, fator mais perto da mediana da liga):

| Liga | Clube | Fator | Receita anual | Nota 4 | Nota 5 | Nota 6 | Nota 7 |
|---|---|---|---|---|---|---|---|
| Premier League | Fulham | 1,11 | €199.641.934 | €30.605 | €83.473 | €189.492 | €378.984 |
| Championship | Sheffield United | 0,33 | €18.505.960 | €9.167 | €25.002 | €56.758 | €113.516 |
| Kenyan Premier Division | AFC Leopards | 2,08 | €35.908.682 | €57.417 | €156.604 | €355.507 | €711.014 |

### Orçamento de salário da IA (vem da receita, não de um orçamento fixo)

`maxWageBudget = WAGE_REVENUE_SHARE × wageRevenueBasis / 52 × SOFT_BALANCE[tier]`
(`aiClubFinance.ts`), lendo a MESMA `wageRevenueBasis` gravada no squad — nunca uma receita
recalculada com um `homeGames` genérico, senão o teto e a folha real ficam em bases diferentes.
`WAGE_REVENUE_SHARE = 0,72` (não o `0,67` mais próximo do alvo 92/5/3 por soma de quadrados — nesse
valor a razão folha/teto do nível ELITE fica em ~0,90–0,94, empurrando os 40 clubes ELITE do mundo
para "tight" permanentemente). Com `0,72` essa razão cai para ~0,877. Distribuição de contratação no
mundo inicial (1273 clubes, `share` na config de produção): **99,0% `open` / 0,5% `tight` / 0,5%
`frozen`**; por nível LOW 95,7%/2,3%/2,0%, MEDIUM/HIGH/ELITE 100% `open`.

### Custo operacional

Decisão do usuário: 25% da receita anual (a mesma `wageRevenueBasis`), cobrado semanalmente
(`OPERATIONAL_COST_SHARE = 0,25` em `src/Domain/advanceDay/financial.ts`), não mais 10% da folha.
Para um clube não saturado no fator (folha ≈ 60% da receita), o saldo típico de temporada antes de
prêmios é `receita × (1 − 0,60 − 0,25) = 15%` — positivo por construção. Um clube saturado (piso ou
teto do fator) se afasta desse número.

## 2. Extrato (`ledger`)

- Etapa 21 (`.claude/rules/game/negotiation.md`): `transfer_in`/`transfer_out` com `ref.stage = "sell_on"`
  (cláusula de venda futura recebida, ou paga pelo jogador ao vender quem tinha cláusula) ou `"loan_fee"` (taxa de
  empréstimo). A linha semanal `wages` soma a parte do salário dos jogadores emprestados que o clube paga (o
  emprestado no elenco conta só a parte combinada; o cedido, o resto).
- `saves/{id}/ledger/{temporada}.json`: lista de `LedgerEntry { date, kind, amount, label, ref? }`
  (`amount` com sinal). `kind`: `broadcasting`, `commercial`, `wages`, `operational`, `staff`, `gate`,
  `prize`, `transfer_in`, `transfer_out`, `club_change`. A temporada do extrato é o `year` da meta da liga do
  jogador; a virada começa um arquivo novo.
- `applyMoney(squad, entry)` (`ledger.ts`) é pura: devolve o squad com `finances.budget` movido por
  `entry.amount`, **sem clamp** — o saldo pode ficar negativo. `recordMoney(service, saveId,
  season, squadRef, entry)` (`FinancialService.ts`) é o único ponto de E/S: lê o squad, aplica
  `applyMoney`, grava o squad e faz `appendLedger` na mesma chamada. **Todo** movimento do clube do
  jogador passa por aqui: TV inicial (`applyBroadcasting`) e da virada
  (`applyPlayerBroadcastingCredit`), a segunda-feira (comercial/salários/operacional), bilheteria de
  qualquer competição em casa, prêmios de liga/copa/continental e taxas de transferência
  (`executeTransferFee`).
- **Persistência bufferizada e idempotente:** `BufferingSaveDAL` guarda `writeLedger` (troca
  completa) como o recurso bufferizado; `appendLedger` é um read-then-write em cima dele, então
  reflushar uma escrita já parcialmente aplicada nunca duplica lançamentos — o thunk pendente
  sempre grava a lista COMPLETA, nunca só o que mudou desde o último flush. `appendLedger` lê o
  cache DEPOIS do `await` de `readLedger`, não o valor resolvido, para não perder um append
  concorrente na mesma chave. `writeLedger`/`appendLedger` ficam na fase 1 do flush (toda escrita
  exceto meta), com `listLedgerSeasons`/`readLedger` fora do buffer — ver
  `.claude/rules/game/membership.md` → "Ordem do flush do `BufferingSaveDAL`".
- **Troca de clube (`club_change`, Etapa 20, `.claude/rules/game/jobs.md`):** ao sair de um clube o saldo
  sai do extrato ("leave", `−saldo`); ao chegar, o saldo inicial (a verba sazonal da IA) entra ("arrive"). Assim
  a invariante abaixo vale para o clube atual (desempregado, a soma é 0). Não conta como receita/despesa na tela.
- **Invariante:** a soma de todos os lançamentos do jogador, em todas as temporadas, é igual ao
  orçamento atual — o orçamento do clube do jogador começa em 0 (`SaveService.createSave`) e nunca
  é escrito fora de `applyMoney`/`recordMoney`. É a checagem 1 da seção "Finanças" do
  `season-rollover-smoke.ts`.
- **Start kits preservam o orçamento e os fatores do jogador.** Um kit é uma fotografia genérica do
  mundo, sem conceito de jogador — todo clube nele, inclusive o que vai virar o do jogador, está
  com o `finances.budget` que tinha quando o kit foi gerado. `applyRandomStartKit` captura o
  orçamento do clube do jogador ANTES de aplicar o kit e o restaura DEPOIS (`FinancesService`/
  `startKits.ts`), preservando a invariante acima também numa carreira com pré-simulação (ligas de
  ano civil). Da mesma forma, `applyKit` lê `wageFactor`/`wageRevenueBasis` de TODOS os squads
  frescos do save (calculados por `createSave` com o tamanho real da liga) antes de sobrescrever
  com os squads do kit, e os transplanta de volta por id — um kit nunca perde o fator calibrado do
  save que acabou de ser criado.
- **Limitação conhecida: fase 1 do flush não é atômica entre recursos.** `recordMoney` grava o
  squad E o lançamento como dois recursos bufferizados separados (`squad:*` e `ledger:*`); dentro
  da fase 1 do flush eles são tentados em paralelo (`FLUSH_CONCURRENCY`), cada um com seu próprio
  sucesso/falha — uma falha de rede/disco pode gravar um sem o outro. Uma fase 1 parcialmente
  falha deixa a meta (com `currentDate`) sem gravar, então o dia não conta como avançado e é
  reprocessado; mas o reprocessamento recalcula os lançamentos do zero a partir do squad em disco,
  então se o squad já tinha sido escrito (mas não o lançamento) na tentativa anterior, o retry pode
  duplicar esse crédito/débito no squad enquanto o extrato só ganha uma cópia do lançamento. Não
  corrigido nesta etapa — infraestrutura compartilhada com todo o resto do `BufferingSaveDAL`, fora
  do escopo desta feature; só afeta o caso raro de uma falha de E/S no meio de um `flush`.

### Bilheteria (`gate.ts`)

Mesmo modelo em todo lugar: `capacidade × 0,65 (FILL_RATE) × preço`. O clube do jogador usa a ocupação da
torcida (`stadiumFillRate`, 0,45..0,9, 0,65 com a torcida em 60 — `.claude/rules/game/board-fans.md`). Preço da liga e da copa
nacional é `TICKET_PRICE = 25`; continental é `2× (CONTINENTAL_MULT)`. Jogo em campo neutro
(final de copa/continental) rende 0. O avanço do dia e a projeção da tela chamam a mesma função
(`gateRevenue`) — nenhum modelo paralelo.

### Lançamentos do dia (`Domain/advanceDay/financial.ts` → `computeAdvanceDayMoney`)

Numa segunda-feira: `commercial` (+, `finances.commercial / 52`), `wages` (−,
`squadWeeklyWages(elenco, wageFactorOf(squad))`), `operational` (−, `weeklyOperationalCost`). Para
cada jogo em casa do jogador hoje, em QUALQUER competição (liga, copa, continental — o
`date-index` de toda pasta já é lido pelo avanço de dia): um lançamento `gate`. Sem `Math.max(0,
…)` — o saldo pode ficar negativo.

### Caixa negativo

Quando o saldo cruza de `≥ 0` para `< 0` num dia (comparado antes/depois de aplicar os lançamentos
do dia, sequencialmente — nunca em paralelo, porque cada lançamento é um read-modify-write em cima
do resultado do anterior), a inbox recebe uma mensagem `season` de `kind: "negative_balance"` com o
saldo do dia. Sem punição além do aviso nesta etapa.

## 3. Premiação

Config em `src/Domain/finance/prizeConfig.ts`, funções puras em `prizes.ts`.

### Liga (na virada, com a TV)

```
mérito = TV do clube (nesta temporada) × 0,20 (MERIT_SHARE) × (n − posição) / (n − 1)
campeão += TV × 0,05 (CHAMPION_SHARE)
```

`n < 2` paga 0 (não há espalhamento). Pago no laço de virada de `advanceDay.ts`, para TODO clube
com posição final na tabela — não só quem mudou de liga ou foi campeão. Jogador: `applyMoney` sobre
o squad já resetado + `appendLedger` na temporada NOVA (o mesmo arquivo que recebe o crédito de TV
da virada). IA: `aiBudgetWithPrize` chamado DEPOIS de `applyAISeasonReaction` (que já reconcedeu a
verba da temporada nova) — o prêmio entra em cima da verba nova, nunca acumula sobre uma velha.

Inbox: `kind: "league_prize"` sempre dispara uma vez por virada quando há prêmio (`prize > 0`),
**independente** de campeão/promovido/rebaixado/seguidores — um meio de tabela também recebe (e vê)
seu prêmio de mérito, e isso nunca dobra com as outras mensagens de temporada (revisão: um clube
pode ser campeão E promovido na mesma temporada, o que antes prendia o mesmo prêmio a duas
mensagens).

### Copa nacional (no dia em que a fase é vencida)

Base = TV média dos clubes da liga de nível 1 do país (`cupPrizeBase`, `cupWorld.ts`, com cache por
dia). Cada fase VENCIDA paga uma fração da base:

| Fase | preliminar/r128/r64 | r32 | r16 (oitavas) | qf (quartas) | sf (semi) | vice | campeão (final) |
|---|---|---|---|---|---|---|---|
| Fração | 0,3% | 0,5% | 0,8% | 1,1% | 1,5% | 2,0% | 4,0% |

O campeão recebe só o valor de campeão pela final, não vice + campeão. Aplicado no mesmo dia em que
`advanceCupStages` decide a fase, via `awardClubPrize` (jogador → extrato `prize`; IA →
`aiBudgetWithPrize`).

### Continental (no dia)

| | Champions | Europa League | Libertadores | Sul-Americana |
|---|---|---|---|---|
| Participação (grupos) | €15M | €4M | €3M | €1M |
| Vitória / empate nos grupos | €2,8M / €0,9M | €0,6M / €0,2M | €0,3M / €0,1M | €0,1M / €0,05M |
| Classificação às oitavas | €9M | €1,2M | €1,2M | €0,5M |
| Quartas | €10M | €1,8M | €1,7M | €0,6M |
| Semifinal | €12M | €2,8M | €2,3M | €0,8M |
| Final | €15M | €4,5M | €5M | €1,5M |
| Título | +€4M | +€4M | +€17M | +€5M |

- **Participação:** paga na primeira rodada de grupos JOGADA (não na geração — senão pagaria antes
  do start kit substituir a competição).
- **Vitória/empate:** a cada jogo de grupo (rodadas 1–6).
- **Fase alcançada:** `continentalStagePrizesFromEvents` mapeia o evento `advanced` (que carrega a
  fase DE ONDE o clube saiu) para a fase QUE ELE ALCANÇOU: grupo→oitavas, oitavas→quartas,
  quartas→semi, semi→final. Um `advanced` com `stage: "final"` (o campeão "avançando" da final para
  fora) é pulado — não existe fase seguinte; o campeão é pago separado pelo evento `champion`
  (bônus de título).
- **Sem pagamento de eliminação.** Diferente da copa nacional (que paga o vice), o continental não
  paga nada por ser eliminado — só participação, resultado de grupo, fase alcançada e título. Isso é
  deliberado: um clube eliminado na mesma rodada em que ganhou seu prêmio de grupo (rodada 6) não
  deve parecer que está sendo pago por cair fora.
- Jogador → extrato `prize`; IA → `aiBudgetWithPrize`.

### IA: metade do prêmio na verba, com teto

`aiBudgetWithPrize(atual, prêmio, verbaSazonal)` soma `AI_PRIZE_SHARE = 0,5` do prêmio à
`aiTransferBudget`, nunca passando de `MAX_BALANCE_RATIO × verbaSazonal` (`1,5×`, a mesma constante
que `applyAITransferSale` já respeita para vendas — `AI_FINANCE_CONFIG.TRANSFER_BUDGET`), e nunca
reduzindo uma verba já no teto ou acima dele.

### Continental como "boa temporada" (`clubSeasonOutcome`)

Uma final continental conta como `continentalGood` (mesmo peso do top 15% doméstico, tanto para o
passo de tier da IA quanto para os seguidores — inclusive do clube do JOGADOR, via
`applyHumanSeasonReaction`, que usa o mesmo `ClubSeasonOutcome`); só o TÍTULO conta como
`continentalTitle`, o gatilho estrito equivalente a ser campeão doméstico para poder entrar no tier
ELITE (chegar à final sozinho não libera ELITE).

**Lacuna de tempo conhecida.** `continentalGoodClubsThisSeason` (`continentalWorld.ts`) só enxerga
finais JÁ SORTEADAS em disco no momento em que a virada de um país roda. Uma final continental é
sorteada bem depois da maioria das ligas terminar (semis caem em abril/maio), então na prática isso
só dispara para os países que viram TARDE o bastante no ano — principalmente as ligas europeias de
ano civil (Bielorrússia, Finlândia, Geórgia, Islândia, Noruega, Suécia — viram em dezembro, bem
depois da final continental). Uma liga de ano cruzado (ago–mai, ex. Premier League) vira no verão,
em geral TAMBÉM depois da final — não fica de fora por completo, mas o conjunto é lido no momento
exato da virada DAQUELE país, então um país que vira cedo demais em relação ao calendário
continental ainda pode perder uma final decidida depois. Sem correção nesta etapa — lacuna
documentada para quem revisitar.

### Inbox com valores

As mensagens já existentes (fim de temporada da liga — `league_prize`, eliminação/título de copa e
continental, classificação às oitavas continental) mostram o valor pago naquele dia
(`PrizeLine`/`t("inbox.prizeAmount")`, `InboxScreen.tsx`). Nenhuma categoria nova de inbox.

## 4. Tela de Finanças

`GET /api/saves/:saveId/ledger?season=YYYY` (dono do save; sem `season` = temporada atual da liga
do jogador; 404 sem extrato para a temporada pedida) devolve `{ season, seasons, entries, totals,
weekly, balance }`. `FinancesScreen.tsx` lê só essa rota (mais `squad`/`fixtures` do
`GameSaveProvider` para as projeções):

- Cartões: saldo (vermelho se negativo), receita/despesa/prêmios da temporada (de `totals`);
- Aviso de saldo negativo quando `balance < 0`;
- Gráfico de saldo semanal real (`weekly`, últimas 12 semanas) — sem senoides nem dado inventado;
- "Receitas" e "Despesas" por tipo a partir de `totals` (TV, comercial, bilheteria, prêmios,
  transferências recebidas / salários, operacional, transferências pagas);
- Lista do extrato (mais novo primeiro), filtro por tipo, seletor de temporada quando há mais de uma;
- Projeção da folha/operacional semanal com `squadWeeklyWages`/`weeklyOperationalCost` (mesmas
  funções puras do servidor);
- Projeção de bilheteria dos próximos jogos em casa (qualquer competição) com `gateRevenue`.

## 5. `/lab` e `/test`: resultados de mata-mata

`extraTimePlayed`/`shootoutsWon`/`penaltiesTaken`/`penaltiesScored` já existem em
`Statistics.ts` → `simulateMatch().teamStats`; a Etapa 3 os propaga:

- `/lab`: `Variant.knockout?: boolean` (default falso) roda `simulateMatch(..., { knockout: true })`;
  os campos entram em `TeamRawStats` → agregação do `balanceWorker.ts` → `PerMatchView` e
  `VariantSummary.shootoutWinPct` → uma linha em `PairDetail` (extra time / pênaltis vencidos).
- `/test`: `StatsPanel.tsx` mostra "Extra time"/"Penalties" quando `extraTimePlayed`/
  `penaltiesTaken` são positivos, com o placar de pênaltis (`penaltiesScored`) por time.

## 6. Testes

```
bun test src/Domain/finance src/Domain/advanceDay/financial.test.ts \
  src/backend/FinancialService.test.ts src/backend/dal src/backend/routes.test.ts
```

Cobrem: curva de salário (monotônica, piso, euros inteiros), `clubWageFactor`/
`carryForwardWageFactor` (clamp, sem base anterior), tabela de prêmios (1º/último/meio, `n = 1`,
campeão de copa só recebe o valor de campeão, teto da IA inclusive já acima dele),
`applyMoney`/extrato (soma, saldo negativo, `totalsByKind`, `weeklyNet` por segunda-feira),
bilheteria por competição e campo neutro, `appendLedger` bufferizado idempotente (dois `append` no
mesmo dia viram um arquivo com as duas entradas só depois do flush; nada é gravado sem flush), rota
`GET /ledger` (dono do save, `season` inválida, 404 sem extrato), e o PUT do squad ignorando
`finances` do corpo.

`bun scripts/season-rollover-smoke.ts` (~10–15 min) roda uma temporada inteira e, na seção
"Finanças": a soma do extrato do jogador em todas as temporadas bate com o orçamento final (que
começa em 0, antes até da TV inicial); há pelo menos um lançamento `prize` de liga depois da
virada; reporta (falha só se nenhum for encontrado, senão só informa a maior razão observada) um
clube da IA com campanha continental cuja `aiTransferBudget` ficou acima da verba sazonal fresca;
nenhuma `aiTransferBudget` do mundo inteiro acima de `MAX_BALANCE_RATIO × verba`; todo squad do
mundo tem `wageFactor` e `wageRevenueBasis` numéricos; imprime (sem falhar) os totais de
receita/despesa do jogador por tipo, em todas as temporadas.

## 7. Limitações conhecidas

- **Receita inflada em dados de ligas menores.** A receita estimada (`broadcasting + commercial` +
  bilheteria) de algumas ligas fora das grandes coberturas fica alta demais para o nível esportivo
  real do país — ex. Kenyan Premier Division: AFC Leopards tem receita anual ~€35,9M (fator 2,08×)
  na calibração 2026-09-27, perto da Championship inglesa (Sheffield United, ~€18,5M). É um efeito
  dos dados de origem (open-football/ESPN), não da fórmula de salário — o fator + o clamp
  absorvem parte disso, mas não corrigem o dado de base.
- **`of_argentine_second_division_group_b` é uma exceção estrutural.** Mediana `folha/receita`
  0,76 mesmo depois do fator, com os 16 clubes da liga presos no piso `MIN_FACTOR` — uma
  característica pré-existente dos dados financeiros dessa liga (ver
  `.claude/rules/data/openfootball-import.md` → "Correção manual de tier"), não corrigida por
  este trabalho.
- **Lucro do clube ≈ 15% da receita antes de prêmios, por construção.** Para um clube não saturado
  no fator de salário, `receita − folha (60%) − operacional (25%) = 15%` é sempre positivo —
  intencional (ver seção 1), mas significa que o saldo "de base" de qualquer clube bem calibrado é
  sempre superavitário; só prêmios, transferências e clubes saturados no fator produzem desvio
  real desse número.
- **Fase 1 do flush não é atômica entre o squad e o lançamento do extrato** de um mesmo
  `recordMoney` — ver a seção "Extrato" acima.
