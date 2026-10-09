/**
 * Whether the top-bar tabs collapse to icons (#65, #138): the labelled row (measured on an
 * invisible copy, so the answer never depends on the current mode) against the room the bar has.
 * `null` = no usable measure yet (hidden page, layout not done): keep the current mode.
 */
export function compactTabsFor(labelledWidth: number, available: number): boolean | null {
  if (!(labelledWidth > 0) || !(available > 0)) return null;
  return labelledWidth > available;
}
