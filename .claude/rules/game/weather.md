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

- Prévia e resultado: linha do efeito do clima quando ativo (`weatherEffect.*` em i18n).
- `/test`: seletor **Weather** (motor + luz), cabeçalho do `EnergyPanel` com os multiplicadores, cenários `rain-cross` e
  `heat-stamina`, categoria de debug `weather`.
- `/lab`: `Variant.weather` (variante A vale para o jogo); `TeamRawStats.weatherActive` → `weatherShare` na linha do `PairDetail`.

## Medições

<!-- tabelas preenchidas pela calibração -->

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
