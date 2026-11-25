# Fundar o próprio clube (report 17d9bdee)

Pedido de tester: depois de todas as conquistas, o técnico cria o próprio clube na pior divisão de um país, sendo o pior
time, e é técnico e presidente ao mesmo tempo. Decisões do usuário em 2026-11-25.

## 1. Liberação e fundação

- **Liberação:** as 108 conquistas desbloqueadas (secretas incluídas), lidas do `achievements.json` do assento. Antes
  disso o cartão aparece apagado com "N de 108". Vale em mundo solo e em grupo (cada assento pelas próprias conquistas).
- **Uma vez por carreira:** `SeatState.foundedClub` guarda o clube fundado; com o campo presente a rota recusa (409
  `alreadyFounded`), mesmo depois de sair do clube.
- **Escolhas:**
  - país com pirâmide (`pyramids.json`, dois níveis ou mais);
  - clube da última divisão desse país (`lowestTier` da pirâmide). Recusa clube com assento (409 `humanClub`) e clube
    inscrito numa continental em curso (409 `continental`);
  - nome (2–30 letras, sem caracteres de controle, sem espaço nas pontas), sigla (3 letras A–Z) e duas cores em hex
    diferentes entre si.
- **Implementação: mesmo clube, nova identidade.** O `squadId`, a vaga na tabela, as rodadas e o date-index ficam.
  Mudam `squad.name`, `shortName`, `colors`, e o nome nas entradas de `standings.json` da liga e nas metas de copa.
  `Squad.founded = { by: seatId, on: date }` faz `squadLogoUrl` não usar o escudo do índice para esse clube (a resposta
  do save leva a lista dos clubes fundados; o cliente a registra como `registerTeamNames`), então aparece o brasão de
  cores do `ClubLogo`.
- **No mesmo dia (rota `POST /api/saves/:id/found-club`, `withSaveLock`, `BufferingSaveDAL`, guarda de lobby):**
  1. o técnico sai do clube atual pelo caminho de `resignFromClub`, sem multa (desempregado: nada a liberar);
  2. o elenco e a base do refundado vão para os livres (`toFreeAgent`); empréstimos que envolvem o clube voltam;
  3. entram 22 jogadores gerados (GK 3, DEF 7, MID 7, FWD 5; idades 18–32) com nível = média do pior elenco da divisão
     − `FOUNDED.LEVEL_GAP` (0,3), contrato de 2 temporadas pela curva do clube; nomes pelo livro do país
     (`drawAcademyName`); nacionalidade do país;
  4. `takeOverClub` com o caixa do refundado (comissão inicial do tier, tática automática, instalações do clube);
  5. o histórico do clube (`clubHistory/<id>.json`) é apagado;
  6. mensagem `job` / `founded` na caixa de entrada; notícia `club_founded`.
- A temporada continua: tabela, jogos já jogados e os pontos do refundado ficam.

## 2. Presidente (só no clube fundado, `squad.founded.by === seatId`)

- **Sem diretoria:** sem meta, revisão diária, ultimato ou demissão (`reviewBoardStatus` pulado; `meta.board` só com a
  torcida). Onde a diretoria decidia:
  - pedido de vaga na comissão: sempre aprovado (até o limite +2 de sempre);
  - verba mensal de materiais: como diretoria 70;
  - empréstimo do banco: sem a exigência de 40 e sem os −3;
  - sem bônus de fim de temporada da diretoria;
  - imprensa: só os efeitos de torcida e moral.
- **Preço do ingresso:** `Squad.ticketPriceMult` 0,5–2,0 (passo 0,1; padrão 1). Demanda × `priceMult^−FOUNDED.PRICE_ELASTICITY`
  (0,6: o dobro do preço ≈ −34% de demanda); bilheteria = público × preço × mult × conforto. `PUT /api/saves/:id/ticket-price`
  (só no clube fundado, 400 `invalidPrice`). Seletor em Clube → Estádio com o público e a renda projetados.
- **Carteira → clube:** `POST /api/saves/:id/club-deposit { amount }` (inteiro ≥ €1.000, até a carteira; 409 `noMoney`):
  `managerSpent += amount` e `recordMoney` no caixa (linha `club_change`, `ref.stage = "deposit"`, "Aporte do presidente";
  conta como receita? não: fica fora dos totais de receita). Sem volta.
- **Salário:** `PUT /api/saves/:id/manager-wage { wage }` de 0 ao teto `managerWeeklyWage(reputação)` da regra do contrato.
  O contrato do técnico no clube fundado não tem fim (`until` ausente; não renova nem expira). Pago toda segunda pelo caixa.
- **Sair:** pedido de demissão sem multa; o clube volta para a IA com o nome novo (`founded` fica); não há nova fundação.

## 3. Telas, testes, limites

- **Telas:** cartão "Fundar seu clube" em Seu técnico → Conquistas e o assistente de três passos (país, clube, identidade
  com prévia do escudo) com confirmação; seletor de ingresso no Clube; aporte e salário em Finanças; selo "Fundado por você"
  no cartão do clube do Painel no lugar da diretoria; mensagem da fundação. i18n `ownClub.*`.
- **`/test`, `/lab`:** sem efeito de partida.
- **Testes:** puros (liberação, elenco mais fraco que o pior da divisão, demanda pelo preço, teto do salário); rotas (409 sem
  as 108, clube humano, continental, uma vez por carreira; extrato = saldo depois do aporte); avanço do dia (sem demissão no
  clube fundado, bilheteria no preço escolhido).
- **Limites:** o clube fundado não tem história anterior; a IA não reage ao preço do ingresso; um clube fundado que vira IA
  mantém o preço 1.
