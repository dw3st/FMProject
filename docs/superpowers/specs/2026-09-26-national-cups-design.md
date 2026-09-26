# Copas nacionais (mata-mata) — Design

Data: 2026-09-26. Status: aprovado pelo usuário. Etapa 1 do `docs/ROADMAP.md` (1.1 Copas nacionais +
issue #5).

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Alcance | Uma copa por país, **todos os países** (incluindo países de uma liga só) |
| Formato | **Jogo único** em todas as fases; mando do clube de nível mais baixo (mesmo nível: sorteio); **final em campo neutro** |
| Desempate | **Prorrogação (2 × 15) + pênaltis no motor**; o quickSim faz o equivalente resumido |
| Participantes | **Todos os clubes do país**; fase preliminar para os níveis mais baixos quando N não é potência de 2 |
| Arquitetura | Copa é uma competição na **mesma estrutura das ligas** (`saves/{id}/leagues/cup_<país>/`) com `kind: "cup"`; sorteio **fase a fase**; datas fixadas no início da temporada |

## 1. Dados e geração

### Identidade

- Slug: `cup_<país>` — nome do país do `leagueData` normalizado (minúsculas, sem acento, espaços → `_`),
  ex.: `cup_england`, `cup_brazil`.
- Nome: tabela fixa para Inglaterra (FA Cup), Brasil (Copa do Brasil), Espanha (Copa del Rey),
  Alemanha (DFB-Pokal), Itália (Coppa Italia), França (Coupe de France). Demais: chave i18n
  `cups.genericName` = "Copa de {país}" / "{country} Cup" (en, pt-BR). `competitionName` passa a
  resolver slugs `cup_*`.

### Armazenamento

- Mesma pasta e arquivos de uma liga: `leagues/cup_<país>/meta.json`, `rounds/{n}.json`,
  `date-index.json`. Sem `standings.json`.
- `LeagueSeasonMeta` ganha `kind?: "league" | "cup"` (ausente = liga) e, para copa:
  `cup: { country, stages: CupStage[], championId: string | null }`, com
  `CupStage { round, name, date, entrants: string[], drawn: boolean }`.
  `name` é a chave da fase (`preliminary`, `r128`, …, `r16`, `qf`, `sf`, `final`).
- `Fixture` ganha `decider?: { extraTime: { home, away }; penalties?: { home, away } }` — `extraTime` é o
  placar só da prorrogação; `result` guarda o placar oficial (90 + prorrogação). `neutral?: boolean`
  marca a final.
- Sem migração de saves antigos (protótipo): um save sem copas simplesmente não tem copas.

### Geração (pura, `src/Domain/cups/`)

`generateCup(country, clubs: {id, tier}[], window: {start, end}, busyDates: Set<string>, seed)`:

1. `N` = número de clubes; `F = ceil(log2(N))` fases; se `N` não é potência de 2, a fase 1 é
   `preliminary` com `2 × (N − 2^(F−1))` clubes — os de **nível mais baixo** (desempate por id);
   os demais entram direto na fase 2. Se `N` é potência de 2, não há preliminar.
2. Datas: as `F` fases são distribuídas por igual em `[start, end − 7 dias]`, cada uma na
   **quarta-feira** mais próxima; `busyDates` = datas em que algum clube do país joga pela liga. Se a
   data ou o dia anterior está em `busyDates`, avança um dia até achar data livre (máx. 3 dias,
   depois recua). Datas estritamente crescentes, com pelo menos 3 dias entre fases.
3. Sorteio da fase 1 imediato (`drawStage`): pares aleatórios com RNG semeado por
   `save + temporada + país + fase`; mando = clube de nível mais baixo, mesmo nível = sorteio;
   final `neutral: true`.

`drawStage(stage, winners, seed)` sorteia as fases seguintes com as mesmas regras.

### Ciclo de vida

- **Carreira nova** (`createSave`): gera as copas de todos os países junto com as ligas, com a janela
  das ligas do país.
- **Avanço do dia:** no dia seguinte à data de uma fase (todos os jogos dela jogados), sorteia a
  próxima fase entre os vencedores e grava a rodada + `date-index`. Depois da final grava
  `championId`.
- **Virada do país** (`advanceDay`, depois do calendário novo das ligas): arquiva a copa encerrada em
  `seasons/{ano}/cup_<país>/` e gera a copa nova com a composição nova.
- As copas **não** entram nas regras de virada/encerramento de ligas (`activeLeagues` marca `kind`,
  e `findDueRollovers`/`endedLeagues` ignoram copas).
- **Ano civil:** janela começa em 02-05, igual às ligas — nenhuma fase no passado numa carreira nova.
- **Start kits:** `KitWorld`/`buildKitWorld`/`applyKit` incluem as copas; os kits são regenerados.

## 2. Motor: prorrogação e pênaltis

- Configuração da partida ganha `knockout?: boolean` (padrão `false` — ligas inalteradas).
- `MatchPhase` += `extraTimeBreak`, `extraTimeFirst`, `extraTimeSecond`, `penalties`.
- Partida `knockout` empatada ao fim do `secondHalf` → prorrogação 2 × 15 min no mesmo relógio
  comprimido, com troca de lado, pontapé inicial e acréscimo 0–2 min. Gols e estatísticas normais.
- Empate ao fim da prorrogação → `penalties`.
- **`resolvePenaltyShootout(sideA, sideB, rng)`** (pura, `ActionOutcomes.ts`), usada por motor e
  quickSim:
  - batedores: jogadores em campo por `finishing` decrescente, goleiro por último; repete a ordem;
  - 5 cobranças alternadas com parada antecipada; depois alternadas até a decisão;
  - chance = `clamp(PEN_BASE × shooterEffect × gkPenaltyEffect, 0.55, 0.92)`, `PEN_BASE ≈ 0.76`
    (calibrado para ~75% com times médios); constantes em `Configs/PenaltyConfig.ts`;
  - retorna `{ kicks: {takerId, gkId, scored}[], score: {A, B}, winner }`.
- No motor a fase `penalties` reproduz `kicks` um a um (evento `penaltyKick` a cada ~1,5 s real) e
  termina com `matchEnd`. O `decider` sai no resultado da partida.
- **quickSim** `knockout`: empate → prorrogação com xG × 30/90 → pênaltis com os 11 titulares.
- **Estatísticas** (`Statistics.ts`, via `gameBus`): por time `extraTimePlayed`, `penaltiesTaken`,
  `penaltiesScored`, `shootoutWon`; por jogador `penaltiesTaken`, `penaltiesScored`. A disputa não
  conta como gol nem mexe na nota.
- **`/test`:** cenário `knockout-draw-90` (começa aos 90' empatado); painel de debug com placar e chance
  de cada cobrança; botão "QuickSim knockout".
- **`/lab`:** opção de partida mata-mata no cenário; `TeamRawStats`, agregação, `PerMatchView`,
  `VariantSummary` e `PairDetail` com prorrogações, disputas vencidas e aproveitamento de pênaltis.

## 3. Avanço do dia e UI

- `getActiveRoundsForDate` já encontra os jogos de copa. Modo: partida do clube do jogador e toda a
  copa do país do jogador no motor completo; copas de outros países no quickSim.
- A partida gravada do jogador passa a ser aceita também para a copa do país dele.
- Pós-jogo igual ao da liga; `seasonLog` separa `league`, `cup` e total.
- Próximo jogo (`useAdvanceDay`, `advance-until`, `match-setup`, prévia) lê liga + copa do país.
- `MatchScreen`: indicação "Prorrogação" no placar; disputa cobrança a cobrança (bolinhas verde/
  vermelha por time).
- Tela `/cups/:country`: chaveamento por fase com resultados ("pên. 4–3"), próximos confrontos,
  campeão; seletor com a copa do país do jogador primeiro. Link no menu de competições.
- Resumo do dia e barra lateral usam `competitionName`.
- Inbox, categoria `cup`: sorteio com o adversário do jogador, eliminação, título.
- i18n en e pt-BR para tudo acima.

## 4. Issue #5 e verificação

- `importOpenFootball` recusa rodar se `src/Data/roles.json` difere de `src/example_data/roles.json`
  (mesma checagem do `importEspn`); doc da cadeia manda sincronizar antes.
- Reports: media type comparado exatamente (`application/json`, parâmetros permitidos) e `gameDate`
  validado como data real.
- Testes unitários: geração (N potência de 2 ou não, preliminar, mando, datas sem choque, determinismo),
  sorteio de fase, `resolvePenaltyShootout` (parada antecipada, alternadas, ~75% em 10 mil disputas),
  partida `knockout` do motor nunca termina empatada, quickSim `knockout`.
- `season-rollover-smoke`: toda copa com campeão, copa nova gerada na virada, nenhum jogo de copa no
  passado sem jogar, nenhum clube com dois jogos no mesmo dia.
- Navegador: carreira na Premier League até um jogo de copa; cenário de teste com prorrogação e
  pênaltis; chaveamento, inbox e resumo do dia.
- Regenerar start kits, `bunx tsc --noEmit -p .`, `bun test`, merge, deploy.

## Fora desta etapa

Prêmios e bilheteria da copa (Etapa 3), vaga continental do campeão (Etapa 2), rotação de reservas na
copa (Etapa 6), ida e volta / formatos reais por país.
