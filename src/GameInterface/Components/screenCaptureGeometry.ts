// Pure geometry of the report's "capture a screen area" (#125): the dragged rectangle on the
// overlay → the pixels to cut from the captured frame.

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** A selection smaller than this (in screen pixels) is treated as a click, not a crop. */
export const MIN_SELECTION_PX = 8;

/** The rectangle between two drag points, whatever the drag direction. */
export function selectionRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Where an image of `imgW × imgH` is drawn inside a `boxW × boxH` box with `object-fit: contain`. */
export function containRect(imgW: number, imgH: number, boxW: number, boxH: number): Rect {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** The selection (screen pixels) clipped to the shown image and mapped to the image's own pixels;
 *  null when nothing (or only a click) is left. */
export function sourceCrop(sel: Rect, shown: Rect, imgW: number, imgH: number): Rect | null {
  const x0 = Math.max(sel.x, shown.x);
  const y0 = Math.max(sel.y, shown.y);
  const x1 = Math.min(sel.x + sel.w, shown.x + shown.w);
  const y1 = Math.min(sel.y + sel.h, shown.y + shown.h);
  if (x1 - x0 < MIN_SELECTION_PX || y1 - y0 < MIN_SELECTION_PX) return null;
  const sx = imgW / shown.w;
  const sy = imgH / shown.h;
  const x = Math.max(0, Math.round((x0 - shown.x) * sx));
  const y = Math.max(0, Math.round((y0 - shown.y) * sy));
  const w = Math.min(imgW - x, Math.round((x1 - x0) * sx));
  const h = Math.min(imgH - y, Math.round((y1 - y0) * sy));
  return { x, y, w, h };
}
