/** Routes of the manager's own club (`src/backend/ownClubRoutes.ts`, `src/backend/presidentRoutes.ts`). */

export type FoundBlock = "humanClub" | "continental";

export interface FoundClubOptions {
  unlocked: boolean;
  done: number;
  total: number;
  foundedClub: { squadId: string; on: string } | null;
  countries: { country: string; leagues: { slug: string; clubs: { id: string; name: string; blocked?: FoundBlock }[] }[] }[];
}

export interface FoundIdentity {
  squadId: string;
  name: string;
  shortName: string;
  colors: [string, string];
}

export interface TicketProjection {
  attendance: number;
  capacity: number;
  gate: number;
}

export type PresidentView =
  | { president: false }
  | { president: true; mult: number; wallet: number; wage: number; wageCap: number; projection: TicketProjection | null };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(url: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown): Promise<ApiResult<T>> {
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

export const fetchFoundClub = (saveId: string) => call<FoundClubOptions>(`/api/saves/${saveId}/found-club`);

export const foundClub = (saveId: string, identity: FoundIdentity) =>
  call<{ ok: true; clubId: string; leagueSlug: string }>(`/api/saves/${saveId}/found-club`, "POST", identity);

export const fetchPresident = (saveId: string) => call<PresidentView>(`/api/saves/${saveId}/president`);

export const setTicketPrice = (saveId: string, mult: number) =>
  call<{ mult: number; projection: TicketProjection | null }>(`/api/saves/${saveId}/ticket-price`, "PUT", { mult });

export const depositToClub = (saveId: string, amount: number) =>
  call<{ balance: number; wallet: number }>(`/api/saves/${saveId}/club-deposit`, "POST", { amount });

export const setManagerWage = (saveId: string, wage: number) =>
  call<{ wage: number; wageCap: number }>(`/api/saves/${saveId}/manager-wage`, "PUT", { wage });
