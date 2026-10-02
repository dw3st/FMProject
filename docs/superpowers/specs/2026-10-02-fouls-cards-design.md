# Etapa 12 — Faltas, cartões, pênaltis e resumo ao vivo (#17, #19) — Design

Data: 2026-10-02. Status: aprovado. Versão **2.7**. Visual: `.claude/rules/ui-standard.md`.
Regra do projeto: toda mecânica nova chega ao `/test`, ao `/lab` e ao `Statistics.ts` (ver `CLAUDE.md`).

## 1. Falta (motor, `src/GameEngine/`)

- A cada desarme resolvido e a cada duelo de bola solta, rola `foulChance` (função pura em
  `Infrastructure/ActionOutcomes.ts` ou módulo próprio `Domain/Fouls.ts`, constantes em
  `Configs/FoulConfig.ts`).
- Fatores: ângulo do desarme (frente < lado < trás, via `classifyPosition`), `TACKLE_AGGRESSION` da tática
  (hoje configurado e sem uso), atributo `tackling` baixo, energia baixa, jogador já com amarelo (reduz).
- Falta anula o lance: posse para o time que sofreu, mesmo que o desarme tenha vencido.

## 2. Retomada

- Fora da área: tiro livre (`SetPieceType` ganha `free_kick`), no ponto da falta, layouts
  `freeKick_Attack`/`freeKick_Defend` que já existem, cobrador = jogador mais próximo do time que sofreu.
  Durante a contagem o cobrador não conduz; pode passar ou chutar (decisão normal) quando perto do gol.
- Dentro da área: pênalti (`SetPieceType` `penalty`), resolvido com `penaltyChance` do
  `PenaltyShootout.ts` (cobrador = melhor finalizador em campo, goleiro adversário). Gol ou defesa
  (posse ao goleiro, como hoje após defesa).

## 3. Cartões e suspensão

- Gravidade da falta → `cardRoll`: amarelo/vermelho direto, com peso maior por trás, em chance clara
  (falta cometida sobre jogador com caminho livre ao gol, `clear run`) e para quem já tem amarelo.
- Dois amarelos = vermelho. Expulso sai de campo sem substituição (mesmo caminho do lesionado removido
  sem reserva, incluindo a rede do goleiro).
- Fora de campo (`src/Domain/`): `RosterPlayer.suspension?: { matches: number }` e
  `seasonLog.yellowCards`/`redCards`. Vermelho = 1 jogo; 5 amarelos acumulados = 1 jogo (zera a contagem
  de acúmulo). Cumprido ao fim de cada partida oficial do clube (liga/copa/continental) em que o jogador
  não pôde jogar. Amarelos zeram na virada (já que `seasonLog` zera).
- Seletores de escalação (`filterEligiblePlayers`, `replaceInjuredStarters`, `MatchScreen`) tratam
  suspenso como indisponível; elenco mostra o status "suspenso" (o `PlayerRow.status` já previa).
  Inbox do clube do jogador: "X suspenso para o próximo jogo".

## 4. Calibração (por partida do motor, dois times)

Faltas ~10–14, amarelos ~3, vermelhos ~0,1–0,15, pênaltis ~0,2–0,3. Gols e chutes dentro de ±5% do
atual (medir 200+ partidas antes e depois). Script `scripts/fouls-calibrate.ts`.
quickSim: faltas/cartões/pênaltis por Poisson com as mesmas médias (pênalti convertido com
`penaltyChance`, contando gol no placar dentro do volume já calibrado — o xG do dia não muda; o pênalti
substitui uma fração equivalente dos gols, para não inflar o total).

## 5. Tela ao vivo (#17, #19)

- Avisos curtos no placar (como o de lesão): impedimento, falta perigosa/tiro livre, cartão, pênalti.
- O painel com a escalação do adversário vira "Resumo": estatísticas ao vivo dos dois times (chutes,
  posse, passes, faltas, cartões, impedimentos) + lista de eventos com minuto (gols, cartões, pênaltis,
  impedimentos, substituições, lesões).
- Resultado da partida: cartões na lista de eventos e nas estatísticas.

## 6. Estatísticas, `/test`, `/lab`

- `Statistics.ts`: `fouls`, `yellowCards`, `redCards`, `penaltiesAwarded`, `penaltyGoals`, `offsides`
  por time e por jogador (cartões), via eventos do `gameBus`; nota do jogador: amarelo −0,3, vermelho −1,0,
  pênalti cometido −0,5.
- `/test`: cenário `foul-in-box` (desarme por trás na área), log de debug `foul`/`card`, painel.
- `/lab`: `TeamRawStats` → `balanceWorker` → `PerMatchView`/`VariantSummary` → linhas em `PairDetail`.

## Verificação

Testes unitários (chance de falta por ângulo/agressividade, cartões, segundo amarelo, suspensão cumprida,
seletores), teste de motor (falta na área vira pênalti, expulsão deixa 10), smoke de temporada (seção
"Disciplina": médias por partida dentro das faixas, nenhum suspenso escalado, suspensões cumpridas).
Changelog 2.7, `.claude/rules/game-engine/fouls.md`, ROADMAP etapa 12 ✅.
