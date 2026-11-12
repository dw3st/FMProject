# Entrosamento: o recém-chegado

Report de tester, regra aprovada pelo usuário em 2026-11-04 (a alternativa por dupla de jogadores foi descartada: dados de 36 mil jogadores em todo save para uma diferença que quase não apareceria). Versão **8.5**.

## Regra

- `RosterPlayer.settling?: { games, need }` (`src/Domain/settling/settling.ts`). Ausente = adaptado, × 1 sem nenhum sorteio novo: um elenco sem contratações joga exatamente como antes. Vale para humano e IA.
- **Quem começa:** toda chegada a outro clube (`arriving`): compra, pré-contrato, livre (humano, reposição da virada e `freeAgentTick`) e início de empréstimo. Não: quem sobe da base, a volta de empréstimo (`settled`) e os kits (mercado congelado).
- **Efeito:** atributos × (1 − `PENALTY` × (1 − jogos / necessários)), com `PENALTY` 0,04, no motor (`withSettlingExecution`, titular e banco, depois da moral) e no quickSim (`XIPlayer.k`).
- **Duração:** 15 jogos pelo clube, amistosos inclusive; 10 com 2 ou mais companheiros da mesma língua (`languageOf`: grupos em espanhol, português, inglês, francês, alemão, árabe e servo-croata; outra nação é um grupo próprio; lidos só na chegada). Conta quem entrou em campo, em `finalizeSquadsAfterMatch`; o amistoso do diretor também conta (titulares e quem entra no segundo tempo); base e seleção não contam.
- **Virada do país do clube:** todos passam a adaptados (`resetSquadForNewSeason`), mesmo com poucos jogos.

## Telas

- Selo "Adaptação 3/15" no elenco e na ficha (`SettlingBadge`, `DisplayPlayer.settling`), com a explicação no `title`.
- `/test`: cenário `newcomers`, linha "Newcomers" no `EnergyPanel`. `/lab`: `Variant.newcomers` (slider), rótulo `· new N`, `TeamRawStats.newcomers` → `avgNewcomers`, linha "New signings" no `PairDetail`. `Statistics.ts`: nada novo (como a moral, o efeito aparece em vitórias, gols e chutes).

- Formação (10.6.2, report do usuário): quantos jogos faltam (`need − games`). Na lista de titulares e reservas, um número em âmbar depois do nome (só o número, para não espremer o nome; a frase vai no `title`); no campo, ícone e número ao lado do fôlego; na ficha ao passar o mouse (`PlayerTipBody`, também no painel de substituições da partida), a linha "Adaptação 3/15 · faltam 12 jogos". i18n `settling.label`, `settling.left`, `settling.progress`.

- Substituições da partida (10.6.4, report do usuário): no painel (`SubsPitchView`), aperto de mão em âmbar com os jogos que faltam ao lado do rosto no mini campo, e só o número em âmbar depois do nome no banco.

## Medição (`bun scripts/settling-measure.ts`)

Motor, 4-3-3, equilibrado, fôlego 88, 5 titulares recém-chegados (no primeiro jogo, o pior caso) de um lado; cada par duas vezes com os lados trocados. V − D do lado com contratações (o ganho em vitórias é a metade, como na moral):

| Penalidade | Premier | Championship |
|---|---|---|
| 0,015 (1500 jogos) | −4,0 | +2,5 |
| 0,03 (1200) | −3,4 | −2,8 |
| 0,04 (1200) | −5,7 | −5,8 |

Ficou 0,04: cerca de −2,9 pontos de vitória, dentro da meta de 2 a 4. Os dois lados com 5 recém-chegados a 0,015 × ninguém: 2,188 × 2,183 gols (Premier, 1500 jogos cada). O mundo começa sem recém-chegados e cada clube tem poucos por vez: `QuickSimConfig` não mudou.

## Testes

`bun test src/Domain/settling src/lab`.

## Limitações

- O efeito é individual: não há ligação entre jogadores vizinhos nem entre nacionalidades no campo.
- A língua é uma aproximação pela nacionalidade.
- Um reserva que não joga segue em adaptação até a virada.
