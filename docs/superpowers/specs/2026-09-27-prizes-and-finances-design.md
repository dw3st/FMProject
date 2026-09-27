# Premiação e finanças — Design

Data: 2026-09-27. Status: aprovado pelo usuário. Etapa 3 do `docs/ROADMAP.md` (1.3 Premiação e
finanças + issue #12 salários fora de escala). A correção da #16 (laterais invertidos na tela de
táticas) vai na mesma branch.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Salários (#12) | Uma curva só `nota → salário semanal` em euros reais, calibrada no mundo inteiro (folha ≈ 60% da receita na mediana de cada nível). Contratos/salário salvo por jogador ficam para a Etapa 7 |
| Premiação | Liga (mérito sobre a TV, na virada), copa nacional (por fase, no dia), continental (valores fixos por fase, no dia) |
| IA | Metade do prêmio vai para a verba de transferências (teto 1,5× a verba da temporada); título/final continental conta como boa temporada |
| Bilheteria | Jogo em casa de copa e continental passa a render (copa = preço da liga, continental = 2×; final neutra não rende) |
| Caixa | Extrato real por temporada; saldo pode ficar negativo (aviso, sem punição por enquanto) |
| Tela | Finanças passa a ler o extrato (totais, gráfico semanal real, lista filtrável); some o gráfico falso |

## 1. Salários

### Hoje

- `estimateWeeklyWage = nota^2,2 × 50` (`src/Domain/aiFinance/aiClubFinance.ts`), com a nota de 0–10:
  titular do City ≈ €3K/semana, folha do City ≈ €3,3M/ano contra €409M de receita.
- A tela do jogador usa outra fórmula (`Player.salaryLabel = nota² × 350`), e o `FinancesScreen`
  tem uma cópia local da primeira.
- Os orçamentos de salário da IA (`BASE_WEEKLY_BUDGET`) foram calibrados na escala baixa.

### Novo

**Uma curva só de nota não fecha.** A primeira tentativa (Etapa 3, Tarefa 1) calibrou só
`weeklyWage(nota)` no mundo inteiro, mirando mediana `folha / receita ≈ 0,60` por nível (1ª, 2ª,
3ª+ pela pirâmide; liga sem pirâmide = nível 1). Mesmo com lei de potência (venceu a exponencial,
erro menor) e um teto de sanidade (nenhuma nota custa mais de €5M/semana em nota 10), o resultado
ficou longe do alvo: mediana 0,20 / 0,72 / 1,51 por nível. O nível 1 sozinho junta a Premier League
com a primeira divisão de Fiji — a RECEITA desses clubes varia por ordens de grandeza muito mais
do que a NOTA dos jogadores, então nenhuma curva baseada só em nota consegue acertar 0,60 de forma
uniforme dentro de um nível tão heterogêneo sem estourar o teto de sanidade.

**Curva + fator de clube.** A solução escolhida separa duas coisas:

- `src/Domain/finance/wages.ts`: `weeklyWage(nota)` — curva só de FORMATO (lei de potência,
  `SCALE × nota^GROWTH`, com piso), calibrada só para que o degrau nota 6→7 seja um aumento
  plausível de ~2–2,5× (escolha de design, não alvo de ajuste) e para que a mediana do fator (ver
  abaixo) nas 5 grandes ligas europeias (Inglaterra/Espanha/Itália/Alemanha/França) seja ≈ 1,0 —
  ou seja, a curva sozinha já serve quase sem correção para as ligas em torno das quais foi
  desenhada.
- `clubWageFactor(receita, folhaDaCurva)` — multiplicador por clube que corrige a folha REAL para
  exatamente 60% da receita DAQUELE clube (quando não satura), limitado a `[0,25×, 4×]` para que
  nem um clube muito rico nem um muito pobre (frente ao que a curva sozinha previa para o elenco)
  receba uma correção absurda. `estimateWeeklyWage`, `Player.salaryLabel` e o `FinancesScreen`
  passam a usar `weeklyWage` × o fator do clube, não a curva sozinha.
- `Squad.wageFactor?: number`: calculado na criação da carreira (`SaveService.createSave`, todo
  clube) e recalculado em toda virada de temporada (depois da mudança de nível financeiro, antes
  de gravar o squad); ausente → `wageFactorOf` calcula na hora a partir do squad atual. Um jogador
  transferido passa a ser pago pelo fator do clube comprador.
- **Calibração** (`scripts/wage-calibrate.ts`): mesma receita anual de antes
  (`broadcasting + commercial` + bilheteria estimada de uma temporada de liga). Busca em grade o
  degrau 6→7 (2,0–2,5×) e a forma (potência × exponencial) que minimizam a fração de clubes
  saturados no fator, com SCALE resolvido analiticamente pela mediana das 5 grandes a cada
  combinação testada. Imprime por nível e por liga a mediana/p10/p90 de `folha / receita` (deve
  ficar perto de 0,60, exceto clubes saturados), a fração de clubes no piso/teto do fator, e
  salários de exemplo (notas 4/5/6/7) para um clube inglês, um da Championship e um do Quênia.
- **IA:** `maxWageBudget` passa a derivar da receita do clube (`≈ 0,70 × receita / 52`, com o
  `SOFT_BALANCE` por tier), não mais de `BASE_WEEKLY_BUDGET`. Meta: a distribuição de estado de
  contratação no mundo inicial fica perto da atual (~92% `open`, ~5% `tight`, ~3% `frozen`); o
  script de calibração mede e reporta. `weeklyBudget` segue coerente (`maxWageBudget / 0,8`).
- A tabela de finanças da liga (`ClubFinancesTable`) mostra os números novos sem mudança de layout.

## 2. Caixa do jogador

### Extrato

- `saves/{id}/ledger/{temporada}.json`: lista de lançamentos
  `{ date, kind, amount, label, ref? }` (amount com sinal). `kind`: `broadcasting`, `commercial`,
  `wages`, `operational`, `gate`, `prize`, `transfer_in`, `transfer_out`.
  `label` carrega a origem (liga/copa/continental, fase, adversário) para a tela e a inbox.
- `applyMoney(squad, entry)` (`src/Domain/finance/ledger.ts`, pura) devolve o squad com o orçamento
  atualizado e o lançamento; a camada de E/S grava os dois no mesmo dia bufferizado. **Todo** crédito
  e débito do clube do jogador passa por ela: TV inicial e da virada, segunda-feira (comercial,
  salários, operacional), bilheteria, prêmios, transferências.
- A temporada do extrato é a da liga do jogador (`meta.year` da liga); a virada começa um arquivo
  novo.
- O saldo **pode ficar negativo** (some o `Math.max(0, …)`). Aviso na tela e uma mensagem na inbox
  quando o saldo cruza para o negativo. Sem punição nesta etapa.

### Bilheteria

- Mesmo modelo do servidor para todos: `capacidade × ocupação × preço`.
- Liga e copa: preço da liga (`TICKET_PRICE` atual); continental: 2×. Final em campo neutro: 0.
- A projeção da tela usa essa mesma função (some o modelo paralelo da tela e o bug da média de
  seguidores).

### Brecha

- `PUT /api/saves/:saveId/squad/:league/:club` ignora `finances` vindo do cliente.

## 3. Premiação

Valores em `src/Domain/finance/prizeConfig.ts`, funções puras em `src/Domain/finance/prizes.ts`.

### Liga (na virada, com a TV)

- `mérito = TV do clube × 0,20 × (n − posição) / (n − 1)`; campeão + `TV × 0,05`.
- Vale para o jogador (extrato `prize`) e para a IA (verba, ver abaixo).

### Copa nacional (no dia em que a fase é vencida)

- Base = TV média da liga de nível 1 do país. Cada fase vencida paga uma fração da base:
  preliminar/r128/r64 0,3%, r32 0,5%, oitavas 0,8%, quartas 1,1%, semi 1,5%, vice 2%, campeão 4%
  (o campeão recebe só o valor de campeão pela final, não o de vice + o de campeão).

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

- Participação: paga na primeira rodada de grupos jogada (não na geração, para não pagar antes do
  start kit substituir a competição).
- Vitória/empate: a cada jogo de grupo.
- Fases: ao se classificar (evento `advanced` do `advanceContinental`); final: ao chegar nela; título:
  evento `champion`.

### IA

- 50% de todo prêmio (liga, copa, continental) entra em `aiTransferBudget`, com o teto de 1,5× a
  verba sazonal que as vendas já respeitam (`applyAITransferSale`-like).
- Na virada, título continental ou final continental conta como "boa temporada" em
  `clubSeasonOutcome` (seguidores e tier).

### Inbox

- As mensagens que já existem (fim de temporada da liga, eliminação/título de copa e continental)
  passam a mostrar o valor recebido; a classificação às oitavas continental ganha o valor. Nenhuma
  categoria nova.

## 4. Tela, `/lab` e `/test`, verificação

- **Finanças:** cartões de totais da temporada a partir do extrato (receita por tipo, despesa por
  tipo, prêmios), gráfico de saldo semanal real (últimas 8+ semanas), lista do extrato com filtro
  por tipo, projeção de bilheteria com o modelo do servidor, aviso de caixa negativo. Endpoint
  `GET /api/saves/:id/ledger?season=` (dono do save).
- **`/lab` e `/test`:** mostram prorrogações e pênaltis vencidos (estatística que o motor já tem),
  o critério "resultados de copa" da Fase 1 do ROADMAP.
- **Testes:** curva de salário (monotônica, piso), tabela de prêmios, `applyMoney`/extrato,
  bilheteria por competição, `PUT` sem `finances`.
- **Smoke de temporada:** a soma do extrato bate com a variação do orçamento do jogador; algum clube
  com campanha continental recebe prêmios; nenhum saldo da IA fica fora do teto da verba.
- **Calibração:** o script imprime folha/receita por liga antes e depois, e o estado de contratação
  da IA; os números vão para `.claude/rules/AI-clubs/finance.md`.
- Start kits regenerados (salário muda o comportamento do mercado na pré-simulação? não — o mercado
  fica congelado na pré-simulação; regenerar mesmo assim porque a verba e o tier dependem da
  receita e os prêmios de copa/continental passam a existir no kit).
