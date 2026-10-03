# Disciplina: suspensões, quickSim e tela ao vivo

Spec: `docs/superpowers/specs/2026-10-02-fouls-cards-design.md` (§3 fora de campo, §4 quickSim, §5).
Etapa 12, parte 2, versão **2.7**. A parte do motor (faltas, cartões em campo, pênalti, tiro livre)
está em `.claude/rules/game-engine/fouls.md`.

## Regra

- `RosterPlayer.suspension?: { matches }` — jogos de suspensão a cumprir. Ausente = disponível.
- `seasonLog.yellowCards` / `seasonLog.redCards` — cartões da temporada, **liga, copa e continental
  somados numa contagem só** (simplificação consciente). Um segundo amarelo soma 1 amarelo e 1
  vermelho (os registros do `MatchCard`).
- **Vermelho** (direto ou segundo amarelo) = 1 jogo. **A cada 5 amarelos** acumulados na temporada
  (5º, 10º, …) = 1 jogo. Os dois somam se acontecerem na mesma partida (raro: um segundo amarelo que
  também é o 5º amarelo).
- **Cumprimento:** toda partida oficial do clube (liga, copa, continental) desconta 1 jogo de todo
  jogador suspenso daquele clube, **antes** de aplicar os cartões da própria partida
  (`finalizeSquadsAfterMatch`, os dois clubes). Um suspenso nunca joga, então não há caso de
  "jogou suspenso".
- **Virada:** o `seasonLog` zera, então o acúmulo de amarelos recomeça; a suspensão fica no jogador
  e passa para a temporada seguinte (e acompanha transferência/saída livre).
- Sem migração (protótipo): campos ausentes = 0 / disponível.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/discipline/disciplineConfig.ts` | Constantes (`DISCIPLINE`) |
| `src/Domain/discipline/discipline.ts` (+ teste) | `isSuspended`, `isUnavailable` (lesionado OU suspenso), `serveSuspension`, `banFromCards`, `applyMatchCards` |
| `src/Domain/advanceDay/matches.ts` | `finalizeSquadsAfterMatch`: cumpre, contabiliza cartões, devolve `suspensionsApplied`/`suspensionsServed` |
| `src/Domain/lineupHelpers.ts` | `eligiblePool` e `replaceUnavailableStarters` (antes `replaceInjuredStarters`) usam `isUnavailable`; `InjuredReplacement.reason` = `injured`/`suspended` |
| `src/GameInterface/MatchScreen.tsx`, `FormationScreen.tsx` | Suspenso fora do elenco da partida e bloqueado na escalação (selo "Suspenso") |
| `src/GameInterface/playerHelpers.ts`, `Components/SuspendedBadge.tsx` | `PlayerRow.status = "suspended"` + `suspendedMatches`; selo no elenco, na ficha e no cartão |
| `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxEvents.ts` | Inbox: categoria `injury`, `kind: "suspended"` (`matches`) |
| `src/backend/advanceDay.ts` | Junta `suspensionsApplied` em `injuryInboxEvents`, emitido depois do `clearInbox` como as lesões |
| `src/Domain/advanceDay/quickSim.ts` + `QuickSimConfig.ts` | `rollDiscipline` (ver abaixo) |
| `scripts/quicksim-discipline.ts` | Calibração do quickSim contra as médias do motor |
| `src/GameInterface/MatchSummaryPanel.tsx` | Painel "Resumo" da partida ao vivo |

Prioridade de exibição: lesionado vence suspenso no `status` (o selo de suspenso some até a lesão
passar; a indisponibilidade vale de qualquer jeito).

## quickSim

`rollDiscipline` roda **depois** de gols, eventos e lesões (nenhum sorteio anterior muda). Por lado:

- **Faltas** ~ Poisson(`FOULS_PER_SIDE` 5,75), no mínimo o número de pênaltis cedidos; quem comete:
  peso `FOUL_LINE_WEIGHT[linha]` (GK 0,05 · DEF 1,2 · MID 1,0 · FWD 0,7) × `(1 + 0,6 × (0,5 − tackling/10))`,
  × `BOOKED_FOUL_MULT` 0,35 se já tem amarelo; expulso não comete mais. Minutos sorteados e ordenados.
- **Cartão por falta:** vermelho direto `DIRECT_RED_PER_FOUL` 0,0026; amarelo `YELLOW_PER_FOUL` 0,245
  (× `BOOKED_CARD_MULT` 1,15 em quem já tem amarelo → segundo amarelo = amarelo + vermelho).
- **Pênaltis** a favor do adversário: λ = `PENALTIES_PER_SIDE` 0,14 (era 0,115; subiu com o `IN_BOX_MULT` do motor na Etapa 13, `aerial.md`), chance `c = penaltyChance(...)`
  (maior `finishing` do adversário × goleiro de quem cede). **O placar não muda:** cada gol normal
  já sorteado do adversário vira gol de pênalti com probabilidade `q = λ·c / xG do dia`; os perdidos
  são Poisson(`λ·(1 − c)`). Assim `E[gols de pênalti] = λ·c`, `E[pênaltis] = λ`, e o volume de gols
  calibrado fica igual. O gol convertido passa do autor para o cobrador e **perde a assistência**
  (gol de pênalti não tem assistência, como no motor): `assignGoals` guarda autor e assistente de cada
  gol, e o sorteio de conversão é feito gol a gol (só os do tempo normal). `teamStats.penaltyGoals` conta
  os convertidos.
- **Impedimentos** do adversário: Poisson(`OFFSIDES_PER_SIDE` 0,45 × (nível/5)^1,5) — única
  tendência por nível do motor (PL 1,05 × Championship 0,76).
- Nota: amarelo −0,3, vermelho −1,0, pênalti cometido −0,5 (`RATING_WEIGHTS`), somados depois do encolhimento.
- `recording.cards` alimenta as suspensões igual ao motor; minutos: o quickSim não tira o expulso
  (mesma regra do lesionado, `fullMinutesForInjured`).

Medido (`bun scripts/quicksim-discipline.ts 4000`, por partida, dois times):

| | PL quick | PL motor | Championship quick | Championship motor |
|---|---|---|---|---|
| Faltas | 11,5 | 11,3 | 11,5 | 11,8 |
| Amarelos | 2,80 | 2,89 | 2,82 | 2,72 |
| Vermelhos | 0,12 | 0,15 | 0,11 | 0,09 |
| Pênaltis | 0,24 | 0,24 | 0,22 | 0,21 |
| Impedimentos | 1,03 | 1,05 | 0,80 | 0,76 |

## Tela ao vivo

- **Avisos** (mesmo lugar do aviso de lesão, 3,5 s): impedimento, falta perigosa (tiro livre com
  layout, `dangerous`), amarelo / vermelho / segundo amarelo, pênalti marcado.
- **Painel "Resumo"** (`MatchSummaryPanel`, no lugar da escalação do adversário): posse (segundos de
  jogo com a bola, só em fase viva, acumulados no `MatchScreen`), chutes, passes certos, faltas,
  cartões (A/V), impedimentos dos dois times (`getTeamStats`), e a lista de lances com minuto
  (minuto exibido = `matchMinute + 1`): gols, gol de pênalti / pênalti perdido, impedimentos (do
  `gameBus`), cartões, substituições e lesões (do próprio `GameState`).
- **Resultado:** faltas, amarelos, vermelhos e impedimentos nas barras de estatística e uma lista de
  cartões com minuto.

## Testes e smoke

```
bun test src/Domain/discipline src/Domain/advanceDay src/Domain/lineupHelpers.test.ts src/Domain/inbox
```

`bun scripts/season-rollover-smoke.ts`, seção "Disciplina": médias por partida em todo jogo logado
(faltas 8–16, amarelos 1,5–4,5, vermelhos ≤ 0,3, pênaltis 0,1–0,4); nenhum suspenso (foto antes do
dia, como as lesões) num XI da liga do jogador; pelo menos uma suspensão cumprida na corrida.
