/**
 * A pool of sprites redrawn every frame (art phase 9: fireworks, smoke, flare sparks, camera flashes). `begin()` hides
 * the sprites of the last frame, `next()` hands out the next one (made the first time), so a burst costs no new objects
 * frame to frame.
 */
import { Container, Sprite, type Texture } from "pixi.js";

export class SpritePool {
  private readonly sprites: Sprite[] = [];
  private used = 0;

  constructor(private readonly parent: Container, private readonly blendMode: "normal" | "add" = "normal") {}

  begin(): void {
    for (let i = 0; i < this.used; i++) this.sprites[i]!.visible = false;
    this.used = 0;
  }

  next(texture: Texture): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite(texture);
      s.anchor.set(0.5);
      s.eventMode = "none";
      s.blendMode = this.blendMode;
      this.parent.addChild(s);
      this.sprites.push(s);
    }
    s.texture = texture;
    s.visible = true;
    s.alpha = 1;
    s.rotation = 0;
    s.tint = 0xffffff;
    this.used++;
    return s;
  }
}
