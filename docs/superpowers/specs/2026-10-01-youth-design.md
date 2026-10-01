# Etapa 11 — Base (3.5) + #9 — Design

Data: 2026-10-01. Status: aprovado (autorização do usuário para decidir por padrões). Versão **2.3**.
Depende da equipe técnica (2.2) e do mundo regenerado (dados #13/#34). Visual: `ui-standard.md`.

## 1. Safra anual

- Na virada de temporada de cada país (`advanceDay`, depois de contratos/reposição), todo clube
  recebe uma **safra** de 3–5 jovens de 16–17 anos (quantidade e nível determinísticos por
  save+clube+ano).
- **Nível:** média da linha do próprio clube − 1,8 ± ruído (σ 0,5), com bônus pelo tier (LOW −0,3,
  MEDIUM 0, HIGH +0,2, ELITE +0,4) e, no clube do jogador, pela nota do auxiliar técnico (±0,3).
  Uma promessa rara (5%) nasce +1,0 acima. Atributos pelo perfil da posição (pesos de `roles.json`),
  posição detalhada sorteada respeitando o mínimo por linha do elenco.
- Reaproveita o gerador de jovens de `src/Domain/contracts/freeAgents.ts` (`makeYouthPlayer`),
  estendido para nível/posição/promessa; nomes da nacionalidade do clube.
- Contrato de base: 3 anos, salário da curva (baixo pela nota).

## 2. Clube do jogador: tela "Base"

- `Squad.youth?: RosterPlayer[]` (só o clube do jogador): a safra entra aqui, não no elenco
  principal. Jovens da base treinam e se desenvolvem (mesmo modelo de DP, minutos zero → crescimento
  só por idade/treino) mas não jogam.
- Aba **Base** na tela de elenco (ou `/youth`): lista com posição, idade, nível atual, "potencial"
  exibido como faixa (nível + crescimento esperado pela idade — sem atributo escondido novo),
  botões **Promover** (vai para o elenco, respeitando 30) e **Dispensar** (vai para os livres).
- Inbox `youth`: "Chegou a safra 2027: 4 jovens" com o destaque.
- Aos 19 anos sem promoção, o jovem é dispensado automaticamente na virada (aviso na inbox).

## 3. Clubes da IA

Sem lista de base: na virada, promovem direto ao elenco os 1–2 melhores da safra (se o elenco
couber, ≤ 30) e descartam o resto (não viram livres, para não inflar o pool).

## 4. #9 — notas ≥ 8,5 no quickSim

`gh issue view 9`: atacantes do quickSim recebem nota ≥ 8,5 demais (o titular carrega gols e
assistências da vaga inteira). Ajustar a nota do quickSim para a cauda bater com o motor (≤ 1,2× a
taxa de ≥ 8,5 do motor por linha), sem mexer na média por linha (±0,03), via
`bun scripts/quicksim-spread.ts` (coleta + `events`) e constantes em `QuickSimConfig.ts`.

## 5. `/test`, `/lab`, smoke

- Smoke: na virada, todo clube do país recebeu safra; o jogador tem `youth` com 3–5; nenhum jovem
  da IA acima de 30 no elenco; ids únicos.
- `/lab`: sem efeito de partida (não precisa); `/test`: nada.

## Verificação

Testes do gerador (determinismo, faixa de nível, promessa), das rotas (promover/dispensar, limite),
da virada; números do #9 antes/depois; smoke. Changelog 2.3; `.claude/rules/game/youth.md`; ROADMAP.
