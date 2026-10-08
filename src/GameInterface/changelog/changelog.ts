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
    version: "4.10",
    date: "2026-10-08",
    items: [
      { pt: "Cada olheiro conhece melhor alguns países: o dele, os vizinhos e os que visitou nas missões — e lá encontra mais e erra menos", en: "Each scout knows some countries better: his own, its neighbours and the ones he visited on missions — and there he finds more and errs less" },
      { pt: "Clique no olheiro para ver no mapa-múndi o que ele conhece de cada país", en: "Click a scout to see on the world map what he knows of each country" },
      { pt: "Ao criar uma missão, veja o quanto o olheiro conhece o destino e o ritmo dele lá", en: "When creating a mission, see how well the scout knows the destination and his pace there" },
      { pt: "A comissão técnica agora vem de todos os países do jogo, quase toda do país do clube", en: "Coaching staff now come from every country in the game, mostly from the club's own country" },
    ],
  },
  {
    version: "4.9",
    date: "2026-10-08",
    items: [
      { pt: "Na partida, um mapa de calor mostra onde a bola esteve com o seu time e com o adversário, nos últimos 10 minutos ou no jogo todo", en: "In the match, a heat map shows where the ball was with your team and with the opponent, in the last 10 minutes or the whole match" },
      { pt: "Mude o estilo tático e as instruções da equipe (pressão, linha, largura, construção) durante a partida, na aba Tática das substituições; a tática salva não muda", en: "Change the tactical style and team instructions (pressing, line, width, build-up) during the match, in the Tactics tab of substitutions; your saved tactics stay the same" },
    ],
  },
  {
    version: "4.8",
    date: "2026-10-08",
    items: [
      { pt: "Prêmios de fim de temporada em todas as ligas: melhor jogador, revelação, artilheiro, melhor goleiro, seleção, melhor técnico e gol da temporada", en: "End-of-season awards in every league: player, young player, top scorer, goalkeeper, team of the season, manager and goal of the season" },
      { pt: "Melhor jogador e melhor técnico do mundo, todo janeiro", en: "World player and manager of the year, every January" },
      { pt: "Premiados ficam mais valorizados e mais procurados por clubes grandes; aba Prêmios em Estatísticas e filtro no olheiro", en: "Award winners are worth more and wanted by bigger clubs; Awards tab in Stats and a scout filter" },
    ],
  },
  {
    version: "4.7.1",
    date: "2026-10-08",
    items: [
      { pt: "Painel com o rosto do técnico do mesmo tamanho do escudo; notas da partida em ordem de posição; ficha do jogador com os dados reorganizados, salário mensal em euro e data de fim do contrato; descrições dos atributos e a explicação da evolução agora em português", en: "Dashboard shows the manager's face at the same size as the crest; match ratings listed by position; player profile with reordered facts, monthly salary in euros and contract end date; attribute descriptions and the development explanation are now translated" },
    ],
  },
  {
    version: "4.7",
    date: "2026-10-08",
    items: [
      { pt: "Comissão técnica completa: preparador de goleiros, treinadores de área, médico, analista e jardineiro, com estrelas, atributos e contratos", en: "Full coaching staff: goalkeeping coach, area coaches, doctor, analyst and groundskeeper, with stars, attributes and contracts" },
      { pt: "Sete áreas de treino: o goleiro passa a evoluir reflexo e impulsão; força e fôlego também evoluem", en: "Seven training areas: goalkeepers now develop reflexes and jumping; strength and stamina develop too" },
      { pt: "Busque profissionais livres na aba Comissão de Transferências", en: "Find free staff in the Staff tab of Transfers" },
      { pt: "Rostos para a comissão técnica e para os técnicos do ranking; no novo jogo, monte o rosto do seu técnico (pele, cabelo, barba e óculos) ou sorteie outro", en: "Faces for the coaching staff and the managers in the ranking; in a new game, build your manager's face (skin, hair, beard and glasses) or shuffle for another" },
    ],
    fixes: [
      { pt: "Jogos à noite não aparecem mais com sol, e o painel, a prévia e o resultado mostram o mesmo horário e o mesmo clima", en: "Night matches no longer show sunshine, and the dashboard, preview and result share the same kickoff time and weather" },
    ],
  },
  {
    version: "4.6.1",
    date: "2026-10-08",
    items: [
      {
        pt: "Ficha do jogador: posição, pé, idade, nacionalidade, nascimento e altura agora aparecem em cartões lado a lado, mais fáceis de ler.",
        en: "Player profile: position, foot, age, nationality, date of birth and height now show as side-by-side cards, easier to read.",
      },
    ],
  },
  {
    version: "4.6",
    date: "2026-10-07",
    items: [
      { pt: "O diretor cuida das renovações e das conversas de contrato; você escolhe quem cuida disso na Equipe técnica", en: "The director handles renewals and contract talks; choose who handles them in the Staff screen" },
      { pt: "Escolha quais notícias chegam à caixa de entrada no botão Preferências", en: "Choose which news reaches your inbox with the Preferences button" },
      { pt: "Na partida, os jogadores aparecem com o nome de camisa", en: "In the match, players are shown with their shirt name" },
    ],
    fixes: [
      { pt: "Lista da Evolução em ordem de campo, com filtro por posição", en: "Development list in pitch order, with a position filter" },
      { pt: "Trocar o papel de um jogador no elenco não recarrega mais a ficha", en: "Changing a player's squad role no longer reloads the profile" },
    ],
  },
  {
    version: "4.5",
    date: "2026-10-07",
    items: [
      { pt: "Notas e posições de todos os jogadores revisadas com dados reais do mercado", en: "Every player's rating and position reviewed with real market data" },
      { pt: "Valor de mercado dos jogadores mais próximo do real", en: "Player market values closer to the real ones" },
      { pt: "Atributos de 0 a 100, com cores por faixa", en: "Attributes from 0 to 100, colour-coded by range" },
      { pt: "Data de nascimento, altura e nacionalidade na ficha do jogador", en: "Date of birth, height and nationality on the player profile" },
      { pt: "Os jogadores evoluem ponto a ponto", en: "Players now develop point by point" },
      { pt: "O resumo do treino mostra os atributos que mudaram", en: "The training summary shows which attributes changed" },
    ],
  },
  {
    version: "4.4.9",
    date: "2026-10-07",
    items: [
      { pt: "Últimos jogos em cores: vitória verde, empate amarelo e derrota vermelha", en: "Recent form in colours: green win, yellow draw, red loss" },
      { pt: "Escudos escuros, como o da Juventus, visíveis no fundo escuro", en: "Dark crests, like Juventus', readable on the dark background" },
    ],
  },
  {
    version: "4.4.8",
    date: "2026-10-07",
    items: [
      { pt: "Colunas do elenco e do olheiro alinhadas com os títulos", en: "Squad and scout columns line up with their headers" },
    ],
  },
  {
    version: "4.4.7",
    date: "2026-10-07",
    items: [
      { pt: "Indicações do olheiro-chefe com relatório e link para a ficha do jogador", en: "Chief scout picks come with a report and a link to the player" },
    ],
  },
  {
    version: "4.4.6",
    date: "2026-10-07",
    items: [
      { pt: "Escanteios, faltas e laterais: os jogadores andam até a posição em vez de pular", en: "Corners, free kicks and throw-ins: players walk into position instead of jumping" },
    ],
  },
  {
    version: "4.4.5",
    date: "2026-10-07",
    items: [
      { pt: "Jogando fora de casa, o time da casa aparece à esquerda, como na TV", en: "When playing away, the home side is shown on the left, like on TV" },
    ],
    fixes: [
      { pt: "Botões técnicos removidos da tela da partida", en: "Technical buttons removed from the match screen" },
    ],
  },
  {
    version: "4.4.4",
    date: "2026-10-07",
    items: [
      { pt: "Carreira do jogador com cartões, lesões e dias fora por temporada", en: "Player career with cards, injuries and days out per season" },
    ],
  },
  {
    version: "4.4.3",
    date: "2026-10-07",
    items: [
      { pt: "Seletor de idioma (EN / PT) na tela inicial e na barra inferior", en: "Language switch (EN / PT) on the start screen and the bottom bar" },
    ],
    fixes: [
      { pt: "Abas de todas as telas no mesmo estilo", en: "Tabs look the same on every screen" },
      { pt: "Lista de jogadores ao lado do campo da partida mais legível", en: "Easier-to-read player list beside the match pitch" },
      { pt: "Colunas do elenco e do olheiro alinhadas com os títulos", en: "Squad and scout columns line up with their headers" },
    ],
  },
  {
    version: "4.4.2",
    date: "2026-10-07",
    items: [
      { pt: "Jogadores e nomes menores no campo da partida", en: "Smaller players and names on the match pitch" },
      { pt: "Nome da competição na tela da partida", en: "Competition name on the match screen" },
      { pt: "Bandeira da nacionalidade de cada jogador no elenco", en: "Each player's nationality flag in the squad" },
      { pt: "Filtros por tema na caixa de entrada", en: "Topic filters in the inbox" },
      { pt: "Salve até 3 escalações na tela de Formação e troque entre elas", en: "Save up to 3 lineups on the Formation screen and switch between them" },
      { pt: "Aba Profundidade no elenco: veja quem joga em cada posição e onde falta gente", en: "Depth tab in the squad: see who plays each position and where you are short" },
      { pt: "Defina o preço pedido ao colocar um jogador à venda", en: "Set an asking price when you list a player for sale" },
    ],
    fixes: [
      { pt: "Notas e posições do elenco do São Paulo corrigidas", en: "São Paulo squad ratings and positions corrected" },
    ],
  },
  {
    version: "4.4.1",
    date: "2026-10-06",
    items: [
      { pt: "Bola nova no campo da partida", en: "New ball on the match pitch" },
    ],
    fixes: [
      { pt: "Partida ao vivo mais suave, sem trancos nas velocidades 2× e 4×", en: "Smoother live match, no stutter at 2× and 4× speed" },
    ],
  },
  {
    version: "4.4",
    date: "2026-10-06",
    items: [
      { pt: "Campo da partida renovado: gramado listrado, sombras e bola de verdade que sobe nos cruzamentos", en: "Refreshed match pitch: striped grass, shadows and a real ball that rises on crosses" },
      { pt: "Cada jogador mostra o fôlego, o cartão amarelo e quem está com a bola", en: "Every player shows stamina, yellow cards and who has the ball" },
      { pt: "Lances marcados no gramado: chutes, defesas, gols, faltas, cartões e impedimentos", en: "Plays marked on the pitch: shots, saves, goals, fouls, cards and offsides" },
    ],
  },
  {
    version: "4.3.1",
    date: "2026-10-06",
    items: [
      { pt: "Olheiros: a busca ordena e filtra pelo que você vê de cada jogador (o meio da faixa), e o salário de quem você conhece pouco aparece em faixa, como o valor.", en: "Scouting: the search sorts and filters by what you see of each player (the middle of the range), and the wage of little-known players shows as a range, like the value." },
    ],
    fixes: [
      { pt: "Trocar de aba na Central de Olheiros ficou instantâneo: a busca não é refeita ao voltar.", en: "Switching tabs in the Scouting centre is now instant: the search is not redone when you come back." },
    ],
  },
  {
    version: "4.3",
    date: "2026-10-06",
    items: [
      { pt: "Central de Olheiros: o que você sabe de cada jogador de fora agora depende de quanto ele foi observado. Desconhecidos aparecem com faixas largas e atributos ocultos; quanto mais observado, mais exato.", en: "Scouting centre: what you know about each outside player now depends on how much he has been watched. Unknown players show wide ranges and hidden attributes; the more he is watched, the more exact he gets." },
      { pt: "Missões de observação: mande o olheiro-chefe e até 4 olheiros de campo para um país, uma liga, um continente, um jogador ou os jovens de um país, com foco por posição e idade. As viagens aparecem nas Finanças.", en: "Scouting missions: send your chief scout and up to 4 field scouts to a country, a league, a continent, a player or a country's youth, with a focus on position and age. Travel costs show up in Finances." },
      { pt: "Relatórios com nota de A a E, joias escondidas pelo mundo e as indicações do olheiro-chefe todo mês.", en: "Reports graded A to E, hidden gems around the world and your chief scout's picks every month." },
      { pt: "Lista de observação: marque até 50 jogadores com a estrela e receba avisos quando ficarem à venda, com contrato acabando, livres ou mudarem de clube.", en: "Shortlist: star up to 50 players and get told when they go on sale, near the end of their contract, become free agents or move clubs." },
      { pt: "Jovens sem clube encontrados nas missões podem entrar direto na sua base, pagando uma compensação de formação.", en: "Club-less youngsters found on missions can join your academy straight away for a training compensation." },
    ],
  },
  {
    version: "4.2",
    date: "2026-10-06",
    items: [
      { pt: "Personalidade dos jogadores: todo jogador tem ambição, lealdade, profissionalismo e temperamento, mostrados em faixas na ficha (com um resumo ao lado do nome). De outros clubes, o que você vê depende do seu olheiro-chefe.", en: "Player personality: every player has ambition, loyalty, professionalism and temperament, shown as bands on the player screen (with a summary next to the name). For other clubs, what you see depends on your chief scout." },
      { pt: "O profissional evolui um pouco mais rápido e segura a forma por mais tempo; o desleixado, o contrário.", en: "Professionals develop a little faster and keep their level longer; sloppy players the opposite." },
      { pt: "Cabeças quentes fazem mais faltas e levam mais cartões; os calmos, menos.", en: "Hot-heads commit more fouls and pick up more cards; calm players fewer." },
      { pt: "A moral reage à personalidade: o pavio curto reage mais forte, o ambicioso cobra minutos e um clube maior, o leal perdoa promessas quebradas mas sente mais ser posto à venda.", en: "Morale follows personality: short fuses react more strongly, ambitious players want minutes and a bigger club, loyal ones forgive broken promises but hate being put up for sale." },
      { pt: "Salários e transferências: o ambicioso pede mais e pode recusar um clube bem menor, o leal aceita menos para renovar com o clube de tantos anos e para jogar no país dele; a renovação e a contratação explicam o pedido.", en: "Wages and transfers: ambitious players ask for more and may refuse a much smaller club, loyal ones accept less to renew with their long-time club or to play in their own country; renewals and signings explain the demand." },
    ],
  },
  {
    version: "4.1.2",
    date: "2026-10-06",
    items: [
      { pt: "Substituições ao vivo: arraste o reserva sobre o titular (ou o titular sobre o reserva) para fazer a troca.", en: "Live substitutions: drag a substitute onto a starter (or a starter onto a substitute) to make the change." },
    ],
  },
  {
    version: "4.1.1",
    date: "2026-10-06",
    items: [
      { pt: "Na Formação, clicar em outro jogador já mostra as instruções dele. Para trocar dois jogadores de lugar, arraste um sobre o outro.", en: "On the Formation screen, clicking another player now shows his instructions straight away. To swap two players, drag one onto the other." },
    ],
  },
  {
    version: "4.1",
    date: "2026-10-05",
    items: [
      { pt: "Instruções individuais: escolha a função de cada posição na tela de táticas (lateral que apoia, fica ou é invertido, zagueiro que sai na marcação, na sobra ou com bola, volante fixo ou que chega, meia de ligação, meia que chega na área, meia armador, segundo atacante, meia por dentro, ponta por dentro, centroavante de área ou pivô) e quanto cada jogador pressiona.", en: "Player instructions: pick each position's role on the tactics screen (overlapping, holding or inverted full-back, stopper, cover or ball-playing centre-back, anchor or box-to-box midfielder, link midfielder, box crasher, playmaker, shadow striker, inside midfielder, inside forward, poacher or target man) and how much each player presses." },
      { pt: "Marcação individual: na prévia da partida (ou ao vivo), escolha até 2 jogadores para seguir um adversário, com um botão para marcar o melhor jogador deles.", en: "Man-marking: in the match preview (or live), pick up to 2 players to follow an opponent, with a button to mark their best player." },
      { pt: "Durante a partida, a nova aba Instruções do painel de substituições muda funções, pressão e marcação só para aquele jogo.", en: "During a match, the new Instructions tab in the substitutions panel changes roles, pressing and marking for that match only." },
    ],
  },
  {
    version: "4.0.4",
    date: "2026-10-05",
    items: [
      { pt: "Ainda mais rostos parecidos com os jogadores reais: cerca de 2.400 nas principais ligas, agora com MLS, Portugal e Eredivisie mais completas.", en: "Even more faces that look like the real players: about 2,400 across the main leagues, with MLS, Portugal and the Eredivisie now more complete." },
    ],
  },
  {
    version: "4.0.3",
    date: "2026-10-05",
    items: [
      { pt: "Mais rostos parecidos com os jogadores reais: agora são cerca de 1.750 nas principais ligas, incluindo quase todos os 300 melhores do mundo.", en: "More faces that look like the real players: about 1,750 across the main leagues now, including almost all of the world's top 300." },
    ],
  },
  {
    version: "4.0.2",
    date: "2026-10-05",
    items: [
      { pt: "A bola dos gols ganhou um desenho novo, em traços com os gomos da bola de verdade.", en: "The goal football has a new look, drawn in lines with the panels of a real ball." },
    ],
  },
  {
    version: "4.0.1",
    date: "2026-10-05",
    items: [
      { pt: "Rostos mais parecidos com os jogadores de verdade: mais de mil craques das principais ligas (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Brasileirão, Portugal, Eredivisie, Argentina e MLS) agora têm o tom de pele, o cabelo e a barba próximos do real.", en: "Faces that look more like the real players: over a thousand players from the main leagues (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Brasileirão, Portugal, Eredivisie, Argentina and MLS) now have skin tone, hair and beard close to the real thing." },
    ],
  },
  {
    version: "4.0",
    date: "2026-10-05",
    items: [
      { pt: "Janelas de transferência: cada país tem uma janela na pré-temporada e outra no meio da temporada. Compras e empréstimos só com a janela aberta; jogadores livres podem ser contratados a qualquer momento. A tela de Transferências mostra a janela do seu país e uma aba com as janelas de todos.", en: "Transfer windows: every country has a pre-season window and a mid-season one. Purchases and loans only while the window is open; free agents can be signed at any time. The Transfers screen shows your country's window and a tab with every country's windows." },
      { pt: "Pré-contrato: um jogador com contrato acabando nos próximos seis meses pode assinar com você sem taxa, mesmo com a janela fechada. Ele chega no fim da temporada dele.", en: "Pre-contracts: a player whose contract ends in the next six months can sign with you for free, even with the window closed. He joins at the end of his season." },
      { pt: "Concorrência: outros clubes podem entrar na disputa pelo jogador que você negocia. O clube vendedor pede pelo menos o que o rival ofereceu, e o jogador escolhe entre os clubes pelo salário, pelo tamanho do clube e pela chance de jogar. Se você não cobrir a oferta no prazo, ele vai para o rival.", en: "Competition: other clubs can join the race for the player you are negotiating. The selling club asks for at least what the rival offered, and the player chooses between the clubs by the wage, the size of the club and the chance to play. If you do not match the offer in time, he joins the rival." },
      { pt: "Técnicos da IA agora são demitidos por maus resultados e substituídos por técnicos sem clube. Todo técnico tem a sua carreira no ranking, com o motivo de cada saída, e há um filtro de técnicos livres.", en: "AI managers are now sacked after bad results and replaced by managers without a club. Every manager shows his career in the ranking, with the reason he left each club, and there is a filter for free managers." },
      { pt: "Seu contrato de técnico: salário semanal no extrato, duração e renovação oferecida pela diretoria. Sem renovação, o contrato acaba e você fica livre para outras propostas; demitido, você recebe uma multa. Trocar de clube no meio do contrato custa uma compensação ao clube novo.", en: "Your manager's contract: a weekly wage in the ledger, a length and a renewal offered by the board. Without a renewal the contract ends and you are free for other offers; sacked, you get a payoff. Leaving mid-contract costs your new club a compensation." },
      { pt: "Ao trocar de clube, o seu antigo clube contrata um técnico novo, como qualquer clube da liga, e você recebe as notícias de demissões e contratações de técnicos da sua liga.", en: "When you change club, your old club hires a new manager like any other club, and you get the news of manager sackings and hirings in your league." },
    ],
  },
  {
    version: "3.9.5",
    date: "2026-10-05",
    items: [
      { pt: "A bola de futebol dos gols ganhou um contorno branco e não se mistura mais com o fundo escuro.", en: "The goal football now has a white rim and no longer blends into the dark background." },
    ],
  },
  {
    version: "3.9.4",
    date: "2026-10-05",
    items: [
      { pt: "Os gols agora aparecem com uma bola de futebol de verdade no resultado e na partida, no lugar do ícone laranja.", en: "Goals now show a real football in the result and the match, instead of the orange icon." },
    ],
  },
  {
    version: "3.9.3",
    date: "2026-10-05",
    items: [
      { pt: "O cartão amarelo agora é amarelo de verdade na partida, no resumo e no resultado.", en: "The yellow card is now a real yellow in the match, the summary and the result." },
    ],
    fixes: [
      { pt: "Ordenar pelo salário no elenco e no olheiro agora segue o valor, do mais caro ao mais barato e ao contrário.", en: "Sorting by salary in the squad and scout lists now follows the amount, highest to lowest and back." },
    ],
  },
  {
    version: "3.9.2",
    date: "2026-10-05",
    items: [
      { pt: "O elenco do seu clube agora vai até 36 jogadores, para você poder contratar logo no começo sem precisar vender antes.", en: "Your club's squad now holds up to 36 players, so you can sign players right from the start without selling first." },
    ],
  },
  {
    version: "3.9.1",
    date: "2026-10-05",
    items: [
      { pt: "Na Formação, arraste um jogador sobre outro para trocá-los, ou um reserva até o campo. Para substituir um titular, arraste-o e pare sobre a aba Reservas.", en: "On the Formation screen, drag a player onto another to swap them, or a substitute onto the pitch. To take a starter off, drag him and hold over the Bench tab." },
    ],
    fixes: [
      { pt: "As estrelas dos craques agora aparecem também na lista do elenco e nos destaques do Painel, iguais às da ficha do jogador.", en: "Star players now show their star in the squad list and the Dashboard highlights too, the same as on the player profile." },
      { pt: "Ordenar o elenco pela posição agrupa goleiros, defensores, meias e atacantes, e cada posição dentro deles.", en: "Sorting the squad by position now groups goalkeepers, defenders, midfielders and forwards, and each position within them." },
    ],
  },
  {
    version: "3.9",
    date: "2026-10-05",
    items: [
      { pt: "Instalações: nova aba em Finanças com o seu estádio visto de cima. Clique num setor para ampliá-lo (de 1 a 10 mil lugares), veja o custo, o prazo e a nova capacidade e peça a obra à diretoria.", en: "Facilities: a new tab in Finances with your stadium seen from above. Click a stand to expand it (1,000 to 10,000 seats), see the cost, the duration and the new capacity, and ask the board for the works." },
      { pt: "O público agora depende da procura: seguidores, divisão, humor da torcida e a fase da temporada. Um gráfico mostra o público de cada jogo em casa contra a capacidade e a demanda, e o conforto do estádio deixa o ingresso mais caro.", en: "The crowd now depends on demand: followers, division, the fans' mood and the stage of the season. A chart shows the crowd of every home game against the capacity and the demand, and stadium comfort raises the ticket price." },
      { pt: "Centro de treinamento e base em cinco níveis: o CT melhora a recuperação, reduz lesões no treino e acelera a evolução; a base traz safras melhores, maiores e com mais chance de promessa.", en: "Training ground and academy in five levels: the training ground improves recovery, cuts training injuries and speeds up development; the academy brings better, bigger intakes with more wonderkids." },
      { pt: "A diretoria decide cada obra pela confiança e pelo saldo, e quando está muito satisfeita paga parte do custo. As obras são pagas em parcelas mensais; o Painel mostra as obras em andamento e a prévia da partida mostra o público esperado.", en: "The board decides every project from its confidence and the balance, and pays part of the cost when it is very happy. Works are paid in monthly instalments; the Dashboard shows the works in progress and the match preview the expected crowd." },
    ],
  },
  {
    version: "3.8",
    date: "2026-10-05",
    items: [
      { pt: "Moral dos jogadores: cada jogador do seu elenco tem moral e um papel (craque, titular, rodízio, reserva ou promessa). Jogar menos do que espera, perder e ser posto à venda sem pedir derrubam a moral; vencer, marcar e jogar bem levantam.", en: "Player morale: every player in your squad has a morale and a role (key player, starter, rotation, backup or prospect). Playing less than he expects, losing and being listed without asking bring it down; winning, scoring and playing well lift it." },
      { pt: "A moral conta em campo, no desenvolvimento e no contrato: um jogador feliz rende um pouco mais e evolui mais rápido; um insatisfeito pede salário maior, e um revoltado pede para sair.", en: "Morale counts on the pitch, in development and in contracts: a happy player performs a little better and improves faster; an unhappy one asks for a higher wage, and a furious one asks to leave." },
      { pt: "Conversas: os jogadores pedem para conversar pela caixa de entrada (minutos, contrato, proposta de outro clube, chance no time). Prometa minutos, uma saída ou a renovação, elogie ou recuse. O jogo cobra as promessas.", en: "Talks: players ask to talk through your inbox (minutes, contract, another club's bid, a chance in the team). Promise minutes, a move or a renewal, praise or refuse. The game holds you to your promises." },
      { pt: "Coluna Moral e filtro de insatisfeitos no elenco, moral com a tendência da semana e papel editável na ficha do jogador, e os pedidos de conversa e promessas no cartão Atenção do painel.", en: "Morale column and an unhappy filter in the squad, morale with the weekly trend and an editable role on the player screen, and talk requests and promises in the dashboard's Attention card." },
    ],
  },
  {
    version: "3.7",
    date: "2026-10-05",
    items: [
      { pt: "Negociação: o clube vendedor pode fazer uma contraproposta. Você tem 3 rodadas por dia por jogador, e uma oferta muito baixa encerra a conversa por duas semanas.", en: "Negotiation: the selling club can make a counter-offer. You get 3 rounds a day per player, and a very low offer ends the talks for two weeks." },
      { pt: "Cláusula de venda futura: ofereça 10%, 20% ou 30% de uma venda futura para pagar menos agora, ou peça a cláusula quando vender. Ela é paga na próxima venda do jogador.", en: "Sell-on clause: offer 10%, 20% or 30% of a future sale to pay less now, or ask for one when you sell. It is paid on the player's next sale." },
      { pt: "Os jogadores que você coloca à venda não são mais vendidos sozinhos: os clubes mandam propostas para a caixa de entrada e você aceita, recusa ou contrapropõe.", en: "Players you list for sale are no longer sold on their own: clubs send proposals to your inbox and you accept, refuse or counter." },
      { pt: "Empréstimos: peça jogadores emprestados pagando parte do salário, ou coloque os seus para empréstimo. Eles voltam sozinhos no fim do prazo, e o elenco mostra quem está emprestado.", en: "Loans: borrow players paying part of their wage, or offer yours on loan. They come back on their own when the loan ends, and the squad shows who is on loan." },
    ],
  },
  {
    version: "3.6",
    date: "2026-10-04",
    items: [
      { pt: "História do clube: aba \"História\" no elenco de qualquer clube, com títulos, temporadas, artilheiros, jogadores com mais jogos e recordes desde o começo da carreira.", en: "Club history: a \"History\" tab in any club's squad screen, with titles, seasons, top scorers, most appearances and records since the career began." },
      { pt: "Recordes do clube: maior vitória e derrota, mais gols numa temporada, melhor posição, maior invencibilidade, contratação e venda recordes. A caixa de entrada avisa quando um recorde do seu clube cai.", en: "Club records: biggest win and defeat, most goals in a season, highest finish, longest unbeaten run, record signing and sale. Your inbox tells you when one of your club's records falls." },
    ],
  },
  {
    version: "3.5",
    date: "2026-10-04",
    items: [
      { pt: "Convites de clubes: com boa reputação (ranking, diretoria, títulos), outros clubes fazem propostas no fim da temporada e, para quem vai muito bem, no meio dela.", en: "Job offers: with a good reputation (ranking, board, titles), other clubs make you offers at the end of the season and, if you are doing very well, halfway through it." },
      { pt: "Aceite uma proposta e assuma o novo clube sem começar outro jogo: elenco, orçamento, equipe técnica e diretoria do clube novo.", en: "Accept an offer and take over the new club without starting a new game: its squad, budget, staff and board." },
      { pt: "Demitido não é mais o fim: você fica sem clube, continua avançando os dias e recebe propostas de clubes menores a cada duas semanas.", en: "Being sacked is no longer the end: you stay without a club, keep advancing the days and get offers from smaller clubs every two weeks." },
      { pt: "Sua reputação aparece no Painel, e o ranking de técnicos mostra os clubes por onde você passou.", en: "Your reputation shows on the dashboard, and the manager ranking lists the clubs you have managed." },
    ],
  },
  {
    version: "3.4.7",
    date: "2026-10-04",
    items: [
      { pt: "A barra superior mostra os nomes das abas de novo logo que o jogo abre (às vezes ficava só com os ícones).", en: "The top bar shows the tab names again as soon as the game opens (it sometimes stayed icons only)." },
    ],
    fixes: [
      { pt: "Nome do Vasco da Gama corrigido (novos jogos).", en: "Vasco da Gama's name fixed (new games)." },
    ],
  },
  {
    version: "3.4.6",
    date: "2026-10-04",
    items: [
      { pt: "Na partida ao vivo, os cartões dos dois lados ficam colados no campo, sem espaço vazio entre eles.", en: "In the live match, the side cards sit right next to the pitch, with no empty gap." },
    ],
  },
  {
    version: "3.4.5",
    date: "2026-10-04",
    items: [
      { pt: "Resumo da partida ao vivo com números e textos maiores, no mesmo tamanho da lista de jogadores.", en: "Live match Summary with bigger numbers and labels, the same size as the player list." },
    ],
  },
  {
    version: "3.4.4",
    date: "2026-10-04",
    items: [
      { pt: "Na partida ao vivo, o Resumo tem a mesma largura e o mesmo visual do cartão do time do outro lado.", en: "In the live match, the Summary has the same width and look as the team card on the other side." },
    ],
  },
  {
    version: "3.4.3",
    date: "2026-10-04",
    items: [
      { pt: "Na partida ao vivo, quem foi substituído ou se lesionou continua no fim da lista, com seus gols, assistências e cartões.", en: "In the live match, substituted and injured players stay at the end of the list, with their goals, assists and cards." },
    ],
  },
  {
    version: "3.4.2",
    date: "2026-10-04",
    items: [
      {
        pt: "O jogo carrega mais rápido: cada tela baixa bem menos coisa ao abrir.",
        en: "The game loads faster: every screen downloads far less when it opens.",
      },
    ],
    fixes: [
      {
        pt: "Todos os valores aparecem em euros, inclusive nas transferências e nas propostas por jogadores.",
        en: "Every amount is shown in euros, including transfers and player offers.",
      },
      {
        pt: "Saldo negativo escrito do jeito certo (−€1.2M) na barra inferior e nas finanças.",
        en: "Negative balances are written the right way (−€1.2M) in the bottom bar and in finances.",
      },
      {
        pt: "Na partida ao vivo, a escalação mostra gols, assistências e cartões de cada jogador, e as cores de times de uniforme escuro (como o preto do Botafogo) aparecem direito.",
        en: "In the live match, the lineup shows each player's goals, assists and cards, and teams with dark kits (like Botafogo's black) show their colour properly.",
      },
    ],
  },
  {
    version: "3.4.1",
    date: "2026-10-04",
    items: [
      {
        pt: "Resultados das outras ligas mais fiéis ao jogo de verdade: gols, cartões, escanteios e lesões em volume parecido com o das partidas que você assiste.",
        en: "Results in the other leagues are closer to the real matches: goals, cards, corners and injuries in volumes similar to the matches you watch.",
      },
    ],
  },
  {
    version: "3.4",
    date: "2026-10-03",
    items: [
      {
        pt: "Formações mais equilibradas: nenhuma vence as outras só pelo desenho, e o 4-3-3 deixou de ser a mais fraca.",
        en: "More evenly balanced formations: none beats the others on shape alone, and the 4-3-3 is no longer the weakest.",
      },
      {
        pt: "Os times se deslocam juntos para o lado da bola ao defender, e os atacantes de lado fecham na área quando o ataque chega.",
        en: "Teams shift together toward the ball when defending, and wide forwards close in on the box when the attack arrives.",
      },
      {
        pt: "A largura da equipe volta a valer no ataque: fechada aproxima os jogadores do meio, aberta espalha até as pontas.",
        en: "Team width counts in attack again: narrow brings players into the middle, wide spreads them to the flanks.",
      },
      {
        pt: "Os adversários usam mais formações (três zagueiros, dois atacantes) conforme o elenco que têm.",
        en: "Opponents use more formations (back three, two strikers) to suit the squad they have.",
      },
    ],
  },
  {
    version: "3.3.7",
    date: "2026-10-03",
    items: [
      { pt: "O card do próximo jogo mostra o estádio e a capacidade, o horário e o tempo previsto para a partida.", en: "The next match card shows the stadium and its capacity, the kick-off time and the weather forecast." },
    ],
    fixes: [
      { pt: "Os títulos das telas seguem o mesmo padrão, com a palavra principal em destaque azul.", en: "Screen titles follow the same style, with the key word highlighted in blue." },
      { pt: "Equipe técnica: nomes do mercado em negrito como no resto do jogo e o botão Demitir alinhado ao card.", en: "Staff: market names in bold like the rest of the game, and the Dismiss button lined up with the card." },
      { pt: "O card do próximo jogo fica centralizado, sem o espaço vazio acima dos últimos resultados.", en: "The next match card is centred, without the empty gap above the last results." },
    ],
  },
  {
    version: "3.3.6",
    date: "2026-10-03",
    items: [
      { pt: "Passar o mouse num país da lista destaca o país no mapa, e passar o mouse no mapa destaca o país na lista.", en: "Hovering a country in the list highlights it on the map, and hovering the map highlights the country in the list." },
    ],
    fixes: [
      { pt: "O card do novo jogo mantém o mesmo tamanho ao escolher o país.", en: "The new game card keeps the same size when you pick a country." },
    ],
  },
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
  { pt: "Instalações vivas: desgaste, reformas, academia, piscina, fisioterapia e gramado, que pesam na contratação", en: "Living facilities: wear, refurbishments, gym, pool, physio and pitch, which weigh on signings" },
  { pt: "Torneios sub-21 e sub-19 para dar jogos aos jovens e reservas", en: "Under-21 and under-19 tournaments to give games to youngsters and reserves" },
  { pt: "Inscrição de jogadores por competição, com limite de estrangeiros e de formados no clube", en: "Player registration per competition, with foreign and homegrown limits" },
  { pt: "Partida com árbitros, técnicos à beira do campo e estádio com torcida", en: "Matches with referees, managers on the touchline and a stadium full of fans" },
  { pt: "VAR e reclamação do técnico com o árbitro", en: "VAR and arguing with the referee" },
  { pt: "Conquistas com recompensas para o seu perfil e o seu técnico", en: "Achievements with rewards for your profile and your manager" },
];
