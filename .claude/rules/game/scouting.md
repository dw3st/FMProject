# Olheiros: conhecimento por jogador, missões, relatórios, lista e jovens de fora

Spec: `docs/superpowers/specs/2026-10-05-scouting-design.md` (decisões em aberto = a recomendação). Etapa 28 do
`docs/ROADMAP.md`, versão **4.3**. Visual: `.claude/rules/ui-standard.md`. Staff: `staff.md`.

## Regra

- O que o jogador vê de um atleta de fora do próprio elenco depende do **conhecimento** (0..100) que ele tem
  daquele atleta; com 100 vê exato. O olheiro-chefe não zera mais a incerteza do mundo: multiplica a incerteza e
  o ganho de conhecimento.
- **Só o técnico do jogador** observa (`saves/{id}/scouting.json`). A IA não grava nada e lê valores exatos
  (mercado, `findCandidates`, propostas). O motor, o avanço do dia e toda decisão da IA nunca leem valores com
  incerteza: ela só existe nas respostas de tela (`scoutView` no `RosterPlayer`, nunca gravado). Teste de
  isolamento: `src/Domain/scouting/isolation.test.ts` (motor, mercado, negociação, `Domain/advanceDay` e
  finanças da IA não importam o modelo nem o borrão).
- Sem migração (protótipo): `scouting.json` ausente = nada observado, só o implícito.
- `/test`, `/lab`: **sem efeito de partida**, nada a exibir.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/scoutingTypes.ts` | `ScoutingState`, `ScoutAssignment`, `ScoutTarget`, `ScoutFocus`, `KnowledgeEntry`, `ShortlistEntry`, `ScoutReport`, `ScoutProspect`, `ScoutView` |
| `src/Domain/scouting/scoutingConfig.ts` | Todas as constantes (`SCOUTING`) |
| `src/Domain/scouting/knowledge.ts` (+ teste) | `implicitKnowledge`, `decayed`, `knowledgeOf`, `uncertaintyOf`, `attributesHidden`, `scoutMultipliersOf`, `ratingGain`, `gainKnowledge`, `pruneKnowledge` |
| `src/Domain/scouting/missions.ts` (+ teste) | `starterLineAverages`, `seenProfile`, `relativeNote`/`gradeOf`, `isGem`, `buildReport`, `missionPool`, `pickObserved`, `advanceScoutingWeek`, `missionCost`, `allowedWeeks`, `monthlyRecommendations`, `shortlistAlerts`, `prospectFee`, `generateProspects`, `addProspects`, `pruneProspects` |
| `src/Domain/scouting/scoutingMessages.ts` | Inbox `scouting` (`buildScoutingMessage`) |
| `src/Domain/staff/staff.ts` | `obscureForViewer` (borrão com amplitude por jogador + `scoutView`), `fieldScoutMarket`, `scoutUncertaintyMultOf`/`scoutGainMultOf`; `squadStaffWages` soma os olheiros de campo |
| `src/Domain/scouting/seen.ts` | Valores vistos: faixas de nível/valor/salário/atributo e o meio da faixa (busca e telas) |
| `src/Domain/scout/displayPlayer.ts` | `knowledge`, `hiddenAttrs`, `statNoise`, `seen`, `avgRange`, `valueRange`, `potentialRange` (de `scoutView`) |
| `src/backend/scoutingWorld.ts` | E/S: `loadViewer`/`viewFor`/`obscureSquadForViewer` (telas), `scoutingDay` (passo do avanço do dia), `rememberPlayers`, `scoutingOnClubLeft`, `missionLeagues`, `missionDistance` |
| `src/backend/scoutingRoutes.ts` (+ `scouting.routes.test.ts`) | Rotas (abaixo) |
| `src/backend/scoutSearch.ts` | Ruído por jogador; filtros `onlyShortlist`, `minKnowledge`; `shortlistIds` |
| `src/backend/routes.ts` (`?scouted=1`), `contractRoutes.ts` (`/demand`) | Ficha / elenco e linhas de personalidade do pedido com o conhecimento do jogador |
| `src/backend/advanceDay.ts` | `scoutingDay` antes do bloco financeiro; linhas `scouting` no extrato da segunda; mensagens depois do `clearInbox`; quem sai livre na virada fica conhecido |
| `src/backend/negotiationWorld.ts` (`dropFromLineup`), `jobWorld.ts` (`releaseHumanClub`) | Passagem pelo elenco (k 100) e troca de clube |
| `src/GameInterface/ScoutScreen.tsx`, `Scout/*`, `Scouting/*` | Central de Olheiros (abas), coluna Conhecimento, estrela da lista, missões, relatórios, observados, joias, bloco da ficha |
| `src/GameInterface/StaffScreen.tsx` | Olheiros de campo: cartões e aba "Olheiros" no mercado |
| `src/GameInterface/Dashboard/*` | Cartão Atenção: joia e alertas da lista (7 dias) |
| `scripts/scouting-index-bench.ts` | Custo do borrão por jogador × o uniforme antigo |

## Conhecimento e incerteza

```
k = max(implícito, guardado decaído)                      // próprio elenco e cedidos por empréstimo: 100
implícito = própria liga 35 · outra liga do país 20 · resto 0, + 25 se top 100 do mundo por overall, até 60
decaído   = k − 5 × max(0, dias desde a última observação − 90) / 30   (calculado na leitura, sem passada diária)
ruído(k)  = 2,0 × (1 − k/100)^1,2 × multChefe            // ± pontos de cada atributo 0,0..10,0 (tela: ×10)
multChefe = [nota 1, 5, 10] = [1,3 ; 1,0 ; 0,75] (vaga = nota 3); ganho do chefe [0,7 ; 1,0 ; 1,4]
```

| k | ruído (chefe 5) | tela |
|---|---|---|
| 0 | ±2,0 | atributos "?" (k < 20), nível e valor em faixa larga |
| 20 | ±1,53 | atributos em faixa |
| 35 | ±1,2 | idem |
| 60 | ±0,67 | faixa estreita |
| 80 | ±0,29 | número único (abaixo de 0,5) |
| 100 | 0 | exato |

- O sorteio é o de sempre (`signedNoise(save:jogador:atributo)`), só a amplitude é por jogador: a faixa converge
  ao valor real sem pular. A personalidade usa o mesmo ruído do jogador.
- O potencial (≤ 23), o valor e o salário saem em faixa.
- A faixa de **valor** usa só a metade central da faixa de nível (`VALUE_RANGE_SHRINK` 0,5, `seen.ts`): o valor cresce exponencialmente com a nota (4.5), e a faixa inteira dava "€1,5M–€1,2bi" para um jogador desconhecido.
- **A busca ordena e filtra pelo que a tela mostra (4.3.1):** com faixa na tela, a linha (`toDisplayPlayer`)
  carrega em `avg`, `valueMillions` e `wage` o **meio da faixa mostrada** (`src/Domain/scouting/seen.ts`:
  `seenOverallRange` com as pontas arredondadas como na tela, `seenValueRange`, `seenWageRange`, `rangeMid`), e os
  rótulos (`value`, `salary`) mostram a faixa: duas linhas com a mesma faixa empatam (ordem de entrada, sem desempate
  pela nota real). Filtro de atributo: atributo em faixa filtra pelo meio da faixa das barras
  (`seenAttributeRange`, pontas com uma casa decimal, 0,0..10,0); atributo oculto ("?", k < 20) nunca passa num
  filtro de atributo ativo.
- **Escala 0–100 (4.5):** os atributos têm uma casa decimal e a tela mostra ×10 (`attrDisplay`, `src/Domain/attributes.ts`): a faixa de
  um atributo com ruído ±0,67 aparece como, por exemplo, "48–61". Os filtros de atributo da busca chegam em inteiros
  0–100 e são comparados uma vez em 0..10 (`filterScoutPlayers`, `range / 10` contra o valor visto arredondado a
  uma casa); 0–100 inteiro = filtro desligado.
  Próprio elenco e quem tem ruído < 0,5 continuam com o número (exato no próprio elenco e em k 100).
- **Salário em faixa:** com ruído ≥ 0,5, o salário de um jogador de fora é a faixa da curva do clube dele
  (`weeklyWage(ponta) × fator de salário do clube`) sobre a faixa de nível vista. O JSON das telas nunca leva o
  salário exato: `obscureForViewer(..., wageFactor)` troca o `contract.wage` pelo meio dessa faixa (como o valor,
  que já sai do nível borrado). Próprio elenco, cedidos/emprestados do jogador (k 100) e ruído < 0,5: salário exato.
- **Decisão mantida:** o pedido de salário da negociação (`/demand`, contratos, contraproposta) é o pedido real do
  jogador, não uma estimativa; ele pode revelar um pouco do nível.
- A fama (top 100 por overall) é calculada no build do índice da busca e guardada por save e dia.

## Olheiros e missões

- O olheiro-chefe (staff) conduz uma missão; os **olheiros de campo** (`Squad.staff.scouts`, até 4, mercado
  semanal de 5 candidatos nota 2..9, salário de staff na linha `staff`) conduzem uma cada. Vaga = nota 3.
- Alvos: `country`/`league` (4/8/12 semanas), `continent` (ligas de nível 1, 8/12), `youth` (≤ 19 de um país,
  4/8), `player` (até 3 semanas ou k 100). Foco opcional: linha, idade máxima, "só quem melhora o elenco"
  (nível visto ≥ média da linha − 0,3). Cancelar = o gasto não volta.
- **Toda segunda** (`advanceScoutingWeek`), cada missão criada antes do dia trabalha: região observa
  `6 + nota` (≤ 16) jogadores sorteados (`seedFrom(save:missão:segunda)`, peso maior a quem tem k baixo),
  +30 × ganhoNota × ganhoChefe cada; jogador +35 × os mesmos ganhos. `ganhoNota` = [0,6 ; 1,0 ; 1,4].
- Todo adversário que entrou em campo contra o clube do jogador (com estatística ou nota na partida; o banco que não jogou, não) ganha +8 no dia. Quem sai do clube do jogador (venda,
  empréstimo, volta de empréstimo, livre, troca de clube do técnico) fica com k 100 guardado.
- Viagem (`kind: "scouting"`, segunda, por missão ativa): receita anual / 52 × 0,04% (mesmo país) · 0,08%
  (mesmo continente) · 0,15% (fora); missão de jogador pela metade. `ledgerText`: `scoutingTravel`,
  `scoutingTravelPlayer`, `prospectFee`.

## Relatórios, joias, recomendação

- Os até 5 melhores de cada missão por semana viram relatório (últimos 60): nível, potencial e valor vistos em
  faixa, salário pedido estimado (curva × fator do clube do jogador), contrato, à venda, nota A–E e texto
  ("pronto para o time titular", "para o futuro", "opção para o elenco", "não melhora o elenco").
- `nota relativa = nível visto − média dos titulares da linha (XI ~4-3-3) + 0,5 × crescimento visto (≤ 23)`;
  A ≥ +0,8 · B ≥ +0,3 · C ≥ −0,2 · D ≥ −0,7 · E. **Desvio do spec:** o crescimento e a joia usam o alto do
  potencial do jogador borrado **sem** o alargamento pelo ruído (com ele, todo jovem pouco conhecido virava joia).
- Joia: ≤ 20, de fora do país (ou missão de jovens), potencial visto ≥ titulares da linha + 0,3; no máximo 2
  mensagens por semana.
- Dia 1 do mês: até 3 indicações do chefe (joias, depois A) entre os relatórios dos últimos 120 dias e a própria
  liga (k 35), sem repetir as do mês anterior.
- **Toda indicação tem relatório (#100):** `recordRecommendations` (`missions.ts`). Um indicado com relatório dos
  últimos `RECOMMEND_REPORT_DAYS` (120) reaproveita esse relatório; um sem relatório (ex. jogador da própria liga num
  save sem missões) é observado pelo chefe na hora — o mesmo ganho de uma observação de missão de região liderada por
  ele (`REGION_GAIN` × ganho da nota × ganho do chefe), determinístico — e ganha um relatório (`buildReport`) com
  `missionId = RECOMMENDATION_ORIGIN` (`"recommendation"`, `scoutingTypes.ts`): no filtro por missão da aba
  Relatórios aparece como "Indicações do olheiro-chefe". A mensagem leva o que o relatório diz (nota, joia) e
  `squadId`/`league`/`reportId` de cada indicado.

## Lista de observação

Até 50 (`409 shortlistFull`), nota pessoal. Toda segunda: +3 de conhecimento, e alerta (`shortlist`) quando
entra na lista de venda ou de empréstimo, fica a ≤ 183 dias do fim do contrato, fica livre, muda de clube ou se
aposenta (sai da lista e do conhecimento). Quem some do mundo sem registro de aposentado (livre podado depois de uma temporada) também sai, com o alerta de aposentado. O jogador é procurado no último clube, nos livres e por fim em todos
os elencos (só quando algum sumiu).

## Jovens sem clube (prospectos)

Missão `youth`: por semana 0–2 jovens de 16–17 (`generateIntake` ancorado nos elencos da liga de nível 1 do país,
nomes do país, determinístico por `save:país:semana`), válidos 30 dias. `POST .../prospects/:id/sign`: entra em
`squad.youth` (`400 youthFull` em 18, `409 offerClosed` vencido), contrato de base de 3 anos, compensação
`PROSPECT_FEE[tier mediano dos clubes da liga de nível 1] × fator de salário` (LOW €50k, MEDIUM €120k, HIGH €250k,
ELITE €400k) no extrato (`scouting`, `ref.stage = "prospect"`), inbox `prospect_signed`.

## Troca de clube e desemprego

`releaseHumanClub` (troca ou demissão) chama `scoutingOnClubLeft`: missões canceladas, prospectos ficam com o
clube, olheiros de campo saem com o staff; conhecimento e lista **seguem o técnico** (decisão 2); os jogadores do
clube antigo ficam com k 100. Desempregado: `409 noClub` para criar missão, contratar olheiro ou prospecto;
relatórios e lista continuam visíveis.

## Rotas (`requireSaveOwner`; escrita com `withSaveLock`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/scouting` | Olheiros (livre/ocupado), missões (custo semanal), relatórios, lista (com situação atual), prospectos (só identidade: os atributos ficam no servidor, a tela usa as faixas do relatório) |
| `POST /api/saves/:id/scouting/missions { scoutId, target, focus?, weeks }` | 400 `invalidTarget`/`invalidWeeks`/`invalidFocus`, 409 `scoutBusy`/`noClub`; jogador do próprio clube (ou cedido por ele) é `invalidTarget`; missão de jogador cujo alvo sumiu acaba sem cobrar viagem |
| `DELETE /api/saves/:id/scouting/missions/:missionId` | Cancela |
| `POST /api/saves/:id/scouting/shortlist { playerId, squadId?, note? }` · `DELETE .../shortlist/:playerId` | 409 `shortlistFull` |
| `POST /api/saves/:id/scouting/prospects/:prospectId/sign` | 400 `youthFull`, 409 `offerClosed` |
| `GET /api/saves/:id/scouting/player/:playerId?squad=` | Conhecimento, último relatório, lista, missão em andamento (bloco da ficha) |
| `GET /api/saves/:id/staff/scouts/market`, `POST .../staff/scouts/hire { candidateId }`, `POST .../staff/scouts/fire { scoutId }` | Olheiros de campo (409 `scoutsFull`; demitir cancela a missão dele) |
| `POST /api/saves/:id/scout-search` | Linhas com `knowledge`, `hiddenAttrs`, faixas; filtros `onlyShortlist`, `minKnowledge` |

## Telas

- **Central de Olheiros** ("CENTRAL DE **OLHEIROS**" / "SCOUTING **CENTRE**"): `SegmentedTabs` Busca | Missões |
  Relatórios | Observados | Joias (`?tab=`). A aba Busca fica **montada e escondida** nas outras abas (filtros e
  tabela memoizados: trocar de aba não rerenderiza as 100 linhas), e a busca só segue a consulta com a aba aberta
  (a chave da busca congela nas outras abas: nenhuma requisição lá, e voltar sem mudar nada não busca de novo). Busca: coluna Conhecimento (barra 64px + número), estrela, "?" e
  faixas, chips "Só observados" e "Conhecidos (60+)". Missões: cartão por olheiro, barra de semanas, custo,
  Cancelar, modal "Nova missão" (alvo, duração e foco em chips). Relatórios: tabela padrão com nota, joia e
  filtro por missão. Observados: situação e anotação. Joias: prospectos ("Contratar para a base") e relatórios-joia.
- **Ficha** (de fora): bloco "Conhecimento" (barra, observado em, nota do último relatório, estrela, "Observar"
  com a escolha do olheiro livre, aviso abaixo de 60); atributos "?" ou em faixa, nível e valor em faixa.
- **Negociação**: valor, nível e potencial em faixa e o aviso de conhecimento baixo (< 60).
- **Equipe técnica**: cartões dos olheiros de campo e aba "Olheiros" no mercado. **Painel**: Atenção com joia e
  alertas da lista dos últimos 7 dias. **Inbox** `scouting` (ícone `binoculars`): `report`, `mission_done`, `gem`,
  `recommendation`, `shortlist`, `prospect`, `prospect_signed`.
  Na mensagem `recommendation` cada indicado (nota, nome, clube, joia) é um link para a ficha do jogador, como os
  nomes da tabela de Relatórios (a ficha mostra o conhecimento e a nota do último relatório); o botão abre a aba
  Relatórios, onde todo indicado tem o seu.

## Números

- Índice da busca (`bun scripts/scouting-index-bench.ts 5`, 36 437 jogadores): borrão + linhas 956 ms × 889 ms do
  borrão uniforme antigo (**×1,08**; ×1,02 antes das faixas de salário e dos meios da 4.3.1, mesma máquina);
  carregar o conhecimento 7 ms (fama já em cache; o smoke mede de novo e só falha acima de 2×).
- Semana típica (chefe nota 5, missão de país): 11 observados, +30 cada, 5 relatórios; viagem de um clube de
  receita €411M a outro país do continente ≈ €6,3k/semana.

## Testes e smoke

```
bun test src/Domain/scouting src/Domain/staff src/Domain/scout src/backend/scouting.routes.test.ts \
  src/backend/scoutSearch.test.ts src/backend/personality.routes.test.ts
```

`scripts/season-rollover-smoke.ts`, seção "Olheiros": dois olheiros de campo contratados; missão de país
estrangeiro (chefe), de jogador (uma estrela estrangeira; refeita se um olheiro fraco não chegar a 100 em 3
semanas) e de jovens; lista com jogadores cujo contrato acaba em 6–10 meses. Confere k 100 na missão de jogador,
relatórios e mensagens, missão encerrada, uma linha `scouting` por missão ativa em toda segunda, pelo menos um
alerta da lista, um prospecto contratado (base, contrato, compensação), nenhum clube da IA com olheiros, linhas
da busca coerentes com k ("?" abaixo de 20, faixa a partir de ±0,5, exato em 100), a busca ordenada pelo meio da
faixa vista (e não pela nota real: pelo menos uma inversão contra a nota real entre as linhas em faixa), o salário
em faixa nessas linhas (nunca o exato) e o custo do borrão (≤ 2×). Teste: `src/Domain/scout/scoutSeen.test.ts`.

## Limitações

- A IA não tem incerteza: ela "sabe" tudo; só o jogador pode errar.
- O pedido de salário e a contraproposta seguem o valor real (vazam um pouco do nível) — decisão mantida.
- O centro da faixa vista é o nível borrado: o ruído do nível (média ponderada de 13 atributos) é menor que o
  ruído de cada atributo, então o meio da faixa fica mais perto do nível real do que a largura da faixa sugere
  (Premier League, ruído ±2: erro rms do centro 0,46 contra a faixa de ±2).
- Telas que leem elencos sem `?scouted=1` (prévia, tabelas de liga) continuam exatas.
- Estatísticas públicas (gols, nota média, estrelas) não são escondidas.
- O passo do dia não conta a fama (+25) ao somar o ganho de uma partida ou da lista; a fama só põe um piso na tela.
- O conhecimento de um aposentado só sai do arquivo quando ele estava na lista (os demais saem pela poda).
- A personalidade não é revelada à parte pelos relatórios (usa o mesmo ruído dos atributos).
- Sem rede de olheiros por região, empréstimo de olheiros ou regras FIFA de menores (16 anos em qualquer país).
