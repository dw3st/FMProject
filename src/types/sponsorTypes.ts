/**
 * Sponsors (12.0, spec `docs/superpowers/specs/2026-11-13-sponsors-design.md`, `.claude/rules/game/sponsors.md`).
 * Only a human club stores contracts (`Squad.sponsors`); an AI club's sponsors are names derived from its id.
 */

export type SponsorSize = "local" | "national" | "global";

/** One invented company of the catalog (`src/Data/sponsors.json`). */
export interface SponsorCompany {
  id: string;
  name: string;
  sector: string;
  size: SponsorSize;
  /** leagueData country of a `local` / `national` company; a `global` one has none. */
  country?: string;
  funny?: true;
  /** Hex colours: background, text. */
  colors: [string, string];
}

/** What an offer / contract keeps of the company (a snapshot: the screens never need the catalog). */
export interface SponsorBrand {
  id: string;
  name: string;
  sector: string;
  size: SponsorSize;
  colors: [string, string];
  funny?: true;
}

export type SponsorSlot = "master" | "kit" | "board";
export type SponsorProfile = "safe" | "standard" | "demanding";

/** What the company asks of the season to pay the bonus. */
export type SponsorGoal =
  /** Finish the league at `max` or better. */
  | { kind: "league_position"; max: number }
  /** Finish inside the league's continental zone. */
  | { kind: "continental" }
  /** Reach the quarter-finals / semi-finals of the national cup. */
  | { kind: "cup_stage"; stage: "qf" | "sf" }
  | { kind: "promotion" }
  /** Followers growing by `pct` (0.03 = 3%) at the rollover. */
  | { kind: "followers_growth"; pct: number }
  /** Average home attendance of the season at `avg` or more. */
  | { kind: "attendance"; avg: number };

export interface SponsorOffer {
  id: string;
  slot: SponsorSlot;
  company: SponsorBrand;
  profile: SponsorProfile;
  /** Fixed value per season (EUR). */
  annual: number;
  /** Paid at the rollover of every season whose goal is met (EUR). */
  bonus: number;
  goal: SponsorGoal;
  /** Seasons of the contract (1..3). */
  years: number;
  /** Last day it can be answered ("YYYY-MM-DD"). */
  expires: string;
  /** The manager already negotiated it (once per offer). */
  negotiated?: true;
  /** The same company offering to stay after its contract ended. */
  renewal?: true;
}

export interface SponsorContract {
  id: string;
  slot: SponsorSlot;
  company: SponsorBrand;
  profile: SponsorProfile;
  annual: number;
  bonus: number;
  goal: SponsorGoal;
  /** Rollovers of the club's country left (the one that ends it included). */
  seasonsLeft: number;
  signedOn: string;
  /** Signed by the director when the offers expired unanswered. */
  auto?: true;
  /** What the contract has paid and how its goals went so far (12.1; a contract from before counts from then on). */
  paid?: SponsorPaid;
}

/** Running totals of a contract: money credited (EUR) and season goals met / missed. */
export interface SponsorPaid {
  fixed: number;
  bonus: number;
  met: number;
  missed: number;
}

/**
 * How a contract ended: at its last season (`expired`; `renewed` once the company's renewal offer is accepted), the
 * company breaking it for a missed goal (`left_early`) or a relegation. `club_left` (the manager left the club) is
 * reserved: today the club's whole record is dropped when it returns to the AI.
 */
export type SponsorContractEnd = "expired" | "renewed" | "left_early" | "relegated" | "club_left";

/** One finished contract of a human club (`ClubSponsors.history`, 12.1). */
export interface SponsorHistoryEntry {
  companyId: string;
  companyName: string;
  slot: SponsorSlot;
  /** Day it was signed and day it ended ("YYYY-MM-DD"). */
  from: string;
  to: string;
  /** Season reviews it went through. */
  seasons: number;
  fixedPaid: number;
  bonusPaid: number;
  goalsMet: number;
  goalsMissed: number;
  end: SponsorContractEnd;
}

/** `Squad.sponsors`: human club only. */
export interface ClubSponsors {
  contracts: SponsorContract[];
  offers: SponsorOffer[];
  /** Finished contracts, oldest first (12.1; absent = none yet). Dropped with the record when the club returns to the AI. */
  history?: SponsorHistoryEntry[];
}

/** Where a goal stands today; `met` null = cannot be told yet. */
export interface SponsorGoalProgress {
  met: boolean | null;
  current?: number;
  target?: number;
}

/** `GET /api/saves/:id/sponsors`. */
export interface SponsorsView {
  /** Game date of the view. */
  date: string;
  slots: { slot: SponsorSlot; count: number; share: number; filled: number }[];
  contracts: (SponsorContract & { progress: SponsorGoalProgress })[];
  offers: (SponsorOffer & { progress: SponsorGoalProgress })[];
  /** `finances.commercial`: what the slots' shares are taken from. */
  base: number;
  /** Monday income of the contracts in force. */
  weekly: number;
  /** The club's appeal to sponsors today (0.7..1.3). */
  appeal: number;
  /** false: a save from before 12.0, still on the old weekly commercial income until its country's rollover. */
  active: boolean;
}

/** `POST /api/saves/:id/sponsors/offers/:offerId` body. */
export type SponsorOfferAction = "accept" | "decline" | "negotiate";
export type SponsorNegotiation = "raised" | "kept" | "withdrawn";

/** A sponsor as the pitch boards and the club page show it. */
export interface SponsorBoard {
  /** Catalog id: the painted plate is `sponsors/<id>.webp`. */
  id: string;
  name: string;
  colors: [string, string];
  /** Share of the LED panels: master 3, kit 2, board 1. */
  weight: number;
}

/** The master (shirt) sponsor shown on the club page and the match preview. */
export interface MasterSponsor {
  id: string;
  name: string;
  sector: string;
  colors: [string, string];
}

/** How a company behaves (`sponsorTraitOf`, `.claude/rules/game/sponsors.md` -> "Perfil da empresa"). */
export type SponsorTraitKey = "none" | "generous" | "stingy" | "impatient" | "loyal" | "haggler" | "proud" | "longterm" | "shortterm";

/** A club on the sponsor page. */
export interface SponsorClubRef {
  squadId: string;
  name: string;
  leagueSlug: string;
  /** A club with a human manager. */
  human: boolean;
}

/** A finished contract of a human club as anyone in the save may see it. */
export type SponsorPastDeal = Pick<SponsorHistoryEntry, "companyId" | "slot" | "from" | "to" | "seasons" | "end"> & SponsorClubRef;

/** A season a club finished with the company as its master sponsor. */
export interface SponsorResultRow extends SponsorClubRef {
  /** Season label of the club's history ("2026-27" / "2027"). */
  season: string;
  /** League of that season. */
  league: string;
  position: number | null;
  /** Titles of the season ("league:<slug>", "cup:<slug>", "continental:<slug>"); promotions apart. */
  titles: string[];
  move: "promoted" | "relegated" | null;
}

/** `GET /api/saves/:id/sponsors/company/:companyId` (12.1). */
export interface SponsorCompanyView {
  company: {
    id: string;
    name: string;
    sector: string;
    size: SponsorSize;
    country: string | null;
    colors: [string, string];
    trait: SponsorTraitKey;
    /** The company's short text in the asked language; null when it has none. */
    bio: string | null;
  };
  /** The clubs of the save it sponsors today, by slot. */
  current: Record<SponsorSlot, SponsorClubRef[]>;
  /** Finished contracts with the human clubs of the save, newest first (no money: another club's values stay private). */
  history: SponsorPastDeal[];
  /** What clubs did with it as master sponsor (finished seasons of the clubs' histories). */
  results: {
    seasons: number;
    titles: number;
    promotions: number;
    relegations: number;
    /** The most notable seasons (titles first), up to 10. */
    rows: SponsorResultRow[];
    /** The clubs it is the master sponsor of today, with their place in the table (null before any game). */
    now: (SponsorClubRef & { position: number | null; size: number })[];
  };
  /** The asking seat's own dealings with the company; null without a club. */
  mine: {
    /** false: the club is still on the old commercial income (no sponsors yet). */
    active: boolean;
    offers: SponsorsView["offers"];
    contract: SponsorsView["contracts"][number] | null;
    history: SponsorHistoryEntry[];
  } | null;
}
