import { cardsOverlap, spreadAlongAxis, wideCardSpec } from "@/Domain/formation/pitchMarkers";

type SlotXY = { x: number; y: number };

/**
 * Player card of the live substitution panel's mini pitch, in px, with the gap kept between two cards. Below
 * `COMPACT_BELOW` px of pitch width the card drops the face (`COMPACT_W`), so eleven cards still fit a short window.
 */
export const SUBS_CARD = { W: 128, COMPACT_W: 88, H: 42, MARGIN: 6, COMPACT_BELOW: 640 } as const;

export function subsCardCompact(pitchW: number): boolean {
  return pitchW < SUBS_CARD.COMPACT_BELOW;
}

/** Card size in percent of a pitch `pitchW` × `pitchH` px (margin included). */
export function subsCardPercent(pitchW: number, pitchH: number): { w: number; h: number } {
  const w = subsCardCompact(pitchW) ? SUBS_CARD.COMPACT_W : SUBS_CARD.W;
  return {
    w: ((w + SUBS_CARD.MARGIN) / Math.max(1, pitchW)) * 100,
    h: ((SUBS_CARD.H + SUBS_CARD.MARGIN) / Math.max(1, pitchH)) * 100,
  };
}

/**
 * Card centres on the mini pitch (percent, attack to the right) for every slot of the formation. The depth is the middle
 * of the attacking and defending slot, stretched from the keeper to the deepest forward across the pitch: with the
 * attacking slots alone the centre-backs and the holding midfielders sat 8 yards apart. Cards that would still touch
 * (a CAM beside a winger, report) are pushed apart along the pitch length.
 */
export function subsSlotPositions(
  attacking: readonly SlotXY[],
  defending: readonly SlotXY[],
  card: { w: number; h: number },
): SlotXY[] {
  const mid = attacking.map((a, i) => (a.x + (defending[i]?.x ?? a.x)) / 2);
  const lo = Math.min(...mid);
  const hi = Math.max(...mid);
  const left = card.w / 2 + 0.5;
  const right = 100 - card.w / 2 - 0.5;
  const top = card.h / 2 + 0.5;
  const bottom = 100 - card.h / 2 - 0.5;
  const base = attacking.map((a, i) => ({
    x: hi - lo < 1 ? 50 : left + ((mid[i]! - lo) / (hi - lo)) * (right - left),
    y: Math.min(bottom, Math.max(top, (a.y / 74) * 100)),
  }));
  return spreadAlongAxis(base, wideCardSpec(card.w, card.h));
}

export { cardsOverlap };
