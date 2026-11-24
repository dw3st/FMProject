# Parcerias entre clubes (satélite e clube-mãe)

Report de tester 648035a3. Spec: `docs/superpowers/specs/2026-11-24-club-partnerships-design.md`. Versão **12.41**. Só
clube humano com clube da IA. Sem efeito de partida: nada em `/test` nem `/lab`.

## Regra

- `SeatState.partnerships { satellite?, parent? }` (`src/types/partnershipTypes.ts`): no máximo um satélite (nível abaixo
  do clube humano) e um clube-mãe (nível acima), do mesmo país. Nível = divisão na pirâmide, depois o tier natural
  (`compareStanding`).
- Proposta (`POST /partnerships { kind, clubId }`): o clube da IA aceita na hora quando serve (`answerPartnership`:
  recusa `self`, `slotFull`, `taken` (já é parceiro de outro técnico), `sameLevel`, `wrongSide`, `human`). Mensagem
  `transfer` / `partnership_signed`. Encerrar: `DELETE /partnerships/:kind` (409 `noPartner`); os empréstimos seguem.
- Todo dia (`partnershipDay`, no mercado do assento): a parceria acaba sozinha se o clube ganhou técnico humano, fechou
  com outro técnico ou os níveis deixaram de servir (`partnership_ended`, motivo `human` / `other` / `level`). Troca de
  clube e demissão apagam as parcerias.
- **Satélite:** `POST /partnerships/satellite/loan { playerId, wageShare 0..50 }` empresta sem taxa, até
  `PARTNER.MAX_LOANS` (5) ao mesmo tempo, só quem seria titular lá (`satelliteTakes`: nota ≥ titulares da linha do
  satélite − 0,3), com opção de retorno (`recall`), até o fim da temporada da liga do satélite. Janela do clube humano
  aberta. Erros: `noSatellite`, `loanLimit`, `notStarter`, `invalidShare`, `satelliteFull`, `squadDepth`, `windowClosed`.
- **Clube-mãe:** nas segundas com a janela aberta, até `OFFERS_PER_WINDOW` (2) por janela, oferece um jovem (até 23)
  fora do XI dele que `loanAvailability` libera, de uma linha que o clube humano precisa (`neededLines`), sem taxa, com
  o clube humano pagando `PARENT_MIN_SHARE` (50%); uma oferta por vez, válida 5 dias. Mensagem `partnership_offer`
  (reenviada depois do `clearInbox` enquanto vale). `POST /partnerships/parent/offer { accept }` (409 `offerClosed`).

## Telas

Mercado → Negociações: painel Parcerias (`Negotiation/PartnershipsPanel.tsx`): satélite e clube-mãe (clube, desde
quando, Encerrar com confirmação, ou a escolha de um clube do país com o motivo da recusa), os emprestados ao satélite
(x de 5), emprestar ao satélite (jogador e parte do salário 0/25/50%), a oferta do clube-mãe e os jogadores dele no
clube. Caixa de entrada: a oferta com Aceitar / Recusar. i18n `partnerships.*`.

## Testes

`bun test src/Domain/partnerships src/backend/partnerships.routes.test.ts`.

## Limitações

- Só o país do clube humano; sem parceria entre dois técnicos.
- A IA não usa parcerias entre si.
- O satélite não manda jogadores de volta antes da data (o técnico chama pelo retorno).
