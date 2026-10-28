# Goleiro mais ativo

Aprovado pelo usuário em 2026-10-28 (as quatro opções). Hoje o goleiro fica no arco de 0,5 a 6 jardas, só persegue
bola solta dentro da área e só sai em bola alta na pequena área.

## Comportamentos

1. **Líbero (bola longa).** Numa bola em profundidade ou bola solta atrás da defesa, o goleiro entra na perseguição
   quando o ponto está a até 30 jardas da linha do gol (largura ±26 do centro) e ele chega antes do atacante mais
   rápido com folga: `eta_gk + margem < eta_atacante`, `margem = 0,15 − 0,15 × posicionamento` s. Fora da área ele joga
   com o pé (vira portador normal: passa, lança, afasta).
2. **1 contra 1.** Portador adversário a até 25 jardas do centro do gol, sem defensor de linha do goleiro entre ele e
   o gol (corredor ±8): o goleiro sai na bissetriz até `min(10, dist − 1,5)` jardas. Chegando a 2 jardas, desarma
   (abafa): chance base `0,25 + 0,3 × (posicionamento + reflexo)/2` no lugar do desarme de jogador de linha; falta do
   goleiro × 0,5. A qualidade de posição no chute aceita qualquer ponto da bissetriz entre o arco e a saída.
3. **Adiantado.** Com o próprio time com a bola: 6 jardas com a bola a até 30 do gol, 12 (marca do pênalti) com a
   bola no meio-campo, 18 (entrada da área) com a bola a 97,5 jardas; segue 15% do y da bola. Defendendo com a bola
   longe, o arco vai de 0,5 (bola a 20 jardas) até 6 (bola a 60 ou mais).
4. **Bolas altas mais longe.** Além da pequena área, sai em bola alta que cai a até 10 jardas da linha (±10 do centro
   do gol) se está a até 10 jardas do ponto e é o primeiro a chegar. Agarrar ×
   `1 − 0,35 × (profundidade − 6)/4`; errando fora da pequena área, 30% das vezes a bola fica solta no ponto (senão soco).

Constantes em `src/GameEngine/Configs/KeeperConfig.ts`, regras puras em `src/GameEngine/Domain/Keeper.ts`.

## Superfícies

- Eventos `keeperSortie { keeperId, kind: sweep | rush | high }`, `keeperSweep`, `keeperSmother`; `Statistics.ts`
  `keeperSorties`, `keeperSweeps` (bola ganha fora da área), `keeperSmothers`.
- `/test`: cenários `keeper-sweeper`, `keeper-one-on-one`, `keeper-attacking`, `keeper-high-ball`; overlay Keeper
  (zona do líbero, zona de bola alta, alvo atual). `/lab`: as três estatísticas por jogo.
- Meta: gols e chutes do mundo dentro de ±5% (`ai-formation-goals.ts`); se mudarem, ajustar o quickSim.

Valores finais depois da calibração (o 1 contra 1 até 13, o arco longe até 8 e a bola alta até 12 tiravam 14% dos gols);
medições em `.claude/rules/game-engine/keeper.md`.
