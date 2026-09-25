# Recalibração dos jogadores nativos pelo seed — Design

Data: 2026-09-25. Status: aprovado pelo usuário (opção "100% do seed").

## Problema

Os atributos dos 8 elencos nativos (`data_process/native/squads`) classificam mal os craques:
no mundo atual o Mbappé é o 137º por overall, Vini 306º, Kane 406º, Wirtz 688º, enquanto o top 3
é Diomande (Leipzig), Doku e Simon (Paris FC). O seed do open-football
(`data_process/openfootball/seed-real.json`) tem um `overall` que ordena bem (Kane e Mbappé 99,
Dembélé 98, Saka/Salah/Haaland 97…). Os clubes `of_*` já são derivados desse overall; só os
nativos estão errados.

## Regra

**Nível do seed, perfil nativo.** Para cada jogador nativo com par no seed:

1. **Previsor de nível:** `z = a + b·seedOverall + c·leagueRep` (leagueRep = reputação da liga no
   seed / 1000, mesma covariável da calibração), ajustado por papel principal (GK/DEF/MID/FWD)
   nos pares nativos↔seed, contra o overall do jogo (`Player.computeOverallAvg`) dos nativos.
   O overall do seed é normalizado dentro de cada liga; a covariável de liga corrige isso.
2. **Escala por quantis:** dentro de cada papel, ordena os jogadores pareados por `z` e atribui a
   cada um o overall do jogo do mesmo quantil na distribuição **atual** dos nativos pareados desse
   papel (mapeamento de postos). Isso preserva o espalhamento das notas (a regressão pura
   comprimiria para a média) e a média do mundo, e faz a ordem seguir o seed.
3. **Ajuste dos atributos:** soma um deslocamento único `s` a todos os atributos com peso > 0 no
   papel específico em que o jogador rende mais (`Player.bestSpecificRole` + `attrWeights` do
   `roles.json`), com valores contínuos limitados a 0..10, e acha `s` por bisseção até
   `computeOverallAvg` bater com o alvo (tolerância 0,01). Depois arredonda cada atributo com
   hash do id do jogador (sem viés, mesmo esquema de `scripts/espn/estimate.ts`). O perfil (a
   forma dos atributos) continua o nativo.
4. Jogadores nativos **sem par** no seed não mudam.

## Onde entra

- Módulo puro `scripts/openfootball/recalibrate.ts` (+ teste): funções `fitLevelPredictor`,
  `quantileTargets`, `shiftToOverall`.
- `scripts/importOpenFootball.ts`: a calibração atual (ajuste de atributos dos `of_*`) continua
  usando os atributos nativos **originais**. Depois dela, e depois de copiar os nativos para
  `src/example_data/squads`, aplica a recalibração aos jogadores nativos pareados e regrava esses
  arquivos. Os pares vêm do mesmo `matchClubs`/`matchPlayers` que a calibração já usa (hoje
  ~2.900 jogadores; Série B incluída).
- `data_process/native` **não muda** (continua sendo a fonte original); a recalibração é um passo
  determinístico da cadeia.
- Relatório no fim do importador: pares por papel, coeficientes do previsor, top 20 do mundo
  depois, e a posição de Mbappé, Kane, Haaland, Salah, Vini, Bellingham, Yamal, Wirtz, Doku,
  Diomande.

## Depois

Cadeia completa: `importOpenFootball` → `importEspn` → `cp -R src/example_data/. src/Data/` →
kits → `bun test`, smokes, `quicksim-spread` em premier_league, bundesliga, brazil_serie_a,
serie_a. As ligas nativas mudam de força relativa entre jogadores (a média se mantém pelo
mapeamento por quantis), então o volume de gols precisa continuar dentro de ±15%.

## Testes

- Previsor: coeficientes finitos; ordem de `z` segue o seed dentro de uma liga.
- Quantis: a multiset de alvos é exatamente a multiset atual (mesma média e espalhamento); a
  ordem segue `z`.
- `shiftToOverall`: atinge o alvo (±0,01 antes do arredondamento), não mexe em atributos de peso
  0, respeita 0..10, determinístico.
- Integração: com um mundo de fixture pequeno, o jogador de maior seed vira o de maior overall.
