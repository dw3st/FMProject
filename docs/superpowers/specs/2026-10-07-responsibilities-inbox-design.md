# Responsabilidades (diretor cuida dos contratos) e caixa de entrada mais limpa

Etapa 30 do `docs/ROADMAP.md`, issue #105 (report de tester). Aprovado em 2026-10-07.

## Decisões

| Tema | Decisão |
|---|---|
| O que o diretor faz | Renovações dos contratos que vencem e as conversas de contrato pedidas pelos jogadores. Compras, vendas, empréstimos e propostas continuam com o técnico |
| Padrão | Diretor responsável; o técnico assume quando quiser |
| Onde se escolhe | Aba **Responsabilidades** na tela Equipe técnica (`StaffScreen`) |
| Diretor contratável? | Não: é só um papel nesta etapa (a comissão completa, etapa 31, pode dar nome e nota a ele) |
| Notícias | Interruptor por tipo, no botão **Preferências** da caixa de entrada; tipos que pedem ação não podem ser desligados |
| Notícia desligada | Não é gravada (não reaparece ao religar) |
| Saves antigos | Padrões, sem migração |

## 1. Diretor cuida dos contratos

### Dado

`SaveMeta.responsibilities?: { contracts: "director" | "manager" }`. Ausente = `"director"`.

### Regra (só o clube do jogador, `contracts === "director"`)

- **Decisão:** cada segunda-feira, para todo jogador do elenco (não emprestado de outro clube) cujo
  `contract.until` está a até `DIRECTOR_DECIDE_DAYS = 120` dias e que ainda não tem decisão nesta
  temporada, o diretor decide uma vez e grava em `SaveMeta.directorDecisions[playerId] = { season, renew }`.
  - **Renova** quando `aiShouldRenew(player, squad, newWage, wageBill, cap)` é verdadeiro, com
    `newWage = renewalContract(...)` e `cap` = o teto de folha que a IA usaria para o clube do jogador
    (`maxWageBudget` de `aiClubFinance` sobre o próprio elenco). Anos: a mesma regra de idade da IA (1–3).
    O jogador avalia como uma renovação do técnico (`evaluateContractOffer` com o pedido dele): se
    recusar (ex. revoltado, `refuses`), a decisão vira "não renova" e entra no resumo como "recusou".
  - **Não renova:** fica para sair livre no fim do contrato, como hoje.
- **Execução:** a renovação acontece na hora da decisão (mesmo caminho da rota de renovação:
  `until` movido, salário novo, moral +6 de renovação aceita).
- **Conversas de contrato** (`TalkReason "contract"`, `.claude/rules/game/morale.md`): com o diretor
  responsável, o pedido não vai à inbox. É respondido na hora pelo diretor: se ele renova (ou já
  renovou), resposta `promise_renewal`; senão, `refuse`. Os outros motivos (minutos, querer sair,
  chance) continuam com o técnico.
- **Aviso de 90 dias** (`contract`, `kind: "expiring"`): não sai com o diretor responsável.
- **O técnico continua podendo renovar** qualquer jogador na ficha. Um jogador renovado pelo técnico
  não é tocado pelo diretor nesta temporada.
- **Resumo:** nova mensagem `contract`, `kind: "director_summary"`, na segunda-feira em que houve
  alguma decisão: renovados (nome, anos, salário), sairão no fim do contrato, recusaram.

### Técnico responsável

Tudo como hoje: aviso de 90 dias, conversas de contrato na inbox, renovação manual. As decisões
gravadas do diretor deixam de valer (o diretor não age).

## 2. Caixa de entrada mais limpa

### Dado

`SaveMeta.inboxPrefs?: Partial<Record<InboxTopic, boolean>>`. Ausente = padrões.

### Tópicos (`src/Domain/inbox/inboxTopics.ts`)

`inboxTopicOf(message)` dá o tópico de cada mensagem (pela categoria e, quando preciso, pelo `kind`).
Cada tópico tem um padrão e um flag `locked`:

| Tópico | Mensagens | Padrão | Pode desligar |
|---|---|---|---|
| `manager_news` | técnicos demitidos e contratados | desligado | sim |
| `scouting_reports` | relatórios, missão encerrada, indicação mensal, joias | desligado | sim |
| `scouting_alerts` | alertas da lista de observação, prospectos | ligado | sim |
| `development` | evolução de atributos | ligado | sim |
| `injuries` | lesões, volta, suspensões | ligado | sim |
| `youth` | safra, dispensas | ligado | sim |
| `retirement` | aposentadorias (o renascido é ação: travado pela oferta) | ligado | sim |
| `competitions` | copa, continental, fim de temporada, prêmios | ligado | sim |
| `club_records` | recordes do clube | ligado | sim |
| `facilities` | obras, recorde de público | ligado | sim |
| `contracts` | resumo do diretor, avisos, saídas livres | ligado | sim |
| `transfer_news` | jogador vendido/comprado, empréstimo voltou, cláusula paga, janela | ligado | sim |
| `actions` | propostas de transferência e empréstimo, conversas dos jogadores, diretoria, propostas de emprego, contrato do técnico, oferta de renascido, saldo negativo | ligado | **não** |

A tabela exata (categoria + `kind` → tópico) fica no módulo, exaustiva sobre `InboxCategory` (como
`inboxThemes.ts`): uma categoria nova não compila sem tópico.

### Filtro

- Ponto único: `SaveService.appendInbox` lê `meta.inboxPrefs` (uma vez por unidade de trabalho) e
  descarta a mensagem cujo tópico está desligado. Tópico `locked` nunca é descartado.
- Rotas: `GET/PUT /api/saves/:id/inbox-prefs` (dono do save, `withSaveLock`); o PUT rejeita tópico
  desconhecido e ignora tentativa de desligar um travado (400).
- `GET/PUT /api/saves/:id/responsibilities` para o item 1 (mesmas regras).

## 3. Telas

- **Equipe técnica → aba Responsabilidades:** "Contratos" com `OptionChips` Diretor / Técnico e uma
  linha explicando o que muda.
- **Caixa de entrada → botão Preferências:** painel com um interruptor (`Chip`) por tópico, rótulo e
  uma linha de descrição; os travados aparecem ligados e desabilitados com "pede ação".
- i18n `responsibilities.*`, `inbox.prefs.*` (en, pt-BR). Padrão visual de `ui-standard.md`.

## 4. Verificação

- Testes puros: decisão do diretor (renova, não renova, recusa do jogador, já renovado pelo técnico,
  emprestado fora), `inboxTopicOf` exaustivo, filtro com travados.
- Testes de rota: dono do save, validação, PUT e efeito no `appendInbox`.
- Smoke de temporada (`scripts/season-rollover-smoke.ts`), seção nova "Responsabilidades": com o diretor
  responsável (padrão), houve ao menos uma renovação e um resumo; nenhuma mensagem de tópico desligado
  por padrão (`manager_news`, `scouting_reports`) foi gravada; nenhuma conversa de contrato chegou à
  inbox.
- Sem efeito de partida: nada em `/test` nem `/lab`.
- Changelog e regras: `.claude/rules/game/contracts.md`, `morale.md`, `scouting.md` (tópicos), e uma
  regra nova curta `.claude/rules/game/responsibilities.md`.

## Fora do escopo

Diretor contratável com nota, delegar compras/vendas/empréstimos, filtros por liga nas notícias.
