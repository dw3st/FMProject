/**
 * Painted faces of the new art (`C:\projects\fmproject-art-handoff`, decision 3): a face's URL points at the painted
 * webp when its id is in the art index the server announced (`GET /api/art/faces`), otherwise at the SVG face as
 * before. Pure module state, set once per page by `loadPaintedFaces`; nothing breaks without it.
 */
import type { ManagerFace } from "@/Domain/faces/managerFace";
import { seedFrom } from "@/Domain/rng";

/** Version segment of the art URLs (`/assets/art/v3/...`): bump it whenever the art files change. */
export const ART_ASSET_VERSION = "v3";

export interface PaintedFaceIds {
  players: string[];
  coaches: string[];
  referees: string[];
}

/** What the server announces: the painted faces and the painted match backdrops. */
export interface ArtManifest extends PaintedFaceIds {
  backdrops: string[];
  /** Painted penalty backdrops (art phase 6). */
  penaltyBackdrops?: string[];
  /** Painted facilities and inbox illustrations (art phase 7). */
  facilities?: string[];
  news?: string[];
  /** The new visual is on on the server (`ART_VISUAL` not 0). */
  visual?: boolean;
}

/** Version segment of the in-repo game art (`/assets/game/v1/...`, atlases of `src/example_data/assets`). */
export const GAME_ART_VERSION = "v1";
export const gameArtUrl = (path: string) => `/assets/game/${GAME_ART_VERSION}/${path}`;

let newVisual = false;

/** The new visual is on for this page (server switch and the player's own, Settings). */
export function newVisualOn(): boolean {
  return newVisual;
}

/** Tests and tools: switch the new visual for this page. */
export function setNewVisual(on: boolean): void {
  newVisual = on;
}

let backdrops = new Set<string>();

/** Painted match backdrops on (empty = the drawn turf). */
export function setPaintedBackdrops(ids: string[] | null): void {
  backdrops = new Set(ids ?? []);
}

let penaltyBackdrops = new Set<string>();

/** Painted penalty backdrops on (empty = the drawn penalty scene). */
export function setPaintedPenaltyBackdrops(ids: string[] | null): void {
  penaltyBackdrops = new Set(ids ?? []);
}

/** Painted penalty backdrop by id (`penalty-bg-night`…), or null. */
export function paintedPenaltyBackdrop(id: string): string | null {
  return penaltyBackdrops.has(id) ? artUrl(`backdrops/penalty/${encodeURIComponent(id)}.webp`) : null;
}

let paintedFacilityIds = new Set<string>();
let paintedNewsIds = new Set<string>();

export function setPaintedScreens(facilities: string[] | null, news: string[] | null): void {
  paintedFacilityIds = new Set(facilities ?? []);
  paintedNewsIds = new Set(news ?? []);
}

/**
 * Revision of the painted facility files: they were repainted in place (ten levels, 4.41.25), so their URLs carry it
 * as a query (the art route ignores the query) to skip the browsers' immutable cache without bumping every art URL.
 */
export const FACILITY_ART_REVISION = 3;

/**
 * Painted facility (art phase 7) for an item (`stadiumPitch` → `facility-stadium-pitch`) at the game's level 1..10:
 * one painting per level (`facility-<id>-<1..10>`); null without it.
 */
export function paintedFacility(itemId: string, level: number): string | null {
  const kebab = itemId.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const lv = Math.min(10, Math.max(1, Math.round(level)));
  const id = `facility-${kebab}-${lv}`;
  return paintedFacilityIds.has(id) ? `${artUrl(`facilities/${id}.webp`)}?r=${FACILITY_ART_REVISION}` : null;
}

/** Painted illustration of an inbox category (art phase 7), or null. */
export function paintedNews(category: string): string | null {
  const id = `news-${category}`;
  return paintedNewsIds.has(id) ? artUrl(`news/${encodeURIComponent(id)}.webp`) : null;
}

/** Painted match backdrop by id (`match-backdrop-grass-a`…), or null. */
export function paintedBackdrop(id: string): string | null {
  return backdrops.has(id) ? artUrl(`backdrops/match/${encodeURIComponent(id)}.webp`) : null;
}

let painted: { players: Set<string>; coaches: Set<string>; referees: Set<string> } = {
  players: new Set(), coaches: new Set(), referees: new Set(),
};

export function setPaintedFaces(ids: PaintedFaceIds | null): void {
  standIns.clear();
  painted = {
    players: new Set(ids?.players ?? []),
    coaches: new Set(ids?.coaches ?? []),
    referees: new Set(ids?.referees ?? []),
  };
}

const artUrl = (path: string) => `/assets/art/${ART_ASSET_VERSION}/${path}`;

/** Painted webp of a player, or null. */
export function paintedPlayerFace(playerId: string): string | null {
  return painted.players.has(playerId) ? artUrl(`faces/players/${encodeURIComponent(playerId)}.webp`) : null;
}

/** Painted webp of a referee, or null. */
export function paintedRefereeFace(refereeId: string): string | null {
  return painted.referees.has(refereeId) ? artUrl(`faces/referees/${encodeURIComponent(refereeId)}.webp`) : null;
}

/**
 * The painted avatar's combination of a manager face: `<skin>-<hair colour>-<length>-<beard>-<g|n>`. Null when any
 * trait was left to the draw (the painted set has one face per full combination).
 */
export function coachCombo(face: ManagerFace): string | null {
  if (face.skin === undefined || !face.hairColor || !face.hairLength || !face.beard || face.glasses === undefined) return null;
  return `${face.skin}-${face.hairColor}-${face.hairLength}-${face.beard}-${face.glasses ? "g" : "n"}`;
}

/** Painted coach face standing for a person the game only draws (AI manager, staff, generated referee), or null. */
export function paintedPersonFace(combo: string): string | null {
  return painted.coaches.has(combo) ? artUrl(`faces/coaches/${combo}.webp`) : null;
}

const standIns = new Map<number, string[]>();

/**
 * A painted face of the generic set for a player without his own portrait (tester report: lists mixed painted and SVG
 * faces): one of the painted faces of his skin tone, young-looking (no grey hair, no glasses), picked by the id. Null
 * when the set has no face of that tone (the SVG face stays).
 */
export function paintedPlayerStandIn(playerId: string, skin: number): string | null {
  let list = standIns.get(skin);
  if (!list) {
    list = [...painted.coaches].filter((c) => c.startsWith(`${skin}-`) && !c.includes("-grey-") && c.endsWith("-n")).sort();
    standIns.set(skin, list);
  }
  if (list.length === 0) return null;
  return artUrl(`faces/coaches/${list[seedFrom(`standin:${playerId}`) % list.length]}.webp`);
}

/** Painted webp of the human manager's avatar, or null. */
export function paintedCoachFace(face: ManagerFace): string | null {
  const combo = coachCombo(face);
  return combo && painted.coaches.has(combo) ? artUrl(`faces/coaches/${combo}.webp`) : null;
}

/**
 * Asks the server which painted faces and backdrops exist (empty while the art is switched off) before the page
 * renders, at most `timeoutMs`: a slow answer just leaves the SVG faces and the drawn turf. `newVisual` false (the
 * player's own switch, Settings) keeps the drawn turf.
 */
export async function loadPaintedFaces(timeoutMs = 1500, wantsNewVisual = true): Promise<void> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch("/api/art/faces", { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const body = (await res.json()) as Partial<ArtManifest>;
    setPaintedBackdrops(wantsNewVisual && Array.isArray(body.backdrops) ? body.backdrops : []);
    setPaintedPenaltyBackdrops(wantsNewVisual && Array.isArray(body.penaltyBackdrops) ? body.penaltyBackdrops : []);
    setPaintedScreens(
      wantsNewVisual && Array.isArray(body.facilities) ? body.facilities : [],
      wantsNewVisual && Array.isArray(body.news) ? body.news : [],
    );
    setNewVisual(wantsNewVisual && body.visual === true);
    setPaintedFaces({
      players: Array.isArray(body.players) ? body.players : [],
      coaches: Array.isArray(body.coaches) ? body.coaches : [],
      referees: Array.isArray(body.referees) ? body.referees : [],
    });
  } catch {
    // no painted faces: the SVG ones stay
  }
}
