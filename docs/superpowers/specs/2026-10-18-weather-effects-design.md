# Clima que afeta a partida — design

Data: 2026-10-18. Versão alvo: **4.32**. Decisões do usuário: efeito **sutil**, **só na partida** (sem público,
finanças nem gramado), visível **em uma linha de texto** na prévia e no resultado, abordagem **tabela de
multiplicadores sobre alavancas existentes**.

## 1. Regra

- O clima de um jogo é o de `matchConditions(fixture, país do mandante)` (`src/Domain/matchday/matchConditions.ts`),
  a mesma função pura e determinística que a prévia, o Painel e a luz da partida já usam. O clima que o jogador vê
  é o clima que o jogo usa.
- **Campo neutro:** clima neutro (sem efeito), como já é na luz.
- **Estádio coberto:** sob teto fechado (teto fixo; teto retrátil fechado em chuva, neve ou frio; estádio sorteado
  como coberto pelo id) chuva, neve e vento não valem. Calor e frio continuam. O "coberto" é o mesmo do desenho
  (`matchSun`), então o que se vê e o que se joga nunca divergem.
- **Clima efetivo** = o clima depois do teto. É o que o motor e o quickSim recebem.
- Jogos de base e de seleção: sem clima (neutros).
- IA não muda a tática por causa do clima. Nada muda fora da partida.
- **Regra de ouro:** clima ausente ou neutro = exatamente o jogo de hoje (nenhum sorteio novo, nenhum número muda).
- Sem migração (protótipo).

## 2. Efeitos (valores iniciais; ajustados na medição)

| Clima | Motor | Texto (prévia e resultado) |
|---|---|---|
| `sunny`, `clear`, `partlyCloudy`, `cloudy` | nada | — |
| `rain` | domínio de bola alta / primeiro toque × 0,92; frenagem da bola solta × 0,7; goleiro agarra cruzamento × 0,9 | "Chuva: bola escorregadia, domínio mais difícil" |
| `snow` | frenagem da bola solta × 1,4 e velocidade inicial × 0,8; condução × 0,95; domínio × 0,94 | "Neve: bola pesada, jogo mais lento" |
| `wind` | erro de queda de cruzamento e lançamento × 1,3; precisão de chute de fora da área × 0,95 | "Vento: bolas altas imprecisas" |
| `hot` | gasto de fôlego em campo × 1,08 (recuperação do intervalo igual) | "Calor: o fôlego cai mais rápido" |
| `cold` | risco de lesão (por minuto e por contato) × 1,1 | "Frio: mais risco de lesão muscular" |

Sob teto: "Estádio coberto: o clima não afeta o jogo" (quando o clima sorteado seria chuva, neve ou vento).

`/test` também tem `wind_rain` (soma vento e chuva); não existe no jogo de verdade.

**Metas:**
- Mundo (clima sorteado × tudo neutro): gols ±3%, chutes ±5%.
- Cada clima isolado: gols dentro de ±8% do neutro (senão o multiplicador é suavizado) e a assinatura visível:
  chuva menos domínios de bola alta e bolas soltas mais longas; neve bola solta mais curta; vento menos
  cruzamentos/lançamentos certos; calor fôlego final mais baixo; frio mais lesões.

## 3. Arquitetura

### Peças puras

- `src/Domain/matchday/matchWeatherEffect.ts` — `matchWeatherFor(fixture, home, opts)` →
  `{ weather, covered, effective }`. Chama `matchConditions` e decide o teto com a mesma regra do `matchSun`
  (a decisão de teto sai de `src/backend/stadiumData.ts` para uma função pura que os dois usam; a leitura de
  `stadiums.json` continua no backend e entra como argumento). Campo neutro → `effective` neutro.
- `src/GameEngine/Configs/WeatherConfig.ts` — `WEATHER_EFFECTS: Record<MatchWeather | "wind_rain", WeatherEffect>`
  com os multiplicadores; `weatherEffectOf(weather?)` devolve o objeto neutro (tudo 1) para ausente/neutro;
  override por partida para `/test` e `/lab` (molde do `MoraleConfig`).

### Motor

`GameState.weather?: MatchWeather` (clima efetivo). Lido em:
- domínio de bola alta (`CONTROL_BASE + CONTROL_TOUCH × firstTouch`, `gameState.ts`);
- `LOOSE_BALL_INITIAL_SPEED` / `LOOSE_BALL_DECELERATION` no uso (não na constante);
- erro de queda de cruzamento/lançamento (`startAerialBall`);
- chance do goleiro agarrar (`gkClaimChance`);
- precisão de chute de fora da área (mira do `startShot`);
- velocidade de condução (`carrySpeed` no movimento);
- `consumeEnergy` (calor);
- `injuryRatePerMinute` / `contactInjuryChance` via o multiplicador que o motor já passa (frio).

`simulateMatch(..., { weather })`. Sem clima, o motor não lê nada novo.

### quickSim

`QuickSimInput.weather` (efetivo). Fatores por clima medidos no motor (`QuickSimConfig.WEATHER`):
- `xg` (dois lados; perto de 1);
- `crossCompletion`, `longBallCompletion`;
- `energyDrain` (calor);
- `injury` (frio, multiplica o `staffMult`).

Neutro/ausente = o sorteio de hoje, idêntico.

### Avanço do dia

`buildMatchEvent` e o quickSim de cada jogo de liga, copa e continental chamam `matchWeatherFor` (o elenco do
mandante já está carregado). `MatchEvent.weather` grava o clima sorteado e `MatchEvent.weatherCovered` quando o teto
anulou. A gravação ao vivo não carrega clima: o avanço recalcula pelo jogo.

### Partida ao vivo

`POST /api/match-setup` devolve `conditions.effectiveWeather` e `conditions.covered`. O `MatchScreen` põe o clima
efetivo em `GameState.weather`.

### Telas

Prévia e resultado: uma linha abaixo do clima com o texto do clima efetivo (`weatherEffect.<clima>`,
`weatherEffect.covered`, en e pt-BR). Resultado lê do `MatchEvent`.

## 4. `/test`, `/lab`, estatísticas

- `/test`: o seletor de clima existente passa a ligar o efeito no motor; opções `Off` (padrão, neutro), sunny,
  cloudy, rain, wind, wind_rain, snow, hot, cold. `EnergyPanel` com o clima e os multiplicadores ativos; logs de
  lance com `weatherMult`; categoria de debug `weather`; cenários `rain-cross` e `heat-stamina`; o painel QuickSim
  recebe o clima.
- `/lab`: `Variant.weather` (a da variante A vale para o jogo), rótulo `· rain`, `TeamRawStats.weather` →
  linha "Weather" no `PairDetail`; quickSim do lab com o mesmo clima.
- `Statistics.ts`: nada novo (cruzamentos, lançamentos, bolas soltas, fôlego, lesões e gols já são contados).

## 5. Medição

`scripts/weather-measure.ts`:
- Motor: Premier League + Championship, formações da IA, fôlego 88, cada clima forçado × neutro, mesmo
  `Math.random` por par, centenas de jogos por clima: gols, chutes, cruzamentos/lançamentos certos, bolas soltas,
  fôlego final, lesões.
- Mundo: clima sorteado × neutro (gols ±3%, chutes ±5%).
- quickSim: fatores tirados da medição do motor e conferidos pareados.
- Resultados em `.claude/rules/game/weather.md`.

## 6. Testes

- Puros: `matchWeatherFor` (determinismo, teto, campo neutro, efetivo = prévia), `WeatherConfig` (neutro = 1).
- Motor (`Weather.engine.test.ts`): neutro/ausente idêntico com o mesmo `Math.random`; chuva reduz o domínio de bola
  alta; calor gasta mais fôlego.
- quickSim: neutro idêntico; calor pareado com fôlego final menor; frio pareado com mais lesões.
- Avanço do dia: `MatchEvent.weather` = clima da prévia (`match-setup`) para o jogo do clube do jogador.
- Smoke (`season-rollover-smoke.ts`, seção "Clima"): todo jogo de liga/copa/continental do log com clima, nenhum de
  base; o clima do log = `matchConditions` do jogo; volume de gols nas faixas de sempre.

## 7. Changelog

4.32: "O clima agora influencia as partidas: chuva deixa a bola escorregadia, vento atrapalha as bolas altas, o
calor cansa mais e o frio aumenta o risco de lesão." (en e pt-BR). `upcoming` atualizado.

## 8. Limitações

- Efeito sutil por desenho: o clima não decide jogos sozinho.
- O clima não muda público, gramado, finanças nem a tática da IA.
- Base e seleções sem clima.
- O teto sorteado (estádios sem dado real) é ilustrativo, mas vale igual para desenho e jogo.
