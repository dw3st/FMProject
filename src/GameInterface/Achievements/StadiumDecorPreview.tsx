import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { decorFill, decorRects, hexNumber, type CrestPixels } from "@/GraficsEngine/stadiumDecor";
import { decorColors } from "@/Domain/achievements/decorStyle";
import type { StadiumDecor } from "@/types/achievementTypes";

const W = 480;
const H = 260;
/** A home end stand on the left of a small pitch: the same geometry the match draws the decorations with. */
const STAND = { outer: { x: 0, y: 0, w: W, h: H }, inner: { x: 112, y: 20, w: W - 112, h: H - 40 }, thickness: { top: 20, bottom: 20, left: 112, right: 0 } };
const FAN_COLORS = ["#c9ced6", "#8a93a3", "#5b6474", "#d9c7a7"];
const CREST_SIZE = 64;

const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** The club crest's pixels for the crest mosaic (null until loaded or without a crest). */
function useCrestPixels(url: string | undefined, wanted: boolean): CrestPixels | null {
  const [pixels, setPixels] = useState<CrestPixels | null>(null);
  useEffect(() => {
    if (!url || !wanted) { setPixels(null); return; }
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      const c = document.createElement("canvas");
      c.width = c.height = CREST_SIZE;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const w = img.naturalWidth || CREST_SIZE, h = img.naturalHeight || CREST_SIZE;
      const k = Math.min(CREST_SIZE / w, CREST_SIZE / h);
      ctx.drawImage(img, (CREST_SIZE - w * k) / 2, (CREST_SIZE - h * k) / 2, w * k, h * k);
      try { setPixels({ size: CREST_SIZE, data: ctx.getImageData(0, 0, CREST_SIZE, CREST_SIZE).data }); } catch { setPixels(null); }
    };
    img.src = url;
    return () => { live = false; };
  }, [url, wanted]);
  return pixels;
}

/** How the chosen decorations look in the home end (the match draws them the same way). */
export function StadiumDecorPreview({ decor, clubColor, crestUrl }: { decor: StadiumDecor; clubColor: string; crestUrl?: string }) {
  const { t } = useTranslation();
  const crest = useCrestPixels(crestUrl, decor.mosaic && decor.pattern === "crest");
  const rects = decorRects(STAND, "left", decor, crest);
  const [c1, c2] = decorColors(decor, clubColor);
  const colors: [number, number] = [hexNumber(c1), hexNumber(c2)];
  const fans: { x: number; y: number; c: string }[] = [];
  for (let y = STAND.inner.y + 4; y < STAND.inner.y + STAND.inner.h - 2; y += 7) {
    for (let x = 5; x < STAND.inner.x - 2; x += 7) fans.push({ x, y, c: FAN_COLORS[(x * 7 + y * 13) % FAN_COLORS.length]! });
  }
  const px = STAND.inner.x + 10;
  const pw = W - px - 6;
  const py = STAND.inner.y + 8;
  const ph = STAND.inner.h - 16;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-lg rounded-md border border-border" role="img" aria-label={t("achievements.profile.stadiumPreview")}>
      <rect x={0} y={0} width={W} height={H} fill="#2b3240" />
      {fans.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={2.4} fill={f.c} />)}
      <rect x={STAND.inner.x} y={STAND.inner.y} width={STAND.inner.w} height={STAND.inner.h} fill="#2f7a3a" />
      <rect x={px} y={py} width={pw} height={ph} fill="none" stroke="#f5f8f0" strokeWidth={1.5} />
      <rect x={px} y={py + ph / 2 - 44} width={44} height={88} fill="none" stroke="#f5f8f0" strokeWidth={1.5} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w - 0.6} height={r.h - 0.6} fill={toHex(decorFill(r, colors))} opacity={r.alpha} />
      ))}
    </svg>
  );
}
