import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { FACILITY_ITEMS, ITEM_GROUP } from "@/Domain/facilities/facilityItems";
import type { ComponentCounts } from "@/types/craftTypes";
import type { FacilityGroup, FacilityItemId } from "@/types/facilityTypes";

/**
 * Club screen in four tabs (spec 2026-11-19-club-tab-redesign): which tab and part a `?tab=` opens, the works a
 * `?job=` picks, and the "To do" list of the overview. Pure: only reads the facilities view the screen already has.
 */

export type ClubTab = "overview" | "stadium" | "works" | "materials";
export const CLUB_TABS: readonly ClubTab[] = ["overview", "stadium", "works", "materials"];
/** The two parts of Materials: which one a link opens in view. */
export type MaterialsPart = "shop" | "stock";

/** `?tab=` of today and of before 12.28 (seven tabs): facilities → overview, attendance → stadium, workshop → works. */
export function parseClubTab(raw: string | null | undefined): { tab: ClubTab; part?: MaterialsPart } {
  switch (raw) {
    case "stadium": case "attendance": return { tab: "stadium" };
    case "works": case "workshop": return { tab: "works" };
    case "materials": return { tab: "materials" };
    case "shop": return { tab: "materials", part: "shop" };
    case "stock": return { tab: "materials", part: "stock" };
    default: return { tab: "overview" };
  }
}

// ── Works jobs ────────────────────────────────────────────────────────────────

export type ItemJobMode = "repair" | "rebuild" | "upgrade";
/** One works of the Works tab: an item's repair, rebuild or upgrade, a stand, comfort, grass change, group works, the workshop. */
export type WorksJob =
  | { kind: "item"; mode: ItemJobMode; item: FacilityItemId }
  | { kind: "stand" | "comfort" | "turf" | "training" | "academy" | "workshop" };

const SIMPLE = ["stand", "comfort", "turf", "training", "academy", "workshop"] as const;

/** `?job=` text of a works: `upgrade:gym`, `repair:stadiumPitch`, `stand`… */
export function jobKey(job: WorksJob): string {
  return job.kind === "item" ? `${job.mode}:${job.item}` : job.kind;
}

export function parseJob(raw: string | null | undefined): WorksJob | null {
  if (!raw) return null;
  if ((SIMPLE as readonly string[]).includes(raw)) return { kind: raw as (typeof SIMPLE)[number] };
  const [mode, item] = raw.split(":");
  if ((mode === "repair" || mode === "rebuild" || mode === "upgrade") && (FACILITY_ITEMS as readonly string[]).includes(item ?? "")) {
    return { kind: "item", mode, item: item as FacilityItemId };
  }
  return null;
}

/** Area of a works: the one whose slot it takes (the workshop is none). */
export function jobGroup(job: WorksJob): FacilityGroup | null {
  if (job.kind === "item") return ITEM_GROUP[job.item];
  if (job.kind === "training" || job.kind === "academy") return job.kind;
  if (job.kind === "workshop") return null;
  return "stadium";
}

// ── To do ─────────────────────────────────────────────────────────────────────

/** What the list reads of an item (`GET /facilities` → `items`). */
export interface TodoItemInput {
  id: FacilityItemId;
  group: FacilityGroup;
  level: number;
  condition: number;
  condemned: boolean;
  project: unknown | null;
  quotes: {
    repair: { "100": TodoQuote | null };
    rebuild: TodoQuote | null;
    upgrade: TodoQuote | null;
  };
}
export interface TodoQuote {
  cost: number;
  small?: boolean;
  build: { recipe: ComponentCounts; missing: ComponentCounts; canBuild: boolean };
}

/** Below this condition an item goes on the "Repair" list (amber; red below `WEAR.WARN_BELOW`). */
export const TODO_REPAIR_BELOW = 70;
/** At most this many upgrades on the overview (ready ones first). */
export const TODO_MAX_IMPROVE = 4;

export interface RepairTodo {
  item: FacilityItemId;
  condition: number;
  condemned: boolean;
  tone: "warn" | "bad";
  job: WorksJob;
  /** Cost of the works (EUR, the value of its parts). */
  cost: number;
  /** Small repair whose parts are in stock and whose area is free: a one-click Repair button. */
  quick: boolean;
}

export interface ImproveTodo {
  item: FacilityItemId;
  level: number;
  /** Every part of the next level is in stock. */
  ready: boolean;
  /** Parts still missing (units). */
  missing: number;
  job: WorksJob;
}

export const partsMissing = (missing: ComponentCounts): number =>
  Object.values(missing).reduce<number>((s, n) => s + (n ?? 0), 0);

/** Parts of a recipe split in the ones in stock and the ones short, in recipe order. */
export function partsOf(recipe: ComponentCounts, missing: ComponentCounts) {
  const rows = (Object.entries(recipe) as [keyof ComponentCounts, number][])
    .filter(([, n]) => n > 0)
    .map(([id, need]) => ({ id, need, have: need - Math.min(need, missing[id] ?? 0), short: Math.min(need, missing[id] ?? 0) }));
  return { rows, ready: rows.every((r) => r.short === 0), short: rows.reduce((s, r) => s + r.short, 0) };
}

/**
 * The "To do" list: items to repair (condemned first, then the lowest condition), items to upgrade (no works on them,
 * not on the repair list; ready first, then the fewest parts missing, at most `TODO_MAX_IMPROVE`).
 */
export function clubTodo(items: readonly TodoItemInput[], busyGroups: readonly FacilityGroup[]): { repair: RepairTodo[]; improve: ImproveTodo[] } {
  const busy = new Set(busyGroups);
  const order = (id: FacilityItemId) => FACILITY_ITEMS.indexOf(id);
  const repair: RepairTodo[] = items
    .filter((it) => !it.project && (it.condemned || it.condition < TODO_REPAIR_BELOW))
    .map((it) => {
      const rebuild = it.condemned || it.condition < FACILITIES.WEAR.CONDEMN_BELOW;
      const quote = rebuild ? it.quotes.rebuild ?? it.quotes.repair["100"] : it.quotes.repair["100"];
      const mode: ItemJobMode = rebuild && it.quotes.rebuild ? "rebuild" : "repair";
      return {
        item: it.id,
        condition: it.condemned ? 0 : it.condition,
        condemned: it.condemned,
        tone: it.condemned || it.condition < FACILITIES.WEAR.WARN_BELOW ? "bad" as const : "warn" as const,
        job: { kind: "item" as const, mode, item: it.id },
        cost: quote?.cost ?? 0,
        quick: mode === "repair" && quote?.small === true && quote.build.canBuild && !busy.has(it.group),
      };
    })
    .sort((a, b) => Number(b.condemned) - Number(a.condemned) || a.condition - b.condition || order(a.item) - order(b.item));
  const inRepair = new Set(repair.map((r) => r.item));
  const improve: ImproveTodo[] = items
    .filter((it) => !it.project && !inRepair.has(it.id) && it.level < FACILITIES.ITEM_MAX_LEVEL && it.quotes.upgrade)
    .map((it) => {
      const missing = partsMissing(it.quotes.upgrade!.build.missing);
      return { item: it.id, level: it.level, ready: missing === 0, missing, job: { kind: "item" as const, mode: "upgrade" as const, item: it.id } };
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready) || a.missing - b.missing || order(a.item) - order(b.item))
    .slice(0, TODO_MAX_IMPROVE);
  return { repair, improve };
}

/** The works an item opens on: rebuild when condemned, repair below `TODO_REPAIR_BELOW`, else the upgrade. */
export function itemJob(it: Pick<TodoItemInput, "id" | "condition" | "condemned" | "level" | "quotes">): WorksJob {
  if ((it.condemned || it.condition < FACILITIES.WEAR.CONDEMN_BELOW) && it.quotes.rebuild) return { kind: "item", mode: "rebuild", item: it.id };
  if (it.condition < TODO_REPAIR_BELOW && it.quotes.repair["100"]) return { kind: "item", mode: "repair", item: it.id };
  if (it.quotes.upgrade) return { kind: "item", mode: "upgrade", item: it.id };
  if (it.quotes.repair["100"]) return { kind: "item", mode: "repair", item: it.id };
  return { kind: "item", mode: "upgrade", item: it.id };
}
