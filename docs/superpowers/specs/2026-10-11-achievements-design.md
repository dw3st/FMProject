# Conquistas — desenho

Etapa 40 do `docs/ROADMAP.md` (#95), versão **4.20**. Decisões do usuário (2026-10-11) já aprovadas: conquistas do save,
só do técnico/clube do jogador; trilhas bronze/prata/ouro mais secretas; verificação no avanço do dia a partir dos dados
que o jogo já guarda; pontos bronze 10 / prata 25 / ouro 50 / secreta 40; recompensas em itens do perfil, enfeites do
estádio, atributos do técnico (±5% no extremo, neutro em 10) e duas recompensas finais compradas com pontos.

## 1. Regra

- Um arquivo por save, `saves/{id}/achievements.json` (`AchievementsState`). Ausente = nada desbloqueado, atributos em 10,
  nenhum item. Sem migração.
- Só o técnico do jogador. A IA não grava nada e não tem atributos (as funções de efeito devolvem 1 sem estado).
- As conquistas seguem o **técnico**: trocar de clube não apaga nada; os contadores de sequência (vitórias seguidas, sem
  perder, sem sofrer gol, derrotas seguidas) continuam pela carreira; os de temporada (casa na liga, invencibilidade na
  liga) recomeçam na virada do país do clube do jogador e na troca de clube.
- Verificação **num passo do avanço do dia** (`achievementsDay`, `src/backend/achievementsWorld.ts`), no fim do dia
  (depois da virada, dos prêmios, da moral e do técnico): lê os jogos do dia do clube do jogador (`MatchEvent`), as
  movimentações do dia (`StoredDayLog.transfers`), o registro do técnico em `managers.json`, o elenco (saldo, instalações,
  jovens), o histórico do clube e os prêmios do ano. Nada é resimulado.
- **Idempotente:** `state.lastDay` guarda o último dia contado; um dia refeito (fase 1 do `flush` não atômica) com
  `lastDay >= hoje` não soma nada de novo. Os critérios de estado (títulos, saldo, ranking…) são máximos/contagens, então
  reavaliá-los nunca duplica.
- Uma conquista desbloqueada nunca volta a ficar bloqueada (o saldo caiu, o ranking caiu: fica).
- A pré-simulação do start kit (`marketFrozen`) e o técnico desempregado não contam jogos (não há clube).

## 2. As conquistas (78 em 26 trilhas + 15 secretas = 93)

Cada trilha tem um atributo do técnico que ela alimenta (§4). "Jogo oficial" = liga, copa nacional ou continental do clube
do jogador (base nunca). Resultado: pelo placar final com prorrogação; **decidido nos pênaltis conta como vitória/derrota**
(a mesma regra da diretoria, `board-fans.md`).

### Títulos (atributo Tática) — `managers.json`, `ManagerRecord.titles` do técnico do jogador

| Id | Nome | Bronze | Prata | Ouro |
|---|---|---|---|---|
| `league_titles` | Campeão da liga | 1 título de liga | 3 | 6 |
| `cup_titles` | Rei de copas | 1 copa nacional | 3 | 5 |
| `continental_titles` | Conquistador | 1 título continental | 2 | 3 |
| `promotions` | Acesso | 1 acesso | 2 | 4 |

### Vitórias (Motivação) — jogos oficiais do dia

| Id | Nome | Bronze | Prata | Ouro |
|---|---|---|---|---|
| `wins` | Vencedor | 50 vitórias | 200 | 500 |
| `win_streak` | Embalado | 5 vitórias seguidas | 8 | 12 |
| `unbeaten_run` | Invicto | 10 jogos seguidos sem perder | 20 | 30 |
| `thrashings` | Goleador | 5 goleadas (vitória por 3+ gols) | 20 | 50 |

### Partidas (Motivação)

| Id | Nome | Bronze | Prata | Ouro |
|---|---|---|---|---|
| `comebacks` | Rei das viradas | 1 virada (vencer depois de estar atrás no placar) | 5 | 15 |
| `ten_men_wins` | Com um a menos | 1 vitória com um jogador expulso | 3 | 8 |
| `shootout_wins` | Frieza nos pênaltis | 1 disputa de pênaltis vencida | 3 | 6 |
| `derby_wins` | Dono da cidade | 1 clássico vencido (adversário da mesma cidade, `venue.city`) | 5 | 15 |

Virada e "estar atrás" usam a lista de gols com minuto (`MatchEvent.goals`, motor completo — o jogo do clube do jogador é
sempre no motor; gols da prorrogação também contam). Expulsão = algum `MatchCard` vermelho do clube na partida.

### Base (atributo Base)

| Id | Nome | Bronze | Prata | Ouro |
|---|---|---|---|---|
| `youth_promoted` | Formador | 3 jovens da base no elenco principal | 10 | 25 |
| `young_award` | Revelação | 1 prêmio de revelação da liga para um jogador do clube | 2 | 4 |

Jovem promovido: jogador do elenco principal formado no clube (`academyOf === clube`, id `youth_<clube>_…`, renascido,
jogador criado ou lenda); contado uma vez por id (`state.promotedIds`). Revelação: `young_player` do arquivo de prêmios do
ano para um jogador cujo clube premiado é o do técnico (contado uma vez por liga+temporada).

### Mercado (atributo Negociação) — `StoredDayLog.transfers` do dia

| Id | Nome | Bronze | Prata | Ouro |
|---|---|---|---|---|
| `sales_profit` | Bom negócio | €5M de lucro em vendas | €30M | €100M |
| `big_signing` | Contratação de peso | uma contratação de €5M | €25M | €60M |
| `free_starter` | Garimpeiro | 1 jogador contratado livre com 15 jogos como titular | 3 | 6 |

Lucro de uma venda com taxa = taxa − o que o técnico pagou por ele (`state.paid[playerId]`; 0 para formados, livres e
quem já estava no clube), somado só quando positivo. A rota de contratação de livre passa a gravar a movimentação
(`DayTransfer` `kind: "free"`), como as demais rotas. Titular = em campo sem ter entrado como substituto.

### Finanças (atributo Negociação)

| Id | Nome | Bronze | Prata | Ouro |
|---|---|---|---|---|
| `balance` | Cofre cheio | €10M de saldo ganho desde que assumiu o clube | €50M | €150M |
| `stadium` | Casa nova | 2.000 lugares a mais que no dia em que assumiu o clube | 8.000 | 20.000 |
| `facilities` | Estrutura de ponta | 2 níveis de instalações construídos desde que assumiu | 8 | 20 |

**Só o que o técnico construiu (conferência 2026-10-11):** saldo, capacidade e nível de cada item das instalações são
gravados no primeiro dia em que o passo vê o técnico no clube (`state.clubs[id]`: `baseBalance`, `baseCapacity`,
`baseFacilityLevels` — a chegada: o dia do `club_change` "arrive" ou o início da carreira, já com a TV inicial); as
trilhas medem só o que passa disso (saldo de hoje − o da chegada = a soma do extrato desde então; níveis acima dos da
chegada, somados entre os itens). Um clube rico não desbloqueia nada no dia 1. As demais trilhas já partem do que o
técnico fez (contadores do passo, títulos, temporadas, ranking com pontos, prêmios na virada, promovidos pela rota,
compras e vendas do dia); "clubes dirigidos" começa em 1 e o bronze pede 2.

### Carreira (atributo Disciplina)

| Id | Nome | Bronze | Prata | Ouro |
|---|---|---|---|---|
| `seasons` | Veterano | 3 temporadas completas | 10 | 20 |
| `clubs` | Andarilho | 2 clubes dirigidos | 4 | 6 |
| `ranking` | Prestígio | top 100 do ranking mundial de técnicos | top 20 | nº 1 |
| `manager_awards` | Reconhecido | 1 prêmio de técnico | 3 | melhor técnico do mundo |

Ranking: a melhor posição alcançada (`rankManagers` sobre `managers.json`, sem aposentados), só com pontos > 0.

### Elenco (atributo Tática)

| Id | Nome | Bronze | Prata | Ouro |
|---|---|---|---|---|
| `top_scorer` | Fábrica de gols | 1 artilheiro da liga no clube | 3 | 5 |
| `league_unbeaten` | Invencível | 10 jogos seguidos sem perder na liga | 19 | uma temporada inteira da liga invicta |

Artilheiro: prêmio `top_scorer` da liga para jogador do clube do técnico. Invencibilidade: sequência de jogos de liga,
dentro da temporada; o ouro é a temporada de liga terminada sem derrota (com 10 jogos ou mais).

### Secretas ("???" até desbloquear; 40 pontos; +0,5 no atributo)

| Id | Nome | Critério | Atributo |
|---|---|---|---|
| `fortress` | Fortaleza | Campeão da liga sem perder em casa na liga | Tática |
| `cheapest_champion` | Milagre | Campeão da liga com a menor folha salarial da liga | Negociação |
| `keeper_goal` | Goleiro artilheiro | Um goleiro do clube marca um gol | Motivação |
| `sacked_early` | Cadeira quente | Demitido até 30 dias depois de assumir o clube | Disciplina |
| `double` | Dobradinha | Liga e copa nacional na mesma temporada | Tática |
| `treble` | Tríplice coroa | Liga, copa e continental na mesma temporada | Tática |
| `great_escape` | Ressurreição | Vencer um jogo em que esteve 3 gols atrás | Motivação |
| `nine_men` | Nove contra onze | Vencer com dois expulsos | Motivação |
| `seven_up` | Atropelo | Vencer por 7 gols de diferença ou mais | Motivação |
| `bounce_back` | Volta por cima | Subir na temporada seguinte a um rebaixamento, no mesmo clube | Tática |
| `last_gasp` | No apagar das luzes | O gol da vitória depois dos 90 minutos | Motivação |
| `humbled` | Dia para esquecer | Perder por 5 gols de diferença ou mais | Disciplina |
| `perfect_month` | Mês perfeito | Vencer todos os jogos oficiais de um mês, com 4 ou mais | Motivação |
| `one_club` | Bandeira | 10 temporadas no mesmo clube | Disciplina |
| `wall` | Muralha | 10 jogos oficiais seguidos sem sofrer gol | Tática |

Mesma temporada (dobradinha, tríplice): os títulos do técnico com o mesmo rótulo de temporada. Folha: soma dos
contratos (`squadWeeklyWages`) dos clubes da liga na virada (composição antiga: a liga de hoje sem quem chegou na
virada, mais quem saiu). Mês: o mês civil, avaliado no primeiro dia do mês seguinte.

## 3. Pontos e itens do perfil

- Pontos ganhos = soma dos desbloqueios; **saldo** = ganhos − gastos na loja (§5).
- **Molduras** do rosto do técnico (pelos pontos ganhos, nunca gastos): Bronze 100, Prata 400, Ouro 900, Lenda 1500.
- **Selos** (até 3 exibidos): um por categoria com algum ouro (8) e "Mistério" com alguma secreta.
- **Título exibido** (1): um por trilha com o ouro ("Rei das viradas", "Formador"…).
- Escolhidos na tela; mostrados no cartão do clube do Painel (moldura no rosto, título abaixo do nome, selos) e no ranking
  de técnicos (linha do jogador e detalhe). A escolha é validada: só itens desbloqueados.

## 4. Atributos do técnico (1–20, começam em 10)

| Atributo | Efeito (t = (v − 10)/10, entre −1 e 1) | Onde |
|---|---|---|
| Motivação | Moral ganha por vitória, gol e boa nota × (1 + 0,05 t) | `moraleDay` (só deltas positivos de resultado) |
| Tática | Ganho de familiaridade do treino × (1 + 0,05 t) | `trainFamiliarity` |
| Base | DP dos jovens (≤ 21) do clube × (1 + 0,05 t): partida, treino, base, torneios de base | `matches.ts`, `dailyTraining.ts`, `youth.ts`, `youthMatch.ts` |
| Negociação | Pedido de salário × (1 − 0,05 t) nas contratações e renovações; taxa aceita pela IA × (1 − 0,05 t) nas compras | `contractDemand`, `respondToOffer` |
| Disciplina | Chance de falta e de cartão do time × (1 − 0,05 t) | motor (`foulChance`, `cardRoll`), quickSim (`rollDiscipline`) |

- Em 10 o multiplicador é exatamente 1 (por construção, nenhum número muda; nenhum sorteio novo).
- **Sobem** com conquistas no atributo da trilha: bronze +0,25, prata +0,5, ouro +1, secreta +0,5; com títulos (liga
  +0,5, continental +0,5, copa +0,25, acesso +0,25, na Tática); e com uma temporada que cumpre a meta da diretoria (+0,25
  na Motivação, na virada).
- **Caem** de leve: a cada 5 derrotas oficiais seguidas, −0,25 na Motivação e −0,25 na Disciplina.
- Limitados a 1..20 (guardados com duas casas; a tela mostra o inteiro arredondado).

## 5. Loja (uma de cada por carreira)

- **Jogador criado — 300 pontos.** O jogador escolhe nome (2–30 caracteres), posição (14 papéis), nacionalidade (com
  bandeira) e pé. Entra na base com 16 anos, contrato de base de 3 anos, nível = média da linha do clube − 1,8 + 1,0
  (bônus de promessa, a mesma regra da safra) + 0,3, sem ruído; arquétipo "Wonderkid"; formado no clube. Base cheia (18)
  → 400 `youthFull`.
- **Lenda aposentada — 500 pontos.** Um sorteio determinístico (no primeiro pedido, guardado) de 3 craques aposentados do
  mundo (`retired.json`: classe mundial primeiro, depois o melhor nível ao se aposentar; nunca um já renascido); o escolhido
  volta com 17 anos pela regra do renascido (`generateReborn`, id `legend_<id>_<ano>`, cresce 1,3× até os 23).
- Sem pontos → 409 `notEnoughPoints`; já comprado → 409 `alreadyBought`; sem clube → 409 `noClub`.

## 6. Enfeites do estádio (só desenho)

- **Faixa** (100 pontos ganhos), **bandeirão** (400), **mosaico** (900), ligados/desligados na tela.
- Desenhados na arquibancada de trás do gol da torcida da casa, nas cores do clube, só nos jogos em casa do clube do
  jogador (`match-setup` → `crowd.decor`), dentro da textura já assada da torcida (nenhum custo por quadro).

## 7. Dados, rotas, telas

- Tipos em `src/types/achievementTypes.ts`; catálogo e regras puras em `src/Domain/achievements/`; E/S em
  `src/backend/achievementsWorld.ts`; rotas em `src/backend/achievementRoutes.ts`.
- `GET /api/saves/:id/achievements` — catálogo com progresso (secretas sem nome nem critério até desbloquear), pontos,
  atributos, itens disponíveis e escolhidos, enfeites, loja (com as 3 lendas se sorteadas).
- `PUT /api/saves/:id/achievements/profile { frame, badges, title }`, `PUT …/stadium { banner, flag, mosaic }`,
  `POST …/shop/created { name, position, nationality, foot }`, `POST …/shop/legend/draw`,
  `POST …/shop/legend { retiredId }`. Dono do save, escrita com `withSaveLock`.
- `GET /api/saves/:id/managers` devolve o `profile` do técnico do jogador (moldura, título, selos).
- **Tela própria `/achievements`** ("SUAS **CONQUISTAS**"), sem aba na barra superior: as conquistas são o perfil do
  técnico (itens, atributos, loja), não números de competição (a Estatísticas mostra competições e o mundo); a barra
  superior já está no limite de abas. Acesso pelo cartão do clube no Painel, pelo ranking de técnicos e pela mensagem da
  caixa de entrada. Abas: Conquistas (por categoria, trilhas com as três medalhas e o progresso "37/50 vitórias",
  secretas) · Perfil (moldura, selos, título, enfeites) · Técnico (atributos e o efeito) · Loja.
- **Caixa de entrada:** categoria `achievement` (`unlocked`, uma mensagem por dia com tudo o que foi desbloqueado), tópico
  novo `achievements` (ligado por padrão; não pede ação).
- **Partida ao vivo:** não se aplica — as conquistas são verificadas no avanço do dia; a resposta do avanço traz
  `achievements: n` e o resumo do dia mostra a linha.

## 8. `/test`, `/lab`

Só a Disciplina mexe na partida.
- `/test`: seletor "Mgr discipline" por time (Off, 1, 5, 10, 15, 20) → `GameState.managerDiscipline`; `EnergyPanel` com o
  multiplicador; logs `foul`/`card` com `discMult`; o painel QuickSim recebe o valor.
- `/lab`: `Variant.managerDiscipline` (slider, 0 = ausente) → `simulateMatch(..., { managerDiscipline })` e
  `homeManagerDiscipline`/`awayManagerDiscipline` no quickSim; `TeamRawStats.managerDiscipline` → `avgManagerDiscipline`
  → linha "Mgr discipline" no `PairDetail`.
- `Statistics.ts`: nada novo (faltas e cartões já existem).

## 9. Medição (`scripts/achievements-measure.ts`)

- **M1 (Disciplina, motor):** o mesmo clube dos dois lados, lado A com Disciplina 20 × 10 (e 1 × 10): faltas e cartões
  do lado A. Esperado ×0,95 (×1,05).
- **M2 (mundo):** todos em 10 = o motor de antes (mesmo `Math.random`, partidas idênticas); quickSim pareado idêntico.
- **M3 (Motivação):** moral média de um elenco real numa temporada sintética (38 jogos, 50% de vitórias) com Motivação
  20 × 10.

Resultados em §11.

## 10. Limitações

- O efeito no extremo é pequeno por decisão (±5%): os atributos são um sabor, não uma alavanca.
- Clássico só pela mesma cidade (sem rival da cidade, nenhum clássico).
- O lucro em vendas só conhece o que o técnico pagou desde esta etapa.
- Uma conquista de temporada (fortaleza, invencível) usa os jogos que o passo viu: um clube assumido no meio da temporada
  conta só a parte dele.

## 11. Resultados (2026-10-11)

| Medição | Resultado |
|---|---|
| M1 motor (`pair premier_league 400 --disc 20`, 3 sementes, 1200 jogos) | lado com Disciplina 20 × lado sem: faltas ×0,987, amarelos ×0,968, pênaltis cedidos ×0,876, vermelhos 0,058 × 0,043 (ruído: ~60 eventos); gols 1,13 × 1,08 e chutes 2,74 × 2,64 dentro do ruído |
| Caminho (`ACH_OVERRIDES='{"EFFECT":0.5}'`, 80 jogos) | faltas ×0,69, amarelos ×0,34 — a chance ×0,5 por lance vira ~×0,7 de faltas: um duelo sem falta segue e gera outros, então os −5% da chance viram ~−2 a −3% de faltas |
| M2 motor (`world premier_league 60`) | 60/60 jogos idênticos (placar, faltas, amarelos, chutes) com os dois técnicos em 10 e sem atributo |
| M2/M1 quickSim (`quick 400`, 26 ligas) | 10 400/10 400 idênticos em 10; mandante em 20: faltas ×0,947, amarelos ×0,897, pênaltis ×0,953; em 1: ×1,046, ×1,086, ×1,033; gols ×1,000 |
| M3 (`motivation 40`) | moral média do elenco na temporada: Motivação 10 → 68,45; 20 → 68,70; 1 → 68,22 |

**Desvios do desenho:** nenhum de regra. A tela é própria (`/achievements`, sem aba na barra superior) como previsto no
§7; o resumo do dia ganhou a linha das conquistas.
