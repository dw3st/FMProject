# Árbitros: quadro, escala, rigor e rosto

Spec: `docs/superpowers/specs/2026-10-09-referees-design.md` (decisões do usuário de 2026-10-09 no §10). Etapa 38b do
`docs/ROADMAP.md`, versão **4.17**. A Etapa 39 (VAR) vai usar a escala e a qualidade daqui. Visual: `ui-standard.md`.

## Regra

- Cada país com liga tem um **quadro de árbitros** e um **quadro de assistentes** (`saves/{id}/referees/pool.json`),
  criado no `createSave` e renovado na virada de cada país.
- **Reais só nos 10 países das ligas principais** (`LEAGUES` de `scripts/faces/wikidata.ts`: Inglaterra, Espanha,
  Alemanha, Itália, França, Brasil, Portugal, Holanda, Argentina, EUA): árbitros do Wikidata (CC0), homens e mulheres,
  27–50 anos em 2027, até 24 por país; o P27 Reino Unido conta como Inglaterra (escoceses, galeses). O resto do quadro
  (e todos os outros países) é **gerado** do livro de nomes da comissão do próprio país (`staffNameBook`; sem o livro,
  `staffNames.ts`), só homens (o livro não tem nomes femininos). Assistentes reais quase não existem no Wikidata.
- **Rigor** s ∈ [−1, 1], fixo na carreira: **real** para quem tem os cartões da carreira no Transfermarkt (≥ 20 jogos,
  relativo ao país, spec §1.3), **sorteado** pelo id para os demais (triangular, média 0, `strictnessOf`). Só o valor
  derivado está no repositório (`src/example_data/referees.json`); os cartões crus ficam no cache local.
- **Qualidade** 0..100 (fama no Wikidata, FIFA, idade; gerados 15–55) só decide a escala. Nenhum efeito de partida.
- **Escala** por dia (`state.json`), determinística: continentais primeiro (árbitro de outro país do continente,
  FIFA ou qualidade ≥ 75, assistentes do país dele), depois cada país, o jogo mais importante com o melhor disponível
  (ruído ±6); descanso mínimo de 3 dias, o mesmo árbitro não apita um clube que ele apitou nos últimos 3 jogos
  (relaxado na falta: primeiro o rodízio, depois o descanso; nunca duas vezes no dia). **Base sem árbitro.**
- Save sem `referees/` (antigo): partidas sem árbitro (s = 0). Sem migração.

## Arquivos

| Arquivo | Papel |
|---|---|
| `scripts/fetchWikidataReferees.ts`, `scripts/wikidata/refereesSource.ts` (+ teste) | Busca no Wikidata → `data_process/wikidata/referees.json` |
| `scripts/fetchTransfermarktReferees.ts` | Cartões da carreira (página de perfil do Transfermarkt, cache gitignored) → rigor real; grava `src/example_data/referees.json` (sem o ID do Transfermarkt) |
| `src/types/refereeTypes.ts` | `Referee`, `RefereePool`, `RefereeState`, `RefereeAssignment`, `RefereeSeasonStats`, `RefereeSeasonArchive`, `MatchReferee`, `EngineReferee` |
| `src/Domain/referees/refereeConfig.ts` | Constantes (`REFEREE`) |
| `src/Domain/referees/strictness.ts` (+ teste) | `strictnessOf`, `refereeFoulMult` / `refereeYellowMult` / `refereeRedMult`, `strictnessBand` |
| `src/Domain/referees/pool.ts` (+ teste) | Tamanho, reais, gerados, qualidade, renovação |
| `src/Domain/referees/assign.ts` (+ teste) | `matchImportance`, `assignDay`, `fixtureKey` |
| `src/Domain/referees/stats.ts` (+ teste) | `recordMatches` (idempotente por partida), `pruneRefereeState`, `closeCountrySeason`, `refereeRows` |
| `src/backend/refereeWorld.ts` | E/S: `createRefereePool`, `ensureAssignments`, `ensureTomorrow`, `officialsFor`, `recordRefereeDay`, `rolloverReferees` |
| `src/backend/refereeRoutes.ts` | `GET /api/saves/:id/referees`, bloco `referee` do `match-setup` |
| `src/backend/dal/*`, `SaveService.ts` | `referees/pool.json`, `state.json`, `seasons/<país>-<temporada>.json` (bufferizados, fase 1) |
| `src/backend/advanceDay.ts` | Escala do dia antes dos jogos, árbitro no log, estatísticas, virada por país, escala de amanhã |
| `src/GameEngine/Domain/Fouls.ts`, `gameState.ts` (`withReferee`), `SimulateMatch.ts` | Rigor no motor |
| `src/Domain/advanceDay/quickSim.ts` | Rigor no quickSim (`refereeStrictness`) |
| `src/GameInterface/Referees/*` | `RefereeBadge`, `RefereeFace`, `RefereeBandLabel`, `RefereesTab` |
| `src/GraficsEngine/touchlineRender.ts`, `PixiPitch.tsx` | Rosto do árbitro e dos assistentes no campo |
| `scripts/referee-measure.ts`, `scripts/referee-schedule.ts` | Medições M1–M3 |

## Tamanho do quadro

`partidas por rodada` = soma de ⌊clubes / 2⌋ das ligas do país (índice de squads do save);
`árbitros = max(10, ⌈1,5 × partidas⌉)`, `assistentes = 2 × árbitros`. Reais primeiro (melhores pela qualidade).

## Efeito

| Onde | Fórmula (s = 0 / ausente = exatamente o jogo de antes) |
|---|---|
| Motor, chance de falta (`foulChance`) | × (1 + 0,08 s) |
| Motor, amarelo / vermelho direto por falta (`cardRoll`) | × (1 + 0,15 s) / × (1 + 0,25 s), ÷ `CARD_NORM` (1,01) com s ≠ 0 |
| quickSim (`rollDiscipline`) | faltas do lado e `PENALTIES_PER_SIDE` × (1 + 0,08 s); amarelo e vermelho direto como o motor. O placar nunca muda |

O pênalti sai das faltas na área, então também sobe com o rigor no motor. Nenhum sorteio novo. `GameState.referee`
(`{ id, name, country, strictness }`) entra no snapshot de debug; logs `foul`/`card` com `refMult`. O rigor nunca vai
para o day log (`MatchEvent.referee = { id, name, country }`) nem para as telas (só a faixa); o `match-setup` manda
o número porque a partida ao vivo roda no cliente.

**Faixas** (`strictnessBand`): Tolerante s ≤ −0,35, Rigoroso s ≥ 0,35, Equilibrado no meio.

## Importância (`matchImportance`)

Liga `100 − 25 × (nível − 1) + 15 (os dois na metade de cima) + 10 (última quinta parte da temporada)`; copa
`60 + 8 × fases desde a primeira (até 6) − 20 × (nível do clube mais alto − 1)`; continental `120 + 10 × fase`.
Desvio do spec: o bônus de clássico (`isDerby`) ficou de fora (exigiria ler as cidades de todos os elencos do dia).

## Telas

- **Prévia:** bloco "Árbitro" abaixo das informações: rosto 48px, nome, bandeira, faixa e, com jogos, "N jogos · X
  amarelos/jogo"; os assistentes em texto. Substitui o nome cosmético antigo (`matchWeather.refereeFor`, removido).
- **Partida ao vivo:** linha do árbitro no Resumo (rosto 32px, nome, bandeira); no campo, rosto no árbitro e nos
  bandeirinhas (`PixiPitch` `officials = { refereeFace, assistantFaces }`; `true` = sem rosto). Rosto:
  `refereeFaceUrl` (rota `GET /api/faces/person/:id.svg`, camisa preta com gola amarela, idade real; `g=f` = rosto
  feminino do `facesjs`).
- **Resultado e resumo do dia:** "Árbitro: nome" com a bandeira (do day log).
- **Estatísticas → Árbitros** (`?tab=referees`): competição (o seletor das outras abas) e temporada (a atual ou um
  arquivo); tabela `StatsTable`: rosto, nome, bandeira, faixa, J, faltas/J, amarelos/J (destacada), vermelhos,
  pênaltis; o árbitro do próximo jogo do clube destacado. i18n `referees.*`, `statsScreen.referees.tab`.

## Rotas

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/referees?competition=<slug\|all>&season=<rótulo>` | Dono do save. `{ season, seasons, items, nextRefereeId }`; 400 competição/temporada inválida, 404 sem árbitros ou temporada sem arquivo. Nunca o rigor cru |
| `POST /api/match-setup` | `referee: { id, name, country, gender, age, band, fifa, season?, strictness, assistants } \| null` (a escala que o avanço do dia vai usar, calculada sob `withSaveLock`) |

## `/test`, `/lab`

- `/test`: seletor "Referee" (Off · Lenient −1 · −0,5 · 0 · +0,5 · Strict +1; Off mantém o árbitro do cenário);
  cabeçalho do `EnergyPanel` com `ref s · foul × · yellow ×`; `refMult` nos logs; cenário `strict-referee` (s = +1); o
  painel QuickSim recebe o rigor; com Officials ligado, o árbitro de teste tem rosto.
- `/lab`: `Variant.refereeStrictness` (slider −1..1, a da variante A vale para o jogo), rótulo `· ref ±N`,
  `TeamRawStats.refereeStrictness` → `avgRefereeStrictness` → linha "Referee" no `PairDetail`.
- `Statistics.ts`: nada novo (faltas e cartões já existem; as estatísticas por árbitro são agregadas no servidor).

## Medições

Ver a spec §7 (tabelas M1–M3 de 2026-10-09). Resultados em §11:

- **M1** (motor, Premier + Championship, 2 sementes, 2 400 jogos por braço, mundo da 4.16): faltas +0,3%, amarelos +0,6%,
  vermelhos +13% (~200 eventos, ruído ±14%), pênaltis −0,6%, gols +0,9%; quickSim pareado com `CARD_NORM` 1,01: faltas
  −0,2%, amarelos −0,4%, vermelhos +0,3%.
- **M2** (mesmo clube, 400 jogos): ±0,75 amarelos ×1,31, faltas ×1,06; ±1 amarelos ×1,55, faltas ×1,07.
- **M3** (escala de 365 dias): nenhum árbitro duas vezes no dia, descanso relaxado em 0,9% das escalas, maior sequência
  com um clube 2, 49% dos jogos da 1ª divisão com os 25% melhores, continental 0 do país dos clubes; 10,6% do quadro
  (os de menor qualidade) não apita.
- **Custo do dia** (`bench-advance-day.ts --buffered`): +1,4% sem o motor completo, +0,8% com ele.

## Testes e smoke

```
bun test scripts/wikidata/refereesSource.test.ts src/Domain/referees src/GameEngine/Domain/Fouls.test.ts \
  src/GameEngine/Domain/Referee.engine.test.ts src/Domain/advanceDay/quickSim.test.ts \
  src/backend/referees.advanceDay.test.ts src/backend/faces.test.ts src/lab
```

`scripts/season-rollover-smoke.ts`, seção "Árbitros": toda partida de liga/copa/continental do log com árbitro, nenhuma
de base; nenhum árbitro duas vezes no dia; continental sempre de outro país; estatísticas (estado + arquivos) = cartões
dos logs; o árbitro do jogo do clube do jogador = a escala da véspera; o quadro de cada país virado completo e sem
ninguém com 51+.

## Limitações

- Rigor real só nas 10 ligas principais e para quem tem ≥ 20 jogos no Transfermarkt; é a carreira inteira, relativa ao
  país. Sem categoria nacional (só fama e FIFA).
- Gerados só homens; árbitras só as reais.
- Sem erro do juiz, VAR ou reclamação (Etapa 39); a qualidade não muda a partida. O mesmo rigor para os dois lados.
- Torneios de base sem árbitro. Uniforme sempre preto.
- O cache local do Transfermarkt vem da página de perfil (a API local não tem rota de árbitro).
