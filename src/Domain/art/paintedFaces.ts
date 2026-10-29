/**
 * Painted faces of the new art (`C:\projects\fmproject-art-handoff`, decision 3): a face's URL points at the painted
 * webp when its id is in the art index the server announced (`GET /api/art/faces`), otherwise at the SVG face as
 * before. Pure module state, set once per page by `loadPaintedFaces`; nothing breaks without it.
 */
import type { ManagerFace } from "@/Domain/faces/managerFace";

/** Version segment of the art URLs (`/assets/art/v1/...`): bump it whenever the art files change. */
export const ART_ASSET_VERSION = "v1";

export interface PaintedFaceIds {
  players: string[];
  coaches: string[];
  referees: string[];
}

let painted: { players: Set<string>; coaches: Set<string>; referees: Set<string> } = {
  players: new Set(), coaches: new Set(), referees: new Set(),
};

export function setPaintedFaces(ids: PaintedFaceIds | null): void {
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

/** Painted webp of the human manager's avatar, or null. */
export function paintedCoachFace(face: ManagerFace): string | null {
  const combo = coachCombo(face);
  return combo && painted.coaches.has(combo) ? artUrl(`faces/coaches/${combo}.webp`) : null;
}

/**
 * Asks the server which painted faces exist (empty while the art is switched off) before the page renders, at most
 * `timeoutMs`: a slow answer just leaves the SVG faces.
 */
export async function loadPaintedFaces(timeoutMs = 1500): Promise<void> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch("/api/art/faces", { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const body = (await res.json()) as Partial<PaintedFaceIds>;
    setPaintedFaces({
      players: Array.isArray(body.players) ? body.players : [],
      coaches: Array.isArray(body.coaches) ? body.coaches : [],
      referees: Array.isArray(body.referees) ? body.referees : [],
    });
  } catch {
    // no painted faces: the SVG ones stay
  }
}
