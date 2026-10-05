# Equipe técnica (Staff)

Spec: `docs/superpowers/specs/2026-10-01-staff-design.md`. Etapa 10 do `docs/ROADMAP.md`, versão **2.2**.
Visual: `.claude/rules/ui-standard.md`.

## Regra

- Três funções no clube, um profissional por função, nota 1..10:
  - **Auxiliar técnico** (`assistant`): multiplica os pontos de desenvolvimento (DP).
  - **Preparador físico** (`fitness`): multiplica a recuperação diária de fôlego e o risco de lesão.
  - **Olheiro-chefe** (`scout`): incerteza do que o jogador vê de atletas de fora do próprio elenco.
- **Só o clube do jogador simula staff** (`Squad.staff`). Clubes da IA não gravam nada e usam a nota
  implícita do tier (`STAFF.IMPLIED_RATING`: LOW 4, MEDIUM 5, HIGH 6, ELITE 7), no espírito de
  `.claude/rules/AI-clubs/finance.md` (regras, não simulação). `Squad.staff` presente com a função
  ausente = vaga = efeito de **nota 3**.
- Sem multa, sem duração de contrato, sem migração de save (protótipo).

Os efeitos do centro de treinamento (`.claude/rules/game/facilities.md`) se multiplicam aos do staff
(recuperação, lesão de treino, DP do treino), com a mesma regra de nível implícito para a IA.

## Efeitos (`src/Domain/staff/staffConfig.ts`)

Curva linear por partes passando por `[nota 1, nota 5, nota 10]`; a nota 5 é sempre exatamente neutra.

| Efeito | nota 1 | nota 5 | nota 10 |
|---|---|---|---|
| DP (auxiliar) | x0,90 | x1,00 | x1,15 |
| Recuperação de fôlego (físico) | x0,95 | x1,00 | x1,10 |
| Risco de lesão (físico) | x1,10 | x1,00 | x0,85 |
| Incerteza dos atributos (olheiro) | +/-1,5 | +/-0,6 | 0 |

`staffEffectsOf(squad)` devolve os quatro números (`devMult`, `recoveryMult`, `injuryMult`,
`scoutNoise`) e é a única porta de entrada: quem tem `squad.staff` usa a nota contratada, os demais o
tier.

## Onde entra

| Efeito | Onde |
|---|---|
| DP | `applyDevelopment(player, rating, weights, dpMult)` (pós-jogo, `matches.ts`) e `applyTrainingDevelopment(..., dpMult)` (`dailyTraining.ts`) |
| Recuperação | `recoverDay(..., { recoveryMult })`, `applyMatchFitness(..., { recoveryMult })` (`matches.ts`, `dailyRest.ts`, `dailyTraining.ts`, `lab/fitnessCarry.ts`) |
| Lesão, motor | `InjuryFactors.staffMult` (multiplica o produto dos fatores em `injuryRatePerMinute`/`contactInjuryChance`); `GamePlayer.injuryMult`, preenchido por `createMatchState(..., injuryMult: { A, B })`; `simulateMatch` deriva dos dois elencos (`options.injuryMult` sobrescreve); `MatchScreen`/`TestScreen` também passam |
| Lesão, quickSim | `rollSideInjuries(..., staffMult)` com `staffEffectsOf(input.home/away).injuryMult` |
| Lesão, treino | `trainingInjuryChance(intensity, injuryMult)` |
| Olheiro | `obscurePlayer`/`obscureSquad` (ruído determinístico por hash `save:jogador:atributo`, amplitude = `scoutNoise`, limitado a 0..10). Aplicado só nas respostas de tela: `scout-search` (`avgRange` quando a incerteza >= 0,5) e `GET /squad/:league/:club?scouted=1` (tela do elenco e ficha do jogador). **O motor e o avanço de dia nunca recebem valores com ruído**; o próprio elenco é sempre exato |

## Contratação e custo

- `createSave` dá ao clube do jogador três profissionais com nota no tier implícito +/-1
  (`initialStaff`, determinístico pelo id do save). `applyRandomStartKit` restaura o `staff` depois do
  kit (mesmo motivo do orçamento: o kit não conhece o jogador).
- Mercado: `GET /api/saves/:id/staff/market` -> 5 candidatos por função (notas 2..9), determinísticos
  por save + segunda-feira da semana (renova toda segunda). `POST /staff/hire { role, candidateId }`
  substitui o atual (o candidato precisa estar no mercado da semana); `POST /staff/fire { role }`
  deixa a função vaga. `GET /staff` devolve staff, efeitos e a folha semanal. Rotas em
  `src/backend/staffRoutes.ts`, protegidas por `requireSaveOwner` e `withSaveLock`.
- Salário: `staffWeeklyWage(nota, fator do clube)` = curva de jogador de nota `3 + 0,35 * nota`,
  vezes o `wageFactor` do clube, vezes `WAGE_SHARE` (0,5). **Calculado com o fator atual do clube**
  a cada segunda (a folha acompanha o crescimento do clube), nunca congelado na contratação.
  Lançado no extrato como `kind: "staff"` junto com `wages`/`operational`
  (`computeAdvanceDayMoney`); só existe quando há staff com salário.

## Telas

- `/staff` (`StaffScreen.tsx`): título "Equipe técnica"; três cartões (função, nome, nota em barra,
  salário, efeito, Demitir com confirmação) e "Mercado" com abas por função.
- `FinancesScreen`: tipo "Equipe técnica" nas despesas, na projeção semanal e nos filtros.
- Tabela do Olheiro (`ScoutTable`): `AvgBadge` mostra `baixo-alto` quando `avgRange` existe.

## `/test`, `/lab`

- `/lab`: `Variant.staffRating?: number` (slider "Fitness coach" no `VariantEditor`) -> `withFitnessCoach`
  aplica ao elenco, afetando lesões (motor e quickSim) e a recuperação entre os jogos da congestão.
  Ausente = staff implícito do tier. `PairDetail` já mostra lesões e fôlego.
- `/test`: o `EnergyPanel` mostra, por time, `recovery x / injury x` do staff, e a partida do `/test`
  usa o mesmo multiplicador de lesão. Os elencos do `/test` não têm finanças, então valem o tier LOW.
- Nenhuma estatística nova em `Statistics.ts`: lesões e fôlego já existem.

## Efeito no volume de lesões

Com staff implícito por tier (IA) o multiplicador médio fica perto de 1 (LOW 1,03 .. ELITE 0,94). O
smoke de temporada confere 0,15..0,5 lesões por partida (`.claude/rules/game/injuries.md`).

## Testes

```
bun test src/Domain/staff src/backend/staff.routes.test.ts src/lab src/Domain/finance \
  src/Domain/advanceDay src/Domain/fitness src/Domain/injury
```

Cobrem: as pontas e o neutro de cada efeito, vaga = nota 3, tier implícito, determinismo da geração e
do mercado (renova na segunda), ruído do olheiro (zero = exato, determinístico, limitado), os
multiplicadores nas funções puras (recuperação, lesão, DP), rotas (dono do save, função válida,
candidato fora do mercado, contratar/demitir, linha `staff` do extrato toda segunda).
`scripts/season-rollover-smoke.ts` tem a seção "Equipe técnica": o clube do jogador termina com as 3
funções, nenhum clube da IA grava staff, e há uma linha `staff` em toda segunda com `wages`.

## Personalidade (Etapa 26)

`obscurePlayer` também grava `personalityView` (traços ± ruído × 4, temperamento e profissionalismo "?" com ruído
≥ 1). Ver `.claude/rules/game/personality.md`.
