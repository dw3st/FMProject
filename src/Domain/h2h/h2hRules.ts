import { H2H } from "@/Domain/h2h/h2hConfig";
import { FORMATION_IDS } from "@/Domain/matchFormations";
import { parseAxesOverride } from "@/Domain/formation/zones";
import { isRoleVariantId } from "@/GameEngine/Configs/RoleVariantConfig";
import { MENTALITY_OPTIONS } from "@/types/tacticsTypes";
import type { Mentality, PressLevel, SlotInstruction, TacticalStyle } from "@/types/tacticsTypes";
import type { H2HCommand, H2HPhase, H2HRoomView, H2HSeatStatus, H2HSide } from "@/types/h2hTypes";

/** One side of a room (pure state; the sockets live elsewhere). */
export interface H2HRoomSide {
  seatId: string;
  nickname: string | null;
  clubId: string;
  clubName: string;
  status: H2HSeatStatus;
  pausesLeft: number;
  connected: boolean;
}

/** The pure state of a live-match room. */
export interface H2HRoom {
  saveId: string;
  fixtureId: string;
  date: string;
  phase: H2HPhase;
  sides: Record<H2HSide, H2HRoomSide>;
  pause: { by: H2HSide; until: number } | null;
}

export type H2HSideIdentity = Pick<H2HRoomSide, "seatId" | "nickname" | "clubId" | "clubName">;

export interface H2HRoomChange {
  room: H2HRoom;
  /** True the moment both managers are ready in the lobby: the room just went live. */
  start: boolean;
}

const SIDES: readonly H2HSide[] = ["A", "B"];

function freshSide(id: H2HSideIdentity): H2HRoomSide {
  return { ...id, status: "away", pausesLeft: H2H.PAUSES, connected: false };
}

function withSide(room: H2HRoom, side: H2HSide, patch: Partial<H2HRoomSide>): H2HRoom {
  return { ...room, sides: { ...room.sides, [side]: { ...room.sides[side], ...patch } } };
}

/** A new room in the lobby, both managers away. */
export function newRoom(init: {
  saveId: string;
  fixtureId: string;
  date: string;
  sides: Record<H2HSide, H2HSideIdentity>;
}): H2HRoom {
  return {
    saveId: init.saveId,
    fixtureId: init.fixtureId,
    date: init.date,
    phase: "lobby",
    sides: { A: freshSide(init.sides.A), B: freshSide(init.sides.B) },
    pause: null,
  };
}

/** A manager opens the room (or reconnects to a live match). Keeps `ready` once set. */
export function joinRoom(room: H2HRoom, side: H2HSide): H2HRoomChange {
  if (room.phase === "done" || room.phase === "closed") return { room, start: false };
  const cur = room.sides[side];
  const status: H2HSeatStatus = cur.status === "away" ? "in" : cur.status;
  return { room: withSide(room, side, { status, connected: true }), start: false };
}

/** A manager in the lobby clicks Start; the match starts when both are ready. */
export function setReady(room: H2HRoom, side: H2HSide): H2HRoomChange {
  if (room.phase !== "lobby" || room.sides[side].status === "away") return { room, start: false };
  const next = withSide(room, side, { status: "ready" });
  if (SIDES.every((s) => next.sides[s].status === "ready")) {
    return { room: { ...next, phase: "live" }, start: true };
  }
  return { room: next, start: false };
}

/** A manager leaves (or loses the socket). In the lobby he goes back to away; live, only disconnected. */
export function leaveRoom(room: H2HRoom, side: H2HSide): H2HRoomChange {
  const patch: Partial<H2HRoomSide> = room.phase === "lobby"
    ? { status: "away", connected: false }
    : { connected: false };
  return { room: withSide(room, side, patch), start: false };
}

/** The match is over. */
export function finishRoom(room: H2HRoom): H2HRoom {
  return { ...room, phase: "done", pause: null };
}

/** The room closes without a live match (simulated, deadline, both left). */
export function closeRoom(room: H2HRoom): H2HRoom {
  return { ...room, phase: "closed", pause: null };
}

export function canPause(room: H2HRoom, side: H2HSide, _now: number): boolean {
  return room.phase === "live" && room.pause === null && room.sides[side].pausesLeft > 0;
}

/** Starts a pause (unchanged room when not allowed): one pause less, `until = now + PAUSE_SECONDS`. */
export function startPause(room: H2HRoom, side: H2HSide, now: number): H2HRoom {
  if (!canPause(room, side, now)) return room;
  const next = withSide(room, side, { pausesLeft: room.sides[side].pausesLeft - 1 });
  return { ...next, pause: { by: side, until: now + H2H.PAUSE_SECONDS * 1000 } };
}

/** Only the manager who paused resumes early, before the pause runs out. */
export function canResume(room: H2HRoom, side: H2HSide, now: number): boolean {
  return room.phase === "live" && room.pause !== null && room.pause.by === side && now < room.pause.until;
}

export function endPause(room: H2HRoom): H2HRoom {
  return room.pause === null ? room : { ...room, pause: null };
}

export function pauseExpired(room: H2HRoom, now: number): boolean {
  return room.pause !== null && now >= room.pause.until;
}

export function roomView(room: H2HRoom): H2HRoomView {
  const side = (s: H2HSide) => ({ ...room.sides[s] });
  return {
    saveId: room.saveId,
    fixtureId: room.fixtureId,
    date: room.date,
    phase: room.phase,
    sides: { A: side("A"), B: side("B") },
    pause: room.pause ? { ...room.pause } : null,
  };
}

// ── Commands ────────────────────────────────────────────────────────────────

const TACTICAL_STYLES: Record<TacticalStyle, true> = {
  counter_attack: true, high_press: true, possession: true, direct_play: true, balanced: true,
};
const PRESS_LEVELS: readonly PressLevel[] = ["less", "normal", "more"];
const MAX_SLOT = 10;
const MAX_MARKS = 2;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function hasOnly(o: Obj, keys: readonly string[]): boolean {
  return Object.keys(o).every((k) => keys.includes(k));
}
function isId(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}
function isSlot(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_SLOT;
}

function parseInstruction(v: unknown): SlotInstruction | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !hasOnly(v, ["variant", "press"])) return undefined;
  const out: SlotInstruction = {};
  if (v.variant !== undefined) {
    if (!isRoleVariantId(v.variant)) return undefined;
    out.variant = v.variant;
  }
  if (v.press !== undefined) {
    if (typeof v.press !== "string" || !PRESS_LEVELS.includes(v.press as PressLevel)) return undefined;
    out.press = v.press as PressLevel;
  }
  return out;
}

/** Validates an untrusted command from a socket; null when its shape or limits are wrong. */
export function parseH2HCommand(raw: unknown): H2HCommand | null {
  if (!isObj(raw) || typeof raw.kind !== "string") return null;
  switch (raw.kind) {
    case "sub":
      if (!hasOnly(raw, ["kind", "outId", "inId"]) || !isId(raw.outId) || !isId(raw.inId) || raw.outId === raw.inId) return null;
      return { kind: "sub", outId: raw.outId, inId: raw.inId };
    case "unsub":
      if (!hasOnly(raw, ["kind", "outId"]) || !isId(raw.outId)) return null;
      return { kind: "unsub", outId: raw.outId };
    case "swap":
      if (!hasOnly(raw, ["kind", "aId", "bId"]) || !isId(raw.aId) || !isId(raw.bId) || raw.aId === raw.bId) return null;
      return { kind: "swap", aId: raw.aId, bId: raw.bId };
    case "mentality":
      if (!hasOnly(raw, ["kind", "mentality"]) || !MENTALITY_OPTIONS.includes(raw.mentality as Mentality)) return null;
      return { kind: "mentality", mentality: raw.mentality as Mentality };
    case "tactics": {
      if (!hasOnly(raw, ["kind", "style", "axesOverride"])) return null;
      if (typeof raw.style !== "string" || !Object.hasOwn(TACTICAL_STYLES, raw.style)) return null;
      const style = raw.style as TacticalStyle;
      if (raw.axesOverride === undefined) return { kind: "tactics", style };
      if (!isObj(raw.axesOverride)) return null;
      const axes = parseAxesOverride(raw.axesOverride);
      if (axes === null) return null;
      return { kind: "tactics", style, axesOverride: axes };
    }
    case "formation":
      if (!hasOnly(raw, ["kind", "formation"]) || typeof raw.formation !== "string" || !FORMATION_IDS.includes(raw.formation)) return null;
      return { kind: "formation", formation: raw.formation };
    case "instruction": {
      if (!hasOnly(raw, ["kind", "slot", "instruction"]) || !isSlot(raw.slot)) return null;
      const instruction = parseInstruction(raw.instruction);
      if (instruction === undefined) return null;
      return { kind: "instruction", slot: raw.slot, instruction };
    }
    case "marks": {
      if (!hasOnly(raw, ["kind", "marks"]) || !Array.isArray(raw.marks) || raw.marks.length > MAX_MARKS) return null;
      const marks: { markerSlot: number; targetId: number }[] = [];
      for (const m of raw.marks) {
        if (!isObj(m) || !hasOnly(m, ["markerSlot", "targetId"]) || !isSlot(m.markerSlot) || !isId(m.targetId)) return null;
        if (marks.some((x) => x.markerSlot === m.markerSlot || x.targetId === m.targetId)) return null;
        marks.push({ markerSlot: m.markerSlot, targetId: m.targetId });
      }
      return { kind: "marks", marks };
    }
    default:
      return null;
  }
}
