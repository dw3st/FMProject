# Conquistas

Spec: `docs/superpowers/specs/2026-10-11-achievements-design.md`. Etapa 40 do `docs/ROADMAP.md` (#95), versão **4.20**.
Visual: `.claude/rules/ui-standard.md`.

## Regra

- Conquistas **da carreira**, só do técnico do jogador: `saves/{id}/achievements.json` (`AchievementsState`,
  `src/types/achievementTypes.ts`). Ausente = nada desbloqueado, atributos em 10. A IA não tem nada. Sem migração.
- **98 conquistas** (93 até a 4.21): 27 trilhas (bronze/prata/ouro) em 8 categorias + 17 secretas ("???" até desbloquear). Catálogo e
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
| `src/Domain/achievements/shop.ts` | Jogador criado (`createdPlayer`), lendas (`legendOptions`, `legendPlayer`) |
| `src/Domain/inbox/achievementMessage.ts` | Inbox `achievement` |
| `src/backend/achievementsWorld.ts` | E/S do passo do dia; `achievementSnapshot`; cópia dos atributos no clube |
| `src/backend/achievementRoutes.ts` | Rotas |
| `src/GameInterface/Achievements/*` | Tela `/achievements`, corpo da inbox, API e estilos (moldura, medalhas, selos) |
| `src/GraficsEngine/stadiumDecor.ts` | Geometria dos enfeites na torcida da casa |
| `scripts/achievements-measure.ts` | Medições M1–M3 |

## Pontos e itens

- Bronze 10, prata 25, ouro 50, secreta 40. Saldo = ganhos − gastos na loja (as molduras e os enfeites contam os ganhos).
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

## Loja (uma de cada por carreira)

- **Jogador criado** (300 pontos): nome (2–30), posição (14), nacionalidade (com bandeira), pé; 16 anos, na base, nível
  = média da linha − 1,8 + 1,0 + 0,3, arquétipo "Wonderkid", formado no clube (`academyOf`), contrato de base.
- **Lenda aposentada** (500): sorteio guardado de 3 aposentados (classe mundial primeiro, depois o nível ao se
  aposentar; nunca um já renascido nem um livre aposentado); o escolhido volta com 17 anos pela regra do renascido
  (`generateReborn`, id `legend_<id>_<ano>`).
- 409 `notEnoughPoints` / `alreadyBought` / `noClub`; 400 `youthFull` / `invalidPlayer` / `notOffered`.

## Rotas (dono do save; escrita com `withSaveLock`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/achievements` | Trilhas com valor e desbloqueios, secretas (sem nome até desbloquear), pontos, atributos e efeitos, perfil, itens disponíveis, enfeites, loja |
| `PUT …/achievements/profile { frame, badges, title }` | 400 `invalidProfile` / `locked` |
| `PUT …/achievements/stadium { banner, flag, mosaic }` | 400 `invalidDecor` / `locked` |
| `POST …/achievements/shop/created { name, position, nationality, foot }` | Jogador criado |
| `POST …/achievements/shop/legend/draw` | Sorteia as 3 lendas (uma vez; guardado) |
| `POST …/achievements/shop/legend { retiredId }` | Lenda escolhida |

## Telas

- **`/achievements`** ("SUAS **CONQUISTAS**"), tela própria sem aba na barra superior (é o perfil do técnico, não números
  de competição; a barra já está no limite): KPIs (desbloqueadas, pontos ganhos, para gastar) e abas Conquistas (por
  categoria: medalhas com o limiar, barra até o próximo, "37 / 50"; secretas "???") · Perfil (prévia, moldura, selos,
  título, enfeites) · Técnico (5 atributos com o efeito) · Loja. Acesso pelo cartão do clube, pelo ranking, pela inbox e
  pelo resumo do dia.
- **Inbox** `achievement` (`unlocked`, uma mensagem por dia), tópico `achievements` (ligado por padrão), tema Clube.
- **Resumo do dia:** linha "N conquista(s) desbloqueada(s)" (`AdvanceDayResponse.achievements`).
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

## Seleção (Etapa 41b, 4.22)

98 conquistas: trilha `national_wins` (vitórias com a seleção que ele treina, 5 / 20 / 50, Partidas, Motivação; contador
`nationalWins`, lido do `StoredDayLog.nationalMatch` pelo passo do dia) e secretas `world_champion` (título `wc_*` no
registro, Tática) e `against_homeland` (vencer a seleção da nacionalidade dele treinando outra, Motivação). Os jogos da
seleção não contam nas outras trilhas. Ver `.claude/rules/game/national-teams.md` → "Técnico do jogador".
