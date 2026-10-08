# Responsabilidades e caixa de entrada mais limpa

Spec: `docs/superpowers/specs/2026-10-07-responsibilities-inbox-design.md`. Etapa 30 do `docs/ROADMAP.md` (#105),
versão **4.6**. Visual: `.claude/rules/ui-standard.md`.

## 1. O diretor cuida dos contratos

- `SaveMeta.responsibilities?: { contracts: "director" | "manager" }`; ausente = **diretor**. Só o clube do jogador.
- **Toda segunda** (`advanceDay` → `applyDirectorDay`, `src/backend/directorWorld.ts`, antes da moral), com o diretor
  responsável, `directorDecisions` (`src/Domain/responsibilities/director.ts`, puro) decide **uma vez por jogador e
  temporada** (`SaveMeta.directorDecisions[playerId] = { season, renew }`, temporada = `year` da liga do clube; só as
  da temporada atual ficam gravadas; a troca de clube limpa):
  - entra quem tem contrato a até `DIRECTOR_DECIDE_DAYS` (120) dias do fim; **key/starter** já a 183 dias
    (`DIRECTOR_TALK_DAYS = MORALE.CONTRACT_TALK_DAYS`), quando podem pedir conversa de contrato. Emprestado de outro
    clube fica de fora; renovado pelo técnico já está fora da janela.
  - **Renova** quando a regra da IA renovaria (`aiShouldRenew`: nota, idade < 33, o salário cabe no teto
    `aiClubFinance(squad).maxWageBudget`). Salário = o maior entre a curva (`renewalContract`) e o pedido do jogador
    (`contractDemand` com `renewal`), e é esse valor que passa pelo teto. Anos = os da IA por idade, reduzidos até
    caber em `renewalWithinLimits`. Melhores primeiro, a folha atualizada a cada renovação.
  - O jogador avalia como uma renovação do técnico: revoltado sem promessa (`refusesRenewal`) ou oferta recusada →
    `refused`. Senão aplica na hora como a rota `renew` (`until` + anos, salário novo, +6 de moral via `afterRenewal`).
  - Não renova → `leaving` (sai livre na virada, como hoje).
- **Resumo:** mensagem `contract` / `director_summary` (`renewed` com anos e salário, `leaving`, `refused`) na segunda
  em que houve decisão, adiada para depois do `clearInbox` (`buildDirectorSummaryMessage`).
- **Conversas de contrato:** com o diretor, `moraleDay(..., directorContractTalk)` responde na hora em vez de abrir o
  pedido: `true` (decidiu renovar) = +3 como uma promessa; `false` = −10 como uma recusa; sem pedido, sem mensagem,
  com o silêncio de 28 dias. Os outros motivos continuam com o técnico.
- **Aviso de 90 dias** (`expiring`, no avanço do dia e na troca de clube): só com o técnico responsável.
- **Técnico responsável:** tudo como antes; as decisões gravadas não valem. O técnico sempre pode renovar na ficha.

## 2. Preferências da caixa de entrada

- `SaveMeta.inboxPrefs?: Partial<Record<InboxTopic, boolean>>`; ausente = padrões.
- Tópicos (`src/Domain/inbox/inboxTopics.ts`: `CATEGORY_TOPIC` exaustivo sobre `InboxCategory`, `KIND_TOPIC` para os
  kinds que mudam de tópico):

| Tópico | Mensagens | Padrão |
|---|---|---|
| `actions` (travado) | `transfer` bid/loan_bid/rival_bid, `player`, `board`, `job`, `retirement:reborn`, `season:negative_balance` | ligado |
| `contracts` | `contract` (resumo do diretor, avisos, renovado, saídas livres) | ligado |
| `transfer_news` | o resto de `transfer` (empréstimo voltou, cláusula, janelas, pré-contrato, rival venceu), `transfer_in/out` | ligado |
| `injuries` / `development` / `youth` / `retirement` | categorias do mesmo nome | ligado |
| `competitions` | `season`, `cup`, `continental` | ligado |
| `club_records` / `facilities` | categorias do mesmo nome | ligado |
| `scouting_alerts` | `scouting` (joias, lista de observação, prospectos) | ligado |
| `scouting_reports` | `scouting` report, mission_done, recommendation | **desligado** |
| `manager_news` | técnicos demitidos/contratados | **desligado** |

- **Filtro num ponto só:** `SaveService.appendInbox` lê a meta pelo DAL a cada chamada e não grava a mensagem de um
  tópico desligado (não reaparece ao religar). `actions` nunca é descartado. Nada do jogo lê uma mensagem que pode ser
  descartada (ofertas, propostas e conversas são `actions`; o cartão Atenção lê joias e alertas, `scouting_alerts`).
- A tela grava só o que difere do padrão.

## Rotas (`src/backend/responsibilityRoutes.ts`, dono do save; PUT com `withSaveLock`)

| Rota | Faz |
|---|---|
| `GET/PUT /api/saves/:id/responsibilities` | `{ contracts: "director" \| "manager" }`; outro corpo → 400 |
| `GET/PUT /api/saves/:id/inbox-prefs` | `{ prefs, topics: [{ topic, enabled, locked }] }`; PUT `{ [tópico]: boolean }` substitui; tópico desconhecido, valor não booleano ou `actions: false` → 400 |

## Telas

- **Equipe técnica → aba Responsabilidades** (`?tab=responsibilities`, `Staff/ResponsibilitiesPanel.tsx`): "Contratos"
  com `OptionChips` Diretor / Técnico e uma linha para cada.
- **Caixa de entrada → Preferências** (`Inbox/InboxPrefsPanel.tsx`): um `Chip` Ligado/Desligado por tópico, com rótulo
  e descrição; `actions` desabilitado com "Pede ação: sempre ligado".
- Corpo do `director_summary`: renovados (link para a ficha, anos, salário), sairão, recusaram.
- i18n `responsibilities.*`, `inbox.prefs.*`, `inbox.contract.director*`, `staff.tab*` (en, pt-BR).

## `/test`, `/lab`

Sem efeito de partida: nada a exibir.

## Testes e smoke

```
bun test src/Domain/inbox src/Domain/responsibilities src/Domain/morale src/backend/responsibilities.routes.test.ts
```

`responsibilities.routes.test.ts`: preferências (dono, padrões, validação, filtro no `appendInbox`); no avanço do dia
com o diretor (renova, deixa sair, responde a conversa, um resumo, sem aviso) e com o técnico (nada renovado, aviso e
conversa de volta). `scripts/season-rollover-smoke.ts`, seção "Responsabilidades": ao menos um resumo e uma renovação
do diretor, nenhum aviso de 90 dias, nenhuma conversa de contrato, nenhuma mensagem `manager_news`; na seção "Olheiros",
sem ligar nada nenhum `report` chega, depois o smoke liga `scouting_reports` pela rota.
