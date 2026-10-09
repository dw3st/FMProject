# Árbitros com nome, rigor e rosto

Desenho de 2026-10-09 a partir das decisões do usuário (nomes reais do Wikidata por país, rigor que mexe um pouco em
faltas e cartões sem mudar o volume do mundo, rosto `facesjs` no campo e nas telas, nomes gerados onde o Wikidata não
cobre). Versão **4.17** (a 4.15 é a inscrição e a 4.16 a remarcação, em outras branches; uma etapa nova do `docs/ROADMAP.md`, antes da 39 · VAR, que vai usar a escala e o
rigor daqui). Regras atuais que esta etapa toca: `.claude/rules/game-engine/fouls.md`, `game/discipline.md`,
`non-player-games.md` (quickSim), `graphics-engine.md` (`officials.ts`, `touchlineRender.ts`), `match-flow.md`
(Etapa 38), `ui-world.md` (rostos), `game/staff.md` (livro de nomes), `game/stats.md`, `ui-standard.md`,
`changelog.md`.

## Decisões

| Tema | Decisão |
|---|---|
| Quem existe | Por país do mundo (os 60 de `countries.json`): um **quadro de árbitros** e um **quadro de assistentes**. Reais do Wikidata (CC0) onde houver, completados com gerados do livro de nomes da comissão (`staffNameBook`) |
| Dado commitado | `data_process/wikidata/referees.json` (saída do script, revisável) → copiado para `src/example_data/referees.json`. Só reais; os gerados nunca são commitados |
| No save | `saves/{id}/referees/pool.json` (quadro do mundo, gerado no `createSave`, renovado na virada de cada país) e `saves/{id}/referees/state.json` (escala do dia, rodízio, estatísticas da temporada) |
| Rigor | `strictness` s ∈ [−1, 1], média 0 no mundo: **real** (cartões por jogo da carreira no Transfermarkt, relativos ao país) para quem tem o ID P3699, **sorteado** pelo id para os demais; mexe na chance de falta e nos cartões no motor (`foulChance`, `cardRoll`) e no quickSim (`rollDiscipline`); s = 0 / ausente = exatamente o jogo de antes |
| Qualidade | `quality` 0..100 (fama no Wikidata, árbitro FIFA, idade); só decide a escala (jogos grandes, continental). Nenhum efeito de partida nesta etapa (a 39 usa para o erro do juiz) |
| Escala | Por dia e por país, determinística (save + data + país); o melhor árbitro livre no jogo mais importante; descanso mínimo; o mesmo árbitro não apita o mesmo clube em sequência; continental com árbitro de outro país do continente; **torneios de base sem árbitro** (cartões da base já não contam) |
| Onde aparece | Prévia (rosto, nome, bandeira, rigor), Resumo da partida ao vivo, tela de resultado, resumo do dia; aba **Árbitros** em Estatísticas (cartões por árbitro); rosto no árbitro e nos bandeirinhas do campo |
| Rosto | A rota que já existe `GET /api/faces/person/:id.svg` (id `ref_*`), cores do uniforme de árbitro, idade real |
| `/test`, `/lab` | `/test`: seletor de rigor, rigor no `EnergyPanel` e nos logs `foul`/`card`, cenário `strict-referee`; `/lab`: `Variant.refereeStrictness` e linha "Referee" no `PairDetail` |
| `Statistics.ts` | Nada novo: faltas e cartões já existem; as estatísticas por árbitro são agregadas no servidor a partir do day log |
| Árbitras | Mulheres incluídas no quadro (Wikidata P21 feminino); rosto `facesjs` feminino |
| Inglaterra | O P27 do Wikidata é Reino Unido: escoceses, galeses e norte-irlandeses entram no quadro da Inglaterra |
| Saves antigos | Sem migração (protótipo): save sem `referees/` não tem árbitros (partidas como antes, s = 0) |

## 1. Dados do Wikidata

### 1.1 O que a busca encontrou (medido em 2026-10-09)

- A ocupação certa é **Q859528** ("association football referee", 7 915 pessoas). **Q202648**, citado no pedido, é
  "referee" genérico (1 777, vários esportes) e fica de fora. Assistentes: **Q223291** ("association football
  assistant referee", 325 pessoas, poucas com data de nascimento recente). "FIFA referee" (**Q20994440**) aparece como
  **P39** (cargo) em 199 árbitros nascidos de 1970 em diante, às vezes com início/fim.
- Árbitros homens (P21 = Q6581097), nascidos de 1977 a 2000 (27 a 50 anos em 2027), por país do jogo (P27 → P297):
  32 países com 12 ou mais, 20 com 4 a 11, 8 com menos de 4 (Nigéria 0, Dinamarca 1, Indonésia 1, Quênia 2, Gana 2,
  Fiji 3, Islândia 3, África do Sul 3). Exemplos: Inglaterra 42 (o P27 é Reino Unido: entram escoceses e galeses),
  Itália 90, Brasil 22, Argentina 22, EUA 12.
- Campos úteis em quem nasceu de 1976 em diante (2 367): data de nascimento 100%, sexo ~100%, país ~85%, ID de árbitro
  do Transfermarkt (P3699) ~53%, imagem 24%, `wikibase:sitelinks` (número de Wikipédias, mediana 1, p90 10, máximo
  46). Há ruído: pessoas com cargos políticos (P39 de parlamentar) que também apitaram — filtradas.
- Nenhum dado de cartões ou de categoria nacional no Wikidata. Os cartões vêm do Transfermarkt (ID P3699, §1.3).

### 1.2 Script `scripts/fetchWikidataReferees.ts`

Mesmo molde do `fetchWikidataCoaches.ts` (worktree `data/current-coaches`, ainda não mesclado) — curl contra
`query.wikidata.org/sparql`, respostas em `data_process/wikidata/cache/referees/` (gitignored), pausa entre pedidos,
`User-Agent` do projeto. Lógica pura em `scripts/wikidata/refereesSource.ts` (com teste):

1. Uma consulta por ocupação (Q859528, Q223291): item, rótulo (en, depois as línguas de `NAME_LANGS`), P27 → ISO2,
   P1532 (país do esporte) quando houver, P569, P570 (morto = fora), P21, `sitelinks`, P39 = Q20994440 com
   P580/P582, P3699 (só guardado).
2. Filtro: humano, homem ou mulher (P21; decisão do usuário: árbitras incluídas), sem data de morte, idade em
   2027 entre 27 e 50, nenhum P39 que não seja "FIFA referee", país do esporte (P1532) antes da cidadania, país mapeado
   para os 60 do jogo pela mesma convenção do `normalizeNationality` (ISO2 `GB` = Inglaterra).
3. Por país, ordenado por `fifa` (cargo aberto ou terminado em 2024+), depois `sitelinks`, depois nascimento mais
   recente: no máximo **24 árbitros** e **12 assistentes** reais. Quem é árbitro e assistente fica só como árbitro.
4. Saída `data_process/wikidata/referees.json`:

```ts
interface RefereeSource {
  id: string;              // "ref_Q12345"
  wikidataQid: string;
  name: string;            // rótulo, entidades HTML decodificadas, sem espaços nas pontas
  country: string;         // nome do país do jogo ("England")
  birthDate: string;       // YYYY-MM-DD
  role: "referee" | "assistant";
  gender: "male" | "female";
  fifa: boolean;
  sitelinks: number;
  tmId?: string;           // P3699 (só para o passo do Transfermarkt; não vai para o example_data)
  strictness?: number;     // rigor real derivado (§1.3), duas casas; ausente = sorteado pelo id
  tmMatches?: number;      // jogos na carreira usados no rigor (amostra; o número de cartões nunca é guardado)
}
```

`src/example_data/referees.json` = cópia (o `importOpenFootball`/`importEspn` não mexem nele). Tamanho esperado:
~1 300 entradas, ~150 KB. Nada de foto: só nome, país, nascimento, sexo, os dois sinais de fama e o rigor derivado.

### 1.3 Rigor real (Transfermarkt)

A API local do Transfermarkt (`C:/Projects/transfermarkt-api`, a mesma de `fetchTransfermarkt.ts`) não tem rota de
árbitro, e a rota `/referee/:id` da tmapi só devolve o perfil (sem números). Os números da carreira saem da página de
perfil do árbitro (`transfermarkt.com/-/profil/schiedsrichter/<id>/saison_id/0`, linha de totais: jogos, amarelos,
segundo amarelo, vermelhos, pênaltis), baixada por `scripts/fetchTransfermarktReferees.ts` com cache em
`data_process/transfermarkt/cache/referees/` (gitignored, como o resto do cache do Transfermarkt) e pausa entre
pedidos. Só o rigor derivado entra no repositório (`strictness` e `tmMatches` em `referees.json`), nunca os cartões.

```
taxa      = (amarelos + 2º amarelo + 2 × vermelhos) / jogos            (só com jogos ≥ 20)
referência = mediana da taxa dos árbitros do país (≥ 5 com taxa), senão a mediana do mundo
z         = ln(taxa / referência) × jogos / (jogos + 40)                (encolhe amostras pequenas)
s         = clamp(z × k, −1, 1), k tal que o desvio-padrão dos reais = 0,41 (o do sorteado)
          − média dos reais (a parte real fica com média 0)
```

Relativo ao país porque o motor tem a mesma disciplina em todas as ligas (a cultura de cartões de cada liga não entra
aqui, só a do árbitro dentro dela).

## 2. Quadro do save (`referees/pool.json`)

```ts
interface Referee {
  id: string;              // "ref_Q12345" (real) | "ref_g_<país>_<ano>_<n>" (gerado)
  name: string;
  country: string;         // país do jogo
  birthDate: string;
  role: "referee" | "assistant";
  quality: number;         // 0..100
  strictness: number;      // −1..1, fixo na carreira
  fifa: boolean;
  generated?: true;
  since: string;           // data em que entrou no quadro (gerado: na virada)
}
interface RefereePool { referees: Referee[]; renewed: Record<string, string> } // país → data da última renovação
```

### 2.1 Tamanho por país

`partidas por rodada` = soma de ⌊clubes/2⌋ das ligas do país (pelo índice de squads do save). Medido no mundo
2026/27: Itália 47, Rússia 39, Argentina 33, Brasil 30, Inglaterra 22, Espanha 21 … 4 a 9 na maioria; 630 no mundo.

```
árbitros     = max(10, ceil(1,5 × partidas por rodada))     // Itália 71, Inglaterra 33, Alemanha 14, Eslovênia 10
assistentes  = 2 × árbitros
```

Folga de 1,5× para o descanso mínimo (§3.3) e a copa no meio da semana. Total no mundo ~1 000 árbitros e ~2 000
assistentes (~350 KB no save). Os reais entram primeiro; o resto é gerado.

### 2.2 Gerados

`drawStaffOrigin(book, rng, país)` (o mesmo livro de nomes da comissão; ~8% mulheres, nome feminino do livro quando
houver, senão o mesmo livro), sempre do próprio país (nunca outro país do
continente), semente `referee:<save>:<país>:<n>`; idade 30–44 sorteada; `quality` 15–55 (uniforme), `fifa` falso.
Sem o livro (testes, `/lab`) as listas embutidas de `staffNames.ts`.

### 2.3 Qualidade

```
real:    quality = 45 + 40 × pct(sitelinks no país) + 12 × fifa + idade(−6..+3), limitado a 30..98
         idade: < 32 → −6, 32–37 → 0, 38–45 → +3, 46–50 → 0
gerado:  15..55
```

`pct` = percentil do árbitro entre os reais do país pelo `sitelinks` (empates: meio). Num país sem reais, os
melhores gerados apitam a 1ª divisão — é a regra, não falha.

### 2.4 Rigor

```
real (referees.json com strictness): esse valor (§1.3)
senão: u1, u2 = mulberry32(seedFrom("referee-strict:<id>"))  // o mesmo id dá o mesmo rigor em qualquer carreira
       strictness = (u1 + u2) − 1                             // triangular em [−1, 1], média 0, dp 0,41
```

Faixas mostradas: **Tolerante** (s ≤ −0,35), **Equilibrado**, **Rigoroso** (s ≥ 0,35) — ~30% / 40% / 30% do mundo. O
número nunca aparece; o jogador vê a faixa e, com jogos, os cartões por jogo.

### 2.5 Renovação (virada de cada país, passo 3, junto da temporada dos técnicos)

- Todo árbitro do país envelhece pela data; aposenta com 50 anos feitos, ou com chance 25% a partir dos 46
  (`seedFrom(referee-retire:<save>:<id>:<ano>)`).
- `quality` dos que ficam: +2 até os 38, 0 até os 45, −2 depois (limite 15..98).
- Os aposentados saem do quadro (e do `state.json` na próxima poda); o país é completado com gerados até o tamanho de
  §2.1 (o tamanho é recalculado: acesso e rebaixamento entre países não existem, mas a pirâmide pode mudar de tamanho).
- `fifa` dos reais fica; um gerado vira `fifa` quando `quality ≥ 80` (o país precisa de nomes na continental).

## 3. Escala (`src/Domain/referees/assign.ts`, puro)

### 3.1 Quando

`ensureAssignments(saveId, date)` (`src/backend/refereeWorld.ts`) calcula e grava a escala de uma data se
`state.json` ainda não a tem; chamada pelo `advanceDay` antes de jogar o dia e pela rota `match-setup` (a partida ao
vivo e a prévia leem a mesma escala que o avanço vai usar). `state.assignments` guarda só a data de hoje e a de amanhã
(a prévia pode abrir na véspera); o resto é podado.

```ts
interface RefereeAssignment { refereeId: string; assistantIds: [string, string] }
interface RefereeState {
  season: Record<string, string>;                         // país → rótulo da temporada das estatísticas
  assignments: Record<string, Record<string, RefereeAssignment>>; // data → fixtureId → escala
  lastWorked: Record<string, string>;                     // árbitro/assistente → última data
  recentByClub: Record<string, string[]>;                 // clube → últimos 3 árbitros
  stats: Record<string, RefereeSeasonStats>;              // árbitro → temporada atual
}
interface RefereeSeasonStats {
  matches: number; fouls: number; yellows: number; reds: number; penalties: number;
  byCompetition: Record<string, { matches: number; yellows: number; reds: number }>;
}
```

### 3.2 Importância do jogo

```
liga:        100 − 25 × (nível − 1) + 15 × topo (os dois clubes na metade de cima da tabela) + 10 × clássico (isDerby)
             + 10 × última quinta parte da temporada
copa:        60 + 8 × índice da fase (final = máximo) − 20 × (nível do clube mais alto − 1)
continental: 120 + 10 × índice da fase (grupos 0 … final 4)
```

Desempate pelo `fixtureId`. Base (`u21_`/`u19_`): sem árbitro.

### 3.3 Regra

Para cada país, as partidas do dia das competições do país (ligas e copa) em ordem decrescente de importância; para cada
uma, o árbitro **disponível** de maior `quality`, com um ruído determinístico de ±6 (`seedFrom(ref-pick:<save>:<data>:
<fixtureId>:<id>)`) para os mesmos dois árbitros não pegarem sempre os mesmos jogos.

- Disponível: do país, não escalado hoje, `lastWorked` há pelo menos **3 dias**, e não está em `recentByClub` de
  nenhum dos dois clubes (relaxado se ninguém sobra: primeiro o rodízio, depois o descanso; nunca um árbitro duas
  vezes no mesmo dia).
- Assistentes: os dois assistentes disponíveis de maior `quality` do país, com as mesmas regras de descanso
  (sem o rodízio por clube).
- **Continental:** antes das ligas do dia (as continentais usam o quadro de vários países). Candidatos: árbitros de
  países do continente da competição que não sejam os países dos dois clubes, com `fifa` ou `quality ≥ 75`; os
  assistentes vêm do país do árbitro. O árbitro escalado não apita a liga do país dele nesse dia.
- Quadro vazio (save sem `referees/`): nenhuma escala; a partida joga com s = 0.

### 3.4 Determinismo

Mesma entrada (quadro, estado, partidas do dia, tabelas) → mesma escala; nenhuma leitura de `Math.random`. Um dia
refeito (falha no `flush`) encontra a escala já gravada ou a recalcula igual.

## 4. Efeito no motor e no quickSim

### 4.1 Motor (`Fouls.ts`)

`FoulContext.strictness?` e `CardContext.strictness?` (s do árbitro; ausente = 0):

```
falta    × (1 + REFEREE.FOUL_WEIGHT × s)        FOUL_WEIGHT   0,08
amarelo  × (1 + REFEREE.YELLOW_WEIGHT × s)      YELLOW_WEIGHT 0,15
vermelho × (1 + REFEREE.RED_WEIGHT × s)          RED_WEIGHT    0,25   (vermelho direto)
÷ REFEREE_CARD_NORM nos dois cartões quando s ≠ 0 (começa em 1; ajustado só se a medição pedir)
```

Constantes em `src/Domain/referees/refereeConfig.ts` (`REFEREE`), as funções `refereeFoulMult` / `refereeYellowMult`
/ `refereeRedMult` em `src/Domain/referees/strictness.ts`, como `temperamentFoulMult`. O pênalti sai das faltas na
área, então também sobe com o rigor no motor. Nenhum sorteio novo: só os limiares mudam, então s = 0 é idêntico jogo a
jogo com o mesmo `Math.random`.

O rigor vem de `GameState.referee?: { id; name; country; strictness }` (dado puro, entra no snapshot de debug e no
MCP), posto por `withReferee(state, referee)` logo depois do `createMatchState`, em `simulateMatch(..., { referee })` e na partida ao vivo
(`MatchScreen`, a partir do `match-setup`). `gameState.ts` lê `state.referee?.strictness` ao montar o
`FoulContext`/`CardContext`. Debug `foul`/`card` ganham `refMult`.

### 4.2 quickSim (`rollDiscipline`)

`QuickSimInput.refereeStrictness?`: o número de faltas do lado × `refereeFoulMult(s)`, os pênaltis
(`PENALTIES_PER_SIDE`) × o mesmo fator (o placar continua igual: só a conversão de gols em pênalti muda), o amarelo e o
vermelho direto por falta × os fatores do motor ÷ `REFEREE_CARD_NORM`. s = 0 sorteia exatamente o de antes (mesmo
`rng`, mesmos números).

### 4.3 Volume do mundo

Com s simétrico de média 0 os termos lineares somem; sobram os cruzados: amarelos +0,2% (E[(1+0,08s)(1+0,15s)] = 1 +
0,012 × 0,167), vermelhos (quase todos segundo amarelo) ~+1,3% pela conta de ordem 2. Dentro da meta de ±3% sem
normalizador; a medição (§7) confirma ou ajusta `REFEREE_CARD_NORM`.

### 4.4 Diferença visível

Rigoroso típico (s = +0,75) × tolerante típico (s = −0,75): faltas ×1,13, amarelos ×1,41 (1,06 × 1,11 / 0,94 × 0,89),
vermelhos ~×1,8. Nos extremos (±1): amarelos ×1,59. Numa temporada de ~30 jogos a média de cartões de dois árbitros
de faixas opostas fica claramente diferente na aba Árbitros.

## 5. Day log, estatísticas e rotas

- `MatchEvent.referee?: { id; name; country }` (o rigor não vai para o log), gravado pelo `advanceDay` a partir da
  escala (nunca do cliente), em `buildMatchEvent` e `buildQuickMatchEvent` como o `pitchCondition`.
- `recordRefereeDay` (`refereeWorld.ts`) soma, para cada partida do dia com árbitro: jogos, faltas (as duas equipes),
  amarelos, vermelhos e pênaltis, por competição; `lastWorked` e `recentByClub`. Na virada do país, as estatísticas dos
  árbitros do país vão para `saves/{id}/referees/seasons/<país>-<temporada>.json` (arquivo, para a aba mostrar
  temporadas passadas) e zeram.
- `GET /api/saves/:id/referees?competition=<slug>&season=<rótulo>` (`src/backend/refereeRoutes.ts`, dono do save):
  `{ seasons, items: [{ id, name, country, band, matches, foulsPerMatch, yellowsPerMatch, reds, penalties, fifa }] }`
  dos árbitros com pelo menos um jogo na competição (liga, copa, continental; `all` = todas). 400 slug inválido, 404 sem
  dados.
- `POST /api/match-setup` devolve `referee: { id, name, country, band, age, assistants: [{ id, name, age }] } | null`.

## 6. Telas

- **Prévia** (`MatchPreviewScreen`): cartão "Árbitro" com rosto 48px, nome, bandeira (`<Flag>`), faixa de rigor e,
  com jogos na temporada, "N jogos · X amarelos/jogo".
- **Partida ao vivo**: no painel "Resumo" (`MatchSummaryPanel`), linha do árbitro (rosto 32px, nome, bandeira);
  no campo, árbitro e bandeirinhas com rosto (§6.1).
- **Resultado** (`MatchResultScreen`) e **resumo do dia** (`DaySummaryModal`, só nas partidas com jogadores): "Árbitro:
  nome (bandeira)".
- **Estatísticas → aba Árbitros** (`?tab=referees`): seletor de competição (o mesmo das outras abas) e de temporada;
  tabela no padrão `StatsTable`: rosto 32px, nome, bandeira, faixa, J, faltas/J, amarelos/J (coluna destacada),
  vermelhos, pênaltis; ordenável por amarelos/J. Árbitro do próximo jogo do clube destacado.
- i18n `referees.*` (en, pt-BR); texto curto, sem termos técnicos.

### 6.1 Rosto no campo

- `makeOfficial` passa a ter cabeça como o `makeCoach`: corpo no uniforme (`OFFICIAL_LOOK.KIT`) e a cabeça com o rosto
  (`loadFaceCanvas`, recorte circular) sobre um disco da cor do uniforme até carregar; cartões e bandeira como hoje.
- Prop `officials` do `PixiPitch`: `boolean | { refereeFace?: string; assistantFaces?: [string?, string?] }` (lida na
  montagem, como hoje); `true` = sem rostos (o `/test` sem escala).
- URL: `personFaceUrl("ref_…", country, REFEREE_FACE_COLORS, age)` com `REFEREE_FACE_COLORS = ["#111418", "#111418",
  "#f5d020"]` (camisa preta, gola amarela). Nenhuma rota nova; `PERSON_FACE_VERSION` não muda (as entradas novas não
  existiam no cache).

## 7. `/test`, `/lab`, medições

- **`/test`**: seletor "Referee" (Off · Tolerante −1 · −0,5 · 0 · +0,5 · Rigoroso +1) que define `GameState.referee`
  (árbitro de teste com rosto); `EnergyPanel` mostra `ref s · foul × · yellow ×`; logs `foul`/`card` com `refMult`;
  cenário `strict-referee` (s = +1, faltas forçadas como no `foul-in-box`).
- **`/lab`**: `Variant.refereeStrictness` (slider −1..1, ausente = 0; o da variante A vale para o jogo, como o
  `pitchCondition`), rótulo `· ref ±N`, `TeamRawStats.refereeStrictness` → `VariantSummary.avgRefereeStrictness` →
  linha "Referee" no `PairDetail`; quickSim recebe o mesmo valor.
- **Medições** (`bun scripts/referee-measure.ts`, como `personality-measure.ts`):
  - **M1 volume do mundo:** motor (Premier + Championship, 600 + 600, `--engine-seed`) e quickSim (26 ligas × 1000,
    pareado), cada partida com um rigor sorteado da distribuição × todos em 0. Aceite: faltas, amarelos e vermelhos
    dentro de **±3%**; gols e chutes dentro do ruído.
  - **M2 rigoroso × tolerante:** mesmo clube dos dois lados, 400 jogos por braço, s = +0,75 × −0,75 e +1 × −1. Aceite:
    amarelos **×1,3–1,5** em ±0,75 (×1,45–1,65 em ±1), faltas ×1,08–1,2, gols ±4%.
  - **M3 escala:** uma temporada do mundo (`market-sim`-like, só calendário): jogos por árbitro (p10/p50/p90), nenhum
    árbitro duas vezes no mesmo dia, nenhum com menos de 3 dias de descanso salvo relaxamento (contado), maior sequência
    do mesmo árbitro num clube, % dos jogos da 1ª divisão apitados pelos 25% melhores do país.

## 8. Testes e smoke

- Puros: `refereesSource.test.ts` (filtros, país, ordenação), `pool.test.ts` (tamanho, gerados determinísticos,
  qualidade, rigor média ~0, renovação), `assign.test.ts` (determinismo, descanso, rodízio, continental de outro país,
  base sem árbitro, relaxamento), `strictness.test.ts` (s = 0 devolve 1 exato), `Fouls.test.ts` (rigor),
  `quickSim.test.ts` (s = 0 idêntico com a mesma semente; s = +1 > s = −1 em cartões em 2000 sementes).
- Motor: `Referee.engine.test.ts` (s = 0 jogo a jogo igual ao sem árbitro com `Math.random` semeado).
- Rotas: `referees.routes.test.ts` (dono, 400/404, agregação), `match-setup` com `referee`.
- `scripts/season-rollover-smoke.ts`, seção **"Árbitros"**: toda partida de liga/copa/continental do log com
  `referee`, nenhuma de base; nenhum árbitro em duas partidas no mesmo dia; continental sempre de outro país; soma das
  estatísticas = cartões dos logs; a partida do clube do jogador com o árbitro da escala da véspera; na virada, quadro do
  país completo e sem ninguém com 51+; médias de disciplina continuam nas faixas da seção "Disciplina".

## 9. Limitações

- Rigor real só para quem tem ID do Transfermarkt; os demais (e todos os gerados) têm rigor sorteado. Sem categoria
  nacional (só fama e FIFA).
- O rigor real é a carreira inteira (eras antigas misturadas), relativo ao país.
- Sem erro do juiz, VAR ou reclamação (Etapa 39); a qualidade não muda a partida.
- O mesmo rigor para faltas dos dois lados (sem "caseiro").
- Torneios de base sem árbitro.
- O uniforme é sempre preto: um clube de camisa preta fica parecido com o árbitro no campo.

## 10. Decisões do usuário (2026-10-09)

1. **Rigor real pelo Transfermarkt:** sim, para quem tem o ID (§1.3); só o rigor derivado vai para o repositório; a
   média do mundo continua neutra e o volume é medido (±3%).
2. **Mostrar o rigor:** a faixa (Tolerante / Equilibrado / Rigoroso) sempre visível (prévia, aba Árbitros), junto com
   os números da temporada.
3. **Árbitras:** incluídas.
4. **Base:** sem árbitro.
5. **Inglaterra:** aceita árbitros do Reino Unido (escoceses, galeses).

## 11. Implementação (2026-10-09)

- **Escopo dos reais (decisão do usuário):** só os 10 países das ligas principais (`LEAGUES` de `scripts/faces/wikidata.ts`); os outros países têm quadro só gerado. Gerados só homens (o livro de nomes não tem nomes femininos).
- **Dados:** 237 reais (236 árbitros, 1 assistente; 53 mulheres; 205 com ID do Transfermarkt; 172 com rigor real, ≥ 20 jogos). No quadro de um save: 999 árbitros + 1 998 assistentes, 206 árbitros reais (37 mulheres), 147 com rigor real. Rigor real: média 0,000, dp 0,373; faixas 14% / 70% / 16%. Sorteado: 21% / 53% / 21% (o §2.4 dizia 30/40/30: a triangular dá 21% em cada ponta). Média do mundo 0,004.
- **Transfermarkt:** a API local não tem rota de árbitro; os totais vêm da página de perfil (`/-/profil/schiedsrichter/<id>/saison_id/0`), cache gitignored.
- **Clássico** fora da importância (exigiria ler as cidades dos elencos do dia).
- **`CARD_NORM` = 1,01** (quickSim, 26 ligas × 1000 pareado: com 1,0 os vermelhos subiam +4,9% / +2,3% em duas sementes; com 1,01, amarelos −0,4%, vermelhos +0,3%, faltas −0,2%).
- **M1 motor, primeira rodada** (mundo antes da 4.16; Premier + Championship, 600 + 600 por braço, não pareado): faltas −0,5%, amarelos −5,0%, vermelhos −17% (~100 eventos), pênaltis −10%, gols −2,6%.
- **M1 motor, refeito no mundo da 4.16** (`world <liga> 600 [--neutral] --engine-seed 11|22 --seed 1|2`, Premier + Championship, duas sementes somadas: 2 400 jogos por braço; por jogo, os dois times):

  | | sem árbitro (s = 0) | rigor do mundo | Δ |
  |---|---|---|---|
  | Faltas | 10,686 | 10,713 | +0,3% |
  | Amarelos | 2,317 | 2,331 | +0,6% |
  | Vermelhos | 0,0765 (~184) | 0,0865 (~208) | +13% (intervalo de ±14% pelo Poisson) |
  | Pênaltis | 0,353 | 0,351 | −0,6% |
  | Gols / chutes | 1,984 / 5,08 | 2,002 / 5,15 | +0,9% / +1,4% |

  Por semente (média das duas ligas): semente 11 faltas +1,9%, amarelos +2,8%; semente 22 faltas −1,3%, amarelos −1,5%. Somadas, faltas e amarelos dentro de ±3% (aceite); vermelhos e pênaltis dentro do ruído; `CARD_NORM` não mudou.
- **M2** (Premier, mesmo clube, 400 jogos): ±0,75 amarelos ×1,31, faltas ×1,06, vermelhos ×2,3; ±1 amarelos ×1,55, faltas ×1,07, vermelhos ×3,1. Faltas um pouco abaixo da meta (×1,08–1,2): a chance de falta tem teto e só existe em disputas.
- **M3 escala** (`referee-measure.ts schedule 365`, save novo da Premier, 365 dias a partir do início do mundo (2026-08-15, sem kit nem virada), só calendário): 18 055 partidas com árbitro, nenhuma sem escala; jogos por árbitro p10 0 · p50 16 · p90 39 · máx 60 (999 árbitros); nenhum árbitro duas vezes no mesmo dia; descanso abaixo de 3 dias relaxado 151–159 vezes (0,9% das escalas), rodízio por clube relaxado 20–22; maior sequência do mesmo árbitro com um clube: 2; 1ª divisão: 49% dos jogos com os 25% melhores do país (o dobro da parcela deles); continental: 384 jogos, 0 com árbitro do país de um dos clubes. 106 árbitros (10,6%, de 32 países) não apitam: são os de menor qualidade (média 21 × 45 dos que apitam), reservas do quadro de 1,5 × as partidas da rodada — aceito, sem mudança.
- **Custo do avanço do dia** (`bench-advance-day.ts --buffered --days 14`, carreira da Premier, duas rodadas alternadas main 4.16 × branch): média sem o motor completo 3 453 → 3 502 ms (+1,4%); dias sem jogo do jogador 2 948 → 3 010 ms (+2,1%); média com o motor 4 510 → 4 545 ms (+0,8%). Meta ≤ +5%: ok.
