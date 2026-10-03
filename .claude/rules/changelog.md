# Changelog do jogo ("Novidades" / "What's new")

## Arquivo

`src/GameInterface/changelog/changelog.ts` — array `changelog: ChangelogEntry[]`, mais recente
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
