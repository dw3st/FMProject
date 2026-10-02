# Etapa 11d — Ranking de técnicos (#33) — Design

Data: 2026-10-02. Status: aprovado. Versão **2.6**. Visual: `.claude/rules/ui-standard.md`.

## 1. Pontos

| Título | Pontos |
|---|---|
| Liga nível 1 | 100 × peso |
| Liga nível 2+ | 40 × peso |
| Copa nacional | 50 × peso |
| Champions League / Libertadores | 150 |
| Europa League / Sul-Americana | 80 |
| Acesso (promovido) | 20 |

Peso do país = nível médio (`clubLevel`/`teamLevel`) dos clubes da liga de nível 1 do país ÷ média das 5 grandes
(Inglaterra, Espanha, Alemanha, Itália, França), limitado a [0,2; 1,2]. Calculado na virada do país (e para as
copas, no dia, com cache por dia). Constantes em `src/Domain/managers/managerConfig.ts`.

## 2. Dado

`saves/{id}/managers.json`: `ManagerRecord { id, name, squadId, isPlayer, points, seasons, titles: { season,
competition, squadId, points }[] }`. Sem migração (protótipo: ausente = gerar do zero na leitura não; gerado no
`createSave`).

- `createSave`: um técnico por clube, a partir de `squad.coach` (`coach_<squadId>` se não houver id; nome
  "Técnico do <clube>" se não houver coach), mais o técnico do jogador (`isPlayer`, nome do `meta.manager`,
  clube do jogador, substituindo o coach importado desse clube). Start kits: não tocam o arquivo.
- Virada do país: campeão de cada liga e promovidos pontuam para o técnico do clube; `seasons += 1` para os
  técnicos dos clubes que viraram.
- Copa/continental: no dia em que `championId` é definido.
- Técnicos da IA não trocam de clube nesta etapa. DAL bufferizado como `freeAgents`/`retired`.

## 3. Tela

Aba "Técnicos" em Stats: posição, nome, clube, pontos, títulos (contagem); filtro Mundo / Meu país; linha do
jogador destacada; clicar abre os títulos. Rota `GET /api/saves/:id/managers?scope=world|country&offset&limit`
(dono do save, paginada, `{ total, playerRank, items }`). Dashboard: linha "Ranking de técnicos: Nº X".

## Verificação

Testes de `src/Domain/managers` (pontos, peso, ordenação/empate por títulos e nome), rota, smoke de temporada
(seção "Técnicos": técnico do jogador existe, campeão inglês ganhou pontos de liga, nenhum técnico com pontos
negativos). Changelog 2.6, `.claude/rules/game/managers.md`, ROADMAP 11d ✅. `/test` e `/lab`: sem efeito de partida.
