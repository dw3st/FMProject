# Parcerias entre clubes (clube mãe e satélite)

Report de tester 648035a3. Aprovado pelo usuário em 2026-11-24: os dois lados, proposta e acordo, sem extras, com limites.

## Regra

- Só clube humano com clube da IA. A IA não monta parcerias entre si. Sem efeito de partida (nada em `/test` nem `/lab`).
- Cada clube humano tem no máximo **1 satélite** e **1 clube mãe**. Um clube da IA é parceiro de no máximo um técnico humano.
- Dado: `SeatState.partnerships { satellite?: Partnership; parent?: Partnership }`, `Partnership { clubId, since, season }`. Sem migração.
- A parceria dura a temporada e renova sozinha na virada do país do clube humano. Qualquer lado encerra quando quiser, sem multa; os empréstimos em andamento seguem até a data.

## Propor

`POST /api/saves/:id/partnerships { kind: "satellite" | "parent", clubId }`, guarda de lobby, `withSaveLock`. O clube da IA responde na hora (`answerPartnership`, puro):

- Satélite: o clube alvo tem tier natural abaixo do humano **ou** joga numa divisão abaixo. Clube mãe: o contrário.
- Recusa (409): `sameLevel`, `taken` (já parceiro de outro técnico), `slotFull` (o humano já tem esse tipo), `self`.
- `DELETE /api/saves/:id/partnerships/:kind` encerra. `GET` devolve as duas parcerias, os emprestados de cada lado e os candidatos (clubes da IA do mesmo país, com o motivo de recusa quando houver).

## Você é o clube mãe

- "Emprestar ao satélite" na ficha e no Elenco (`POST /api/saves/:id/partnerships/satellite/loan { playerId, wageShare }`).
- Sem taxa; o satélite paga de 0 a `PARTNER.MAX_PARENT_SHARE` (50%) do salário (o resto é seu). Sem rodadas de negociação.
- O satélite aceita quem tem nota de titular para ele: nota ≥ média dos titulares da linha dele − `PARTNER.STARTER_MARGIN` (0,3). Assim ele joga pela escalação automática da IA.
- Limite: `PARTNER.MAX_LOANS` (5) emprestados ao satélite ao mesmo tempo. Também o teto de 30 do satélite e as regras de sempre (janela do humano aberta, contrato cobre a volta, não emprestado, elenco do humano não fica com 14 ou menos).
- Duração: até o fim da temporada do satélite (`loanUntil`); "Chamar de volta" liberado (`ActiveLoan.recall`) sem custo extra.
- Usa `startLoan` e `market.loans` como os empréstimos de hoje.

## Você é o satélite

- Toda segunda com a janela do humano aberta, o clube mãe pode oferecer emprestados: no máximo `PARTNER.OFFERS_PER_WINDOW` (2) por janela e 1 por semana.
- Escolha: jovem (≤ 23) da mãe que `loanAvailability` libera, fora do XI automático dela, cuja linha o humano tem como `cover_need` (ou abaixo do mínimo), com nota acima da média da linha do humano − 0,3.
- Vira a proposta de empréstimo já existente (`MarketBid` kind `loan`, caixa de entrada `loan_bid`): sem taxa, a mãe paga pelo menos 50% do salário. O humano aceita ou recusa pela rota de sempre. O teto do humano (36) e o top 25 valem.
- A mãe não pede a volta antes da data.

## Telas

- Mercado → Negociações: bloco **Parcerias** (`Negotiation/PartnershipsCard.tsx`): para cada tipo, o parceiro (escudo, liga, desde), os emprestados de cada lado com o resumo de jogos (`loanReport`), "Encerrar"; sem parceiro, "Propor" abre uma lista dos clubes do país com o motivo de recusa.
- Ficha e Elenco do clube humano: botão "Emprestar ao satélite" quando há satélite.
- Caixa de entrada `transfer`: `partnership_signed`, `partnership_ended`, `partnership_renewed` (tópico `transfer_news`). As ofertas da mãe já chegam como `loan_bid`.
- i18n `partnerships.*`.

## Constantes (`src/Domain/partnerships/partnershipConfig.ts`)

| Constante | Valor |
|---|---|
| `MAX_LOANS` | 5 |
| `MAX_PARENT_SHARE` | 0,5 |
| `STARTER_MARGIN` | 0,3 |
| `OFFERS_PER_WINDOW` | 2 |
| `PARENT_MIN_SHARE` | 0,5 (a mãe paga pelo menos metade) |

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/partnerships/partnerships.ts` (+ teste) | `answerPartnership`, `satelliteAccepts`, `parentOfferCandidate`, contagens |
| `src/backend/partnershipWorld.ts` | E/S: propor, encerrar, emprestar, ofertas da segunda, virada |
| `src/backend/partnershipRoutes.ts` (+ teste) | Rotas |
| `src/backend/advanceDay.ts` | Ofertas da mãe (segunda), renovação na virada, fim da parceria na troca de clube |
| `src/backend/jobWorld.ts` | `releaseHumanClub` apaga as parcerias |

## Limitações

- O satélite não garante minutos; vale a escalação da IA.
- Sem dinheiro entre os clubes e sem preferência de compra.
- Parceiros só do mesmo país.
