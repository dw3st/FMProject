# xG do FM (etapa 6 da reforma do motor)

Branch `feat/engine-fm`, etapa 6. Sem calibração: as constantes são as do FM, o volume é medido e registrado em
`fm-numbers.md` (a calibração é a etapa 21).

## Regra

- O xG de um chute é uma regressão logística por modelo, sem atributo de jogador: `xG = 1 / (1 + e^−(b + Σ cᵢ fᵢ))`.
  Coeficientes e interceptos em `Configs/XgConfig.ts` (guardados ×1e7, como na fonte).
- Sete atributos (geometria em metros, origem no centro do gol, `FmXg.ts`):

| Atributo | Fórmula |
|---|---|
| `distance` | `clamp(1 − d / 60 m, 0, 1)`, d = distância ao centro do gol |
| `occluding` | quem está no triângulo chutador–traves (os dois times, sem o chutador): `max(clamp(1 − r / d, 0, 1)²)`, r = distância chutador → jogador |
| `between` | jogadores no triângulo / 22 (goleiro incluído) |
| `angleLocation` | `max(0, 90° − a) / 90`, a = ângulo (graus inteiros) do ponto do chute com o eixo reto do gol |
| `angleFacing` | `(180° − a) / 180`, a = ângulo entre o corpo (último movimento, `facingAngleDeg`) e o gol; parado = de frente |
| `height` | altura da bola / 3 m |
| `fraction` | fração do gol visível: o cone de ±45° em volta da direção ao gol dá a largura disponível; cada jogador do triângulo cobre um segmento de 0,667 m (o goleiro 2 m) atravessado à linha do chute, projetado do chutador na linha do gol; fração = 1 − coberto / disponível |

- Modelo pelo tipo e pela fração visível `v`: chão `regular` (v > 0,7 `open_goal_regular`, v < 0,15
  `obscured_regular`), voleio quando a bola está a 0,2 m ou mais (`volleys` e as variantes), cabeça (`headers` e as
  variantes), falta direta `free_kicks`, pênalti `penalties` (só o intercepto: 0,827).
- Chance = xG ≥ 0,15, chance clara = xG ≥ 0,30 (`isChance`, `isClearChance`).
- `DECISION_FLAGS.FM_XG` (ligado): o xG do FM é o número do chute em todo lugar: estatística (`shot`), nota de chutar
  (`evalShoot`), o portão do um contra um (`oneOnOneGate`) e a entrada da resolução de hoje (`resolveShot` ainda sorteia
  sobre ele até a etapa 7). Desligado, o `computeXG` antigo.
- Altura da bola: 0 no chute de chão e 2 m na cabeçada (`XG_CONFIG.HEADER_HEIGHT_M`) até a bola 3D (etapa 3) dar a
  real. Chip: a estatística é o xG do FM de chão; o chip continua decidido pela chance dele. Falta direta: o modelo
  `free_kicks` (a barreira entra nos atributos de bloqueio) é o xG e a entrada do voo; o sorteio da barreira continua.
  Pênalti: a estatística é 0,827; a cobrança continua por `penaltyChance`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `Configs/XgConfig.ts` | Modelos, coeficientes, limiares, larguras |
| `Domain/FmXg.ts` (+ teste) | Puro: atributos, escolha do modelo, `fmShotXG`, `fmXgFromFeatures`, `isChance`, `isClearChance` |
| `Domain/ShotXg.ts` | Adaptador do motor: `shotXg(chutador, jogadores, tipo, ponto?)`, com a flag |
| `Domain/DecisionTree.ts`, `Domain/gameState.ts` | Chamadas (decisão, chute, cabeçada, chip, falta, pênalti) |
| `Domain/Statistics.ts` | `chances`, `clearChances` por jogador e time |

## `/test`, `/lab`, MCP

- `/test`: cenário `fm-xg-blocked`; Decision Scores → Shoot mostra o modelo, os sete atributos, quem está no triângulo
  e o gol coberto; o log `shot` repete no chute.
- `/lab`: `TeamRawStats.chances/clearChances` → `avgChances`, `avgClearChances` → `PairDetail` ("Chances",
  "Clear-cut chances") e as metas do FM (xG por chute, chances claras).
- `scripts/fm-targets.ts`: mediana, p25 e p90 do xG por chute (histograma do evento `shot`), chances e chances claras.
- MCP `evaluate_shot`: bloco `fmXg` (xG, modelo, atributos, gol visível, chance / clara).

## Limitações

- O quickSim não tem chances (0 no `/lab` com o quickSim).
- A largura de 2 m do goleiro é inferida (marca do jogador na fonte); os outros cobrem 0,667 m.
- Sem bola 3D, todo chute de pé é de chão (nenhum voleio) e toda cabeçada a 2 m.

## Etapa 7

Com `SHOT_PHYSICS` o xG não decide mais o gol: fica só como estatística e na nota de chutar; o gol sai da trajetória
(`shot-and-save.md` → "Stage 7").
