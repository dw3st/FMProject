# Inscrição por competição

Spec: `docs/superpowers/specs/2026-10-09-competition-registration-design.md`. Etapa 37 do `docs/ROADMAP.md` (#103),
versão **4.15**. Visual: `.claude/rules/ui-standard.md`. Janelas: `transfer-windows.md`.

## Regra

- Cada clube tem uma **lista de inscritos por competição**: liga, copa nacional e continental (`Squad.registrations`,
  chave = slug da competição). Os torneios de base (`u21_*`, `u19_*`) **nunca** têm lista nem filtro.
- Só inscritos jogam: a escalação e o banco (motor e quickSim) saem só da lista (mais os livres); um titular salvo não
  inscrito é trocado no dia com aviso (motivo `unregistered`); a IA nunca escala não inscrito.
- A lista só muda com o **prazo aberto** (janela do país; na continental também antes da fase seguinte); fora dele
  fica congelada. Exceção: uma lista ausente ou de outra temporada é montada pela regra na primeira necessidade
  (carreira nova, troca de clube, kit, competição gerada fora de janela).
- IA e clube do jogador inscrevem sozinhos (os melhores dentro das regras); o jogador ajusta à mão na aba Inscritos.
- Sem migração (protótipo); kits não regenerados (lista ausente = inscrição inicial automática).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/registrationTypes.ts` | `RegistrationRule`, `RegistrationList`, `RegistrationStatus`, `RegistrationNotice`, `RegCounts`, visões da tela |
| `src/Domain/registration/registrationConfig.ts` | `REGISTRATION_RULES`, `RULE_BY_COUNTRY`, `RULE_BY_CONTINENT`, `RULE_BY_CONTINENTAL`, `MIN_REGISTERED` (18), `LINE_MINIMUMS`, `DOMESTIC_EXTRA` |
| `src/Domain/registration/nations.ts` (+ teste) | `normalizeNation` (`Czechia`, `United States`, `Türkiye`), `NATION_CONFED` (172 nações), grupos `EU`, `ibero`, `acp` |
| `src/Domain/registration/formed.ts` (+ teste) | `clubTrained`, `nationTrained`, `isFormed`, `isForeign`, `isFree`, `domesticNations` |
| `src/Domain/registration/rules.ts` (+ teste) | `ruleFor`, `autoRegister`, `validateList`, `canAdd`, `countsOf`, `registeredSet`, `rosterSig`, `limitForeignPool`, `matchdayPool` |
| `src/Domain/registration/deadlines.ts` (+ teste) | `registrationStatus` (janela + fases da continental) |
| `src/Domain/registration/lists.ts` (+ teste) | `ensureList` (primeira lista), `aiRefresh`, `humanDay`, `manualList`, `automaticList` |
| `src/Domain/lineupHelpers.ts`, `advanceDay/matchSimulationLineups.ts`, `matches.ts` | `registered` no preenchimento e na troca; `MatchRegistration`, `registeredPool`, `pools` do banco |
| `src/backend/registrationWorld.ts` (+ teste) | E/S: `registrationDayCtx`, `matchRegistration`, `humanRegistrationDay`, `refreshAiRegistrations`, `humanMatchRegistrationToday` |
| `src/backend/registrationRoutes.ts` (+ teste) | Rotas |
| `src/backend/advanceDay.ts` (+ `registration.advanceDay.test.ts`) | Manhã do clube do jogador, lista garantida em cada jogo, IA depois do mercado, recusa de gravação, contador do log |
| `src/backend/routes.ts` (`match-setup`), `saves.ts` (rotação), `jobWorld.ts` | Partida ao vivo e prévia só com inscritos; troca de clube |
| `src/Domain/inbox/registrationMessage.ts`, `inboxTypes.ts`, `inboxTopics.ts`, `inboxThemes.ts` | Inbox `registration` (tópico `competitions`) |
| `src/GameInterface/Squad/RegistrationView.tsx`, `registrationApi.ts`, `SquadScreen.tsx`, `FormationScreen.tsx`, `MatchPreviewScreen.tsx`, `MatchScreen.tsx`, `InboxScreen.tsx` | Telas |
| `scripts/registration-measure.ts`, `scripts/registration/probe.ts` (`market-sim.ts --registration`) | Medição |

## Definições

- **Estrangeiro** (`isForeign`): nação (normalizada) fora dos domésticos (`país + rule.domestic + DOMESTIC_EXTRA`:
  Inglaterra + País de Gales; EUA + Canadá). `nonEU` (La Liga, Ligue 1): também fora da UE/EEE e das isenções — La Liga
  isenta `ibero` (CONMEBOL + México/América Central/Caribe hispânico, a dupla nacionalidade espanhola) e `acp` (Cotonou);
  Ligue 1 só `acp`. Nacionalidade ausente = doméstico.
- **Formado no clube** (`clubTrained`): id `youth_<clube>_…` / `es_youth_<clube>_…`, `RosterPlayer.academyOf` (prospecto
  contratado para a base, renascido aceito) ou ≥ 3 temporadas distintas no `history` no clube com ≤ 21 anos.
- **Formado no país** (`nationTrained`): nação doméstica (ou ausente) — a formação antes da carreira não existe nos
  dados — ou ≥ 3 temporadas em clubes do país com ≤ 21. **Formado da regra** = no clube ou no país (um mínimo único).
- **Livre** (`isFree`, lista B): idade ≤ `free.maxAge` (e formado, se `formedOnly`); sempre inscrito, não ocupa vaga,
  entra mesmo com o prazo fechado; conta no limite de estrangeiros.

## Regras

| Competição | Regra do jogo |
|---|---|
| Premier League (pirâmide inglesa) | 25, sub-21 livres, mínimo de 8 formados |
| La Liga (Espanha) | 25, sub-21 formados livres, 8 formados, até 3 extracomunitários (`ibero` e `acp` isentos) |
| Serie A (Itália) | 25, sub-21 livres, 8 formados |
| Bundesliga (Alemanha) | 30, 8 formados (sem os 12 alemães) |
| Ligue 1 (França) | 30, até 4 extracomunitários (`acp` isento) |
| Brasileirão (pirâmide) | elenco inteiro; **até 9 estrangeiros por jogo** (XI + banco) |
| Argentina | elenco inteiro, até 6 estrangeiros |
| Arábia Saudita · México · MLS | elenco inteiro, até 10 · 9 · 10 estrangeiros (MLS: EUA + Canadá domésticos) |
| Champions / Europa League | 25, sub-21 formados livres, 8 formados |
| Libertadores / Sul-Americana | 50, sem limite de estrangeiros nem de formados (a regra real) |
| Copa nacional | a regra da liga do clube (lista própria) |
| Padrões | Europa 25 + sub-21 formados livres + 8 formados · América do Sul 6 estrangeiros · América do Norte/Central 8 · Ásia 8 · África 6 · Oceania 5 |

`ruleFor`: continental → país do clube (liga e copa) → continente do país → Europa. A falta de formados **reduz**
a lista (não formados contados ≤ teto − mínimo). Mínimos de linha da escolha automática (GK 2 · DEF 5 · MID 5 · FWD 3);
piso de 18 inscritos completado ignorando os limites (`exception`).

## Prazo (`registrationStatus`)

- Liga e copa: janela do país do clube (`WindowContext.ofLeague`; clube do jogador `human()`, com a carência de 30 dias).
- Continental: janela aberta **e** antes do 1º jogo de grupo, ou entre o fim dos grupos e a ida das oitavas; fechada
  de vez quando o mata-mata começa.
- A virada deixa as listas da liga e da copa velhas; são refeitas na abertura da janela de pré-temporada (ou no
  primeiro jogo, se vier antes).

## Inscrição automática

- `autoRegister`: pela nota (desempate id), mínimos de linha primeiro, depois os melhores que cabem (teto, vagas de não
  formados, estrangeiros), depois o piso de 18.
- **IA** (`refreshAiRegistrations`, depois do mercado e do tick de livres): com o prazo aberto, refaz a lista quando o
  elenco mudou (`sig`) ou ela está velha; fechado, nada muda. Na hora do jogo (`matchRegistration`), lista ausente/velha
  é montada mesmo fechado.
- **Clube do jogador** (`humanRegistrationDay`, toda manhã, antes dos jogos): lista ausente/velha → automática
  (`auto_list`). Prazo aberto: sem `manual` refaz como a IA; com `manual` só acrescenta quem chegou (ou esperava,
  `waiting`) e cabe, nunca quem ele tirou (`out`); quem fica fora recebe **um** aviso (`not_fit`, `notified`). Prazo
  fechado: quem chegou recebe `waiting` com a data de abertura. Três dias antes do fecho: `closing` com os contadores.

## Escalação

- `computeMatchSimulationLineups(..., registration)`: IA pelo `registeredPool` (inscritos + o limite por jogo do
  Brasil); clube do jogador por `resolveUserLineup(..., registration)` (`unregistered`, depois `matchdayPool` com
  `foreignLimit`); devolve `pools` (quem pode ir para o banco) que `buildMatchEvent` usa. Sem registro = como antes.
- Partida ao vivo: `match-setup` devolve `registered { mine, opp }` (o `MatchScreen` filtra os dois elencos) e o XI
  provável do adversário só com inscritos; a rota de rotação usa o mesmo conjunto. O avanço do dia **recusa** uma
  gravação com não inscrito nas estatísticas (400 `unregistered player in recording`).
- `StoredDayLog.registrationViolations` conta XI ou estatística com não inscrito (sempre 0).

## Rotas (`requireSaveOwner`; escrita com `withSaveLock`; sem clube → 409 `noClub`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/registration` | Competições do clube: regra, prazo, `manual`, `exception`, contadores, linhas (`registered`, `foreign`, `clubTrained`, `nationTrained`, `free`, `canAdd`, `reason`) |
| `PUT /api/saves/:id/registration/:competition { ids }` | Lista à mão (`manual`; os tirados vão para `out`). 409 `registrationClosed { opensOn, stageStarted? }`, 400 `notYourPlayer` / `ruleViolation { kind }`, 404 `notInCompetition` |
| `POST /api/saves/:id/registration/:competition/auto` | Volta ao automático (mesmos erros de prazo e competição) |

## Telas

- **Elenco → Inscritos** (`?tab=registration`, só o próprio clube): competições em `SegmentedTabs compact`, prazo,
  regra em uma linha, contadores (inscritos, estrangeiros, formados com vagas perdidas, livres), tabela padrão com
  posição, idade, nação, selos (Inscrito/Não inscrito, Livre, Estrangeiro, Formado no clube/país), nota e
  Incluir/Tirar (desligado fora do prazo, com o motivo); "Automático" (confirmação quando editada à mão).
- **Formação:** selo "Não inscrito" (competição do próximo jogo no `title`); o jogador continua escolhível.
- **Prévia:** trocas `unregistered` / `foreignLimit` na lista de avisos.
- **Inbox** `registration` (ícone `clipboard`, tópico `competitions`): `auto_list`, `not_fit`, `waiting`, `closing`,
  `exception`, com link para a aba.
- i18n `registration.*`, `inbox.registration.*`, `matchPreview.unregisteredReplaced`/`foreignLimitReplaced`,
  `squadScreen.tabRegistration` (en, pt-BR).

## `/test`, `/lab`

Sem efeito de partida: a inscrição só filtra quem pode ser escalado, antes do motor; `Statistics.ts` não muda.

## Medição

`bun scripts/registration-measure.ts [--market]` (mundo inicial, código real; "Lista" inclui os livres; "Reduzida" =
lista abaixo do teto por falta de formados):

| Regra | Clubes | Elenco | Lista | Reduzida | < 18 | Estrangeiros fora / clube | Dos 11 melhores fora / clube |
|---|---|---|---|---|---|---|---|
| europe (padrão) | 482 | 28,2 | 27,5 | 84 | 0 | 0,45 | 0,00 |
| south_america | 121 | 29,4 | 28,8 | 0 | 0 | 0,66 | 0,09 |
| africa | 108 | 28,7 | 28,6 | 0 | 0 | 0,08 | 0,00 |
| asia | 98 | 28,9 | 27,6 | 0 | 0 | 1,33 | 0,02 |
| serie_a | 96 | 28,8 | 28,4 | 11 | 0 | 0,21 | 0,00 |
| argentina | 66 | 29,5 | 29,4 | 0 | 0 | 0,15 | 0,03 |
| brazil | 60 | 29,4 | 29,4 | 0 | 0 | 0,00 | 0,00 |
| premier_league | 44 | 28,9 | 28,4 | 16 | 0 | 0,34 | 0,00 |
| la_liga | 42 | 29,1 | 28,3 | 1 | 0 | 0,19 | 0,05 |
| ligue_1 | 36 | 28,8 | 28,3 | 0 | 0 | 0,50 | 0,17 |
| saudi | 32 | 27,5 | 27,1 | 0 | 0 | 0,34 | 0,06 |
| mls | 30 | 29,3 | 24,1 | 0 | 0 | 5,23 | 0,73 |
| oceania | 22 | 28,3 | 27,7 | 0 | 2 | 0,59 | 0,00 |
| bundesliga | 18 | 28,7 | 28,7 | 1 | 0 | 0,00 | 0,00 |
| mexico | 18 | 29,2 | 28,0 | 0 | 0 | 1,17 | 0,00 |
| uefa (todo o mundo) | 1273 | 28,7 | 27,7 | 141 | 0 | 0,42 | 0,00 |
| conmebol (todo o mundo) | 1273 | 28,7 | 28,7 | 0 | 0 | 0,00 | 0,00 |

Mercado (`bun scripts/market-sim.ts 1 --registration`, semente 12345): das 684 contratações da IA com taxa conferidas
quando a janela do comprador fecha, 14 ficaram fora da lista (2,0%; LOW 0%, MEDIUM 2,2%, HIGH 5,6% de 72). Abaixo de 5%:
o mercado da IA continua sem olhar a inscrição.

## Testes e smoke

```
bun test src/Domain/registration src/Domain/advanceDay/registrationLineups.test.ts src/Domain/inbox \
  src/backend/registrationWorld.test.ts src/backend/registration.advanceDay.test.ts src/backend/registration.routes.test.ts
```

`scripts/season-rollover-smoke.ts`, seção "Inscrição": nenhum jogador de jogo oficial (país do jogador e continentais)
fora do conjunto de inscritos (foto antes do dia ∪ lista depois do dia) e `registrationViolations` = 0; toda lista
atual do mundo válida pela regra (ou `exception`); `PUT` num dia fechado → 409; tirar à mão num dia aberto → 200 e ele
fica fora; uma chegada com o prazo fechado não joga e entra sozinha quando abre; `match-setup` troca o titular tirado
da lista (`unregistered`).

## Limitações

- A formação antes da carreira não existe: estrangeiro formado na Europa conta como não formado; nacional formado fora
  conta como formado. Por isso um mínimo único "formados no clube/país" em vez de 4 + 4.
- Sem dupla nacionalidade: as isenções `ibero`/`acp` aproximam a regra comunitária.
- A IA compra sem olhar a inscrição (o mercado não mudou); ver a medição do mercado.
- O banco do motor é o elenco inteiro inscrito (fora do Brasil não há lista de 23 por jogo).
- Libertadores e Sul-Americana sem trocas por fase além do prazo.
