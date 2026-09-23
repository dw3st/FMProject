import type { MainRole } from "@/GameInterface/positionHelpers";

export type TransferBudgetTier = "low" | "mid" | "high";

export type TransferIntentType =
  | "cover_need"
  | "future_investment"
  | "improvement";

export interface TransferNeed {
  position: MainRole;
  targetMin: number;
  targetMax: number;
  urgency: number;
  budgetTier: TransferBudgetTier;
  intentType: TransferIntentType;
}

export interface SellCandidate {
  playerId: string;
  /** 0–1: how willing the club is to sell this player. Higher = easier to buy. */
  priority: number;
}

export interface SquadMarketProfile {
  squadId: string;
  needs: TransferNeed[];
  sellList: SellCandidate[];
  lastUpdateDay: string;
}

export interface MarketState {
  shuffledTeamIds: string[];
  rotationIndex: number;
  profiles: Record<string, SquadMarketProfile>;
  /** Human-managed sell list — persisted separately from AI profiles. */
  playerSellList: SellCandidate[];
}
