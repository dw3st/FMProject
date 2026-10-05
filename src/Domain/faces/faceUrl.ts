/**
 * URL of a player's generated face (`GET /api/faces/:playerId.svg`). Pure and tiny on purpose:
 * this is all the client needs, so facesjs stays on the server.
 *
 * `v` is part of the URL because the response is cached as immutable — bump `FACE_VERSION`
 * whenever the face output changes (facesjs upgrade, new crop, different appearance mix, new `faceTraits.json`).
 */
export const FACE_VERSION = 4;

/** Accepted player id shape (ids are `player_123`, `of_*`, `es_*`, `reborn_*`, numeric...). */
export const FACE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** Accepted colour: hex with or without `#`, 3–8 digits. */
export const FACE_COLOR_RE = /^#?[0-9a-fA-F]{3,8}$/;

export const MAX_FACE_COLORS = 3;
export const MAX_FACE_NATIONALITY = 64;

export function faceUrl(
  playerId: string,
  nationality?: string | null,
  clubColors?: readonly string[],
): string {
  const params = new URLSearchParams();
  params.set("v", String(FACE_VERSION));
  if (nationality) params.set("nat", nationality.slice(0, MAX_FACE_NATIONALITY));
  const colors = (clubColors ?? []).slice(0, MAX_FACE_COLORS).map((c) => c.replace(/^#/, ""));
  if (colors.length > 0) params.set("colors", colors.join(","));
  return `/api/faces/${encodeURIComponent(playerId)}.svg?${params.toString()}`;
}
