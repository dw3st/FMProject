# Bloco B — novo jogo em uma tela — Design

Data: 2026-10-01. Status: aprovado. Segundo bloco da Etapa 9; sai junto com o bloco A na 1.9.
Mockup: `.superpowers/brainstorm/15-1790858757/content/wizard.html`, opção B.

## Tela (`src/GameInterface/NewGameWizard.tsx`, página `/new-game`)

- **Esquerda (~240px):** `Wordmark` no topo; busca (sem acento/caixa, `matchesCountryQuery`); países
  agrupados por continente (`groupCountriesByContinent`, `countryDisplayName`) — nunca rótulo montado
  à mão (`.claude/rules/ui-world.md`). País selecionado em `text-primary`.
- **Direita:** abas com as ligas do país em ordem de tier (`leaguesOfCountry`, `leagueLabel`);
  lista de clubes da liga: `ClubLogo` (escudo real por `squadLogoUrl`), nome, nível do elenco e
  orçamento (os dados que a tela já carrega hoje para o passo de clube). Clique seleciona; linha
  destacada.
- **Rodapé:** "Técnico: Nome (País) · Editar" — Editar abre um `Modal` com nome, nacionalidade e
  histórico (o conteúdo do antigo passo do técnico, mesmas validações). Botão "Começar com {clube}"
  (`bg-primary`), desabilitado até clube escolhido e técnico válido; "Cancelar" volta a `/start`.
- **Base de dados:** sem passo; usa a única base jogável (como o passo 0 já fazia ao ter uma só).
- **Comportamento igual:** criação (`createGameSave`), pré-simulação, limite de saves, mensagens de
  erro, estados de carregamento.
- **Visual:** tokens do tema, sem glow/gradiente/`scale`, sem caixa-alta forçada; ícones só via
  `Icons.tsx`. Abaixo de `md`, a lista de países vira um seletor recolhível no topo.
- i18n en/pt-BR; remover chaves que ficarem sem uso.

## Verificação

`bunx tsc --noEmit -p .`; `bun test src/GameInterface`; no navegador: criar uma carreira do começo ao
fim (país → liga → clube → editar técnico → começar), conferir que cai no dashboard. Changelog 1.9
(blocos A + B): novo visual do jogo e do novo jogo.
