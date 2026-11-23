import type { FacilityItemId } from "@/types/facilityTypes";
import type { ComponentCounts, ComponentId, CraftJob, CraftStock, MaterialCounts, MaterialId, Supplier } from "@/types/craftTypes";

/** `GET /api/saves/:id/craft` (`src/backend/craftRoutes.ts` → `view`). */
export interface CraftView {
  date: string;
  workshop: number;
  benches: number;
  maxQueue: number;
  maxLevel: number;
  foremanStars: number;
  foremanSpeed: number;
  stock: CraftStock;
  queue: (CraftJob & { daysLeft: number | null })[];
  shop: { material: MaterialId; standard: number; good: number; previous: number }[];
  discount: boolean;
  allowance: number;
  balance: number;
  recipes: { component: ComponentId; materials: MaterialCounts; days: number; minLevel: number; locked: boolean }[];
  upgrade: { level: number; recipe: ComponentCounts } | null;
  /** Components each item above level 1 would give back if recycled. */
  recycle?: Partial<Record<FacilityItemId, ComponentCounts>>;
}

export type CallResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(url: string, body?: unknown): Promise<CallResult<T>> {
  try {
    const res = await fetch(url, body === undefined ? undefined : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: json as T } : { ok: false, error: (json as { error?: string }).error ?? "generic" };
  } catch {
    return { ok: false, error: "generic" };
  }
}

const base = (saveId: string) => `/api/saves/${encodeURIComponent(saveId)}/craft`;

export const fetchCraft = (saveId: string) => call<CraftView>(base(saveId));
export const buyMaterials = (saveId: string, items: { material: MaterialId; supplier: Supplier; qty: number }[]) =>
  call<{ total: number; view: CraftView }>(`${base(saveId)}/buy`, { items });
/** `goodShare` absent = the good-supplier materials first. */
export const queueComponent = (saveId: string, component: ComponentId, qty: number, goodShare?: number) =>
  call<CraftView>(`${base(saveId)}/queue`, { component, qty, ...(goodShare !== undefined ? { goodShare } : {}) });
export const queueAction = (saveId: string, jobId: string, action: "up" | "down" | "cancel") =>
  call<CraftView>(`${base(saveId)}/queue/${encodeURIComponent(jobId)}`, { action });
export const upgradeWorkshop = (saveId: string) => call<CraftView>(`${base(saveId)}/workshop`, {});
export const recycleItem = (saveId: string, item: string) =>
  call<{ returned: ComponentCounts; view: CraftView }>(`${base(saveId)}/recycle`, { item });

/** Translation key of an error code (`craft.errors.<code>`, else the generic one). */
export function craftErrorKey(code: string): string {
  const known = [
    "locked", "invalidQty", "queueFull", "missingMaterials", "missingComponents", "invalidOrder", "maxLevel",
    "minLevel", "busy", "noClub", "notFound", "done", "cannotMove", "invalidRequest",
  ];
  return `craft.errors.${known.includes(code) ? code : "generic"}`;
}
