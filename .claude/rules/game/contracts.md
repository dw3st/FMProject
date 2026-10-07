# Contratos, jogadores livres e salários fixos

Spec: `docs/superpowers/specs/2026-09-30-contracts-design.md`. Planos (`docs/superpowers/archive/`): `2026-09-30-contracts-1.md` (modelo,
expiração, renovação) e `2026-09-30-contracts-2.md` (livres, elencos estáveis, telas). Etapa 7 do
`docs/ROADMAP.md`, versão **1.7**. O declínio dos craques (#6) é a Etapa 4 do plano 2, fora deste arquivo.

## Regra

- `RosterPlayer.contract?: { until, wage }` — `until` é o último dia da temporada da liga do clube,
  `wage` é o salário semanal fixo em EUR. Todo jogador tem contrato (criação da carreira, kits,
  contratação, renovação).
- A folha (`squadWeeklyWages`), o teto da IA (`aiClubFinance`) e o extrato somam `contract.wage`; a
  curva (`playerWeeklyWage`) só vale na hora de criar ou renovar um contrato.
- Na virada do país, contratos vencidos expiram: a IA renova quem cabe, o jogador humano só mantém
  quem ele renovou antes; quem sai vira jogador livre. Depois das expirações o elenco é reposto
  (ver "Elencos estáveis").
- Jogadores livres ficam em `saves/{id}/freeAgents.json` (`FreeAgent { player, since }`) e saem do
  mundo uma temporada depois.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/Domain/contracts/contractConfig.ts` | Todas as constantes (`CONTRACT_CONFIG`) |
| `src/Domain/contracts/contracts.ts` | `initialContract`, `contractDemand`, `evaluateContractOffer`, `renewalContract`, `aiShouldRenew`, `isExpired`, `withContracts`, datas |
| `src/Domain/contracts/expiry.ts` | `processContractExpiries` — expiração por clube na virada |
| `src/Domain/contracts/freeAgents.ts` | `refillSquad` (reposição na virada), `freeAgentTick` (contratação diária da IA), `makeYouthPlayer` |
| `src/backend/contractRoutes.ts` | `POST .../players/:id/renew`, `GET .../players/:id/demand`, `POST .../free-agents/:id/sign` |
| `src/backend/advanceDay.ts` | Passo 8 da virada (expirações + reposição + `freeAgents.json`), tick diário de livres |
| `src/backend/transfers.ts` | Compra com taxa exige `{ wage, years }` avaliado por `evaluateContractOffer` |
| `src/backend/scoutSearch.ts` / `src/Domain/scout/scoutQuery.ts` | Livres entram na busca (`filters.onlyFree`); fora dessa visão a busca só mostra jogadores de clube |
| `src/GameInterface/Contracts/` | `ContractTermsFields` (anos + salário + pedido), `ContractOfferModal` (renovar / contratar livre) |
| `scripts/contracts-sim.ts` | Simulação de N temporadas (estados de contratação por nível, elenco médio) |

## Oferta (`evaluateContractOffer`)

`contractDemand = salário da curva × (1 + clamp(nota − média do time, 0, 1,5) × 0,3) × 1,15 se ≤ 23 anos e
nota ≥ média`. Recusa por `lowWage` (abaixo do pedido), `tooManyYears` (idade + anos > 36) ou
`invalidYears` (fora de 1–5). A resposta 400 das rotas é `{ error, demand }`; a UI traduz
`contracts.refusal.*`.

## Expiração e renovação (virada)

- `ROLLOVER_GRACE_DAYS = 60`: um contrato que acaba até 60 dias depois da data da virada também expira
  (deriva de calendário entre temporadas).
- IA: do melhor para o pior, renova se `aiShouldRenew` (nota ≥ média − 0,3, idade < 33, salário novo
  cabe no teto); renovação de 1–3 anos por idade, salário da curva atual. Um clube que cairia abaixo de
  `MIN_SQUAD_AFTER_EXPIRY = 18` mantém os melhores que iam sair, mesmo acima do teto.
- Humano: renovação do jogador move `until` `years` temporadas à frente na hora (rota `renew`); o resto
  sai livre. Inbox `contract`: aviso 90 dias antes, renovado, saiu livre.

## Elencos estáveis (plano 2)

Sem reposição, a simulação do plano 1 encolhia o elenco médio 26,0 → 22,7 → 19,9 em três temporadas.

- **Reposição na virada** (`refillSquad`, depois das expirações, sobre o `pool` = livres existentes +
  recém-liberados, nessa ordem de clubes): enquanto algum papel estiver abaixo do mínimo (GK 3, DEF 7, MID
  7, FWD 4) ou o elenco abaixo de `MIN_SQUAD_AI = 24` (só IA), assina o melhor livre do papel mais
  carente que cabe na folha; se nenhum cabe, cria um jovem de 17–19 anos (`makeYouthPlayer`:
  determinístico por clube + tag, cópia do pior do papel com atributos −1, contrato de 3 anos).
  Teto de 30 jogadores, que nunca impede um mínimo por papel (um elenco cheio e desequilibrado ainda recebe o goleiro que falta). Um clube da IA que passa de 30 por causa de um mínimo dispensa em seguida os piores das linhas com sobra
  (`trimSquadToCap`), o mesmo na volta de empréstimo.
- **Folga:** a IA só assina se `folha + salário ≤ teto × (NEAR_LIMIT_RATIO − REFILL_HEADROOM)`
  (0,9 − 0,03). Sem essa folga a reposição enche o clube até perto do teto e o deixa `tight`.
- **Humano:** só jovens até os mínimos por papel — nunca livres que ele não escolheu, nunca abaixo de um XI.
- **Tick diário** (`freeAgentTick`, depois do mercado normal): 10 clubes da IA sorteados por dia rodam as
  próprias necessidades (`generateTransferNeeds`), pegam a mais urgente e assinam o melhor livre que cabe
  (faixa de nota da necessidade, taxa 0, mesma folga). Clubes que negociaram no dia e o clube do jogador
  ficam de fora.
- Medido com `bun scripts/contracts-sim.ts 3` (1273 clubes): elenco médio **26,9 → 25,2 → 24,4**;
  estados de contratação amostrados por mês, as 3 temporadas juntas: LOW 93,0% open, MEDIUM 93,6%, HIGH
  92,3%, ELITE 97,3% (todos ≥ 90%).

## Livres para o jogador

Busca do `ScoutScreen`: botão "Só jogadores livres" (`onlyFree`). A linha mostra "Contratar" em vez de
"Oferta" e abre o `ContractOfferModal`; `POST /api/saves/:id/free-agents/:playerId/sign { wage, years }`
não cobra taxa, valida `evaluateContractOffer` e o limite de 30 jogadores (`squadFull`). A compra com taxa
(`PlayerOfferModal`) tem os mesmos campos de anos e salário, pré-preenchidos com o pedido
(`GET .../players/:id/demand?from=<squadId>`).

## Telas

- Elenco (`SquadRosterTable`): colunas "Salário" (do contrato) e "Contrato" (ano do fim).
- `PlayerScreen`: botão **Renovar** no jogador do próprio clube.
- `PlayerOfferModal`: anos e salário na compra.
- `ScoutScreen`: visão de livres.

## Testes

```
bun test src/Domain/contracts src/backend/contracts.renew.test.ts src/backend/contracts.sign.test.ts \
  src/backend/contracts.rollover.test.ts src/backend/scoutSearch.test.ts src/Domain/scout
```

`bun scripts/season-rollover-smoke.ts`, seção "Contratos": nenhum contrato vencido nem faltando nos
clubes que viraram, houve renovações e saídas livres, no dia da virada nenhum clube que virou abaixo dos mínimos por papel
(ou de 22 jogadores, IA), e a linha semanal de salários do extrato bate com a soma dos contratos do elenco.

## Review follow-ups

- **AI never signs 35+** (`AI_SIGN_MAX_AGE` = `AI_RENEW_MAX_AGE + 2`): market buys (`findCandidates`), the
  daily free-agent hire and the rollover refill all skip older players.

- **Off-season signing dates:** `contractEndFor(date, seasonEnd, years)` (`contracts.ts`) is the one helper for every signing (human free agent, human transfer buy, AI market signing, daily free-agent hire): a `date` past the league's `end` counts from the next season's end.
- **Renewal limits:** `renewalWithinLimits` — remaining seasons + `years` <= `MAX_YEARS` and age cap, else 400 `tooManyYears`.
- **Squad cap:** AI clubs stop at `MAX_SQUAD` (30; market, sell-list matching, refill). The human club has its own cap `HUMAN_MAX_SQUAD` (36, since 3.9.2: most clubs start the world at 30, so the human could not sign before selling) on the transfer buy, free-agent signing, loan request and youth promotion (`squadFull`).
- **Role minimums on sale:** `evaluateTransferOffer` refuses (`squadDepth`) an AI seller's sale that would leave its main role below `MIN_BY_ROLE`. The smoke checks the minimums at the end of the run for the rolled clubs.
- **Loans (Etapa 21):** a borrowed player keeps the parent club's contract; renewing him is 400 `onLoan`, and a loan
  never runs past the contract. Loans held by a rolling club go back before the expiries (`.claude/rules/game/negotiation.md`).
- **Free pool:** `pruneFreeAgents` runs every day; `toFreeAgent` clears `injury`, `contract` and club on release. Released human players are also removed from `tactics.lineup` and `market.playerSellList`.

## Etapa 25 (4.0): janelas e pré-contrato

- **Livres fora da janela (D7):** contratar livre (humano, `freeAgentTick`, reposição da virada) não depende da janela
  de transferências — regra real e o que mantém os elencos estáveis (`.claude/rules/game/transfer-windows.md`).
  Medido com janelas (`market-sim.ts 3`): elenco médio 27,0 → 25,1 → 24,4; open ≥ 94% em todo tier.
- **Pré-contrato:** na virada do país do clube de origem, o passo **8a** (antes das expirações e da renovação da IA)
  leva os jogadores com pré-contrato ao clube do jogador com o contrato combinado (`applyDuePreContracts`).

## Personalidade (Etapa 26)

`contractDemand(..., ctx)` = `demandBreakdown(...).demand`: ambição ×(1 ± 0,08), lealdade na renovação no próprio
clube (até −10% com 4 temporadas), compatriota (até −5%), clube menor (+10% × ambição por degrau de tier natural) e a
recusa `smallerClub` (ambição ≥ 17, 2+ degraus). `renewalContract` (o que a IA paga) aplica ambição/lealdade/
compatriota. Ver `.claude/rules/game/personality.md`.
