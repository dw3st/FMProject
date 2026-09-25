# Importador de elencos da ESPN (mundo 2026/27)

Spec: `docs/superpowers/specs/2026-09-25-espn-roster-import-design.md`.

## Fontes

| Caminho | O que é |
|---|---|
| `data_process/native/` | Fonte dos 8 elencos nativos e das entradas nativas de `leagueData`, `leagueSchedules` e `countries`. **Edite aqui**, nunca em `src/example_data` |
| `data_process/espn/snapshot.json` | Snapshot da API pública da ESPN (clubes, elencos, técnicos). Gerado por `fetchEspn.ts` |
| `data_process/espn/logos/` | Escudos de 128 px por id de clube da ESPN |
| `data_process/espn/leagueMap.json` | Nosso slug ↔ código de liga da ESPN (34 ligas hoje) |
| `data_process/espn/clubOverrides.json` | `espnTeamId → squadId` quando o nome não casa sozinho |
| `data_process/espn/playerOverrides.json` | `espnAthleteId → playerId` |

`src/example_data/squads`, `leagueData.json`, `leagueSchedules.json`, `pyramids.json`, `databases.json`,
`logoIndex.json` e `logos/espn/` são saída de `importEspn.ts`. Não edite à mão.

## Regenerar

```bash
bun scripts/fetchEspn.ts            # único passo com rede (curl) — atualiza o snapshot
bun scripts/importOpenFootball.ts   # mundo base a partir de data_process/native + data_process/openfootball
cp -R src/example_data/. src/Data/  # sincroniza o runtime antes do importEspn (ele confere isso)
bun scripts/importEspn.ts           # overlay 2026/27: clubes, elencos, pirâmide, calendário, escudos
cp -R src/example_data/. src/Data/
bun run kits:generate 5
rm -f src/example_data/startKits/* && cp src/Data/startKits/* src/example_data/startKits/
```

`importEspn` recusa rodar se `src/Data/roles.json` não for byte-a-byte igual a `src/example_data/roles.json`
(ele lê papéis do runtime para a curva de idade) e recusa um mundo cujas ligas já estão em `202[6-9]`
(a temporada já avançou) — rode sempre a cadeia inteira a partir do `importOpenFootball`, nunca só o
`importEspn` de novo em cima do resultado anterior.

## `fetchEspn.ts`

Único script que toca rede (usa `curl`, porque o `fetch` do Bun falha contra a ESPN no Windows). Para
cada liga de `leagueMap.json`: busca os clubes (`/teams`), descarta os times-placeholder da ESPN
(`/^TBD\b/i` no nome), busca o elenco de cada clube (`/teams/{id}/roster`) e baixa o escudo em 128×128
pelo resizer de imagens da ESPN (`combiner/i?...&w=128&h=128`), preferindo a variante `dark` do array de
logos, depois `default`, depois a primeira disponível. Grava `snapshot.json` e `logos/{espnTeamId}.png`.

## Módulos (`scripts/espn/`)

| Módulo | Faz |
|---|---|
| `normalize` | Chaves de nome: `clubKey`/`looseClubKey` (tokens sem ruído de clube tipo "fc"/"sc"; a solta também tira "city"/"united"/"rovers"...) e `playerKey`. Decodifica entidades HTML (`&apos;` etc.) antes de normalizar |
| `matchClubs` | Override → exato → solto → prefixo → novo (`es_<espnId>`), sempre dentro do país. Ver seção abaixo |
| `matchPlayers` | Override → passe A (clube) → passe A2 (clube, sobrenome) → passe B (mundo inteiro). Ver seção abaixo |
| `lineup` | Composição nova de cada liga coberta pela ESPN; quem sai de uma liga coberta sem aparecer em outra desce para o nível não coberto mais alto do país (o grupo com menos clubes, depois por slug) ou sai do mundo se não houver nível abaixo |
| `aging` | Envelhece até 2 anos (`MAX_YEARS`) por curva de idade: delta médio por atributo por ano (16-21 +0,6 ... 35+ −0,6), repartido pelos `attrWeights` do melhor papel específico do jogador, com teto suave no crescimento (`1 − (v/10)²`) e o declínio pesando `speed`/`acceleration`/`stamina` em dobro |
| `estimate` | Jogador novo (sem par no mundo): base = mediana da linha (clube próprio se tiver ≥5 jogadores casados no total e ≥3 na linha, senão liga, senão mundo; clube novo sem base própria leva `NEW_CLUB_SHIFT = −0,3`), mais ajuste de idade e ruído determinístico. `fillSquad` completa mínimos por papel e `MIN_SQUAD` com jovens 17–19; `trimSquad` corta em `MAX_SQUAD = 30` |
| `logos` | `buildLogoIndex`: `squadId → "pasta/stem"`, escudo nativo (`logos/{ligaNativa}/{slug\|id}`) vence o da ESPN (`logos/espn/{id}.png`); sem nenhum dos dois, o clube fica fora do índice |
| `apply` | `applyEspn`: junta tudo (clubes, dedupe de atletas duplicados, jogadores, composição, tamanhos de elenco, metadados de clube novo), reconstrói pirâmide e zonas, ajusta o calendário e avança a temporada (+2 anos, `bumpSeason`) |

## Casamento de clubes (`matchClubs.ts`)

Ordem por país: **override → exato → solto → prefixo → novo**. Dentro de cada passe, o time da ESPN é
testado primeiro pelo `name`; o `shortName` só entra quando o `name` não bate com clube nenhum (evita
que um `shortName` genérico contamine um `name` que já casou limpo). Quando o conjunto de candidatos
tem 2 ou mais clubes, ele é restrito ao candidato que joga na mesma liga do time da ESPN — só quando
isso sobra exatamente um (resolve, por exemplo, "Zenit" contra "Zenit 2" sem precisar de override).

- **Exato** (`clubKey` igual): precisa ser único entre os clubes do país ainda não reivindicados.
- **Solto/prefixo** (`looseClubKey` igual, ou um `clubKey` prefixo do outro): precisam ser único entre
  **todos** os clubes do país que batem (reivindicados ou não) e, além disso, nenhum outro time da ESPN
  ainda não casado pode resolver para o mesmo candidato — chaves aproximadas colidem fácil (ex.: "Manchester
  United" e "Manchester City" caem na mesma chave solta "manchester"), e nesse caso nenhum dos dois casa
  aqui.
- Uma colisão no passe **exato** (dois times da ESPN batendo no mesmo clube) lança erro listando os dois
  — é um choque de nome de verdade, não motivo para cair em "novo" silenciosamente.

Hoje há **34 overrides**, a maioria exônimos em inglês/alemão que o `clubKey` não resolve sozinho:
`"FC Cologne"` → `1. FC Köln`, `"Rapid Vienna"` → `of_at_rapid_wien`, mais os duplicados nativo × seed
aberto do Leeds e do Fulham (o clube nativo vence, o `of_*` correspondente fica órfão).

## Casamento de jogadores (`matchPlayers.ts`)

`EXPECTED_AGE_GAP = 1` — o mundo fica uma temporada atrás do snapshot da ESPN, então o gap ideal
`espn.age − mundo.age` é 1, não 0. Janela aceita: 0 a 3 anos (`MIN_AGE_GAP`/`MAX_AGE_GAP`).

1. **Overrides** — `espnAthleteId → playerId`, aplicados antes de tudo; dois overrides no mesmo jogador
   lançam erro.
2. **Passe A (clube)** — candidatos são jogadores do mesmo clube (`squadId === teamSquadId` do atleta)
   cuja chave de nome normalizada (nome ou nome completo) bate. Ranqueado por distância de linha
   (GK/DEF/MID/FWD; GK só bate com GK) e depois por `|gap − EXPECTED_AGE_GAP|`. Empate entre os dois
   primeiros candidatos deixa o atleta sem casar. **Um atleta com qualquer candidato viável no próprio
   clube (mesmo que empatado) nunca vai para o passe A2 nem para o B** — um empate no próprio clube não
   é licença para procurar em outro lugar.
3. **Passe A2 (clube, sobrenome)** — só para atletas sem candidato no passe A, com idade e papel
   conhecidos. Resolve o caso comum de um jogador nativo abreviado (`"T. Hübers"`, nome completo `"Timo
   Bernd Hübers"`) contra o nome por extenso da ESPN (`"Timo Hübers"`): as chaves normalizadas nunca
   colidem, mas sobrenome + primeiro nome (ou a inicial) sim. Sem ranking: as listas de candidatos são
   montadas para todos os elegíveis de uma vez, e um par só é aceito quando é único **dos dois lados**
   (o atleta tem exatamente um candidato E aquele jogador é candidato de exatamente um atleta) — a ordem
   de processamento nunca decide quem ganha um candidato disputado.
4. **Passe B (mundo inteiro)** — só para atletas ainda sem casar e sem nenhum candidato no próprio clube,
   com idade e papel conhecidos, e só com chaves de nome de 2+ tokens (uma chave de um token como
   "pedro" só casa no próprio clube, nos passes A/A2). Um candidato de outro país só entra quando a
   distância de linha é 0 (mesma linha, nunca linha vizinha). Ranqueado por mesmo país primeiro, depois
   distância de linha, depois `|gap − EXPECTED_AGE_GAP|`; empate entre os dois primeiros deixa sem casar.

`typicalGap` (mediana de `espn.age − mundo.age` sobre os atletas casados com idade não nula) envelhece
**o mundo inteiro** pelo mesmo valor: um atleta casado com idade nula na ESPN, e todo jogador que sobra
em clubes não cobertos pela ESPN (para o mundo inteiro avançar no tempo de forma consistente, não só os
clubes com dados novos).

## Atletas duplicados

A ESPN às vezes lista o mesmo atleta em dois clubes (emprestado, ou clube reserva listado à parte). O
`apply.ts` mantém só um: **time que não é reserva primeiro** (reserva = nome menos o sufixo `II`/`B`/`2`
bate com o nome de outro time do snapshot), depois **tier de pirâmide mais alto**, depois **menor id de
time da ESPN**. O(s) outro(s) somem do elenco e entram em `report.duplicateAthletes`.

## Relatório (console do `importEspn`)

| Seção | O que fazer com ela |
|---|---|
| `fuzzyClubs` | Todo casamento por `loose`/`prefix` — dar uma olhada, não necessariamente errado |
| `newClubs` | Clube `es_<id>` criado do zero — checar se já não existe no mundo com outro nome |
| `suspectNewClubs` | Um `newClubs` cujo elenco casado veio ≥50% (e ≥3 jogadores) de UM clube deslocado/removido nesta rodada — sinal forte de casamento de clube que deveria ter resolvido; virar uma entrada em `clubOverrides.json` |
| `movedClubs` | Clubes que trocaram de liga por causa da composição nova da ESPN |
| `removedClubs` | Clubes que saíram do mundo (sem nível abaixo para cair) |
| `duplicateAthletes` | Atletas listados em dois times da ESPN — ver seção acima |
| jogadores casados/criados por liga | Taxa baixa é sobretudo clube/base de juniores que a ESPN não cobre e o mundo não tinha |
| `playersRemoved` | Jogadores originais de clube coberto sem atleta correspondente na ESPN, jogadores de clube removido, e cortados pelo `MAX_SQUAD` |
| `typicalGap` + histograma | O gap usado para envelhecer o resto do mundo; olhar a distribuição antes de confiar nele |
| média de overall por idade (todos e só casados) | Critério de aceitação: cada faixa etária dentro de ±0,5 do valor anterior |

## Precondições e recusas do `importEspn`

- `src/Data/roles.json` tem que ser byte-a-byte igual a `src/example_data/roles.json`.
- Recusa um mundo cujas ligas já estão em `202[6-9]` — rode sempre a cadeia completa
  (`importOpenFootball` → `importEspn`), nunca o `importEspn` duas vezes em sequência.
- Valida o mundo de saída (mínimo por linha e por elenco, nenhum id de jogador duplicado entre elencos)
  antes de escrever qualquer arquivo.

## Números atuais (snapshot 2026-09-25)

- ESPN: 34 ligas, 618 clubes, ~20,2 mil atletas.
- Clubes por tipo de casamento: override 34, exato 430, solto 1, prefixo 21, novo 132.
- ~10,2 mil jogadores casados com o mundo existente.
- Mundo resultante: 83 ligas, 1273 elencos, ~36,4 mil jogadores, 634 escudos indexados.

## Escudos no front

`squadLogoUrl(squadId)` (`src/GameInterface/Components/ClubLogo.tsx`) chama `logoUrlFromIndex`
(`src/Domain/world/logos.ts`) sobre `src/Data/logoIndex.json`: `squadId → "pasta/stem"`, servido em
`/api/logos/{pasta}/{stem}`. Clube fora do índice devolve `undefined` e a UI nem tenta a requisição —
cai direto no brasão de cores do `ClubLogo`. Os parâmetros antigos `leagueSlug`/`clubSlug` continuam na
assinatura pelos call sites existentes, mas não são mais usados.

## Limites

- **Ligas de ano civil** começam em 2027, mas a ESPN está na temporada de 2026 em andamento — a
  composição e os elencos de 2027 partem do que a ESPN tinha em 2026. Um `fetchEspn` depois da virada
  de ano corrige.
- **API não oficial.** Sem contrato de formato. `fetchEspn` e `importEspn` falham alto (erro, não
  fallback silencioso) quando algo essencial muda de forma.
