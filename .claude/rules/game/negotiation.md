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
- **Preço pedido (#88, `SellCandidate.askingPrice`):** ao colocar à venda o jogador define um preço (padrão = o
  valor de mercado, `playerMarketValue`, no mínimo €0,1M; passos de €0,1M abaixo de €10M e €1M acima, arredondado
  para cima; piso `0,3 × valor`, `askingFloor`). Preço igual ao valor não é gravado ("No valor"): acompanha o valor
  quando ele muda (evolução, idade). Pôr preço num jogador listado só pelo pedido de transferência (`requested`) vira
  listagem manual (o flag sai; o pedido retirado não o tira mais da lista). Com
  `r = preço / valor` (`src/Domain/negotiation/askingPrice.ts`, constantes em `NEGOTIATION.ASKING`):
  - **r < 1:** chance extra diária de proposta de `freqMult − 1`, `freqMult = min(2, 1 + 2 × (1 − r))`; faixa de
    nota da necessidade ±(0,5 + min(0,5; 2,5 × (1 − r))); o clube precisa poder pagar `0,9 × preço`
    (`DISCOUNT_AFFORD`), e quem não pode (verba, teto do tier, folha) passa a vez ao próximo, até 2 clubes
    (`DISCOUNT_TRIES`); a proposta abre em `preço × (0,95..1,0)` e o teto é o preço.
  - **r > 1:** a escolha diária do jogador só passa com chance `r^−2`; o clube precisa caber o valor; abre em
    `valor + (preço − valor) × (0,2..0,7)` e o teto é o preço (contraproposta até ele).
  - **r = 1 ou sem preço:** exatamente as propostas de antes (teste com o mesmo `rng`). Tudo continua limitado
    por verba, teto do tier, folha, janela, `MAX_PER_PLAYER` e `MAX_PENDING`; a cláusula de venda futura desconta a
    abertura como antes. O pedido de transferência por moral usa o mesmo preço (sem preço, o valor), a chance dele
    × `freqMult`, e o teto do vendedor LOW nunca passa do teto do preço.
  - Medição: `bun scripts/asking-price-measure.ts [sementes] [dias]` (ver "Medição do preço pedido").
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
| `src/Domain/negotiation/askingPrice.ts` (+ teste) | Preço pedido: `askingRatio`, `askingFreqMult`, `askingBandExtra`, `askingOpening`, `parseAskingPrice`, `stepAskingPrice`, `playerMarketValue` |
| `src/GameInterface/Negotiation/AskingPriceModal.tsx` | Campo do preço pedido (ficha e lista de venda) |
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
| `GET/POST /api/saves/:id/sell-list { playerId, askingPrice? }` | Sem `askingPrice`: alterna. Com `askingPrice` (número entre `0,3 × valor` e €2 bi): coloca à venda a esse preço ou só atualiza o preço (nunca tira da lista); `null` ou o próprio valor = "No valor". 400 `invalidPrice`, `not your player`, `onLoan`; 409 `noClub` |

## Telas

- **Negociação** (`PlayerOfferModal`, botão "Fazer oferta" da ficha, do elenco e do olheiro): abas Transferência
  (taxa, cláusula 0/10/20/30%, contrato) e Empréstimo (% do salário, taxa); rodadas do dia e paciência; botão para
  aceitar a contraproposta.
- **Ficha do seu jogador:** "Colocar à venda" / "Colocar para empréstimo" (`ListToggles`). Emprestado: selo, sem botões.
- **Inbox:** cartão de proposta (Aceitar, Contrapropor, Recusar; empréstimo sem contraproposta).
- **Elenco:** selo "Emprestado"; aba "Emprestados" (cedidos e recebidos).
- **Transferências:** aba "Empréstimos" (propostas, cedidos, recebidos, cláusulas a receber).

- **Preço pedido (#88):** "Colocar à venda" na ficha abre o campo do preço (valor de mercado como referência, −/+ no
  passo, nunca abaixo do mínimo, "Usar o valor", texto do efeito: abaixo = propostas mais rápidas, acima = menos
  propostas; texto inválido ou abaixo do mínimo desliga Salvar com aviso); listado, o botão "Pedido €X" ou
  "No valor · €X" edita o preço. Na aba de transferências a lista de venda mostra o pedido e a % do valor (ou
  "No valor · €X", calculado na hora), com "Preço".
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

## Etapa 25 (4.0): janela, rival e pré-contrato

Detalhes em `.claude/rules/game/transfer-windows.md`.

- **Janela:** compra, pedir empréstimo e responder proposta (aceitar/contrapropor) exigem a janela aberta do **comprador**
  (409 `windowClosed { opensOn }`); as propostas da IA vencem no fecho da janela do comprador; conversas caem quando a
  janela do jogador fecha.
- **Propostas pelos jogadores do humano (D6):** até 2 vivas por jogador, de clubes diferentes; só de compradores com
  janela aberta.
- **Disputa:** rivais da IA (`market.rivalBids`) impõem um piso (taxa rival × 1,05) e o jogador escolhe o clube
  (`preferenceScore`); no prazo, o rival compra (`lost_to_rival`). `respondToOffer` ganhou o caso
  `prefers_rival` na rota.
- **Pré-contrato (D2):** `POST /pre-contracts`, `market.preContracts`, chegada no passo 8a da virada do país do clube
  de origem.

## Personalidade (Etapa 26)

`respondToOffer({ ..., buyer })`: o score do vendedor IA ganha `+0,10 × t_ambição` com comprador de tier maior e
`−0,10 × max(0, t_lealdade)`; a contraproposta usa o mesmo score. Compra, livre e pré-contrato podem ser recusados
por `smallerClub`. Ver `.claude/rules/game/personality.md`.

## Medição do preço pedido

`bun scripts/asking-price-measure.ts 40 60` (mundo inteiro, clube humano da Premier League, um jogador comum de cada
linha listado sozinho, 60 dias de janela aberta, 10 clubes renovam as necessidades por dia, 40 sementes). "ignorar" =
as propostas ficam pendentes até vencer (no máximo 2 vivas por jogador); "recusar" = recusadas no mesmo dia.

| Jogador | r | propostas (ignorar) | propostas (recusar) | taxa / valor | 1ª proposta (dia) |
|---|---|---|---|---|---|
| Zagueiro 5,31 | 1,0 | 12,6 | 19,3 | 0,83 | 2,3 |
| | 0,8 | 14,2 | 22,0 | 0,75 | 1,9 |
| | 1,2 | 6,7 | 8,4 | 1,06 | 4,3 |
| Meia 5,27 | 1,0 | 14,5 | 21,3 | 0,86 | 1,6 |
| | 0,8 | 18,0 | 45,1 | 0,74 | 0,8 |
| | 1,2 | 8,2 | 9,2 | 1,05 | 4,8 |
| Atacante 5,17 | 1,0 | 10,2 | 12,7 | 0,91 | 3,4 |
| | 0,8 | 14,0 | 21,8 | 0,75 | 1,4 |
| | 1,2 | 8,0 | 9,2 | 1,06 | 3,6 |

A taxa média fica abaixo do preço pela cláusula de venda futura (25% das propostas abrem mais baixo) e, com r > 1,
porque a proposta abre entre o valor e o preço (o usuário contrapropõe até o preço). Antes de exigir `0,9 × preço` de
verba com desconto, o zagueiro a 0,8 recebia 16,8 / 32,8 propostas com taxa/valor 0,71 (clubes sem verba propunham
abaixo do pedido); meia e atacante não mudaram (os compradores deles já tinham verba).

## Prêmios (Etapa 32)

O valor de mercado de um premiado sobe (`awardBoost`, ×1,10–1,15 até a próxima virada da liga dele) em todo cálculo
(`playerValueModel`: preço pedido, ofertas, rivais, aceitação). A proposta de clube maior por um jogador fora da lista
tem chance × 2 quando o elenco tem um premiado, e o alvo é ele. Ver `.claude/rules/game/awards.md`.
