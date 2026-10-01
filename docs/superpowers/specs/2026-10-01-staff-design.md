# Etapa 10 — Equipe técnica (3.4) — Design

Data: 2026-10-01. Status: aprovado (autorização do usuário para decidir por padrões). Versão **2.2**.
Visual: `.claude/rules/ui-standard.md`. A issue #13 (nomes turcos) sai na frente de dados, separada.

## 1. Modelo

`src/Domain/staff/` (puro). Três funções no clube, um profissional por função:

| Função | Efeito | Faixa (nota 1 → 10) |
|---|---|---|
| **Auxiliar técnico** (`assistant`) | Multiplica os pontos de desenvolvimento (DP) dos jogadores | ×0,90 → ×1,15 |
| **Preparador físico** (`fitness`) | Multiplica a recuperação diária de fôlego e divide o risco de lesão | recuperação ×0,95 → ×1,10; lesão ×1,10 → ×0,85 |
| **Olheiro-chefe** (`scout`) | Precisão do que o jogador vê de atletas fora do próprio elenco | incerteza ±1,5 → ±0 pontos de atributo |

- Nota 5 = neutro (×1,0 / ±0,6). Efeitos lineares entre os extremos; constantes em `staffConfig.ts`.
- `StaffMember { id, name, nationality, role, rating (1..10), age, wage }`. Nome/nacionalidade
  gerados deterministicamente (hash do id) a partir de listas de nomes já usadas no mundo.
- `Squad.staff?: Partial<Record<StaffRole, StaffMember>>` — só o clube do jogador grava staff.
  **Clubes da IA não simulam staff:** usam a nota implícita do tier (LOW 4, MEDIUM 5, HIGH 6,
  ELITE 7), sem gravar nada (`.claude/rules/AI-clubs/finance.md`: regras, não simulação).

## 2. Contratação

- Ao criar a carreira, o clube do jogador recebe 3 profissionais de nota próxima ao nível do clube
  (tier implícito ±1).
- **Mercado de staff:** `GET /api/saves/:id/staff/market` — 5 candidatos por função, gerados
  deterministicamente por save + semana (renova toda segunda-feira). Contratar substitui o atual
  (`POST /staff/hire`), demitir deixa a função vaga (efeito de nota 3 enquanto vazia).
- Salário semanal = curva por nota × fator do clube (`wageFactorOf`), lançado no extrato como novo
  `kind: "staff"` toda segunda-feira (junto dos salários). Sem multa nem duração de contrato (YAGNI).

## 3. Onde os efeitos entram

- Desenvolvimento: onde os DP pós-jogo são calculados, × multiplicador do auxiliar (clube do jogador;
  IA pelo tier).
- Fôlego: `recoverDay` recebe o multiplicador; lesões: `injuryRatePerMinute`/`contactInjuryChance` ×
  multiplicador (motor e quickSim), para todos os clubes (IA pelo tier).
- Olheiros: `scout-search` e a ficha de jogador de outro clube mostram atributos com ruído
  determinístico (hash save+jogador) de amplitude pela nota do olheiro; overall exibido como faixa
  quando a incerteza ≥ 0,5. O próprio elenco é sempre exato. O motor nunca usa o valor com ruído.

## 4. Telas

- `/staff` (sai do "em breve"): título "EQUIPE TÉCNICA"; três cartões (função, nome, nota em barra,
  salário, efeito em uma linha, botão Demitir); seção "Mercado" com abas por função e lista de
  candidatos (nota, idade, salário, Contratar).
- Extrato e Finanças: tipo "Equipe técnica".
- i18n en/pt-BR.

## 5. `/test`, `/lab`, `Statistics`

- `/lab`: `Variant.staffRating?: number` aplica o multiplicador de lesão/fôlego na sequência de
  congestão; `PairDetail` já mostra lesões e fôlego.
- `/test`: painel de energia mostra o multiplicador de recuperação do time.

## Verificação

Testes do modelo (efeitos nas pontas e no neutro), da geração determinística, das rotas (dono do
save, função válida, salário no extrato), do ruído do olheiro (próprio elenco exato). Smoke: o extrato
tem lançamentos `staff` toda segunda; lesões por partida seguem na faixa. Changelog 2.2; docs
`.claude/rules/game/staff.md`; ROADMAP.
