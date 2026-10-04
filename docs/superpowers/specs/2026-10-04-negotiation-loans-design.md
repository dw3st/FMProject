# Etapa 21 — Negociação de transferências: contraproposta, cláusula de venda futura e empréstimos — Design

Data: 2026-10-04. Status: aprovado. Versão **3.6** (depois da 3.5, convites de clubes).

## Hoje

Comprar: o jogador faz uma oferta (taxa + salário + anos) e a IA aceita ou recusa na hora
(`evaluateTransferOffer`, aceita com `decisionScore > 0,8`). Vender: a lista de venda do jogador é casada
sozinha com um comprador da IA (`tryMatchPlayerSellList`) e a venda acontece sem o jogador decidir.
Não existem empréstimos.

## 1. Contraproposta (compra)

- A IA responde com **Aceita**, **Contraproposta** ou **Recusa**:
  - `decisionScore ≥ 0,8`: aceita;
  - `0,45 ≤ decisionScore < 0,8` (ou craque com oferta abaixo de 80% do valor): **contraproposta** com a
    menor taxa que leva o score a 0,8 (fórmula inversa, arredondada para cima em passos de €0,1M / €1M),
    nunca abaixo da oferta;
  - abaixo disso, ou os bloqueios de elenco de sempre (`squadDepth`, elenco < 15): recusa.
- **Paciência:** até 3 rodadas por jogador e janela (dia). Cada nova oferta abaixo da contraproposta gasta uma
  rodada; uma oferta abaixo de 60% do valor encerra a conversa ("o clube se irritou"), e o jogador só pode voltar a
  negociar esse atleta depois de 14 dias.
- Contraproposta é feita na hora (no modal), não na inbox. O jogador pode aceitar a contraproposta, mandar outra
  oferta ou desistir.
- Salário e anos continuam com o jogador (a regra de contrato já existe: pedido do jogador).

## 2. Cláusula de venda futura

- Na oferta, o jogador pode oferecer ao clube vendedor **10%, 20% ou 30%** de uma venda futura.
- Para a IA, cada 10% vale ~4% da taxa (jogador jovem ≤ 23: ~6%): a taxa exigida cai na mesma proporção
  (o `offerScore` soma esse valor).
- Gravado no jogador: `RosterPlayer.sellOn?: { clubId, pct }` (substitui a anterior se ele for vendido de novo
  com outra cláusula). Quando o jogador sai com taxa (qualquer comprador), `pct` da taxa vai para o clube da
  cláusula: clube do jogador → extrato (`transfer_in`, rótulo "Cláusula de venda: <jogador>"); IA → verba de
  transferências (`applyAITransferSale`, mesmo teto). A cláusula some depois de paga.
- Vale também ao vender: o jogador pode **pedir** 10–30% numa venda para a IA, que aceita pagar uma taxa menor
  (mesma conta ao contrário).

## 3. Vendas: a IA faz propostas, o jogador decide

- O casamento da lista de venda deixa de vender sozinho: o comprador da IA manda uma **proposta** para a inbox
  (categoria `transfer`, `kind: "bid"`) com taxa, cláusula pedida (às vezes) e validade de 5 dias.
- O jogador: **Aceitar**, **Recusar** ou **Contrapropor** (um valor; a IA aceita se ficar até o teto dela, que é o
  máximo que a verba e o `priceCap` permitem, com 1 rodada de ida e volta).
- Jogador fora da lista também pode receber proposta de vez em quando (craque em clube pequeno), sempre pela inbox.

## 4. Empréstimos

**Pegar emprestado (jogador ← IA):**
- No perfil de um jogador da IA: botão "Pedir empréstimo" com duração **até o fim da temporada** (ou da próxima,
  se faltar menos de 2 meses), **% do salário pago** por você (0–100) e uma **taxa de empréstimo** opcional.
- A IA empresta quem não está no XI dela (titular pela escalação automática) e: tem ≤ 23 anos **ou** está na
  lista de venda **ou** o elenco dela tem folga na posição. Aceita se `0,5 × valorDoSalárioPago + taxa ≥` um
  mínimo pela importância do jogador; senão contraproposta de % do salário (mesma mecânica de rodadas).
- O jogador vai para o seu elenco com `loan: { fromClubId, until, wageShare }`: joga normalmente, entra na
  folha só com a parte combinada; não pode ser vendido nem emprestado de novo. Volta ao clube na data
  (checado no avanço do dia e na virada), com a inbox avisando.

**Emprestar (você → IA):**
- No seu jogador: "Colocar para empréstimo" (lista à parte, como a de venda). Clubes da IA com necessidade
  naquela posição (`generateTransferNeeds`, `cover_need`) e folha que cabe mandam proposta pela inbox
  (`kind: "loan_bid"`: % do salário que pagam, duração). Você aceita ou recusa.
- Jogador emprestado some do seu elenco disponível, aparece numa seção "Emprestados" do Elenco com o clube e a
  data de volta; volta sozinho.

**IA × IA:** fora do escopo (a IA não empresta para a IA).

## 5. Telas

- **Modal de oferta** vira "Negociação": abas **Transferência** e **Empréstimo**; histórico das rodadas (sua
  oferta, resposta do clube), paciência restante, cláusula 0/10/20/30%.
- **Inbox:** propostas de compra e de empréstimo pelos seus jogadores, com Aceitar/Recusar/Contrapropor.
- **Elenco:** selo "Emprestado" (dos que vieram) e seção "Emprestados" (dos que foram).
- **Minhas transferências:** listas de empréstimos (entrando e saindo) e cláusulas a receber.

## 6. Dados e regras

- `RosterPlayer.sellOn?`, `RosterPlayer.loan?`; `market.playerLoanList`, propostas pendentes no mercado/meta.
- Empréstimo não conta como transferência para o histórico de taxa; a linha de histórico do jogador ganha
  "(empréstimo)". Contrato continua o do clube de origem.
- Sem migração (protótipo).

## 7. Verificação

Testes puros (taxa da contraproposta, paciência, valor da cláusula, aceitação de empréstimo), rotas (dono do save,
proposta vencida 409, rodada esgotada), cláusula paga numa venda futura (jogador e IA), empréstimo que volta na
data e na virada, folha com a parte combinada. Smoke de temporada: uma compra com contraproposta, uma venda
pela inbox, um empréstimo de ida e um de volta concluídos. `/test` e `/lab`: sem efeito de partida.
Changelog 3.6, ROADMAP etapa 21.
