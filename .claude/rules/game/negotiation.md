# Negociação, cláusula de venda futura e empréstimos

Spec: `docs/superpowers/specs/2026-10-04-negotiation-loans-design.md`. Etapa 21 do `docs/ROADMAP.md`, versão
**3.7**. Visual: `.claude/rules/ui-standard.md`. Mercado da IA: `.claude/rules/AI-clubs/transfer-needs.md`.

## Regra

- **Compra:** a IA responde a uma oferta do jogador com **aceita**, **contraproposta** ou **recusa**
  (`respondToOffer`). Contraproposta é a menor taxa que leva o `decisionScore` a 0,8 (inverso da fórmula de
  `evaluateTransferOffer`), arredondada para cima (€0,1M abaixo de €10M, €1M acima), nunca abaixo da oferta.
- **Paciência:** 3 rodadas por jogador por dia; uma oferta abaixo de 60% do valor (já contando a cláusula)
  encerra a conversa por 14 dias (`insulted`). Aceitar a contraproposta do dia (mesma cláusula) sempre passa.
- **Cláusula de venda futura (`RosterPlayer.sellOn`):** 10/20/30% oferecidos ao vendedor na compra, ou pedidos
  pelo jogador numa venda para a IA. Para a IA, cada 10% vale 4% da taxa (6% com jogador ≤ 23). Paga na próxima
  venda com taxa do jogador, por qualquer comprador: o vendedor recebe `taxa − parte`, o dono da cláusula recebe
  a parte (humano no extrato, IA na verba de transferências com o mesmo teto de `applyAITransferSale`). Some
  depois de paga; a venda pode gravar uma cláusula nova.
- **Vendas do jogador:** a lista de venda não vende sozinha. Um clube da IA cuja necessidade cobre a linha do
  jogador (faixa de nota ±0,5) manda uma **proposta** (`MarketBid`, 5 dias de validade) para a inbox; às vezes com
  cláusula de 10/20% para o jogador. Raramente (3%/dia) um clube maior (tier HIGH/ELITE, elenco mais forte) faz
  proposta pelo melhor jogador fora da lista. O jogador aceita, recusa ou contrapropõe (taxa + cláusula pedida):
  a IA aceita até o teto (`min(verba, priceCap, valor × 1,25)`, menor com cláusula), responde uma vez com o teto
  e, numa segunda contraproposta acima dele, desiste (409 `noRounds`).
- **Empréstimo, pedir (jogador ← IA):** duração até o fim da temporada da liga do jogador (da próxima, se faltam
  menos de 60 dias; nunca além do contrato), % do salário pago (0–100) e taxa opcional. A IA só empresta quem não
  é titular do XI automático 4-3-3 e é ≤ 23 anos, está na lista de venda dela ou sobra na linha (mais que o mínimo
  + 1 depois de sair); nunca abaixo dos mínimos por linha nem com 15 jogadores. Aceita se
  `0,5 × salário pago no período + taxa ≥ mínimo`, com
  `mínimo = 0,5 × salário do período × clamp(0,75 + 0,5 × força relativa, 0,4, 1) + valor × 0,04 × max(0, força) × semanas/40`;
  senão contrapropõe a % do salário (arredondada a 10%) ou 100% + taxa. Mesma paciência da compra.
- **Empréstimo, ceder (jogador → IA):** "Colocar para empréstimo" (`market.playerLoanList`). Por dia, 35% de
  chance por jogador listado de um clube com `cover_need` na linha, elenco < 30 e folha que cabe mandar uma
  proposta (`loan_bid`: 50–100% do salário, duração como acima). Aceitar ou recusar.
- **Emprestado (`RosterPlayer.loan`):** fica no elenco do clube que pegou, joga normalmente, entra na folha só com
  a parte combinada (`clubWage`/`squadWeeklyWages`); o clube de origem paga o resto (o extrato do jogador soma a
  parte dele na linha `wages`, `parentLoanWages`). Não pode ser vendido, emprestado, posto à venda nem renovado
  (400 `onLoan`); o mercado da IA o ignora. Volta na data (checado todo dia, antes do mercado) e na virada do país
  do clube que o tem (passo 7a, com a mesma folga de 60 dias dos contratos, antes da aposentadoria e das
  expirações). A linha de histórico no clube emprestado ganha `loan: true` ("(empréstimo)").
- **Mínimos do elenco do jogador:** uma venda ou um empréstimo aceito pela inbox nunca deixa o clube do jogador com
  14 ou menos, sem outro jogador na posição ou abaixo dos mínimos por linha (409 `squadDepth`); esses jogadores nem
  recebem propostas.
- **Teto de 30:** os cedidos por empréstimo contam no teto do clube do jogador (compra, livre, promoção da base,
  pedir empréstimo — `humanRosterSize`). Na volta, um clube da IA acima de 30 dispensa o pior para os livres, e o
  clube que devolve abaixo de um mínimo por linha é reposto (`refillSquad`; o jogador humano só recebe jovens).
- **Contrato de um cedido:** o jogador renova o próprio emprestado (a rota acha o jogador por `market.loans` e grava
  no elenco de quem o tem). Na virada do país do clube de origem, um empréstimo cujo contrato acaba dentro da folga de
  60 dias também volta antes das expirações. Emprestado não se aposenta no clube que o pegou (se aposenta no dele).
- **Proposta aceita de empréstimo:** a folha da IA é conferida de novo no aceite (`passesWageGate` da parte dela).
- **Inbox:** propostas ainda vivas são reenviadas depois do `clearInbox` da virada do país do jogador.
- **Cláusulas a receber (`sellOnHeld`):** saem quando pagas (inclusive ao recomprar o jogador), quando ele se aposenta
  ou sai livre (`toFreeAgent` também apaga `sellOn` e `loan`).
- **IA × IA:** nunca empresta. Sem migração (protótipo).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/negotiation/negotiationConfig.ts` | Todas as constantes (`NEGOTIATION`) |
| `src/Domain/negotiation/negotiation.ts` | `respondToOffer`, cláusula (`sellOnValueFraction`, `sellOnOwed`), arredondamento, conversa (`talkGate`, `recordRound`, `pruneTalks`), `respondToHumanCounter` |
| `src/Domain/negotiation/loans.ts` | `loanUntil`, `loanAvailability`, `loanMinimum`, `respondToLoanRequest`, `buildAiLoanBid`, `squadsAfterLoanStart/End`, `dueLoans`, `parentLoanWages` |
| `src/Domain/negotiation/bids.ts` | `buildAiTransferBid`, `generateBidsForHuman`, `liveBids` |
| `src/Domain/negotiation/negotiation.test.ts` | Testes puros |
| `src/Domain/transfer/transferAcceptance.ts` | `saleContext`, `saleDecisionScore`, `feeForSaleScore`, `squadDepthBlocked` (compartilhados com `evaluateTransferOffer`); `squadsAfterAcceptedTransfer` derruba `sellOn`/`loan` e grava a cláusula nova |
| `src/Domain/transfer/marketRotation.ts` | `dailyMarketTick` gera as propostas (`newBids`) no lugar do antigo `tryMatchPlayerSellList` e preserva os campos novos do mercado |
| `src/backend/negotiationWorld.ts` | E/S: `startLoan`, `returnDueLoans`, `completeHumanSale`, `settleSellOn` |
| `src/backend/negotiationRoutes.ts` | Rotas (abaixo) |
| `src/backend/transfers.ts` | Compra com conversa, cláusula e pagamento da cláusula antiga |
| `src/backend/FinancialService.ts` | `executeTransferFee(..., { sellOn, loan, playerName })`, `paySellOnReceiver` |
| `src/backend/advanceDay.ts` | Volta dos empréstimos (dia e virada), propostas na inbox, cláusula paga em venda IA × IA, parte do salário dos emprestados |
| `src/GameInterface/Components/PlayerOfferModal.tsx` | Modal "Negociação": abas Transferência e Empréstimo, rodadas, paciência, cláusula |
| `src/GameInterface/Negotiation/*` | `BidCard` (inbox), `NegotiationHistory`, `NegotiationOverview` (empréstimos, cláusulas, propostas), `ListToggles` (venda/empréstimo na ficha) |
| `src/GameInterface/Components/LoanBadge.tsx` | Selo "Emprestado" (elenco, ficha) |

## Dados

- `RosterPlayer.sellOn?: { clubId, clubName, pct }`, `RosterPlayer.loan?: { fromClubId, fromClubName, until, wageShare }`.
- `MarketState` (`market.json`): `playerLoanList`, `pendingBids: MarketBid[]`, `talks: Record<"transfer:<id>"|"loan:<id>", NegotiationTalk>`
  (rodadas do dia, contraproposta, `closedUntil`, histórico), `loans: ActiveLoan[]` (todo empréstimo que envolve o
  clube do jogador, para a volta, a folha e a tela; continua valendo depois de uma troca de clube),
  `sellOnHeld` (cláusulas do jogador a receber). Uma troca de clube (`jobWorld`) limpa listas, propostas, conversas e
  cláusulas; os empréstimos ativos seguem até a data.
- Extrato: `transfer_in`/`transfer_out` com `ref.stage = "sell_on"` (cláusula recebida/paga) ou `"loan_fee"`;
  `ledgerText` → `sellOnIn`/`sellOnOut`/`loanFeeIn`/`loanFeeOut`.
- Inbox `transfer` (`TransferInboxMessage`): `bid`, `loan_bid`, `loan_back` (um emprestado voltou ao clube dele),
  `loan_home` (um seu voltou), `sell_on`. Gravadas depois do `clearInbox` do dia.

## Rotas (todas com `requireSaveOwner`; as de escrita com `withSaveLock`; sem clube → 409 `noClub`)

| Rota | Faz |
|---|---|
| `POST /api/saves/:id/transfers { playerId, fromSquadId, fee, wage, years, sellOnPct? }` | Compra: `{ response: accept\|counter\|reject, talk, record? }`; 409 `talksClosed` / `noRounds`; 400 `onLoan` |
| `GET /api/saves/:id/negotiation` | Propostas vivas, empréstimos, lista de empréstimo, cláusulas a receber |
| `GET /api/saves/:id/negotiation/:playerId?kind=transfer\|loan` | Conversa do dia (ou encerrada) |
| `POST /api/saves/:id/bids/:bidId { action: accept\|reject\|counter, fee?, sellOnPct? }` | Responde uma proposta; 409 `offerClosed` (vencida, sumida, clube sem verba/folha/vaga), `noRounds` |
| `POST /api/saves/:id/loans { playerId, fromSquadId, wageShare 0..100, fee }` | Pede empréstimo: `{ response, talk, until }` |
| `GET/POST /api/saves/:id/loan-list { playerId }` | Lista de empréstimo (alterna) |

## Telas

- **Negociação** (`PlayerOfferModal`, botão "Fazer oferta" da ficha, do elenco e do olheiro): abas Transferência
  (taxa, cláusula 0/10/20/30%, contrato) e Empréstimo (% do salário, taxa); rodadas do dia e paciência; botão para
  aceitar a contraproposta.
- **Ficha do seu jogador:** "Colocar à venda" / "Colocar para empréstimo" (`ListToggles`). Emprestado: selo, sem botões.
- **Inbox:** cartão de proposta (Aceitar, Contrapropor, Recusar; empréstimo sem contraproposta).
- **Elenco:** selo "Emprestado"; aba "Emprestados" (cedidos e recebidos).
- **Transferências:** aba "Empréstimos" (propostas, cedidos, recebidos, cláusulas a receber).

## `/test`, `/lab`

Sem efeito de partida: nada a exibir.

## Testes e smoke

```
bun test src/Domain/negotiation src/backend/negotiation.routes.test.ts src/Domain/transfer
```

`scripts/season-rollover-smoke.ts`, seção "Negociação": dois reservas na lista de venda e um na de empréstimo no
começo; propostas chegam pela inbox e nunca vendem sozinhas; uma compra com contraproposta (cláusula de 10% para o
vendedor); a venda dele por uma proposta da inbox com contraproposta pedindo 20% (a cláusula de 10% vai para o
primeiro clube); a revenda paga os 20% do jogador (`transfer_in` `sell_on`); um empréstimo de ida e um de volta que
voltam na data pelo avanço do dia, com as mensagens.

## Limitações

- A IA de origem não paga a parte do salário de quem emprestou ao jogador (clubes da IA não têm caixa); só a folha
  dela deixa de contar o jogador.
- "Titular" para empréstimo é o XI automático 4-3-3, não a formação escolhida pela IA na temporada.
- A conversa é por dia de jogo, não por janela de transferências (não há janelas).
