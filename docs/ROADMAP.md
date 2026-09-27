# FMProject — Roadmap

Referência única do que está feito, do que vem a seguir e em que ordem. Atualizado a cada entrega
(merge em `main`). Última atualização: 2026-09-27 (Etapa 3: premiação e finanças).

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
- **Copas nacionais:** uma por país (60), mata-mata em jogo único com prorrogação e pênaltis,
  aba Copa na tela de ligas, inbox, virada com arquivo e copa nova. Ver `.claude/rules/game/cups.md`.
- **Competições continentais:** Champions League, Europa League, Libertadores e Copa
  Sul-Americana em todo save (32 clubes cada, vagas por coeficiente/zona), fase de grupos + mata-mata
  de ida e volta com agregado/prorrogação/pênaltis, aba Continental na tela de ligas, inbox,
  `seasonLog.continental`; quickSim recalibrado para o confronto entre ligas de nível muito
  diferente (issue #2). Ver `.claude/rules/game/continental.md`.
- **Partida:** motor tick a tick com táticas por estilo, mentalidade ao vivo, 1×/2×/4×, roda com a
  aba em segundo plano. Ligas não seguidas usam o quickSim.
- **Clube:** finanças do jogador por extrato real (salário em escala real, bilheteria em toda
  competição, premiação de liga/copa/continental, saldo pode ficar negativo), IA com orçamento
  de salário pela receita e prêmios entrando na verba de transferências, mercado de
  transferências (IA e jogador), desenvolvimento de jogadores, inbox, fim de temporada. Ver
  `.claude/rules/game/finances.md`.
- **Plataforma:** login por e-mail (Resend), reports de testers (botão Report), login automático
  só em desenvolvimento, deploy por Docker + túnel Cloudflare.

---

## Sequência de trabalho

Cada etapa entrega **um item do roadmap + a correção de um issue**, nessa ordem de importância.
Os issues vêm primeiro pelos que afetam o jogo de todo mundo (verificação de produção,
balanceamento, finanças); os itens do roadmap seguem a dependência entre as fases. Os pares foram
escolhidos por afinidade (o mesmo código ou os mesmos testes).

| Etapa | Roadmap | Issue | Por que junto / por que agora |
|---|---|---|---|
| 1 ✅ | 1.1 Copas nacionais | #5 revisão + smoke da recalibração | Fechar a verificação do que já está em produção antes de construir em cima; o smoke de temporada vai ganhar as copas |
| 2 ✅ | 1.2 Continentais | #2 quickSim × motor em gols | Continentais misturam clubes seguidos (motor) e não seguidos (quickSim): o quickSim precisa estar calibrado |
| 3 ✅ | 1.3 Premiação e finanças | #12 salários fora de escala | Mesma área (finanças do clube); prêmios sem salários coerentes distorcem o caixa |
| 4 | 2.1 Stamina / cansaço | #4 partida quebra no servidor de dev | Mexer no motor exige testar partidas localmente com HMR |
| 5 | 2.2 Lesões | #3 ruído dos `of_*` | Lesões e rotação dependem de elencos com níveis críveis |
| 6 | 2.3 Rotação (IA e assistente) | #10 compose exposto na rede local | Correção rápida de segurança; etapa de IA não mexe em infra |
| 7 | 3.1 Contratos e salários | #6 Kane/Bellingham/Van Dijk (curva de idade) + #23 ELITE 'tight' | Contratos usam idade e nível; revisar a curva de declínio junto. Contratos mudam a folha da IA — mesma hora de afinar a folga dos ELITE |
| 8 | 3.2 Tela Stats | #7 Bundesliga × Serie A + #24 rótulos do extrato | A tela Stats expõe os números por liga que o issue investiga; mesma passada de UI/i18n nos textos do extrato |
| 9 | 3.3 Tela Tactics | #8 estilo posse | Tactics mexe nas instruções; o estilo posse é um dos alvos |
| 10 | 3.4 Staff | #13 nomes turcos | Etapa grande + correção pequena de dados |
| 11 | 3.5 Base | #9 notas ≥ 8,5 no quickSim | Jovens gerados passam pelo quickSim; notas precisam estar calibradas |
| 12 | 4.1 Faltas e cartões | — | |
| 13 | 4.2 Jogo aéreo | — | |
| 14 | 4.3 Bolas paradas | — | |

**Com data:** #11 (ligas de ano civil com a composição de 2026) entra assim que a ESPN virar essas
ligas para 2027 (previsão: janeiro/fevereiro de 2027): `fetchEspn` + regenerar a cadeia.

**Reports dos testers:** triagem semanal, em paralelo às etapas. Um bug de tester que quebre o jogo
passa na frente da etapa em andamento.

---

## Ordem das frentes

As quatro frentes são prioridade. A ordem segue a dependência entre elas: copas criam sequência de
jogos → cansaço e lesões passam a importar → gestão de elenco (contratos, rotação, staff) ganha
sentido → realismo fino da partida. O polimento roda em paralelo, toda semana.

### Fase 1 — Competições

**Objetivo:** as zonas de classificação da tabela passam a levar a algum lugar.

1.1 **Copas nacionais** (mata-mata): Copa do Brasil, FA Cup, Copa del Rey, DFB-Pokal, Coppa
   Italia, Coupe de France; depois as copas dos demais países com dados.
   - Sorteio por fase, jogo único ou ida e volta, prorrogação e pênaltis.
   - Encaixe no calendário (`generateLeagueCalendar`, dias de meio de semana) sem colidir com a liga.
   - Tela de chaveamento; inbox e resumo do dia.
1.2 **Continentais:** Champions League, Europa League, Libertadores, Sul-Americana.
   - Classificação pelas zonas (`ucl`, `uel`, `lib`…) da temporada anterior.
   - Fase de liga/grupos + mata-mata; clubes de ligas não seguidas pelo quickSim.
1.3 **Premiação e finanças:** prêmios por fase, reflexo nas finanças do jogador e no tier da IA.

**Pronto quando:** uma temporada completa roda com liga + copa + continental, o smoke de temporada
cobre as três, e `/lab`/`/test` mostram os resultados de copa.

### Fase 2 — Cansaço e lesões

2.1 **Stamina** passa a ser usada pelo motor (hoje o atributo existe e é ignorado): desgaste durante
   a partida, recuperação entre jogos, efeito no desempenho.
2.2 **Lesões:** chance por partida (carga, idade, contato), tempo fora, lista de lesionados.
2.3 **Rotação:** a IA e o assistente passam a poupar titulares cansados.

**Pronto quando:** uma sequência de jogos em poucos dias mostra queda de rendimento e o time
reserva entra em campo; quickSim e motor concordam no volume de lesões.

### Fase 3 — Profundidade de gestão

3.1 **Contratos e salários:** duração, salário negociado, renovação, fim de contrato (jogador livre).
   Corrige a escala dos salários do clube (hoje EUR 3M/ano contra EUR 429M de receita no City).
3.2 **Tela Stats:** artilharia, assistências, notas, estatísticas do time (os dados já existem).
3.3 **Tela Tactics:** instruções além do estilo (hoje só formação + estilo + mentalidade ao vivo).
3.4 **Staff:** treinadores, preparador físico, olheiros, com efeito em desenvolvimento, lesões e
   observação.
3.5 **Base:** jovens gerados por temporada, promoção ao elenco principal.

**Pronto quando:** cada tela "em breve" (Staff, Stats, Tactics) está funcionando e contratos
mudam decisões de mercado.

### Fase 4 — Realismo da partida

4.1 **Faltas e cartões** (a chance de falta no desarme por trás já está prevista em `tackle.md`),
   suspensões.
4.2 **Jogo aéreo:** cruzamentos, cabeceio (atributo `heading` hoje ignorado), escanteios que viram
   finalização.
4.3 **Bolas paradas mais ricas:** falta direta, cobrador por atributo.

**Pronto quando:** partidas mostram faltas, cartões e gols de cabeça em volumes próximos do real,
com `/test` e `/lab` exibindo as novas estatísticas.

### Contínuo — Polimento e balanceamento

- **Reports dos testers:** triagem semanal com `bun scripts/fetchReports.ts`.
- **Issues abertos** (abaixo), atacados entre as fases.

---

## Pendências técnicas

Débito conhecido, sem issue próprio ainda (ou fora do escopo de um único fix) — atacado entre as
etapas ou quando a área correspondente for revisitada.

| # | Pendência | Onde |
|---|---|---|
| 1 | Taxa de dia adjacente da América do Sul entre Libertadores/Sul-Americana e a liga/copa do mesmo clube (~13%, 54/416) por causa das rodadas de meio de semana do Brasil e da Argentina — estruturalmente maior que a Europa, não dá para baixar sem violar o piso de 3 dias entre datas da própria competição | `Domain/continental/continentalDates.ts` |
| 2 | Ligas europeias de ano civil (Bielorrússia, Finlândia, Geórgia, Islândia, Noruega, Suécia) só têm o choque de data com a UCL/UEL do mesmo clube **logado** na própria virada (dezembro); a rodada não é reagendada, porque mover a rodada inteira da liga para evitar o jogo de 1-2 clubes desalinharia o calendário de todo mundo | `logEuropeanCalendarClashes` (`backend/continentalWorld.ts`) |
| 3 | quickSim × motor entre ligas de força muito diferente: `bundesliga` × `of_danish_superliga` fica com ~8 p.p. de gap na vitória do lado mais forte mesmo depois de `DOMINANCE_SIGMA` 0,35 → 0,25 (issue #2; o gap de gols já está dentro da meta de ±15%) — não foi possível isolar do ruído do motor sem seed nesta rodada | `Domain/advanceDay/QuickSimConfig.ts` |
| 4 | `of_uzbek_super_league` fica em +21% de gols no quickSim vs. motor (era +25% antes da recalibração de 2026-09-26) — é a liga de menor volume de gols do conjunto, então pesa pouco no ajuste por deviance de Poisson somada entre todas as ligas | `Domain/advanceDay/QuickSimConfig.ts` |

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

Fechados em 2026-09-27: **#12** salários fora de escala (curva real-euro + fator de clube, Etapa 3 —
ver `.claude/rules/game/finances.md`) · **#16** laterais invertidos na tela de táticas (commit
`736ed20`, mesma branch).

---

## Referências

- Regras e decisões por área: `.claude/rules/**` (dados, IA, motor, UI, testers, dev-login).
- Specs e planos: `docs/superpowers/`.
- Deploy e servidor: memória `homelab-deploy`; reports: `.claude/rules/tester-reports.md`.
