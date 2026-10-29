import { useTranslation } from "react-i18next";
import { decorRects } from "@/GraficsEngine/stadiumDecor";
import type { StadiumDecor } from "@/types/achievementTypes";

const W = 320;
const H = 180;
/** A home end stand on the left of a small pitch: the same geometry the match draws the decorations with. */
const STAND = { outer: { x: 0, y: 0, w: W, h: H }, inner: { x: 70, y: 16, w: W - 70, h: H - 32 }, thickness: { top: 16, bottom: 16, left: 70, right: 0 } };
const FAN_COLORS = ["#c9ced6", "#8a93a3", "#5b6474", "#d9c7a7"];

/** How the chosen decorations look in the home end (the match draws them the same way, in the club's colour). */
export function StadiumDecorPreview({ decor, clubColor }: { decor: StadiumDecor; clubColor: string }) {
  const { t } = useTranslation();
  const rects = decorRects(STAND, "left", decor);
  const fans: { x: number; y: number; c: string }[] = [];
  for (let y = STAND.inner.y + 4; y < STAND.inner.y + STAND.inner.h - 2; y += 7) {
    for (let x = 5; x < STAND.inner.x - 2; x += 7) fans.push({ x, y, c: FAN_COLORS[(x * 7 + y * 13) % FAN_COLORS.length]! });
  }
  const px = STAND.inner.x + 8;
  const pw = W - px - 4;
  const py = STAND.inner.y + 6;
  const ph = STAND.inner.h - 12;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm rounded-md border border-border" role="img" aria-label={t("achievements.profile.stadiumPreview")}>
      <rect x={0} y={0} width={W} height={H} fill="#2b3240" />
      {fans.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={2.4} fill={f.c} />)}
      <rect x={STAND.inner.x} y={STAND.inner.y} width={STAND.inner.w} height={STAND.inner.h} fill="#2f7a3a" />
      <rect x={px} y={py} width={pw} height={ph} fill="none" stroke="#f5f8f0" strokeWidth={1.5} />
      <line x1={px + pw} y1={py} x2={px + pw} y2={py + ph} stroke="#f5f8f0" strokeWidth={1.5} />
      <rect x={px} y={py + ph / 2 - 30} width={30} height={60} fill="none" stroke="#f5f8f0" strokeWidth={1.5} />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.tone === "club" ? clubColor : "#f4f4f2"} opacity={r.alpha} />
      ))}
    </svg>
  );
}
