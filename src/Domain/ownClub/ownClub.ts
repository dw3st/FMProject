import { SECRETS, TIERS, TRACKS } from "@/Domain/achievements/catalog";
import { managerWeeklyWage } from "@/Domain/managers/managerContract";
import { FOUNDED } from "@/Domain/ownClub/ownClubConfig";
import type { AchievementsState } from "@/types/achievementTypes";
import type { Squad } from "@/types/playerTypes";

export const OWN_CLUB_KEYS: string[] = [
  ...Object.keys(TRACKS).flatMap((t) => TIERS.map((tier) => `${t}:${tier}`)),
  ...Object.keys(SECRETS).map((s) => `secret:${s}`),
];

export function ownClubUnlock(state: AchievementsState | undefined): { unlocked: boolean; done: number; total: number } {
  const have = state?.unlocked ?? {};
  const done = OWN_CLUB_KEYS.filter((k) => (have as Record<string, string | undefined>)[k]).length;
  return { unlocked: done === OWN_CLUB_KEYS.length, done, total: OWN_CLUB_KEYS.length };
}

export interface ClubIdentity {
  name: string;
  shortName: string;
  colors: [string, string];
}

const HEX = /^#[0-9a-fA-F]{6}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/;

export function parseIdentity(body: unknown): { ok: true; identity: ClubIdentity } | { ok: false } {
  if (!body || typeof body !== "object") return { ok: false };
  const b = body as Record<string, unknown>;
  const { name, shortName, colors } = b;
  if (typeof name !== "string" || name !== name.trim() || CONTROL.test(name)) return { ok: false };
  if (name.length < FOUNDED.NAME_MIN || name.length > FOUNDED.NAME_MAX) return { ok: false };
  if (typeof shortName !== "string" || !/^[A-Za-z]{3}$/.test(shortName)) return { ok: false };
  if (!Array.isArray(colors) || colors.length !== 2) return { ok: false };
  const [c1, c2] = colors;
  if (typeof c1 !== "string" || typeof c2 !== "string" || !HEX.test(c1) || !HEX.test(c2)) return { ok: false };
  if (c1.toLowerCase() === c2.toLowerCase()) return { ok: false };
  return { ok: true, identity: { name, shortName: shortName.toUpperCase(), colors: [c1, c2] } };
}

export interface FoundedSlot {
  line: "GK" | "DEF" | "MID" | "FWD";
  level: number;
  age: number;
  i: number;
}

export function foundedSquadPlan(worstLevel: number): FoundedSlot[] {
  const out: FoundedSlot[] = [];
  const span = FOUNDED.AGE_MAX - FOUNDED.AGE_MIN;
  for (const line of ["GK", "DEF", "MID", "FWD"] as const) {
    const n = FOUNDED.LINES[line];
    for (let k = 0; k < n; k++) {
      out.push({
        line,
        level: worstLevel - FOUNDED.LEVEL_GAP,
        age: FOUNDED.AGE_MIN + Math.round((span * k) / Math.max(1, n - 1)),
        i: out.length,
      });
    }
  }
  return out;
}

export function ticketDemandMult(priceMult: number): number {
  return priceMult === 1 ? 1 : priceMult ** -FOUNDED.PRICE_ELASTICITY;
}

export function isPresident(squad: Pick<Squad, "foundedBy"> | null | undefined, seatId: string): boolean {
  const f = squad?.foundedBy;
  return !!f && f.seatId === seatId && !f.left;
}

export function managerWageCap(revenueBasis: number, reputation: number): number {
  return managerWeeklyWage(revenueBasis, reputation);
}

export function parseTicketPrice(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const r = Math.round(v * 10) / 10;
  if (Math.abs(r - v) > 1e-9) return null;
  if (r < FOUNDED.PRICE_MIN || r > FOUNDED.PRICE_MAX) return null;
  return r;
}
