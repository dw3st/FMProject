# Erros do juiz, VAR e reclamação do técnico

Spec: `docs/superpowers/specs/2026-10-10-var-design.md` (decisões do usuário no §9). Etapa 39 do `docs/ROADMAP.md` (#109),
versão **4.18**. Depende de `referees.md` (qualidade, rigor, escala), `game-engine/fouls.md` e `game-rules/offside.md`.

## Regra

- O árbitro erra de vez em quando, mais quanto pior a **qualidade** (0..100). Cinco erros, rolados no momento da
  decisão no motor completo (`RefereeErrorKind`):

| Tipo | Oportunidade | Sem correção |
|---|---|---|
| `phantom_penalty` | desarme/duelo **sem falta** do defensor dentro da própria área | pênalti marcado (sem cartão; conta como falta) |
| `missed_penalty` | falta do defensor dentro da própria área | jogo segue, sem pênalti nem cartão |
| `missed_offside` | receptor impedido (passe normal e bola solta/em profundidade) | bandeirinha não marca, jogo segue |
| `wrong_red` | amarelo (não segundo amarelo) | vermelho direto |
| `missed_red` | vermelho direto (sem amarelo antes) | amarelo |

- Chance = `BASE[tipo] × qualityMult(q)`, `qualityMult = 1,5 − 0,8 × q/100` (1 em 62,5). Constantes em
  `src/GameEngine/Configs/VarConfig.ts`; lógica pura em `src/GameEngine/Domain/Var.ts`.
- **Regra de ouro:** sem árbitro, ou árbitro sem `quality` (save antigo, `/test` "Off", `/lab` sem qualidade), nenhum
  sorteio novo acontece — o jogo é idêntico ao de antes (teste `Var.engine.test.ts`, mesmo `Math.random`).
- **VAR** (`hasVar`, `src/Domain/referees/var.ts`): 1ª divisão das 10 ligas principais (`VAR_LEAGUES`, as de
  `scripts/faces/wikidata.ts`), as 4 continentais e as copas desses países a partir das quartas. Base nunca.
  `EngineReferee.var` liga o VAR no jogo (`engineReferee(r, hasVar)`, avanço do dia e `match-setup`).
- O VAR corrige um erro revisável com `CORRECTION` 0,8 e revê `CHECK_CORRECT` 0,25 dos pênaltis/vermelhos certos
  (sempre confirmados; o VAR nunca erra). Impedimento não marcado só é revisto quando vira gol do mesmo lado em até
  `GOAL_CHAIN_SECONDS` 15 s de jogo sem a posse mudar nem bola parada no meio (`GameState.missedOffside`).
- **Revisão no motor** (`GameState.varReview`): fase morta de `REVIEW_SECONDS` 3 s reais, sem tempo de jogo (checada
  antes do relógio em `tickState`; o período não acaba no meio). No fim (`endVarReview`):
  - pênalti anulado → tiro livre do time que defendia no ponto do lance (`awardFoulRestart`);
  - pênalti não marcado corrigido → a falta é aplicada na hora (cartão + pênalti) e a revisão só congela antes;
  - gol anulado → placar −1, `goalDisallowed` (Statistics desfaz gol, assistência, gol de cabeça/bola parada e tira
    do `goalLog`; PlayerRating desfaz +1,5/+1,0), tiro livre de impedimento no ponto do impedido;
  - vermelho errado corrigido → amarelo (nunca chega a tirar o jogador); vermelho não dado corrigido → vermelho.
- Eventos: `refereeError { kind, team (o prejudicado), playerId, corrected }`, `varCheck`, `varReview { kind, outcome,
  against }`, `goalDisallowed`. Debug: categoria `var`. `GameState.refereeErrors`/`varReviews` guardam a lista.
- **quickSim:** sem lance; `quickVarStats` sorteia erros e revisões por Poisson num fluxo próprio (`var:<fixtureId>`),
  só estatística — placar, eventos e o `rng` da partida intocados (teste pareado).

## Reclamação do técnico (partida ao vivo, só o clube do jogador)

- Botão **Reclamar** por `COMPLAINT_WINDOW` 6 s reais depois de um lance contra o time (falta marcada contra, cartão,
  pênalti contra, impedimento contra, revisão do VAR contra); uma reclamação por lance; só com árbitro.
- `resolveComplaint`: vermelho `0,02 × (1 + n)`, amarelo `0,20 × (1 + 0,6 n) × (1 + 0,3 s)` (amarelo com amarelo =
  vermelho); sem cartão, 15% de chance de `refereeBias` (+0,25 de rigor nas faltas/cartões do adversário até o fim) e
  +1 de moral no elenco uma vez por jogo (`complaintMorale` na gravação → `afterManagerComplaint`).
- Cartão: amarelo = diretoria −1, vermelho = diretoria −3 (`applyManagerCard`), técnico expulso: sem tática,
  mentalidade nem substituições (o auxiliar troca pela regra da IA, `GameState.autoSubs.A`), cartão sobre a cabeça do
  técnico desenhado (`PixiPitch coachCard`), que some depois.
- Suspensão `SaveMeta.managerBan { matches, since }`: 1 jogo, 2 se o vermelho veio da 3ª reclamação ou mais
  (`banMatches`). Gravada pelo avanço do dia a partir de `PlayedMatchRecording.managerCards` (`sanitizeManagerCards`),
  com inbox `discipline`/`manager_banned` (tópico `injuries`, tema clube). Cada partida oficial do clube cumpre 1 jogo
  (`nextManagerBan`; a do próprio vermelho não conta). No jogo suspenso: `match-setup.managerBanned`, prévia com aviso,
  partida com "Técnico suspenso" e o auxiliar fazendo as trocas.
- Técnicos da IA não reclamam.

## Telas

- Partida ao vivo: aviso "VAR: checando…" e a decisão; linhas no Resumo (`varConfirmed`, `varOverturned`,
  `goalDisallowed`, `managerYellow`, `managerRed`); botão Reclamar ao lado da mentalidade.
- Prévia: selo "Com VAR" no árbitro; aviso de suspensão. Resultado: "VAR: N revisões, M decisões alteradas".
- Estatísticas → Árbitros: colunas Erros/J e VAR (revisões e, entre parênteses, as alteradas). `MatchEvent.var` e
  `RefereeCompStats.errors/reviews/overturned`.
- i18n `var.*`, `complaint.*`, `referees.errors*`, `referees.reviews*`, `inbox.categories.discipline`.

## `/test`, `/lab`, MCP

- `/test`: "Ref error" (off · auto · cada tipo forçado na próxima oportunidade; com VAR o erro forçado é sempre
  corrigido, salvo o impedimento, que segue a chance normal quando vira gol), botão VAR, "Complain A" (resultado no log `var`), cenário `var-penalty`; `EnergyPanel` com qualidade,
  multiplicador de erro, VAR, viés e erro forçado.
- `/lab`: `Variant.refereeQuality` e `Variant.var` (variante A vale para o jogo) → `TeamRawStats.refereeErrors /
  varReviews / varOverturned` (totais do jogo nos dois lados) → `avgRefereeErrors/avgVarReviews/avgVarOverturned` no
  `PairDetail`.
- MCP `summary`: `referee`, `varReview`, `refereeBias`, `refereeErrors`.

## Medições (`scripts/var-measure.ts`)

Spec §11 (2026-10-11). M1 (Premier + Championship, 800 jogos por braço, árbitro médio): **0,26–0,32 erro/jogo**;
gols +3,7%, pênaltis +1,5% (sem VAR), cartões ±6%; com VAR 0,15 corrigido e 0,22 revisão por jogo, sobrevivem 0,03
erros que não sejam impedimento sem gol. M2: qualidade 20 erra 2,0× a 90. M3: reclamando 1×/jogo ≈ 0,75 suspensão por
temporada. quickSim pareado: placar idêntico em 2000/2000.

## Testes e smoke

```
bun test src/GameEngine/Domain/Var.test.ts src/GameEngine/Domain/Var.engine.test.ts src/Domain/referees \
  src/Domain/advanceDay/quickSim.test.ts src/backend/var.advanceDay.test.ts
```

`scripts/season-rollover-smoke.ts`, seção "VAR": erros acontecem; números do VAR só com árbitro; revisões só em
fixtures com VAR; gol anulado nunca no placar; suspensão forçada aparece no `match-setup` e é cumprida pelo jogo do dia.

## Limitações

- Sem impedimento marcado errado, gol com falta no lance ou mão; o VAR nunca erra.
- Impedimento não marcado só na bola em passe normal e na bola solta (não na disputa aérea).
- O quickSim não muda placar por erro de árbitro.
- Recarregar a página no meio da partida perde as reclamações e cartões do técnico daquele jogo (a expulsão em si fica
  no estado da partida: o auxiliar continua trocando).
- Técnicos da IA não reclamam nem são expulsos.
