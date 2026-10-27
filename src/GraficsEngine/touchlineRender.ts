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
 * A manager seen from above: only his head (club-colour disc, the face once loaded). The suit
 * shoulders and arms were dropped (tester report 2026-10-27); `arms` stays empty.
 */
export function makeCoach(playerR: number, color: number): CoachSprite {
  const headR = playerR * 0.85;
  const root = new Container();
  root.addChild(shadowOf(headR));
  const arms = new Graphics();
  root.addChild(arms);
  const head = new Container();
  head.addChild(new Graphics().circle(0, 0, headR).fill(color).stroke({ width: 1.5, color: 0x000000, alpha: 0.45 }));
  root.addChild(head);
  // A card over his head after a complaint (`.claude/rules/game/var.md` §4), like the referee's.
  root.addChild(card(playerR, OFFICIAL_LOOK.CARD_YELLOW, "cardYellow"), card(playerR, OFFICIAL_LOOK.CARD_RED, "cardRed"));
  return { root, head, arms, headR };
}

/** The manager is drawn as a head only: no arms, the gesture shows nothing. */
export function drawCoachArms(s: CoachSprite, _playerR: number, _pose: CoachPose, _facing: 1 | -1): void {
  s.arms.clear();
}
