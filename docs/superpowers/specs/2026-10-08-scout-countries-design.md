# Olheiros por país (Etapa 33)

Etapa 33 do `docs/ROADMAP.md`, issue #104, versão **4.9**. Desenho aprovado em 2026-10-07/08. Depende da 4.7
(comissão: olheiro-chefe e olheiros de campo são `StaffMember` com nacionalidade, atributos 1–20 e estrelas) e da
4.3 (olheiros: conhecimento por jogador, missões, relatórios). Regras que esta etapa muda:
`.claude/rules/game/scouting.md`, `.claude/rules/game/staff.md`, `.claude/rules/ui-world.md` (reuso do mapa).
Visual: `.claude/rules/ui-standard.md`.

## Decisões

| Tema | Decisão |
|---|---|
| O que é | Cada olheiro (chefe e de campo) conhece cada país de 0 a 100 |
| Ponto de partida | Derivado da nacionalidade: **90** no próprio país, **40** nos países do mesmo continente, **0** no resto. Nada gravado enquanto não muda |
| Crescimento | Toda semana trabalhada de uma missão naquele país; missão de continente cresce um pouco cada país visitado na semana |
| Queda | Depois de **180 dias** sem missão num país, cai **5 pontos a cada 30 dias**, até o ponto de partida (continente 40, resto 0). O do próprio país **nunca cai**. Calculada na leitura, sem passada diária |
| Onde age | **Só nas missões**: multiplica o ganho de conhecimento das observações daquele país e a precisão do relatório (incerteza vista, nota). Não dá piso de conhecimento a jogador nenhum fora das missões |
| Neutro | **40 (país moderado) = o ritmo de hoje**, exatamente (multiplicadores 1) |
| IA | Não tem olheiros: nada muda |
| Missões | Continuam de 4/8/12 semanas (rápida, moderada, profunda), olheiro ocupado, viagem cobrada pela distância (`missionCost`, já existe) |
| Telas | Clicar no olheiro (Equipe técnica, aba Comissão de Transferências e Central de Olheiros) abre o mapa-múndi do novo jogo colorido por conhecimento (completo / moderado / nenhum) e a lista de países com o valor; país forte na lista de livres e nos cartões; conhecimento do olheiro sobre o alvo na criação da missão |
| Saves antigos | Sem migração (protótipo): sem dado gravado = derivado da nacionalidade |

## 1. Modelo (`src/Domain/scouting/countryKnowledge.ts`, puro)

### Dado

`StaffMember.countryKnowledge?: Record<string, CountryKnowledgeEntry>` (`src/types/staffTypes.ts`), chave = nome do
país como no `leagueData`/`countries.json` (`"England"`), igual à `nationality` dos profissionais.

```ts
interface CountryKnowledgeEntry {
  k: number;      // 0..100, uma casa decimal, valor no dia `last`
  last: string;   // ISO: último dia em que uma missão trabalhou nesse país
}
```

- Esparso: só países em que o olheiro trabalhou. Ausente = ponto de partida.
- Mora no próprio `StaffMember`, então acompanha o profissional: volta à lista de livres com ele (`returnToPool`
  espalha o membro inteiro), volta ao clube se for recontratado. Some quando o clube vira IA (a comissão não volta à
  lista, `staff.md`). Só olheiros (`scout`, `fieldScout`) têm o campo; as demais funções nunca o gravam.
- Profissionais da lista de livres nunca têm o campo gravado ao serem gerados: tudo vem da nacionalidade
  (determinístico, sem custo no `staffPool.json`).

### Ponto de partida e leitura

```
base(nacionalidade, país) = 90 se país = nacionalidade
                          = 40 se continentOf(país) = continentOf(nacionalidade)   (countries.json)
                          = 0  senão
efetivo(país, data) =
  sem entrada:          base
  país = nacionalidade: max(base, k)                              (nunca cai)
  senão:                max(base, k − 5 × max(0, dias(last, data) − 180) / 30)
```

Arredondado a uma casa na exibição; inteiro nas telas. Mesma forma do `decayed()` do conhecimento de jogador
(`knowledge.ts`), sem passada diária.

### Crescimento (toda segunda em que a missão trabalha)

```
k ← efetivo + (100 − efetivo) × taxa        last ← data
taxa: país, liga, jovens 0,06 · jogador 0,03 · continente 0,02 (cada país com pelo menos 1 observado na semana)
```

Saturante: uma missão profunda (12 semanas) leva um país de 0 a ~52 e um de 40 a ~71; uma segunda missão profunda
num país de 52 chega a ~77. País de uma missão de **liga** = país da liga; de **jogador** = país da liga do clube dele
(livre: nenhum, sem crescimento); de **jovens** e de **país** = o país do alvo. Missão cujo jogador sumiu (não
trabalha) não cresce nada. Entradas que caíram até a base saem ao gravar (`pruneCountryKnowledge`).

### Faixas (telas)

| Faixa | Efetivo | No mapa |
|---|---|---|
| Completo | ≥ 70 | `fill-primary` |
| Moderado | 25–69 | `fill-primary/45` |
| Nenhum | < 25 | `fill-secondary` |

O próprio país (90) é completo; o continente (40), moderado; o resto, nenhum.

## 2. Efeito nas missões

Curvas lineares por partes passando por `[k 0, k 40 (neutro), k 100]`:

| Efeito | k 0 | k 40 | k 90 (próprio país) | k 100 |
|---|---|---|---|---|
| Ganho de conhecimento por observação (`countryGainMult`) | ×0,75 | ×1 | ×1,167 | ×1,2 |
| Incerteza do relatório (`countryNoiseMult`) | ×1,15 | ×1 | ×0,875 | ×0,85 |

- **Ganho:** em `advanceScoutingWeek`, o ganho de cada observado vira `REGION_GAIN` (ou `PLAYER_GAIN`) × ganho da nota
  do líder × ganho do chefe × `countryGainMult(k do líder no país do observado)`. O país do observado é
  `PoolEntry.country` (país da liga do clube; prospecto: o país da missão). Missão de continente: cada observado pelo
  país dele. O conhecimento usado é o do **início da semana** (o crescimento do país entra depois das observações).
- **Relatório:** `seenProfile` ganha um multiplicador da incerteza; `buildReport` de uma missão passa
  `countryNoiseMult(k do líder no país)`. Afeta as faixas de nível, potencial e valor, o centro visto e a nota A–E do
  relatório (é o mesmo ruído determinístico com amplitude menor ou maior). O campo `k` do relatório continua o
  conhecimento do jogador. As telas (busca, ficha, elenco) continuam pelo conhecimento do jogador: o relatório de um
  especialista é mais preciso que a ficha, de propósito.
- **Prospectos** (missão de jovens): o conhecimento inicial (`addProspects`) e o relatório usam os mesmos dois
  multiplicadores com o país da missão.
- **Fora das missões nada muda:** recomendação mensal do chefe (própria liga, não é missão), adversários das partidas
  (+8), lista de observação (+3), conhecimento implícito (liga 35, país 20, fama 25) — tudo como hoje. Nenhum piso
  novo de conhecimento.
- **Chefe vago:** sem membro, sem país forte; multiplicadores 1 (a vaga já pesa pela nota 3).
- **Neutro garantido:** com `k = 40` os dois multiplicadores são exatamente 1 e `advanceScoutingWeek` produz o mesmo
  estado de hoje (teste de igualdade).

## 3. Onde grava (`scoutingDay`, `src/backend/scoutingWorld.ts`)

Na segunda, depois de `advanceScoutingWeek`: para cada missão que trabalhou, o líder (chefe = `headOf(own, "scout")`,
ou o olheiro de campo `mission.scoutId`) recebe o crescimento dos países visitados (`growCountryKnowledge`). O elenco
do clube do jogador é relido e gravado uma vez (`saveSquadById`) dentro do `BufferingSaveDAL` do dia. O bloco
financeiro e o de contratos da comissão relêem o elenco depois (`advanceDay.ts`, linhas ~1505 e ~2462), então nada
sobrescreve. A IA nunca passa por aqui.

## 4. Telas

- **Mapa de conhecimento por país** (`src/GameInterface/Scouting/ScoutCountriesPanel.tsx`): reaproveita o `WorldMap`
  do novo jogo (`src/GameInterface/NewGame/WorldMap.tsx`), que ganha dois props opcionais — `fillClassFor(country)`
  (cor por país) e `onSelect` opcional (sem clique, sem cursor de mão) — sem mudar nada no novo jogo. Só a partir de
  `xl` (como no novo jogo); abaixo disso só a lista. Legenda com as três faixas; contorno no país da nacionalidade;
  legenda do país sob o cursor com o valor ("Inglaterra · 90"). Lista ao lado (abaixo de `xl`, sozinha): países com
  efetivo > 0, do maior para o menor, bandeira 20px (`Flag`), nome (`countryDisplayName`), `KnowledgeBar` e o número;
  "Próprio país" no da nacionalidade; "Última missão: dd/mm/aaaa" quando houver.
- **Onde abre:** na ficha do profissional (`StaffDetailModal`, modo clube e lista) de um olheiro, bloco "Conhecimento
  por país"; na Central de Olheiros (aba Missões), clicar no nome do olheiro abre um modal com o mesmo painel. O modal
  da ficha já é largo; o painel usa `size="lg"` quando aberto pela Central.
- **País forte:** a linha do olheiro mostra a bandeira e o país de maior conhecimento (empate: a nacionalidade) —
  cartões da Equipe técnica (grupo Olheiros), coluna "Forte em" da aba Comissão (para olheiros: "Inglaterra · 90"
  em vez da especialidade), cartões da aba Missões.
- **Criar missão** (`NewMissionModal`): abaixo do alvo escolhido, "Conhecimento de <olheiro> em <alvo>" com a barra,
  o número, a faixa e o ritmo ("ritmo ×1,17"). País/jovens: o país; liga: o país da liga; continente: a média dos
  países do continente que a missão visita (os que têm liga de nível 1). **Observar** um jogador (ficha,
  `PlayerKnowledgePanel`): cada olheiro livre na escolha mostra o conhecimento do país do clube do jogador.
- i18n `scoutCountries.*` (en, pt-BR). Auditoria `bun run ui:audit` limpa (0 duras, 0 leves).

## 5. Rotas

| Rota | Muda |
|---|---|
| `GET /api/saves/:id/scouting` | Cada olheiro ganha `nationality`, `strongCountry: { country, k } \| null` (vago: `null`), `countries: Record<país, k>` (efetivo > 0) e `continents: Record<continente, k>` (média dos países que uma missão de continente visita) |
| `GET /api/saves/:id/scouting/player/:playerId` | Ganha `country` (país da liga do clube dele; livre: `""`) |
| `GET /api/saves/:id/staff` | Olheiros (`scout`, `fieldScout`) ganham `strongCountry` |
| `GET /api/saves/:id/staff/pool` | Itens de olheiros ganham `strongCountry` |
| `GET /api/saves/:id/staff/:memberId/countries` (nova) | Dono do save. Membro da comissão do clube ou da lista de livres; 404 `notFound`, 400 `notAScout`. `{ memberId, name, nationality, countries: [{ country, slug, name, flag, iso2, continent, k, band, native, last? }] }` com os 60 países de `countries.json` |

Desempregado: a rota nova continua valendo para a lista de livres (como a busca da lista).

## 6. `/test`, `/lab`

Sem efeito de partida: nada a exibir. `Statistics.ts`: nada novo.

## 7. Medição obrigatória (`bun scripts/scout-country-measure.ts`)

Puro, sem save: uma liga real (`premier_league`, elencos de `src/Data/squads`), olheiro de campo 3★ (nota 5), chefe
3★, missão de país de 12 semanas, a mesma semente; três líderes que só diferem no conhecimento do país (0, 40, 90).

Imprime, por semana 4/8/12: conhecimento médio dos jogadores observados, observados com k ≥ 60 e a concordância da
nota do relatório com a nota real (relatório com k 100) — e a trajetória do conhecimento do país (de 0 e de 40) e a
queda (de 71 depois de 180/270/365 dias).

Metas:
- k 40 **idêntico** ao mundo sem a etapa (mesma saída).
- Próprio país (90) no máximo **+20%** de conhecimento médio após 12 semanas em relação a hoje; país desconhecido (0)
  no máximo −25%.
- Concordância da nota: próprio país ≥ hoje ≥ país desconhecido.

Se uma meta falhar, ajustar `GAIN_MULT`/`NOISE_MULT` e registrar os números aqui antes do merge.

## 8. Smoke (`scripts/season-rollover-smoke.ts`, seção "Olheiros")

Junto das checagens de hoje:
- Antes da missão de país estrangeiro do chefe, guardar o efetivo dele nesse país; no fim da missão ele subiu (e o
  `countryKnowledge` do chefe tem a entrada, com `last` na última segunda trabalhada).
- O país da nacionalidade de cada olheiro do clube, no fim da corrida, nunca está abaixo de 90.
- Queda: se a última missão num país estrangeiro terminou há mais de 210 dias no fim da corrida, o efetivo é menor que
  o gravado; senão a checagem é pulada com nota (a corrida padrão pode ser curta). A queda está coberta de forma
  determinística em `countryKnowledge.test.ts`.
- Nenhum clube da IA com `countryKnowledge` (nenhum tem comissão).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/staffTypes.ts` | `CountryKnowledgeEntry`, `StaffMember.countryKnowledge?` |
| `src/Domain/scouting/scoutingConfig.ts` | `SCOUTING.COUNTRY` (todas as constantes) |
| `src/Domain/scouting/countryKnowledge.ts` (+ teste) | `baseCountryKnowledge`, `countryKnowledgeOf`, `growCountryKnowledge`, `pruneCountryKnowledge`, `countryGainMult`, `countryNoiseMult`, `countryBand`, `strongCountry`, `continentKnowledge`, `countryKnowledgeView`, `isScoutRole` |
| `src/Domain/scouting/missions.ts` (+ teste) | `MissionWeekInput.countryK`, multiplicadores no ganho e no relatório, `WeekResult.visits`; `seenProfile`/`buildReport`/`addProspects` com `noiseMult`/`gainMult` |
| `src/backend/scoutingWorld.ts` | Conhecimento do líder por país na semana, crescimento gravado no elenco |
| `src/backend/scoutingRoutes.ts`, `src/backend/staffRoutes.ts` | Campos novos e a rota de países |
| `src/GameInterface/NewGame/WorldMap.tsx` | `fillClassFor`, `onSelect` opcional |
| `src/GameInterface/Scouting/ScoutCountriesPanel.tsx`, `ScoutCountriesModal.tsx`, `StrongCountry.tsx` | Mapa + lista, modal, selo do país forte |
| `src/GameInterface/Scouting/MissionsTab.tsx`, `PlayerKnowledgePanel.tsx` | Clique no olheiro, conhecimento sobre o alvo |
| `src/GameInterface/Staff/StaffDetailModal.tsx`, `StaffCard.tsx`, `src/GameInterface/Transfers/StaffPoolTab.tsx` | Bloco de países, país forte |
| `scripts/scout-country-measure.ts` | Medição |

## Decidido (usuário, 2026-10-08)

1. **Nacionalidades da comissão ampliadas.** A comissão inicial de um clube nasce ~80% do país do clube e o resto
   de outro país do mesmo continente; a lista de livres tem profissionais de todos os 60 países do jogo, com peso
   maior para países com mais clubes (peso = clubes^0,5). Os nomes vêm dos jogadores daquela nacionalidade no mundo
   (com poucos nomes: dos jogadores dos clubes do país), determinístico pelo save (`src/Domain/staff/staffOrigin.ts`,
   `src/backend/staffNameBook.ts`). Os atributos sorteados não mudam; sem o livro (testes, `/lab`) valem as 8 listas
   embutidas de antes. Plano: Tarefa 5b.
2. **Tamanho das páginas.** Medir com o `worldMapPaths.ts`; acima de ~40 KB gzip por página, servir o desenho do mapa
   como arquivo estático (como fontes e bandeiras, `src/backend/staticAssets.ts`) nesta mesma etapa.
3. **Versão.** Esta etapa sai como **4.9** (a 4.8 está em `feat/season-awards`); o changelog conflita e é resolvido no
   merge.

## Pontos abertos (antes da decisão)

1. **Só 8 nacionalidades na comissão.** `STAFF_NATIONALITIES` (`staffNames.ts`) tem Inglaterra, Espanha, Brasil,
   Alemanha, Itália, Portugal, França e Argentina — todas da Europa ou da América do Sul. Nenhum olheiro nasce
   conhecendo a Ásia, a África ou a América do Norte (lá todos começam em 0), e o olheiro-chefe inicial de um clube do
   Quênia, por exemplo, é estrangeiro (missões no próprio país do clube a ×0,75 até ele aprender). O desenho aprovado
   não muda; ampliar os nomes por país (e com isso as nacionalidades) é trabalho de dados à parte. A comissão inicial
   continua com nacionalidade sorteada (não forçamos o país do clube).
2. **Tamanho do bundle.** `worldMapPaths.ts` tem ~86 KB e passa a entrar nas páginas de Equipe técnica, Transferências
   e Olheiro. O `import()` dinâmico não é separado pelo bundler do `Bun.serve` em produção (`ui-world.md`, rostos).
   Medir o aumento do bundle na Tarefa 10; se passar de ~40 KB gzip por página, servir os paths por uma rota estática
   com cache `immutable` (como as bandeiras) numa correção seguinte.
3. **Compatibilidade com a 4.8** (`feat/season-awards`): esta etapa não toca `scout-search` nem a busca do olheiro.
   O changelog e o `package.json` conflitam: a entrada 4.9 fica no topo, acima da 4.8; quem mesclar por último resolve
   o conflito mantendo as duas entradas e `CURRENT_VERSION = "4.9"`.
