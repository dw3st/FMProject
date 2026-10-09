/**
 * Pixi drawing of the referee, the assistants and the managers (spec 2026-10-08-match-visual §3–§4).
 * Shapes only; positions come from `officials.ts` / `coaches.ts`.
 */
import { Container, Graphics } from "pixi.js";
import { MARKER_SHADOW } from "@/GraficsEngine/pitchStyle";
import type { CoachPose } from "@/GraficsEngine/coaches";

export const OFFICIAL_LOOK = {
  /** Marker radius relative to a player's. */
  REF_SCALE: 0.75, AR_SCALE: 0.6,
  KIT: 0x111418, EDGE: 0xe8ecf1,
  FLAG_RED: 0xe0312b, FLAG_YELLOW: 0xf5d020,
  CARD_YELLOW: 0xf5d020, CARD_RED: 0xd62020,
  SUIT: 0x1b2230,
} as const;

function shadowOf(r: number): Graphics {
  return new Graphics()
    .ellipse(r * MARKER_SHADOW.DX, r * MARKER_SHADOW.DY, r, r * MARKER_SHADOW.SCALE_Y)
    .fill({ color: 0x000000, alpha: MARKER_SHADOW.ALPHA });
}

function flag(r: number, raised: boolean): Graphics {
  const g = new Graphics();
  if (raised) {
    // Arm up, flag over the head.
    g.moveTo(r * 0.6, 0).lineTo(r * 0.9, -r * 2.2).stroke({ width: 1.5, color: 0xffffff });
    g.rect(r * 0.9, -r * 2.2, r * 1.3, r * 0.5).fill(OFFICIAL_LOOK.FLAG_RED);
    g.rect(r * 0.9, -r * 1.7, r * 1.3, r * 0.5).fill(OFFICIAL_LOOK.FLAG_YELLOW);
  } else {
    // Held down at the side.
    g.moveTo(r * 0.9, 0).lineTo(r * 0.9, r * 1.4).stroke({ width: 1.5, color: 0xffffff });
    g.rect(r * 0.9, r * 0.6, r * 0.9, r * 0.4).fill(OFFICIAL_LOOK.FLAG_RED);
    g.rect(r * 0.9, r * 1.0, r * 0.9, r * 0.4).fill(OFFICIAL_LOOK.FLAG_YELLOW);
  }
  g.label = raised ? "flagUp" : "flagDown";
  return g;
}

function card(r: number, color: number, label: string): Graphics {
  const g = new Graphics()
    .roundRect(-r * 0.45, -r * 2.6, r * 0.9, r * 1.2, 2)
    .fill(color)
    .stroke({ width: 1, color: 0x000000, alpha: 0.5 });
  g.label = label;
  g.visible = false;
  return g;
}

/** Referee (`assistant: false`, with the two cards) or assistant (with the flag) marker. */
export function makeOfficial(playerR: number, assistant: boolean): Container {
  const r = playerR * (assistant ? OFFICIAL_LOOK.AR_SCALE : OFFICIAL_LOOK.REF_SCALE);
  const c = new Container();
  c.addChild(shadowOf(r));
  c.addChild(new Graphics().circle(0, 0, r).fill(OFFICIAL_LOOK.KIT).stroke({ width: 1.5, color: OFFICIAL_LOOK.EDGE, alpha: 0.9 }));
  // The face (referees.md) goes here once loaded, inside the kit's edge; empty = the plain kit disc.
  const head = new Container() as Container & { faceR?: number };
  head.label = "head";
  head.faceR = r - 1.5;
  c.addChild(head);
  if (assistant) {
    const up = flag(r, true);
    up.visible = false;
    c.addChild(flag(r, false), up);
  } else {
    c.addChild(card(r, OFFICIAL_LOOK.CARD_YELLOW, "cardYellow"), card(r, OFFICIAL_LOOK.CARD_RED, "cardRed"));
  }
  return c;
}

export function setFlagRaised(c: Container, raised: boolean): void {
  const up = c.getChildByLabel("flagUp");
  const down = c.getChildByLabel("flagDown");
  if (up) up.visible = raised;
  if (down) down.visible = !raised;
}

export function showCard(c: Container, card: "yellow" | "red" | null): void {
  const y = c.getChildByLabel("cardYellow");
  const r = c.getChildByLabel("cardRed");
  if (y) y.visible = card === "yellow";
  if (r) r.visible = card === "red";
}

export interface CoachSprite {
  root: Container;
  /** Holds the face sprite (label "face") over the colour disc. */
  head: Container;
  arms: Graphics;
  /** Head radius, px. */
  headR: number;
}

/**
 * A manager seen from above: dark suit with a collar in the club colour, the head (club-colour disc,
 * the face once loaded) and two arms redrawn per gesture.
 */
export function makeCoach(playerR: number, color: number): CoachSprite {
  const headR = playerR * 0.62;
  const root = new Container();
  const bodyW = playerR * 1.9, bodyH = playerR * 1.05;
  root.addChild(shadowOf(playerR * 0.95));
  const arms = new Graphics();
  root.addChild(arms);
  root.addChild(
    new Graphics()
      .roundRect(-bodyW / 2, -bodyH * 0.2, bodyW, bodyH, bodyH * 0.35)
      .fill(OFFICIAL_LOOK.SUIT)
      .stroke({ width: 1, color: 0x000000, alpha: 0.5 })
      .roundRect(-bodyW * 0.18, -bodyH * 0.2, bodyW * 0.36, bodyH * 0.32, 2)
      .fill(color),
  );
  const head = new Container();
  head.y = -bodyH * 0.35;
  head.addChild(new Graphics().circle(0, 0, headR).fill(color).stroke({ width: 1.5, color: 0x000000, alpha: 0.45 }));
  root.addChild(head);
  return { root, head, arms, headR };
}

/**
 * Arms from the shoulders: at rest they hang down along the suit; each angle swings the arm out
 * (π = straight up). `facing` = drawn direction of the team's attack (the "attack" gesture points that way).
 */
export function drawCoachArms(s: CoachSprite, playerR: number, pose: CoachPose, facing: 1 | -1): void {
  const g = s.arms;
  g.clear();
  const shoulderX = playerR * 0.85, shoulderY = -playerR * 0.05, len = playerR * 1.15;
  // `side` −1 = left shoulder, +1 = right; the arm swings out from the body by `a`.
  const arm = (side: -1 | 1, a: number) => {
    const dx = side * Math.sin(a) * len;
    const dy = Math.cos(a) * len;
    g.moveTo(side * shoulderX, shoulderY).lineTo(side * shoulderX + dx, shoulderY + dy)
      .stroke({ width: 3, color: OFFICIAL_LOOK.SUIT, cap: "round" });
    g.circle(side * shoulderX + dx, shoulderY + dy, 1.6).fill(0xe3b48f);
  };
  // `armR` (the pointing arm of "attack") is the one on the side the team attacks.
  arm(-facing as -1 | 1, pose.armL);
  arm(facing, pose.armR);
}
