/**
 * URL of a player's generated face (`GET /api/faces/:playerId.svg`). Pure and tiny on purpose:
 * this is all the client needs, so facesjs stays on the server.
 *
 * `v` is part of the URL because the response is cached as immutable — bump `FACE_VERSION`
 * whenever the face output changes (facesjs upgrade, new crop, different appearance mix, new `faceTraits.json`).
 */
import { managerFaceQuery, type ManagerFace } from "@/Domain/faces/managerFace";

export const FACE_VERSION = 7;

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

/**
 * Version of the staff / manager faces (`personFaceSvg`, Etapa 31b): separate from the players' so
 * a change to one does not invalidate the other's cache. Bump it when that output changes.
 */
export const PERSON_FACE_VERSION = 1;

/** Accepted age of a staff member / manager on the face route. */
export const MIN_FACE_AGE = 18;
export const MAX_FACE_AGE = 90;

function colorsParam(params: URLSearchParams, colors: readonly string[] | undefined): void {
  const list = (colors ?? []).slice(0, MAX_FACE_COLORS).map((c) => c.replace(/^#/, ""));
  if (list.length > 0) params.set("colors", list.join(","));
}

/**
 * URL of a staff member's or an AI manager's generated face (`GET /api/faces/person/:id.svg`):
 * deterministic per id, an adult (older with `age`), shirt in the club colours.
 */
export function personFaceUrl(
  personId: string,
  nationality?: string | null,
  clubColors?: readonly string[],
  age?: number | null,
): string {
  const params = new URLSearchParams();
  params.set("v", String(PERSON_FACE_VERSION));
  if (nationality) params.set("nat", nationality.slice(0, MAX_FACE_NATIONALITY));
  colorsParam(params, clubColors);
  if (age != null && Number.isFinite(age)) {
    params.set("age", String(Math.min(MAX_FACE_AGE, Math.max(MIN_FACE_AGE, Math.round(age)))));
  }
  return `/api/faces/person/${encodeURIComponent(personId)}.svg?${params.toString()}`;
}

/** URL of the human manager's avatar (`GET /api/faces/manager/avatar.svg`), from its saved parameters. */
export function managerAvatarUrl(
  face: ManagerFace,
  nationality?: string | null,
  clubColors?: readonly string[],
): string {
  const params = managerFaceQuery(face);
  params.set("v", String(PERSON_FACE_VERSION));
  if (nationality) params.set("nat", nationality.slice(0, MAX_FACE_NATIONALITY));
  colorsParam(params, clubColors);
  return `/api/faces/manager/avatar.svg?${params.toString()}`;
}

/**
 * Face of any manager: the human one's saved avatar when he has one, otherwise the face drawn
 * from the manager id (AI managers, and saves from before the avatar existed).
 */
export function managerFaceUrl(
  manager: { id: string; face?: ManagerFace | null; nationality?: string | null },
  clubColors?: readonly string[],
): string {
  return manager.face
    ? managerAvatarUrl(manager.face, manager.nationality, clubColors)
    : personFaceUrl(manager.id, manager.nationality, clubColors);
}

/** Referee kit for the face: black shirt, yellow collar . */
export const REFEREE_FACE_COLORS = ["#111418", "#111418", "#f5d020"] as const;

/** Face of a referee or an assistant (`referees.md`): the person face in the referee kit, a woman's with `female`. */
export function refereeFaceUrl(id: string, country?: string | null, age?: number | null, female = false): string {
  const url = personFaceUrl(id, country, REFEREE_FACE_COLORS, age);
  return female ? `${url}&g=f` : url;
}
