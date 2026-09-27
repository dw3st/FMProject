# Stamina e cansaço — Design

Data: 2026-09-27. Status: aprovado pelo usuário. Etapa 4 do `docs/ROADMAP.md` (2.1 Stamina + issue
#4 tela da partida quebra no servidor de dev).

## Situação atual (levantada antes do design)

O básico já existe — o texto do ROADMAP ("o atributo é ignorado") está desatualizado:

- **Na partida:** `energy` (0–100) cai por ação (`STAMINA_COST` em `RuntimeLineup.ts`: andar,
  passar, conduzir, pressionar, desarmar, defesa do goleiro); `stamina` (0–10) reduz o custo até
  50% e acelera a recuperação no intervalo. A energia reduz os atributos por grupo (físico até −55%,
  defesa até −35%, técnica até −20%) — mas só em degraus de 10 pontos (`gameState.ts` ~1773).
  A IA substitui cansados no 2º tempo (`AiSubstitution.ts`).
- **Entre jogos:** `seasonLog.fitness` (0–100) vira a energia inicial do próximo jogo. Depois do
  jogo `fitness = fim + 0,5 × (início − fim)`. Treino (`dailyTraining.ts`) derruba quem está ≥ 85;
  quem não treina recupera ~4–8/dia; a folga recupera +7–13. Resultado: todo mundo oscila em
  80–90 a temporada toda — calendário apertado quase não pesa.
- **quickSim:** desgaste fixo `35 × (1,2 − 0,4 × stamina/10)` e penalidade de força do XI cansado;
  nunca comparado com o motor.
- **Escalação:** a IA e o botão "auto" ignoram o fôlego (`autoFillLineupWithEnergy` existe e ninguém
  chama).
- **#4:** `bun run dev` quebra ao carregar `pixi.js` (`Cannot read properties of undefined (reading
  'add')`) — erro de avaliação de módulo no bundler de dev (HMR), antes de qualquer `useEffect`.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Foco | Calendário apertado pesa: recuperação realista, carga acumulada, IA escala pelo fôlego, motor × quickSim calibrados, fadiga no `/lab` e `/test` |
| Modelo | **Fôlego** (0–100, o `seasonLog.fitness`) + **carga** (novo `seasonLog.load`, minutos recentes com decaimento) |
| Rotação ampla / assistente | Fica para a Etapa 6 (2.3); aqui só o seletor de XI com fôlego |

## 1. Modelo de cansaço

Funções puras em `src/Domain/fitness/` (config em `fitnessConfig.ts`), usadas pelo motor, pelo
quickSim e pelo avanço do dia.

### Fôlego depois do jogo

- `fôlego = energia no fim do jogo` (ou na saída, se substituído). Some a devolução automática de
  metade do gasto.
- Quem não entrou em campo não muda.

### Recuperação diária

- `fôlego += (100 − fôlego) × taxa`, com `taxa = BASE (≈0,35) × fatorIdade × fatorCarga × fatorStamina`:
  - `fatorIdade`: ≤24 1,1 · ≤28 1,0 · ≤32 0,85 · >32 0,7;
  - `fatorCarga = 1 − 0,5 × min(1, carga / CARGA_ALTA)`;
  - `fatorStamina = 0,9 + 0,2 × stamina/10`.
- Exemplo (26 anos, carga 0, stamina 7), um valor por dia de folga: 55 → 76,1 → 87,3 → 93,2 → 96,4
  (`RECOVERY_BASE = 0,45`; subiu de 0,35 na tarefa de balanceamento — o time apertado recuperava
  devagar demais entre jogos mesmo com carga moderada).
- Dia de jogo do time: quem joga não recupera nesse dia; os outros recuperam normalmente.
- **Treino:** o custo passa a escalar com o fôlego (`custo × fôlego/100`); abaixo do limite de treino
  (`minEnergyToTrain`) o jogador só recupera. A folga é um dia de recuperação cheia.

### Carga

- `carga` (minutos equivalentes): a cada dia `carga × e^(−ln2/MEIA_VIDA)` com `MEIA_VIDA ≈ 4 dias`;
  um jogo soma os minutos jogados (120 na prorrogação); treino pesado soma um pouco (≈10).
- `CARGA_ALTA ≈ 220` (≈ 3 jogos completos em ~7 dias).
- Efeitos: reduz a taxa de recuperação (acima) e aumenta o gasto em campo:
  `custo × (1 + 0,25 × min(1, carga / CARGA_ALTA))` — o motor recebe o fator por jogador no início da
  partida; o quickSim, no desgaste.

### Na partida

- A redução dos atributos pela energia passa a ser contínua (recalcula quando a energia muda mais
  que um passo pequeno, ex. 1 ponto), sem os degraus de 10.
- `stamina` continua reduzindo o custo e acelerando a recuperação do intervalo.

### Motor × quickSim

- O quickSim usa as mesmas funções pós-jogo (fôlego = energia final, carga += minutos).
- O desgaste do quickSim (por linha/posição, por minuto, com o fator de carga) é calibrado contra o
  motor: gasto médio a ±10% por linha, medido num script (`scripts/fatigue-calibrate.ts`) sobre
  centenas de jogos do motor.
- A penalidade de força do quickSim para XI cansado fica, reajustada se o script mostrar desvio no
  resultado (vitória do time descansado × cansado).

## 2. Escalação da IA

- Todos os caminhos de XI da IA (partida ao vivo, `matchSimulationLineups`, quickSim, adversário da
  prévia, continental) passam a usar um seletor com fôlego (substitui/aproveita
  `autoFillLineupWithEnergy`):
  - valor do jogador na vaga = nível na posição × fator de energia inicial (o mesmo fator do motor
    aplicado ao fôlego de hoje, com o gasto previsto pela carga);
  - poupa um titular com fôlego < 75 quando um reserva da mesma posição rende ≥ 85% dele pelo valor
    acima; titular muito superior joga mesmo cansado.
- O botão "auto" da tela de formação do jogador usa o mesmo seletor.

## 3. Telas, `/test`, `/lab`, estatísticas

- **Formação, prévia, elenco:** fôlego e carga (ícone de carga alta); a prévia avisa titular com
  fôlego < 70.
- **Resumo do dia:** fôlego recuperado.
- **`/test`:** painel com energia por jogador e gasto por minuto; cenário "time cansado" em
  `TestCases.ts`.
- **`/lab`:** opção "calendário apertado" (N jogos seguidos com K dias de descanso entre eles,
  aplicando as funções de fôlego/carga entre os jogos); mostra queda de rendimento (vitória, gols,
  xG por jogo da sequência), energia no fim do jogo e substituições.
- **`Statistics`:** energia média no fim do jogo por time e substituições por cansaço (`/lab` e o
  painel da partida).

## 4. Issue #4

1. Reproduzir: `bun run dev` a partir de `C:\Projects\FMProject` (casing real), com o Bun do projeto
   (1.3.10) e com o global (1.4.2).
2. Se for o bundler de dev: tentar `import("pixi.js")` sob demanda dentro do `PixiPitch` (fora da
   avaliação estática do módulo) ou atualizar o Bun do projeto.
3. Se nada resolver: documentar em `.claude/rules/dev-login.md` e mostrar uma mensagem clara na tela
   da partida em modo dev ("use `bun run start` para testar partidas"), em vez de quebrar.

## 5. Critério de pronto e verificação

- **Teste de integração:** 3 jogos em 7 dias para um clube → o fôlego inicial cai jogo a jogo, a carga
  sobe, e a IA poupa pelo menos um titular no 3º jogo.
- **Smoke de temporada:** fôlego médio dos titulares num dia de jogo fica numa faixa plausível
  (não travado em 80–90, não zerado) e a IA usa reservas.
- **Calibração:** o script imprime gasto motor × quickSim por linha antes/depois.
- **Docs:** `.claude/rules/game/fitness.md` (novo), corrigir
  `.claude/rules/game-engine/player-stats-usage.md` (stamina é usada), ROADMAP.
- Start kits regenerados (o fôlego dos jogadores no kit muda com as regras novas).
