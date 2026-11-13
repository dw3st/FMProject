import type { FinancialTier } from "@/types/playerTypes";
import type { MasterSponsor } from "@/types/sponsorTypes";

/** 1 very secure … 5 under heavy threat (`Domain/jobs/application.ts`). */
type SecurityLevel = 1 | 2 | 3 | 4 | 5;
type HiringState = "open" | "tight" | "frozen";

/** `GET /api/saves/:id/clubs/:squadId/overview` (club page, 8.9.30). */
export interface ClubOverview {
  squadId: string;
  leagueSlug: string;
  venue: { name: string; city: string; capacity: number } | null;
  /** `level` 1..5 picks the painted ground; conditions 0..100. */
  stadium: { level: 1 | 2 | 3 | 4 | 5; pitch: number; seats: number; structure: number };
  manager: { id: string; name: string; human: boolean; interim: boolean; nationality: string | null; since: string | null } | null;
  /** Job security (`level` null = a human club) and whether this seat may apply. */
  job: { level: SecurityLevel | "vacant" | null; target: number | null; blocked: "own" | "human" | "refused" | null; size: number } | null;
  /** This seat's open application, any club. */
  application: { squadId: string; answerOn: string } | null;
  employed: boolean;
  /** AI clubs only. */
  money: {
    tier: FinancialTier | null;
    popularity: number;
    wageBill: number;
    maxWageBudget: number | null;
    hiring: HiringState | null;
    transferBudget: number | null;
    seasonalTransferBudget: number | null;
  } | null;
  season: { position: number; size: number; played: number; points: number; form: ("W" | "D" | "L")[] } | null;
  titles: { title: string; count: number }[];
  legends: { playerId: string; name: string; tier: "legend" | "idol" }[];
  /**
   * Master (shirt) sponsor (`.claude/rules/game/sponsors.md`): a human club's contract (null while the slot is
   * empty), an AI club's name derived from its id and season.
   */
  masterSponsor: MasterSponsor | null;
}
