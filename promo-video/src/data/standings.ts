// La Liga 2027–28 standings around Round 14. Tuned so Real Madrid's win
// over Barcelona produces a clean 2nd → 1st rank-climb animation.

export interface StandingRow {
  squadId: string;
  name: string;
  slug: string;
  colors: [string, string];
  logo?: string;          // /public-relative
  mp: number;             // matches played
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  form: ("W" | "D" | "L")[];
  // Whether this is the user's club — drives row highlight.
  isUser?: boolean;
}

// Before the El Clásico win. RM are 2nd by 1 point, gd inferior.
export const STANDINGS_BEFORE: StandingRow[] = [
  {
    squadId: "529", slug: "barcelona", name: "Barcelona",
    colors: ["#A50044", "#004D98"], logo: "/logos/la_liga/barcelona.svg",
    mp: 13, w: 9, d: 2, l: 2, gf: 28, ga: 12, gd: 16, pts: 29,
    form: ["W", "W", "W", "D", "L"],
  },
  {
    squadId: "541", slug: "real_madrid", name: "Real Madrid",
    colors: ["#FFFFFF", "#FEBE10"], logo: "/logos/la_liga/real_madrid.svg",
    mp: 13, w: 9, d: 1, l: 3, gf: 26, ga: 13, gd: 13, pts: 28,
    form: ["W", "W", "D", "W", "L"],
    isUser: true,
  },
  {
    squadId: "530", slug: "atletico_madrid", name: "Atlético Madrid",
    colors: ["#CB3524", "#262E62"],
    mp: 13, w: 8, d: 2, l: 3, gf: 22, ga: 14, gd: 8, pts: 26,
    form: ["W", "L", "W", "W", "D"],
  },
  {
    squadId: "536", slug: "sevilla", name: "Sevilla",
    colors: ["#D40010", "#FFFFFF"],
    mp: 13, w: 6, d: 3, l: 4, gf: 19, ga: 15, gd: 4, pts: 21,
    form: ["L", "W", "D", "W", "W"],
  },
  {
    squadId: "548", slug: "real_sociedad", name: "Real Sociedad",
    colors: ["#143C8E", "#FFFFFF"],
    mp: 13, w: 5, d: 5, l: 3, gf: 17, ga: 14, gd: 3, pts: 20,
    form: ["D", "W", "D", "W", "L"],
  },
  {
    squadId: "532", slug: "valencia", name: "Valencia",
    colors: ["#FF7700", "#000000"],
    mp: 13, w: 5, d: 4, l: 4, gf: 16, ga: 16, gd: 0, pts: 19,
    form: ["L", "D", "W", "L", "W"],
  },
  {
    squadId: "533", slug: "villarreal", name: "Villarreal",
    colors: ["#FFE667", "#0033A0"],
    mp: 13, w: 5, d: 4, l: 4, gf: 18, ga: 17, gd: 1, pts: 19,
    form: ["W", "D", "L", "D", "W"],
  },
  {
    squadId: "531", slug: "athletic_club", name: "Athletic Club",
    colors: ["#EE2523", "#FFFFFF"],
    mp: 13, w: 4, d: 5, l: 4, gf: 15, ga: 15, gd: 0, pts: 17,
    form: ["D", "L", "W", "D", "D"],
  },
];

// After Real Madrid 2-1 Barcelona — applied to the same rows.
// RM: +3 pts, +2 GF, +1 GA → gd 14, 31 pts. Barça: +1 GF, +2 GA → gd 15, 29 pts.
// New rank order:
//   1. Real Madrid 31 pts
//   2. Barcelona 29 pts
//   3. Atlético 26 pts
// The rest stay the same since they didn't play that day.
export const STANDINGS_AFTER: StandingRow[] = [
  {
    ...STANDINGS_BEFORE[1]!,
    w: STANDINGS_BEFORE[1]!.w + 1,
    mp: STANDINGS_BEFORE[1]!.mp + 1,
    gf: STANDINGS_BEFORE[1]!.gf + 2,
    ga: STANDINGS_BEFORE[1]!.ga + 1,
    gd: STANDINGS_BEFORE[1]!.gd + 1,
    pts: STANDINGS_BEFORE[1]!.pts + 3,
    form: ["W", ...STANDINGS_BEFORE[1]!.form.slice(0, 4)] as ("W" | "D" | "L")[],
  },
  {
    ...STANDINGS_BEFORE[0]!,
    l: STANDINGS_BEFORE[0]!.l + 1,
    mp: STANDINGS_BEFORE[0]!.mp + 1,
    gf: STANDINGS_BEFORE[0]!.gf + 1,
    ga: STANDINGS_BEFORE[0]!.ga + 2,
    gd: STANDINGS_BEFORE[0]!.gd - 1,
    form: ["L", ...STANDINGS_BEFORE[0]!.form.slice(0, 4)] as ("W" | "D" | "L")[],
  },
  ...STANDINGS_BEFORE.slice(2),
];
