# Base de dados "open world" — Design

**Data:** 2026-09-23
**Status:** aprovado

## Objetivo

Ampliar o mundo do TouchLines de 8 ligas para cerca de 80, com os clubes e jogadores do
`seed-real.json` do SportsManagerInterativo (dataset open-football: 91 ligas, 1236 clubes,
54 423 jogadores). O mundo fica mais aberto:

- toda liga tem calendário, tabela e resultados;
- dá pra começar a carreira em qualquer liga;
- existe acesso e rebaixamento entre as divisões de um mesmo país.

## Decisões

| Decisão | Escolha |
|---|---|
| Simulação | Híbrida. A liga do jogador e até 3 ligas "seguidas" usam o motor completo (`full`); as demais usam um simulador rápido (`fast`) |
| Jogáveis | Todas as ligas importadas |
| Acesso/rebaixamento | Entra neste trabalho |
| Forma de importar | Importador offline que gera arquivos no formato nativo (abordagem A) |
| Ligas que já existem | As 8 atuais ficam como estão (dados reais da API-Football). O seed só entra onde o TouchLines não tem nada |
| Compatibilidade de save | Nenhuma. Saves antigos ficam inválidos (regra do CLAUDE.md) |

## 1. Importador e derivação de atributos

**Fonte:** `data_process/openfootball/seed-real.json`, copiado do SportsManagerInterativo junto
com `LICENSE-open-football.txt` e `NOTICE-open-football.txt`.

**Script:** `scripts/importOpenFootball.ts` (Bun), rodado manualmente. Ele grava em
`src/example_data/` e é idempotente: todo arquivo gerado leva `source: "open-football"`, e uma
nova execução substitui apenas esses arquivos.

### Filtros

- Descarta ligas com menos de 8 clubes.
- Pula as ligas que o TouchLines já tem. Um mapa explícito em
  `data_process/openfootball/overlap.json` liga o slug do seed ao slug do TouchLines (Premier
  League, Bundesliga, La Liga, Serie A, Ligue 1, Brasileirão A/B). Não há casamento por nome.
- Elenco com no máximo 30 jogadores. Primeiro garante 3 goleiros e a profundidade mínima por
  setor da tabela do tier `low` em `sellList` (GK 3, DEF 7, MID 7, FWD 4); o resto das vagas
  vai para os maiores OVR.

### Calibração

A média dos 13 atributos de um jogador de linha no TouchLines fica entre 1,5 e 4,1 em 10 (do
10º ao 90º percentil). Não dá pra usar escala linear a partir do OVR.

1. Nas ligas sobrepostas, casa os jogadores do seed com os do TouchLines pelo nome normalizado
   (sem acento, minúsculo), dentro do mesmo clube.
2. Para cada papel do TouchLines e cada atributo, ajusta uma reta `atributo = a + b × OVR` por
   mínimos quadrados.
3. Se um papel tiver menos de 30 pares, usa os coeficientes do papel-irmão do mesmo setor
   (por exemplo, LWB usa LB).
4. Salva os coeficientes em `data_process/openfootball/calibration.json` para auditoria e
   ajuste manual.

### Derivação por jogador

- `atributo = clamp(round(a + b × OVR + ruído), 0, 10)`. O `ruído` fica em ±0,5, com semente
  no hash de `playerId + atributo`: é determinístico e evita que jogadores com o mesmo OVR
  saiam idênticos.
- As posições do seed (`DL`, `WBL`, `AML`…) viram os papéis do TouchLines (`LB`, `LWB`,
  `LW`…) por uma tabela fixa no script, ordenadas pelo nível de proficiência do seed.
- Idade, pé e nome vêm do seed. `potential` é descartado, porque o sistema de desenvolvimento
  não usa potencial oculto.
- `profile.archetype` e `profile.summary` são gerados a partir do papel e dos 2 atributos mais
  altos, por templates.

### Clube

- Cores: `colorBg` e `colorFg`. `logo` fica ausente.
- `venue.capacity` e `finances` derivados da reputação da liga e do clube, pelo modelo de
  tiers do `finance.md` (LOW, MEDIUM, HIGH, ELITE).
- `coach.name` gerado de forma determinística pelo `clubId`.

### Saídas

| Arquivo | Conteúdo |
|---|---|
| `squads/{leagueSlug}/{clubSlug}.json` | Elencos novos |
| `leagueData.json` | Entradas novas com `zones` (`prom` e `rel`, coerentes com a pirâmide) |
| `countries.json` | Países novos (`playable: true`) + `continent` |
| `leagueSchedules.json` | Substitui `LEAGUE_SCHEDULE_CONFIGS`. Todas as ligas de um país compartilham a data de início |
| `pyramids.json` | Pirâmide por país (seção 3) |
| `databases.json` | Contadores do banco "Official" atualizados |
| `startKits/*` | Regenerados com `bun run kits:generate` |

Calendário: por padrão, o europeu (ago → mai, `crossYear: true`). Países de ano civil
(`crossYear: false`, fev/mar → nov/dez) ficam listados no script: Brasil, Argentina, Chile,
Uruguai, Paraguai, Peru, Colômbia, Venezuela, EUA, Japão, Noruega, Suécia, Finlândia e Islândia. O `baseWeekOffset` escalona as ligas dentro de cada país.

## 2. Simulador rápido

**Arquivos:** `src/Domain/advanceDay/quickSim.ts` e
`src/GameEngine/Configs/QuickSimConfig.ts`.

`quickSimMatch(home, away, homeLineup, awayLineup, rng): PlayedMatchRecording` é uma função
pura. O resultado passa por `buildMatchEventFromRecording`, que já chama
`finalizeSquadsAfterMatch`. Energia, `seasonLog` e desenvolvimento funcionam sem código novo.

### Modelo

1. **Força por setor** dos 11 escalados, com desconto de energia:
   - ataque = média de finalização, drible, velocidade e aceleração dos FWD e dos MID ofensivos;
   - meio = média de passe, visão e pressão dos MID;
   - defesa = média de desarme, pressão, força e cabeceio dos DEF e dos CDM;
   - goleiro = média de reflexo, salto e pressão do GK.
2. **Gols esperados:**
   `xG_casa = BASE_GOALS × (ataque_casa × meio_casa) / (defesa_fora × goleiro_fora) × HOME_ADVANTAGE`.
   O `xG_fora` usa a mesma fórmula, sem o fator de mando. Os gols saem de uma Poisson.
3. **Autor do gol:** sorteado entre os escalados, com peso `ROLE_GOAL_WEIGHT[papel] × finalização`.
   **Assistência:** sorteada entre os outros escalados, com peso `ROLE_ASSIST_WEIGHT[papel] × passe`,
   e sem assistência com probabilidade `NO_ASSIST_RATE`.
4. **Estatísticas por jogador** (passes, chutes, desarmes, interceptações): geradas em
   proporção ao papel e à força do setor. A nota final aplica as mesmas regras de rating do
   `player-scores.md` sobre essas estatísticas.
5. **Energia:** queda média por jogo igual à do motor (`ENERGY_DRAIN`).

### Calibração

O script `scripts/quicksim-calibrate.ts` joga N partidas pelos dois caminhos, motor e
`quickSim`, com os mesmos elencos, e compara média de gols, % de vitória do mandante e % de
empates. Meta: o `quickSim` fica a ±10% do motor nas três métricas.

### Modo por liga

- `meta.activeLeagues[i].simMode: "full" | "fast"`.
- Fica `full` a liga do clube do jogador e as ligas em `meta.followedLeagues` (até 3). Todas
  as outras ficam `fast`.
- O modo é recalculado quando o jogador troca de liga (acesso, rebaixamento ou mudança de clube)
  e quando ele muda as ligas seguidas.

### Log do dia

Partidas `fast` gravam um `MatchEvent` compacto: `score`, `scorers` e `fixtureId`, com
`playerStats`, `teamStats` e `playerRatings` omitidos. O tipo ganha `compact?: true`, e as telas
que exibem detalhes tratam esse caso ("Resumo indisponível — liga simulada").

### Superfícies obrigatórias

- **`Statistics.ts`:** artilharia e tabela recebem os resultados `fast` pelo mesmo caminho
  dos `full`.
- **`/lab`:** variante "quickSim vs motor" em `scenarioRunner`, com gols/jogo, % de mandante
  e % de empates em `SummaryBars`. Os campos entram em `TeamRawStats` e `VariantSummary`.
- **`/test`:** cenário em `TestCases.ts` + painel com o breakdown (forças por setor, xG, gols
  sorteados) para dois elencos.

## 3. Pirâmide com acesso e rebaixamento

### Pertencimento por save

- Arquivo novo `saves/{id}/leagueMembership.json`, no formato `{ [leagueSlug]: squadId[] }`,
  criado a partir do `leagueData.json` na criação do save.
- Uma função única em `src/Domain/clubLookup.ts` (`getLeagueClubs(saveId, leagueSlug)`)
  substitui toda leitura de `leagueData.standings` usada para saber quem joga onde, em
  `advanceDay.ts`, `routes.ts`, `SaveService.ts` e `squadIdToClubSlugMap`.
- O `leagueData.json` continua como catálogo (nome, cores, logo, zonas).

### `pyramids.json`

```json
{
  "italy": [
    ["serie_a"],
    ["it_serie_b"],
    ["it_serie_c_a", "it_serie_c_b", "it_serie_c_c"]
  ]
}
```

- Cada nível tem uma ou mais ligas (grupos).
- Correções manuais ficam em `data_process/openfootball/pyramidOverrides.json`. Exemplo: a
  "Second Division B" argentina é o nível 3.
- As ligas sobrepostas entram na pirâmide com o slug do TouchLines. Exemplo:
  `england: [["premier_league"], ["gb_championship"]]`.

### Regra de troca

- A soma dos rebaixados do nível N é igual à soma dos promovidos do nível N+1. O importador
  ajusta as `zones` para garantir isso: com K grupos no nível N+1, o nível N rebaixa K times e
  cada grupo promove o seu campeão (K ≥ 2). Com um grupo só, mantém a quantidade da zona `rel`
  original.
- Se o valor de `rel` na fonte for incoerente com o de `prom`, vale o menor dos dois.
- Os rebaixados são distribuídos um por vez, sempre para o grupo com menos clubes naquele
  momento. Isso preserva o tamanho dos grupos.
- O nível mais baixo não tem zona `rel`. Países com um único nível não trocam nada.

### Momento da troca

- A transição de um país roda uma vez, quando a última liga dele termina a temporada.
- Até lá, as ligas que já terminaram ficam paradas, esperando.
- A transição:
  1. calcula quem sobe e quem desce;
  2. move os arquivos `saves/{id}/squads/{de}/{clube}.json` para a nova liga;
  3. atualiza o `leagueMembership.json`;
  4. roda o `runSeasonTransition` de cada liga com a nova composição e gera os calendários.
- Se o clube do jogador trocou de divisão, `meta.leagueSlug` é atualizado, o `simMode` é
  recalculado e o jogador recebe um evento no inbox (`promoted` ou `relegated`).

### Finanças

Troca de divisão aplica um multiplicador de receita de TV por nível (`TIER_BROADCAST_MULT` em
`FinancialService`: nível 1 = 1,0, nível 2 = 0,35, nível 3 = 0,12). Clubes da IA também mudam
de tier de orçamento (`finance.md`).

## 4. Telas

- **Novo Jogo (`NewGameWizard.tsx`):**
  - passo País com campo de busca e grupos por `continent`;
  - passo Clube com abas por divisão/grupo, lidas de `pyramids.json`;
  - cards de clube com cores, escudo ou brasão e força média.
- **Classificação (`LeagueTableScreen.tsx`):** seletor em dois níveis (país → divisão), que abre
  na liga do jogador. Zonas coloridas e selo `rápida` nas ligas `fast`.
- **Configurações:** seção "Ligas seguidas", com até 3 ligas.
- **Escudos:** sem `logo`, `squadLogoUrl` devolve `undefined` e `ClubIdentity` desenha o
  brasão com as cores. Implementar o fallback se ainda não existir.
- **i18n:** países e ligas via `t(key, { defaultValue })`. `pt-BR.json` ganha os nomes dos
  países.

## Testes

`bun test` cobre:

- **Importador:** reta por papel, fallback de papel-irmão, limites de 0 a 10, determinismo do
  ruído, corte de elenco com profundidade mínima, filtro de ligas pequenas e ligas sobrepostas.
- **`quickSim`:** com semente fixa, dá resultado determinístico. Soma dos gols dos jogadores
  igual ao placar. Média de gols em 1000 jogos dentro da faixa configurada.
- **Pirâmide:** tamanhos preservados, K grupos, nível mais baixo, país com um nível, clube do
  jogador subindo e caindo.
- **Transição do país:** só dispara quando a última liga termina.

## Critérios de aceite

- Novo Jogo lista todos os países importados e permite começar em qualquer divisão.
- Um dia de rodada com o mundo inteiro jogando leva menos de 2 s no container. Medir durante
  a implementação; se não bater, abrir otimização antes de seguir.
- `quickSim` a ±10% do motor em gols/jogo, % de vitória do mandante e % de empates.
- Ao fim da temporada, times sobem e descem, e as ligas mantêm o tamanho.
- As 8 ligas atuais continuam com os mesmos dados.

## Fora de escopo

- Copas, continental e supercopa (projeto separado).
- Escudos reais para os clubes importados.
- Ajustes no `marketRotation` para um mercado com ~1000 clubes (observar e ajustar depois).
- Limites de estrangeiros ou regras específicas de país.
