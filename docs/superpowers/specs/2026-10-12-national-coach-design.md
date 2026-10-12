# Etapa 41b — o técnico do jogador numa seleção

Data: 2026-10-12. Roadmap: linha 41b. Base: Etapa 41a (`.claude/rules/game/national-teams.md`, spec
`2026-10-11-national-teams-design.md`): a vaga de técnico de uma seleção é `NationalTeam.managerId`; a 41b só troca esse
id para `player`, que mantém o clube.

## Decisões aprovadas pelo usuário

1. **Convite.** Quando uma seleção abre vaga (demissão do técnico da IA ao fim de eliminatória/torneio, 41a), o técnico
   do jogador pode receber o convite (inbox, Aceitar/Recusar) se a reputação dele (`managerReputation`) alcança o
   prestígio da seleção (percentil do Elo). Qualquer país, peso maior para a nacionalidade do técnico
   (`meta.manager.nationality`). Mantém o clube; uma seleção por vez; desempregado também recebe. Validade 14 dias.
   Aceitar: `NationalTeam.managerId = "player"`, o técnico da IA (o interino) sai como na troca de clube, a passagem
   na seleção fica num campo próprio do registro (`ManagerRecord.national`), e a seleção sai das vagas da IA.
2. **Jogos ao vivo.** Os jogos da seleção do jogador rodam no motor completo: o avanço (e o avanço rápido) para no dia
   do jogo, prévia, escalação/tática da seleção (própria, separada do `tactics.json` do clube), partida ao vivo pelo
   mesmo `match-setup`/`MatchScreen`, ou simular. A gravação entra no dia como a do clube (`PlayedMatchRecording`); o
   pós-jogo é o `applyNationalMatch` da 41a. As outras seleções seguem no quickSim.
3. **Convocação.** Uma semana antes de cada convocação a inbox avisa e a aba "Minha seleção" mostra os 23 sugeridos
   pela regra da IA (`pickCallUp`); o jogador troca quem quiser (candidatos de `callableCandidates`) até o dia da
   convocação; sem mexer, vai a sugestão. Lista inválida → 400.
4. **Meta e demissão.** Meta da federação por competição pelo Elo, avaliada no fim; falhou feio → demitido só da
   seleção (o clube fica; inbox; interino + vaga da IA). Pedir demissão a qualquer momento. Salário simbólico só em
   `managerEarnings`. Títulos de seleção pontuam no ranking (41a) e ganham uma trilha de conquistas + 2 secretas.

## Detalhes fixados

### Prestígio, convite e aceite (`src/Domain/national/nationalCoach.ts`)

- **Prestígio** = percentil do Elo no mundo (1 = o melhor), o mesmo da contratação da IA (`hireDue`).
- **Faixa:** convite possível só com `prestígio ≤ reputação/100 + 0,10` (o teto da faixa de clubes, `JOBS.band.ABOVE`);
  a seleção da nacionalidade do técnico ganha +0,15 no teto.
- **Chance** por vaga aberta, dentro da faixa: 0,35; a da própria nação 0,9. Sorteio determinístico
  (`seedFrom(save:time:data:offer)`). Só quando ele não treina seleção nenhuma e não tem convite vivo dessa seleção.
- **Vaga segurada:** com convite vivo a IA não contrata: `hireOn` da vaga vai para o dia seguinte à validade.
- **Dados:** `NationalState.offers` (`NationalCoachOffer`: id, seleção, data, validade, prestígio, posição no ranking,
  salário) e `NationalState.human` (`{ teamId, since, wage, tactics?, callUp? }`).
- **Aceite** (`POST /api/saves/:id/national/coach/offers/:offerId { accept }`): 409 `offerClosed` (vencido, sumido,
  seleção sem vaga ou ele já treina outra). O interino vai embora (sem pontos: apagado; senão ao pool, `left: "moved"`);
  `ManagerRecord.national` ganha a passagem; a vaga sai; inbox `hired`. Recusar só tira o convite (a vaga volta a contar
  da data de contratação já marcada, nunca antes de amanhã).
- **Invariante "um técnico por clube"** continua sobre `squadId`; a seleção do jogador não tem registro com
  `squadId = nat_…` (o técnico é `player`, cujo `squadId` é o clube).

### Salário

`semana = 10 000 + 40 000 × prestígio` (EUR), fixado no aceite; toda segunda soma em `managerEarnings` (nunca no extrato).

### Convocação

- **Próxima convocação** do time: a próxima data de janela FIFA (`fifaWindows().start`) ou a de torneio
  (`tournamentDates().callUp`) em que ele está sorteado; aviso `callup_soon` 7 dias antes (uma vez por data).
- **Rascunho** `human.callUp = { date, players }` (ids reais): `PUT /api/saves/:id/national/coach/callup { players }`
  (`null` = volta à sugestão). Válido: 1..23 ids únicos, todos candidatos (`callableCandidates` da nação na data do
  primeiro jogo), e com os gerados que completam os 23 (`missingByLine`) pelo menos 2 goleiros; senão 400
  `invalidCallUp { reason }`. Só até o dia da convocação (409 `callUpClosed` depois, ou sem convocação à vista).
- No dia, o rascunho da data vira a convocação (quem saiu do mundo ou se lesionou fica de fora; os gerados completam);
  sem rascunho, a regra da IA.

### Tática da seleção

`human.tactics = { formation, tactical_style, lineup }` (`PUT .../national/coach/tactics`; formação das 17 prontas,
estilo válido, até 11 ids). Na partida: o XI salvo com quem está disponível na convocação; vaga sem jogador válido,
preenchimento automático ciente de fôlego (`autoFillLineupWithFitness`) na formação escolhida.

### Jogo

- **Calendário do jogador** (`GET /api/saves/:id`): os jogos da seleção dele entram em `season.calendar` com o lado da
  seleção trocado pelo id do clube (o fluxo de "dia de jogo" do front não muda) e `nationalTeam` no jogo; `season.teamNames`
  dá o nome das seleções. O avanço rápido para no dia (`nextNationalFixtureDate`).
- **`match-setup`** sem jogo do clube no dia e com jogo da seleção dele: devolve a seleção como `mySquad` (os 23, gerados
  inclusive, id `nat_…`), o adversário (os 23 dele), a tática da seleção, `national: { teamId, competition }`, sem
  inscrição, público, estádio nem árbitro. Com jogo do clube e da seleção no mesmo dia (só Euro/Copa América com o clube
  de outra confederação), o do clube é o ao vivo e o da seleção é simulado no motor.
- **No dia** (`playNationalDay`): o jogo da seleção do jogador usa a gravação enviada (`playedMatch`, mesmo id de jogo)
  ou roda no motor completo (`simulateRecording`), com a tática dele e 4-3-3 equilibrado do adversário; Elo, tabela,
  líderes e pós-jogo como os demais. O jogo vai para `StoredDayLog.nationalMatch` (a tela de resultado o lê).
- Prorrogação e pênaltis no mata-mata: o motor já faz.

### Meta e demissão

- **Eliminatória:** posição-alvo no grupo = posição pelo Elo no grupo; "tem de classificar" quando está entre os
  `slots` primeiros do Elo da eliminatória. **Torneio:** colocação-alvo pelo Elo entre os participantes (a mesma
  `placeTarget` da 41a), mostrada como a fase a alcançar (título, final, semi, quartas, oitavas, 16-avos, fase de grupos).
- **Avaliação** no fim da eliminatória / na eliminação do torneio: demitido se `rolloverSackChance(o) > 0` (não
  classificou tendo de classificar, ou terminou ≥ 25% do tamanho abaixo do alvo) — determinístico, sem sorteio. Inbox
  `result` (cumprida ou não) e `sacked`. Campeão nunca.
- **Saída** (demissão ou `POST .../national/coach/resign`): passagem fechada (`left: "sacked"` ou `"moved"`), interino
  e vaga da IA (`vacancyHireOn`), rascunho e tática apagados; a convocação em andamento segue com o interino.

### Conquistas

- Trilha nova `national_wins` (vitórias com a seleção: 5 / 20 / 50), categoria `matches`, atributo Motivação.
- Secretas: `world_champion` (ganhar a Copa do Mundo, Tática) e `against_homeland` (vencer a seleção da sua
  nacionalidade treinando outra, Motivação). Total 93 → 98.
- Os jogos da seleção contam só na trilha nova (o resto continua só com os jogos do clube).

### Telas

- Aba Seleções da tela Ligas ganha "Minha seleção" (só quando treina uma ou tem convite): seleção, ranking, meta de cada
  competição, salário, próximos jogos, convocação (sugestão × escolhida, candidatos com posição, nota, clube, fôlego e
  lesão), tática (formação, estilo, XI) e "Deixar a seleção" com confirmação.
- Inbox `national_coach` (`offer` com Aceitar/Recusar, `hired`, `callup_soon`, `result`, `sacked`, `resigned`).
- Prévia, partida e resultado: a seleção com o nome da nação e o brasão gerado das cores.

### `/test`, `/lab`

Nenhuma mecânica de motor nova (o motor só joga um jogo entre duas seleções).

## Limitações

- Convites só quando uma vaga abre (demissão da IA); sem procurar emprego ativamente.
- Sem tática por jogo na prévia além do XI; sem instruções individuais nem bola parada na seleção.
- Jogo do clube e da seleção no mesmo dia: o da seleção é simulado.
