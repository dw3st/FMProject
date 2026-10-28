import type { IconName } from "@/GameInterface/Icons";
import type {
  Badge, Frame, ManagerAttribute, ManagerAttributes, ManagerProfile, SecretView, StadiumDecor, TrackId, TrackView,
} from "@/types/achievementTypes";
import type { DetailedRole } from "@/types/playerTypes";

/** `GET /api/saves/:id/achievements` (`src/backend/achievementRoutes.ts`). */
export interface AchievementsData {
  tracks: TrackView[];
  secrets: SecretView[];
  points: { earned: number; spent: number; balance: number; achievements: number; campaign: number };
  attributes: ManagerAttributes;
  effects: Record<ManagerAttribute, number>;
  profile: ManagerProfile;
  available: { frames: Frame[]; badges: Badge[]; titles: TrackId[]; decor: Record<keyof StadiumDecor, boolean> };
  thresholds: { frames: Record<Exclude<Frame, "none">, number>; decor: Record<keyof StadiumDecor, number>; maxBadges: number };
  decor: StadiumDecor;
  shop: {
    costs: { created: number; legend: number };
    bought: { created?: string; legend?: string };
    /** Bought in this season (each item once per season). */
    thisSeason: { created: boolean; legend: boolean };
    positions: DetailedRole[];
    legends: {
      id: string; name: string; positions: string[]; nationality: string | null; age: number;
      wasWorldClass: boolean; level: number; appearances: number; goals: number;
    }[];
  };
  hasClub: boolean;
}

export async function achievementsCall<T>(url: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !json) return { ok: false, error: json?.error ?? "generic" };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "generic" };
  }
}

/** Ring of the manager's face for each frame (only theme tokens). */
export const FRAME_RING: Record<Frame, string> = {
  none: "border-2 border-primary/40",
  bronze: "border-[3px] border-chart-5",
  silver: "border-[3px] border-foreground",
  gold: "border-[3px] border-chart-4",
  legend: "border-[3px] border-chart-4 ring-2 ring-primary",
};

/** Colour (text) of a medal tier. */
export const TIER_TEXT: Record<"bronze" | "silver" | "gold" | "secret", string> = {
  bronze: "text-chart-5",
  silver: "text-foreground",
  gold: "text-chart-4",
  secret: "text-primary",
};

export const BADGE_ICON: Record<Badge, IconName> = {
  titles: "trophy",
  wins: "trend-up",
  matches: "ball",
  youth: "sprout",
  market: "handshake",
  finances: "wallet",
  career: "crown",
  squad: "squad",
  mystery: "sparkles",
};

/** Tracks whose values are euros. */
export const MONEY_TRACKS: ReadonlySet<TrackId> = new Set(["sales_profit", "big_signing", "balance"]);
