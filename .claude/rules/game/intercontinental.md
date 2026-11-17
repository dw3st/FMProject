# Copa Intercontinental

Spec: `docs/superpowers/specs/2026-11-17-champions-league-phase-and-intercontinental-design.md` (Etapa 2). Uma edição
por ano, em dezembro. Visual: a aba "Intercontinental" de Ligas (feita à parte, sobre a rota abaixo).

## Regra

- **Pasta `leagues/icc`** (meta `kind: "intercontinental"`, `meta.intercontinental`, 5 arquivos de rodada, um por jogo,
  date-index; sem tabela). Fora de `meta.activeLeagues`. O avanço do dia joga os jogos pelo date-index, como uma copa.
- **Geração:** no primeiro dia de dezembro avançado (`ensureIntercontinental`, `advanceDay` logo depois das continentais),
  se ainda não existe a edição do ano. Nunca na pré-simulação dos start kits (`marketFrozen`). A edição anterior é
  arquivada nesse dia: `seasons/<ano>/icc/` com um título e a chave (`SeasonArchive.intercontinental`, `calendar`).
- **6 vagas:** Europa = campeão da Champions que acabou em maio (arquivo `ucl` do ano − 1); América do Sul = campeão da
  Libertadores do ano (meta `lib` do ano ou arquivo); Ásia, África, América do Norte e Central, Oceania = campeão da
  liga de nível 1 mais forte da confederação (média de `clubLevel`, o coeficiente das vagas continentais) **entre as que
  já têm uma temporada fechada** (arquivo do ano da liga − 1); a confederação do país vem de `confedOfCountry`.
  Um clube nunca ocupa duas vagas (entra o próximo da tabela/o vice); sem ninguém, a vaga fica com bye.
- **Chave** (jogo único, campo neutro, prorrogação e pênaltis, `Fixture.knockout`/`neutral`): 1 Oceania × Ásia;
  2 vencedor × África; 3 América do Norte × Libertadores; 4 vencedores de 2 e 3; 5 final contra o campeão da Champions.
  Lado vazio = bye (o outro passa sem jogar; os byes se encadeiam). O jogo seguinte é escrito quando os dois lados se
  conhecem (`advanceIntercontinental`, depois dos jogos do dia).
- **Datas:** 4 datas (1 e 3 dividem a primeira), depois do dia da geração: quartas e sábados de dezembro, nunca num dia
  de jogo (liga, copa, continental) de um participante nem num dia bloqueado de seleção dos países deles, pelo menos
  2 dias entre elas. Sem 4 assim: qualquer dia livre de dezembro, depois de janeiro (`iccDates`). Os jogos de liga dos
  participantes colados numa data são remarcados no mesmo dia (escopo do `rescheduleFixtureConflicts`; a Intercontinental
  é carregada como continental: nunca se move).
- **Simulação:** motor completo com um clube humano ou da liga de um assento; senão quickSim (a regra das continentais).
  Sem lista de inscritos (todo o elenco joga). Árbitro: qualquer continente, de um país sem clube no jogo; com VAR.
- **Efeitos:** prêmio de participação €10M (na geração), €15M por vitória (bye não paga), +€25M do título
  (`ICC.PRIZE`; humano: extrato `prize` com `ref.competition = "icc"`; IA: `aiBudgetWithPrize`). Título
  `continental:icc` nos títulos pendentes (história do clube e dos jogadores na próxima virada), 100 pontos de técnico
  (`kind: "continental"`, `competition: "icc"`, `ICC.MANAGER_POINTS`), título na diretoria, notícia de campeão.
  Caixa de entrada do assento (categoria `continental`, `competition: "icc"`, `stage` = nome do jogo): `qualified`,
  `draw` (adversário, data, campo neutro), `eliminated`, `champion`; adiadas como as continentais.
- **Calendário do técnico:** `playerIntercontinentalSlug` (clube entre os inscritos da edição atual) entra no calendário
  (`GET /api/saves/:id`), no avanço rápido, no `match-setup` e na véspera dos jogos.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/intercontinental/iccConfig.ts` | `ICC_SLUG`, `ICC` (prêmios, pontos, datas), `ICC_BRACKET` |
| `src/Domain/intercontinental/entrants.ts` | `pickIccEntrants` |
| `src/Domain/intercontinental/bracket.ts` | `initialMatches`, `stepBracket` (byes, próximos jogos, campeão), `iccFixture` |
| `src/Domain/intercontinental/iccDates.ts` | `iccDates` |
| `src/Domain/intercontinental/generateIcc.ts` | `generateIcc`, `iccRounds`, `buildIccArchive` |
| `src/backend/intercontinentalWorld.ts` | E/S: `iccEntrantsFor`, `ensureIntercontinental`, `advanceIntercontinental`, `playerIntercontinentalSlug`, `intercontinentalView` |
| `src/backend/advanceDay.ts` | Geração, avanço da chave, prêmios, título, pontos, mensagens |
| `src/types/calendarTypes.ts` | `IccConfed`, `IccMatchName`, `IccEntrant`, `IccMatch`, `IntercontinentalMetaData` |

## Rota

`GET /api/saves/:saveId/intercontinental?year=YYYY` (membro do mundo, `requireSeat`): `IntercontinentalView`
(`src/backend/intercontinentalWorld.ts`) = `{ years, year, meta, fixtures, names, entrants, current }`; sem `year`, a
edição atual. 400 ano inválido, 404 antes da primeira edição ou ano sem arquivo. i18n: `intercontinental.*` e os nomes
dos jogos também em `continental.stage.*` (a mensagem da caixa usa essas chaves). Nome da competição: `competitionName("icc")`.

## Testes

```
bun test src/Domain/intercontinental
bun test src/backend/intercontinental.advanceDay.test.ts
```

## Limitações

- Na primeira temporada quase só a Europa, a América do Sul e as ligas de ano cruzado (Arábia) têm campeão: as demais
  vagas ficam com bye até alguma temporada fechar.
- Vice da Champions/Libertadores só enquanto a meta da temporada ainda está em disco (o arquivo só guarda o campeão).
- Sem tela própria de inscrição, sem gol da temporada (não é liga) e sem pontos na classificação dos amigos.
- `/test` e `/lab`: sem efeito de partida (só formato de competição).
