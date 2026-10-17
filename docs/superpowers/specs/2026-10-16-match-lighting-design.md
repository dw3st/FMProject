# Luz e sombra da partida pelo horário e clima — design

Aprovado em 2026-10-16. Só desenho (`src/GraficsEngine`): nada entra no `GameState`, no motor, no quickSim nem no
`/lab`. Base: o sorteio de horário e clima que já existe (`src/Domain/matchday/matchConditions.ts`, hoje só na prévia e
no painel) e o desenho do gramado da 4.28 (`pitchSurface.ts`).

## Objetivo

A partida ao vivo mostra a luz do horário e do clima do jogo: tarde de sol com sombras, fim de tarde alaranjado com a
sombra da arquibancada crescendo, noite com refletores e 4 sombras por jogador, nublado chapado, chuva e neve com
partículas. A luz acompanha o relógio do jogo: um jogo das 17:30 escurece e acende os refletores no segundo tempo.

## 1. Dados

- `matchConditions` passa a devolver também `sunset` ("HH:MM", o mesmo `SUNSET` que já decide `night`). Nada mais muda
  no sorteio (mesma semente, mesmo resultado).
- `POST /api/match-setup` devolve `conditions: { kickoff, weather, sunset } | null`, calculado com o mesmo país do
  mandante que a prévia usa (`homeGround.country`). Campo neutro: o país do mandante da fixture também (como a prévia).
- **Orientação do estádio** (`stadiumSunSide(clubId)`): de que lado do campo (em jardas do motor) o sol se põe, sorteado
  pelo id do mandante: `"top"` ou `"bottom"` (laterais) e um viés para uma das metades. O mesmo estádio, sempre o mesmo
  lado. Campo neutro: pelo id da fixture.
- **Hora do jogo** (`matchClock`): início + minuto exibido do jogo, + 15 min depois do intervalo, + os acréscimos do
  primeiro tempo no segundo; prorrogação continua contando. Calculada a partir do `GameState` (fase, `matchTime`,
  `stoppage`), sem campo novo.

## 2. Luz pela hora (`matchLighting`, puro)

`matchLighting({ clock, sunset, weather, sunSide }) → Lighting`:

| Faixa | Quando | Desenho |
|---|---|---|
| Dia | antes de pôr do sol − 1h30 | luz neutra; sol alto: sombra da arquibancada curta (até ~8% da largura do campo); sombra do jogador curta, para o lado oposto ao sol |
| Fim de tarde | pôr do sol − 1h30 até − 30 min | tinta alaranjada crescendo até ~10%; sombra da arquibancada até ~50% da largura; sombra do jogador até 3× mais comprida |
| Crepúsculo | pôr do sol − 30 min até + 30 min | sol some (sombras do sol vão a 0), escurecimento cresce, refletores entram (0 → 1) |
| Noite | depois de pôr do sol + 30 min | escurecimento azulado (~38%), vinheta nas bordas, brilho nos 4 cantos; 4 sombras fracas por jogador, em X |

- **Clima:** `cloudy`/`rain`/`snow`/`partlyCloudy` reduzem as sombras do sol (0 / 0 / 0 / 50%) e acrescentam um véu
  cinzento (chuva e neve mais escuros); de noite os refletores valem igual. `clear`/`sunny`/`hot`: sombras cheias.
- Tudo contínuo dentro das faixas (sem saltos); constantes em `pitchStyle.ts` (`LIGHTING`).

## 3. Desenho (`PixiPitch`)

- Prop nova `lighting?: { kickoff, sunset, weather, sunSide } | null` (ausente = sem luz nova: tudo como hoje).
- **Camada de luz** (um `Graphics` acima do gramado e da arquibancada, abaixo dos jogadores): véu de cor, vinheta,
  brilho dos refletores e o polígono da sombra da arquibancada, em jardas com `toPixel` (respeita o espelho).
  Redesenhada só quando a hora do jogo avança 1 minuto ou o espelho/tamanho muda.
- **Sombras dos jogadores:** substituem a elipse fixa de `MARKER_SHADOW` quando há `lighting`: de dia/fim de tarde uma
  elipse deslocada e esticada pela direção e altura do sol; de noite 4 elipses fracas em X; nublado, a elipse de hoje.
  Mesma regra para a bola.
- **Partículas** (`weatherParticles`, puro e determinístico pela semente): chuva até 150 pingos finos inclinados (mais
  com vento), neve até 100 flocos lentos. Andam pelo relógio de efeitos (parado com o jogo pausado e com a aba
  escondida). Um `Graphics` por cima de tudo, redesenhado por quadro só quando há chuva/neve.

## 4. Onde aparece

- Partida ao vivo (`MatchScreen`): passa `lighting` com o `conditions` do `match-setup` e o `sunSide` do mandante.
- `/test`: botões Hora (13:30 · 17:30 · 20:45 · Pelo jogo) e Clima (sol · nublado · chuva · neve · vento), e o medidor de
  FPS já existente para conferir o custo.
- Prévia e `/lab`: sem mudança. `Statistics.ts`: nada.

## 5. Testes e medição

Puros: `matchClock` (primeiro tempo, intervalo, segundo tempo com acréscimo, prorrogação), `matchLighting` (faixas,
continuidade nas bordas, clima zera as sombras do sol, noite com 4 sombras), `stadiumSunSide` e `weatherParticles`
determinísticos, `matchConditions` com `sunset` igual ao de antes nas outras chaves. Rota: `match-setup` devolve
`conditions`. Medição: FPS no `/test` com noite + chuva e Estádio ligado, contra sem luz (meta: queda ≤ 5 FPS).

## Limitações

- A orientação do estádio é sorteada, não a real.
- A luz não muda a simulação (visibilidade, erros) — só o desenho.
- Sem sombra dos jogadores sobre a arquibancada nem reflexo de poças.
