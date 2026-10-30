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
    version: "4.41.12",
    date: "2026-10-29",
    items: [
      {
        pt: "Partida com o resto da arte nova: bola girando, traves e rede, arquibancada, túnel na cor do clube, torres de iluminação, bancos com cobertura, placas de LED com moldura, fogos, fumaça e flashes dos fotógrafos.",
        en: "The match with the rest of the new art: a spinning ball, posts and net, the stands, a tunnel in the club colours, floodlight towers, covered benches, framed LED boards, fireworks, smoke and the photographers' flashes.",
      },
      {
        pt: "Gramado com neve nos jogos de neve (com bola laranja) e neblina em parte dos jogos nublados e frios. A neblina é só visual e não muda o jogo.",
        en: "A snowy pitch in snow matches (with an orange ball) and fog in some overcast and cold matches. The fog is only visual and does not change the game.",
      },
      {
        pt: "Pênalti com cavadinha e com batida de chapa no canto.",
        en: "Penalties with a chip down the middle and a placed side-foot finish into the corner.",
      },
      {
        pt: "Corte do gramado sem padrão, em Clube. Em Configurações, os jogadores podem ficar com proporção mais realista.",
        en: "A plain mowing pattern in Club. In Settings, the players can have more realistic proportions.",
      },
      {
        pt: "Ícones novos nas abas e na caixa de entrada, logo e ícone do jogo novos, e imagem própria ao compartilhar o link.",
        en: "New icons in the tabs and the inbox, a new logo and game icon, and a proper image when the link is shared.",
      },
    ],
  },
  {
    version: "4.41.11",
    date: "2026-10-29",
    items: [
      {
        pt: "Visual novo também fora da partida: fundo pintado na tela inicial e no novo jogo, desenhos das instalações do clube, ilustração nas mensagens, medalhas das conquistas e moldura do rosto do técnico.",
        en: "The new look outside the match too: painted backgrounds on the start and new game screens, club facility drawings, illustrations in the messages, achievement medals and the manager's face frame.",
      },
      {
        pt: "Qualidade gráfica em Configurações (automática, alta ou leve). A leve tira fogos, flashes, movimento da torcida e chuva; a automática passa para leve quando a partida fica lenta. Com a opção de reduzir movimento do sistema, a partida e o pênalti ficam sem esses efeitos.",
        en: "Graphics quality in Settings (automatic, high or light). Light drops fireworks, flashes, crowd movement and rain; automatic switches to light when the match runs slowly. With the system's reduce motion option, the match and the penalty skip those effects.",
      },
    ],
  },
  {
    version: "4.41.10",
    date: "2026-10-29",
    items: [
      {
        pt: "Pênalti com o visual novo: estádio pintado conforme o clima, batedor e goleiro de corpo inteiro (corrida, chute, mergulho, defesa com a bola nas mãos) e bola com gomos girando.",
        en: "Penalties in the new look: a painted stadium by the weather, full-body taker and keeper (run-up, kick, dive, save with the ball in the hands) and a spinning panelled ball.",
      },
    ],
  },
  {
    version: "4.41.9",
    date: "2026-10-29",
    items: [
      {
        pt: "Gol com letreiro de TV na partida: foto de quem marcou, minuto, time e placar.",
        en: "Goals get a TV caption in the match: the scorer's photo, the minute, the team and the score.",
      },
      {
        pt: "Replay do gol em câmera lenta e câmera que segue a bola, os dois com opção em Configurações.",
        en: "Slow-motion goal replay and a camera that follows the ball, both with an option in Settings.",
      },
      {
        pt: "No lateral, o jogador segura a bola sobre a cabeça antes de cobrar. O goleiro soca a bola quando não consegue agarrar, e alguns gols são comemorados de joelho.",
        en: "At a throw-in the player holds the ball over their head before throwing. The keeper punches the ball when they can't catch it, and some goals are celebrated with a knee slide.",
      },
    ],
  },
  {
    version: "4.41.8",
    date: "2026-10-29",
    items: [
      {
        pt: "Torcida com o visual novo: cada torcedor tem roupa, cabelo, boné e cachecol próprios, e quem leva gol põe as mãos na cabeça. Os fotógrafos atrás dos gols também ganharam o visual novo.",
        en: "The crowd in the new look: every fan has their own clothes, hair, cap and scarf, and the side that concedes holds their heads. The photographers behind the goals have the new look too.",
      },
    ],
  },
  {
    version: "4.41.7",
    date: "2026-10-29",
    items: [
      {
        pt: "Árbitro, bandeirinhas, técnicos e médicos também viraram bonecos animados. O quarto árbitro aparece entre os bancos e levanta a placa nas substituições.",
        en: "Referee, assistants, managers and medics are now animated figures too. The fourth official stands between the benches and raises the board at substitutions.",
      },
    ],
  },
  {
    version: "4.41.6",
    date: "2026-10-29",
    items: [
      {
        pt: "Jogadores desenhados como bonecos animados na partida: andam, correm, chutam, cabeceiam, dão carrinho, caem e comemoram. O rosto aparece no nome de quem está com a bola.",
        en: "Players drawn as animated figures in the match: they walk, run, kick, head, slide in, fall and celebrate. The face shows in the name of whoever has the ball.",
      },
    ],
  },
  {
    version: "4.41.5",
    date: "2026-10-29",
    items: [
      {
        pt: "Com uma proposta de renovação da diretoria pendente, é preciso responder antes de avançar os dias.",
        en: "With a renewal offer from the board pending, you must answer it before advancing the days.",
      },
    ],
    fixes: [
      {
        pt: "A transmissão do jogo de um amigo ficou mais suave, também em 2x e 4x.",
        en: "A friend's match broadcast is smoother, also at 2x and 4x.",
      },
      {
        pt: "Alguns jogadores ficavam sem rosto na partida e na transmissão.",
        en: "Some players showed no face in the match and in the broadcast.",
      },
    ],
  },
  {
    version: "4.41.4",
    date: "2026-10-29",
    items: [
      {
        pt: "Gramado pintado na partida, com o padrão de corte do clube. Dá para voltar ao desenho antigo em Configurações, em Visual novo.",
        en: "Painted turf in the match, with the club's mowing pattern. You can switch back to the old drawing in Settings, under New visual.",
      },
      {
        pt: "Prévia dos enfeites do estádio na tela de conquistas.",
        en: "Preview of the stadium decorations on the achievements screen.",
      },
    ],
    fixes: [
      {
        pt: "Na transmissão do jogo de um amigo, a bola parecia ficar com o mesmo jogador depois de um passe.",
        en: "In a friend's match broadcast, the ball seemed to stay with the same player after a pass.",
      },
      {
        pt: "Escudos de traço fino e escuro sumiam no fundo escuro; agora aparecem sobre um disco claro.",
        en: "Crests drawn in thin dark lines vanished on the dark background; they now sit on a light disc.",
      },
    ],
  },
  {
    version: "4.41.3",
    date: "2026-10-29",
    items: [
      {
        pt: "Assistir ao jogo de um amigo abre uma janela no estilo transmissão, com o campo igual ao da partida: estádio, torcida, uniformes, rostos, gramado e luz.",
        en: "Watching a friend's match opens a broadcast-style window with the pitch exactly as in the match: stadium, crowd, kits, faces, turf and light.",
      },
    ],
    fixes: [
      {
        pt: "A transmissão do jogo de um amigo travava: os jogadores andavam aos trancos.",
        en: "A friend's match broadcast stuttered: the players moved in jerks.",
      },
    ],
  },
  {
    version: "4.41.2",
    date: "2026-10-29",
    items: [
      {
        pt: "Quando a diretoria oferece a renovação do seu contrato, uma janela abre no Painel para você responder.",
        en: "When the board offers to renew your contract, a window opens on the dashboard so you can answer.",
      },
      {
        pt: "Proposta de emprego: país e divisão do clube, e o botão Ver elenco.",
        en: "Job offer: the club's country and division, and a View squad button.",
      },
    ],
  },
  {
    version: "4.41.1",
    date: "2026-10-29",
    items: [
      {
        pt: "Sem clube, o \"Pronto até\" ganha \"Até as próximas propostas\": o jogo anda sozinho até chegarem propostas.",
        en: "Without a club, \"Ready until\" gets \"Until the next job offers\": the game moves on by itself until offers arrive.",
      },
    ],
    fixes: [
      {
        pt: "Uma renovação de contrato oferecida pela diretoria e não respondida é aceita no fim do contrato, em vez de deixar o técnico sem clube.",
        en: "A contract renewal the board offered and you never answered is taken when the contract ends, instead of leaving you without a club.",
      },
      {
        pt: "Técnico sem clube com boa reputação recebe propostas de clubes à altura da reputação.",
        en: "A manager without a club and a good reputation gets offers from clubs that match the reputation.",
      },
    ],
  },
  {
    version: "4.41",
    date: "2026-10-29",
    items: [
      {
        pt: "Assista ao jogo de um amigo da liga: o botão Assistir, nos Rivais, abre o campo, o placar, os números e quem está em campo durante a partida ao vivo. No mundo público vale para qualquer técnico do mundo.",
        en: "Watch a friend's match: the Watch button in Rivals opens the pitch, the score, the numbers and who is on the pitch during the live match. In the public world it works for any manager of the world.",
      },
      {
        pt: "Últimos lances dos amigos com amarelos e substituições dos dois times.",
        en: "Friends' latest moments now show both teams' bookings and substitutions.",
      },
      {
        pt: "Prévia da partida: Jogar e Simular também no topo da tela.",
        en: "Match preview: Play and Simulate at the top of the screen too.",
      },
    ],
    fixes: [
      {
        pt: "Ídolos e lendas do clube ficaram mais difíceis: lenda pede 300 jogos, ou 200 com 100 gols, 6 títulos ou 3 prêmios.",
        en: "Club idols and legends are harder to reach: a legend needs 300 games, or 200 with 100 goals, 6 titles or 3 awards.",
      },
      {
        pt: "Lesões um pouco mais frequentes e um pouco mais longas.",
        en: "Injuries are a little more frequent and last a little longer.",
      },
    ],
  },
  {
    version: "4.40",
    date: "2026-10-29",
    items: [
      { pt: "Cada clube pode ter no máximo 5 jogadores do top 25 do mundo. Quem já é seu e entra no top fica, e promover um jovem da base sempre vale; só não dá para contratar outro acima do limite.", en: "Each club can have at most 5 of the world's top 25 players. One of yours who climbs into the top stays, and promoting an academy player is always allowed; you just cannot sign another over the limit." },
    ],
  },
  {
    version: "4.39.5",
    date: "2026-10-29",
    items: [
      { pt: "Novo pênalti: o batedor escolhe um dos seis cantos do gol, como o goleiro escolhe o pulo. A finalização decide se a bola vai onde ele quis, a força dificulta a defesa.", en: "New penalties: the taker picks one of the six areas of the goal, just as the keeper picks his dive. Finishing decides whether the ball goes where he wanted, strength makes it harder to save." },
    ],
  },
  {
    version: "4.39.4",
    date: "2026-10-29",
    items: [
      { pt: "O cartão da liga no Painel mostra a tabela inteira, com rolagem, e abre no seu time.", en: "The dashboard's league card shows the whole table, scrollable, opened on your club." },
    ],
    fixes: [
      { pt: "Nos resultados dos amigos, os pênaltis saem na mesma ordem do placar.", en: "In friends' results, the shootout score follows the order of the match score." },
      { pt: "Um jogador que você contratou sai das joias e dos relatórios dos olheiros; quem mudou de clube fica sem o link quebrado.", en: "A player you signed leaves the scouts' gems and reports; one who changed clubs no longer has a broken link." },
    ],
  },
  {
    version: "4.39.3",
    date: "2026-10-29",
    items: [
      { pt: "A aba Inscritos diz quem conta como estrangeiro em cada liga (na La Liga, quem é de fora da UE; latino-americanos com 23 anos ou mais não contam) e, no selo de cada jogador, o motivo.", en: "The Registration tab says who counts as foreign in each league (in La Liga, players from outside the EU; Latin Americans aged 23 or over don't count) and, on each player's tag, why." },
      { pt: "Na ficha e na negociação de um jogador de outro clube, uma linha avisa se ele ocuparia vaga de estrangeiro na sua liga e quantas já estão usadas.", en: "On another club's player's profile and in the negotiation, a line tells you whether he would take a foreign place in your league and how many are already used." },
      { pt: "Cada aviso do cartão Atenção do Painel tem um botão para a ação: renovar, escalar, conversar, ir ao mercado.", en: "Each line of the dashboard's Attention card has a button for its action: renew, pick the lineup, talk, go to the market." },
      { pt: "Com a janela aberta, uma faixa verde no Painel mostra até quando ela vai e quantas compras e vendas você tem em andamento.", en: "While the window is open, a green strip on the dashboard shows until when and how many purchases and sales you have in progress." },
      { pt: "A lista de aposentados mostra só os destaques por padrão e ganhou busca por nome e filtro de país.", en: "The retired list shows only the highlights by default and has a name search and a country filter." },
    ],
  },
  {
    version: "4.39.2",
    date: "2026-10-29",
    items: [
      { pt: "As trocas na fila aparecem uma vez só no painel de substituições, com o botão de desfazer.", en: "Queued substitutions show once in the substitutions panel, with the undo button." },
      { pt: "A base não recebe mais vários jovens com o mesmo nome na mesma safra.", en: "An academy intake no longer brings several players with the same name." },
    ],
  },
  {
    version: "4.39.1",
    date: "2026-10-28",
    items: [
      { pt: "Barra de energia reta acima da cabeça dos jogadores, no lugar do arco em volta do marcador.", en: "Straight stamina bar above the players' heads, replacing the arc around the marker." },
      { pt: "Fogos de artifício mais variados e suaves: cada comemoração sorteia quantos fogos, estilos, cores e tamanhos, com faíscas redondas que somem aos poucos.", en: "More varied, smoother fireworks: every celebration draws its own number of shells, styles, colours and sizes, with round sparks that fade out gently." },
      { pt: "Os sinalizadores na torcida brilham com uma pulsação suave, cada um no seu ritmo.", en: "The flares in the crowd glow with a soft pulse, each at its own pace." },
      { pt: "Os patrocinadores das placas de LED agora também em inglês, acompanhando o idioma do jogo.", en: "The LED board sponsors now come in English too, following the game language." },
    ],
  },
  {
    version: "4.39",
    date: "2026-10-28",
    items: [
      { pt: "Treino da base: escolha a intensidade e o foco do grupo, e por jovem um foco próprio e uma posição de treino. A base agora treina nos dias de treino do clube, e a tabela mostra a evolução das últimas 4 semanas.", en: "Academy training: pick the intensity and the group focus, and per youngster a focus and a training position. The academy now trains on the club's training days, and the table shows the last 4 weeks' growth." },
      { pt: "Treino individual no time principal: na tela Desenvolvimento, cada jogador pode ter um foco e uma posição de treino.", en: "Individual training for the first team: on the Development screen, each player can have a focus and a training position." },
      { pt: "A torcida de um clube grande reage melhor a uma boa temporada: um vice com muitos pontos não fica mais com a torcida lá embaixo.", en: "A big club's fans react better to a good season: a high-scoring runner-up no longer has its fans at the bottom." },
      { pt: "Clubes da IA mais competitivos contra os técnicos humanos: entrosam um pouco mais com o próprio estilo e a confiança deles acompanha a fase do time.", en: "AI clubs compete better against human managers: they know their own style a little better and their confidence follows their form." },
      { pt: "Joias do olheiro mais raras: cada jogador é anunciado uma vez só, e só os melhores relatórios.", en: "Scout gems are rarer: each player is announced once, and only the best reports." },
      { pt: "Saves mais leves: os dias antigos guardam só o essencial das partidas de outros clubes.", en: "Lighter saves: old days keep only the essentials of other clubs' matches." },
    ],
  },
  {
    version: "4.38.24",
    date: "2026-10-28",
    items: [
      { pt: "Resposta rápida no Painel: as mensagens da caixa de entrada abrem no próprio cartão, com os botões para aceitar, recusar, responder e os links.", en: "Quick answer on the dashboard: inbox messages open right in the card, with the buttons to accept, refuse, answer and the links." },
    ],
    fixes: [
      { pt: "Saiu o brilho branco que aparecia dentro da cabeça dos jogadores na partida.", en: "The white highlight inside the players' heads in the match is gone." },
    ],
  },
  {
    version: "4.38.23",
    date: "2026-10-28",
    items: [
      { pt: "Some o risco cinza que cruzava o rosto dos jogadores na partida.", en: "The grey line across the players' faces in the match is gone." },
    ],
    fixes: [
      { pt: "O rastro de um passe longo ou chute começa depois do jogador, não mais em cima dele.", en: "The trail of a long pass or shot starts past the player, no longer over him." },
    ],
  },
  {
    version: "4.38.22",
    date: "2026-10-28",
    items: [
      { pt: "Mais de 100 patrocinadores fictícios nas placas de LED: marcas de camisa, lojas, comidas e empresas.", en: "Over 100 made-up sponsors on the LED boards: kit brands, shops, food and companies." },
    ],
    fixes: [
      { pt: "A bola fica nos pés de quem a conduz, não mais em cima do rosto.", en: "The ball sits at the holder's feet, no longer over the face." },
      { pt: "Os fotógrafos ficam só atrás dos gols, fora da faixa do bandeirinha.", en: "Photographers stay behind the goals, off the assistant's lane." },
    ],
  },
  {
    version: "4.38.21",
    date: "2026-10-28",
    items: [
      { pt: "Jogadores com borda nas duas cores do uniforme e o número da posição; o nome aparece em quem está com a bola e em quem vai receber.", en: "Players with a border in the kit's two colours and their position number; the name shows on the player with the ball and on who receives it." },
      { pt: "Linha do passe até quem recebe, arco do chute e marca de impacto.", en: "A line from the pass to the receiver, the shot's arc and an impact mark." },
      { pt: "Placas de LED em volta do campo com propagandas que trocam, e o gol em todas elas.", en: "LED boards around the pitch with ads that switch, and the goal on all of them." },
      { pt: "Faixa de lance como na TV: gol com nome, minuto e assistência, cartões e substituições.", en: "A TV-style strip: goals with name, minute and assist, cards and substitutions." },
      { pt: "Fotógrafos em lugares diferentes a cada jogo.", en: "Photographers in different spots every game." },
    ],
    fixes: [
      { pt: "A bandeirinha de escanteio aponta para dentro do campo.", en: "The corner flag points into the pitch." },
      { pt: "Campo menos embaçado.", en: "The pitch looks less hazy." },
    ],
  },
  {
    version: "4.38.20",
    date: "2026-10-28",
    items: [
      { pt: "Substituições na fila podem ser desfeitas antes da próxima parada.", en: "Queued substitutions can be undone before the next stoppage." },
      { pt: "Túnel dos jogadores no meio da arquibancada de baixo, com o caminho até o campo.", en: "The players' tunnel in the middle of the bottom stand, with the path to the pitch." },
      { pt: "Fotógrafos atrás dos gols, com flashes nos chutes.", en: "Photographers behind the goals, with flashes on shots." },
    ],
  },
  {
    version: "4.38.19",
    date: "2026-10-28",
    items: [
      { pt: "Campo um pouco maior que na versão anterior e arquibancada sem os dois anéis; os bandeirões da torcida saíram (as bandeirinhas na mão continuam).", en: "The pitch is a bit bigger than in the last version and the stand has no second tier; the fans' big banners are gone (hand flags stay)." },
    ],
  },
  {
    version: "4.38.18",
    date: "2026-10-28",
    items: [
      { pt: "Estádio maior em volta do campo: a arquibancada tem dois anéis e a torcida aparece nos quatro lados, inclusive atrás do banco.", en: "A bigger stadium around the pitch: the stand has two tiers and the crowd shows on all four sides, behind the bench too." },
    ],
  },
  {
    version: "4.38.17",
    date: "2026-10-28",
    items: [
      { pt: "Rivais no topo do Painel: o jogo de um amigo aparece ao vivo, com placar, minuto e os últimos lances.", en: "Rivals at the top of the Dashboard: a friend's game shows live, with the score, the minute and the latest moments." },
    ],
  },
  {
    version: "4.38.16",
    date: "2026-10-28",
    items: [
      { pt: "Banco de reservas visto de cima, com os reservas pequenos numa fileira, como no mock escolhido.", en: "Bench seen from above, the substitutes small in one row, as in the chosen mock." },
      { pt: "O bandeirinha não passa mais por cima do banco: o campo foi medido de novo para abrir espaço embaixo.", en: "The assistant referee no longer runs over the bench: the pitch was resized to make room below it." },
    ],
  },
  {
    version: "4.38.15",
    date: "2026-10-28",
    items: [
      { pt: "Pênalti: a mira corre sozinha pelo gol e você acerta o momento do chute junto com a força.", en: "Penalties: the aim moves across the goal on its own and you time the kick together with the power." },
      { pt: "Bandeirões da torcida numa cor só, a principal do clube, com o escudo.", en: "Fans' banners in one colour, the club's main one, with the crest." },
      { pt: "Banco de reservas refeito no estilo da torcida, fora do gramado.", en: "Bench redrawn in the crowd's style, off the pitch." },
    ],
  },
  {
    version: "4.38.14",
    date: "2026-10-28",
    items: [
      { pt: "Banco de reservas redesenhado: os reservas sentados em duas fileiras, olhando o lance e comemorando os gols do time.", en: "Redesigned bench: the substitutes sit in two rows, follow the play and celebrate their team's goals." },
      { pt: "Goleiros reservas com uniforme próprio, cada um de uma cor.", en: "Substitute keepers wear their own kit, each in a different colour." },
      { pt: "Bandeiras e bandeirões da torcida com a cor principal e o escudo do clube.", en: "Fans' flags and banners show the club's main colour and crest." },
    ],
  },
  {
    version: "4.38.13",
    date: "2026-10-28",
    items: [
      { pt: "Jogo ao vivo de um amigo: depois de uma atualização do servidor o placar volta sozinho no minuto seguinte, e reagir a ele não mostra mais a mensagem de convite inválido.", en: "A friend's live game: after a server update the score comes back by itself on the next minute, and reacting to it no longer shows the invalid invite message." },
    ],
  },
  {
    version: "4.38.12",
    date: "2026-10-28",
    items: [
      { pt: "Torcida nova: cada torcedor é uma pessoa, com rosto, cabelo e a camisa do time, e se mexe de forma suave e independente.", en: "New crowd: every fan is a person, with a face, hair and the team shirt, moving smoothly on his own." },
      { pt: "Na ola e no gol os torcedores levantam os braços e os cachecóis; parte da torcida balança bandeirinhas e grupos seguram bandeirões que ondulam sobre a arquibancada.", en: "On the wave and on a goal the fans raise their arms and scarves; some wave small flags and groups hold up big banners rippling over the stand." },
    ],
  },
  {
    version: "4.38.11",
    date: "2026-10-28",
    items: [
      { pt: "Partida: o fôlego aparece só nos seus jogadores.", en: "Match: stamina shows only on your players." },
      { pt: "Torcida mais animada: os setores pulam juntos no ritmo do canto, a ola passa mais vezes e bandeiras grandes tremulam nas arquibancadas da casa.", en: "Livelier crowd: sections jump together to the chant, the wave comes round more often and big flags wave over the home stands." },
    ],
  },
  {
    version: "4.38.10",
    date: "2026-10-28",
    items: [
      { pt: "Visual da partida refinado: gramado com textura, linhas de cal mais finas, gols com rede e bandeirinhas de escanteio.", en: "Refined match look: textured grass, finer chalk lines, goals with nets and corner flags." },
      { pt: "Jogadores com volume, nome numa etiqueta com a cor do time, fôlego num arco em volta do jogador e uma seta mostrando para onde ele corre.", en: "Players with depth, the name on a tag in the team colour, stamina as an arc round the player and an arrow showing where he runs." },
      { pt: "Anel dourado pulsando sob quem está com a bola e rastro da bola mais suave.", en: "A pulsing gold ring under the ball holder and a smoother ball trail." },
      { pt: "Torcida animada: a arquibancada balança e a ola dá a volta no estádio.", en: "Animated crowd: the stands sway and the Mexican wave goes round the stadium." },
    ],
  },
  {
    version: "4.38.9",
    date: "2026-10-28",
    items: [
      { pt: "Fogos de artifício novos nos jogos grandes à noite: o foguete sobe com rastro, estoura com um clarão e abre em anéis de faíscas coloridas que piscam antes de sumir.", en: "New fireworks in big night games: the rocket climbs with a trail, bursts with a flash and opens into rings of coloured sparks that blink out." },
    ],
  },
  {
    version: "4.38.8",
    date: "2026-10-28",
    items: [
      { pt: "Lendas: entram na lista os jogadores que se aposentam com nota 45 ou mais (antes a lista ficava vazia).", en: "Legends: the list now takes players who retire with a rating of 45 or more (it used to stay empty)." },
    ],
  },
  {
    version: "4.38.7",
    date: "2026-10-28",
    items: [
      { pt: "Estatísticas → Aposentados: novo filtro Lendas, com quem já voltou e por quem.", en: "Stats → Retired: new Legends filter, showing who is back and with whom." },
      { pt: "Uma lenda por temporada pode voltar para a sua base com 17 anos pagando uma compensação em dinheiro, sem gastar pontos.", en: "One legend per season can come back to your academy at 17 for a cash fee, without spending points." },
    ],
  },
  {
    version: "4.38.6",
    date: "2026-10-28",
    items: [
      { pt: "Instalações do clube: cada cartão mostra com nome o nível, a condição e a obra em andamento (quanto já foi feito e a entrega).", en: "Club facilities: each card labels the level, the condition and the works under way (how much is done and the due date)." },
      { pt: "Conquistas: a loja tem o histórico das lendas e dos jogadores criados que você comprou.", en: "Achievements: the shop lists the legends and created players you bought." },
      { pt: "Caixa de entrada: as mensagens dos olheiros têm um filtro próprio, separado de Transferências.", en: "Inbox: scouting messages have their own filter, apart from Transfers." },
    ],
  },
  {
    version: "4.38.5",
    date: "2026-10-28",
    items: [
      {
        pt: "Jogadores vindos da base (e outros com a posição exata no cadastro) recusavam qualquer proposta com \"Elenco insuficiente para liberar o jogador\" mesmo em elencos cheios. Agora o clube vende normalmente.",
        en: "Academy players (and others listed with an exact position) refused every bid with \"Squad depth is insufficient\" even in full squads. Their clubs now sell them normally.",
      },
    ],
  },
  {
    version: "4.38.4",
    date: "2026-10-28",
    items: [
      {
        pt: "Pênalti: o goleiro agacha, dá impulso com uma perna e levanta a outra, voa com o tronco e a cabeça indo para a bola e cai encolhendo as pernas.",
        en: "Penalties: the keeper crouches, pushes off one leg and lifts the other, flies with his torso and head going for the ball and lands curling his legs.",
      },
      {
        pt: "Na lista de inscritos, cada situação tem a sua cor: inscrito, fora da lista, livre, estrangeiro, green card e formado no clube ou no país.",
        en: "In the squad registration list every status has its own colour: registered, out, free, foreign, green card and trained at the club or in the country.",
      },
    ],
    fixes: [
      { pt: "A aba Joias dos olheiros mostra cada jogador uma vez só, com o relatório mais recente.", en: "The scouts' Gems tab shows each player once, with the newest report." },
      { pt: "Os jovens que chegam à base não repetem mais o nome de alguém do clube.", en: "New academy players no longer repeat the name of someone at the club." },
    ],
  },
  {
    version: "4.38.3",
    date: "2026-10-28",
    items: [
      {
        pt: "Pênalti: o goleiro tem braços articulados, que descem no agacho e esticam no pulo, e o batedor balança os braços na corrida e abre para chutar. Os dois de chuteira e meião.",
        en: "Penalties: the keeper's arms bend, drop in the crouch and stretch in the dive, and the taker swings his arms on the run-up and opens them to kick. Both in boots and socks.",
      },
    ],
    fixes: [
      { pt: "No pênalti, o batedor termina ao lado da bola, não em cima dela, e a faixa verde da barra de força é sempre verde.", en: "In penalties the taker ends beside the ball, not on it, and the green zone of the power bar is always green." },
    ],
  },
  {
    version: "4.38.2",
    date: "2026-10-28",
    items: [
      {
        pt: "Pênalti em 2D com visual novo: torcida atrás do gol nas cores dos dois times, gramado em perspectiva, rede que estufa no gol e traves com volume.",
        en: "2D penalties look new: the crowd behind the goal in both clubs' colours, grass in perspective, a net that bulges on a goal and posts with depth.",
      },
      {
        pt: "No pênalti, o goleiro balança antes da cobrança e pula de verdade, com o rosto dele; a bola faz a curva com sombra no chão, espirra na defesa e volta da trave.",
        en: "In penalties the keeper sways before the kick and really dives, with his own face; the ball curves with its shadow on the grass, spills from a save and bounces off the post.",
      },
      {
        pt: "Pênalti à noite com refletores e celulares na torcida, e o gol com a tela tremendo e confete.",
        en: "Night penalties with floodlights and phones in the crowd, and goals with a screen shake and confetti.",
      },
    ],
  },
  {
    version: "4.38.1",
    date: "2026-10-28",
    items: [
      {
        pt: "Torres de iluminação nos cantos do estádio: apagadas de dia, acesas no fim de tarde e à noite.",
        en: "Floodlight towers in the stadium corners: off by day, on at dusk and at night.",
      },
      {
        pt: "Em jogo noturno, a torcida acende os celulares, e muito mais gente acende num gol do time da casa.",
        en: "At night games the crowd lights up their phones, and many more do at a home goal.",
      },
      {
        pt: "Jogo grande (continental, copa a partir das quartas, clássico): sinalizadores com fumaça na torcida da casa na entrada em campo e nos gols, e fogos à noite.",
        en: "Big games (continental, cup from the quarter-finals, derby): flares and smoke in the home end at kickoff and at every home goal, and fireworks at night.",
      },
    ],
  },
  {
    version: "4.38",
    date: "2026-10-28",
    items: [
      {
        pt: "Pênaltis em 2D: você mira e solta a força para bater, e escolhe o canto para defender. Vale na disputa e nos pênaltis durante o jogo.",
        en: "2D penalties: aim and release the power bar to kick, pick a corner to save. Works in shootouts and in penalties during the match.",
      },
      {
        pt: "Na prévia da partida e na sala do jogo entre amigos, escolha entre bater os pênaltis você mesmo ou deixar no automático.",
        en: "In the match preview and in the friends' match room, choose to take the penalties yourself or leave them automatic.",
      },
      {
        pt: "Contra um amigo ao vivo, cada um bate e defende os pênaltis do próprio time.",
        en: "In a live match against a friend, each manager kicks and saves his own team's penalties.",
      },
    ],
  },
  {
    version: "4.37.3",
    date: "2026-10-28",
    items: [
      {
        pt: "Na tela de formação, o fôlego de cada titular aparece embaixo dele no campo.",
        en: "On the formation screen, each starter's fitness shows under him on the pitch.",
      },
    ],
  },
  {
    version: "4.37.2",
    date: "2026-10-28",
    items: [
      {
        pt: "Pontos de conquistas também pela campanha: títulos, semifinal e final continental, meta da diretoria cumprida e prêmios de técnico.",
        en: "Achievement points from the campaign too: titles, continental semi-finals and finals, the board's objective met and manager awards.",
      },
      {
        pt: "A loja vende o jogador criado e a lenda uma vez por temporada, com o preço subindo a cada compra.",
        en: "The shop sells the created player and the legend once per season, with the price rising after each purchase.",
      },
    ],
    fixes: [
      {
        pt: "O jogador pendurado agora aparece com um cartão amarelo cheio com a letra P (o texto completo ao passar o mouse).",
        en: "A player one yellow from a ban now shows a filled yellow card with the letter R (the full text on hover).",
      },
    ],
  },
  {
    version: "4.37.1",
    date: "2026-10-28",
    items: [
      {
        pt: "Na partida, o jogador pendurado (a um amarelo da suspensão) aparece com um cartão amarelo vazado.",
        en: "In the match, a player one yellow card from a ban shows an empty yellow card.",
      },
      {
        pt: "Jogo de ida e volta de um amigo: a faixa ao vivo e o placar mostram o agregado.",
        en: "A friend's two-legged tie: the live strip and the score show the aggregate.",
      },
      {
        pt: "Obras em andamento aparecem no cartão da área com a porcentagem concluída e a data de entrega.",
        en: "Works under way show in the area's card with the percentage done and the delivery date.",
      },
      {
        pt: "Relatórios dos olheiros: filtro por olheiro e por nota, colunas ordenáveis e um jogador por linha.",
        en: "Scout reports: filter by scout and by grade, sortable columns and one player per row.",
      },
      {
        pt: "Um clube que comprou um jogador seu não o vende de volta antes de um ano.",
        en: "A club that bought one of your players will not sell him back within a year.",
      },
    ],
    fixes: [
      {
        pt: "Tela de formação mais compacta: o campo cabe na altura da janela.",
        en: "A more compact formation screen: the pitch fits the window height.",
      },
      {
        pt: "Resumo da partida mais compacto, deixando espaço para o mapa de posse.",
        en: "A more compact match summary, leaving room for the possession map.",
      },
      {
        pt: "Os dois bandeirinhas ficam colados à linha lateral; o de baixo não fica mais sobre o banco.",
        en: "Both assistant referees stand on the touchline; the bottom one no longer sits over the bench.",
      },
    ],
  },
  {
    version: "4.37",
    date: "2026-10-28",
    items: [
      {
        pt: "Goleiro mais ativo: sai da área para cortar bolas longas quando chega antes do atacante.",
        en: "A more active goalkeeper: he leaves his box to cut out long balls when he gets there before the striker.",
      },
      {
        pt: "No 1 contra 1, o goleiro vai ao encontro do atacante e pode abafar a bola nos pés dele.",
        en: "In a one-on-one, the goalkeeper comes out at the striker and can smother the ball at his feet.",
      },
      {
        pt: "Com o time no ataque, o goleiro se adianta até perto da entrada da área.",
        en: "With his team attacking, the goalkeeper steps up toward the edge of his box.",
      },
      {
        pt: "O goleiro também sai em cruzamentos que caem fora da pequena área.",
        en: "The goalkeeper also comes for crosses that drop outside the six-yard box.",
      },
      {
        pt: "Na renovação de contrato, o salário atual aparece ao lado do pedido.",
        en: "When renewing a contract, the current wage shows next to the asking wage.",
      },
      {
        pt: "Na partida ao vivo, a faixa de cima mostra sempre os amigos da liga: o placar de quem está jogando e o próximo jogo e a data de quem não está. O gol do amigo acende a linha dele, sem balão sobre o campo.",
        en: "In the live match, the top strip always shows the league's friends: the score of those playing and the next match and date of those who are not. A friend's goal lights his line, with no popup over the pitch.",
      },
      {
        pt: "Reações aos jogos dos amigos com ícones novos e frases coloridas.",
        en: "Reactions to friends' games with new icons and coloured phrases.",
      },
    ],
    fixes: [
      {
        pt: "O placar ao vivo do amigo agora segue a ordem casa e fora, com os dois escudos.",
        en: "A friend's live score now follows the home and away order, with both crests.",
      },
      {
        pt: "Dá para comprar jogador de clube com o elenco no mínimo da posição: ele vende e contrata um substituto.",
        en: "You can buy from a club at the minimum for that position: it sells and signs a replacement.",
      },
      {
        pt: "No jogo ao vivo entre amigos, o banco volta a mostrar a posição de cada jogador (antes todos viravam ST, CM ou CB).",
        en: "In the live match between friends, the bench shows each player's position again (they all read ST, CM or CB).",
      },
      {
        pt: "No painel de substituições, zagueiros e volantes não se sobrepõem mais e a vaga de um lesionado aparece no campo.",
        en: "In the substitutions panel, centre-backs and holding midfielders no longer overlap and an injured player's empty slot shows on the pitch.",
      },
      {
        pt: "Times B e reservas não disputam mais a copa nacional.",
        en: "B and reserve teams no longer play in the national cup.",
      },
      {
        pt: "Um jogador renovado só pode renovar de novo depois de 6 meses.",
        en: "A player who just renewed can only renew again after 6 months.",
      },
      {
        pt: "Na Espanha, sul-americanos com menos de 23 anos contam como extracomunitários.",
        en: "In Spain, South Americans under 23 count as non-EU players.",
      },
      {
        pt: "O escudo novo do Athletic Club aparece para todos (o antigo ficava guardado no navegador).",
        en: "Athletic Club's new crest now shows for everyone (the old one stayed cached in the browser).",
      },
      {
        pt: "O hall da fama mostra as edições por data e esconde as que ficaram sem pontos.",
        en: "The hall of fame lists editions by date and hides the ones with no points.",
      },
    ],
  },
  {
    version: "4.36",
    date: "2026-10-27",
    items: [
      {
        pt: "Jogo ao vivo entre dois amigos: quando o seu clube enfrenta o de outro técnico, os dois jogam a mesma partida ao mesmo tempo, cada um no comando do próprio time.",
        en: "Live match between two friends: when your club meets another manager's club, you both play the same match at the same time, each one in charge of their own team.",
      },
      {
        pt: "Sala do jogo: entre na sala e o seu amigo recebe o convite; a partida começa quando os dois clicam em Começar. Quem preferir pode simular o jogo.",
        en: "Match room: step into the room and your friend gets the invite; the match starts when both click Start. Either of you can simulate the game instead.",
      },
      {
        pt: "Cada técnico tem 3 pausas de até 30 segundos por partida para mexer no time.",
        en: "Each manager has 3 pauses of up to 30 seconds per match to change their team.",
      },
      {
        pt: "Se um dos dois cair, o auxiliar assume o time até ele voltar.",
        en: "If one of you drops out, the assistant takes over the team until they are back.",
      },
      {
        pt: "Tela inicial com amigos e convites: o painel de amigos já aparece ao entrar, e os convites para ligas ficam junto dos jogos salvos, prontos para aceitar.",
        en: "Start screen with friends and invites: the friends panel is there as soon as you sign in, and league invites sit next to your saved games, ready to accept.",
      },
    ],
    fixes: [
      {
        pt: "A partida ao vivo marcava mais gols e tinha mais chutes que a simulada com os mesmos times; agora as duas jogam igual.",
        en: "The live match had more goals and shots than the simulated one with the same teams; now both play the same.",
      },
    ],
  },
  {
    version: "4.35.4",
    date: "2026-10-27",
    items: [
      {
        pt: "Escudos para mais 449 clubes que ainda apareciam com o brasão de cores.",
        en: "Crests for 449 more clubs that still showed the colour badge.",
      },
    ],
  },
  {
    version: "4.35.3",
    date: "2026-10-27",
    items: [
      {
        pt: "Mundo público: quando todos os técnicos ativos ficam prontos, o mundo avança na hora, sem esperar o próximo horário.",
        en: "Public world: once every active manager is ready, the world moves on at once, without waiting for the next time slot.",
      },
      {
        pt: "Na partida, os avisos dos amigos aparecem abaixo da faixa Ao vivo, sobre o campo, e o Ao vivo pisca em vermelho.",
        en: "On the match, friends' notices show under the Live strip, over the pitch, and Live blinks red.",
      },
      {
        pt: "Clicar no amigo na faixa Ao vivo mostra o placar e os últimos lances do jogo dele: gols, expulsões, VAR, intervalo e fim.",
        en: "Clicking a friend on the Live strip shows the score and the latest moments of his match: goals, red cards, VAR, half-time and full time.",
      },
      {
        pt: "Emojis no chat com amigos.",
        en: "Emojis in the chat with friends.",
      },
    ],
    fixes: [
      {
        pt: "A aba de uma conversa minimizada ficou maior.",
        en: "A minimized chat tab is bigger.",
      },
      {
        pt: "Escudo do Athletic Club corrigido.",
        en: "Athletic Club crest fixed.",
      },
      {
        pt: "No mundo com amigos, Simular explica o que faz, e um jogo marcado para simular pode ser desfeito enquanto o dia não roda.",
        en: "In a group world, Simulate explains what it does, and a match set to be simulated can be undone until the day runs.",
      },
    ],
  },
  {
    version: "4.35.2",
    date: "2026-10-27",
    items: [
      {
        pt: "Na partida ao vivo, o botão Amigos fica na barra de controles, ao lado de Substituições.",
        en: "On the live match, the Friends button sits in the control bar, next to Substitutions.",
      },
    ],
  },
  {
    version: "4.35.1",
    date: "2026-10-27",
    items: [
      {
        pt: "Amigos e chat também durante a partida ao vivo.",
        en: "Friends and chat during the live match too.",
      },
      {
        pt: "Na lateral do campo, o técnico aparece só pela cabeça.",
        en: "On the touchline, the manager is shown as a head only.",
      },
    ],
    fixes: [
      {
        pt: "Entrar no mundo público pela tela inicial não pergunta mais como você quer jogar.",
        en: "Joining the public world from the start screen no longer asks how you want to play.",
      },
      {
        pt: "Botões da tela inicial alinhados.",
        en: "Start screen buttons lined up.",
      },
    ],
  },
  {
    version: "4.35",
    date: "2026-10-27",
    items: [
      {
        pt: "Mundo público: qualquer técnico pode entrar num clube das 10 principais ligas e jogar junto com os outros.",
        en: "Public world: any manager can join a club from the 10 main leagues and play alongside the others.",
      },
      {
        pt: "O mundo público avança quatro vezes por dia (9h, 13h, 18h e 22h, horário de Brasília); no dia do seu jogo, jogue ao vivo ou simule.",
        en: "The public world moves on four times a day (9am, 1pm, 6pm and 10pm, Brasília time); on your match day, play live or simulate.",
      },
      {
        pt: "Hall da fama: cada edição do mundo público guarda os melhores técnicos.",
        en: "Hall of fame: each edition of the public world keeps its best managers.",
      },
      {
        pt: "Painel de amigos maior.",
        en: "Bigger friends panel.",
      },
    ],
  },
  {
    version: "4.34.4",
    date: "2026-10-26",
    items: [
      {
        pt: "Partida: os técnicos à beira do campo agora parecem pessoas vistas de cima.",
        en: "Match: the managers on the touchline now look like people seen from above.",
      },
      {
        pt: "Amigos: o painel e as janelas de conversa ficaram maiores.",
        en: "Friends: the panel and the chat windows are bigger.",
      },
    ],
  },
  {
    version: "4.34.3",
    date: "2026-10-24",
    items: [
      {
        pt: "Chuva: a bola molhada escorrega um pouco menos, e os jogos com chuva têm quase o mesmo número de gols dos outros.",
        en: "Rain: the wet ball skids a little less, and rainy games now have almost as many goals as the others.",
      },
    ],
    fixes: [
      {
        pt: "Liga de amigos: um gol anulado pelo VAR não trava mais o placar ao vivo do amigo.",
        en: "Friends' league: a goal ruled out by VAR no longer freezes your friend's live score.",
      },
      {
        pt: "Liga de amigos: os resultados dos amigos não se perdem mais quando um dia falha e é refeito.",
        en: "Friends' league: friends' results are no longer lost when a day fails and runs again.",
      },
    ],
  },
  {
    version: "4.34.2",
    date: "2026-10-23",
    items: [
      {
        pt: "Liga de amigos: o selo com o apelido do outro técnico aparece também nos Jogos da liga, na tabela do Painel e no elenco do clube dele.",
        en: "Friends' league: the other manager's nickname badge also shows in the league Fixtures, the Dashboard table and his club's squad.",
      },
      {
        pt: "A barra superior não muda mais de tamanho enquanto a liga de amigos avança.",
        en: "The top bar no longer changes size while the friends' league advances.",
      },
      {
        pt: "Recarregar a página no meio da partida não tira mais o seu placar ao vivo da tela dos amigos.",
        en: "Reloading the page mid-match no longer hides your live score from your friends.",
      },
      {
        pt: "Duas ligas do mesmo dono mostram o seu clube ao lado do nome para não se confundirem.",
        en: "Two leagues with the same owner show your club next to the name so they don't get mixed up.",
      },
      {
        pt: "Jogo em campo neutro avisa que o clima não afeta a partida.",
        en: "A neutral venue match says the weather does not affect the game.",
      },
    ],
  },
  {
    version: "4.34.1",
    date: "2026-10-23",
    items: [
      {
        pt: "Liga de amigos: a liga aparece como \"Liga de <apelido do dono>\" em Amigos, no chat e no convite, em vez do clube do dono.",
        en: "Friends' league: the league shows as \"<owner's nickname>'s league\" in Friends, in the chat and in the invite, instead of the owner's club.",
      },
      {
        pt: "Jogar a primeira partida sem ter salvo a tática não manda mais para a Formação: o time entra com a escalação automática.",
        en: "Playing your first match without saving tactics no longer sends you to Formation: the team starts with the automatic lineup.",
      },
      {
        pt: "O placar ao vivo dos amigos mostra o minuto do jogo andando, não só o minuto do último gol.",
        en: "Your friends' live scores show the match clock moving, not just the minute of the last goal.",
      },
      {
        pt: "O resultado provisório da partida ao vivo mostra o árbitro, e as substituições aparecem com o título certo.",
        en: "The provisional result of a live match shows the referee, and substitutions have the right heading.",
      },
    ],
  },
  {
    version: "4.34",
    date: "2026-10-19",
    items: [
      {
        pt: "Liga de amigos: o resultado de cada jogo dos amigos aparece no canto da tela assim que o dia roda.",
        en: "Friends' league: each of your friends' results shows in the corner as soon as the day is played.",
      },
      {
        pt: "Nova aba Rivais na liga: posição, forma, último resultado e próximo jogo de cada amigo, e a aba Resultados com todos os jogos.",
        en: "New Rivals tab in the league: each friend's position, form, last result and next game, plus a Results tab with every game.",
      },
      {
        pt: "Placar ao vivo dos amigos que estão jogando, inclusive numa faixa acima do campo durante a sua partida.",
        en: "Live scores of friends who are playing, including a strip above the pitch during your own match.",
      },
      {
        pt: "Resenha: reaja aos jogos dos amigos com um ícone ou uma frase pronta, que vai para o chat da liga.",
        en: "Banter: react to your friends' games with an icon or a ready line, posted to the league chat.",
      },
    ],
  },
  {
    version: "4.33",
    date: "2026-10-19",
    items: [
      {
        pt: "No primeiro acesso você escolhe seu apelido: ele fica preso à conta e é como os amigos te acham e te veem no chat.",
        en: "On your first sign-in you pick your nickname: it stays with your account and is how friends find and see you in the chat.",
      },
      {
        pt: "Amigos mais simples: só o seu apelido, e você adiciona amigos buscando o apelido deles.",
        en: "Simpler Friends: just your nickname, and you add friends by searching for theirs.",
      },
      {
        pt: "Aviso no canto da tela quando chega mensagem de um amigo ou da liga; clique para abrir a conversa.",
        en: "A popup in the corner when a friend or your league sends a message; click it to open the chat.",
      },
      {
        pt: "Liga de amigos: na classificação, seu clube fica destacado e os clubes dos outros técnicos têm o apelido deles.",
        en: "Friends' league: in the standings your club is highlighted and the other managers' clubs show their nickname.",
      },
    ],
  },
  {
    version: "4.32.1",
    date: "2026-10-19",
    items: [
      {
        pt: "Nacionalidades do novo técnico alinhadas à esquerda.",
        en: "New manager nationalities are now left-aligned.",
      },
    ],
    fixes: [
      {
        pt: "A barra superior não muda mais de tamanho ao abrir cada tela.",
        en: "The top bar no longer resizes when each screen opens.",
      },
      {
        pt: "O apelido não pode mais parecer um código de amigo (FM-...); quem tinha um assim escolhe outro ao abrir Amigos.",
        en: "Nicknames can no longer look like a friend code (FM-...); anyone with one picks a new one when opening Friends.",
      },
    ],
  },
  {
    version: "4.32",
    date: "2026-10-18",
    items: [
      {
        pt: "O clima agora influencia as partidas: chuva deixa a bola escorregadia, neve pesa o jogo, vento atrapalha as bolas altas, o calor cansa mais e o frio aumenta o risco de lesão. A prévia avisa o efeito; estádios cobertos protegem da chuva, da neve e do vento.",
        en: "Weather now affects matches: rain makes the ball slippery, snow slows the game, wind spoils high balls, heat tires players faster and cold raises the injury risk. The preview tells you the effect; covered stadiums keep out rain, snow and wind.",
      },
    ],
  },
  {
    version: "4.31.4",
    date: "2026-10-18",
    items: [
      { pt: "Nos jogos à noite, o brilho dos refletores nos cantos do campo é um degradê suave, sem os arcos marcados.", en: "In night matches, the floodlight glow in the pitch's corners is a smooth fade, without the visible arcs." },
    ],
  },
  {
    version: "4.31.3",
    date: "2026-10-17",
    items: [
      { pt: "A sombra dos jogadores ficou redonda e logo embaixo de cada um.", en: "Player shadows are now round and right under each player." },
    ],
  },
  {
    version: "4.31.2",
    date: "2026-10-17",
    items: [
      { pt: "Os jogos começam nos horários típicos de cada liga (sábado às 15:00 na Inglaterra, 15:30 na Alemanha, noites de Champions às 21:00), então o sol e a sombra batem com o horário de verdade.", en: "Matches kick off at each league's usual times (Saturday 3 pm in England, 3:30 pm in Germany, Champions League nights at 9 pm), so the sun and the shadows match the real hour." },
      { pt: "Com o sol baixo, a sombra dos jogadores fica um pouco mais comprida.", en: "With a low sun, the players' shadows get a little longer." },
    ],
  },
  {
    version: "4.31.1",
    date: "2026-10-17",
    items: [
      { pt: "Todos os clubes das principais ligas agora têm o estádio real, e a altura das arquibancadas ficou mais realista em estádios que pareciam altos demais.", en: "Every club in the main leagues now has its real stadium, and the stands' height is more realistic in grounds that looked too tall." },
      { pt: "A partida ao vivo não acumula mais memória da sombra do estádio de um jogo para outro.", en: "The live match no longer keeps the stadium shadow's memory from one match to the next." },
    ],
  },
  {
    version: "4.31",
    date: "2026-10-17",
    items: [
      { pt: "Estádios reais nas principais ligas: a sombra segue a posição de verdade do sol sobre cada estádio, pela orientação do campo, a altura das arquibancadas, a data e o horário do jogo. No inverno à tarde ela cobre quase o campo; no verão ao meio-dia fica curta.", en: "Real stadiums in the main leagues: the shadow follows the sun's true position over each ground, from the pitch's orientation, the stands' height, the date and the kickoff time. On a winter afternoon it covers most of the pitch; at a summer midday it is short." },
      { pt: "O pôr do sol de cada jogo nessas ligas é o real, e estádios com teto retrátil o fecham com chuva, neve ou frio.", en: "Each match's sunset in those leagues is the real one, and stadiums with a retractable roof close it in rain, snow or the cold." },
    ],
  },
  {
    version: "4.30",
    date: "2026-10-17",
    items: [
      { pt: "Cada estádio tem a sua sombra: o contorno da cobertura, o canto e, em alguns, a arquibancada do fundo também faz sombra. Estádios cobertos não têm sol nem chuva no gramado.", en: "Every stadium casts its own shadow: the roof line, the corner and, in some, the end stand too. Covered stadiums have no sun or rain on the pitch." },
      { pt: "A sombra do estádio tem a borda suave e cresce aos poucos até o pôr do sol; o lado ao sol fica mais claro.", en: "The stadium shadow has a soft edge and grows gradually toward sunset; the sunlit side is brighter." },
    ],
  },
  {
    version: "4.29.3",
    date: "2026-10-17",
    items: [
      { pt: "Sombra do estádio na partida como na TV: grande, de borda nítida, crescendo até o fim da tarde, com o lado ao sol mais claro.", en: "Stadium shadow in the match like on TV: large and crisp, growing toward sunset, with the sunlit side brighter." },
    ],
    fixes: [
      { pt: "As sombras dos jogadores ficaram curtas, junto ao corpo.", en: "Player shadows are now short, close to the body." },
    ],
  },
  {
    version: "4.29.2",
    date: "2026-10-17",
    items: [
      {
        pt: "Sombras dos jogadores mais naturais: suaves, curtas e afinando na ponta.",
        en: "More natural player shadows: soft, short and tapering at the tip.",
      },
    ],
  },
  {
    version: "4.29.1",
    date: "2026-10-17",
    items: [
      {
        pt: "A partida ao vivo voltou a abrir (ficava com a tela preta na 4.29).",
        en: "The live match opens again (it went black in 4.29).",
      },
    ],
  },
  {
    version: "4.29",
    date: "2026-10-16",
    items: [
      {
        pt: "A luz da partida segue o horário: sol e sombras à tarde, fim de tarde alaranjado e refletores à noite.",
        en: "The match light follows the time of day: sun and shadows in the afternoon, a golden late afternoon and floodlights at night.",
      },
      {
        pt: "Chuva e neve caem sobre o campo, e o tempo nublado deixa a luz cinzenta.",
        en: "Rain and snow fall over the pitch, and cloudy weather greys the light.",
      },
    ],
  },
  {
    version: "4.28",
    date: "2026-10-16",
    items: [
      {
        pt: "Tipos de grama: natural, híbrida ou sintética, trocados como obra na tela Clube.",
        en: "Grass types: natural, hybrid or synthetic, changed as a works in the Club screen.",
      },
      {
        pt: "Escolha o padrão de corte do gramado: listras, xadrez, diagonal ou círculos.",
        en: "Pick the pitch mowing pattern: stripes, checker, diagonal or circles.",
      },
      {
        pt: "O gramado da partida mostra o desgaste: de nítido a terra e lama.",
        en: "The match pitch shows its wear: from crisp to dirt and mud.",
      },
      {
        pt: "Tipo e condição do gramado na partida ao vivo e na prévia.",
        en: "Grass type and condition in the live match and the preview.",
      },
    ],
    fixes: [
      {
        pt: "A linha de um save com amigos na tela inicial não vaza mais por baixo do botão Continuar.",
        en: "A friends' save row on the start screen no longer runs under the Continue button.",
      },
    ],
  },
  {
    version: "4.27",
    date: "2026-10-16",
    items: [
      {
        pt: "Classificação dos técnicos na liga de amigos, por temporada, com a temporada atual ao vivo",
        en: "Managers' ranking in the friends league, by season, with the current season live",
      },
    ],
  },
  {
    version: "4.26",
    date: "2026-10-16",
    items: [
      {
        pt: "Jogo contra outro técnico da liga: a prévia completa aparece e o botão Simular joga a partida",
        en: "Match against another manager in the league: the full preview shows up and the Simulate button plays the match",
      },
      {
        pt: "Propostas de transferência e empréstimo entre técnicos da liga, com contraproposta, pela caixa de entrada",
        en: "Transfer and loan offers between managers in the league, with counter-offers, through the inbox",
      },
    ],
  },
  {
    version: "4.25.1",
    date: "2026-10-15",
    items: [
      {
        pt: "Liga de amigos: o resumo de vários dias mostra o treino e a folga de todos os dias, somados por jogador",
        en: "Friends league: the summary of several days shows the training and rest of every day, summed per player",
      },
    ],
  },
  {
    version: "4.25",
    date: "2026-10-15",
    items: [
      {
        pt: "Jogue com amigos: no novo jogo, escolha \"Com amigos\" para criar uma liga de até 8 técnicos, cada um no seu clube",
        en: "Play with friends: in a new game, pick \"With friends\" to create a league of up to 8 managers, each at their own club",
      },
      {
        pt: "Convide pelo link da liga ou pela lista de amigos; o dono começa a temporada, define o prazo, remove técnicos e pode passar a liga a outro",
        en: "Invite friends with the league link or from your friends list; the owner starts the season, sets the deadline, removes managers and can hand the league over",
      },
      {
        pt: "A liga avança sozinha: cada técnico marca até quando está pronto, joga ao vivo ou simula os próprios jogos, e quem perder o prazo tem os dias decididos pelo assistente",
        en: "The league moves on by itself: each manager marks how far they are ready, plays or simulates their own matches, and anyone who misses the deadline has those days decided by the assistant",
      },
    ],
  },
  {
    version: "4.24.1",
    date: "2026-10-15",
    items: [
      {
        pt: "Preparação do multiplayer: o mundo do save passa a guardar cada técnico à parte, pronto para receber amigos",
        en: "Multiplayer groundwork: the save's world now keeps each manager separately, ready to welcome friends",
      },
    ],
    fixes: [
      {
        pt: "O apelido escolhido fica fixo na sua conta e não pode mais ser trocado",
        en: "Your chosen nickname is now fixed to your account and can no longer be changed",
      },
    ],
  },
  {
    version: "4.24",
    date: "2026-10-14",
    items: [
      {
        pt: "Amigos na barra de baixo: escolha um apelido, adicione técnicos pelo apelido ou pelo código de amigo e veja quem está online ou jogando, com o clube",
        en: "Friends in the bottom bar: pick a nickname, add managers by nickname or friend code and see who is online or playing, with their club",
      },
      {
        pt: "Converse com seus amigos em janelas de chat que ficam abertas enquanto você joga; dá para bloquear quem incomoda",
        en: "Chat with your friends in windows that stay open while you play; you can block anyone who bothers you",
      },
    ],
  },
  {
    version: "4.23",
    date: "2026-10-14",
    items: [
      {
        pt: "Coletivas de imprensa nos momentos marcantes (clássicos, mata-matas, reta final, títulos, goleadas): suas respostas mexem na moral, na diretoria e na torcida, e o que você promete é cobrado depois",
        en: "Press conferences at key moments (derbies, knockouts, run-in, titles, heavy defeats): your answers move morale, the board and the fans, and your promises are held against you later",
      },
      {
        pt: "Página de notícias do mundo: goleadas, zebras, campeões, grandes transferências, técnicos demitidos, prêmios e a repercussão das suas coletivas",
        en: "World news page: thrashings, upsets, champions, big transfers, sacked managers, awards and how your press conferences landed",
      },
    ],
  },
  {
    version: "4.22.3",
    date: "2026-10-13",
    items: [
      {
        pt: "Nova responsabilidade na Equipe técnica: o olheiro-chefe pode montar sozinho as missões dos olheiros toda segunda, focando a posição mais carente do elenco e os países que cada olheiro conhece.",
        en: "New responsibility in the Staff screen: the chief scout can set up the scouts' missions on his own every Monday, focusing on the squad's weakest position and the countries each scout knows.",
      },
      {
        pt: "Convocação para os jogos da base com duração: próximo jogo, 3 ou 5 jogos, até você tirar ou até o jogador ganhar ritmo.",
        en: "Youth-game call-ups now have a duration: next game, 3 or 5 games, until you remove them or until the player gains match rhythm.",
      },
      {
        pt: "A lista de convocação da base fica organizada em colunas por posição.",
        en: "The youth call-up list is now organised in columns by position.",
      },
    ],
    fixes: [
      {
        pt: "O atacante sozinho na frente do goleiro agora finaliza em vez de tocar para um companheiro em posição pior.",
        en: "A striker alone in front of the goalkeeper now shoots instead of passing to a teammate in a worse position.",
      },
      {
        pt: "A aba Inscritos do elenco mostra a estrela dos jogadores.",
        en: "The squad's Registration tab now shows the players' stars.",
      },
    ],
  },
  {
    version: "4.22.2",
    date: "2026-10-12",
    items: [
      {
        pt: "As instalações de cada clube começam de acordo com o tamanho dele: clubes ricos chegam com estrutura melhor, e cada item tem o seu próprio nível.",
        en: "Each club's facilities now start according to its size: rich clubs begin with better grounds, and every item has its own level.",
      },
      {
        pt: "Na barra superior, a aba Formação vem antes de Clube.",
        en: "In the top bar, the Formation tab now comes before Club.",
      },
    ],
    fixes: [
      {
        pt: "Reformar um item quase novo não mostra mais três opções iguais de \"até 100%\".",
        en: "Repairing an almost new item no longer shows three identical \"to 100%\" options.",
      },
    ],
  },
  {
    version: "4.22.1",
    date: "2026-10-12",
    items: [
      {
        pt: "Os jogos das seleções têm mais gols, perto do futebol real, sem mudar quem costuma vencer.",
        en: "National team matches have more goals, close to real football, without changing who usually wins.",
      },
      {
        pt: "O avanço dos dias ficou mais rápido.",
        en: "Advancing days is faster.",
      },
    ],
    fixes: [
      {
        pt: "Partida pausada não volta mais a correr sozinha ao fechar o painel de substituições.",
        en: "A paused match no longer resumes by itself when you close the substitutions panel.",
      },
      {
        pt: "Copas nacionais não marcam mais fases em data FIFA nem em dia de jogo da liga.",
        en: "National cups no longer schedule rounds on FIFA dates or on league match days.",
      },
      {
        pt: "No Painel, o cartão do clube mostra o seu clube mesmo quando o próximo jogo é da seleção.",
        en: "On the Dashboard, the club card shows your club even when the next match is the national team's.",
      },
    ],
  },
  {
    version: "4.22",
    date: "2026-10-12",
    items: [
      {
        pt: "Técnico de seleção: quando uma seleção demite o técnico, ela pode convidar você, sem você deixar o seu clube. A da sua nacionalidade convida mais.",
        en: "National team coach: when a national team sacks its coach it may offer you the job, and you keep your club. Your own country is more likely to call.",
      },
      {
        pt: "Na aba Minha seleção você escolhe os 23 convocados (a sugestão chega uma semana antes), a formação, o estilo e a escalação.",
        en: "In My national team you pick the 23 called up (the suggestion arrives a week before), the formation, the style and the starting XI.",
      },
      {
        pt: "Os jogos da sua seleção param o avanço: veja ao vivo ou simule, com prorrogação e pênaltis no mata-mata.",
        en: "Your national team's games stop the advance: watch them live or simulate them, with extra time and penalties in knockout games.",
      },
      {
        pt: "A federação cobra uma meta em cada competição; falhar feio custa o cargo na seleção. Você também pode deixar a seleção quando quiser.",
        en: "The federation sets a goal for each competition; failing badly costs you the national job. You can also leave the national team at any time.",
      },
      {
        pt: "Novas conquistas: Herói nacional (vitórias com a seleção) e duas secretas.",
        en: "New achievements: National hero (wins with your national team) and two secret ones.",
      },
      {
        pt: "Os jogos salvos guardam a versão do jogo; um save de versão anterior avisa antes de carregar.",
        en: "Saved games now record the game version; a save from an earlier version warns you before loading.",
      },
    ],
  },
  {
    version: "4.21.2",
    date: "2026-10-12",
    items: [
      {
        pt: "Olheiros: cabeceio entra nos filtros de atributos e a coluna Forma mostra a fase real de cada jogador.",
        en: "Scouting: heading joins the attribute filters and the Form column shows each player's real form.",
      },
      {
        pt: "Harry Kane volta a ser tratado como craque mundial e é convocado pela Inglaterra.",
        en: "Harry Kane is rated as a world-class striker again and gets called up by England.",
      },
    ],
    fixes: [
      {
        pt: "Textos em inglês traduzidos com o jogo em português: olheiros, caixa de entrada, painel, resumo do dia, prévia da partida, renovação, extrato e transmissão (que agora diz o nome do clube).",
        en: "English texts translated when playing in Portuguese: scouting, inbox, dashboard, day summary, match preview, renewals, ledger and the commentary (which now names the club).",
      },
      {
        pt: "Datas e números no formato do seu idioma, inclusive nas instalações do clube e nas finanças.",
        en: "Dates and numbers in your language's format, including the club facilities and finances.",
      },
      {
        pt: "A lista do filtro do extrato abre escura no Windows, o gráfico de público não cria mais rolagem lateral e as abas da barra superior cabem com rótulo.",
        en: "The ledger filter list opens dark on Windows, the attendance chart no longer adds a sideways scroll and the top bar tabs keep their labels.",
      },
    ],
  },
  {
    version: "4.21.1",
    date: "2026-10-12",
    items: [
      {
        pt: "Calendário das ligas com mando alternado: nenhum time joga mais de duas rodadas seguidas em casa ou fora, e cada um faz metade dos jogos de cada turno em casa.",
        en: "League fixtures now alternate home and away: no team plays more than two rounds in a row at home or away, and every team plays half of each half-season at home.",
      },
    ],
    fixes: [
      {
        pt: "O time de um dos clubes de cada liga jogava todo o primeiro turno em casa e todo o segundo fora; agora o mando alterna.",
        en: "One club in every league played the whole first half of the season at home and the whole second half away; home and away now alternate.",
      },
      {
        pt: "Os jogos dos torneios sub-21 e sub-19 não caem mais nas datas FIFA nem durante os torneios de seleções.",
        en: "Under-21 and under-19 games no longer fall on international break dates or during national team tournaments.",
      },
    ],
  },
  {
    version: "4.21",
    date: "2026-10-12",
    items: [
      {
        pt: "Seleções nacionais: todas as seleções do mundo, com técnico, ranking da FIFA e jogos nas datas FIFA de março, junho, setembro, outubro e novembro.",
        en: "National teams: every national team of the world, with a coach, a FIFA ranking and games in the March, June, September, October and November international breaks.",
      },
      {
        pt: "Eliminatórias, Eurocopa e Copa América em 2028 e Copa do Mundo com 48 seleções em 2030, com grupos, mata-mata, artilharia e prêmios do torneio.",
        en: "Qualifiers, the Euro and the Copa América in 2028 and a 48-team World Cup in 2030, with groups, knockout rounds, top scorers and tournament awards.",
      },
      {
        pt: "As ligas, copas e continentais param nas datas FIFA e durante os torneios: algumas rodadas passam para o meio de semana.",
        en: "Leagues, cups and continental competitions stop for the international breaks and the tournaments: some rounds move to midweek.",
      },
      {
        pt: "Seus jogadores convocados ficam fora do clube durante a data FIFA: jogam pela seleção, cansam, podem se lesionar e voltam com a moral em alta; a caixa de entrada avisa a convocação e a volta.",
        en: "Your called-up players leave the club for the break: they play for their country, get tired, can get injured and come back happier; the inbox tells you when they go and come back.",
      },
      {
        pt: "Nova aba Seleções: ranking, competições com tabelas e chaveamento, e os convocados de cada seleção. A ficha do jogador mostra os jogos, gols e títulos pela seleção.",
        en: "New National teams tab: ranking, competitions with tables and brackets, and each country's squad. The player screen shows his caps, goals and titles for his country.",
      },
      {
        pt: "Uma boa campanha num torneio valoriza o jogador, e os prêmios do torneio contam para o melhor do mundo.",
        en: "A good tournament raises a player's value, and the tournament awards count for the world player of the year.",
      },
    ],
  },
  {
    version: "4.20",
    date: "2026-10-12",
    items: [
      {
        pt: "Conquistas: 93 desafios da sua carreira, de títulos e viradas a jovens da base e estádio ampliado, em bronze, prata e ouro, mais 15 conquistas secretas que só se revelam quando acontecem.",
        en: "Achievements: 93 challenges for your career, from titles and comebacks to academy graduates and a bigger stadium, in bronze, silver and gold, plus 15 secret ones revealed only when they happen.",
      },
      {
        pt: "Os pontos das conquistas liberam molduras para o rosto do técnico, selos e um título exibido no Painel e no ranking de técnicos.",
        en: "Achievement points unlock frames for your manager's face, badges and a title shown on the Dashboard and in the manager ranking.",
      },
      {
        pt: "Enfeites para o seu estádio: faixa, bandeirão e mosaico na torcida da casa nos seus jogos em casa.",
        en: "Decorations for your stadium: a banner, a giant flag and a mosaic in the home end at your home games.",
      },
      {
        pt: "Seu técnico tem cinco atributos (Motivação, Tática, Base, Negociação e Disciplina) que sobem com conquistas e títulos e mudam um pouco o dia a dia do clube.",
        en: "Your manager has five attributes (Motivation, Tactics, Youth, Negotiation and Discipline) that grow with achievements and titles and slightly shape the club's day to day.",
      },
      {
        pt: "Loja de conquistas: crie um jogador com nome, posição e nacionalidade para a sua base, ou traga de volta uma lenda aposentada do mundo, com 17 anos.",
        en: "Achievements shop: create a player with your chosen name, position and nationality for your academy, or bring back a retired world legend at 17.",
      },
    ],
  },
  {
    version: "4.19.1",
    date: "2026-10-12",
    items: [
      {
        pt: "As listas de opção (como o filtro do extrato em Finanças) abrem com o fundo escuro do jogo e o texto legível.",
        en: "Drop-down lists (like the ledger filter in Finances) open with the game's dark background and readable text.",
      },
    ],
  },
  {
    version: "4.19",
    date: "2026-10-11",
    items: [
      {
        pt: "Estatísticas: marque competições como favoritas na estrela ao lado da lista e troque entre elas com um clique.",
        en: "Stats: star your favourite competitions next to the list and switch between them with one click.",
      },
      {
        pt: "Relatório de problema: capture uma área da tela arrastando um retângulo, sem precisar salvar um print.",
        en: "Problem report: capture an area of the screen by dragging a rectangle, no saved screenshot needed.",
      },
      {
        pt: "Central de Olheiros: a busca só roda ao clicar em Pesquisar (ou Enter), os atributos ficam em grupos com valores digitados (1–100), dá para salvar quantos filtros quiser com nome, e cada linha mostra a bandeira e o escudo do clube.",
        en: "Scouting centre: the search runs only when you click Search (or press Enter), attributes are grouped with typed values (1–100), you can save as many named filters as you like, and each row shows the flag and the club crest.",
      },
      {
        pt: "Na busca do olheiro: filtro \"Cabe no orçamento\" (taxa e salário que o clube pode pagar) e o interesse de cada jogador em vir para o seu clube (Interessado, Hesitante, Não viria), pelo que o olheiro percebe.",
        en: "In the scout search: a \"Fits the budget\" filter (fee and wage your club can pay) and each player's interest in joining your club (Interested, Hesitant, Would not come), as your scout reads it.",
      },
      {
        pt: "Instalações com desenho: cada parte do estádio, do CT e da base aparece como um cartão ilustrado com nível e condição; ao escolher uma, o painel mostra a obra, o custo, o prazo e a resposta da diretoria.",
        en: "Facilities drawn: every part of the stadium, training ground and academy is an illustrated card with its level and condition; pick one to see the works, cost, time and the board's answer.",
      },
      {
        pt: "Uma obra por vez em cada área (estádio, CT e base). Obras maiores levam mais tempo e custam mais; reformas pequenas pagas na hora não entram no limite.",
        en: "One works at a time in each area (stadium, training ground, academy). Bigger works take longer and cost more; small repairs paid on the spot don't count.",
      },
      {
        pt: "História do clube com ídolos e lendas (em atividade, aposentados ou que saíram) e um quadro de fatos e curiosidades.",
        en: "Club history now has idols and legends (active, retired or gone) and a facts panel.",
      },
      {
        pt: "Na partida, o nome do estádio e o público aparecem abaixo do placar.",
        en: "In the match, the stadium name and the crowd show under the scoreboard.",
      },
      {
        pt: "A lista de jogadores ao lado do campo mostra posição, nota, fôlego, gols e assistências, e destaca quem levou cartão.",
        en: "The player list beside the pitch shows position, rating, fitness, goals and assists, and highlights booked players.",
      },
      {
        pt: "Os lances da partida podem abrir numa janela que você move e fecha.",
        en: "The match events can open in a window you move and close.",
      },
      {
        pt: "No mapa de posse, escolha o time e o período com botões lado a lado.",
        en: "On the possession map, pick the team and the period with side-by-side buttons.",
      },
      {
        pt: "Campo mais vivo: maca nas lesões, técnicos andando na área técnica, bancos de reservas, rede balançando, torcida pulando e comemoração no gol.",
        en: "A livelier pitch: a stretcher for injuries, managers pacing the technical area, benches, the net shaking, fans jumping and a goal celebration.",
      },
      {
        pt: "Depois de uma bola dividida, quem perdeu a corrida volta para a posição em vez de continuar correndo para cima de quem ficou com a bola: menos jogadores amontoados perto da bola.",
        en: "After a contested ball, the players who lost the race head back to their positions instead of running on at whoever won it: fewer players bunched around the ball.",
      },
    ],
    fixes: [
      {
        pt: "Nomes de clubes com acento e sem sufixos de dado em mais ligas (Beşiktaş, Peñarol, Atlético Madrid, León...).",
        en: "Club names with their accents and without data suffixes in more leagues (Beşiktaş, Peñarol, Atlético Madrid, León...).",
      },
    ],
  },
  {
    version: "4.18",
    date: "2026-10-11",
    items: [
      {
        pt: "O árbitro agora erra de vez em quando: pênalti inventado ou não marcado, impedimento que passa, cartão errado. Árbitros piores erram mais.",
        en: "Referees now get calls wrong now and then: a soft or missed penalty, an offside let go, the wrong card. Weaker referees make more mistakes.",
      },
      {
        pt: "VAR na 1ª divisão das 10 ligas principais, nas competições continentais e nas copas a partir das quartas: a maioria dos erros é corrigida numa revisão rápida, e um gol pode ser anulado.",
        en: "VAR in the top division of the 10 main leagues, in continental competitions and in cups from the quarter-finals: most mistakes are fixed in a quick check, and a goal can be ruled out.",
      },
      {
        pt: "Reclame com o árbitro depois de um lance contra o seu time: às vezes ele fica mais atento ao adversário, mas você pode levar cartão e ser suspenso (o auxiliar faz as substituições).",
        en: "Complain to the referee after a call against your team: sometimes he watches the opponent more closely, but you may be booked and banned (your assistant makes the substitutions).",
      },
      {
        pt: "Estatísticas → Árbitros mostra os erros por jogo e as revisões do VAR.",
        en: "Stats → Referees shows mistakes per match and VAR checks.",
      },
    ],
  },
  {
    version: "4.17.2",
    date: "2026-10-11",
    items: [
      {
        pt: "Elenco: novas colunas de jogos (J) e assistências (A), e cada sigla da tabela explicada no cabeçalho e numa legenda. A aba Inscritos lista os jogadores por posição.",
        en: "Squad: new matches played (MP) and assists (A) columns, with every column abbreviation explained in its header and in a legend. The Registration tab lists the players by position.",
      },
    ],
    fixes: [
      {
        pt: "Os pontas e laterais jogam do lado certo na partida: o da esquerda fica na esquerda nos dois tempos, também no time visitante e no adversário.",
        en: "Wingers and full-backs play on the correct side in the match: the left one stays on the left in both halves, for the away side and the opponent too.",
      },
      {
        pt: "Jogadores novos que vieram sem nacionalidade (por exemplo, três do Inter Miami) agora têm a bandeira.",
        en: "New players who came without a nationality (for example, three at Inter Miami) now have their flag.",
      },
    ],
  },
  {
    version: "4.17.1",
    date: "2026-10-09",
    items: [
      {
        pt: "MLS: volta o limite real de 8 estrangeiros, e quem tem green card conta como doméstico (3 temporadas no clube, chegada ao clube com até 21 anos ou green card próprio). O selo \"Green card\" aparece na aba Inscritos.",
        en: "MLS: back to the real limit of 8 international players, and green card holders count as domestic (3 seasons at the club, joined the club aged 21 or under, or their own green card). A \"Green card\" tag shows in the Registration tab.",
      },
    ],
  },
  {
    version: "4.17",
    date: "2026-10-09",
    items: [
      { pt: "Árbitros com nome, rosto e nacionalidade em todos os jogos; nas principais ligas, os árbitros e árbitras de verdade", en: "Referees with a name, face and nationality in every match; in the main leagues, the real referees" },
      { pt: "Cada árbitro tem um estilo: tolerante, equilibrado ou rigoroso, com mais ou menos faltas e cartões", en: "Every referee has a style: lenient, balanced or strict, with more or fewer fouls and cards" },
      { pt: "O árbitro do jogo aparece na prévia, no resumo da partida, no resultado e no campo com os bandeirinhas", en: "The match referee shows up in the preview, the match summary, the result and on the pitch with the assistants" },
      { pt: "Os melhores árbitros apitam os jogos grandes; nas copas continentais, sempre um árbitro de outro país", en: "The best referees take the big matches; in continental cups, always a referee from another country" },
      { pt: "Nova aba Árbitros em Estatísticas, com jogos e cartões por jogo de cada árbitro na temporada", en: "New Referees tab in Stats, with each referee's matches and cards per match in the season" },
    ],
  },
  {
    version: "4.16",
    date: "2026-10-09",
    items: [
      { pt: "Jogo da liga que cairia no mesmo dia ou colado em um jogo de copa ou continental do clube é remarcado para o meio de semana livre mais próximo", en: "A league match that would fall on the same day as, or right next to, a club's cup or continental match is moved to the nearest free midweek day" },
      { pt: "Aviso na caixa de entrada quando um jogo do seu clube muda de data, e \"Remarcado de…\" na prévia, na semana do Painel e na tabela de jogos", en: "An inbox message when one of your club's matches changes date, and \"Rescheduled from…\" in the preview, the Dashboard week and the fixtures list" },
      { pt: "Os clubes do mundo começam com o técnico atual de cada um", en: "Clubs around the world start with their current head coach" },
    ],
    fixes: [
      { pt: "Técnicos desatualizados corrigidos: o PSG é de Luis Enrique, não mais de Carlo Ancelotti", en: "Outdated head coaches fixed: PSG is managed by Luis Enrique, no longer Carlo Ancelotti" },
    ],
  },
  {
    version: "4.15",
    date: "2026-10-09",
    items: [
      { pt: "Inscrição por competição: cada clube tem uma lista de inscritos na liga, na copa e no torneio continental, com as regras de cada lugar (limite de estrangeiros, mínimo de formados no clube ou no país, sub-21 livres)", en: "Registration per competition: every club has a squad list for the league, the cup and the continental tournament, with each one's rules (foreign player limit, minimum of home-grown players, under-21s free)" },
      { pt: "A lista só muda com a janela de transferências aberta (no torneio continental, também antes de cada fase); quem chega fora do prazo espera a próxima janela", en: "The list only changes with the transfer window open (in the continental tournament, also before each stage); a player arriving after the deadline waits for the next window" },
      { pt: "A inscrição é automática e você ajusta na nova aba Inscritos do Elenco: incluir, tirar ou voltar ao automático", en: "Registration is automatic and you adjust it on the Squad's new Registration tab: add, remove or go back to automatic" },
      { pt: "Um jogador não inscrito sai da escalação com aviso na prévia da partida; no Brasileirão vale o limite de 9 estrangeiros relacionados por jogo", en: "An unregistered player leaves the lineup with a warning on the match preview; in the Brasileirão the limit of 9 foreign players named per match applies" },
    ],
  },
  {
    version: "4.14.4",
    date: "2026-10-09",
    items: [
      { pt: "As abas da barra superior mostram de novo os nomes quando há espaço", en: "The top bar tabs show their names again when there is room" },
      { pt: "Na partida, quando um jogador seu se lesiona, o jogo pausa e você escolhe quem entra", en: "In the match, when one of your players gets injured, the game pauses and you choose who comes on" },
    ],
  },
  {
    version: "4.14.3",
    date: "2026-10-09",
    items: [
      { pt: "Barra superior com ícones maiores e coloridos, mais fáceis de reconhecer", en: "Top bar with bigger, coloured icons that are easier to recognise" },
      { pt: "A barra inferior mostra quantas pessoas estão jogando agora", en: "The bottom bar shows how many people are playing right now" },
      { pt: "Na partida, um setor do estádio em obra aparece vazio e como canteiro de obras", en: "In the match, a stand under construction shows empty, as a building site" },
      { pt: "Abrir o relato de problema durante a partida pausa o jogo", en: "Opening the problem report during a match pauses the game" },
    ],
    fixes: [
      { pt: "As assistências no resultado da partida não parecem mais uma inicial antes do nome", en: "Assists on the match result no longer look like an initial before the name" },
      { pt: "A posição de cada jogador na partida é a mesma do elenco", en: "Each player's position in the match is the same as in the squad" },
      { pt: "As abas da barra superior voltam a mostrar os nomes ao sair da partida", en: "The top bar tabs show their names again after leaving a match" },
    ],
  },
  {
    version: "4.14.2",
    date: "2026-10-09",
    items: [
      { pt: "As notas dos jogadores foram reajustadas posição por posição: goleiros, defensores, meias e atacantes mantêm o nível de cada setor da liga", en: "Player ratings were readjusted position by position: goalkeepers, defenders, midfielders and forwards keep the level of each line of their league" },
    ],
    fixes: [
      { pt: "Os gols por partida voltaram ao normal nas ligas: o Brasileirão deixou de ter jogos com gols demais", en: "Goals per match are back to normal across the leagues: the Brasileirão no longer has too many goals" },
    ],
  },
  {
    version: "4.14.1",
    date: "2026-10-09",
    items: [
      { pt: "Na partida, os lances do Resumo ficam sempre visíveis, com rolagem própria; o mapa de posse foi para baixo deles e pode ser recolhido", en: "In the match, the Summary's events are always visible, with their own scroll; the possession map moved below them and can be collapsed" },
      { pt: "O Resumo da partida mostra os escudos dos clubes no lugar dos nomes, com o mandante à esquerda", en: "The match Summary shows the club crests instead of the names, with the home side on the left" },
    ],
    fixes: [
      { pt: "Uma falha do servidor ao abrir a prévia ou a partida mostra uma mensagem de erro legível, em vez de um erro de leitura", en: "A server failure when opening the match preview or the match shows a readable error message instead of a parsing error" },
    ],
  },
  {
    version: "4.14",
    date: "2026-10-09",
    items: [
      { pt: "Torneios sub-21 e sub-19 em cada país, com os clubes da primeira divisão, jogados no meio da semana", en: "Under-21 and under-19 tournaments in every country, with the top-flight clubs, played midweek" },
      { pt: "Jovens da base e reservas sem minutos jogam esses torneios: evoluem, ganham ritmo e reclamam menos da falta de jogos", en: "Academy youngsters and reserves without minutes play these tournaments: they improve, get match fitness and complain less about missing games" },
      { pt: "Nova aba Base na tela de Ligas, com tabela, resultados por rodada, artilheiros e melhores notas", en: "New Youth tab on the Leagues screen, with the table, results by round, top scorers and best ratings" },
      { pt: "Jogos da base do seu clube na semana do Painel e na ficha do jogador", en: "Your club's youth games in the Dashboard week and on the player profile" },
      { pt: "Convoque até 11 jogadores para o próximo jogo de cada torneio na aba Base do Elenco", en: "Call up to 11 players for the next game of each tournament on the Squad's Youth tab" },
    ],
  },
  {
    version: "4.13.1",
    date: "2026-10-08",
    items: [
      { pt: "Nomes dos clubes do Brasil e de Portugal com acentos e sem sufixos (São Paulo, Grêmio, Atlético Mineiro, Vitória de Guimarães) (#121)", en: "Brazilian and Portuguese club names now have their accents and no stray suffixes (São Paulo, Grêmio, Atlético Mineiro, Vitória de Guimarães) (#121)" },
    ],
  },
  {
    version: "4.13",
    date: "2026-10-08",
    items: [
      { pt: "Substituições num mini campo: toque num titular e num reserva para trocar, com o banco ordenado por posição", en: "Substitutions on a mini pitch: tap a starter and a substitute to swap them, with the bench sorted by position" },
      { pt: "Toque em dois titulares para trocá-los de posição na partida, sem gastar substituição", en: "Tap two starters to swap their positions during the match, without using a substitution" },
      { pt: "Até 3 cobradores por bola parada, em ordem: cobra o primeiro que estiver em campo", en: "Up to 3 takers per set piece, in order: the first one on the pitch takes it" },
    ],
    fixes: [
      { pt: "Equipe técnica: os efeitos aparecem em texto claro (\"Evolução dos jogadores +6%\", \"Duração das lesões −8%\"), comparados a um profissional médio de 3 estrelas", en: "Coaching staff: effects now read in plain words (\"Player development +6%\", \"Injury duration −8%\"), compared with an average 3-star professional" },
      { pt: "As estrelas da comissão ficam alinhadas entre as linhas, com nota inteira ou com meia estrela", en: "Coaching staff stars now line up across rows, with whole or half-star ratings" },
    ],
  },
  {
    version: "4.12",
    date: "2026-10-08",
    items: [
      { pt: "A partida ganhou árbitro e bandeirinhas, os técnicos à beira do campo e animações de chute de longe, cabeçada e defesa", en: "Matches now show the referee and assistants, both managers on the touchline and animations for long shots, headers and saves" },
      { pt: "Estádio em volta do campo, com a torcida dos dois times proporcional ao público do jogo", en: "A stadium around the pitch, with both sets of fans filling it in proportion to the crowd" },
      { pt: "Clássicos e mata-matas de copa e continental atraem mais público no seu estádio", en: "Derbies and cup or continental knockout ties draw bigger crowds to your stadium" },
    ],
  },
  {
    version: "4.11",
    date: "2026-10-08",
    items: [
      { pt: "Nova aba Clube na barra superior com as instalações do clube (estádio, centro de treinamento e base); Finanças fica só com o dinheiro (#120)", en: "New Club tab in the top bar with the club's facilities (stadium, training ground and academy); Finances keeps only the money (#120)" },
      { pt: "Instalações vivas: gramado, assentos, estrutura, campos de treino, academia, piscina, fisioterapia, refeitório e base, cada um com nível de 1 a 10 e condição que se desgasta com o tempo, os jogos e os treinos", en: "Living facilities: pitch, seats, structure, training pitches, gym, pool, physio room, canteen and academy, each with a level from 1 to 10 and a condition that wears with time, games and training" },
      { pt: "Reforme, reconstrua ou melhore cada item: reformas pequenas o clube paga na hora; as grandes passam pela diretoria", en: "Repair, rebuild or upgrade each item: the club pays small repairs at once; the big works go to the board" },
      { pt: "Gramado ruim causa mais lesões, também nos jogos fora de casa; o jardineiro cuida dos gramados", en: "A bad pitch causes more injuries, away games included; the groundskeeper looks after the pitches" },
      { pt: "CT e base mal cuidados pesam na evolução, na recuperação, na duração das lesões e na safra", en: "A neglected training ground and academy weigh on development, recovery, injury length and the youth intake" },
      { pt: "Jogadores pedem mais para vir a um clube com estrutura ruim, e os muito ambiciosos recusam", en: "Players ask for more to join a club with poor facilities, and the very ambitious refuse" },
    ],
    fixes: [
      { pt: "Na Comissão de Transferências, clique no cabeçalho de uma coluna para ordenar a lista inteira de profissionais livres (clique de novo para inverter)", en: "In the Transfers staff tab, click a column header to sort the whole list of free professionals (click again to reverse)" },
      { pt: "Novo jogo: nacionalidades do técnico alinhadas e em ordem alfabética; o aviso de demissão agora explica que você recebe propostas de outros clubes", en: "New game: the manager's nationalities are aligned and in alphabetical order; the sacking note now explains that you get offers from other clubs" },
    ],
  },
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
  { pt: "Histórico de campeões de todas as competições do mundo", en: "Champions history of every competition in the world" },
  { pt: "Busca por time na tela de ligas", en: "Search by team on the leagues screen" },
  { pt: "Jogo ao vivo entre amigos também com as seleções", en: "Live matches between friends for national teams too" },
];
