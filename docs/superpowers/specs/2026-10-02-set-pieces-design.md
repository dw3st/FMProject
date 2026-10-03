# Etapa 14 — Bolas paradas — Design

Data: 2026-10-02. Status: aprovado. Versão **2.9**. Depende das Etapas 12 (tiro livre, pênalti) e 13 (bola
alta, disputa aérea, cabeçada). Regra do projeto: `/test`, `/lab` e `Statistics.ts`.

## 1. Escanteio

- Opções do cobrador: cruzamento no primeiro pau, na marca do pênalti, no segundo pau, ou curto (passe para
  o companheiro mais próximo). Escolha pontuada como as outras ações: atacantes altos (cabeceio + salto) na
  zona do alvo contra defensores, cruzamento do cobrador; `build_up: possession` favorece o curto.
- Layout `corner_Attack`: dois zagueiros (melhores no jogo aéreo) e o centroavante sobem para a área; um
  meia na entrada da área (sobra); o resto fica na contenção. `corner_Defend`: marcação na área.

## 2. Tiro livre

- Até `DIRECT_FK_RANGE` (30 jardas) e ângulo central: chute direto, xG próprio
  (`FK_XG_BASE` × distância × ângulo × barreira), cobrador pela finalização (ou o escolhido).
- Mais longe / lateral: cruzamento na área como o escanteio, ou passe curto.

## 3. Barreira

2–5 defensores conforme distância e ângulo, posicionados a 10 jardas na linha bola→gol. Reduz o xG do chute
direto (`WALL_BLOCK_FACTOR` por homem, com chance de bater na barreira = bola solta).

## 4. Cobradores

`TacticsSave.setPieceTakers?: { corners?: string; freeKicks?: string; penalties?: string }` (ids de jogador).
Tela de táticas: três seletores, padrão "Automático" (melhor do atributo: cruzamento = passe+visão; tiro livre
= finalização; pênalti = finalização). IA sempre automático. Jogador indisponível → automático.

## 5. Arremesso lateral

Passe curto com alcance máximo `THROW_IN_RANGE` (~20 jardas) durante a contagem do lateral. Sem lateral longo.

## 6. quickSim

Fração dos gols de bola parada (`SET_PIECE_GOAL_SHARE`, medida no motor) atribuída ponderando cabeceio dos
zagueiros/atacantes e finalização do cobrador; escanteios/tiros livres por Poisson com as médias do motor.

## 7. Calibração

Escanteios ~6–10 por partida, gols de bola parada ~20–30% dos gols, gols de tiro livre direto ~2–5%.
Gols e chutes dentro de ±5% do atual. Script `scripts/setpiece-calibrate.ts`.

## 8. Superfícies

`Statistics.ts`: `corners`, `freeKicks`, `directFreeKickShots`, `directFreeKickGoals`, `setPieceGoals`.
`/test`: cenários `corner-attack`, `direct-free-kick` (barreira visível no overlay). `/lab`: linhas em
`PairDetail`. Docs `.claude/rules/game-engine/set-pieces-play.md` (e atualizar `set-pices.md`). Changelog 2.9.
