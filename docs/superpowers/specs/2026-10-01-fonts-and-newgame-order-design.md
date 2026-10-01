# Fontes únicas + ordem do novo jogo + escudos — Design (1.9.1)

Data: 2026-10-01. Status: aprovado (opção A de `.superpowers/brainstorm/15-1790858757/content/fonts.html`).

## Fontes (o jogo inteiro)

- **Títulos/display:** Barlow Condensed (600/700), maiúsculas, `tracking` leve — títulos de tela,
  títulos de painel, cabeçalhos de seção, números de destaque. O `Wordmark` já usa essa família.
- **Texto e UI:** Barlow (400/500/600) para todo o resto (tabelas, botões, rótulos, formulários).
- Embutidas no projeto pelo `@fontsource` (nunca Google Fonts). `src/index.css`: `--font-sans` =
  Barlow, `--font-display` = Barlow Condensed (Tailwind `font-sans`, `font-display`), corpo da página em
  `font-sans`; `h1`/`h2`/`h3` em `font-display` uppercase por padrão (`@layer base`).
- **Fim da "salada":** remover `font-family` inline, `font-mono` decorativo e classes de fonte
  avulsas que contradizem o padrão (manter mono só onde é dado tabular de verdade, se houver);
  componentes de `src/GameInterface/ui/` e a moldura usam os dois papéis acima. Mesma regra
  documentada em `.claude/rules/frontend.md` (seção Tipografia).

## Novo jogo: técnico primeiro

`/new-game` abre numa tela de técnico (coluna central, estilo do login: nome, nacionalidade,
histórico, botão "Continuar"); depois a tela única de país/liga/clube (rodapé mantém "Técnico: … ·
Editar"). Cancelar volta a `/start`.

## Escudos maiores

Na seleção de clubes do novo jogo: escudo 32px (era ~16–20px); bandeira dos países 20px. Na lista de
jogos salvos já são 36px.

## Verificação

`tsc`, `bun test src/GameInterface`; navegador: landing, login, start, novo jogo (técnico → país →
clube → começar), dashboard, stats — mesma tipografia em todas. Changelog 1.9.1 (fix: "Fontes e
visual uniformes em todas as telas"; "Novo jogo começa pela criação do técnico"); `package.json` 1.9.1.
