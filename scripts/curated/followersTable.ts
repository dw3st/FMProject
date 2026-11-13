/**
 * Real-world social following of the best-known clubs, in millions, all platforms added up (Instagram, Facebook, X,
 * TikTok, YouTube). Rounded figures of 2025: CIES Football Observatory / Goal / BusinessDay for the world top,
 * Ibope Repucom for Brazil, and estimates in the same scale for the rest. Matched to the world by league + name in
 * `buildFollowerCorrections.ts`; a row that matches no club fails the build.
 *
 * [league slug or "" for any league, club name as in the world, millions]
 */
export const FOLLOWERS_M: [string, string, number][] = [
  // Spain
  ["la_liga", "Real Madrid", 470], ["la_liga", "Barcelona", 420], ["la_liga", "Atlético Madrid", 75], ["la_liga", "Sevilla", 17],
  ["la_liga", "Valencia", 16], ["la_liga", "Real Betis", 12], ["la_liga", "Athletic Club", 9], ["la_liga", "Villarreal", 8],
  ["la_liga", "Real Sociedad", 6],
  // England
  ["premier_league", "Manchester United", 230], ["premier_league", "Manchester City", 180], ["premier_league", "Liverpool", 175],
  ["premier_league", "Chelsea", 165], ["premier_league", "Arsenal", 125], ["premier_league", "Tottenham", 105],
  ["premier_league", "Newcastle", 18], ["", "West Ham", 17], ["premier_league", "Aston Villa", 16],
  ["premier_league", "Everton", 14], ["premier_league", "Leeds", 9], ["", "Wolves", 9],
  ["premier_league", "Crystal Palace", 8], ["premier_league", "Brighton", 8], ["premier_league", "Nottingham Forest", 6],
  ["premier_league", "Fulham", 5], ["premier_league", "Bournemouth", 5], ["premier_league", "Brentford", 4],
  ["", "Burnley", 4], ["", "Sunderland", 5],
  ["", "Southampton", 7], ["", "Sheffield United", 3],
  // Italy
  ["serie_a", "Juventus", 180], ["serie_a", "AC Milan", 85], ["serie_a", "Inter", 78], ["serie_a", "AS Roma", 40],
  ["serie_a", "Napoli", 30], ["serie_a", "Lazio", 8], ["serie_a", "Fiorentina", 7], ["serie_a", "Atalanta", 6],
  ["serie_a", "Torino", 3], ["serie_a", "Bologna", 3], ["serie_a", "Genoa", 3], ["serie_a", "Cagliari", 2],
  ["serie_a", "Parma", 2], ["serie_a", "Sassuolo", 1.5], ["serie_a", "Lecce", 1.5],
  // Germany
  ["bundesliga", "Bayern München", 160], ["bundesliga", "Borussia Dortmund", 70], ["bundesliga", "Bayer Leverkusen", 15],
  ["bundesliga", "RB Leipzig", 9], ["bundesliga", "Eintracht Frankfurt", 7], ["bundesliga", "Borussia Mönchengladbach", 6],
  ["bundesliga", "VfB Stuttgart", 5], ["bundesliga", "Werder Bremen", 4],
  ["bundesliga", "1. FC Köln", 4], ["bundesliga", "Hamburger SV", 5], ["bundesliga", "Union Berlin", 2],
  // France
  ["ligue_1", "Paris Saint-Germain", 200], ["ligue_1", "Marseille", 28], ["ligue_1", "Lyon", 20], ["ligue_1", "Monaco", 16],
  ["ligue_1", "Lille", 6], ["ligue_1", "Nice", 4], ["ligue_1", "Rennes", 3], ["ligue_1", "Lens", 3], ["", "Nantes", 3],
  // Brazil (Ibope Repucom, 2025)
  ["", "Flamengo", 65], ["", "Corinthians", 42], ["", "Santos", 28], ["", "Palmeiras", 24], ["", "São Paulo", 23],
  ["", "Vasco da Gama", 17], ["", "Grêmio", 16], ["", "Cruzeiro", 14], ["", "Atlético Mineiro", 13], ["", "Internacional", 11],
  ["", "Fluminense", 9], ["", "Botafogo", 9], ["", "Bahia", 7], ["", "Sport Recife", 6], ["", "Fortaleza", 6],
  ["", "Chapecoense", 5], ["", "Ceará", 5], ["", "Athletico Paranaense", 4.5], ["", "Vitória", 4], ["", "Coritiba", 3.5],
  ["", "Remo", 3], ["", "Paysandu", 3], ["", "Santa Cruz", 3], ["", "Goiás", 2.5], ["", "Red Bull Bragantino", 2.5],
  ["", "Náutico", 2], ["", "América Mineiro", 1.5], ["", "Cuiabá", 0.9], ["", "Juventude", 0.8], ["", "CRB", 0.8],
  // Rest of the world
  ["", "Galatasaray", 60], ["", "Fenerbahçe", 40], ["", "Beşiktaş", 28], ["", "Trabzonspor", 10],
  ["", "Ajax", 30], ["", "PSV", 6], ["", "Feyenoord", 6],
  ["", "Benfica", 22], ["", "FC Porto", 17], ["", "Sporting CP", 14],
  ["", "Boca Juniors", 38], ["", "River Plate", 30], ["", "Independiente", 7], ["", "Racing Club", 6], ["", "San Lorenzo", 6],
  ["", "Al Nassr", 70], ["", "Al Hilal", 45], ["", "Al Ittihad", 22], ["", "Al Ahli", 12],
  ["", "Inter Miami CF", 55], ["", "LA Galaxy", 6], ["", "Los Angeles Football Club", 6],
  ["of_liga_mx", "América", 30], ["", "Guadalajara", 25], ["", "Cruz Azul", 12], ["", "Pumas UNAM", 10], ["", "Tigres", 9], ["", "Monterrey", 9],
  
  ["", "Zenit", 6], ["", "Spartak Moscow", 6], ["", "CSKA Moscow", 4],
  ["", "Shakhtar", 5], ["", "Dynamo Kyiv", 4], ["", "Olympiacos", 6], ["", "PAOK", 3],
  ["", "Colo-Colo", 8], ["", "Universidad de Chile", 6], ["", "Atlético Nacional", 10], ["", "Millonarios", 6],
  ["", "Peñarol", 5], ["", "Nacional", 5], ["", "Olimpia", 3],
  ["", "Anderlecht", 4], ["", "Club Brugge", 3],
];
