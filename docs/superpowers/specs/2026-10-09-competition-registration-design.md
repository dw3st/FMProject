# Inscrição por competição (Etapa 37)

Etapa 37 do `docs/ROADMAP.md`, issue #103. Desenho aprovado em 2026-10-07/09. Sai como **4.15**.
Regras atuais que esta etapa toca: `.claude/rules/game/transfer-windows.md` (o prazo segue as janelas),
`cups.md`, `continental.md`, `injuries.md` / `discipline.md` (troca automática do indisponível), `fitness.md`
(assistente de rotação), `contracts.md`, `negotiation.md`, `youth.md`, `youth-competitions.md`. Visual:
`.claude/rules/ui-standard.md`.

## Decisões

| Tema | Decisão |
|---|---|
| O que é inscrito | Uma lista de inscritos **por clube e por competição**: liga, copa nacional e continental. Os torneios de base (4.14) **não** têm lista: são automáticos, sempre quickSim, com jovens e reservas |
| Regras | Regras reais simplificadas das principais competições (tabela §2) e **uma regra padrão por continente** nas demais |
| Limites | Teto da lista, jogadores livres por idade (a "lista B"), limite de estrangeiros (na lista ou por jogo) e mínimo de formados no clube/país (a falta **reduz** a lista, como na UEFA) |
| Prazo | A lista só muda com a janela de transferências do país do clube aberta (e, na continental, antes da fase seguinte começar); fora do prazo fica congelada; quem chega fora do prazo espera a próxima janela |
| IA | Inscreve sozinha por regra (os melhores dentro das regras), sem simular escolha |
| Clube do jogador | Inscrição automática com ajuste manual: o jogo monta a lista como a IA; o jogador troca nomes enquanto o prazo está aberto; um jogador novo entra sozinho se couber (senão aviso) |
| Não inscrito na escalação | Troca automática com aviso, como o lesionado (`replaceUnavailableStarters`, motivo "não inscrito"); aviso na prévia; selo na escalação; a IA nunca escala não inscrito. Vale no motor e no quickSim |
| Telas | Aba **Inscritos** no Elenco (só o próprio clube), uma competição por vez, com contadores, prazo, incluir/tirar e "Automático" |
| `/test`, `/lab` | Sem efeito de partida: a inscrição só filtra quem pode ser escalado; o motor não muda |
| Saves antigos, kits | Sem migração (protótipo); kits não regenerados: lista ausente = inscrição inicial automática na primeira necessidade |

## 1. Definições

### 1.1 Estrangeiro

`nation(p)` = `p.nationality` normalizada por um mapa de apelidos (`NATION_ALIAS`): no mundo atual três ligas
gravam o país com um nome e os jogadores com outro — `Czechia` → `Czech Republic`, `United States` → `USA`,
`Türkiye` → `Turkey` (sem isso 100% dos clubes da Turquia, dos EUA e da Tchéquia teriam o elenco inteiro
"estrangeiro"). `domestic(country)` = o próprio país, mais as exceções da regra: **Inglaterra + País de Gales**
(o "home-grown" inglês conta a formação na Inglaterra e no País de Gales; clubes galeses jogam o futebol inglês),
**EUA + Canadá** (MLS). Nacionalidade ausente (≈ 1% dos jogadores) = **doméstico** (o dado faltante não pode
tirar ninguém da lista).

Três definições de estrangeiro (`ForeignKind`), escolhidas pela regra:

| `ForeignKind` | Estrangeiro é | Usada em |
|---|---|---|
| `nationality` | Nação fora de `domestic(country)` | Padrões continentais, Brasil, Argentina, Arábia, México, MLS |
| `nonEU` | Fora de `domestic`, fora da UE/EEE e fora das isenções da regra | La Liga, Ligue 1 |

Isenções (`NATION_GROUPS`): **`ibero`** (CONMEBOL + México, América Central e Caribe hispânico — aproxima a dupla
nacionalidade espanhola dos latino-americanos, que a obtêm em 2 anos de residência) e **`acp`** (África, Caribe e
Pacífico: o acordo de Cotonou que a Espanha e a França aplicam no futebol). La Liga isenta `ibero` + `acp`; Ligue 1
isenta `acp`. **Por quê:** o mundo não tem dupla nacionalidade; sem as isenções, a regra estrita (3 / 4
extracomunitários) tira **1,45 titular por clube** na La Liga e **2,06 na Ligue 1** (Vini, Valverde…, medido no
protótipo, §8); com elas, 0,10 e 0,33.

O mapa de nações (`NATION_CONFED`: nação → confederação UEFA/CONMEBOL/CONCACAF/CAF/AFC/OFC, `EU`, `ibero`, `acp`)
cobre as **172 nacionalidades do mundo** (teste contra `src/example_data/squads`).

### 1.2 Formado no clube / formado no país

Só existe histórico **desde o começo da carreira** (`RosterPlayer.history`, `.claude/rules/game/history.md`), e as
linhas não têm idade — a idade numa temporada é `p.age − (ano de início da temporada atual − ano de início da linha)`.

| Conceito | Critério |
|---|---|
| **Formado no clube** (`clubTrained(p, squadId)`) | (a) saiu da base do clube: id `youth_<squadId>_…` (safra e jovens de reposição, `youth.ts`/`freeAgents.ts`), `es_youth_<squadId>_…` (jovens do importador) ou `academyOf === squadId` (campo novo, gravado quando um prospecto dos olheiros é contratado para a base ou um renascido é aceito — os dois têm id sem o clube); **ou** (b) ≥ 3 temporadas distintas no `history` nesse clube com idade ≤ 21 na temporada (parciais da mesma temporada contam uma) |
| **Formado no país** (`nationTrained(p, country)`) | Formado num clube do país (mesmas regras, somando clubes cujo `league` é do país); **ou**, por falta de histórico antes da carreira, **nação em `domestic(country)`** |
| **Formado (da regra)** | Formado no clube **ou** no país — um único mínimo, sem divisão 4 + 4 |

**O que não dá para saber, e a aproximação:** a formação antes da carreira não existe nos dados. Um estrangeiro que
chegou ao clube aos 16 (ex. um jovem africano formado na Europa) conta como **não formado**; um nacional formado no
exterior conta como **formado**. Por isso as regras reais que pedem "4 formados no próprio clube" (UEFA, La Liga,
Serie A, Bundesliga) viram um mínimo único "formados no clube/país": no começo da carreira quase ninguém é formado no
clube (338 jogadores do importador em 228 clubes, nenhum id `youth_`), e a divisão 4 + 4 encolheria toda lista em
~4 vagas por um artefato dos dados. O formado no clube continua contando para a lista B da UEFA (§2) e na tela.

### 1.3 Livres (lista B)

Algumas regras não contam os jovens: um jogador com idade ≤ `free.maxAge` (e, se `free.formedOnly`, formado da
regra) **está sempre inscrito**, não ocupa vaga e **pode entrar a qualquer momento**, mesmo com o prazo fechado
(como a lista B da UEFA e os sub-21 da Premier). Um jovem promovido da base no meio da temporada joga na hora.
Estrangeiros livres continuam contando no limite de estrangeiros.

## 2. Regras (`REGISTRATION_RULES`, `src/Domain/registration/registrationConfig.ts`)

```ts
interface RegistrationRule {
  id: string;
  maxList: number | null;            // vagas contadas (null = o elenco inteiro)
  free?: { maxAge: number; formedOnly: boolean };
  minFormed?: number;                // falta de formados reduz as vagas (vagas de não formados ≤ maxList − minFormed)
  maxForeign?: number;               // estrangeiros na lista (livres incluídos)
  maxForeignMatchday?: number;       // estrangeiros relacionados por jogo (XI + banco)
  foreign: ForeignKind;
  exempt?: ("ibero" | "acp")[];
  domestic?: string[];               // nações domésticas além do país
}
```

Regra real → simplificação (pesquisa de 2026-10, regulamentos 2024/25–2025/26):

| Competição | Regra real (resumo) | Regra do jogo |
|---|---|---|
| **Premier League** (pirâmide inglesa toda) | 25 acima de 21 anos, no máx. 17 não "home-grown" (8 HG: 3 temporadas num clube inglês/galês entre 15 e 21); sub-21 livres | `maxList 25`, `free ≤ 21` (qualquer), `minFormed 8`, domésticos Inglaterra + País de Gales |
| **La Liga** (Espanha) | 25 na lista; mín. 8 "formados en clubes españoles" (4 no próprio); máx. 3 extracomunitários; sub-23 do time B à parte; Cotonou e dupla nacionalidade comuns | `maxList 25`, `free ≤ 21` formados, `minFormed 8`, `maxForeign 3` `nonEU` com isenção `ibero` + `acp` |
| **Serie A** (Itália) | 25 acima de 22; 8 formados (4 no clube); sub-22 livres; cota de contratação de extracomunitários (fora daqui) | `maxList 25`, `free ≤ 21` (qualquer), `minFormed 8` |
| **Bundesliga** (Alemanha) | Sem teto de elenco; 8 formados localmente (4 no clube); 12 alemães sob contrato | `maxList 30`, `minFormed 8`; o mínimo de 12 alemães sai (3 clubes têm menos de 8 alemães: inviável) |
| **Ligue 1** (França) | Sem teto; máx. 4 extracomunitários (Cotonou isenta) | `maxList 30`, `maxForeign 4` `nonEU` com isenção `acp` |
| **Brasileirão** (pirâmide brasileira toda) | Inscrição no BID sem limite; até 9 estrangeiros relacionados por jogo | `maxList null`, `maxForeignMatchday 9` |
| **Argentina** | 6 estrangeiros na lista, 5 em campo | `maxList null`, `maxForeign 6` |
| **Arábia Saudita** | 10 estrangeiros no elenco | `maxForeign 10` |
| **México** | Até 9 "não formados no México" | `maxForeign 9` |
| **MLS (EUA)** | 8 vagas internacionais (negociáveis; green card conta como doméstico) | `maxForeign 10` (8 vagas + green card simplificado), domésticos EUA + Canadá |
| **Champions / Europa League** | Lista A 25, mín. 8 formados localmente (máx. 4 da associação), lista B sub-21 formados no clube | `maxList 25`, `free ≤ 21` formados, `minFormed 8` |
| **Libertadores / Sul-Americana** | Lista de até 50, sem limite de estrangeiros nem de formados | `maxList 50`, sem mínimo de formados nem limite de estrangeiros (a regra real; decisão do usuário 2026-10-09) |
| **Copa nacional** | — | **a regra da liga do clube** (lista própria, mesmo prazo) |
| **Padrão Europa** | (Bélgica, Holanda, Escócia, Portugal, Turquia… usam variações de 25 + formados) | `maxList 25`, `free ≤ 21` formados, `minFormed 8` |
| **Padrão América do Sul** | — | `maxForeign 6` |
| **Padrão América do Norte/Central** | — | `maxForeign 8` |
| **Padrão Ásia** | — | `maxForeign 8` |
| **Padrão África** | — | `maxForeign 6` |
| **Padrão Oceania** | (A-League: 5 vagas de visto) | `maxForeign 5` |

Ordem de busca (`ruleFor`): competição continental → copa (vira a regra da liga do clube) → liga por slug →
país (`RULE_BY_COUNTRY`: Inglaterra, Espanha, Itália, Alemanha, França, Brasil, Argentina, Arábia Saudita, México,
EUA) → continente do país (`countries.json`) → padrão Europa.

**Mínimos de linha e piso:** a escolha automática garante, quando o elenco tem, GK 2 · DEF 5 · MID 5 · FWD 3
inscritos. **Piso de jogo (`MIN_REGISTERED = 18`):** se as regras deixam menos de 18 inscritos (contando livres), o
clube completa até 18 com os melhores que sobraram ignorando os limites, marcado `exception: true` (contado na
medição; nunca deixa um clube sem time). Sem isso dois clubes da Oceania ficariam abaixo de 18 (§8).

## 3. Dados

```ts
// src/types/registrationTypes.ts
interface RegistrationList {
  season: string;          // rótulo da temporada da competição (liga: seasonLabel; copa/continental: ano da meta)
  ids: string[];           // inscritos contados e não contados (os livres não precisam estar aqui)
  updatedOn: string;
  sig: string;             // assinatura dos ids do elenco quando a lista foi feita (IA: recalcula se mudar)
  manual?: true;           // clube do jogador: editada à mão (não é mais refeita inteira)
  out?: string[];          // clube do jogador: tirados à mão (o automático não os põe de volta)
  notified?: string[];     // clube do jogador: chegadas que já receberam aviso de "não coube"
  exception?: true;        // completada pelo piso de 18
}
Squad.registrations?: Record<string /* slug da competição */, RegistrationList>;
RosterPlayer.academyOf?: string;   // clube cuja base o formou (prospecto contratado, renascido aceito)
```

Uma lista vale só para a temporada gravada; com outra temporada ela é **velha** (tratada como ausente). Quem saiu do
elenco é filtrado na leitura (`registeredSet`). A IA grava as listas no próprio squad (~1 KB por clube).

## 4. Prazo (`registrationStatus`)

| Competição | Aberto quando |
|---|---|
| Liga e copa | Janela do país do clube aberta (`WindowContext.ofSquad`); clube do jogador: `human()` (inclui a carência de 30 dias da carreira nova) |
| Continental | Janela do país do clube aberta **e** a fase seguinte ainda não começou: antes do 1º jogo de grupo (fase de grupos) ou entre o fim dos grupos e a ida das oitavas (mata-mata); fechado depois disso |

- **Fechado = congelado:** nem a IA nem o jogador mudam a lista. Quem chega fora do prazo (livre fora da janela,
  reposição da virada, pré-contrato que chega na virada) só entra na próxima abertura. Os **livres** (§1.3) entram
  sempre.
- **Inscrição inicial:** uma lista ausente ou velha é montada pela regra mesmo com o prazo fechado (carreira nova,
  troca de clube, kit sem listas, competição gerada fora de janela). É a única exceção ao congelamento.
- A temporada nova: a virada do país deixa as listas da liga e da copa velhas; elas são refeitas na abertura da
  janela de pré-temporada (sempre antes do primeiro jogo, `end + 14` → `start + 16`). As continentais regeneradas
  também.

## 5. Inscrição automática

`autoRegister(players, rule, ctx)` (puro): ordena por overall (`computeOverallAvg`); reserva os mínimos de linha
pelos melhores de cada linha; depois enche pelos melhores. Cada jogador entra se cabe: `maxList` (livres não
contam), vagas de não formados `≤ maxList − minFormed`, estrangeiros `≤ maxForeign`. A falta de formados reduz a
lista sozinha. Depois o piso de 18. Determinístico (desempate por id). `maxForeignMatchday` não age na lista.

- **IA:** a lista é refeita inteira (os melhores) quando o prazo está aberto e o elenco mudou (`sig`) ou a lista
  está ausente/velha. Momento: (a) **depois do mercado do dia** (`advanceDay`, bloco do mercado, que já lê todos os
  elencos; inclui o tick de livres) — assim uma contratação no último dia da janela entra; (b) **na hora do jogo**,
  se a lista do clube estiver ausente/velha (inscrição inicial). Só grava os squads cuja lista mudou.
- **Clube do jogador**, toda manhã do avanço (antes dos jogos, então quem foi contratado hoje pelas rotas já pode
  jogar hoje se o prazo está aberto): lista ausente/velha → automática (inbox "lista montada"). Com o prazo aberto:
  sem `manual`, refeita inteira como a IA (um jogador novo que fica fora recebe aviso); com `manual`, só **acrescenta**
  quem chegou e cabe (fora de `out`); quem não cabe recebe **um** aviso (`notified`). Com o prazo fechado, quem chegou
  recebe o aviso "fica fora até <abertura>" (uma vez).

## 6. Escalação

`eligibleForMatch(squad, competition, rule, date)` = inscritos (lista + livres) e disponíveis (`isUnavailable`).

- **IA** (`computeMatchSimulationLineups`, `match-setup` → XI provável do adversário): escalação automática e banco
  saem só dos inscritos. Nunca escala não inscrito.
- **Clube do jogador:** `replaceUnavailableStarters(..., registered)` troca o titular não inscrito pelo melhor
  reserva inscrito, motivo `"unregistered"` (o lesionado e o suspenso continuam com os seus); `suggestRotation` e o
  preenchimento automático usam só inscritos.
- **Por jogo (Brasileirão):** `matchdayPool(players, lineup, rule)` — com mais de 9 estrangeiros entre XI e banco,
  os estrangeiros a mais do XI (os piores do XI) saem pelo melhor reserva doméstico (motivo `"foreignLimit"`) e o banco
  fica só com os estrangeiros que ainda cabem (melhores primeiro). A IA monta o XI já limitado.
- **Motor e quickSim:** `buildMatchEvent`/`buildQuickMatchEvent` recebem o elenco filtrado (já filtram o
  indisponível), então nem o banco do motor tem não inscrito; o quickSim usa o XI automático filtrado.
- **Partida ao vivo:** `match-setup` devolve `registered: { mine, opp }` (ids) e os motivos; o `MatchScreen` filtra o
  elenco dos dois lados como já filtra o indisponível. O avanço do dia **recusa** uma gravação com um jogador não
  inscrito nas estatísticas (400 `unregistered player in recording`), como a gravação de mata-mata sem vencedor.
- **Tela de escalação:** selo "Não inscrito (<competição>)" para o próximo jogo do calendário; o jogador continua
  arrastável (a troca acontece no dia, com aviso). **Prévia:** a lista de trocas já existente mostra o motivo
  "não inscrito na <competição>" / "limite de estrangeiros".

## 7. Telas, rotas, inbox

- **Elenco → aba "Inscritos"** (`?tab=registration`, só o próprio clube). Escolha: o Elenco já é onde o jogador
  administra pessoas (Profundidade, Base, Emprestados); a aba Clube é infraestrutura (instalações). Conteúdo:
  `SegmentedTabs compact` com as competições do clube (liga, copa, continental); cabeçalho com o prazo ("Aberta até
  31/08" / "Fechada — abre em 01/01"), a regra em uma linha e contadores (`Inscritos 23/25`, `Estrangeiros 3/3`,
  `Formados 6/8 — 2 vagas a menos`, `Livres 4`); tabela (`TABLE_STYLE`) com posição, nome, idade, nação (bandeira),
  selos Estrangeiro / Formado no clube / Formado no país / Livre, nota, e o botão Incluir/Tirar (desligado com o prazo
  fechado, com o motivo: lista cheia, limite de estrangeiros, sem formados suficientes); botão "Automático" (refaz e
  volta ao modo automático, com confirmação se `manual`).
- **Rotas** (`src/backend/registrationRoutes.ts`, `requireSaveOwner`, escrita com `withSaveLock`, sem clube → 409
  `noClub`): `GET /api/saves/:id/registration` (todas as competições do clube: regra, status, lista, contadores,
  linhas por jogador com `canAdd` e o motivo); `PUT /api/saves/:id/registration/:competition { ids }` (substitui;
  409 `registrationClosed { opensOn }`, 400 `notYourPlayer` / `ruleViolation { kind }`, 404 `notInCompetition`);
  `POST /api/saves/:id/registration/:competition/auto`.
- **Inbox** categoria nova `registration` (tópico `competitions`): `auto_list` (lista montada), `not_fit` (chegou e
  não coube), `waiting` (chegou fora do prazo; entra em <data>), `closing` (prazo fecha em 3 dias, com contadores),
  `exception` (lista completada pelo piso). Mensagens adiadas para depois do `clearInbox`, como as demais.
- i18n `registration.*`, `matchPreview.unregisteredReplaced`, `matchPreview.foreignLimitReplaced`,
  `squadScreen.tabRegistration` (en, pt-BR).

## 8. Medição

Protótipo (2026-10-09, mundo 4.14, o mesmo algoritmo de §5, nação normalizada; "titulares fora" = dos 11 melhores do
clube por overall, quantos ficam fora da lista):

| Regra | Clubes | Elenco | Lista | Lista reduzida (formados) | < 18 (piso) | Estrangeiros fora / clube | Titulares fora / clube |
|---|---|---|---|---|---|---|---|
| Premier League | 20 | 28,9 | 25,6 | 10 | 0 | 2,80 | 0,00 |
| La Liga (com isenções) | 20 | 29,3 | 28,3 | 3 | 0 | 0,35 | 0,10 |
| La Liga (estrita, 3 extracomunitários) | 20 | 29,3 | 24,9 | 17 | 1 | 4,30 | 1,45 |
| Serie A | 20 | 29,1 | 25,8 | 12 | 0 | 3,00 | 0,00 |
| Bundesliga | 18 | 28,7 | 28,6 | 2 | 0 | 0,11 | 0,00 |
| Ligue 1 (com isenção) | 18 | 28,6 | 27,6 | 7 | 0 | 1,00 | 0,33 |
| Ligue 1 (estrita) | 18 | 28,6 | 22,4 | 18 | 1 | 6,17 | 2,06 |
| Brasil (lista) | 60 | 29,4 | 29,3 | 0 | 0 | — | 0,00 |
| Padrão Europa | 622 | 28,3 | 27,5 | 67 | 0 | 0,55 | 0,00 |
| Padrão América do Sul | 187 | 29,5 | 29,0 | 0 | 0 | 0,48 | 0,07 |
| Padrão Ásia | 98 | 28,9 | 27,6 | 0 | 0 | 1,33 | 0,02 |
| Padrão África | 108 | 28,7 | 28,6 | 0 | 0 | 0,08 | 0,00 |
| Padrão Oceania | 22 | 28,3 | 26,9 | 0 | 2 | 1,41 | 0,50 |
| MLS (10, EUA + Canadá) | 30 | 29,3 | 24,1 | 0 | 0 | 5,23 | 0,73 |
| Arábia Saudita | 32 | 27,5 | 27,1 | 0 | 0 | 0,34 | 0,06 |
| México | 18 | 29,2 | 28,6 | 0 | 0 | 0,56 | 0,00 |
| UEFA (todo o mundo, como se jogasse) | 1273 | 28,7 | 27,6 | 119 | 0 | 0,54 | 0,00 |

- **Quem não cumpre:** a falta de formados reduz a lista em ~10% dos clubes europeus (Premier 10 de 20, Serie A 12,
  Portugal/Turquia mais); nenhum fica abaixo de 18 nas grandes. O que acontece: **inscreve menos** (a vaga fica
  vazia), e os excluídos são reservas estrangeiros. O piso de 18 age em 2 clubes da Oceania.
- **Medição final obrigatória** (`scripts/registration-measure.ts`, Tarefa 11): a mesma tabela com o código real, a
  contagem de exceções, quantos dos 11 melhores ficam fora e, depois de uma temporada de mercado
  (`market-sim.ts 1` com as janelas), quantos jogadores comprados pela IA ficaram **sem inscrição** na janela
  seguinte. Os números finais substituem os do protótipo nesta seção e na regra.
- **Mercado:** a IA **não** passa a preferir formados nem a evitar estrangeiros acima do limite (mudaria
  `generateTransferNeeds`/`findCandidates` e a calibração do mercado — fora do escopo). Se a medição mostrar mais de
  5% das compras da IA terminando sem inscrição, abrir um issue para a próxima etapa.

## 9. `/test`, `/lab`, `Statistics.ts`

Sem efeito de partida: a inscrição decide quem pode ser escalado, antes do motor; nenhuma mecânica de partida,
evento ou estatística nova. O `/test` e o `/lab` usam elencos sintéticos sem competição. `Statistics.ts` não muda.

## 10. Smoke (`scripts/season-rollover-smoke.ts`, seção "Inscrição")

1. Toda escalação de jogo oficial (liga, copa, continental) do país do jogador só com inscritos: foto das listas antes
   do dia, conferida contra os jogadores com estatística no log do dia (como a checagem de lesionados); nas partidas
   compactas (quickSim) por um contador do log (`StoredDayLog.registrationViolations`, sempre 0).
2. No fim da corrida e em cada virada: todo clube do mundo com lista válida pela regra (`validateList` sem violação)
   ou `exception`; contagem informativa de exceções e de listas reduzidas.
3. Mudança fora do prazo recusada: `PUT` num dia de janela fechada → 409 `registrationClosed`; dentro do prazo, uma
   troca manual é aceita e o jogador tirado não volta sozinho.
4. Clube do jogador: lista automática válida em toda competição na criação e depois da virada; um contratado fora da
   janela não joga até a janela abrir (e entra sozinho quando abre, se couber).
5. Uma escalação salva com um não inscrito vira troca `unregistered` na rota `match-setup`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/registrationTypes.ts` | `RegistrationRule`, `ForeignKind`, `RegistrationList`, `RegistrationView`, `RegistrationStatus` |
| `src/Domain/registration/registrationConfig.ts` | `REGISTRATION_RULES`, `RULE_BY_COUNTRY`, `RULE_BY_CONTINENT`, `MIN_REGISTERED`, `LINE_MINIMUMS` |
| `src/Domain/registration/nations.ts` (+ teste) | `NATION_ALIAS`, `NATION_CONFED`, `EU`, grupos `ibero`/`acp`, `normalizeNation` |
| `src/Domain/registration/formed.ts` (+ teste) | `clubTrained`, `nationTrained`, `isFormed`, `isForeign`, `isFree` |
| `src/Domain/registration/rules.ts` (+ teste) | `ruleFor`, `autoRegister`, `validateList`, `canAdd`, `countsOf`, `registeredSet`, `matchdayPool` |
| `src/Domain/registration/deadlines.ts` (+ teste) | `registrationStatus` (janela + fases da continental) |
| `src/Domain/lineupHelpers.ts`, `src/Domain/advanceDay/matchSimulationLineups.ts`, `matches.ts` | Filtro de inscritos, motivo `unregistered`/`foreignLimit` |
| `src/backend/registrationWorld.ts` | E/S: competições do clube, temporada de cada uma, `ensureLists`, `humanRegistrationDay`, `refreshAiRegistrations`, `registrationFor(match)` |
| `src/backend/registrationRoutes.ts` | Rotas |
| `src/backend/advanceDay.ts`, `routes.ts` (`match-setup`), `transfers.ts`, `contractRoutes.ts`, `negotiationRoutes.ts`, `youthRoutes.ts`, `jobWorld.ts` | Integração |
| `src/Domain/inbox/*`, `src/types/inboxTypes.ts` | Categoria `registration` |
| `src/GameInterface/Squad/RegistrationView.tsx`, `SquadScreen.tsx`, `FormationScreen.tsx`, `MatchPreviewScreen.tsx`, `MatchScreen.tsx`, `InboxScreen.tsx` | Telas |
| `scripts/registration-measure.ts` | Medição |
| `.claude/rules/game/registration.md` | Regra nova |

## Pontos abertos (decididos pelo usuário em 2026-10-09)

1. **Libertadores / Sul-Americana:** segue a regra real da CONMEBOL — lista de até 50, **sem** mínimo de formados nem
   limite de estrangeiros (`conmebol`: `maxList 50`). Só o prazo vale.
2. **Isenções `ibero`/`acp` na La Liga e na Ligue 1:** mantidas (latino-americanos e países do acordo de Cotonou contam
   como comunitários, §1.1).
3. **Brasileirão:** limite de estrangeiros por jogo (XI + banco, `maxForeignMatchday 9`); a lista é o elenco inteiro e
   só serve para congelar fora da janela.
4. **Bundesliga:** sem a exigência de 12 alemães (`maxList 30`, `minFormed 8`).
