# Lesões + dados (#3, #14) — Design

Data: 2026-09-28. Status: aprovado. Etapa 5 do `docs/ROADMAP.md` (2.2 Lesões + #3 ruído dos `of_*`
+ #14 jovem do SP como melhor do elenco). Sai como versão **1.5** no changelog.

## 1. Lesões

### Na partida (motor)

- Risco por minuto por jogador: `BASE × fatorEnergia × fatorCarga × fatorIdade × fatorForça`.
  - `fatorEnergia`: 1 com energia alta, até 2× com energia baixa (curva contínua).
  - `fatorCarga`: até 1,5× com carga ≥ `LOAD_HIGH`.
  - `fatorIdade`: 1 até 30 anos, até 1,3× acima.
  - `fatorForça`: `strength` alta reduz um pouco (até −20%).
- Desarmes e disputas de bola (duelos de bola solta) somam um risco extra aos dois envolvidos.
- Meta de volume: ~0,3 lesão por jogo (os dois times somados). `BASE` calibrado para isso.
- Ao lesionar: substituição forçada pelo melhor reserva da posição; sem trocas restantes, o time fica
  com 10. No jogo ao vivo do jogador a troca é automática, com aviso na tela.
- Evento no barramento (`injury`) com jogador, minuto e gravidade.

### quickSim

- Mesmo risco por minuto (Poisson sobre os minutos jogados, com energia e carga do quickSim).
- Volume calibrado contra o motor (±15%), num script de calibração.

### Treino

- Treino pesado: chance pequena de lesão leve por jogador por dia.

### Gravidade e volta

| Tipo | Chance | Tempo fora |
|---|---|---|
| Leve | 60% | 3–7 dias |
| Média | 30% | 1–4 semanas |
| Grave | 10% | 1–4 meses |

- Dado: `player.injury?: { severity: "light" | "medium" | "severe"; returnDate: string }`.
- O avanço do dia remove a lesão na `returnDate`; o jogador volta com fôlego ~70.

### Escalação

- Lesionado nunca entra: seletores da IA, botão "auto", `resolveUserLineup`, montagem da partida.
- Escalação salva do jogador com lesionado: o lesionado é trocado automaticamente e a prévia avisa.

### Telas

- Elenco: status "lesionado" (o indicador já existe em `playerHelpers.status`) + dias para voltar.
- Formação: lesionado bloqueado.
- Inbox (clube do jogador): na lesão (gravidade, previsão de volta) e na volta.
- Partida: evento de lesão no placar/log.

### Estatísticas, `/test`, `/lab`

- `Statistics`: lesões por time (motor e `simulateMatch`).
- `/test`: evento no log de debug + cenário que força lesão.
- `/lab`: lesões por jogo na comparação.

## 2. Dados (#3, #14) — mundo regenerado

- **#3:** `derivePlayer` (`scripts/openfootball/derive.ts`) troca o ruído independente por atributo
  por um fator de sorte único por jogador + um jitter pequeno por atributo, e aplica um teto suave:
  overall acima de `previsto + 2 × sd` (previsor de `recalibrate.ts`) é encolhido. Meta: nenhum
  jogador de `seedOverall` mediano no top 50 do mundo.
- **#14:** no envelhecimento do `importEspn` (`scripts/espn/aging.ts`), o crescimento dos jovens é
  reduzido para quem já está acima da mediana do próprio clube na linha. Relatório: jovens (≤ 21) que
  são o melhor do elenco, antes e depois.
- Regenerar a cadeia (`importOpenFootball` → `importEspn` → kits). Saves existentes não mudam.

## 3. Verificação

- Testes unitários: risco, gravidade, volta, seletores sem lesionado.
- Teste de integração: lesão no motor tira o jogador e ele fica fora até a data de volta.
- Smoke de temporada: volume de lesões por jogo na faixa, ninguém lesionado escalado, voltas acontecem.
- Changelog 1.5; docs `.claude/rules/game/injuries.md`; ROADMAP.
