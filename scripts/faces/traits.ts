/**
 * Heuristic face traits from an ESPN headshot (600×436, transparent background, head centred,
 * standard framing). Pure: RGBA in, traits + raw metrics out. Only the derived traits are kept.
 *
 * Geometry: head top from the alpha mask, ears = widest row of the head, eyes = darkest row pair
 * near the ears, mouth = darkest row under the nose. Skin = upper cheeks/nose; hair = non-skin
 * pixels above the eyebrows; beard = chin and lower jaw compared with the upper cheeks.
 */
import type { Rgba } from "@/../scripts/faces/png";
import type { FaceTraits, HairColor, HairLength, BeardKind, SkinTone } from "@/Domain/faces/faceTraits";

type Rgb = [number, number, number];

export interface TraitMetrics {
  top: number; earY: number; eyeY: number; mouthY: number; cx: number; faceHalf: number;
  skin: Rgb; skinL: number;
  hair: Rgb | null; hairL: number; hairCover: number; volume: number; sideHair: number; earHair: number;
  beardRatio: number; beardDark: number;
}

const BEARD_L = Number(process.env.BEARD_L ?? 0.8), BEARD_S = Number(process.env.BEARD_S ?? 0.8);
const lum = (p: Rgb) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : 0; };
const medianRgb = (ps: Rgb[]): Rgb => [median(ps.map((p) => p[0])), median(ps.map((p) => p[1])), median(ps.map((p) => p[2]))];
const dist = (p: Rgb, q: Rgb) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

export function measure(im: Rgba): TraitMetrics | null {
  const { width: W, height: H, data } = im;
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * 4 + 3]!);
  const P = (x: number, y: number): Rgb => { const i = (y * W + x) * 4; return [data[i]!, data[i + 1]!, data[i + 2]!]; };
  const L = (x: number, y: number) => lum(P(x, y));
  let top = -1;
  for (let y = 0; y < H && top < 0; y++) for (let x = 240; x < 360; x++) if (A(x, y) > 128) { top = y; break; }
  if (top < 0) return null;
  const span = (y: number) => {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (A(x, y) > 128) { if (l < 0) l = x; r = x; }
    return [l, r] as const;
  };
  const width = (y: number) => { const [l, r] = span(y); return r - l; };
  // Neck = narrowest row between the head and the shoulders (robust to big hair, unlike the ears).
  let neckY = -1, nw = 1e9;
  for (let y = top + 150; y <= Math.min(H - 20, top + 330); y++) {
    const w = width(y);
    if (w > 50 && w < nw) { nw = w; neckY = y; }
  }
  if (neckY < 0) return null;
  const [nl, nr] = span(neckY);
  let cx = Math.round((nl + nr) / 2);

  const rowMean = (y: number, x0: number, x1: number) => {
    let s = 0, n = 0;
    for (let x = x0; x <= x1; x++) if (A(x, y) > 200) { s += L(x, y); n++; }
    return n ? s / n : 255;
  };
  // Eyes: dark eye windows against a bright nose bridge; the lowest strong row (eyebrows sit above).
  const eyeScore = (y: number) => {
    let s = 0;
    for (const yy of [y - 1, y, y + 1]) {
      const eyes = (rowMean(yy, cx - 46, cx - 16) + rowMean(yy, cx + 16, cx + 46)) / 2;
      s += rowMean(yy, cx - 7, cx + 7) - eyes;
    }
    return s / 3;
  };
  const lo = Math.max(top + 50, neckY - 175), hi = neckY - 75;
  if (hi <= lo) return null;
  const sc: number[] = [];
  for (let y = lo; y <= hi; y++) sc.push(eyeScore(y));
  const bestS = Math.max(...sc);
  let eyeY = lo + sc.indexOf(bestS);
  for (let i = sc.length - 2; i > 0; i--) {
    const v = sc[i]!;
    if (v >= bestS * 0.7 && v >= sc[i - 1]! && v >= sc[i + 1]!) { eyeY = lo + i; break; }
  }
  const earY = eyeY + 10;
  // Face centre / half width from the cheeks.
  const [cl, cr] = span(eyeY + 45);
  cx = Math.round((cl + cr) / 2);
  const faceHalf = Math.round(Math.min(cr - cl, (nr - nl) * 1.6) / 2);

  // Mouth: darkest row between nose and chin.
  const D = neckY - eyeY;
  let mouthY = Math.round(eyeY + 0.6 * D), mv = 999;
  for (let y = Math.round(eyeY + 0.55 * D); y <= Math.round(eyeY + 0.78 * D); y++) {
    const v = (rowMean(y - 1, cx - 15, cx + 15) + rowMean(y, cx - 15, cx + 15) + rowMean(y + 1, cx - 15, cx + 15)) / 3;
    if (v < mv) { mv = v; mouthY = y; }
  }

  // Skin: upper cheeks + nose, mid luminance band.
  const skinPx: Rgb[] = [];
  for (let y = eyeY + 14; y < eyeY + 45; y++) for (let x = cx - 45; x <= cx + 45; x++) if (A(x, y) > 220) skinPx.push(P(x, y));
  skinPx.sort((a, b) => lum(a) - lum(b));
  const skin = medianRgb(skinPx.slice(Math.floor(skinPx.length * 0.3), Math.floor(skinPx.length * 0.7)));
  const skinL = lum(skin);
  const isHair = (p: Rgb) => lum(p) < skinL * 0.62 || dist(p, skin) > Math.max(55, skinL * 0.35);

  // Hair: head pixels above the eyebrows.
  const browY = eyeY - 22;
  const hairPx: Rgb[] = [];
  let cover = 0, coverN = 0;
  for (let y = top; y < browY - 8; y++) for (let x = cx - faceHalf; x <= cx + faceHalf; x += 2) {
    if (A(x, y) < 220) continue;
    const p = P(x, y);
    if (y < top + (browY - top) * 0.55 && Math.abs(x - cx) < faceHalf * 0.6) { coverN++; if (isHair(p)) cover++; }
    if (isHair(p) && y < top + (browY - top) * 0.6) hairPx.push(p);
  }
  hairPx.sort((a, b) => lum(a) - lum(b));
  const hm = hairPx.slice(Math.floor(hairPx.length * 0.2), Math.floor(hairPx.length * 0.8));
  const hair = hm.length > 30 ? medianRgb(hm) : null;
  const hairL = hair ? lum(hair) : 0;
  const hairLike = (p: Rgb) => hair !== null && (dist(p, hair) < 60 || lum(p) < Math.min(skinL * 0.55, hairL + 30)) && dist(p, skin) > 40;

  // Long hair: hair at the sides below the ears, outside the face.
  let side = 0, sideN = 0;
  for (let y = earY + 25; y < earY + 110 && y < H; y += 2) for (const dx of [-1, 1]) for (let k = faceHalf + 6; k < faceHalf + 45; k += 2) {
    const x = cx + dx * k;
    sideN++;
    if (A(x, y) > 200 && hairLike(P(x, y))) side++;
  }
  // Medium: hair over the temples/ears.
  let ear = 0, earN = 0;
  for (let y = eyeY - 25; y < earY + 10; y += 2) {
    const [l, r] = span(y);
    for (let k = 2; k < 20; k += 2) for (const x of [l + k, r - k]) { earN++; if (A(x, y) > 200 && hairLike(P(x, y))) ear++; }
  }

  // Beard: below the lips and the lower jaw, against the upper cheeks.
  const ratios: number[] = [];
  let dark = 0;
  const satOf = (p: Rgb) => (Math.max(...p) - Math.min(...p)) / Math.max(1, Math.max(...p));
  const skinSat = satOf(skin);
  const add = (x: number, y: number) => {
    if (A(x, y) < 220) return;
    const p = P(x, y);
    const r = lum(p) / Math.max(1, skinL);
    ratios.push(r);
    // Beard hair: darker than the cheeks AND less saturated (a shadow on skin keeps the skin hue).
    if (r < BEARD_L && satOf(p) < skinSat * BEARD_S) dark++;
  };
  const chin0 = Math.round(mouthY + 0.12 * D), chin1 = Math.round(Math.max(chin0 + 6, neckY - 0.08 * D));
  for (let y = chin0; y < chin1; y++) for (let x = cx - 28; x <= cx + 28; x += 2) add(x, y);
  for (let y = Math.round(eyeY + 0.5 * D); y < mouthY + 0.08 * D; y++) for (const dx of [-1, 1]) for (let k = Math.round(faceHalf * 0.5); k < faceHalf * 0.72; k += 2) add(cx + dx * k, y);

  return {
    top, earY, eyeY, mouthY, cx, faceHalf, skin, skinL, hair, hairL,
    hairCover: coverN ? cover / coverN : 0, volume: (eyeY - top) / Math.max(1, neckY - eyeY),
    sideHair: sideN ? side / sideN : 0, earHair: earN ? ear / earN : 0,
    beardRatio: median(ratios), beardDark: ratios.length ? dark / ratios.length : 0,
  };
}

export function skinTone(m: TraitMetrics): SkinTone {
  const L = m.skinL;
  if (L >= 175) return 1;
  if (L >= 160) return 2;
  if (L >= 145) return 3;
  if (L >= 128) return 4;
  if (L >= 110) return 5;
  if (L >= 95) return 6;
  return 7;
}

export function hairColor(m: TraitMetrics): HairColor {
  if (!m.hair) return "black";
  const [r, g, b] = m.hair;
  const L = m.hairL;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (L > 140 && sat < 30) return "grey";
  if (r - b > 90 && g / r < 0.62 && L > 60 && L < 140) return "red";
  if (L >= 85) return "blond";
  // Brown hair keeps a warm hue; a dark grey/black under studio light is neutral.
  if (L >= 55 && r - b > 20) return "brown";
  if (L >= 38 && r - b > 15) return "darkBrown";
  return "black";
}

export function hairLength(m: TraitMetrics): HairLength {
  if (m.hairCover < 0.3 || !m.hair) return "bald";
  if (m.sideHair > 0.15) return "long";
  if (m.volume > 140 || m.earHair > 0.35) return "medium";
  return "short";
}

export function beard(m: TraitMetrics): BeardKind {
  if (m.beardDark > 0.45) return "full";
  if (m.beardDark > 0.2) return "stubble";
  return "none";
}

export function traitsOf(m: TraitMetrics): FaceTraits {
  return { skin: skinTone(m), hairColor: hairColor(m), hairLength: hairLength(m), beard: beard(m) };
}
