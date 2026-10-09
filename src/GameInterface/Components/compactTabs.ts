/** How the top-bar tabs are drawn (#65, #138, #139). */
export type TabsMode = "labels" | "tight" | "icons";

/**
 * Whether the top-bar tabs keep their labels (#65, #138, #139): the labelled row (measured on an
 * invisible copy at the normal spacing, so the answer never depends on the current mode) against
 * the room the bar has. When it does not fit at the normal spacing but fits with the tighter
 * spacing (`tightSaving` = the pixels the tighter gaps save), the labels stay with the tighter
 * spacing; only below that the tabs collapse to icons.
 * `null` = no usable measure yet (hidden page, layout not done): keep the current mode.
 */
export function compactTabsFor(labelledWidth: number, available: number, tightSaving = 0): TabsMode | null {
  if (!(labelledWidth > 0) || !(available > 0)) return null;
  if (labelledWidth <= available) return "labels";
  if (tightSaving > 0 && labelledWidth - tightSaving <= available) return "tight";
  return "icons";
}
