# Atributos mentais

Spec: `docs/superpowers/specs/2026-11-18-fm-style-decisions-design.md` (§2 e §7). Fase 1 das decisões no estilo FM:
**só dados**. O motor da partida, o quickSim e toda regra de jogo não leem nada disto ainda; a partida é a mesma, sorteio
a sorteio, com ou sem as chaves (teste `MentalIdentity.engine.test.ts`).

## Regra

- `PlayerStatsRecord` ganhou 4 chaves obrigatórias, 0,0–10,0 com uma casa: `decisions` (Decisão), `composure` (Calma),
  `flair` (Ousadia), `anticipation` (Antecipação). As mesmas em `DevelopmentProgress`, `AttributeId`, `ATTRIBUTE_LABELS`
  e i18n (`attributeNames`, `attributeDescriptions`). `MENTAL_ATTRIBUTE_IDS` / `BASE_ATTRIBUTE_LIST` em `attributes.ts`.
- **Peso 0 em todo `attrWeights`** (as chaves não estão lá): overall, valor, salário, aptidão por posição e estrelas ficam
  idênticos, bit a bit (teste `mental.test.ts` sobre elencos reais).
- **Consistência** fica escondida e não é gravada: `consistencyOf(idade, personalidade)`.
- Sem migração: quem não tem as chaves ganha os valores derivados na leitura (como `personalityOf`).

## Derivação (`src/Domain/mental/mental.ts`, constantes em `mentalConfig.ts`)

`n(a) = clamp(a / 6,5, 0, 1)`, `exp = clamp((idade − 18) / 12, 0, 1)`, `g(k)` = N(0,1) determinístico de
`seedFrom("mental:<id>:<k>")`, `t_*` da personalidade (`mentalShiftOf`, `personality.ts`; o renascido usa a do original).

```
decisions    = 6,5·clamp(.45n(vis)+.25n(pas)+.15n(press)+.15exp+.05t_prof         +.06g)
composure    = 6,5·clamp(.30n(fin)+.25n(dri)+.15n(str)+.10n(pas)+.20exp −.10t_temp +.06g)
flair        = 6,5·clamp(.50n(dri)+.25n(vis)+.15n(fin)+.10n(acc)+.08t_amb −.04t_prof +.06g)
anticipation = 6,5·clamp(.40n(press)+.30n(vis)+.15n(tack)+.15exp                  +.06g)
consistency  = clamp(.50 + .25t_prof − .15t_temp + .15(exp − .5), 0, 1)   (escondida)
```

Mundo base (36 521 jogadores): mediana / p90 = decisão 3,0 / 4,3 · calma 2,8 / 4,3 · ousadia 2,6 / 4,1 ·
antecipação 2,9 / 4,1; teto 6,5 (< 0,1% dos jogadores). Derivar o mundo inteiro: ~90 ms.

## Onde as chaves nascem

| Caminho | Como |
|---|---|
| Mundo base | `bun scripts/applyMentalAttributes.ts [dir]` (último passo de dados, depois das correções curadas e antes do `kits:generate`; recusa `src/Data`). Os elencos de `src/example_data/squads` já vêm com as chaves |
| Leitura do save | `FileSystemDAL`: elencos (jogadores e base) em `readSquad`, `listSquadFiles`, `listSquadsInLeague`; livres; `statsAtRetirement` dos aposentados (`fillSquadMentalInPlace`, `fillMentalInPlace`, `fillRetiredMentalInPlace`). Só preenche o que falta |
| Criação do save e `/import-squads` | as cópias do mundo passam pelo mesmo preenchimento |
| Geradores | `mentalStatsFor(base13, idade, id, personalidade?)`: safra e jovens dos torneios de base e seleções (`makeAcademyPlayer`; o `statsFor` devolve só as 13 e o teto "peso 0 → ≤ 2" nunca toca nas mentais), jogador criado da loja, lendas reais, renascido (17 anos, personalidade do original, nunca copiado do veterano), jovens de reposição (`makeYouthPlayer`: mentais derivadas, não as do modelo menos 1) |
| Motor | rede de segurança `lineupMental(raw, id, idade)` (`TeamLineup.ts`): os valores 0..1, derivados se faltar. Ninguém chama na fase 1 |
| `/test`, `/lab`, painel QuickSim | JSONs estáticos passam por `withMentalAttributes`; os elencos sintéticos do lab usam o nível do elenco |

Start kits (Git LFS) **não** foram regenerados: a leitura preenche.

## Evolução (`PlayerDevelopment.ts`)

Um pool próprio, só de partidas (liga, copa, continental, seleção, base e amistosos; nunca o treino):
`DP mental = DP ganho × 0,25 × mentalAgeGrowth(idade) × GROWTH_DP_SCALE`, com `mentalAgeGrowth` ≤ 21 0,5 · 22–27 0,7 ·
28–31 0,6 · 32–34 0,3 · 35+ 0,1, repartido por `roles.json → mentalWeights` (`mentalWeightsFor`, padrão 0,25 cada).
Declínio só a partir dos 33, a 0,3 × o declínio por idade. Mesmo custo por passo, teto suave e freio de elite. As 13
evoluem exatamente como antes (comparado com a versão anterior: 924 jogadores reais × 80 partidas, 0 diferenças).
O progresso mental sem histórico é semeado no meio do passo, como os outros.

## Telas (atrás de `SHOW_MENTAL`, falso na fase 1)

- Ficha (`PlayerCard`, grupo "Mental"), Desenvolvimento (`MentalAttributesPanel`), Olheiro (grupo "Mental" dos filtros e da
  ficha flutuante, `visibleAttributeGroups`), perfil do aposentado (`visibleAttributeList`).
- O olheiro já borra as chaves (`obscurePlayer` passa por todas). As mudanças mentais ficam fora da caixa de entrada e do
  registro de evolução (`devLog`) enquanto a flag estiver desligada; o dado evolui e é gravado.

## Testes

```
bun test src/Domain/mental src/backend/dal/mental.dal.test.ts src/GameEngine/Domain/MentalIdentity.engine.test.ts
```

## Limitações

- O renascido e o jogador gerado usam o id novo no sorteio `g`; o mesmo jogador tem sempre os mesmos valores.
- A personalidade com crescimento do auxiliar (`personalityGrowth`) muda a derivação enquanto as chaves não forem gravadas.
