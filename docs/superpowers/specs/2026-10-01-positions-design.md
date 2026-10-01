# Bloco C1 — posições detalhadas (#20, #30, #31) — Design

Data: 2026-10-01. Status: aprovado. Parte C1 da Etapa 9 (C1 posições → C2 formação/táticas #21 →
C3 estilo posse #8). Versão **2.0**.

## 1. Aptidão por posição (pura, `src/Domain/positions/`)

`positionAptitudes(player): Record<DetailedRole, "natural" | "apt" | "training" | "unsuitable">`,
determinística, sem gravar nada no mundo:

- `score(r) = weightedScore(player.stats, r)` (pesos de `roles.json`, a mesma conta do motor).
- **Natural:** a maior pontuação entre as posições da linha do jogador (`positions[0]` →
  GK/DEF/MID/FWD). Posições de lado: pé esquerdo → natural só à esquerda (LB/LWB/LM/LW), direito → só
  à direita; `both`/ausente → os dois lados. O lado oposto vale no máximo `apt`.
- **apt:** `score ≥ 0,95 × natural`; **training:** `≥ 0,88 ×`; senão **unsuitable**.
- Fora da própria linha: no máximo `training`. GK só GK; ninguém de linha é apto a GK.
- `preferredRole(player)` = a natural; `aptitudeFor(player, role)`.

## 2. Rendimento fora de posição

Multiplicador sobre os atributos do jogador na vaga: natural 1,00 · apt 0,97 · training 0,90 ·
unsuitable 0,80 (`POSITION_PENALTY` em `src/Domain/positions/positionConfig.ts`).
- **Motor:** aplicado na montagem dos `runtimeStats` do jogador para o papel da vaga
  (`TeamLineup.ts`/`RuntimeLineup.ts`), uma vez no início da partida e nas substituições.
- **quickSim:** a força de cada titular na vaga (`quickSim.ts`) multiplicada pelo mesmo fator.
- Verificar: com escalações automáticas (encaixe certo) o volume de gols do quickSim e do motor
  fica a ±5% do atual (`quicksim-calibrate.ts` numa liga + uma `of_*`); se não, ajustar.

## 3. Escalação

`autoFillLineup*`, `replaceInjuredStarters`, `suggestRotation`: o valor de um jogador numa vaga passa a
ser `weightedScore(vaga) × POSITION_PENALTY[aptitude]` (mesmo critério da partida). Elegibilidade
continua por linha.

## 4. Telas

- **Cor por posição (#30):** `getDetailedPositionColor(role)` em `positionHelpers.ts` — tons dentro da
  cor da linha (ex. DEF: CB mais escuro, LB/RB médio, LWB/RWB claro; MID: CDM/CM/CAM; FWD: ST/LW/RW).
- **Elenco:** a coluna de posição mostra a posição natural detalhada (sigla traduzida) com a cor.
- **Ficha do jogador (#31):** campinho SVG com as posições: verde forte natural, verde claro apt,
  amarelo training; legenda curta.
- **Formação:** cada titular mostra a aptidão na vaga (ponto colorido / aviso "fora de posição").
- i18n en/pt-BR (siglas pt: GOL, ZAG, LE, LD, ALE, ALD, VOL, MC, MEI, ME, MD, PE, PD, CA).

## 5. `/test`, `/lab`, smoke

- `/test`: painel de jogadores mostra a aptidão de cada um na vaga.
- `/lab`: `Variant.outOfPosition?: boolean` escala o time com a melhor ordem por linha ignorando o
  encaixe, para medir a perda; `PairDetail` mostra a diferença.
- Smoke de temporada: nenhum XI da IA com jogador `unsuitable` quando havia alternativa na linha.

## Verificação

Testes de `positionAptitudes` (pé/lado, limites, GK, fora da linha), do multiplicador no motor e no
quickSim, dos seletores; `tsc`; suíte; medição de gols; tela no navegador. Changelog 2.0.
