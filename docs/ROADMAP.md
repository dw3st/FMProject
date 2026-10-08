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
| 20 ✅ | Convites de clubes (3.5) | — | Reputação do técnico (ranking, diretoria, títulos, carreira) e propostas de clubes na virada, no meio da temporada e desempregado; aceitar troca de clube no meio da carreira; a demissão deixa o técnico sem clube em vez de encerrar a carreira |
| 21 ✅ | Negociação, cláusula de venda futura e empréstimos (3.7) | — | A IA responde a uma oferta com contraproposta (paciência de 3 rodadas por dia, oferta abaixo de 60% do valor encerra a conversa por 14 dias); cláusula de venda futura de 10/20/30% na compra e na venda, paga na próxima venda com taxa; a lista de venda não vende sozinha: a IA manda propostas para a inbox (aceitar, recusar, contrapropor); empréstimos de ida e de volta com parte do salário, volta na data. Spec `docs/superpowers/specs/2026-10-04-negotiation-loans-design.md`, regra `.claude/rules/game/negotiation.md` |
| 22 ✅ | Histórico e recordes do clube (3.6) | — | Aba "História" no elenco de qualquer clube: títulos, temporadas, artilheiros e mais jogos, recordes (maior vitória/derrota, gols numa temporada, melhor posição, invencibilidade, contratação e venda recordes); `clubHistory/{clube}.json` gravado na virada do país e nas transferências com taxa; inbox quando um recorde do clube do jogador cai. Spec `docs/superpowers/specs/2026-10-04-club-history-design.md`, regra `.claude/rules/game/club-history.md` |
| 23 ✅ | Moral e conversas com jogadores (3.8) | — | Moral 0..100 e papel no elenco (craque, titular, rodízio, reserva, promessa) só no clube do jogador; minutos das últimas 5 partidas contra o esperado, resultados, gols e notas, deriva para 65; efeito de execução na partida (atributos × (1 + 0,02 × fator), neutro em 65), no desenvolvimento e no pedido de salário; revoltado pede para sair (lista de venda, mais propostas); conversas pela inbox com promessas (minutos, saída, renovação) cobradas pelo jogo; coluna Moral e filtro no elenco, bloco na ficha, cartão Atenção; `/test` (seletor por time, cenário `morale-gap`) e `/lab` (`Variant.morale`). Spec `docs/superpowers/specs/2026-10-04-morale-talks-design.md`, regra `.claude/rules/game/morale.md` |
| 24 ✅ | Instalações do clube: estádio, CT e base (3.9) | — | Estádio em 4 setores (ampliar +1k..+10k lugares por obra, custo por lugar pelo país e pela liga, setor pela metade durante a obra), conforto 1–5 (+6% no ingresso por nível), público = min(capacidade, demanda) com a demanda ancorada no estádio de início (seguidores, tier da liga, torcida, fase da temporada); CT 1–5 (recuperação, lesão e evolução no treino, somando ao staff) e base 1–5 (nível, tamanho e promessa da safra); a IA usa o nível implícito do tier; o jogador pede, a diretoria decide (≥ 85 paga 25–50%); parcelas mensais, manutenção semanal; aba Instalações em Finanças, cartão Obras no Painel, público esperado na prévia. Spec `docs/superpowers/specs/2026-10-04-facilities-design.md`, regra `.claude/rules/game/facilities.md` |
| 25 ✅ | Mercado mais vivo (4.0) | — | Janelas de transferência por país (pré-temporada e meio, pela liga de nível 1; compra e empréstimo só com a janela do comprador aberta, livres a qualquer hora, 30 dias de carência na carreira nova), mercado da IA concentrado nas janelas com o mesmo volume anual; pré-contrato com jogadores em fim de contrato; rivais da IA disputando o alvo do jogador (piso do vendedor, o jogador escolhe o clube, prazo de 3 dias); técnicos da IA demitidos por maus resultados, pool de livres, interino + vaga e contratação pelo prestígio, sem troca na mudança de clube do jogador; contrato do técnico do jogador (salário no extrato, renovação pela diretoria, multa, compensação). Spec `docs/superpowers/specs/2026-10-05-living-market-design.md`, regra `.claude/rules/game/transfer-windows.md` |
| 26 ✅ | Personalidade dos jogadores (4.2) | — | Quatro traços 1..20 (ambição, lealdade, profissionalismo, temperamento) derivados do id (sem migração; renascido herda a do original), mostrados em faixas na ficha e borrados pelo olheiro de fora; profissionalismo na evolução (DP ×0,85..×1,15, declínio ×1,1..×0,9), temperamento nas faltas e cartões (motor e quickSim), moral do clube do jogador (volatilidade, minutos, pedido de transferência, `wants_move`, lealdade ao ser listado/promessa quebrada), pedido de salário (ambição, lealdade na renovação, compatriota, clube menor e recusa `smallerClub`, também para a IA), empurrão no score do vendedor IA; linhas explicando o pedido na renovação/contratação, dica na conversa; `/test` (seletor por time, cenário `hothead`) e `/lab` (`Variant.temperament`). Spec `docs/superpowers/specs/2026-10-05-personality-design.md`, regra `.claude/rules/game/personality.md` |
| 27 ✅ | Instruções individuais (4.1) | — | 18 variantes de função (lateral apoia/fica/invertido, ala ofensivo/defensivo, zagueiro que sai/na sobra/com bola, volante fixo/que chega, meia de ligação/que chega na área, meia armador/segundo atacante, meia por dentro, ponta por dentro, centroavante de área/pivô) e pressão individual por vaga na tela de táticas, sobre os pesos de `roles.json` e a âncora da vaga; marcação individual (até 2) por partida na prévia e ao vivo; a IA joga no padrão; matriz de instruções (`scripts/instruction-matrix.ts`, `/matrix` modo Instructions): toda variante a ±5 p.p. do padrão em 1200 jogos; falso 9, ponta aberto e meia aberto cortados na calibração; `/test` (overlay Instructions, cenários) e `/lab` (variantes, marcação, estatísticas por vaga). Spec `docs/superpowers/specs/2026-10-05-player-instructions-design.md`, regra `.claude/rules/game/player-instructions.md` |
| 28 ✅ | Olheiros de verdade (4.3) | — | Conhecimento por jogador 0..100 (implícito: própria liga 35, país 20, fama +25, até 60; decai depois de 90 dias) e incerteza ±2,0 → 0 (atributos ocultos abaixo de 20) só nas telas, multiplicada pelo olheiro-chefe; olheiros de campo (até 4, salário de staff); missões de país, liga, continente, jogador e jovens (4/8/12 semanas, foco por linha, idade e "melhora o elenco"), relatórios com nota A–E, joias, recomendação mensal do chefe, lista de observação (até 50, alertas na segunda), jovens sem clube contratados para a base com compensação de formação; viagens no extrato (`scouting`); conhecimento e lista seguem o técnico na troca de clube; a IA e o motor leem valores exatos. Aba por aba na Central de Olheiros, bloco "Conhecimento" na ficha, aba Olheiros na Equipe técnica. Spec `docs/superpowers/specs/2026-10-05-scouting-design.md`, regra `.claude/rules/game/scouting.md` |
| 29 ✅ | Recalibração pelo valor de mercado (4.5) | #83, #94, #96 | Notas reordenadas por liga pelo valor de mercado do Transfermarkt (ajustado por idade e posição), posição natural do Transfermarkt, nacionalidade/nascimento/altura; atributos com uma casa decimal mostrados de 0 a 100 com cor; evolução em passos de 0,1 no ritmo de antes. Spec `docs/superpowers/specs/2026-10-07-market-value-recalibration-design.md` |
| 30 | Responsabilidades e inbox mais limpa | #105 | O diretor cuida dos contratos por padrão (renovações, conversas de contrato, avisos de fim de contrato); o jogador pode assumir nas configurações; filtros para não receber notícias que não interessam (técnicos demitidos de outros clubes etc.). Pequena e de qualidade de vida, antes das etapas grandes |
| 31 ✅ | Comissão técnica completa | #102 | **31a ✅ (4.7):** auxiliar, preparadores físico e de goleiros, treinadores de área, médico, analista, olheiros e jardineiro com atributos 1–20 e estrelas 1–5; sete áreas de treino (goleiro evolui reflexo e impulsão; força e fôlego evoluem), área vaga a ×0,4; limites por tier; contratos de 1–3 anos com multa e renovação (diretor ou aviso); lista de 300 livres na aba Comissão de Transferências; folha ≤ ~4% da receita. Spec `docs/superpowers/specs/2026-10-08-coaching-staff-design.md`, regra `.claude/rules/game/staff.md`. **31b ✅ (4.7):** rostos `facesjs` da comissão (clube e lista de livres) e dos técnicos (ranking, Painel), gerados no servidor; avatar do técnico do jogador no novo jogo (sortear + pele, cabelo e cor, barba, óculos), salvo como parâmetros no save |
| 32 | Prêmios de fim de temporada | #110 | Melhor jogador, revelação, gol mais bonito, melhor técnico, melhor goleiro/zagueiro/meia/atacante e seleção da temporada por liga; no perfil do jogador e do técnico, filtráveis no olheiro e nas estatísticas |
| 33 | Olheiros por país | #104 | Conhecimento de cada olheiro por país (nacionalidade, cresce com as missões) e mapa mundial ao clicar no olheiro; usa a Central de Olheiros e o mapa-múndi do novo jogo |
| 34 | Instalações vivas | — | Desgaste e vida útil das obras (reforma e reconstrução), instalações em detalhe (academia, piscina, fisioterapia, refeitório, campos, "N de 10" e % de desgaste) e instalações pesando na decisão do jogador de aceitar o clube |
| 35 | Partida ao vivo: mapa de calor e táticas completas | #108 | Mini mapa de calor durante o jogo; estilo tático e instruções de equipe mudáveis ao vivo (hoje: mentalidade, formação, instruções individuais) |
| 36 | Torneios de base e reservas | — | Sub-21 e sub-19 com calendário próprio, para dar minutos e evolução aos jovens e reservas |
| 37 | Inscrição por competição | #103 | Inscritos por torneio, limite de estrangeiros e mínimo de formados no clube; depende das competições e da base |
| 38 | Visual da partida e estádio | #107, #99 | Árbitros e bandeirinhas, técnicos à beira do campo com gestos pela mentalidade, animações de chute; estádio em volta do campo com a torcida proporcional ao público |
| 39 | VAR e reclamação do técnico | #109 | Revisão de lances polêmicos (pênalti, gol, vermelho) e o técnico podendo reclamar, com risco de cartão e suspensão |
| 40 | Conquistas | #95 | Desafios com recompensas (itens de perfil, atributos do técnico, jogador criado ou lenda aposentada) |
| 41 | Seleções nacionais | — | Convocações, datas FIFA, Copa do Mundo, convite ao técnico pelo ranking |
| 42 | Imprensa e notícias | — | Coletivas com efeito na moral e na diretoria, página de notícias do mundo |
| 43 | Multiplayer | #106 | Vários técnicos humanos no mesmo mundo; precisa de desenho próprio |

### Próximas etapas em detalhe

Cada etapa segue o fluxo de sempre (as decisões já tomadas estão em cada etapa; publicação autônoma quando testes e smoke passam): desenho aprovado pelo usuário → spec → plano → execução com testes, `/test` e `/lab` quando houver efeito de partida → smoke → changelog → publicação.

**29 · Recalibração pelo valor de mercado (4.5) ✅.** Publicada em 2026-10-07. Gols por liga mudaram (Premier −13%, Brasileirão +16%; média do mundo igual), aceito pelo usuário; quickSim dentro de ±10%; `BENCH_SWAP_RATIO` 1,17 → 1,10; elencos completados nos mínimos por linha depois da recalibração.

**30 · Responsabilidades e inbox mais limpa (#105).**
- Configurações → Responsabilidades: contratos (renovar, negociar, avisos de fim de contrato) com o diretor (padrão) ou com o técnico; com o diretor, ele renova pela regra da IA dentro da folha e só avisa o resultado.
- Preferências da inbox: ligar/desligar categorias de notícia (técnicos demitidos e contratados, mercado da liga, recordes de outros clubes etc.); o padrão deixa só o que pede ação ou afeta o clube.
- Conversas de contrato pedidas pelos jogadores vão ao diretor quando ele é o responsável.

**31 · Comissão técnica completa (#102) + rostos.**
- Funções: auxiliar, preparador físico, preparador de goleiros, preparador geral (com sub-áreas: defesa, ataque, tática, técnica, bola parada), olheiros, médico/fisioterapeuta, analista de desempenho, jardineiro (cuida do gramado do estádio e do CT; o efeito entra na etapa 34); limite por função.
- Cada profissional com atributos (determinação, disciplina, adaptação, leitura de jogadores, conhecimento da área) e nota em estrelas 1–5 por área de treino.
- Efeitos: a evolução de cada grupo de atributos depende do preparador daquela área (goleiros só com o de goleiros); a IA segue com a nota implícita do tier.
- Mercado: busca de funcionários na aba Transferências (jogadores × comissão).
- Rostos (facesjs) para a comissão e os técnicos; avatar do técnico do jogador no novo jogo (sortear + pele, cabelo e cor, barba, óculos).
- Medição: ritmo de evolução por idade igual ao de hoje com a comissão média.
- **Decidido (2026-10-07):** faltar um preparador faz a área evoluir a ~40% do ritmo (ninguém trava); limite de profissionais por função pelo tamanho do clube; a IA não contrata comissão (qualidade implícita pela divisão/tier); contratos de 1 a 3 anos com salário fixo, multa de metade do restante ao demitir e renovação perto do fim; busca na aba Transferências com filtros por função, estrelas e salário.

**32 · Prêmios de fim de temporada (#110).**
- Na virada de cada liga: melhor jogador, revelação (≤ 21), artilheiro, melhor goleiro/zagueiro/meia/atacante pela nota média (mínimo de jogos), seleção da temporada (XI), melhor técnico (campanha × meta); gol da temporada sorteado entre os gols de fora da área ou de cabeça da liga.
- Prêmios gravados no histórico do jogador e do técnico (linha da temporada), aparecem na ficha (selos), no ranking de técnicos e na aba Estatísticas; filtro "premiados" no olheiro.
- Inbox com os premiados da liga do jogador; prêmio de jogador do clube do jogador mexe na moral.
- **Decidido (2026-10-07):** prêmios por liga (melhor jogador, revelação, artilheiro, melhor goleiro, seleção, melhor técnico, gol da temporada) + mundiais (melhor jogador e melhor técnico do mundo); o premiado ganha moral (clube do jogador), valor de mercado um pouco maior por uma temporada e fica mais procurado por clubes grandes.

**33 · Olheiros por país (#104).**
- Cada olheiro tem conhecimento por país (alto no país de origem e vizinhos, cresce a cada missão naquele país e decai devagar).
- O conhecimento do país multiplica o ganho das missões e a qualidade dos relatórios.
- Ao clicar no olheiro: mapa mundial (reaproveita o do novo jogo) com conhecimento completo, moderado e nenhum.
- Missões continuam de 4/8/12 semanas (rápida, moderada, profunda), com o olheiro ocupado e a viagem cobrada pela distância.
- **Decidido (2026-10-07):** cada olheiro tem nacionalidade; conhece muito o próprio país e moderadamente os do mesmo continente; o resto aprende nas missões.

**34 · Instalações vivas.**
- Desgaste semanal de cada instalação (assentos, gramado, equipamentos), vida útil, reforma parcial e reconstrução quando passa do limite; manutenção no extrato.
- Instalações em detalhe: tela visual com as partes do CT e da base (academia, piscina, fisioterapia, refeitório, campos), cada uma "N de 10" com % de desgaste; o jogador escolhe o que melhorar e a diretoria aprova.
- Gramado: a condição do gramado do estádio e do CT cai com os jogos, os treinos e o tempo e é mantida pelo jardineiro (nota e quantidade); gramado ruim (grama alta, irregular) aumenta o risco de lesão no treino e nos jogos em casa.
- Instalações pesam na decisão do jogador de aceitar o clube (como a ambição com clube menor).
- **Decidido (2026-10-07):** vida útil de 1 a 5 temporadas por item, com desgaste progressivo (mais lento no começo e acelerando perto do fim); itens de uso intenso (gramado do estádio e do CT, academia) desgastam mais rápido que os de estrutura (arquibancada, refeitório); reforma parcial a qualquer momento; abaixo de ~40% passa a pesar (lesão no gramado ruim, menos evolução no CT ruim); abaixo de ~15% precisa refazer a obra.

**35 · Partida ao vivo: mapa de calor e táticas completas (#108).**
- Mapa de calor pequeno ao lado do campo (posições da bola por time nos últimos minutos e no jogo todo), alternável.
- Painel tático na partida: estilo tático e eixos (pressão, linha, largura, construção) mudáveis ao vivo, além da mentalidade e da formação que já existem; vale só para o jogo, sem gravar a tática.

**36 · Torneios de base e reservas.**
- Competições sub-21 e sub-19 por país, com calendário que não choca com o time principal.
- Escalação automática pelos jovens e reservas sem minutos; partidas no quickSim; DP e moral contam.
- Tabela e resultados na tela de Ligas; jogos do clube do jogador no calendário.
- **Decidido (2026-10-07):** jogos da base simulados (só resultado, tabela e quem se destacou); escalação automática com jovens e reservas sem minutos, com opção de mandar alguém jogar.

**37 · Inscrição por competição (#103).**
- Lista de inscritos por competição, com limite de estrangeiros e mínimo de formados no clube/país conforme a liga ou o torneio continental; prazo de inscrição pelas janelas.
- A IA inscreve sozinha; jogador não inscrito não pode ser escalado naquela competição.
- **Decidido (2026-10-07):** regras reais simplificadas das principais competições (ex. Brasileirão até 9 estrangeiros relacionados; Premier 8 formados no país em 25; Champions 8 formados no clube/país) e uma regra padrão por continente nas demais.

**38 · Visual da partida e estádio (#107, #99).**
- Árbitro e bandeirinhas desenhados seguindo o lance; técnicos à beira do campo com gesto quando a mentalidade muda.
- Animações curtas (chute de longe, cabeçada, defesa) só no desenho.
- Estádio em volta do campo com a torcida proporcional ao público esperado (instalações, 3.9).

**39 · VAR e reclamação do técnico (#109).**
- Revisão de pênalti, gol (impedimento/falta) e vermelho direto com uma chance de erro do juiz corrigida pelo VAR; pausa curta na partida.
- Botão "reclamar com o árbitro": chance de amarelo/vermelho ao técnico, suspensão nos próximos jogos (o auxiliar comanda), efeito na moral e na diretoria.
- **Decidido (2026-10-07):** reclamar tem pequeno ganho (moral do time e da torcida; raramente mais rigor do juiz com o adversário) e risco (cartão, suspensão com o auxiliar no comando, diretoria irritada se exagerar).

**40 · Conquistas (#95).**
- Lista de desafios por carreira com recompensas cosméticas e algumas de jogo (jogador criado na base, lenda aposentada); desenho próprio antes.

**41–43 · Seleções nacionais, imprensa e multiplayer:** cada uma com desenho próprio quando chegar a vez.

**Depois (sem ordem ainda):** nada no momento; tudo que chegou está nas etapas 30–43.

**Mais tarde:** tudo que estava aqui foi encaixado nas etapas 30–43 (acima); escolha de ligas no novo jogo descartada por enquanto (#101: ganho só nos dias sem jogo; save de 44 MB não é problema).

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
ligas no antigo pipeline Python (`data_process/pipeline.py`, removido em 2026-10-06).

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
