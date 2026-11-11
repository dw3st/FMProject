import { daysBetween } from "@/Domain/dates";
import { fameBand, type ManagerAssets } from "@/Domain/managers/assets";
import { seedFrom } from "@/Domain/rng";
import type { ManagerPassage, ManagerRecord } from "@/types/managerTypes";

/**
 * The rare funny line of an automatic bio (user request, 8.9.41): each joke fits a career situation, and only about
 * one manager in `ONE_IN` gets one (a fixed draw by his id, so the line never changes between visits). The screen
 * turns the id into a sentence (`managerPage.bio.joke.<id>`).
 */
export const BIO_JOKES = { ONE_IN: 5 } as const;

export interface BioJoke {
  id: string;
  params?: Record<string, string | number>;
}

export interface JokeInput {
  record: Pick<ManagerRecord, "id" | "squadId" | "seasons" | "titles" | "awards" | "interim" | "points" | "seatId" | "cards" | "unpaidDebts"> & {
    clubs?: (Omit<ManagerPassage, "left"> & { left?: string })[];
  };
  clubName: string | null;
  today: string | null;
  rank: number;
  total: number;
  /** Security of the job (Cargos): 1 very safe .. 5 very threatened. */
  jobLevel: number | null;
  assets?: ManagerAssets;
  /** Coaching a national team now. */
  national?: boolean;
}

const CONTINENT_OF: Record<string, "europe" | "southAmerica"> = { ucl: "europe", uel: "europe", lib: "southAmerica", sud: "southAmerica" };

/** Every joke the career fits, in catalog order. */
export function matchingJokes(j: JokeInput): BioJoke[] {
  const m = j.record;
  const clubs = m.clubs ?? [];
  const left = (r: string) => clubs.filter((c) => c.left === r).length;
  const sacked = left("sacked");
  const resigned = left("resigned");
  const contractEnds = left("contract");
  const interims = left("interim") + (m.interim ? 1 : 0);
  const distinct = new Set(clubs.map((c) => c.squadId).filter(Boolean)).size;
  const kinds = (k: string) => m.titles.filter((t) => t.kind === k).length;
  const league = kinds("league"), cups = kinds("cup"), continental = kinds("continental"), promotions = kinds("promotion"), national = kinds("national");
  const won = m.titles.filter((t) => t.kind !== "promotion");
  const awards = m.awards ?? [];
  const world = awards.filter((a) => a.kind === "world_manager").length;
  const best = awards.filter((a) => a.kind === "best_manager").length;
  const current = clubs.length > 0 && !clubs[clubs.length - 1]!.to ? clubs[clubs.length - 1]! : null;
  const tenureYears = current && j.today ? daysBetween(current.from, j.today) / 365 : 0;
  const lastLeft = clubs.length > 0 ? clubs[clubs.length - 1]! : null;
  const freeDays = !m.squadId && lastLeft?.to && j.today ? daysBetween(lastLeft.to, j.today) : 0;
  const human = !!m.seatId;
  const fame = human ? fameBand(j.assets) : 0;
  const red = m.cards?.red ?? 0, yellow = m.cards?.yellow ?? 0;
  const club = j.clubName ?? "";
  const quickSack = clubs.some((c) => c.left === "sacked" && c.to && daysBetween(c.from, c.to) < 120);
  const out: BioJoke[] = [];
  const add = (id: string, ok: boolean, params?: BioJoke["params"]) => { if (ok) out.push(params ? { id, params } : { id }); };

  add("sacked", sacked >= 3, { count: sacked });
  add("hopper", distinct >= 4 && m.seasons / distinct < 1.5);
  add("drought", m.seasons >= 5 && won.length === 0, { count: m.seasons });
  add("cupsNoLeague", cups >= 2 && league === 0);
  add("interimCareer", interims >= 2);
  add("promotions", promotions >= 2);
  add("freeLong", freeDays >= 365);
  add("oneClub", tenureYears >= 8 && !!club, { club });
  const conts = m.titles.filter((t) => t.kind === "continental").map((t) => CONTINENT_OF[t.competition]);
  add("europeNoLeague", league === 0 && conts.includes("europe"));
  add("southAmericaNoLeague", league === 0 && !conts.includes("europe") && conts.includes("southAmerica"));
  add("firstJob", m.seasons <= 1 && distinct <= 1 && !!m.squadId);
  add("world", world === 1);
  add("worldMany", world >= 2, { count: world });
  add("trophies", won.length >= 8);
  add("leagueRoutine", league >= 3);
  add("hotSeat", j.jobLevel === 5 && !!m.squadId);
  add("safeSeat", j.jobLevel === 1 && m.seasons >= 3);
  add("redCards", red >= 3, { count: red });
  add("yellowCards", yellow >= 8);
  add("cleanRecord", human && red === 0 && yellow === 0 && m.seasons >= 5);
  add("debts", (m.unpaidDebts?.length ?? 0) > 0);
  add("privateJet", fame === 4);
  add("richNoTitles", fame >= 3 && won.length === 0);
  add("mattress", human && fame === 0 && m.seasons >= 8);
  add("carNotJob", fame >= 3 && (j.jobLevel ?? 0) >= 4);
  add("topTen", j.rank > 1 && j.rank <= 10);
  add("numberOne", j.rank === 1 && m.points > 0);
  add("lowRank", j.total >= 20 && j.rank > j.total * 0.9 && m.seasons >= 3);
  add("zeroPoints", m.points === 0 && m.seasons >= 5, { count: m.seasons });
  add("nationalJob", !!j.national);
  add("nationalTitle", national >= 1);
  add("resigned", resigned >= 2, { count: resigned });
  add("quickSack", quickSack);
  add("contracts", contractEnds >= 2);
  add("bestMany", best >= 2, { count: best });
  add("oneTitle", won.length === 1 && m.seasons >= 6, { count: m.seasons });
  add("human", human);
  add("manyClubs", distinct >= 6, { count: distinct });
  add("veteran", m.seasons >= 15, { count: m.seasons });
  add("earlyTrophy", m.seasons <= 2 && won.length >= 1);
  add("continentalMany", continental >= 2, { count: continental });
  add("cupMaster", cups >= 3);
  const promoClub = m.titles.filter((t) => t.kind === "promotion").some((t) => t.squadId === m.squadId);
  add("promotedStay", promoClub && !!club, { club });
  add("interimNow", !!m.interim);
  add("freeAfterSack", !m.squadId && lastLeft?.left === "sacked");
  add("freeAfterResign", !m.squadId && lastLeft?.left === "resigned");
  add("neverSacked", m.seasons >= 10 && sacked === 0, { count: m.seasons });
  add("noJobYet", !m.squadId && clubs.length === 0);
  const titleClubs = new Set(won.map((t) => t.squadId));
  add("oneClubTitles", won.length >= 4 && titleClubs.size === 1);
  add("relegationMagnet", promotions >= 1 && sacked >= 2);
  return out;
}

/** The joke of this manager, or null (most managers get none). */
export function pickJoke(j: JokeInput): BioJoke | null {
  const seed = seedFrom(`bio-joke:${j.record.id}`);
  if (seed % BIO_JOKES.ONE_IN !== 0) return null;
  const fits = matchingJokes(j);
  if (fits.length === 0) return null;
  return fits[Math.floor(seed / BIO_JOKES.ONE_IN) % fits.length]!;
}
