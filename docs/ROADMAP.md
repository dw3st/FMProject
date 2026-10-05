# FMProject — Roadmap

Referência única do que está feito, do que vem a seguir e em que ordem. Atualizado a cada entrega
(merge em `main`). Última atualização: 2026-09-30 (issues #28–#33 do tester encaixadas nas etapas).

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

Toda etapa concluída do roadmap entra no changelog do jogo ("Novidades") antes do merge — ver
`.claude/rules/changelog.md`.

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
- **Fôlego e carga:** cada jogador recupera dia a dia (idade/carga/stamina), acumula carga
  (minutos-equivalentes com decaimento) num calendário apertado, e a energia de início de partida é
  comprimida em torno de uma referência (`matchStartEnergy`) para suavizar a diferença entre dois
  fôlegos sem mudar o volume de gols de um confronto simétrico. A IA (e o botão "auto" do jogador)
  escala pelo fôlego, poupando titulares cansados por um reserva melhor. Ver
  `.claude/rules/game/fitness.md`.
- **Lesões:** risco por minuto e por contato no motor e no quickSim (calibrados um contra o
  outro), lesão de treino pesado, gravidade e tempo fora, cura na data de volta. Lesionado nunca é
  escalado (IA, "auto", escalação salva do jogador com troca automática), telas de elenco/formação
  avisam, inbox na lesão e na volta. Ver `.claude/rules/game/injuries.md`.
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
| 4 ✅ | 2.1 Stamina / cansaço | #4 partida quebra no servidor de dev | Mexer no motor exige testar partidas localmente com HMR |
| 5 ✅ | 2.2 Lesões | #3 ruído dos `of_*` (+ #14 jovem do SP) | Lesões e rotação dependem de elencos com níveis críveis |
| 6 ✅ | 2.3 Rotação (IA e assistente) | #10 compose exposto na rede local | Correção rápida de segurança; etapa de IA não mexe em infra |
| 7 ✅ | 3.1 Contratos e salários | #6 Kane/Bellingham/Van Dijk (curva de idade) + #23 ELITE 'tight' (#23 fechado; #6 fechado) | Contratos usam idade e nível; revisar a curva de declínio junto. Contratos mudam a folha da IA — mesma hora de afinar a folga dos ELITE |
| 8 ✅ | 3.2 Tela Stats | #7 Bundesliga × Serie A + #24 rótulos do extrato + #28/#29 estrelas (#7, #24, #28, #29 fechados — #7: no mundo atual Bundesliga +1,3% e Serie A +7,6%, dentro de ±10%) | A tela Stats expõe os números por liga que o issue investiga; mesma passada de UI/i18n nos textos do extrato. As estrelas (regra de quem recebe + cores com legenda) usam as mesmas notas e estatísticas da tela |
| 9 ✅ | 3.3 Tela Tactics (blocos A — novo visual dentro do jogo — e B — novo jogo em uma tela — feitos na 1.9; bloco C1 (posições detalhadas, #20 #30 #31) na 2.0; bloco C2 (arrastar, formação livre e eixos táticos, #21) na 2.1; bloco C3 estilo posse #8 na 2.1.1) | #8 estilo posse + #20 zagueiro × lateral na escalação + #21 arrastar e formação livre + #30 cor por posição + #31 posições estilo FM | Tactics mexe nas instruções; o estilo posse é um dos alvos. A posição detalhada (cor e aptidão por posição) é a base da escalação e das instruções |
| 10 ✅ | 3.4 Staff (2.2) | #13 nomes turcos (sai à parte, numa branch só de dados) | Etapa grande + correção pequena de dados. Equipe técnica do clube do jogador feita; a IA usa a nota implícita do tier |
| 11 ✅ | 3.5 Base (2.3) | #9 notas ≥ 8,5 no quickSim | Safra anual de 3–5 jovens por clube; aba Base para o jogador, a IA promove 1–2. Cauda de notas do quickSim corrigida (#9) |
| 11b ✅ | 3.6 Aposentadoria e renascimento de craques (2.4) | — | Aposentadoria na virada (34+), registro em retired.json; craque de classe mundial do clube do jogador pode renascer na base (DP x1,3) |
| 11c ✅ | 3.7 Histórico do jogador | #32 (fechado) | Carreira clube a clube; precisa de contratos (3.1) e aposentadoria (3.6) para ter história de verdade |
| 11d ✅ | 3.8 Ranking de técnicos (2.6) | #33 | Pontuação por títulos; base para convites de clubes maiores e seleções e um futuro multiplayer |
| 12 ✅ | 4.1 Faltas e cartões (2.7) | #17 impedimento visível, faltas, cartões e pênaltis + #19 resumo ao vivo do adversário | Faltas e cartões entram no mesmo painel ao vivo que substitui a escalação do adversário |
| 13 ✅ | 4.2 Jogo aéreo (2.8) | — | Cruzamentos, disputas aéreas, saída do goleiro, cabeçadas e lançamentos longos (peso por `build_up`); quickSim com gols de cabeça; `/test` (cenário `cross-to-box`, overlay Aerial), `/lab` e `scripts/aerial-calibrate.ts` |
| 14 ✅ | 4.3 Bolas paradas (3.0) | — | Escanteios (cruzamento em três zonas ou curto, zagueiros na área, marcação individual), falta direta com barreira, falta cruzada, lateral com alcance, cobradores na tela de táticas; quickSim com gols de bola parada; `/test` (cenários `corner-attack` e `direct-free-kick`, overlay Set pieces), `/lab` e `scripts/setpiece-calibrate.ts` |
| 15 ✅ | 4.4 Treino de estilos de jogo (2.9) | #43 (fechado na 2.9) | Treinar estilos (bola longa, linha de impedimento, linha alta, posse curta, pressão alta com mais desgaste) que dão bônus na partida, combinados com a mentalidade |
| 16 ✅ | Polimento (3.1) | #44 (fechado na 3.1) | Mapa-múndi clicável para escolher o país no novo jogo; rostos gerados dos jogadores (`facesjs`, Apache-2.0, estilo Football GM: determinísticos pelo id, com a camisa do clube; fotos reais da ESPN descartadas por direitos de imagem); aba "Em breve" nas novidades |
| 17 ✅ | Diretoria e torcida (3.2) | #58 (fechado na 3.2) | Medidores da diretoria e da torcida (só o clube do jogador) reagindo a resultados, posição × meta da temporada, títulos, finanças e transferências; meta da temporada, aviso, ultimato e demissão opcional (escolhida no novo jogo); torcida move a ocupação do estádio e o ganho de seguidores; bônus da diretoria no fim da temporada |
| 18 ✅ | Mais formações (3.3) | #59 (fechado na 3.3) | Formações que faltam (4-4-1-1, 4-3-2-1, 3-4-2-1, 3-4-1-2, 5-4-1, 5-2-3, 4-1-2-1-2 losango) com posicionamentos de bola parada e comparação no `/lab`; as 17 formações liberadas para o jogador e a IA escolhendo a formação conforme o elenco |
| 19 ✅ | Equilíbrio entre formações (3.4) | #63 (fechado na 3.4) | Motor: o bloco defensivo desliza para o lado da bola, os atacantes de lado fecham na área no terço final, linha de três em 22/37/52 e volantes do 3-4-3 juntos; a largura da equipe volta a valer no ataque; IA liberada para todas as formações (sem a penalidade de volume de gols); matriz de formações no `/lab` (`/matrix`) e em `scripts/formation-matrix.ts` |
| 22 ✅ | Histórico e recordes do clube (3.7) | — | Aba "História" no elenco de qualquer clube: títulos, temporadas, artilheiros e mais jogos, recordes (maior vitória/derrota, gols numa temporada, melhor posição, invencibilidade, contratação e venda recordes); `clubHistory/{clube}.json` gravado na virada do país e nas transferências com taxa; inbox quando um recorde do clube do jogador cai. Spec `docs/superpowers/specs/2026-10-04-club-history-design.md`, regra `.claude/rules/game/club-history.md` |

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
   observação. Feito na 2.2 (`.claude/rules/game/staff.md`).
3.5 **Base:** jovens gerados por temporada, promoção ao elenco principal. Feito na 2.3 (`.claude/rules/game/youth.md`).
3.6 **Aposentadoria e "renascimento" de craques (estilo Brasfoot):** jogadores se aposentam por idade
   e declínio. Quando um craque de classe mundial do clube do jogador se aposenta, o jogador pode
   escolher trazê-lo de volta como um jovem de 17–19 anos na base do clube — mesmo nome/perfil, com
   uma estrela marcando a origem, nível de "promessa" (~médio aos 17), e que pode voltar a ser classe
   mundial se se desenvolver. Depende da Base (3.5) e do desenvolvimento por desempenho.
3.7 **Histórico do jogador (#32):** clube que revelou e a carreira clube a clube — empréstimos,
   vendas (com valores), jogos, gols, assistências, cartões, lesões e títulos.
3.8 **Ranking de técnicos (#33):** pontuação pelos títulos conquistados; usada para convites de
   clubes maiores e seleções (e num futuro multiplayer).

**Pronto quando:** cada tela "em breve" (Staff, Stats, Tactics) está funcionando, contratos
mudam decisões de mercado e um craque aposentado pode renascer na base do clube.

### Fase 4 — Realismo da partida

4.1 **Faltas e cartões** (a chance de falta no desarme por trás já está prevista em `tackle.md`),
   suspensões.
4.2 **Jogo aéreo:** cruzamentos, cabeceio (atributo `heading`, usado desde a 2.8), escanteios que viram
   finalização.
4.3 **Bolas paradas mais ricas:** falta direta, cobrador por atributo (feito na 3.0, `set-pieces-play.md`).

**Pronto quando:** partidas mostram faltas, cartões e gols de cabeça em volumes próximos do real,
com `/test` e `/lab` exibindo as novas estatísticas.

### Contínuo — Polimento e balanceamento

- **Reports dos testers:** triagem semanal com `bun scripts/fetchReports.ts`.
- **Issues abertos** (abaixo), atacados entre as fases.
- Mapa-múndi e rostos dos jogadores foram para a etapa 16 (Polimento).

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

Fechados na 3.4 (2026-10-03): **#63** equilíbrio entre formações.

Fechados na 3.3 (2026-10-03): **#59** mais formações.

Fechados na 3.2 (2026-10-03): **#58** diretoria e torcida.

Fechados na 2.7 (2026-10-02): **#17** impedimento visível, faltas, cartões e pênaltis · **#19** resumo
ao vivo (painel "Resumo" no lugar da escalação do adversário) · **#45** ranking geral de todas as ligas
na Stats e seletor agrupado por continente e país · **#46** botão de report durante a partida (testers)
· **#47** reservas ordenados por linha, posição e nota na Formação.

Fechados na 2.5 (2026-10-02): **#39** fonte da aba "Meu time" igual à de Rankings · **#40** posições
detalhadas no elenco aberto pelo menu · **#41** botão "Continuar" no topo da tela de resultado ·
**#42** condução sobre a linha de fundo.

Fechados na 2.4.1 (2026-10-01): **#36** partida travada com bola solta sem perseguidor (o perseguidor
saía de campo por lesão/substituição e ninguém era recomprometido; agora há recomprometimento e um
watchdog de 7 s reais) · **#37** condutor colado na linha lateral e na linha de fundo ao lado da
trave · **#38** texto "Carregando o resultado da partida" no fim do jogo.

Abertos em 2026-09-25: #2 quickSim × motor em gols · #5 revisão final + smoke
da recalibração · #8 estilo posse · #9 notas
≥ 8,5 no quickSim · #10 compose exposto na rede local (fechado na Etapa 6) · #11 ligas de ano civil com a composição de
2026 · #13 nomes turcos com maiúscula estranha.

Abertos em 2026-09-28 (triagem de tester): #28 estrela dada a quem não deveria (Konaté) · #29
estrelas por cor com legenda · #30 cor por posição detalhada · #31 posições estilo Football Manager
· #32 histórico do jogador por clube · #33 ranking de técnicos.

Fechados na 1.5.1 (2026-09-28): **#25** escudo do Figueirense · **#26** escudo do Athletic Club ·
**#27** confirmação ao excluir save. A causa dos escudos era o mapa global com busca aproximada entre
ligas em `data_process/pipeline.py`.

Fechados em 2026-09-28: **#3** ruído dos `of_*` (fator de sorte único por jogador + teto suave via
previsor de nível, em vez de ruído independente por atributo) e **#14** jovem promissor nascendo
como o melhor do elenco (crescimento reduzido no `importEspn` para quem já está acima da mediana do
próprio clube na linha) — Etapa 5, mundo regenerado; ver `.claude/rules/data/openfootball-import.md`
e `.claude/rules/data/espn-import.md`.

Fechados em 2026-09-27: **#12** salários fora de escala (curva real-euro + fator de clube, Etapa 3 —
ver `.claude/rules/game/finances.md`) · **#16** laterais invertidos na tela de táticas (commit
`736ed20`, mesma branch) · **#4** partida quebra no servidor de desenvolvimento (Etapa 4 — não era o
bundler nem o casing do caminho: o `bun` pinado em `bun.lock` estava em 1.3.10 (atrás do peer solto
de `bun-plugin-tailwind`); `bun update bun` levou esse pin para 1.4.2 — único arquivo alterado, sem
mudança de código — e o `Dockerfile` de produção foi pinado em `oven/bun:1.4-alpine` pelo mesmo
motivo; ver `.claude/rules/dev-login.md`).

Dois reports de tester corrigidos durante a Etapa 4, sem issue próprio (achados direto na revisão da
tarefa, não vieram de uma triagem de `fetchReports.ts`): camisas pretas/escuras ilegíveis na tela de
resultado e na prévia da partida (commit `a4e5e03`, `readableOnDark` como o `ScoreBar` ao vivo já
fazia) e o overlay de intervalo/fim de jogo passando rápido demais em 4× (commit `318b61a`).

---

## Referências

- Regras e decisões por área: `.claude/rules/**` (dados, IA, motor, UI, testers, dev-login).
- Specs e planos: `docs/superpowers/`.
- Deploy e servidor: memória `homelab-deploy`; reports: `.claude/rules/tester-reports.md`.
