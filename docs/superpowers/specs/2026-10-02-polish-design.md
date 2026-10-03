# Etapa 16 — Polimento (#44) — Design

Data: 2026-10-02. Status: aprovado. Versão **3.1** (fecha a Fase 4). Visual: `.claude/rules/ui-standard.md`.

## 1. Mapa-múndi no novo jogo

- SVG do mundo a partir do Natural Earth (domínio público), simplificado e embutido no projeto
  (`src/GameInterface/NewGame/worldMap.svg` ou módulo TS com os paths por ISO2), sem serviço externo.
  Atribuição em `NOTICE`/README.
- Países com liga no `leagueData` destacados (`primary` suave), hover mostra o nome
  (`countryDisplayName`), clique escolhe o país (mesmo estado da lista atual). Inglaterra = `GB`.
- A lista atual continua ao lado (busca). Em telas mais estreitas que `xl` só a lista (o mapa ficaria pequeno demais).
- Teclado: a lista cobre a acessibilidade; o mapa é complementar (`aria-hidden` nos paths, botão por país não).

## 2. Rostos (`facesjs`, Apache-2.0)

- `generate()` com seed determinística pelo id do jogador (PRNG próprio injetado ou `faceFromId`), camisa com
  as cores do clube (`teamColors`), tom de pele/cabelo amostrados de faixas por região da nacionalidade
  (faixas amplas, sem estereótipo rígido).
- Componente `PlayerFace` (cache por id, SVG). Usado na ficha do jogador (`PlayerScreen`, 96px) e no cartão
  do painel (`PlayerCard`, 64px). Não nas tabelas. Nada salvo no save (derivado do id).
- Verificar tamanho do bundle (lazy import do `facesjs` só nessas telas).

## 3. Aba "Em breve"

`changelog.ts` ganha `upcoming: { pt, en }[]` (textos curtos para o jogador). `ChangelogModal` com duas abas:
Novidades / Em breve. Teste de dados: todo item com `pt` e `en`. Atualizado a cada etapa (regra em
`.claude/rules/changelog.md`).

## Verificação

Teste do mapeamento ISO2 ↔ países do jogo (todo país com liga tem path no mapa), determinismo do rosto,
dados do changelog. Changelog 3.1, ROADMAP etapa 16 ✅.
