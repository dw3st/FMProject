/**
 * Board pressure over seasons in a row (tester report: a big club that doesn't compete should feel it). Pure: the same
 * functions the day advance uses. Each case repeats the same season: league table position drifting to the final one,
 * cups as extra matches, weekly drift, the daily review with sacking on. Prints the end-of-season board, the share of
 * seasons with a warning / an ultimatum and how many careers were sacked by the end of each season.
 *
 *   bun scripts/board-pressure-sim.ts [careers=400] [seasons=3]
 */
import {
  applyCompetitionEvent, applyMatchResult, applyWeekly, carryIntoNewSeason, evaluateSeason, initialBoardState, reviewBoardStatus,
} from "@/Domain/boardFans/boardFans";
import { mulberry32 } from "@/Domain/rng";
import type { SeasonObjective, SeasonObjectiveKind as ObjectiveKind } from "@/types/boardTypes";

const CAREERS = Number(process.argv[2] ?? 400);
const SEASONS = Number(process.argv[3] ?? 3);
const SIZE = 20;
const LEAGUE_GAMES = 38;

interface Case { demanding?: true; name: string; kind: ObjectiveKind; target: number; rank: number; e: number; w: number; d: number; cupGames: number; early?: boolean }

const CASES: Case[] = [
  { demanding: true, name: "giant: champion", kind: "title", target: 1, rank: 1, e: 0.8, w: 0.74, d: 0.16, cupGames: 12 },
  { demanding: true, name: "giant: 2nd", kind: "title", target: 1, rank: 2, e: 0.8, w: 0.66, d: 0.18, cupGames: 12 },
  { demanding: true, name: "giant: 3rd", kind: "title", target: 1, rank: 3, e: 0.8, w: 0.6, d: 0.2, cupGames: 10 },
  { demanding: true, name: "giant: 5th (no Champions)", kind: "title", target: 1, rank: 5, e: 0.8, w: 0.5, d: 0.24, cupGames: 7, early: true },
  { demanding: true, name: "giant: 8th", kind: "title", target: 1, rank: 8, e: 0.8, w: 0.42, d: 0.26, cupGames: 6, early: true },
  { demanding: true, name: "giant: 12th", kind: "title", target: 1, rank: 12, e: 0.8, w: 0.33, d: 0.28, cupGames: 4, early: true },
  { demanding: true, name: "rich club: 4th (met)", kind: "continental", target: 4, rank: 4, e: 0.5, w: 0.54, d: 0.22, cupGames: 9 },
  { demanding: true, name: "rich club: 6th", kind: "continental", target: 4, rank: 6, e: 0.5, w: 0.46, d: 0.24, cupGames: 7 },
  { demanding: true, name: "rich club: 10th", kind: "continental", target: 4, rank: 10, e: 0.5, w: 0.36, d: 0.26, cupGames: 5, early: true },
  { name: "continental club: 4th (met)", kind: "continental", target: 4, rank: 4, e: 0.4, w: 0.52, d: 0.24, cupGames: 8 },
  { name: "continental club: 8th", kind: "continental", target: 4, rank: 8, e: 0.4, w: 0.4, d: 0.26, cupGames: 5 },
  { name: "continental club: 14th", kind: "continental", target: 4, rank: 14, e: 0.4, w: 0.28, d: 0.26, cupGames: 3, early: true },
  { name: "mid club: 12th (met)", kind: "mid_table", target: 14, rank: 12, e: 0, w: 0.33, d: 0.28, cupGames: 3 },
  { name: "mid club: 17th", kind: "mid_table", target: 14, rank: 17, e: 0, w: 0.26, d: 0.26, cupGames: 2 },
  { name: "small club: 15th (met)", kind: "avoid_relegation", target: 17, rank: 15, e: -0.5, w: 0.27, d: 0.28, cupGames: 2 },
  { name: "small club: 19th", kind: "avoid_relegation", target: 17, rank: 19, e: -0.5, w: 0.18, d: 0.26, cupGames: 2 },
];

const objectiveOf = (c: Case): SeasonObjective => ({ kind: c.kind, target: c.target, leagueSlug: "x", leagueSize: SIZE, season: "2027-28", ...(c.demanding ? { demanding: true as const } : {}) });

console.log(`case                            end board by season ${" ".repeat(Math.max(0, SEASONS * 6 - 19))}warn%  ult%  sacked by end of season`);
for (const c of CASES) {
  const ends = Array<number>(SEASONS).fill(0);
  const alive = Array<number>(SEASONS).fill(0);
  const sackedBy = Array<number>(SEASONS).fill(0);
  let warned = 0, ult = 0, seasonsPlayed = 0;
  for (let career = 0; career < CAREERS; career++) {
    const rng = mulberry32(7000 + career);
    let st = initialBoardState("2027-08-01", objectiveOf(c));
    let sacked = -1;
    for (let season = 0; season < SEASONS && sacked < 0; season++) {
      const total = LEAGUE_GAMES + c.cupGames;
      // Cup games spread among the league ones.
      const cupEvery = c.cupGames > 0 ? Math.floor(total / c.cupGames) : Infinity;
      let league = 0, gotWarn = false, gotUlt = false;
      for (let g = 1; g <= total && sacked < 0; g++) {
        const isCup = g % cupEvery === 0 && league + (total - g) >= LEAGUE_GAMES;
        const r = rng();
        const res = r < c.w ? [2, 0] : r < c.w + c.d ? [1, 1] : [0, 1];
        const e = c.e + (rng() - 0.5) * 0.6;
        const m = { goalsFor: res[0]!, goalsAgainst: res[1]!, home: g % 2 === 0, derby: g % 19 === 0, expectation: e };
        if (isCup) st = applyMatchResult(st, m);
        else {
          league++;
          // The table: wider early, settling on the final position.
          const spread = 6 * (1 - league / LEAGUE_GAMES);
          const position = Math.max(1, Math.min(SIZE, Math.round(c.rank + (rng() - 0.5) * 2 * spread)));
          st = applyMatchResult(st, { ...m, league: { position, size: SIZE, played: league, total: LEAGUE_GAMES } });
        }
        if (g % 2 === 1) st = applyWeekly(st, { balance: 1, weeklyRevenue: 1 });
        const review = reviewBoardStatus(st, { sackingEnabled: true, date: "2028-01-01", leagueMatchesLeft: LEAGUE_GAMES - league });
        st = review.state;
        if (review.messages.includes("warning")) gotWarn = true;
        if (review.messages.includes("ultimatum")) gotUlt = true;
        if (review.sacked) sacked = season;
      }
      seasonsPlayed++;
      if (gotWarn) warned++;
      if (gotUlt) ult++;
      if (sacked >= 0) break;
      if (c.early) st = applyCompetitionEvent(st, { kind: "early_exit" });
      if (c.rank === 1) st = applyCompetitionEvent(st, { kind: "title", title: "league:x" });
      st = evaluateSeason(st, { position: c.rank });
      const review = reviewBoardStatus(st, { sackingEnabled: true, date: "2028-06-01" });
      if (review.sacked) { sacked = season; break; }
      ends[season]! += st.board;
      alive[season]! += 1;
      st = carryIntoNewSeason(review.state, objectiveOf(c));
    }
    for (let s = 0; s < SEASONS; s++) if (sacked >= 0 && sacked <= s) sackedBy[s]! += 1;
  }
  const endText = ends.map((v, i) => (alive[i]! ? (v / alive[i]!).toFixed(0).padStart(4) : "   -")).join("  ");
  const sackText = sackedBy.map((n) => `${Math.round((100 * n) / CAREERS)}%`.padStart(5)).join(" ");
  console.log(
    `${c.name.padEnd(31)} ${endText}   ${String(Math.round((100 * warned) / seasonsPlayed)).padStart(4)} ${String(Math.round((100 * ult) / seasonsPlayed)).padStart(5)}  ${sackText}`,
  );
}
