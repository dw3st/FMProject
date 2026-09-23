// Hand-authored fixture slice for the promo's dashboard scene.
// Models the shape produced by SaveService.getSeasonFixtures().

export interface PromoFixture {
  date: string;       // ISO YYYY-MM-DD
  competition: string;
  round: number;
  home: string;       // club name
  away: string;
  homeColor: string;
  awayColor: string;
  homeLogo?: string;  // /public path
  awayLogo?: string;
  isUserClub: "home" | "away" | null;
}

// "Today" for the dashboard scene. Sits inside La Liga 2027–28 window.
export const CURRENT_DATE = "2027-11-08";

// Upcoming fixtures rendered by the WeekCalendar / fixture cards.
export const UPCOMING_FIXTURES: PromoFixture[] = [
  {
    date: "2027-11-11",
    competition: "La Liga",
    round: 13,
    home: "Real Madrid",
    away: "Sevilla",
    homeColor: "#FFFFFF",
    awayColor: "#D40010",
    homeLogo: "/logos/la_liga/real_madrid.svg",
    isUserClub: "home",
  },
  {
    date: "2027-11-19",
    competition: "La Liga",
    round: 14,
    home: "Barcelona",
    away: "Real Madrid",
    homeColor: "#A50044",
    awayColor: "#FFFFFF",
    homeLogo: "/logos/la_liga/barcelona.svg",
    awayLogo: "/logos/la_liga/real_madrid.svg",
    isUserClub: "away",
  },
  {
    date: "2027-11-26",
    competition: "La Liga",
    round: 15,
    home: "Real Madrid",
    away: "Atlético Madrid",
    homeColor: "#FFFFFF",
    awayColor: "#CB3524",
    homeLogo: "/logos/la_liga/real_madrid.svg",
    isUserClub: "home",
  },
  {
    date: "2027-12-03",
    competition: "La Liga",
    round: 16,
    home: "Villarreal",
    away: "Real Madrid",
    homeColor: "#FFE667",
    awayColor: "#FFFFFF",
    awayLogo: "/logos/la_liga/real_madrid.svg",
    isUserClub: "away",
  },
];
