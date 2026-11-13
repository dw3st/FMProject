// Pure helpers of watching a friend's live match.
import type { H2HWireState } from "@/types/h2hTypes";
import type { WatchInfo, WatchLook, WatchTeam } from "@/types/watchTypes";
import type { LiveScoreView } from "@/types/rivalsTypes";
import { SPONSOR_ID } from "@/Domain/sponsors/sponsorPlate";

/** The relayed state with the benches of the previous one when it left them out (unchanged). */
export function withBenches(prev: H2HWireState | undefined, next: H2HWireState): H2HWireState {
  if (next.benchA && next.benchB) return next;
  return { ...next, benchA: next.benchA ?? prev?.benchA ?? [], benchB: next.benchB ?? prev?.benchB ?? [] };
}

/**
 * Who is who: in a solo match engine team A is always the friend's club; in a match between two managers the server
 * runs (`h2h`) A is the home side. The drawing is turned so the home side is on the left.
 */
export function watchInfoOf(
  live: LiveScoreView, kind: WatchInfo["kind"], club: WatchTeam, opponent: WatchTeam,
): WatchInfo {
  const friendIsA = kind === "solo" || live.home;
  return {
    seatId: live.seatId,
    nickname: live.nickname,
    live,
    teams: friendIsA ? { A: club, B: opponent } : { A: opponent, B: club },
    friendSide: friendIsA ? "A" : "B",
    mirror: kind === "solo" && !live.home,
    kind,
  };
}

const SAFE_URL = /^\/(api\/faces|assets\/art|api\/logos)\/[A-Za-z0-9_\-./%?=&:,]*$/;
const COLOR = /^#?[0-9a-fA-F]{3,8}$/;
const str = (v: unknown, max = 200): v is string => typeof v === "string" && v.length <= max;
const url = (v: unknown): string | undefined => (str(v, 400) && SAFE_URL.test(v) ? v : undefined);
const color = (v: unknown): string | undefined => (str(v, 16) && COLOR.test(v) ? v : undefined);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);

/** A plain data object (numbers, booleans, short strings, nested arrays/objects), no URLs; null otherwise. */
function plainData(v: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  if (str(v, 120) && !v.includes("/")) return v;
  if (Array.isArray(v)) return v.length <= 40 ? v.map((x) => plainData(x, depth + 1)).filter((x) => x !== undefined) : undefined;
  const o = obj(v);
  if (!o) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o).slice(0, 40)) {
    const d = plainData(x, depth + 1);
    if (d !== undefined) out[k] = d;
  }
  return out;
}

/** The home club's LED sponsors of a relayed look: catalog ids, short names, two colours and a small weight only. */
function sponsorBoards(raw: unknown): { id: string; name: string; colors: [string, string]; weight: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { id: string; name: string; colors: [string, string]; weight: number }[] = [];
  for (const item of raw.slice(0, 8)) {
    const o = obj(item);
    const colors = o && Array.isArray(o.colors) ? o.colors : [];
    const bg = color(colors[0]), fg = color(colors[1]);
    if (!o || !str(o.id, 84) || !SPONSOR_ID.test(o.id) || !str(o.name, 40) || o.name.trim() === "" || !bg || !fg) continue;
    const weight = typeof o.weight === "number" && Number.isFinite(o.weight) ? Math.max(1, Math.min(3, Math.round(o.weight))) : 1;
    out.push({ id: o.id, name: o.name, colors: [bg, fg], weight });
  }
  return out;
}

/**
 * The friend's pitch look as the spectator may use it: colours, the game's own face / art / logo URLs, and plain
 * drawing data. Anything else is dropped (it came from another browser). Null without the two kit colours.
 */
export function sanitizeWatchLook(raw: unknown): WatchLook | null {
  const o = obj(raw);
  if (!o) return null;
  const a = color(o.teamAColor);
  const b = color(o.teamBColor);
  if (!a || !b) return null;
  const look: WatchLook = { teamAColor: a, teamBColor: b };
  const a2 = color(o.teamAColor2);
  const b2 = color(o.teamBColor2);
  if (a2) look.teamAColor2 = a2;
  if (b2) look.teamBColor2 = b2;
  const faces = obj(o.faceUrls);
  if (faces) {
    look.faceUrls = {};
    for (const side of ["A", "B"] as const) {
      const map = obj(faces[side]);
      if (!map) continue;
      const clean: Record<string, string> = {};
      for (const [id, u] of Object.entries(map).slice(0, 40)) {
        const ok = url(u);
        if (ok && str(id, 80)) clean[id] = ok;
      }
      look.faceUrls[side] = clean;
    }
  }
  const stadium = obj(o.stadium);
  if (stadium) {
    const { homeCrest, led: _led, sponsors, ...rest } = stadium;
    const data = plainData(rest) as Record<string, unknown> | undefined;
    const boards = sponsorBoards(sponsors);
    if (data) look.stadium = { ...data, ...(url(homeCrest) ? { homeCrest: url(homeCrest) } : {}), ...(boards.length > 0 ? { sponsors: boards } : {}) };
  }
  const pitch = plainData(o.pitch);
  if (pitch && typeof pitch === "object") look.pitch = pitch as Record<string, unknown>;
  const lighting = plainData(o.lighting);
  if (lighting && typeof lighting === "object") look.lighting = lighting as Record<string, unknown>;
  if (o.officials === true) look.officials = true;
  else {
    const off = obj(o.officials);
    if (off) {
      const af = Array.isArray(off.assistantFaces) ? off.assistantFaces : [];
      look.officials = {
        ...(url(off.refereeFace) ? { refereeFace: url(off.refereeFace) } : {}),
        assistantFaces: [url(af[0]), url(af[1])],
      };
    }
  }
  const coaches = obj(o.coaches);
  if (coaches) {
    look.coaches = {};
    for (const side of ["A", "B"] as const) {
      const c = obj(coaches[side]);
      const col = c ? color(c.color) : undefined;
      if (c && col) look.coaches[side] = { color: col, ...(url(c.faceUrl) ? { faceUrl: url(c.faceUrl) } : {}) };
    }
  }
  return look;
}
