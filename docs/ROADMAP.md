# FMProject — Roadmap

Referência única do que está feito, do que vem a seguir e em que ordem. Atualizado a cada entrega
(merge em `main`). Última atualização: 2026-09-25 (deploy `4e024cf`).

---

## Como trabalhamos

1. **Spec** em `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md`: decisões fechadas com o usuário.
2. **Plano** em `docs/superpowers/plans/` quando o trabalho tiver várias tarefas.
3. **Branch** própria (`feat/...` / `fix/...`), implementação por subagentes (Sonnet) e revisão de
   cada tarefa (Opus). Revisão final da branch antes do merge.
4. **Verificação** antes do merge: `bunx tsc --noEmit -p .`, `bun test`, smokes
   (`membership-smoke`, `season-rollover-smoke` quando mexer em mundo/temporada), teste no Chrome
   (servidor local em modo produção para partidas, ver "Pendências técnicas").
5. **Merge → push → deploy** na VMLOCAL (`fm.westlab.dev`). Fechar os issues resolvidos (`fixes #N`) e
   atualizar este arquivo.

Mudou o mundo (importadores, elencos, calendário)? Regenerar a cadeia inteira — ver
`.claude/rules/data/espn-import.md`.

---

## Onde estamos (em produção)

- **Mundo aberto 2026/27:** 83 ligas, 1.273 clubes, ~36,4 mil jogadores. Elencos, composição e
  escudos da ESPN nas 34 ligas cobertas; o resto vem do open-football. Pirâmides com acesso e
  rebaixamento por país. Carreira europeia começa em 15/08/2026; ano civil em 05/02/2027.
- **Craques recalibrados:** nível dos nativos vem do seed (Mbappé 3º, Haaland 5º, Vini 10º).
- **Partida:** motor tick a tick com táticas por estilo, mentalidade ao vivo, 1×/2×/4×, roda com a
  aba em segundo plano. Ligas não seguidas usam o quickSim.
- **Clube:** finanças do jogador (orçamento, receitas, estádio), IA com finanças por tier,
  mercado de transferências (IA e jogador), desenvolvimento de jogadores, inbox, fim de temporada.
- **Plataforma:** login por e-mail (Resend), reports de testers (botão Report), login automático
  só em desenvolvimento, deploy por Docker + túnel Cloudflare.

---

## Ordem das frentes

As quatro frentes são prioridade. A ordem segue a dependência entre elas: copas criam sequência de
jogos → cansaço e lesões passam a importar → gestão de elenco (contratos, rotação, staff) ganha
sentido → realismo fino da partida. O polimento roda em paralelo, toda semana.

### Fase 1 — Competições

**Objetivo:** as zonas de classificação da tabela passam a levar a algum lugar.

1. **Copas nacionais** (mata-mata): Copa do Brasil, FA Cup, Copa del Rey, DFB-Pokal, Coppa
   Italia, Coupe de France; depois as copas dos demais países com dados.
   - Sorteio por fase, jogo único ou ida e volta, prorrogação e pênaltis.
   - Encaixe no calendário (`generateLeagueCalendar`, dias de meio de semana) sem colidir com a liga.
   - Tela de chaveamento; inbox e resumo do dia.
2. **Continentais:** Champions League, Europa League, Libertadores, Sul-Americana.
   - Classificação pelas zonas (`ucl`, `uel`, `lib`…) da temporada anterior.
   - Fase de liga/grupos + mata-mata; clubes de ligas não seguidas pelo quickSim.
3. **Premiação e finanças:** prêmios por fase, reflexo nas finanças do jogador e no tier da IA.

**Pronto quando:** uma temporada completa roda com liga + copa + continental, o smoke de temporada
cobre as três, e `/lab`/`/test` mostram os resultados de copa.

### Fase 2 — Cansaço e lesões

1. **Stamina** passa a ser usada pelo motor (hoje o atributo existe e é ignorado): desgaste durante
   a partida, recuperação entre jogos, efeito no desempenho.
2. **Lesões:** chance por partida (carga, idade, contato), tempo fora, lista de lesionados.
3. **Rotação:** a IA e o assistente passam a poupar titulares cansados.

**Pronto quando:** uma sequência de jogos em poucos dias mostra queda de rendimento e o time
reserva entra em campo; quickSim e motor concordam no volume de lesões.

### Fase 3 — Profundidade de gestão

1. **Contratos e salários:** duração, salário negociado, renovação, fim de contrato (jogador livre).
   Corrige a escala dos salários do clube (hoje EUR 3M/ano contra EUR 429M de receita no City).
2. **Tela Stats:** artilharia, assistências, notas, estatísticas do time (os dados já existem).
3. **Tela Tactics:** instruções além do estilo (hoje só formação + estilo + mentalidade ao vivo).
4. **Staff:** treinadores, preparador físico, olheiros, com efeito em desenvolvimento, lesões e
   observação.
5. **Base:** jovens gerados por temporada, promoção ao elenco principal.

**Pronto quando:** cada tela "em breve" (Staff, Stats, Tactics) está funcionando e contratos
mudam decisões de mercado.

### Fase 4 — Realismo da partida

1. **Faltas e cartões** (a chance de falta no desarme por trás já está prevista em `tackle.md`),
   suspensões.
2. **Jogo aéreo:** cruzamentos, cabeceio (atributo `heading` hoje ignorado), escanteios que viram
   finalização.
3. **Bolas paradas mais ricas:** falta direta, cobrador por atributo.

**Pronto quando:** partidas mostram faltas, cartões e gols de cabeça em volumes próximos do real,
com `/test` e `/lab` exibindo as novas estatísticas.

### Contínuo — Polimento e balanceamento

- **Reports dos testers:** triagem semanal com `bun scripts/fetchReports.ts`.
- **Issues abertos** (abaixo), atacados entre as fases.

---

## Bugs, correções e apontamentos

Ficam nos **GitHub Issues** do repositório (público — nunca colocar e-mail ou nome de tester):
https://github.com/dw3st/FMProject/issues

| Rótulo | Uso |
|---|---|
| `bug` | Algo quebrado |
| `balanceamento` | Motor ou quickSim fora do esperado |
| `dados` | Mundo, importadores, elencos |
| `infra` | Servidor, deploy, ferramentas |
| `verificacao` | Verificação que ficou pendente |
| `tester-report` | Veio de um report de tester (triagem) |

Commits e PRs fecham o issue com `fixes #N`. Na triagem semanal dos reports
(`bun scripts/fetchReports.ts`), cada report útil vira um issue com `tester-report` + o rótulo do tipo.

Abertos em 2026-09-25: #2 quickSim × motor em gols · #3 ruído dos `of_*` · #4 partida quebra no
servidor de desenvolvimento · #5 revisão final + smoke da recalibração · #6 Kane/Bellingham/Van Dijk ·
#7 Bundesliga × Serie A · #8 estilo posse · #9 notas ≥ 8,5 no quickSim · #10 compose exposto na rede
local · #11 ligas de ano civil com a composição de 2026 · #12 salários fora de escala · #13 nomes
turcos com maiúscula estranha.

---

## Referências

- Regras e decisões por área: `.claude/rules/**` (dados, IA, motor, UI, testers, dev-login).
- Specs e planos: `docs/superpowers/`.
- Deploy e servidor: memória `homelab-deploy`; reports: `.claude/rules/tester-reports.md`.
