import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import { SECRETS, TRACKS } from "@/Domain/achievements/catalog";
import { earnedPoints } from "@/Domain/achievements/progress";
import {
  ACHIEVEMENT_CATEGORIES, FRAMES, SECRET_IDS, TRACK_IDS, type AchievementsState, type Badge, type Frame,
  type ManagerProfile, type SecretView, type StadiumDecor, type TrackId, type TrackView,
} from "@/types/achievementTypes";

/** Profile items and stadium decorations unlocked by a career (spec §3, §6). */

export function availableFrames(state: AchievementsState): Frame[] {
  const pts = earnedPoints(state);
  return FRAMES.filter((f) => f === "none" || pts >= A.FRAME_POINTS[f]);
}

export function availableBadges(state: AchievementsState): Badge[] {
  const out: Badge[] = ACHIEVEMENT_CATEGORIES.filter((cat) =>
    TRACK_IDS.some((id) => TRACKS[id].category === cat && state.unlocked[`${id}:gold`]));
  if (SECRET_IDS.some((id) => state.unlocked[`secret:${id}`])) out.push("mystery");
  return out;
}

/** Tracks whose gold gives a displayed title. */
export function availableTitles(state: AchievementsState): TrackId[] {
  return TRACK_IDS.filter((id) => state.unlocked[`${id}:gold`]);
}

export function availableDecor(state: AchievementsState): Record<keyof StadiumDecor, boolean> {
  const pts = earnedPoints(state);
  return { banner: pts >= A.DECOR_POINTS.banner, flag: pts >= A.DECOR_POINTS.flag, mosaic: pts >= A.DECOR_POINTS.mosaic };
}

/** The profile to show: only items still unlocked (a stored choice never shows a locked item). */
export function shownProfile(state: AchievementsState): ManagerProfile {
  const frames = new Set(availableFrames(state));
  const badges = new Set(availableBadges(state));
  const titles = new Set(availableTitles(state));
  const p = state.profile;
  return {
    frame: frames.has(p.frame) ? p.frame : "none",
    badges: p.badges.filter((b) => badges.has(b)).slice(0, A.MAX_BADGES),
    title: p.title && titles.has(p.title) ? p.title : null,
  };
}

/** Decorations drawn at home: chosen and unlocked. */
export function shownDecor(state: AchievementsState): StadiumDecor {
  const ok = availableDecor(state);
  return { banner: state.decor.banner && ok.banner, flag: state.decor.flag && ok.flag, mosaic: state.decor.mosaic && ok.mosaic };
}

/** Validates a profile PUT body against what is unlocked. Throws a message on error. */
export function parseProfile(raw: unknown, state: AchievementsState): ManagerProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalidProfile");
  const r = raw as Record<string, unknown>;
  const frame = r.frame ?? "none";
  if (typeof frame !== "string" || !(FRAMES as readonly string[]).includes(frame)) throw new Error("invalidProfile");
  if (!availableFrames(state).includes(frame as Frame)) throw new Error("locked");
  const badgesRaw = r.badges ?? [];
  if (!Array.isArray(badgesRaw) || badgesRaw.length > A.MAX_BADGES) throw new Error("invalidProfile");
  const badgeSet = new Set(availableBadges(state));
  const badges: Badge[] = [];
  for (const b of badgesRaw) {
    if (typeof b !== "string" || badges.includes(b as Badge)) throw new Error("invalidProfile");
    if (!badgeSet.has(b as Badge)) throw new Error("locked");
    badges.push(b as Badge);
  }
  const title = r.title ?? null;
  if (title !== null) {
    if (typeof title !== "string" || !(TRACK_IDS as readonly string[]).includes(title)) throw new Error("invalidProfile");
    if (!availableTitles(state).includes(title as TrackId)) throw new Error("locked");
  }
  return { frame: frame as Frame, badges, title: title as TrackId | null };
}

export function parseDecor(raw: unknown, state: AchievementsState): StadiumDecor {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalidDecor");
  const r = raw as Record<string, unknown>;
  const ok = availableDecor(state);
  const out: StadiumDecor = { banner: false, flag: false, mosaic: false };
  for (const k of ["banner", "flag", "mosaic"] as const) {
    const v = r[k] ?? false;
    if (typeof v !== "boolean") throw new Error("invalidDecor");
    if (v && !ok[k]) throw new Error("locked");
    out[k] = v;
  }
  return out;
}

// ── Screen views ──────────────────────────────────────────────────────────────

export function trackViews(state: AchievementsState, values: Record<TrackId, number>): TrackView[] {
  return TRACK_IDS.map((id) => {
    const def = TRACKS[id];
    const unlocked: TrackView["unlocked"] = {};
    for (const tier of ["bronze", "silver", "gold"] as const) {
      const on = state.unlocked[`${id}:${tier}`];
      if (on) unlocked[tier] = on;
    }
    return { id, category: def.category, attribute: def.attribute, value: values[id], thresholds: def.thresholds, unlocked };
  });
}

export function secretViews(state: AchievementsState): SecretView[] {
  return SECRET_IDS.map((id) => {
    const on = state.unlocked[`secret:${id}`];
    return { id, attribute: SECRETS[id].attribute, ...(on ? { unlocked: on } : {}) };
  });
}
