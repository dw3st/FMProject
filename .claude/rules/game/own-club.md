# Fundar o próprio clube

Spec: `docs/superpowers/specs/2026-11-25-own-club-design.md`. Plano: `docs/superpowers/plans/2026-11-25-own-club.md`.
Report de tester 17d9bdee. Versão **12.43**. Sem efeito de partida: nada em `/test` nem `/lab`.

## Regra

- **Liberação:** todas as conquistas do assento (`OWN_CLUB_KEYS`: 31 trilhas × 3 + 18 secretas = 111; a spec dizia 108).
  Uma vez por carreira (`SeatState.foundedClub`; 409 `alreadyFounded`).
- **Escolha:** um clube da última divisão de um país com pirâmide (400 `notLowest`), sem assento (409 `humanClub`) e fora
  de continental em curso (409 `continental`); nome, sigla de 3 letras e duas cores diferentes (`parseIdentity`).
- **Mesmo `squadId`, identidade nova:** `Squad.foundedBy { seatId, on }`, nome, `shortName`, cores; a linha da tabela
  renomeada; o histórico do clube apagado; o escudo do índice some (`registerFoundedClubs`, `foundedClubs` na resposta
  do save), fica o brasão de cores.
- **No dia** (`foundClub`, `src/backend/ownClubWorld.ts`): o técnico sai do clube atual sem multa (`resignFromClub`);
  empréstimos voltam; elenco e base vão para os livres; entram 22 jogadores gerados (GK 3, DEF 7, MID 7, FWD 5, 18–32
  anos) com nível = pior elenco da divisão − 0,3 (`FOUNDED`), contrato de 2 temporadas; `acceptJobOffer` com uma
  proposta interna (sem anúncio); mensagem `job` / `founded`.
- **Presidente** (`isPresident(squad, seatId)`: só o assento que fundou):
  - sem diretoria: sem meta, avaliação da temporada, bônus, revisão diária, ultimato nem demissão; a imprensa não mexe
    na diretoria;
  - vaga na comissão sempre aprovada (até o +2 de sempre); verba de materiais como diretoria 70; empréstimo do banco
    sem exigir diretoria e sem os −3;
  - contrato do técnico sem fim (`until` ausente: não renova, não expira, sem multa);
  - preço do ingresso `Squad.ticketPriceMult` 0,5–2,0: demanda × mult^−0,6, bilheteria × mult;
  - aporte da carteira (`club-deposit`, ≥ €1.000, linha `club_change` `deposit`, fora dos totais) e salário próprio
    (`manager-wage`, de 0 ao teto).
- Saindo, o clube volta para a IA com o nome novo; as regras de presidente não valem para outro técnico.

## Rotas

| Rota | Faz |
|---|---|
| `GET/POST /api/saves/:id/found-club` | Opções (liberação, países, clubes da última divisão) / funda |
| `GET /api/saves/:id/president` | `{ president, mult, wallet, wage, wageCap, projection }` |
| `PUT .../ticket-price { mult }` | 400 `invalidPrice`, 409 `notPresident` |
| `POST .../club-deposit { amount }` | 400 `invalidAmount`, 409 `noMoney` |
| `PUT .../manager-wage { wage }` | 400 `invalidWage` |

Escritas com `withSaveLock` e guarda de lobby.

## Telas

`src/GameInterface/OwnClub/*`: cartão "Fundar seu clube" e assistente (país, clube, identidade, confirmação) em Seu
técnico → Conquistas; preço do ingresso em Clube → Estádio; aporte e salário em Finanças → Resumo; selo "Fundado por
você" no cartão do clube do Painel; corpo da mensagem `founded`. i18n `ownClub.*`.

## Testes

`bun test src/Domain/ownClub src/backend/ownClub.routes.test.ts src/backend/ownClub.advanceDay.test.ts src/backend/president.routes.test.ts`.

## Limitações

- O clube fundado não tem história anterior; a IA não reage ao preço do ingresso.
- O medidor da diretoria ainda se mexe com os resultados, sem efeito.
