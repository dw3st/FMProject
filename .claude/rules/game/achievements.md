# Conquistas

Spec: `docs/superpowers/specs/2026-10-11-achievements-design.md`. Etapa 40 do `docs/ROADMAP.md` (#95), versão **6.0**.
Visual: `.claude/rules/ui-standard.md`.

## Regra

- Conquistas **da carreira**, só do técnico do jogador: `saves/{id}/achievements.json` (`AchievementsState`,
  `src/types/achievementTypes.ts`). Ausente = nada desbloqueado, atributos em 10. A IA não tem nada. Sem migração.
- **98 conquistas** (93 até a 6.1): 27 trilhas (bronze/prata/ouro) em 8 categorias + 17 secretas ("???" até desbloquear). Catálogo e
  critérios em `src/Domain/achievements/catalog.ts` e na spec §2.
- Seguem o **técnico**: trocar de clube não apaga nada. Sequências (vitórias, sem perder, sem sofrer gol, derrotas) são
  da carreira; a temporada da liga (casa, invencibilidade) recomeça na virada do país do clube e na troca de clube.
- **Verificação:** um passo no fim de `advanceOneDay` (`achievementsDay`, `src/backend/achievementsWorld.ts`), depois da
  virada, dos prêmios, da moral e do técnico, sobre o que o jogo já guarda: jogos oficiais do dia do clube (`MatchEvent`,
  com a lista de gols e os cartões), movimentações do dia (`StoredDayLog.transfers`), `managers.json` (títulos,
  temporadas, passagens, prêmios, ranking), o elenco (saldo, capacidade, itens das instalações), o histórico do clube
  (rebaixado e subiu) e os prêmios do ano. Nada é resimulado. A rota de promover um jovem (`youthRoutes`) registra o
  promovido. A rota de contratar livre passou a gravar a movimentação (`DayTransfer` `kind: "free"`).
- **Idempotente:** `state.lastDay`; um dia refeito não soma de novo. Uma conquista desbloqueada nunca volta.
- Pré-simulação do kit (`marketFrozen`) e desempregado: nenhum jogo conta.
- **Nada desbloqueia pelo estado inicial do clube:** saldo, capacidade e nível de cada item das instalações são gravados
  no primeiro dia do técnico no clube (`state.clubs[id]`: `baseBalance`, `baseCapacity`, `baseFacilityLevels`); Cofre
  cheio mede o saldo ganho desde então (= soma do extrato desde a chegada), Casa nova os lugares a mais, Estrutura de
  ponta os níveis construídos (2 / 8 / 20). As demais trilhas contam só o que o técnico fez.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/achievements/achievementsConfig.ts` | Todas as constantes (`ACHIEVEMENTS`) |
| `src/Domain/achievements/catalog.ts` | Trilhas (categoria, atributo, limiares, regra do ouro) e secretas |
| `src/Domain/achievements/matchFacts.ts` | Fatos de um jogo do clube (resultado com pênaltis, maior desvantagem, gol da vitória depois dos 90, expulsos, gol de goleiro, titulares) |
| `src/Domain/achievements/progress.ts` | Estado puro: contadores, `recordMatch`, mês, títulos (dobradinha, tríplice), virada, desbloqueio, pontos |
| `src/Domain/achievements/day.ts` | `applyAchievementDay` (um dia, idempotente) |
| `src/Domain/achievements/managerAttributes.ts` | Atributos 1..20: `attributeBoost` / `attributeReduce` (±5% no extremo, 1 em 10 ou ausente), `youthAttributeMult` |
| `src/Domain/achievements/items.ts` | Molduras, selos, títulos, enfeites; validação do perfil e dos enfeites; visões da tela |
| `src/Domain/achievements/shop.ts` | Jogador criado (`createdPlayer`), lendas (`legendPool`, `legendPlayer`) |
| `src/Domain/inbox/achievementMessage.ts` | Inbox `achievement` |
| `src/backend/achievementsWorld.ts` | E/S do passo do dia; `achievementSnapshot`; cópia dos atributos no clube |
| `src/backend/achievementRoutes.ts` | Rotas |
| `src/GameInterface/Achievements/*` | Tela `/achievements`, corpo da inbox, API e estilos (moldura, medalhas, selos) |
| `src/GraficsEngine/stadiumDecor.ts` | Geometria dos enfeites na torcida da casa |
| `scripts/achievements-measure.ts` | Medições M1–M3 |

## Pontos e itens

- Bronze 10, prata 25, ouro 50, secreta 40. Saldo = ganhos − gastos na loja (as molduras e os enfeites contam os ganhos).
- **Pontos de campanha (7.7.2, report de tester: depois de todas as conquistas não havia mais pontos):** somados aos das
  conquistas (`AchievementsState.campaign = { points, seen }`, uma vez por chave, `addCampaign`): título de liga 60, copa
  40, continental 80, acesso 25, torneio de seleção 60 (`applyCampaignRecord`, sobre os títulos e prêmios do registro do
  técnico, inclusive os de antes da regra), semifinal continental 15 e final 30 (primeiro jogo da fase, `continental:<slug>:<ano>:<fase>:<clube>`),
  meta da diretoria cumprida na virada 15, melhor técnico da liga 20 e do mundo 40 (`ACHIEVEMENTS.CAMPAIGN`). A tela mostra
  "N das conquistas · M da campanha".
- Molduras do rosto: Bronze 100, Prata 400, Ouro 900, Lenda 1500 pontos ganhos. Selos (até 3): um por categoria com
  algum ouro, "Mistério" com alguma secreta. Título exibido (1): um por trilha com o ouro.
- Mostrados no cartão do clube do Painel (moldura, título, selos, "Conquistas: N/98 · X pts") e no ranking de técnicos
  (linha e detalhe do técnico do jogador; a rota `/managers` devolve `profile`). Um item escolhido que deixou de estar
  disponível nunca aparece (`shownProfile`).
- Enfeites do estádio: faixa 100, bandeirão 400, mosaico 900 pontos ganhos; ligados na tela; desenhados na torcida de
  trás do gol da casa (`PitchStadium.decor`, do `match-setup` → `crowd.decor`, só nos jogos em casa do clube do
  jogador; nunca numa arquibancada em obra), dentro da textura assada da torcida.

## Atributos do técnico (1..20, começam em 10)

`t = (v − 10)/10`; efeito `1 + 5% t` (Motivação, Tática, Base) ou `1 − 5% t` (Negociação, Disciplina). Em 10 é
exatamente 1 (nenhum número muda, nenhum sorteio novo).

| Atributo | Onde |
|---|---|
| Motivação | `moraleDay`: a variação positiva de moral de um jogo (vitória, gols, boa nota) |
| Tática | `trainFamiliarity` no treino do clube (`dailyTraining.ts`) |
| Base | DP de quem tem ≤ 21 anos: partida (`matches.ts`), treino, temporada da base (`youth.ts`), torneios de base (`youthMatch.ts`) |
| Negociação | `demandBreakdown` (`DemandContext.negotiation`) nas contratações, renovações e pré-contratos do jogador; `respondToOffer(..., { negotiation })`: a taxa que o vendedor precisa nas compras dele |
| Disciplina | `foulChance` / `cardRoll` (`FoulContext.discipline`) pelo `GameState.managerDiscipline`; quickSim `homeManagerDiscipline` / `awayManagerDiscipline` (faltas, pênaltis cedidos e cartões do lado) |

- **Sobem:** conquista na trilha do atributo (bronze +0,25, prata +0,5, ouro +1, secreta +0,5); título (liga e
  continental +0,5, copa e acesso +0,25, na Tática); temporada com a meta da diretoria cumprida (+0,25 na Motivação).
- **Caem:** a cada 5 derrotas oficiais seguidas, −0,25 na Motivação e na Disciplina. Limitados a 1..20.
- **Cópia no clube:** `Squad.managerAttributes` (só o clube do jogador), escrita pelo passo do dia e pela troca de
  clube (`takeOverClub`); sai no `releaseHumanClub` e nos kits (`stripHumanOnly`). Os efeitos leem o clube em que agem;
  a fonte é o `achievements.json`. A partida simulada (`buildMatchEvent`) e a ao vivo (`MatchScreen`) põem a Disciplina
  no `GameState`.

## Loja (uma de cada por temporada)

- Desde a 7.7.2: cada item uma vez por temporada da liga do técnico (`bought.<item>Season` = `liga:ano`), o preço sobe
  `SHOP_STEP` (100) a cada compra (`shopPrice`, `recordPurchase`); uma compra de antes da regra conta como uma.

- **Jogador criado** (300 pontos): nome (2–30), posição (14), nacionalidade (com bandeira), pé; 16 anos, na base, nível
  = média da linha − 1,8 + 1,0 + 0,3, arquétipo "Wonderkid", formado no clube (`academyOf`), contrato de base.
- **Lenda aposentada** (500): lista de todas as lendas disponíveis, com busca pelo nome (`legendPool`: classe mundial
  primeiro, depois o nível ao se aposentar; completa com os melhores aposentados até 12 enquanto o mundo tem poucas; nunca um
  já renascido, já trazido por outro técnico nem um livre aposentado). Até a 8.2.12 era um sorteio guardado de 3 (report de
  tester). A linha mostra jogos e gols da carreira (`careerTotals`, a soma das linhas do histórico, só o que ele jogou desde o começo do mundo). O escolhido volta com 17 anos pela regra do renascido (`generateReborn`, id `legend_<id>_<ano>`).
- 409 `notEnoughPoints` / `alreadyBought` / `noClub`; 400 `youthFull` / `invalidPlayer` / `notOffered`.

## Rotas (dono do save; escrita com `withSaveLock`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/achievements` | Trilhas com valor e desbloqueios, secretas (sem nome até desbloquear), pontos, atributos e efeitos, perfil, itens disponíveis, enfeites, loja |
| `PUT …/achievements/profile { frame, badges, title }` | 400 `invalidProfile` / `locked` |
| `PUT …/achievements/stadium { banner, flag, mosaic }` | 400 `invalidDecor` / `locked` |
| `POST …/achievements/shop/created { name, position, nationality, foot }` | Jogador criado |
| `POST …/achievements/shop/legend { retiredId }` | Lenda escolhida |

## Telas

- **`/achievements`** ("SUAS **CONQUISTAS**"), tela própria sem aba na barra superior (é o perfil do técnico, não números
  de competição; a barra já está no limite): KPIs (desbloqueadas, pontos ganhos, para gastar) e abas Conquistas (por
  categoria: medalhas com o limiar, barra até o próximo, "37 / 50"; secretas "???") · Perfil (prévia, moldura, selos,
  título, enfeites) · Técnico (5 atributos com o efeito) · Loja. Acesso pelo cartão do clube, pelo ranking e pela inbox.
- **Inbox** `achievement` (`unlocked`, uma mensagem por dia), tópico `achievements` (ligado por padrão), tema Clube.
- **Renovação/contratação:** linha "Sua negociação: −N%" no pedido (`demand` devolve `negotiation`).
- Partida ao vivo: não se aplica (verificadas no avanço do dia).

## `/test`, `/lab`

- `/test`: "Mgr discipline A/B" (Off, 1, 5, 10, 15, 20) → `GameState.managerDiscipline`; `EnergyPanel` com o
  multiplicador; `discMult` nos logs `foul`/`card`; o painel QuickSim recebe os valores.
- `/lab`: `Variant.managerDiscipline` (slider, 0 = ausente) → `simulateMatch(..., { managerDiscipline })` e o quickSim;
  rótulo `· disc N`; `TeamRawStats.managerDiscipline` → `avgManagerDiscipline` → linha "Mgr discipline" no `PairDetail`.
- `Statistics.ts`: nada novo.

## Medições (`bun scripts/achievements-measure.ts`, 2026-10-11)

| Medição | Resultado |
|---|---|
| M1 motor, Premier, mesmo clube dos dois lados, um lado com Disciplina 20 (3 × 400 jogos) | faltas ×0,987, amarelos ×0,968, pênaltis cedidos ×0,876, vermelhos ruído (0,058 × 0,043); gols e chutes iguais dentro do ruído |
| Caminho com efeito grande (`ACH_OVERRIDES='{"EFFECT":0.5}'`, 80 jogos) | faltas ×0,69, amarelos ×0,34: a chance por lance ×0,5 vira ~×0,7 de faltas (um duelo sem falta segue e gera outros) |
| M2 motor: os dois em 10 × sem atributo, mesmo `Math.random` (60 jogos) | 60/60 idênticos |
| M2 quickSim: os dois em 10 × sem atributo (26 ligas × 400) | 10 400 / 10 400 idênticos; volume do mundo 0,00% |
| M1 quickSim: mandante em 20 / em 1 × sem | faltas ×0,947 / ×1,046, amarelos ×0,897 / ×1,086, pênaltis ×0,953 / ×1,033, gols ×1,000 |
| M3 moral média da temporada (Premier, 40 temporadas sintéticas, 50% de vitórias) | Motivação 10: 68,45 · 20: 68,70 · 1: 68,22 |

O volume do mundo não muda por construção: só o clube do jogador tem atributos.

## Testes

```
bun test src/Domain/achievements src/backend/achievements.test.ts src/GameEngine/Domain/Fouls.test.ts \
  src/Domain/advanceDay/quickSim.test.ts src/Domain/morale src/Domain/advanceDay/dailyTraining.test.ts \
  src/GraficsEngine/stadiumDecor.test.ts src/Domain/inbox
```

## Limitações

- O efeito no extremo é pequeno (±5% por decisão): os atributos são um sabor.
- Clássico só pela mesma cidade (`venue.city`).
- O lucro em vendas só conhece o que o técnico pagou desde esta etapa (jogadores que já estavam no clube: lucro = taxa).
- Conquistas de temporada contam só os jogos que o passo viu (um clube assumido no meio da temporada conta a parte dele).
- A folha da "Milagre" é a da virada (depois das saídas de contrato do dia).

## Seleção (Etapa 41b, 6.2)

98 conquistas: trilha `national_wins` (vitórias com a seleção que ele treina, 5 / 20 / 50, Partidas, Motivação; contador
`nationalWins`, lido do `StoredDayLog.nationalMatch` pelo passo do dia) e secretas `world_champion` (título `wc_*` no
registro, Tática) e `against_homeland` (vencer a seleção da nacionalidade dele treinando outra, Motivação). Os jogos da
seleção não contam nas outras trilhas. Ver `.claude/rules/game/national-teams.md` → "Técnico do jogador".

## Bandeirão e telas (8.1.18)

O bandeirão (`flag`, 400 pontos) não é mais desenhado na partida nem oferecido na aba Perfil (a pedido do usuário);
faixa e mosaico continuam. Com o visual novo, as medalhas das trilhas têm 48px, as secretas usam `medal-secret` e as
molduras são cartões com o rosto do técnico em cada moldura (bloqueadas em cinza, com os pontos).

## Rodízio das lendas na loja (8.2.21)

Report de tester (substitui a lista completa da 8.2.12). A loja oferece a cada técnico e temporada `LEGEND_OFFER.SIZE` (12) aposentados sorteados de todos os notáveis (`legendOffer`, sorteio ponderado, peso comum 1, raro 3, super raro 2; só quem se aposentou até o início da temporada, para a lista não mudar quando outros países viram; quem outro técnico trouxe dá lugar ao próximo). Raro = lenda (nota 45+), super raro = classe mundial ou nota 55+, custando +200 e +500 pontos (`legendExtraPrice`, gravado no preço da compra). A lista de lendas em Estatísticas (trazer com dinheiro) não muda.

## Apostas (8.9)

108 conquistas: trilhas `bets_profit` e `bets_exact` e a secreta `bet_longshot`. Ver `.claude/rules/game/bets.md`.

## Cores e mosaico em pixel art (8.9.10)

Report de tester, mock aprovado. `StadiumDecor` ganhou `palette` (`club`, `inverted`, `black_gold`, `blue_white`, `green_yellow`, `custom` com `colors` em hex) e `pattern` do mosaico (`stripes`, `check`, `crest`, `star`); ausentes = as cores do clube em faixas. Cores e validação em `src/Domain/achievements/decorStyle.ts` (`decorColors`, `parseDecorStyle`, 400 `invalidDecor`). O mosaico vira uma grade de 16 células na largura da arquibancada da casa (`mosaicCells`, `stadiumDecor.ts`); escudo e estrela se repetem ao longo dela; o escudo lê os pixels do escudo real do clube (64 px, transparente = cor principal; sem o escudo, um escudo genérico). A partida redesenha o mosaico quando o escudo chega. Tela: `DecorStylePicker` e a prévia (`StadiumDecorPreview`, mesma geometria).

## Só lendas no sorteio (8.9.24)

Report do usuário (a lista só trazia jogadores medianos). `legendOffer` sorteia só entre as lendas (`isLegend`); os demais aposentados (os melhores primeiro) só completam a lista quando há menos lendas que `LEGEND_OFFER.SIZE`. Antes o sorteio era entre todos os notáveis (nota 3,5 ou mais), centenas de comuns contra poucas dezenas de lendas.

## Lendas reais na loja (8.9.26)

Pedido do usuário. A loja oferece só lendas reais, do Wikidata (CC0): `bun scripts/fetchWikidataLegends.ts` grava `src/example_data/realLegends.json` (1165 na rodada de 2026-11-10): vencedores da Bola de Ouro, campeões de Copa do Mundo (participou da edição e era da seleção campeã) e jogadores com artigo em 40+ idiomas da Wikipedia que jogaram pela seleção principal (tira atores e políticos que jogaram na juventude); nascidos de 1920 a 1990, com posição; quem ainda joga no mundo (nome ou inicial + sobrenome e ano de nascimento ±1) fica de fora. Só campos derivados: id, nome, ano, nacionalidade, posição, honrarias, fama (idiomas).

`src/Domain/legends/realLegends.ts`: `realLegendPool(retired)` monta os `RetiredPlayer` (`real`, atributos de `statsFor` pela fama e honrarias, `retiredOn` 1990-01-01); o registro de `retired.json` vence (a compra grava o escolhido lá, com `legendBy`). `isLegend` vale para todo real; raridade super para Bola de Ouro, campeão de Copa com fama 60+ ou fama 90+, senão rara. O sorteio da temporada (`legendOffer`) é o mesmo. A linha da loja mostra ano de nascimento, Bolas de Ouro e Copas. Trazer com dinheiro (Estatísticas, Aposentados) continua com as lendas do mundo.

## Estrela do jogador criado (8.9.28)

Report de tester, opção B do mock, só a estrela. `CreatedStar` (`Components/CreatedStar.tsx`, `isCreatedPlayer`: id `created_…`) antes do nome no Elenco, na Base e na ficha, em `chart-2`.

Legenda e lado da estrela (8.9.33): a estrela do jogador criado vai à direita do nome (depois da coroa de louros), e o rodapé do Elenco mostra `StarLegend` (`StarBadge.tsx`: as três estrelas e a do criado).

## Roleta das lendas (8.9.34)

Report de tester, opção B do mock. A lenda da loja sai de uma roleta (`src/Domain/achievements/legendSpin.ts`, `ACHIEVEMENTS.LEGEND_SPIN`): faixas comum 50%, rara 28%, épica 14%, lendária 6%, ícone 2% (`legendTier` pela fama e honrarias da lenda real: ícone = Bola de Ouro ou fama 120+), uma lenda disponível sorteada dentro da faixa (faixa vazia cai para a mais perto). `POST /achievements/shop/legend/spin { pay? }`: o primeiro giro da temporada custa o preço da loja; girar de novo custa 150 pontos ou €2M da carteira do técnico (`managerSpent`); se outro técnico levou a lenda sorteada, o próximo giro é grátis. O sorteio fica em `AchievementsState.legendSpin`; `POST /shop/legend` traz a sorteada (409 `offerClosed` se foi levada), sem cobrar de novo, com o preço da compra = o que os giros custaram. Tela: `LegendRoulette` (faixa de cartões deslizando até o marcador). Trazer lenda com dinheiro (Estatísticas, Aposentados) continua com a lista da temporada.

## Tela do técnico (8.9.36)

Pedido do usuário, opção A (loja B do mock). `/achievements` virou "SEU TÉCNICO", aberta pelo rosto do técnico na barra de cima (`TopNavigation`, antes do botão de report): abas Perfil (perfil + atributos), Conquistas, Loja e Apostas; `?tab=manager` abre Perfil e `?tab=assets` a Loja. Topo: conquistas, pontos e carteira (`/bets?summary=1`). A Loja junta roleta e jogador criado (pontos), a lenda paga pelo clube (`RetiredList legendsOnly`, a mesma de Estatísticas → Aposentados) e os bens do técnico (`AssetsTab`). Bens novos (`ASSET_KINDS`): barco, avião, roupa, arte e adega, 4 níveis cada (até €60M, €50M, €1M, €40M), imagens em `manager-assets/<tipo>-<nível>.webp` (`data_process/assets/manager_assets/build_manager_assets_more.py`).
