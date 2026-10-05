# Etapa 25 — Mercado mais vivo — Design

Data: 2026-10-05. Status: **aprovado** (D1–D9 com a recomendação) e implementado. Versão **4.0**.

Regras de base: `.claude/rules/AI-clubs/finance.md`, `AI-clubs/transfer-needs.md`, `game/negotiation.md`,
`game/jobs.md`, `game/managers.md`, `game/board-fans.md`, `game/contracts.md`, `game/morale.md`. Sem migração de
save (protótipo): campos ausentes = vazio/padrão.

## Ideia

Quatro peças que tornam o mercado e o banco de técnicos mais parecidos com o futebol de verdade:

1. **Janelas de transferência** por país: taxa e empréstimo só com a janela aberta.
2. **Técnicos da IA** são demitidos por maus resultados (regra, não simulação) e contratados de um pool de
   técnicos livres; todo técnico tem histórico de clubes.
3. **Contrato do técnico do jogador:** salário semanal no extrato, duração, renovação pela diretoria, multa.
4. **Disputa pelo mesmo alvo:** quando o jogador negocia um jogador da IA, outros clubes podem entrar; o
   vendedor escolhe a taxa, o jogador escolhe o clube; o jogador humano tem prazo.

Princípio (`AI-clubs/finance.md`): para a IA, regras simples e previsíveis; nada de caixa nem salário de técnico
para clubes da IA.

---

## 1. Janelas de transferência

### 1.1 Regra

- Cada **país** tem duas janelas por temporada, derivadas do calendário da **liga de nível 1** do país
  (`topLeagueOf`, `leagueSchedules.json`). Todas as ligas do país seguem a mesma janela. Nada é gravado:
  `transferWindowsOf(país, ano)` é pura e recalculada (cache por dia no avanço).
- **Janela de pré-temporada:** de `fim da temporada anterior + PRE_OPEN_AFTER_END (14 dias)` até
  `início da temporada + PRE_CLOSE_AFTER_START (16 dias)`.
- **Janela do meio:** 31 dias começando no dia 1 do mês que contém o ponto médio da temporada (se o ponto médio
  cai depois do dia 15, o mês seguinte).

| Calendário | Pré-temporada | Meio |
|---|---|---|
| Cruza o ano (Europa: 15/08 → 17/05) | 31/05 → 31/08 | 01/01 → 31/01 |
| Ano civil (início 05/02, fim ~dez) | ~meados de dez → 21/02 | 01/07 → 31/07 |
| País sem pirâmide | pela própria liga | idem |

- **Quem precisa da janela aberta:** o **país do clube comprador** (regra da FIFA: o registro é do comprador).
  O vendedor pode estar em janela fechada.

| Ação | Fora da janela? |
|---|---|
| Compra com taxa (humano e IA × IA, propostas da inbox, contraproposta) | **Não** (409 `windowClosed`) |
| Empréstimo (pedir, ceder, aceitar proposta `loan_bid`) — o **início** | **Não** |
| Volta de empréstimo (na data ou na virada) | Sim |
| Contratar livre (humano, `freeAgentTick` da IA, reposição da virada) | **Sim** (decisão abaixo) |
| Renovar contrato, promover da base, dispensar | Sim |
| Pôr/tirar da lista de venda e de empréstimo | Sim (listar é intenção; só não vende) |
| Pré-contrato (seção 1.4) | Sim |

**Por que livres fora da janela:** é a regra real na maioria das federações (jogador sem contrato pode ser
registrado a qualquer momento), e a reposição da virada (`refillSquad`) e o `freeAgentTick` diário são o que
mantém os elencos estáveis (`contracts.md`: 26,9 → 25,2 → 24,4). Fechar os livres derrubaria esse equilíbrio
e exigiria recalibrar contratos.

### 1.2 Mercado da IA

- `dailyMarketTick` recebe `openCountries: Set<string>` (ou um `isWindowOpen(squadId)`): a **fase 1**
  (necessidades, listas de venda) roda o ano todo; a **fase 2** (tentativas de compra) só sorteia compradores
  de países com janela aberta; a **fase 3** (`generateBidsForHuman`) só gera propostas de compradores com
  janela aberta.
- **Volume:** hoje são 10 tentativas/dia o ano todo. Com janelas (~34% do ano na Europa) o volume cairia ~⅔.
  `TEAMS_PER_DAY_ATTEMPTS` vira `ATTEMPTS_PER_OPEN_DAY` aplicado sobre o pool de compradores com janela aberta,
  escalado para manter o **volume anual do mundo ±15%** da 3.9.1 (medido antes — seção 9), com
  `DEADLINE_MULT` (1,5) nos últimos 5 dias de cada janela.
- O gate de folha/verba (`aiClubFinance`, `aiTransferBudgetOf`) não muda. A verba sazonal é concedida na virada,
  antes da janela de pré-temporada, como já é.

### 1.3 Jogador humano

- Compra, pedir empréstimo e responder proposta (aceitar/contrapropor) fora da janela do **comprador** → 409
  `windowClosed { opensOn }`. Propostas da IA (`MarketBid`) vencem no mais cedo entre `expires` e o fecho da
  janela do comprador.
- **Conversas** (`market.talks`) seguem por dia; ao fechar a janela, conversas abertas caem (sem
  `closedUntil`).
- **Carência de chegada (decisão D1):** uma carreira nova abre o mercado do clube do jogador por
  `ARRIVAL_GRACE_DAYS` (30) a partir do início da carreira, mesmo com a janela do país fechada (a carreira
  começa em 05/02/2027: na Europa a janela de inverno já fechou e só reabriria no fim de maio).

### 1.4 Pré-contrato (decisão D2)

- **Entra, só no sentido humano ← IA.** Um jogador da IA cujo `contract.until` está a ≤ `PRE_CONTRACT_DAYS`
  (183) dias pode assinar pré-contrato com o clube do jogador **a qualquer momento**: termos de contrato
  normais (`evaluateContractOffer`), sem taxa, mais a vontade do jogador (seção 4.3: o clube humano precisa
  ganhar a preferência contra a renovação da IA, representada pelo `aiShouldRenew` e pela força do clube atual).
- Gravado em `market.preContracts: PreContract[]` (`{ playerId, playerName, fromClubId, wage, years, date }`).
  Na virada do país do clube de origem (passo 8, **antes** da renovação da IA), o jogador sai livre e entra no
  clube do jogador com o contrato combinado (teto de 30 respeitado: se cheio, o pré-contrato cai e a inbox avisa).
  A IA nunca renova quem tem pré-contrato.
- **Fora:** acerto antecipado de taxa ("fechado para a próxima janela") e pré-contrato da IA por jogadores do
  humano (fica para uma etapa futura; o humano já tem a conversa de contrato da moral para isso).

### 1.5 Telas

- **Transferências:** faixa no topo da tela ("Janela aberta até 31/08" / "Janela fechada — abre em 31/05"),
  com o país do clube; aba nova **Janelas**: tabela dos países (os do jogador e das ligas seguidas primeiro) com a
  janela atual e a próxima (`TABLE_STYLE`).
- **Negociação** (`PlayerOfferModal`), **Olheiro** e ficha: botão "Fazer oferta" desabilitado fora da janela com
  "Janela fechada (abre em …)"; "Pré-contrato" aparece no lugar quando o contrato do alvo está no prazo.
- **Painel:** cartão Atenção com "Janela fecha em N dias" (≤ 7) e "Janela aberta". Nada na barra superior.
- **Inbox** (`transfer`): `window_open`, `window_closing` (3 dias antes), `window_closed` — só para o país do
  clube do jogador; `pre_contract` (assinado) e `pre_contract_joined` (chegou na virada / caiu).

---

## 2. Técnicos da IA: demissão, pool de livres e contratação

### 2.1 Dados (`managers.json`, `ManagerRecord`)

```ts
interface ManagerRecord {
  // ...existente
  clubs: { squadId: string; from: string; to?: string; left?: "sacked" | "moved" | "contract" | "interim" }[]; // agora para todos
  freeSince?: string;     // squadId "" desde esta data
  interim?: true;         // técnico interino (nome "Técnico interino do <clube>")
  hiredOn?: string;       // data da contratação atual (proteção contra demissão imediata)
  lastFinish?: number;    // percentil 0..1 da posição final da última temporada concluída (1 = campeão)
  retired?: true;         // livre por mais de RETIRE_AFTER_SEASONS: fora do pool e da aba (fica no arquivo)
}
```

- `buildInitialManagers` (`createSave`) grava `clubs: [{ squadId, from: data de início }]` em todos.
- **Invariante:** todo clube tem exatamente um técnico (interino conta); um técnico pode estar sem clube.

### 2.2 Demissão (puro, `src/Domain/managers/aiManagers.ts`)

Avaliada **toda segunda-feira** para cada clube da IA cuja liga já jogou ≥ `MIN_PROGRESS` (30%) das rodadas,
com a tabela atual e a meta de `objectiveFor` (a mesma da diretoria e das propostas de emprego):

```
pressão = (posição − target) / tamanho da liga          // > 0 = abaixo da meta
forma   = pontos nos últimos 6 jogos da liga / 6
p(semana) = 0                                   se pressão < 0,20 ou forma ≥ 1,3 ou hiredOn < 60 dias
          = min(0,35, 0,06 + 0,8 × (pressão − 0,20)) × PACIÊNCIA[tier] × (forma < 0,8 ? 1,5 : 1)
PACIÊNCIA = LOW 0,8 · MEDIUM 1 · HIGH 1,2 · ELITE 1,4      // clube grande demite mais rápido
```

- No máximo **1 demissão por clube por temporada** no meio da temporada; nunca nas últimas 3 rodadas.
- **Na virada do país:** rebaixado → p 0,6; meta falhada por ≥ 25% do tamanho → p 0,4; campeão ou acesso → 0.
- Sorteio determinístico: `seedFrom(save:clube:data:sack)`.
- Ao demitir: o técnico vai para o pool (`squadId ""`, `freeSince`, passagem fechada com `left: "sacked"`);
  o clube recebe um **interino** (`coach_<clube>_<data>`, `interim: true`, mesmo padrão de `sackHumanManager`)
  e uma **vaga** (`meta.managerVacancies[squadId] = { since, hireOn }`, `hireOn` = since + 7..21 dias).

### 2.3 Contratação (puro + `managerWorld.ts`)

No `hireOn` da vaga (ou na virada, para vagas abertas):

- **Reputação da IA** (`aiManagerReputation`): mesma fórmula do jogador (`jobs.ts`) com o termo da diretoria
  trocado por `lastFinish` (×100; ausente = 50): 45 ranking + 30 última campanha + 15 títulos + 10 temporadas.
- **Alvo:** reputação ≈ prestígio do clube × 100 (`clubPrestiges`, já existe). Candidatos:
  1. livres não aposentados: `score = −|rep − alvo| + 8 × peso de lugar (país 3 / continente 2 / resto 1) + ruído`;
     reputação acima de `alvo + 15` só vale se livre há > 1 temporada;
  2. com `POACH_CHANCE` (20%), o melhor técnico empregado de um clube de prestígio < clube − 0,10 (o clube dele
     abre vaga com interino; no máximo 1 cadeia por dia);
  3. o interino, com +10 no score se a pontuação da liga sob ele for ≥ 1,6 por jogo.
- Interino substituído: se tem 0 pontos de ranking e nenhum título, o registro é apagado; senão vira livre.
- Livre há mais de `RETIRE_AFTER_SEASONS` (2) temporadas → `retired`.
- **Clube vago e jogador desempregado:** um clube com vaga dentro da faixa entra em `pickOfferingClubs` com peso
  ×3 (as propostas de desemprego passam a vir de vagas de verdade, quando houver). Se a IA contratar antes de o
  jogador aceitar, a oferta segue válida e o técnico recém-contratado é que sai (vira livre) — ver 2.4.

### 2.4 Técnico do jogador trocando de clube (muda `moveHumanManager`)

- **Hoje:** troca — o técnico do clube novo vai para o clube antigo. **Proposta (decisão D4):** acabar com a troca.
  O técnico do clube novo vai para o pool de livres (`left: "moved"`); o clube antigo recebe interino + vaga e
  contrata pela regra 2.3. Vindo do desemprego, idem (o deslocado não fica "sem clube para sempre": pode ser
  recontratado).
- Demissão do jogador (`sackHumanManager`): interino + vaga no clube (antes, interino fixo para sempre).

### 2.5 Telas

- **Técnicos** (`StatsScreen`, aba): coluna clube mostra "Sem clube" / "Interino"; chip "Só livres" (`OptionChips`
  Mundo / Meu país / Livres); abrir **qualquer** técnico mostra a carreira (passagens com o motivo da saída) e os
  títulos (a rota devolve `clubs` para todos).
- **Histórico do clube** (`ClubHistoryView`): "Técnicos anteriores" passa a vir de `managers.json` (passagens),
  não só das linhas de temporada.
- **Inbox** (categoria nova `manager_news`, kinds `sacked`, `hired`): só clubes da liga do jogador, agrupadas por
  dia ("Fulano demitido do X; interino assume").

---

## 3. Contrato do técnico do jogador

### 3.1 Dados

```ts
// SaveMeta
managerContract?: { squadId: string; wage: number; until: string; signed: string };
managerEarnings?: number;               // soma de salários + multas recebidas na carreira (só exibição)
managerRenewal?: { offeredOn: string; expires: string; wage: number; seasons: number };
```

### 3.2 Salário (`src/Domain/managers/managerContract.ts`)

```
salário semanal = wageRevenueBasis do clube × (MIN_SHARE + SPAN × reputação/100) / 52
MIN_SHARE 0,015 · SPAN 0,025                       // 1,5% a 4% da receita anual
```

Ex.: Fulham (receita ~€200M), reputação 40 → €96 mil/semana (~€5M/ano). Usa a mesma `wageRevenueBasis` da
folha (`finances.md`). Fixado na assinatura (como os contratos de jogador), revisto na renovação.

- **Extrato:** toda segunda-feira, kind novo **`manager`** (despesa) em `computeAdvanceDayMoney`, ao lado de
  `wages`/`staff`/`operational`. `ledgerText` → "Salário do técnico". `managerEarnings += salário`.
- IA: nada (regras, não simulação).

### 3.3 Duração e renovação

- Carreira nova: 2 temporadas (`until` = fim da 2ª temporada da liga do clube). Proposta de emprego: 1–3
  temporadas pelo prestígio (o cartão mostra salário e duração).
- **Renovação pela diretoria:** com o contrato terminando na temporada atual, quando o clube jogou 85% das
  rodadas, a diretoria decide (`board`): ≥ 60 → oferta de 2 temporadas com salário recalculado pela reputação;
  40–59 → 1 temporada com o salário atual; < 40 → não renova (aviso). Sem "Pode ser demitido": sempre oferece.
- Oferta na inbox (`board`, kind `contract_offer`, Aceitar / Recusar), válida até a virada.
- **Recusada ou ignorada (decisão D5):** o contrato termina na virada → desemprego **sem** demissão
  (`meta.unemployed` com `sacking.reason = "contract"`; a tela `/fired` mostra "Contrato encerrado"), com aviso 7
  dias antes. Não renovado pela diretoria: idem.

### 3.4 Multa

- **Demitido:** recebe `SEVERANCE_SHARE` (0,5) × salário × semanas restantes (máx. 52) → `managerEarnings`; o
  extrato do clube antigo lança `manager` (kind `manager`, `ref.stage = "severance"`) **antes** do `club_change`
  "leave" (a invariante soma = saldo continua; o efeito real é só no ganho do técnico).
- **Sai para outro clube no meio do contrato (decisão D3):** o **clube novo** paga a compensação ao antigo:
  `COMPENSATION_SHARE` (0,5) × salário × semanas restantes (máx. 52). Sai do saldo de chegada (o "arrive" do
  extrato fica `budget − compensação`, e o cartão da proposta mostra "Compensação ao <clube>: €X" e o orçamento
  líquido). O clube antigo (IA) recebe metade na verba (`aiBudgetWithPrize`, mesmo teto). Contrato no último mês
  ou propostas da janela `season_end` depois do `until`: sem compensação.

### 3.5 Telas

- **Painel, cartão do clube:** "Contrato até 2029 · €96 mil/sem"; renovação pendente no cartão Atenção.
- **Finanças:** tipo "Técnico" nas despesas, na projeção semanal e nos filtros.
- **Proposta de emprego** (`JobOfferCard`): salário, duração, compensação, orçamento líquido.
- **Técnicos:** o jogador vê "Ganhos na carreira" no próprio perfil.

---

## 4. Disputa pelo mesmo alvo

### 4.1 Quando aparece um rival (`src/Domain/negotiation/rivals.ts`)

- Ao **abrir uma conversa de compra** (primeira oferta do dia por um jogador da IA, janela aberta), e depois uma vez
  por dia enquanto a conversa estiver viva, cada clube da IA com uma necessidade que cobre a linha do alvo (faixa
  de nota ±0,5), verba (`aiTransferBudgetOf ≥ valor × 0,9`), folha (`passesWageGate`) e elenco < 30 é candidato.
  Chance de entrar: `RIVAL_BASE` (0,25) × (urgência da necessidade) × (0,5 + 0,5 × nota relativa do alvo);
  no máximo `MAX_RIVALS` (2) por alvo.
- A proposta rival: taxa = `fairPrice × (0,95 + rng × 0,2)`, limitada à verba e ao `priceCap` do tier; salário =
  pedido do jogador (`contractDemand`) × (1 + rng × 0,1).
- Gravado em `market.rivalBids: RivalBid[]` (`{ playerId, clubId, clubName, fee, wage, date, deadline }`),
  `deadline` = data + `RIVAL_DEADLINE_DAYS` (3), nunca depois do fecho da janela.

### 4.2 O vendedor escolhe a taxa

- O vendedor (IA) avalia a rival com `saleDecisionScore` como qualquer oferta. Se aceitaria a rival:
  - a contraproposta ao jogador passa a ser **pelo menos** a taxa rival × 1,05 (`respondToOffer` ganha `floor`);
  - inbox `transfer` kind `rival_bid` ("O Arsenal ofereceu €X pelo Y. Você tem até DD/MM.").
- No `deadline`, se a melhor oferta do jogador não chegou ao piso → a venda vai para o rival (`executeTransferFee`
  IA × IA, mesmo caminho do mercado), a conversa fecha com `outcome: "lost"`, inbox `lost_to_rival`.

### 4.3 O jogador escolhe o clube

Quando o vendedor aceita as duas (humano igualou/superou o piso **e** a rival segue válida), o próprio jogador
escolhe (`preferenceScore`):

```
preferência = 0,45 × min(1,5, salário / pedido) + 0,35 × prestígio do clube + 0,20 × chance de titular
chance de titular = 1 se seria titular do XI automático do clube, 0,5 se entre os 2 primeiros reservas da linha, 0 senão
```

Empate → prestígio. O humano vê a preferência estimada no modal ("Ele prefere o Arsenal: oferta salarial mais
alta") e pode subir o salário. A mesma `preferenceScore` decide o pré-contrato (1.4), contra a IA atual.

- Fora do escopo: rivais para livres (contratar livre continua imediato) e leilão em vendas do jogador (já existem
  várias propostas por inbox; uma melhoria pequena: `generateBidsForHuman` pode gerar uma 2ª proposta pelo mesmo
  jogador enquanto a 1ª estiver viva — decisão D6).

### 4.4 Telas

- **Negociação:** bloco "Concorrência" com o clube rival, a taxa, o prazo e a preferência do jogador.
- **Transferências → aba Empréstimos/Negociações:** conversas com rival marcadas.

---

## 5. Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/market/windowConfig.ts`, `windows.ts` (+ teste) | `transferWindowsOf`, `isWindowOpen`, `windowStatus` (aberta até / abre em), carência de chegada |
| `src/Domain/transfer/marketRotation.ts` | Filtro de compradores por janela, tentativas por dia aberto, `DEADLINE_MULT` |
| `src/Domain/negotiation/rivals.ts` (+ teste) | Candidatos rivais, proposta rival, piso, `preferenceScore`, resolução no prazo |
| `src/Domain/negotiation/preContract.ts` (+ teste) | Elegibilidade, aceite, efeito na virada |
| `src/Domain/managers/aiManagersConfig.ts`, `aiManagers.ts` (+ teste) | Pressão, chance de demissão, reputação da IA, escolha do contratado, aposentadoria |
| `src/Domain/managers/managerContract.ts` (+ teste) | Salário, duração, renovação, multa, compensação |
| `src/Domain/jobs/jobs.ts` | `moveHumanManager` sem troca; vagas no sorteio de propostas; compensação na oferta |
| `src/backend/marketWindowWorld.ts` | Cache de janelas por país no dia (`leagueSchedules` + `topLeagueOf`) |
| `src/backend/managerWorld.ts` | Avaliação de segunda, vagas, contratação, demissão na virada, notícias |
| `src/backend/advanceDay.ts` | Ordem: volta de empréstimos → janelas → mercado → rivais (prazo) → livres → (segunda) salário do técnico e avaliação de técnicos → contratações do dia; virada: pré-contratos antes das expirações, renovação/fim do contrato do técnico, demissões de fim de temporada |
| `src/backend/transfers.ts`, `negotiationRoutes.ts`, `contractRoutes.ts` | 409 `windowClosed`, piso do rival, pré-contrato |
| `src/backend/jobWorld.ts`, `jobRoutes.ts` | Compensação, contrato na aceitação, vaga em vez de troca |
| `src/backend/managerRoutes.ts` | `clubs`, `free`, `interim` para todos; escopo `free` |
| `src/types/*` | `PreContract`, `RivalBid`, `ManagerRecord` novo, `SaveMeta.managerContract/managerEarnings/managerRenewal/managerVacancies`, `LedgerKind` `manager`, inbox kinds |

## 6. Rotas

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/transfer-windows` | `{ player: { country, open, until?, opensOn? }, countries: [{ country, current?, next }] }` |
| `POST /api/saves/:id/transfers` | + 409 `windowClosed { opensOn }`; resposta com `rival?` e `preference?`; `response: "lost"` |
| `POST /api/saves/:id/loans`, `POST /bids/:bidId` | + 409 `windowClosed` |
| `POST /api/saves/:id/pre-contracts { playerId, fromSquadId, wage, years }` | `{ accepted, preference }`; 400 `notEligible` (contrato longe do fim), 409 `squadFull`/`noClub` |
| `GET /api/saves/:id/negotiation` | + `preContracts`, `rivals` |
| `GET /api/saves/:id/manager-contract` · `POST .../manager-contract { accept }` | Contrato, ganhos, renovação pendente; 409 `offerClosed` |
| `GET /api/saves/:id/managers?scope=world\|country\|free` | itens com `clubs`, `free`, `interim` |

Todas: `requireSaveOwner`; escrita com `withSaveLock` (+ `BufferingSaveDAL` quando mexer em vários recursos).

## 7. i18n (en, pt-BR)

`transferWindows.*` (aberta/fechada/abre em/fecha em, aba Janelas), `negotiation.rival.*`, `negotiation.preContract.*`,
`errors.windowClosed`, `inbox.transfer.{window_open,window_closing,window_closed,rival_bid,lost_to_rival,pre_contract,pre_contract_joined}`,
`inbox.managerNews.*`, `inbox.board.{contract_offer,contract_renewed,contract_ended}`, `managerContract.*`,
`financesScreen.kinds.manager`, `statsScreen.managers.{free,interim,leftReason.*}`, `jobs.offer.{wage,years,compensation}`,
`fired.contractEnded`. Changelog 4.0 (`items` + `upcoming`), `package.json`.

## 8. `/test`, `/lab`

Sem efeito de partida: nada a exibir. Nenhuma estatística nova em `Statistics.ts`.

## 9. Medição e calibração

Script novo `scripts/market-sim.ts [temporadas=3]` (molde de `contracts-sim.ts`, mundo inteiro, mercado e técnicos
ligados, jogador sem clube humano):

| Métrica | Alvo |
|---|---|
| Transferências com taxa IA × IA por temporada no mundo | ±15% da 3.9.1 (rodar o script na `main` antes de mudar; `--no-windows`) |
| Transferências fora da janela do comprador | 0 |
| Fatia da janela de pré-temporada / meio | ~70% / ~30% |
| Estados de contratação da IA (open/tight/frozen) | iguais aos de `contracts.md` (≥ 90% open por tier) |
| Elenco médio | 26–24 como hoje |
| Clubes que trocam de técnico por temporada (nível 1) | 20–35% |
| Idem, níveis 2+ | 10–25% |
| Mediana de permanência do técnico da IA | 1,5–3 temporadas |
| Pool de livres (não aposentados) | estável: < 0,1 × nº de clubes após 3 temporadas |
| Salário do técnico / receita do clube do jogador | 1,5–4% |
| Rival aparece em conversas de compra | 20–40% das conversas; jogador perde o alvo em 5–15% |

Ajustar `ATTEMPTS_PER_OPEN_DAY`, `p` de demissão e `RIVAL_BASE` até os alvos.

## 10. Testes e smoke

```
bun test src/Domain/market src/Domain/managers src/Domain/negotiation src/Domain/transfer src/Domain/jobs \
  src/backend/windows.routes.test.ts src/backend/managers.market.test.ts src/backend/jobs.test.ts
```

- Puros: janelas de uma liga de ano cruzado e de ano civil, país sem pirâmide, ponto médio no limite do dia 15,
  carência; chance de demissão (proteção de 60 dias, forma, teto, 1 por temporada), contratação (alvo, poach,
  interino); salário/multa/compensação; rival (piso, prazo, preferência); pré-contrato.
- Rotas: 409 `windowClosed` em compra/empréstimo/proposta; livre fora da janela passa; pré-contrato e a chegada na
  virada; renovação do técnico; aceitar emprego com compensação (extrato: `arrive` líquido, soma = saldo).

`scripts/season-rollover-smoke.ts`, seção nova **"Mercado vivo"**:

- O dia passa a registrar transferências no log do dia (`DayLog.transfers: { playerId, from, to, fee, kind, date }[]`);
  nenhuma com taxa ou início de empréstimo fora da janela do comprador; houve transferências nas duas janelas
  atravessadas.
- `managers.json`: um técnico por clube todo dia de checagem; nenhum técnico em dois clubes; toda passagem fechada
  tem `to` e `left`; houve demissões da IA na corrida e todas as vagas preenchidas em ≤ 21 dias; nenhum interino
  com mais de uma temporada sem vaga.
- Técnico do jogador: linha `manager` em toda segunda com o valor do contrato; renovação oferecida antes da virada
  (o smoke aceita); extrato soma = saldo.
- Disputa: uma conversa forçada com rival que o smoke deixa vencer → o jogador vai ao rival, inbox `lost_to_rival`.
- Pré-contrato forçado de um jogador da IA com contrato acabando na virada → chega ao clube do jogador.
- As seções Contratos, Negociação e Convites continuam passando (a troca de clube do smoke agora sai com
  compensação e interino no clube antigo).

## 11. Regras e documentação

Regra nova `.claude/rules/game/transfer-windows.md`; atualizar `managers.md` (pool, demissão, contratação),
`jobs.md` (sem troca, vagas, compensação, contrato), `negotiation.md` (janela, rival, pré-contrato),
`AI-clubs/transfer-needs.md` (tick por janela), `finances.md` (kind `manager`), `contracts.md` (livres fora da
janela, pré-contrato na virada). `docs/ROADMAP.md` etapa 25.

## 12. Limitações

- Técnicos da IA não têm salário, multa nem contrato com duração (regra, não simulação).
- Sem janela de emergência (goleiro lesionado etc.); o livre cobre isso.
- Ligas europeias de ano civil (Noruega, Suécia…) têm janelas próprias pelo calendário delas, não as da UEFA.
- Rival só para compras do humano com taxa; a IA × IA não disputa entre si (o primeiro que tenta compra).
- `managerEarnings` é só exibição (o técnico não gasta dinheiro).
- Mesma não-atomicidade da fase 1 do `flush` (`finances.md`): um dia refeito pode repetir uma demissão já gravada
  em `managers.json` sem a meta.

## 13. Riscos

- **Mercado concentrado:** 3× mais tentativas por dia em menos dias pode esgotar verbas cedo na pré-temporada e
  deixar a janela do meio vazia → medir a fatia por janela; se preciso, reservar parte da verba (`WINTER_RESERVE`).
- **Elencos curtos entre janelas:** mitigado por livres fora da janela e pela reposição da virada.
- **Custo do avanço do dia:** a avaliação de técnicos lê a tabela de todas as ligas às segundas (~83 tabelas
  pequenas); o índice e as tabelas já são lidos no dia. Medir com `bench-advance-day.ts` (meta: +< 0,1 s/dia).
- **Corridas entre proposta de emprego e contratação da IA:** resolvidas tirando o recém-contratado (2.3).
- **`managers.json` crescendo:** interinos sem pontos são apagados; aposentados ficam (registro pequeno).

## 14. Decisões em aberto (com recomendação)

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Carência de mercado na carreira nova (a janela europeia fecha em 31/01 e a carreira começa em 05/02) | **Sim**, 30 dias só para o clube do jogador. Na troca de clube, não |
| D2 | Pré-contrato | **Entra só humano ← IA** (contrato ≤ 183 dias); IA → humano e acerto antecipado de taxa ficam para depois |
| D3 | Quem paga a compensação quando o jogador troca de clube no meio do contrato | **O clube novo**, abatida do orçamento de chegada (o jogador vê o líquido no cartão) |
| D4 | Acabar com a troca de técnicos na mudança de clube do jogador | **Sim**: técnico deslocado vai para o pool, clube antigo contrata pela regra (interino + vaga) |
| D5 | Renovação do técnico recusada/ignorada | **Contrato acaba na virada → desemprego sem demissão** (aviso 7 dias antes), coerente com contratos de jogador |
| D6 | Duas propostas da IA pelo mesmo jogador do humano ao mesmo tempo | **Sim**, no máximo 2 vivas por jogador (pequeno leilão já com o fluxo da inbox) |
| D7 | Livres fora da janela | **Sim** (regra real e mantém o equilíbrio dos elencos) |
| D8 | Notícias de técnicos na inbox | **Só a liga do jogador**, agrupadas por dia (categoria `manager_news`) |
| D9 | Multa ao ser demitido sem uso prático (`managerEarnings` só exibição) | **Manter só exibição** nesta etapa; um uso (ex.: prestígio, conquistas) fica para depois |
