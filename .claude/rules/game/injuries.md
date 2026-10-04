# Lesões

Spec: `docs/superpowers/specs/2026-09-28-injuries-design.md`. Plano:
`docs/superpowers/plans/2026-09-28-injuries.md`. Etapa 5 do `docs/ROADMAP.md`, versão **1.5**.

## Regra

- Todo jogador pode se lesionar: em partida (motor completo ou quickSim) e em treino pesado. A
  lógica pura (risco, gravidade, tempo fora, cura) mora em `src/Domain/injury/` — nenhum I/O ali,
  só valores de entrada e um `rng` injetado. O motor, o quickSim, o treino e o avanço do dia são os
  únicos que leem/gravam `player.injury` e `seasonLog.fitness`.
- Dado: `RosterPlayer.injury?: { severity: "light" | "medium" | "severe"; returnDate: string }`
  (`src/types/playerTypes.ts`). Ausente = saudável.
- Um jogador lesionado nunca é escalado — nem pela IA, nem pelo botão "auto", nem numa escalação
  salva do jogador (troca automática).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/Domain/injury/injuryConfig.ts` | Todas as constantes (`INJURY`) |
| `src/Domain/injury/injury.ts` (+ teste) | Funções puras: `injuryRatePerMinute`, `contactInjuryChance`, `trainingInjuryChance`, `rollSeverity`, `injuryDurationDays`/`returnDate`, `isInjured`, `clearHealed` |
| `src/GameEngine/Domain/gameState.ts` | Risco por minuto e por contato no motor, `forceInjurySubstitution`, evento `injury` |
| `src/GameEngine/types.ts` | `InjuryRecord`, `GamePlayer.age`/`strengthAttr`/`injuryLoad`, `GameState.injuries`, `MatchSubstitution.reason` |
| `src/GameEngine/Infrastructure/EventBus.ts` | Evento `injury` |
| `src/GameEngine/Domain/Statistics.ts` | Lesões por time (`TeamStats.injuries`) |
| `src/GameEngine/Support/TestCases.ts` | Cenário `injury-demo` (`/test`) |
| `src/Domain/advanceDay/quickSim.ts` | `rollSideInjuries` — lesões do quickSim (Poisson) |
| `src/Domain/advanceDay/matches.ts` | `finalizeSquadsAfterMatch` — grava `injury` com `returnDate` no pós-jogo, cura (`clearHealed`) antes de tudo |
| `src/Domain/advanceDay/dailyTraining.ts` | Lesão de treino pesado (`trainingInjuryChance`), cura do dia |
| `src/Domain/advanceDay/dailyRest.ts` | Cura (`clearHealed`) para quem descansa |
| `src/Domain/lineupHelpers.ts` | `filterEligiblePlayers`, `replaceUnavailableStarters` — nunca escala lesionado |
| `src/Domain/advanceDay/matchSimulationLineups.ts` | `resolveUserLineup`/`computeMatchSimulationLineups` — troca automática do titular lesionado, `injuredReplaced` |
| `src/Domain/inbox/inboxEvents.ts` + `src/types/inboxTypes.ts` | `buildInjuryMessage`, categoria `injury` (`kind: "injured" | "returned"`) |
| `src/backend/advanceDay.ts` | Junta as lesões do dia (partida + treino + volta) e emite a inbox do clube do jogador uma única vez, depois de tudo |
| `src/GameInterface/Dashboard/PlayerCard.tsx`, `SquadTable.tsx`, `SquadRosterTable.tsx` | Status "lesionado" + gravidade + dias para voltar |
| `src/GameInterface/FormationScreen.tsx` | Lesionado bloqueado na escalação, com aviso da data de volta |
| `src/GameInterface/MatchPreviewScreen.tsx` | Aviso das trocas automáticas (`injuredReplaced`) |
| `src/GameInterface/MatchScreen.tsx` | Notícia rápida na tela ao vivo (`gameBus.on("injury", ...)`) |
| `src/GameInterface/InboxScreen.tsx` | Renderiza a categoria `injury` |
| `scripts/injury-calibrate.ts` | Calibra `BASE`/`CONTACT_BASE` contra o motor e `QUICKSIM_CONTACT_SCALE` contra o quickSim |
| `scripts/season-rollover-smoke.ts` | Seção "Lesões" (ver abaixo) |
| `src/lab/types.ts`, `balanceWorker.ts`, `scenarioRunner.ts`, `components/PairDetail.tsx` | Lesões por jogo no `/lab` |

## 1. Modelo (`src/Domain/injury/injury.ts`)

### Risco por minuto

```
injuryRatePerMinute = BASE × fatorEnergia × fatorCarga × fatorIdade × fatorForça
```

Os quatro fatores são funções contínuas, cada uma 1 no valor de referência:

| Fator | Fórmula | Efeito |
|---|---|---|
| `energyInjuryFactor(energy)` | linear de 1 (energia 100) a `ENERGY_MAX_MULT` (2) em energia 0 | jogador cansado se machuca até 2× mais |
| `loadInjuryFactor(load)` | linear de 1 (carga 0) a `1 + LOAD_MAX_BONUS` (1,5) em `LOAD_HIGH` (220), saturado depois | carga alta (calendário apertado) soma até 50% |
| `ageInjuryFactor(age)` | 1 até `AGE_REF` (30 anos), linear até `AGE_MAX_MULT` (1,3) em `AGE_SATURATION` (40) | jogador acima de 30 corre mais risco |
| `strengthInjuryFactor(strength)` | 1 até `STRENGTH_REF` (5, meio da escala 0–10), linear até `1 − STRENGTH_MAX_REDUCTION` (0,8) em 10 | força alta protege até 20% |

`energy`/`load` vêm do modelo de fôlego (`.claude/rules/game/fitness.md` — `seasonLog.fitness`/
`.load`); `age`/`strength` são os do próprio jogador. `energyInjuryFactor`, `loadInjuryFactor`,
`ageInjuryFactor` e `strengthInjuryFactor` são exportadas individualmente (usadas isoladas em
teste) além da combinação em `injuryRatePerMinute`.

### Risco por contato

Cada desarme e cada duelo de bola solta soma um risco extra, para os **dois** jogadores
envolvidos, com a mesma escala pelos quatro fatores acima, mas uma base própria:

```
contactInjuryChance = CONTACT_BASE × fatorEnergia × fatorCarga × fatorIdade × fatorForça
```

### Treino

`trainingInjuryChance(intensity)`: só uma sessão pesada (`"heavy"`) tem chance (`HEAVY_TRAINING_CHANCE
= 0,01`, flat); leve/normal nunca lesionam.

### Gravidade e tempo fora

`rollSeverity(rng)` sorteia por `SEVERITY_WEIGHTS` (60% leve / 30% média / 10% grave).
`injuryDurationDays(severity, rng)` sorteia um inteiro uniforme dentro de `DURATION_DAYS[severity]`:

| Gravidade | Chance | Dias fora |
|---|---|---|
| `light` | 60% | 3–7 |
| `medium` | 30% | 7–28 |
| `severe` | 10% | 30–120 |

`returnDate(date, severity, rng)` soma a duração sorteada à data. `isInjured(player, date)` é
`true` enquanto `date < injury.returnDate` (estritamente antes — no dia exato da volta o jogador já
está apto). `clearHealed(player, date)` — pura, nunca muta — remove `injury` e ajusta
`seasonLog.fitness` para `RETURN_FITNESS` (70) quando `date >= returnDate`; devolve o mesmo objeto
(mesma referência) quando não há nada para curar.

## 2. No motor (`src/GameEngine/Domain/gameState.ts`)

- **Risco por minuto:** todo jogador em campo, a cada tick (pulado enquanto um passe/chute está no
  ar — `rollInMatchInjuries` só roda com a bola livre, porque remover/substituir um jogador no meio
  de uma jogada em andamento quebraria o estado), com `injuryFactorsOf(p) = { energy: p.energy,
  load: p.injuryLoad, age: p.age, strength: p.strengthAttr }`. `injuryLoad`/`age`/`strengthAttr`
  ficam fixos para a partida inteira (carregados na criação do `GamePlayer`, ver `types.ts`).
- **Risco por contato:** depois de um desarme resolvido ou de um duelo de bola solta de verdade
  (`rollContactInjuries(state, [idA, idB], minute)`) — os dois participantes rolam
  `contactInjuryChance` independentemente.
- **`forceInjurySubstitution(state, player, minute, severity)`:** grava um `InjuryRecord` em
  `state.injuries`, emite `gameBus.emit('injury', {...})` e `debugLog('injury', ...)`, e resolve a
  saída do jogador:
  - **Com reserva elegível da posição** (mesma escolha de `findBestBenchForRole` da troca por
    fadiga): substituição normal (`performSubstitution(..., 'injury')` — `MatchSubstitution.reason`
    distingue `'fatigue'` de `'injury'`).
  - **Sem reserva/sem trocas restantes:** `removeInjuredPlayer` — o time fica com 10 (ou menos),
    sem sacar ninguém do banco.
  - **Sem goleiro competente em campo** (o titular lesionado foi removido de vez sem GK no banco,
    ou um jogador de linha entrou no lugar do goleiro por falta de reserva próprio): toda saída de
    `forceInjurySubstitution` passa por `ensureCompetentGK(state, team)`, que garante um goleiro
    com pelo menos um piso de estatística (`withGkStatFloor`) — promove o jogador de linha mais
    próximo do próprio gol a GK (posição, `bounds` e stats reconstruídos do zero) quando não sobra
    goleiro nenhum, ou só aplica o piso de estatística no jogador que já assumiu a posição (a
    substituição normal força o papel do slot, mas mantém os stats de jogador de linha, todos
    zerados para GK) quando um GK-de-slot já existe mas nunca foi de fato construído como goleiro.
- **`InjuryRecord`** (`types.ts`): `{ playerId, playerRosterId, playerName, team, minute, severity,
  energy }` — `energy` é a energia no instante da lesão, necessária porque um jogador removido de
  vez (sem substituição) nunca aparece em `playerEnergy`/`substitutions`; é a única fonte para a
  energia final dele.
- **`GameState.injuries: InjuryRecord[]`** — todas as lesões da partida, em ordem cronológica.

## 3. quickSim (calibração)

`rollSideInjuries` (`src/Domain/advanceDay/quickSim.ts`) não tem banco nem substituição — todo
titular joga os minutos inteiros da partida (`minutesTotal`). O risco é modelado como uma Poisson
sobre esses minutos:

```
λ = injuryRatePerMinute(fatores) × minutosTotais
  + contactInjuryChance(fatores) × eventosDeContato × QUICKSIM_CONTACT_SCALE
lesão se samplePoisson(λ, rng) >= 1
```

`eventosDeContato = desarmes vencidos + tentativas de desarme falhas` — o quickSim não tem duelo de
bola solta e só enxerga o lado do desarmador de cada tentativa, então seu volume bruto de eventos de
contato é menor que o do motor (que soma desarmes + tentativas + duelos, dos dois lados). Por isso
`QUICKSIM_CONTACT_SCALE` escala `contactInjuryChance` de volta para cima, calibrado por
`scripts/injury-calibrate.ts --quicksim` para que o volume total de lesões/partida do quickSim fique
dentro de ±15% do motor.

### Números medidos (`scripts/injury-calibrate.ts`, Premier League + `of_championship`, ≥300 jogos)

| Cenário | lesões/partida (os dois times) |
|---|---|
| Motor, elenco fresco (energia 100, carga 0) — usado para calibrar `BASE`/`CONTACT_BASE`, staff implícito por tier (recalibrado na 2.3; antes 0,263 / 0,297 / 0,247 em três rodadas com as constantes antigas, média 0,269, antes de o staff existir 0,287) | **0,320** (alvo 0,3; ruído de 300 jogos ~ ±0,03) |
| Motor, fôlego realista de dia de jogo (energia 88, carga 100 — `--realistic`, só relatório, nunca recalibra) | **0,310** |
| quickSim (mesmos elencos) | **0,307** (-4,2% do motor) |

```
INJURY.BASE                  = 0.0000874
INJURY.CONTACT_BASE          = 0.002307
INJURY.QUICKSIM_CONTACT_SCALE = 2.3248935431401576  (≈ 2,32)
```

`BASE`/`CONTACT_BASE` foram escalados juntos, na mesma proporção (`scripts/injury-calibrate.ts`,
sem `--quicksim`/`--realistic`) até o motor com elenco fresco bater ~0,3/partida — um par de
iterações converge porque, para probabilidades pequenas, a taxa medida escala quase linear em cada
constante. `--realistic` é só um relatório de sanidade: mostra que um dia de calendário apertado de
verdade (fôlego/carga realistas, que podem levar o risco por minuto a até ~3× — ver a tabela de
fatores acima) não explode o alvo, mas nunca ajusta as constantes — a calibração principal isola de
propósito só idade/força usando um elenco fresco.

Rodar de novo depois de qualquer mudança no volume de desarmes/duelos ou na distribuição de minutos
de partida: `bun scripts/injury-calibrate.ts 150 --apply` (recalibra `BASE`/`CONTACT_BASE`), depois
`bun scripts/injury-calibrate.ts 150 --quicksim` (recalibra `QUICKSIM_CONTACT_SCALE` contra o valor
já recalibrado do motor).

## 4. Pós-jogo e treino diário

- **Pós-jogo** (`finalizeSquadsAfterMatch`, `src/Domain/advanceDay/matches.ts`): primeiro cura
  quem já passou da `returnDate` (`clearHealed`, antes de qualquer outra coisa — um jogador que
  volta hoje já joga esta partida sem `injury`, com o fôlego que `clearHealed` deixou, 70, ajustado
  em seguida pelo desgaste normal da partida). Depois, para cada `MatchInjury` recebida (motor ou
  quickSim), calcula a `returnDate` (`injuryReturnDate`) e grava `player.injury`.
  - `computeMinutesPlayed` recebe uma entrada sintética
    (`playerInId: "__injured_out_${playerId}"`) para todo jogador lesionado e **removido de vez**
    (sem substituição registrada) — sem isso, ele seria contado como tendo jogado a partida inteira
    em vez de parar no minuto da lesão.
- **Treino** (`buildTrainingEvent`, `src/Domain/advanceDay/dailyTraining.ts`): cura antes de decidir
  elegibilidade (um jogador que volta hoje já pode treinar/descansar normalmente no mesmo dia);
  jogador lesionado nunca treina (fica de fora da elegibilidade, como fôlego insuficiente — ver
  `.claude/rules/game/fitness.md`); sessão pesada rola `trainingInjuryChance`, e uma nova lesão é
  registrada como `NewTrainingInjury` (`{ playerId, playerName, severity, returnDate }`).
- **Descanso** (`dailyRest.ts`): também cura (`clearHealed`) quem passou da data — cobre o clube
  inteiro nos dias sem treino pesado ativo.
- **Inbox** (`src/backend/advanceDay.ts`): todas as lesões e curas do dia (partida + treino +
  volta) são empilhadas em `injuryInboxEvents` e emitidas **uma única vez**, depois de tudo mais no
  dia — mesmo padrão de outras categorias de inbox que podem coincidir com a virada de temporada
  (ver `.claude/rules/game/continental.md` → inbox). `buildInjuryMessage` (`inboxEvents.ts`) monta
  a mensagem: `kind: "injured"` (gravidade + previsão de volta) ou `kind: "returned"`.

## 5. Escalação

- `filterEligiblePlayers(players, date)` (`src/Domain/lineupHelpers.ts`) — usado por todo seletor
  automático (IA, botão "auto", adversário da prévia): filtra fora quem está `isInjured` na data.
- `replaceUnavailableStarters(slots, lineup, players, date)` — para uma escalação **salva** do
  jogador: troca todo titular lesionado na data pelo melhor reserva elegível do mesmo papel
  específico (ou do papel principal, se nenhum bater exatamente); um slot sem reserva elegível
  fica como está (melhor jogar com um lesionado do que com um slot vazio). Devolve
  `{ lineup, replaced: InjuredReplacement[] }`.
- `computeMatchSimulationLineups`/`resolveUserLineup` (`src/Domain/advanceDay/
  matchSimulationLineups.ts`) usam os dois acima, com `date` sempre passado — `userInjuredReplaced`
  chega até a prévia da partida (`MatchPreviewScreen.tsx`, `matchSetup.injuredReplaced`, aviso das
  trocas automáticas).
- `MatchScreen.tsx` filtra `!isInjured(p, matchDate)` no elenco inteiro (titulares e banco) antes
  de montar `createMatchState` — um lesionado nunca é candidato a substituto ao vivo.

### Limitações conhecidas

- **`pickForRole` (`src/GameEngine/Domain/gameState.ts`) ignora lesão.** É o preenchimento de
  fallback do `buildTeam()` do motor quando um slot não tem jogador definido — não passa por
  `filterEligiblePlayers`/`isInjured`. Na prática nunca é alcançado com um elenco normal, porque
  todo caminho real de montagem de XI (`resolveUserLineup`, os seletores da IA) já filtra os
  lesionados antes de chegar ao motor; documentado aqui porque é a única brecha teórica.
- **Sem linha do tempo da lesão na partida ao vivo.** O aviso em tela (`MatchScreen.tsx`, evento
  `injury`) é uma notificação de 4 segundos, sem histórico — não há um painel com todas as lesões
  da partida em ordem, só o log de debug (`/test`) e o resultado final (`GameState.injuries`).

## 6. Telas

- **Elenco** (`SquadRosterTable.tsx`, `Dashboard/PlayerCard.tsx`):
  status "lesionado" (`playerHelpers.ts` → `PlayerRow.status === "injured"`, já existia o
  indicador de fôlego/suspensão; ver `.claude/rules/game/fitness.md`), com gravidade (`sev{Light,
  Medium,Severe}`) e dias para voltar (`injury.daysLeft`, calculado por `daysBetween(currentDate,
  returnDate)` em `playerHelpers.ts`).
- **Formação** (`FormationScreen.tsx`): jogador lesionado não pode ser clicado/assinalado a um slot
  (`isInjured(player, currentDate)` bloqueia), com opacidade reduzida e um aviso da data de volta
  (`formations.injuredUntil`).
- **Prévia da partida** (`MatchPreviewScreen.tsx`): lista as trocas automáticas por lesão
  (`matchSetup.injuredReplaced`, `matchPreview.injuredReplaced`).
- **Partida ao vivo** (`MatchScreen.tsx`): notícia rápida de 4s no placar (`gameBus.on("injury",
  ...)` → `match.injuryNotice`/`match.injurySeverity.*`).
- **Inbox** (`InboxScreen.tsx`): categoria `injury`, `kind: "injured" | "returned"`.

## 7. `/test`

Cenário `injury-demo` (`TestCases.ts`): força uma lesão grave no primeiro jogador de linha do Time
A logo no início (`forceInjurySubstitution(base, target, 1, 'severe')`), para observar de imediato
a substituição forçada, o aviso em tela e a categoria `injury` do log de debug.

## 8. `/lab`

Lesões por jogo entram na comparação de variantes como qualquer outra estatística agregada:
`TeamRawStats.injuries` → `balanceWorker.ts`/`scenarioRunner.ts` somam por time → `PerMatchView`/
`VariantSummary.avgInjuries` → linha "Injuries" em `PairDetail.tsx`.

## 9. `Statistics.ts`

`TeamStats.injuries` conta o evento `injury` do barramento por time (`gameBus.on('injury', ...)`),
resetado a cada partida — mesmo padrão de `fatigueSubstitutions`/`extraTimePlayed` (ver
`.claude/rules/game/fitness.md`).

## 10. Testes

```
bun test src/Domain/injury src/GameEngine/Domain/Injury.engine.test.ts \
  src/Domain/advanceDay/dailyRest.test.ts src/Domain/advanceDay/dailyTraining.test.ts \
  src/Domain/advanceDay/matches.test.ts src/Domain/advanceDay/matchSimulationLineups.test.ts \
  src/Domain/advanceDay/quickSim.test.ts src/Domain/lineupHelpers.test.ts src/lab/fitnessCarry.test.ts
```

Cobrem: os quatro fatores de risco e a combinação, gravidade/duração/volta (`injury.test.ts`);
lesão no motor tirando o jogador de campo com substituição forçada, o caso sem reserva (10 em
campo) e a rede de segurança do goleiro (`Injury.engine.test.ts`); cura antes de elegibilidade no
treino/descanso; gravação de `injury`/`returnDate` no pós-jogo e o minuto sintético de saída;
`rollSideInjuries` do quickSim; os seletores de escalação nunca devolvendo um lesionado, e
`replaceUnavailableStarters` trocando o titular certo.

## 11. Smoke de temporada (`scripts/season-rollover-smoke.ts`, seção "Lesões")

Rodando junto da corrida normal de uma temporada inteira (mesma execução das demais seções — sem
flag própria; ver `.claude/rules/game/fitness.md` → "Smoke de temporada" para o mesmo padrão):

1. **Volume:** conta toda partida logada no dia (`SaveService.getDayLog`, qualquer liga, motor ou
   quickSim — `MatchEvent.injuries` sempre existe, mesmo vazio) e soma `injuries.length`; falha se
   a taxa agregada (lesões / partidas) ficar fora de 0,15–0,5 por partida.
2. **Ninguém lesionado escalado:** em todo dia de rodada da liga do jogador, lê o estado de lesão de
   cada jogador de cada clube envolvido (incluindo o clube do jogador) **antes** de
   `runBufferedDay` rodar — o mesmo instante que os seletores de escalação realmente enxergam.
   Depois do dia, confere no log do dia que nenhum jogador presente em `playerStats` de uma partida
   da liga do jogador estava marcado como lesionado nesse snapshot pré-dia.
3. **Cura acontece:** rastreia transições lesionado → saudável nos mesmos clubes lidos acima
   (marcados por `player.injury` presente numa leitura e ausente numa leitura seguinte); falha se
   nenhuma transição for observada na temporada inteira.
4. **Sem lesão vencida no fim:** ao final da corrida, nenhum `player.injury.returnDate` no mundo
   inteiro fica anterior ao `currentDate` final (checagem sobre todos os squads, reaproveitando a
   mesma listagem completa já usada pela seção de Finanças).

Rodar: `bun scripts/season-rollover-smoke.ts [--player-league <slug>] [--italy]` (~15 min).
