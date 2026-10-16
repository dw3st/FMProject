# Etapa 43, parte 4 — Humano × humano

Visão geral: `docs/superpowers/specs/2026-10-14-multiplayer-design.md`. Partes 1–3 (assentos, liga de amigos, avanço em
grupo) na `main` desde a 4.25.1. Decisões do usuário (2026-10-16): **prévia + resultado** para o jogo entre dois
humanos (escalação do outro escondida, sem replay); mercado entre humanos com **transferência com taxa e empréstimo**
(sem pré-contrato nem troca de jogadores). Regra viva: `.claude/rules/game/multiplayer.md`.

## 1. Jogo entre dois técnicos humanos

### 1.1 Hoje

`POST /api/match-setup` responde 409 `seatOpponent` quando o adversário do dia é o clube de outro assento; a prévia
mostra "Jogo contra outro técnico humano" com "Simular partida" e "Voltar". No dia, o jogo roda no motor completo com
a tática de cada assento (`computeSeatedMatchLineups`).

### 1.2 Prévia

- `match-setup` deixa de recusar: devolve a resposta normal (adversário, árbitro, público, gramado, `managers` com o
  técnico do outro assento, a escalação e a rotação do próprio assento, a marcação individual) com `seatOpponent: true`.
- **A tática do outro nunca vai na resposta.** O XI provável do adversário (`oppLineup`, base da marcação individual) e
  a formação dele saem da regra automática (`aiMatchFormation` + XI automático ciente de fôlego, como um clube da IA),
  nunca de `tactics.json` do outro assento. `oppTactics`/instruções do outro não são enviadas.
- `MatchPreviewScreen`: com `seatOpponent`, o botão de jogar vira **"Simular"** (grava `match-decision`
  `mode: "simulate"`, como o botão atual) e uma linha "Contra outro técnico o jogo é simulado com a tática dos dois".
  O resto da prévia (marcação, rotação, árbitro, público) é o de sempre.
- A partida ao vivo continua recusada: `MatchScreen` com o adversário de outro assento e `POST …/live-recording` de um
  jogo entre assentos seguem 409 `seatOpponent` (o `match-setup` passa a ter um parâmetro `live: true` que o
  `MatchScreen` envia e que mantém o 409; a prévia não envia).

### 1.3 No dia

Sem mudança: motor completo com a tática salva de cada assento, a marcação individual gravada por cada um
(`meta.matchMarking` do assento) e a suspensão do técnico de cada lado. O mundo para nesse dia até os dois decidirem;
com o prazo vencido, o assistente simula por quem faltou (parte 3).

### 1.4 Depois

- Os dois veem o jogo na tela de resultado (`/match-result?date=D`) e no resumo do avanço. A tela acha a partida pelo
  clube do próprio assento e mostra "meu time" por ele, também como visitante (conferir e corrigir se precisar).
- Nenhuma mensagem nova na caixa de entrada.

### 1.5 Testes

- `match-setup` de um jogo entre dois assentos responde 200 com `seatOpponent: true` aos dois, sem a escalação salva do
  outro (o `oppLineup` é o XI automático, mesmo depois de o outro salvar outra escalação).
- `match-setup` com `live: true` e `live-recording` continuam 409.
- Depois do dia, `/match-result` responde aos dois assentos com o placar e o lado certos.

## 2. Mercado entre humanos

### 2.1 Hoje

`POST /transfers`, `/loans` e `/pre-contracts` com jogador de outro assento: 404 `notFound` (`isOtherSeatClub`).

### 2.2 Dado

`saves/{id}/seatOffers.json` (do mundo, bufferizado como os demais arquivos do mundo): `SeatOffer[]`.

```ts
interface SeatOffer {
  id: string;
  kind: "transfer" | "loan";
  playerId: string; playerName: string;
  seller: { seatId: string; clubId: string; clubName: string };
  buyer:  { seatId: string; clubId: string; clubName: string };
  date: string;          // criada
  expires: string;       // último dia para responder: data + 5, nunca depois do fecho da janela do comprador
  turn: "seller" | "buyer";
  counters: number;      // contrapropostas feitas (máx. 3)
  terms: {
    fee: number;                       // EUR (empréstimo: taxa, pode ser 0)
    sellOnPct?: 0 | 10 | 20 | 30;      // transferência: cláusula para o vendedor
    wage?: number; years?: number;     // transferência: contrato com o jogador (fixo desde a proposta)
    wageShare?: number;                // empréstimo: parte do salário que o comprador paga (0..1, passos de 0,1)
    until?: string;                    // empréstimo: volta (regra `loanUntil`)
  };
  history: { by: "seller" | "buyer"; action: "offer" | "counter" | "accept" | "reject" | "withdraw" | "expired" | "closed"; date: string; terms?: SeatOffer["terms"] }[];
}
```

Só propostas abertas ficam no arquivo; fechadas saem (o histórico vai nas mensagens).

### 2.3 Propor (`POST /api/saves/:id/seat-offers`)

Corpo `{ kind, playerId, fromSquadId, fee, sellOnPct?, wage?, years?, wageShare? }`. `requireSeat`, `withSaveLock`,
409 `lobby` (guarda de lobby). Erros na ordem:
- 404 `notFound`: jogador fora do clube indicado, ou o clube não é de outro assento.
- 409 `noClub`, 409 `windowClosed { opensOn }` (janela do **comprador**), 400 `onLoan` (jogador emprestado), 409
  `squadFull` (teto do comprador; no empréstimo também), 409 `squadDepth` (a saída deixaria o vendedor com 14 ou menos,
  sem outro na posição ou abaixo dos mínimos por linha), 409 `alreadyOffered` (já há proposta aberta do mesmo comprador
  pelo mesmo jogador e tipo), 409 `tooManyOffers` (10 enviadas abertas por assento).
- Transferência: o contrato passa pelo jogador como numa compra da IA (`evaluateContractOffer`, `demandBreakdown` com o
  clube de origem; 400 `{ error, demand }` em `lowWage`, `tooManyYears`, `smallerClub`, `poorFacilities`...). Taxa ≥ 0,
  arredondada ao passo da negociação.
- Empréstimo: `wageShare` 0..1, taxa ≥ 0, `until` = `loanUntil` do comprador (nunca depois do contrato). A regra da IA
  sobre quem pode ser emprestado não vale (o dono decide).
- Sem rival da IA, sem paciência/insulto: é uma conversa entre pessoas.

Efeito: `SeatOffer` com `turn: "seller"`, mensagem `transfer`/`seat_offer` na caixa do vendedor (tópico `actions`),
evento de socket `seat_offer { saveId }` para os membros envolvidos. Resposta `{ offer }`.

### 2.4 Responder (`POST /api/saves/:id/seat-offers/:offerId`)

Corpo `{ action: "accept" | "reject" | "counter" | "withdraw", fee?, sellOnPct?, wageShare? }`.
- Só o lado da vez aceita, recusa ou contrapropõe (403 `notYourTurn`); só o comprador retira (`withdraw`, a qualquer
  momento). 404 para proposta inexistente ou de outros assentos; 409 `offerClosed` vencida.
- `counter`: novos termos (transferência: taxa e cláusula; empréstimo: `wageShare` e taxa; salário e anos do contrato
  não mudam), troca a vez, `counters + 1`; com 3 contrapropostas feitas, 409 `noRounds` (só aceitar ou recusar).
- Cada ação manda mensagem ao outro lado (`seat_offer` com o estado) e o evento de socket.

### 2.5 Aceite

Reconfere tudo (janela do comprador, jogador ainda no clube do vendedor e não emprestado, teto e mínimos; transferência:
o contrato com o jogador de novo). Falhou: 409 com o motivo e a proposta cai (`closed`). Depois, numa unidade
bufferizada (`BufferingSaveDAL`, meta por último):
- **Transferência:** `executeTransferFee` com os dois clubes humanos: `transfer_out` no extrato do comprador,
  `transfer_in` no do vendedor (cada um no próprio assento, `recordMoney`); o jogador vai com o contrato combinado
  (`squadsAfterAcceptedTransfer`, linha parcial de histórico), cláusula nova `sellOnPct` gravada no jogador e no
  `sellOnHeld` do vendedor; cláusula antiga do jogador paga a quem a tem (`settleSellOn`, IA ou outro assento); histórico
  do clube (`recordTransferHistory`), `StoredDayLog.transfers` do dia (`kind: "transfer"`), notícia como uma
  transferência qualquer.
- **Empréstimo:** `startLoan` com os dois clubes humanos; o `ActiveLoan` entra no mercado **dos dois** assentos (o
  comprador paga `wageShare` na folha, o vendedor o resto na linha `wages` via `parentLoanWages`); a volta acontece na
  data ou na virada do país do clube que o tem, avisando os dois (`loan_back` / `loan_home`).
- Fecha as outras propostas pelo mesmo jogador: as de outros assentos (`closed`, com mensagem) e as da IA pendentes no
  mercado do vendedor (`pendingBids`); tira o jogador da lista de venda/empréstimo do vendedor.
- Moral do jogador: sai (`stripPlayerMorale`) e chega com 65 como qualquer transferência do clube humano.

### 2.6 Vencimento e limpeza

No avanço do dia (passo do mercado): proposta com `expires` antes do dia, janela do comprador fechada, jogador fora do
clube do vendedor (vendido à IA, livre, aposentado) ou um dos lados sem o clube (troca de emprego, demissão, saída da
liga: `removeSeat`) cai e os dois recebem `seat_offer` com `expired`/`closed`. Gravado depois do `clearInbox`.

### 2.7 Telas

- **Ficha / olheiro:** o botão de oferta para jogador de outro assento abre o mesmo `PlayerOfferModal` (abas
  Transferência e Empréstimo); o envio vai para `seat-offers`, a resposta é "Proposta enviada a <técnico>" (sem conversa
  da IA). Com proposta aberta: "Proposta enviada" e o estado.
- **Caixa de entrada:** cartão `SeatOfferCard` (termos, de quem é a vez, histórico curto; Aceitar, Contrapropor,
  Recusar; Retirar para o comprador).
- **Transferências → aba de negociações:** bloco "Propostas com técnicos" (enviadas e recebidas abertas).
- i18n `seatOffers.*`.

### 2.8 Fora desta parte

Pré-contrato e troca de jogadores entre humanos; rival da IA numa negociação entre humanos; propostas automáticas de
um humano por jogadores de outro; lista de venda de outro humano visível na busca do olheiro.

### 2.9 Testes

- Transferência entre dois assentos com contraproposta e aceite: jogador no elenco do comprador com o contrato, taxa
  nos dois extratos (soma do extrato = saldo nos dois), cláusula no `sellOnHeld` do vendedor.
- Empréstimo: começa, salário dividido nas segundas (linha `wages` dos dois), volta na data com as mensagens.
- Vez errada 403, retirada, 3 contrapropostas → `noRounds`, vencimento pelo avanço do dia, janela fechada, `squadDepth`,
  `squadFull`, contrato recusado pelo jogador, `alreadyOffered`, `tooManyOffers`.
- O aceite fecha a outra proposta humana e a proposta da IA pelo mesmo jogador.
- `removeSeat` e troca de clube fecham as propostas do assento.
- Isolamento: um terceiro assento não vê nem responde (404).

## 3. Regra, changelog, versão

- `.claude/rules/game/multiplayer.md` ganha "Parte 4: humano × humano"; as regras "a IA nunca age sobre clube humano" e
  "humano × humano é a parte 4" atualizadas.
- Etapa nova do roadmap → próxima minor (**4.26**), entrada no changelog e `upcoming` atualizado (parte 5).
- Formato do save muda (arquivo novo opcional): `MIN_COMPATIBLE_SAVE_VERSION` pode ficar em 4.25 (ausente = sem
  propostas).

## 4. Limitações

- Sem replay do jogo entre humanos; a tática de cada um só é vista no resultado.
- O contrato do jogador é fixado na proposta; a contraproposta só mexe em taxa/cláusula (ou percentual/taxa).
- Um processo de servidor (locks e sockets em memória), como nas partes 1–3.
