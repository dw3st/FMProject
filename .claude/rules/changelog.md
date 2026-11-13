# Changelog do jogo ("Novidades" / "What's new")

## Arquivo

`src/Domain/changelog/changelogData.ts` (reexportado em `src/GameInterface/changelog/changelog.ts`; o modal busca `GET /api/changelog`, fora do pacote das páginas) — array `changelog: ChangelogEntry[]`, mais recente
primeiro. `CURRENT_VERSION` é sempre `changelog[0].version`. Cada entrada:

```ts
{
  version: string;   // "1.4" (etapa) ou "1.4.1" (só correções)
  date:    string;   // YYYY-MM-DD
  items:   { pt: string; en: string }[];
  fixes?:  { pt: string; en: string }[];  // opcional
}
```

`upcoming: { pt, en }[]` (exportado no fim do mesmo arquivo) é a aba **"Em breve"** do modal: o que
as próximas etapas trazem, em texto curto para o jogador.

Consumido por `ChangelogModal.tsx` (abas "Novidades" e "Em breve") e `ChangelogNoticePill.tsx` +
`useChangelogNotice.ts` (aviso de versão nova, guardado em `localStorage`). Testes de
consistência dos dados em `changelog.test.ts` (versões decrescentes e únicas, `CURRENT_VERSION`
igual à primeira entrada, todo item com `pt`/`en` não vazios, `upcoming` não vazio e com `pt`/`en`).

## Onde aparece no jogo

- **Tela inicial** (`StartScreen.tsx`): o rótulo `v{versão}` é um botão que abre o modal.
- **Barra inferior em jogo** (`StatusBar.tsx`, `Layout.tsx`): botão "Novidades" fixo, ao lado de
  Configurações.
- **Aviso de versão nova** (pílula "Novo: vX.Y.Z"): aparece perto do rótulo de versão na tela
  inicial e na barra superior em jogo (`TopNavigation.tsx`) só quando a versão salva no
  `localStorage` do jogador é mais antiga que `CURRENT_VERSION`. Abrir o modal ou descartar a
  pílula marca a versão atual como vista. Na primeira visita (nada salvo ainda) não mostra aviso,
  só grava a versão atual.

## Regra de versionamento

- Cada etapa concluída do `docs/ROADMAP.md` = próximo **minor**: 1.4 → 1.5 → … → 1.9 → 2.0.
- Uma release só com correções, sem etapa nova do roadmap, pode usar um **patch**: 1.4 → 1.4.1.
- `package.json` (`"version"`) acompanha `CURRENT_VERSION` — atualize os dois juntos.
- **Renumeração (2026-11-06):** de 2026-10-08 a 2026-11-06 as versões passaram de 4.9 para 4.10 … 4.48, fora da regra.
  Foram renomeadas: 4.(10 + k) = (5 + ⌊k/10⌋).(k mod 10), correções mantidas (4.41.53 = 8.1.53, 4.48 = 8.8). Saves e
  navegadores ainda guardam os nomes antigos (as regras em `.claude/rules` e o roadmap já usam os novos): toda comparação passa por `canonicalVersion`
  (`src/Domain/saveVersion.ts`), e um "4.xx" com xx ≥ 10 num texto antigo é o nome antigo. Depois de 8.9 vem 9.0.

## Texto

- Curto, direto, **para o jogador** — nunca termos técnicos, de IA ou de implementação (nada de
  "motor", "intent", "refactor", nomes de arquivo, etc.).
- Sempre as duas línguas (`pt` e `en`) preenchidas — é isso que o teste de dados confere.
- `items` é a novidade em si; `fixes` (opcional) é só para correções que valem a pena avisar ao
  jogador — não é obrigatório em toda entrada.

## Quando atualizar

**`upcoming` é atualizado a cada etapa**, na mesma branch: o que acabou de sair sai de `upcoming` (vira
item da entrada nova) e entram as próximas etapas do `docs/ROADMAP.md`, sempre em texto de jogador.

Atualize `changelog.ts` **na mesma branch da etapa, antes do merge** — nunca depois, como tarefa
separada. Se a branch mexeu em algo visível ao jogador (mecânica nova, tela nova, correção
perceptível), ela precisa de uma entrada nova (ou de mais um item numa entrada já aberta do dia,
se várias branches pequenas compõem a mesma etapa do roadmap).

## Aba de cada item (11.0)

Report de tester. Todo item novo (`items` e `fixes`) leva `tab`, a aba do jogo onde a mudança está (`ChangelogTab`, `src/Domain/changelog/changelogTabs.ts`): `match`, `squad`, `formation`, `club`, `development`, `finances`, `staff`, `leagues`, `market`, `scout`, `stats`, `manager`, `friends` ou `general`. O modal mostra a aba entre colchetes antes do texto (`changelog.tabs.*`, uma cor por aba em `TAB_TONE`, `ChangelogModal.tsx`) e ordena os itens de cada versão por aba (`sortByTab`: a partida primeiro, depois a ordem da barra de cima, `general` por último; item sem aba fica depois, na ordem escrita). As entradas anteriores à 11.0 não têm aba e aparecem como antes. O teste de dados confere que toda `tab` é conhecida.
