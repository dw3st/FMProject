# Clima que afeta a partida

Spec: `docs/superpowers/specs/2026-10-18-weather-effects-design.md`. Versão **4.32**. O sorteio do clima (e o horário e
o pôr do sol, só desenho) continua em `src/Domain/matchday/matchConditions.ts`; a luz em `graphics-engine.md` → "Luz e sombra".

## Regra

- O clima sorteado do jogo (`matchConditions`, determinístico por data + mandante + visitante) passa a **jogar**: chuva,
  neve, vento, calor e frio mexem em constantes do motor e do quickSim. Clima neutro = partida **idêntica** à de antes
  (mesmo `Math.random`, nenhum sorteio novo).
- **Clima efetivo** (`matchWeatherOf`, `src/backend/stadiumData.ts`): o sorteado, salvo estádio coberto, que joga neutro
  (`sunny`). Coberto = teto retrátil fechado pelo clima (chuva, neve, frio, vento) ou estádio sorteado como coberto
  (perfil do id, 6%). **Campo neutro:** o clima sorteado fica só para exibição (sorteado sem país), a partida joga neutra.
- `MatchEvent.weather` = o sorteado; `weatherEffective` só quando difere (teto ou campo neutro); `weatherCovered: true`
  quando o teto segurou o clima. Torneios de base e seleções não têm clima.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/GameEngine/Configs/WeatherConfig.ts` | `WEATHER_EFFECTS` por `EngineWeather` (energia, bola solta, controle de bola alta, erro aéreo, goleiro, lesão…) |
| `src/Domain/matchday/matchWeatherEffect.ts` | Efeito para a tela (linha da prévia e do resultado) |
| `src/backend/stadiumData.ts` | `matchWeatherOf`: clima efetivo, teto, neutro |
| `src/GameEngine/Domain/gameState.ts` | Pontos de uso: dreno de energia, desaceleração da bola solta, controle de bola alta, erro de lançamento, lesão |
| `src/GameEngine/Infrastructure/ActionOutcomes.ts` | `resolveShot` e `gkClaimChance` com o efeito do clima |
| `src/Domain/advanceDay/quickSim.ts` + `QuickSimConfig.ts` | `QUICK_SIM_CONFIG.WEATHER` (mesmo efeito no quickSim) |
| `src/types/dayLogTypes.ts` | `MatchEvent.weather`, `weatherEffective`, `weatherCovered` |
| `src/backend/routes.ts` | `match-setup` devolve `weatherEffect` |

## Telas

- Prévia e resultado: linha do efeito do clima quando ativo (`weatherEffect.*` em i18n); em campo neutro com um clima
  sorteado que teria efeito, "o clima não afeta o jogo" (`weatherEffect.neutral`, 4.34.2).
- `/test`: seletor **Weather** (motor + luz), cabeçalho do `EnergyPanel` com os multiplicadores, cenários `rain-cross` e
  `heat-stamina`, categoria de debug `weather` (4.34.3: uma linha por lance afetado — erro do lançamento, saída do goleiro,
  bola alta que cai solta, domínio de bola alta, chute de longe, bola em profundidade — com a alavanca e o `weatherMult`;
  só com o debug ligado e clima ativo, nenhum sorteio novo).
- `/lab`: `Variant.weather` (variante A vale para o jogo); `TeamRawStats.weatherActive` → `weatherShare` na linha do `PairDetail`.

## Medições

`bun scripts/weather-measure.ts` (2026-10-18; motor sem semente: cada jogo do par clima × neutro roda com o mesmo
`Math.random`, `mulberry32` por jogo; formações da IA, `balanced`, fôlego 88). Brutos em `debug/weather/` (gitignored).

### Valores finais

| Clima | `WEATHER_EFFECTS` (motor) | `QUICK_SIM_CONFIG.WEATHER` |
|---|---|---|
| `rain` | control 0,92 · looseDecel 0,8 · gkClaim 0,9 | xg 0,98 · cruzamento 1,08 · lançamento 0,876 |
| `snow` | looseDecel 1,2 · looseSpeed 0,9 · carrySpeed 0,95 · control 0,94 | xg 1,069 |
| `wind` | aerialError 3 · longShot 0,95 | xg 0,98 · cruzamento 0,913 · lançamento 0,911 |
| `hot` | drain 1,08 | xg 1,067 · energyDrain 1,023 |
| `cold` | injury 1,1 | injury 1,097 |

Ajustes da calibração: neve com looseDecel 1,4 / looseSpeed 0,8 dava gols ×1,12 (bola solta parava cedo, +30% de
bolas soltas ganhas) → 1,2 / 0,9. Vento com aerialError 1,3 não tinha assinatura (o σ do cruzamento é ~0,8 jarda) → 3.

### Motor por clima (Premier League + Championship, 400 jogos por clima e liga, razão × neutro ± erro pareado)

Neutro: gols 1,913 · chutes 5,35 · cruzamentos certos 14,6% · lançamentos certos 44,7% · bolas soltas ganhas 11,86 ·
fôlego final 50,94 · lesões 0,244.

| Clima | gols | chutes | cruz. certos % | lanç. certos % | bolas soltas | 88 − fôlego final | lesões |
|---|---|---|---|---|---|---|---|
| rain | ×0,980 ±0,032 | ×0,924 ±0,018 | ×1,079 ±0,034 | ×0,876 ±0,030 | ×0,801 ±0,010 | ×0,997 | ×1,046 ±0,074 |
| snow | ×1,069 ±0,033 | ×1,034 ±0,019 | ×0,994 ±0,031 | ×0,999 ±0,033 | ×1,204 ±0,013 | ×1,000 | ×1,000 ±0,068 |
| wind | ×0,980 ±0,030 | ×0,996 ±0,017 | ×0,913 ±0,030 | ×0,911 ±0,031 | ×1,043 ±0,011 | ×0,998 | ×1,026 ±0,069 |
| hot | ×1,067 ±0,034 | ×1,038 ±0,020 | ×1,037 | ×0,987 | ×1,015 | ×1,023 ±0,003 | ×1,036 |
| cold | ×0,994 ±0,003 | ×0,997 | ×1,001 | ×1,000 | ×1,001 | ×0,999 | ×1,097 ±0,025 |

Na chuva os cruzamentos certos sobem (o goleiro agarra menos: gkClaim 0,9); o resto da assinatura é a bola solta que
escorrega (−20% de bolas soltas ganhas, −12% de lançamentos certos, −8% de chutes).

### Mundo (clima sorteado × tudo neutro, 1200 jogos por liga, pareado)

| Liga | rain | wind | cold | snow | hot | neutros | gols | chutes |
|---|---|---|---|---|---|---|---|---|
| premier_league | 223 | 152 | 69 | 30 | 10 | 716 | 2,247 × 2,307 (×0,974 ±0,013) | ×0,971 ±0,008 |
| of_championship | 275 | 131 | 87 | 29 | 13 | 665 | 1,667 × 1,725 (×0,967 ±0,017) | ×0,966 ±0,009 |
| as duas | | | | | | | ×0,971 | ×0,969 |

Medição de 2026-10-18 com a chuva em looseDecel 0,7: gols −2,9% (meta ±3%, no limite), chutes −3,1%. Nos jogos
neutros o resultado é idêntico (5/5 conferidos).

**4.34.3: chuva em looseDecel 0,8** (a bola molhada escorrega um pouco menos), mesma medição pareada, 1200 jogos por liga:

| Liga | gols | chutes |
|---|---|---|
| premier_league | 2,217 × 2,255 (×0,983 ±0,014) | ×0,975 ±0,008 |
| of_championship | 1,732 × 1,756 (×0,986 ±0,017) | ×0,983 ±0,009 |
| as duas | ×0,985 | ×0,978 |

Gols −1,5% e chutes −2,2% no mundo, dentro das metas com folga. A tabela "Motor por clima" acima é da medição com 0,7
(a linha da chuva não foi refeita sozinha); o quickSim não mudou (o volume do mundo neutro não muda).

### quickSim (Premier League, 4000 jogos pareados por clima)

| Clima | gols | cruz. certos % | lanç. certos % | 88 − fôlego final | lesões |
|---|---|---|---|---|---|
| rain | ×0,979 | ×1,081 | ×0,870 | ×1,000 | ×1,010 |
| snow | ×1,070 | ×1,000 | ×0,996 | ×1,000 | ×0,988 |
| wind | ×0,979 | ×0,913 | ×0,909 | ×1,000 | ×1,010 |
| hot | ×1,068 | ×1,002 | ×0,998 | ×1,023 | ×0,990 |
| cold | ×1,000 | ×0,999 | ×0,999 | ×1,000 | ×1,092 |

## Testes e smoke

```
bun test src/GameEngine/Configs/WeatherConfig.test.ts src/Domain/matchday src/backend/stadiumData.test.ts \
  src/GameEngine/Domain/Weather.engine.test.ts src/Domain/advanceDay/quickSim.weather.test.ts \
  src/backend/weather.advanceDay.test.ts src/i18n/weatherEffect.keys.test.ts src/lab
```

`scripts/season-rollover-smoke.ts`, seção "Clima": todo jogo de liga/copa/continental tem `weather`, nenhum jogo de base,
uma amostra de 50 jogos bate com `matchConditions`, contagem por clima (informativa).

## Limitações

Ver a spec §8: o clima não muda a tática da IA nem as substituições; sem efeito por atributo do jogador (todos sentem
igual); o horário e o pôr do sol continuam só desenho; o quickSim aplica o mesmo efeito em média, não lance a lance;
seleções e base jogam sem clima.
