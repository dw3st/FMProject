/**
 * In-game changelog ("Novidades" / "What's new") data.
 *
 * Newest entry first. `CURRENT_VERSION` is always the first entry's version and drives:
 *  - the version label/button on the start screen (`StartScreen.tsx`)
 *  - the "new version" notice pill (`useChangelogNotice.ts`)
 *  - `package.json`'s `version` field, which must be kept in sync by hand on release.
 *
 * Keep wording minimal and player-facing — no technical or implementation detail.
 * See .claude/rules/changelog.md for the versioning rule and update process.
 */

export interface ChangelogText {
  pt: string;
  en: string;
}

export interface ChangelogEntry {
  version: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  items: ChangelogText[];
  fixes?: ChangelogText[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: "3.3.5",
    date: "2026-10-03",
    items: [
      { pt: "Novo jogo cabe na tela: a lista de países, a de clubes e o perfil rolam por dentro, e o botão de começar fica sempre à vista.", en: "New game fits the screen: the country list, the club list and the profile scroll inside, and the start button is always in view." },
    ],
    fixes: [
      { pt: "O campo do nome do técnico não mostra mais as sugestões de preenchimento do navegador.", en: "The manager name field no longer shows the browser's autofill suggestions." },
    ],
  },
  {
    version: "3.3.4",
    date: "2026-10-03",
    items: [
      { pt: "Crédito do desenvolvedor (westlab.dev) na barra inferior.", en: "Developer credit (westlab.dev) in the bottom bar." },
    ],
    fixes: [
      { pt: "Barra inferior maior e mais legível: texto e ícones maiores, com mais espaço entre os itens.", en: "Bigger, more legible bottom bar: larger text and icons, with more space between items." },
    ],
  },
  {
    version: "3.3.3",
    date: "2026-10-03",
    items: [
      { pt: "Prévia e resultado da partida com texto maior.", en: "Match preview and result with larger text." },
    ],
    fixes: [
      { pt: "Barra superior reorganizada: abas no centro e os controles do dia (data, treino ou folga, avançar até o jogo, Continuar) separados à direita.", en: "Top bar reorganised: tabs in the centre and the day controls (date, training or rest, skip to the match, Continue) set apart on the right." },
      { pt: "O aviso de versão nova agora fica na barra de baixo, ao lado da versão.", en: "The new version notice now sits in the bottom bar, next to the version." },
    ],
  },
  {
    version: "3.3.2",
    date: "2026-10-03",
    items: [
      { pt: "Partida ao vivo: bolinhas maiores em telas grandes e contorno claro para uniformes da cor do gramado.", en: "Live match: bigger dots on large screens and a light outline for kits the colour of the grass." },
    ],
    fixes: [
      { pt: "Atualizar a página durante a partida não reinicia mais o jogo.", en: "Refreshing the page during a match no longer restarts it." },
      { pt: "Removida a linha branca solta no canto do campo.", en: "Removed the stray white line in the corner of the pitch." },
    ],
  },
  {
    version: "3.3.1",
    date: "2026-10-03",
    items: [
      { pt: "Partida ao vivo: os jogadores aparecem com o rosto nas bolinhas, um pouco maiores.", en: "Live match: players show their faces inside slightly bigger dots." },
    ],
    fixes: [
      { pt: "Placar da partida sempre centralizado.", en: "Match scoreboard always centred." },
      { pt: "Menu superior e barra inferior alinhados com o conteúdo.", en: "Top menu and bottom bar aligned with the content." },
    ],
  },
  {
    version: "3.3",
    date: "2026-10-03",
    items: [
      {
        pt: "17 formações para escolher: chegam 4-4-1-1, 4-3-2-1, 3-4-2-1, 3-4-1-2, 5-4-1, 5-2-3 e o losango, e todas as formações antigas ficam liberadas na tática, na partida ao vivo e no laboratório.",
        en: "17 formations to choose from: 4-4-1-1, 4-3-2-1, 3-4-2-1, 3-4-1-2, 5-4-1, 5-2-3 and the diamond arrive, and every older formation is now available in tactics, the live match and the lab.",
      },
      {
        pt: "Os adversários variam a formação conforme o elenco que têm.",
        en: "Opponents vary their formation to suit the squad they have.",
      },
    ],
  },
  {
    version: "3.2",
    date: "2026-10-03",
    items: [
      {
        pt: "Diretoria e torcida de verdade: a confiança sobe e desce com resultados, posição na tabela, títulos, finanças e vendas de ídolos, com seta de tendência no painel.",
        en: "A real board and fans: confidence rises and falls with results, league position, titles, finances and idol sales, with a trend arrow on the dashboard.",
      },
      {
        pt: "Meta da temporada definida pela diretoria (título, vaga continental, metade de cima, meio da tabela ou fugir do rebaixamento); diretoria satisfeita paga bônus no fim da temporada.",
        en: "A season objective set by the board (title, continental place, top half, mid-table or avoiding relegation); a happy board pays a bonus at the end of the season.",
      },
      {
        pt: "Torcida animada enche o estádio: a bilheteria e o ganho de seguidores acompanham o humor da torcida.",
        en: "Happy fans fill the stadium: gate revenue and follower growth follow the fans' mood.",
      },
      {
        pt: "Novo jogo com a opção \"Pode ser demitido\": com ela ligada, a diretoria avisa, dá ultimato e pode demitir você.",
        en: "New game option \"Can be sacked\": when on, the board warns you, gives an ultimatum and can sack you.",
      },
    ],
  },
  {
    version: "3.1.4",
    date: "2026-10-03",
    items: [
      {
        pt: "Tela em peça única: as colunas laterais saíram e toda tela usa a largura inteira.",
        en: "One-piece screens: the side columns are gone and every screen uses the full width.",
      },
      {
        pt: "Clube e agenda da semana agora são cartões do painel; clique num dia de treino ou descanso para trocar.",
        en: "Club and week schedule are now dashboard cards; click a training or rest day to switch it.",
      },
    ],
  },
  {
    version: "3.1.3",
    date: "2026-10-03",
    items: [
      {
        pt: "Novo painel inicial: próximo jogo e últimos resultados, tabela da liga, alertas (lesões, suspensões, cansaço, contratos, base), destaques da temporada, mensagens recentes e finanças da semana.",
        en: "New home dashboard: next match and recent results, league table, alerts (injuries, bans, fatigue, contracts, academy), season highlights, recent messages and the week's finances.",
      },
      {
        pt: "Painel e Elenco agora são abas separadas no menu: a tabela completa do elenco fica no Elenco.",
        en: "Dashboard and Squad are now separate menu tabs: the full squad table lives in Squad.",
      },
    ],
  },
  {
    version: "3.1.2",
    date: "2026-10-03",
    items: [
      { pt: "Mapa-múndi maior no novo jogo.", en: "Bigger world map in the new game." },
      { pt: "Tela inicial e criação do técnico no mesmo padrão visual do jogo.", en: "Start screen and manager creation now match the game's visual style." },
    ],
    fixes: [
      { pt: "Largura das telas padronizada: todas usam o mesmo espaço.", en: "Screen widths standardised: every screen uses the same space." },
      { pt: "Botão de virar o card na partida voltou a funcionar, e o placar saiu de cima do nome do time.", en: "The flip button on the live match card works again, and the score no longer sits on the team name." },
      { pt: "Avisos da partida não cobrem mais o placar.", en: "Match notices no longer cover the scoreboard." },
    ],
  },
  {
    version: "3.1.1",
    date: "2026-10-03",
    items: [
      { pt: "Visual revisado em todas as telas: títulos, rótulos, números e botões de opção no mesmo padrão e mais legíveis.", en: "Visual pass on every screen: titles, labels, numbers and option buttons now share one style and are easier to read." },
      { pt: "Rostos dos jogadores também no resumo do dia, no desenvolvimento e nas bolinhas da formação.", en: "Player faces now also show in the day summary, development and on the formation pitch." },
      { pt: "Partida ao vivo: vire o card para ver o time adversário; escanteios e tiros livres no resumo.", en: "Live match: flip the card to see the opponent; corners and free kicks in the summary." },
    ],
    fixes: [
      { pt: "Notas dos jogadores apagadas na prévia da partida.", en: "Faded player ratings in the match preview." },
      { pt: "Escudos cortados no painel do clube.", en: "Cropped crests on the club dashboard." },
    ],
  },
  {
    version: "3.1",
    date: "2026-10-03",
    items: [
      { pt: "Novo jogo: escolha o país clicando no mapa-múndi.", en: "New game: pick your country by clicking on the world map." },
      { pt: "Os jogadores ganharam rosto, com a camisa do clube, na ficha e no painel.", en: "Players now have faces, wearing their club's shirt, on their profile and the dashboard." },
      { pt: "Nova aba \"Em breve\" nas novidades, com o que vem por aí.", en: "New \"Coming soon\" tab in What's new, showing what's on the way." },
    ],
  },
  {
    version: "3.0",
    date: "2026-10-03",
    items: [
      { pt: "Escanteios de verdade: os zagueiros sobem para a área, a defesa marca homem a homem e o cobrador escolhe primeiro pau, marca do pênalti, segundo pau ou a cobrança curta.", en: "Proper corners: centre-backs go up, the defence marks man to man and the taker picks the near post, the penalty spot, the far post or a short one." },
      { pt: "Faltas perto da área viram chute direto por cima da barreira; mais longe ou de lado, cruzamento na área.", en: "Free kicks near the box are shot directly over the wall; further out or from wide, they are crossed into the box." },
      { pt: "Escolha os cobradores de escanteio, falta e pênalti na tela de táticas (ou deixe no automático).", en: "Pick your corner, free-kick and penalty takers on the tactics screen (or leave them on automatic)." },
      { pt: "Laterais agora vão só para quem está perto.", en: "Throw-ins now only reach nearby team-mates." },
      { pt: "Novas estatísticas de partida: escanteios, faltas diretas e gols de bola parada.", en: "New match stats: corners, direct free kicks and set-piece goals." },
    ],
  },
  {
    version: "2.9",
    date: "2026-10-03",
    items: [
      { pt: "Treino de estilos de jogo: o time ganha familiaridade com cada estilo e joga melhor o que treina.", en: "Playing-style training: your team builds familiarity with each style and plays the one it trains better." },
      { pt: "Foco de estilo no treino: escolha o estilo a treinar (ou deixe no automático, que treina o estilo da tática); bola longa e linha alta também podem ser treinadas.", en: "Style focus in training: pick the style to drill (or leave it on auto, which drills your tactics style); long balls and the high line can be trained too." },
      { pt: "Barras de familiaridade na tela de táticas; um bom auxiliar técnico acelera o treino.", en: "Familiarity bars on the tactics screen; a good assistant speeds up training." },
      { pt: "A pressão alta cansa um pouco mais o time.", en: "A high press tires your team a little more." },
    ],
  },
  {
    version: "2.8",
    date: "2026-10-02",
    items: [
      { pt: "Jogo aéreo: cruzamentos na área, disputas pelo alto e gols de cabeça.", en: "Aerial play: crosses into the box, aerial duels and headed goals." },
      { pt: "Lançamentos longos por cima da defesa, mais frequentes no jogo direto.", en: "Long balls over the defence, more frequent with direct play." },
      { pt: "Goleiros saem para agarrar ou socar as bolas altas perto do gol.", en: "Keepers come out to catch or punch high balls near goal." },
      { pt: "O cabeceio agora conta: quem cabeceia bem ganha mais bolas pelo alto e marca mais de cabeça.", en: "Heading now matters: good headers win more balls in the air and score more headers." },
      { pt: "Novas estatísticas de partida: cruzamentos, disputas aéreas, gols de cabeça e lançamentos.", en: "New match stats: crosses, aerial duels, headed goals and long balls." },
    ],
  },
  {
    version: "2.7",
    date: "2026-10-02",
    items: [
      { pt: "Faltas, cartões amarelos e vermelhos, tiros livres e pênaltis durante as partidas.", en: "Fouls, yellow and red cards, free kicks and penalties during matches." },
      { pt: "Suspensões: vermelho tira o jogador do próximo jogo, e a cada 5 amarelos ele cumpre um jogo. Você recebe um aviso na caixa de entrada.", en: "Suspensions: a red card rules the player out of the next match, and every 5 yellow cards cost one match. You get a note in your inbox." },
      { pt: "Jogadores suspensos aparecem marcados no elenco e na formação e não podem ser escalados.", en: "Suspended players are marked in the squad and formation screens and can't be picked." },
      { pt: "Partida ao vivo: avisos de impedimento, falta perigosa, cartão e pênalti, e o novo painel \"Resumo\" com as estatísticas dos dois times e os lances com o minuto.", en: "Live match: notices for offside, dangerous fouls, cards and penalties, and the new \"Summary\" panel with both teams' stats and the key moments with the minute." },
      { pt: "Cartões, faltas e impedimentos também na tela de resultado.", en: "Cards, fouls and offsides on the result screen too." },
      { pt: "Estatísticas: ranking geral com todas as ligas e seletor agrupado por continente e país.", en: "Stats: an all-leagues ranking and a selector grouped by continent and country." },
      { pt: "Testers podem enviar um report durante a partida.", en: "Testers can send a report during a match." },
      { pt: "Formação: reservas ordenados por linha, posição e nota.", en: "Formation: substitutes sorted by line, position and rating." },
    ],
  },
  {
    version: "2.6",
    date: "2026-10-02",
    items: [
      { pt: "Ranking de técnicos: títulos de liga, copa, continentais e acessos valem pontos, pesados pela força do país.", en: "Manager ranking: league, cup and continental titles and promotions earn points, weighted by the country's strength." },
      { pt: "Nova aba \"Técnicos\" em Estatísticas, com o mundo inteiro ou só o seu país, e os títulos de cada técnico.", en: "New \"Managers\" tab in Stats, for the whole world or just your country, with each manager's titles." },
      { pt: "Sua posição no ranking aparece no painel do clube.", en: "Your ranking position shows on the club dashboard." },
    ],
  },
  {
    version: "2.5",
    date: "2026-10-02",
    items: [
      { pt: "Ficha do jogador com a carreira: temporada a temporada, clube, jogos, gols, assistências, nota e títulos.", en: "Player profile shows the career: season by season, club, games, goals, assists, rating and titles." },
      { pt: "Quem troca de clube no meio da temporada guarda a passagem pelo clube anterior.", en: "Players who move mid-season keep their spell at the previous club." },
      { pt: "Nova aba \"Aposentados\" em Estatísticas, com a carreira de cada jogador que pendurou as chuteiras.", en: "New \"Retired\" tab in Stats, with the career of every player who hung up his boots." },
    ],
  },
  {
    version: "2.4.1",
    date: "2026-10-01",
    items: [
      { pt: "Correções na partida ao vivo.", en: "Live match fixes." },
    ],
    fixes: [
      { pt: "A partida não trava mais com a bola parada sozinha no campo.", en: "Matches no longer freeze with the ball sitting alone on the pitch." },
      { pt: "Jogadores não conduzem mais colados na linha lateral nem pela linha de fundo ao lado da trave.", en: "Players no longer carry hugging the touchline or along the goal line next to the post." },
      { pt: "A mensagem \"Carregando o resultado da partida\" aparece no fim do jogo.", en: "The \"Loading match result\" message shows at full time." },
    ],
  },
  {
    version: "2.4",
    date: "2026-10-01",
    items: [
      { pt: "Jogadores de 34 anos ou mais podem se aposentar no fim da temporada, em todos os clubes e também entre os sem clube. Quem passa dos 40 sempre pendura as chuteiras.", en: "Players aged 34 or older can retire at the end of the season, at every club and among free agents too. Anyone past 40 always hangs up the boots." },
      { pt: "Quando alguém do seu elenco se aposenta, você recebe uma mensagem com os jogos e gols da última temporada.", en: "When someone from your squad retires, you get a message with last season's games and goals." },
      { pt: "Se uma lenda do seu clube se aposentar (entre os 50 melhores do mundo), você pode aceitar que ela renasça na base, aos 17 anos, com o mesmo estilo de jogo.", en: "If a legend of your club retires (among the world's 50 best), you can let them be reborn in the academy at 17, with the same style of play." },
      { pt: "O craque renascido evolui mais rápido até os 23 anos e ganha uma estrela própria no elenco e na base.", en: "The reborn star develops faster until 23 and gets a star of their own in the squad and academy." },
    ],
  },
  {
    version: "2.3",
    date: "2026-10-01",
    items: [
      { pt: "Nova aba Base no elenco: todo fim de temporada chegam de 3 a 5 jovens de 16 e 17 anos, e você escolhe quem promover ao time principal ou dispensar.", en: "New Academy tab on the squad screen: every season end brings 3 to 5 youngsters aged 16 and 17, and you choose who to promote to the first team or release." },
      { pt: "A lista mostra a posição, a idade, o nível atual e uma faixa de potencial. Quem chega aos 19 anos sem ser promovido deixa a base.", en: "The list shows position, age, current level and a potential range. Anyone who turns 19 without a promotion leaves the academy." },
      { pt: "Um bom auxiliar técnico melhora o nível dos jovens que chegam, e uma promessa rara aparece de vez em quando.", en: "A good assistant coach raises the level of incoming youngsters, and a rare prospect shows up now and then." },
      { pt: "Os clubes rivais também renovam seus elencos com a própria base.", en: "Rival clubs also refresh their squads with their own academy players." },
    ],
    fixes: [
      { pt: "Notas altas demais para atacantes em jogos de ligas que você não acompanha.", en: "Too many very high ratings for forwards in leagues you do not follow." },
    ],
  },
  {
    version: "2.2",
    date: "2026-10-01",
    items: [
      { pt: "Nova tela Equipe técnica: auxiliar técnico, preparador físico e olheiro-chefe, cada um com nota de 1 a 10.", en: "New Technical staff screen: assistant coach, fitness coach and chief scout, each rated 1 to 10." },
      { pt: "O auxiliar técnico acelera (ou atrasa) a evolução dos jogadores.", en: "The assistant coach speeds up (or slows down) player development." },
      { pt: "O preparador físico melhora a recuperação do elenco e reduz o risco de lesão.", en: "The fitness coach improves squad recovery and lowers injury risk." },
      { pt: "O olheiro-chefe define quão exatos são os atributos que você vê de jogadores de outros clubes: com um olheiro fraco, o overall aparece como uma faixa.", en: "The chief scout sets how accurate the attributes of other clubs' players look: with a weak scout, the overall shows as a range." },
      { pt: "Todo começo de semana há cinco candidatos por função no mercado de profissionais. Os salários da equipe entram no extrato.", en: "Every week there are five candidates per role on the staff market. Staff wages appear in the ledger." },
    ],
  },
  {
    version: "2.1.1",
    date: "2026-10-01",
    items: [
      { pt: "O estilo Posse volta a criar chances de gol como os outros estilos.", en: "The Possession style creates chances again, like the other styles." },
      { pt: "Jogadores não correm mais pela linha de fundo em direção ao gol: preferem driblar para dentro ou passar.", en: "Players no longer run along the goal line toward goal: they cut inside or pass instead." },
      { pt: "Jogadores maiores e mais fáceis de ver durante a partida.", en: "Bigger, easier-to-see players during matches." },
      { pt: "Os painéis da partida mostram o nome dos clubes, e o placar fica legível mesmo com uniformes escuros.", en: "Match panels show the club names, and the score is readable even with dark kits." },
      { pt: "Ao fim do jogo, a tela de espera agora diz que está carregando o resultado da partida.", en: "After the final whistle, the waiting screen now says it is loading the match result." },
    ],
  },
  {
    version: "2.1",
    date: "2026-10-01",
    items: [
      { pt: "Arraste jogadores na tela de formação para trocá-los, entre o campo e o banco.", en: "Drag players on the formation screen to swap them, between the pitch and the bench." },
      { pt: "Formação livre: edite o desenho do time arrastando as posições numa grade de zonas.", en: "Free formation: edit your team's shape by dragging positions on a zone grid." },
      { pt: "As quatro instruções (pressão, linha, largura e saída de bola) agora podem ser ajustadas uma a uma.", en: "The four instructions (pressing, line, width and build-up) can now be adjusted one by one." },
    ],
  },
  {
    version: "2.0",
    date: "2026-10-01",
    items: [
      {
        pt: "Posições detalhadas: cada jogador tem uma posição natural (zagueiro, lateral, volante, ponta...), mostrada no elenco com cor própria.",
        en: "Detailed positions: every player now has a natural position (centre-back, full-back, defensive midfielder, winger...), shown in the squad with its own colour.",
      },
      {
        pt: "Na ficha do jogador, um campinho mostra onde ele joga bem, onde se adapta e onde precisa treinar.",
        en: "On the player page, a small pitch shows where he plays well, where he adapts and where he needs training.",
      },
      {
        pt: "Jogar fora da posição agora custa rendimento, e a tela de formação avisa quando um titular está mal encaixado.",
        en: "Playing out of position now costs performance, and the formation screen warns when a starter is a poor fit.",
      },
    ],
  },
  {
    version: "1.9.1",
    date: "2026-10-01",
    items: [
      { pt: "Novo jogo começa pela criação do técnico", en: "New game starts with creating your manager" },
    ],
    fixes: [
      { pt: "Fontes e visual uniformes em todas as telas", en: "Uniform fonts and look on every screen" },
      { pt: "Escudos e bandeiras maiores na escolha do clube", en: "Bigger crests and flags when choosing a club" },
    ],
  },
  {
    version: "1.9",
    date: "2026-10-01",
    items: [
      { pt: "Novo visual dentro do jogo", en: "New in-game look" },
      { pt: "Novo jogo em uma tela", en: "New game on a single screen" },
    ],
    fixes: [
      { pt: "Aviso de tela pequena só abaixo de 1024×600", en: "Small-screen notice only below 1024×600" },
    ],
  },
  {
    version: "1.8",
    date: "2026-10-01",
    items: [
      {
        pt: "Nova tela Stats: artilheiros, assistências, melhor nota e mais jogos de qualquer liga, copa ou competição continental, e os números do seu elenco.",
        en: "New Stats screen: top scorers, assists, best rating and most appearances for any league, cup or continental competition, plus your own squad's numbers.",
      },
      {
        pt: "Estrelas coloridas ao lado do nome: dourada para o top 25 do mundo, azul para quem está em grande fase e verde para os prodígios.",
        en: "Coloured stars next to names: gold for the world's top 25, blue for players in great form and green for prodigies.",
      },
    ],
    fixes: [
      {
        pt: "O extrato do clube e a mensagem de prêmio da liga agora aparecem no idioma escolhido.",
        en: "The club ledger and the league prize message now show in the chosen language.",
      },
    ],
  },
  {
    version: "1.7",
    date: "2026-09-30",
    items: [
      {
        pt: "Contratos: cada jogador tem salário fixo e data de fim, e você pode renovar na ficha do jogador",
        en: "Contracts: every player has a fixed wage and an end date, and you can renew from the player page",
      },
      {
        pt: "Jogadores livres: quem fica sem contrato aparece nos Olheiros e pode ser contratado sem taxa",
        en: "Free agents: players without a contract show up in Scout and can be signed with no fee",
      },
      {
        pt: "Ao comprar um jogador você negocia salário e anos de contrato",
        en: "When buying a player you now negotiate his wage and contract length",
      },
      {
        pt: "Os clubes da IA mantêm elencos completos de uma temporada para a outra",
        en: "AI clubs keep full squads from one season to the next",
      },
    ],
  },
  {
    version: "1.6",
    date: "2026-09-30",
    items: [
      {
        pt: "Rotação: a prévia da partida sugere poupar titulares cansados, e você aplica ou ignora",
        en: "Rotation: the match preview suggests resting tired starters, and you can apply or ignore it",
      },
      {
        pt: "Novo assistente nas táticas: escala o time por fôlego automaticamente",
        en: "New assistant in tactics: picks your lineup by fitness automatically",
      },
    ],
  },
  {
    version: "1.5.2",
    date: "2026-09-30",
    items: [
      {
        pt: "Novo visual da página inicial, do login e da tela inicial",
        en: "New look for the landing page, login and start screen",
      },
    ],
  },
  {
    version: "1.5.1",
    date: "2026-09-28",
    items: [
      {
        pt: "Escudos corrigidos (Figueirense, Athletic Club, entre outros)",
        en: "Fixed several club crests (Figueirense, Athletic Club, and others)",
      },
      {
        pt: "Excluir um jogo salvo agora pede confirmação",
        en: "Deleting a saved game now asks for confirmation",
      },
    ],
  },
  {
    version: "1.5",
    date: "2026-09-28",
    items: [
      {
        pt: "Lesões: jogadores podem se machucar em partidas e em treinos pesados, ficando fora por dias, semanas ou meses",
        en: "Injuries: players can get hurt in matches and heavy training, and sit out for days, weeks or months",
      },
      {
        pt: "Um jogador lesionado não entra em campo, e a prévia da partida avisa quando isso acontece na sua escalação",
        en: "An injured player can't be selected, and the match preview warns when this happens in your lineup",
      },
    ],
    fixes: [
      {
        pt: "Nível dos jogadores de ligas menores corrigido",
        en: "Fixed player levels in smaller leagues",
      },
      {
        pt: "Jovens promissores deixaram de nascer, por engano, como o melhor jogador do elenco",
        en: "Fixed promising youngsters mistakenly starting out as the best player in the squad",
      },
    ],
  },
  {
    version: "1.4.1",
    date: "2026-09-28",
    items: [
      {
        pt: "Report: anexe uma imagem (arquivo ou Ctrl+V)",
        en: "Report: attach an image (file or Ctrl+V)",
      },
    ],
    fixes: [
      {
        pt: "Etiquetas técnicas (run, mark, press…) escondidas na lista de jogadores da partida",
        en: "Technical labels (run, mark, press…) hidden in the match player list",
      },
      {
        pt: "Opção 'Ajuste' removida do report (igual a 'Melhoria')",
        en: "'Tweak' option removed from the report (same as 'Improvement')",
      },
    ],
  },
  {
    version: "1.4",
    date: "2026-09-28",
    items: [
      {
        pt: "Fôlego e carga: jogadores se cansam com jogos seguidos e recuperam nos dias de folga",
        en: "Stamina and load: players tire with back-to-back matches and recover on rest days",
      },
      {
        pt: "A IA poupa titulares cansados",
        en: "The AI rests tired starters",
      },
      {
        pt: "Aviso na prévia quando um titular está cansado",
        en: "Match preview warns when a starter is tired",
      },
    ],
    fixes: [
      {
        pt: "Placar invisível para times de camisa preta no resultado",
        en: "Score invisible for black-kit teams on the result screen",
      },
      {
        pt: "Telas de intervalo e fim de jogo em 4× demoravam demais (agora com barra de progresso)",
        en: "Half-time and full-time screens lingered at 4× (now with a progress bar)",
      },
    ],
  },
  {
    version: "1.3",
    date: "2026-09-27",
    items: [
      { pt: "Salários realistas", en: "Realistic wages" },
      {
        pt: "Extrato do clube com todas as entradas e saídas",
        en: "Club statement with every income and expense",
      },
      {
        pt: "Prêmios por posição na liga e por fase na copa e nas continentais",
        en: "Prize money for league position and for each cup and continental round",
      },
      {
        pt: "Bilheteria também em jogos de copa e continentais",
        en: "Gate revenue in cup and continental matches too",
      },
    ],
    fixes: [
      {
        pt: "Laterais e alas direitos e esquerdos invertidos na tela de táticas",
        en: "Left and right full-backs/wing-backs swapped on the tactics screen",
      },
    ],
  },
  {
    version: "1.2",
    date: "2026-09-27",
    items: [
      {
        pt: "Champions League, Europa League, Libertadores e Sul-Americana",
        en: "Champions League, Europa League, Copa Libertadores and Copa Sudamericana",
      },
      {
        pt: "Mata-mata em ida e volta com placar agregado",
        en: "Two-legged knockout ties with aggregate score",
      },
      {
        pt: "Resultados das outras ligas mais realistas",
        en: "More realistic results in the other leagues",
      },
    ],
  },
  {
    version: "1.1",
    date: "2026-09-26",
    items: [
      {
        pt: "Copa nacional em todos os países, com prorrogação e pênaltis",
        en: "A national cup in every country, with extra time and penalties",
      },
      {
        pt: "Aba Copa na tela de ligas",
        en: "Cup tab on the leagues screen",
      },
    ],
  },
  {
    version: "1.0",
    date: "2026-09-25",
    items: [
      {
        pt: "Mundo aberto: 60 países, 83 ligas e elencos 2026/27",
        en: "Open world: 60 countries, 83 leagues and 2026/27 squads",
      },
      { pt: "Acesso e rebaixamento", en: "Promotion and relegation" },
      {
        pt: "Mercado de transferências dos clubes da IA",
        en: "AI clubs' transfer market",
      },
      { pt: "Finanças do clube", en: "Club finances" },
    ],
  },
];

const [latest] = changelog;
if (!latest) {
  throw new Error("changelog: must contain at least one entry");
}

export const CURRENT_VERSION = latest.version;

/**
 * "Em breve" / "Coming soon": what the next stages bring, in player-facing words. Replaced at every
 * roadmap stage (items move to a changelog entry once shipped) — see .claude/rules/changelog.md.
 */
export const upcoming: ChangelogText[] = [
  { pt: "Ligas de ano civil (Brasil, Argentina, Escandinávia e outras) com os elencos e a composição de 2027", en: "Calendar-year leagues (Brazil, Argentina, Scandinavia and others) with 2027 squads and line-ups" },
  { pt: "Convites de clubes maiores para técnicos bem colocados no ranking", en: "Offers from bigger clubs for managers high in the ranking" },
  { pt: "Formações mais equilibradas entre si", en: "Formations more evenly balanced against each other" },
];
