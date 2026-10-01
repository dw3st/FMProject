# Etapa 11b — Aposentadoria + craque renascido (3.6) — Design

Data: 2026-10-01. Status: aprovado. Versão **2.4**. Visual: `.claude/rules/ui-standard.md`.

## 1. Aposentadoria (`src/Domain/retirement/`, puro)

- Na virada de cada país (`advanceDay`, antes das expirações de contrato), para todo jogador de elenco
  com idade ≥ 34: `retireChance(age, levelPctl)` = base por idade (34: 0,10 · 35: 0,25 · 36: 0,45 ·
  37: 0,65 · 38: 0,85 · ≥ 39: 1,0) × (1,3 − 0,6 × percentil de overall na linha no mundo), limitado a
  [0, 1]; ≥ 40 sempre 1. Determinístico (hash save+jogador+ano).
- Livres (`freeAgents.json`) com idade ≥ 33: mesma regra com a idade +1.
- Aposentado sai do mundo (elenco ou pool). Registro mínimo em
  `saves/{id}/retired.json`: `{ id, name, nationality, positions, preferredFoot, profile, retiredOn,
  squadId, wasWorldClass, statsAtRetirement }` (para o renascimento e o futuro histórico #32).
- Clube abaixo dos mínimos depois da aposentadoria: a reposição existente (refill) cobre.
- Inbox do jogador (`season`/nova `retirement`): "X se aposentou" com jogos/gols pelo clube
  (`seasonLog` acumulado disponível).

## 2. Craque renascido (só o clube do jogador)

- **Classe mundial:** aposentado do clube do jogador que estava no top 50 do mundo por overall na
  virada, ou que tinha estrela dourada (`computeStars`) nesse momento.
- Inbox `reborn` com Aceitar / Recusar (`POST /api/saves/:id/reborn/:retiredId` `{ accept }`), válida
  até a próxima virada do país (depois expira).
- Aceitar: jogador novo na `squad.youth` — novo id (`reborn_<id>_<ano>`), mesmo nome, nacionalidade,
  posições, pé e perfil; 17 anos; atributos com o **perfil** do original (a forma relativa dos
  atributos preservada) escalados para o nível de "promessa" da base (média da linha do clube − 0,8);
  contrato de base. Marca `reborn: { fromId, until: <ano em que faz 23> }`.
- Crescimento: enquanto `reborn` válido, DP × 1,3 (treino da base na virada e partidas quando promovido).
  Badge "Renascido" (estrela própria) na ficha, elenco e base.

## Verificação

Testes: chance por idade/nível (bordas, determinismo), seleção de classe mundial, geração do renascido
(perfil preservado, 17 anos, nível), expiração da oferta, rota (dono, aceitar/recusar, limite da base).
Smoke: houve aposentadorias, nenhum jogador ≥ 40 em elenco ou pool no fim, `retired.json` coerente;
cenário forçado de renascido aceito entra na base. Changelog 2.4; `.claude/rules/game/retirement.md`;
ROADMAP (11b ✅).
