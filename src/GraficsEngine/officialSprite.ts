/**
 * The referee, the assistants, the managers and the medics as top-down sprites (art plan phase 3), following the art
 * preview (`fmproject-art-handoff/reference/preview-template.html`): the same gait and turning as the players
 * (`playerSprite.ts`), each kind with its own frames from the officials atlas
 * (`src/example_data/assets/officials`, frames face −y, six layers). Pure: which frame a figure shows. Drawing only.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";
import { PLAYER_SPRITE, type SpriteMotion } from "@/GraficsEngine/playerSprite";

export type OfficialKind = "referee" | "assistant" | "fourth" | "coach" | "medic";

export const OFFICIAL_SPRITE = {
  /** The referee's kit (the preview's REF): dark shirt and socks, yellow trim. */
  REF: { shirt: 0x23262e, trim: 0xf2c230, socks: 0x23262e },
  /** The fourth official: a bluer shirt, so he reads apart from the referee. */
  FOURTH: { shirt: 0x3a4458, trim: 0xf2c230, socks: 0x23262e },
  MEDIC: { shirt: 0xf4f6fa, trim: 0xd63430, socks: 0x2b3140 },
  /** The managers' trousers (the shirt is the club colour). */
  COACH_SOCKS: 0x1d2433,
  /** Body width relative to a player's (the officials stay a little smaller than the players). */
  SCALE: { referee: 0.85, assistant: 0.8, fourth: 0.8, coach: 0.85, medic: 0.8 },
  /** An assistant runs along the line above this drawn lateral speed (yards per second) and side-steps below RUN_DOWN. */
  AR_RUN_UP: 3.6,
  AR_RUN_DOWN: 2.4,
  /** Seconds the fourth official holds the board up after a substitution. */
  BOARD_S: 4,
} as const;

/** Frame prefix in the atlas for each kind (the fourth official uses the referee's frames). */
export function atlasPrefix(kind: OfficialKind): string {
  return kind === "fourth" ? "referee" : kind;
}

/** Tints of the six layers of an official (stable skin and hair by his id); `detail` stays untinted. */
export function officialTints(kind: OfficialKind, id: string, clubColor = 0x2b3140): Record<string, number> {
  const r = mulberry32(seedFrom(`official:${id}`));
  const skin = PLAYER_SPRITE.SKIN[Math.floor(r() * PLAYER_SPRITE.SKIN.length)]!;
  const hair = PLAYER_SPRITE.HAIR[Math.floor(r() * PLAYER_SPRITE.HAIR.length)]!;
  const S = OFFICIAL_SPRITE;
  if (kind === "coach") return { shirt: clubColor, trim: clubColor, socks: S.COACH_SOCKS, skin, hair };
  const kit = kind === "medic" ? S.MEDIC : kind === "fourth" ? S.FOURTH : S.REF;
  return { ...kit, skin, hair };
}

const step = (phase: number) => String((Math.floor(phase * 8) % 8) + 1).padStart(2, "0");

/** Pose overrides: a card in the hand, the flag up, the board up, a manager pointing, a medic kneeling. */
export interface OfficialPoseState {
  card?: boolean;
  flagUp?: boolean;
  board?: boolean;
  point?: boolean;
  kneel?: boolean;
  /** Assistant only: side-stepping facing the pitch (else running along the line). */
  sideStep?: boolean;
}

/** The frame base name (`referee-run-03`) a figure shows. */
export function officialPose(kind: OfficialKind, m: SpriteMotion, s: OfficialPoseState = {}): string {
  const p = atlasPrefix(kind);
  if (kind === "coach") return s.point ? "coach-point" : "coach-idle";
  if (s.card && kind === "referee") return "referee-card";
  if (s.board) return "referee-board";
  if (s.flagUp && kind === "assistant") return "assistant-flag-up";
  if (s.kneel && kind === "medic") return "medic-kneel";
  if (m.gait === "idle") return `${p}-idle`;
  if (kind === "assistant" && s.sideStep) return `assistant-side-${step(m.phase)}`;
  // Medics only run (no walk frames).
  const gait = kind === "medic" ? "run" : m.gait;
  return `${p}-${gait}-${step(m.phase)}`;
}

/**
 * Whether an assistant side-steps (short adjustments, facing the pitch) or runs along the line, with hysteresis on
 * the speed along the line.
 */
export function assistantSideStep(prev: boolean, lateralSpeed: number): boolean {
  const v = Math.abs(lateralSpeed);
  return prev ? v < OFFICIAL_SPRITE.AR_RUN_UP : v < OFFICIAL_SPRITE.AR_RUN_DOWN;
}
