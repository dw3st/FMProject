# Convites de clubes, troca de clube e desemprego

Spec: `docs/superpowers/specs/2026-10-04-job-offers-design.md`. Etapa 20 do `docs/ROADMAP.md`, versão **3.5**.
Visual: `.claude/rules/ui-standard.md`. Diretoria: `board-fans.md`. Ranking: `managers.md`.

## Regra

- O técnico do jogador recebe propostas de outros clubes pela **reputação** (0..100) e pode trocar de clube
  sem começar outro jogo. Recusar não custa nada; aceitar pede confirmação e troca tudo num único dia
  bufferizado.
- A **demissão** (com "Pode ser demitido" ligado) não encerra mais a carreira: o técnico fica **sem clube**
  (`meta.unemployed`, `meta.clubId = ""`), o jogo continua avançando e as propostas chegam a cada 2 semanas.
- Sem migração (protótipo): `meta.ended` deixou de existir; save antigo demitido não tem o que mostrar.
- `/test` e `/lab`: sem efeito de partida, nada a exibir.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/jobTypes.ts` | `JobOffer`, `JobWindow`, `Unemployment` |
| `src/Domain/jobs/jobsConfig.ts` | Constantes (`JOBS`) |
| `src/Domain/jobs/jobs.ts` (+ teste) | Puro: reputação, prestígio, faixa, sorteio por janela, oferta garantida, poda/fusão de ofertas, `moveHumanManager`, `sackHumanManager` |
| `src/backend/jobWorld.ts` | E/S: `loadJobWorld` (prestígio do mundo), `generateJobOffers`, `releaseHumanClub`, `takeOverClub`, `acceptJobOffer`, `reputationOf` |
| `src/backend/jobRoutes.ts` | `GET /api/saves/:id/jobs`, `POST /api/saves/:id/jobs/:offerId` |
| `src/backend/advanceDay.ts` | Janelas de oferta, demissão → desemprego, mensagens `job` (depois do `clearInbox`) |
| `src/backend/advanceUntil.ts` | Desempregado: o avanço rápido vai até o dia seguinte às próximas propostas; para no dia em que chegam ofertas |
| `src/Domain/youth/youth.ts` | `academyToAi` — a base do clube que vira IA |
| `src/GameInterface/Components/JobOfferCard.tsx` | Cartão da proposta (Aceitar com confirmação / Recusar) |
| `src/GameInterface/NoClubScreen.tsx` | "Sem clube": reputação, próximas propostas, propostas pendentes |
| `src/GameInterface/Components/Layout.tsx` | Desempregado: telas de clube viram `NoClubScreen` (ficam Ligas, Estatísticas, Olheiro, Jogador) |

## Reputação (`managerReputation`)

```
reputação = 45 × percentil no ranking mundial (empates contam meio: início de carreira = 0,5)
          + 30 × diretoria / 100           (desempregado: a diretoria do dia da demissão)
          + 15 × min(1, pontos de títulos das últimas 3 temporadas / 200)
          + 10 × min(1, temporadas / 5)
```

Carreira nova: ~40. Calculada na hora (`GET /jobs`, janelas), nada gravado.

## Prestígio e faixa

- **Prestígio** do clube = percentil do `clubLevel` no mundo (clubes das ligas ativas) + tier
  (LOW −0,1, MEDIUM 0, HIGH +0,05, ELITE +0,1), limitado a 0..1 (`clubPrestiges`).
- **Empregado:** `[prestígio atual − 0,05, reputação/100 + 0,10]`; o sorteio pesa uma gaussiana em
  `atual + 0,05` (σ 0,08): um passo acima é o comum, um salto grande é raro.
- **Desempregado:** `[0, prestígio do último clube − 0,05]`, concentrado em `último − 0,12` (σ 0,12).
- Peso de lugar: mesmo país 3, mesmo continente 2, resto 1. Nunca o próprio clube nem o que o demitiu;
  no meio da temporada nunca um rival da mesma cidade.

## Janelas

| Janela | Quando | Ofertas | Validade |
|---|---|---|---|
| `season_end` | virada do país do jogador (não demitido) | Poisson(λ) até 3, λ = 0,3 × e^(0,0474 × (reputação − 40)): 40 → 0,3; 80 → ~2 | até a véspera do 1º jogo da temporada nova, no mínimo 1 dia (sem calendário: 30 dias) |
| `mid_season` | uma vez por temporada, quando o clube jogou metade das rodadas (`meta.jobsMidSeason`) | 0–1, só com reputação ≥ 60 ou diretoria ≥ 80 | 7 dias |
| `unemployed` | 7 dias depois da demissão, depois a cada 14 (`unemployed.nextOfferDate`) | 1–3 | 14 dias |

Sorteio determinístico (`seedFrom(jobs:save:data:janela)`); o mundo (`loadJobWorld`, ~1,3 s) só é lido
quando o sorteio dá ao menos uma oferta. Sem oferta nenhuma por 120 dias desempregado (faixa vazia),
**oferta garantida** do clube de menor prestígio da faixa (ou do mundo).

Cada `JobOffer` guarda clube, liga, a meta que a diretoria pediria (`objectiveFor`; com jogos na liga,
a posição atual entra no lugar da força), orçamento (`aiTransferBudgetOf`), posição esperada, validade.
`meta.jobOffers` é podado todo dia (`expires < dia seguinte` cai). O avanço do dia devolve `jobOffers: n`
quando chegam ofertas (o avanço rápido para ali).

## Aceitar (`acceptJobOffer`, rota com `withSaveLock` + `BufferingSaveDAL`, meta por último)

1. **Clube antigo → IA** (`releaseHumanClub`, só empregado): o saldo sai do extrato (`club_change`
   "leave", `−saldo`), ganha `financialTier` (tier natural) e `aiTransferBudget` (verba sazonal), perde
   `staff`, `styleFamiliarity` e a base (`academyToAi`: 1–2 promovidos pela regra da IA, o resto livre);
   a lista de venda do jogador zera; ofertas de renascido pendentes do clube expiram (e a rota
   `POST /reborn/:id` só aceita aposentados do clube atual).
2. **Técnicos (D4, Etapa 25):** `moveHumanManager` — sem troca: o técnico do clube novo vai para o pool
   (`left: "moved"`; um interino sem pontos é apagado), o clube antigo recebe interino + vaga
   (`meta.managerVacancies`) e contrata pela regra da IA (`managers.md`). O registro do jogador ganha a passagem.
3. **Clube novo → do jogador** (`takeOverClub`): saldo 0 + `club_change` "arrive" com o orçamento que
   a proposta mostrou (`offer.budget`); os contratos que acabariam na virada desta temporada são renovados
   pela regra da IA (`renewExpiringOnTakeover`) e, dentro da janela de aviso (90 dias), a inbox recebe o
   aviso de contratos com os que sobraram; lista de venda vazia; tira `financialTier`/`aiTransferBudget`; `staff` inicial pelo tier (`initialStaff`, semente
   save:clube:data); familiaridade inicial (`balanced` 75); `tactics.json` com a formação da IA do clube
   (`aiRecordFor`), estilo equilibrado e XI automático; diretoria e torcida em 60 com a meta do clube novo.
4. **Inbox:** as mensagens antigas ficam; as de proposta caem; entram "hired" e a meta da diretoria.
5. **Meta:** `clubId`, `clubName`, `clubColors`, `leagueSlug`, `leagueName`, `followedLeagues` (sem a
   liga nova), `formation`, `tactical_style`, `board`; `jobOffers` vazio; `jobsMidSeason` = temporada
   atual da liga nova (a janela do meio da temporada não abre logo depois da troca); sai `unemployed`,
   `rotationOverride`, `style_focus`.

409 `offerClosed`: oferta vencida, inexistente ou de clube que sumiu. `POST { accept: false }` só tira a
oferta.

**Extrato:** a soma de todos os lançamentos continua igual ao saldo do clube atual: "leave" zera o saldo
antigo, "arrive" traz o novo (cada um na temporada do extrato da liga do seu clube). Desempregado, a soma
é 0. `club_change` não conta como receita nem despesa na tela de Finanças (`clubLeave`/`clubArrive`).
Numa temporada com troca de clube, `GET /ledger` calcula `totals` e `weekly` só a partir da última
chegada (o gráfico ignora o próprio `club_change`); a lista `entries` continua completa.

Desempregado, a compra (`POST /transfers`) e a lista de venda (`POST /sell-list`) devolvem 409 `noClub`; a
lista de venda só aceita jogadores do próprio elenco (400).

## Demissão → desemprego (`advanceDay`)

No dia da demissão: mensagem `sacked`, multa (`manager`, `severance`, ver "Contrato do técnico"),
`releaseHumanClub` (clube vira IA), `sackHumanManager` (o jogador sai, um interino `coach_<clube>_<data>` assume
e o clube ganha uma vaga, `managers.md`), `meta.clubId = ""`, `meta.board`
removido e `meta.unemployed = { since, lastClubId, lastClubName, lastLeagueSlug, board, nextOfferDate,
lastOfferDate?, sacking }` (`sacking` = o registro que a tela `/fired` mostra). `meta.leagueSlug` fica a
liga antiga (calendário, virada e inbox continuam por ela). Desempregado o dia corre sem clube humano
(sem jogos, treino, finanças, diretoria).

## Telas

- **Inbox:** categoria `job` (`JobInboxMessage`): `offer` com o `JobOfferCard` (pendente enquanto está
  em `meta.jobOffers` e válida) e `hired`.
- **Painel:** cartão do clube com "Reputação: N" e "N propostas" (link para a inbox).
- **Sem clube:** toda tela de clube vira `NoClubScreen`; o Continuar vira "Aguardar propostas" e o
  botão de treino/descanso some. `/fired` é só a notícia, com "Ver propostas" (Painel).
- **Ranking de técnicos:** abrir o técnico do jogador mostra a carreira (passagens) e os títulos.
- **Início:** save desempregado mostra "Sem clube".

## Testes e smoke

```
bun test src/Domain/jobs src/backend/jobs.test.ts src/backend/board.advanceDay.test.ts
```

`jobs.test.ts`: dono do save, oferta vencida 409, recusa, troca completa (clube antigo IA sem staff/base,
novo com staff/extrato/tática, técnicos trocados, extrato = saldo, o dia seguinte roda), demissão →
desemprego → ofertas a cada 2 semanas → aceitar do desemprego.

`scripts/season-rollover-smoke.ts`, seção "Convites": depois da virada do país do jogador, uma oferta
forçada de um clube da liga de ano civil que termina primeiro é aceita pela rota; checa clube antigo IA,
staff e extrato do novo, um técnico por clube, e avança até a virada daquela liga com o jogador no clube
novo (meta nova, temporada contada).

## Limitações

- O jogador não procura emprego ativamente.
- O prestígio é recalculado a cada janela (não guardado); a força do elenco muda com transferências.

## Contrato do técnico do jogador (Etapa 25, 4.0)

Spec `docs/superpowers/specs/2026-10-05-living-market-design.md` §3. Lógica pura em
`src/Domain/managers/managerContract.ts` (`MANAGER_CONTRACT`).

- `SaveMeta.managerContract { squadId, wage, until, signed }`, `managerEarnings` (só exibição, D9),
  `managerRenewal { offeredOn, expires, wage, seasons }`, `managerContractNotices` (dedupe dos avisos).
- **Salário semanal** = `wageRevenueBasis × (0,015 + 0,025 × reputação/100) / 52` (1,5% a 4% da receita), fixado na
  assinatura. Toda segunda, linha `manager` no extrato (`computeAdvanceDayMoney({ managerWage })`); `managerEarnings`
  soma.
- **Carreira nova:** 2 temporadas (`createSave`). **Proposta de emprego:** 1–3 temporadas pelo prestígio
  (`offerSeasons`: ≥ 0,35 → 2, ≥ 0,7 → 3); o cartão mostra salário, duração, compensação e orçamento líquido.
- **Renovação:** com o contrato acabando na temporada atual e 85% das rodadas jogadas, a diretoria decide
  (`contractDay`): ≥ 60 → 2 temporadas com o salário da reputação de hoje (nunca abaixo do atual); 40–59 → 1
  temporada com o salário atual; < 40 → não renova (aviso `contract_ending`). Oferta na inbox (`board`,
  `contract_offer`, Aceitar/Recusar via `POST /manager-contract`), válida até a virada. Aviso 7 dias antes do fim
  quando não renovou.
- **Fim do contrato (D5):** na virada do país do jogador com `until <= hoje` → desemprego **sem** demissão
  (`meta.unemployed.sacking.reason = "contract"`, `/fired` mostra "Contrato encerrado"), mensagem `contract_ended`;
  o clube recebe interino + vaga.
- **Demitido:** `severancePay` = 0,5 × salário × semanas restantes (máx. 52) → `managerEarnings`; o clube antigo lança
  `manager` (`ref.stage = "severance"`) antes do `club_change` "leave" (soma = saldo continua).
- **Virada do país:** o `until` é reancorado no fim da temporada da liga nova (`reanchorContract`, mantém as
  temporadas restantes) — um rebaixamento para uma liga que acaba antes não trava a renovação nem o fim.
- **Sem "Pode ser demitido":** a diretoria sempre oferece (no mínimo 1 temporada com o salário atual).
- **Proposta aceita depois de 85% da temporada da liga nova:** o contrato conta a partir da próxima temporada.
  `careerStart` é apagado na troca (a carência de mercado vale só na carreira nova).
- **Troca no meio do contrato (D3):** o clube novo paga ao antigo `compensationFee` = 0,5 × salário × semanas
  restantes (máx. 52; zero no último mês), gravada na oferta (`offer.compensation`) — sai do saldo de chegada
  (`arrive` = max(0, orçamento − compensação)); a troca e a demissão limpam também `preContracts`, `rivalBids` e
  `lostTargets` do mercado; o clube
  antigo (IA) recebe metade na verba (`aiBudgetWithPrize`).
- **Vagas nas propostas de desemprego:** clubes com vaga pesam × 3 (`JOBS.VACANCY_WEIGHT`) no sorteio
  (`pickOfferingClubs({ vacant })`). Se a IA contratar antes de o jogador aceitar, a oferta segue e o recém-contratado
  vai ao pool.
- **Telas:** cartão do clube no Painel "Contrato até AAAA · €X/sem"; renovação pendente no cartão Atenção; tipo
  "Salário do técnico" em Finanças (despesas, projeção semanal, filtros).

Testes: `bun test src/Domain/managers src/backend/jobs.test.ts src/backend/windows.routes.test.ts`. Smoke: Convites
(compensação e interim no clube antigo, renovação aceita antes da virada do clube novo).
